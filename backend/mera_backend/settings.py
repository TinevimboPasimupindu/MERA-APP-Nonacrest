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

Required env vars:
  DJANGO_SECRET_KEY, DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
"""

import os
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
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

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
