from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from .views import (
    RegisterView, VerifyOTPView, ResendOTPView,
    LoginView, MeView, LogoutView,
    UserListView, UserDetailView, ApproveUserView,
    ChangePasswordView,
    PushTokenView, SpecialistSearchView,
    PatientMeView, PatientServiceReviewListCreateView,
)

urlpatterns = [
    # ── Registration + OTP ───────────────────────────────────────────────────
    path("register/",          RegisterView.as_view(),    name="register"),
    path("verify-otp/",        VerifyOTPView.as_view(),   name="verify-otp"),
    path("resend-otp/",        ResendOTPView.as_view(),   name="resend-otp"),

    # ── Auth ─────────────────────────────────────────────────────────────────
    path("login/",             LoginView.as_view(),            name="login"),
    path("token/refresh/",     TokenRefreshView.as_view(),     name="token_refresh"),
    path("logout/",            TokenBlacklistView.as_view(),   name="logout"),

    # ── Current user ─────────────────────────────────────────────────────────
    path("me/",                MeView.as_view(),               name="me"),
    path("change-password/",   ChangePasswordView.as_view(),   name="change-password"),
    path("push-token/",        PushTokenView.as_view(),        name="push-token"),

    # ── Admin user management ─────────────────────────────────────────────────
    path("users/",                    UserListView.as_view(),    name="user-list"),
    path("users/<uuid:pk>/",          UserDetailView.as_view(),  name="user-detail"),
    path("users/<uuid:pk>/approve/",  ApproveUserView.as_view(), name="user-approve"),

    # ── Specialist search ─────────────────────────────────────────────────────
    path("specialists/search/", SpecialistSearchView.as_view(), name="specialist-search"),

    # ── Patient portal ────────────────────────────────────────────────────────
    path("patient/me/",        PatientMeView.as_view(),                      name="patient-me"),
    path("patient/reviews/",   PatientServiceReviewListCreateView.as_view(), name="patient-reviews"),
]
