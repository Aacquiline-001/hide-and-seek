// Plays a fast game against the server with fake players.
// Usage: npm run simulate   (server must be running)   PLAYERS=10 to change size.
const { io } = require('socket.io-client');

const URL = process.env.SERVER_URL || 'http://localhost:3000';
const PLAYER_COUNT = Number(process.env.PLAYERS || 8);
const CENTER = { lat: 9.9816, lng: 76.2999 }; // Kochi, Kerala

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = (s, ev, data) =>
  new Promise((resolve) => s.emit(ev, data, (res) => resolve(res)));

// Move a point by metres north/east.
const offset = (p, north, east) => ({
  lat: p.lat + north / 111320,
  lng: p.lng + east / (111320 * Math.cos((p.lat * Math.PI) / 180)),
});

async function main() {
  const players = [];
  const connect = () => io(URL, { transports: ['websocket'] });

  // Host creates the game
  const host = { name: 'Host', socket: connect() };
  const created = await call(host.socket, 'game:create', { name: host.name });
  if (!created.ok) throw new Error(created.error);
  host.id = created.playerId;
  players.push(host);
  console.log(`Game created: ${created.code}`);

  // Others join
  for (let i = 1; i < PLAYER_COUNT; i++) {
    const p = { name: `Player${i}`, socket: connect() };
    const res = await call(p.socket, 'game:join', { code: created.code, name: p.name });
    if (!res.ok) throw new Error(res.error);
    p.id = res.playerId;
    players.push(p);
  }
  console.log(`${players.length} players joined`);

  // Track the latest state each player receives
  for (const p of players) {
    p.socket.on('game:state', (s) => (p.state = s));
    p.socket.on('game:ping', ({ runners }) => (p.lastPing = runners));
  }
  host.socket.on('game:tagged', (t) => console.log(`  TAG: ${t.hunter} caught ${t.runner} at ${t.distance} m`));
  host.socket.on('game:pinged', () => console.log('  PING sent to hunters'));

  // Host draws zone and uses short timers so the simulation is quick
  let r = await call(host.socket, 'lobby:zone', { center: CENTER, radius: 400 });
  if (!r.ok) throw new Error(r.error);
  r = await call(host.socket, 'lobby:settings', {
    durationSec: 60, headStartSec: 3, pingIntervalSec: 30, hunterCount: 2,
  });
  // pingIntervalSec has a 30 s minimum, so this run sees one ping at most.
  if (!r.ok) throw new Error(r.error);

  // Bad input must be rejected, not crash the server
  const bad = await call(players[1].socket, 'game:start', {});
  console.log(`Non-host start rejected: ${!bad.ok} (${bad.error})`);

  // Everyone starts somewhere in the zone
  for (const p of players) {
    p.pos = offset(CENTER, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500);
    await call(p.socket, 'location:update', { ...p.pos, accuracy: 8 });
  }

  r = await call(host.socket, 'game:start', {});
  if (!r.ok) throw new Error(r.error);
  await sleep(300);
  const hunters = players.filter((p) => p.state.players.find((x) => x.id === p.id).role === 'hunter');
  console.log(`Started. Hunters: ${hunters.map((h) => h.name).join(', ')}`);

  // Privacy check: a hunter must not see runners' live positions
  const hunterView = hunters[0].state.players.filter((x) => x.role === 'runner');
  console.log(`Hunter sees runner positions before ping: ${hunterView.some((x) => x.location)}`);

  // Tagging during head start must fail
  const early = await call(hunters[0].socket, 'game:tag', { runnerId: hunterView[0].id });
  console.log(`Tag during head start rejected: ${!early.ok} (${early.error})`);

  await sleep(3500);

  // Each second: runners wander, hunters walk toward the nearest runner and try to tag
  for (let t = 0; t < 70; t++) {
    const state = host.state;
    if (state.status === 'ended') break;
    const roles = Object.fromEntries(state.players.map((x) => [x.id, x]));
    for (const p of players) {
      const me = roles[p.id];
      if (me.role === 'runner') {
        p.pos = offset(p.pos, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
      } else {
        const targets = players.filter((o) => roles[o.id].role === 'runner');
        if (targets.length) {
          const target = targets.reduce((a, b) =>
            Math.hypot(a.pos.lat - p.pos.lat, a.pos.lng - p.pos.lng) <
            Math.hypot(b.pos.lat - p.pos.lat, b.pos.lng - p.pos.lng) ? a : b);
          // Hunters move 30 m/s here so the test finishes quickly
          const dLat = target.pos.lat - p.pos.lat;
          const dLng = target.pos.lng - p.pos.lng;
          const len = Math.hypot(dLat, dLng) || 1;
          const step = Math.min(1, 30 / 111320 / len);
          p.pos = { lat: p.pos.lat + dLat * step, lng: p.pos.lng + dLng * step };
          p.target = target;
        }
      }
      await call(p.socket, 'location:update', { ...p.pos, accuracy: 8 });
    }
    for (const p of players) {
      if (roles[p.id].role === 'hunter' && p.target) {
        await call(p.socket, 'game:tag', { runnerId: p.target.id });
      }
    }
    await sleep(1000);
  }

  await sleep(500);
  const final = host.state;
  console.log(`\nResult: status=${final.status}, winner=${final.winner}`);
  console.log(`Runners left: ${final.players.filter((x) => x.role === 'runner').length}`);
  for (const p of players) p.socket.disconnect();
  process.exit(final.status === 'ended' ? 0 : 1);
}

main().catch((e) => {
  console.error('Simulation failed:', e.message);
  process.exit(1);
});
