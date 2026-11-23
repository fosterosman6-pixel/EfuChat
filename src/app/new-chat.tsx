import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonRow } from '../components/PersonRow';
import { Avatar, Button, Card, Header, Icon, IconButton, Row, SectionLabel, T, Tile } from '../components/ui';
import { findUserByPhone, openDirectChat, type Person } from '../lib/chats';
import { findUserByHandle, INVITE_TEXT, myDialCode, normalise, type PhoneContact } from '../lib/contacts';
import type { IconName } from '../lib/icons';
import { usePeople } from '../lib/people';
import { isOnline as rawOnline } from '../lib/presence';
import { canSeePresence } from '../lib/profile';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { UserProfile } from '../lib/types';

const SOON = (what: string) => () => Alert.alert('Coming soon', `${what} is coming in a later update.`);

export default function NewChat() {
  const { user, profile } = useSession();
  const isOnline = (u?: UserProfile | null) => !!u && canSeePresence(u, profile, false) && rawOnline(u);
  const insets = useSafeAreaInsets();
  const { recent, book, permission, loading, allow } = usePeople(true);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<UserProfile | null | 'searching'>(null);
  const [showAllInvites, setShowAllInvites] = useState(false);
  const me = user?.uid ?? '';
  const dial = myDialCode(user?.phoneNumber);

  const query = q.trim();
  const digits = query.replace(/\D/g, '');
  const looksLikeNumber = /^[+\d\s()-]+$/.test(query) && digits.length >= 3;

  // @username, or a full phone number that is not in my contacts.
  useEffect(() => {
    setRemote(null);
    const isHandle = query.startsWith('@') && query.length > 3;
    const phone = looksLikeNumber ? normalise(query, dial) : '';
    if (!isHandle && phone.length < 11) return;
    setRemote('searching');
    const timer = setTimeout(async () => {
      const u = await (isHandle ? findUserByHandle(query) : findUserByPhone(phone)).catch(() => null);
      setRemote(u && u.uid !== me ? u : null);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, looksLikeNumber, dial, me]);

  const onApp = book?.onApp ?? [];
  const results = useMemo(() => {
    if (!query) return null;
    const needle = query.toLowerCase();
    const match = (name: string, phone?: string) => name.toLowerCase().includes(needle) || (!!digits && !!phone && phone.replace(/\D/g, '').includes(digits.replace(/^0+/, '')));
    const people = new Map<string, { person: Person; sub: string; user?: UserProfile }>();
    for (const c of onApp) if (match(c.name, c.phone)) people.set(c.user.uid, { person: { uid: c.user.uid, name: c.name }, sub: `${c.display} · ${c.user.about ?? 'On EfuChat'}`, user: c.user });
    for (const r of recent) if (!people.has(r.uid) && match(r.name)) people.set(r.uid, { person: r, sub: 'Recent chat' });
    if (remote && remote !== 'searching' && !people.has(remote.uid)) people.set(remote.uid, { person: { uid: remote.uid, name: remote.name }, sub: remote.handle ? `@${remote.handle}` : (remote.about ?? 'On EfuChat'), user: remote });
    const invites = (book?.invite ?? []).filter((c) => match(c.name, c.phone)).slice(0, 20);
    return { people: [...people.values()], invites };
  }, [query, digits, onApp, recent, remote, book]);

  async function open(p: Person) {
    if (!profile) return;
    try {
      const id = await openDirectChat(profile, p);
      router.replace({ pathname: '/chat/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Could not open chat', e instanceof Error ? e.message : String(e));
    }
  }

  async function invite(c?: PhoneContact) {
    if (c) {
      const url = `sms:${c.phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(INVITE_TEXT)}`;
      if (await Linking.canOpenURL(url).catch(() => false)) return Linking.openURL(url);
    }
    Share.share({ message: INVITE_TEXT });
  }

  const invites = book?.invite ?? [];
  const subtitle = loading ? 'Finding your friends…' : book ? `${onApp.length} contact${onApp.length === 1 ? '' : 's'} on EfuChat` : undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface100 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title="New chat" subtitle={subtitle} onBack={() => router.back()}>
        <View style={{ marginTop: 10, marginHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy700, borderRadius: 14, paddingLeft: 12, height: 48 }}>
          <Icon name="search" color={colors.soft} size={18} />
          <TextInput
            accessibilityLabel="Search name, @username or number"
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            placeholder="Name, @username or number"
            placeholderTextColor={colors.soft}
            style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontFamily: fonts.regular }}
          />
          {q ? (
            <IconButton name="close" label="Clear search" color={colors.soft} size={18} onPress={() => setQ('')} />
          ) : (
            <IconButton name="qr" label="Scan QR code (coming soon)" color={colors.lime} size={20} onPress={SOON('Scanning QR codes')} />
          )}
        </View>
      </Header>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {results ? (
          <>
            <SectionLabel>ON EFUCHAT</SectionLabel>
            {results.people.length ? (
              <Card>
                {results.people.map((r, i) => (
                  <PersonRow key={r.person.uid} name={r.person.name} sub={r.sub} online={isOnline(r.user)} onPress={() => open(r.person)} last={i === results.people.length - 1} />
                ))}
              </Card>
            ) : (
              <T style={{ paddingHorizontal: 16, color: colors.muted, fontSize: 14 }}>
                {remote === 'searching' ? 'Searching…' : looksLikeNumber ? 'Nobody on EfuChat has this number yet.' : 'No one found with that name.'}
              </T>
            )}

            {results.invites.length > 0 && (
              <>
                <SectionLabel>IN YOUR PHONE CONTACTS</SectionLabel>
                <Card>
                  {results.invites.map((c, i) => (
                    <InviteRow key={c.phone} c={c} onInvite={() => invite(c)} last={i === results.invites.length - 1} />
                  ))}
                </Card>
              </>
            )}

            {looksLikeNumber && remote !== 'searching' && !(remote && results.people.some((p) => p.person.uid === remote.uid)) && (
              <>
                <SectionLabel>NOT IN YOUR CONTACTS</SectionLabel>
                <Card>
                  <Row
                    left={<Tile name="phone" bg={colors.surface100} fg={colors.navy} size={44} />}
                    title={normalise(query, dial).length >= 11 ? `Invite ${query}` : `Chat with ${query}…`}
                    subtitle={normalise(query, dial).length >= 11 ? 'Not on EfuChat yet. Send them an invite.' : 'Finish typing the number to search'}
                    onPress={normalise(query, dial).length >= 11 ? () => invite({ name: query, phone: normalise(query, dial), display: query }) : undefined}
                    last
                  />
                </Card>
              </>
            )}

            <View style={{ margin: 12, marginTop: 20, padding: 12, borderRadius: 14, backgroundColor: colors.lime100, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name="lock" color={colors.lime600} size={20} />
              <T style={{ flex: 1, fontSize: 13 }}>Your contacts are only matched to find friends. EfuChat never messages them without you.</T>
            </View>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 14 }}>
              <Quick icon="group" label="New group" bg={colors.lime} fg={colors.navy} onPress={() => router.push('/new-group')} />
              <Quick icon="megaphone" label="Channel" bg={colors.navy} fg={colors.lime} onPress={SOON('Channels')} />
              <Quick icon="qr" label="Scan QR" bg={colors.surface100} fg={colors.navy} onPress={SOON('Scanning QR codes')} />
              <Quick icon="person" label="My code" bg={colors.surface100} fg={colors.navy} onPress={SOON('Your QR code')} />
            </View>

            {recent.length > 0 && (
              <>
                <SectionLabel>RECENT</SectionLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>
                  {recent.slice(0, 10).map((p) => (
                    <Pressable key={p.uid} accessibilityRole="button" accessibilityLabel={`Chat with ${p.name}`} onPress={() => open(p)} style={{ alignItems: 'center', gap: 4, width: 60 }}>
                      <Avatar name={p.name} size={52} rounded={17} />
                      <T style={{ fontSize: 12, fontFamily: fonts.bold }} numberOfLines={1}>
                        {p.name.split(' ')[0]}
                      </T>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {permission === false ? (
              <Card style={{ marginTop: 16, padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Tile name="contact" bg={colors.lime100} fg={colors.lime600} size={44} />
                  <View style={{ flex: 1 }}>
                    <T style={{ fontFamily: fonts.bold }}>Find friends from your contacts</T>
                    <T style={{ fontSize: 13, color: colors.muted }}>See who is already on EfuChat. Your contacts are only used to match numbers.</T>
                  </View>
                </View>
                <Button title="Allow contacts" icon="contact" onPress={allow} />
              </Card>
            ) : (
              <>
                <SectionLabel>CONTACTS ON EFUCHAT</SectionLabel>
                {loading && !book ? (
                  <ActivityIndicator color={colors.navy} style={{ marginTop: 12 }} />
                ) : onApp.length ? (
                  <Card>
                    {onApp.map((c, i) => (
                      <PersonRow key={c.user.uid} name={c.name} sub={isOnline(c.user) ? 'online' : (c.user.about ?? 'On EfuChat')} online={isOnline(c.user)} onPress={() => open({ uid: c.user.uid, name: c.name })} last={i === onApp.length - 1} />
                    ))}
                  </Card>
                ) : (
                  <T style={{ paddingHorizontal: 16, color: colors.muted, fontSize: 14 }}>None of your contacts are on EfuChat yet. Invite them below.</T>
                )}

                {invites.length > 0 && (
                  <>
                    <SectionLabel>INVITE TO EFUCHAT</SectionLabel>
                    <Card>
                      {(showAllInvites ? invites : invites.slice(0, 8)).map((c, i, arr) => (
                        <InviteRow key={c.phone} c={c} onInvite={() => invite(c)} last={i === arr.length - 1 && (showAllInvites || invites.length <= 8)} />
                      ))}
                      {!showAllInvites && invites.length > 8 && <Row title={`See all ${invites.length}`} onPress={() => setShowAllInvites(true)} last />}
                    </Card>
                  </>
                )}
              </>
            )}

            <View style={{ padding: 12, paddingTop: 20 }}>
              <Button title="Invite friends to EfuChat" icon="share" onPress={() => invite()} />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Quick({ icon, label, bg, fg, onPress }: { icon: IconName; label: string; bg: string; fg: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#FFFFFF', borderRadius: 16 }}>
      <Tile name={icon} bg={bg} fg={fg} size={42} />
      <T style={{ fontSize: 12, fontFamily: fonts.bold }}>{label}</T>
    </Pressable>
  );
}

function InviteRow({ c, onInvite, last }: { c: PhoneContact; onInvite: () => void; last?: boolean }) {
  return (
    <Row
      left={<Avatar name={c.name} size={44} rounded={14} />}
      title={c.name}
      subtitle={c.display}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={`Invite ${c.name}`} onPress={onInvite} style={{ backgroundColor: colors.lime, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 }}>
          <T style={{ fontSize: 13, fontFamily: fonts.extrabold, color: colors.navy }}>Invite</T>
        </Pressable>
      }
      last={last}
    />
  );
}
