import { getAuth } from '@react-native-firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from '@react-native-firebase/firestore';
import Constants from 'expo-constants';
import { postMessage } from './chats';
import { db } from './firebase';
import type { Chat } from './types';

/**
 * Send money with Airtel Money / TNM Mpamba. There is no EfuChat balance: the server charges the
 * sender's mobile money and then pays the receiver's mobile money number straight away.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { callTokenUrl?: string };
const BASE = (extra.callTokenUrl ?? '').replace(/\/token$/, '');

export type PayStatus = 'charging' | 'paying' | 'paid' | 'failed' | 'payout_failed';
export type Payment = {
  id: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  amount: number;
  note?: string;
  fromOperator?: 'airtel' | 'tnm';
  status: PayStatus;
  createdAt: { toDate: () => Date } | null;
};
export type Payout = { mobile: string; operator: 'airtel' | 'tnm' };

export const mk = (n: number) => `MK ${Math.round(n).toLocaleString('en-US')}`;

/** Malawi numbers: 099/098/097 Airtel Money, 088/089/085 TNM Mpamba. */
export function localNumber(m: string) {
  const d = m.replace(/\D/g, '');
  return d.startsWith('265') ? `0${d.slice(3)}` : d.startsWith('0') ? d : d ? `0${d}` : '';
}
export function operatorOf(m: string): Payout['operator'] | null {
  const n = localNumber(m);
  if (/^0(99|98|97|96|95)\d{7}$/.test(n)) return 'airtel';
  if (/^0(88|89|87|86|85)\d{7}$/.test(n)) return 'tnm';
  return null;
}
export const OPERATOR_NAME = { airtel: 'Airtel Money', tnm: 'TNM Mpamba' } as const;

async function call<T>(path: string, body: object): Promise<T> {
  const user = getAuth().currentUser;
  if (!user || !BASE) throw new Error('Not available');
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) {
    const e = new Error(json.message || (json.error === 'not_ready' ? 'Send money is being set up. Try again soon.' : 'Payment service is not available right now.'));
    (e as Error & { code?: string }).code = json.error;
    throw e;
  }
  return json;
}

export function startPayment(p: { to: string; amount: number; fromMobile: string; note?: string; chatId?: string }) {
  return call<{ id: string; status: PayStatus }>('/pay/start', p);
}
export function checkPayment(id: string) {
  return call<{ id: string; status: PayStatus }>('/pay/status', { id });
}

/** My own mobile money number for receiving money (only I can see it). */
export async function getPayout(uid: string): Promise<Payout | null> {
  const s = await getDoc(doc(db, 'payouts', uid));
  return s.exists() ? (s.data() as Payout) : null;
}
export function savePayout(uid: string, mobile: string) {
  const n = localNumber(mobile);
  const operator = operatorOf(n);
  if (!operator) throw new Error('Use an Airtel Money (099…) or TNM Mpamba (088…) number.');
  return setDoc(doc(db, 'payouts', uid), { mobile: n, operator, updatedAt: serverTimestamp() });
}

/** Money I sent and received, newest first. */
export function subscribePayments(uid: string, cb: (p: Payment[]) => void) {
  let sent: Payment[] = [];
  let got: Payment[] = [];
  const emit = () =>
    cb([...sent, ...got].sort((a, b) => (b.createdAt?.toDate().getTime() ?? 0) - (a.createdAt?.toDate().getTime() ?? 0)));
  const as = (d: { id: string; data: () => unknown }) => ({ id: d.id, ...(d.data() as object) }) as Payment;
  const a = onSnapshot(query(collection(db, 'payments'), where('from', '==', uid)), (s) => ((sent = s.docs.map(as)), emit()), () => emit());
  const b = onSnapshot(query(collection(db, 'payments'), where('to', '==', uid)), (s) => ((got = s.docs.map(as)), emit()), () => emit());
  return () => {
    a();
    b();
  };
}

/** The "You sent MK …" card in the chat, once the money is on its way. */
export async function postMoneyMessage(chat: Chat, from: string, p: { id: string; amount: number; note?: string }) {
  await postMessage(chat, from, { type: 'money', text: (p.note ?? '').slice(0, 120), money: { paymentId: p.id, amount: p.amount } }, `💸 ${mk(p.amount)}`);
}
