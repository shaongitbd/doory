from __future__ import annotations

import base64
import functools
import hashlib
import json
import logging
import time
from unittest import mock
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
import requests
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from django.core import mail
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts import oidc
from apps.accounts.checks import check_oidc_settings
from apps.accounts.google import GoogleIdentity
from apps.accounts.models import OidcIdentity, User

from .conftest import (
    GOOGLE,
    LOGIN,
    LOGOUT,
    ME,
    NEW_PASSWORD,
    PASSWORD,
    PASSWORD_RESET,
    PASSWORD_RESET_CONFIRM,
    last_email_params,
)

pytestmark = pytest.mark.django_db

SITE = "https://doory.example.com"
ISSUER = "https://idp.example.com/application/o/doory/"
DISCOVERY = "https://idp.example.com/application/o/doory/.well-known/openid-configuration"
CLIENT_ID = "doory-client"
CLIENT_SECRET = "doory-secret"
START = "/api/v1/auth/oidc/start/"
CALLBACK = "/api/v1/auth/oidc/callback/"
CONNECTION = "/api/v1/auth/oidc/connection/"
CONFIG = "/api/v1/config/"
CODE = "the-code"
NEXT = "/dashboard/designs"


@functools.cache
def rsa_key(index: int = 0) -> rsa.RSAPrivateKey:
    """Making keys is slow: each one is made once for the whole module."""
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@functools.cache
def ec_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def public_jwk(key, **extra) -> dict:
    if isinstance(key, ec.EllipticCurvePrivateKey):
        jwk = jwt.algorithms.ECAlgorithm.to_jwk(key.public_key())
    else:
        jwk = jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key())
    return {**json.loads(jwk), "use": "sig", **{k: v for k, v in extra.items() if v is not None}}


class FakeResponse:
    def __init__(self, status: int, body: bytes):
        self.status_code = status
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def iter_content(self, size):
        for i in range(0, len(self.body), size):
            yield self.body[i : i + size]


def json_response(document) -> FakeResponse:
    return FakeResponse(200, json.dumps(document).encode())


class FakeProvider:
    """An OpenID Connect provider behind `requests.request`: discovery, JWKS, token and userinfo endpoints."""

    def __init__(self):
        self.key, self.alg, self.kid = rsa_key(), "RS256", "key-1"
        self.published: list[dict] | None = None  # the key set; by default the public half of `key`
        self.metadata = {
            "issuer": ISSUER,
            "authorization_endpoint": "https://idp.example.com/authorize/",
            "token_endpoint": "https://idp.example.com/token/",
            "jwks_uri": "https://idp.example.com/jwks/",
            "userinfo_endpoint": "https://idp.example.com/userinfo/",
            "id_token_signing_alg_values_supported": ["RS256"],
        }
        self.claims: dict = {}  # added to (or, with None, removed from) the ID tokens it issues
        self.userinfo: dict = {}
        self.overrides: dict[str, FakeResponse] = {}  # URL -> canned answer
        self.authorization: dict[str, str] = {}  # the query of the last authorization request
        self.calls: list[tuple[str, str, dict]] = []

    def payload(self, **claims) -> dict:
        now = int(time.time())
        payload = {
            "iss": ISSUER,
            "sub": "sub-1",
            "aud": CLIENT_ID,
            "exp": now + 300,
            "iat": now,
            "nonce": self.authorization.get("nonce"),
            "email": "ada@example.com",
            "email_verified": True,
            "name": "Ada Lovelace",
            **self.claims,
            **claims,
        }
        return {k: v for k, v in payload.items() if v is not None}

    def id_token(self, **claims) -> str:
        headers = {"kid": self.kid} if self.kid else {}
        return jwt.encode(self.payload(**claims), self.key, algorithm=self.alg, headers=headers)

    def serve(self, id_token: str) -> None:
        """Answer the next code redemptions with this ID token."""
        self.overrides[self.metadata["token_endpoint"]] = json_response({"id_token": id_token})

    def calls_to(self, url: str) -> list[dict]:
        return [kwargs for _, called, kwargs in self.calls if called == url]

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        if url in self.overrides:
            return self.overrides[url]
        if url == DISCOVERY:
            return json_response(self.metadata)
        if url == self.metadata["jwks_uri"]:
            keys = self.published
            return json_response({"keys": keys if keys is not None else [public_jwk(self.key, kid=self.kid)]})
        if url == self.metadata["token_endpoint"]:
            return self._token(kwargs["data"])
        if url == self.metadata.get("userinfo_endpoint"):
            return json_response({"sub": "sub-1", **self.userinfo})
        return FakeResponse(404, b"{}")

    def _token(self, data: dict) -> FakeResponse:
        challenge = base64.urlsafe_b64encode(hashlib.sha256(data["code_verifier"].encode()).digest())
        if (
            data["code"] != CODE
            or data["redirect_uri"] != SITE + CALLBACK
            or challenge.rstrip(b"=").decode() != self.authorization["code_challenge"]
        ):
            return FakeResponse(400, b'{"error": "invalid_grant", "error_description": "Bad code verifier"}')
        return json_response({"id_token": self.id_token(), "access_token": "access", "token_type": "Bearer"})


