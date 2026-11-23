// Checks firestore.rules against the Firestore emulator.
// Run from the project folder:
//   npx firebase-tools emulators:exec --only firestore --project demo-efuchat "npm --prefix rules-test test"
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, addDoc, collection, serverTimestamp, Timestamp, arrayUnion, deleteDoc } from 'firebase/firestore';
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
