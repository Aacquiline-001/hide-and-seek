// Game rules and state. Pure logic — no sockets here, so it is easy to test.
const crypto = require('crypto');
const { distanceMeters, isValidCoord, isInsideZone } = require('./geo');

const DEFAULT_SETTINGS = {
  durationSec: 30 * 60,      // whole round
  headStartSec: 60,          // runners hide before hunters may move/tag
  pingIntervalSec: 2 * 60,   // hunters see every runner this often
  pingsEnabled: true,
  zoneEnabled: true,
  tagRadiusM: 15,            // GPS is off by 5-20 m, so allow a margin
  hunterCount: 1,
};

const MAX_PLAYERS = 30;

// Codes without look-alike characters (no 0/O, 1/I).
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(len = 5) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return s;
}

class Game {
  constructor(code, hostName) {
    this.code = code;
    this.createdAt = Date.now();
    this.status = 'lobby'; // lobby -> headstart -> playing -> ended
    this.settings = { ...DEFAULT_SETTINGS };
    this.zone = null; // { center: {lat,lng}, radius }
    this.players = new Map(); // playerId -> player
    this.startedAt = null;
    this.endsAt = null;
    this.nextPingAt = null;
    this.winner = null;
    this.events = []; // short log: tags, pings, leaving zone
    this.hostId = this.addPlayer(hostName).id;
  }

  addPlayer(name) {
    if (this.status !== 'lobby') throw new Error('Game already started');
    if (this.players.size >= MAX_PLAYERS) throw new Error('Game is full');
    const clean = String(name || '').trim().slice(0, 20);
    if (!clean) throw new Error('Name is required');
    const taken = [...this.players.values()].some(
      (p) => p.name.toLowerCase() === clean.toLowerCase()
    );
    if (taken) throw new Error('That name is taken in this game');

    const player = {
      id: crypto.randomUUID(),
      name: clean,
      role: 'runner', // runner | hunter
      caught: false,
      connected: true,
      location: null, // { lat, lng, accuracy, at }
      outsideZone: false,
    };
    this.players.set(player.id, player);
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (playerId === this.hostId) {
      const next = this.players.keys().next();
      this.hostId = next.done ? null : next.value;
    }
  }

  updateSettings(byId, patch) {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new Error('Settings are locked once the game starts');
    const s = this.settings;
    const num = (v, min, max) => Math.min(max, Math.max(min, Math.round(Number(v))));
    if (patch.durationSec != null) s.durationSec = num(patch.durationSec, 60, 3 * 3600);
    if (patch.headStartSec != null) s.headStartSec = num(patch.headStartSec, 0, 15 * 60);
    if (patch.pingIntervalSec != null) s.pingIntervalSec = num(patch.pingIntervalSec, 30, 30 * 60);
    if (patch.tagRadiusM != null) s.tagRadiusM = num(patch.tagRadiusM, 5, 100);
    if (patch.hunterCount != null) s.hunterCount = num(patch.hunterCount, 1, MAX_PLAYERS - 1);
    if (patch.pingsEnabled != null) s.pingsEnabled = !!patch.pingsEnabled;
    if (patch.zoneEnabled != null) s.zoneEnabled = !!patch.zoneEnabled;
  }

  setZone(byId, zone) {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new Error('The zone is locked once the game starts');
    if (!zone || !isValidCoord(zone.center)) throw new Error('Invalid zone centre');
    const radius = Number(zone.radius);
    if (!(radius >= 50 && radius <= 5000)) throw new Error('Zone radius must be 50–5000 m');
    this.zone = { center: { lat: zone.center.lat, lng: zone.center.lng }, radius };
  }

  // Host can pick hunters; otherwise they are chosen at random on start.
  setRole(byId, playerId, role) {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new Error('Roles are locked once the game starts');
    const p = this.players.get(playerId);
    if (!p) throw new Error('No such player');
    if (role !== 'runner' && role !== 'hunter') throw new Error('Invalid role');
    p.role = role;
    p.roleChosen = true;
  }

  start(byId, now = Date.now()) {
    this.requireHost(byId);
    if (this.status !== 'lobby') throw new Error('Game already started');
    if (this.players.size < 2) throw new Error('Need at least 2 players');
    if (this.settings.zoneEnabled && !this.zone) throw new Error('Draw the zone first');

    const players = [...this.players.values()];
    let hunters = players.filter((p) => p.role === 'hunter');
    if (hunters.length === 0) {
      const want = Math.min(this.settings.hunterCount, players.length - 1);
      const shuffled = players.sort(() => Math.random() - 0.5);
      shuffled.forEach((p, i) => (p.role = i < want ? 'hunter' : 'runner'));
      hunters = shuffled.slice(0, want);
    }
    if (hunters.length === players.length) throw new Error('Need at least one runner');

    this.status = 'headstart';
    this.startedAt = now;
    this.huntStartsAt = now + this.settings.headStartSec * 1000;
    this.endsAt = now + this.settings.durationSec * 1000;
    this.nextPingAt = this.settings.pingsEnabled
      ? this.huntStartsAt + this.settings.pingIntervalSec * 1000
      : null;
    this.log('start', `Game started. ${hunters.length} hunter(s).`, now);
  }

