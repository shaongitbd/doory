from rest_framework.throttling import SimpleRateThrottle


class _PerUserRateThrottle(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": request.user.pk}


class ExportRateThrottle(_PerUserRateThrottle):
    """Per-user limit for server-side image renders (`export` rate), shared by the REST API and MCP."""

    scope = "export"


class OffsiteOptimizeRateThrottle(_PerUserRateThrottle):
    """Per-user limit for images sent to an optimizer off this server (TinyPNG, Kraken.io, custom: whatever
    `sends_offsite`), `optimize_offsite` rate: exports over REST and MCP and POST /exports/optimize/ share it,
    so one account can't spend the server's quota with such a service."""

    scope = "optimize_offsite"
