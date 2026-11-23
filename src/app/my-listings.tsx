import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, View } from 'react-native';
import { useRefresh } from '../lib/useRefresh';
import { Button, Header, T } from '../components/ui';
import { mwk, subscribeMyListings, type Listing } from '../lib/market';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

const STATUS: Record<Listing['status'], { label: string; bg: string; fg: string }> = {
  live: { label: 'On Market', bg: colors.lime100, fg: colors.lime600 },
  paused: { label: 'Paused', bg: colors.greyTint, fg: colors.muted },
  sold: { label: 'Sold', bg: colors.navy, fg: '#FFFFFF' },
  removed: { label: 'Removed', bg: colors.dangerTint, fg: colors.danger },
};

export default function MyListings() {
  const { profile } = useSession();
  const [items, setItems] = useState<Listing[] | null>(null);
  const { key, refreshing, onRefresh } = useRefresh();
  useEffect(() => (profile ? subscribeMyListings(profile.uid, setItems) : undefined), [profile, key]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="My listings" subtitle={items ? `${items.length} item${items.length === 1 ? '' : 's'}` : undefined} onBack={() => router.back()} />
      <FlatList
        data={items ?? []}
        keyExtractor={(l) => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', gap: 12, padding: 24 }}>
            <T style={{ color: colors.muted }}>{items === null ? 'Loading…' : 'You have nothing for sale yet.'}</T>
            {items !== null && <Button title="Sell an item" icon="plus" onPress={() => router.push('/sell')} />}
          </View>
        }
        renderItem={({ item }) => {
          const st = STATUS[item.status];
          return (
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/market/[id]', params: { id: item.id } })} style={{ flexDirection: 'row', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 10 }}>
              <View style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.lime100 }}>{item.cover ? <Image source={{ uri: item.cover }} style={{ width: 72, height: 72 }} /> : null}</View>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.bold }} numberOfLines={1}>
                  {item.title}
                </T>
                <T style={{ fontFamily: fonts.extrabold, color: colors.navy }}>{mwk(item.priceMWK)}</T>
                <T style={{ alignSelf: 'flex-start', fontSize: 12, fontFamily: fonts.bold, color: st.fg, backgroundColor: st.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' }}>{st.label}</T>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
