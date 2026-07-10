from .base import *

DEBUG = False

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

CORS_ALLOWED_ORIGINS = [
    'https://neomatcare-frontend-production.up.railway.app',
]

CSRF_TRUSTED_ORIGINS = [
    'https://neomatcare-frontend-production.up.railway.app',
]

CORS_ALLOW_CREDENTIALS = True

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        }
    },
    'root': {'handlers': ['console'], 'level': 'INFO'},
}
