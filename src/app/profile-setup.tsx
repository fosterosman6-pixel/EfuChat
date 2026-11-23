import { updateProfile } from '@react-native-firebase/auth';
import { doc, serverTimestamp, writeBatch } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Header, T, Tile, Toggle } from '../components/ui';
import { auth, db } from '../lib/firebase';
import { useLang } from '../lib/i18n';
import { colors, fonts } from '../lib/theme';

export default function ProfileSetup() {
  const { t, lang } = useLang();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [wallet, setWallet] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const user = auth.currentUser;
    if (!user || !user.phoneNumber) return;
    if (name.trim().length < 2) {
      setError('Please enter your name.');
      return;
    }
    setBusy(true);
    try {
      // Profile and phone lookup are written together so they never disagree.
      const batch = writeBatch(db);
      // Public profile. Server-owned fields start at their defaults; rules check them.
      batch.set(doc(db, 'users', user.uid), {
        name: name.trim(),
        about: about.trim() || 'Available',
        photoURL: null,
        lang,
        accountType: 'personal',
        verified: false,
        plan: 'free',
        plus: false,
        walletLinked: false,
        status: 'active',
        counts: { posts: 0, followers: 0, following: 0, sales: 0 },
        createdAt: serverTimestamp(),
      });
      // Private details: only this person and EfuChat staff can read them.
      batch.set(doc(db, 'users', user.uid, 'private', 'account'), {
        phone: user.phoneNumber,
        pushTokens: [],
        wantsWallet: wallet,
        settings: { dataSaver: true, readReceipts: true, lastSeen: 'contacts', storiesVisibleTo: 'everyone', moneyFrom: 'contacts' },
      });
      batch.set(doc(db, 'phoneIndex', user.phoneNumber), { uid: user.uid });
      await batch.commit();
      await updateProfile(user, { displayName: name.trim() });
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header title={t('yourProfile')} subtitle="Step 3 of 3" />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: insets.bottom + 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Field label={t('yourName')} value={name} onChangeText={setName} placeholder="First and last name" autoComplete="name" />
        <Field label={t('about')} value={about} onChangeText={setAbout} placeholder="Available" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.lime100 }}>
          <Tile name="wallet" bg={colors.navy} fg={colors.lime} size={40} />
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 14, fontFamily: fonts.bold }}>Link mobile money</T>
            <T style={{ fontSize: 12, color: colors.muted }}>Send and receive money in chats (coming soon)</T>
          </View>
          <Toggle value={wallet} onChange={setWallet} label="Link mobile money" />
        </View>
        {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}
        <View style={{ flex: 1 }} />
        <Button title={t('startChatting')} onPress={save} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
