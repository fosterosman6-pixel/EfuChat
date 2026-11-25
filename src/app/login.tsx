import { signInWithPhoneNumber } from '@react-native-firebase/auth';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoMark, Wordmark } from '../components/Logo';
import { Button, Icon, T, styles as ui, ScaledTextInput } from '../components/ui';
import { auth } from '../lib/firebase';
import { useLang } from '../lib/i18n';
import { COUNTRIES, setPendingSignIn, toE164 } from '../lib/phone';
import { colors, fonts } from '../lib/theme';

export default function Login() {
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const [countryIdx, setCountryIdx] = useState(0);
  const [local, setLocal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const country = COUNTRIES[countryIdx];
  const phone = toE164(country.dial, local);

  async function sendCode() {
    if (phone.length < 10) {
      setError('Check the phone number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const confirmation = await signInWithPhoneNumber(auth, phone);
      setPendingSignIn({ phone, confirmation });
      router.push('/verify');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior="padding">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View
          style={{
            backgroundColor: colors.navy,
            paddingTop: insets.top + 48,
            paddingBottom: 36,
            paddingHorizontal: 24,
            alignItems: 'center',
            gap: 14,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
          }}
        >
          <LogoMark size={64} />
          <Wordmark size={32} />
        </View>

        <View style={{ flex: 1, padding: 24, gap: 20 }}>
          <View style={{ gap: 6 }}>
            <T style={{ fontSize: 24, lineHeight: 30, fontFamily: fonts.bold }}>{t('enterPhone')}</T>
            <T style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>{t('smsNote')}</T>
          </View>

          <View style={{ gap: 8 }}>
            <T style={ui.label}>COUNTRY</T>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Country: ${country.name}. Tap to change`}
              onPress={() => setCountryIdx((countryIdx + 1) % COUNTRIES.length)}
              style={[ui.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
            >
              <T style={{ fontFamily: fonts.semibold }}>{country.name}</T>
              <Icon name="chev" color={colors.navy} size={18} />
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            <T style={ui.label}>PHONE NUMBER</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={[ui.input, { width: 76, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 }]}>
                <T style={{ fontFamily: fonts.semibold }}>{country.dial}</T>
              </View>
              <ScaledTextInput
                accessibilityLabel="Phone number"
                value={local}
                onChangeText={setLocal}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder={country.sample}
                placeholderTextColor="#8A93A8"
                style={[ui.input, { flex: 1, borderWidth: 2, borderColor: colors.navy, backgroundColor: '#FFFFFF', fontSize: 17 }]}
              />
            </View>
            {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}
          </View>

          <View style={{ flex: 1 }} />
          <Button title={t('sendCode')} variant="navy" onPress={sendCode} loading={busy} disabled={!local} />
          <T style={{ fontSize: 12, color: colors.muted, textAlign: 'center', paddingBottom: insets.bottom }}>
            {'By continuing you agree to the '}
            <T style={{ fontSize: 12, color: colors.navy, fontFamily: fonts.bold, textDecorationLine: 'underline' }} onPress={() => router.push('/terms')}>
              Terms and Privacy Policy
            </T>
            .
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
