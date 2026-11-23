import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useLang } from '../lib/i18n';
import { useSession } from '../lib/session';
import { StoryGroup, subscribeStories } from '../lib/stories';
import { AddStoryRing, StoryRing } from './StoryRing';

export function useStoryGroups() {
  const { user } = useSession();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  useEffect(() => (user ? subscribeStories(user.uid, setGroups) : undefined), [user]);
  return groups;
}

/** "Your story" plus a ring per person with live stories. */
export function StoriesRow() {
  const { t } = useLang();
  const { user } = useSession();
  const groups = useStoryGroups();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 8 }}>
      <AddStoryRing label={t('yourStory')} onPress={() => router.push('/new-story')} />
      {groups.map((g) => (
        <StoryRing
          key={g.uid}
          name={g.name}
          label={g.uid === user?.uid ? 'You' : g.name.split(' ')[0]}
          seen={g.seen}
          onPress={() => router.push({ pathname: '/story/[uid]', params: { uid: g.uid } })}
        />
      ))}
    </ScrollView>
  );
}
