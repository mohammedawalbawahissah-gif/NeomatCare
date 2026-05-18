"""
apps/accounts/admin.py
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display    = ["email", "name", "role", "facility", "is_active", "created_at"]
    list_filter     = ["role", "is_active"]
    search_fields   = ["email", "name"]
    ordering        = ["-created_at"]

    fieldsets = (
        (None,           {"fields": ("email", "password")}),
        ("Personal info",{"fields": ("name", "role", "facility")}),
        ("Permissions",  {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields":  ("email", "name", "role", "facility", "password1", "password2"),
        }),
    )
