import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Card, Header, Icon, Row, SectionLabel, T, Tile, Toggle } from '../components/ui';
import { addGroupMembers, createGroup, subscribeChat, type Person } from '../lib/chats';
import { usePeople } from '../lib/people';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { Chat } from '../lib/types';

const MAX_MEMBERS = 256;

/** Pick people, then name the group. With ?add=<chatId> it adds people to an existing group instead. */
export default function NewGroup() {
  const { add } = useLocalSearchParams<{ add?: string }>();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const { recent, book, loading } = usePeople(false);
  const [existing, setExisting] = useState<Chat | null>(null);
  const [picked, setPicked] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [step, setStep] = useState<'pick' | 'name'>('pick');
  const [name, setName] = useState('');
  const [adminsOnly, setAdminsOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => (add ? subscribeChat(add, setExisting) : undefined), [add]);

  const people = useMemo(() => {
    const map = new Map<string, Person & { sub: string }>();
    for (const r of recent) map.set(r.uid, { ...r, sub: 'Recent chat' });
    for (const c of book?.onApp ?? []) if (!map.has(c.user.uid)) map.set(c.user.uid, { uid: c.user.uid, name: c.name, sub: c.user.about ?? 'On EfuChat' });
    const inGroup = new Set(existing?.members ?? []);
    const needle = q.trim().toLowerCase();
    return [...map.values()].filter((p) => p.uid !== profile?.uid && !inGroup.has(p.uid) && (!needle || p.name.toLowerCase().includes(needle))).sort((a, b) => a.name.localeCompare(b.name));
  }, [recent, book, existing, q, profile?.uid]);

  const room = MAX_MEMBERS - 1 - (existing ? existing.members.length - 1 : 0);
  const isPicked = (uid: string) => picked.some((p) => p.uid === uid);
  function toggle(p: Person) {
    if (isPicked(p.uid)) setPicked(picked.filter((x) => x.uid !== p.uid));
    else if (picked.length < room) setPicked([...picked, { uid: p.uid, name: p.name }]);
  }

  async function next() {
    if (!profile || !picked.length) return;
    if (!add) return setStep('name');
    if (!existing) return;
    setBusy(true);
    try {
      await addGroupMembers(existing, picked);
      router.back();
    } catch {
      Alert.alert('Could not add', 'Only group admins can add people.');
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!profile || name.trim().length < 2) return;
    setBusy(true);
    try {
      const id = await createGroup(profile, picked, name, adminsOnly);
      router.dismissAll();
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Could not create group', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'name') {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface100 }} behavior="padding">
        <Header title="Name your group" onBack={() => setStep('pick')} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={{ alignItems: 'center', gap: 8, paddingTop: 24 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add group photo (coming soon)"
              onPress={() => Alert.alert('Coming soon', 'Group photos are coming soon.')}
              style={{ width: 96, height: 96, borderRadius: 30, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.soft, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="camera" color={colors.muted} size={32} />
            </Pressable>
            <T style={{ fontSize: 13, color: colors.muted }}>Add group photo</T>
          </View>
          <View style={{ paddingHorizontal: 12, paddingTop: 16, gap: 4 }}>
            <TextInput
              accessibilityLabel="Group name"
              value={name}
              onChangeText={(v) => setName(v.slice(0, 50))}
              placeholder="Group name"
              placeholderTextColor="#8A93A8"
              autoFocus
              style={{ height: 56, borderRadius: 16, borderWidth: 2, borderColor: colors.navy, backgroundColor: '#FFFFFF', paddingHorizontal: 16, fontSize: 17, fontFamily: fonts.bold, color: colors.ink }}
            />
            <T style={{ fontSize: 12, color: colors.muted, paddingHorizontal: 4 }}>{name.length} / 50</T>
          </View>
          <SectionLabel>SETTINGS</SectionLabel>
          <Card>
            <Row left={<Tile name="lock" bg={colors.surface100} fg={colors.navy} />} title="Only admins can send messages" right={<Toggle value={adminsOnly} onChange={setAdminsOnly} label="Only admins can send" />} last />
          </Card>
          <SectionLabel>{`${picked.length + 1} MEMBERS`}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 }}>
            <Avatar name={profile?.name ?? 'Me'} size={44} rounded={14} />
            {picked.map((p) => (
              <Avatar key={p.uid} name={p.name} size={44} rounded={14} />
            ))}
          </View>
        </ScrollView>
        <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
          <Button title="Create group" icon="check" onPress={create} loading={busy} disabled={name.trim().length < 2} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title={add ? 'Add people' : 'New group'} subtitle={`${picked.length} of ${room} selected`} onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
        {picked.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingTop: 16 }}>
            {picked.map((p) => (
              <Pressable key={p.uid} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} onPress={() => toggle(p)} style={{ alignItems: 'center', gap: 4, width: 56 }}>
                <View>
                  <Avatar name={p.name} size={50} rounded={16} />
                  <View style={{ position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" color="#FFFFFF" size={12} />
                  </View>
                </View>
                <T style={{ fontSize: 12, fontFamily: fonts.bold }} numberOfLines={1}>
                  {p.name.split(' ')[0]}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <View style={{ margin: 12, marginBottom: 0, height: 46, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <Icon name="search" color={colors.muted} size={18} />
          <TextInput accessibilityLabel="Search people" value={q} onChangeText={setQ} placeholder="Search name" placeholderTextColor="#8A93A8" style={{ flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.ink }} />
        </View>
        <SectionLabel>ON EFUCHAT</SectionLabel>
        {loading && !people.length ? (
          <ActivityIndicator color={colors.navy} />
        ) : people.length ? (
          <Card>
            {people.map((p, i) => {
              const on = isPicked(p.uid);
              return (
                <Row
                  key={p.uid}
                  left={<Avatar name={p.name} size={42} rounded={13} />}
                  title={p.name}
                  subtitle={p.sub}
                  onPress={() => toggle(p)}
                  right={
                    <View accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: on ? colors.navy : colors.line, backgroundColor: on ? colors.navy : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="check" color={colors.lime} size={18} />}
                    </View>
                  }
                  last={i === people.length - 1}
                />
              );
            })}
          </Card>
        ) : (
          <T style={{ paddingHorizontal: 16, color: colors.muted, fontSize: 14 }}>Start a chat with someone first, or allow contacts in New chat, and they will show here.</T>
        )}
      </ScrollView>
      <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
        <Button title={add ? `Add ${picked.length || ''}`.trim() : 'Next'} icon={add ? 'plus' : 'arrowup'} onPress={next} loading={busy} disabled={!picked.length} />
      </View>
    </View>
  );
}
