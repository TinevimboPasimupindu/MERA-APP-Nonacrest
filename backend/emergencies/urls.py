from django.urls import path
from rest_framework.routers import DefaultRouter

from .history import IncidentHistoryDetailView, IncidentHistoryListView
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

urlpatterns = [
    # Read-only incident history for the web dashboards (see history.py).
    # Listed before router.urls so the router's incidents/{pk}/ pattern can
    # never capture "history" as a pk.
    path("incidents/history/", IncidentHistoryListView.as_view(), name="incident-history"),
    path(
        "incidents/<uuid:incident_id>/history_detail/",
        IncidentHistoryDetailView.as_view(),
        name="incident-history-detail",
    ),
] + router.urls + [
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
