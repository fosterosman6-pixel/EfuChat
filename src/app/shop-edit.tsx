import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../components/Dialog';
import { Button, Header, ScaledTextInput, T, Toggle } from '../components/ui';
import { getShop, saveShop } from '../lib/orders';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

/** Shop name, town, a short about line, and whether I can deliver by matola. */
export default function ShopEdit() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [town, setTown] = useState('');
  const [about, setAbout] = useState('');
  const [delivery, setDelivery] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    getShop(profile.uid).then((s) => {
      setName(s?.name ?? `${profile.name.split(' ')[0]}'s shop`);
      setTown(s?.town ?? profile.town ?? '');
      setAbout(s?.about ?? '');
      setDelivery(!!s?.delivery);
    }, () => {});
  }, [profile]);

  async function save() {
    if (!profile) return;
    if (name.trim().length < 2) return dialog('Shop name', 'Give your shop a name.');
    setBusy(true);
    try {
      await saveShop(profile.uid, { name, town, about, delivery });
      router.back();
    } catch {
      dialog('Could not save', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const field = { minHeight: 52, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, fontSize: 16 } as const;
  const label = (t: string) => <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.muted, marginTop: 6 }}>{t}</T>;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Edit shop" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {label('SHOP NAME')}
        <ScaledTextInput accessibilityLabel="Shop name" value={name} onChangeText={setName} maxLength={60} style={field} />
        {label('TOWN')}
        <ScaledTextInput accessibilityLabel="Town" value={town} onChangeText={setTown} maxLength={60} placeholder="e.g. Mangochi" placeholderTextColor={colors.muted} style={field} />
        {label('ABOUT')}
        <ScaledTextInput accessibilityLabel="About your shop" value={about} onChangeText={setAbout} maxLength={300} multiline placeholder="What you sell, opening hours…" placeholderTextColor={colors.muted} style={[field, { minHeight: 96, paddingVertical: 12, textAlignVertical: 'top' }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontFamily: fonts.bold }}>I can deliver by matola</T>
            <T style={{ fontSize: 13, color: colors.muted }}>Buyers can choose matola delivery on your items</T>
          </View>
          <Toggle value={delivery} onChange={setDelivery} label="I can deliver by matola" />
        </View>
        <Button title="Save shop" onPress={save} loading={busy} style={{ marginTop: 12 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
