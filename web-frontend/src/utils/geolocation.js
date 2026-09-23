// Location lookup for the public NFC page (pages/public/NFCTrigger.jsx).
//
// Wraps navigator.geolocation.getCurrentPosition in a promise that NEVER
// rejects — it always resolves to either a position or a categorised
// failure, so the page can map each failure to the same "MERA needs your
// location" blocking state without try/catch plumbing:
//   { ok: true,  latitude, longitude, accuracy }
//   { ok: false, reason: 'denied' | 'unavailable' | 'timeout' }
//
// `geo` is injected (pass navigator.geolocation) so this is testable in
// plain Node with a fake — see geolocation.test.js.
//
// Note on `timeoutMs`: per the Geolocation spec the browser's timeout does
// NOT start counting until the user has answered the permission prompt, so
// a bystander who simply ignores the prompt leaves this pending (the page
// keeps showing "Getting your location…" next to a visible prompt) rather
// than timing out. The timeout covers a granted permission with no fix.

export const LOCATION_TIMEOUT_MS = 8000;

// A fix up to 30s old is accepted (maximumAge) — a bystander's phone very
// often has a fresh one cached, and it gets the alert out faster than
// waiting for a new one. Comparable in spirit to the mobile app's
// last-known-position fallback.
const MAX_AGE_MS = 30000;

// The backend stores 6 decimal places (Incident.latitude is DecimalField
// max_digits=9, decimal_places=6) and DRF rejects more digits than that.
const round6 = (n) => Number(n.toFixed(6));

export function requestPosition(geo, { timeoutMs = LOCATION_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    if (!geo || typeof geo.getCurrentPosition !== 'function') {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }

    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      geo.getCurrentPosition(
        (pos) =>
          settle({
            ok: true,
            latitude: round6(pos.coords.latitude),
            longitude: round6(pos.coords.longitude),
            accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
          }),
        (err) => {
          // GeolocationPositionError codes: 1 PERMISSION_DENIED,
          // 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
          const reason = err?.code === 1 ? 'denied' : err?.code === 3 ? 'timeout' : 'unavailable';
          settle({ ok: false, reason });
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: MAX_AGE_MS }
      );
    } catch {
      // Some browsers throw synchronously (e.g. insecure context).
      settle({ ok: false, reason: 'unavailable' });
    }
  });
}
