# Pursuit — Game Server (Step 1)

Real-time server shared by the Android app and the iPhone web version.

## Run it

```bash
npm install
npm run dev          # starts on http://localhost:3000
npm run simulate     # in a 2nd terminal: plays a fake 8-player game (PLAYERS=12 to change)
```

## Socket.io events (client → server)

Every event takes a callback that receives `{ ok: true, ... }` or `{ ok: false, error }`.

| Event | Payload | Who |
|---|---|---|
| `game:create` | `{ name }` → `{ code, playerId }` | anyone |
| `game:join` | `{ code, name }` → `{ code, playerId }` | anyone |
| `game:rejoin` | `{ code, playerId }` | after a dropped connection |
| `game:leave` | – | player |
| `lobby:zone` | `{ center: {lat,lng}, radius }` (50–5000 m) | host |
| `lobby:settings` | `{ durationSec, headStartSec, pingIntervalSec, tagRadiusM, hunterCount, pingsEnabled, zoneEnabled }` | host |
| `lobby:role` | `{ playerId, role: 'runner' \| 'hunter' }` | host |
| `game:start` | – | host |
| `location:update` | `{ lat, lng, accuracy }` (max 1/sec) | player |
| `game:tag` | `{ runnerId }` | hunter |

## Server → client

| Event | Meaning |
|---|---|
| `game:state` | Full game view for *this* player (sent on every change) |
| `player:moved` | A teammate's live position |
| `game:ping` | Hunters only: positions of all remaining runners |
| `game:pinged` | Everyone: a ping just happened |
| `game:tagged` | `{ hunter, runner, distance }` |

## Rules the server enforces

- Up to 30 players per game, 5-letter codes.
- Hunters **never** receive runners' live positions — only at pings.
- Tagging is blocked during the head start, needs fresh GPS (< 30 s), and checks
  real distance (tag radius + up to 20 m GPS slack).
- Caught runners become hunters. Hunters win when no runners are left; runners win when time runs out.
- Leaving the zone is detected and shown to everyone.
- `/health` lets the app wake up a sleeping free-tier server before connecting.
