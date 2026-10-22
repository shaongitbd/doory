from django.contrib.auth import get_user_model
from django.db import transaction

from apps.assets.exceptions import LimitReached
from apps.assets.models import Asset

from .models import BrandKit
from .serializers import MAX_KITS_PER_USER


def _lock_owner(owner) -> None:
    get_user_model().objects.select_for_update().get(pk=owner.pk)


def _make_only_default(owner, kit: BrandKit) -> None:
    BrandKit.objects.filter(owner=owner, is_default=True).exclude(pk=kit.pk).update(is_default=False)


def create_kit(owner, data: dict) -> BrandKit:
    """Create a kit; at most `MAX_KITS_PER_USER` per user and at most one default, enforced under a lock."""
    logo_ids = data.pop("logo_ids", [])
    with transaction.atomic():
        _lock_owner(owner)
        if BrandKit.objects.filter(owner=owner).count() >= MAX_KITS_PER_USER:
            raise LimitReached(f"You can have at most {MAX_KITS_PER_USER} brand kits.")
        kit = BrandKit(owner=owner, **data)
        if kit.is_default:
            _make_only_default(owner, kit)
        kit.save()
        kit.logos.set(Asset.objects.filter(owner=owner, pk__in=logo_ids, kind__in=Asset.PICTURE_KINDS))
    return kit


def update_kit(owner, kit: BrandKit, data: dict) -> BrandKit:
    data = dict(data)
    logo_ids = data.pop("logo_ids", None)
    with transaction.atomic():
        _lock_owner(owner)
        for field, value in data.items():
            setattr(kit, field, value)
        if data.get("is_default"):
            _make_only_default(owner, kit)
        kit.save()
        if logo_ids is not None:
            kit.logos.set(Asset.objects.filter(owner=owner, pk__in=logo_ids, kind__in=Asset.PICTURE_KINDS))
    return kit
