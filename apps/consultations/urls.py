from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import SpecialistProfileViewSet, ConsultationViewSet, IceServersView

# Use SimpleRouter (no API root) to avoid conflicts
specialist_router = SimpleRouter()
specialist_router.register(r"specialists", SpecialistProfileViewSet, basename="specialist")

consultation_router = SimpleRouter()
consultation_router.register(r"", ConsultationViewSet, basename="consultation")

# specialist and ice-servers routes take priority — listed before the
# ConsultationViewSet's catch-all root registration, which would otherwise
# swallow them as a detail lookup (pk="ice-servers")
urlpatterns = (
    specialist_router.urls
    + [path("ice-servers/", IceServersView.as_view(), name="consultation-ice-servers")]
    + consultation_router.urls
)
