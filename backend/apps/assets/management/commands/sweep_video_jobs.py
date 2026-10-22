from django.core.management.base import BaseCommand

from apps.assets.video import remove_old_work_dirs
from apps.assets.video_jobs import fail_stale, stale_after_seconds


class Command(BaseCommand):
    help = (
        "Mark video conversions that were interrupted (their process stopped) as failed, and remove the "
        "temporary folders such conversions left behind."
    )

    def handle(self, *args, **options):
        count = fail_stale()
        self.stdout.write(f"Marked {count} interrupted video conversion(s) as failed.")
        removed = remove_old_work_dirs(stale_after_seconds())
        self.stdout.write(f"Removed {removed} leftover video work folder(s).")
