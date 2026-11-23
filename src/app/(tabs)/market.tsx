import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../../components/Dialog';
import { Header, Icon, IconButton, ScaledTextInput, T } from '../../components/ui';
import { CATEGORIES, MALAWI_TOWNS, mwk, saveListing, subscribeListings, subscribeSavedIds, type Category, type Listing } from '../../lib/market';
import { ago } from '../../lib/posts';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import { useRefresh } from '../../lib/useRefresh';

type Sort = 'newest' | 'cheap' | 'dear';
type Filters = { min: string; max: string; condition: 'any' | 'new' | 'used'; delivery: boolean };
const NO_FILTERS: Filters = { min: '', max: '', condition: 'any', delivery: false };
const TOWN_KEY = 'efuchat.marketTown';
const ANYWHERE = 'Anywhere in Malawi';

export default function Market() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [items, setItems] = useState<Listing[] | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [town, setTown] = useState<string | null>(null);
  const [townOpen, setTownOpen] = useState(false);
  const [townQ, setTownQ] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);

  // Market town: what I picked here, else the town on my profile.
  useEffect(() => {
    AsyncStorage.getItem(TOWN_KEY).then((v) => setTown(v ?? profile?.town?.trim() ?? ANYWHERE));
  }, [profile?.town]);
  const pickTown = (t: string) => {
    setTown(t);
    setTownOpen(false);
    setTownQ('');
    AsyncStorage.setItem(TOWN_KEY, t);
  };

  const { key, refreshing, onRefresh } = useRefresh();
  useEffect(() => {
    setItems(null);
    return subscribeListings(cat, setItems);
  }, [cat, key]);
  useEffect(() => (profile?.uid ? subscribeSavedIds(profile.uid, setSaved) : undefined), [profile?.uid]);

  const everywhere = !town || town === ANYWHERE;
  const match = (l: Listing, f: Filters) => {
    const min = Number(f.min.replace(/\D/g, '')) || 0;
    const max = Number(f.max.replace(/\D/g, '')) || Infinity;
    if (l.priceMWK < min || l.priceMWK > max) return false;
    if (f.condition === 'new' && l.condition !== 'new') return false;
    if (f.condition === 'used' && l.condition === 'new') return false;
    if (f.delivery && !l.matolaDelivery) return false;
    return true;
  };
  const searched = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items ?? []).filter((l) => !n || l.title.toLowerCase().includes(n) || l.description.toLowerCase().includes(n) || l.town.toLowerCase().includes(n));
  }, [items, q]);
  const inTown = (l: Listing) => everywhere || l.town.toLowerCase().includes(town!.toLowerCase());
  const shown = useMemo(() => {
    let list = searched.filter((l) => inTown(l) && match(l, filters));
    if (sort === 'cheap') list = [...list].sort((a, b) => a.priceMWK - b.priceMWK);
    if (sort === 'dear') list = [...list].sort((a, b) => b.priceMWK - a.priceMWK);
    return list;
  }, [searched, filters, sort, town]); // eslint-disable-line react-hooks/exhaustive-deps
  const draftCount = searched.filter((l) => inTown(l) && match(l, draft)).length;
  const activeFilters = (filters.min ? 1 : 0) + (filters.max ? 1 : 0) + (filters.condition !== 'any' ? 1 : 0) + (filters.delivery ? 1 : 0);

  const sortLabel = { newest: 'Newest first', cheap: 'Cheapest first', dear: 'Highest price' }[sort];
  const towns = MALAWI_TOWNS.filter((t) => !townQ.trim() || t.toLowerCase().includes(townQ.trim().toLowerCase()));

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          <View style={{ flex: 1, alignItems: 'flex-start', gap: 6 }}>
            <T style={{ color: '#FFFFFF', fontSize: 26, fontFamily: fonts.extrabold }}>Market</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Market town: ${town ?? ANYWHERE}. Change`}
              onPress={() => setTownOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <Icon name="pin" color={colors.lime} size={16} />
              <T style={{ color: colors.lime, fontFamily: fonts.bold, fontSize: 14 }}>{`${town ?? '…'} ▾`}</T>
            </Pressable>
          </View>
          <IconButton name="bookmark" label="Saved items" onPress={() => router.push('/saved')} />
          <IconButton name="store" label="My shop" onPress={() => router.push('/my-listings')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, marginHorizontal: 4 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.navy700, borderRadius: 16, paddingHorizontal: 14, minHeight: 52 }}>
            <Icon name="search" color={colors.soft} size={20} />
            <ScaledTextInput accessibilityLabel="Search the market" value={q} onChangeText={setQ} placeholder="Search phones, food, sofas…" placeholderTextColor={colors.soft} style={{ flex: 1, color: '#FFFFFF', fontSize: 15 }} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={activeFilters ? `Filter, ${activeFilters} on` : 'Filter'}
            onPress={() => {
              setDraft(filters);
              setFilterOpen(true);
            }}
            style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="filter" color={colors.navy} size={22} />
            {activeFilters > 0 && (
              <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.navy, borderWidth: 2, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ color: '#FFFFFF', fontSize: 11, fontFamily: fonts.extrabold }}>{String(activeFilters)}</T>
              </View>
            )}
          </Pressable>
        </View>
      </Header>

      <FlatList
        data={shown}
        keyExtractor={(l) => l.id}
        numColumns={2}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        columnWrapperStyle={{ gap: 10, paddingHorizontal: 12 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 12 }}>
              {CATEGORIES.map((c) => {
                const on = cat === c.id;
                return (
                  <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={c.label} onPress={() => setCat(c.id)} style={{ alignItems: 'center', gap: 6, minWidth: 72 }}>
                    <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: on ? colors.navy : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={c.icon} color={on ? colors.lime : colors.navy} size={26} />
                    </View>
                    <T style={{ fontSize: 13, fontFamily: on ? fonts.bold : fonts.semibold }}>{c.label}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/sell')}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, padding: 14, borderRadius: 18, backgroundColor: colors.lime100 }}
            >
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="tag" color={colors.navy} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: fonts.bold }}>Sell something today</T>
                <T style={{ fontSize: 13, color: colors.muted }}>Photo, price, done. Buyers message you.</T>
              </View>
              <View style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.navy }}>
                <T style={{ color: '#FFFFFF', fontFamily: fonts.extrabold }}>Sell</T>
              </View>
            </Pressable>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
              <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.4 }}>
                {items === null ? 'LOADING…' : `${everywhere ? 'ALL OF MALAWI' : `IN ${town!.toUpperCase()}`} · ${shown.length} ${shown.length === 1 ? 'ITEM' : 'ITEMS'}`}
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sort: ${sortLabel}. Change`}
                onPress={() =>
                  dialog('Sort', undefined, [
                    { text: 'Newest first', onPress: () => setSort('newest') },
                    { text: 'Cheapest first', onPress: () => setSort('cheap') },
                    { text: 'Highest price', onPress: () => setSort('dear') },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
                hitSlop={8}
              >
                <T style={{ fontSize: 14, fontFamily: fonts.extrabold, color: colors.lime600 }}>{`${sortLabel} ▾`}</T>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          items === null ? undefined : (
            <View style={{ alignItems: 'center', padding: 28, gap: 12 }}>
              <View style={{ width: 84, height: 84, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bag" color={colors.navy} size={40} />
              </View>
              <T style={{ fontFamily: fonts.bold, fontSize: 17, textAlign: 'center' }}>
                {q || activeFilters ? 'Nothing matches' : everywhere ? 'Nothing for sale yet' : `Nothing for sale in ${town} yet`}
              </T>
              <T style={{ color: colors.muted, textAlign: 'center' }}>
                {q || activeFilters ? 'Try other words or clear the filters.' : 'Be the first to sell something here.'}
              </T>
              {!everywhere && !q && (
                <Pressable accessibilityRole="button" onPress={() => pickTown(ANYWHERE)} hitSlop={8}>
                  <T style={{ color: colors.lime600, fontFamily: fonts.extrabold }}>See all of Malawi</T>
                </Pressable>
              )}
              {activeFilters > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => setFilters(NO_FILTERS)} style={{ paddingHorizontal: 22, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.lime }}>
                  <T style={{ color: colors.navy, fontFamily: fonts.extrabold }}>Clear filters</T>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => router.push('/sell')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 14, borderRadius: 16, backgroundColor: colors.lime }}>
                  <Icon name="plus" color={colors.navy} size={20} />
                  <T style={{ color: colors.navy, fontFamily: fonts.extrabold }}>Sell the first item</T>
                </Pressable>
              )}
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card
            l={item}
            saved={saved.has(item.id)}
            onSave={() => profile && saveListing(profile.uid, item.id, !saved.has(item.id)).catch(() => dialog('Could not save', 'Try again.'))}
          />
        )}
      />

      {/* Town picker */}
      <Modal visible={townOpen} transparent animationType="slide" onRequestClose={() => setTownOpen(false)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.55)' }} onPress={() => setTownOpen(false)} />
        <View style={{ maxHeight: '75%', backgroundColor: colors.surface100, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line }} />
          <T style={{ fontFamily: fonts.extrabold, fontSize: 20 }}>Where are you shopping?</T>
          <ScaledTextInput
            accessibilityLabel="Type a town"
            value={townQ}
            onChangeText={setTownQ}
            placeholder="Type a town or area"
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => townQ.trim().length >= 2 && pickTown(townQ.trim())}
            style={{ minHeight: 52, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 16 }}
          />
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} keyboardShouldPersistTaps="handled">
            {[ANYWHERE, ...(profile?.town && !MALAWI_TOWNS.includes(profile.town) ? [profile.town] : []), ...towns].map((t) => (
              <Pill key={t} label={t} on={town === t} onPress={() => pickTown(t)} />
            ))}
            {townQ.trim().length >= 2 && !towns.some((t) => t.toLowerCase() === townQ.trim().toLowerCase()) && <Pill label={`Use “${townQ.trim()}”`} on={false} onPress={() => pickTown(townQ.trim())} />}
          </ScrollView>
        </View>
      </Modal>

      {/* Filters */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.55)' }} onPress={() => setFilterOpen(false)} />
        <View style={{ backgroundColor: colors.surface100, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T style={{ fontFamily: fonts.extrabold, fontSize: 20 }}>Filter</T>
            <Pressable accessibilityRole="button" onPress={() => setDraft(NO_FILTERS)} hitSlop={10}>
              <T style={{ fontFamily: fonts.extrabold, color: colors.lime600 }}>Clear all</T>
            </Pressable>
          </View>
          <Label>WHERE</Label>
          <Pressable accessibilityRole="button" onPress={() => { setFilterOpen(false); setTownOpen(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line }}>
            <Icon name="pin" color={colors.lime600} size={18} />
            <T style={{ flex: 1, fontFamily: fonts.bold }}>{town ?? ANYWHERE}</T>
            <Icon name="chev" color={colors.muted} size={18} />
          </Pressable>
          <Label>PRICE (MK)</Label>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['min', 'max'] as const).map((k) => (
              <ScaledTextInput
                key={k}
                accessibilityLabel={k === 'min' ? 'Lowest price' : 'Highest price'}
                value={draft[k]}
                onChangeText={(v) => setDraft({ ...draft, [k]: v.replace(/\D/g, '') })}
                keyboardType="number-pad"
                placeholder={k === 'min' ? 'Min' : 'Max'}
                placeholderTextColor={colors.muted}
                style={{ flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 16 }}
              />
            ))}
          </View>
          <Label>CONDITION</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['any', 'new', 'used'] as const).map((c) => (
              <Pill key={c} label={c === 'any' ? 'Any' : c === 'new' ? 'New' : 'Used'} on={draft.condition === c} onPress={() => setDraft({ ...draft, condition: c })} />
            ))}
          </View>
          <Label>MORE</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pill label="Delivery available" on={draft.delivery} onPress={() => setDraft({ ...draft, delivery: !draft.delivery })} />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFilters(draft);
              setFilterOpen(false);
            }}
            style={{ marginTop: 4, minHeight: 56, borderRadius: 16, backgroundColor: colors.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Icon name="search" color={colors.navy} size={20} />
            <T style={{ color: colors.navy, fontFamily: fonts.extrabold, fontSize: 16 }}>{`Show ${draftCount} ${draftCount === 1 ? 'item' : 'items'}`}</T>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.4, marginBottom: -4 }}>{children}</T>;
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? colors.navy : '#FFFFFF', borderWidth: on ? 0 : 1, borderColor: colors.line }}
    >
      <T style={{ fontFamily: fonts.bold, fontSize: 14, color: on ? '#FFFFFF' : colors.ink }}>{label}</T>
    </Pressable>
  );
}

