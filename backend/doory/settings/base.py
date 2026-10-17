"""Shared Django settings. Environment-specific overrides live in dev/prod/test."""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-insecure-secret-key-change-me")
# Previous keys still accepted for verification, so a key can be rotated without signing everyone out.
SECRET_KEY_FALLBACKS = env.list("DJANGO_SECRET_KEY_FALLBACKS", default=[])
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
SITE_URL = env("SITE_URL", default="http://localhost:5173")

INSTALLED_APPS = [
    "unfold",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    # Doory apps
    "apps.core",
    "apps.accounts",
    "apps.designs",
    "apps.assets",
    "apps.gallery",
    "apps.elements",
    "apps.fonts",
    "apps.brand",
    "apps.sharing",
    "apps.exports",
    "apps.collab",
    "apps.presets",
    "apps.apitokens",
    "apps.mcp",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.assets.middleware.MediaSecurityHeadersMiddleware",
    "apps.core.middleware.PermissionsPolicyMiddleware",
    "apps.core.middleware.PrivateApiCacheMiddleware",
    "apps.collab.middleware.RealtimeGuardMiddleware",
]

ROOT_URLCONF = "doory.urls"
WSGI_APPLICATION = "doory.wsgi.application"
ASGI_APPLICATION = "doory.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {"default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.GuardedModelBackend"]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ---- Static & media ----
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env("MEDIA_ROOT", default=str(BASE_DIR / "media")))

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
if env.bool("USE_S3", default=False):
    STORAGES["default"] = {"BACKEND": "storages.backends.s3.S3Storage"}
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
    AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default=None)
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", default=None)
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default=None)
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default=None)
    AWS_QUERYSTRING_AUTH = False
    AWS_DEFAULT_ACL = None

# Hard ceilings: designs are JSON (no inline data URLs), uploads go through /assets/.
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # per asset
MAX_DESIGN_DOCUMENT_BYTES = 12 * 1024 * 1024
USER_STORAGE_QUOTA_BYTES = env.int("USER_STORAGE_QUOTA_BYTES", default=2 * 1024**3)
MAX_DESIGNS_PER_USER = env.int("MAX_DESIGNS_PER_USER", default=5000)
MAX_API_TOKENS_PER_USER = env.int("MAX_API_TOKENS_PER_USER", default=20)
MAX_DESIGN_PAGES = 100
MAX_AVATAR_BYTES = 5 * 1024 * 1024

# ---- Security headers (Permissions-Policy comes from apps.core.middleware) ----
X_FRAME_OPTIONS = "DENY"
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

# ---- Sessions / CSRF (SPA is same-origin via proxy in dev, reverse proxy in prod) ----
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # the SPA reads it and echoes it in X-CSRFToken
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:5173"])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
CORS_ALLOW_CREDENTIALS = True

# ---- Cache (rate limits, login lockout). Use a cache shared by all workers in production:
# CACHE_URL=dbcache://doory_cache (run `manage.py createcachetable`) or a redis:// URL. ----
CACHES = {"default": env.cache("CACHE_URL", default="locmemcache://")}

# ---- Account security ----
PASSWORD_RESET_TIMEOUT = 60 * 60 * 24  # reset and email-verification links live for one day
AUTH_LOCKOUT_MAX_ATTEMPTS = 10  # failed password checks per account ...
AUTH_LOCKOUT_WINDOW_SECONDS = 15 * 60  # ... within this window lock the account out
AUTH_EMAIL_COOLDOWN_SECONDS = 60  # minimum gap between reset / verification emails to one address

# ---- Email ----
EMAIL_CONFIG = env.email("EMAIL_URL", default="consolemail://")
vars().update(EMAIL_CONFIG)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Doory <no-reply@localhost>")
EMAIL_SEND_ASYNC = env.bool("EMAIL_SEND_ASYNC", default=True)  # send off the request thread

# ---- Integrations (all optional) ----
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", default="")
UNSPLASH_ACCESS_KEY = env("UNSPLASH_ACCESS_KEY", default="")
PEXELS_API_KEY = env("PEXELS_API_KEY", default="")
PIXABAY_API_KEY = env("PIXABAY_API_KEY", default="")

