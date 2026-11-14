// Everything about talking to the game server lives here.
// Screens get { state, actions } and never touch the socket directly.
import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { SERVER_URL } from './config';
import { setLiveSocket } from './backgroundLocation';

const SESSION_KEY = 'pursuit:session';

export function useGame() {
  const socketRef = useRef(null);
  const sessionRef = useRef(null); // { code, playerId }
  const [connected, setConnected] = useState(false);
  const [game, setGame] = useState(null); // latest game:state
  const [playerId, setPlayerId] = useState(null);
  const [teammates, setTeammates] = useState({}); // id -> {lat,lng} live
  const [ping, setPing] = useState(null); // { runners, at } for hunters
  const [toast, setToast] = useState(null); // short message on screen
  const [clockOffset, setClockOffset] = useState(0); // serverTime - phone time

  const showToast = useCallback((text) => {
    setToast({ text, id: Date.now() });
  }, []);

  // Send an event and wait for the server's answer.
  const call = useCallback(
    (event, payload = {}) =>
      new Promise((resolve) => {
        const s = socketRef.current;
        if (!s || !s.connected) {
          resolve({ ok: false, error: 'Not connected to the server' });
          return;
        }
        s.timeout(10000).emit(event, payload, (err, res) => {
          if (err) resolve({ ok: false, error: 'Server did not respond' });
          else resolve(res);
        });
      }),
    []
  );

  const saveSession = useCallback(async (session) => {
    sessionRef.current = session;
    setPlayerId(session ? session.playerId : null);
    try {
      if (session) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else await AsyncStorage.removeItem(SESSION_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const s = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = s;
    setLiveSocket(s); // background task sends through it while it's connected

    s.on('connect', async () => {
      setConnected(true);
      // Back after a dropped connection or app restart? Get back into the game.
      if (!sessionRef.current) {
        try {
          const saved = await AsyncStorage.getItem(SESSION_KEY);
          if (saved) sessionRef.current = JSON.parse(saved);
        } catch {}
      }
      const session = sessionRef.current;
      if (session) {
        s.timeout(10000).emit('game:rejoin', session, (err, res) => {
          if (cancelled) return;
          if (!err && res && res.ok) setPlayerId(session.playerId);
          else if (!err) saveSession(null); // game is gone
        });
      }
    });
    s.on('disconnect', () => setConnected(false));

    s.on('game:state', (state) => {
      setClockOffset(state.serverTime - Date.now());
      setGame(state);
      // Seed teammate positions from the full state.
      setTeammates((prev) => {
        const next = { ...prev };
        for (const p of state.players) if (p.location) next[p.id] = p.location;
        return next;
      });
    });
    s.on('player:moved', ({ id, location }) =>
      setTeammates((prev) => ({ ...prev, [id]: location }))
    );
    s.on('game:ping', ({ runners }) => setPing({ runners, at: Date.now() }));
    s.on('game:pinged', () => showToast('Ping! Hunters can see every runner'));
    s.on('game:tagged', ({ hunter, runner }) => showToast(`${hunter} tagged ${runner}`));

    return () => {
      cancelled = true;
      setLiveSocket(null);
      s.disconnect();
    };
  }, [saveSession, showToast]);

  const actions = {
    async host(name) {
      const res = await call('game:create', { name });
      if (res.ok) await saveSession({ code: res.code, playerId: res.playerId });
      return res;
    },
    async join(code, name) {
      const res = await call('game:join', { code, name });
      if (res.ok) await saveSession({ code: res.code, playerId: res.playerId });
      return res;
    },
    async leave() {
      await call('game:leave');
      await saveSession(null);
      setGame(null);
      setTeammates({});
      setPing(null);
    },
    setZone: (zone) => call('lobby:zone', zone),
    setSettings: (patch) => call('lobby:settings', patch),
    setRole: (id, role) => call('lobby:role', { playerId: id, role }),
    start: () => call('game:start'),
    tag: (runnerId) => call('game:tag', { runnerId }),
    sendLocation: (loc) => call('location:update', loc),
  };

  const me = game && playerId ? game.players.find((p) => p.id === playerId) : null;
  // Phone clocks can be wrong; use server time for countdowns.
  const serverNow = useCallback(() => Date.now() + clockOffset, [clockOffset]);

  return { connected, game, me, playerId, teammates, ping, toast, serverNow, actions };
}
