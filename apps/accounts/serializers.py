from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User

# Roles that must be linked to a facility
FACILITY_REQUIRED_ROLES = {'health_worker', 'facility_admin'}


class RegisterSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True, label='Confirm password')
    facility  = serializers.UUIDField(required=False, allow_null=True)

    class Meta:
        model  = User
        fields = ['name', 'email', 'password', 'password2', 'role', 'facility']
        extra_kwargs = {'role': {'required': False}}

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({'password': 'Passwords do not match.'})

        role = attrs.get('role', 'health_worker')
        facility = attrs.get('facility')

        if role in FACILITY_REQUIRED_ROLES and not facility:
            raise serializers.ValidationError({
                'facility': (
                    f'A facility is required for the {role.replace("_", " ")} role. '
                    f'Please select your facility.'
                )
            })

        return attrs

    def create(self, validated_data):
        facility_id = validated_data.pop('facility', None)
        user = User.objects.create_user(**validated_data)
        if facility_id:
            from apps.facilities.models import HealthFacility
            try:
                user.facility = HealthFacility.objects.get(id=facility_id)
                user.save(update_fields=['facility'])
            except HealthFacility.DoesNotExist:
                pass
        return user


class UserSerializer(serializers.ModelSerializer):
    facility_name = serializers.CharField(source='facility.name', read_only=True, allow_null=True)
    facility_id   = serializers.UUIDField(source='facility.id',   read_only=True, allow_null=True)

    class Meta:
        model  = User
        fields = ['id', 'name', 'email', 'role', 'facility_id', 'facility_name', 'is_active', 'created_at']
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
