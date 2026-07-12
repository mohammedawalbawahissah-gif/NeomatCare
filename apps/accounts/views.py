import logging

from rest_framework import status, permissions
from rest_framework.permissions import AllowAny, IsAuthenticated, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.exceptions import TokenError
from django_ratelimit.decorators import ratelimit
from django.utils.decorators import method_decorator
from django.db.models import Q
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings as django_settings

from .models import User, OTPVerification, PatientServiceReview
from .serializers import (
    RegisterSerializer, UserSerializer, UserCreateSerializer,
    CustomTokenObtainPairSerializer, PatientServiceReviewSerializer,
)

logger = logging.getLogger(__name__)

OTP_EXEMPT_ROLES = {'superadmin'}


# ── Permissions ──────────────────────────────────────────────────────────────

class IsFacilityAdminOrSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('facility_admin', 'superadmin')


class IsPatient(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'patient'


# ── OTP helpers ───────────────────────────────────────────────────────────────

def _send_otp(user: User, otp: OTPVerification) -> bool:
    """Dispatch OTP via the channel stored on the OTP record. Returns True on success."""
    if otp.channel == OTPVerification.Channel.SMS:
        return _send_otp_sms(user, otp.code)
    return _send_otp_email(user, otp.code)


def _send_otp_sms(user: User, code: str) -> bool:
    try:
        from sms_service import send_sms
        phone = user.phone_number or ''
        if not phone:
            logger.warning("OTP SMS: user %s has no phone number", user.email)
            return False
        message = (
            f"[NeoMatCare] Your verification code is {code}. "
            f"It expires in 10 minutes. Do not share it."
        )
        return send_sms(phone, message)
    except Exception:
        logger.exception("OTP SMS send failed for %s", user.email)
        return False


def _send_otp_email(user: User, code: str) -> bool:
    try:
        send_mail(
            subject="NeoMatCare — Your verification code",
            message=(
                f"Hello {user.name},\n\n"
                f"Your NeoMatCare verification code is: {code}\n\n"
                f"This code expires in 10 minutes. Do not share it with anyone.\n\n"
                f"If you did not request this, please ignore this email.\n\n"
                f"— The NeoMatCare Team"
            ),
            from_email=getattr(django_settings, 'DEFAULT_FROM_EMAIL', 'noreply@neomatcare.gh'),
            recipient_list=[user.email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception("OTP email send failed for %s", user.email)
        return False


# ── Registration with OTP ─────────────────────────────────────────────────────

@method_decorator(ratelimit(key='ip', rate='5/min', method='POST', block=True), name='post')
class RegisterView(APIView):
    """
    Step 1 of registration for all non-superadmin roles.
    Creates an inactive user, generates OTP, dispatches via chosen channel.
    Returns user_id so the frontend can call VerifyOTPView.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user    = serializer.save()
        role    = user.role
        channel = request.data.get('otp_channel', 'sms')

        # Superadmin accounts (CLI-created) skip OTP entirely
        if role in OTP_EXEMPT_ROLES:
            user.is_active   = True
            user.is_verified = True
            user.save(update_fields=['is_active', 'is_verified'])
            return Response(
                {'message': 'Account created successfully.', 'user': UserSerializer(user).data},
                status=status.HTTP_201_CREATED,
            )

        otp     = OTPVerification.generate(user, channel)
        success = _send_otp(user, otp)

        channel_label = 'phone' if channel == 'sms' else 'email'
        return Response(
            {
                'message': (
                    f'Account created. A 6-digit verification code has been sent to your '
                    f'{channel_label}. Enter it to activate your account.'
                ),
                'user_id':  str(user.id),
                'channel':  channel,
                'otp_sent': success,
            },
            status=status.HTTP_201_CREATED,
        )


@method_decorator(ratelimit(key='ip', rate='10/min', method='POST', block=True), name='post')
class VerifyOTPView(APIView):
    """
    Step 2 of registration — verifies the OTP code.
    On success, activates the user and issues JWT tokens immediately.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        user_id = request.data.get('user_id', '').strip()
        code    = request.data.get('code', '').strip()

        if not user_id or not code:
            return Response(
                {'detail': 'user_id and code are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'Invalid user.'}, status=status.HTTP_400_BAD_REQUEST)

        otp = (
            OTPVerification.objects
            .filter(user=user, is_used=False)
            .order_by('-created_at')
            .first()
        )

        if not otp:
            return Response(
                {'detail': 'No pending verification code. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp.is_expired:
            return Response(
                {'detail': 'This code has expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if otp.code != code:
            return Response(
                {'detail': 'Incorrect code. Please try again.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Mark OTP used and activate user
        otp.is_used = True
        otp.save(update_fields=['is_used'])

        user.is_active   = True
        user.is_verified = True
        user.save(update_fields=['is_active', 'is_verified'])

        # Patients get a linked clinical Patient record immediately — the
        # patient portal tracker, ANC data, and risk engine all key off this
        # one record (apps.cases.models.Patient.patient_user). Age is seeded
        # 0 and filled in by the patient via the tracker's self-report form;
        # never guess it here.
        if user.role == 'patient':
            from apps.cases.models import Patient as ClinicalPatient
            ClinicalPatient.objects.get_or_create(
                patient_user=user,
                defaults={'patient_name': user.name, 'patient_phone_number': user.phone_number, 'age': 0},
            )

        # Issue tokens so user lands straight in the app
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                'message': 'Account verified successfully.',
                'access':  str(refresh.access_token),
                'refresh': str(refresh),
                'user':    UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )


@method_decorator(ratelimit(key='ip', rate='3/min', method='POST', block=True), name='post')
class ResendOTPView(APIView):
    """Resend a fresh OTP to the same channel the user originally chose."""
    permission_classes = [AllowAny]

    def post(self, request):
        user_id = request.data.get('user_id', '').strip()
        if not user_id:
            return Response({'detail': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=user_id, is_active=False)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found or already verified.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Determine channel from most recent OTP, or default to sms
        last = OTPVerification.objects.filter(user=user).order_by('-created_at').first()
        channel = last.channel if last else OTPVerification.Channel.SMS

        otp     = OTPVerification.generate(user, channel)
        success = _send_otp(user, otp)

        return Response(
            {
                'message': 'A new code has been sent.',
                'channel': channel,
                'otp_sent': success,
            },
            status=status.HTTP_200_OK,
        )


# ── Standard auth views ───────────────────────────────────────────────────────

@method_decorator(ratelimit(key='ip', rate='5/min', method='POST', block=True), name='post')
class LoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class   = CustomTokenObtainPairSerializer


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({'detail': 'Refresh token is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logged out successfully.'}, status=status.HTTP_205_RESET_CONTENT)
        except TokenError as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        user    = request.user
        allowed = {"name", "email", "phone_number"}
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


# ── Patient portal views ──────────────────────────────────────────────────────

class PatientMeView(APIView):
    """Read-only patient profile — returns the authenticated patient's own user record."""
    permission_classes = [IsAuthenticated, IsPatient]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class PatientServiceReviewListCreateView(APIView):
    """List all reviews by this patient, or submit a new one."""
    permission_classes = [IsAuthenticated, IsPatient]

    def get(self, request):
        reviews = PatientServiceReview.objects.filter(patient=request.user)
        return Response(PatientServiceReviewSerializer(reviews, many=True).data)

    def post(self, request):
        serializer = PatientServiceReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save(patient=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# ── Admin user management ─────────────────────────────────────────────────────

class UserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsFacilityAdminOrSuperAdmin]

    def get_object(self, pk, request):
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
        user, err = self.get_object(pk, request)
        if err:
            return err

        allowed = {"name", "email", "role", "is_active", "facility"}
        if request.user.role == "facility_admin":
            allowed -= {"facility"}
            if request.data.get("role") == "superadmin":
                return Response({"role": "You cannot assign the superadmin role."}, status=status.HTTP_403_FORBIDDEN)

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
            return Response({"detail": "Only superadmins can delete users."}, status=status.HTTP_403_FORBIDDEN)

        user, err = self.get_object(pk, request)
        if err:
            return err
        if user.pk == request.user.pk:
            return Response({"detail": "You cannot delete your own account."}, status=status.HTTP_400_BAD_REQUEST)

        hard_delete = request.query_params.get("hard", "").lower() == "true"
        if hard_delete:
            from django.db.models.deletion import ProtectedError
            try:
                user.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            except ProtectedError as e:
                related = list({obj.__class__.__name__ for obj in list(e.protected_objects)[:10]})
                return Response(
                    {"detail": (
                        "Cannot delete this user — they have protected clinical records "
                        f"({', '.join(related)}). Deactivate them instead, "
                        "or reassign their records first."
                    )},
                    status=status.HTTP_409_CONFLICT,
                )

        import uuid as _uuid
        user.is_active    = False
        user.phone_number = ""
        user.email        = f"deleted_{_uuid.uuid4().hex[:8]}@removed.invalid"
        user.save(update_fields=["is_active", "email", "phone_number"])
        return Response(
            {"detail": "User deactivated. Their clinical records have been preserved."},
            status=status.HTTP_200_OK,
        )


class UserListView(APIView):
    permission_classes = [IsAuthenticated, IsFacilityAdminOrSuperAdmin]

    def get(self, request):
        queryset = User.objects.select_related("facility").all()

        if request.user.role == "facility_admin":
            queryset = queryset.filter(facility=request.user.facility)

        role     = request.query_params.get("role")
        facility = request.query_params.get("facility")
        search   = request.query_params.get("search")
        active   = request.query_params.get("is_active")

        if role:
            queryset = queryset.filter(role=role)
        if facility and request.user.role == "superadmin":
            queryset = queryset.filter(facility__id=facility)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(email__icontains=search)
            )
        if active is not None:
            queryset = queryset.filter(is_active=active.lower() == "true")

        return Response(UserSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if request.user.role == "facility_admin":
            role = serializer.validated_data.get("role", "health_worker")
            if role == "superadmin":
                return Response({"role": "You cannot assign the superadmin role."}, status=status.HTTP_403_FORBIDDEN)
            serializer.validated_data["facility"] = request.user.facility_id

        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class PushTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("token", "").strip()
        if not token:
            return Response({"detail": "token is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not token.startswith("ExponentPushToken"):
            return Response({"detail": "Invalid token format."}, status=status.HTTP_400_BAD_REQUEST)
        request.user.expo_push_token = token
        request.user.save(update_fields=["expo_push_token"])
        return Response({"detail": "Push token registered."}, status=status.HTTP_200_OK)


class SpecialistSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response([])
        users = User.objects.filter(
            role="specialist", is_active=True, name__icontains=query
        ).values("id", "name", "email")[:10]
        return Response(list(users))
