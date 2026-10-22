from django.core.management.base import BaseCommand

from apps.assets.video_jobs import fail_stale


class Command(BaseCommand):
    help = "Mark video conversions that were interrupted (their process stopped) as failed."

    def handle(self, *args, **options):
        count = fail_stale()
        self.stdout.write(f"Marked {count} interrupted video conversion(s) as failed.")
