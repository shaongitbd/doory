"""OpenID Connect sign-in: the authorization code flow with PKCE, run by the server.

`begin()` keeps `state`, `nonce` and the PKCE verifier in the session (single use, a few minutes) and
returns the provider's authorization URL; the provider sends the browser back to `/auth/oidc/callback/`,
where `take_flow()` and `complete()` check the answer, redeem the code and verify the ID token. Provider
documents (discovery, keys, token and userinfo responses) are fetched with timeouts, no redirects and a
size cap. The ID token must be signed with an asymmetric algorithm by a public key from the provider's JWKS.

Errors raise `OidcError`: its `code` is all the user sees (the frontend turns it into a message); the
provider's own words only go to the log.
"""

from __future__ import annotations

import base64
import hashlib
import json
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote_plus, urlencode, urlparse

import jwt
import requests
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

CALLBACK_PATH = "/api/v1/auth/oidc/callback/"
USER_AGENT = "Doory-oidc/1.0"
CONNECT_TIMEOUT = 5
READ_TIMEOUT = 10
MAX_SECONDS = 20  # for a whole document: the read timeout alone lets a slow server drip bytes for longer
MAX_DOCUMENT_BYTES = 256 * 1024
METADATA_CACHE_SECONDS = 60 * 60
JWKS_REFRESH_SECONDS = 60  # an unknown key refetches the key set, at most this often
FLOW_MAX_AGE_SECONDS = 10 * 60
MAX_PENDING_FLOWS = 5  # sign-ins started in other tabs and never finished
CLOCK_SKEW_SECONDS = 60
MAX_ISSUER_LENGTH = 255  # OidcIdentity.issuer
MAX_EMAIL_LENGTH = 254  # User.email
SESSION_KEY = "oidc_flows"
DEFAULT_BUTTON_LABEL = "Sign in with SSO"
REQUIRED_SETTINGS = ("OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET")
# Asymmetric algorithms only, and the key type each one needs.
KEY_TYPES = {
    **dict.fromkeys(("RS256", "RS384", "RS512", "PS256", "PS384", "PS512"), "RSA"),
    **dict.fromkeys(("ES256", "ES384", "ES512"), "EC"),
    "EdDSA": "OKP",
}

# The codes this module raises: whatever goes wrong here reaches the user as one of these. Signing in or
# connecting an account (apps.accounts.services) adds its own: account_disabled, oidc_no_email,
# oidc_account_exists, oidc_email_unverified, oidc_identity_in_use and oidc_account_mismatch.
UNAVAILABLE = "oidc_unavailable"  # off, or the provider can't be reached / answered nonsense
FAILED = "oidc_failed"  # the answer did not verify (services: or signing in kept racing another)
CANCELLED = "oidc_cancelled"  # the user (or the provider) said no
EXPIRED = "oidc_expired"  # unknown, used or stale `state`: start again


class OidcError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(detail or code)
        self.code = code


@dataclass(frozen=True)
class OidcClaims:
    issuer: str
    subject: str
    email: str  # "" when the provider sent none (or not a usable address)
    email_verified: bool
    name: str


# --- configuration ----------------------------------------------------------------------------------------


def configuration_problems() -> list[str]:
    """Why OIDC sign-in is off although some of it is configured. Empty when it is on, or not configured."""
    if not any(getattr(settings, name) for name in REQUIRED_SETTINGS):
        return []
    problems = [f"{name} is not set." for name in REQUIRED_SETTINGS if not getattr(settings, name)]
    issuer = settings.OIDC_ISSUER
    if issuer and not _allowed_url(issuer, query=False):
        problems.append(
            f"OIDC_ISSUER={issuer!r} is not an https:// URL without a query or fragment "
            "(http:// works only with DEBUG on)."
        )
    elif len(issuer.rstrip("/")) >= MAX_ISSUER_LENGTH:
        problems.append(f"OIDC_ISSUER is longer than {MAX_ISSUER_LENGTH - 1} characters.")
    if "openid" not in settings.OIDC_SCOPES.split():
        problems.append("OIDC_SCOPES must include openid.")
    if not _allowed_url(settings.SITE_URL, query=False):
        problems.append(f"SITE_URL={settings.SITE_URL!r} must be https://: the provider sends people there.")
    return problems


