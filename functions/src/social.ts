import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { bumpStats, db, FieldValue, getConfig, int, notify, REGION, requireActive, text, Timestamp, uidOf } from './common.js';
import { moneySecrets, startCollection, walletOf } from './payments.js';
import { C, feeFor } from './schema.js';

const at = { region: REGION };

/* ---------- people ---------- */

export const onUserCreated = onDocumentCreated({ ...at, document: 'users/{uid}' }, async () => {
  await bumpStats({ signups: 1 });
});

// The app writes users/{target}/followers/{me}. This mirrors it and keeps counts right.
export const onFollow = onDocumentCreated({ ...at, document: 'users/{target}/followers/{follower}' }, async (e) => {
  const { target, follower } = e.params;
  const batch = db.batch();
  batch.set(db.doc(`${C.following(follower)}/${target}`), { createdAt: FieldValue.serverTimestamp() });
  batch.update(db.collection(C.users).doc(target), { 'counts.followers': FieldValue.increment(1) });
  batch.update(db.collection(C.users).doc(follower), { 'counts.following': FieldValue.increment(1) });
  await batch.commit();
  const name = (await db.collection(C.users).doc(follower).get()).get('name');
  await notify(target, { type: 'follow', text: `${name} started following you`, actorUid: follower, actorName: name, targetPath: `users/${follower}` });
});

export const onUnfollow = onDocumentDeleted({ ...at, document: 'users/{target}/followers/{follower}' }, async (e) => {
  const { target, follower } = e.params;
  const batch = db.batch();
  batch.delete(db.doc(`${C.following(follower)}/${target}`));
  batch.update(db.collection(C.users).doc(target), { 'counts.followers': FieldValue.increment(-1) });
  batch.update(db.collection(C.users).doc(follower), { 'counts.following': FieldValue.increment(-1) });
  await batch.commit();
});

/* ---------- chats ---------- */

export const onMessage = onDocumentCreated({ ...at, document: 'chats/{chatId}/messages/{msgId}' }, async () => {
  await bumpStats({ messages: 1 });
});

/* ---------- posts ---------- */

export const onPostCreated = onDocumentCreated({ ...at, document: 'posts/{postId}' }, async (e) => {
  const post = e.data?.data();
  if (!post) return;
  const { rules } = await getConfig();
  const batch = db.batch();
  batch.update(db.collection(C.users).doc(post.uid), { 'counts.posts': FieldValue.increment(1) });
  for (const tag of (post.hashtags as string[]).slice(0, 10)) {
    const clean = tag.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40);
    if (clean) batch.set(db.collection(C.hashtags).doc(clean), { posts: FieldValue.increment(1), postsToday: FieldValue.increment(1) }, { merge: true });
  }
  if (post.repostOf) batch.update(db.doc(post.repostOf), { 'counts.reposts': FieldValue.increment(1) });
  // New accounts can be held for a quick review (Admin > Content > Automatic checks).
  if (rules.holdNewAccountPosts) {
    const u = await db.collection(C.users).doc(post.uid).get();
    const ageMs = Date.now() - (u.get('createdAt') as Timestamp).toMillis();
    if (ageMs < 86400_000) batch.update(e.data!.ref, { status: 'hidden' });
  }
  await batch.commit();
  await bumpStats({ posts: 1 });
});

export const onLike = onDocumentCreated({ ...at, document: 'posts/{postId}/likes/{uid}' }, async (e) => {
  const ref = db.collection(C.posts).doc(e.params.postId);
  await ref.update({ 'counts.likes': FieldValue.increment(1) });
  const post = await ref.get();
  if (post.get('uid') !== e.params.uid) {
    const name = (await db.collection(C.users).doc(e.params.uid).get()).get('name');
    await notify(post.get('uid'), { type: 'like', text: `${name} liked your post`, actorUid: e.params.uid, actorName: name, targetPath: ref.path });
  }
});

export const onUnlike = onDocumentDeleted({ ...at, document: 'posts/{postId}/likes/{uid}' }, async (e) => {
  await db.collection(C.posts).doc(e.params.postId).update({ 'counts.likes': FieldValue.increment(-1) });
});

export const onComment = onDocumentCreated({ ...at, document: 'posts/{postId}/comments/{commentId}' }, async (e) => {
  const c = e.data?.data();
  if (!c) return;
  const ref = db.collection(C.posts).doc(e.params.postId);
  await ref.update({ 'counts.comments': FieldValue.increment(1) });
  const owner = (await ref.get()).get('uid');
  if (owner !== c.uid) await notify(owner, { type: 'comment', text: `${c.name} commented: ${String(c.text).slice(0, 60)}`, actorUid: c.uid, actorName: c.name, targetPath: ref.path });
  if (c.parentId) {
    const parent = await ref.collection('comments').doc(c.parentId).get();
    const pu = parent.get('uid');
    if (pu && pu !== c.uid && pu !== owner) await notify(pu, { type: 'reply', text: `${c.name} replied to you`, actorUid: c.uid, targetPath: ref.path });
  }
});

export const onCommentDeleted = onDocumentDeleted({ ...at, document: 'posts/{postId}/comments/{commentId}' }, async (e) => {
  await db.collection(C.posts).doc(e.params.postId).update({ 'counts.comments': FieldValue.increment(-1) });
});

/** Adds a poll vote to the totals. One vote per person (the vote doc id is their uid). */
export const onVote = onDocumentCreated({ ...at, document: 'posts/{postId}/votes/{uid}' }, async (e) => {
  const option = e.data?.get('option');
  const ref = db.collection(C.posts).doc(e.params.postId);
  await db.runTransaction(async (t) => {
    const post = await t.get(ref);
    const votes = [...((post.get('poll.votes') as number[]) ?? [])];
    if (!Number.isInteger(option) || option < 0 || option >= votes.length) return;
    votes[option] += 1;
    t.update(ref, { 'poll.votes': votes });
  });
});

/* ---------- tips ---------- */

/** Tip a post or reel from your mobile money. The author gets it minus the tip fee. */
export const tipPost = onCall({ ...at, secrets: moneySecrets }, async (req) => {
  const uid = uidOf(req);
  await requireActive(uid);
  const postId = text(req.data?.postId, 'postId', 64);
  const amount = int(req.data?.amountMWK, 'amountMWK', 100, 500_000);
  const post = await db.collection(C.posts).doc(postId).get();
  if (!post.exists || post.get('status') !== 'live') throw new HttpsError('not-found', 'This post is gone.');
  if (post.get('uid') === uid) throw new HttpsError('invalid-argument', 'You cannot tip yourself.');
  await walletOf(post.get('uid'));
  const { fees } = await getConfig();
  return startCollection(uid, 'tip', amount, `posts/${postId}`, feeFor(amount, fees.tipsPercent));
});

/* ---------- cleanup ---------- */

/** Every hour: delete stories older than 24 hours. */
export const cleanStories = onSchedule({ ...at, schedule: 'every 60 minutes' }, async () => {
  const old = await db.collection(C.stories).where('expiresAt', '<', Timestamp.now()).limit(400).get();
  const batch = db.batch();
  old.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
});

/** Every night: reset "posts today" on hashtags for the trending list. */
export const resetHashtagsToday = onSchedule({ ...at, schedule: '0 0 * * *', timeZone: 'Africa/Blantyre' }, async () => {
  const tags = await db.collection(C.hashtags).where('postsToday', '>', 0).get();
  const batch = db.batch();
  tags.docs.forEach((d) => batch.update(d.ref, { postsToday: 0 }));
  await batch.commit();
});
