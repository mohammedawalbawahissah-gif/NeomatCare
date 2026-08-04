# Generated for CallSignal (WebRTC signaling)

import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('consultations', '0002_specialistprofile_bio_specialistprofile_display_name_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CallSignal',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('kind', models.CharField(choices=[('offer', 'Offer'), ('answer', 'Answer'), ('ice', 'ICE Candidate'), ('hangup', 'Hangup')], max_length=10)),
                ('call_type', models.CharField(blank=True, max_length=10)),
                ('payload', models.JSONField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('consultation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='call_signals', to='consultations.consultation')),
                ('sender', models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'consultations_call_signal',
                'ordering': ['created_at'],
            },
        ),
    ]
