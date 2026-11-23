import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, T } from '../components/ui';
import { useSession } from '../lib/session';
import { postTextStory, STORY_BACKGROUNDS, storyTextColor } from '../lib/stories';
import { colors, fonts } from '../lib/theme';

export default function NewStory() {
  const { profile } = useSession();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [bg, setBg] = useState<string>(STORY_BACKGROUNDS[0]);
  const [busy, setBusy] = useState(false);
  const fg = storyTextColor(bg);

  async function post() {
    if (!profile || !text.trim()) return;
    setBusy(true);
    try {
      await postTextStory(profile, text, bg);
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
        <IconButton name="close" label="Discard story" color={fg} onPress={() => router.back()} />
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
        <TextInput
          accessibilityLabel="Story text"
          value={text}
          onChangeText={setText}
          placeholder="Type a status"
          placeholderTextColor={fg === '#FFFFFF' ? 'rgba(255,255,255,0.6)' : 'rgba(10,34,83,0.5)'}
          multiline
          autoFocus
          maxLength={280}
          style={{ color: fg, fontSize: 32, lineHeight: 42, fontFamily: fonts.extrabold, textAlign: 'center' }}
        />
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, paddingBottom: 16 }}>
        {STORY_BACKGROUNDS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityLabel={`Background ${c}`}
            accessibilityState={{ checked: c === bg }}
            onPress={() => setBg(c)}
            style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: c, borderWidth: c === bg ? 3 : 2, borderColor: c === bg ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: insets.bottom + 14, backgroundColor: 'rgba(0,0,0,0.18)' }}>
        <View style={{ flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="lock" color="#FFFFFF" size={16} />
          <T style={{ color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 14 }}>Seen by: people on EfuChat</T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post story"
          onPress={post}
          disabled={busy || !text.trim()}
          style={{ width: 54, height: 54, borderRadius: 999, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', opacity: text.trim() ? 1 : 0.6 }}
        >
          {busy ? <ActivityIndicator color={colors.navy} /> : <Icon name="send" color={colors.navy} size={24} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
