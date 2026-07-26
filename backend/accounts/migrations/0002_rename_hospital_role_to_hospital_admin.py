from django.db import migrations, models


def forwards_rename_hospital_role(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="hospital").update(role="hospital_admin")


def backwards_rename_hospital_role(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="hospital_admin").update(role="hospital")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forwards_rename_hospital_role, backwards_rename_hospital_role),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[
                    ("patient", "Patient"),
                    ("hospital_admin", "Hospital Admin"),
                    ("ambulance_service", "Ambulance Service"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
