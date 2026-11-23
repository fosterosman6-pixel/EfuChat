import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRefresh } from '../lib/useRefresh';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, Chip, Header, Icon, Row, SectionLabel, T } from '../components/ui';
import { startCall, subscribeMyCalls, type Call } from '../lib/calls';
import { useSession } from '../lib/session';
import { colors } from '../lib/theme';

export default function Calls() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [calls, setCalls] = useState<Call[]>([]);
  const [missedOnly, setMissedOnly] = useState(false);
  const me = profile?.uid ?? '';

  const { key, refreshing, onRefresh } = useRefresh();
  useEffect(() => (me ? subscribeMyCalls(me, setCalls) : undefined), [me, key]);

  const isMissed = (c: Call) => c.to === me && (c.status === 'missed' || c.status === 'cancelled');
  const groups = useMemo(() => {
    const shown = calls.filter((c) => !missedOnly || isMissed(c));
    const today = new Date().toDateString();
    return {
      today: shown.filter((c) => (c.createdAt?.toDate() ?? new Date()).toDateString() === today),
      earlier: shown.filter((c) => c.createdAt && c.createdAt.toDate().toDateString() !== today),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls, missedOnly, me]);

  async function callBack(c: Call) {
    if (!profile) return;
    const other = c.from === me ? { uid: c.to, name: c.toName } : { uid: c.from, name: c.fromName };
    try {
      const id = await startCall(profile, other, c.kind ?? 'voice');
      router.push({ pathname: '/call/[id]', params: { id } });
    } catch (e) {
      Alert.alert('Could not call', e instanceof Error && e.message.includes('call') ? e.message : 'Check your connection and try again.');
    }
  }

  const when = (c: Call) => {
    const d = c.createdAt?.toDate() ?? new Date();
    const days = Math.floor((new Date(new Date().toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
    const hm = d.toTimeString().slice(0, 5);
    return days === 0 ? `Today, ${hm}` : days === 1 ? `Yesterday, ${hm}` : `${d.toLocaleDateString('en-GB', days < 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' })}, ${hm}`;
  };

  const list = (items: Call[]) => (
    <Card>
      {items.map((c, i) => {
        const out = c.from === me;
        const missed = isMissed(c);
        const name = out ? c.toName : c.fromName;
        const dur = c.answeredAt && c.endedAt ? Math.max(0, Math.round((c.endedAt.toDate().getTime() - c.answeredAt.toDate().getTime()) / 1000)) : 0;
        const extra = dur ? ` · ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : out && c.status !== 'ended' && c.status !== 'accepted' ? ' · no answer' : '';
        return (
          <Row
            key={c.id}
            left={<Avatar name={name} size={44} rounded={14} />}
            title={name}
            subtitle={`${out ? '↗' : '↙'} ${c.kind === 'video' ? 'Video · ' : ''}${when(c)}${missed ? ' · missed' : extra}`}
            danger={missed}
            right={
              <Pressable accessibilityRole="button" accessibilityLabel={`${c.kind === 'video' ? 'Video call' : 'Call'} ${name}`} onPress={() => callBack(c)} hitSlop={8}>
                <Icon name={c.kind === 'video' ? 'video' : 'phone'} color={colors.navy} size={22} />
              </Pressable>
            }
            last={i === items.length - 1}
          />
        );
      })}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Calls" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} colors={[colors.navy]} />}>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 14 }}>
          <Chip label="All" active={!missedOnly} onPress={() => setMissedOnly(false)} />
          <Chip label="Missed" active={missedOnly} onPress={() => setMissedOnly(true)} />
        </View>
        {groups.today.length > 0 && (
          <>
            <SectionLabel>TODAY</SectionLabel>
            {list(groups.today)}
          </>
        )}
        {groups.earlier.length > 0 && (
          <>
            <SectionLabel>EARLIER</SectionLabel>
            {list(groups.earlier)}
          </>
        )}
        {!groups.today.length && !groups.earlier.length && (
          <T style={{ padding: 24, textAlign: 'center', color: colors.muted }}>{missedOnly ? 'No missed calls.' : 'No calls yet. Tap the phone in any chat to call.'}</T>
        )}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New call"
        onPress={() => router.push('/new-chat')}
        style={{ position: 'absolute', right: 16, bottom: insets.bottom + 20, width: 58, height: 58, borderRadius: 18, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="phone" color={colors.navy} size={26} />
      </Pressable>
    </View>
  );
}
