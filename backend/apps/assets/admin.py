from django.contrib import admin
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from unfold.decorators import display

from .models import Asset


@admin.register(Asset)
class AssetAdmin(ModelAdmin):
    list_display = ("preview", "display_name", "owner", "kind", "status", "mime", "size", "created_at")
    list_display_links = ("preview", "display_name")
    list_filter = ("kind", "status", "mime", "created_at")
    search_fields = ("name", "owner__email")
    list_select_related = ("owner",)
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    exclude = ("file", "thumbnail", "poster", "filmstrip", "audio", "tags", "meta")
    readonly_fields = (
        "owner",
        "kind",
        "name",
        "preview",
        "width",
        "height",
        "size",
        "mime",
        "status",
        "error",
        "tag_list",
        "attribution",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    @display(description="Name", ordering="name")
    def display_name(self, obj: Asset) -> str:
        return obj.name or str(obj.id)

    @display(description="Preview")
    def preview(self, obj: Asset) -> str:
        if not obj.file:
            return "-"
        if obj.kind == Asset.Kind.AUDIO:
            return format_html(
                '<audio controls preload="none" src="{}" style="height:32px;max-width:220px"></audio>',
                obj.file.url,
            )
        if obj.kind == Asset.Kind.VIDEO:
            if not obj.poster:
                return obj.get_status_display()
            return format_html(
                '<video controls preload="none" src="{}" poster="{}" style="max-height:72px;max-width:128px">'
                "</video>",
                obj.file.url,
                obj.poster.url,
            )
        url = obj.thumbnail.url if obj.thumbnail else obj.file.url
        return format_html(
            '<img src="{}" alt="" style="max-height:48px;max-width:96px;border-radius:4px">', url
        )

    @display(description="Tags")
    def tag_list(self, obj: Asset) -> str:
        return ", ".join(obj.tags) or "-"

    @display(description="Attribution")
    def attribution(self, obj: Asset) -> str:
        info = obj.meta.get("attribution") if isinstance(obj.meta, dict) else None
        if not isinstance(info, dict):
            return "-"
        return f"{info.get('author', '')} ({info.get('provider', '')})"
