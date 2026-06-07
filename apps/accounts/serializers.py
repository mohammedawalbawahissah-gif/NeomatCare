from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, OTPVerification, PatientServiceReview

# Roles that must be linked to a facility
FACILITY_REQUIRED_ROLES = {'health_worker', 'facility_admin'}

# Roles that are exempt from OTP verification (superadmin is created via manage.py only)
OTP_EXEMPT_ROLES = {'superadmin'}


class RegisterSerializer(serializers.ModelSerializer):
    password       = serializers.CharField(write_only=True, validators=[validate_password])
    password2      = serializers.CharField(write_only=True, label='Confirm password')
    facility       = serializers.UUIDField(required=False, allow_null=True)
    phone_number   = serializers.CharField(required=False, allow_blank=True, max_length=20)
    license_number = serializers.CharField(required=False, allow_blank=True, max_length=100)
    # 'sms' or 'email' — required for all non-superadmin roles
    otp_channel    = serializers.ChoiceField(
        choices=['sms', 'email'], required=False, default='sms'
    )

    class Meta:
        model  = User
        fields = [
            'name', 'email', 'password', 'password2', 'role',
            'facility', 'phone_number', 'license_number', 'otp_channel',
        ]
        extra_kwargs = {'role': {'required': False}}

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})

        role    = attrs.get('role', 'health_worker')
        channel = attrs.get('otp_channel', 'sms')
        facility = attrs.get('facility')

        if role in FACILITY_REQUIRED_ROLES and not facility:
            raise serializers.ValidationError({
                'facility': (
                    f'A facility is required for the {role.replace("_", " ")} role. '
                    f'Please select your facility.'
                )
            })

        # SMS channel requires phone number
        if role not in OTP_EXEMPT_ROLES and channel == 'sms':
            phone = attrs.get('phone_number', '').strip()
            if not phone:
                raise serializers.ValidationError({
                    'phone_number': 'A phone number is required when verifying via SMS.'
                })

        return attrs

    def create(self, validated_data):
        facility_id    = validated_data.pop('facility', None)
        phone_number   = validated_data.pop('phone_number', '')
        license_number = validated_data.pop('license_number', '')
        otp_channel    = validated_data.pop('otp_channel', 'sms')
        role           = validated_data.get('role', 'health_worker')

        # Non-superadmin accounts start inactive until OTP verified
        if role not in OTP_EXEMPT_ROLES:
            validated_data['is_active'] = False

        user = User.objects.create_user(**validated_data)

        # Persist phone number
        if phone_number:
            user.phone_number = phone_number
            user.save(update_fields=['phone_number'])

        if facility_id:
            from apps.facilities.models import HealthFacility
            try:
                user.facility = HealthFacility.objects.get(id=facility_id)
                user.save(update_fields=['facility'])
            except HealthFacility.DoesNotExist:
                pass

        # Auto-create Driver record
        if user.role == 'driver':
            from apps.transport.models import Driver
            Driver.objects.get_or_create(
                name=user.name,
                defaults={
                    'phone_number':   phone_number,
                    'license_number': license_number,
                    'is_active':      True,
                }
            )

        return user


class UserSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source='facility.name', read_only=True, allow_null=True)
    facility_id   = serializers.UUIDField(source='facility.id',   read_only=True, allow_null=True)

    class Meta:
        model  = User
        fields = [
            'id', 'name', 'email', 'phone_number', 'role',
            'facility_id', 'facility_name', 'is_active', 'is_verified', 'created_at',
        ]
        read_only_fields = fields


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['name']        = user.name
        token['role']        = user.role
        token['facility_id'] = str(user.facility_id) if user.facility_id else None
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class UserCreateSerializer(serializers.ModelSerializer):
    """Used by admins (superadmin / facility_admin) to create new users directly — no OTP."""
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, label='Confirm password')
    facility  = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model  = User
        fields = ['name', 'email', 'password', 'password2', 'role', 'facility', 'is_active']
        extra_kwargs = {'role': {'required': False}, 'is_active': {'required': False}}

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        facility_id    = validated_data.pop('facility', None)
        phone_number   = validated_data.pop('phone_number', '')
        license_number = validated_data.pop('license_number', '')

        # Admin-created accounts are active and verified immediately
        validated_data.setdefault('is_active', True)
        user = User.objects.create_user(**validated_data)
        user.is_verified = True
        user.save(update_fields=['is_verified'])

        if facility_id:
            from apps.facilities.models import HealthFacility
            try:
                user.facility = HealthFacility.objects.get(id=facility_id)
                user.save(update_fields=['facility'])
            except HealthFacility.DoesNotExist:
                pass

        if user.role == 'driver':
            from apps.transport.models import Driver
            Driver.objects.get_or_create(
                name=user.name,
                defaults={
                    'phone_number':   phone_number,
                    'license_number': license_number,
                    'is_active':      True,
                }
            )

        return user


class PatientServiceReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PatientServiceReview
        fields = [
            'id', 'visit_type', 'period', 'facility_name',
            'rating', 'comments', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate_rating(self, value):
        if not 1 <= value <= 5:
            raise serializers.ValidationError('Rating must be between 1 and 5.')
        return value
