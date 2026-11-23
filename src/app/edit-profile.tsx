import type React from 'react';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Header, Icon, T, ScaledTextInput } from '../components/ui';
import * as ImagePicker from 'expo-image-picker';
import { avatarDataUri } from '../lib/media';
import { cleanHandle, handleStatus, saveProfile } from '../lib/profile';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { UserProfile } from '../lib/types';

type Kind = NonNullable<UserProfile['accountType']>;
const KINDS: { id: Kind; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'creator', label: 'Creator' },
  { id: 'business', label: 'Business' },
];

export default function EditProfile() {
  const { user, profile } = useSession();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(profile?.name ?? '');
  const [handle, setHandle] = useState(profile?.handle ?? '');
  const [about, setAbout] = useState(profile?.about ?? '');
  const [town, setTown] = useState(profile?.town ?? '');
  const [kind, setKind] = useState<Kind>(profile?.accountType ?? 'personal');
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState<string | null | undefined>(profile?.photoURL ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function choosePhoto(source: 'camera' | 'gallery') {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow access to choose a profile photo.');
    const opts = { mediaTypes: ['images'] as ImagePicker.MediaType[], allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.8 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    setPhotoBusy(true);
    try {
      setPhoto(await avatarDataUri(res.assets[0].uri));
    } catch {
      Alert.alert('Could not use that photo', 'Try another one.');
    } finally {
      setPhotoBusy(false);
    }
  }

  const h = cleanHandle(handle);
  useEffect(() => {
    if (!h || !profile || h === profile.handle) return setStatus(h ? 'ok' : 'idle');
    setStatus('checking');
    const timer = setTimeout(() => handleStatus(h, profile.uid).then(setStatus, () => setStatus('idle')), 450);
    return () => clearTimeout(timer);
  }, [h, profile]);

  const valid = name.trim().length >= 2 && (status === 'ok' || status === 'idle');

  async function save() {
    if (!profile || !valid) return;
    setSaving(true);
    try {
      await saveProfile(profile, { name, about, town, accountType: kind, handle: h, photoURL: photo !== (profile.photoURL ?? null) ? photo : undefined });
      router.back();
    } catch {
      Alert.alert('Could not save', status === 'ok' && h !== profile.handle ? 'That username may have just been taken. Try another.' : 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  const hint =
    status === 'checking' ? 'Checking…' : status === 'taken' ? 'Taken. Try another.' : status === 'invalid' ? '3–24 letters, numbers, dots or underscores' : status === 'ok' && h !== profile?.handle ? 'Available' : 'People can find you by this name';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface100 }} behavior="padding">
      <Header
        title="Edit profile"
        onBack={() => router.back()}
        right={
          <Pressable accessibilityRole="button" onPress={save} disabled={!valid || saving} style={{ paddingHorizontal: 12, height: 44, justifyContent: 'center', opacity: valid ? 1 : 0.4 }}>
            <T style={{ color: colors.lime, fontFamily: fonts.extrabold }}>Save</T>
          </Pressable>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change photo"
          onPress={() =>
            Alert.alert('Profile photo', undefined, [
              { text: 'Choose from gallery', onPress: () => choosePhoto('gallery') },
              { text: 'Take a photo', onPress: () => choosePhoto('camera') },
              ...(photo ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => setPhoto(null) }] : []),
              { text: 'Cancel', style: 'cancel' as const },
            ])
          }
          style={{ alignItems: 'center', gap: 6, paddingTop: 18 }}
        >
          <View>
            <Avatar name={name || 'Me'} size={96} rounded={30} uri={photo} />
            <View style={{ position: 'absolute', right: -6, bottom: -6, width: 36, height: 36, borderRadius: 12, backgroundColor: colors.navy, borderWidth: 3, borderColor: colors.surface100, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" color={colors.lime} size={18} />
            </View>
          </View>
          <T style={{ fontSize: 13, color: colors.muted }}>{photoBusy ? 'Preparing photo…' : 'Change photo'}</T>
        </Pressable>

        <Field label="NAME" value={name} onChange={(v) => setName(v.slice(0, 60))} />
        <Field
          label="USERNAME"
          value={handle}
          onChange={(v) => setHandle(v.replace(/\s/g, '').slice(0, 25))}
          prefix="@"
          autoCapitalize="none"
          hint={hint}
          hintColor={status === 'taken' || status === 'invalid' ? colors.danger : status === 'ok' && h !== profile?.handle ? colors.lime600 : colors.muted}
          right={status === 'ok' && h ? <Icon name="check" color={colors.lime600} size={20} /> : null}
        />
        <Field label="ABOUT" value={about} onChange={(v) => setAbout(v.slice(0, 140))} multiline hint={`${about.length} / 140`} />
        <Field label="TOWN" value={town} onChange={(v) => setTown(v.slice(0, 40))} right={<Icon name="pin" color={colors.muted} size={18} />} />

        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          <T style={label}>ACCOUNT TYPE</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {KINDS.map((k) => (
              <Pressable
                key={k.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: kind === k.id }}
                onPress={() => setKind(k.id)}
                style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: kind === k.id ? colors.navy : colors.line, backgroundColor: kind === k.id ? colors.navy : '#FFFFFF' }}
              >
                <T style={{ fontSize: 13, fontFamily: fonts.bold, color: kind === k.id ? '#FFFFFF' : colors.ink }}>{k.label}</T>
              </Pressable>
            ))}
          </View>
          <T style={{ fontSize: 12, color: colors.muted }}>Creators and businesses get a profile button and stats.</T>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 }}>
          <Icon name="phone" color={colors.muted} size={16} />
          <T style={{ fontSize: 13, color: colors.muted }}>{`${user?.phoneNumber ?? ''} · your number can't be changed here`}</T>
        </View>
      </ScrollView>
      <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
        <Button title="Save changes" icon="check" onPress={save} loading={saving} disabled={!valid} />
      </View>
    </KeyboardAvoidingView>
  );
}

const label = { fontSize: 12, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.4 } as const;

function Field({
  label: l,
  value,
  onChange,
  hint,
  hintColor = colors.muted,
  prefix,
  right,
  multiline,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  hintColor?: string;
  prefix?: string;
  right?: React.ReactNode;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}) {
  return (
    <View style={{ paddingHorizontal: 16, gap: 6 }}>
      <T style={label}>{l}</T>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 4, minHeight: multiline ? 76 : 50, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 14 }}>
        {prefix && <T style={{ color: colors.muted, fontSize: 15 }}>{prefix}</T>}
        <ScaledTextInput
          accessibilityLabel={l.toLowerCase()}
          value={value}
          onChangeText={onChange}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={!prefix}
          style={{ flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.ink, paddingVertical: 12, textAlignVertical: multiline ? 'top' : 'center' }}
        />
        {right}
      </View>
      {hint && <T style={{ fontSize: 12, color: hintColor, fontFamily: hintColor === colors.muted ? fonts.regular : fonts.bold }}>{hint}</T>}
    </View>
  );
}
