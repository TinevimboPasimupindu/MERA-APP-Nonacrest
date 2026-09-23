// Run with: npm test  (Node's built-in test runner — no extra dependencies)
import test from 'node:test';
import assert from 'node:assert/strict';
import { copyText } from './clipboard.js';

// Minimal fake DOM for the execCommand fallback.
function fakeDocument({ execResult = true, throwOnExec = false } = {}) {
  const state = { appended: [], removed: [], copiedValue: null };
  const doc = {
    body: {
      appendChild: (el) => state.appended.push(el),
      removeChild: (el) => state.removed.push(el),
    },
    createElement: () => ({
      style: {},
      setAttribute() {},
      focus() {},
      select() {},
      setSelectionRange() {},
    }),
    execCommand: (cmd) => {
      if (throwOnExec) throw new Error('nope');
      state.copiedValue = state.appended.at(-1)?.value;
      return cmd === 'copy' && execResult;
    },
  };
  return { doc, state };
}

test('uses the async Clipboard API when available', async () => {
  let written = null;
  const nav = { clipboard: { writeText: async (t) => { written = t; } } };
  const ok = await copyText('https://x/nfc/abc', { navigator: nav, document: undefined });
  assert.equal(ok, true);
  assert.equal(written, 'https://x/nfc/abc');
});

test('insecure context (navigator.clipboard undefined) falls back to execCommand — the original bug', async () => {
  const { doc, state } = fakeDocument();
  const ok = await copyText('https://x/nfc/abc', { navigator: {}, document: doc });
  assert.equal(ok, true);
  assert.equal(state.copiedValue, 'https://x/nfc/abc');
  assert.equal(state.removed.length, 1); // temp textarea cleaned up
});

test('writeText rejecting falls back to execCommand instead of failing silently', async () => {
  const nav = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
  const { doc, state } = fakeDocument();
  assert.equal(await copyText('abc', { navigator: nav, document: doc }), true);
  assert.equal(state.copiedValue, 'abc');
});

test('reports failure (false) when both paths fail — never throws', async () => {
  const nav = { clipboard: { writeText: async () => { throw new Error('denied'); } } };
  assert.equal(await copyText('abc', { navigator: nav, document: fakeDocument({ execResult: false }).doc }), false);
  assert.equal(await copyText('abc', { navigator: nav, document: fakeDocument({ throwOnExec: true }).doc }), false);
  assert.equal(await copyText('abc', { navigator: {}, document: undefined }), false);
});

test('fallback textarea is removed even when execCommand throws', async () => {
  const { doc, state } = fakeDocument({ throwOnExec: true });
  await copyText('abc', { navigator: {}, document: doc });
  assert.equal(state.removed.length, 1);
});