# ---- Stock photos (apps.assets.stock). A provider is on when its key is set and it is listed here; the
# order is the order of the tabs. The per-key limits and cache times only hold across workers with a shared
# cache (CACHE_URL=redis://… or dbcache://…). ----
STOCK_PROVIDERS = env.list("STOCK_PROVIDERS", default=["unsplash", "pexels", "pixabay"])
STOCK_ALL_PROVIDERS = env.list("STOCK_ALL_PROVIDERS", default=[])  # searched by the "All" tab; empty: all
STOCK_ALL_TIMEOUT_SECONDS = env.float("STOCK_ALL_TIMEOUT_SECONDS", default=4.0)
STOCK_DEFAULT_TAB = env("STOCK_DEFAULT_TAB", default="all")  # "all" or a provider name
STOCK_LANG_FROM_UI = env.bool("STOCK_LANG_FROM_UI", default=True)
# photo, illustration, vector or all
STOCK_PIXABAY_IMAGE_TYPE = env("STOCK_PIXABAY_IMAGE_TYPE", default="photo")
# Per provider: search cache time; calls allowed per API key, all users together ("100/m", "5000/h"; empty: no
# cap of our own, Doory still pauses a provider when it answers 429 or reports its quota used up); safe search
# (Unsplash: content_filter=high; Pixabay: safesearch). Unsplash keeps its previous unfiltered default.
_STOCK_DEFAULTS = {"unsplash": (3600, False), "pexels": (3600, True), "pixabay": (86400, True)}
STOCK_PROVIDER_SETTINGS = {
    name: {
        "cache_seconds": env.int(f"STOCK_{name.upper()}_CACHE_SECONDS", default=cache_seconds),
        "rate": env(f"STOCK_{name.upper()}_RATE", default=""),
        "safesearch": env.bool(f"STOCK_{name.upper()}_SAFESEARCH", default=safesearch),
    }
    for name, (cache_seconds, safesearch) in _STOCK_DEFAULTS.items()
}

# ---- DRF ----
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "240/min",
        "user": "1200/min",
        "auth": "20/min",  # login / register / password reset
        "upload": "60/min",
        "stock": "60/min",
    },
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "apps.core.parsers.BoundedJSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Doory API",
    "DESCRIPTION": "Open-source design platform API.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    # The Swagger page loads its script from a CDN; pin the release instead of following `latest`.
    "SWAGGER_UI_DIST": "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14",
    "SWAGGER_UI_FAVICON_HREF": "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/favicon-32x32.png",
    # Several apps have a field called `kind` or `role` with different choices; name each set.
    "ENUM_NAME_OVERRIDES": {
        "AssetKindEnum": "apps.assets.models.Asset.Kind",
        "ElementKindEnum": "apps.elements.models.ElementKind",
        "ShareRoleEnum": "apps.sharing.models.ShareRole",
        "BrandFontRoleEnum": "apps.brand.serializers.FONT_ROLES",
    },
}

# ---- Admin theme (django-unfold) ----
UNFOLD = {
    "SITE_TITLE": "Doory Admin",
    "SITE_HEADER": "Doory",
    "SITE_SYMBOL": "palette",
    "COLORS": {
        "primary": {
            "50": "254 242 242",
            "100": "254 226 226",
            "200": "254 202 202",
            "300": "252 165 165",
            "400": "248 113 113",
            "500": "239 68 68",
            "600": "220 38 38",
            "700": "185 28 28",
            "800": "153 27 27",
            "900": "127 29 29",
            "950": "69 10 10",
        },
    },
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}

# ---- Server-side PDF export (apps.exports) ----
SERVER_PDF_ENABLED = env.bool("SERVER_PDF_ENABLED", default=True)
EXPORT_MAX_CONCURRENCY = env.int("EXPORT_MAX_CONCURRENCY", default=2)  # renders per API process
EXPORT_TIMEOUT_SECONDS = env.int("EXPORT_TIMEOUT_SECONDS", default=30)
EXPORT_CHROMIUM_PATH = env("EXPORT_CHROMIUM_PATH", default="")  # empty: Playwright's own Chromium
EXPORT_CHROMIUM_NO_SANDBOX = env.bool("EXPORT_CHROMIUM_NO_SANDBOX", default=False)  # the Docker image sets it
# Where each render gets its private work directory (input, output and the browser profile live in it and are
# deleted with it). Empty: the system temporary directory.
EXPORT_WORK_DIR = env("EXPORT_WORK_DIR", default="")
# Origins Chromium may fetch /media/ and /static/ resources from while printing (everything else is blocked).
EXPORT_ALLOWED_ORIGINS = env.list(
    "EXPORT_ALLOWED_ORIGINS",
    default=["/".join(SITE_URL.split("/")[:3]), "http://127.0.0.1:8000", "http://localhost:8000"],
)

