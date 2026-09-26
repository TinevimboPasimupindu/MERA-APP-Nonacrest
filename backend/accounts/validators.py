# Input-format validators shared by every serializer that accepts an email
# address or a phone number. The mobile app (utils/validation.ts) and web
# app (src/utils/validation.js) run the same rules for immediate feedback;
# these are the ones that actually count.

import re

from rest_framework import serializers

# Stricter than DRF's EmailField/Django's EmailValidator, which still accept
# quoted local parts ("a b"@x.com), IP-literal domains (a@[127.0.0.1]) and
# consecutive dots. This is the "looks like an address people really use"
# shape: dot-separated atoms on both sides, a letters-only TLD of 2+.
#
# Deliberately does NOT reject all-digit local parts or domains
# (1242321@2323.com) — those are well-formed, and real providers issue them
# (e.g. QQ Mail's 12345678@qq.com). Whether an address can actually receive
# mail is proven by the registration OTP, not by its shape.
_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*"
    r"@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$"
)
EMAIL_FORMAT_MESSAGE = "Enter a valid email address, e.g. name@example.com."


def validate_email_format(value: str) -> str:
    value = (value or "").strip()
    local, _, _ = value.partition("@")
    if len(value) > 254 or len(local) > 64 or not _EMAIL_RE.match(value):
        raise serializers.ValidationError(EMAIL_FORMAT_MESSAGE)
    return value


# South African numbers: 0 + 9 digits locally, or +27 + the same 9 digits.
# The first of those 9 is 1-8 (01x-05x landlines, 06x-08x mobile/VoIP);
# 00/09 aren't allocated. Separators people type (spaces, dashes, brackets)
# are ignored. Stored normalized to +27XXXXXXXXX — the "+27" format the app
# already shows in placeholders and that Twilio needs (E.164).
_SA_PHONE_DIGITS_RE = re.compile(r"^[1-8]\d{8}$")
SA_PHONE_MESSAGE = "Enter a valid South African phone number, e.g. 082 123 4567 or +27 82 123 4567."


def normalize_sa_phone(value: str) -> str:
    cleaned = re.sub(r"[\s\-().]", "", value or "")
    if cleaned.startswith("+27"):
        national = cleaned[3:]
    elif cleaned.startswith("0027"):
        national = cleaned[4:]
    elif cleaned.startswith("27") and len(cleaned) == 11:
        national = cleaned[2:]
    elif cleaned.startswith("0"):
        national = cleaned[1:]
    else:
        national = None
    if national is None or not _SA_PHONE_DIGITS_RE.match(national):
        raise serializers.ValidationError(SA_PHONE_MESSAGE)
    return "+27" + national


# SA ID number or passport number — same rules as the mobile register
# screen (mobile-frontend/utils/validation.ts::idOrPassportError).
# All digits → treated as an SA ID: YYMMDD SSSS C A Z, where YYMMDD is a
# real, non-future birth date, C (citizenship) is 0 citizen / 1 permanent
# resident / 2 refugee, and Z is a Luhn check digit. Anything else must look
# like a passport number: 6-12 letters/digits with at least one digit.
SA_ID_MESSAGE = "That isn't a valid South African ID number — check all 13 digits."
SA_ID_DATE_MESSAGE = "The date of birth in this ID number isn't a real date — check the first 6 digits."
PASSPORT_MESSAGE = "Enter a valid passport number (6–12 letters and numbers)."
_PASSPORT_RE = re.compile(r"^(?=.*\d)[A-Z0-9]{6,12}$")


def _luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def sa_id_birth_date(id_number: str):
    # The birth date encoded in the first six digits, or None if it isn't a
    # real past date. Two-digit year: the century that doesn't put it in
    # the future.
    from datetime import date

    today = date.today()
    yy, mm, dd = int(id_number[0:2]), int(id_number[2:4]), int(id_number[4:6])
    year = (1900 if yy > today.year % 100 else 2000) + yy
    try:
        born = date(year, mm, dd)
    except ValueError:
        return None
    return born if born <= today else None


def normalize_id_or_passport(value: str) -> str:
    v = re.sub(r"\s", "", value or "").upper()
    if v.isdigit():
        if len(v) != 13 or v[10] not in "012" or not _luhn_valid(v):
            raise serializers.ValidationError(SA_ID_MESSAGE)
        if sa_id_birth_date(v) is None:
            raise serializers.ValidationError(SA_ID_DATE_MESSAGE)
        return v
    if not _PASSPORT_RE.match(v):
        raise serializers.ValidationError(PASSPORT_MESSAGE)
    return v


def _optional_sa_phone(value):
    # Blank stays blank — whether a field is required is each serializer's
    # own call (the model allows blank for every one of these).
    return normalize_sa_phone(value) if value else value


class SAPhoneFieldsMixin:
    # DRF only calls validate_<field> for fields a serializer actually
    # declares, so mixing this in is safe whichever subset it has.
    def validate_phone_number(self, value):
        return _optional_sa_phone(value)

    def validate_admin_phone(self, value):
        return _optional_sa_phone(value)

    def validate_dispatch_phone(self, value):
        return _optional_sa_phone(value)

    def validate_ed_phone(self, value):
        return _optional_sa_phone(value)
