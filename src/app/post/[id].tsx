import { dialog } from '../../components/Dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PostCard } from '../../components/PostCard';
import { Avatar, Header, Icon, T, ScaledTextInput } from '../../components/ui';
import { addComment, ago, deleteComment, subscribeComments, subscribePost } from '../../lib/posts';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Comment, Post } from '../../lib/types';

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null | undefined>(undefined);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  useEffect(() => (id ? subscribePost(id, setPost) : undefined), [id]);
  useEffect(() => (id ? subscribeComments(id, setComments) : undefined), [id]);

  // Replies sit under the comment they answer.
  const ordered = comments
    .filter((c) => !c.parentId)
    .flatMap((c) => [c, ...comments.filter((r) => r.parentId === c.id)]);

  async function send() {
    if (!profile || !id || !text.trim()) return;
    const body = text;
    setText('');
    try {
      await addComment(id, profile, body, replyTo?.id);
      setReplyTo(null);
    } catch {
      setText(body);
      dialog('Could not post your comment', 'Check your connection and try again.');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface100 }} behavior="padding">
      <Header title="Post" onBack={() => router.back()} />
      {post === null ? (
        <T style={{ padding: 24, textAlign: 'center', color: colors.muted }}>This post was removed.</T>
      ) : (
        <FlatList
          data={post ? ordered : []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 12, gap: 12 }}
          ListHeaderComponent={
            post ? (
              <View style={{ gap: 12 }}>
                <PostCard post={post} onOpen={false} />
                <T style={{ fontFamily: fonts.bold, fontSize: 13, paddingHorizontal: 4 }}>
                  {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                </T>
              </View>
            ) : undefined
          }
          ListEmptyComponent={post ? <T style={{ color: colors.muted, paddingHorizontal: 4 }}>Be the first to comment.</T> : undefined}
          renderItem={({ item }) => (
            <CommentRow
              c={item}
              mine={item.uid === profile?.uid}
              postOwner={post?.uid === profile?.uid}
              onReply={() => setReplyTo(item.parentId ? comments.find((x) => x.id === item.parentId) ?? item : item)}
              onDelete={() => id && deleteComment(id, item.id).catch(() => {})}
            />
          )}
        />
      )}

      {post && (
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 10, gap: 6, backgroundColor: colors.surface100 }}>
          {replyTo && (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T style={{ fontSize: 12, color: colors.muted }}>Replying to {replyTo.name}</T>
              <Icon name="close" color={colors.muted} size={14} />
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar name={profile?.name ?? 'Me'} size={40} rounded={12} />
            <ScaledTextInput
              accessibilityLabel="Write a comment"
              value={text}
              onChangeText={setText}
              placeholder="Write a comment..."
              placeholderTextColor="#8A93A8"
              multiline
              maxLength={1000}
              style={{
                flex: 1,
                minHeight: 46,
                maxHeight: 110,
                borderWidth: 1,
                borderColor: colors.line,
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 11,
                backgroundColor: '#FFFFFF',
                fontFamily: fonts.regular,
                fontSize: 15,
                color: colors.ink,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              onPress={send}
              disabled={!text.trim()}
              style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.5 }}
            >
              <Icon name="send" color={colors.navy} size={20} />
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function CommentRow({ c, mine, postOwner, onReply, onDelete }: { c: Comment; mine: boolean; postOwner: boolean; onReply: () => void; onDelete: () => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingLeft: c.parentId ? 44 : 0 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${c.name}'s profile`} onPress={() => router.push({ pathname: '/profile/[uid]', params: { uid: c.uid } })}>
        <Avatar name={c.name} size={34} rounded={11} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderTopLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8 }}>
          <T style={{ fontSize: 13, fontFamily: fonts.bold }}>{c.name}</T>
          <T style={{ fontSize: 14, lineHeight: 20 }}>{c.text}</T>
        </View>
        <View style={{ flexDirection: 'row', gap: 16, paddingLeft: 4 }}>
          <T style={{ fontSize: 12, color: colors.muted }}>{ago(c.createdAt)}</T>
          <Pressable accessibilityRole="button" onPress={onReply} hitSlop={8}>
            <T style={{ fontSize: 12, color: colors.muted, fontFamily: fonts.semibold }}>Reply</T>
          </Pressable>
          {(mine || postOwner) && (
            <Pressable accessibilityRole="button" onPress={onDelete} hitSlop={8}>
              <T style={{ fontSize: 12, color: colors.danger, fontFamily: fonts.semibold }}>Delete</T>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}
