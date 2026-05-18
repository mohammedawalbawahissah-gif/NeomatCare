"""
apps/facilities/urls.py
"""
from django.urls import path
from .views import FacilityListCreateView, FacilityDetailView, CapacityUpdateView, CapacityHistoryView

urlpatterns = [
    path("",                              FacilityListCreateView.as_view(), name="facility-list-create"),
    path("<uuid:id>/",                    FacilityDetailView.as_view(),     name="facility-detail"),
    path("<uuid:id>/capacity/",           CapacityUpdateView.as_view(),     name="facility-capacity-update"),
    path("<uuid:id>/capacity-history/",   CapacityHistoryView.as_view(),    name="facility-capacity-history"),
]
