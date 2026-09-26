// Client-side format checks for immediate feedback. The backend enforces
// the same email/phone rules (backend/accounts/validators.py,
// emergency_contacts/serializers.py) — keep them in step. Each validator
// returns an error message, or null when the value is fine.

const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Enter your email address.';
  if (v.length > 254 || v.split('@')[0].length > 64 || !EMAIL_RE.test(v)) {
    return 'Enter a valid email address, e.g. name@example.com.';
  }
  return null;
}

const stripSeparators = (value: string) => value.replace(/[\s\-().]/g, '');

// South African number → "+27XXXXXXXXX", or null if it isn't one.
export function normalizeSAPhone(value: string): string | null {
  const c = stripSeparators(value);
  let national: string | null = null;
  if (c.startsWith('+27')) national = c.slice(3);
  else if (c.startsWith('0027')) national = c.slice(4);
  else if (c.startsWith('27') && c.length === 11) national = c.slice(2);
  else if (c.startsWith('0')) national = c.slice(1);
  return national && /^[1-8]\d{8}$/.test(national) ? `+27${national}` : null;
}

export function saPhoneError(value: string): string | null {
  if (!value.trim()) return 'Enter your phone number.';
  return normalizeSAPhone(value)
    ? null
    : 'Enter a valid South African phone number, e.g. 082 123 4567 or +27 82 123 4567.';
}

// Emergency contacts may live abroad: a valid SA number, or any plausible
// international number written with + and its country code.
export function contactPhoneError(value: string): string | null {
  if (!value.trim()) return 'Enter a phone number.';
  let c = stripSeparators(value);
  if (c.startsWith('00')) c = `+${c.slice(2)}`;
  const ok = c.startsWith('+') && !c.startsWith('+27')
    ? /^\+[1-9]\d{7,14}$/.test(c)
    : normalizeSAPhone(c) !== null;
  return ok
    ? null
    : 'Enter a valid phone number: a South African number like 082 123 4567, or an international number starting with + and the country code.';
}

// SA ID: YYMMDD SSSS C A Z — a real birth date, citizenship digit C of 0
// (citizen), 1 (permanent resident) or 2 (refugee), and a Luhn check digit Z.
export function isValidSAIdNumber(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  // Two-digit year: pick the century that doesn't put the birth date in
  // the future.
  const now = new Date();
  const century = yy > now.getFullYear() % 100 ? 1900 : 2000;
  const dob = new Date(century + yy, mm - 1, dd);
  if (dob.getMonth() !== mm - 1 || dob.getDate() !== dd || dob > now) return false;
  if (!['0', '1', '2'].includes(id[10])) return false;

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let d = Number(id[12 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// The register screen accepts an SA ID number or a passport number. Anything
// all-digits is treated as an SA ID and checked properly; otherwise it must
// look like a passport number (6-12 letters/digits, at least one digit).
export function idOrPassportError(value: string): string | null {
  const v = value.replace(/\s/g, '').toUpperCase();
  if (!v) return 'Enter your SA ID or passport number.';
  if (/^\d+$/.test(v)) {
    return isValidSAIdNumber(v)
      ? null
      : "That isn't a valid South African ID number — check all 13 digits.";
  }
  return /^(?=.*\d)[A-Z0-9]{6,12}$/.test(v)
    ? null
    : 'Enter a valid passport number (6–12 letters and numbers).';
}
