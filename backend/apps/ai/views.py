"""`/api/v1/ai/`: the options a user may pick, running a task, the Doory-compatible contract, and the user's
own providers (when `AI_USER_PROVIDERS` allows them)."""

from __future__ import annotations

from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assets.models import Asset
from apps.assets.serializers import AssetSerializer
from apps.assets.throttling import UploadRateThrottle
from apps.core.exceptions import ApiError
from apps.core.parsers import BoundedJSONParser

from . import catalog, services
from .errors import AIProviderError, UserProvidersDisabled
from .models import Provider, ProviderModel
from .serializers import (
    OptionSerializer,
    ProviderModelsSerializer,
    ProviderSerializer,
    ProviderTestRequestSerializer,
    ProviderTestResultSerializer,
    TaskRequestSerializer,
)
from .tasks import TASKS, InvalidOptions
from .throttling import AIRateThrottle

CONTRACT = Path(__file__).resolve().parent / "contract" / "openapi.yaml"


@extend_schema(tags=["ai"])
class ModelListView(APIView):
    @extend_schema(
        parameters=[OpenApiParameter("task", str, description="e.g. background-removal; empty: every task.")],
        responses=OptionSerializer(many=True),
    )
    def get(self, request):
        """The options the signed-in user may pick (device first), without URLs or secrets."""
        task = request.query_params.get("task") or None
        if task is not None and task not in TASKS:
            raise ApiError("unknown_task", "Unknown task.", status.HTTP_404_NOT_FOUND)
        return Response([option.public() for option in catalog.options(request.user, task)])


@extend_schema(tags=["ai"])
class TaskView(APIView):
    """`POST /ai/{task}/`: the same endpoint for every task in `apps.ai.tasks`."""

    parser_classes = [BoundedJSONParser]

    def get_throttles(self):
        return [*super().get_throttles(), AIRateThrottle(), UploadRateThrottle()]

    @extend_schema(
        operation_id="ai_run_task",
        request=TaskRequestSerializer,
        responses={
            201: AssetSerializer,
            404: OpenApiResponse(description="Unknown task, asset or option."),
            429: OpenApiResponse(description="Rate limit or the option's daily quota reached."),
            502: OpenApiResponse(description="The provider failed or answered something unusable."),
            504: OpenApiResponse(description="The provider took too long."),
        },
    )
    def post(self, request, task: str):
        """Run `task` on one of the user's images (background-removal) or on a prompt (text-to-image); the
        result is a new asset."""
        if task not in TASKS:
            raise ApiError("unknown_task", "Unknown task.", status.HTTP_404_NOT_FOUND)
        body = TaskRequestSerializer(data=request.data, context={"task": TASKS[task]})
        body.is_valid(raise_exception=True)
        asset_id = body.validated_data.get("asset_id")
        asset = get_object_or_404(Asset, pk=asset_id, owner=request.user) if asset_id else None
        try:
            result = services.run(
                request.user,
                task,
                asset,
                body.validated_data["model"],
                body.validated_data.get("options"),
                prompt=body.validated_data.get("prompt", ""),
            )
        except InvalidOptions as exc:
            raise ApiError("invalid_options", str(exc)) from None
        return Response(AssetSerializer(result).data, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=["ai"],
    responses={(200, "application/yaml"): OpenApiTypes.STR},
    description="The OpenAPI contract a Doory-compatible AI server implements.",
)
class ContractView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request):
        response = FileResponse(CONTRACT.open("rb"), content_type="application/yaml; charset=utf-8")
        response["Cache-Control"] = "public, max-age=3600"
        return response


# -- the user's own providers --------------------------------------------------------------------------------


class UserProvidersAllowed(BasePermission):
    def has_permission(self, request, view):
        if not catalog.user_providers_allowed(request.user):
            raise UserProvidersDisabled()
        return True


class _OwnProviders(APIView):
    parser_classes = [BoundedJSONParser]

    def get_permissions(self):
        return [*super().get_permissions(), UserProvidersAllowed()]

    def provider(self, request, pk) -> Provider:
        return get_object_or_404(Provider.objects.prefetch_related("models"), pk=pk, owner=request.user)


@extend_schema(tags=["ai"])
class ProviderListView(_OwnProviders):
    @extend_schema(responses=ProviderSerializer(many=True))
    def get(self, request):
        providers = Provider.objects.filter(owner=request.user).prefetch_related("models")
        return Response(ProviderSerializer(providers, many=True).data)

    @extend_schema(request=ProviderSerializer, responses={201: ProviderSerializer})
    def post(self, request):
        if Provider.objects.filter(owner=request.user).count() >= settings.AI_MAX_PROVIDERS_PER_USER:
            raise ApiError(
                "limit_reached",
                f"You can add at most {settings.AI_MAX_PROVIDERS_PER_USER} servers.",
                status.HTTP_409_CONFLICT,
            )
        body = ProviderSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        provider = body.save(owner=request.user)
        return Response(ProviderSerializer(provider).data, status=status.HTTP_201_CREATED)


@extend_schema(tags=["ai"])
class ProviderDetailView(_OwnProviders):
    @extend_schema(responses=ProviderSerializer)
    def get(self, request, pk):
        return Response(ProviderSerializer(self.provider(request, pk)).data)

    @extend_schema(request=ProviderSerializer, responses=ProviderSerializer)
    def patch(self, request, pk):
        body = ProviderSerializer(self.provider(request, pk), data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        return Response(ProviderSerializer(body.save()).data)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        self.provider(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["ai"])
class ProviderModelsView(_OwnProviders):
    @extend_schema(request=ProviderModelsSerializer, responses=ProviderSerializer)
    def put(self, request, pk):
        """Replace the provider's models (which to offer, their labels and order)."""
        provider = self.provider(request, pk)
        body = ProviderModelsSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            keep = []
            for order, item in enumerate(body.validated_data["models"]):
                row, _ = ProviderModel.objects.update_or_create(
                    provider=provider,
                    task=item["task"],
                    remote_name=item.get("remote_name", ""),
                    defaults={
                        "label": item.get("label", ""),
                        "enabled": item.get("enabled", True),
                        "sort_order": item.get("sort_order", order),
                    },
                )
                keep.append(row.pk)
            provider.models.exclude(pk__in=keep).delete()
            provider.save(update_fields=["updated_at"])
        return Response(ProviderSerializer(self.provider(request, pk)).data)


@extend_schema(tags=["ai"])
class ProviderLoadModelsView(_OwnProviders):
    def get_throttles(self):
        return [*super().get_throttles(), AIRateThrottle()]

    @extend_schema(request=None, responses=ProviderSerializer)
    def post(self, request, pk):
        """Doory-compatible servers: add the models the server lists for the provider's tasks."""
        provider = self.provider(request, pk)
        services.load_models(provider)
        return Response(ProviderSerializer(self.provider(request, pk)).data)


@extend_schema(tags=["ai"])
class ProviderTestView(_OwnProviders):
    def get_throttles(self):
        return [*super().get_throttles(), AIRateThrottle()]

    @extend_schema(request=ProviderTestRequestSerializer, responses=ProviderTestResultSerializer)
    def post(self, request, pk):
        """Send a built-in sample picture and report the outcome, the time taken and a small preview."""
        provider = self.provider(request, pk)
        body = ProviderTestRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        task = body.validated_data.get("task")
        if task is not None and task not in provider.tasks:
            raise AIProviderError("not_supported", "The provider is not set up for that task.")
        result = services.test_provider(
            request.user, provider, task=task, model=body.validated_data.get("model")
        )
        return Response(result.as_dict())
