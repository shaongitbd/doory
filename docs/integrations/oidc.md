# Single sign-on (OpenID Connect)

## What it does

Adds a "Sign in with …" button for your own identity provider (Authentik, Keycloak, Zitadel, Authelia, Pocket
ID or any other OpenID Connect provider), so people use the same login as for your other apps. Email sign-in and
Google sign-in keep working next to it.

## Requirements

- An OpenID Connect provider reachable from the Doory API over HTTPS.
- `SITE_URL` set to Doory's public `https://` address: the provider sends people back to
  `SITE_URL/api/v1/auth/oidc/callback/`.

## Turn it on

1. At the provider, create a **confidential** client (one with a client secret) that uses the authorization code
   flow, and give it this redirect URI:

   ```text
   https://design.example.com/api/v1/auth/oidc/callback/
   ```

   The client must sign ID tokens with an asymmetric key (RS256, ES256, EdDSA…). Tokens signed with the client
   secret (HS256) are refused.

2. Set the provider's issuer URL, the client ID and the secret, then restart the services:

   ```ini
   OIDC_ISSUER=https://auth.example.com/application/o/doory/
   OIDC_CLIENT_ID=doory
   OIDC_CLIENT_SECRET=…
   OIDC_BUTTON_LABEL=Sign in with Authentik
   OIDC_BUTTON_ICON=authentik
   ```

   Doory reads the rest from `OIDC_ISSUER/.well-known/openid-configuration`. `OIDC_BUTTON_ICON` puts the
   provider's logo on the button: the name of an icon in
   [`frontend/src/assets/sso-icons/`](../../frontend/src/assets/sso-icons/) without `.svg`. Leave it out for a
   button without a logo.

### Authentik

1. **Applications → Providers → Create → OAuth2/OpenID Provider.** Client type *Confidential*; redirect URI
   *Strict* with the address above; under **Signing Key**, pick a certificate (for example the self-signed one
   Authentik ships). Without a signing key Authentik signs with HS256, which Doory refuses.
2. **Applications → Applications → Create**, slug `doory`, with that provider. Bind the users or groups who may
   use Doory.
3. The issuer is `https://<authentik>/application/o/doory/`, and `OIDC_BUTTON_ICON=authentik`.

Authentik's default `email` scope says `email_verified: false`. To have Doory take the address as verified
(see `OIDC_TRUST_EMAIL` below), create a scope mapping for `email` that returns
`{"email": request.user.email, "email_verified": True}` and select it instead of the default one.

### Keycloak

Create an *OpenID Connect* client with **Client authentication** on and **Standard flow** on, and add the redirect
URI. The issuer is `https://<keycloak>/realms/<realm>`, and `OIDC_BUTTON_ICON=keycloak`.

## Who gets in

- Someone signing in for the first time gets a new account with the address the provider sends. The provider
  must send an email address, in the ID token or from its userinfo endpoint. The new account gets the usual
  verification email, unless `OIDC_TRUST_EMAIL=true` and the provider says it has verified the address.
- People are recognised by the provider's issuer and subject (`sub`), so changing the address at the provider
  doesn't create a second account.
- If an account with that address already exists, the first sign-in is refused, and its owner connects it
  instead: **Settings → Single sign-on → Connect…**, confirm the password, sign in at the provider. With
  `OIDC_TRUST_EMAIL=true` the sign-in uses the existing account directly, but only when the provider says it has
  verified the address, and never for staff accounts.
- The same section disconnects it, as long as the account keeps another way in (a password or Google). A
  password reset disconnects it too, like it replaces the old password: its owner connects it again from
  Settings.
- Who may sign up at all is decided by the provider: bind the application to the users or groups you want.

## Settings

See [OpenID Connect sign-in in configuration.md](../self-hosting/configuration.md#openid-connect-sign-in).

## Check it works

```bash
docker compose exec api python manage.py check
```

prints nothing about OIDC. Open the sign-in page: the button appears, and signing in with it works.

## Troubleshooting

- **No button:** a setting is missing or wrong. `manage.py check` names it (`accounts.W001`); OIDC sign-in stays
  off until it is fixed.
- **"Couldn’t reach the sign-in provider":** the API can't fetch the issuer's discovery document or keys. Check that
  `OIDC_ISSUER` is exactly the issuer the provider announces, and that the API can reach it. A provider on a
  private network is fine, but Doory never fetches from link-local or cloud metadata addresses: the log then says
  the host `resolves to an address that is not allowed`.
- **"Signing in didn’t go through":** look for `OIDC callback failed` in the API log, which gives the reason
  (for example `OIDC callback failed (oidc_failed): ID token signed with 'HS256'…`). The page never shows the
  provider's own error text.
- **"Redirect URI mismatch" at the provider:** the redirect URI registered there doesn't match `SITE_URL` exactly.
- **Every sign-in ends with "start again":** the browser opened Doory at another address than `SITE_URL` (for
  example `www.` or a different port), so the session cookie doesn't come back with the provider's answer.
