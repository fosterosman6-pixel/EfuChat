import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { PostCard } from '../components/PostCard';
import { Avatar, Card, Header, Icon, IconButton, Row, SectionLabel, T, ScaledTextInput } from '../components/ui';
import { findUserByPhone } from '../lib/chats';
import { db } from '../lib/firebase';
import { COUNTRIES, toE164 } from '../lib/phone';
import { postsWithTag } from '../lib/posts';
import { colors, fonts } from '../lib/theme';
import type { Post, UserProfile } from '../lib/types';

type Trend = { tag: string; postsToday: number; posts: number };

/** Search by #tag, @handle or phone number, plus trending hashtags. */
export default function Explore() {
  const params = useLocalSearchParams<{ tag?: string }>();
  const [q, setQ] = useState(params.tag ? `#${params.tag}` : '');
  const [trends, setTrends] = useState<Trend[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [person, setPerson] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'hashtags'), where('state', 'in', ['normal', 'pinned']), orderBy('postsToday', 'desc'), limit(10)))
      .then((s) => setTrends(s.docs.map((d) => ({ tag: d.id, postsToday: d.data().postsToday ?? 0, posts: d.data().posts ?? 0 }))))
      .catch(() => setTrends([]));
  }, []);

  useEffect(() => {
    if (params.tag) search(`#${params.tag}`);
  }, [params.tag]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(raw = q) {
    const s = raw.trim();
    setPosts(null);
    setPerson(null);
    setStatus('');
    if (!s) return;
    try {
      if (s.startsWith('#')) {
        const found = await postsWithTag(s.slice(1).toLowerCase());
        setPosts(found);
        if (!found.length) setStatus(`No posts with ${s} yet.`);
      } else if (s.startsWith('@')) {
        const h = await getDoc(doc(db, 'handles', s.slice(1).toLowerCase()));
        const uid = h.exists() ? (h.data()?.uid as string) : null;
        const u = uid ? await getDoc(doc(db, 'users', uid)) : null;
        if (u?.exists()) setPerson({ uid: u.id, ...u.data() } as UserProfile);
        else setStatus(`Nobody is called ${s} yet.`);
      } else {
        const phone = s.startsWith('+') ? '+' + s.replace(/\D/g, '') : toE164(COUNTRIES[0].dial, s);
        const u = await findUserByPhone(phone);
        if (u) setPerson(u);
        else setStatus('Type #tag, @name or a phone number.');
      }
    } catch {
      setStatus('Search failed. Check your connection.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Header>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <IconButton name="back" label="Back" onPress={() => router.back()} />
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy700, borderRadius: 14, paddingHorizontal: 12, height: 46, marginRight: 4 }}>
            <Icon name="search" color={colors.soft} size={18} />
            <ScaledTextInput
              accessibilityLabel="Search"
              value={q}
              onChangeText={setQ}
              onSubmitEditing={() => search()}
              returnKeyType="search"
              autoCapitalize="none"
              placeholder="Search #tags, @people, numbers"
              placeholderTextColor={colors.soft}
              style={{ flex: 1, color: '#FFFFFF', fontSize: 15, fontFamily: fonts.regular }}
            />
          </View>
        </View>
      </Header>

      <FlatList
        data={posts ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingBottom: 24, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            {person && (
              <>
                <SectionLabel>PEOPLE</SectionLabel>
                <Card>
                  <Row
                    left={<Avatar name={person.name} />}
                    title={person.name}
                    subtitle={person.about}
                    right={<Icon name="chev" color={colors.muted} size={18} />}
                    onPress={() => router.push({ pathname: '/profile/[uid]', params: { uid: person.uid } })}
                    last
                  />
                </Card>
              </>
            )}
            {status ? <T style={{ color: colors.muted, paddingHorizontal: 16, paddingTop: 12 }}>{status}</T> : null}
            {!posts && !person && (
              <>
                <SectionLabel>TRENDING</SectionLabel>
                {trends.length ? (
                  <Card>
                    {trends.map((t, i) => (
                      <Row
                        key={t.tag}
                        left={<T style={{ width: 28, textAlign: 'center', fontFamily: fonts.extrabold, color: colors.muted }}>{i + 1}</T>}
                        title={`#${t.tag}`}
                        subtitle={`${t.postsToday} posts today`}
                        onPress={() => {
                          setQ(`#${t.tag}`);
                          search(`#${t.tag}`);
                        }}
                        last={i === trends.length - 1}
                      />
                    ))}
                  </Card>
                ) : (
                  <T style={{ color: colors.muted, paddingHorizontal: 16, lineHeight: 21 }}>
                    Trending hashtags appear here once people start posting with #tags.
                  </T>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={{ paddingHorizontal: 12 }}>
            <PostCard post={item} />
          </Pressable>
        )}
      />
    </View>
  );
}
