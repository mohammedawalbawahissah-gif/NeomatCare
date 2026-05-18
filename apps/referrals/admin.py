"""
apps/referrals/admin.py
"""
from django.contrib import admin
from .models import Referral, ReferralStatusLog, Notification


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display  = [
        "id", "status", "referring_facility", "receiving_facility",
        "maternal_outcome", "neonatal_outcome", "created_at",
    ]
    list_filter   = ["status", "maternal_outcome", "neonatal_outcome"]
    readonly_fields = ["id", "created_at", "updated_at"]
    search_fields = ["id"]


@admin.register(ReferralStatusLog)
class ReferralStatusLogAdmin(admin.ModelAdmin):
    list_display  = ["referral", "from_status", "to_status", "changed_by", "timestamp"]
    readonly_fields = ["id", "referral", "from_status", "to_status", "changed_by", "note", "timestamp"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display  = ["referral", "channel", "status", "sent_at"]
    list_filter   = ["channel", "status"]
    readonly_fields = ["id"]
