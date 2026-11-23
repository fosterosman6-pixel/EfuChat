// Checks firestore.rules against the Firestore emulator.
// Run from the project folder:
//   npx firebase-tools emulators:exec --only firestore --project demo-efuchat "npm --prefix rules-test test"
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, updateDoc, addDoc, collection, serverTimestamp, Timestamp, arrayUnion, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';

let env;
const A = 'alice', B = 'bob', EVE = 'eve';
const phone = { [A]: '+265991111111', [B]: '+265882222222', [EVE]: '+265993333333' };
const as = (uid, extra = {}) => env.authenticatedContext(uid, { phone_number: phone[uid], ...extra }).firestore();

const profile = (name) => ({
  name, about: 'Available', photoURL: null, lang: 'ny', accountType: 'personal', verified: false, plan: 'free', plus: false,
  walletLinked: false, status: 'active', counts: { posts: 0, followers: 0, following: 0, sales: 0 }, createdAt: serverTimestamp(),
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-efuchat',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [uid, name] of [[A, 'Alice Banda'], [B, 'Bob Phiri'], [EVE, 'Eve Mwale']]) {
      await setDoc(doc(db, 'users', uid), { ...profile(name), createdAt: Timestamp.now() });
    }
    await setDoc(doc(db, 'users', EVE), { status: 'suspended' }, { merge: true });
    await setDoc(doc(db, 'chats', 'alice_bob'), { type: 'direct', members: [A, B], names: {}, unread: { [A]: 0, [B]: 0 }, updatedAt: Timestamp.now() });
    await setDoc(doc(db, 'posts', 'p1'), { uid: B, status: 'live', counts: { likes: 0 }, poll: { options: ['a', 'b'], votes: [0, 0], endsAt: Timestamp.fromMillis(Date.now() + 3600_000) } });
    await setDoc(doc(db, 'orders', 'o1'), { members: [A, B], status: 'paid' });
    await setDoc(doc(db, 'ledger', 'l1'), { members: [A], amountMWK: 100 });
  });
});

test('sign-up: own profile with default server fields only', async () => {
  const db = as('newbie', { phone_number: '+265994444444' });
  await assertSucceeds(setDoc(doc(db, 'users', 'newbie'), profile('New Person')));
  await assertFails(setDoc(doc(db, 'users', 'newbie2'), profile('Not Me')));
});

test('sign-up: cannot make yourself verified or a paid plan', async () => {
  const db = as('newbie', { phone_number: '+265994444444' });
  await assertFails(setDoc(doc(db, 'users', 'newbie'), { ...profile('Faker'), verified: true }));
  await assertFails(setDoc(doc(db, 'users', 'newbie'), { ...profile('Faker'), plan: 'pro' }));
});

test('profile edits cannot touch status or counts', async () => {
  await assertSucceeds(updateDoc(doc(as(A), 'users', A), { about: 'At work' }));
  await assertFails(updateDoc(doc(as(A), 'users', A), { status: 'active', 'counts.followers': 9999 }));
  await assertFails(updateDoc(doc(as(A), 'users', B), { about: 'hacked' }));
});

test('private account details: owner yes, others no, wallet is server only', async () => {
  await assertSucceeds(setDoc(doc(as(A), 'users', A, 'private', 'account'), { phone: phone[A], pushTokens: [], settings: {} }));
  await assertFails(getDoc(doc(as(B), 'users', A, 'private', 'account')));
  await assertFails(setDoc(doc(as(A), 'users', A, 'private', 'account'), { phone: phone[A], wallet: { network: 'airtel', msisdn: 'x' } }));
});

test('phone index: own number only, no listing', async () => {
  await assertSucceeds(setDoc(doc(as(A), 'phoneIndex', phone[A]), { uid: A }));
  await assertFails(setDoc(doc(as(A), 'phoneIndex', phone[B]), { uid: A }));
});

