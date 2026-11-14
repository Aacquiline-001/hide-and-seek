// Watches the phone's GPS while `active` is true and reports every fix.
// (Step 3 adds background tracking so it keeps working with the screen off.)
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { LOCATION_INTERVAL_MS, LOCATION_DISTANCE_M } from './config';

export function useLocation(active, onFix) {
  const [position, setPosition] = useState(null); // { lat, lng, accuracy }
  const [error, setError] = useState(null);
  const onFixRef = useRef(onFix);
  onFixRef.current = onFix;

  useEffect(() => {
    if (!active) return undefined;
    let sub = null;
    let stopped = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is needed to play.');
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setError('Turn on Location (GPS) in your phone settings.');
        return;
      }
      setError(null);

      const handle = (loc) => {
        const fix = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? undefined,
        };
        setPosition(fix);
        onFixRef.current && onFixRef.current(fix);
      };

      // Show something on the map quickly, then keep watching.
      const last = await Location.getLastKnownPositionAsync();
      if (last && !stopped) handle(last);

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_INTERVAL_MS,
          distanceInterval: LOCATION_DISTANCE_M,
        },
        handle,
        (reason) => setError(String(reason))
      );
      if (stopped) sub.remove();
    })().catch((e) => setError(e.message));

    return () => {
      stopped = true;
      if (sub) sub.remove();
    };
  }, [active]);

  return { position, error };
}
