// Location lookup for the patient SOS trigger (patient-dashboard.tsx).
//
// An SOS with no location is useless — MERA can't tell an ambulance where to
// go — and the backend now rejects a trigger without coordinates
// (emergencies/serializers.py _RequiredLocationFields). So the trigger must
// never proceed without a location, and every way of NOT having one is
// reported here as a categorised failure the dashboard turns into the same
// calm "we need your location" state (with a retry), instead of the old
// behaviour (permission denied -> silently trigger with null coordinates;
// services off -> throw into a generic "SOS Failed" alert).
//
// Order of attempts:
//   1. permission (already granted, else ask; still not granted -> denied)
//   2. a FRESH fix, capped at SOS_LOCATION_TIMEOUT_MS (getCurrentPositionAsync
//      has no timeout of its own and can hang indefinitely indoors / with a
//      poor provider — the trigger must not sit on "SENDING..." forever)
//   3. on timeout OR error (e.g. location services switched off), fall back
//      to getLastKnownPositionAsync — accepted only if not older than
//      LAST_KNOWN_MAX_AGE_MS, so a stale fix can't send an ambulance to
//      wherever the patient was hours ago
//   4. nothing -> { ok: false, reason: 'unavailable' }
//
// The expo-location module is injected (`loc`) rather than imported here, so
// this file has no React Native dependency and runs under plain Node's test
// runner — see get-sos-location.test.mjs.

export const SOS_LOCATION_TIMEOUT_MS = 6000;
export const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

export type SosLocationFailure = 'permission_denied' | 'unavailable';

export type SosLocationResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      accuracy: number | null;
      source: 'fresh' | 'last_known';
    }
  | { ok: false; reason: SosLocationFailure };

type Position = { coords: { latitude: number; longitude: number; accuracy: number | null } };

// The subset of expo-location this needs.
export interface LocationApi {
  Accuracy: { High: number };
  getForegroundPermissionsAsync(): Promise<{ status: string }>;
  requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  getCurrentPositionAsync(options?: { accuracy?: number }): Promise<Position>;
  getLastKnownPositionAsync(options?: { maxAge?: number }): Promise<Position | null>;
}

// The backend stores 6 decimal places (DecimalField max_digits=9,
// decimal_places=6) and DRF rejects more digits than that.
const round6 = (n: number) => parseFloat(n.toFixed(6));

const toResult = (pos: Position, source: 'fresh' | 'last_known'): SosLocationResult => ({
  ok: true,
  latitude: round6(pos.coords.latitude),
  longitude: round6(pos.coords.longitude),
  accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
  source,
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('location timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function getSosLocation(
  loc: LocationApi,
  timeoutMs: number = SOS_LOCATION_TIMEOUT_MS
): Promise<SosLocationResult> {
  try {
    let { status } = await loc.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await loc.requestForegroundPermissionsAsync());
    }
    if (status !== 'granted') return { ok: false, reason: 'permission_denied' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  try {
    const fresh = await withTimeout(
      loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.High }),
      timeoutMs
    );
    return toResult(fresh, 'fresh');
  } catch {
    // Timed out, or the provider errored (location services off, ...).
  }

  try {
    const lastKnown = await loc.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (lastKnown) return toResult(lastKnown, 'last_known');
  } catch {
    // fall through
  }
  return { ok: false, reason: 'unavailable' };
}
