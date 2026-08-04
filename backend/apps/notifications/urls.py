from django.urls import path

from .views import (
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationUnreadCountView,
)

urlpatterns = [
    path("", NotificationListView.as_view()),
    path("unread-count/", NotificationUnreadCountView.as_view()),
    path("mark-all-read/", NotificationMarkAllReadView.as_view()),
    path("<uuid:pk>/read/", NotificationMarkReadView.as_view()),
]
