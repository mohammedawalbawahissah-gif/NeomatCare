from django.urls import path
from .views import (
    PatientListCreateView, PatientDetailView, PatientCasesView,
    PatientRiskView, ANCVisitListCreateView, ANCVisitDetailView,
    PatientConsentView, PatientPortalGrantView, PatientPortalRevokeView,
    EmergencyCaseListCreateView, EmergencyCaseDetailView,
    TriageNoteCreateView, SuggestFacilitiesView,
    HouseholdListCreateView, HouseholdDetailView, GrowthRecordListCreateView,
)

urlpatterns = [
    # Patients
    path("patients/",                                    PatientListCreateView.as_view(),  name="patient-list-create"),
    path("patients/<uuid:pk>/",                          PatientDetailView.as_view(),      name="patient-detail"),
    path("patients/<uuid:pk>/cases/",                    PatientCasesView.as_view(),       name="patient-cases"),
    path("patients/<uuid:pk>/compute-risk/",             PatientRiskView.as_view(),        name="patient-risk"),
    path("patients/<uuid:pk>/anc-visits/",               ANCVisitListCreateView.as_view(), name="patient-anc-visits"),
    path("patients/<uuid:pk>/anc-visits/<uuid:visit_id>/", ANCVisitDetailView.as_view(),   name="patient-anc-visit-detail"),
    path("patients/<uuid:pk>/growth-records/",           GrowthRecordListCreateView.as_view(), name="patient-growth-records"),
    path("patients/<uuid:pk>/consent/",                  PatientConsentView.as_view(),     name="patient-consent"),
    path("patients/<uuid:pk>/grant-portal/",             PatientPortalGrantView.as_view(), name="patient-grant-portal"),
    path("patients/<uuid:pk>/revoke-portal/",            PatientPortalRevokeView.as_view(),name="patient-revoke-portal"),
    # Households
    path("households/",                                  HouseholdListCreateView.as_view(), name="household-list-create"),
    path("households/<uuid:pk>/",                        HouseholdDetailView.as_view(),     name="household-detail"),
    # Cases
    path("",                                             EmergencyCaseListCreateView.as_view(), name="case-list-create"),
    path("<uuid:id>/",                                   EmergencyCaseDetailView.as_view(),     name="case-detail"),
    path("<uuid:id>/triage-note/",                       TriageNoteCreateView.as_view(),        name="case-triage-note"),
    path("<uuid:id>/suggest-facilities/",                SuggestFacilitiesView.as_view(),       name="case-suggest-facilities"),
]
