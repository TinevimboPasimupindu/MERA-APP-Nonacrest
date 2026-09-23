// Run with: npm test  (Node's built-in test runner — no extra dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPosition } from './geolocation.js';

const fakeGeo = (behaviour) => ({
  getCurrentPosition: (ok, err, opts) => behaviour(ok, err, opts),
});

test('resolves with rounded coordinates and accuracy on success', async () => {
  const geo = fakeGeo((ok) =>
    ok({ coords: { latitude: -26.20410049, longitude: 28.04730051, accuracy: 9.5 } })
  );
  const result = await requestPosition(geo);
  assert.deepEqual(result, { ok: true, latitude: -26.204100, longitude: 28.047301, accuracy: 9.5 });
});

test('permission denied (code 1) -> reason "denied"', async () => {
  const geo = fakeGeo((_ok, err) => err({ code: 1 }));
  assert.deepEqual(await requestPosition(geo), { ok: false, reason: 'denied' });
});

test('position unavailable (code 2) -> reason "unavailable"', async () => {
  const geo = fakeGeo((_ok, err) => err({ code: 2 }));
  assert.deepEqual(await requestPosition(geo), { ok: false, reason: 'unavailable' });
});

test('timeout (code 3) -> reason "timeout"', async () => {
  const geo = fakeGeo((_ok, err) => err({ code: 3 }));
  assert.deepEqual(await requestPosition(geo), { ok: false, reason: 'timeout' });
});

test('missing geolocation API -> "unavailable" (never rejects)', async () => {
  assert.deepEqual(await requestPosition(undefined), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await requestPosition({}), { ok: false, reason: 'unavailable' });
});

test('synchronous throw (e.g. insecure context) -> "unavailable"', async () => {
  const geo = fakeGeo(() => {
    throw new Error('Only secure origins are allowed');
  });
  assert.deepEqual(await requestPosition(geo), { ok: false, reason: 'unavailable' });
});

test('passes the configured timeout and high accuracy through to the browser', async () => {
  let seen;
  const geo = fakeGeo((ok, _err, opts) => {
    seen = opts;
    ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } });
  });
  await requestPosition(geo, { timeoutMs: 6000 });
  assert.equal(seen.timeout, 6000);
  assert.equal(seen.enableHighAccuracy, true);
});

test('only the first callback counts if the browser calls back twice', async () => {
  const geo = fakeGeo((ok, err) => {
    ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 } });
    err({ code: 1 });
  });
  const result = await requestPosition(geo);
  assert.equal(result.ok, true);
});
