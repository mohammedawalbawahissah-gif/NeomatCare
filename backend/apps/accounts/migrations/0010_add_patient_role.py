from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0009_alter_user_role'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('superadmin', 'Super Admin'),
                    ('facility_admin', 'Facility Admin'),
                    ('health_worker', 'Health Worker'),
                    ('specialist', 'Specialist'),
                    ('driver', 'Driver'),
                    ('patient', 'Patient'),
                ],
                default='health_worker',
                max_length=20,
            ),
        ),
    ]