test('chats: members read and send, others cannot', async () => {
  await assertSucceeds(getDoc(doc(as(A), 'chats', 'alice_bob')));
  await assertFails(getDoc(doc(as(EVE), 'chats', 'alice_bob')));
  await assertSucceeds(addDoc(collection(as(A), 'chats', 'alice_bob', 'messages'), { from: A, type: 'text', text: 'Moni', createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(as(A), 'chats', 'alice_bob', 'messages'), { from: B, type: 'text', text: 'pretending', createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(as(A), 'chats', 'alice_bob', 'messages'), { from: A, type: 'payment', text: 'fake money', createdAt: serverTimestamp() }));
});

test('chats: members cannot add strangers to a direct chat', async () => {
  await assertFails(updateDoc(doc(as(A), 'chats', 'alice_bob'), { members: [A, B, EVE] }));
  await assertSucceeds(updateDoc(doc(as(A), 'chats', 'alice_bob'), { [`unread.${A}`]: 0 }));
});

test('suspended people cannot start chats or post', async () => {
  await assertFails(setDoc(doc(as(EVE), 'chats', 'eve_alice'), { type: 'direct', members: [EVE, A], names: {}, unread: {}, updatedAt: serverTimestamp() }));
  await assertFails(addDoc(collection(as(EVE), 'posts'), { uid: EVE, kind: 'post', text: 'hi', media: [], status: 'live', featured: false, counts: { likes: 0, comments: 0, reposts: 0, views: 0, tips: 0 } }));
});

test('stories: viewers can only add themselves', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'stories', 's1'), { uid: B, viewers: [], expiresAt: Timestamp.fromMillis(Date.now() + 3600_000) }));
  await assertSucceeds(updateDoc(doc(as(A), 'stories', 's1'), { viewers: arrayUnion(A) }));
  await assertFails(updateDoc(doc(as(A), 'stories', 's1'), { viewers: arrayUnion(EVE) }));
  await assertSucceeds(updateDoc(doc(as(A), 'stories', 's1'), { [`reactions.${A}`]: '🔥' }));
  await assertFails(updateDoc(doc(as(A), 'stories', 's1'), { [`reactions.${EVE}`]: '🔥' }));
  await assertFails(updateDoc(doc(as(A), 'stories', 's1'), { text: 'changed' }));
});

test('post views: I record only myself, once; only the author lists them', async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'posts', 'pv1'), { uid: B, status: 'live', text: 'hi' }));
  await assertSucceeds(setDoc(doc(as(A), 'posts', 'pv1', 'views', A), { name: 'Alice', at: serverTimestamp() }));
  await assertFails(setDoc(doc(as(A), 'posts', 'pv1', 'views', A), { name: 'Alice again', at: serverTimestamp() }));
  await assertFails(setDoc(doc(as(A), 'posts', 'pv1', 'views', EVE), { name: 'Eve', at: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(as(B), 'posts', 'pv1', 'views')));
  await assertFails(getDocs(collection(as(EVE), 'posts', 'pv1', 'views')));
});

test('posts: counts start at zero and cannot be faked', async () => {
  const good = { uid: A, kind: 'post', text: 'Moni Mangochi', media: [], hashtags: [], visibility: 'everyone', status: 'live', featured: false, counts: { likes: 0, comments: 0, reposts: 0, views: 0, tips: 0 } };
  await assertSucceeds(addDoc(collection(as(A), 'posts'), good));
  await assertFails(addDoc(collection(as(A), 'posts'), { ...good, counts: { ...good.counts, likes: 5000 } }));
  await assertFails(addDoc(collection(as(A), 'posts'), { ...good, featured: true }));
  await assertFails(updateDoc(doc(as(A), 'posts', 'p1'), { 'counts.likes': 1 }));
});

