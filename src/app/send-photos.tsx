import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconButton, T, ScaledTextInput } from '../components/ui';
import { subscribeChat } from '../lib/chats';
import { sendPhoto } from '../lib/media';
import { useSession } from '../lib/session';
import { colors, fonts } from '../lib/theme';
import type { Chat } from '../lib/types';

/** Preview up to 4 photos with a caption before sending. */
export default function SendPhotos() {
  const { chatId, uris, to } = useLocalSearchParams<{ chatId: string; uris: string; to?: string }>();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const list = useMemo<string[]>(() => {
    try {
      return (JSON.parse(uris ?? '[]') as string[]).slice(0, 4);
    } catch {
      return [];
    }
  }, [uris]);
  const [photos, setPhotos] = useState(list);
  const [sel, setSel] = useState(0);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => (chatId ? subscribeChat(chatId, setChat) : undefined), [chatId]);

  async function send() {
    if (!chat || !user || !photos.length) return;
    setSending(true);
    try {
      for (let i = 0; i < photos.length; i++) await sendPhoto(chat, user.uid, photos[i], i === 0 ? caption : '');
      router.back();
    } catch (e) {
      Alert.alert('Not sent', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  const current = photos[Math.min(sel, photos.length - 1)];
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 6, paddingHorizontal: 4, paddingBottom: 6 }}>
        <IconButton name="close" label="Cancel" onPress={() => router.back()} />
        <T style={{ flex: 1, color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 }} numberOfLines={1}>
          {to ? `To ${to}` : 'Send photo'}
        </T>
        {photos.length > 1 && (
          <IconButton
            name="trash"
            label="Remove this photo"
            onPress={() => {
              const next = photos.filter((_, i) => i !== sel);
              if (!next.length) return router.back();
              setPhotos(next);
              setSel(Math.max(0, sel - 1));
            }}
          />
        )}
      </View>
      <View style={{ flex: 1 }}>{current && <Image source={{ uri: current }} style={{ flex: 1 }} resizeMode="contain" />}</View>
      {photos.length > 1 && (
        <ScrollView horizontal contentContainerStyle={{ gap: 8, padding: 10 }} style={{ flexGrow: 0 }}>
          {photos.map((u, i) => (
            <Pressable key={u} accessibilityLabel={`Photo ${i + 1}`} onPress={() => setSel(i)}>
              <Image source={{ uri: u }} style={{ width: 54, height: 54, borderRadius: 10, borderWidth: 2, borderColor: i === sel ? colors.lime : 'transparent' }} />
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 6 }}>
        <Icon name="data" color={colors.lime} size={16} />
        <T style={{ color: colors.soft, fontSize: 12 }}>Sent smaller to save data · about 150–250 KB each</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: insets.bottom + 12 }}>
        <ScaledTextInput
          accessibilityLabel="Caption"
          value={caption}
          onChangeText={(v) => setCaption(v.slice(0, 1000))}
          placeholder="Add a caption…"
          placeholderTextColor="#8A93A8"
          multiline
          style={{ flex: 1, minHeight: 50, maxHeight: 110, borderRadius: 18, backgroundColor: '#1C1F27', color: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: fonts.regular }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Send ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
          onPress={send}
          disabled={sending || !chat}
          style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', opacity: chat ? 1 : 0.5 }}
        >
          {sending ? <ActivityIndicator color={colors.navy} /> : <Icon name="send" color={colors.navy} size={24} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
