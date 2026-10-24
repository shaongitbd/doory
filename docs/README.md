# Doory documentation

These docs are for people who install, run or develop Doory. The editor's features are listed in the
[README](../README.md).

## I want to…

| …                                             | Read                                                         |
|-----------------------------------------------|--------------------------------------------------------------|
| Understand what runs where                    | [self-hosting/README.md](self-hosting/README.md)             |
| Install with Docker                           | [self-hosting/docker.md](self-hosting/docker.md)             |
| Install on a Linux server without Docker      | [self-hosting/manual.md](self-hosting/manual.md)             |
| Look up a setting                             | [self-hosting/configuration.md](self-hosting/configuration.md) |
| Add templates, fonts, icons, audio, sizes     | [self-hosting/content.md](self-hosting/content.md)           |
| Run live co-editing on several workers        | [self-hosting/realtime.md](self-hosting/realtime.md)         |
| Let AI assistants edit designs (MCP)          | [self-hosting/mcp.md](self-hosting/mcp.md)                   |
| Export images and PDFs on the server          | [self-hosting/image-export.md](self-hosting/image-export.md) |
| Remove backgrounds on a server                | [self-hosting/ai-providers.md](self-hosting/ai-providers.md) |
| Let people add video clips                    | [self-hosting/video.md](self-hosting/video.md)               |
| Make exported images smaller                  | [integrations/image-optimization.md](integrations/image-optimization.md) |
| Upgrade to a newer version                    | [self-hosting/upgrading.md](self-hosting/upgrading.md)       |
| Back up and restore                           | [self-hosting/backup.md](self-hosting/backup.md)             |
| Fix a problem                                 | [self-hosting/troubleshooting.md](self-hosting/troubleshooting.md) |
| Send email                                    | [integrations/email.md](integrations/email.md)               |
| Add "Sign in with Google"                     | [integrations/google-sign-in.md](integrations/google-sign-in.md) |
| Sign in with Authentik, Keycloak or other SSO | [integrations/oidc.md](integrations/oidc.md)                 |
| Store uploads in S3-compatible storage        | [integrations/object-storage.md](integrations/object-storage.md) |
| Turn on stock photo and video search          | [integrations/stock-media.md](integrations/stock-media.md)   |
| Set up a development environment             | [development/README.md](development/README.md)               |
| Find my way around the code                   | [development/architecture.md](development/architecture.md)   |
| Run the tests                                 | [development/testing.md](development/testing.md)             |

## How these docs are organised

- **`self-hosting/`** covers what runs on your own servers: the services, their settings, content, upgrades.
- **`integrations/`** covers outside services that need an account and a key.
- **`development/`** is for working on Doory's code.

When you add or change a feature, update the docs in the same pull request. The rules are in
[CONTRIBUTING.md](../CONTRIBUTING.md#documentation).
