// EfuLogistix brand tokens, used across EfuChat.
export const colors = {
  navy: '#0A2253',
  navy700: '#1E3A78',
  lime: '#A6D41C',
  lime600: '#4D7300',
  lime100: '#EEF8D2',
  surface: '#FFFFFF',
  surface100: '#F3F5F9',
  ink: '#0F1B38',
  muted: '#566079',
  line: '#DCE1EA',
  soft: '#C9D3E8',
  warning: '#9A5B00',
  danger: '#B42318',
  dangerTint: '#FDECEA',
  greyTint: '#E3E8F2',
} as const;

export const fonts = {
  regular: 'OpenSans_400Regular',
  semibold: 'OpenSans_600SemiBold',
  bold: 'OpenSans_700Bold',
  extrabold: 'OpenSans_800ExtraBold',
} as const;

export const radius = { sm: 6, md: 12, lg: 16, xl: 24, full: 999 } as const;
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 } as const;

/** Avatar colour pairs, picked by a hash of the name so each person keeps one. */
const avatarPairs = [
  { bg: colors.navy, fg: '#FFFFFF' },
  { bg: colors.lime100, fg: colors.lime600 },
  { bg: colors.greyTint, fg: colors.navy },
  { bg: colors.lime, fg: colors.navy },
];

export function avatarColors(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return avatarPairs[h % avatarPairs.length];
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}
