"""
apps/voice/views.py
────────────────────
Endpoints:
  GET  /api/voice/languages/   — which non-English languages are available and for what
  POST /api/voice/transcribe/  — multipart audio upload + lang -> { text }
  POST /api/voice/synthesize/  — { text, lang } -> audio bytes (audio/mpeg)
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from django.http import HttpResponse

from apps.voice.service import LANGUAGES, VoiceServiceError, transcribe, synthesize


class VoiceLanguagesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            code: {
                "label": info["label"],
                "dictation_available": info["stt_provider"] is not None,
                "read_aloud_available": info["tts_provider"] is not None,
            }
            for code, info in LANGUAGES.items()
        })


class TranscribeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        lang = request.data.get("lang")
        audio_file = request.FILES.get("audio")
        if not lang:
            return Response({"error": "lang is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not audio_file:
            return Response({"error": "audio file is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            text = transcribe(audio_file.read(), lang, content_type=audio_file.content_type or "")
            return Response({"text": text})
        except VoiceServiceError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class SynthesizeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        lang = request.data.get("lang")
        text = request.data.get("text")
        if not lang or not text:
            return Response({"error": "text and lang are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            audio_bytes = synthesize(text, lang)
            return HttpResponse(audio_bytes, content_type="audio/mpeg")
        except VoiceServiceError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