test('likes and votes: one per person, only as yourself', async () => {
  await assertSucceeds(setDoc(doc(as(A), 'posts', 'p1', 'likes', A), { createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(as(A), 'posts', 'p1', 'likes', B), { createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(as(A), 'posts', 'p1', 'votes', A), { option: 1, createdAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(A), 'posts', 'p1', 'votes', A), { option: 0 }));
});

test('money and orders are server only', async () => {
  await assertSucceeds(getDoc(doc(as(A), 'orders', 'o1')));
  await assertFails(getDoc(doc(as(EVE), 'orders', 'o1')));
  await assertFails(updateDoc(doc(as(A), 'orders', 'o1'), { status: 'completed' }));
  await assertFails(setDoc(doc(as(A), 'wallets', A), { earnedMWK: 1000000 }));
  await assertSucceeds(getDoc(doc(as(A), 'ledger', 'l1')));
  await assertFails(getDoc(doc(as(B), 'ledger', 'l1')));
  await assertFails(addDoc(collection(as(A), 'ledger'), { members: [A], amountMWK: 5 }));
});

test('staff roles: moderators hide posts, finance reads money, nobody else does', async () => {
  const mod = as('mod1', { role: 'moderator' });
  const fin = as('fin1', { role: 'finance' });
  await assertSucceeds(updateDoc(doc(mod, 'posts', 'p1'), { status: 'hidden' }));
  await assertSucceeds(getDoc(doc(fin, 'ledger', 'l1')));
  await assertFails(getDoc(doc(mod, 'ledger', 'l1')));
  await assertFails(setDoc(doc(mod, 'config', 'fees'), { marketPercent: 99 }));
  await assertSucceeds(setDoc(doc(fin, 'config', 'fees'), { marketPercent: 3 }));
  await assertFails(setDoc(doc(as(A, { role: 'owner-wannabe' }), 'config', 'pricing'), {}));
});

test('listings: sellers cannot mark sold or boost themselves', async () => {
  const listing = { sellerUid: A, title: 'Sofa', description: 'Good', priceMWK: 1000, photos: ['x'], status: 'live', views: 0, category: 'home', condition: 'used', town: 'Mangochi', matolaDelivery: true, walletPayment: true };
  await assertSucceeds(setDoc(doc(as(A), 'listings', 'l1'), listing));
  await assertFails(setDoc(doc(as(A), 'listings', 'l2'), { ...listing, boostedUntil: Timestamp.now() }));
  await assertFails(updateDoc(doc(as(A), 'listings', 'l1'), { status: 'sold' }));
  await assertFails(deleteDoc(doc(as(B), 'listings', 'l1')));
});

test('app flows: text story and new direct chat as the phase 1 app writes them', async () => {
  await assertSucceeds(addDoc(collection(as(A), 'stories'), {
    uid: A, name: 'Alice Banda', kind: 'text', text: 'Moni!', bg: '#1E3A78', visibleTo: 'everyone', viewers: [],
    createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600_000),
  }));
  await assertFails(addDoc(collection(as(A), 'stories'), {
    uid: A, name: 'Alice Banda', kind: 'text', text: 'Forever', bg: '#1E3A78', visibleTo: 'everyone', viewers: [],
    createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 3600_000),
  }));
  await assertSucceeds(setDoc(doc(as(A), 'chats', 'alice_eve'), {
    type: 'direct', members: [A, EVE], names: { [A]: 'Alice', [EVE]: 'Eve' }, unread: { [A]: 0, [EVE]: 0 }, updatedAt: serverTimestamp(),
  }));
});

test('lists: the home feed, a profile and the story ring can be loaded', async () => {
  const { query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
  const db = as(A);
  await assertSucceeds(getDocs(query(collection(db, 'posts'), where('status', '==', 'live'), orderBy('createdAt', 'desc'), limit(20))));
  await assertSucceeds(getDocs(query(collection(db, 'posts'), where('uid', '==', B), where('status', '==', 'live'))));
  await assertSucceeds(getDocs(query(collection(db, 'stories'), where('expiresAt', '>', Timestamp.now()))));
  // Hidden posts stay out of everyone else's lists.
  await assertFails(getDocs(query(collection(db, 'posts'), where('status', '==', 'hidden'))));
});

test('blocked people cannot open your post or story directly', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', B, 'blocks', A), { at: Timestamp.now() });
    await setDoc(doc(ctx.firestore(), 'stories', 's2'), { uid: B, viewers: [], expiresAt: Timestamp.fromMillis(Date.now() + 3600_000) });
  });
  await assertFails(getDoc(doc(as(A), 'posts', 'p1')));
  await assertFails(getDoc(doc(as(A), 'stories', 's2')));
});