def enabled() -> bool:
    return all(getattr(settings, name) for name in REQUIRED_SETTINGS) and not configuration_problems()


def button_label() -> str:
    return settings.OIDC_BUTTON_LABEL.strip() or DEFAULT_BUTTON_LABEL


def redirect_uri() -> str:
    return settings.SITE_URL.rstrip("/") + CALLBACK_PATH


def _allowed_url(url: object, *, query: bool) -> bool:
    """An absolute https:// URL (http:// too with DEBUG on), without a fragment, and without a query unless
    `query` (an issuer has none; an endpoint may)."""
    if not isinstance(url, str):
        return False
    parsed = urlparse(url)
    schemes = ("https", "http") if settings.DEBUG else ("https",)
    return (
        parsed.scheme in schemes
        and bool(parsed.hostname)
        and not parsed.fragment
        and (query or not parsed.query)
    )


# --- provider documents -----------------------------------------------------------------------------------


def _host(url: str) -> str:
    return urlparse(url).hostname or "?"


def _quote(value: object, limit: int = 200) -> str:
    """Provider-supplied text for the log: one line, bounded."""
    return repr(value)[:limit]


def _fetch_json(method: str, url: str, *, code: str = UNAVAILABLE, **kwargs: Any) -> dict:
    """A JSON object from the provider, or `OidcError`: `code` when it answers with an error, UNAVAILABLE
    when it can't be reached. No redirects, nothing read past the size cap or the deadline."""
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT, **kwargs.pop("headers", {})}
    deadline = time.monotonic() + MAX_SECONDS
    try:
        response = requests.request(
            method,
            url,
            headers=headers,
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            allow_redirects=False,
            stream=True,
            **kwargs,
        )
    except requests.RequestException as exc:
        # Not chained: a requests error repeats the URL and the request.
        raise OidcError(UNAVAILABLE, f"{method} {_host(url)} failed: {exc.__class__.__name__}") from None
    with response:
        body = bytearray()
        try:
            for chunk in response.iter_content(16 * 1024):
                body += chunk
                if len(body) > MAX_DOCUMENT_BYTES:
                    raise OidcError(UNAVAILABLE, f"{_host(url)} answered over {MAX_DOCUMENT_BYTES} bytes.")
                if time.monotonic() > deadline:
                    raise OidcError(UNAVAILABLE, f"{_host(url)} took over {MAX_SECONDS} s to answer.")
        except requests.RequestException as exc:
            raise OidcError(UNAVAILABLE, f"Reading {_host(url)} failed: {exc.__class__.__name__}") from None
        status = response.status_code
    try:
        data = json.loads(body)
    except ValueError:
        data = None
    if status != 200 or not isinstance(data, dict):
        detail = ""
        if isinstance(data, dict) and "error" in data:
            detail = f": error={_quote(data['error'])} {_quote(data.get('error_description', ''))}"
        raise OidcError(code, f"{method} {_host(url)} answered HTTP {status}{detail}")
    return data


def _cache_key(kind: str, url: str) -> str:
    return f"oidc:{kind}:{hashlib.sha256(url.encode()).hexdigest()}"


def provider_metadata() -> dict:
    """The issuer's discovery document, checked and cached."""
    configured = settings.OIDC_ISSUER
    key = _cache_key("metadata", configured)
    metadata = cache.get(key)
    if metadata is not None:
        return metadata
    metadata = _fetch_json("GET", configured.rstrip("/") + "/.well-known/openid-configuration")
    issuer = metadata.get("issuer")
    # Tokens must carry the document's issuer exactly. A trailing slash is the only difference tolerated
    # between it and the setting.
    if not isinstance(issuer, str) or issuer.rstrip("/") != configured.rstrip("/"):
        raise OidcError(UNAVAILABLE, f"Discovery names issuer {_quote(issuer)}, not {configured!r}.")
    for name in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
        if not _allowed_url(metadata.get(name), query=True):
            raise OidcError(UNAVAILABLE, f"Discovery has no usable {name}.")
    if not _allowed_url(metadata.get("userinfo_endpoint"), query=True):
        metadata.pop("userinfo_endpoint", None)
    cache.set(key, metadata, METADATA_CACHE_SECONDS)
    return metadata