@pytest.fixture(autouse=True)
def configured(settings):
    settings.SITE_URL = SITE
    settings.OIDC_ISSUER = ISSUER
    settings.OIDC_CLIENT_ID = CLIENT_ID
    settings.OIDC_CLIENT_SECRET = CLIENT_SECRET
    settings.OIDC_BUTTON_LABEL = "Sign in with Authentik"
    settings.OIDC_SCOPES = "openid email profile"
    settings.OIDC_TRUST_EMAIL = False


@pytest.fixture(autouse=True)
def resolver(monkeypatch):
    """Host names resolve to a public address unless a test says otherwise."""
    names: dict[str, list[str]] = {}
    monkeypatch.setattr(oidc, "_resolve", lambda host: names.get(host, ["203.0.113.10"]))
    return names


@pytest.fixture
def provider():
    fake = FakeProvider()
    with mock.patch("apps.accounts.oidc.requests.request", side_effect=fake.request):
        yield fake


def start(client, provider, next_path: str | None = NEXT) -> dict[str, str]:
    res = client.get(START, {"next": next_path} if next_path is not None else {})
    assert res.status_code == 302, res.content
    location = urlparse(res["Location"])
    assert (
        f"{location.scheme}://{location.netloc}{location.path}" == provider.metadata["authorization_endpoint"]
    )
    provider.authorization = {k: v[0] for k, v in parse_qs(location.query).items()}
    return provider.authorization


def callback(client, provider, **params):
    query = {"state": provider.authorization.get("state"), "code": CODE, **params}
    return client.get(CALLBACK, {k: v for k, v in query.items() if v is not None})


def sign_in(client, provider, next_path=NEXT, **params):
    start(client, provider, next_path)
    return callback(client, provider, **params)


def location(res) -> str:
    assert res.status_code == 302, res.content
    return res["Location"]


def sso_error(res) -> str | None:
    return parse_qs(urlparse(location(res)).query).get("sso_error", [None])[0]


def signed_in_email(client) -> str | None:
    user = client.get(ME).json()["user"]
    return user and user["email"]


# --- configuration ----------------------------------------------------------------------------------------


def test_config_announces_the_button_only_when_configured(client, settings):
    body = client.get(CONFIG).json()
    assert body["features"]["oidc_login"] is True
    assert body["oidc_button_label"] == "Sign in with Authentik"
    settings.OIDC_ISSUER = settings.OIDC_CLIENT_ID = settings.OIDC_CLIENT_SECRET = ""
    assert client.get(CONFIG).json()["features"]["oidc_login"] is False


def test_an_empty_button_label_falls_back_to_the_default(client, settings):
    settings.OIDC_BUTTON_LABEL = "  "
    assert client.get(CONFIG).json()["oidc_button_label"] == "Sign in with SSO"


