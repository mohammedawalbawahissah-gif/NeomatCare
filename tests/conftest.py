"""
tests/conftest.py
-----------------
Shared fixtures available to all test files.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.facilities.models import HealthFacility
from apps.cases.models import Patient, EmergencyCase

User = get_user_model()


# ── API client ────────────────────────────────────────────────────────────────
@pytest.fixture
def api_client():
    return APIClient()


# ── Users ─────────────────────────────────────────────────────────────────────
@pytest.fixture
def superadmin(db):
    return User.objects.create_user(
        email="admin@test.com",
        name="Super Admin",
        password="TestPass123!",
        role="superadmin",
        is_staff=True,
    )


@pytest.fixture
def facility_admin(db, facility_level4):
    return User.objects.create_user(
        email="fadmin@test.com",
        name="Facility Admin",
        password="TestPass123!",
        role="facility_admin",
        facility=facility_level4,
    )


@pytest.fixture
def facility_admin(db, facility_level3):
    return User.objects.create_user(
        email="fadmin@test.com",
        name="Facility Admin",
        password="TestPass123!",
        role="facility_admin",
        facility=facility_level3,
    )


# ── Authenticated clients ─────────────────────────────────────────────────────
@pytest.fixture
def auth_superadmin(api_client, superadmin):
    api_client.force_authenticate(user=superadmin)
    return api_client


@pytest.fixture
def health_worker(db, facility_level3):
    return User.objects.create_user(
        email="worker@test.com",
        name="Health Worker",
        password="TestPass123!",
        role="health_worker",
        facility=facility_level3,
    )


@pytest.fixture
def auth_worker(api_client, health_worker):
    api_client.force_authenticate(user=health_worker)
    return api_client


@pytest.fixture
def auth_facility_admin(api_client, facility_admin):
    api_client.force_authenticate(user=facility_admin)
    return api_client


# ── Facilities ────────────────────────────────────────────────────────────────
@pytest.fixture
def facility_level3(db):
    return HealthFacility.objects.create(
        name="Regional Referral Hospital",
        level=3,
        district="Ayawaso West",
        region="Greater Accra",
        latitude=5.614,
        longitude=-0.205,
        theatre_available=True,
        blood_bank=True,
        icu_beds_available=4,
        nicu_cots_available=6,
        on_call_specialist=True,
        is_active=True,
    )


@pytest.fixture
def facility_level2(db):
    return HealthFacility.objects.create(
        name="District General Hospital",
        level=2,
        district="Tema",
        region="Greater Accra",
        latitude=5.670,
        longitude=-0.017,
        theatre_available=True,
        blood_bank=False,
        icu_beds_available=0,
        nicu_cots_available=0,
        on_call_specialist=True,
        is_active=True,
    )


@pytest.fixture
def facility_level4(db):
    return HealthFacility.objects.create(
        name="Teaching Hospital",
        level=4,
        district="Ablekuma Central",
        region="Greater Accra",
        latitude=5.536,
        longitude=-0.227,
        theatre_available=True,
        blood_bank=True,
        icu_beds_available=10,
        nicu_cots_available=15,
        on_call_specialist=True,
        is_active=True,
    )


# ── Patient and EmergencyCase ─────────────────────────────────────────────────
@pytest.fixture
def patient(db):
    return Patient.objects.create(
        age=28,
        district="Ayawaso West",
        blood_group="O+",
        anc_visits=4,
    )


@pytest.fixture
def pph_case(db, patient, health_worker, facility_level3):
    """A PPH + severe anaemia emergency case — requires blood bank + theatre."""
    return EmergencyCase.objects.create(
        patient=patient,
        gestational_age_weeks=38,
        gravida=2,
        parity=1,
        presenting_complaint="Heavy postpartum bleeding",
        danger_signs=["PPH", "SEVERE_ANAEMIA"],
        vital_signs={"systolic_bp": 88, "diastolic_bp": 60, "heart_rate": 118},
        membranes_status="ruptured",
        created_by=health_worker,
        referring_facility=facility_level3,
    )


@pytest.fixture
def eclampsia_case(db, patient, health_worker, facility_level3):
    """An eclampsia case — requires ICU + specialist."""
    return EmergencyCase.objects.create(
        patient=patient,
        gestational_age_weeks=36,
        gravida=1,
        parity=0,
        presenting_complaint="Seizures, BP 180/120",
        danger_signs=["ECLAMPSIA"],
        vital_signs={"systolic_bp": 180, "diastolic_bp": 120, "heart_rate": 100},
        membranes_status="intact",
        created_by=health_worker,
        referring_facility=facility_level3,
    )
