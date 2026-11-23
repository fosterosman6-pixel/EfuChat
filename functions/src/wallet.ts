import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, getConfig, int, REGION, requireActive, Timestamp, uidOf } from './common.js';
import { C, Network } from './schema.js';

/**
 * Links Airtel Money or TNM Mpamba. The number must be the one the person
 * signed in with, so nobody can link someone else's wallet.
 * Airtel Malawi numbers start 099 / 098 / 097; TNM numbers start 088 / 089 / 087.
 */
export const linkWallet = onCall({ region: REGION }, async (req) => {
  const uid = uidOf(req);
  await requireActive(uid);
  const phone = req.auth?.token.phone_number as string | undefined;
  if (!phone?.startsWith('+265')) throw new HttpsError('failed-precondition', 'Mobile money works with Malawi numbers only for now.');
  const birthYear = int(req.data?.birthYear, 'birthYear', 1900, new Date().getFullYear());
  const { rules } = await getConfig();
  if (new Date().getFullYear() - birthYear < rules.walletMinAge) {
    throw new HttpsError('failed-precondition', `You must be ${rules.walletMinAge} or older to use the wallet.`);
  }
  const prefix = phone.slice(4, 6);
  const network: Network | null = ['99', '98', '97'].includes(prefix) ? 'airtel' : ['88', '89', '87'].includes(prefix) ? 'tnm' : null;
  if (!network) throw new HttpsError('failed-precondition', 'This number is not an Airtel or TNM number.');

  await db.doc(`${C.userPrivate(uid)}/account`).set({ birthYear, wallet: { network, msisdn: phone, linkedAt: Timestamp.now() } }, { merge: true });
  await db.collection(C.users).doc(uid).update({ walletLinked: true });
  await db.collection(C.wallets).doc(uid).set({ network, heldMWK: 0, earnedMWK: 0, updatedAt: Timestamp.now() }, { merge: true });
  return { network };
});
