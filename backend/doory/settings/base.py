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
    "apps.ai",
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
BULK_FILL_MAX_ROWS = env.int("BULK_FILL_MAX_ROWS", default=100)  # rows per bulk fill (MCP and REST)
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
# OpenID Connect sign-in (apps.accounts.oidc): on when the issuer, client ID and client secret are all set.
# A setting that is wrong turns it off and `manage.py check` says why. OIDC_TRUST_EMAIL lets a first OIDC
# sign-in take over an existing account with the same (provider-verified) address; off, existing users
# connect their account from Settings instead.
OIDC_ISSUER = env("OIDC_ISSUER", default="")
OIDC_CLIENT_ID = env("OIDC_CLIENT_ID", default="")
OIDC_CLIENT_SECRET = env("OIDC_CLIENT_SECRET", default="")
OIDC_BUTTON_LABEL = env("OIDC_BUTTON_LABEL", default="Sign in with SSO")
OIDC_SCOPES = env("OIDC_SCOPES", default="openid email profile")
OIDC_TRUST_EMAIL = env.bool("OIDC_TRUST_EMAIL", default=False)
UNSPLASH_ACCESS_KEY = env("UNSPLASH_ACCESS_KEY", default="")
PEXELS_API_KEY = env("PEXELS_API_KEY", default="")
PIXABAY_API_KEY = env("PIXABAY_API_KEY", default="")
# Freesound (apps.assets.freesound): the Audio tool's Freesound tab is on when the key is set. Licences a
# sound may have: cc0 (default), or cc0,by to add Creative Commons Attribution (the editor asks for credits).
# Freesound's API terms cover non-commercial use; a commercial service needs an agreement with Freesound.
FREESOUND_API_KEY = env("FREESOUND_API_KEY", default="")
FREESOUND_LICENSES = env.list("FREESOUND_LICENSES", default=["cc0"])

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
_STOCK_DEFAULTS = {
    "unsplash": (3600, False),
    "pexels": (3600, True),
    "pixabay": (86400, True),
    "freesound": (86400, False),
}
_STOCK_RATES = {"freesound": "60/m"}  # Freesound allows 60 calls a minute (and 2000 a day) per key
STOCK_PROVIDER_SETTINGS = {
    name: {
        "cache_seconds": env.int(f"STOCK_{name.upper()}_CACHE_SECONDS", default=cache_seconds),
        "rate": env(f"STOCK_{name.upper()}_RATE", default=_STOCK_RATES.get(name, "")),
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
        "stock_preview": "300/min",  # listening to Freesound previews; searches keep the `stock` budget
        "bulk_fill": "120/min",  # rows created via bulk-fill (REST)
        "bulk_fill_images": "300/min",  # image URLs fetched by bulk-fill (REST and MCP)
        "export": "30/min",  # server-side image renders (REST and MCP)
        "optimize": "60/min",  # images the browser drew, converted and optimized (POST /exports/optimize/)
        "optimize_offsite": "10/min",  # images sent to an optimizer off this server (REST and MCP)
        "ai": "30/min",  # calls to AI image providers (REST and MCP)
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
# Export file names (#59): simple (`summer-sale-02.png`) or structured
# (`summer-sale_instagram_instagram-story_1080x1920_p02.png`), and whether a structured name ends in the
# Unix time of the export. These are the defaults; the download dialog and the image export API can choose
# per export.
EXPORT_FILENAME_STYLE = env.str("EXPORT_FILENAME_STYLE", default="simple")
EXPORT_FILENAME_TIMESTAMP = env.bool("EXPORT_FILENAME_TIMESTAMP", default=False)
# Origins Chromium may fetch /media/ and /static/ resources from while printing (everything else is blocked).
EXPORT_ALLOWED_ORIGINS = env.list(
    "EXPORT_ALLOWED_ORIGINS",
    default=["/".join(SITE_URL.split("/")[:3]), "http://127.0.0.1:8000", "http://localhost:8000"],
)

# Server-side PNG/JPG/WebP/AVIF export of saved design pages (apps.exports.services.export_image). Off by
# default: turning it on opens the frontend's headless render page in the export browser with JavaScript
# enabled and draws the page with the editor's engine. It must be the *built* frontend's `render.html`: the
# Vite dev server serves modules from paths it may not load.
SERVER_IMAGE_EXPORT_ENABLED = env.bool("SERVER_IMAGE_EXPORT_ENABLED", default=False)
EXPORT_RENDER_PAGE_URL = env(
    "EXPORT_RENDER_PAGE_URL", default="/".join(SITE_URL.split("/")[:3]) + "/render.html"
)
EXPORT_IMAGE_MAX_PIXELS = env.int("EXPORT_IMAGE_MAX_PIXELS", default=40_000_000)  # output width x height
EXPORT_IMAGE_MAX_DOCUMENT_BYTES = env.int("EXPORT_IMAGE_MAX_DOCUMENT_BYTES", default=5 * 1024 * 1024)
# Pages one export may draw (`pages`, sent back as a ZIP). Each page is a render of its own, and the whole
# export is one request.
EXPORT_IMAGE_MAX_PAGES = env.int("EXPORT_IMAGE_MAX_PAGES", default=10)
# Time limit for a whole image export: drawing, converting and optimizing all its pages (and for converting
# one PNG at /exports/optimize/). Keep it under the web server's worker timeout (120 s in the Docker image).
EXPORT_IMAGE_TIMEOUT_SECONDS = env.int("EXPORT_IMAGE_TIMEOUT_SECONDS", default=100)
# Server-side MP4, WebM and GIF of saved designs (apps.exports.services.export_video), on the same render page
# with the editor's video pipeline. Off by default: one video keeps a browser busy for minutes. It also needs
# SERVER_IMAGE_EXPORT_ENABLED. The deadline covers the whole file; the bundled nginx waits 330 s for it.
SERVER_VIDEO_EXPORT_ENABLED = env.bool("SERVER_VIDEO_EXPORT_ENABLED", default=False)
EXPORT_VIDEO_TIMEOUT_SECONDS = env.int("EXPORT_VIDEO_TIMEOUT_SECONDS", default=300)
EXPORT_VIDEO_MAX_SECONDS = env.int("EXPORT_VIDEO_MAX_SECONDS", default=120)  # the longest video or GIF
EXPORT_VIDEO_MAX_RESOLUTION = env.int("EXPORT_VIDEO_MAX_RESOLUTION", default=1080)  # shorter side, px
EXPORT_VIDEO_MAX_BYTES = env.int("EXPORT_VIDEO_MAX_BYTES", default=200 * 1024 * 1024)

# Image optimizers (apps.exports.optimizers): make exported and downloaded images smaller after drawing them.
# IMAGE_OPTIMIZERS lists the ones people may pick, in order (empty: none). `builtin` runs mozjpeg and oxipng
# on this server (the Docker image has them; it is left out where they are missing). `tinypng`, `kraken` and
# `custom` send the image to that service and are left out until their key (or URL) is set. An optimizer
# that fails or times out leaves the file as it was, and no file is ever made bigger.
IMAGE_OPTIMIZERS = env.list("IMAGE_OPTIMIZERS", default=["builtin"])
IMAGE_OPTIMIZER_DEFAULT = env("IMAGE_OPTIMIZER_DEFAULT", default="builtin")  # what `optimize: true` uses
IMAGE_OPTIMIZER_TIMEOUT = env.int("IMAGE_OPTIMIZER_TIMEOUT", default=30)  # seconds per file
# Largest file optimized, and the largest image POST /api/v1/exports/optimize/ takes.
IMAGE_OPTIMIZER_MAX_BYTES = env.int("IMAGE_OPTIMIZER_MAX_BYTES", default=25 * 1024 * 1024)
TINYPNG_API_KEY = env("TINYPNG_API_KEY", default="")
KRAKEN_API_KEY = env("KRAKEN_API_KEY", default="")
KRAKEN_API_SECRET = env("KRAKEN_API_SECRET", default="")
# Any other optimizer that follows the small HTTP contract in docs/integrations/image-optimization.md.
IMAGE_OPTIMIZER_CUSTOM_NAME = env("IMAGE_OPTIMIZER_CUSTOM_NAME", default="Custom")
IMAGE_OPTIMIZER_CUSTOM_URL = env("IMAGE_OPTIMIZER_CUSTOM_URL", default="")
IMAGE_OPTIMIZER_CUSTOM_KEY = env("IMAGE_OPTIMIZER_CUSTOM_KEY", default="")

# ---- In-browser background removal (apps.core.mlmodels; `manage.py sync_models` installs the model) ----
BACKGROUND_REMOVAL_ENABLED = env.bool("BACKGROUND_REMOVAL_ENABLED", default=True)
BACKGROUND_REMOVAL_MODEL = env("BACKGROUND_REMOVAL_MODEL", default="")  # empty: the best installed model

# ---- AI image providers (apps.ai): remote servers for background removal and later image tasks ----
AI_PROVIDERS_ENABLED = env.bool("AI_PROVIDERS_ENABLED", default=True)
# Whether users may add their own servers ("bring your own server"): off, staff or everyone.
AI_USER_PROVIDERS = env("AI_USER_PROVIDERS", default="off")
AI_USER_PROVIDERS_ALLOW_HTTP = env.bool("AI_USER_PROVIDERS_ALLOW_HTTP", default=False)
# Extra ports for users' own servers (443 and 8443 always; 80 and 8080 with AI_USER_PROVIDERS_ALLOW_HTTP).
AI_USER_PROVIDERS_ALLOWED_PORTS = env.list("AI_USER_PROVIDERS_ALLOWED_PORTS", cast=int, default=[])
AI_MAX_PROVIDERS_PER_USER = env.int("AI_MAX_PROVIDERS_PER_USER", default=10)
# Host names an operator provider may reach on a private network (e.g. a model server container). IP addresses
# the operator types are allowed too; everything else must resolve to public addresses only.
AI_ALLOWED_PRIVATE_HOSTS = env.list("AI_ALLOWED_PRIVATE_HOSTS", default=[])
# Fernet key for stored provider secrets; empty: derived from DJANGO_SECRET_KEY (see apps.ai.secrets).
AI_SECRETS_KEY = env("AI_SECRETS_KEY", default="")
AI_SECRETS_KEY_FALLBACKS = env.list("AI_SECRETS_KEY_FALLBACKS", default=[])
AI_DEFAULT_TIMEOUT_SECONDS = env.int("AI_DEFAULT_TIMEOUT_SECONDS", default=60)
# Largest image sent to (and read back from) a provider, unless the provider sets its own limit.
AI_MAX_IMAGE_BYTES = env.int("AI_MAX_IMAGE_BYTES", default=25 * 1024 * 1024)
AI_CACHE_SECONDS = env.int("AI_CACHE_SECONDS", default=7 * 24 * 60 * 60)  # identical calls reuse the result
# The option the editor starts with, per task: "device" (in the browser) or an id from /api/v1/ai/models/.
AI_TASK_DEFAULTS = {"background-removal": env("BACKGROUND_REMOVAL_DEFAULT", default="device")}
# The editor's one-line notice under options that send the image off this installation; empty: its own.
AI_OFFSITE_NOTICE = env("AI_OFFSITE_NOTICE", default="")
# Operator providers from the environment: AI_PROVIDER_1_URL … AI_PROVIDER_9_URL (see .env.example and
# apps.ai.env). Kept as the raw strings here; apps.ai.env checks them.
AI_ENV_PROVIDER_FIELDS = (
    "URL",
    "STYLE",
    "TASKS",
    "MODELS",
    "AUTH_HEADER",
    "AUTH_VALUE",
    "STYLE_CONFIG",
    "LABEL",
    "SENDS_OFFSITE",
    "TIMEOUT_SECONDS",
    "MAX_IMAGE_BYTES",
    "DAILY_QUOTA",
)
AI_ENV_PROVIDERS = [
    {"index": n, **{field: env(f"AI_PROVIDER_{n}_{field}", default="") for field in AI_ENV_PROVIDER_FIELDS}}
    for n in range(1, 10)
    if env(f"AI_PROVIDER_{n}_URL", default="")
]

# ---- Element library (apps.elements) ----
# Keep the brand logos (trademarks) the icon packs contain when `sync_element_packs` runs.
DOORY_ELEMENTS_BRAND_LOGOS = env.bool("DOORY_ELEMENTS_BRAND_LOGOS", default=False)

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
# Copy images from public https URLs: the upload_image_from_url tool, and image values of fill and bulk fill
# (MCP and REST). MCP_URL_UPLOADS is the old name, still read.
URL_IMAGE_UPLOADS = env.bool("URL_IMAGE_UPLOADS", default=env.bool("MCP_URL_UPLOADS", default=True))
# export_design: larger images are sent as a download link instead of inline; links expire after the TTL.
# Stored outside MEDIA_ROOT so `/media/` never serves them directly; `ImageDownloadView` is the only way in.
MCP_EXPORT_INLINE_MAX_BYTES = env.int("MCP_EXPORT_INLINE_MAX_BYTES", default=1024 * 1024)
MCP_EXPORT_URL_TTL_SECONDS = env.int("MCP_EXPORT_URL_TTL_SECONDS", default=600)
EXPORT_STORAGE_ROOT = Path(env("EXPORT_STORAGE_ROOT", default=str(BASE_DIR / "exports")))