@pytest.mark.parametrize(
    ("setting", "value", "message"),
    [
        ("OIDC_CLIENT_SECRET", "", "OIDC_CLIENT_SECRET is not set."),
        ("OIDC_ISSUER", "http://idp.example.com/", "OIDC_ISSUER="),
        ("OIDC_ISSUER", "https://idp.example.com/?tenant=1", "OIDC_ISSUER="),
        ("OIDC_ISSUER", "https://idp.example.com/" + "x" * 240, "OIDC_ISSUER is longer than 254 characters."),
        ("OIDC_SCOPES", "email profile", "OIDC_SCOPES must include openid."),
        ("SITE_URL", "http://doory.example.com", "SITE_URL="),
    ],
)
def test_a_misconfiguration_turns_it_off_with_a_check_warning(settings, setting, value, message):
    setattr(settings, setting, value)
    assert not oidc.enabled()
    warnings = check_oidc_settings(None)
    assert [w.id for w in warnings] == ["accounts.W001"]
    assert message in warnings[0].msg


def test_http_is_accepted_for_local_development(settings):
    settings.DEBUG = True
    settings.SITE_URL = "http://localhost:5173"
    settings.OIDC_ISSUER = "http://localhost:9000/application/o/doory/"
    assert oidc.enabled()


def test_nothing_configured_is_off_without_warnings(settings):
    settings.OIDC_ISSUER = settings.OIDC_CLIENT_ID = settings.OIDC_CLIENT_SECRET = ""
    assert not oidc.enabled()
    assert check_oidc_settings(None) == []


def test_manage_py_check_runs_the_oidc_check(settings, capsys):
    settings.OIDC_CLIENT_SECRET = ""
    call_command("check")
    assert "accounts.W001" in capsys.readouterr().err


def test_start_when_off_goes_back_to_the_sign_in_page(client, settings):
    settings.OIDC_CLIENT_SECRET = ""
    res = client.get(START, {"next": "/design/1"})
    assert location(res) == f"{SITE}/login?sso_error=oidc_unavailable&next=%2Fdesign%2F1"


# --- start ------------------------------------------------------------------------------------------------


def test_start_sends_the_browser_to_the_provider_with_pkce(client, provider):
    params = start(client, provider)
    assert params["response_type"] == "code"
    assert params["client_id"] == CLIENT_ID
    assert params["redirect_uri"] == SITE + CALLBACK  # built from SITE_URL, never from the request
    assert params["scope"] == "openid email profile"
    assert params["code_challenge_method"] == "S256"
    assert len(params["state"]) >= 32 and len(params["nonce"]) >= 32
    # The verifier never leaves the server.
    flow = client.session[oidc.SESSION_KEY][params["state"]]
    assert flow["verifier"] not in json.dumps(params)


@pytest.mark.parametrize(
    "next_path", ["https://evil.example", "//evil.example", "/\\evil.example", "dashboard", "/x\x00y"]
)
def test_next_cannot_leave_the_app(client, provider, next_path):
    assert location(sign_in(client, provider, next_path=next_path)) == f"{SITE}/dashboard"


def test_discovery_is_cached(client, provider):
    sign_in(client, provider)
    client.post(LOGOUT)
    sign_in(client, provider)
    assert len(provider.calls_to(DISCOVERY)) == 1


def test_requests_have_timeouts_never_follow_redirects_and_say_who_they_are(client, provider):
    sign_in(client, provider)
    assert len(provider.calls) == 3  # discovery, token, keys
    for _, _, kwargs in provider.calls:
        assert kwargs["allow_redirects"] is False
        assert kwargs["timeout"] == (oidc.CONNECT_TIMEOUT, oidc.READ_TIMEOUT)
        assert kwargs["headers"]["User-Agent"] == oidc.USER_AGENT


def test_a_discovery_redirect_is_not_followed(client, provider):
    provider.overrides[DISCOVERY] = FakeResponse(302, b"")
    assert sso_error(client.get(START)) == "oidc_unavailable"


def test_an_oversized_document_is_refused(client, provider):
    big = json.dumps({**provider.metadata, "padding": "x" * oidc.MAX_DOCUMENT_BYTES}).encode()
    provider.overrides[DISCOVERY] = FakeResponse(200, big)
    assert sso_error(client.get(START)) == "oidc_unavailable"


