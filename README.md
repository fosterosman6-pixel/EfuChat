# EfuChat

Chat, social and market app for Malawi, built with Expo (React Native) and Firebase.
Brand: EfuLogistix navy and lime, Open Sans.

## Phase 1 (this code)

- Welcome with Chichewa / English, phone sign-in with SMS code, profile setup
- Bottom bar: Home · Reels · + · Market · Chats
- Chats: live list with unread counts, filters, one-to-one chats, read ticks, quick replies
- New chat: find people by phone number, invite friends
- Stories: post text stories with a background colour, view them full screen, "seen by" count
- Me: data saver, language, sign out
- Home feed, Reels, Market, Wallet, calls and groups show "coming soon" for now

## Setup

1. Create a Firebase project. Turn on **Authentication → Phone**, **Firestore** and **Storage**.
2. Add an Android app `com.efulogistix.efuchat` and an iOS app with the same bundle ID
   (change both in `app.json` if you want different IDs).
3. Download `google-services.json` and `GoogleService-Info.plist` into this folder.
   They are referenced from `app.json`. Do not commit them to a public repo.
4. For Android phone sign-in, add your app's SHA-1 and SHA-256 fingerprints in Firebase.
5. Deploy the database, storage rules and server functions. `DATABASE.md` has the full steps: `firebase deploy --only firestore,storage,functions`.
6. `npm install`

Phone sign-in uses native code, so the app needs a **development build**, not Expo Go:
`npx expo run:android` or `npx eas-cli@latest build --profile development`.

## Checks

- `npm run typecheck` compiles the app's TypeScript without building the app.
- `npm --prefix functions run typecheck` compiles the server functions.
- The security rules tests run on the Firestore emulator (see `DATABASE.md`).

## Database

See **DATABASE.md** for every collection, how money moves, admin roles and server functions.

Direct chat ids are the two user ids, sorted and joined with `_`.
