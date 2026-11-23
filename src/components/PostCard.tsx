import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { ago, deletePost, isLiked, liveCounts, myVote, setLiked, vote } from '../lib/posts';
import { useTextScale } from '../lib/prefs';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { Post } from '../lib/types';
import { Avatar, Icon, T } from './ui';

/** Text with #hashtags in lime green; tapping one opens Explore for that tag. */
export function RichText({ text, size: base = 15 }: { text: string; size?: number }) {
  const size = Math.round(base * useTextScale());
  const parts = text.split(/(#[\p{L}\p{N}_]+)/u);
  return (
    <Text style={{ fontFamily: fonts.regular, fontSize: size, lineHeight: size * 1.45, color: colors.ink }}>
      {parts.map((p, i) =>
        p.startsWith('#') ? (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/explore', params: { tag: p.slice(1).toLowerCase() } })}
            style={{ color: colors.lime600, fontFamily: fonts.bold }}
          >
            {p}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

function Poll({ post, me }: { post: Post; me: string }) {
  const [mine, setMine] = useState<number | null>(null);
  const [extra, setExtra] = useState<number | null>(null); // my vote before the server adds it
  const poll = post.poll!;
  const ended = poll.endsAt.toMillis() < Date.now();

  useEffect(() => {
    myVote(post.id, me).then(setMine).catch(() => {});
  }, [post.id, me]);

  const votes = poll.votes.map((v, i) => v + (extra === i ? 1 : 0));
  const total = votes.reduce((a, b) => a + b, 0);
  const showResults = mine !== null || ended;
  const hoursLeft = Math.max(0, Math.ceil((poll.endsAt.toMillis() - Date.now()) / 3600_000));

  return (
    <View style={{ gap: 8 }}>
      {poll.options.map((o, i) => {
        const pct = total ? Math.round((votes[i] / total) * 100) : 0;
        const chosen = mine === i;
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityLabel={showResults ? `${o}, ${pct} percent` : `Vote ${o}`}
            disabled={showResults}
            onPress={async () => {
              setMine(i);
              setExtra(i);
              await vote(post.id, me, i).catch(() => {
                setMine(null);
                setExtra(null);
              });
            }}
            style={{
              height: 40,
              borderRadius: 10,
              backgroundColor: colors.surface100,
              overflow: 'hidden',
              justifyContent: 'center',
              borderWidth: chosen ? 2 : 0,
              borderColor: colors.navy,
            }}
          >
            {showResults && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: chosen ? '#D5EBA0' : colors.greyTint }} />}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 }}>
              <T style={{ fontFamily: fonts.bold, fontSize: 14 }}>{o}</T>
              {showResults && <T style={{ fontFamily: fonts.bold, fontSize: 13 }}>{pct}%</T>}
            </View>
          </Pressable>
        );
      })}
      <T style={{ fontSize: 12, color: colors.muted }}>
        {total.toLocaleString('en-US')} votes · {ended ? 'Poll closed' : `${hoursLeft} hours left`}
      </T>
    </View>
  );
}

export function PostCard({ post, onOpen = true }: { post: Post; onOpen?: boolean }) {
  const { user } = useSession();
  const me = user?.uid ?? '';
  const [liked, setLikedState] = useState(false);
  const [counts, setCounts] = useState({ likes: post.counts.likes, comments: post.counts.comments });

  useEffect(() => {
    if (!me) return;
    isLiked(post.id, me).then(setLikedState).catch(() => {});
    liveCounts(post.id)
      .then((c) => setCounts({ likes: Math.max(c.likes, post.counts.likes), comments: Math.max(c.comments, post.counts.comments) }))
      .catch(() => {});
  }, [post.id, me, post.counts.likes, post.counts.comments]);

  async function toggleLike() {
    const next = !liked;
    setLikedState(next);
    setCounts((c) => ({ ...c, likes: c.likes + (next ? 1 : -1) }));
    try {
      await setLiked(post.id, me, next);
    } catch {
      setLikedState(!next);
      setCounts((c) => ({ ...c, likes: c.likes + (next ? -1 : 1) }));
    }
  }

  function more() {
    const own = post.uid === me;
    Alert.alert('Post', undefined, [
      ...(own
        ? [{ text: 'Delete post', style: 'destructive' as const, onPress: () => deletePost(post.id).catch(() => Alert.alert('Could not delete', 'Try again.')) }]
        : [{ text: 'Report post', onPress: () => Alert.alert('Thanks', 'Reporting opens in the next update. For now, block the person from their profile.') }]),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  const open = () => onOpen && router.push({ pathname: '/post/[id]', params: { id: post.id } });

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 12, paddingBottom: 4, gap: 10, ...(post.sponsored ? { borderWidth: 2, borderColor: colors.lime } : {}) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${post.author.name}'s profile`} onPress={() => router.push({ pathname: '/profile/[uid]', params: { uid: post.uid } })}>
          <Avatar name={post.author.name} size={42} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <T style={{ fontFamily: fonts.bold }} numberOfLines={1}>
              {post.author.name}
            </T>
            {post.author.verified && <Icon name="verified" color={colors.lime600} size={16} />}
          </View>
          <T style={{ fontSize: 12, color: colors.muted }}>
            {post.sponsored ? 'Sponsored' : `${post.author.handle ? `@${post.author.handle} · ` : ''}${ago(post.createdAt)}`}
          </T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={more} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="dots" color={colors.muted} size={20} />
        </Pressable>
      </View>

      <Pressable onPress={open} accessibilityRole={onOpen ? 'button' : undefined} style={{ gap: 10 }}>
        {post.text ? <RichText text={post.text} /> : null}
      </Pressable>
      {post.kind === 'poll' && post.poll && <Poll post={post} me={me} />}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Action icon="heart" label={String(counts.likes)} color={liked ? colors.danger : colors.muted} a11y={liked ? 'Unlike' : 'Like'} onPress={toggleLike} />
        <Action icon="comment" label={String(counts.comments)} a11y="Comments" onPress={open} />
        <Action icon="wallet" label="Tip" color={colors.lime600} a11y="Send a tip" onPress={() => Alert.alert('Tips are coming', 'Tips arrive once mobile money is connected.')} />
        <Action
          icon="share"
          label=""
          a11y="Share"
          onPress={() => Share.share({ message: `${post.author.name} on EfuChat: ${post.text || 'a poll'}` })}
        />
      </View>
    </View>
  );
}

function Action({ icon, label, color = colors.muted, a11y, onPress }: { icon: 'heart' | 'comment' | 'wallet' | 'share'; label: string; color?: string; a11y: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 4 }}>
      <Icon name={icon} color={color} size={20} />
      {label ? <T style={{ fontSize: 13, fontFamily: fonts.bold, color }}>{label}</T> : null}
    </Pressable>
  );
}
