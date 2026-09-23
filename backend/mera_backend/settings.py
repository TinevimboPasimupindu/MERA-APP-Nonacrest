"""
MERA Backend — Prototype settings.

Apps included: accounts, medical_profiles, verification,
               emergency_contacts, emergencies.

Apps removed: notifications, facilities
  - notifications: SMS/push replaced with logger.info stubs
  - facilities: non-registered facility outreach (not needed for prototype)

Also removed vs original repo:
  - channels / channels-redis / daphne  → no WebSockets needed
  - celery / redis / django-celery-beat/results → tasks are synchronous
  - twilio, anthropic, django-storages, boto3 → not needed locally
  - psycopg2 kept; PostgreSQL still required

Added back vs the above: cloudinary / django-cloudinary-storage — required
for the institution-onboarding document uploads (see CLOUDINARY_STORAGE
below). Not the same thing as django-storages/boto3 above (those were S3-
oriented and never used); Cloudinary is used instead because Render's
filesystem is ephemeral and local MEDIA_ROOT storage would lose every
uploaded document on the next deploy.

Required env vars:
  DJANGO_SECRET_KEY, DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
"""

import os
import sys
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")
# Server-side only, same as ANTHROPIC_API_KEY above — never sent to either
# frontend. See emergencies/services.py::get_route(), the only place this
# is read.
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY")
# Google OAuth client IDs — NOT secrets in the usual sense (client IDs are
# meant to be public and are already embedded in the mobile app as
# EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID), but
# they live here rather than hardcoded because accounts/serializers.py
# checks the verified Google ID token's `aud` claim against them — a token
# minted for a different app must not be accepted.
#
# Both are needed, not just the Web one, because of how
# expo-auth-session/providers/google actually behaves (confirmed by
# reading its installed source, not assumed): it picks the client id via
# Platform.select({ios: 'iosClientId', android: ..., default: 'webClientId'})
# — keyed on Platform.OS, which is 'ios' when running in Expo Go on an iOS
# device/simulator, NOT whether the build is "standalone" or not. So even
# under this project's current Expo-Go-only dev workflow, a real device
# test on iOS mints a token audienced to the iOS client id, not the Web
# one — a Web-only audience check would reject every real iOS test.
# Android is deferred (no SHA-1 fingerprint / Android client set up yet —
# see PROJECT_CONTEXT.md), so there's no GOOGLE_ANDROID_CLIENT_ID here.
GOOGLE_WEB_CLIENT_ID = os.environ.get("GOOGLE_WEB_CLIENT_ID")
GOOGLE_IOS_CLIENT_ID = os.environ.get("GOOGLE_IOS_CLIENT_ID")

# Email — Brevo's transactional email HTTP API, used for the patient-login
# email OTP step (see accounts/views.py::_send_otp_email /
# LoginView / VerifyOTPView / ResendOTPView).
#
# NOT Gmail SMTP, deliberately — that was the original approach and it's
# what caused a real production incident: Render's free tier blocks all
# outbound SMTP ports (25, 465, 587) at the platform level, as a documented
# anti-abuse policy, not a bug in this app's config. Every send_mail() call
# either hung (no EMAIL_TIMEOUT was set, so the blocked connection attempt
# never gave up) or failed, and the resulting stuck gunicorn worker got
# force-killed by gunicorn's own --timeout — logged as "Perhaps out of
# memory?", which is gunicorn's generic guess for any SIGKILL death, not
# a real memory reading. See PROJECT_CONTEXT.md for the full writeup.
# Brevo's API is plain HTTPS (port 443), which Render does not block.
#
# If PasswordResetRequestSerializer's still-stubbed email sending
# (accounts/serializers.py) ever gets wired up for real, it must go
# through this same Brevo path too — Django's SMTP EmailBackend cannot
# work on this host at all, for any feature, regardless of credentials.
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL")

