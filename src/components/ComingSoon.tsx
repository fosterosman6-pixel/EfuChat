import { View } from 'react-native';
import type { IconName } from '../lib/icons';
import { useLang } from '../lib/i18n';
import { colors, fonts } from '../lib/theme';
import { T, Tile } from './ui';

/** Shown on tabs whose features arrive in a later phase. */
export function ComingSoon({ icon, title, text, dark }: { icon: IconName; title: string; text: string; dark?: boolean }) {
  const { t } = useLang();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <Tile name={icon} bg={colors.lime} fg={colors.navy} size={64} />
      <T style={{ fontSize: 20, fontFamily: fonts.extrabold, color: dark ? '#FFFFFF' : colors.ink, textAlign: 'center' }}>{title}</T>
      <T style={{ fontSize: 14, lineHeight: 20, color: dark ? colors.soft : colors.muted, textAlign: 'center' }}>{text}</T>
      <View style={{ marginTop: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: dark ? colors.navy700 : colors.lime100 }}>
        <T style={{ fontSize: 12, fontFamily: fonts.bold, color: dark ? colors.lime : colors.lime600 }}>{t('comingSoon')}</T>
      </View>
    </View>
  );
}
