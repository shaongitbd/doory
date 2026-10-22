from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models

from apps.core.models import BaseModel

from .validators import (
    GROUP_SLUG,
    ICON_NAME,
    PRESET_SLUG,
    UNITS,
    check_meta,
    check_size,
    normalize_aliases,
    normalize_tags,
    to_px,
)

_icon = RegexValidator(ICON_NAME, "Use a Lucide icon name such as `smartphone` or `file-text`.")


class SizePresetGroup(BaseModel):
    """A folder of size presets. Groups nest to any depth (Social media → Instagram → …)."""

    slug = models.CharField(
        max_length=64,
        unique=True,
        validators=[RegexValidator(rf"\A{GROUP_SLUG.pattern}\Z", "Lower-case letters, digits and hyphens.")],
    )
    label = models.CharField(max_length=80)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    icon = models.CharField(max_length=64, blank=True, validators=[_icon], help_text="A Lucide icon name.")
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, help_text="Inactive groups hide everything inside them.")

    class Meta:
        ordering = ["sort_order", "label"]
        verbose_name = "size preset group"

    def __str__(self):
        return self.label

    def clean(self):
        super().clean()
        seen = {self.pk}
        node = self.parent
        while node is not None:
            if node.pk in seen:
                raise ValidationError({"parent": "A group cannot be inside itself."})
            seen.add(node.pk)
            node = node.parent


class SizePreset(BaseModel):
    """A named page size. `width` and `height` are in `unit`; documents store whole pixels at 96 dpi."""

    class Unit(models.TextChoices):
        PX = "px", "Pixels"
        MM = "mm", "Millimetres"
        CM = "cm", "Centimetres"
        IN = "in", "Inches"

    slug = models.CharField(
        max_length=64,
        unique=True,
        validators=[
            RegexValidator(rf"\A{PRESET_SLUG.pattern}\Z", "Letters, digits, dots, hyphens and underscores.")
        ],
        help_text="Stored on designs and templates; keep it stable and list old slugs under aliases.",
    )
    label = models.CharField(max_length=120)
    group = models.ForeignKey(SizePresetGroup, on_delete=models.CASCADE, related_name="presets")
    width = models.DecimalField(max_digits=10, decimal_places=3)
    height = models.DecimalField(max_digits=10, decimal_places=3)
    unit = models.CharField(max_length=2, choices=Unit.choices, default=Unit.PX)
    icon = models.CharField(
        max_length=64, blank=True, validators=[_icon], help_text="A Lucide icon name (optional)."
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    is_quick = models.BooleanField(default=False, help_text="Offered as a one-click chip on the home page.")
    tags = models.JSONField(default=list, blank=True, help_text='For filtering, e.g. ["4:5", "paid"].')
    aliases = models.JSONField(default=list, blank=True, help_text="Old slugs that still mean this preset.")
    meta = models.JSONField(
        default=dict, blank=True, help_text='Extras, e.g. {"safe_zone": {"top": 0.1, "bottom": 0.2}}.'
    )

    class Meta:
        ordering = ["sort_order", "label"]
        indexes = [models.Index(fields=["is_active", "sort_order"])]

    def __str__(self):
        return self.label

    @property
    def width_px(self) -> int:
        return to_px(self.width, self.unit)

    @property
    def height_px(self) -> int:
        return to_px(self.height, self.unit)

    def clean(self):
        super().clean()
        errors: dict[str, str] = {}
        if self.unit in UNITS and self.width is not None and self.height is not None:
            try:
                check_size(self.width, self.height, self.unit)
            except ValueError as exc:
                errors["width"] = str(exc)
        normalizers = (("tags", normalize_tags), ("aliases", normalize_aliases), ("meta", check_meta))
        for field, normalize in normalizers:
            try:
                setattr(self, field, normalize(getattr(self, field)))
            except ValueError as exc:
                errors[field] = str(exc)
        if "aliases" not in errors and self.is_active:
            clash = alias_clash(self.slug, self.aliases, exclude_pk=self.pk)
            if clash:
                errors["aliases"] = clash
        if errors:
            raise ValidationError(errors)


def alias_clash(slug: str, aliases: list[str], *, exclude_pk=None) -> str:
    """Why `slug` and `aliases` would give some name to two active presets, or "" when they would not."""
    if slug in aliases:
        return "An alias cannot repeat the preset's own slug."
    names = {slug, *aliases}
    others = SizePreset.objects.filter(is_active=True).exclude(pk=exclude_pk).values_list("slug", "aliases")
    for other_slug, other_aliases in others:
        if other_slug in aliases:
            return f"{other_slug!r} is the slug of another preset."
        shared = names & set(other_aliases or [])
        if shared:
            return f"{sorted(shared)[0]!r} is already an alias of {other_slug!r}."
    return ""


class SizeChoices(BaseModel):
    """One person's sizes in the picker: the ones they pinned and the list sections they folded."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="size_choices"
    )
    # Preset slugs in the order they were pinned; null until the person pins or unpins something, so the
    # catalogue's popular sizes stand in for them.
    pinned = models.JSONField(null=True, blank=True)
    # Keys of the picker's list sections ("formats", "social"…) the person folded.
    collapsed = models.JSONField(default=list, blank=True)

    def __str__(self) -> str:
        return f"Size choices of {self.user}"
