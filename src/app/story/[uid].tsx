import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStoryGroups } from '../../components/StoriesRow';
import { Avatar, IconButton, T } from '../../components/ui';
import { shortTime } from '../../lib/chats';
import { useSession } from '../../lib/session';
import { markStorySeen, storyTextColor } from '../../lib/stories';
import { fonts } from '../../lib/theme';

const DURATION = 5000;

/** Full-screen story viewer: tap right for next, left for back. */
export default function StoryViewer() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const groups = useStoryGroups();
  const group = useMemo(() => groups.find((g) => g.uid === uid), [groups, uid]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const started = useRef(Date.now());

  const story = group?.stories[index];

  useEffect(() => {
    if (story && user && story.uid !== user.uid && !(story.viewers ?? []).includes(user.uid)) {
      markStorySeen(story.id, user.uid).catch(() => {});
    }
    started.current = Date.now();
    setProgress(0);
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!story || paused) return;
    started.current = Date.now() - progress * DURATION;
    const id = setInterval(() => {
      const p = (Date.now() - started.current) / DURATION;
      if (p >= 1) next();
      else setProgress(p);
    }, 50);
    return () => clearInterval(id);
  }, [story?.id, paused]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (!group) return;
    if (index < group.stories.length - 1) setIndex(index + 1);
    else router.back();
  }
  function prev() {
    if (index > 0) setIndex(index - 1);
  }

  if (!group || !story) {
    return <View style={{ flex: 1, backgroundColor: '#1E3A78' }} />;
  }
  const fg = storyTextColor(story.bg);

  return (
    <View style={{ flex: 1, backgroundColor: story.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 10 }}>
        {group.stories.map((s, i) => (
          <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
            <View style={{ height: 3, width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%`, backgroundColor: '#FFFFFF' }} />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingRight: 6 }}>
        <IconButton name="back" label="Close story" color={fg} onPress={() => router.back()} />
        <Avatar name={group.name} size={38} rounded={999} />
        <View style={{ flex: 1 }}>
          <T style={{ color: fg, fontFamily: fonts.bold }}>{group.uid === user?.uid ? 'You' : group.name}</T>
          <T style={{ color: fg, fontSize: 12, opacity: 0.8 }}>{shortTime(story.createdAt)}</T>
        </View>
        <IconButton name={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} color={fg} size={20} onPress={() => setPaused(!paused)} />
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Pressable accessibilityLabel="Previous" style={{ flex: 1 }} onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
        <Pressable accessibilityLabel="Next" style={{ flex: 2 }} onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} />
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, justifyContent: 'center', paddingHorizontal: 32 }}>
          <T style={{ color: fg, fontSize: 30, lineHeight: 40, fontFamily: fonts.extrabold, textAlign: 'center' }}>{story.text}</T>
        </View>
      </View>

      {group.uid === user?.uid && (
        <T style={{ color: fg, textAlign: 'center', paddingBottom: insets.bottom + 18, fontFamily: fonts.semibold }}>
          Seen by {story.viewers?.length ?? 0}
        </T>
      )}
      {group.uid !== user?.uid && <View style={{ height: insets.bottom + 18 }} />}
    </View>
  );
}