  updateLocation(playerId, loc, now = Date.now()) {
    const p = this.players.get(playerId);
    if (!p) throw new Error('No such player');
    if (!isValidCoord(loc)) throw new Error('Invalid location');
    p.location = {
      lat: loc.lat,
      lng: loc.lng,
      accuracy: Number.isFinite(loc.accuracy) ? loc.accuracy : null,
      at: now,
    };
    if (this.zone && this.settings.zoneEnabled && this.status !== 'lobby') {
      const outside = !isInsideZone(p.location, this.zone);
      if (outside && !p.outsideZone) this.log('zone', `${p.name} left the zone`, now);
      p.outsideZone = outside;
    }
    return p;
  }

  // A hunter tags a runner. Server decides using both players' last GPS fix.
  tag(hunterId, runnerId, now = Date.now()) {
    if (this.status !== 'playing') throw new Error('Tagging opens after the head start');
    const hunter = this.players.get(hunterId);
    const runner = this.players.get(runnerId);
    if (!hunter || hunter.role !== 'hunter') throw new Error('Only hunters can tag');
    if (!runner || runner.role !== 'runner') throw new Error('That player is not a runner');
    if (runner.caught) throw new Error('Already caught');
    if (!hunter.location || !runner.location) throw new Error('Waiting for GPS');

    const STALE_MS = 30 * 1000;
    if (now - hunter.location.at > STALE_MS || now - runner.location.at > STALE_MS) {
      throw new Error('Location too old — try again in a moment');
    }

    const dist = distanceMeters(hunter.location, runner.location);
    // Allow for each phone's reported GPS accuracy, capped so it can't be abused.
    const slack = Math.min(
      20,
      ((hunter.location.accuracy || 0) + (runner.location.accuracy || 0)) / 2
    );
    if (dist > this.settings.tagRadiusM + slack) {
      throw new Error(`Too far away (${Math.round(dist)} m)`);
    }

    runner.caught = true;
    // Caught runners join the hunt.
    runner.role = 'hunter';
    this.log('tag', `${hunter.name} tagged ${runner.name}`, now);
    if (this.runnersLeft().length === 0) this.end('hunters', now);
    return { hunter, runner, distance: Math.round(dist) };
  }

  runnersLeft() {
    return [...this.players.values()].filter((p) => p.role === 'runner' && !p.caught);
  }

  // Called about once a second by the server. Returns things to broadcast.
  tick(now = Date.now()) {
    const out = { phaseChanged: false, ping: null, ended: false };
    if (this.status === 'headstart' && now >= this.huntStartsAt) {
      this.status = 'playing';
      this.log('hunt', 'Head start over — hunters are out!', now);
      out.phaseChanged = true;
    }
    if (this.status === 'playing') {
      if (this.nextPingAt && now >= this.nextPingAt) {
        out.ping = this.runnersLeft().map((p) => ({
          id: p.id,
          name: p.name,
          location: p.location ? { lat: p.location.lat, lng: p.location.lng } : null,
        }));
        this.nextPingAt = now + this.settings.pingIntervalSec * 1000;
        this.log('ping', 'Ping! Hunters can see every runner.', now);
      }
      if (now >= this.endsAt) {
        this.end('runners', now);
        out.ended = true;
      }
    }
    return out;
  }

  end(winner, now = Date.now()) {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.winner = winner;
    this.log('end', winner === 'hunters' ? 'Every runner was caught!' : 'Time up — runners win!', now);
  }

  requireHost(byId) {
    if (byId !== this.hostId) throw new Error('Only the host can do that');
  }

  log(type, text, at = Date.now()) {
    this.events.push({ type, text, at });
    if (this.events.length > 50) this.events.shift();
  }

  // What a given player is allowed to see. Hunters must NOT get live runner
  // positions — they only get them through pings.
  viewFor(playerId) {
    const me = this.players.get(playerId);
    const players = [...this.players.values()].map((p) => {
      const showLocation =
        p.id === playerId ||
        this.status === 'ended' ||
        (me && me.role === p.role); // teammates see each other
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        caught: p.caught,
        connected: p.connected,
        isHost: p.id === this.hostId,
        outsideZone: p.outsideZone,
        location: showLocation && p.location ? { lat: p.location.lat, lng: p.location.lng } : null,
      };
    });
    return {
      code: this.code,
      status: this.status,
      settings: this.settings,
      zone: this.zone,
      hostId: this.hostId,
      startedAt: this.startedAt,
      huntStartsAt: this.huntStartsAt || null,
      endsAt: this.endsAt,
      nextPingAt: this.nextPingAt,
      winner: this.winner,
      events: this.events.slice(-10),
      players,
      serverTime: Date.now(),
    };
  }
}

module.exports = { Game, makeCode, DEFAULT_SETTINGS, MAX_PLAYERS };