def test_a_slow_answer_is_cut_off(client, provider, monkeypatch):
    monkeypatch.setattr(oidc, "MAX_SECONDS", -1)  # the deadline has passed by the first chunk
    assert sso_error(client.get(START)) == "oidc_unavailable"


def test_discovery_for_another_issuer_is_refused(client, provider):
    provider.metadata["issuer"] = "https://evil.example.com/"
    assert sso_error(client.get(START)) == "oidc_unavailable"


@pytest.mark.parametrize(
    "jwks_uri",
    [
        "https://169.254.169.254/latest/meta-data/",
        "https://[fe80::1]/keys",
        "https://[::ffff:169.254.169.254]/keys",
        "https://100.100.100.200/keys",
        "https://metadata.example.com/keys",  # a host name that resolves to a metadata address
    ],
)
def test_documents_never_come_from_link_local_or_metadata_addresses(client, provider, resolver, jwks_uri):
    resolver["metadata.example.com"] = ["10.0.0.5", "169.254.169.254"]
    provider.metadata["jwks_uri"] = jwks_uri
    assert sso_error(sign_in(client, provider)) == "oidc_unavailable"
    assert not [call for call in provider.calls if call[1] == jwks_uri]


def test_a_provider_on_a_private_network_is_allowed(client, provider, resolver):
    resolver["idp.example.com"] = ["10.0.0.5"]
    assert sso_error(sign_in(client, provider)) is None


def test_a_provider_whose_name_cannot_be_found_is_unavailable(client, provider, monkeypatch):
    def missing(host):
        raise oidc.remote.RemoteImageError("no such host")

    monkeypatch.setattr(oidc, "_resolve", missing)
    assert sso_error(client.get(START)) == "oidc_unavailable"
    assert not provider.calls


def test_an_unreachable_provider_is_reported_without_details(client):
    with mock.patch("apps.accounts.oidc.requests.request", side_effect=requests.ConnectionError("secret")):
        res = client.get(START)
    assert location(res) == f"{SITE}/login?sso_error=oidc_unavailable"


# --- sign-in ----------------------------------------------------------------------------------------------


def test_a_new_user_is_created_signed_in_and_sent_to_next(client, provider):
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"
    user = User.objects.get()
    assert (user.email, user.display_name, user.is_email_verified) == (
        "ada@example.com",
        "Ada Lovelace",
        True,
    )
    assert not user.has_usable_password()
    assert OidcIdentity.objects.filter(user=user, issuer=ISSUER, subject="sub-1").exists()
    me = client.get(ME).json()["user"]
    assert me["email"] == "ada@example.com" and me["oidc_linked"] is True
    assert mail.outbox == []


def test_an_unverified_email_makes_an_unverified_account_and_sends_the_check(client, provider):
    """Authentik, for one, sends email_verified=false unless told otherwise."""
    provider.claims = {"email_verified": False}
    sign_in(client, provider)
    assert User.objects.get().is_email_verified is False
    assert len(mail.outbox) == 1


def test_a_returning_user_is_found_by_issuer_and_subject(client, provider):
    sign_in(client, provider)
    client.post(LOGOUT)
    provider.claims = {"email": "renamed@example.com"}
    sign_in(client, provider)
    assert User.objects.count() == 1
    assert signed_in_email(client) == "ada@example.com"


def test_the_same_subject_at_another_issuer_is_someone_else(client, provider, make_user):
    other = make_user("grace@example.com")
    OidcIdentity.objects.create(user=other, issuer="https://other-idp.example.com/", subject="sub-1")
    sign_in(client, provider)
    assert signed_in_email(client) == "ada@example.com"


def test_an_existing_account_is_not_taken_over_by_email(client, provider, make_user):
    existing = make_user("ada@example.com", is_email_verified=True)
    assert sso_error(sign_in(client, provider)) == "oidc_account_exists"
    assert not OidcIdentity.objects.exists()
    assert signed_in_email(client) is None
    assert existing.check_password(PASSWORD)


def test_trusting_email_links_a_verified_address(client, provider, make_user, settings):
    settings.OIDC_TRUST_EMAIL = True
    existing = make_user("Ada@Example.com", is_email_verified=True)
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"
    assert OidcIdentity.objects.get().user == existing
    existing.refresh_from_db()
    assert existing.check_password(PASSWORD)


