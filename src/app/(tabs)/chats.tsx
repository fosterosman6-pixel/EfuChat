import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRefresh } from '../../lib/useRefresh';
import { Wordmark } from '../../components/Logo';
import { StoriesRow } from '../../components/StoriesRow';
import { Avatar, Chip, Header, Icon, IconButton, T } from '../../components/ui';
import { chatTitle, shortTime, subscribeChats, whoIsTyping } from '../../lib/chats';
import { useLang } from '../../lib/i18n';
import { isOnline } from '../../lib/presence';
import { canSeePresence, ticksOn } from '../../lib/profile';
import { usePeople } from '../../lib/usePeople';
import { useSession } from '../../lib/session';
import { colors, fonts } from '../../lib/theme';
import type { Chat, UserProfile } from '../../lib/types';

type Filter = 'all' | 'unread' | 'groups' | 'people';

export default function Chats() {
  const { t } = useLang();
  const { user, profile } = useSession();
  const [chats, setChats] = useState<Chat[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loadError, setLoadError] = useState('');

  const { key, refreshing, onRefresh } = useRefresh();
  useEffect(() => {
    if (!user) return;
    setLoadError('');
    return subscribeChats(user.uid, (c) => {
      setChats(c);
      setLoadError('');
    }, setLoadError);
  }, [user, key]);

  const shown = useMemo(() => {
    if (!user) return [];
    if (filter === 'unread') return chats.filter((c) => (c.unread?.[user.uid] ?? 0) > 0);
    if (filter === 'groups') return chats.filter((c) => c.type === 'group');
    if (filter === 'people') return chats.filter((c) => c.type !== 'group');
    return chats;
  }, [chats, filter, user]);

  const firstName = profile?.name.split(' ')[0] ?? '';
  const me = user?.uid ?? '';
  const otherOf = (c: Chat) => c.members.find((m) => m !== me) ?? '';
  const people = usePeople(chats.filter((c) => c.type !== 'group').map(otherOf));
  const unreadCount = chats.filter((c) => (c.unread?.[me] ?? 0) > 0).length;

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 8 }}>
          <View style={{ flex: 1 }}>
            <T style={{ color: colors.soft, fontSize: 13 }}>
              {t(new Date().getHours() < 12 ? 'greeting' : new Date().getHours() < 17 ? 'greetingAfternoon' : 'greetingEvening')}, {firstName}
            </T>
            <Wordmark size={22} />
          </View>
          <IconButton name="search" label="Search chats and people" onPress={() => router.push('/new-chat')} />
          <IconButton name="plus" label={t('newChat')} onPress={() => router.push('/new-chat')} />
        </View>
        <StoriesRow />
      </Header>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, padding: 16, paddingBottom: 8 }}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label={unreadCount ? `Unread · ${unreadCount}` : 'Unread'} active={filter === 'unread'} onPress={() => setFilter('unread')} />
        <Chip label="Groups" active={filter === 'groups'} onPress={() => setFilter('groups')} />
        <Chip label="People" active={filter === 'people'} onPress={() => setFilter('people')} />
      </ScrollView>

      <FlatList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.navy} colors={[colors.navy]} />}
        data={shown}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, paddingBottom: 16 }}
        ListEmptyComponent={<T style={{ textAlign: 'center', color: loadError ? colors.danger : colors.muted, marginTop: 40, paddingHorizontal: 24 }}>{loadError ? `Chats could not load: ${loadError}. Pull down to try again.` : t('noChats')}</T>}
        renderItem={({ item }) => <ChatCard chat={item} me={me} other={item.type === 'group' ? undefined : people[otherOf(item)]} mine={profile} />}
      />
    </View>
  );
}

function ChatCard({ chat, me, other, mine }: { chat: Chat; me: string; other?: UserProfile; mine?: UserProfile | null }) {
  const group = chat.type === 'group';
  const title = chatTitle(chat, me);
  const unread = chat.unread?.[me] ?? 0;
  const last = chat.lastMessage;
  const typing = whoIsTyping(chat, me);
  const muted = !!chat.muted?.[me];
  const online = !group && !!other && canSeePresence(other, mine, true) && isOnline(other);
  const fromMe = !!last && last.from === me;
  const read = fromMe && (group ? chat.members.every((m) => m === me || (chat.unread?.[m] ?? 0) === 0) : (chat.unread?.[chat.members.find((m) => m !== me) ?? ''] ?? 0) === 0 && ticksOn(other, mine));
  const sender = last && group && !fromMe ? `${(chat.names[last.from] ?? 'Someone').split(' ')[0]}: ` : '';
  const text = typing.length ? (group ? `${typing[0].split(' ')[0]} is typing…` : 'typing…') : last ? last.text : 'Say hello';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group ? 'Group ' : ''}${title}. ${unread ? `${unread} unread. ` : ''}${sender}${text}`}
      onPress={() => router.push({ pathname: '/chat/[id]', params: { id: chat.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: pressed ? colors.lime100 : '#FFFFFF', borderRadius: 18 })}
    >
      {group ? (
        <View>
          {chat.photoURL ? (
            <Avatar name={title} size={56} rounded={18} uri={chat.photoURL} />
          ) : (
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="group" color={colors.lime} size={28} />
            </View>
          )}
          <View style={{ position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.lime, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="group" color={colors.navy} size={12} />
          </View>
        </View>
      ) : (
        <View>
          <Avatar name={title} size={56} rounded={999} uri={other?.photoURL} />
          {online && <View style={{ position: 'absolute', right: 1, bottom: 1, width: 16, height: 16, borderRadius: 8, backgroundColor: '#22C55E', borderWidth: 3, borderColor: '#FFFFFF' }} />}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <T style={{ fontFamily: fonts.bold, fontSize: 16, flexShrink: 1 }} numberOfLines={1}>
              {title}
            </T>
            {group && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.surface100 }}>
                <T style={{ fontSize: 11, fontFamily: fonts.extrabold, color: colors.muted }}>Group</T>
              </View>
            )}
          </View>
          <T style={{ fontSize: 12, color: unread ? colors.lime600 : colors.muted, fontFamily: unread ? fonts.extrabold : fonts.regular }}>{shortTime(chat.updatedAt ?? null)}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T style={{ flex: 1, fontSize: 14, color: typing.length ? colors.lime600 : colors.muted, fontFamily: typing.length ? fonts.bold : fonts.regular }} numberOfLines={1}>
            {!typing.length && fromMe && <T style={{ fontSize: 14, fontFamily: fonts.extrabold, color: read ? colors.lime600 : colors.muted }}>{read ? '✓✓ ' : '✓ '}</T>}
            {!typing.length && !!sender && <T style={{ fontSize: 14, fontFamily: fonts.bold, color: colors.ink }}>{sender}</T>}
            {text}
          </T>
          {muted && <Icon name="bell" color={colors.muted} size={16} />}
          {unread > 0 && (
            <View style={{ minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 999, backgroundColor: muted ? colors.soft : colors.lime, alignItems: 'center', justifyContent: 'center' }}>
              <T style={{ fontSize: 12, fontFamily: fonts.extrabold, color: colors.navy }}>{unread > 99 ? '99+' : String(unread)}</T>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
