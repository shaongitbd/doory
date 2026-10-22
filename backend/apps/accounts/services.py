"""Account operations that span more than one model field or request."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import IntegrityError, transaction

from apps.apitokens.services import revoke_all as revoke_all_tokens
from apps.core.exceptions import ApiError
from apps.core.images import process_image_upload, square_crop_webp
from apps.core.storage import delete_file_after_commit

from .google import GoogleIdentity
from .models import OidcIdentity, User
from .oidc import FAILED, OidcClaims, OidcError
from .serializers import clean_display_name

AVATAR_SIZE = 512
AVATAR_MAX_PIXELS = 16_000_000  # a 5 MB PNG can hold far more pixels than we want to decode


def build_avatar(upload, *, max_bytes: int) -> bytes:
    """Validate an uploaded image by decoding it, then return a centre-cropped 512 px square WebP."""
    processed = process_image_upload(upload, max_bytes=max_bytes, max_pixels=AVATAR_MAX_PIXELS)
    return square_crop_webp(processed.data, AVATAR_SIZE)


def replace_avatar(user: User, data: bytes | None) -> None:
    """Store `data` (WebP bytes) as the avatar, or clear it when `None`; the old file is removed."""
    storage = user.avatar.storage
    old_name = user.avatar.name
    if data is None:
        user.avatar = ""
    else:
        user.avatar.save(f"{uuid.uuid4().hex}.webp", ContentFile(data), save=False)
    new_name = user.avatar.name
    try:
        user.save(update_fields=["avatar", "updated_at"])
    except Exception:
        if new_name and new_name != old_name:
            storage.delete(new_name)
        raise
    if old_name != new_name:
        delete_file_after_commit(storage, old_name)


def sign_in_with_google(identity: GoogleIdentity) -> tuple[User, bool]:
    """Find, link or create the account for a verified Google identity. Returns `(user, created)`."""
    try:
        return _link_or_create(identity)
    except IntegrityError:  # two first sign-ins for the same account raced; the retry finds the winner
        return _link_or_create(identity)


@transaction.atomic
def _link_or_create(identity: GoogleIdentity) -> tuple[User, bool]:
    user = User.objects.select_for_update().filter(google_sub=identity.sub).first()
    if user is None:
        user = User.objects.select_for_update().filter(email__iexact=identity.email).first()
        if user is not None and user.google_sub and user.google_sub != identity.sub:
            raise ApiError(
                "google_account_mismatch", "This email address is already linked to another Google account."
            )
    if user is not None:
        if not user.is_active:
            raise ApiError("account_disabled", "This account has been disabled.")
        fields = ["updated_at"]
        if not user.google_sub:
            user.google_sub = identity.sub
            fields.append("google_sub")
        if not user.is_email_verified:
            # The email was never proven by whoever registered it, so a password set at that point may
            # belong to someone else. Google has now proven ownership: drop the password (and any OIDC
            # account connected meanwhile).
            fields += _forget_unproven_sign_ins(user)
        user.save(update_fields=fields)
        if "password" in fields:
            revoke_all_tokens(user)  # and so may any token made with it
        return user, False

    user = User.objects.create_user(
        identity.email,
        None,
        display_name=clean_display_name(identity.name)[:80],
        google_sub=identity.sub,
        is_email_verified=True,
    )
    return user, True


def _forget_unproven_sign_ins(user: User) -> list[str]:
    """Someone has just proven they own `user.email`, which nobody had before. Whatever let others in until
    now (a password, a connected OIDC account) may belong to whoever registered the address: drop it and mark
    the address verified. Returns the fields to save; the caller saves and revokes the API tokens."""
    user.set_unusable_password()
    user.is_email_verified = True
    user.oidc_identities.all().delete()
    return ["password", "is_email_verified"]


def sign_in_with_oidc(claims: OidcClaims) -> tuple[User, bool]:
    """Find, link or create the account for a verified OpenID Connect sign-in. Returns `(user, created)`.

    The identity is `(issuer, subject)`. An existing account with the same email is taken over only with
    `OIDC_TRUST_EMAIL`, when the provider has verified the address, and never for staff: everyone else
    connects their account from Settings, after confirming their password."""
    try:
        return _oidc_find_link_or_create(claims)
    except IntegrityError:  # two first sign-ins for the same identity raced; the retry finds the winner
        try:
            return _oidc_find_link_or_create(claims)
        except IntegrityError:  # raced again: the user starts over rather than seeing a server error
            raise OidcError(FAILED, "OIDC sign-in raced another one for the same account twice.") from None


@transaction.atomic
def _oidc_find_link_or_create(claims: OidcClaims) -> tuple[User, bool]:
    identity = (
        OidcIdentity.objects.select_for_update()
        .select_related("user")
        .filter(issuer=claims.issuer, subject=claims.subject)
        .first()
    )
    if identity is not None:
        if not identity.user.is_active:
            raise OidcError("account_disabled", "OIDC sign-in into a disabled account.")
        return identity.user, False
    if not claims.email:
        raise OidcError("oidc_no_email", "The provider sent no usable email address.")

    user = User.objects.select_for_update().filter(email__iexact=claims.email).first()
    if user is not None:
        if not settings.OIDC_TRUST_EMAIL or user.is_staff or user.is_superuser:
            raise OidcError("oidc_account_exists", "An account has this email; connect it from Settings.")
        if not claims.email_verified:
            raise OidcError("oidc_email_unverified", "The provider has not verified this email address.")
        if not user.is_active:
            raise OidcError("account_disabled", "OIDC sign-in into a disabled account.")
        fields = ["updated_at"]
        if not user.is_email_verified:
            fields += _forget_unproven_sign_ins(user)
        elif user.oidc_identities.filter(issuer=claims.issuer).exists():
            raise OidcError("oidc_account_mismatch", "Connected to another account at the provider.")
        user.save(update_fields=fields)
        if "password" in fields:
            revoke_all_tokens(user)
        OidcIdentity.objects.create(user=user, issuer=claims.issuer, subject=claims.subject)
        return user, False

    # The provider's word for the address counts only with OIDC_TRUST_EMAIL; otherwise the usual
    # verification email proves it.
    user = User.objects.create_user(
        claims.email,
        None,
        display_name=clean_display_name(claims.name)[:80],
        is_email_verified=claims.email_verified and settings.OIDC_TRUST_EMAIL,
    )
    OidcIdentity.objects.create(user=user, issuer=claims.issuer, subject=claims.subject)
    return user, True


def connect_oidc(user: User, claims: OidcClaims) -> None:
    """Let the OIDC account in `claims` sign in as `user`, who has just confirmed their password."""
    try:
        _connect_oidc(user, claims)
    except IntegrityError:
        # A connection made at the same moment: of this provider account, or of another one to `user`. Looking
        # again tells which (and is fine when it was the same connection, made twice).
        try:
            _connect_oidc(user, claims)
        except IntegrityError:
            raise OidcError("oidc_identity_in_use", "Connecting raced another connection twice.") from None


@transaction.atomic
def _connect_oidc(user: User, claims: OidcClaims) -> None:
    identity = OidcIdentity.objects.filter(issuer=claims.issuer, subject=claims.subject).first()
    if identity is not None:
        if identity.user_id != user.pk:
            raise OidcError("oidc_identity_in_use", "That provider account belongs to someone else.")
        return
    if user.oidc_identities.filter(issuer=claims.issuer).exists():
        raise OidcError("oidc_account_mismatch", "Connected to another account at the provider.")
    OidcIdentity.objects.create(user=user, issuer=claims.issuer, subject=claims.subject)


def disconnect_oidc(user: User) -> None:
    """Stop OIDC accounts from signing in as `user`; refused when that would leave them no way in."""
    if not user.has_usable_password() and not user.google_sub:
        raise ApiError("last_sign_in_method", "Set a password first, or you won't be able to sign in.")
    user.oidc_identities.all().delete()
