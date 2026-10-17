from django.core.management.base import BaseCommand

from apps.exports.delivery import purge_expired


class Command(BaseCommand):
    help = "Delete exported images whose download links have expired (MCP_EXPORT_URL_TTL_SECONDS)."

    def handle(self, *args, **options):
        self.stdout.write(f"Removed {purge_expired()} expired exported image(s).")
