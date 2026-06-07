from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import SpecialistProfileViewSet, ConsultationViewSet

# Use SimpleRouter (no API root) to avoid conflicts
specialist_router = SimpleRouter()
specialist_router.register(r"specialists", SpecialistProfileViewSet, basename="specialist")

consultation_router = SimpleRouter()
consultation_router.register(r"", ConsultationViewSet, basename="consultation")

# specialist routes take priority — listed first
urlpatterns = specialist_router.urls + consultation_router.urls
