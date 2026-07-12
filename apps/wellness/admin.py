from django.contrib import admin

from .models import CycleEntry, PregnancyTrackerState


@admin.register(CycleEntry)
class CycleEntryAdmin(admin.ModelAdmin):
    list_display = ("user", "period_start", "period_end", "created_at")
    search_fields = ("user__email", "user__name")


@admin.register(PregnancyTrackerState)
class PregnancyTrackerStateAdmin(admin.ModelAdmin):
    list_display = ("patient", "last_notified_week", "last_notified_date", "updated_at")
