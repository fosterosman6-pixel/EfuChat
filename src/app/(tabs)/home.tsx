import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Wordmark } from '../../components/Logo';
import { PostCard } from '../../components/PostCard';
import { StoriesRow } from '../../components/StoriesRow';
import { Avatar, Button, Header, IconButton, T } from '../../components/ui';
import { useBlocked, useFollowing } from '../../lib/follows';
import { Feed, subscribeFeed } from '../../lib/posts';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Post } from '../../lib/types';

const FEEDS: Feed[] = ['For you', 'Following', 'Near me'];

export default function Home() {
  const { profile } = useSession();
  const following = useFollowing();
  const blocked = useBlocked();
  const [feed, setFeed] = useState<Feed>('For you');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const followKey = following.join(',');
  const blockKey = [...blocked].join(',');
  useEffect(() => {
    setPosts(null);
    return subscribeFeed(feed, { following, town: profile?.town, blocked }, setPosts);
  }, [feed, followKey, blockKey, profile?.town, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty =
    feed === 'Following'
      ? 'Follow people to see their posts here. Tap a name on any post to open their profile.'
      : feed === 'Near me' && !profile?.town
        ? 'Add your town in Me to see posts from people near you.'
        : 'No posts yet. Be the first: tap + and choose Post.';

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          <View style={{ flex: 1 }}>
            <Wordmark size={24} />
          </View>
          <IconButton name="search" label="Search and explore" size={20} onPress={() => router.push('/explore')} />
          <IconButton name="bell" label="Notifications" onPress={() => router.push('/notifications')} />
          <Pressable accessibilityRole="button" accessibilityLabel="Me: your profile and settings" onPress={() => router.push('/me')} style={{ padding: 5 }}>
            <Avatar name={profile?.name ?? 'Me'} size={34} rounded={11} />
          </Pressable>
        </View>
        <StoriesRow />
      </Header>

      <FlatList
        data={posts ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16, gap: 10 }}
        refreshControl={<RefreshControl refreshing={posts === null} onRefresh={() => setRefreshKey((k) => k + 1)} tintColor={colors.navy} />}
        ListHeaderComponent={
          <View accessibilityRole="tablist" style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, paddingTop: 10, paddingBottom: 2 }}>
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
        }
        ListEmptyComponent={
          posts === null ? undefined : (
            <View style={{ alignItems: 'center', gap: 14, paddingTop: 40, paddingHorizontal: 24 }}>
              <T style={{ textAlign: 'center', color: colors.muted, lineHeight: 21 }}>{empty}</T>
              {feed === 'For you' && <Button title="Write a post" icon="edit" onPress={() => router.push('/create-post')} style={{ alignSelf: 'stretch' }} />}
            </View>
          )
        }
        renderItem={({ item }) => <PostCard post={item} />}
      />
    </View>
  );
}
