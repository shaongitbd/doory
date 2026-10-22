from django.urls import path

from . import views

urlpatterns = [
    path("size-presets/", views.size_presets, name="size-presets"),
    path("size-presets/mine/", views.my_sizes, name="size-presets-mine"),
]
