from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    IncidentViewSet,
    NFCTagGenerateView,
    NFCTagListView,
    NFCTagPairView,
    NFCTagStatusView,
    NFCTagTriggerView,
    NFCTagUnpairView,
    NFCTagVoidView,
)

router = DefaultRouter()
router.register(r"incidents", IncidentViewSet, basename="incident")

urlpatterns = router.urls + [
    # MERA admin — NFC tag inventory management
    path("nfc-tags/generate/", NFCTagGenerateView.as_view(), name="nfc-tags-generate"),
    path("nfc-tags/", NFCTagListView.as_view(), name="nfc-tags-list"),
    path("nfc-tags/pair/", NFCTagPairView.as_view(), name="nfc-tags-pair"),
    path("nfc-tags/<uuid:tag_id>/unpair/", NFCTagUnpairView.as_view(), name="nfc-tags-unpair"),
    path("nfc-tags/<uuid:tag_id>/void/", NFCTagVoidView.as_view(), name="nfc-tags-void"),

    # Public, unauthenticated bystander flow
    path("nfc/<str:token>/", NFCTagStatusView.as_view(), name="nfc-tag-status"),
    path("nfc/<str:token>/trigger/", NFCTagTriggerView.as_view(), name="nfc-tag-trigger"),
]
