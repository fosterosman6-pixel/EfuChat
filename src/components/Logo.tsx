import Svg, { Path, Rect } from 'react-native-svg';
import { Text } from 'react-native';
import { colors, fonts } from '../lib/theme';

/** EfuChat chat-bubble mark (new for this app; the EfuLogistix logo is untouched). */
export function LogoMark({ size = 76 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" accessibilityElementsHidden importantForAccessibility="no">
      <Rect width={30} height={30} rx={9} fill={colors.lime} />
      <Path d="M8 9h14a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-7l-5 4v-4H8a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" fill={colors.navy} />
    </Svg>
  );
}

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: fonts.extrabold, fontSize: size, color: '#FFFFFF' }}>
      Efu<Text style={{ color: colors.lime }}>Chat</Text>
    </Text>
  );
}
