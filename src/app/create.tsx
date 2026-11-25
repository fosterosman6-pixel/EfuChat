import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Icon, IconButton, Row, T, Tile } from '../components/ui';
import { openEfuLogistix } from '../lib/matola';
import type { IconName } from '../lib/icons';
import { colors, fonts } from '../lib/theme';

type Big = { icon: IconName; title: string; sub: string; dark?: boolean; tint?: boolean; go?: () => void };

/** The + menu: Post, Reel, Story, Chat, then group, money and matola. */
export default function CreateMenu() {
  const insets = useSafeAreaInsets();
  const [matola, setMatola] = useState(false);
  const go = (path: '/new-story' | '/new-chat' | '/create-post') => {
    router.back();
    router.push(path);
  };

  const tiles: Big[] = [
    { icon: 'edit', title: 'Post', sub: 'Text or poll', dark: true, go: () => go('/create-post') },
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
                style={{ flexGrow: 1, flexBasis: '40%', padding: 16, borderRadius: 16, backgroundColor: bg, gap: 10, opacity: b.go ? 1 : 0.7 }}
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
          <Row left={<Tile name="group" bg={colors.surface100} fg={colors.navy} />} title="New group" subtitle="Chat with several people" onPress={() => router.replace('/new-group')} />
          <Row left={<Tile name="wallet" bg={colors.lime100} fg={colors.lime600} />} title="Send money" subtitle="Airtel Money or TNM Mpamba" onPress={() => router.replace('/send-money')} />
          <Row
            left={<Tile name="truck" bg={colors.lime100} fg={colors.lime600} />}
            title="Book a matola"
            subtitle="Seats, parcels and car hire with EfuLogistix"
            onPress={() => setMatola(true)}
            last
          />
        </Card>
      </View>
      <Modal visible={matola} transparent animationType="slide" onRequestClose={() => setMatola(false)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(10,34,83,0.55)' }} onPress={() => setMatola(false)} />
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 18, paddingBottom: insets.bottom + 24, gap: 16 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Tile name="truck" bg={colors.lime} fg={colors.navy} size={56} />
            <View>
              <T style={{ fontFamily: fonts.extrabold, fontSize: 20 }}>Book a matola</T>
              <T style={{ color: colors.muted }}>With EfuLogistix</T>
            </View>
          </View>
          {(
            [
              ['person', 'Book a seat on a route'],
              ['bag', 'Send a parcel'],
              ['truck', 'Hire a whole car or lorry'],
            ] as const
          ).map(([icon, label]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icon name={icon} color={colors.lime600} size={22} />
              <T style={{ fontSize: 16 }}>{label}</T>
            </View>
          ))}
          <Button
            title="Open EfuLogistix"
            onPress={() => {
              setMatola(false);
              openEfuLogistix();
            }}
          />
          <T style={{ fontSize: 13, color: colors.muted, textAlign: 'center' }}>Not installed? This opens the Play Store. Booking inside EfuChat is coming next.</T>
        </View>
      </Modal>
    </View>
  );
}
