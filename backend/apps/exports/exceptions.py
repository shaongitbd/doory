from rest_framework import status
from rest_framework.exceptions import APIException


class PayloadTooLarge(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_detail = "The upload is too large."
    default_code = "payload_too_large"


class InvalidExport(APIException):
    """Input that passed field validation but cannot be exported (e.g. an unsafe SVG)."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "The export request is invalid."
    default_code = "invalid_export"

    def __init__(self, code: str, message: str) -> None:
        super().__init__(detail=message, code=code)


class ExportDisabled(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "Server-side PDF export is not enabled on this server."
    default_code = "server_pdf_disabled"


class ImageExportDisabled(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_detail = "Server-side image export is not enabled on this server."
    default_code = "server_image_export_disabled"


class ExportBusy(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "The export service is busy. Try again in a few seconds."
    default_code = "export_busy"
    wait = 5  # becomes the Retry-After header


class ExportUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "The PDF renderer is not available on this server."
    default_code = "export_unavailable"


class ExportTimeout(APIException):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    default_detail = "The export took too long and was cancelled."
    default_code = "export_timeout"


class ExportFailed(APIException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    default_detail = "The PDF could not be rendered."
    default_code = "export_failed"
