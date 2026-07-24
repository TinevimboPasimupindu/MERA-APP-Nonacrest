import uuid
from django.db import models
from django.core.validators import RegexValidator
from django.conf import settings


phone_validator = RegexValidator(
    regex=r"^\+?1?\d{9,15}$",
    message="Phone number must be in format: '+999999999'. Up to 15 digits.",
)

RELATIONSHIP_CHOICES = [
    ("spouse", "Spouse"),
    ("parent", "Parent"),
    ("sibling", "Sibling"),
    ("child", "Child"),
    ("friend", "Friend"),
    ("colleague", "Colleague"),
    ("guardian", "Guardian"),
    ("other", "Other"),
]


class EmergencyContact(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Ownership — links to Patient user only (enforced at serializer/view level)
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="emergency_contacts",
        limit_choices_to={"role": "patient"},
    )

    full_name = models.CharField(max_length=255)
    relationship = models.CharField(
        max_length=50,
        choices=RELATIONSHIP_CHOICES,
        default="other",
    )
    phone_number = models.CharField(max_length=20, validators=[phone_validator])

    # Soft ordering so patient controls priority of notification
    priority_order = models.PositiveSmallIntegerField(
        default=1,
        help_text="Lower number = notified first. 1–5.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority_order", "created_at"]
        verbose_name = "Emergency Contact"
        verbose_name_plural = "Emergency Contacts"
        # Enforce max 5 contacts per patient at the DB level via a check constraint.
        # The hard cap is also enforced in the serializer (see serializers.py).
        constraints = [
            models.CheckConstraint(
                check=models.Q(priority_order__gte=1) & models.Q(priority_order__lte=5),
                name="priority_order_1_to_5",
            )
        ]

    def __str__(self):
        return f"{self.full_name} ({self.relationship}) — patient: {self.patient_id}"
