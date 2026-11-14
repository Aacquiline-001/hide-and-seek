import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { useGame } from './src/useGame';
import { useLocation } from './src/useLocation';
import HomeScreen from './src/screens/HomeScreen';
import LobbyScreen from './src/screens/LobbyScreen';
import GameScreen from './src/screens/GameScreen';

export default function App() {
  const g = useGame();
  const inGame = !!(g.game && g.me);

  // Track GPS whenever we're in a lobby or game, and send it to the server.
  const { position, error: locationError } = useLocation(inGame, (fix) => {
    g.actions.sendLocation(fix);
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
