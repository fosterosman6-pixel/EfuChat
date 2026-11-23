import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoMark, Wordmark } from '../components/Logo';
import { Button, Icon, T } from '../components/ui';
import { Lang, useLang } from '../lib/i18n';
import { colors, fonts } from '../lib/theme';

const LANGS: { id: Lang; name: string; native: string }[] = [
  { id: 'ny', name: 'Chichewa', native: 'Chinyanja' },
  { id: 'en', name: 'English', native: 'English' },
];

export default function Welcome() {
  const { lang, setLang, t } = useLang();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.navy,
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          paddingHorizontal: 32,
          paddingTop: insets.top,
        }}
      >
        <LogoMark />
        <Wordmark size={38} />
        <T style={{ color: colors.soft, fontSize: 16, lineHeight: 24, textAlign: 'center' }}>{t('tagline')}</T>
      </View>

      <View style={{ padding: 20, paddingBottom: insets.bottom + 20, gap: 10 }}>
        <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.muted, letterSpacing: 0.4 }}>{t('chooseLanguage')}</T>
        <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
          {LANGS.map((l) => {
            const on = lang === l.id;
            return (
              <Pressable
                key={l.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setLang(l.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 14,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? colors.navy : colors.line,
                  backgroundColor: on ? colors.lime100 : '#FFFFFF',
                }}
              >
                <View style={{ flex: 1 }}>
                  <T style={{ fontSize: 16, fontFamily: fonts.bold }}>{l.name}</T>
                  <T style={{ fontSize: 13, color: colors.muted }}>{l.native}</T>
                </View>
                {on ? (
                  <View style={{ width: 28, height: 28, borderRadius: 999, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="check" size={16} />
                  </View>
                ) : (
                  <View style={{ width: 24, height: 24, borderRadius: 999, borderWidth: 2, borderColor: colors.line }} />
                )}
              </Pressable>
            );
          })}
        </View>
        <Button title={t('getStarted')} onPress={() => router.push('/login')} style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}