def _listed(metadata: dict, name: str) -> list | None:
    """A list-valued metadata entry, or None when it is missing (or not a list)."""
    value = metadata.get(name)
    return value if isinstance(value, list) else None


def _jwks(url: str, *, refresh: bool = False) -> list[dict]:
    key = _cache_key("jwks", url)
    keys = None if refresh else cache.get(key)
    if keys is None:
        listed = _fetch_json("GET", url).get("keys")
        keys = [k for k in listed if isinstance(k, dict)] if isinstance(listed, list) else []
        cache.set(key, keys, METADATA_CACHE_SECONDS)
    return keys


def _signing_key(metadata: dict, kid: str | None, alg: str) -> Any:
    url = metadata["jwks_uri"]
    candidates = _candidates(_jwks(url), kid, alg)
    # A key we haven't seen means the provider rotated its keys: fetch them again (but not on every token).
    if not candidates and cache.add(_cache_key("jwks-refresh", url), 1, JWKS_REFRESH_SECONDS):
        candidates = _candidates(_jwks(url, refresh=True), kid, alg)
    if len(candidates) != 1:
        raise OidcError(FAILED, f"No single {alg} key for kid={_quote(kid)} ({len(candidates)} found).")
    try:
        return jwt.PyJWK(candidates[0], algorithm=alg).key
    except (jwt.PyJWTError, ValueError, TypeError, KeyError) as exc:  # whatever the provider published
        raise OidcError(FAILED, f"Unusable key kid={_quote(kid)}: {exc.__class__.__name__}") from None


def _candidates(keys: list[dict], kid: str | None, alg: str) -> list[dict]:
    """Public keys from the set that may have signed with `alg` (and, when the token names one, `kid`)."""
    return [
        k
        for k in keys
        if k.get("kty") == KEY_TYPES[alg]
        and "d" not in k  # a private key has no business in a key set (and doesn't verify in PyJWT)
        and k.get("use", "sig") == "sig"
        and k.get("alg", alg) == alg
        and (kid is None or k.get("kid") == kid)
    ]


# --- the flow ---------------------------------------------------------------------------------------------


def _fresh(flow: object) -> bool:
    return isinstance(flow, dict) and time.time() - float(flow.get("at", 0)) < FLOW_MAX_AGE_SECONDS


def _flows(session) -> dict:
    flows = session.get(SESSION_KEY)
    return {s: f for s, f in flows.items() if _fresh(f)} if isinstance(flows, dict) else {}


def begin(session, *, next_path: str, mode: str, user_id: str | None = None) -> str:
    """Start a sign-in (`mode="login"`) or connect one to `user_id` (`"connect"`); returns the URL to send the
    browser to. `next_path` must already be a safe in-app path."""
    metadata = provider_metadata()
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    flows = _flows(session)
    flows[state] = {
        "nonce": nonce,
        "verifier": verifier,
        "next": next_path,
        "mode": mode,
        "user": user_id,
        "at": time.time(),
    }
    session[SESSION_KEY] = dict(sorted(flows.items(), key=lambda item: item[1]["at"])[-MAX_PENDING_FLOWS:])
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.OIDC_CLIENT_ID,
            "redirect_uri": redirect_uri(),
            "scope": settings.OIDC_SCOPES,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
    )
    endpoint = metadata["authorization_endpoint"]
    return f"{endpoint}{'&' if '?' in endpoint else '?'}{query}"


def take_flow(session, state: object) -> dict | None:
    """The flow `state` started, taken out of the session (single use). None when unknown or too old."""
    flows = _flows(session)
    flow = flows.pop(state, None) if isinstance(state, str) else None
    session[SESSION_KEY] = flows
    return flow


