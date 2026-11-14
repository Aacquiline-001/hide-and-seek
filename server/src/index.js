// Pursuit game server: Express (health check) + Socket.io (real-time game).
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { Game, makeCode } = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(cors());
app.use(express.json({ limit: '10kb' }));

const games = new Map(); // code -> Game

app.get('/', (_req, res) => res.send('Pursuit server is running'));
// Free hosts sleep when idle; the app calls this first to wake the server up.
app.get('/health', (_req, res) => res.json({ ok: true, games: games.size }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Send each player their own view of the game (hunters and runners see different things).
function broadcastState(game) {
  for (const p of game.players.values()) {
    io.to(`player:${p.id}`).emit('game:state', game.viewFor(p.id));
  }
}

// One place that handles a GPS fix, whether it came over the live socket
// or as a plain web request from a phone tracking in the background.
const lastFixAt = new Map(); // playerId -> time of last accepted fix
function handleLocation(game, playerId, loc) {
  const now = Date.now();
  // Ignore floods: at most one update per second per player.
  if (now - (lastFixAt.get(playerId) || 0) < 1000) return { throttled: true };

  const wasOutside = game.players.get(playerId)?.outsideZone;
  const p = game.updateLocation(playerId, loc, now); // throws on bad input
  lastFixAt.set(playerId, now); // only count fixes that were accepted
  // Only teammates see live positions, so send just to them.
  for (const other of game.players.values()) {
    if (other.id !== playerId && other.role === p.role) {
      io.to(`player:${other.id}`).emit('player:moved', {
        id: p.id,
        location: { lat: p.location.lat, lng: p.location.lng },
      });
    }
  }
  if (p.outsideZone !== wasOutside) broadcastState(game);
  return {};
}

// Background location from phones whose live connection is asleep.
// playerId is a random secret only that player's phone knows.
app.post('/api/location', (req, res) => {
  const { code, playerId, lat, lng, accuracy } = req.body || {};
  const game = games.get(String(code || '').toUpperCase());
  if (!game || !game.players.has(playerId)) {
    return res.status(404).json({ ok: false, error: 'Game or player not found' });
  }
  try {
    res.json({ ok: true, ...handleLocation(game, playerId, { lat, lng, accuracy }) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Wrap handlers so errors go back to the caller instead of crashing the server.
function handler(socket, fn) {
  return (payload = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      reply({ ok: true, ...(fn(payload) || {}) });
    } catch (err) {
      reply({ ok: false, error: err.message });
    }
  };
}

io.on('connection', (socket) => {
  // Set once the socket creates, joins or rejoins a game.
  let game = null;
  let playerId = null;

  function attach(g, id) {
    game = g;
    playerId = id;
    socket.join(`game:${g.code}`);
    socket.join(`player:${id}`);
    const p = g.players.get(id);
    if (p) p.connected = true;
  }

  function requireGame() {
    if (!game || !playerId) throw new Error('Not in a game');
  }

  socket.on('game:create', handler(socket, ({ name }) => {
    let code;
    do code = makeCode(); while (games.has(code));
    const g = new Game(code, name);
    games.set(code, g);
    attach(g, g.hostId);
    broadcastState(g);
    return { code, playerId: g.hostId };
  }));

  socket.on('game:join', handler(socket, ({ code, name }) => {
    const g = games.get(String(code || '').toUpperCase().trim());
    if (!g) throw new Error('No game with that code');
    const p = g.addPlayer(name);
    attach(g, p.id);
    broadcastState(g);
    return { code: g.code, playerId: p.id };
  }));

  // Phones lose connection all the time (tunnels, switching networks).
  // The app stores code + playerId and calls this to get back in.
  socket.on('game:rejoin', handler(socket, ({ code, playerId: id }) => {
    const g = games.get(String(code || '').toUpperCase());
    if (!g || !g.players.has(id)) throw new Error('Game or player not found');
    attach(g, id);
    broadcastState(g);
    return { code: g.code, playerId: id };
  }));

  socket.on('game:leave', handler(socket, () => {
    requireGame();
    game.removePlayer(playerId);
    socket.leave(`game:${game.code}`);
    socket.leave(`player:${playerId}`);
    if (game.players.size === 0) games.delete(game.code);
    else broadcastState(game);
    game = null;
    playerId = null;
  }));

  socket.on('lobby:settings', handler(socket, (patch) => {
    requireGame();
    game.updateSettings(playerId, patch);
    broadcastState(game);
  }));

  socket.on('lobby:zone', handler(socket, (zone) => {
    requireGame();
    game.setZone(playerId, zone);
    broadcastState(game);
  }));

  socket.on('lobby:role', handler(socket, ({ playerId: target, role }) => {
    requireGame();
    game.setRole(playerId, target, role);
    broadcastState(game);
  }));

  socket.on('game:start', handler(socket, () => {
    requireGame();
    game.start(playerId);
    broadcastState(game);
  }));

  socket.on('location:update', handler(socket, (loc) => {
    requireGame();
    return handleLocation(game, playerId, loc);
  }));

  socket.on('game:tag', handler(socket, ({ runnerId }) => {
    requireGame();
    const result = game.tag(playerId, runnerId);
    io.to(`game:${game.code}`).emit('game:tagged', {
      hunter: result.hunter.name,
      runner: result.runner.name,
      distance: result.distance,
    });
    broadcastState(game);
    return { distance: result.distance };
  }));

  socket.on('disconnect', () => {
    if (!game || !playerId) return;
    const p = game.players.get(playerId);
    if (p) p.connected = false;
    broadcastState(game);
  });
});

// One shared clock for every game: timers, pings and the end of the round.
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games) {
    const r = game.tick(now);
    if (r.ping) {
      // Only hunters receive the runners' positions.
      for (const p of game.players.values()) {
        if (p.role === 'hunter') io.to(`player:${p.id}`).emit('game:ping', { runners: r.ping });
      }
      io.to(`game:${code}`).emit('game:pinged', { at: now });
    }
    if (r.phaseChanged || r.ping || r.ended) broadcastState(game);

    // Clean up finished or abandoned games after 2 hours.
    const age = now - (game.startedAt || game.createdAt || now);
    const everyoneGone = [...game.players.values()].every((p) => !p.connected);
    if ((game.status === 'ended' || everyoneGone) && age > 2 * 3600 * 1000) games.delete(code);
  }
}, 1000);

server.listen(PORT, () => console.log(`Pursuit server listening on port ${PORT}`));
