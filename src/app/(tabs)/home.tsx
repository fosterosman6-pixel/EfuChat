import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ComingSoon } from '../../components/ComingSoon';
import { Wordmark } from '../../components/Logo';
import { StoriesRow } from '../../components/StoriesRow';
import { Avatar, Header, IconButton, T } from '../../components/ui';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';

const FEEDS = ['For you', 'Following', 'Near me'] as const;

export default function Home() {
  const { profile } = useSession();
  const [feed, setFeed] = useState<(typeof FEEDS)[number]>('For you');

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          <View style={{ flex: 1 }}>
            <Wordmark size={24} />
          </View>
          <IconButton name="search" label="Search and explore" size={20} />
          <IconButton name="bell" label="Notifications" />
          <Pressable accessibilityRole="button" accessibilityLabel="Me: your profile and settings" onPress={() => router.push('/me')} style={{ padding: 5 }}>
            <Avatar name={profile?.name ?? 'Me'} size={34} rounded={11} />
          </Pressable>
        </View>
        <StoriesRow />
      </Header>

      <View accessibilityRole="tablist" style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, paddingTop: 10 }}>
        {FEEDS.map((f) => {
          const on = f === feed;
          return (
            <Pressable key={f} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setFeed(f)} style={{ alignItems: 'center', gap: 6, padding: 6 }}>
              <T style={{ fontSize: 16, fontFamily: on ? fonts.extrabold : fonts.semibold, color: on ? colors.ink : colors.muted }}>{f}</T>
              <View style={{ width: 28, height: 3, borderRadius: 999, backgroundColor: on ? colors.lime : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>

      <ComingSoon
        icon="home"
        title="Your feed is on its way"
        text="Posts, photos, polls, likes, comments and tips arrive in the next update. Stories already work: tap Your story to post one."
      />
    </View>
  );
}
