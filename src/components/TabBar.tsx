import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../lib/icons';
import { useLang, StringKey } from '../lib/i18n';
import { colors, fonts } from '../lib/theme';
import { Icon } from './ui';

const TABS: Record<string, { icon: IconName; label: StringKey }> = {
  home: { icon: 'home', label: 'home' },
  reels: { icon: 'reels', label: 'reels' },
  market: { icon: 'bag', label: 'market' },
  chats: { icon: 'chat', label: 'chats' },
};

/** Floating navy bar: Home · Reels · + · Market · Chats */
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const dark = state.routes[state.index]?.name === 'reels';

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: dark ? colors.navy : colors.surface100 }]}>
      <View style={styles.bar}>
        {state.routes.map((route, i) => {
          if (route.name === 'plus') {
            return (
              <View key={route.key} style={styles.slot}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Create"
                  onPress={() => router.push('/create')}
                  style={[styles.plus, { borderColor: dark ? colors.navy : colors.surface100 }]}
                >
                  <Icon name="plus" color={colors.navy} size={26} />
                </Pressable>
              </View>
            );
          }
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === i;
          const col = focused ? colors.lime : colors.soft;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={styles.slot}
            >
              <Icon name={tab.icon} color={col} />
              <Text style={{ color: col, fontSize: 11, fontFamily: focused ? fonts.bold : fonts.semibold }}>{t(tab.label)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8 },
  bar: { height: 64, backgroundColor: colors.navy, borderRadius: 22, flexDirection: 'row', alignItems: 'center' },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  plus: {
    width: 58,
    height: 58,
    marginTop: -30,
    borderRadius: 999,
    backgroundColor: colors.lime,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
