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
    "DEFAULT_THROTTLE_RATES": {
        "anon": "20/min",
        "user": "100/min",
        "auth": "5/min",
        "suggest": "30/min",
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

# ── SMS (SMTP — set via environment variables) ──────────────────────────────
AT_USERNAME = env("neomatcare", default="sandbox")
AT_API_KEY  = env("atsk_ae86d3e06506a870a7af29c7c0190090f070e2b0767b75b508fb5341bfc80599fb1b4324", default="")