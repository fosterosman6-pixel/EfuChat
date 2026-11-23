import { dialog } from '../components/Dialog';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Header, Icon, T, Tile, ScaledTextInput } from '../components/ui';
import { CATEGORIES, createListing, type Category, type Condition } from '../lib/market';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

const CONDITIONS: { id: Condition; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'like_new', label: 'Like new' },
  { id: 'used', label: 'Used' },
];

export default function Sell() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [condition, setCondition] = useState<Condition>('used');
  const [town, setTown] = useState(profile?.town ?? '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const priceNum = Number(price.replace(/[^\d]/g, ''));
  const ready = photos.length > 0 && title.trim().length >= 3 && priceNum > 0 && !!category && town.trim().length >= 2;

  async function addPhotos(source: 'camera' | 'gallery') {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return dialog('Permission needed', 'Allow access to add photos of your item.');
    const room = 6 - photos.length;
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.8 });
    if (!res.canceled) setPhotos([...photos, ...res.assets.map((a) => a.uri)].slice(0, 6));
  }

  async function post() {
    if (!profile || !ready || !category) return;
    setBusy(true);
    try {
      const id = await createListing(profile, { title, description, priceMWK: priceNum, category, condition, town }, photos);
      router.replace({ pathname: '/market/[id]', params: { id } });
    } catch (e) {
      dialog('Could not post', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Header title="Sell an item" onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <View style={{ gap: 8 }}>
          <T style={label}>{`PHOTOS · ${photos.length} OF 6`}</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {photos.map((u, i) => (
              <Pressable key={u} accessibilityLabel={`Photo ${i + 1}, tap to remove`} onPress={() => setPhotos(photos.filter((p) => p !== u))}>
                <Image source={{ uri: u }} style={{ width: 84, height: 84, borderRadius: 14 }} />
                <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(10,34,83,0.8)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" color="#FFFFFF" size={12} />
                </View>
                {i === 0 && <T style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 10, fontFamily: fonts.bold, color: '#FFFFFF', backgroundColor: 'rgba(10,34,83,0.8)', paddingHorizontal: 6, borderRadius: 6, overflow: 'hidden' }}>Cover</T>}
              </Pressable>
            ))}
            {photos.length < 6 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add photos"
                onPress={() =>
                  dialog('Add photos', undefined, [
                    { text: 'From gallery', onPress: () => addPhotos('gallery') },
                    { text: 'Take a photo', onPress: () => addPhotos('camera') },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
                style={{ width: 84, height: 84, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', gap: 2 }}
              >
                <Icon name="camera" color={colors.navy} size={24} />
                <T style={{ fontSize: 12, fontFamily: fonts.bold }}>Add</T>
              </Pressable>
            )}
          </ScrollView>
        </View>

        <Input label="TITLE" value={title} onChange={(v) => setTitle(v.slice(0, 80))} placeholder="e.g. 3-seater sofa" />
        <Input label="PRICE (MWK)" value={price ? Number(price.replace(/[^\d]/g, '') || 0).toLocaleString('en-US') : ''} onChange={(v) => setPrice(v.replace(/[^\d]/g, '').slice(0, 8))} placeholder="e.g. 220,000" numeric />

        <View style={{ gap: 8 }}>
          <T style={label}>CATEGORY</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
              <Chip key={c.id} label={c.label} on={category === c.id} onPress={() => setCategory(c.id as Category)} />
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <T style={label}>CONDITION</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CONDITIONS.map((c) => (
              <Chip key={c.id} label={c.label} on={condition === c.id} onPress={() => setCondition(c.id)} />
            ))}
          </View>
        </View>

        <Input label="LOCATION" value={town} onChange={(v) => setTown(v.slice(0, 40))} placeholder="e.g. Mangochi town" />
        <Input label="DESCRIPTION" value={description} onChange={(v) => setDescription(v.slice(0, 2000))} placeholder="Size, colour, any faults, where to pick up…" multiline />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.lime100 }}>
          <Tile name="truck" bg={colors.navy} fg={colors.lime} size={44} />
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bold }}>Matola delivery and wallet payment</T>
            <T style={{ fontSize: 13, color: colors.muted }}>Coming soon. For now buyers message you and pay on pick-up.</T>
          </View>
        </View>
      </ScrollView>
      <View style={{ padding: 12, paddingBottom: insets.bottom + 12 }}>
        <Button title={busy ? 'Posting…' : 'Post to Market'} onPress={post} loading={busy} disabled={!ready} />
      </View>
    </KeyboardAvoidingView>
  );
}

const label = { fontSize: 12, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.4 } as const;

function Input({ label: l, value, onChange, placeholder, numeric, multiline }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; multiline?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      <T style={label}>{l}</T>
      <ScaledTextInput
        accessibilityLabel={l.toLowerCase()}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#8A93A8"
        keyboardType={numeric ? 'number-pad' : 'default'}
        multiline={multiline}
        style={{ minHeight: multiline ? 96 : 52, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface100, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, fontFamily: fonts.regular, color: colors.ink, textAlignVertical: multiline ? 'top' : 'center' }}
      />
    </View>
  );
}

function Chip({ label: l, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.navy : colors.line, backgroundColor: on ? colors.navy : '#FFFFFF' }}>
      <T style={{ fontFamily: fonts.bold, color: on ? '#FFFFFF' : colors.ink }}>{l}</T>
    </Pressable>
  );
}
