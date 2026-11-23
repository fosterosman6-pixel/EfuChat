import { deleteDoc, doc, getDoc } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, Header, Icon, Row, SectionLabel, T, Tile, Toggle } from '../components/ui';
import { db } from '../lib/firebase';
import { useBlocked } from '../lib/follows';
import { usePrefs } from '../lib/prefs';
import { AUDIENCE_LABEL, privacyOf, savePrivacy } from '../lib/profile';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { Audience, Privacy as P } from '../lib/types';

export default function Privacy() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const { appLock, setAppLock } = usePrefs();
  const blocked = useBlocked();
  const [names, setNames] = useState<Record<string, string>>({});
  const [showBlocked, setShowBlocked] = useState(false);
  const p = privacyOf(profile);

  const blockedKey = [...blocked].join(',');
  useEffect(() => {
    Promise.all([...blocked].map((uid) => getDoc(doc(db, 'users', uid)).catch(() => null))).then((snaps) => {
      const m: Record<string, string> = {};
      for (const s of snaps) if (s?.exists()) m[s.id] = (s.data()?.name as string) ?? 'EfuChat user';
      setNames(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedKey]);

  function save(change: P) {
    if (!profile) return;
    savePrivacy(profile.uid, { ...p, ...change }).catch(() => Alert.alert('Could not save', 'Check your connection and try again.'));
  }

  function pick(title: string, key: 'lastSeen' | 'calls') {
    const opts: Audience[] = ['everyone', 'chats', 'nobody'];
    Alert.alert(title, undefined, [...opts.map((o) => ({ text: (p[key] === o ? '✓ ' : '') + AUDIENCE_LABEL[o], onPress: () => save({ [key]: o }) })), { text: 'Cancel', style: 'cancel' as const }]);
  }

  async function toggleLock(on: boolean) {
    if (!on) return setAppLock(false);
    const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
    const level = await LocalAuthentication.getEnrolledLevelAsync().catch(() => 0);
    if (!enrolled && !level) return Alert.alert('Set up a screen lock first', 'Add a fingerprint, face or PIN in your phone settings, then turn this on.');
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Turn on App lock' }).catch(() => null);
    if (r?.success) setAppLock(true);
  }

  const value = (a: Audience) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 150 }}>
      <T style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.lime600 }} numberOfLines={1}>
        {AUDIENCE_LABEL[a]}
      </T>
      <Icon name="chev" color={colors.muted} size={18} />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface100 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <Header title="Privacy and security" onBack={() => router.back()} />

      <SectionLabel>WHO CAN SEE</SectionLabel>
      <Card>
        <Row left={<Tile name="globe" bg={colors.surface100} fg={colors.navy} />} title="Last seen and online" right={value(p.lastSeen)} onPress={() => pick('Who can see when you were last online?', 'lastSeen')} />
        <Row
          left={<Tile name="check" bg={colors.surface100} fg={colors.navy} />}
          title="Read ticks"
          subtitle="If off, you won't see others' either"
          right={<Toggle value={p.readTicks} onChange={(v) => save({ readTicks: v })} label="Read ticks" />}
          last
        />
      </Card>

      <SectionLabel>WHO CAN REACH ME</SectionLabel>
      <Card>
        <Row left={<Tile name="phone" bg={colors.surface100} fg={colors.navy} />} title="Calls" right={value(p.calls)} onPress={() => pick('Who can call you?', 'calls')} last />
      </Card>

      <SectionLabel>SAFETY</SectionLabel>
      <Card>
        <Row
          left={<Tile name="block" bg={colors.dangerTint} fg={colors.danger} />}
          title="Blocked people"
          subtitle={blocked.size ? `${blocked.size} ${blocked.size === 1 ? 'person' : 'people'}` : 'Nobody'}
          right={blocked.size ? <Icon name={showBlocked ? 'arrowup' : 'chev'} color={colors.muted} size={18} /> : undefined}
          onPress={blocked.size ? () => setShowBlocked(!showBlocked) : undefined}
        />
        {showBlocked &&
          [...blocked].map((uid) => (
            <Row
              key={uid}
              left={<Avatar name={names[uid] ?? '?'} size={38} rounded={12} />}
              title={names[uid] ?? 'EfuChat user'}
              right={<T style={{ fontFamily: fonts.bold, color: colors.lime600 }}>Unblock</T>}
              onPress={() =>
                profile &&
                Alert.alert(`Unblock ${names[uid] ?? 'this person'}?`, 'They will be able to message, call and see your posts again.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Unblock', onPress: () => deleteDoc(doc(db, 'users', profile.uid, 'blocks', uid)).catch(() => {}) },
                ])
              }
            />
          ))}
        <Row left={<Tile name="lock" bg={colors.surface100} fg={colors.navy} />} title="App lock" subtitle="Ask for fingerprint or PIN to open" right={<Toggle value={appLock} onChange={toggleLock} label="App lock" />} />
        <Row
          left={<Tile name="phonedev" bg={colors.surface100} fg={colors.navy} />}
          title="Sign out everywhere else"
          subtitle="Coming soon"
          onPress={() => Alert.alert('Coming soon', 'Signing out other phones needs the server upgrade (Blaze).')}
          last
        />
      </Card>
      <T style={{ padding: 16, fontSize: 12, color: colors.muted }}>
        If you hide your last seen, you won't see other people's either. "People I chat with" means people you already have a chat with.
      </T>
    </ScrollView>
  );
}
