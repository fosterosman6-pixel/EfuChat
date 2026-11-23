import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Avatar, Card, Header, Icon, Row, T } from '../components/ui';
import { chatTitle, sendMessage, subscribeChats } from '../lib/chats';
import { useSession } from '../lib/session';
import { colors } from '../lib/theme';
import type { Chat } from '../lib/types';

/** Pick a chat to forward a message to. */
export default function Forward() {
  const { text } = useLocalSearchParams<{ text: string }>();
  const { user } = useSession();
  const [chats, setChats] = useState<Chat[]>([]);
  const me = user?.uid ?? '';

  useEffect(() => (me ? subscribeChats(me, setChats) : undefined), [me]);

  async function send(chat: Chat) {
    try {
      await sendMessage(chat, me, text ?? '', { forwarded: true });
      router.replace({ pathname: '/chat/[id]', params: { id: chat.id } });
    } catch {
      Alert.alert('Not sent', 'You may not be allowed to send in that chat.');
    }
  }

  const usable = chats.filter((c) => c.type === 'direct' || !c.adminsOnly || c.admins?.includes(me));
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface100 }}>
      <Header title="Forward to…" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
        <T style={{ paddingHorizontal: 16, paddingBottom: 10, color: colors.muted, fontSize: 13 }} numberOfLines={2}>
          {`“${text ?? ''}”`}
        </T>
        <Card>
          {usable.map((c, i) => (
            <Row
              key={c.id}
              left={<Avatar name={chatTitle(c, me)} size={42} rounded={13} />}
              title={chatTitle(c, me)}
              subtitle={c.type === 'group' ? `${c.members.length} members` : undefined}
              right={<Icon name="send" color={colors.navy} size={20} />}
              onPress={() => send(c)}
              last={i === usable.length - 1}
            />
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}
