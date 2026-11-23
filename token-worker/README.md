# EfuChat call-token server

Cloudflare Worker `efuchat-agora-token`. The app POSTs `{ channel }` to `/token` with the
user's Firebase ID token and gets an Agora RTC token (uid 0, 1 hour, renewed by the app).

Settings on the Worker:
- `AGORA_APP_ID` (text): `8af9286daac94ca7b6e2d14090f0cdff`
- `FIREBASE_PROJECT_ID` (text): `project-72f5d6ed-81b6-4920-86b`
- `AGORA_APP_CERT` (secret): the Agora project's primary certificate. Set it in the
  Cloudflare dashboard only; never commit it.

The token layout matches Agora's `RtcTokenBuilder2.buildTokenWithUid` (checked against the
`agora-token` package).
