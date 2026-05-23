from rest_framework import status, permissions
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.exceptions import TokenError
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator
from django.db.models import Q
from .models import User
from .serializers import RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer



@method_decorator(ratelimit(key='ip', rate='5/min', method='POST', block=True), name='post')
class RegisterView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({'message': 'Account created successfully.', 'user': UserSerializer(user).data}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@method_decorator(ratelimit(key='ip', rate='5/min', method='POST', block=True), name='post')
class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class   = CustomTokenObtainPairSerializer

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({'detail': 'Refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logged out successfully.'}, status=status.HTTP_205_RESET_CONTENT)
        except TokenError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class MeView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(UserSerializer(request.user).data)

class IsSuperAdmin(BasePermission):
    """Grants access only to users with the superadmin role."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_superadmin


class UserListView(APIView):
    permission_classes = [IsAuthenticated, IsSuperAdmin]

    def get(self, request):
        queryset = User.objects.select_related("facility").all()

        # Optional filters — all combinable
        role     = request.query_params.get("role")
        facility = request.query_params.get("facility")  # UUID
        search   = request.query_params.get("search")    # name or email
        active   = request.query_params.get("is_active") # "true" / "false"

        if role:
            queryset = queryset.filter(role=role)
        if facility:
            queryset = queryset.filter(facility__id=facility)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(email__icontains=search)
            )
        if active is not None:
            queryset = queryset.filter(is_active=active.lower() == "true")

        serializer = UserSerializer(queryset, many=True)
        return Response(serializer.data)

class PushTokenView(APIView):
    """
    POST /api/auth/push-token/
    Registers or updates the Expo push token for the authenticated user.
    Called by the mobile app on every login.

    Body: { "token": "ExponentPushToken[xxxx]" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("token", "").strip()
        if not token:
            return Response(
                {"detail": "token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not token.startswith("ExponentPushToken"):
            return Response(
                {"detail": "Invalid token format. Expected ExponentPushToken[...]."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.expo_push_token = token
        request.user.save(update_fields=["expo_push_token"])
        return Response({"detail": "Push token registered."}, status=status.HTTP_200_OK)

class SpecialistSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response([])
        users = User.objects.filter(
            role="specialist",
            is_active=True,
            name__icontains=query
        ).values("id", "name", "email")[:10]
        return Response(list(users))