test('phase 2 app writes: post, poll, comment, follow both sides, block', async () => {
  const { writeBatch, getCountFromServer } = await import('firebase/firestore');
  const db = as(A);
  const base = { uid: A, author: { name: 'Alice Banda', verified: false }, media: [], hashtags: ['mangochi'], visibility: 'everyone',
    counts: { likes: 0, comments: 0, reposts: 0, views: 0, tips: 0 }, status: 'live', featured: false, createdAt: serverTimestamp() };
  await assertSucceeds(addDoc(collection(db, 'posts'), { ...base, kind: 'post', text: 'Moni #Mangochi' }));
  await assertSucceeds(addDoc(collection(db, 'posts'), { ...base, kind: 'poll', text: 'Which day?', poll: { options: ['Sat', 'Sun'], votes: [0, 0], endsAt: Timestamp.fromMillis(Date.now() + 86400_000) } }));
  await assertSucceeds(addDoc(collection(db, 'posts', 'p1', 'comments'), { uid: A, name: 'Alice', text: 'Nice', likes: 0, status: 'live', createdAt: serverTimestamp() }));
  await assertSucceeds(getCountFromServer(collection(db, 'posts', 'p1', 'likes')));
  const b = writeBatch(db);
  b.set(doc(db, 'users', B, 'followers', A), { createdAt: serverTimestamp() });
  b.set(doc(db, 'users', A, 'following', B), { createdAt: serverTimestamp() });
  await assertSucceeds(b.commit());
  await assertSucceeds(setDoc(doc(db, 'users', A, 'blocks', EVE), { createdAt: serverTimestamp() }));
  // Nobody can make someone else follow them.
  await assertFails(setDoc(doc(db, 'users', A, 'followers', B), { createdAt: serverTimestamp() }));
});

test('chats: either person can look up a direct chat that does not exist yet', async () => {
  await assertSucceeds(getDoc(doc(as(A), 'chats', [A, EVE].sort().join('_'))));
  await assertFails(getDoc(doc(as(B), 'chats', [A, EVE].sort().join('_'))));
});

test('presence: only my own lastActiveAt, only server time', async () => {
  await assertSucceeds(updateDoc(doc(as(A), 'users', A), { lastActiveAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(A), 'users', A), { lastActiveAt: Timestamp.fromMillis(0) }));
  await assertFails(updateDoc(doc(as(A), 'users', B), { lastActiveAt: serverTimestamp() }));
});

test('chats: typing, pin and reactions', async () => {
  await assertSucceeds(updateDoc(doc(as(A), 'chats', 'alice_bob'), { [`typing.${A}`]: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as(A), 'chats', 'alice_bob'), { pinned: { id: 'm1', text: 'hi', from: A } }));
  const m = await addDoc(collection(as(A), 'chats', 'alice_bob', 'messages'), { from: A, type: 'text', text: 'Moni', createdAt: serverTimestamp() });
  await assertSucceeds(updateDoc(doc(as(B), 'chats', 'alice_bob', 'messages', m.id), { [`reactions.${B}`]: '👍' }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'alice_bob', 'messages', m.id), { [`reactions.${A}`]: '😂' }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'alice_bob', 'messages', m.id), { [`reactions.${B}`]: '❤️', text: 'edited' }));
  await assertFails(updateDoc(doc(as(EVE), 'chats', 'alice_bob', 'messages', m.id), { [`reactions.${EVE}`]: '👍' }));
  await assertSucceeds(addDoc(collection(as(B), 'chats', 'alice_bob', 'messages'), { from: B, type: 'text', text: 'ok', replyTo: { id: m.id, from: A, name: 'Alice', text: 'Moni' }, createdAt: serverTimestamp() }));
});

test('groups: photo, description, edit permission and mute', async () => {
  const base = { type: 'group', members: [A, B], names: {}, unread: {}, groupName: 'Crew', admins: [A], updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as(A), 'chats', 'g9'), base));
  await assertSucceeds(updateDoc(doc(as(A), 'chats', 'g9'), { description: 'Weekend plans', photoURL: 'data:image/jpeg;base64,AAAA' }));
  await assertFails(updateDoc(doc(as(A), 'chats', 'g9'), { description: 'x'.repeat(301) }));
  await assertFails(updateDoc(doc(as(A), 'chats', 'g9'), { photoURL: 'x'.repeat(100001) }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'g9'), { description: 'mine' }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'g9'), { adminsEdit: false }));
  await assertSucceeds(updateDoc(doc(as(A), 'chats', 'g9'), { adminsEdit: false }));
  await assertSucceeds(updateDoc(doc(as(B), 'chats', 'g9'), { description: 'ours', photoURL: null }));
  await assertSucceeds(updateDoc(doc(as(B), 'chats', 'g9'), { [`muted.${B}`]: true }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'g9'), { [`muted.${A}`]: true }));
});

