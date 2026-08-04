"""
apps/accounts/permissions.py
"""
from rest_framework.permissions import BasePermission


class IsHealthWorker(BasePermission):
    """Health workers, facility admins, and superadmins."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ("health_worker", "facility_admin", "superadmin")
        )


class IsFacilityAdmin(BasePermission):
    """Facility admins and superadmins."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ("facility_admin", "superadmin")
        )


class IsHealthWorkerOrFacilityAdmin(BasePermission):
    """Health workers, facility admins, and superadmins."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ("health_worker", "facility_admin", "superadmin")
        )


class IsHealthWorkerOrFacilityAdminOrPatient(BasePermission):
    """
    Health workers, facility admins, superadmins, and patient-portal users.
    Used on patient-record endpoints where the patient role is allowed to
    reach the view but is then scoped to their own record in the view body
    (see PatientListCreateView / PatientDetailView in apps/cases/views.py).
    Deliberately excludes driver and specialist — neither role has a
    clinical or operational reason to read or write patient records.
    """
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role in ("health_worker", "facility_admin", "superadmin", "patient")
        )


class IsSuperAdmin(BasePermission):
    """Superadmins only."""
    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated
            and request.user.role == "superadmin"
        )


class IsFacilityAdminForOwnFacility(BasePermission):
    """Facility admins can only modify their own facility. Superadmins can modify any."""
    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == "superadmin":
            return True
        if user.role == "facility_admin":
            return user.facility_id == obj.id
        return False
