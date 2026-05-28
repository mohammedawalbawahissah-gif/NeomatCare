from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from .views import (
    RegisterView, LoginView, MeView, LogoutView,
    UserListView, UserDetailView,
    ChangePasswordView,
    PushTokenView, SpecialistSearchView,
)

urlpatterns = [
    path("register/",           RegisterView.as_view(),        name="register"),
    path("login/",              LoginView.as_view(),           name="login"),
    path("token/refresh/",      TokenRefreshView.as_view(),    name="token_refresh"),
    path("logout/",             TokenBlacklistView.as_view(),  name="logout"),
    path("me/",                 MeView.as_view(),              name="me"),
    path("change-password/",    ChangePasswordView.as_view(),  name="change-password"),
    path("users/",              UserListView.as_view(),        name="user-list"),
    path("users/<uuid:pk>/",    UserDetailView.as_view(),      name="user-detail"),
    path("push-token/",         PushTokenView.as_view(),       name="push-token"),
    path("specialists/search/", SpecialistSearchView.as_view(), name="specialist-search"),
]