# SMS — Twilio, used to notify a patient's emergency contacts (see
# emergencies/sms_service.py and services.confirm_sos / cancel_incident /
# select_destination_hospital). Called over Twilio's plain HTTPS REST API
# via httpx (same approach as the Google Routes call and the Brevo call
# above), not the `twilio` SDK — no new dependency for a single endpoint.
# All three unset = SMS quietly disabled (logged, never raised), so local
# dev and the test suite need no Twilio account. Twilio *trial* accounts
# can only message pre-verified numbers.
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER")
# Prepended to contact numbers saved in local format (leading 0) — the
# EmergencyContact.phone_number validator accepts those, but Twilio needs
# E.164. South Africa by default, matching the project's locale.
SMS_DEFAULT_COUNTRY_CODE = os.environ.get("SMS_DEFAULT_COUNTRY_CODE", "+27")
# TEMPORARY, for an unfunded Twilio trial account only: trial accounts may
# only send a fixed set of template names as the message body to
# international numbers (custom text is rejected with error 572006). When
# True, sms_service.send_sms() discards the real body and sends a template
# name instead — enough to verify the plumbing (timing, delay, cancel
# suppression, delivery) but NOT the message content. Leave False (or unset)
# on any funded account; flipping it back restores real content, nothing
# else changes.
TWILIO_TRIAL_MODE = os.environ.get("TWILIO_TRIAL_MODE", "False").strip().lower() in ("1", "true", "yes")

# The deployed web-frontend's own URL — used only to build links this
# backend emails out (currently just the password-reset link; see
# accounts/views.py::_send_password_reset_email), never returned in any
# API response body otherwise. Same "configurable via env var, sensible
# local-dev default" pattern as everything else on this page — defaults to
# Vite's own dev-server port so a reset link built while running
# `npm run dev` locally actually resolves to something real without
# needing a .env entry just to test this feature.
WEB_FRONTEND_URL = os.environ.get("WEB_FRONTEND_URL", "http://localhost:5173")

# Cloudinary — file storage for required institution-onboarding documents
# (Health Facility Certificate / CIPC Registration / EMS Operating License /
# HPCSA-DoH Registration — see accounts/serializers.py::HospitalAdminCreationSerializer
# and AmbulanceAdminCreationSerializer). Not local disk (MEDIA_ROOT), because
# Render's filesystem is ephemeral — anything written to disk is lost on the
# next deploy/restart, which would silently orphan every uploaded document.
# Uploads go through the `cloudinary` SDK directly
# (accounts/serializers.py::_upload_institutional_document ->
# cloudinary.uploader.upload), which picks up its credentials from the same
# three CLOUDINARY_* env vars read below — it does not need the
# django-cloudinary-storage *app* (`cloudinary_storage`) registered in
# INSTALLED_APPS; see the comment there for why that app must stay out.
# CLOUDINARY_STORAGE and DEFAULT_FILE_STORAGE remain for the older
# FileField-based InstitutionalDocument upload path, which does go through
# django-cloudinary-storage's storage class (importable by dotted path
# without the app installed). Same "secrets never go in Git" rule as every
# other credential here.
CLOUDINARY_STORAGE = {
    "CLOUD_NAME": os.environ.get("CLOUDINARY_CLOUD_NAME"),
    "API_KEY": os.environ.get("CLOUDINARY_API_KEY"),
    "API_SECRET": os.environ.get("CLOUDINARY_API_SECRET"),
}
DEFAULT_FILE_STORAGE = "cloudinary_storage.storage.MediaCloudinaryStorage"

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise Exception("DJANGO_SECRET_KEY environment variable is not set!")
DEBUG = os.environ.get("DEBUG", "True") == "True"
ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost 127.0.0.1").split()

# Render sets this automatically — add it to ALLOWED_HOSTS if present
RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")
if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