def test_trusting_email_still_needs_the_provider_to_verify_it(client, provider, make_user, settings):
    settings.OIDC_TRUST_EMAIL = True
    make_user("ada@example.com", is_email_verified=True)
    provider.claims = {"email_verified": False}
    assert sso_error(sign_in(client, provider)) == "oidc_email_unverified"
    assert not OidcIdentity.objects.exists()


@pytest.mark.parametrize("flag", ["is_staff", "is_superuser"])
def test_trusting_email_never_links_staff(client, provider, make_user, settings, flag):
    settings.OIDC_TRUST_EMAIL = True
    make_user("ada@example.com", is_email_verified=True, **{flag: True})
    assert sso_error(sign_in(client, provider)) == "oidc_account_exists"
    assert not OidcIdentity.objects.exists()


def test_trusting_email_drops_the_password_of_an_unverified_account(client, provider, make_user, settings):
    settings.OIDC_TRUST_EMAIL = True
    squatter = make_user("ada@example.com", is_email_verified=False)
    sign_in(client, provider)
    squatter.refresh_from_db()
    assert squatter.is_email_verified and not squatter.has_usable_password()


def test_trusting_email_replaces_an_oidc_account_that_claimed_an_unverified_address(
    client, provider, settings
):
    provider.claims = {"email_verified": False}
    sign_in(client, provider)  # someone at the provider claims the address, unverified
    client.post(LOGOUT)
    settings.OIDC_TRUST_EMAIL = True
    provider.claims = {"sub": "sub-2"}  # the address's owner, verified by the provider
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"
    assert list(OidcIdentity.objects.values_list("subject", flat=True)) == ["sub-2"]
    assert User.objects.get().is_email_verified


def test_trusting_email_refuses_an_account_connected_to_someone_else(client, provider, make_user, settings):
    settings.OIDC_TRUST_EMAIL = True
    owner = make_user("ada@example.com", is_email_verified=True)
    OidcIdentity.objects.create(user=owner, issuer=ISSUER, subject="sub-0")
    assert sso_error(sign_in(client, provider)) == "oidc_account_mismatch"


def test_a_disabled_account_cannot_sign_in(client, provider):
    sign_in(client, provider)
    client.post(LOGOUT)
    User.objects.update(is_active=False)
    assert sso_error(sign_in(client, provider)) == "account_disabled"


def test_no_email_means_no_account(client, provider):
    provider.claims = {"email": None}
    provider.metadata.pop("userinfo_endpoint")
    assert sso_error(sign_in(client, provider)) == "oidc_no_email"
    assert not User.objects.exists()


def test_an_address_too_long_for_an_account_is_not_used(client, provider):
    long_email = "a" * 64 + "@" + ".".join(["b" * 63, "c" * 63, "d" * 63, "e" * 30]) + ".com"  # valid, 291
    provider.claims = {"email": long_email}
    provider.metadata.pop("userinfo_endpoint")
    assert sso_error(sign_in(client, provider)) == "oidc_no_email"
    assert not User.objects.exists()


def test_the_email_may_come_from_userinfo(client, provider):
    provider.claims = {"email": None, "email_verified": None, "name": None}
    provider.userinfo = {"email": "ada@example.com", "email_verified": True, "name": "Ada"}
    sign_in(client, provider)
    assert provider.calls_to(provider.metadata["userinfo_endpoint"])[0]["headers"]["Authorization"] == (
        "Bearer access"
    )
    assert User.objects.get().email == "ada@example.com"


def test_userinfo_for_another_subject_is_refused(client, provider):
    provider.claims = {"email": None}
    provider.overrides[provider.metadata["userinfo_endpoint"]] = json_response(
        {"sub": "someone-else", "email": "eve@example.com"}
    )
    assert sso_error(sign_in(client, provider)) == "oidc_failed"
    assert not User.objects.exists()


def test_the_client_secret_goes_in_the_basic_header(client, provider):
    sign_in(client, provider)
    token_call = provider.calls_to(provider.metadata["token_endpoint"])[0]
    assert token_call["auth"] == (CLIENT_ID, CLIENT_SECRET)
    assert "client_secret" not in token_call["data"]


