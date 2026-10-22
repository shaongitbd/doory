from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Asset
from .storage import delete_files_on_commit


@receiver(post_delete, sender=Asset, dispatch_uid="assets.asset_delete_files")
def delete_asset_files(sender, instance: Asset, **kwargs) -> None:
    delete_files_on_commit(
        instance.file.storage,
        [
            instance.file.name,
            instance.thumbnail.name,
            instance.poster.name,
            instance.filmstrip.name,
            instance.audio.name,
        ],
    )
