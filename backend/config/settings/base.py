"""
config/settings/base.py
-----------------------
Settings shared across all environments.
Dev and prod override or extend these.
"""

from pathlib import Path
from datetime import timedelta
import environ
import dj_database_url
import os


# ── Base directory ────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent.parent


# ── Environment variables ────────────────────────────────────────────────
env = environ.Env()

environ.Env.read_env(os.path.join(BASE_DIR, ".env"))


# ── Core settings ────────────────────────────────────────────────────────
SECRET_KEY = env("DJANGO_SECRET_KEY")

DEBUG = env.bool("DJANGO_DEBUG", default=False)

ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])


# ── Apps ─────────────────────────────────────────────────────────────────
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "drf_spectacular",
    "django_filters",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.facilities",
    "apps.cases",
    "apps.referrals",
    "apps.transport",
    "apps.consultations",
    "apps.ai",
    "apps.notifications",
    "apps.wellness",
    "apps.voice",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS


# ── Middleware ───────────────────────────────────────────────────────────
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# ── URL / WSGI ───────────────────────────────────────────────────────────
ROOT_URLCONF = "config.urls"

WSGI_APPLICATION = "config.wsgi.application"


# ── Templates ────────────────────────────────────────────────────────────
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


# ── Database ─────────────────────────────────────────────────────────────
DB_SCHEMA = env("DB_SCHEMA", default="public")

DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get("DATABASE_URL"),
        conn_max_age=600,
        ssl_require=False,  
    )
}

DATABASES["default"]["ATOMIC_REQUESTS"] = True

if DB_SCHEMA != "public":
    DATABASES["default"].setdefault("OPTIONS", {})
    DATABASES["default"]["OPTIONS"]["options"] = f"-c search_path={DB_SCHEMA}"


# ── Custom user model ────────────────────────────────────────────────────
AUTH_USER_MODEL = "accounts.User"


# ── Password validation ──────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"
    },
]


# ── Internationalisation ─────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"

TIME_ZONE = "Africa/Accra"

USE_I18N = True

USE_TZ = True


# ── Static files ─────────────────────────────────────────────────────────
STATIC_URL = "/static/"

STATIC_ROOT = BASE_DIR / "staticfiles"

STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"


# ── Default primary key field ────────────────────────────────────────────
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# ── Django REST Framework ────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    # Global baseline throttle — every endpoint gets this floor even where
    # nothing more specific is set. AnonRateThrottle/UserRateThrottle
    # consume the "anon"/"user" rates below by DRF's own naming
    # convention. This used to be dead config (rates defined, no
    # throttle classes ever activated) — real protection on the specific
    # sensitive endpoints (login, OTP, referral AI mode) comes from
    # separate, working mechanisms (django-ratelimit decorators in
    # apps/accounts/views.py; the in-method check in
    # apps/referrals/views.py's ReferralSuggestView) — this is a second,
    # broader layer covering everything else that had no protection at all.
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "20/min",
        "user": "100/min",
    },
}


# ── JWT ──────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=env.int("ACCESS_TOKEN_LIFETIME_MINUTES", default=15)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=env.int("REFRESH_TOKEN_LIFETIME_DAYS", default=7)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}


# ── API Documentation ────────────────────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "Maternal & Neonatal Emergency Referral API",
    "DESCRIPTION": (
        "AI-assisted emergency referral system for obstetric and neonatal care. "
        "Supports frontline health workers in routing emergencies."
    ),
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_SETTINGS": {
        "persistAuthorization": True,
    },
}


# ── CORS ─────────────────────────────────────────────────────────────────

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://neomatcare-1iik.onrender.com",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://neomatcare-1iik.onrender.com",
]

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
]

# ── Email (SMTP — set via environment variables) ──────────────────────────────
EMAIL_BACKEND    = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST       = env("EMAIL_HOST",       default="smtp.gmail.com")
EMAIL_PORT       = env.int("EMAIL_PORT",   default=587)
EMAIL_USE_TLS    = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_HOST_USER  = env("EMAIL_HOST_USER",  default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL  = env("DEFAULT_FROM_EMAIL",  default="NeoMatCare <noreply@neomatcare.gh>")
# Unset, Django's SMTP backend has no ceiling on a hung connection. Now that
# delivery runs on a background thread (see apps/notifications/services.py)
# a hang there no longer blocks a request, but it would otherwise sit on a
# pool thread indefinitely — bound it explicitly.
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=10)

# ── SMS (Africa's Talking — set via environment variables) ──────────────────
# Railway's env vars are named AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY.
# These were previously read as AT_USERNAME/AT_API_KEY, which don't exist on
# Railway at all — that mismatch meant every deploy silently fell back to
# username="sandbox", api_key="" and every SMS send failed AT's auth check.
AT_USERNAME = env("AFRICASTALKING_USERNAME", default="sandbox")
AT_API_KEY  = env("AFRICASTALKING_API_KEY", default="")

# ── Voice (GhanaNLP Khaya AI — local-language STT/TTS) ───────────────────────
# Sign up at https://translation.ghananlp.org/ to get a key. Free tier is
# 100 calls — enough for development/demo, not production volume.
KHAYA_API_KEY = env("KHAYA_API_KEY", default="")

# ── Voice (Google Cloud Speech-to-Text — Hausa fallback) ─────────────────────
# Optional. Only used for languages Khaya doesn't cover (currently: Hausa).
# Leave unset to disable Hausa dictation without affecting anything else.
GOOGLE_CLOUD_STT_API_KEY = env("GOOGLE_CLOUD_STT_API_KEY", default="")

# ── TURN relay (Xirsys + Twilio Network Traversal Service) ───────────────────
# Both are optional and independent — configure one, both, or neither. Both
# configured means both providers' TURN servers are offered to the ICE agent
# as candidates for redundancy (failover if one provider is unreachable from
# a given network), not combined/duplicated relay for the same call.
# Sign up at https://xirsys.com/ and https://www.twilio.com/ for credentials.
XIRSYS_IDENT   = env("XIRSYS_IDENT", default="")
XIRSYS_SECRET  = env("XIRSYS_SECRET", default="")
XIRSYS_CHANNEL = env("XIRSYS_CHANNEL", default="")
TWILIO_ACCOUNT_SID = env("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN  = env("TWILIO_AUTH_TOKEN", default="")

# ── Cache (Redis — required in production for multi-step USSD sessions) ─────
# apps/referrals/ussd_session.py stores in-progress USSD session state here
# (which screen a health worker is on, what they've entered so far) keyed by
# Africa's Talking's sessionId, between one HTTP callback and the next.
#
# Gunicorn runs multiple worker PROCESSES (see Procfile: --workers 2). The
# default LocMemCache is PER-PROCESS — a session started on worker A and
# continued on worker B (Africa's Talking has no reason to hit the same
# process twice) would silently lose its state, breaking the session
# roughly half the time with 2 workers. This is why REDIS_URL matters here
# specifically, even though the rest of the app has gotten away without a
# shared cache so far.
#
# Set REDIS_URL in production (e.g. add a Redis service on Railway and
# reference its REDIS_URL). Without it, this falls back to LocMemCache,
# which is fine for local development (`manage.py runserver` is one
# process) but NOT safe for a multi-worker deployment.
REDIS_URL = env("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        }
    }