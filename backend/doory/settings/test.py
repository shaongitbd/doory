import tempfile

from .base import *
from .base import env

DEBUG = False
SECRET_KEY = "test-secret-key-not-for-production"
# SQLite in memory by default; CI also runs the suite on PostgreSQL via TEST_DATABASE_URL.
DATABASES = {"default": env.db("TEST_DATABASE_URL", default="sqlite:///:memory:")}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
EMAIL_SEND_ASYNC = False
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
MEDIA_ROOT = tempfile.mkdtemp(prefix="doory-test-media-")
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_CLASSES": [],
    # Views that opt into scoped throttles must not trip over the many requests a test makes;
    # tests that exercise throttling lower the rate themselves.
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
        "auth": "100000/min",
        "oidc": "100000/min",
    },
}
GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com"
UNSPLASH_ACCESS_KEY = ""
PEXELS_API_KEY = ""
PIXABAY_API_KEY = ""
PEXELS_VIDEO_API_KEY = ""
PIXABAY_VIDEO_API_KEY = ""
FREESOUND_API_KEY = ""
SERVER_PDF_ENABLED = True
STATIC_ROOT = tempfile.mkdtemp(prefix="doory-test-static-")
EXPORT_STORAGE_ROOT = tempfile.mkdtemp(prefix="doory-test-exports-")
# A developer's .env must not add providers or open private networks to the tests.
AI_ENV_PROVIDERS = []
AI_USER_PROVIDERS = "off"
AI_ALLOWED_PRIVATE_HOSTS = []
AI_SECRETS_KEY = ""
AI_SECRETS_KEY_FALLBACKS = []
# Nor may it switch on image optimizers that send images out, or depend on what the machine has installed.
IMAGE_OPTIMIZERS = ["builtin"]
IMAGE_OPTIMIZER_DEFAULT = "builtin"
TINYPNG_API_KEY = ""
KRAKEN_API_KEY = ""
KRAKEN_API_SECRET = ""
IMAGE_OPTIMIZER_CUSTOM_URL = ""
IMAGE_OPTIMIZER_CUSTOM_KEY = ""
