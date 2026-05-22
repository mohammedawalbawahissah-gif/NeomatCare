"""
Migration: add expo_push_token to accounts.User
------------------------------------------------
Run after placing in apps/accounts/migrations/:

    python manage.py migrate accounts

Update the dependency below to match your latest migration filename.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    # Update to your latest migration — should be user_phone_number
    dependencies = [
        ("accounts", "user_phone_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="expo_push_token",
            field=models.CharField(
                max_length=200,
                blank=True,
                default="",
                help_text=(
                    "Expo push notification token registered by the mobile app. "
                    "Format: ExponentPushToken[xxxx]. Set automatically on login."
                ),
            ),
        ),
    ]
