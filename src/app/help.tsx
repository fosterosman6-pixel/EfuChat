import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Header, Icon, Row, SectionLabel, T, Tile } from '../components/ui';
import { findUserByPhone, openDirectChat } from '../lib/chats';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

const SUPPORT_PHONE: string = (Constants.expoConfig?.extra as { supportPhone?: string } | undefined)?.supportPhone ?? '';

const FAQ: { q: string; a: string }[] = [
  { q: 'How do I start a chat or group?', a: 'Tap Chats, then the new chat button. Pick a contact, or search a name, @username or phone number. For a group, tap New group, pick people, then give it a name.' },
  { q: "Why didn't my code arrive?", a: 'Check the number and country, then wait a minute and tap Resend. Codes can be slow on some networks. If it still does not come, contact support below.' },
  { q: 'How do calls use my data?', a: 'EfuChat calls use a speech setting made for mobile data, so a minute of talking uses far less than a video call. Wi-Fi is best for long calls.' },
  { q: 'How do I block or report someone?', a: "Open their profile and tap the menu, then Block or Report. Blocked people can't message or call you. You can unblock them in Privacy and security." },
  { q: 'How do I reply to or react to a message?', a: 'Swipe a message to the right to reply. Press and hold it for reactions, copy, forward, pin or delete for everyone.' },
  { q: 'Who can see when I was last online?', a: 'You choose in Privacy and security: everyone, people you chat with, or nobody. If you hide yours, you will not see other people\'s either.' },
  { q: 'How will the wallet work?', a: 'The wallet will link to Airtel Money and TNM Mpamba so you can send money in chats and pay for market items safely. It is coming in a later update.' },
];

export default function Help() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return FAQ.map((f, i) => ({ ...f, i })).filter((f) => !n || f.q.toLowerCase().includes(n) || f.a.toLowerCase().includes(n));
  }, [q]);

  async function support() {
    if (!profile) return;
    try {
      const s = SUPPORT_PHONE ? await findUserByPhone(SUPPORT_PHONE) : null;
      if (!s) return Alert.alert('Support', 'Support chat is not set up yet. Please try again later.');
      if (s.uid === profile.uid) return Alert.alert('Support', 'This is the support account. People who need help will message you here.');
      const id = await openDirectChat(profile, { uid: s.uid, name: 'EfuChat support' });
      router.push({ pathname: '/chat/[id]', params: { id } });
    } catch {
      Alert.alert('Support', 'Could not open the support chat. Check your connection.');
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface100 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
      <Header title="Help" onBack={() => router.back()} />
      <View style={{ margin: 12, marginBottom: 0, height: 48, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 }}>
        <Icon name="search" color={colors.muted} size={18} />
        <TextInput accessibilityLabel="Search help" value={q} onChangeText={setQ} placeholder="Search help" placeholderTextColor="#8A93A8" style={{ flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.ink }} />
      </View>

      <SectionLabel>{q ? 'RESULTS' : 'POPULAR'}</SectionLabel>
      <Card>
        {shown.map((f, k) => (
          <Pressable
            key={f.i}
            accessibilityRole="button"
            accessibilityState={{ expanded: open === f.i }}
            onPress={() => setOpen(open === f.i ? null : f.i)}
            style={{ paddingHorizontal: 14, paddingVertical: 13, gap: 8, borderBottomWidth: k === shown.length - 1 ? 0 : 1, borderColor: colors.surface100 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T style={{ flex: 1, fontFamily: fonts.bold }}>{f.q}</T>
              <Icon name={open === f.i ? 'arrowup' : 'chev'} color={colors.muted} size={18} />
            </View>
            {open === f.i && <T style={{ color: colors.muted, lineHeight: 21 }}>{f.a}</T>}
          </Pressable>
        ))}
        {!shown.length && <T style={{ padding: 14, color: colors.muted }}>Nothing found. Ask support below.</T>}
      </Card>

      <SectionLabel>CONTACT US</SectionLabel>
      <Card>
        <Row left={<Tile name="chat" bg={colors.lime} fg={colors.navy} />} title="Chat with EfuChat support" subtitle="Usually replies within a day" right={<Icon name="chev" color={colors.muted} size={18} />} onPress={support} />
        <Row left={<Tile name="flag" bg={colors.dangerTint} fg={colors.danger} />} title="Report a problem" subtitle="Tell support what happened" right={<Icon name="chev" color={colors.muted} size={18} />} onPress={support} last />
      </Card>

      <SectionLabel>ABOUT</SectionLabel>
      <Card>
        <Row
          left={<Tile name="doc" bg={colors.surface100} fg={colors.navy} />}
          title="Terms and privacy policy"
          right={<Icon name="chev" color={colors.muted} size={18} />}
          onPress={() => Alert.alert('Terms and privacy', 'EfuChat only uses your number and contacts to connect you with friends, and never sells your data. The full terms will be published before launch.')}
        />
        <Row left={<Tile name="help" bg={colors.surface100} fg={colors.navy} />} title="App version" subtitle={`${Constants.expoConfig?.version ?? ''} · EfuChat by EfuLogistix`} last />
      </Card>
    </ScrollView>
  );
}
