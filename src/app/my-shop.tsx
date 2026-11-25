import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Header, Icon, IconButton, T } from '../components/ui';
import { mwk, subscribeMyListings, type Listing } from '../lib/market';
import { getShop, ORDER_STATUS, subscribeOrders, type Order, type Shop } from '../lib/orders';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

type Tab = 'listings' | 'received' | 'placed';

const LISTING_STATUS: Record<Listing['status'], { label: string; bg: string; fg: string }> = {
  live: { label: 'On Market', bg: colors.lime100, fg: colors.lime600 },
  paused: { label: 'Paused', bg: colors.surface100, fg: colors.muted },
  sold: { label: 'Sold', bg: colors.navy, fg: '#FFFFFF' },
  removed: { label: 'Removed', bg: colors.dangerTint, fg: colors.danger },
};

/** My shop: my listings, orders people sent me, orders I placed, and my shop details. */
export default function MyShop() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('received');
  const [shop, setShop] = useState<Shop | null>(null);
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [received, setReceived] = useState<Order[] | null>(null);
  const [placed, setPlaced] = useState<Order[] | null>(null);
  const me = profile?.uid ?? '';

  useEffect(() => {
    if (!me) return;
    getShop(me).then(setShop, () => {});
    const a = subscribeMyListings(me, setListings);
    const b = subscribeOrders(me, 'seller', setReceived);
    const c = subscribeOrders(me, 'buyer', setPlaced);
    return () => {
      a();
      b();
      c();
    };
  }, [me]);

  const fresh = (received ?? []).filter((o) => o.status === 'new').length;
  const toDeliver = (received ?? []).filter((o) => o.status === 'accepted').length;
  const sold = (received ?? []).filter((o) => o.status === 'delivered').length + (listings ?? []).filter((l) => l.status === 'sold').length;
  const shopName = shop?.name || `${profile?.name.split(' ')[0] ?? 'My'}'s shop`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header
        title={shopName}
        subtitle={`${shop?.town || profile?.town || 'Set your town'} · ${(listings ?? []).filter((l) => l.status === 'live').length} on sale`}
        onBack={() => router.back()}
        right={
          <View style={{ flexDirection: 'row' }}>
            <IconButton name="share" label="Share my shop" onPress={() => Share.share({ message: `Shop with ${shopName} on EfuChat Market${shop?.town ? ` (${shop.town})` : ''}.` })} />
            <IconButton name="edit" label="Edit shop" onPress={() => router.push('/shop-edit')} />
          </View>
        }
      />
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 }}>
        {(
          [
            ['listings', 'Listings'],
            ['received', fresh ? `Received · ${fresh}` : 'Received'],
            ['placed', 'Placed'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, backgroundColor: tab === id ? colors.navy : '#FFFFFF', borderWidth: tab === id ? 0 : 1, borderColor: colors.line }}
          >
            <T style={{ fontFamily: fonts.bold, color: tab === id ? '#FFFFFF' : colors.ink }}>{label}</T>
          </Pressable>
        ))}
      </View>

      {tab !== 'placed' && (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingTop: 12 }}>
          {(
            [
              ['New', fresh, colors.ink],
              ['To deliver', toDeliver, colors.ink],
              ['Sold', sold, colors.lime600],
            ] as [string, number, string][]
          ).map(([k, v, c]) => (
            <View key={k} style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 12 }}>
              <T style={{ fontSize: 12, color: colors.muted }}>{k}</T>
              <T style={{ fontSize: 22, fontFamily: fonts.extrabold, color: c }}>{String(v)}</T>
            </View>
          ))}
        </View>
      )}

      {tab === 'listings' ? (
        <FlatList
          data={listings ?? []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 12, padding: 24 }}>
              <T style={{ color: colors.muted }}>{listings === null ? 'Loading…' : 'You have nothing for sale yet.'}</T>
              {listings !== null && <Button title="Sell an item" icon="plus" onPress={() => router.push('/sell')} />}
            </View>
          }
          renderItem={({ item }) => {
            const st = LISTING_STATUS[item.status];
            return (
              <Row cover={item.cover} title={item.title} sub={item.town} price={item.priceMWK} badge={st} onPress={() => router.push({ pathname: '/market/[id]', params: { id: item.id } })} />
            );
          }}
        />
      ) : (
        <FlatList
          data={(tab === 'received' ? received : placed) ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 20 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', gap: 8, padding: 24 }}>
              <Icon name="bag" color={colors.muted} size={36} />
              <T style={{ color: colors.muted, textAlign: 'center' }}>
                {(tab === 'received' ? received : placed) === null ? 'Loading…' : tab === 'received' ? 'No orders yet. When someone taps Buy now on your item, it shows here.' : "You haven't ordered anything yet."}
              </T>
            </View>
          }
          renderItem={({ item }) => (
            <Row
              cover={item.cover}
              title={item.title}
              sub={`${tab === 'received' ? item.buyerName : item.sellerName} · ${item.delivery === 'matola' ? 'Matola delivery' : 'Pick up'} · Pay on delivery`}
              price={item.priceMWK}
              badge={ORDER_STATUS[item.status]}
              onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
            />
          )}
        />
      )}
    </View>
  );
}

function Row({ cover, title, sub, price, badge, onPress }: { cover?: string; title: string; sub: string; price: number; badge: { label: string; bg: string; fg: string }; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${badge.label}`} onPress={onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.lime100 }}>{cover ? <Image source={{ uri: cover }} style={{ width: 64, height: 64 }} /> : null}</View>
      <View style={{ flex: 1, gap: 3 }}>
        <T style={{ fontFamily: fonts.bold }} numberOfLines={1}>{title}</T>
        <T style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{sub}</T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={{ fontFamily: fonts.extrabold, color: colors.navy }}>{mwk(price)}</T>
          <View style={{ paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, backgroundColor: badge.bg }}>
            <T style={{ fontSize: 11, fontFamily: fonts.extrabold, color: badge.fg }}>{badge.label}</T>
          </View>
        </View>
      </View>
      <Icon name="chev" color={colors.muted} size={18} />
    </Pressable>
  );
}
