import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../../components/Dialog';
import { Button, Header, Icon, IconButton, T } from '../../components/ui';
import { openDirectChat } from '../../lib/chats';
import { mwk } from '../../lib/market';
import { ORDER_STATUS, setOrderStatus, subscribeOrder, type Order, type OrderStatus } from '../../lib/orders';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';

/** One order: what, how it's paid and delivered, its progress, and the next step for me. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [o, setO] = useState<Order | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => (id ? subscribeOrder(id, setO) : undefined), [id]);

  if (o === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.navy} /></View>;
  if (o === null || !profile)
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
        <Header title="Order" onBack={() => router.back()} />
        <T style={{ padding: 24, color: colors.muted, textAlign: 'center' }}>This order isn't available.</T>
      </View>
    );

  const seller = o.sellerUid === profile.uid;
  const other = seller ? { uid: o.buyerUid, name: o.buyerName } : { uid: o.sellerUid, name: o.sellerName };
  const st = ORDER_STATUS[o.status];
  const when = (d?: { toDate: () => Date } | null) => (d ? `${d.toDate().toLocaleDateString()} ${d.toDate().toTimeString().slice(0, 5)}` : '');

  async function move(status: OrderStatus, confirm?: { title: string; body: string; yes: string }) {
    const go = async () => {
      setBusy(true);
      try {
        await setOrderStatus(profile!, o!, status);
      } catch {
        dialog('Could not update the order', 'Check your connection and try again.');
      } finally {
        setBusy(false);
      }
    };
    if (!confirm) return go();
    dialog(confirm.title, confirm.body, [
      { text: 'Not now', style: 'cancel' },
      { text: confirm.yes, style: status === 'declined' || status === 'cancelled' ? 'destructive' : 'default', onPress: go },
    ]);
  }

  async function chat() {
    try {
      const chatId = await openDirectChat(profile!, other);
      router.push({ pathname: '/chat/[id]', params: { id: chatId } });
    } catch {
      dialog('Could not open chat', 'Try again.');
    }
  }

  const steps: [string, boolean][] = [
    ['Ordered', true],
    ['Accepted', o.status === 'accepted' || o.status === 'delivered'],
    ['Delivered', o.status === 'delivered'],
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title={`Order #${o.id.slice(0, 6).toUpperCase()}`} subtitle={seller ? `From ${o.buyerName}` : `From ${o.sellerName}'s shop`} onBack={() => router.back()} right={<IconButton name="chat" label={`Message ${other.name}`} onPress={chat} />} />
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: insets.bottom + 120 }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12 }}>
          <View style={{ width: 70, height: 70, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.lime100 }}>{o.cover ? <Image source={{ uri: o.cover }} style={{ width: 70, height: 70 }} /> : null}</View>
          <View style={{ flex: 1, gap: 4 }}>
            <T style={{ fontFamily: fonts.bold }} numberOfLines={2}>{o.title}</T>
            <T style={{ fontFamily: fonts.extrabold, color: colors.navy, fontSize: 17 }}>{mwk(o.priceMWK)}</T>
            <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, backgroundColor: st.bg }}>
              <T style={{ fontSize: 12, fontFamily: fonts.extrabold, color: st.fg }}>{st.label}</T>
            </View>
          </View>
        </View>

        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 10 }}>
          <Fact k="Payment" v="Pay on delivery" />
          <Fact k="Delivery" v={o.delivery === 'matola' ? 'Matola delivery' : 'Pick up from the seller'} />
          <Fact k={seller ? 'Buyer' : 'Seller'} v={other.name} />
          {!!o.note && <Fact k="Note" v={o.note} />}
          <Fact k="Ordered" v={when(o.createdAt)} />
        </View>

        {o.status === 'declined' || o.status === 'cancelled' ? (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14 }}>
            <T style={{ fontFamily: fonts.bold, color: st.fg }}>{o.status === 'declined' ? 'The seller declined this order.' : 'This order was cancelled.'}</T>
            <T style={{ color: colors.muted, marginTop: 4 }}>{when(o.updatedAt)}</T>
          </View>
        ) : (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 12 }}>
            <T style={{ fontFamily: fonts.bold }}>Progress</T>
            {steps.map(([label, done]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? colors.lime : 'transparent', borderWidth: done ? 0 : 2, borderColor: colors.line }}>
                  {done && <Icon name="check" color={colors.navy} size={16} />}
                </View>
                <T style={{ color: done ? colors.ink : colors.muted, fontFamily: done ? fonts.bold : fonts.regular }}>{label}</T>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: colors.surface100 }}>
        {seller && o.status === 'new' && (
          <>
            <Button title="Decline" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => move('declined', { title: 'Decline this order?', body: `${o.buyerName} will be told you can't sell it now.`, yes: 'Decline' })} />
            <Button title="Accept order" icon="check" style={{ flex: 1.4 }} loading={busy} onPress={() => move('accepted')} />
          </>
        )}
        {seller && o.status === 'accepted' && <Button title="Mark as delivered" icon="check" style={{ flex: 1 }} loading={busy} onPress={() => move('delivered', { title: 'Mark as delivered?', body: 'Only do this once the buyer has the item and has paid. The item will show as sold.', yes: 'Delivered' })} />}
        {!seller && (o.status === 'new' || o.status === 'accepted') && (
          <>
            <Button title="Cancel order" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => move('cancelled', { title: 'Cancel this order?', body: `${o.sellerName} will be told.`, yes: 'Cancel order' })} />
            <Button title="Message seller" icon="chat" style={{ flex: 1.2 }} onPress={chat} />
          </>
        )}
        {(o.status === 'delivered' || o.status === 'declined' || o.status === 'cancelled') && <Button title={`Message ${other.name.split(' ')[0]}`} icon="chat" variant="outline" style={{ flex: 1 }} onPress={chat} />}
      </View>
    </View>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <T style={{ color: colors.muted }}>{k}</T>
      <T style={{ fontFamily: fonts.bold, flexShrink: 1, textAlign: 'right' }}>{v}</T>
    </View>
  );
}
