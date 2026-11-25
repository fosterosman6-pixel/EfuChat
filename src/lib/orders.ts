import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
import { openDirectChat, postMessage } from './chats';
import { db } from './firebase';
import type { Listing } from './market';
import type { Chat, UserProfile } from './types';

export type OrderStatus = 'new' | 'accepted' | 'declined' | 'cancelled' | 'delivered';

export type Order = {
  id: string;
  listingId: string;
  title: string;
  cover?: string;
  priceMWK: number;
  sellerUid: string;
  sellerName: string;
  buyerUid: string;
  buyerName: string;
  members: string[];
  payment: 'cod' | 'mobile';
  delivery: 'pickup' | 'matola';
  note: string;
  status: OrderStatus;
  createdAt: { toDate: () => Date } | null;
  updatedAt: { toDate: () => Date } | null;
};

export type Shop = { name: string; town: string; about: string; delivery: boolean };

export const ORDER_STATUS: Record<OrderStatus, { label: string; bg: string; fg: string }> = {
  new: { label: 'New', bg: '#FFF4D6', fg: '#8A5A00' },
  accepted: { label: 'To deliver', bg: '#EEF7D6', fg: '#4D7300' },
  delivered: { label: 'Delivered', bg: '#E8F0FB', fg: '#2F5D8A' },
  declined: { label: 'Declined', bg: '#FDECEA', fg: '#B3261E' },
  cancelled: { label: 'Cancelled', bg: '#EEF1F6', fg: '#5B667A' },
};

const asOrder = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as Order;
const newest = (a: Order, b: Order) => (b.createdAt?.toDate().getTime() ?? Infinity) - (a.createdAt?.toDate().getTime() ?? Infinity);

/** Orders where I'm the seller ("received") or the buyer ("placed"), newest first. */
export function subscribeOrders(uid: string, role: 'seller' | 'buyer', cb: (orders: Order[]) => void) {
  return onSnapshot(
    query(collection(db, 'orders'), where(role === 'seller' ? 'sellerUid' : 'buyerUid', '==', uid)),
    (s) => cb(s.docs.map(asOrder).sort(newest)),
    () => cb([]),
  );
}

export function subscribeOrder(id: string, cb: (o: Order | null) => void) {
  return onSnapshot(doc(db, 'orders', id), (s) => cb(s.exists() ? asOrder(s) : null), () => cb(null));
}

/** Tells the other person in our direct chat, so they see it and get a notification. */
async function tell(me: UserProfile, otherUid: string, otherName: string, text: string) {
  try {
    const chatId = await openDirectChat(me, { uid: otherUid, name: otherName });
    const snap = await getDoc(doc(db, 'chats', chatId));
    if (snap.exists()) await postMessage({ id: snap.id, ...snap.data() } as Chat, me.uid, { type: 'text', text }, text.slice(0, 120));
  } catch {}
}

/** Buy now: creates an order for a live listing and tells the seller. */
export async function placeOrder(me: UserProfile, l: Listing, opts: { delivery: Order['delivery']; note: string }) {
  const ref = await addDoc(collection(db, 'orders'), {
    listingId: l.id,
    title: l.title.slice(0, 80),
    ...(l.cover ? { cover: l.cover } : {}),
    priceMWK: l.priceMWK,
    sellerUid: l.sellerUid,
    sellerName: l.seller.name.slice(0, 60),
    buyerUid: me.uid,
    buyerName: me.name.slice(0, 60),
    members: [me.uid, l.sellerUid],
    payment: 'cod',
    delivery: opts.delivery,
    note: opts.note.trim().slice(0, 300),
    status: 'new',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await tell(me, l.sellerUid, l.seller.name, `🛍️ New order: ${l.title}${opts.note.trim() ? `\n“${opts.note.trim().slice(0, 200)}”` : ''}\nOpen Me → My shop and orders to accept it.`);
  return ref.id;
}

const MESSAGES: Partial<Record<OrderStatus, (o: Order) => string>> = {
  accepted: (o) => `✅ Order accepted: ${o.title}. ${o.delivery === 'matola' ? 'I will send it by matola.' : 'You can pick it up.'}`,
  declined: (o) => `❌ Sorry, I can't sell ${o.title} right now.`,
  delivered: (o) => `📦 ${o.title} is marked as delivered. Thank you!`,
  cancelled: (o) => `Order cancelled: ${o.title}.`,
};

/** Moves an order on, and tells the other person in chat. Delivered also marks the listing as sold. */
export async function setOrderStatus(me: UserProfile, o: Order, status: OrderStatus) {
  await updateDoc(doc(db, 'orders', o.id), { status, updatedAt: serverTimestamp() });
  if (status === 'delivered') await updateDoc(doc(db, 'listings', o.listingId), { status: 'sold' }).catch(() => {});
  const other = me.uid === o.sellerUid ? { uid: o.buyerUid, name: o.buyerName } : { uid: o.sellerUid, name: o.sellerName };
  const msg = MESSAGES[status]?.(o);
  if (msg) await tell(me, other.uid, other.name, msg);
}

export async function getShop(uid: string): Promise<Shop | null> {
  const s = await getDoc(doc(db, 'shops', uid));
  return s.exists() ? (s.data() as Shop) : null;
}

export function saveShop(uid: string, shop: Shop) {
  return setDoc(doc(db, 'shops', uid), {
    name: shop.name.trim().slice(0, 60),
    town: shop.town.trim().slice(0, 60),
    about: shop.about.trim().slice(0, 300),
    delivery: !!shop.delivery,
    updatedAt: serverTimestamp(),
  });
}
