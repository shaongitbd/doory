from rest_framework.throttling import SimpleRateThrottle


class _UserScopedThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class UploadRateThrottle(_UserScopedThrottle):
    """Per-user limit for anything that writes files (`upload` rate)."""

    scope = "upload"


class StockRateThrottle(_UserScopedThrottle):
    """Per-user limit for stock-photo searches (`stock` rate); keeps provider quotas safe."""

    scope = "stock"


class StockPreviewRateThrottle(_UserScopedThrottle):
    """Per-user limit for listening to sound previews (`stock_preview` rate), apart from searches."""

    scope = "stock_preview"


class VideoUploadRateThrottle(_UserScopedThrottle):
    """Per-user limit for clips uploaded or imported (`video_upload` rate): each one runs ffmpeg."""

    scope = "video_upload"
