"""
apps/accounts/permissions.py
"""

from rest_framework.permissions import BasePermission

from rest_framework.permissions import BasePermission


class IsHealthWorker(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == "health_worker"
        )


class IsFacilityAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == "facility_admin"
        )


class IsHealthWorkerOrFacilityAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role in ["health_worker", "facility_admin"]
        )
        

class IsHealthWorker(BasePermission):
    """
    Grants access to workers and above.
    """
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("health_worker", "facility_admin", "superadmin")
        )


class IsFacilityAdmin(BasePermission):
    """
    Grants access to facility admins and superadmins only.
    """
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("facility_admin", "superadmin")
        )


class IsSuperAdmin(BasePermission):
    """
    Grants access to superadmins only.
    """
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == "superadmin"
        )


class IsFacilityAdminForOwnFacility(BasePermission):
    """
    Facility admins can only modify their own facility.
    Superadmins can modify any facility.
    """
    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.role == "superadmin":
            return True

        if user.role == "facility_admin":
            return user.facility_id == obj.id

        return False