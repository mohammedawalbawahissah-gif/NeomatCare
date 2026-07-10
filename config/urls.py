from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/",             admin.site.urls),
    path("api/health/",        include("apps.referrals.health_urls")),
    path("api/auth/",          include("apps.accounts.urls")),
    path("api/facilities/",    include("apps.facilities.urls")),   # was api/
    path("api/cases/",         include("apps.cases.urls")),        # was api/
    path("api/patients/",       include("apps.cases.urls")),        # patient portal root alias
    path("api/referrals/",     include("apps.referrals.urls")),    # was api/
    path("api/transport/",     include("apps.transport.urls")),
    path("api/consultations/", include("apps.consultations.urls")),
]