"""
apps/accounts/permissions.py
"""
from rest_framework.permissions import BasePermission


class IsHealthWorker(BasePermission):
    """Grants access to workers and above (admin, superadmin)."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("worker", "admin", "superadmin")
        )


class IsFacilityAdmin(BasePermission):
    """Grants access to facility admins and superadmins only."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "superadmin")
        )


class IsSuperAdmin(BasePermission):
    """Grants access to superadmins only."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "superadmin"
        )


class IsFacilityAdminForOwnFacility(BasePermission):
    """
    Object-level permission: a facility admin can only modify their own facility.
    Superadmins can modify any facility.
    """
    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == "superadmin":
            return True
        if user.role == "admin":
            return user.facility_id == obj.id
        return False