from rest_framework.throttling import SimpleRateThrottle


class ExportRateThrottle(SimpleRateThrottle):
    """Per-user limit for server-side image renders (`export` rate), shared by the REST API and MCP."""

    scope = "export"

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}