test('groups: creator is the only admin; admins manage, members cannot', async () => {
  const base = { type: 'group', members: [A, B, EVE], names: {}, unread: {}, groupName: 'Trip', updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(as(A), 'chats', 'g0'), { ...base, admins: [A, B] }));
  await assertFails(setDoc(doc(as(A), 'chats', 'g0'), { ...base, admins: [B] }));
  await assertSucceeds(setDoc(doc(as(A), 'chats', 'g1'), { ...base, admins: [A], adminsOnly: false }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'g1'), { groupName: 'Mine now' }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'g1'), { admins: [A, B] }));
  await assertFails(updateDoc(doc(as(B), 'chats', 'g1'), { members: [A, B] }));
  await assertSucceeds(updateDoc(doc(as(A), 'chats', 'g1'), { groupName: 'Friday trip', adminsOnly: true }));
  await assertSucceeds(addDoc(collection(as(A), 'chats', 'g1', 'messages'), { from: A, type: 'text', text: 'Admins only now', createdAt: serverTimestamp() }));
  await assertFails(addDoc(collection(as(B), 'chats', 'g1', 'messages'), { from: B, type: 'text', text: 'can I?', createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as(EVE), 'chats', 'g1'), { members: [A, B] }));
  await assertSucceeds(updateDoc(doc(as(A), 'chats', 'g1'), { members: [A], admins: [A] }));
});

