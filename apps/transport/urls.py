from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import VehicleViewSet, TransportRequestViewSet

router = DefaultRouter()
# Mounts at /api/transport/ — so list/create is /api/transport/
# and requests is /api/transport/requests/
router.register(r"requests", TransportRequestViewSet, basename="transport-request")

urlpatterns = [
    # /api/transport/          → list + create vehicles
    # /api/transport/available/ → available vehicles
    path("",          VehicleViewSet.as_view({"get": "list", "post": "create"})),
    path("<uuid:pk>/", VehicleViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"})),
    path("available/", VehicleViewSet.as_view({"get": "available"})),
] + router.urls
