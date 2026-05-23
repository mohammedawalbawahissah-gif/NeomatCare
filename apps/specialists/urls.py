from rest_framework.routers import DefaultRouter
from .views import SpecialistProfileViewSet

router = DefaultRouter()
router.register(r"specialists", SpecialistProfileViewSet, basename="specialist")

urlpatterns = router.urls
