from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_rename_hospital_role_to_hospital_admin"),
        ("verification", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="verificationrequest",
            name="hospital",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="verification_queue",
                limit_choices_to={"role": "hospital_admin"},
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
