from django.urls import path

from .views import ImageDownloadView, ImageExportView, PdfExportView

urlpatterns = [
    path("exports/pdf/", PdfExportView.as_view(), name="export-pdf"),
    path("designs/<uuid:pk>/export/image/", ImageExportView.as_view(), name="export-image"),
    path("exports/image/<str:token>/", ImageDownloadView.as_view(), name="export-image-download"),
]
