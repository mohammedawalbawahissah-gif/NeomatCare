"""
apps/cases/urls.py
"""
from django.urls import path
from .views import EmergencyCaseListCreateView, EmergencyCaseDetailView, TriageNoteCreateView

urlpatterns = [
    path("",              EmergencyCaseListCreateView.as_view(), name="case-list-create"),
    path("<uuid:id>/",    EmergencyCaseDetailView.as_view(),     name="case-detail"),
    path("<uuid:id>/triage-note/", TriageNoteCreateView.as_view(), name="case-triage-note"),
]
