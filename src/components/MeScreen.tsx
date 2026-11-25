import { pushStatus } from '../lib/push';
import { dialog } from './Dialog';
import { useEffect, useState } from 'react';
import { signOut } from '@react-native-firebase/auth';
import { unregisterPush } from '../lib/push';
import { router } from 'expo-router';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WallpaperPicker, WALLPAPERS } from './Wallpaper';
import { Avatar, Card, Header, Icon, IconButton, Row, SectionLabel, T, Tile, Toggle } from './ui';
import { auth } from '../lib/firebase';
import { useLang } from '../lib/i18n';
import { usePrefs } from '../lib/prefs';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

const chev = <Icon name="chev" color={colors.muted} size={18} />;

export function MeScreen({ tab = false }: { tab?: boolean }) {
  const { profile, user } = useSession();
  const { lang, setLang } = useLang();
  const { dataSaver, setDataSaver, wallpaperFor, textSize, setTextSize } = usePrefs();
  const [tsOpen, setTsOpen] = useState(false);
  const [push, setPush] = useState<{ ok: boolean; reason?: string } | null>(null);
  useEffect(() => {
    if (profile?.uid) pushStatus(profile.uid).then(setPush);
  }, [profile?.uid]);
  const [wp, setWp] = useState(false);
  const insets = useSafeAreaInsets();

  function confirmSignOut() {
    dialog('Sign out?', 'You can sign in again with your phone number.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          if (profile?.uid) await unregisterPush(profile.uid);
          await signOut(auth);
          router.replace('/welcome');
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {!tab && <IconButton name="back" label="Back" onPress={() => router.back()} />}
          <Avatar name={profile?.name ?? 'Me'} size={60} rounded={18} uri={profile?.photoURL} />
          <View style={{ flex: 1 }}>
            <T style={{ color: '#FFFFFF', fontSize: 20, fontFamily: fonts.extrabold }} numberOfLines={1}>
              {profile?.name}
            </T>
            <T style={{ color: colors.soft, fontSize: 13 }} numberOfLines={1}>
              {user?.phoneNumber} · {profile?.about}
            </T>
          </View>
        </View>
      </Header>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <SectionLabel>YOU</SectionLabel>
        <Card>
          <Row left={<Tile name="person" bg={colors.lime100} fg={colors.navy} />} title="Edit profile" subtitle="Name, username, about and town" onPress={() => router.push('/edit-profile')} />
          <Row left={<Tile name="wallet" bg={colors.lime100} fg={colors.navy} />} title="Wallet" subtitle="Send money, history, your mobile money number" right={chev} onPress={() => router.push('/wallet')} />
          <Row left={<Tile name="store" bg={colors.lime100} fg={colors.navy} />} title="My shop and orders" subtitle="Your items, orders received and placed" right={chev} onPress={() => router.push('/my-shop')} />
          <Row left={<Tile name="phone" bg={colors.lime100} fg={colors.navy} />} title="Calls" subtitle="Voice calls and missed calls" onPress={() => router.push('/calls')} last />
        </Card>

        <SectionLabel>APP</SectionLabel>
        <Card>
          <Row
            left={<Tile name="data" bg={colors.surface100} fg={colors.navy} />}
            title="Data saver"
            subtitle="Smaller photos, media only when you tap"
            right={<Toggle value={dataSaver} onChange={setDataSaver} label="Data saver" />}
          />
          <Row
            left={<Tile name="globe" bg={colors.surface100} fg={colors.navy} />}
            title="Language"
            subtitle={lang === 'ny' ? 'Chichewa' : 'English'}
            right={chev}
            onPress={() => setLang(lang === 'ny' ? 'en' : 'ny')}
          />
          <Row
            left={<Tile name="text" bg={colors.surface100} fg={colors.navy} />}
            title="Text size"
            subtitle={textSize === 'xl' ? 'Extra large' : textSize === 'large' ? 'Large' : 'Normal'}
            right={chev}
            onPress={() => setTsOpen(true)}
          />
          <Row left={<Tile name="palette" bg={colors.surface100} fg={colors.navy} />} title="Chat wallpaper" subtitle={WALLPAPERS.find((w) => w.name === wallpaperFor())?.label} right={chev} onPress={() => setWp(true)} />
          <Row
            left={<Tile name="bell" bg={push?.ok === false ? colors.dangerTint : colors.surface100} fg={push?.ok === false ? colors.danger : colors.navy} />}
            title="Notifications and ringing"
            subtitle={push === null ? 'Checking…' : push.ok ? 'On: calls ring and messages pop up' : 'Not working: tap to fix'}
            right={chev}
            onPress={async () => {
              if (!profile) return;
              const r = await pushStatus(profile.uid);
              setPush(r);
              if (r.ok) dialog('Notifications are on', 'Calls will ring and messages will pop up on this phone.');
              else
                dialog('Notifications are not working', r.reason ?? 'Try again.', [
                  { text: 'Open phone settings', onPress: () => Linking.openSettings() },
                  { text: 'Close', style: 'cancel' },
                ]);
            }}
          />
          <Row left={<Tile name="lock" bg={colors.surface100} fg={colors.navy} />} title="Privacy and security" subtitle="Last seen, read ticks, calls, app lock" onPress={() => router.push('/privacy')} />
          <Row left={<Tile name="help" bg={colors.surface100} fg={colors.navy} />} title="Help" subtitle="Questions and support" onPress={() => router.push('/help')} last />
        </Card>

        <View style={{ height: 12 }} />
        <Card>
          <Row left={<Tile name="logout" bg={colors.dangerTint} fg={colors.danger} />} title="Sign out" danger onPress={confirmSignOut} last />
        </Card>
      </ScrollView>
      <WallpaperPicker visible={wp} onClose={() => setWp(false)} />
      <Modal visible={tsOpen} transparent animationType="slide" onRequestClose={() => setTsOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.45)' }} onPress={() => setTsOpen(false)} accessibilityLabel="Close" />
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 16 }}>
          <T style={{ fontFamily: fonts.bold, fontSize: 18 }}>Text size</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['normal', 'large', 'xl'] as const).map((s) => {
              const on = textSize === s;
              const label = s === 'xl' ? 'Extra large' : s === 'large' ? 'Large' : 'Normal';
              return (
                <Pressable
                  key={s}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={label}
                  onPress={() => setTextSize(s)}
                  style={{ flex: 1, alignItems: 'center', gap: 8 }}
                >
                  <View style={{ alignSelf: 'stretch', height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.navy : '#FFFFFF', borderWidth: on ? 0 : 1, borderColor: colors.line }}>
                    <Text style={{ fontFamily: fonts.extrabold, fontSize: s === 'xl' ? 30 : s === 'large' ? 25 : 20, color: on ? '#FFFFFF' : colors.ink }}>Aa</Text>
                  </View>
                  <T style={{ fontSize: 13, fontFamily: on ? fonts.bold : fonts.regular }}>{label}</T>
                </Pressable>
              );
            })}
          </View>
          <T style={{ fontSize: 13, color: colors.muted }}>Your phone's own font size setting still applies on top.</T>
        </View>
      </Modal>
    </View>
  );
}
