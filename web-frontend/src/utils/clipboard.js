// Copy text to the clipboard — resolves true/false, never throws.
//
// Why this exists (NFC tag "Copy" buttons did nothing): the old handler was
// `navigator.clipboard?.writeText(text).catch(() => {})`. That silently does
// nothing in two common situations:
//   1. navigator.clipboard is UNDEFINED outside a secure context — i.e. the
//      admin portal opened over plain http:// (a LAN dev URL like
//      http://192.168.x.x:5173, or any non-HTTPS host). The `?.` swallowed
//      that and there was no fallback.
//   2. writeText() rejects (permissions policy, document not focused) and
//      the empty .catch() hid it.
// So: try the async Clipboard API, and on any failure (or if it's missing)
// fall back to a hidden <textarea> + document.execCommand('copy'), which
// works over http. The caller gets a boolean so the UI can show "Copied!" or
// an honest failure instead of silence.
//
// `env` is injectable (navigator + document) so this is testable in plain
// Node — see clipboard.test.js.

export async function copyText(text, env = { navigator: globalThis.navigator, document: globalThis.document }) {
  const nav = env.navigator;
  const doc = env.document;

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }

  if (!doc?.body || typeof doc.createElement !== 'function') return false;

  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // Off-screen but still selectable (display:none would make select() a no-op).
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  doc.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange?.(0, text.length);
    return Boolean(doc.execCommand('copy'));
  } catch {
    return false;
  } finally {
    doc.body.removeChild(area);
  }
}
