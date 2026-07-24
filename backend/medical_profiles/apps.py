from django.apps import AppConfig


class MedicalProfilesConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "medical_profiles"
    verbose_name = "Medical Profiles"

    def ready(self):
        import medical_profiles.signals  # noqa: F401
