import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useGame } from './src/useGame';
import { useLocation } from './src/useLocation';
import { startBackgroundTracking, stopBackgroundTracking } from './src/backgroundLocation';
import HomeScreen from './src/screens/HomeScreen';
import LobbyScreen from './src/screens/LobbyScreen';
import GameScreen from './src/screens/GameScreen';

export default function App() {
  const g = useGame();
  const inGame = !!(g.game && g.me);
  const playing = inGame && (g.game.status === 'headstart' || g.game.status === 'playing');

  // Background tracking runs only during a game (not in the lobby or after).
  const [backgroundOn, setBackgroundOn] = useState(false);
  const backgroundOnRef = useRef(false);
  backgroundOnRef.current = backgroundOn;

  useEffect(() => {
    let cancelled = false;
    if (!playing) {
      stopBackgroundTracking();
      setBackgroundOn(false);
      return undefined;
    }
    const tryStart = async () => {
      const ok = await startBackgroundTracking();
      if (!cancelled) setBackgroundOn(ok);
    };
    tryStart();
    // Android only lets us start tracking while the app is on screen.
    // If the game started while the phone was in a pocket, retry on return.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !backgroundOnRef.current) tryStart();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [playing]);

  // Also stop tracking if the app closes mid-game.
  useEffect(() => () => { stopBackgroundTracking(); }, []);

  // On-screen GPS: keeps "You" on the map. While background tracking is on,
  // that task already sends our position, so don't send it twice.
  const { position, error: locationError } = useLocation(inGame, (fix) => {
    if (!backgroundOnRef.current) g.actions.sendLocation(fix);
  });

  let screen;
  if (!inGame) {
    screen = <HomeScreen connected={g.connected} actions={g.actions} />;
  } else if (g.game.status === 'lobby') {
    screen = (
      <LobbyScreen game={g.game} me={g.me} position={position} locationError={locationError} actions={g.actions} />
    );
  } else {
    screen = (
      <GameScreen
        game={g.game}
        me={g.me}
        position={position}
        locationError={locationError}
        teammates={g.teammates}
        ping={g.ping}
        toast={g.toast}
        serverNow={g.serverNow}
        backgroundOn={backgroundOn}
        actions={g.actions}
      />
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      {screen}
    </>
  );
}
