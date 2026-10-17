import os
import shutil
import tempfile
from pathlib import Path

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.exports.renderer import BlockedRequest, RenderResult

from .helpers import Canary

CHROMIUM_PATH = os.environ.get("DOORY_TEST_CHROMIUM", "/opt/pw-browsers/chromium")
FAKE_PDF = b"%PDF-1.7\n% fake renderer output\n"


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "chromium: drives a real headless Chromium (skipped when it is missing)"
    )


requires_chromium = pytest.mark.skipif(
    not os.access(CHROMIUM_PATH, os.X_OK),
    reason=f"Chromium not found at {CHROMIUM_PATH}; set DOORY_TEST_CHROMIUM to run the real-browser tests",
)


@pytest.fixture(autouse=True)
def _fresh_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user(db) -> User:
    return User.objects.create_user("exporter@example.com", "exporter-pass-123", display_name="Eve Exporter")


@pytest.fixture
def client(user) -> APIClient:
    api = APIClient()
    api.force_authenticate(user)
    return api


@pytest.fixture
def anon(db) -> APIClient:
    return APIClient()


@pytest.fixture
def render_calls(monkeypatch) -> list[dict]:
    """Replace the browser with a stub that records what it was asked to print."""
    calls: list[dict] = []

    def fake_render_pdf(html, *, width_px, height_px):
        calls.append({"html": html, "width_px": width_px, "height_px": height_px})
        return RenderResult(
            data=FAKE_PDF, blocked=(BlockedRequest("http://x.test/", "origin"),), blocked_total=1
        )

    monkeypatch.setattr("apps.exports.services.render_pdf", fake_render_pdf)
    return calls


@pytest.fixture
def work_root():
    """A directory only the current test renders into, so what a render leaves behind cannot be confused with
    what another test, another test run or another program leaves in the shared temp directory. It is short on
    purpose: Chromium puts a unix socket inside the profile directory under it, and socket paths stop at 107
    characters (pytest's own `tmp_path` is too deep)."""
    root = Path(tempfile.mkdtemp(prefix="dx-"))
    yield root
    shutil.rmtree(root, ignore_errors=True)


@pytest.fixture
def chromium(settings, work_root):
    settings.EXPORT_CHROMIUM_PATH = CHROMIUM_PATH
    settings.EXPORT_CHROMIUM_NO_SANDBOX = True  # the CI/dev sandbox runs as root
    settings.EXPORT_TIMEOUT_SECONDS = 30
    settings.EXPORT_WORK_DIR = str(work_root)
    return CHROMIUM_PATH


@pytest.fixture
def canary():
    server = Canary()
    yield server
    server.close()
