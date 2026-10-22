from django.conf import settings
from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.views.decorators.cache import cache_control
from django.views.defaults import page_not_found, server_error
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.accounts import oidc
from apps.ai.catalog import ai_config, has_server_options
from apps.ai.serializers import TaskOptionsSerializer
from apps.assets.providers import configured_providers as configured_stock_providers
from apps.collab.availability import max_participants, realtime_enabled
from apps.exports import optimizers
from apps.exports.services import image_formats

from .mlmodels.availability import background_removal_model

_NON_DELIVERING_EMAIL_BACKENDS = {
    "django.core.mail.backends.console.EmailBackend",
    "django.core.mail.backends.dummy.EmailBackend",
    "django.core.mail.backends.filebased.EmailBackend",
    "django.core.mail.backends.locmem.EmailBackend",
}


def email_delivers() -> bool:
    """Whether verification emails reach anyone, so users can be asked to verify their address."""
    return settings.EMAIL_BACKEND not in _NON_DELIVERING_EMAIL_BACKENDS


_CONFIG_SCHEMA = inline_serializer(
    "AppConfig",
    {
        "google_client_id": serializers.CharField(),
        "oidc_button_label": serializers.CharField(),
        "oidc_button_icon": serializers.CharField(),
        "features": inline_serializer(
            "AppConfigFeatures",
            {
                "stock_photos": serializers.BooleanField(),
                "server_pdf": serializers.BooleanField(),
                "google_login": serializers.BooleanField(),
                "oidc_login": serializers.BooleanField(),
                "email_verification": serializers.BooleanField(),
                "background_removal": serializers.BooleanField(),
                "realtime": serializers.BooleanField(),
                "mcp": serializers.BooleanField(),
                "ai_providers": serializers.BooleanField(),
                "image_optimize": inline_serializer(
                    "AppConfigImageOptimize",
                    {
                        "formats": serializers.ListField(
                            child=serializers.ChoiceField(choices=["png", "jpg", "webp", "avif"]),
                            help_text="What POST /api/v1/exports/optimize/ converts a PNG to.",
                        ),
                        "optimizers": serializers.ListField(
                            child=inline_serializer(
                                "AppConfigImageOptimizer",
                                {
                                    "id": serializers.CharField(),
                                    "name": serializers.CharField(),
                                    "formats": serializers.ListField(child=serializers.CharField()),
                                    "sends_offsite": serializers.BooleanField(),
                                },
                            ),
                            help_text="The optimizers people may pick, in the admin's order.",
                        ),
                        "default": serializers.CharField(
                            allow_null=True, help_text="The id `optimize: true` uses; null: none."
                        ),
                    },
                ),
            },
        ),
        "exports": inline_serializer(
            "AppConfigExports",
            {
                "filename_style": serializers.ChoiceField(choices=["simple", "structured"]),
                "filename_timestamp": serializers.BooleanField(),
            },
        ),
        "limits": inline_serializer(
            "AppConfigLimits",
            {
                "max_upload_bytes": serializers.IntegerField(),
                "max_pages": serializers.IntegerField(),
                "max_document_bytes": serializers.IntegerField(),
                "realtime_max_participants": serializers.IntegerField(),
                "bulk_fill_max_rows": serializers.IntegerField(),
            },
        ),
        "assets": inline_serializer(
            "AppConfigAssets",
            {
                "background_removal_model": inline_serializer(
                    "BackgroundRemovalModel",
                    {
                        "id": serializers.CharField(),
                        "name": serializers.CharField(),
                        "url": serializers.CharField(),
                        "bytes": serializers.IntegerField(),
                        "sha256": serializers.CharField(),
                        "input": inline_serializer(
                            "BackgroundRemovalModelInput",
                            {
                                "name": serializers.CharField(),
                                "size": serializers.IntegerField(),
                                "mean": serializers.ListField(child=serializers.FloatField()),
                                "std": serializers.ListField(child=serializers.FloatField()),
                                "rescale": serializers.ChoiceField(choices=["max", "255"]),
                            },
                        ),
                        "output": serializers.CharField(),
                    },
                    allow_null=True,
                ),
            },
        ),
        "ai": inline_serializer(
            "AppConfigAI",
            {
                "user_providers": serializers.ChoiceField(choices=["off", "staff", "everyone"]),
                "offsite_notice": serializers.CharField(
                    help_text="The operator's wording of the notice under options that send the image off "
                    "this installation; empty: the editor's own."
                ),
                "background_removal": TaskOptionsSerializer(
                    help_text="The options every signed-in user has; "
                    "GET /api/v1/ai/models/ lists those of the signed-in user."
                ),
            },
        ),
    },
)


@extend_schema(responses={200: OpenApiResponse(description="Liveness and database check.")}, tags=["system"])
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return Response({"status": "ok"})


def image_optimize_config() -> dict:
    default = optimizers.default_optimizer()
    return {
        "formats": list(image_formats()),
        "optimizers": [
            {
                "id": optimizer.id,
                "name": optimizer.name,
                "formats": list(optimizer.formats),
                "sends_offsite": optimizer.sends_offsite,
            }
            for optimizer in optimizers.available()
        ],
        "default": default.id if default else None,
    }


@extend_schema(responses={200: _CONFIG_SCHEMA}, tags=["system"])
@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@cache_control(public=True, max_age=60)
def config(request):
    """Public runtime configuration: optional integrations, size limits and the models to download."""
    background_removal = background_removal_model()
    return Response(
        {
            "google_client_id": settings.GOOGLE_CLIENT_ID,
            "oidc_button_label": oidc.button_label(),
            "oidc_button_icon": oidc.button_icon(),
            "features": {
                "stock_photos": bool(configured_stock_providers()),
                "server_pdf": settings.SERVER_PDF_ENABLED,
                "google_login": bool(settings.GOOGLE_CLIENT_ID),
                "oidc_login": oidc.enabled(),
                "email_verification": email_delivers(),
                "background_removal": background_removal is not None,
                "realtime": realtime_enabled(),
                "mcp": settings.MCP_ENABLED,
                "ai_providers": has_server_options(),
                "image_optimize": image_optimize_config(),
            },
            "exports": {
                "filename_style": settings.EXPORT_FILENAME_STYLE,
                "filename_timestamp": settings.EXPORT_FILENAME_TIMESTAMP,
            },
            "limits": {
                "max_upload_bytes": settings.MAX_UPLOAD_BYTES,
                "max_pages": settings.MAX_DESIGN_PAGES,
                "max_document_bytes": settings.MAX_DESIGN_DOCUMENT_BYTES,
                "realtime_max_participants": max_participants(),
                "bulk_fill_max_rows": settings.BULK_FILL_MAX_ROWS,
            },
            "assets": {"background_removal_model": background_removal},
            "ai": ai_config(),
        }
    )


def _wants_json(request: HttpRequest) -> bool:
    return request.path.startswith("/api/")


def not_found(request: HttpRequest, exception: Exception) -> JsonResponse:
    """`handler404`: unknown URLs under /api/ answer with the uniform error envelope."""
    if _wants_json(request):
        body = {"error": {"code": "not_found", "message": "Not found."}}
        return JsonResponse(body, status=404)
    return page_not_found(request, exception)


def server_failure(request: HttpRequest) -> JsonResponse:
    """`handler500`: unhandled errors under /api/ answer with the uniform error envelope."""
    if _wants_json(request):
        body = {"error": {"code": "server_error", "message": "Something went wrong on our side."}}
        return JsonResponse(body, status=500)
    return server_error(request)
