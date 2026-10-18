from contextlib import contextmanager

from django.core.cache import cache
from rest_framework.exceptions import Throttled
from rest_framework.throttling import SimpleRateThrottle


class BulkFillRateThrottle(SimpleRateThrottle):
    """Per-user limit for creating designs via bulk-fill (`bulk_fill` rate)."""

    scope = "bulk_fill"

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class BulkFillImageRateThrottle(BulkFillRateThrottle):
    """Per-user limit for image URLs fetched by a bulk fill (`bulk_fill_images` rate), instead of `upload`, so
    a full run of `BULK_FILL_MAX_ROWS` rows with a few photo links each fits."""

    scope = "bulk_fill_images"


# Long enough to cover the web worker's timeout (120 s): a worker killed mid-run can't release it.
RUNNING_SECONDS = 180


@contextmanager
def one_fill_at_a_time(user):
    """At most one fill or bulk fill per user at a time. They can fetch image URLs, each for up to the
    download deadline, so this keeps one account from tying up the web server's threads with slow links."""
    key = f"bulk-fill:running:{user.pk}"
    if not cache.add(key, 1, RUNNING_SECONDS):
        raise Throttled(detail="A fill is already running for your account. Try again when it has finished.")
    try:
        yield
    finally:
        cache.delete(key)
