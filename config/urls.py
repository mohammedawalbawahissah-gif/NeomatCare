"""
config/urls.py
--------------
Root URL configuration.
Each app registers its own urls.py — we just include them here.
"""
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerUIView

urlpatterns = [
    # Django admin (keep for superuser management)
    path("admin/", admin.site.urls),

    # App routes
    path("api/auth/",        include("apps.accounts.urls")),
    path("api/facilities/",  include("apps.facilities.urls")),
    path("api/emergency-cases/", include("apps.cases.urls")),
    path("api/referrals/",   include("apps.referrals.urls")),

    # API documentation
    path("api/schema/",      SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/",        SpectacularSwaggerUIView.as_view(url_name="schema"), name="swagger-ui"),

    # Health check
    path("api/health/",      include("apps.referrals.health_urls")),
]
