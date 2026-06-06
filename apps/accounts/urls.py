from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView

from .views import (
    RegisterView,
    VerifyOTPView,
    ResendOTPView,
    LoginView,
    LogoutView,
    MeView,
    ChangePasswordView,
    UserListView,
    UserDetailView,
    PushTokenView,
    SpecialistSearchView,
)

urlpatterns = [
    # ── Registration + OTP ───────────────────────────────────────────────
    path("register/",        RegisterView.as_view(),  name="register"),
    path("verify/",          VerifyOTPView.as_view(), name="verify-otp"),
    path("resend-otp/",      ResendOTPView.as_view(), name="resend-otp"),

    # ── Auth ─────────────────────────────────────────────────────────────
    path("login/",           LoginView.as_view(),            name="login"),
    path("token/refresh/",   TokenRefreshView.as_view(),     name="token_refresh"),
    path("logout/",          TokenBlacklistView.as_view(),   name="logout"),

    # ── Current user ─────────────────────────────────────────────────────
    path("me/",              MeView.as_view(),               name="me"),
    path("change-password/", ChangePasswordView.as_view(),   name="change-password"),

    # ── User management ───────────────────────────────────────────────────
    path("users/",           UserListView.as_view(),         name="user-list"),
    path("users/<uuid:pk>/", UserDetailView.as_view(),       name="user-detail"),

    # ── Misc ──────────────────────────────────────────────────────────────
    path("push-token/",         PushTokenView.as_view(),        name="push-token"),
    path("specialists/search/", SpecialistSearchView.as_view(), name="specialist-search"),
]
