// Sets an admin role claim for a person, by email. Used by the "Set staff role" GitHub Action.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const email = (process.env.EMAIL ?? '').trim().toLowerCase();
const role = process.env.ROLE;
if (!email || !['owner', 'moderator', 'finance', 'support', 'none'].includes(role)) {
  console.error('Give an email and a role.');
  process.exit(1);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT });
try {
  const user = await getAuth().getUserByEmail(email);
  await getAuth().setCustomUserClaims(user.uid, role === 'none' ? {} : { role });
  await getFirestore().collection('adminLog').add({ by: 'github-action', role: 'owner', action: `role:${role}`, target: `users/${user.uid}`, note: email, at: FieldValue.serverTimestamp() });
  console.log(`${email} is now: ${role}. They should tap "Check again" (or sign out and in) on the admin panel.`);
} catch (e) {
  if (e?.code === 'auth/user-not-found') {
    console.error(`${email} has not signed in to the admin panel yet. Ask them to sign in once, then run this again.`);
  } else {
    console.error(e);
  }
  process.exit(1);
}