AUTH_USER_MODEL = "accounts.User"

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # "cloudinary" (the SDK) is the only Cloudinary entry here. Deliberately
    # NOT "cloudinary_storage" (the django-cloudinary-storage Django app):
    # that app ships its own `collectstatic` command which, once installed,
    # replaces Django's — and its copy_file() silently copies nothing unless
    # STATICFILES_STORAGE is Cloudinary's own static storage or
    # --upload-unhashed-files is passed. Here static files are served by
    # WhiteNoise (STATICFILES_STORAGE below), so with it installed
    # collectstatic copied zero files into STATIC_ROOT and WhiteNoise's
    # manifest post-processing then failed on the first file a CSS file
    # referenced ("The CSS file 'admin/css/base.css' references a file which
    # could not be found: admin/img/sorting-icons.svg") — which broke the
    # Render build.
    #
    # It was originally added on the mistaken belief that it "must be
    # registered before django.contrib.staticfiles". That ordering advice
    # only applies when Cloudinary is meant to host static files — the
    # opposite of this setup, where Cloudinary only stores uploaded
    # documents. Nothing here needs the app registered (see the comment on
    # CLOUDINARY_STORAGE above); DEFAULT_FILE_STORAGE's class is imported by
    # dotted path and works without it. Don't re-add it unless static files
    # are deliberately being moved to Cloudinary.
    "cloudinary",

    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",

    # MERA core apps
    "accounts.apps.AccountsConfig",
    "medical_profiles.apps.MedicalProfilesConfig",
    "verification.apps.VerificationConfig",
    "emergency_contacts.apps.EmergencyContactsConfig",
    "emergencies.apps.EmergenciesConfig",
    "chatbot.apps.ChatbotConfig",

    # Removed: notifications, facilities
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mera_backend.urls"
WSGI_APPLICATION = "mera_backend.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ── PostgreSQL ────────────────────────────────────────────────────────────── #
import dj_database_url

if os.environ.get("DATABASE_URL"):
    # Render (or any host providing a single connection string)
    DATABASES = {
        "default": dj_database_url.config(
            default=os.environ.get("DATABASE_URL"),
            conn_max_age=600,
            ssl_require=True,
        )
    }
else:
    # Local development
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME":     os.environ.get("DB_NAME",     "mera_db"),
            "USER":     os.environ.get("DB_USER",     "mera_user"),
            "PASSWORD": os.environ.get("DB_PASSWORD", "MERAAPPLICATION"),
            "HOST":     os.environ.get("DB_HOST",     "localhost"),
            "PORT":     os.environ.get("DB_PORT",     "5432"),
        }
    }

# ── Cache — in-memory (no Redis) ──────────────────────────────────────────── #
# DummyCache specifically during `manage.py test`: DRF's throttling
# framework (see REST_FRAMEWORK below) stores its per-caller request
# history here, and anonymous callers are keyed by IP — but Django's test
# client sends every single request in the entire test run from the same
# fake IP, regardless of which test or test class made it. With a real
# cache, the whole suite's anonymous calls (logins, Google sign-in,
# password-reset requests, etc., across many unrelated test classes) pile
# into one shared bucket and trip the anon throttle well before any
# specific test intends to exercise it — an actual observed failure mode
# during this feature's own rollout, not a hypothetical one. DummyCache
# implements the full cache API but never actually stores anything, so
# every throttle check sees "no prior requests" and always allows —
# equivalent to throttling being off, without touching
# DEFAULT_THROTTLE_CLASSES/RATES themselves (which wouldn't help anyway:
# DRF freezes DEFAULT_THROTTLE_RATES into each throttle class as a plain
# attribute at import time — see rest_framework/throttling.py's
# SimpleRateThrottle.THROTTLE_RATES — so it doesn't respond to an
# override_settings() applied later during a test run).
# accounts/tests.py::ThrottlingTest, which actually tests this feature,
# opts back into a real cache via its own class-level
# @override_settings(CACHES=...) — Django's cache *backend selection*
# (unlike DRF's per-class rate dict above) is override_settings-aware.
TESTING = "test" in sys.argv
CACHES = {
    "default": {
        "BACKEND": (
            "django.core.cache.backends.dummy.DummyCache"
            if TESTING
            else "django.core.cache.backends.locmem.LocMemCache"
        ),
    }
}

