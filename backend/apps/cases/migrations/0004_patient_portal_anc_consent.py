"""
Migration: Patient portal, ANC visits, consent, risk fields, case outcomes.
"""
import django.db.models.deletion
import django.utils.timezone
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cases', '0003_rename_district_patient_town'),
        ('facilities', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── Patient new fields ──────────────────────────────────────────
        migrations.AddField(
            model_name='patient',
            name='date_of_birth',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='patient',
            name='next_of_kin_name',
            field=models.CharField(blank=True, max_length=200),
        ),
        migrations.AddField(
            model_name='patient',
            name='next_of_kin_phone',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='patient',
            name='next_of_kin_relationship',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='patient',
            name='expected_delivery_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='patient',
            name='gravida',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='patient',
            name='parity',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='patient',
            name='risk_level',
            field=models.CharField(
                choices=[('low','Low'),('medium','Medium'),('high','High')],
                default='low', max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='patient',
            name='risk_flags',
            field=models.JSONField(default=list),
        ),
        migrations.AddField(
            model_name='patient',
            name='notes',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='patient',
            name='patient_user',
            field=models.OneToOneField(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='patient_profile',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='patient',
            name='consent_given',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='patient',
            name='consent_given_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='patient',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AddField(
            model_name='patient',
            name='registered_at_facility',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='registered_patients',
                to='facilities.healthfacility',
            ),
        ),
        migrations.AlterField(
            model_name='patient',
            name='hospital_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=100),
        ),
        # ── ANCVisit model ──────────────────────────────────────────────
        migrations.CreateModel(
            name='ANCVisit',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('visit_date', models.DateField()),
                ('gestational_age_weeks', models.PositiveIntegerField(blank=True, null=True)),
                ('weight_kg', models.FloatField(blank=True, null=True)),
                ('bp_systolic', models.PositiveIntegerField(blank=True, null=True)),
                ('bp_diastolic', models.PositiveIntegerField(blank=True, null=True)),
                ('fetal_heart_rate', models.PositiveIntegerField(blank=True, null=True)),
                ('fundal_height_cm', models.FloatField(blank=True, null=True)),
                ('notes', models.TextField(blank=True)),
                ('concerns', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('patient', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='anc_visit_log', to='cases.patient',
                )),
                ('facility', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='anc_visits', to='facilities.healthfacility',
                )),
                ('conducted_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='anc_visits_conducted', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-visit_date']},
        ),
        # ── PatientConsent model ────────────────────────────────────────
        migrations.CreateModel(
            name='PatientConsent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('consent_type', models.CharField(
                    choices=[('data_use','Data Use & Storage'),('portal','Patient Portal Access'),('sharing','Facility Data Sharing'),('research','Anonymised Research Use')],
                    max_length=20,
                )),
                ('action', models.CharField(
                    choices=[('granted','Granted'),('revoked','Revoked'),('updated','Updated')],
                    max_length=10,
                )),
                ('notes', models.TextField(blank=True)),
                ('timestamp', models.DateTimeField(default=django.utils.timezone.now)),
                ('patient', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='consents', to='cases.patient',
                )),
                ('recorded_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='consents_recorded', to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'ordering': ['-timestamp']},
        ),
        # ── EmergencyCase outcome fields ─────────────────────────────────
        migrations.AddField(
            model_name='emergencycase',
            name='maternal_outcome',
            field=models.CharField(
                choices=[('survived','Survived'),('died','Died'),('unknown','Unknown')],
                default='unknown', max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='emergencycase',
            name='neonatal_outcome',
            field=models.CharField(
                choices=[('survived','Survived'),('died','Died'),('unknown','Unknown')],
                default='unknown', max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='emergencycase',
            name='outcome_notes',
            field=models.TextField(blank=True),
        ),
    ]
