"""
config/urls.py
--------------
Root URL configuration.
Each app registers its own urls.py — we just include them here.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

urlpatterns = [
    path("", RedirectView.as_view(url="/api/docs/"), name="root"),
    path("admin/", admin.site.urls),
    path("api/auth/",             include("apps.accounts.urls")),
    path("api/facilities/",       include("apps.facilities.urls")),
    path("api/emergency-cases/",  include("apps.cases.urls")),
    path("api/referrals/",        include("apps.referrals.urls")),
    path("api/schema/",  SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/",    SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/",   SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/health/",  include("apps.referrals.health_urls")),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns = [path("__debug__/", include(debug_toolbar.urls))] + urlpatterns
