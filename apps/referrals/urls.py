"""
apps/referrals/urls.py
"""
from django.urls import path
from .views import (
    ReferralSuggestView,
    ReferralCreateView,
    ReferralListView,
    ReferralDetailView,
    StatusUpdateView,
    ReferralTimelineView,
    OutcomeView,
)

urlpatterns = [
    path("suggest/",              ReferralSuggestView.as_view(),  name="referral-suggest"),
    path("create/",               ReferralCreateView.as_view(),   name="referral-create"),
    path("",                      ReferralListView.as_view(),      name="referral-list"),
    path("<uuid:id>/",            ReferralDetailView.as_view(),    name="referral-detail"),
    path("<uuid:id>/status/",     StatusUpdateView.as_view(),      name="referral-status-update"),
    path("<uuid:id>/timeline/",   ReferralTimelineView.as_view(),  name="referral-timeline"),
    path("<uuid:id>/outcome/",    OutcomeView.as_view(),           name="referral-outcome"),
]