test('calls: ring, answer, hang up; strangers and fakes refused', async () => {
  const call = { from: A, to: B, fromName: 'Alice', toName: 'Bob', kind: 'voice', status: 'ringing', createdAt: serverTimestamp() };
  await assertFails(setDoc(doc(as(A), 'calls', 'c0'), { ...call, from: B }));
  await assertFails(setDoc(doc(as(A), 'calls', 'c0'), { ...call, status: 'accepted' }));
  await assertFails(setDoc(doc(as(A), 'calls', 'c0'), { ...call, to: EVE }));
  await assertSucceeds(setDoc(doc(as(A), 'calls', 'c1'), call));
  await assertFails(getDoc(doc(as(EVE), 'calls', 'c1')));
  await assertFails(updateDoc(doc(as(A), 'calls', 'c1'), { status: 'accepted' }));
  await assertSucceeds(updateDoc(doc(as(B), 'calls', 'c1'), { status: 'accepted', answeredAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as(B), 'calls', 'c1'), { status: 'missed' }));
  await assertSucceeds(updateDoc(doc(as(A), 'calls', 'c1'), { status: 'ended', endedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(as(A), 'calls', 'c2'), call));
  await assertSucceeds(updateDoc(doc(as(A), 'calls', 'c2'), { status: 'missed', endedAt: serverTimestamp() }));
  // the caller leaves a line in the chat; the callee cannot fake one for that call
  const line = (from, callId) => ({ from, type: 'call', text: '', call: { callId, kind: 'voice', outcome: 'missed' }, createdAt: serverTimestamp() });
  await assertSucceeds(addDoc(collection(as(A), 'chats', 'alice_bob', 'messages'), line(A, 'c2')));
  await assertFails(addDoc(collection(as(B), 'chats', 'alice_bob', 'messages'), line(B, 'c2')));
  await assertFails(addDoc(collection(as(A), 'chats', 'alice_bob', 'messages'), line(A, 'nope')));
});

test('privacy: own settings only; calls respect "nobody" and "people I chat with"', async () => {
  await assertSucceeds(updateDoc(doc(as(B), 'users', B), { privacy: { lastSeen: 'nobody', readTicks: false, calls: 'nobody' } }));
  await assertFails(updateDoc(doc(as(B), 'users', B), { privacy: { calls: 'all-my-fans' } }));
  await assertFails(updateDoc(doc(as(A), 'users', B), { privacy: { calls: 'everyone' } }));
  const call = { from: A, to: B, fromName: 'Alice', toName: 'Bob', kind: 'voice', status: 'ringing', createdAt: serverTimestamp() };
  await assertFails(setDoc(doc(as(A), 'calls', 'p1'), call));
  await assertSucceeds(updateDoc(doc(as(B), 'users', B), { privacy: { calls: 'chats' } }));
  await assertSucceeds(setDoc(doc(as(A), 'calls', 'p2'), call)); // alice_bob chat exists
  await assertSucceeds(setDoc(doc(as(B), 'handles', 'bob.banda'), { uid: B }));
  await assertFails(setDoc(doc(as(A), 'handles', 'bob.banda'), { uid: A }));
});

test('push tokens: owner writes, nobody reads', async () => {
  await assertSucceeds(setDoc(doc(as(A), 'pushTokens', A), { tokens: ['t1'], platform: 'android' }));
  await assertFails(getDoc(doc(as(A), 'pushTokens', A)));
  await assertFails(setDoc(doc(as(B), 'pushTokens', A), { tokens: ['evil'] }));
  await assertFails(setDoc(doc(as(A), 'pushTokens', A), { tokens: ['t1'], admin: true }));
});

test('photos and voice notes: members only, size-limited; profile photo size-limited', async () => {
  const m = { from: A, kind: 'image', mime: 'image/jpeg', data: 'x'.repeat(1000), createdAt: serverTimestamp() };
  const ref = await addDoc(collection(as(A), 'chats', 'alice_bob', 'media'), m);
  await assertSucceeds(getDoc(doc(as(B), 'chats', 'alice_bob', 'media', ref.id)));
  await assertFails(getDoc(doc(as(EVE), 'chats', 'alice_bob', 'media', ref.id)));
  await assertFails(addDoc(collection(as(A), 'chats', 'alice_bob', 'media'), { ...m, data: 'x'.repeat(700001) }));
  await assertFails(addDoc(collection(as(A), 'chats', 'alice_bob', 'media'), { ...m, from: B }));
  await assertFails(addDoc(collection(as(EVE), 'chats', 'alice_bob', 'media'), { ...m, from: EVE }));
  await assertSucceeds(addDoc(collection(as(A), 'chats', 'alice_bob', 'messages'), { from: A, type: 'image', text: '', media: { id: ref.id, kind: 'image', w: 10, h: 10 }, createdAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(as(A), 'users', A), { photoURL: 'data:image/jpeg;base64,' + 'x'.repeat(30000) }));
  await assertFails(updateDoc(doc(as(A), 'users', A), { photoURL: 'x'.repeat(150000) }));
});

test('market: listing photos owner-only, listings created live by the seller', async () => {
  const ph = await addDoc(collection(as(A), 'listingMedia'), { owner: A, data: 'x'.repeat(500), createdAt: serverTimestamp() });
  await assertSucceeds(getDoc(doc(as(B), 'listingMedia', ph.id)));
  await assertFails(addDoc(collection(as(A), 'listingMedia'), { owner: B, data: 'x', createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(as(B), 'listingMedia', ph.id)));
  const l = { sellerUid: A, seller: { name: 'Alice', verified: false }, title: 'Sofa', description: '', priceMWK: 220000, category: 'home', condition: 'used', town: 'Mangochi', photos: [ph.id], cover: 'data:image/jpeg;base64,x', matolaDelivery: false, walletPayment: false, status: 'live', views: 0, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(as(A), 'listings'), l);
  await assertSucceeds(getDoc(doc(as(B), 'listings', ref.id)));
  await assertFails(updateDoc(doc(as(A), 'listings', ref.id), { status: 'sold' }));
  await assertSucceeds(updateDoc(doc(as(A), 'listings', ref.id), { status: 'paused' }));
  await assertFails(updateDoc(doc(as(B), 'listings', ref.id), { priceMWK: 1 }));
  await assertSucceeds(deleteDoc(doc(as(A), 'listingMedia', ph.id)));
});
