import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, IconButton, Row, T, Tile } from '../components/ui';
import type { IconName } from '../lib/icons';
import { colors, fonts } from '../lib/theme';

type Big = { icon: IconName; title: string; sub: string; dark?: boolean; tint?: boolean; go?: () => void };

/** The + menu: Post, Reel, Story, Chat, then group, money and matola. */
export default function CreateMenu() {
  const insets = useSafeAreaInsets();
  const go = (path: '/new-story' | '/new-chat') => {
    router.back();
    router.push(path);
  };

  const tiles: Big[] = [
    { icon: 'edit', title: 'Post', sub: 'Coming soon', dark: true },
    { icon: 'reels', title: 'Reel', sub: 'Coming soon', tint: true },
    { icon: 'camera', title: 'Story', sub: 'Gone in 24 hours', go: () => go('/new-story') },
    { icon: 'chat', title: 'Chat', sub: 'Message a contact', go: () => go('/new-chat') },
  ];

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.55)' }} onPress={() => router.back()} />
      <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: insets.bottom + 16, gap: 14 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 }}>
          <T style={{ fontSize: 20, fontFamily: fonts.extrabold }}>Create</T>
          <IconButton name="close" label="Close" color={colors.muted} size={20} onPress={() => router.back()} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {tiles.map((b) => {
            const bg = b.dark ? colors.navy : b.tint ? colors.lime100 : colors.surface100;
            const fg = b.dark ? '#FFFFFF' : colors.ink;
            return (
              <Pressable
                key={b.title}
                accessibilityRole="button"
                accessibilityState={{ disabled: !b.go }}
                onPress={b.go}
                style={{ width: '48.5%', padding: 16, borderRadius: 16, backgroundColor: bg, gap: 10, opacity: b.go ? 1 : 0.7 }}
              >
                <Tile name={b.icon} bg={b.dark || b.tint ? colors.lime : colors.navy} fg={b.dark || b.tint ? colors.navy : colors.lime} size={42} />
                <View>
                  <T style={{ fontFamily: fonts.bold, color: fg }}>{b.title}</T>
                  <T style={{ fontSize: 12, color: b.dark ? colors.soft : colors.muted }}>{b.sub}</T>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Card style={{ marginHorizontal: 0, borderWidth: 1, borderColor: colors.line }}>
          <Row left={<Tile name="group" bg={colors.surface100} fg={colors.navy} />} title="New group" subtitle="Coming soon" />
          <Row left={<Tile name="wallet" bg={colors.lime100} fg={colors.lime600} />} title="Send money" subtitle="Coming soon" />
          <Row left={<Tile name="truck" bg={colors.lime100} fg={colors.lime600} />} title="Book a matola" subtitle="Coming soon" last />
        </Card>
      </View>
    </View>
  );
}
