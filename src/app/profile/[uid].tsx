import { dialog } from '../../components/Dialog';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, deleteDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostCard } from '../../components/PostCard';
import { Avatar, Icon, IconButton, T } from '../../components/ui';
import { openDirectChat } from '../../lib/chats';
import { db } from '../../lib/firebase';
import { followCounts, setFollowing, useFollowing } from '../../lib/follows';
import { subscribeUserPosts } from '../../lib/posts';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Post, UserProfile } from '../../lib/types';

export default function Profile() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { profile: me } = useSession();
  const insets = useSafeAreaInsets();
  const following = useFollowing();
  const [person, setPerson] = useState<UserProfile | null | undefined>(undefined);
  const [posts, setPosts] = useState<Post[]>([]);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [blocked, setBlocked] = useState(false);
  const isMe = uid === me?.uid;
  const iFollow = following.includes(uid ?? '');

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, 'users', uid), (s) => setPerson(s.exists() ? ({ uid: s.id, ...s.data() } as UserProfile) : null), () => setPerson(null));
  }, [uid]);
  useEffect(() => (uid && me ? subscribeUserPosts(uid, me.uid, setPosts) : undefined), [uid, me]);
  useEffect(() => {
    if (uid) followCounts(uid).then(setCounts).catch(() => {});
  }, [uid, iFollow]);
  useEffect(() => {
    if (uid && me && !isMe) getDoc(doc(db, 'users', me.uid, 'blocks', uid)).then((s) => setBlocked(s.exists())).catch(() => {});
  }, [uid, me, isMe]);

  async function toggleFollow() {
    if (!me || !uid) return;
    await setFollowing(me.uid, uid, !iFollow).catch(() => dialog('Could not update', 'Try again.'));
  }

  async function message() {
    if (!me || !person) return;
    const id = await openDirectChat(me, person);
    router.push({ pathname: '/chat/[id]', params: { id } });
  }

  function more() {
    if (!me || !uid) return;
    dialog(person?.name ?? 'Person', undefined, [
      {
        text: blocked ? 'Unblock' : 'Block',
        style: blocked ? 'default' : 'destructive',
        onPress: async () => {
          const ref = doc(db, 'users', me.uid, 'blocks', uid);
          if (blocked) await deleteDoc(ref);
          else {
            await setDoc(ref, { createdAt: serverTimestamp() });
            if (iFollow) await setFollowing(me.uid, uid, false);
          }
          setBlocked(!blocked);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  if (person === null) {
    return (
      <View style={{ flex: 1, paddingTop: insets.top + 20, alignItems: 'center' }}>
        <T style={{ color: colors.muted }}>This account is not available.</T>
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.surface100 }}
      data={blocked ? [] : posts}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ gap: 10, paddingBottom: insets.bottom + 20 }}
      ListHeaderComponent={
        <View style={{ backgroundColor: colors.navy, paddingTop: insets.top + 6, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, gap: 12, marginBottom: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
            <IconButton name="back" label="Back" onPress={() => router.back()} />
            {!isMe && <IconButton name="dots" label="More options" onPress={more} />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 }}>
            <View style={{ borderWidth: 3, borderColor: colors.lime, borderRadius: 26, padding: 3 }}>
              <Avatar name={person?.name ?? ' '} size={72} rounded={20} uri={person?.photoURL} />
            </View>
            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
              <Stat n={posts.length} label="Posts" />
              <Stat n={counts.followers} label="Followers" />
              <Stat n={counts.following} label="Following" />
            </View>
          </View>
          <View style={{ paddingHorizontal: 16, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <T style={{ color: '#FFFFFF', fontSize: 18, fontFamily: fonts.extrabold }}>{person?.name}</T>
              {person?.verified && <Icon name="verified" color={colors.lime} size={18} />}
            </View>
            {person?.handle ? <T style={{ color: colors.soft, fontSize: 13 }}>@{person.handle}</T> : null}
            {person?.about ? <T style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginTop: 4 }}>{person.about}</T> : null}
          </View>
          {!isMe && (
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
              <Pressable
                accessibilityRole="button"
                onPress={toggleFollow}
                disabled={blocked}
                style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: iFollow ? 'transparent' : colors.lime, borderWidth: iFollow ? 1 : 0, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center', opacity: blocked ? 0.5 : 1 }}
              >
                <T style={{ color: iFollow ? '#FFFFFF' : colors.navy, fontFamily: fonts.extrabold, fontSize: 14 }}>{iFollow ? 'Following' : 'Follow'}</T>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={message} disabled={blocked} style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.lime, alignItems: 'center', justifyContent: 'center', opacity: blocked ? 0.5 : 1 }}>
                <T style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 14 }}>Message</T>
              </Pressable>
            </View>
          )}
        </View>
      }
      ListEmptyComponent={
        <T style={{ textAlign: 'center', color: colors.muted, padding: 24 }}>{blocked ? 'You blocked this person.' : 'No posts yet.'}</T>
      }
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: 12 }}>
          <PostCard post={item} />
        </View>
      )}
    />
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <T style={{ color: '#FFFFFF', fontSize: 18, fontFamily: fonts.extrabold }}>{n.toLocaleString('en-US')}</T>
      <T style={{ color: colors.soft, fontSize: 12 }}>{label}</T>
    </View>
  );
}
