from django.contrib import admin

from .models import Notification


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("title", "recipient", "notif_type", "is_read", "email_sent", "sms_sent", "created_at")
    list_filter = ("notif_type", "is_read", "email_sent", "sms_sent")
    search_fields = ("title", "message", "recipient__email", "recipient__name")
