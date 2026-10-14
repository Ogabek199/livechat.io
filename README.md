# LiveChat.IO

Random video chat (WebRTC). Matchmaking and signaling use **Firebase Realtime Database** (works on Vercel free tier — no server WebSocket).

```bash
npm install
npm run dev
npm run build
```

## Firebase setup

1. Enable **Anonymous** + **Google** auth.
2. Create **Realtime Database** (any region).
3. Deploy rules: `npx firebase-tools deploy --only database`
4. Set `NUXT_PUBLIC_FIREBASE_*` including `NUXT_PUBLIC_FIREBASE_DATABASE_URL`.
