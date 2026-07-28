from django.urls import path

from .ussd_views import ussd_callback

urlpatterns = [
    path("", ussd_callback),
]