# Server-side PNG/JPG/WebP export of a saved design page (apps.exports.services.export_image). The same
# browser opens the frontend's headless render page and draws the page with the editor's engine. It must be
# the *built* frontend's `render.html`: the Vite dev server serves modules from paths it may not load.
SERVER_IMAGE_EXPORT_ENABLED = env.bool("SERVER_IMAGE_EXPORT_ENABLED", default=SERVER_PDF_ENABLED)
EXPORT_RENDER_PAGE_URL = env(
    "EXPORT_RENDER_PAGE_URL", default="/".join(SITE_URL.split("/")[:3]) + "/render.html"
)
EXPORT_IMAGE_MAX_PIXELS = env.int("EXPORT_IMAGE_MAX_PIXELS", default=40_000_000)  # output width x height
EXPORT_IMAGE_MAX_DOCUMENT_BYTES = env.int("EXPORT_IMAGE_MAX_DOCUMENT_BYTES", default=5 * 1024 * 1024)

# ---- In-browser background removal (apps.core.mlmodels; `manage.py sync_models` installs the model) ----
BACKGROUND_REMOVAL_ENABLED = env.bool("BACKGROUND_REMOVAL_ENABLED", default=True)
BACKGROUND_REMOVAL_MODEL = env("BACKGROUND_REMOVAL_MODEL", default="")  # empty: the best installed model

# ---- Real-time co-editing (apps.collab) ----
REALTIME_ENABLED = env.bool("REALTIME_ENABLED", default=True)
# Channel layer: in-memory (one server process only) unless REDIS_URL is set, which is mandatory as soon
# as more than one realtime worker or replica runs.
REDIS_URL = env("REDIS_URL", default="")
CHANNEL_LAYERS = (
    {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL], "capacity": 2000, "expiry": 10},
        }
    }
    if REDIS_URL
    else {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer", "CONFIG": {"capacity": 2000}}}
)
REALTIME_MAX_FRAME_BYTES = env.int("REALTIME_MAX_FRAME_BYTES", default=1024 * 1024)
REALTIME_MAX_CONNECTIONS_PER_DESIGN = env.int("REALTIME_MAX_CONNECTIONS_PER_DESIGN", default=25)
REALTIME_MAX_CONNECTIONS_PER_USER = env.int("REALTIME_MAX_CONNECTIONS_PER_USER", default=10)
REALTIME_RATE_MESSAGES_PER_SECOND = env.int("REALTIME_RATE_MESSAGES_PER_SECOND", default=100)
REALTIME_RATE_BURST = env.int("REALTIME_RATE_BURST", default=300)
REALTIME_RATE_BYTES_PER_SECOND = env.int("REALTIME_RATE_BYTES_PER_SECOND", default=1024 * 1024)
REALTIME_RATE_BYTES_BURST = env.int("REALTIME_RATE_BYTES_BURST", default=4 * 1024 * 1024)
REALTIME_IDLE_TIMEOUT_SECONDS = env.int("REALTIME_IDLE_TIMEOUT_SECONDS", default=120)
REALTIME_AUTH_TIMEOUT_SECONDS = env.int("REALTIME_AUTH_TIMEOUT_SECONDS", default=10)
REALTIME_FLUSH_INTERVAL_SECONDS = env.float("REALTIME_FLUSH_INTERVAL_SECONDS", default=10)
REALTIME_RECHECK_SECONDS = env.float("REALTIME_RECHECK_SECONDS", default=5)
REALTIME_COMPACT_AFTER_UPDATES = env.int("REALTIME_COMPACT_AFTER_UPDATES", default=200)
REALTIME_CONNECTS_PER_MINUTE = env.int("REALTIME_CONNECTS_PER_MINUTE", default=60)
# An update that needed longer than this to apply (the engine holds the interpreter lock meanwhile) is treated
# as an attack: the room's live state is dropped and rebuilt from the store and the sender is blocked a while.
REALTIME_SLOW_APPLY_SECONDS = env.float("REALTIME_SLOW_APPLY_SECONDS", default=2.0)
REALTIME_BLOCK_SECONDS = env.int("REALTIME_BLOCK_SECONDS", default=600)

# ---- MCP server for AI agents (apps.mcp; served by `uvicorn doory.mcp_asgi:application`) ----
MCP_ENABLED = env.bool("MCP_ENABLED", default=False)  # opt-in; Docker also needs `COMPOSE_PROFILES=mcp`
MCP_PATH = "/mcp"
MCP_CALLS_PER_MINUTE = env.int("MCP_CALLS_PER_MINUTE", default=120)  # per user; 0 = unlimited
MCP_MAX_REQUEST_BYTES = env.int("MCP_MAX_REQUEST_BYTES", default=4 * 1024 * 1024)
MCP_URL_UPLOADS = env.bool("MCP_URL_UPLOADS", default=True)  # upload_image_from_url (public https only)
