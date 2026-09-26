// Client-side format checks for immediate feedback. The backend enforces
// the same rules (backend/accounts/validators.py) — keep them in step.
// Each validator returns an error message, or null when the value is fine.

const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function emailError(value) {
  const v = (value || '').trim();
  if (!v) return 'Enter an email address.';
  if (v.length > 254 || v.split('@')[0].length > 64 || !EMAIL_RE.test(v)) {
    return 'Enter a valid email address, e.g. name@example.com.';
  }
  return null;
}

// South African numbers only: 0XX XXX XXXX or +27 XX XXX XXXX.
export function saPhoneError(value) {
  const c = (value || '').replace(/[\s\-().]/g, '');
  let national = null;
  if (c.startsWith('+27')) national = c.slice(3);
  else if (c.startsWith('0027')) national = c.slice(4);
  else if (c.startsWith('27') && c.length === 11) national = c.slice(2);
  else if (c.startsWith('0')) national = c.slice(1);
  return national && /^[1-8]\d{8}$/.test(national)
    ? null
    : 'Enter a valid South African phone number, e.g. 082 123 4567 or +27 82 123 4567.';
}

const PHONE_FIELDS = new Set(['phone_number', 'admin_phone', 'dispatch_phone', 'ed_phone']);

// Checks every email/phone field present in a form. Phone fields are
// optional on these forms, so a blank one is fine; the first problem found
// is returned with its field's label so the admin knows which box to fix.
export function formFormatError(form, fields) {
  for (const f of fields) {
    const value = form[f.name];
    let msg = null;
    if (f.name === 'email') msg = emailError(value);
    else if (PHONE_FIELDS.has(f.name) && (value || '').trim()) msg = saPhoneError(value);
    if (msg) return `${f.label}: ${msg}`;
  }
  return null;
}

// DRF errors come back as {field: ["message"]} — surface the first one,
// labelled, instead of a generic "check the fields".
export function firstFieldError(err, fields) {
  if (!err) return null;
  for (const f of fields) {
    const msg = Array.isArray(err[f.name]) ? err[f.name][0] : err[f.name];
    if (msg) return `${f.label}: ${msg}`;
  }
  return null;
}
