from django.conf import settings
from django.db import models

from apps.core.models import BaseModel


def asset_file_path(instance, filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"assets/{instance.owner_id}/{instance.id}.{ext}"


def asset_thumb_path(instance, filename):
    return f"assets/{instance.owner_id}/thumbs/{instance.id}.webp"


def asset_poster_path(instance, filename):
    return f"assets/{instance.owner_id}/posters/{instance.id}.webp"


def asset_filmstrip_path(instance, filename):
    return f"assets/{instance.owner_id}/strips/{instance.id}.webp"


def asset_audio_path(instance, filename):
    return f"assets/{instance.owner_id}/audio/{instance.id}.m4a"


class Asset(BaseModel):
    class Kind(models.TextChoices):
        IMAGE = "image", "Image"
        SVG = "svg", "SVG"
        AUDIO = "audio", "Audio"
        VIDEO = "video", "Video"

    class Status(models.TextChoices):
        READY = "ready", "Ready"
        PROCESSING = "processing", "Processing"  # a video being converted (apps.assets.video_jobs)
        FAILED = "failed", "Failed"

    #: The kinds that are pictures: what the image pickers, brand logos and picture tools may use.
    PICTURE_KINDS = (Kind.IMAGE, Kind.SVG)

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assets")
    kind = models.CharField(max_length=8, choices=Kind.choices, default=Kind.IMAGE)
    name = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to=asset_file_path)
    thumbnail = models.ImageField(upload_to=asset_thumb_path, blank=True)
    width = models.PositiveIntegerField(default=0)
    height = models.PositiveIntegerField(default=0)
    size = models.PositiveBigIntegerField(default=0)
    mime = models.CharField(max_length=64)
    tags = models.JSONField(default=list, blank=True)
    meta = models.JSONField(default=dict, blank=True)  # e.g. stock-photo attribution
    # Video only: a still for every surface that can't play the clip, a strip of frames for the timeline and
    # the clip's sound on its own, for the audio mix.
    poster = models.ImageField(upload_to=asset_poster_path, blank=True)
    filmstrip = models.ImageField(upload_to=asset_filmstrip_path, blank=True)
    audio = models.FileField(upload_to=asset_audio_path, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.READY)
    error = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "-created_at"])]

    def __str__(self):
        return self.name or str(self.id)
