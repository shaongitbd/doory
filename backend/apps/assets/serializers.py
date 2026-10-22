from drf_spectacular.utils import extend_schema_field, inline_serializer
from rest_framework import serializers

from .models import Asset
from .uploads import MAX_NAME_LENGTH, MAX_TAG_LENGTH, MAX_TAGS, clean_name, clean_tags


class AssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    thumb_url = serializers.SerializerMethodField()
    attribution = serializers.SerializerMethodField()
    duration_ms = serializers.SerializerMethodField()
    poster_url = serializers.SerializerMethodField()
    audio_url = serializers.SerializerMethodField()
    video = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = (
            "id",
            "kind",
            "name",
            "url",
            "thumb_url",
            "width",
            "height",
            "size",
            "mime",
            "tags",
            "attribution",
            "duration_ms",
            "status",
            "error",
            "poster_url",
            "audio_url",
            "video",
            "created_at",
        )
        read_only_fields = fields

    def get_url(self, obj: Asset) -> str:
        return obj.file.url if obj.file else ""  # a video being converted has no file yet

    def get_thumb_url(self, obj: Asset) -> str:
        if obj.thumbnail:
            return obj.thumbnail.url
        return obj.file.url if obj.kind in Asset.PICTURE_KINDS and obj.file else ""

    def get_duration_ms(self, obj: Asset) -> int | None:
        info = obj.meta.get(obj.kind) if isinstance(obj.meta, dict) else None
        value = info.get("duration_ms") if isinstance(info, dict) else None
        return value if isinstance(value, int) and not isinstance(value, bool) else None

    def get_poster_url(self, obj: Asset) -> str:
        return obj.poster.url if obj.poster else ""

    def get_audio_url(self, obj: Asset) -> str:
        return obj.audio.url if obj.audio else ""

    @extend_schema_field(
        inline_serializer(
            "AssetVideo",
            {
                "fps": serializers.FloatField(),
                "has_audio": serializers.BooleanField(),
                "filmstrip": inline_serializer(
                    "AssetFilmstrip",
                    {
                        "url": serializers.CharField(),
                        "frames": serializers.IntegerField(),
                        "interval_ms": serializers.IntegerField(),
                        "tile_width": serializers.IntegerField(),
                        "tile_height": serializers.IntegerField(),
                    },
                    allow_null=True,
                ),
            },
            allow_null=True,
        )
    )
    def get_video(self, obj: Asset) -> dict | None:
        """Video only: what the editor needs to play the clip and draw it on the timeline."""
        if obj.kind != Asset.Kind.VIDEO:
            return None
        info = obj.meta.get("video") if isinstance(obj.meta, dict) else None
        info = info if isinstance(info, dict) else {}
        strip = info.get("strip") if isinstance(info.get("strip"), dict) else None
        return {
            "fps": info.get("fps") or 0,
            "has_audio": bool(obj.audio),
            "filmstrip": {**strip, "url": obj.filmstrip.url} if strip and obj.filmstrip else None,
        }

    def get_attribution(self, obj: Asset) -> dict | None:
        attribution = obj.meta.get("attribution") if isinstance(obj.meta, dict) else None
        return attribution if isinstance(attribution, dict) else None


class TagsField(serializers.ListField):
    def __init__(self, **kwargs):
        kwargs.setdefault("child", serializers.CharField(max_length=MAX_TAG_LENGTH, allow_blank=True))
        kwargs.setdefault("max_length", MAX_TAGS)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        return clean_tags(super().to_internal_value(data))


class AssetUploadSerializer(serializers.Serializer):
    file = serializers.FileField(allow_empty_file=False)
    name = serializers.CharField(max_length=MAX_NAME_LENGTH * 2, required=False, allow_blank=True)
    tags = TagsField(required=False)


class AssetUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=MAX_NAME_LENGTH * 2)
    tags = TagsField()

    def validate_name(self, value: str) -> str:
        name = clean_name(value, fallback="")
        if not name:
            raise serializers.ValidationError("The name cannot be empty.")
        return name


class AssetQuerySerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Asset.Kind.choices, required=False)
    q = serializers.CharField(max_length=100, required=False, allow_blank=True)
    ordering = serializers.CharField(max_length=32, required=False, allow_blank=True)