def test_client_secret_post_when_the_provider_only_takes_that(client, provider):
    provider.metadata["token_endpoint_auth_methods_supported"] = ["client_secret_post"]
    sign_in(client, provider)
    token_call = provider.calls_to(provider.metadata["token_endpoint"])[0]
    assert token_call["auth"] is None
    assert token_call["data"]["client_secret"] == CLIENT_SECRET


def test_metadata_lists_of_the_wrong_type_are_ignored(client, provider):
    provider.metadata["token_endpoint_auth_methods_supported"] = 5
    provider.metadata["id_token_signing_alg_values_supported"] = "RS256"
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"


# --- the callback is checked ------------------------------------------------------------------------------


def test_state_is_single_use(client, provider):
    sign_in(client, provider)
    client.post(LOGOUT)
    assert sso_error(callback(client, provider)) == "oidc_expired"


def test_an_unknown_state_is_refused(client, provider):
    start(client, provider)
    assert sso_error(callback(client, provider, state="forged")) == "oidc_expired"
    assert signed_in_email(client) is None


def test_a_flow_from_another_browser_is_refused(client, provider):
    start(client, provider)
    assert sso_error(callback(APIClient(), provider)) == "oidc_expired"


def test_an_old_flow_is_refused(client, provider):
    start(client, provider)
    later = time.time() + oidc.FLOW_MAX_AGE_SECONDS + 1
    with mock.patch("apps.accounts.oidc.time.time", return_value=later):
        assert sso_error(callback(client, provider)) == "oidc_expired"


def test_a_wrong_pkce_verifier_fails_and_the_reason_is_logged(client, provider, caplog):
    start(client, provider)
    provider.authorization["code_challenge"] = "something-else"
    with caplog.at_level(logging.INFO):
        assert sso_error(callback(client, provider)) == "oidc_failed"
    assert "invalid_grant" in caplog.text and "Bad code verifier" in caplog.text


def test_the_providers_error_text_goes_to_the_log_not_the_page(client, provider, caplog):
    start(client, provider)
    with caplog.at_level(logging.INFO):
        res = callback(client, provider, code=None, error="access_denied", error_description="<b>Evil</b>")
    assert location(res) == f"{SITE}/login?sso_error=oidc_cancelled&next=%2Fdashboard%2Fdesigns"
    assert "Evil" in caplog.text
    start(client, provider)
    res = callback(client, provider, code=None, error="server_error", error_description="Stack trace")
    assert sso_error(res) == "oidc_failed" and "Stack" not in location(res)


def test_turning_it_off_halfway_ends_the_sign_in(client, provider, settings):
    start(client, provider)
    settings.OIDC_CLIENT_SECRET = ""
    assert sso_error(callback(client, provider)) == "oidc_unavailable"
    assert provider.calls_to(provider.metadata["token_endpoint"]) == []


def test_a_callback_from_another_issuer_is_refused(client, provider):
    assert sso_error(sign_in(client, provider, iss="https://evil.example.com/")) == "oidc_failed"


def test_the_iss_parameter_is_required_when_the_provider_sends_it(client, provider):
    provider.metadata["authorization_response_iss_parameter_supported"] = True
    assert sso_error(sign_in(client, provider)) == "oidc_failed"
    assert location(sign_in(client, provider, iss=ISSUER)) == f"{SITE}{NEXT}"


@pytest.mark.parametrize(
    "claims",
    [
        {"nonce": "another-nonce"},
        {"nonce": None},
        {"aud": "another-client"},
        {"aud": [CLIENT_ID, "another-client"]},  # several audiences need azp
        {"azp": "another-client"},
        {"iss": "https://evil.example.com/"},
        {"exp": int(time.time()) - 3600},
        {"iat": None},
        {"sub": None},
        {"sub": "x" * 256},
    ],
)
def test_the_id_token_claims_are_checked(client, provider, claims):
    provider.claims = claims
    assert sso_error(sign_in(client, provider)) == "oidc_failed"
    assert not User.objects.exists()