function Card({ l, saved, onSave }: { l: Listing; saved: boolean; onSave: () => void }) {
  const tag = l.condition === 'new' ? 'New' : l.matolaDelivery ? 'Delivery' : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${l.title}, ${mwk(l.priceMWK)}, ${l.town}`}
      onPress={() => router.push({ pathname: '/market/[id]', params: { id: l.id } })}
      style={{ flex: 1, maxWidth: '50%', backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' }}
    >
      <View style={{ aspectRatio: 1, backgroundColor: colors.lime100 }}>
        {l.cover ? <Image source={{ uri: l.cover }} style={{ width: '100%', height: '100%' }} /> : null}
        {!!tag && (
          <View style={{ position: 'absolute', top: 8, left: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.lime }}>
            <T style={{ fontSize: 11, fontFamily: fonts.extrabold, color: colors.navy }}>{tag}</T>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Remove from saved' : 'Save'}
          onPress={onSave}
          hitSlop={6}
          style={{ position: 'absolute', top: 6, right: 6, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="heart" color={saved ? colors.danger : colors.muted} size={19} />
        </Pressable>
      </View>
      <View style={{ padding: 10, gap: 2 }}>
        <T style={{ fontSize: 17, fontFamily: fonts.extrabold, color: colors.navy }}>{mwk(l.priceMWK)}</T>
        <T style={{ fontSize: 14 }} numberOfLines={1}>
          {l.title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="pin" color={colors.muted} size={13} />
          <T style={{ fontSize: 12, color: colors.muted, flexShrink: 1 }} numberOfLines={1}>
            {`${l.town}${l.createdAt ? ` · ${ago(l.createdAt)}` : ''}`}
          </T>
        </View>
      </View>
    </Pressable>
  );
}
