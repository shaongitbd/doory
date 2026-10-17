import pytest

from apps.exports.policy import RequestPolicy, normalize_origin

ORIGIN = "http://127.0.0.1:8000"
POLICY = RequestPolicy.build([ORIGIN, "https://doory.example"], ["/media/", "/static/"])


@pytest.mark.parametrize(
    "url",
    [
        "data:image/png;base64,AAAA",
        "DATA:text/plain,hello",
        "about:blank",
        "http://127.0.0.1:8000/media/fonts/a.woff2",
        "http://127.0.0.1:8000/media/a.png?v=2#frag",
        "http://127.0.0.1:8000/static/app.css",
        "https://doory.example/media/x.png",
        "https://doory.example:443/media/x.png",
        "HTTPS://DOORY.EXAMPLE/media/x.png",
    ],
)
def test_allowed(url):
    assert POLICY.evaluate(url, "GET").allowed


def test_same_origin_requests_are_fetched_by_the_worker_not_the_browser():
    assert POLICY.evaluate("http://127.0.0.1:8000/media/a.png").fetch is True
    assert POLICY.evaluate("data:image/png;base64,AAAA").fetch is False


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        ("file:///etc/passwd", "scheme-file"),
        ("ftp://127.0.0.1:8000/media/a.png", "scheme-ftp"),
        ("ws://127.0.0.1:8000/media/a", "scheme-ws"),
        ("blob:http://127.0.0.1:8000/1234", "scheme-blob"),
        ("chrome://settings", "scheme-chrome"),
        ("javascript:alert(1)", "scheme-javascript"),
        ("http://169.254.169.254/latest/meta-data/", "origin"),
        ("http://metadata.google.internal/computeMetadata/v1/", "origin"),
        ("http://evil.example/media/a.png", "origin"),
        ("http://127.0.0.1:5432/media/a.png", "origin"),
        ("http://127.0.0.1/media/a.png", "origin"),
        ("https://127.0.0.1:8000/media/a.png", "origin"),
        ("http://localhost:8000/media/a.png", "origin"),
        ("http://127.0.0.1:8000/admin/login/", "path"),
        ("http://127.0.0.1:8000/api/v1/auth/me/", "path"),
        ("http://127.0.0.1:8000/mediafoo/a.png", "path"),
        ("http://127.0.0.1:8000/media/../admin/", "path-traversal"),
        ("http://127.0.0.1:8000/media/%2e%2e/admin/", "path-traversal"),
        ("http://127.0.0.1:8000/media/%2E%2E%2Fadmin", "path-traversal"),
        ("http://127.0.0.1:8000/media/a%5Cb", "path-traversal"),
        ("http://127.0.0.1:8000/media/a%00.png", "path-traversal"),
        ("http://user:pw@127.0.0.1:8000/media/a.png", "credentials-in-url"),
        ("http://127.0.0.1:8000@evil.example/media/a.png", "credentials-in-url"),
        ("http://127.0.0.1:99999/media/a.png", "malformed-url"),
        ("", "scheme-none"),
        ("not a url", "scheme-none"),
    ],
)
def test_blocked(url, reason):
    decision = POLICY.evaluate(url, "GET")
    assert not decision.allowed
    assert decision.reason == reason


@pytest.mark.parametrize("method", ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"])
def test_only_get_is_allowed(method):
    assert not POLICY.evaluate("http://127.0.0.1:8000/media/a.png", method).allowed


def test_an_empty_policy_only_permits_inline_data():
    empty = RequestPolicy.build([], [])
    assert empty.evaluate("data:text/plain,x").allowed
    assert not empty.evaluate("http://127.0.0.1:8000/media/a.png").allowed


def test_build_ignores_garbage_origins_and_fixes_prefixes():
    policy = RequestPolicy.build(["nonsense", "ftp://x.test", "http://ok.test"], ["media", "", "/static"])
    assert policy.allowed_origins == {"http://ok.test:80"}
    assert policy.path_prefixes == ("media/", "/static/")


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("http://Example.COM", "http://example.com:80"),
        ("https://example.com/path?q=1", "https://example.com:443"),
        ("http://localhost:5173/", "http://localhost:5173"),
        ("example.com", None),
        ("file:///tmp", None),
        ("http://", None),
        ("http://host:notaport", None),
    ],
)
def test_normalize_origin(value, expected):
    assert normalize_origin(value) == expected


# ---- image mode: the render page and its bundle, on its own origin only ------------------------

PAGE = "http://frontend.test:8080"
IMAGE_POLICY = RequestPolicy.build([ORIGIN], ["/media/", "/static/"], page_url=f"{PAGE}/render.html")


@pytest.mark.parametrize(
    "url",
    [
        f"{PAGE}/render.html",
        f"{PAGE}/render.html?v=1",
        f"{PAGE}/assets/render-abc123.js",
        f"{PAGE}/assets/fonts/inter.woff2",
        f"{PAGE}/media/uploads/a.png",  # relative URLs in the design resolve against the render page
        f"{ORIGIN}/media/a.png",
        "data:image/png;base64,AAAA",
    ],
)
def test_image_mode_allows_the_render_page_and_its_bundle(url):
    decision = IMAGE_POLICY.evaluate(url)
    assert decision.allowed and decision.fetch == (not url.startswith("data:"))


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        (f"{ORIGIN}/assets/app.js", "path"),  # the bundle prefix belongs to the render page's origin only
        (f"{ORIGIN}/render.html", "path"),
        (f"{PAGE}/index.html", "path"),
        (f"{PAGE}/presenter-view.html", "path"),
        (f"{PAGE}/src/editor/headless/main.ts", "path"),  # the Vite dev server's module paths
        (f"{PAGE}/@vite/client", "path"),
        (f"{PAGE}/api/v1/designs/", "path"),
        (f"{PAGE}/assets/../api/v1/auth/me/", "path-traversal"),
        (f"{PAGE}/render.html/../api/", "path-traversal"),
        ("http://frontend.test:9090/render.html", "origin"),
        ("https://frontend.test:8080/render.html", "origin"),
        ("http://evil.example/assets/x.js", "origin"),
        ("http://169.254.169.254/latest/meta-data/", "origin"),
    ],
)
def test_image_mode_blocks_everything_else(url, reason):
    decision = IMAGE_POLICY.evaluate(url)
    assert not decision.allowed
    assert decision.reason == reason


def test_image_mode_still_refuses_writes_to_the_render_page():
    assert IMAGE_POLICY.evaluate(f"{PAGE}/render.html", "POST").reason == "method"


def test_the_pdf_policy_knows_nothing_of_the_render_page():
    pdf = RequestPolicy.build([ORIGIN, PAGE], ["/media/", "/static/"])
    assert pdf.page_origin is None
    for path in ("/render.html", "/assets/app.js"):
        assert pdf.evaluate(f"{PAGE}{path}").reason == "path"
    assert pdf.evaluate(f"{PAGE}/media/a.png").allowed


@pytest.mark.parametrize("page_url", ["", None])
def test_no_page_url_is_the_pdf_policy(page_url):
    assert RequestPolicy.build([ORIGIN], ["/media/"], page_url=page_url) == RequestPolicy.build(
        [ORIGIN], ["/media/"]
    )


@pytest.mark.parametrize("page_url", ["file:///srv/render.html", "http://frontend.test/", "render.html"])
def test_a_bad_render_page_url_is_refused(page_url):
    with pytest.raises(ValueError):
        RequestPolicy.build([ORIGIN], ["/media/"], page_url=page_url)