def test_several_audiences_are_fine_with_the_right_azp(client, provider):
    provider.claims = {"aud": [CLIENT_ID, "another-client"], "azp": CLIENT_ID}
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"


def _unsigned(payload: dict) -> str:
    def part(document: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(document).encode()).rstrip(b"=").decode()

    return f"{part({'alg': 'none', 'typ': 'JWT'})}.{part(payload)}."


@pytest.mark.parametrize("algorithm", ["HS256", "none"])
def test_symmetric_and_unsigned_tokens_are_refused(client, provider, algorithm):
    params = start(client, provider)
    payload = provider.payload()
    if algorithm == "none":
        provider.serve(_unsigned(payload))
    else:  # signed with the client secret, as Authentik does without a signing key
        provider.serve(jwt.encode(payload, CLIENT_SECRET * 8, algorithm=algorithm))
    assert sso_error(callback(client, provider, state=params["state"])) == "oidc_failed"
    assert not User.objects.exists()


def test_a_token_signed_by_another_key_is_refused(client, provider):
    start(client, provider)
    provider.serve(jwt.encode(provider.payload(), rsa_key(1), algorithm="RS256", headers={"kid": "key-1"}))
    assert sso_error(callback(client, provider)) == "oidc_failed"


def test_an_algorithm_the_provider_does_not_list_is_refused(client, provider):
    provider.metadata["id_token_signing_alg_values_supported"] = ["ES256"]
    assert sso_error(sign_in(client, provider)) == "oidc_failed"


def test_es256_with_a_key_set_of_several_key_types(client, provider):
    provider.key, provider.alg, provider.kid = ec_key(), "ES256", None
    provider.metadata["id_token_signing_alg_values_supported"] = ["RS256", "ES256"]
    provider.published = [public_jwk(rsa_key()), public_jwk(ec_key())]  # no kid nor alg: the key type decides
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"


def test_a_malformed_key_fails_cleanly(client, provider):
    provider.published = [{"kty": "RSA", "kid": "key-1", "use": "sig", "e": "AQAB"}]  # no modulus
    assert sso_error(sign_in(client, provider)) == "oidc_failed"


def test_a_private_key_in_the_key_set_is_not_used(client, provider):
    private = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(rsa_key()))
    provider.published = [{**private, "kid": "key-1", "use": "sig"}]
    assert sso_error(sign_in(client, provider)) == "oidc_failed"


def test_rotated_keys_are_fetched_again_once(client, provider):
    sign_in(client, provider)  # caches the key set
    client.post(LOGOUT)
    provider.key, provider.kid = rsa_key(1), "key-2"
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"
    assert len(provider.calls_to(provider.metadata["jwks_uri"])) == 2
    # An unknown key doesn't make every callback fetch the key set again.
    client.post(LOGOUT)
    start(client, provider)
    provider.serve(jwt.encode(provider.payload(), rsa_key(1), algorithm="RS256", headers={"kid": "key-3"}))
    assert sso_error(callback(client, provider)) == "oidc_failed"
    assert len(provider.calls_to(provider.metadata["jwks_uri"])) == 2


# --- connecting an existing account -----------------------------------------------------------------------


def connect(client, provider, payload=None):
    res = client.post(CONNECTION, payload if payload is not None else {"password": PASSWORD}, format="json")
    if res.status_code != 200:
        return res
    query = urlparse(res.json()["redirect_url"]).query
    provider.authorization = {k: v[0] for k, v in parse_qs(query).items()}
    return callback(client, provider)


def test_connecting_needs_the_password(auth_client, provider):
    res = connect(auth_client, provider, {"password": "wrong"})
    assert res.status_code == 400
    assert res.json()["error"]["field_codes"] == {"password": ["invalid_password"]}
    assert not OidcIdentity.objects.exists()


def test_connecting_needs_a_session(client, provider):
    assert client.post(CONNECTION, {"password": PASSWORD}, format="json").status_code in (401, 403)


