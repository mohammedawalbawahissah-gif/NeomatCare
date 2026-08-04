from django.urls import path

from .sms_inbound_views import sms_inbound_callback

urlpatterns = [
    path("", sms_inbound_callback),
]
