from django.contrib import admin
from .models import SpecialistProfile, Consultation, ConsultationMessage

@admin.register(SpecialistProfile)
class SpecialistProfileAdmin(admin.ModelAdmin):
    list_display  = ["user", "specialty", "professional_pin", "is_available", "facility"]
    list_filter   = ["specialty", "is_available"]
    search_fields = ["user__name", "user__email", "professional_pin"]

@admin.register(Consultation)
class ConsultationAdmin(admin.ModelAdmin):
    list_display  = ["id", "specialist", "status", "created_at"]
    list_filter   = ["status"]

@admin.register(ConsultationMessage)
class ConsultationMessageAdmin(admin.ModelAdmin):
    list_display = ["consultation", "sender", "created_at"]
