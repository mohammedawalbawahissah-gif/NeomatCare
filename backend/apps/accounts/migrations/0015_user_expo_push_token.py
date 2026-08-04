from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Re-adds expo_push_token to accounts.User.

    This field was originally added by the (irregularly named) migration
    `user_expo_push_token`, merged in `0006_merge_20260522_1957`, and then
    removed again in `0007_remove_user_expo_push_token`. The model was
    never updated to reflect that removal, so apps/accounts/views.py
    (PushTokenView) referenced a field that did not exist on the model,
    causing every POST /api/auth/push-token/ call to fail. This migration
    brings the field back in line with the model.
    """

    dependencies = [
        ("accounts", "0014_alter_user_is_verified"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="expo_push_token",
            field=models.CharField(max_length=200, blank=True, default=""),
        ),
    ]
