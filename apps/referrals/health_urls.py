"""
apps/referrals/health_urls.py
------------------------------
GET /api/health/

Returns system health status for deployment platform probes (Render, Railway).
Checks DB connectivity and returns uptime info.
No authentication required — probes run before auth is available.
"""
from django.urls import path
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone


def health_check(request):
    db_ok = False
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        pass

    payload = {
        "status":    "ok" if db_ok else "degraded",
        "db":        "ok" if db_ok else "unreachable",
        "timestamp": timezone.now().isoformat(),
    }
    status_code = 200 if db_ok else 503
    return JsonResponse(payload, status=status_code)


urlpatterns = [
    path("", health_check, name="health-check"),
]
