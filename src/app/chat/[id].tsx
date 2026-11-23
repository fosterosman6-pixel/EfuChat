import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Header, Icon, IconButton, T } from '../../components/ui';
import { chatTitle, markRead, sendMessage, subscribeChat, subscribeMessages } from '../../lib/chats';
import { useLang } from '../../lib/i18n';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Chat, Message } from '../../lib/types';

const QUICK = ['Zikomo', 'Ndafika!', 'Ok'];

export default function Conversation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const me = user?.uid ?? '';

  useEffect(() => (id ? subscribeChat(id, setChat) : undefined), [id]);
  useEffect(() => (id ? subscribeMessages(id, setMsgs) : undefined), [id]);

  // Opening the chat (and each new message while it is open) clears my unread count.
  useEffect(() => {
    if (id && me && (chat?.unread?.[me] ?? 0) > 0) markRead(id, me).catch(() => {});
  }, [id, me, chat?.unread]);

  async function send(body = text) {
    if (!chat || !body.trim()) return;
    setText('');
    await sendMessage(chat, me, body);
  }

  const title = chat ? chatTitle(chat, me) : '';
  const others = chat?.members.filter((m) => m !== me) ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface100 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <IconButton name="back" label="Back to chats" onPress={() => router.back()} />
          <Avatar name={title || '?'} size={40} rounded={12} />
          <View style={{ flex: 1, marginLeft: 4 }}>
            <T style={{ color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 }} numberOfLines={1}>
              {title}
            </T>
            <T style={{ color: colors.soft, fontSize: 12 }}>{chat?.type === 'group' ? `${chat.members.length} members` : 'EfuChat'}</T>
          </View>
          <IconButton name="phone" label="Voice call (coming soon)" size={20} />
        </View>
      </Header>

      <FlatList
        inverted
        data={msgs}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 12, gap: 8 }}
        // Once the other person opens the chat their unread count drops to 0, so everything sent is read.
        renderItem={({ item }) => <Bubble msg={item} mine={item.from === me} read={others.every((o) => (chat?.unread?.[o] ?? 0) === 0)} />}
      />

      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingBottom: 8 }}>
        {QUICK.map((q) => (
          <Pressable
            key={q}
            accessibilityRole="button"
            accessibilityLabel={`Send ${q}`}
            onPress={() => send(q)}
            style={{ height: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', justifyContent: 'center' }}
          >
            <T style={{ fontSize: 13, fontFamily: fonts.bold, color: colors.navy }}>{q}</T>
          </Pressable>
        ))}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingBottom: insets.bottom + 10 }}>
        <View
          style={{
            flex: 1,
            minHeight: 48,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 16,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 14,
          }}
        >
          <TextInput
            accessibilityLabel="Message"
            value={text}
            onChangeText={setText}
            placeholder={t('message')}
            placeholderTextColor="#8A93A8"
            multiline
            style={{ flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.ink, maxHeight: 120, paddingVertical: 10 }}
          />
          <IconButton name="plus" label="Share (coming soon)" color={colors.muted} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={text.trim() ? 'Send' : 'Record voice message (coming soon)'}
          onPress={() => send()}
          style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={text.trim() ? 'send' : 'mic'} color={colors.lime} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, mine, read }: { msg: Message; mine: boolean; read: boolean }) {
  const time = msg.createdAt ? msg.createdAt.toDate().toTimeString().slice(0, 5) : '…';
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '78%',
        backgroundColor: mine ? colors.lime100 : '#FFFFFF',
        borderWidth: 1,
        borderColor: mine ? '#D5EBA0' : colors.line,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 6,
        borderRadius: 16,
        borderTopRightRadius: mine ? 4 : 16,
        borderTopLeftRadius: mine ? 16 : 4,
      }}
    >
      <T style={{ lineHeight: 21 }}>{msg.text}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }}>
        <T style={{ fontSize: 11, color: colors.muted }}>{time}</T>
        {mine && <Icon name="check" color={read ? colors.lime600 : colors.muted} size={14} />}
      </View>
    </View>
  );
}
