import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, writeBatch } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Avatar, Chip, Header, IconButton, T, Tile } from '../components/ui';
import { db } from '../lib/firebase';
import type { IconName } from '../lib/icons';
import { ago } from '../lib/posts';
import { useSession } from '../lib/session';
import { colors } from '../lib/theme';
import type { AppNotification } from '../lib/types';

const ICON: Record<AppNotification['type'], { icon: IconName; bg: string; fg: string }> = {
  like: { icon: 'heart', bg: colors.danger, fg: '#FFFFFF' },
  comment: { icon: 'comment', bg: colors.navy700, fg: '#FFFFFF' },
  reply: { icon: 'comment', bg: colors.navy700, fg: '#FFFFFF' },
  follow: { icon: 'person', bg: colors.navy, fg: colors.lime },
  repost: { icon: 'repost', bg: colors.lime600, fg: '#FFFFFF' },
  tip: { icon: 'wallet', bg: colors.lime, fg: colors.navy },
  order: { icon: 'bag', bg: colors.lime, fg: colors.navy },
  delivery: { icon: 'truck', bg: colors.lime, fg: colors.navy },
  system: { icon: 'shield', bg: colors.navy, fg: colors.lime },
};

type Filter = 'All' | 'Mentions' | 'Money';

export default function Notifications() {
  const { user } = useSession();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [filter, setFilter] = useState<Filter>('All');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'notifications'), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(q, (s) => setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification)), () => setItems([]));
  }, [user]);

  const shown = (items ?? []).filter((n) =>
    filter === 'All' ? true : filter === 'Money' ? ['tip', 'order'].includes(n.type) : ['comment', 'reply'].includes(n.type),
  );

  async function markAll() {
    if (!user || !items) return;
    const batch = writeBatch(db);
    items.filter((n) => !n.read).slice(0, 400).forEach((n) => batch.update(doc(db, 'users', user.uid, 'notifications', n.id), { read: true }));
    await batch.commit().catch(() => {});
  }

  function open(n: AppNotification) {
    if (user && !n.read) updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), { read: true }).catch(() => {});
    const [col, id] = (n.targetPath ?? '').split('/');
    if (col === 'posts' && id) router.push({ pathname: '/post/[id]', params: { id } });
    else if (col === 'users' && id) router.push({ pathname: '/profile/[uid]', params: { uid: id } });
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="Notifications" onBack={() => router.back()} right={<IconButton name="check" label="Mark all as read" size={20} onPress={markAll} />} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 6 }}>
        {(['All', 'Mentions', 'Money'] as Filter[]).map((f) => (
          <Chip key={f} label={f} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        ListEmptyComponent={
          items === null ? undefined : (
            <T style={{ textAlign: 'center', color: colors.muted, paddingTop: 40, paddingHorizontal: 24, lineHeight: 21 }}>
              Nothing yet. Likes, comments, new followers and tips show up here.
            </T>
          )
        }
        renderItem={({ item }) => {
          const ic = ICON[item.type] ?? ICON.system;
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => open(item)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: item.read ? '#FFFFFF' : colors.lime100 }}
            >
              <View>
                {item.actorName ? <Avatar name={item.actorName} size={44} /> : <Tile name={ic.icon} bg={ic.bg} fg={ic.fg} size={44} />}
                {item.actorName && (
                  <View style={{ position: 'absolute', right: -9, bottom: -9, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 999 }}>
                    <Tile name={ic.icon} bg={ic.bg} fg={ic.fg} size={22} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 14, lineHeight: 20 }}>{item.text}</T>
                <T style={{ fontSize: 12, color: colors.muted }}>{ago(item.createdAt)}</T>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
