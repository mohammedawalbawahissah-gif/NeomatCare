"""
apps/accounts/views.py
"""
import logging
import uuid as _uuid

from django.db.models import Q
from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import status, permissions
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import OTPVerification, User
from .serializers import (
    CustomTokenObtainPairSerializer,
    RegisterSerializer,
    UserCreateSerializer,
    UserSerializer,
)

logger = logging.getLogger(__name__)


# ── Permissions ───────────────────────────────────────────────────────────────

class IsFacilityAdminOrSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in (
            "facility_admin", "superadmin"
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _send_otp(user, otp, phone=None):
    """
    Send OTP via Africa's Talking SMS (primary) and Django email (fallback).
    Safe to call without a phone number — falls back to email only.
    """
    msg = (
        f"[NeoMatCare] Your verification code is {otp.otp_code}. "
        f"It expires in 10 minutes. Do not share this code."
    )
    # SMS
    if phone:
        try:
            from sms_service import send_sms
            ok = send_sms(phone, msg)
            if not ok:
                logger.error("OTP SMS failed for %s (%s) code=%s", user.email, phone, otp.otp_code)
        except Exception:
            logger.exception("OTP SMS exception for %s", user.email)

    # Email fallback
    try:
        from django.conf import settings as djs
        from django.core.mail import send_mail
        send_mail(
            subject="NeoMatCare — Your Verification Code",
            message=msg,
            from_email=getattr(djs, "DEFAULT_FROM_EMAIL", "noreply@neomatcare.app"),
            recipient_list=[user.email],
            fail_silently=True,
        )
    except Exception:
        pass


def _issue_tokens(user):
    """Return a dict with access + refresh tokens and serialised user."""
    token = RefreshToken.for_user(user)
    token["name"]        = user.name
    token["role"]        = user.role
    token["facility_id"] = str(user.facility_id) if user.facility_id else None
    return {
        "access":  str(token.access_token),
        "refresh": str(token),
        "user":    UserSerializer(user).data,
    }


# ── Registration (all non-superadmin roles) ───────────────────────────────────

@method_decorator(ratelimit(key="ip", rate="5/min", method="POST", block=True), name="post")
class RegisterView(APIView):
    """
    POST /api/auth/register/
    Accepts all non-superadmin roles.
    Creates an *inactive* user and sends a 6-digit OTP for verification.
    SuperAdmin accounts are created only via Django management commands / shell.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        role = serializer.validated_data.get("role", "health_worker")
        if role == "superadmin":
            return Response(
                {"role": "SuperAdmin accounts cannot be created via self-registration."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create inactive — activates only after OTP
        user = serializer.save()
        user.is_active   = False
        user.is_verified = False
        user.save(update_fields=["is_active", "is_verified"])

        channel = (
            OTPVerification.Channel.SMS
            if user.phone_number
            else OTPVerification.Channel.EMAIL
        )
        otp = OTPVerification.generate(user, channel, OTPVerification.Purpose.REGISTER)
        _send_otp(user, otp, phone=user.phone_number or None)

        return Response(
            {
                "detail": (
                    "Account created. A 6-digit verification code has been sent "
                    + ("to your phone." if user.phone_number else "to your email.")
                ),
                "user_id": str(user.id),
            },
            status=status.HTTP_201_CREATED,
        )


# ── OTP Verification ──────────────────────────────────────────────────────────

@method_decorator(ratelimit(key="ip", rate="10/min", method="POST", block=True), name="post")
class VerifyOTPView(APIView):
    """
    POST /api/auth/verify/
    Body: { user_id, otp_code }
    Works for all roles. Activates account and returns JWT tokens.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        user_id  = request.data.get("user_id",  "").strip()
        otp_code = request.data.get("otp_code", "").strip()

        if not user_id or not otp_code:
            return Response(
                {"detail": "user_id and otp_code are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"detail": "Invalid verification request."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp = (
            OTPVerification.objects
            .filter(user=user, otp_code=otp_code, purpose=OTPVerification.Purpose.REGISTER, is_used=False)
            .order_by("-created_at")
            .first()
        )

        if not otp or not otp.is_valid:
            return Response(
                {"detail": "Invalid or expired code. Request a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        otp.is_used = True
        otp.save(update_fields=["is_used"])

        user.is_active   = True
        user.is_verified = True
        user.save(update_fields=["is_active", "is_verified"])

        return Response({"detail": "Account verified successfully.", **_issue_tokens(user)})


@method_decorator(ratelimit(key="ip", rate="3/min", method="POST", block=True), name="post")
class ResendOTPView(APIView):
    """
    POST /api/auth/resend-otp/
    Body: { user_id }
    Resends a fresh OTP to the user's phone or email.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        user_id = request.data.get("user_id", "").strip()
        try:
            user = User.objects.get(id=user_id, is_active=False)
        except User.DoesNotExist:
            return Response({"detail": "Invalid request."}, status=status.HTTP_400_BAD_REQUEST)

        channel = (
            OTPVerification.Channel.SMS
            if user.phone_number
            else OTPVerification.Channel.EMAIL
        )
        otp = OTPVerification.generate(user, channel, OTPVerification.Purpose.REGISTER)
        _send_otp(user, otp, phone=user.phone_number or None)
        return Response({"detail": "A new verification code has been sent."})


# ── Login / Logout / Me ───────────────────────────────────────────────────────

@method_decorator(ratelimit(key="ip", rate="5/min", method="POST", block=True), name="post")
class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class   = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")
        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({"message": "Logged out successfully."}, status=status.HTTP_205_RESET_CONTENT)
        except TokenError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        user    = request.user
        allowed = {"name", "email"}
        data    = {k: v for k, v in request.data.items() if k in allowed}
        for field, value in data.items():
            setattr(user, field, value)
        user.save(update_fields=list(data.keys()))
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user    = request.user
        current = request.data.get("current_password", "")
        new_pw  = request.data.get("new_password", "")
        new_pw2 = request.data.get("new_password2", "")

        if not user.check_password(current):
            return Response({"current_password": "Incorrect password."}, status=status.HTTP_400_BAD_REQUEST)
        if new_pw != new_pw2:
            return Response({"new_password2": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)
        if len(new_pw) < 8:
            return Response({"new_password": "Password must be at least 8 characters."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_pw)
        user.save(update_fields=["password"])
        return Response({"message": "Password changed successfully."})


# ── User Management (admin) ───────────────────────────────────────────────────

class UserListView(APIView):
    permission_classes = [IsAuthenticated, IsFacilityAdminOrSuperAdmin]

    def get(self, request):
        qs = User.objects.select_related("facility").all()

        if request.user.role == "facility_admin":
            qs = qs.filter(facility=request.user.facility)

        role     = request.query_params.get("role")
        facility = request.query_params.get("facility")
        search   = request.query_params.get("search")
        active   = request.query_params.get("is_active")

        if role:
            qs = qs.filter(role=role)
        if facility and request.user.role == "superadmin":
            qs = qs.filter(facility__id=facility)
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(email__icontains=search))
        if active is not None:
            qs = qs.filter(is_active=active.lower() == "true")

        return Response(UserSerializer(qs, many=True).data)

    def post(self, request):
        """
        Admin-created users (e.g. superadmin creating a specialist) are
        activated immediately — no OTP required.
        """
        serializer = UserCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if request.user.role == "facility_admin":
            role = serializer.validated_data.get("role", "health_worker")
            if role == "superadmin":
                return Response(
                    {"role": "You cannot assign the superadmin role."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer.validated_data["facility"] = request.user.facility_id

        user = serializer.save()
        # Admin-created accounts are pre-verified
        user.is_active   = True
        user.is_verified = True
        user.save(update_fields=["is_active", "is_verified"])
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsFacilityAdminOrSuperAdmin]

    def _get_object(self, pk, request):
        try:
            user = User.objects.select_related("facility").get(pk=pk)
        except User.DoesNotExist:
            return None, Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "facility_admin":
            if user.facility_id != request.user.facility_id:
                return None, Response(
                    {"detail": "You can only manage users at your facility."},
                    status=status.HTTP_403_FORBIDDEN,
                )
        return user, None

    def patch(self, request, pk):
        user, err = self._get_object(pk, request)
        if err:
            return err

        allowed = {"name", "email", "role", "is_active", "facility"}
        if request.user.role == "facility_admin":
            allowed -= {"facility"}
            if request.data.get("role") == "superadmin":
                return Response(
                    {"role": "You cannot assign the superadmin role."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        data = {k: v for k, v in request.data.items() if k in allowed}
        if "facility" in data:
            from apps.facilities.models import HealthFacility
            try:
                user.facility = HealthFacility.objects.get(id=data.pop("facility"))
            except HealthFacility.DoesNotExist:
                return Response({"facility": "Facility not found."}, status=status.HTTP_400_BAD_REQUEST)

        for field, value in data.items():
            setattr(user, field, value)
        user.save()
        return Response(UserSerializer(user).data)

    def delete(self, request, pk):
        if request.user.role != "superadmin":
            return Response(
                {"detail": "Only superadmins can delete users."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user, err = self._get_object(pk, request)
        if err:
            return err
        if user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.query_params.get("hard", "").lower() == "true":
            from django.db import ProtectedError
            try:
                user.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            except ProtectedError as e:
                related = list({obj.__class__.__name__ for obj in list(e.protected_objects)[:10]})
                return Response(
                    {"detail": f"Cannot delete — protected records exist ({', '.join(related)}). Deactivate instead."},
                    status=status.HTTP_409_CONFLICT,
                )

        user.is_active    = False
        user.email        = f"deleted_{_uuid.uuid4().hex[:8]}@removed.invalid"
        user.save(update_fields=["is_active", "email"])
        return Response(
            {"detail": "User deactivated. Clinical records preserved."},
            status=status.HTTP_200_OK,
        )


# ── Misc ──────────────────────────────────────────────────────────────────────

class PushTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("token", "").strip()
        if not token:
            return Response({"detail": "token is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not token.startswith("ExponentPushToken"):
            return Response(
                {"detail": "Invalid token format. Expected ExponentPushToken[...]."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.expo_push_token = token
        request.user.save(update_fields=["expo_push_token"])
        return Response({"detail": "Push token registered."}, status=status.HTTP_200_OK)


class SpecialistSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response([])
        users = (
            User.objects.filter(role="specialist", is_active=True, name__icontains=query)
            .values("id", "name", "email")[:10]
        )
        return Response(list(users))
