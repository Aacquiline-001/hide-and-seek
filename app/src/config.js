import Constants from 'expo-constants';

// Where the game server lives.
//
// After deploying the server online (Step 4), put its https:// address here.
// While this is empty, the app finds your laptop by itself (see below).
const ONLINE_SERVER_URL = 'https://hide-and-seek-server-pzkm.onrender.com';

// During development, Expo Go loads the app from your laptop, so it already
// knows the laptop's IP (e.g. "10.189.34.90:8081"). We reuse that IP for the
// game server on port 3000, so you never have to edit an IP address again,
// even on a new computer or a new Wi-Fi.
function laptopServerUrl() {
  const hostUri = Constants.expoConfig?.hostUri; // only set while developing
  const ip = hostUri ? hostUri.split(':')[0] : null;
  return ip ? `http://${ip}:3000` : null;
}

export const SERVER_URL = ONLINE_SERVER_URL || laptopServerUrl() || 'http://localhost:3000';

// How often we send our GPS position to the server.
export const LOCATION_INTERVAL_MS = 3000;
export const LOCATION_DISTANCE_M = 5;

export const colors = {
  red: '#E8202A',
  ink: '#141414',
  paper: '#FFFFFF',
  muted: '#6B6B6B',
  line: '#E6E6E6',
  hunter: '#E8202A',
  runner: '#1E6FE8',
  bg: '#F4F2EE',
};