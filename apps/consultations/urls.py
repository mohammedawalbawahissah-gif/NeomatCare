from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SpecialistProfileViewSet, ConsultationViewSet

router = DefaultRouter()
router.register(r"specialists",   SpecialistProfileViewSet, basename="specialist")
router.register(r"",              ConsultationViewSet,       basename="consultation")

urlpatterns = [
    path("", include(router.urls)),
]
