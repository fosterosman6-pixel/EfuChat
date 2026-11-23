import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../components/Dialog';
import { Header, Icon, T } from '../components/ui';
import { mwk, saveListing, savedListings, type Listing } from '../lib/market';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

/** Market items I tapped the heart on. */
export default function Saved() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    if (!profile) return;
    setItems(await savedListings(profile.uid).catch(() => []));
  }, [profile]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Saved items" onBack={() => router.back()} />
      <FlatList
        data={items ?? []}
        keyExtractor={(l) => l.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', padding: 28, gap: 10 }}>
            <Icon name="heart" color={colors.muted} size={40} />
            <T style={{ fontFamily: fonts.bold, fontSize: 17 }}>{items === null ? 'Loading…' : 'Nothing saved yet'}</T>
            {items !== null && <T style={{ color: colors.muted, textAlign: 'center' }}>Tap the heart on any item in Market to keep it here.</T>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/market/[id]', params: { id: item.id } })}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, backgroundColor: '#FFFFFF', borderRadius: 16 }}
          >
            <View style={{ width: 76, height: 76, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.lime100 }}>
              {item.cover ? <Image source={{ uri: item.cover }} style={{ width: '100%', height: '100%' }} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T style={{ fontFamily: fonts.extrabold, fontSize: 17, color: colors.navy }}>{mwk(item.priceMWK)}</T>
              <T numberOfLines={1}>{item.title}</T>
              <T style={{ fontSize: 12, color: item.status === 'live' ? colors.muted : colors.danger }}>{item.status === 'live' ? item.town : item.status === 'sold' ? 'Sold' : 'Not on sale now'}</T>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove from saved"
              onPress={() => profile && saveListing(profile.uid, item.id, false).then(load, () => dialog('Could not remove', 'Try again.'))}
              style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="heart" color={colors.danger} size={22} />
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  );
}
