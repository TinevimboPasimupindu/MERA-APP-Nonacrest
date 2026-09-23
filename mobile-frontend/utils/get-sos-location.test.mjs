// Run with: npm test  (Node's built-in test runner + native TypeScript
// stripping — no extra dependencies).
import test from 'node:test';
import assert from 'node:assert/strict';
import { getSosLocation, LAST_KNOWN_MAX_AGE_MS } from './get-sos-location.ts';

const pos = (lat, lng, acc = 10) => ({ coords: { latitude: lat, longitude: lng, accuracy: acc } });

// Builds a fake expo-location; every method is overridable and records calls.
function fakeLoc(overrides = {}) {
  const calls = { request: 0, current: 0, lastKnown: 0, lastKnownOpts: null };
  const loc = {
    Accuracy: { High: 5 },
    getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    requestForegroundPermissionsAsync: async () => {
      calls.request += 1;
      return { status: 'granted' };
    },
    getCurrentPositionAsync: async () => {
      calls.current += 1;
      return pos(-26.2041, 28.0473);
    },
    getLastKnownPositionAsync: async (opts) => {
      calls.lastKnown += 1;
      calls.lastKnownOpts = opts;
      return null;
    },
    ...overrides,
  };
  return { loc, calls };
}

test('granted + fresh fix -> ok, rounded to 6dp, source "fresh"', async () => {
  const { loc, calls } = fakeLoc({
    getCurrentPositionAsync: async () => pos(-26.20410049, 28.04730051, 7),
  });
  const r = await getSosLocation(loc);
  assert.deepEqual(r, { ok: true, latitude: -26.2041, longitude: 28.047301, accuracy: 7, source: 'fresh' });
  assert.equal(calls.request, 0); // already granted -> no prompt
});

test('not yet granted -> asks once, then proceeds when the user allows', async () => {
  let asked = 0;
  const { loc } = fakeLoc({
    getForegroundPermissionsAsync: async () => ({ status: 'undetermined' }),
    requestForegroundPermissionsAsync: async () => {
      asked += 1;
      return { status: 'granted' };
    },
  });
  const r = await getSosLocation(loc);
  assert.equal(r.ok, true);
  assert.equal(asked, 1);
});

test('permission denied -> blocked with reason "permission_denied", no location calls', async () => {
  let current = 0;
  let lastKnown = 0;
  const { loc } = fakeLoc({
    getForegroundPermissionsAsync: async () => ({ status: 'denied' }),
    requestForegroundPermissionsAsync: async () => ({ status: 'denied' }),
    getCurrentPositionAsync: async () => {
      current += 1;
      return pos(0, 0);
    },
    getLastKnownPositionAsync: async () => {
      lastKnown += 1;
      return pos(0, 0);
    },
  });
  const r = await getSosLocation(loc);
  assert.deepEqual(r, { ok: false, reason: 'permission_denied' });
  assert.equal(current, 0);
  assert.equal(lastKnown, 0);
});

test('location services off (getCurrentPosition throws) + no last-known -> blocked "unavailable"', async () => {
  const { loc } = fakeLoc({
    getCurrentPositionAsync: async () => {
      throw new Error('Location provider is unavailable');
    },
  });
  assert.deepEqual(await getSosLocation(loc), { ok: false, reason: 'unavailable' });
});

test('fresh fix times out -> falls back to last-known position (with a max age)', async () => {
  let seenOpts = null;
  const { loc } = fakeLoc({
    getCurrentPositionAsync: () => new Promise(() => {}), // never resolves
    getLastKnownPositionAsync: async (opts) => {
      seenOpts = opts;
      return pos(-26.3, 28.1, 50);
    },
  });
  const r = await getSosLocation(loc, 30); // 30ms timeout for the test
  assert.deepEqual(r, { ok: true, latitude: -26.3, longitude: 28.1, accuracy: 50, source: 'last_known' });
  assert.equal(seenOpts.maxAge, LAST_KNOWN_MAX_AGE_MS);
});

test('fresh fix times out AND no last-known -> blocked "unavailable" (never hangs)', async () => {
  const { loc } = fakeLoc({ getCurrentPositionAsync: () => new Promise(() => {}) });
  const started = Date.now();
  const r = await getSosLocation(loc, 30);
  assert.deepEqual(r, { ok: false, reason: 'unavailable' });
  assert.ok(Date.now() - started < 2000);
});

test('provider error falls back to last-known when one exists', async () => {
  const { loc } = fakeLoc({
    getCurrentPositionAsync: async () => {
      throw new Error('boom');
    },
    getLastKnownPositionAsync: async () => pos(1, 2, null),
  });
  const r = await getSosLocation(loc);
  assert.deepEqual(r, { ok: true, latitude: 1, longitude: 2, accuracy: null, source: 'last_known' });
});

test('last-known lookup itself throwing is treated as "no location"', async () => {
  const { loc } = fakeLoc({
    getCurrentPositionAsync: async () => {
      throw new Error('x');
    },
    getLastKnownPositionAsync: async () => {
      throw new Error('y');
    },
  });
  assert.deepEqual(await getSosLocation(loc), { ok: false, reason: 'unavailable' });
});

test('permission check throwing -> blocked "unavailable", not an unhandled rejection', async () => {
  const { loc } = fakeLoc({
    getForegroundPermissionsAsync: async () => {
      throw new Error('native module missing');
    },
  });
  assert.deepEqual(await getSosLocation(loc), { ok: false, reason: 'unavailable' });
});
