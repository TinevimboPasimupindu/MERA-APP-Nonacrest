from django.urls import path
from .views import chatbot_message, chatbot_history

urlpatterns = [
    path("chatbot/message/", chatbot_message, name="chatbot-message"),
    path("chatbot/history/", chatbot_history, name="chatbot-history"),
]