from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.db import connection

def health_check(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False

    return JsonResponse(
        {"status": "ok" if db_ok else "degraded", "database": db_ok},
        status=200 if db_ok else 503,
    )
urlpatterns = [
    path("admin/",             admin.site.urls),
    path("api/health/",        include("apps.referrals.health_urls")),
    path("api/auth/",          include("apps.accounts.urls")),
    path("api/facilities/",    include("apps.facilities.urls")),   # was api/
    path("api/cases/",         include("apps.cases.urls")),        # was api/
    path("api/patients/",      include("apps.cases.urls")),        # patient portal root alias
    path("api/referrals/",     include("apps.referrals.urls")),    # was api/
    path("api/transport/",     include("apps.transport.urls")),
    path("api/consultations/", include("apps.consultations.urls")),
    path("api/ai/",            include("apps.ai.urls")),
    path("api/health/",        health_check),
]