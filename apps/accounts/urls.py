from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from .views import RegisterView, LoginView, MeView, LogoutView, UserListView

urlpatterns = [
    path("register/",      RegisterView.as_view(),       name="register"),
    path("login/",         LoginView.as_view(),           name="login"),
    path("token/refresh/", TokenRefreshView.as_view(),    name="token_refresh"),
    path("logout/",        TokenBlacklistView.as_view(),  name="logout"),
    path("me/",            MeView.as_view(),              name="me"),
    path("users/",         UserListView.as_view(),        name="user-list"),
]