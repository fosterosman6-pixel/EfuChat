# EfuChat database

Cloud Firestore for data, Cloud Storage for photos and videos, Cloud Functions for anything
that must be trusted (money, orders, counts, moderation). Full field list: `functions/src/schema.ts`.

Money is whole Malawi Kwacha (MWK) stored as integers. Fields marked **server** are written only by Cloud Functions.

## Collections

| Collection | What it holds | Who writes |
| --- | --- | --- |
| `users/{uid}` | Public profile: name, about, photo, town, account type, verified, plan, counts, rating, status | Person (profile fields); server (badges, plan, counts, status) |
| `users/{uid}/private/account` | Phone, birth year, linked wallet, push tokens, privacy settings | Person; wallet by server |
| `users/{uid}/followers/{uid}` · `following/{uid}` | Follows | Person follows; server mirrors and counts |
| `users/{uid}/notifications/{id}` | Likes, comments, tips, orders, deliveries | Server; person marks read |
| `users/{uid}/blocks/{uid}` · `saved/{id}` | Blocked people, saved posts and items | Person |
| `phoneIndex/{+265…}` · `handles/{handle}` | Find people by phone or @handle | Person (own only) |
| `chats/{id}` · `chats/{id}/messages/{id}` | Direct and group chats, messages | Members |
| `stories/{id}` | 24-hour stories | Person; deleted hourly by server |
| `posts/{id}` | Feed posts, polls and reels | Person; counts, status, featured by server |
| `posts/{id}/comments` · `likes/{uid}` · `votes/{uid}` | Comments, one like and one poll vote per person | Person; totals by server |
| `hashtags/{tag}` | Post counts and pinned / hidden state | Server; moderators |
| `channels/{id}` · `/posts` · `/followers/{uid}` | Channels, their posts, followers | Channel admins; verification by moderators |
| `listings/{id}` | Market items | Seller; sold, boost, removal by server |
| `orders/{id}` · `disputes/{id}` · `reviews/{orderId}` | Buying, held money, problems, ratings | **Server only** |
| `wallets/{uid}` · `ledger/{id}` · `payments/{id}` | Held and earned money, every money movement, Airtel / TNM requests | **Server only** |
| `boosts/{id}` · `subscriptions/{uid}` · `ads/{id}` | Paid features | Server; businesses submit ads |
| `deliveries/{id}` | Matola jobs shared with EfuLogistix | **Server only** |
| `reports/{id}` | One per reported thing, with reasons and count | Server; moderators decide |
| `adminLog/{id}` | Every admin action | **Server only** |
| `config/pricing` · `config/fees` · `config/rules` | Prices, fee %, app rules | Owner (finance may change fees) |
| `stats/{yyyy-mm-dd}` | Dashboard numbers | **Server only** |

## How money moves

1. The app calls a function (`createOrder`, `tipPost`, `buyBoost`, `subscribe`).
2. The function saves a `payments` document and asks Airtel Money or TNM Mpamba to collect. The person approves with their PIN.
3. The network calls `paymentsWebhook`. `settlePayment` applies the result **once**: marks the order paid, turns the boost on, and so on. It also writes `ledger` entries.
4. For Market orders the seller's money stays **held** until the buyer taps "I got it" (`confirmDelivery`). If nobody complains, the nightly job releases it after 3 days. Then the seller is paid, less the Market fee.
5. Disputes hold the money until staff choose **refund buyer**, **pay seller** or **split** (`resolveDispute`).

The ledger is never edited or deleted. Balances can always be rebuilt from it.

## Admin roles

Roles are Firebase Auth custom claims, set by an owner with `setStaffRole`:

| Role | Can |
| --- | --- |
| owner | everything, including prices, roles and the admin log |
| moderator | reports, content, users, channels, ads |
| finance | money, ledger, refunds, fees |
| support | users and disputes; can see but not change money |

**First owner:** set it once by hand with the Admin SDK, e.g. `getAuth().setCustomUserClaims(<your uid>, { role: 'owner' })`.

## Server functions

| Function | Type | Job |
| --- | --- | --- |
| `linkWallet` | callable | Link Airtel / TNM (own number only, 18+) |
| `createOrder`, `updateOrder`, `confirmDelivery`, `openDispute`, `answerDispute`, `resolveDispute`, `reviewOrder` | callable | Market orders, held money and disputes |
| `tipPost`, `buyBoost`, `subscribe`, `cancelSubscription`, `reviewAd` | callable | Tips and paid features |
| `reportContent`, `decideReport`, `setUserStatus`, `setStaffRole` | callable | Safety and admin |
| `requestMatola` | callable | Book a matola from a chat |
| `paymentsWebhook`, `efulogistixWebhook` | HTTPS | Updates from the mobile money networks and EfuLogistix |
| `onFollow`, `onLike`, `onComment`, `onVote`, `onPostCreated`… | Firestore triggers | Counts, notifications, hashtags, stats |
| `autoCompleteOrders`, `expirePaidFeatures`, `cleanStories`, `resetHashtagsToday` | scheduled | Nightly and hourly clean-up |

## Not connected yet

- **Airtel Money and TNM Mpamba APIs:** `functions/src/mobileMoney.ts` has the two places to fill in once you have merchant accounts. Until then, set `FAKE_PAYMENTS=true` on the emulator and every payment succeeds.
- **EfuLogistix:** it needs to read new `deliveries`, and to call `efulogistixWebhook` as drivers move. Matola fares are fixed at MWK 3,500 until EfuLogistix can quote them.
- **Subscription renewals:** plans end when they run out. Automatic renewal needs the mobile money APIs.

## Set up and check

```bash
npm install -g firebase-tools
firebase login
firebase use --add                     # pick your Firebase project
cd functions && npm install && cd ..
firebase functions:secrets:set PAYMENTS_WEBHOOK_SECRET
firebase functions:secrets:set EFULOGISTIX_WEBHOOK_SECRET
firebase functions:secrets:set AIRTEL_CLIENT_ID      # placeholders are fine until Airtel gives you keys
firebase functions:secrets:set AIRTEL_CLIENT_SECRET
firebase functions:secrets:set TNM_API_KEY
firebase deploy --only firestore,storage,functions
SEED_CONFIG_ONLY=true GCLOUD_PROJECT=<your-project-id> npm --prefix functions run seed   # prices, fees, rules
```

Local checks (no deploy):

```bash
npm --prefix functions run typecheck                                       # compile the server code
npx firebase-tools emulators:exec --only firestore --project demo-efuchat \
  "npm --prefix rules-test install && npm --prefix rules-test test"       # 15 security rule tests
```
