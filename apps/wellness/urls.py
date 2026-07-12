from django.urls import path

from .views import CycleEntryListCreateView, CyclePredictionView, MyPregnancySnapshotView

urlpatterns = [
    path("pregnancy/me/", MyPregnancySnapshotView.as_view()),
    path("cycle/", CycleEntryListCreateView.as_view()),
    path("cycle/prediction/", CyclePredictionView.as_view()),
]
