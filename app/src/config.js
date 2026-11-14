// Where the game server lives.
//
// Testing on your phone with Expo Go: use your laptop's Wi-Fi IP address,
// NOT "localhost" (localhost on the phone means the phone itself).
//   Windows: run `ipconfig` and look for "IPv4 Address", e.g. 192.168.1.5
// Phone and laptop must be on the same Wi-Fi.
//
// After deploying the server (Step 4), change this to the https:// address.
export const SERVER_URL = 'http://192.168.1.15:3000';

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
