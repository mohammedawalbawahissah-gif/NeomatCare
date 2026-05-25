from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    VehicleViewSet,
    TransportRequestViewSet,
    DriverViewSet
)

router = DefaultRouter()

# Core endpoints
router.register(r"vehicles", VehicleViewSet, basename="vehicle")
router.register(r"requests", TransportRequestViewSet, basename="transport-request")

# NEW: driver endpoint for dropdowns
router.register(r"drivers", DriverViewSet, basename="driver")


urlpatterns = [
    path("", include(router.urls)),
]