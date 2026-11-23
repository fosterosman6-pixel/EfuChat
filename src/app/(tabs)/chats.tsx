import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRefresh } from '../../lib/useRefresh';
import { Wordmark } from '../../components/Logo';
import { StoriesRow } from '../../components/StoriesRow';
import { Avatar, Chip, Header, Icon, IconButton, T } from '../../components/ui';
import { chatTitle, shortTime, subscribeChats, whoIsTyping } from '../../lib/chats';
import { useLang } from '../../lib/i18n';
import { usePrefs } from '../../lib/prefs';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Chat } from '../../lib/types';

type Filter = 'all' | 'unread' | 'groups';

export default function Chats() {
  const { t } = useLang();
  const { user, profile } = useSession();
  const { dataSaver, setDataSaver } = usePrefs();
  const [chats, setChats] = useState<Chat[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  const { key, refreshing, onRefresh } = useRefresh();
  useEffect(() => (user ? subscribeChats(user.uid, setChats) : undefined), [user, key]);

  const shown = useMemo(() => {
    if (!user) return [];
    if (filter === 'unread') return chats.filter((c) => (c.unread?.[user.uid] ?? 0) > 0);
    if (filter === 'groups') return chats.filter((c) => c.type === 'group');
    return chats;
  }, [chats, filter, user]);

  const firstName = profile?.name.split(' ')[0] ?? '';

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          <View style={{ flex: 1 }}>
            <T style={{ color: colors.soft, fontSize: 13 }}>
              {t('greeting')}, {firstName}
            </T>
            <Wordmark size={22} />
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: dataSaver }}
            accessibilityLabel={t('dataSaver')}
            onPress={() => setDataSaver(!dataSaver)}
            style={{
              height: 32,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: dataSaver ? colors.lime : colors.soft,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Icon name="shield" color={dataSaver ? colors.lime : colors.soft} size={14} />
            <T style={{ fontSize: 12, fontFamily: fonts.bold, color: dataSaver ? colors.lime : colors.soft }}>{t('dataSaver')}</T>
          </Pressable>
          <IconButton name="plus" label={t('newChat')} onPress={() => router.push('/new-chat')} />
        </View>
        <StoriesRow />
      </Header>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, padding: 16, paddingBottom: 8 }}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Unread" active={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label="Groups" active={filter === 'groups'} onPress={() => setFilter('groups')} />
      </ScrollView>

      <FlatList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        data={shown}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 16 }}
        ListEmptyComponent={<T style={{ textAlign: 'center', color: colors.muted, marginTop: 40 }}>{t('noChats')}</T>}
        renderItem={({ item }) => <ChatCard chat={item} me={user?.uid ?? ''} />}
      />
    </View>
  );
}

function ChatCard({ chat, me }: { chat: Chat; me: string }) {
  const title = chatTitle(chat, me);
  const unread = chat.unread?.[me] ?? 0;
  const last = chat.lastMessage;
  const typing = whoIsTyping(chat, me);
  const sender = last && chat.type === 'group' && last.from !== me ? `${(chat.names[last.from] ?? '').split(' ')[0]}: ` : '';
  const preview = typing.length
    ? chat.type === 'group' ? `${typing[0].split(' ')[0]} is typing…` : 'typing…'
    : last ? (last.from === me ? `You: ${last.text}` : sender + last.text) : 'Say hello';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${unread ? `${unread} unread. ` : ''}${preview}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: chat.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        backgroundColor: pressed ? colors.lime100 : '#FFFFFF',
        borderRadius: 16,
      })}
    >
      <Avatar name={title} size={48} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <T style={{ fontFamily: fonts.bold, flexShrink: 1 }} numberOfLines={1}>
            {title}
          </T>
          <T style={{ fontSize: 12, color: unread ? colors.lime600 : colors.muted, fontFamily: unread ? fonts.bold : fonts.regular }}>
            {shortTime(chat.updatedAt ?? null)}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T style={{ flex: 1, fontSize: 13, color: typing.length ? colors.lime600 : colors.muted, fontFamily: typing.length ? fonts.semibold : fonts.regular }} numberOfLines={1}>
            {preview}
          </T>
          {unread > 0 && (
            <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 999, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 12, fontFamily: fonts.bold, color: colors.navy }}>{unread}</T>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
