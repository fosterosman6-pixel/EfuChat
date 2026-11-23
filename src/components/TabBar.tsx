import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../lib/icons';
import { useLang, StringKey } from '../lib/i18n';
import { colors, fonts } from '../lib/theme';
import { Avatar, Icon } from './ui';
import { useEffect, useState } from 'react';
import { subscribeChats } from '../lib/chats';
import { useSession } from '../lib/session';

const TABS: Record<string, { icon: IconName; label: StringKey | 'Me' }> = {
  home: { icon: 'home', label: 'home' },
  chats: { icon: 'chat', label: 'chats' },
  market: { icon: 'bag', label: 'market' },
  me: { icon: 'person', label: 'Me' },
};

/** Floating navy bar: Home · Chats · + · Market · Me (Jakob's law: home far left, profile far right, create in the middle). */
export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLang();
  const { user, profile } = useSession();
  const [unread, setUnread] = useState(0);
  useEffect(() => (user ? subscribeChats(user.uid, (cs) => setUnread(cs.reduce((n, c) => n + ((c.unread?.[user.uid] ?? 0) > 0 ? 1 : 0), 0))) : undefined), [user]);
  const dark = false;

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
                  <Icon name="plus" color={colors.navy} size={30} />
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
              accessibilityLabel={route.name === 'chats' && unread ? `Chats, ${unread} unread` : undefined}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={styles.slot}
            >
              <View>
                {route.name === 'me' ? (
                  <View style={{ borderRadius: 11, borderWidth: 2, borderColor: col }}>
                    <Avatar name={profile?.name ?? 'Me'} uri={profile?.photoURL} size={28} rounded={9} />
                  </View>
                ) : (
                  <Icon name={tab.icon} color={col} size={28} />
                )}
                {route.name === 'chats' && unread > 0 && (
                  <View style={{ position: 'absolute', top: -6, right: -13, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.navy, fontSize: 13, fontFamily: fonts.extrabold }}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </View>
              <Text maxFontSizeMultiplier={1.4} style={{ color: col, fontSize: 14, fontFamily: focused ? fonts.bold : fonts.semibold }}>{tab.label === 'Me' ? 'Me' : t(tab.label)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8 },
  bar: { height: 80, backgroundColor: colors.navy, borderRadius: 22, flexDirection: 'row', alignItems: 'center' },
  slot: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 4 },
  plus: {
    width: 66,
    height: 66,
    marginTop: -34,
    borderRadius: 999,
    backgroundColor: colors.lime,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
