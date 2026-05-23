from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend
from .models import SpecialistProfile
from .serializers import SpecialistProfileSerializer


class SpecialistProfileViewSet(viewsets.ModelViewSet):
    queryset = SpecialistProfile.objects.select_related("user", "facility").all()
    serializer_class = SpecialistProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["specialty", "is_available", "facility"]
    search_fields    = ["user__name", "user__email", "professional_pin", "specialty"]
    ordering_fields  = ["created_at", "years_experience"]
    ordering         = ["-created_at"]
