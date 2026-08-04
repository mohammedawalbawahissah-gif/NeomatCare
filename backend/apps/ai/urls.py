"""
apps/ai/urls.py
"""
from django.urls import path
from .views import (
    TriageExtractView,
    RiskNarrateView,
    ANCAnomalyView,
    ReferralHandoverView,
    TransportRecommendView,
    ChatView,
)

urlpatterns = [
    path("triage-extract/",      TriageExtractView.as_view(),      name="ai-triage-extract"),
    path("risk-narrate/",        RiskNarrateView.as_view(),        name="ai-risk-narrate"),
    path("anc-anomaly/",         ANCAnomalyView.as_view(),         name="ai-anc-anomaly"),
    path("referral-handover/",   ReferralHandoverView.as_view(),   name="ai-referral-handover"),
    path("transport-recommend/", TransportRecommendView.as_view(), name="ai-transport-recommend"),
    path("chat/",                ChatView.as_view(),               name="ai-chat"),
]
