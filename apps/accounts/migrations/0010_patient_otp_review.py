from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_alter_user_role'),
    ]

    operations = [
        # 1. Add patient role to User.role choices
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('superadmin',     'Super Admin'),
                    ('facility_admin', 'Facility Admin'),
                    ('health_worker',  'Health Worker'),
                    ('specialist',     'Specialist'),
                    ('driver',         'Driver'),
                    ('patient',        'Patient'),
                ],
                default='health_worker',
                max_length=20,
            ),
        ),

        # 2. Add phone_number to User (may already exist via older migration — safe with ignore_if_exists)
        migrations.AddField(
            model_name='user',
            name='phone_number',
            field=models.CharField(blank=True, default='', max_length=20),
            preserve_default=False,
        ),

        # 3. Add is_verified to User
        migrations.AddField(
            model_name='user',
            name='is_verified',
            field=models.BooleanField(default=False),
        ),

        # 4. Create OTPVerification table
        migrations.CreateModel(
            name='OTPVerification',
            fields=[
                ('id',         models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('code',       models.CharField(max_length=6)),
                ('channel',    models.CharField(choices=[('sms', 'SMS'), ('email', 'Email')], default='sms', max_length=5)),
                ('is_used',    models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('user',       models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='otp_verifications', to='accounts.user')),
            ],
            options={
                'db_table': 'accounts_otp_verification',
                'ordering': ['-created_at'],
            },
        ),

        # 5. Create PatientServiceReview table
        migrations.CreateModel(
            name='PatientServiceReview',
            fields=[
                ('id',            models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('visit_type',    models.CharField(choices=[('anc', 'Antenatal Care (ANC)'), ('delivery', 'Delivery'), ('postnatal', 'Postnatal Visit'), ('emergency', 'Emergency Visit'), ('transport', 'Transport Service'), ('other', 'Other')], max_length=20)),
                ('period',        models.CharField(choices=[('pre_labour', 'Pre-Labour'), ('post_labour', 'Post-Labour')], default='pre_labour', max_length=15)),
                ('facility_name', models.CharField(blank=True, max_length=255)),
                ('rating',        models.PositiveSmallIntegerField()),
                ('comments',      models.TextField(blank=True)),
                ('created_at',    models.DateTimeField(auto_now_add=True)),
                ('patient',       models.ForeignKey(limit_choices_to={'role': 'patient'}, on_delete=django.db.models.deletion.CASCADE, related_name='service_reviews', to='accounts.user')),
            ],
            options={
                'db_table': 'accounts_patient_service_review',
                'ordering': ['-created_at'],
            },
        ),
    ]
