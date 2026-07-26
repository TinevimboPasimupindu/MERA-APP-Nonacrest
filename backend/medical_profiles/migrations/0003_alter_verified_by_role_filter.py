from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_rename_hospital_role_to_hospital_admin"),
        ("medical_profiles", "0002_medicalprofile_ai_chatbot_consent_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="medicalprofile",
            name="verified_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="profiles_verified",
                limit_choices_to={"role": "hospital_admin"},
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
