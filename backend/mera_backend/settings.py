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

# Email — Gmail SMTP, used for the patient-login email OTP step (see
# accounts/views.py::LoginView / VerifyOTPView / ResendOTPView). This is
# the first real outbound email in this backend — PasswordResetRequestSerializer
# still only stubs email sending (see that serializer's own comment). Django's
# test runner automatically swaps EMAIL_BACKEND for an in-memory one during
# `manage.py test` (captured in django.core.mail.outbox), so tests never hit
# real Gmail SMTP regardless of what's configured here or whether
# EMAIL_HOST_USER/PASSWORD are set in a given environment's .env.
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER")
# A Gmail *app password*, not the account's real login password — Gmail
# requires this for SMTP access when 2FA is enabled on the sending account
# (and rejects the real password outright if it is). Same "secrets never go
# in Git" rule as every other credential in this project.
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = EMAIL_HOST_USER

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