def test_connect_then_sign_in_with_the_provider(auth_client, provider, user, client):
    provider.claims = {"email": "ada@work.example.com"}  # the address at the provider doesn't matter
    assert location(connect(auth_client, provider)) == f"{SITE}/settings?sso=connected"
    assert OidcIdentity.objects.get().user == user
    assert location(sign_in(client, provider)) == f"{SITE}{NEXT}"
    assert signed_in_email(client) == user.email


def test_an_account_without_password_confirms_with_its_email(client, provider, make_user):
    client.force_login(make_user("ada@example.com", password=None, google_sub="g-1", is_email_verified=True))
    res = connect(client, provider, {"confirm_email": "ada@example.com"})
    assert location(res) == f"{SITE}/settings?sso=connected"


def test_a_provider_account_already_used_by_someone_else_is_refused(auth_client, provider, make_user):
    OidcIdentity.objects.create(user=make_user("grace@example.com"), issuer=ISSUER, subject="sub-1")
    res = connect(auth_client, provider)
    assert location(res) == f"{SITE}/settings?sso_error=oidc_identity_in_use"


def test_a_connect_flow_is_bound_to_the_account_that_started_it(auth_client, provider, make_user):
    res = auth_client.post(CONNECTION, {"password": PASSWORD}, format="json")
    provider.authorization = {
        k: v[0] for k, v in parse_qs(urlparse(res.json()["redirect_url"]).query).items()
    }
    auth_client.post(LOGOUT)
    make_user("grace@example.com")
    auth_client.post(LOGIN, {"email": "grace@example.com", "password": PASSWORD}, format="json")
    # Logging in starts a new session, so the flow is gone with the old one.
    assert sso_error(callback(auth_client, provider)) == "oidc_expired"
    assert not OidcIdentity.objects.exists()


def test_connect_is_refused_when_off(auth_client, settings):
    settings.OIDC_CLIENT_SECRET = ""
    res = auth_client.post(CONNECTION, {"password": PASSWORD}, format="json")
    assert res.json()["error"]["code"] == "oidc_not_configured"


def test_connect_when_the_provider_cannot_be_reached(auth_client, provider):
    provider.overrides[DISCOVERY] = FakeResponse(500, b"")
    res = auth_client.post(CONNECTION, {"password": PASSWORD}, format="json")
    assert (res.status_code, res.json()["error"]["code"]) == (503, "oidc_unavailable")


def test_disconnect(auth_client, user):
    OidcIdentity.objects.create(user=user, issuer=ISSUER, subject="sub-1")
    res = auth_client.delete(CONNECTION)
    assert res.status_code == 200 and res.json()["user"]["oidc_linked"] is False
    assert not OidcIdentity.objects.exists()


def test_disconnect_keeps_a_way_to_sign_in(client, provider):
    sign_in(client, provider)  # an account made by OIDC: no password, no Google
    res = client.delete(CONNECTION)
    assert res.json()["error"]["code"] == "last_sign_in_method"
    assert OidcIdentity.objects.exists()


# --- other ways of proving the address ---------------------------------------------------------------------


@pytest.mark.parametrize("verified", [False, True])
def test_a_password_reset_disconnects_the_oidc_account(client, provider, verified):
    provider.claims = {"email_verified": verified}
    sign_in(client, provider)
    client.post(LOGOUT)
    mail.outbox.clear()
    client.post(PASSWORD_RESET, {"email": "ada@example.com"}, format="json")
    res = client.post(
        PASSWORD_RESET_CONFIRM, {**last_email_params(), "new_password": NEW_PASSWORD}, format="json"
    )
    assert res.status_code == 204
    assert not OidcIdentity.objects.exists()
    # The owner connects it again from Settings, with the new password.
    assert sso_error(sign_in(client, provider)) == "oidc_account_exists"


def test_google_proving_the_address_drops_an_unproven_oidc_account(client, provider):
    provider.claims = {"email_verified": False}
    sign_in(client, provider)
    client.post(LOGOUT)
    with mock.patch("apps.accounts.views.verify_google_credential") as verify:
        verify.return_value = GoogleIdentity(sub="g-1", email="ada@example.com", name="Ada")
        assert client.post(GOOGLE, {"credential": "x"}, format="json").status_code == 200
    assert not OidcIdentity.objects.exists()
