# Pursuit — Android App (Step 2)

Expo (React Native) app. Screens: Home → Lobby (draw zone, players, settings) → Game (live map, timer, pings, tagging) → Game over.

## Run it on your Android phone (free, no build needed)

1. Install **Expo Go** from the Play Store on your phone.
2. Start the server (from Step 1) on your laptop: `cd server` → `npm run dev`.
3. Find your laptop's Wi-Fi IP: run `ipconfig` on Windows, look for **IPv4 Address** (e.g. `192.168.1.5`).
4. Put that IP in `src/config.js`:
   ```js
   export const SERVER_URL = 'http://192.168.1.5:3000';
   ```
5. In this folder:
   ```bash
   npm install
   npx expo start
   ```
6. Scan the QR code with Expo Go. Phone and laptop must be on the **same Wi-Fi**.

If the phone can't connect: allow Node.js through Windows Firewall (Private networks),
or run `npx expo start --tunnel` for the app and check the server IP again.

## Testing with several players

- Open the app on 2+ phones (each with Expo Go), host on one, join with the code on the others.
- Only one phone? Use an Android emulator from Android Studio as the second player.

## Files

| File | What it does |
|---|---|
| `App.js` | Chooses the screen from the game status |
| `src/config.js` | Server address, GPS update rate, colours |
| `src/useGame.js` | Socket.io connection, auto-rejoin after drops, all game actions |
| `src/useLocation.js` | GPS tracking (foreground) |
| `src/GameMap.js` | Free Leaflet + OpenStreetMap map in a WebView (zone, players, pings) |
| `src/screens/*` | Home, Lobby, Game screens |

## Known limit (fixed in Step 3)

The screen is kept awake during a game because GPS only works while the app is open.
Step 3 adds background location so phones can be locked in a pocket.
