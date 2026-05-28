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
from .models import User
from .serializers import RegisterSerializer, UserSerializer, UserCreateSerializer, CustomTokenObtainPairSerializer


class IsFacilityAdminOrSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('facility_admin', 'superadmin')



@method_decorator(ratelimit(key='ip', rate='5/min', method='POST', block=True), name='post')
class RegisterView(APIView):
    permission_classes = [AllowAny]
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response({'message': 'Account created successfully.', 'user': UserSerializer(user).data}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

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
        user = request.user
        allowed = {"name", "email"}
        data = {k: v for k, v in request.data.items() if k in allowed}
        for field, value in data.items():
            setattr(user, field, value)
        user.save(update_fields=list(data.keys()))
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
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


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsFacilityAdminOrSuperAdmin]

    def get_object(self, pk, request):
        try:
            user = User.objects.select_related("facility").get(pk=pk)
        except User.DoesNotExist:
            return None, Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        if request.user.role == "facility_admin":
            if user.facility_id != request.user.facility_id:
                return None, Response({"detail": "You can only manage users at your facility."}, status=status.HTTP_403_FORBIDDEN)

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

        # ?hard=true attempts a real DB delete — will fail with 409 if the user
        # has PROTECT-constrained clinical records (referrals, cases, etc.)
        hard_delete = request.query_params.get("hard", "").lower() == "true"

        if hard_delete:
            from django.db import ProtectedError
            try:
                user.delete()
                return Response(status=status.HTTP_204_NO_CONTENT)
            except ProtectedError as e:
                related = list({obj.__class__.__name__ for obj in list(e.protected_objects)[:10]})
                return Response(
                    {
                        "detail": (
                            "Cannot delete this user — they have protected clinical records "
                            f"({', '.join(related)}). Deactivate them instead, "
                            "or reassign their records first."
                        )
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        # Default: soft-delete — deactivate + anonymise so the user cannot log
        # in but all clinical records remain intact for audit purposes.
        import uuid as _uuid
        user.is_active = False
        user.expo_push_token = ""
        # Scramble email so it can't be used to log in but stays unique in the DB
        user.email = f"deleted_{_uuid.uuid4().hex[:8]}@removed.invalid"
        user.save(update_fields=["is_active", "email"])
        return Response(
            {"detail": "User deactivated. Their clinical records have been preserved."},
            status=status.HTTP_200_OK,
        )


class UserListView(APIView):
    permission_classes = [IsAuthenticated, IsFacilityAdminOrSuperAdmin]

    def get(self, request):
        queryset = User.objects.select_related("facility").all()

        # Facility admins only see users at their own facility
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

        # Facility admins can only create users at their own facility
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
            return Response(
                {"detail": "token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
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
        users = User.objects.filter(
            role="specialist",
            is_active=True,
            name__icontains=query
        ).values("id", "name", "email")[:10]
        return Response(list(users))
