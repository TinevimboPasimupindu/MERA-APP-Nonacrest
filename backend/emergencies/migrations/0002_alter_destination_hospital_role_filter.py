from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_rename_hospital_role_to_hospital_admin"),
        ("emergencies", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="incident",
            name="destination_hospital",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="incidents_as_destination",
                limit_choices_to={"role": "hospital_admin"},
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
