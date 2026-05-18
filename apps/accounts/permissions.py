"""
apps/accounts/permissions.py
-----------------------------
Reusable DRF permission classes for role-based access control.

Usage in any view or viewset:
    from apps.accounts.permissions import IsHealthWorker, IsFacilityAdmin, IsSuperAdmin

    class MyView(APIView):
        permission_classes = [IsAuthenticated, IsHealthWorker]
"""
from rest_framework.permissions import BasePermission


class IsHealthWorker(BasePermission):
    """Grants access to health workers and above (facility_admin, superadmin)."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("health_worker", "facility_admin", "superadmin")
        )


class IsFacilityAdmin(BasePermission):
    """Grants access to facility admins and superadmins only."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("facility_admin", "superadmin")
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
    Object-level permission: a facility_admin can only modify their own facility.
    Superadmins can modify any facility.
    """
    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == "superadmin":
            return True
        if user.role == "facility_admin":
            # obj is a HealthFacility instance
            return user.facility_id == obj.id
        return False
