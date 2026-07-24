from rest_framework.routers import DefaultRouter
from .views import MedicalProfileViewSet

router = DefaultRouter()
router.register(r"medical-profile", MedicalProfileViewSet, basename="medical-profile")
urlpatterns = router.urls