# Seconds between an SOS being confirmed and the initial SMS going out to the
# patient's emergency contacts (services.confirm_sos starts a threading.Timer
# for it — in-process on purpose, no Celery/Redis; see the module docstring
# at the top of this file). The gap is the patient's window to cancel a
# false alarm before contacts are told anything. 0 = no timer at all: the
# alert logic runs inline, which is what the test run does so no test ever
# spawns a real background thread.
SOS_ALERT_DELAY_SECONDS = float(
    os.environ.get("SOS_ALERT_DELAY_SECONDS", "0" if TESTING else "6")
)

# ── REST Framework ────────────────────────────────────────────────────────── #
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,

    # DRF's own throttling framework — previously entirely unconfigured (no
    # general request-frequency protection existed anywhere in this API
    # beyond the bespoke, feature-specific counters below: login lockout
    # after 5 wrong passwords, and the OTP generation/guess limits — see
    # accounts/views.py). This is a general baseline for every endpoint, not
    # a replacement for those — they solve a different problem each
    # (account-security lockout, OTP-inbox-spam prevention) and stay as-is.
    #
    # anon/user are the global defaults, generous enough not to interfere
    # with normal usage (this app polls several screens every 10-15s — see
    # PROJECT_CONTEXT.md's live-location-tracking writeup — so a single
    # active session can easily produce a handful of requests per minute)
    # while still bounding a tight-loop spam script to a fixed ceiling
    # instead of unlimited. The two named scopes below are deliberately far
    # stricter than the general default, for endpoints where a single
    # request has a real external cost per call (a Brevo email, a Cloudinary
    # upload) that the general per-minute ceiling doesn't adequately bound —
    # see TriggerPasswordResetView and HospitalAdminCreateView/
    # AmbulanceAdminCreateView/InstitutionalDocumentUploadView respectively.
    #
    # Caveat worth knowing: throttle state is stored in CACHES (LocMemCache,
    # see above — no Redis) and is therefore per-process, not shared across
    # gunicorn's `--workers 2` on Render. A client's effective ceiling in
    # production can be up to ~2x whatever's configured here, depending on
    # which worker handles each request. Not fixed here (would need a
    # shared cache backend like Redis, which this prototype deliberately
    # doesn't run) — the limits below are chosen generously enough that this
    # doesn't matter for their intended purpose (stopping unbounded spam,
    # not enforcing an exact quota).
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "30/min",
        "user": "100/min",
        # TriggerPasswordResetView — sends one real Brevo email per call.
        "password_reset_trigger": "5/hour",
        # HospitalAdminCreateView / AmbulanceAdminCreateView /
        # InstitutionalDocumentUploadView — each triggers real Cloudinary
        # upload call(s). Deliberately one shared scope across all three:
        # DRF's ScopedRateThrottle keys on (scope, caller), so a MERA admin
        # splitting calls across the two creation endpoints still hits one
        # combined ceiling, matching the shared underlying cost (Cloudinary
        # quota) this is actually bounding — not per-endpoint-type quota.
        "institutional_documents": "20/hour",
        # NFCTagTriggerView (emergencies/views.py) — the one endpoint in
        # this app that's fully public/unauthenticated AND can create real
        # side effects (an Incident, emergency-contact SMS). Keyed per-
        # TOKEN, not per-IP (see NFCTagTriggerThrottle's own comment) —
        # a leaked/scanned tag URL could otherwise be replayed
        # indefinitely from many different callers. 5/hour is generous for
        # legitimate retries (a bystander's network hiccup) while bounding
        # how many times any single physical tag can be retriggered.
        # Accepted as a residual risk at the same tier as the three
        # documented prototype bypasses — see PROJECT_CONTEXT.md.
        "nfc_trigger": "5/hour",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME":  timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS":  True,
    "AUTH_HEADER_TYPES":      ("Bearer",),
}

CORS_ALLOW_ALL_ORIGINS = True

# ── Static & Media ────────────────────────────────────────────────────────── #
STATIC_URL  = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
MEDIA_URL   = "/media/"
MEDIA_ROOT  = BASE_DIR / "media"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE     = "Africa/Johannesburg"
USE_I18N      = True
USE_TZ        = True

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
