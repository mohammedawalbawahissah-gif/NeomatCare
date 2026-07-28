from django.urls import path

from .views import (
    AdultNutritionView,
    ChildNutritionView,
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
    path("child-nutrition/<uuid:patient_id>/", ChildNutritionView.as_view()),
    path("adult-nutrition/me/", AdultNutritionView.as_view()),
]
