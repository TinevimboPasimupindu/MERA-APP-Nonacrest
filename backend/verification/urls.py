from rest_framework.routers import DefaultRouter
from .views import VerificationViewSet

router = DefaultRouter()
router.register(r"verification", VerificationViewSet, basename="verification")
urlpatterns = router.urls
