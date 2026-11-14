import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import GameMap from '../GameMap';
import { Button, Sheet, Eyebrow, Muted, Stepper, fmtMin } from '../ui';
import { colors } from '../config';

const RADII = [200, 400, 800, 1500];

export default function LobbyScreen({ game, me, position, locationError, actions }) {
  const isHost = me && me.id === game.hostId;
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const s = game.settings;

  async function act(promise) {
    setError(null);
    const res = await promise;
    if (!res.ok) setError(res.error);
    return res;
  }

  function pickZone(center) {
    act(actions.setZone({ center, radius: game.zone ? game.zone.radius : 400 }));
  }

  const markers = useMemo(
    () => (position ? [{ id: 'me', lat: position.lat, lng: position.lng, label: 'You', color: colors.runner, isMe: true }] : []),
    [position]
  );

  const hunters = game.players.filter((p) => p.role === 'hunter').length;

  return (
    <View style={styles.root}>
      <GameMap zone={game.zone} markers={markers} me={position} pickMode={isHost} onPick={pickZone} />

      <View style={styles.top}>
        <Sheet style={styles.codeCard}>
          <View>
            <Muted>Game code</Muted>
            <Text style={styles.code}>{game.code}</Text>
          </View>
          <Button
            title="Share"
            kind="dark"
            small
            onPress={() => Share.share({ message: `Join my Pursuit game with code ${game.code}` })}
          />
        </Sheet>
      </View>

      <Sheet style={styles.sheet}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Eyebrow>{isHost ? 'THE ZONE' : 'LOBBY'}</Eyebrow>
          {isHost ? (
            <>
              <Text style={styles.h2}>{game.zone ? 'Zone is set.' : 'Tap the map to draw the zone.'}</Text>
              <Muted>Everyone plays inside it, on real streets.</Muted>
              <View style={styles.chips}>
                {RADII.map((r) => (
                  <Pressable
                    key={r}
                    disabled={!game.zone}
                    onPress={() => act(actions.setZone({ center: game.zone.center, radius: r }))}
                    style={[styles.chip, game.zone && game.zone.radius === r && styles.chipOn, !game.zone && { opacity: 0.4 }]}
                  >
                    <Text style={[styles.chipText, game.zone && game.zone.radius === r && { color: '#fff' }]}>
                      {r >= 1000 ? `${r / 1000} km` : `${r} m`}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {position && !game.zone && (
                <Button title="Use my location as centre" kind="ghost" small onPress={() => pickZone(position)} />
              )}
            </>
          ) : (
            <>
              <Text style={styles.h2}>Waiting for the host to start…</Text>
              <Muted>{game.zone ? 'The zone is drawn on the map.' : 'The host is drawing the zone.'}</Muted>
            </>
          )}

          <Text style={styles.section}>Players ({game.players.length}/30)</Text>
          {game.players.map((p) => (
            <View key={p.id} style={styles.playerRow}>
              <Text style={styles.playerName}>
                {p.name}
                {p.id === me?.id ? ' (you)' : ''}
                {p.isHost ? '  ★' : ''}
                {!p.connected ? '  · offline' : ''}
              </Text>
              <Pressable
                disabled={!isHost}
                onPress={() => act(actions.setRole(p.id, p.role === 'hunter' ? 'runner' : 'hunter'))}
                style={[styles.role, { backgroundColor: p.role === 'hunter' ? colors.hunter : colors.bg }]}
              >
                <Text style={[styles.roleText, p.role === 'hunter' && { color: '#fff' }]}>
                  {p.role === 'hunter' ? 'Hunter' : isHost ? 'Runner' : '—'}
                </Text>
              </Pressable>
            </View>
          ))}
          {isHost && (
            <Muted style={{ fontSize: 13, marginTop: 4 }}>
              {hunters === 0
                ? `Tap a player to make them a hunter, or ${s.hunterCount} will be picked at random.`
                : `${hunters} hunter(s) chosen.`}
            </Muted>
          )}

          {isHost && (
            <>
              <Text style={styles.section}>Game settings</Text>
              <Stepper label="Round length" value={s.durationSec} display={fmtMin(s.durationSec)}
                step={300} min={300} max={7200} onChange={(v) => act(actions.setSettings({ durationSec: v }))} />
              <Stepper label="Head start" value={s.headStartSec} display={fmtMin(s.headStartSec)}
                step={30} min={0} max={900} onChange={(v) => act(actions.setSettings({ headStartSec: v }))} />
              <Stepper label="Ping every" value={s.pingIntervalSec} display={s.pingsEnabled ? fmtMin(s.pingIntervalSec) : 'Off'}
                step={30} min={30} max={1800} disabled={!s.pingsEnabled}
                onChange={(v) => act(actions.setSettings({ pingIntervalSec: v }))} />
              <Stepper label="Random hunters" value={s.hunterCount} display={String(s.hunterCount)}
                step={1} min={1} max={Math.max(1, game.players.length - 1)}
                onChange={(v) => act(actions.setSettings({ hunterCount: v }))} />
              <View style={styles.toggles}>
                <Button small kind={s.pingsEnabled ? 'dark' : 'ghost'} title={s.pingsEnabled ? 'Pings on' : 'Pings off'}
                  onPress={() => act(actions.setSettings({ pingsEnabled: !s.pingsEnabled }))} />
                <Button small kind={s.zoneEnabled ? 'dark' : 'ghost'} title={s.zoneEnabled ? 'Zone on' : 'Zone off'}
                  onPress={() => act(actions.setSettings({ zoneEnabled: !s.zoneEnabled }))} />
              </View>
            </>
          )}

          {locationError && <Text style={styles.error}>{locationError}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ gap: 10, marginTop: 16 }}>
            {isHost && (
              <Button
                title={game.players.length < 2 ? 'Waiting for players…' : 'Start game'}
                disabled={game.players.length < 2}
                loading={starting}
                onPress={async () => {
                  setStarting(true);
                  await act(actions.start());
                  setStarting(false);
                }}
              />
            )}
            <Button title="Leave" kind="ghost" onPress={actions.leave} />
          </View>
        </ScrollView>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', top: 48, left: 16, right: 16 },
  codeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  code: { fontSize: 32, fontWeight: '900', letterSpacing: 5, color: colors.ink },
  sheet: { position: 'absolute', left: 12, right: 12, bottom: 16, maxHeight: '58%' },
  h2: { fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 4 },
  chips: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: colors.bg, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontWeight: '700', color: colors.ink },
  section: { fontSize: 13, fontWeight: '800', letterSpacing: 1, color: colors.muted, marginTop: 18, marginBottom: 6, textTransform: 'uppercase' },
  playerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.line },
  playerName: { fontSize: 16, color: colors.ink, flexShrink: 1 },
  role: { paddingHorizontal: 12, height: 28, borderRadius: 14, justifyContent: 'center' },
  roleText: { fontWeight: '700', fontSize: 13, color: colors.ink },
  toggles: { flexDirection: 'row', gap: 10, marginTop: 8 },
  error: { color: colors.red, marginTop: 10, fontWeight: '600' },
});
