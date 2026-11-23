import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from '@react-native-firebase/firestore';
import { db } from './firebase';
import { avatarDataUri, shrinkPhoto } from './media';
import type { UserProfile } from './types';

export type Category = 'food' | 'phones' | 'clothes' | 'home' | 'bikes' | 'other';
export type Condition = 'new' | 'like_new' | 'used';
export type Listing = {
  id: string;
  sellerUid: string;
  seller: { name: string; verified: boolean };
  title: string;
  description: string;
  priceMWK: number;
  category: Category;
  condition: Condition;
  /** listingMedia ids */
  photos: string[];
  /** small square cover as a data URI, so the grid loads in one read */
  cover?: string;
  town: string;
  matolaDelivery: boolean;
  walletPayment: boolean;
  status: 'live' | 'sold' | 'paused' | 'removed';
  views: number;
  createdAt: { toDate: () => Date } | null;
};

export const CATEGORIES: { id: Category | 'all'; label: string; icon: 'grid' | 'fish' | 'phonedev' | 'shirt' | 'sofa' | 'bike' | 'tag' }[] = [
  { id: 'all', label: 'All', icon: 'grid' },
  { id: 'food', label: 'Food', icon: 'fish' },
  { id: 'phones', label: 'Phones', icon: 'phonedev' },
  { id: 'clothes', label: 'Clothes', icon: 'shirt' },
  { id: 'home', label: 'Home', icon: 'sofa' },
  { id: 'bikes', label: 'Bikes', icon: 'bike' },
  { id: 'other', label: 'Other', icon: 'tag' },
];
export const CONDITION_LABEL: Record<Condition, string> = { new: 'New', like_new: 'Like new', used: 'Used' };
export const mwk = (n: number) => `MWK ${Math.round(n).toLocaleString('en-US')}`;

const asListing = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as Listing;

/** Live listings, newest first. Falls back to sorting on the phone while the database index is still being built. */
export function subscribeListings(category: Category | 'all', cb: (l: Listing[]) => void) {
  const base = collection(db, 'listings');
  const ordered =
    category === 'all'
      ? query(base, where('status', '==', 'live'), orderBy('createdAt', 'desc'), limit(80))
      : query(base, where('status', '==', 'live'), where('category', '==', category), orderBy('createdAt', 'desc'), limit(80));
  let fallback: (() => void) | null = null;
  const unsub = onSnapshot(
    ordered,
    (s) => cb(s.docs.map(asListing)),
    () => {
      const q = category === 'all' ? query(base, where('status', '==', 'live'), limit(150)) : query(base, where('status', '==', 'live'), where('category', '==', category), limit(150));
      fallback = onSnapshot(
        q,
        (s) => cb(s.docs.map(asListing).sort((a, b) => (b.createdAt?.toDate().getTime() ?? 0) - (a.createdAt?.toDate().getTime() ?? 0))),
        () => cb([]),
      );
    },
  );
  return () => {
    unsub();
    fallback?.();
  };
}

export function subscribeMyListings(uid: string, cb: (l: Listing[]) => void) {
  return onSnapshot(
    query(collection(db, 'listings'), where('sellerUid', '==', uid), orderBy('createdAt', 'desc'), limit(100)),
    (s) => cb(s.docs.map(asListing)),
    () => cb([]),
  );
}

export function subscribeListing(id: string, cb: (l: Listing | null) => void) {
  return onSnapshot(
    doc(db, 'listings', id),
    (s) => cb(s.exists() ? asListing(s) : null),
    () => cb(null),
  );
}

// ---------- photos (database, free plan) ----------
const photoCache = new Map<string, string>();
export async function listingPhoto(id: string) {
  const hit = photoCache.get(id);
  if (hit) return hit;
  const s = await getDoc(doc(db, 'listingMedia', id));
  const data = (s.data()?.data as string | undefined) ?? '';
  const uri = `data:image/jpeg;base64,${data}`;
  if (photoCache.size > 30) photoCache.delete(photoCache.keys().next().value as string);
  photoCache.set(id, uri);
  return uri;
}

export type NewListing = Pick<Listing, 'title' | 'description' | 'priceMWK' | 'category' | 'condition' | 'town'>;

/** Uploads the photos, then creates the listing. */
export async function createListing(me: UserProfile, input: NewListing, photoUris: string[]) {
  const ids: string[] = [];
  for (const uri of photoUris.slice(0, 6)) {
    const img = await shrinkPhoto(uri);
    const ref = await addDoc(collection(db, 'listingMedia'), { owner: me.uid, data: img.base64, createdAt: serverTimestamp() });
    ids.push(ref.id);
  }
  const cover = await avatarDataUri(photoUris[0]);
  const ref = await addDoc(collection(db, 'listings'), {
    sellerUid: me.uid,
    seller: { name: me.name, verified: !!me.verified },
    title: input.title.trim(),
    description: input.description.trim(),
    priceMWK: Math.round(input.priceMWK),
    category: input.category,
    condition: input.condition,
    town: input.town.trim(),
    photos: ids,
    cover,
    matolaDelivery: false,
    walletPayment: false,
    status: 'live',
    views: 0,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export const setListingStatus = (id: string, status: 'live' | 'paused') => updateDoc(doc(db, 'listings', id), { status });
export const updateListing = (id: string, data: Partial<Pick<Listing, 'title' | 'description' | 'priceMWK' | 'condition' | 'town'>>) => updateDoc(doc(db, 'listings', id), data);

export async function deleteListing(l: Listing) {
  await deleteDoc(doc(db, 'listings', l.id));
  await Promise.all(l.photos.map((p) => deleteDoc(doc(db, 'listingMedia', p)).catch(() => {})));
}

/** Saved items live in users/{uid}/saved/{listingId}. */
export const saveListing = (uid: string, id: string, on: boolean) =>
  on ? setDoc(doc(db, 'users', uid, 'saved', id), { kind: 'listing', at: serverTimestamp() }) : deleteDoc(doc(db, 'users', uid, 'saved', id));
export function subscribeSaved(uid: string, id: string, cb: (on: boolean) => void) {
  return onSnapshot(doc(db, 'users', uid, 'saved', id), (s) => cb(s.exists()), () => cb(false));
}
