from __future__ import annotations

import json

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.http import Http404, HttpRequest, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.html import format_html, format_html_join
from django.utils.translation import gettext_lazy as _
from rest_framework import serializers
from unfold.admin import ModelAdmin, TabularInline
from unfold.decorators import action, display
from unfold.widgets import (
    UnfoldAdminCheckboxSelectMultipleWidget,
    UnfoldAdminPasswordWidget,
    UnfoldAdminTextareaWidget,
)

from . import env, secrets, services
from .errors import AIProviderError
from .models import AICall, Provider, ProviderModel, UserProvider
from .serializers import MAX_SECRET_LENGTH, validate_base_url
from .styles import STYLES, ConfigError, get_style
from .styles.base import check_header_name
from .tasks import task_choices

STYLE_HELP = format_html_join(
    "", "<p><strong>{}</strong>: {}</p>", ((s.label, s.help) for s in STYLES.values())
)


class ProviderAdminForm(forms.ModelForm):
    secret = forms.CharField(
        label=_("Secret"),
        required=False,
        max_length=MAX_SECRET_LENGTH,
        strip=True,
        widget=UnfoldAdminPasswordWidget(render_value=False),
        help_text=_(
            "The value of the auth header, e.g. “Bearer …”. Stored encrypted. Leave empty to keep it."
        ),
    )
    clear_secret = forms.BooleanField(label=_("Remove the stored secret"), required=False)
    tasks = forms.MultipleChoiceField(
        label=_("Tasks"), choices=task_choices, widget=UnfoldAdminCheckboxSelectMultipleWidget
    )
    style_config = forms.JSONField(
        label=_("Style settings"),
        required=False,
        widget=UnfoldAdminTextareaWidget(attrs={"rows": 6, "class": "font-mono"}),
        help_text=STYLE_HELP,
    )

    class Meta:
        model = Provider
        fields = [
            "name",
            "base_url",
            "style",
            "style_config",
            "timeout_seconds",
            "max_image_bytes",
            "auth_header",
            "tasks",
            "enabled",
            "sort_order",
            "audience",
            "allowed_users",
            "daily_quota",
            "sends_offsite",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if "secret" in self.fields and self.instance.has_secret:
            self.fields["secret"].help_text = _("A secret is stored. Leave empty to keep it.")

    def clean_base_url(self) -> str:
        try:
            return validate_base_url(self.cleaned_data["base_url"], operator=True)
        except serializers.ValidationError as exc:
            raise forms.ValidationError(exc.detail[0]) from None

    def clean_max_image_bytes(self) -> int:
        value = self.cleaned_data.get("max_image_bytes") or 0
        if value > settings.AI_MAX_IMAGE_BYTES:
            raise forms.ValidationError(
                _("At most %(limit)s bytes (the server-wide limit).") % {"limit": settings.AI_MAX_IMAGE_BYTES}
            )
        return value

    def clean_auth_header(self) -> str:
        value = self.cleaned_data.get("auth_header", "").strip()
        if not value:
            return value
        try:
            return check_header_name(value)
        except ConfigError as exc:
            raise forms.ValidationError(str(exc)) from None

    def clean_secret(self) -> str:
        value = self.cleaned_data.get("secret", "")
        if "\r" in value or "\n" in value:
            raise forms.ValidationError(_("The secret may not contain line breaks."))
        if value and not secrets.can_encrypt():
            raise forms.ValidationError(_("Secrets cannot be stored: AI_SECRETS_KEY is not a valid key."))
        return value

    def clean(self):
        cleaned = super().clean()
        style = cleaned.get("style")
        if style:
            try:
                get_style(style).config(cleaned.get("style_config") or {})
            except ConfigError as exc:
                self.add_error("style_config", str(exc))
            try:
                get_style(style).check_tasks(cleaned.get("tasks") or [])
            except ConfigError as exc:
                self.add_error("tasks", str(exc))
        cleaned["style_config"] = cleaned.get("style_config") or {}
        return cleaned

    def save(self, commit: bool = True) -> Provider:
        old_url = Provider.objects.filter(pk=self.instance.pk).values_list("base_url", flat=True).first()
        provider = super().save(commit=False)
        moved = old_url is not None and not Provider(base_url=old_url).keeps_secret_for(provider.base_url)
        if self.cleaned_data.get("clear_secret") or (moved and not self.cleaned_data.get("secret")):
            provider.set_secret("")
        elif self.cleaned_data.get("secret"):
            provider.set_secret(self.cleaned_data["secret"])
        if commit:
            provider.save()
            self.save_m2m()
        return provider


class ProviderModelInline(TabularInline):
    model = ProviderModel
    extra = 0
    fields = ["task", "remote_name", "label", "enabled", "sort_order"]
    tab = False

    def formfield_for_dbfield(self, db_field, request, **kwargs):
        if db_field.name == "task":
            return forms.ChoiceField(choices=task_choices, label=_("Task"))
        return super().formfield_for_dbfield(db_field, request, **kwargs)


def _test_page(request: HttpRequest, admin_site, provider, result, back_url: str) -> TemplateResponse:
    context = {
        **admin_site.each_context(request),
        "title": _("Test of %(name)s") % {"name": provider.name},
        "opts": Provider._meta,
        "provider": provider,
        "result": result,
        "back_url": back_url,
    }
    return TemplateResponse(request, "admin/ai/provider/test_result.html", context)


def _action_confirm_page(
    request: HttpRequest,
    admin_site,
    provider,
    *,
    title: str,
    message: str,
    confirm_label: str,
    action_url: str,
    back_url: str,
) -> TemplateResponse:
    context = {
        **admin_site.each_context(request),
        "title": title,
        "opts": Provider._meta,
        "provider": provider,
        "message": message,
        "confirm_label": confirm_label,
        "action_url": action_url,
        "back_url": back_url,
    }
    return TemplateResponse(request, "admin/ai/provider/confirm_action.html", context)


@admin.register(Provider)
class ProviderAdmin(ModelAdmin):
    """Operator providers. Users' own servers are listed under “User providers”."""

    form = ProviderAdminForm
    inlines = [ProviderModelInline]
    list_display = ["name", "style", "task_list", "audience", "daily_quota", "sends_offsite", "enabled"]
    list_filter = ["style", "enabled", "audience"]
    list_editable = ["enabled"]
    search_fields = ["name", "base_url"]
    filter_horizontal = ["allowed_users"]
    actions_detail = ["load_models", "test_connection"]
    list_before_template = "admin/ai/provider/env_providers.html"
    readonly_fields = ["secret_state", "created_at", "updated_at"]
    fieldsets = [
        (
            _("Connection"),
            {"fields": ["name", "base_url", "style", "style_config", "timeout_seconds", "max_image_bytes"]},
        ),
        (_("Authentication"), {"fields": ["auth_header", "secret", "clear_secret", "secret_state"]}),
        (_("Tasks"), {"fields": ["tasks", "enabled", "sort_order"]}),
        (_("Access"), {"fields": ["audience", "allowed_users", "daily_quota"]}),
        (_("Privacy"), {"fields": ["sends_offsite"]}),
        (_("Audit"), {"fields": ["created_at", "updated_at"], "classes": ["collapse"]}),
    ]

    def get_queryset(self, request: HttpRequest):
        return super().get_queryset(request).filter(owner__isnull=True)

    @display(description=_("Tasks"))
    def task_list(self, obj: Provider) -> str:
        return ", ".join(obj.tasks or []) or "—"

    @display(description=_("Stored secret"))
    def secret_state(self, obj: Provider) -> str:
        return _("Set (hidden)") if obj.has_secret else _("None")

    def has_add_permission(self, request: HttpRequest, obj=None) -> bool:
        # Unfold evaluates detail-action permissions with the object id as a second argument.
        return super().has_add_permission(request)

    def changelist_view(self, request: HttpRequest, extra_context=None):
        providers, errors = env.load()
        rows = [
            {
                "provider": provider,
                "tasks": ", ".join(provider.tasks),
                "models": ", ".join(label or name or _("server default") for name, label in provider.models)
                or (
                    _("from the server") if get_style(provider.style).can_list_models else _("server default")
                ),
                "test_url": reverse("admin:ai_provider_env_test", args=[provider.id]),
            }
            for provider in providers
        ]
        extra = {"env_providers": rows, "env_errors": errors, **(extra_context or {})}
        return super().changelist_view(request, extra_context=extra)

    def get_urls(self):
        custom = [
            path(
                "env/<str:provider_id>/test/",
                self.admin_site.admin_view(self.env_test_view),
                name="ai_provider_env_test",
            )
        ]
        return custom + super().get_urls()

    def env_test_view(self, request: HttpRequest, provider_id: str):
        if not self.has_change_permission(request):
            raise PermissionDenied
        provider = env.get(provider_id)
        if provider is None:
            raise Http404
        if request.method != "POST":
            return _action_confirm_page(
                request,
                self.admin_site,
                provider,
                title=_("Test %(name)s") % {"name": provider.name},
                message=_(
                    "Send a sample picture to test the connection to this provider? "
                    "This makes an outgoing request to the provider's server."
                ),
                confirm_label=_("Test connection"),
                action_url=request.path,
                back_url=reverse("admin:ai_provider_changelist"),
            )
        result = services.test_provider(request.user, provider)
        return _test_page(request, self.admin_site, provider, result, reverse("admin:ai_provider_changelist"))

    @action(description=_("Load models"), url_path="load-models", permissions=["change"])
    def load_models(self, request: HttpRequest, object_id: str):
        provider = get_object_or_404(Provider, pk=object_id, owner__isnull=True)
        if request.method != "POST":
            return _action_confirm_page(
                request,
                self.admin_site,
                provider,
                title=_("Load models for %(name)s") % {"name": provider.name},
                message=_(
                    "Fetch the model list from the remote server and update the database? "
                    "This makes an outgoing request to the server."
                ),
                confirm_label=_("Load models"),
                action_url=request.path,
                back_url=reverse("admin:ai_provider_change", args=[object_id]),
            )
        try:
            models = services.load_models(provider)
        except AIProviderError as exc:
            messages.error(request, exc.message)
        else:
            messages.success(request, _("%(n)d model(s) known for this provider.") % {"n": len(models)})
        return HttpResponseRedirect(reverse("admin:ai_provider_change", args=[object_id]))

    @action(description=_("Test connection"), url_path="test", permissions=["change"])
    def test_connection(self, request: HttpRequest, object_id: str):
        provider = get_object_or_404(Provider, pk=object_id, owner__isnull=True)
        if request.method != "POST":
            return _action_confirm_page(
                request,
                self.admin_site,
                provider,
                title=_("Test %(name)s") % {"name": provider.name},
                message=_(
                    "Send a sample picture to test the connection to this provider? "
                    "This makes an outgoing request to the provider's server."
                ),
                confirm_label=_("Test connection"),
                action_url=request.path,
                back_url=reverse("admin:ai_provider_change", args=[object_id]),
            )
        result = services.test_provider(request.user, provider)
        return _test_page(
            request, self.admin_site, provider, result, reverse("admin:ai_provider_change", args=[object_id])
        )


@admin.register(UserProvider)
class UserProviderAdmin(ModelAdmin):
    """Users' own servers, for support: read only, secrets never shown."""

    list_display = ["name", "owner", "style", "task_list", "enabled", "created_at"]
    list_filter = ["style", "enabled"]
    search_fields = ["name", "owner__email"]
    list_select_related = ["owner"]
    fields = [
        "owner",
        "name",
        "base_url",
        "style",
        "style_config_json",
        "auth_header",
        "secret_state",
        "task_list",
        "model_list",
        "timeout_seconds",
        "max_image_bytes",
        "sends_offsite",
        "enabled",
        "created_at",
        "updated_at",
    ]
    readonly_fields = fields

    def get_queryset(self, request: HttpRequest):
        return super().get_queryset(request).filter(owner__isnull=False).prefetch_related("models")

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj=None) -> bool:
        return False

    @display(description=_("Tasks"))
    def task_list(self, obj: Provider) -> str:
        return ", ".join(obj.tasks or []) or "—"

    @display(description=_("Models"))
    def model_list(self, obj: Provider) -> str:
        return ", ".join(str(m) for m in obj.models.all()) or "—"

    @display(description=_("Stored secret"))
    def secret_state(self, obj: Provider) -> str:
        return _("Set (hidden)") if obj.has_secret else _("None")

    @display(description=_("Style settings"))
    def style_config_json(self, obj: Provider) -> str:
        return format_html("<pre>{}</pre>", json.dumps(obj.style_config, indent=2))


@admin.register(AICall)
class AICallAdmin(ModelAdmin):
    list_display = [
        "created_at",
        "user",
        "task",
        "provider_name",
        "model",
        "status",
        "error_code",
        "duration_ms",
    ]
    list_filter = ["status", "task", "provider_name", "created_at"]
    search_fields = ["user__email", "provider_ref", "provider_name", "model"]
    list_select_related = ["user"]
    date_hierarchy = "created_at"
    fields = [
        "created_at",
        "user",
        "task",
        "provider_ref",
        "provider_name",
        "model",
        "status",
        "error_code",
        "duration_ms",
        "bytes_in",
        "bytes_out",
    ]
    readonly_fields = fields

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(self, request: HttpRequest, obj=None) -> bool:
        return False
