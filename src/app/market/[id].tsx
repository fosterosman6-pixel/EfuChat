import { doc, getDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Icon, T } from '../../components/ui';
import { openDirectChat } from '../../lib/chats';
import { db } from '../../lib/firebase';
import type { IconName } from '../../lib/icons';
import { CONDITION_LABEL, deleteListing, listingPhoto, mwk, saveListing, setListingStatus, subscribeListing, subscribeSaved, type Listing } from '../../lib/market';
import { ago } from '../../lib/posts';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { UserProfile } from '../../lib/types';

const W = Dimensions.get('window').width;

export default function MarketItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [l, setL] = useState<Listing | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState(false);
  const [seller, setSeller] = useState<UserProfile | null>(null);
  const me = profile?.uid ?? '';
  const mine = l?.sellerUid === me;

  useEffect(() => (id ? subscribeListing(id, setL) : undefined), [id]);
  useEffect(() => (id && me ? subscribeSaved(me, id, setSaved) : undefined), [id, me]);
  useEffect(() => {
    if (!l) return;
    l.photos.forEach((p) => listingPhoto(p).then((u) => setPhotos((m) => ({ ...m, [p]: u })), () => {}));
    getDoc(doc(db, 'users', l.sellerUid)).then((s) => s.exists() && setSeller({ uid: s.id, ...s.data() } as UserProfile), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l?.id]);

  if (l === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.navy} /></View>;
  if (l === null)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <T style={{ color: colors.muted }}>This item is no longer available.</T>
        <Button title="Back to Market" onPress={() => router.back()} />
      </View>
    );

  async function message() {
    if (!profile || !l) return;
    try {
      const chatId = await openDirectChat(profile, { uid: l.sellerUid, name: l.seller.name });
      router.push({ pathname: '/chat/[id]', params: { id: chatId, draft: `Hi, is "${l.title}" (${mwk(l.priceMWK)}) still available?` } });
    } catch {
      Alert.alert('Could not open chat', 'Try again.');
    }
  }

  function manage() {
    if (!l) return;
    Alert.alert('Your listing', undefined, [
      l.status === 'live'
        ? { text: 'Pause (hide from Market)', onPress: () => setListingStatus(l.id, 'paused').catch(() => {}) }
        : { text: 'Put back on Market', onPress: () => setListingStatus(l.id, 'live').catch(() => {}) },
      {
        text: 'Delete listing',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this listing?', 'It will be removed from the Market for good.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteListing(l).then(() => router.back(), () => Alert.alert('Could not delete', 'Try again.')) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ width: W, height: W * 0.75, backgroundColor: colors.lime100 }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}>
            {l.photos.map((p, i) => (
              <View key={p} style={{ width: W, height: W * 0.75, alignItems: 'center', justifyContent: 'center' }}>
                {photos[p] ? (
                  <Image source={{ uri: photos[p] }} style={{ width: W, height: W * 0.75 }} resizeMode="cover" />
                ) : i === 0 && l.cover ? (
                  <Image source={{ uri: l.cover }} blurRadius={4} style={{ width: W, height: W * 0.75 }} />
                ) : (
                  <ActivityIndicator color={colors.navy} />
                )}
              </View>
            ))}
          </ScrollView>
          <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Round icon="back" label="Back" onPress={() => router.back()} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!mine && <Round icon="bookmark" label={saved ? 'Remove from saved' : 'Save'} on={saved} onPress={() => saveListing(me, l.id, !saved).catch(() => {})} />}
              <Round icon="share" label="Share" onPress={() => Share.share({ message: `${l.title} · ${mwk(l.priceMWK)} on EfuChat Market (${l.town})` })} />
              {mine && <Round icon="dots" label="Manage listing" onPress={manage} />}
            </View>
          </View>
          {l.photos.length > 1 && (
            <View style={{ position: 'absolute', right: 12, bottom: 28, backgroundColor: 'rgba(10,34,83,0.75)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
              <T style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 13 }}>{`${page + 1} / ${l.photos.length}`}</T>
            </View>
          )}
        </View>

        <View style={{ marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF', padding: 16, gap: 10 }}>
          {l.status !== 'live' && (
            <T style={{ alignSelf: 'flex-start', backgroundColor: colors.dangerTint, color: colors.danger, fontFamily: fonts.bold, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>
              {l.status === 'sold' ? 'Sold' : 'Paused · hidden from Market'}
            </T>
          )}
          <T style={{ fontSize: 28, fontFamily: fonts.extrabold, color: colors.navy }}>{mwk(l.priceMWK)}</T>
          <T style={{ fontSize: 20, fontFamily: fonts.bold }}>{l.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="pin" color={colors.muted} size={15} />
            <T style={{ color: colors.muted, fontSize: 14 }}>{`${l.town} · Posted ${ago(l.createdAt)}`}</T>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Fact k="Condition" v={CONDITION_LABEL[l.condition] ?? '—'} />
            <Fact k="Delivery" v="Pick up" />
            <Fact k="Payment" v="Cash" />
          </View>
          {!!l.description && <T style={{ lineHeight: 22 }}>{l.description}</T>}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/profile/[uid]', params: { uid: l.sellerUid } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12 }}
          >
            <Avatar name={l.seller.name} uri={seller?.photoURL} size={48} rounded={15} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <T style={{ fontFamily: fonts.bold }}>{mine ? 'You' : l.seller.name}</T>
                {l.seller.verified && <Icon name="verified" color={colors.lime600} size={16} />}
              </View>
              <T style={{ fontSize: 13, color: colors.muted }}>{seller?.town ? `Seller · ${seller.town}` : 'Seller'}</T>
            </View>
            <Icon name="chev" color={colors.muted} size={18} />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: colors.surface100 }}>
            <Icon name="shield" color={colors.lime600} size={18} />
            <T style={{ flex: 1, fontSize: 12, color: colors.muted }}>Meet in a public place and check the item before you pay. Wallet payments with buyer protection are coming soon.</T>
          </View>
        </View>
      </ScrollView>

      {!mine && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: colors.surface100 }}>
          <Button title="Message" icon="chat" variant="outline" style={{ flex: 1 }} onPress={message} />
          <Button title="Buy now" icon="bag" style={{ flex: 1.3 }} onPress={() => Alert.alert('Coming soon', 'Buying with the EfuChat wallet comes in a later update. For now, message the seller to agree on price and pick-up.')} />
        </View>
      )}
    </View>
  );
}

function Round({ icon, label, onPress, on }: { icon: IconName; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? colors.lime : 'rgba(10,34,83,0.7)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={on ? colors.navy : '#FFFFFF'} size={20} />
    </Pressable>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100, borderRadius: 12, padding: 10, gap: 2 }}>
      <T style={{ fontSize: 12, color: colors.muted, fontFamily: fonts.semibold }}>{k}</T>
      <T style={{ fontFamily: fonts.bold }} numberOfLines={1}>
        {v}
      </T>
    </View>
  );
}
