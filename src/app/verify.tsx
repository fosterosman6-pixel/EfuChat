import { signInWithPhoneNumber } from '@react-native-firebase/auth';
import { router } from 'expo-router';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Header, Icon, T, ScaledTextInput } from '../components/ui';
import { auth } from '../lib/firebase';
import { useLang } from '../lib/i18n';
import { getPendingSignIn, setPendingSignIn } from '../lib/phone';
import { colors, fonts } from '../lib/theme';

const LEN = 6;

export default function Verify() {
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const pending = getPendingSignIn();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(60);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function confirm(value = code) {
    if (!pending || value.length !== LEN) return;
    setBusy(true);
    setError('');
    try {
      await pending.confirmation.confirm(value);
      // The index screen sends new people to profile setup and others to Home.
      router.replace('/');
    } catch {
      setError('That code is not right. Check the SMS and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!pending || wait > 0) return;
    try {
      const confirmation = await signInWithPhoneNumber(auth, pending.phone, undefined);
      setPendingSignIn({ phone: pending.phone, confirmation });
      setWait(60);
    } catch {
      setError('Could not resend the code. Try again soon.');
    }
  }

  if (!pending) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <Header title={t('verifyTitle')} onBack={() => router.back()} />
        <View style={{ padding: 24 }}>
          <T>Start again by entering your phone number.</T>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Header title={t('verifyTitle')} onBack={() => router.back()} />
      <View style={{ flex: 1, padding: 20, paddingTop: 28, gap: 22, paddingBottom: insets.bottom + 20 }}>
        <View style={{ gap: 6 }}>
          <T style={{ fontSize: 24, lineHeight: 30, fontFamily: fonts.extrabold }}>{t('enterCode')}</T>
          <T style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
            Sent by SMS to <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{pending.phone}</T>.
          </T>
        </View>

        {/* One hidden input drives six boxes, so paste and SMS autofill work. */}
        <Pressable accessibilityLabel="Verification code" onPress={() => input.current?.focus()} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {Array.from({ length: LEN }).map((_, i) => {
            const active = i === code.length;
            return (
              <View
                key={i}
                style={{
                  width: 46,
                  height: 56,
                  borderRadius: 12,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.navy : colors.line,
                  backgroundColor: code[i] ? colors.surface100 : '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <T style={{ fontSize: 24, fontFamily: fonts.extrabold, color: colors.navy }}>{code[i] ?? ''}</T>
              </View>
            );
          })}
        </Pressable>
        <ScaledTextInput
          ref={input}
          value={code}
          onChangeText={(v) => {
            const clean = v.replace(/\D/g, '').slice(0, LEN);
            setCode(clean);
            if (clean.length === LEN) confirm(clean);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          maxLength={LEN}
          style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
        />
        {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}

        <Pressable
          accessibilityRole="button"
          disabled={wait > 0}
          onPress={resend}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: colors.surface100 }}
        >
          <Icon name="bell" color={colors.muted} size={18} />
          <T style={{ fontSize: 13, color: colors.muted }}>
            {wait > 0 ? `Didn't get it? Resend in 0:${String(wait).padStart(2, '0')}` : 'Resend the code'}
          </T>
        </Pressable>

        <View style={{ flex: 1 }} />
        <Button title={t('verify')} onPress={() => confirm()} loading={busy} disabled={code.length !== LEN} />
      </View>
    </View>
  );
}
