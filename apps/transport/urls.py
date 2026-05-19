from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TransportViewSet, TransportRequestViewSet

router = DefaultRouter()
router.register(r"",        TransportViewSet,        basename="transport")
router.register(r"requests",TransportRequestViewSet, basename="transport-request")

urlpatterns = [
    path("", include(router.urls)),
]
