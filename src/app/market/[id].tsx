import { dialog } from '../../components/Dialog';
import { doc, getDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, Modal, Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Icon, ScaledTextInput, T } from '../../components/ui';
import { placeOrder } from '../../lib/orders';
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
  const [buyOpen, setBuyOpen] = useState(false);
  const [delivery, setDelivery] = useState<'pickup' | 'matola'>('pickup');
  const [note, setNote] = useState('');
  const [ordering, setOrdering] = useState(false);
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
      dialog('Could not open chat', 'Try again.');
    }
  }

  async function order() {
    if (!profile || !l) return;
    setOrdering(true);
    try {
      const id = await placeOrder(profile, l, { delivery, note });
      setBuyOpen(false);
      setNote('');
      router.push({ pathname: '/order/[id]', params: { id } });
    } catch {
      dialog('Order not sent', 'This item may have just been sold or changed. Check your connection and try again.');
    } finally {
      setOrdering(false);
    }
  }

  function manage() {
    if (!l) return;
    dialog('Your listing', undefined, [
      l.status === 'live'
        ? { text: 'Pause (hide from Market)', onPress: () => setListingStatus(l.id, 'paused').catch(() => {}) }
        : { text: 'Put back on Market', onPress: () => setListingStatus(l.id, 'live').catch(() => {}) },
      {
        text: 'Delete listing',
        style: 'destructive',
        onPress: () =>
          dialog('Delete this listing?', 'It will be removed from the Market for good.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteListing(l).then(() => router.back(), () => dialog('Could not delete', 'Try again.')) },
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
            <T style={{ flex: 1, fontSize: 12, color: colors.muted }}>Meet in a public place and check the item before you pay. Pay the seller when you receive it.</T>
          </View>
        </View>
      </ScrollView>

      {!mine && (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: colors.surface100 }}>
          <Button title="Message" icon="chat" variant="outline" style={{ flex: 1 }} onPress={message} />
          <Button title={l.status === 'live' ? 'Buy now' : 'Sold'} icon="bag" style={{ flex: 1.3 }} disabled={l.status !== 'live'} onPress={() => setBuyOpen(true)} />
        </View>
      )}
      <Modal visible={buyOpen} transparent animationType="slide" onRequestClose={() => setBuyOpen(false)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.55)' }} onPress={() => setBuyOpen(false)} />
        <View style={{ backgroundColor: colors.surface100, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 18, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line }} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 10 }}>
            <View style={{ width: 60, height: 60, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.lime100 }}>{l.cover ? <Image source={{ uri: l.cover }} style={{ width: 60, height: 60 }} /> : null}</View>
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bold }} numberOfLines={2}>{l.title}</T>
              <T style={{ fontFamily: fonts.extrabold, color: colors.navy, fontSize: 17 }}>{mwk(l.priceMWK)}</T>
            </View>
          </View>
          <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.muted }}>HOW WILL YOU GET IT?</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([['pickup', `Pick up in ${l.town}`], ...(l.matolaDelivery ? [['matola', 'Matola delivery']] : [])] as ['pickup' | 'matola', string][]).map(([k2, label]) => (
              <Pressable key={k2} accessibilityRole="radio" accessibilityState={{ selected: delivery === k2 }} onPress={() => setDelivery(k2)} style={{ flex: 1, minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, backgroundColor: delivery === k2 ? colors.navy : '#FFFFFF', borderWidth: delivery === k2 ? 0 : 1, borderColor: colors.line }}>
                <T style={{ fontFamily: fonts.bold, color: delivery === k2 ? '#FFFFFF' : colors.ink, textAlign: 'center' }}>{label}</T>
              </Pressable>
            ))}
          </View>
          <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.muted }}>PAYMENT</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 }}>
            <Icon name="wallet" color={colors.lime600} size={22} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: fonts.bold }}>Pay on delivery</T>
              <T style={{ fontSize: 12, color: colors.muted }}>Pay the seller in cash or mobile money when you get the item</T>
            </View>
          </View>
          <ScaledTextInput
            accessibilityLabel="Note to the seller"
            value={note}
            onChangeText={setNote}
            placeholder="Note to the seller (optional), e.g. Can I come at 4pm?"
            placeholderTextColor={colors.muted}
            maxLength={300}
            multiline
            style={{ minHeight: 52, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 }}
          />
          <Button title={ordering ? 'Sending order…' : `Order for ${mwk(l.priceMWK)}`} icon="bag" onPress={order} loading={ordering} />
        </View>
      </Modal>
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
