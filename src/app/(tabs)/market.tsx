import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useRefresh } from '../../lib/useRefresh';
import { Header, Icon, IconButton, T, ScaledTextInput } from '../../components/ui';
import { CATEGORIES, mwk, subscribeListings, type Category, type Listing } from '../../lib/market';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';

type Sort = 'newest' | 'cheap' | 'dear';

export default function Market() {
  const { profile } = useSession();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [items, setItems] = useState<Listing[] | null>(null);
  const town = profile?.town?.trim();

  const { key, refreshing, onRefresh } = useRefresh();
  useEffect(() => {
    setItems(null);
    return subscribeListings(cat, setItems);
  }, [cat, key]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    let list = (items ?? []).filter((l) => !n || l.title.toLowerCase().includes(n) || l.description.toLowerCase().includes(n) || l.town.toLowerCase().includes(n));
    // Items in my town first, then the rest.
    if (town) list = [...list.filter((l) => l.town.toLowerCase().includes(town.toLowerCase())), ...list.filter((l) => !l.town.toLowerCase().includes(town.toLowerCase()))];
    if (sort === 'cheap') list = [...list].sort((a, b) => a.priceMWK - b.priceMWK);
    if (sort === 'dear') list = [...list].sort((a, b) => b.priceMWK - a.priceMWK);
    return list;
  }, [items, q, sort, town]);

  const sortLabel = { newest: 'Newest first', cheap: 'Cheapest first', dear: 'Highest price' }[sort];

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          <View style={{ flex: 1 }}>
            <T style={{ color: '#FFFFFF', fontSize: 24, fontFamily: fonts.extrabold }}>Market</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="pin" color={colors.lime} size={14} />
              <T style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 13 }}>{town || 'Set your town in Edit profile'}</T>
            </View>
          </View>
          <IconButton name="store" label="My listings" onPress={() => router.push('/my-listings')} />
          <IconButton name="bag" label="My orders (coming soon)" onPress={() => Alert.alert('Coming soon', 'Orders come with wallet payments in a later update. For now, message the seller.')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginHorizontal: 4 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy700, borderRadius: 14, paddingHorizontal: 12, height: 46 }}>
            <Icon name="search" color={colors.soft} size={18} />
            <ScaledTextInput accessibilityLabel="Search the market" value={q} onChangeText={setQ} placeholder="Search the market" placeholderTextColor={colors.soft} style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontFamily: fonts.regular }} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Sort: ${sortLabel}`}
            onPress={() =>
              Alert.alert('Sort', undefined, [
                { text: 'Newest first', onPress: () => setSort('newest') },
                { text: 'Cheapest first', onPress: () => setSort('cheap') },
                { text: 'Highest price', onPress: () => setSort('dear') },
              ])
            }
            style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="filter" color={colors.navy} size={20} />
          </Pressable>
        </View>
      </Header>

      <FlatList
        data={shown}
        keyExtractor={(l) => l.id}
        numColumns={2}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 120 }}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 12 }}>
              {CATEGORIES.map((c) => {
                const on = cat === c.id;
                return (
                  <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setCat(c.id)} style={{ alignItems: 'center', gap: 6, width: 60 }}>
                    <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: on ? colors.navy : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={c.icon} color={on ? colors.lime : colors.navy} size={24} />
                    </View>
                    <T style={{ fontSize: 12, fontFamily: on ? fonts.bold : fonts.semibold }}>{c.label}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 4 }}>
              <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.4 }}>{town ? 'NEAR YOU FIRST' : 'ALL ITEMS'}</T>
              <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.lime600 }}>{sortLabel}</T>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
            <T style={{ color: colors.muted, textAlign: 'center' }}>{items === null ? 'Loading…' : q ? 'Nothing matches that search.' : 'Nothing for sale here yet. Be the first!'}</T>
          </View>
        }
        renderItem={({ item }) => <Card l={item} />}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sell an item"
        onPress={() => router.push('/sell')}
        style={{ position: 'absolute', right: 16, bottom: 110, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.lime, paddingHorizontal: 18, height: 50, borderRadius: 18 }}
      >
        <Icon name="plus" color={colors.navy} size={20} />
        <T style={{ fontFamily: fonts.extrabold, color: colors.navy }}>Sell</T>
      </Pressable>
    </View>
  );
}

function Card({ l }: { l: Listing }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${l.title}, ${mwk(l.priceMWK)}`} onPress={() => router.push({ pathname: '/market/[id]', params: { id: l.id } })} style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 8, gap: 4 }}>
      <View style={{ aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.lime100 }}>
        {l.cover ? <Image source={{ uri: l.cover }} style={{ width: '100%', height: '100%' }} /> : null}
      </View>
      <T style={{ fontSize: 16, fontFamily: fonts.extrabold, color: colors.navy }}>{mwk(l.priceMWK)}</T>
      <T style={{ fontSize: 14 }} numberOfLines={1}>
        {l.title}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name="pin" color={colors.muted} size={13} />
        <T style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>
          {l.town}
        </T>
      </View>
    </Pressable>
  );
}