def complete(flow: dict, *, code: str, iss: str | None) -> OidcClaims:
    """Redeem `code` and return who signed in. `iss` is the callback's `iss` parameter (RFC 9207), if any."""
    metadata = provider_metadata()
    issuer = metadata["issuer"]
    if iss is not None and iss != issuer:
        raise OidcError(FAILED, f"The callback came from issuer {_quote(iss)}, not {issuer!r}.")
    if iss is None and metadata.get("authorization_response_iss_parameter_supported") is True:
        raise OidcError(FAILED, "The callback has no iss parameter although the provider sends it.")
    tokens = _redeem(metadata, code, flow["verifier"])
    id_token = tokens.get("id_token")
    if not isinstance(id_token, str):
        raise OidcError(FAILED, "The token response has no ID token.")
    claims = verify_id_token(id_token, metadata, flow["nonce"])
    access_token = tokens.get("access_token")
    if not claims.get("email") and "userinfo_endpoint" in metadata and isinstance(access_token, str):
        info = _userinfo(metadata["userinfo_endpoint"], access_token, claims["sub"])
        claims = {**claims, **{k: v for k, v in info.items() if not claims.get(k)}}
    return _to_claims(issuer, claims)


def _redeem(metadata: dict, code: str, verifier: str) -> dict:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri(),
        "code_verifier": verifier,
    }
    methods = _listed(metadata, "token_endpoint_auth_methods_supported") or ["client_secret_basic"]
    auth = None
    if "client_secret_basic" in methods:
        # RFC 6749 2.3.1: both halves are form-encoded before they go into the Basic header.
        auth = (quote_plus(settings.OIDC_CLIENT_ID), quote_plus(settings.OIDC_CLIENT_SECRET))
    elif "client_secret_post" in methods:
        data |= {"client_id": settings.OIDC_CLIENT_ID, "client_secret": settings.OIDC_CLIENT_SECRET}
    else:
        raise OidcError(UNAVAILABLE, f"The token endpoint takes none of our client auth methods: {methods}")
    return _fetch_json("POST", metadata["token_endpoint"], code=FAILED, data=data, auth=auth)


def verify_id_token(token: str, metadata: dict, nonce: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise OidcError(FAILED, f"Malformed ID token: {exc}") from None
    alg = header.get("alg")
    supported = _listed(metadata, "id_token_signing_alg_values_supported")
    if not isinstance(alg, str) or alg not in KEY_TYPES or (supported is not None and alg not in supported):
        raise OidcError(FAILED, f"ID token signed with {_quote(alg)}, which is not accepted.")
    kid = header.get("kid")
    key = _signing_key(metadata, kid if isinstance(kid, str) else None, alg)
    client_id = settings.OIDC_CLIENT_ID
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience=client_id,
            issuer=metadata["issuer"],
            leeway=CLOCK_SKEW_SECONDS,
            options={"require": ["iss", "sub", "aud", "exp", "iat"]},
        )
    except jwt.PyJWTError as exc:
        raise OidcError(FAILED, f"ID token rejected: {exc}") from None
    if not isinstance(claims.get("nonce"), str) or not secrets.compare_digest(claims["nonce"], nonce):
        raise OidcError(FAILED, "ID token nonce does not match.")
    # OIDC Core 3.1.3.7: several audiences need an azp, and an azp must be us.
    audiences = claims["aud"] if isinstance(claims["aud"], list) else [claims["aud"]]
    if ("azp" in claims or len(audiences) > 1) and claims.get("azp") != client_id:
        raise OidcError(FAILED, "ID token was issued to another client (azp).")
    sub = claims.get("sub")
    if not isinstance(sub, str) or not 0 < len(sub) <= 255:
        raise OidcError(FAILED, "ID token has no usable sub.")
    return claims


def _userinfo(url: str, access_token: str, sub: str) -> dict:
    info = _fetch_json("GET", url, code=FAILED, headers={"Authorization": f"Bearer {access_token}"})
    if info.get("sub") != sub:  # OIDC Core 5.3.2: anything else may be someone else's
        raise OidcError(FAILED, "Userinfo belongs to another subject.")
    return {k: info[k] for k in ("email", "email_verified", "name", "preferred_username") if k in info}


def _to_claims(issuer: str, claims: dict) -> OidcClaims:
    email = claims.get("email")
    email = email.strip().lower() if isinstance(email, str) else ""
    try:
        validate_email(email)
    except ValidationError:
        email = ""
    names = (claims.get("name"), claims.get("preferred_username"))
    return OidcClaims(
        issuer=issuer,
        subject=claims["sub"],
        email=email if len(email) <= MAX_EMAIL_LENGTH else "",
        email_verified=claims.get("email_verified") in (True, "true"),
        name=next((n for n in names if isinstance(n, str) and n.strip()), ""),
    )
