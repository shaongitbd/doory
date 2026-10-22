"""API errors shared by the workspace apps (assets, designs, brand). Codes are part of the contract."""

from rest_framework import status
from rest_framework.exceptions import APIException, Throttled


class InvalidFile(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "invalid_file"
    default_detail = "The file is not a valid, supported file."


class FileTooLarge(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_code = "file_too_large"
    default_detail = "The file is too large."


class QuotaExceeded(APIException):
    status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    default_code = "quota_exceeded"
    default_detail = "Your storage quota is full. Delete some uploads to free up space."


class LimitReached(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = "limit_reached"
    default_detail = "You have reached the limit for this kind of item."


class StockNotConfigured(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "stock_not_configured"
    default_detail = "No stock photo provider is configured on this server."


class StockUnavailable(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_code = "stock_unavailable"
    default_detail = "The stock photo provider could not be reached. Try again shortly."


class StockBusy(Throttled):
    """429 with Retry-After: the provider's limit for this server's key is used up for now."""

    default_code = "stock_busy"
    default_detail = "The stock photo provider is busy."
    extra_detail_singular = "Try again in {wait} second."
    extra_detail_plural = "Try again in {wait} seconds."


class ServerBusy(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "server_busy"
    default_detail = "The server is busy processing other large uploads. Try again in a moment."
    wait = 5  # becomes the Retry-After header


class VideoUnavailable(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "video_unavailable"
    default_detail = "This server can't take videos (ffmpeg is not installed)."
