// Background location: keeps sending GPS while the phone is locked or the
// app is in the background, using an Android "foreground service" (the
// "Pursuit is tracking your location" notification).
//
// With that notification, Android only needs the normal "While using the app"
// permission, not "Allow all the time".
//
// This file must be imported in index.js BEFORE the app starts, because
// Android can wake the task up even when no screen is showing.
import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { SERVER_URL, colors } from './config';

const TASK = 'pursuit-background-location';
const SESSION_KEY = 'pursuit:session'; // written by useGame.js

// The live socket, if the app is running. useGame.js sets this.
let liveSocket = null;
export function setLiveSocket(socket) {
  liveSocket = socket;
}

// Send one GPS fix: over the live socket if it's connected, otherwise as a
// plain web request (works even if Android paused the socket).
async function sendFix(fix) {
  if (liveSocket && liveSocket.connected) {
    liveSocket.emit('location:update', fix, () => {});
    return;
  }
  let session = null;
  try {
    const saved = await AsyncStorage.getItem(SESSION_KEY);
    session = saved ? JSON.parse(saved) : null;
  } catch {}
  if (!session) return;
  try {
    await fetch(`${SERVER_URL}/api/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: session.code, playerId: session.playerId, ...fix }),
    });
  } catch {
    // No signal right now; the next fix will try again.
  }
}

TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data || !data.locations || data.locations.length === 0) return;
  // Android may deliver several fixes at once; only the newest matters.
  const loc = data.locations[data.locations.length - 1];
  await sendFix({
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    accuracy: loc.coords.accuracy ?? undefined,
  });
});

// Expo Go can't run background tasks; only the real APK can.
export const backgroundSupported =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Start tracking. Must be called while the app is open on screen.
// Returns true if background tracking is running.
export async function startBackgroundTracking() {
  if (!backgroundSupported) return false;
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return false;
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) return true;
    // Android 13+: ask to show notifications, so the "game in progress"
    // notification is visible. Tracking works even if the player says no.
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => {});
    }
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 4000,
      // 0 = keep sending even when standing still. A hiding runner must keep
      // reporting, or the server refuses tags on them as "location too old".
      distanceInterval: 0,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Pursuit game in progress',
        notificationBody: 'Sharing your location with the game.',
        notificationColor: colors.red,
        killServiceOnDestroy: true, // stop if the app is swiped away
      },
    });
    return true;
  } catch (e) {
    console.warn('Background tracking failed to start:', e.message);
    return false;
  }
}

export async function stopBackgroundTracking() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(TASK)) {
      await Location.stopLocationUpdatesAsync(TASK);
    }
  } catch {}
}
