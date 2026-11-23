import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useLang } from '../lib/i18n';
import { useSession } from '../lib/session';
import { StoryGroup, subscribeStories } from '../lib/stories';
import { usePeople } from '../lib/usePeople';
import { MyStoryRing, StoryRing } from './StoryRing';

export function useStoryGroups() {
  const { user } = useSession();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  useEffect(() => (user ? subscribeStories(user.uid, setGroups) : undefined), [user]);
  return groups;
}

/** "Your story" (with my photo) plus a ring per person with live stories. */
export function StoriesRow() {
  const { t } = useLang();
  const { user, profile } = useSession();
  const groups = useStoryGroups();
  const mine = groups.find((g) => g.uid === user?.uid);
  const others = groups.filter((g) => g.uid !== user?.uid);
  const people = usePeople(others.map((g) => g.uid));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 8, paddingTop: 6 }}>
      <MyStoryRing
        label={t('yourStory')}
        name={profile?.name ?? 'Me'}
        uri={profile?.photoURL}
        hasStories={!!mine}
        onView={() => user && router.push({ pathname: '/story/[uid]', params: { uid: user.uid } })}
        onAdd={() => router.push('/new-story')}
      />
      {others.map((g) => (
        <StoryRing
          key={g.uid}
          name={g.name}
          uri={people[g.uid]?.photoURL}
          label={g.name.split(' ')[0]}
          seen={g.seen}
          onPress={() => router.push({ pathname: '/story/[uid]', params: { uid: g.uid } })}
        />
      ))}
    </ScrollView>
  );
}
