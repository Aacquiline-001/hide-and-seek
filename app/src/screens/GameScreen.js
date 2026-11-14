import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import GameMap from '../GameMap';
import { Button, Sheet, Eyebrow, Title, Muted, fmtClock } from '../ui';
import { colors } from '../config';

function useNow(serverNow) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(t);
  }, [serverNow]);
  return now;
}

export default function GameScreen({ game, me, position, locationError, teammates, ping, toast, serverNow, backgroundOn, actions }) {
  // Without background tracking (e.g. in Expo Go), GPS stops when the screen
  // locks, so keep the screen on. With it, players can lock their phones.
  useEffect(() => {
    if (backgroundOn || game.status === 'ended') return undefined;
    const tag = 'pursuit-game';
    activateKeepAwakeAsync(tag).catch(() => {});
    return () => deactivateKeepAwake(tag);
  }, [backgroundOn, game.status]);
  const now = useNow(serverNow);
  const [recenterKey, setRecenterKey] = useState(0);
  const [tagging, setTagging] = useState(null);
  const [message, setMessage] = useState(null);
  const [toastText, setToastText] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    setToastText(toast.text);
    const t = setTimeout(() => setToastText(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const isHunter = me?.role === 'hunter';
  const ended = game.status === 'ended';
  const runnersLeft = game.players.filter((p) => p.role === 'runner' && !p.caught);

  const markers = useMemo(() => {
    const list = [];
    const byId = Object.fromEntries(game.players.map((p) => [p.id, p]));
    const colorFor = (role) => (role === 'hunter' ? colors.hunter : colors.runner);

    if (ended) {
      // After the game everyone is revealed.
      for (const p of game.players) {
        if (p.location) list.push({ id: p.id, lat: p.location.lat, lng: p.location.lng, label: p.name, color: colorFor(p.role), isMe: p.id === me?.id });
      }
      return list;
    }
    // Teammates (server only sends us our own team's positions).
    for (const [id, loc] of Object.entries(teammates)) {
      const p = byId[id];
      if (!p || id === me?.id || p.role !== me?.role) continue;
      list.push({ id, lat: loc.lat, lng: loc.lng, label: p.name, color: colorFor(p.role) });
    }
    // Hunters: last ping shows where runners were.
    if (isHunter && ping) {
      const ago = Math.max(0, Math.round((Date.now() - ping.at) / 60000));
      for (const r of ping.runners) {
        const p = byId[r.id];
        if (!r.location || !p || p.role !== 'runner') continue;
        list.push({ id: `ping-${r.id}`, lat: r.location.lat, lng: r.location.lng, label: `${r.name} · ${ago ? ago + 'm ago' : 'now'}`, color: colors.runner, faded: true });
      }
    }
    if (position) list.push({ id: 'me', lat: position.lat, lng: position.lng, label: 'You', color: colorFor(me?.role), isMe: true });
    return list;
  }, [game.players, teammates, ping, position, me, isHunter, ended, now]); // `now` refreshes "x m ago"

  async function tag(runner) {
    setMessage(null);
    setTagging(runner.id);
    const res = await actions.tag(runner.id);
    setTagging(null);
    setMessage(res.ok ? `You tagged ${runner.name}!` : res.error);
  }

  // ----- Top status card -----
  let top;
  if (game.status === 'headstart') {
    top = (
      <View style={styles.topRow}>
        <View>
          <Muted>{isHunter ? 'Hunt starts in' : 'Hide! Hunters out in'}</Muted>
          <Text style={styles.bigClock}>{fmtClock(game.huntStartsAt - now)}</Text>
        </View>
        <RolePill role={me?.role} />
      </View>
    );
  } else if (game.status === 'playing') {
    const pingTotal = game.settings.pingIntervalSec * 1000;
    const pingLeft = game.nextPingAt ? game.nextPingAt - now : null;
    top = (
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Muted>Time left</Muted>
          <Text style={styles.bigClock}>{fmtClock(game.endsAt - now)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={{ flex: 1.2 }}>
          {pingLeft != null ? (
            <>
              <View style={styles.pingHead}>
                <Muted>Next ping</Muted>
                <Text style={styles.pingClock}>{fmtClock(pingLeft)}</Text>
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, (pingLeft / pingTotal) * 100))}%` }]} />
              </View>
              <Muted style={{ fontSize: 13, marginTop: 6 }}>Hunters see every runner</Muted>
            </>
          ) : (
            <Muted>Pings are off</Muted>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GameMap zone={game.settings.zoneEnabled ? game.zone : null} markers={markers} me={position} recenterKey={recenterKey} />

      {top && (
        <View style={styles.top}>
          <Sheet style={{ paddingVertical: 16 }}>{top}</Sheet>
          {toastText && (
            <View style={styles.toast}><Text style={styles.toastText}>{toastText}</Text></View>
          )}
          {me?.outsideZone && !ended && (
            <View style={[styles.toast, { backgroundColor: colors.red }]}>
              <Text style={styles.toastText}>You are outside the zone — get back in!</Text>
            </View>
          )}
        </View>
      )}

      <Sheet style={styles.sheet}>
        {ended ? (
          <>
            <Eyebrow>GAME OVER</Eyebrow>
            <Title>{game.winner === 'hunters' ? 'Hunters win.' : 'Runners win.'}</Title>
            <Muted style={{ marginTop: 6 }}>
              {game.winner === 'hunters' ? 'Every runner was caught.' : `${runnersLeft.length} runner(s) stayed hidden until time ran out.`}
            </Muted>
            <View style={{ marginTop: 16 }}>
              <Button title="Back to home" onPress={actions.leave} />
            </View>
          </>
        ) : isHunter ? (
          <ScrollView style={{ maxHeight: 260 }}>
            <Eyebrow>YOU ARE A HUNTER</Eyebrow>
            <Text style={styles.h2}>{runnersLeft.length} runner(s) left</Text>
            <Muted style={{ marginBottom: 8 }}>
              Get within {game.settings.tagRadiusM} m of a runner, then tap Tag.
            </Muted>
            {runnersLeft.map((r) => (
              <View key={r.id} style={styles.runnerRow}>
                <Text style={styles.runnerName}>{r.name}{!r.connected ? ' · offline' : ''}</Text>
                <Button
                  small
                  title="Tag"
                  loading={tagging === r.id}
                  disabled={game.status !== 'playing'}
                  onPress={() => tag(r)}
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <>
            <Eyebrow color={colors.runner}>YOU ARE A RUNNER</Eyebrow>
            <Text style={styles.h2}>Stay hidden. Stay in the zone.</Text>
            <Muted>
              {runnersLeft.length} runner(s) still free.
              {game.settings.pingsEnabled ? ' Every ping shows hunters where you are — keep moving.' : ''}
            </Muted>
          </>
        )}

        {message && <Text style={styles.msg}>{message}</Text>}
        {locationError && <Text style={styles.msg}>{locationError}</Text>}
        {!ended && (
          <Muted style={{ fontSize: 13, marginTop: 8 }}>
            {backgroundOn
              ? '🔒 You can lock your phone. Your location keeps updating.'
              : '⚠ Keep this screen open. Your location stops if the phone locks.'}
          </Muted>
        )}

        {!ended && (
          <View style={styles.footer}>
            <Button small kind="ghost" title="Re-centre map" onPress={() => setRecenterKey((k) => k + 1)} />
            <Button small kind="ghost" title="Leave game" onPress={actions.leave} />
          </View>
        )}
      </Sheet>
    </View>
  );
}

function RolePill({ role }) {
  const hunter = role === 'hunter';
  return (
    <View style={[styles.pill, { backgroundColor: hunter ? colors.hunter : colors.runner }]}>
      <Text style={styles.pillText}>{hunter ? 'HUNTER' : 'RUNNER'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', top: 44, left: 12, right: 12, gap: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bigClock: { fontSize: 44, fontWeight: '900', color: colors.ink, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line, marginHorizontal: 14 },
  pingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pingClock: { fontSize: 17, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.line, marginTop: 8, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.red },
  toast: { alignSelf: 'center', backgroundColor: colors.ink, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  toastText: { color: '#fff', fontWeight: '700' },
  pill: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: '#fff', fontWeight: '800', letterSpacing: 1 },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 16 },
  h2: { fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 },
  runnerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  runnerName: { fontSize: 16, color: colors.ink },
  msg: { marginTop: 10, fontWeight: '700', color: colors.ink },
  footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, gap: 10 },
});
