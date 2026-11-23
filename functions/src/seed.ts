/**
 * Fills a database with starter settings and sample data for testing.
 *
 *   Emulator:  FIRESTORE_EMULATOR_HOST=localhost:8080 npm run seed
 *   Real project (settings only, no sample people):  SEED_CONFIG_ONLY=true npm run seed
 *
 * Refuses to write sample people to a real project.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { C, DEFAULT_FEES, DEFAULT_PRICING, DEFAULT_RULES } from './schema.js';

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-efuchat' });
const db = getFirestore();
const now = Timestamp.now();
const ago = (h: number) => Timestamp.fromMillis(Date.now() - h * 3600_000);

const people = [
  { uid: 'u_chikondi', name: 'Chikondi Banda', phone: '+265998765432', town: 'Mangochi', type: 'personal' },
  { uid: 'u_grace', name: 'Grace Chirwa', phone: '+265882341122', town: 'Mangochi', type: 'business' },
  { uid: 'u_thandiwe', name: 'Thandiwe Phiri', phone: '+265991122334', town: 'Mangochi', type: 'creator' },
  { uid: 'u_yusuf', name: 'Yusuf Kalonga', phone: '+265993216543', town: 'Namwera', type: 'personal' },
] as const;

async function main() {
  const batch = db.batch();
  batch.set(db.collection(C.config).doc('pricing'), DEFAULT_PRICING);
  batch.set(db.collection(C.config).doc('fees'), DEFAULT_FEES);
  batch.set(db.collection(C.config).doc('rules'), DEFAULT_RULES);

  if (process.env.SEED_CONFIG_ONLY === 'true') {
    await batch.commit();
    console.log('Settings written.');
    return;
  }
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Sample data is for the emulator only. Set FIRESTORE_EMULATOR_HOST, or SEED_CONFIG_ONLY=true.');
  }

  for (const p of people) {
    batch.set(db.collection(C.users).doc(p.uid), {
      name: p.name, about: 'Available', photoURL: null, town: p.town, lang: 'ny', accountType: p.type,
      verified: p.type !== 'personal', plan: p.type === 'business' ? 'shop' : 'free', plus: false,
      walletLinked: true, status: 'active', counts: { posts: 0, followers: 0, following: 0, sales: 0 }, createdAt: ago(24 * 30),
    });
    const network = /^\+2658/.test(p.phone) ? 'tnm' : 'airtel';
    batch.set(db.doc(`${C.userPrivate(p.uid)}/account`), {
      phone: p.phone, birthYear: 1995, pushTokens: [],
      wallet: { network, msisdn: p.phone, linkedAt: now },
      settings: { dataSaver: true, readReceipts: true, lastSeen: 'contacts', storiesVisibleTo: 'everyone', moneyFrom: 'contacts' },
    });
    batch.set(db.collection(C.phoneIndex).doc(p.phone), { uid: p.uid });
    batch.set(db.collection(C.wallets).doc(p.uid), { network, heldMWK: 0, earnedMWK: 0, updatedAt: now });
  }

  const chatId = ['u_chikondi', 'u_yusuf'].sort().join('_');
  batch.set(db.collection(C.chats).doc(chatId), {
    type: 'direct', members: ['u_chikondi', 'u_yusuf'], names: { u_chikondi: 'Chikondi Banda', u_yusuf: 'Yusuf Kalonga' },
    unread: { u_chikondi: 1, u_yusuf: 0 }, updatedAt: ago(1), lastMessage: { text: 'Ndafika! I am at the gate now', from: 'u_yusuf', at: ago(1) },
  });
  [
    ['u_chikondi', 'Moni! Are you coming to the market today?', 3],
    ['u_yusuf', 'Yes, leaving the house now', 2],
    ['u_yusuf', 'Ndafika! I am at the gate now', 1],
  ].forEach(([from, text, h], i) =>
    batch.set(db.collection(C.messages(chatId)).doc(`m${i}`), { from, type: 'text', text, createdAt: ago(h as number), readBy: [from] }),
  );

  batch.set(db.collection(C.posts).doc('p_sunset'), {
    uid: 'u_thandiwe', author: { name: 'Thandiwe Phiri', handle: 'thandiwe.cooks', verified: true }, kind: 'post',
    text: 'Fishing boats coming in at sunset. Chambo for dinner tonight #Mangochi #LakeMalawi', media: [],
    hashtags: ['mangochi', 'lakemalawi'], town: 'Mangochi', visibility: 'everyone',
    counts: { likes: 0, comments: 0, reposts: 0, views: 0, tips: 0 }, status: 'live', featured: false, createdAt: ago(2),
  });
  batch.set(db.collection(C.posts).doc('p_poll'), {
    uid: 'u_grace', author: { name: 'Grace Chirwa', verified: true }, kind: 'poll', text: 'Which market day is best for buying fish?',
    media: [], poll: { options: ['Saturday', 'Wednesday', 'Sunday'], votes: [0, 0, 0], endsAt: Timestamp.fromMillis(Date.now() + 6 * 3600_000) },
    hashtags: [], visibility: 'everyone', counts: { likes: 0, comments: 0, reposts: 0, views: 0, tips: 0 }, status: 'live', featured: false, createdAt: ago(6),
  });

  batch.set(db.collection(C.listings).doc('l_chambo'), {
    sellerUid: 'u_grace', seller: { name: 'Grace Chirwa', verified: true, rating: 4.8 }, title: 'Fresh chambo, 5 kg',
    description: 'Caught this morning on the lake. Cleaned and packed on ice.', priceMWK: 25000, category: 'food', condition: 'new',
    photos: ['listings/u_grace/chambo.jpg'], town: 'Mangochi', matolaDelivery: true, walletPayment: true, status: 'live', views: 0, createdAt: ago(2),
  });

  batch.set(db.collection(C.channels).doc('c_mangochi'), {
    name: 'Mangochi Community', about: 'Local news and notices for Mangochi.', photoURL: null, category: 'local',
    ownerUid: 'u_chikondi', admins: ['u_chikondi'], verified: true, followers: 0, createdAt: ago(24 * 60),
  });
  batch.set(db.collection(C.channelPosts('c_mangochi')).doc('cp1'), {
    text: 'Market clean-up this Saturday at 6:00. Bring a broom, everyone welcome.', media: [], reactions: {}, views: 0, createdAt: ago(5),
  });

  await batch.commit();
  console.log('Settings and sample data written.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
