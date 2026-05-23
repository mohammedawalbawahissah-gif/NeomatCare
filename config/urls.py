from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/",        include("apps.accounts.urls")),
    path("api/",             include("apps.facilities.urls")),
    path("api/",             include("apps.cases.urls")),
    path("api/",             include("apps.referrals.urls")),
    path("api/",             include("apps.specialists.urls")),   # ← new
    path("api/transport/",   include("apps.transport.urls")),     # ← new
]
