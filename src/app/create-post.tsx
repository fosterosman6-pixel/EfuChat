import { dialog } from '../components/Dialog';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Header, Icon, T, ScaledTextInput } from '../components/ui';
import type { IconName } from '../lib/icons';
import { createPost, hashtagsIn } from '../lib/posts';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';

const MAX = 2000;

export default function CreatePost() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [poll, setPoll] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const pollOk = !poll || poll.filter((o) => o.trim()).length >= 2;
  const canPost = !busy && pollOk && (text.trim().length > 0 || (poll?.filter((o) => o.trim()).length ?? 0) >= 2);

  async function post() {
    if (!profile || !canPost) return;
    setBusy(true);
    try {
      await createPost(profile, text, poll ?? undefined);
      router.back();
    } catch {
      dialog('Could not post', 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const tags = hashtagsIn(text);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior="padding">
      <Header
        title="New post"
        onBack={() => router.back()}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPost }}
            onPress={post}
            disabled={!canPost}
            style={{ height: 40, paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.lime, justifyContent: 'center', marginRight: 6, opacity: canPost ? 1 : 0.5 }}
          >
            <T style={{ color: colors.navy, fontFamily: fonts.extrabold }}>{busy ? 'Posting…' : 'Post'}</T>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Avatar name={profile?.name ?? 'Me'} size={44} />
          <View style={{ gap: 4 }}>
            <T style={{ fontFamily: fonts.bold }}>{profile?.name}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.navy, borderRadius: 999, paddingHorizontal: 10, height: 26, alignSelf: 'flex-start' }}>
              <Icon name="globe" color={colors.navy} size={14} />
              <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.navy }}>Everyone</T>
            </View>
          </View>
        </View>

        <ScaledTextInput
          accessibilityLabel="What's happening?"
          value={text}
          onChangeText={setText}
          placeholder={poll ? 'Ask a question…' : "What's happening in Mangochi?"}
          placeholderTextColor="#8A93A8"
          multiline
          autoFocus
          maxLength={MAX}
          style={{ fontFamily: fonts.regular, fontSize: 20, lineHeight: 28, color: colors.ink, minHeight: 110, textAlignVertical: 'top' }}
        />
        {tags.length > 0 && <T style={{ fontSize: 13, color: colors.lime600, fontFamily: fonts.bold }}>{tags.map((t) => `#${t}`).join('  ')}</T>}

        {poll && (
          <View style={{ gap: 8 }}>
            {poll.map((o, i) => (
              <ScaledTextInput
                key={i}
                accessibilityLabel={`Poll option ${i + 1}`}
                value={o}
                onChangeText={(v) => setPoll(poll.map((x, j) => (j === i ? v : x)))}
                placeholder={`Option ${i + 1}`}
                placeholderTextColor="#8A93A8"
                maxLength={40}
                style={{ height: 46, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface100, borderRadius: 12, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 15, color: colors.ink }}
              />
            ))}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              {poll.length < 4 && (
                <Pressable accessibilityRole="button" onPress={() => setPoll([...poll, ''])}>
                  <T style={{ color: colors.lime600, fontFamily: fonts.bold }}>+ Add option</T>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={() => setPoll(null)}>
                <T style={{ color: colors.danger, fontFamily: fonts.bold }}>Remove poll</T>
              </Pressable>
            </View>
            <T style={{ fontSize: 12, color: colors.muted }}>Polls stay open for 24 hours.</T>
          </View>
        )}

        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Opt icon="poll" label="Poll" onPress={() => setPoll(poll ?? ['', ''])} />
          <Opt icon="image" label="Photo" soon />
          <Opt icon="reels" label="Video" soon />
          <Opt icon="pin" label="Location" soon />
          <Opt icon="wallet" label="Sell item" soon tint />
        </View>
        <T style={{ fontSize: 12, color: colors.muted, paddingBottom: insets.bottom }}>
          {text.length}/{MAX} · Posts follow the EfuChat community rules. Photos and videos arrive with the storage upgrade.
        </T>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Opt({ icon, label, onPress, soon, tint }: { icon: IconName; label: string; onPress?: () => void; soon?: boolean; tint?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!soon }}
      accessibilityHint={soon ? 'Coming soon' : undefined}
      onPress={soon ? () => dialog(`${label} is coming`, 'This arrives in a later update.') : onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: tint ? colors.lime100 : colors.surface100, opacity: soon ? 0.6 : 1 }}
    >
      <Icon name={icon} color={tint ? colors.lime600 : colors.navy} size={18} />
      <T style={{ fontSize: 13, fontFamily: fonts.bold }}>{label}</T>
    </Pressable>
  );
}
