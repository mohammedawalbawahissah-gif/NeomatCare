from rest_framework import serializers

from .models import CycleEntry


class CycleEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CycleEntry
        fields = ["id", "period_start", "period_end", "symptoms", "notes", "created_at"]

    def create(self, validated_data):
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)
