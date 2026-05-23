from django.contrib import admin
from .models import SpecialistProfile


@admin.register(SpecialistProfile)
class SpecialistProfileAdmin(admin.ModelAdmin):
    list_display  = ["user", "specialty", "professional_pin", "years_experience", "is_available", "facility"]
    list_filter   = ["specialty", "is_available", "facility"]
    search_fields = ["user__name", "user__email", "professional_pin"]
