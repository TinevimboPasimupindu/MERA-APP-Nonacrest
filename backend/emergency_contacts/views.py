from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from .models import EmergencyContact
from .serializers import EmergencyContactSerializer
from accounts.permissions import IsPatient  # custom permission — see accounts app


class EmergencyContactViewSet(viewsets.ModelViewSet):
    serializer_class = EmergencyContactSerializer
    permission_classes = [permissions.IsAuthenticated, IsPatient]

    def get_queryset(self):
        """Patients can only see and manage their own contacts."""
        return EmergencyContact.objects.filter(patient=self.request.user)

    def perform_create(self, serializer):
        serializer.save(patient=self.request.user)

    def perform_update(self, serializer):
        # Extra guard: ownership checked by get_queryset, but belt-and-braces
        if serializer.instance.patient != self.request.user:
            raise PermissionDenied("You may only edit your own emergency contacts.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance.patient != self.request.user:
            raise PermissionDenied("You may only delete your own emergency contacts.")
        instance.delete()
