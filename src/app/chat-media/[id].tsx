import { collection, getDocs, limit, orderBy, query } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Image, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VoiceContent } from '../../components/MediaBubble';
import { Chip, Header, T } from '../../components/ui';
import { db } from '../../lib/firebase';
import { usePhoto } from '../../lib/media';
import { colors } from '../../lib/theme';
import type { Message } from '../../lib/types';

/** Photos and voice notes shared in a chat (the latest 500 messages). */
export default function ChatMedia() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [tab, setTab] = useState<'image' | 'voice'>('image');

  useEffect(() => {
    if (!id) return;
    getDocs(query(collection(db, 'chats', id, 'messages'), orderBy('createdAt', 'desc'), limit(500)))
      .then((s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Message).filter((m) => !m.deleted && m.media)))
      .catch(() => setMsgs([]));
  }, [id]);

  const shown = (msgs ?? []).filter((m) => m.media?.kind === tab);
  const size = Math.floor((width - 24 - 8) / 3);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Photos and voice notes" onBack={() => router.back()} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
        <Chip label={`Photos · ${(msgs ?? []).filter((m) => m.media?.kind === 'image').length}`} active={tab === 'image'} onPress={() => setTab('image')} />
        <Chip label={`Voice notes · ${(msgs ?? []).filter((m) => m.media?.kind === 'voice').length}`} active={tab === 'voice'} onPress={() => setTab('voice')} />
      </View>
      {msgs === null ? (
        <T style={{ padding: 16, color: colors.muted }}>Loading…</T>
      ) : !shown.length ? (
        <T style={{ padding: 16, color: colors.muted }}>{tab === 'image' ? 'No photos yet.' : 'No voice notes yet.'}</T>
      ) : tab === 'image' ? (
        <FlatList
          key="grid"
          data={shown}
          numColumns={3}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 16, gap: 4 }}
          columnWrapperStyle={{ gap: 4 }}
          renderItem={({ item }) => <Thumb chatId={id!} msg={item} size={size} />}
        />
      ) : (
        <FlatList
          key="list"
          data={shown}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 16, gap: 8 }}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, gap: 6 }}>
              <VoiceContent chatId={id!} media={item.media!} mine={false} />
              <T style={{ fontSize: 12, color: colors.muted }}>{item.createdAt ? item.createdAt.toDate().toLocaleString() : ''}</T>
            </View>
          )}
        />
      )}
    </View>
  );
}

function Thumb({ chatId, msg, size }: { chatId: string; msg: Message; size: number }) {
  const uri = usePhoto(chatId, msg.media);
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={msg.text ? `Photo: ${msg.text}` : 'Photo'}
      onPress={() => router.push({ pathname: '/photo', params: { chatId, mediaId: msg.media!.id, caption: msg.text ?? '', from: '', time: msg.createdAt ? msg.createdAt.toDate().toTimeString().slice(0, 5) : '' } })}
      style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.line }}
    >
      <Image source={{ uri: uri ?? msg.media?.thumb }} style={{ width: '100%', height: '100%' }} blurRadius={uri ? 0 : 8} />
    </Pressable>
  );
}
