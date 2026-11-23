import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
import { db } from './firebase';
import type { Story, UserProfile } from './types';

export const STORY_BACKGROUNDS = ['#1E3A78', '#A6D41C', '#4D7300', '#0F1B38', '#9A5B00'] as const;

/** Text on lime needs navy; every other background takes white. */
export function storyTextColor(bg: string) {
  return bg === '#A6D41C' ? '#0A2253' : '#FFFFFF';
}

export type StoryGroup = { uid: string; name: string; stories: Story[]; seen: boolean };

/**
 * Live stories from the last 24 hours, grouped by person.
 * A real app would limit this to the viewer's contacts; that rule lives in firestore.rules.
 */
export function subscribeStories(me: string, cb: (groups: StoryGroup[]) => void) {
  const q = query(collection(db, 'stories'), where('expiresAt', '>', Timestamp.now()), orderBy('expiresAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const byUser = new Map<string, StoryGroup>();
      snap.docs.forEach((d) => {
        const s = { id: d.id, ...d.data() } as Story;
        const g = byUser.get(s.uid) ?? { uid: s.uid, name: s.name, stories: [], seen: true };
        g.stories.push(s);
        if (!(s.viewers ?? []).includes(me)) g.seen = false;
        byUser.set(s.uid, g);
      });
      const groups = [...byUser.values()];
      groups.forEach((g) => g.stories.sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)));
      // Own stories first, then unseen, then seen.
      groups.sort((a, b) => Number(b.uid === me) - Number(a.uid === me) || Number(a.seen) - Number(b.seen));
      cb(groups);
    },
    () => cb([]),
  );
}

export async function postTextStory(me: UserProfile, text: string, bg: string) {
  const body = text.trim();
  if (!body) return;
  await addDoc(collection(db, 'stories'), {
    uid: me.uid,
    name: me.name,
    kind: 'text',
    text: body,
    bg,
    visibleTo: 'everyone',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    viewers: [],
  });
}

export async function markStorySeen(storyId: string, uid: string) {
  await updateDoc(doc(db, 'stories', storyId), { viewers: arrayUnion(uid) });
}
