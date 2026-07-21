"""
apps/voice/urls.py
"""
from django.urls import path
from .views import VoiceLanguagesView, TranscribeView, SynthesizeView

urlpatterns = [
    path("languages/",  VoiceLanguagesView.as_view(), name="voice-languages"),
    path("transcribe/", TranscribeView.as_view(),     name="voice-transcribe"),
    path("synthesize/", SynthesizeView.as_view(),      name="voice-synthesize"),
]
