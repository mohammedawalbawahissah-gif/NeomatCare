from django.db import migrations

STAFF_ROLES_REQUIRING_APPROVAL = {'health_worker', 'facility_admin', 'specialist', 'driver'}


def grandfather_existing_staff(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(
        role__in=STAFF_ROLES_REQUIRING_APPROVAL,
        is_active=True,
    ).update(is_approved=True)


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0016_user_is_approved_alter_user_role"),
    ]

    operations = [
        migrations.RunPython(grandfather_existing_staff, reverse_noop),
    ]