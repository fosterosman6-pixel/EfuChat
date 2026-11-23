import { doc, getDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '../../components/Dialog';
import { useStoryGroups } from '../../components/StoriesRow';
import { Avatar, Icon, IconButton, ScaledTextInput, T } from '../../components/ui';
import { shortTime } from '../../lib/chats';
import { db } from '../../lib/firebase';
import { useSession } from '../../lib/session';
import { deleteStory, markStorySeen, replyToStory, STORY_REACTIONS, storyTextColor } from '../../lib/stories';
import { colors, fonts } from '../../lib/theme';
import type { UserProfile } from '../../lib/types';

const DURATION = 6000;

/** Full-screen story viewer: tap left for back, right for next, hold to pause; reply and react on others' stories. */
export default function StoryViewer() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { user, profile } = useSession();
  const insets = useSafeAreaInsets();
  const groups = useStoryGroups();
  const group = useMemo(() => groups.find((g) => g.uid === uid), [groups, uid]);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [sent, setSent] = useState('');
  const [progress, setProgress] = useState(0);
  const [photo, setPhoto] = useState<string | undefined>();
  const [people, setPeople] = useState<Record<string, UserProfile>>({});
  const started = useRef(Date.now());
  const paused = held || typing || viewersOpen;

  const story = group?.stories[index];
  const mine = !!group && group.uid === user?.uid;

  useEffect(() => {
    if (!uid) return;
    if (mine) return setPhoto(profile?.photoURL ?? undefined);
    getDoc(doc(db, 'users', uid)).then((s) => setPhoto((s.data()?.photoURL as string | undefined) ?? undefined), () => {});
  }, [uid, mine, profile?.photoURL]);

  useEffect(() => {
    if (story && user && story.uid !== user.uid && !(story.viewers ?? []).includes(user.uid)) {
      markStorySeen(story.id, user.uid).catch(() => {});
    }
    started.current = Date.now();
    setProgress(0);
    setSent('');
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

  // Names and photos of the people who saw my story.
  const viewerKey = mine ? (story?.viewers ?? []).join(',') : '';
  useEffect(() => {
    if (!viewerKey) return;
    const missing = viewerKey.split(',').filter((v) => v && !people[v]);
    if (!missing.length) return;
    Promise.all(missing.map((v) => getDoc(doc(db, 'users', v)).catch(() => null))).then((snaps) => {
      const add: Record<string, UserProfile> = {};
      for (const s of snaps) if (s?.exists()) add[s.id] = { uid: s.id, ...s.data() } as UserProfile;
      setPeople((p) => ({ ...p, ...add }));
    });
  }, [viewerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (!group) return;
    if (index < group.stories.length - 1) setIndex(index + 1);
    else router.back();
  }
  function prev() {
    if (index > 0) setIndex(index - 1);
    else {
      started.current = Date.now();
      setProgress(0);
    }
  }

  async function send(text: string, reaction?: string) {
    if (!profile || !story) return;
    try {
      await replyToStory(profile, story, text, reaction);
      setReply('');
      setSent(reaction ? `${reaction} sent` : 'Reply sent');
      Keyboard.dismiss();
      setTyping(false);
    } catch {
      dialog('Not sent', 'Check your connection and try again.');
    }
  }

  function remove() {
    if (!story) return;
    dialog('Delete this story?', 'It will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setViewersOpen(false);
          deleteStory(story.id).then(
            () => (group && group.stories.length > 1 ? setIndex(Math.max(0, index - 1)) : router.back()),
            () => dialog('Could not delete', 'Try again.'),
          );
        },
      },
    ]);
  }

  if (!group || !story) {
    return <View style={{ flex: 1, backgroundColor: '#1E3A78' }} />;
  }
  const fg = storyTextColor(story.bg);
  const viewers = story.viewers ?? [];
  const reactions = story.reactions ?? {};
  const myReaction = user ? reactions[user.uid] : undefined;

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: story.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 10 }}>
        {group.stories.map((s, i) => (
          <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
            <View style={{ height: 3, width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%`, backgroundColor: '#FFFFFF' }} />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingRight: 6 }}>
        <IconButton name="back" label="Close story" color={fg} onPress={() => router.back()} />
        <Avatar name={group.name} size={42} rounded={999} uri={photo} />
        <View style={{ flex: 1 }}>
          <T style={{ color: fg, fontFamily: fonts.bold, fontSize: 16 }}>{mine ? 'You' : group.name}</T>
          <T style={{ color: fg, fontSize: 13, opacity: 0.8 }}>{shortTime(story.createdAt)}</T>
        </View>
        <IconButton name={held ? 'play' : 'pause'} label={held ? 'Play' : 'Pause'} color={fg} onPress={() => setHeld(!held)} />
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Pressable accessibilityLabel="Previous story" style={{ flex: 1 }} onPress={prev} onLongPress={() => setHeld(true)} onPressOut={() => held && setHeld(false)} />
        <Pressable accessibilityLabel="Next story" style={{ flex: 2 }} onPress={next} onLongPress={() => setHeld(true)} onPressOut={() => held && setHeld(false)} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 32 }}>
          <T style={{ color: fg, fontSize: 30, lineHeight: 40, fontFamily: fonts.extrabold, textAlign: 'center' }}>{story.text}</T>
        </View>
      </View>

      {mine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Seen by ${viewers.length}. Show who saw it`}
          onPress={() => setViewersOpen(true)}
          style={{ alignSelf: 'center', alignItems: 'center', gap: 2, paddingBottom: insets.bottom + 18, paddingTop: 8, paddingHorizontal: 24 }}
        >
          <Icon name="arrowup" color={fg} size={20} />
          <T style={{ color: fg, fontFamily: fonts.bold, fontSize: 16 }}>{`Seen by ${viewers.length}${Object.keys(reactions).length ? ` · ${Object.values(reactions).slice(0, 3).join('')}` : ''}`}</T>
        </Pressable>
      ) : (
        <View style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 14, gap: 10 }}>
          {!!sent && <T style={{ color: fg, textAlign: 'center', fontFamily: fonts.bold }}>{sent}</T>}
          {!typing && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {STORY_REACTIONS.map((e) => (
                <Pressable
                  key={e}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${e}`}
                  onPress={() => send(e, e)}
                  style={{ width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: myReaction === e ? colors.lime : 'rgba(255,255,255,0.16)' }}
                >
                  <T style={{ fontSize: 24 }}>{e}</T>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ScaledTextInput
              accessibilityLabel={`Reply to ${group.name}`}
              value={reply}
              onChangeText={setReply}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              placeholder={`Reply to ${group.name.split(' ')[0]}…`}
              placeholderTextColor="rgba(255,255,255,0.75)"
              maxLength={1000}
              style={{ flex: 1, minHeight: 52, borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)', paddingHorizontal: 18, color: '#FFFFFF', fontSize: 15 }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send reply"
              disabled={!reply.trim()}
              onPress={() => send(reply)}
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', opacity: reply.trim() ? 1 : 0.6 }}
            >
              <Icon name="send" color={colors.navy} size={22} />
            </Pressable>
          </View>
        </View>
      )}

      <Modal visible={viewersOpen} transparent animationType="slide" onRequestClose={() => setViewersOpen(false)}>
        <Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={() => setViewersOpen(false)} />
        <View style={{ maxHeight: '60%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: 16, paddingBottom: insets.bottom + 16 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 999, backgroundColor: colors.line, marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <T style={{ fontFamily: fonts.extrabold, fontSize: 19 }}>{`Seen by ${viewers.length}`}</T>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete story" onPress={remove} style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.dangerTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" color={colors.danger} size={22} />
            </Pressable>
          </View>
          <ScrollView>
            {!viewers.length && <T style={{ color: colors.muted, paddingVertical: 16 }}>Nobody has seen it yet.</T>}
            {viewers.map((v) => (
              <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.surface100 }}>
                <Avatar name={people[v]?.name ?? '?'} uri={people[v]?.photoURL} size={46} rounded={999} />
                <T style={{ flex: 1, fontFamily: fonts.bold, fontSize: 16 }} numberOfLines={1}>
                  {people[v]?.name ?? 'EfuChat user'}
                </T>
                {!!reactions[v] && <T style={{ fontSize: 24 }}>{reactions[v]}</T>}
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
