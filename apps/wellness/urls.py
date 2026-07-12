from django.urls import path

from .views import (
    CycleEntryListCreateView,
    CyclePredictionView,
    MyPregnancySnapshotView,
    SetExpectedDeliveryView,
)

urlpatterns = [
    path("pregnancy/me/", MyPregnancySnapshotView.as_view()),
    path("pregnancy/set-edd/", SetExpectedDeliveryView.as_view()),
    path("cycle/", CycleEntryListCreateView.as_view()),
    path("cycle/prediction/", CyclePredictionView.as_view()),
]
