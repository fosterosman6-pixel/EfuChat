import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../components/Dialog';
import { Header, Icon, ScaledTextInput, T } from '../components/ui';
import { getPayout, mk, OPERATOR_NAME, savePayout, subscribePayments, type Payment, type Payout } from '../lib/money';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

type Filter = 'all' | 'sent' | 'received';

/** Money sent and received through EfuChat (no balance is kept), and my number for receiving money. */
export default function Wallet() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const me = profile?.uid ?? '';
  const [list, setList] = useState<Payment[] | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => (me ? subscribePayments(me, setList) : undefined), [me]);
  useEffect(() => {
    if (me) getPayout(me).then((p) => (setPayout(p), setNumber(p?.mobile ?? '')), () => {});
  }, [me]);

  const month = useMemo(() => {
    const now = new Date();
    const inMonth = (p: Payment) => {
      const d = p.createdAt?.toDate();
      return !!d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && (p.status === 'paid' || p.status === 'paying');
    };
    const l = (list ?? []).filter(inMonth);
    return { sent: l.filter((p) => p.from === me).reduce((a, p) => a + p.amount, 0), got: l.filter((p) => p.to === me).reduce((a, p) => a + p.amount, 0) };
  }, [list, me]);

  const shown = (list ?? []).filter((p) => filter === 'all' || (filter === 'sent' ? p.from === me : p.to === me));

  async function saveNumber() {
    try {
      await savePayout(me, number);
      setPayout(await getPayout(me));
      setEditing(false);
    } catch (e) {
      dialog('Check the number', e instanceof Error ? e.message : 'Try again.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Wallet" subtitle="Airtel Money · TNM Mpamba" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.navy, borderRadius: 20, padding: 18, gap: 14 }}>
          <T style={{ color: colors.soft, fontSize: 13 }}>This month</T>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <View>
              <T style={{ color: colors.soft, fontSize: 12 }}>Sent</T>
              <T style={{ color: '#FFFFFF', fontSize: 22, fontFamily: fonts.extrabold }}>{mk(month.sent)}</T>
            </View>
            <View>
              <T style={{ color: colors.soft, fontSize: 12 }}>Received</T>
              <T style={{ color: colors.lime, fontSize: 22, fontFamily: fonts.extrabold }}>{mk(month.got)}</T>
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/send-money')} style={{ minHeight: 48, borderRadius: 14, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="send" color={colors.navy} size={18} />
            <T style={{ color: colors.navy, fontFamily: fonts.extrabold }}>Send money</T>
          </Pressable>
        </View>

        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 10 }}>
          <T style={{ fontFamily: fonts.bold }}>Receive money on</T>
          {editing || !payout ? (
            <>
              <T style={{ fontSize: 13, color: colors.muted }}>Add your Airtel Money or TNM Mpamba number so people can send you money. Only you can see it.</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <ScaledTextInput accessibilityLabel="Your mobile money number" value={number} onChangeText={setNumber} keyboardType="phone-pad" placeholder="099… or 088…" placeholderTextColor={colors.muted} style={{ flex: 1, minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, fontSize: 16 }} />
                <Pressable accessibilityRole="button" onPress={saveNumber} style={{ minHeight: 50, paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.navy, justifyContent: 'center' }}>
                  <T style={{ color: '#FFFFFF', fontFamily: fonts.bold }}>Save</T>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name="phone" color={colors.lime600} size={20} />
              <T style={{ flex: 1 }}>{`${OPERATOR_NAME[payout.operator]} · ${payout.mobile}`}</T>
              <T style={{ color: colors.lime600, fontFamily: fonts.bold }}>Change</T>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['all', 'sent', 'received'] as Filter[]).map((f) => (
            <Pressable key={f} accessibilityRole="tab" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: filter === f ? colors.navy : '#FFFFFF', borderWidth: filter === f ? 0 : 1, borderColor: colors.line }}>
              <T style={{ fontFamily: fonts.bold, color: filter === f ? '#FFFFFF' : colors.ink }}>{f === 'all' ? 'All' : f === 'sent' ? 'Sent' : 'Received'}</T>
            </Pressable>
          ))}
        </View>

        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden' }}>
          {!shown.length && <T style={{ padding: 16, color: colors.muted }}>{list === null ? 'Loading…' : 'No money sent or received yet.'}</T>}
          {shown.map((p, i) => {
            const out = p.from === me;
            const ok = p.status === 'paid' || p.status === 'paying';
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 1 : 0, borderColor: colors.surface100 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: out ? colors.dangerTint : colors.lime100 }}>
                  <Icon name={out ? 'arrowup' : 'arrowdown'} color={out ? colors.danger : colors.lime600} size={20} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ fontFamily: fonts.bold }} numberOfLines={1}>{out ? p.toName : p.fromName}</T>
                  <T style={{ fontSize: 12, color: ok ? colors.muted : colors.danger }}>
                    {`${p.createdAt ? p.createdAt.toDate().toLocaleDateString() : ''}${p.note ? ` · ${p.note}` : ''}${ok ? '' : p.status === 'charging' ? ' · waiting for PIN' : ' · failed'}`}
                  </T>
                </View>
                <T style={{ fontFamily: fonts.extrabold, color: out ? colors.ink : colors.lime600 }}>{`${out ? '−' : '+'} ${mk(p.amount)}`}</T>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
