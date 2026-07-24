from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import MedicalProfile


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_medical_profile(sender, instance, created, **kwargs):
    # Create a blank MedicalProfile when a new Patient account is registered.
    if created and instance.role == "patient":
        MedicalProfile.objects.get_or_create(patient=instance)
