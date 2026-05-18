"""
apps/accounts/views.py
----------------------
Auth endpoints:
  POST /api/auth/register/        — create account
  POST /api/auth/login/           — get access + refresh tokens
  POST /api/auth/token/refresh/   — exchange refresh token for a new access token
  POST /api/auth/logout/          — blacklist the refresh token
  GET  /api/auth/me/              — current user profile
"""
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator

from .serializers import RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer


@method_decorator(ratelimit(key="ip", rate="5/min", method="POST", block=True), name="post")
class RegisterView(APIView):
    """
    POST /api/auth/register/

    Open endpoint — no authentication required.
    Rate-limited to 5 requests/min per IP to prevent account farming.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(
                {
                    "message": "Account created successfully.",
                    "user": UserSerializer(user).data,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@method_decorator(ratelimit(key="ip", rate="5/min", method="POST", block=True), name="post")
class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/

    Returns access token, refresh token, and user profile.
    Rate-limited to 5 requests/min per IP.
    """
    permission_classes  = [AllowAny]
    serializer_class    = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    """
    POST /api/auth/logout/

    Blacklists the provided refresh token so it can't be reused.
    The access token will naturally expire after its lifetime.

    Body: { "refresh": "<refresh_token>" }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response(
                {"message": "Logged out successfully."},
                status=status.HTTP_205_RESET_CONTENT,
            )
        except TokenError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    """
    GET /api/auth/me/

    Returns the profile of the currently authenticated user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
