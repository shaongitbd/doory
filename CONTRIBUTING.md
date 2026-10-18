# Contributing

Bug reports, ideas and pull requests are welcome. Open an [issue](https://github.com/shaongitbd/doory/issues) to
report a bug or suggest a feature. For a security problem, please report it privately through the repository's
**Security** tab instead.

## Pull requests

- Set up a development environment with [docs/development](docs/development/README.md).
- Run `make test` and `make lint` before you push. CI only runs when started by hand.
- Keep each pull request to one change, and link the issue it closes.
- Using an AI coding agent? [AGENTS.md](AGENTS.md) (also loaded through `CLAUDE.md`) gives it these rules.

## Documentation

Documentation lives in [`docs/`](docs/README.md) and changes in the same pull request as the code.

### When a change needs docs

| Your change | Update |
|-------------|--------|
| Adds, removes or renames a setting (environment variable) | A row in [`docs/self-hosting/configuration.md`](docs/self-hosting/configuration.md), and `.env.example` if admins are likely to set it |
| Adds an optional part that runs on your own server (a service, a browser, a worker) | A page in `docs/self-hosting/` |
| Adds an outside service that needs an account or a key | A page in `docs/integrations/`, or a new section in an existing page for another provider of the same thing |
| Adds a management command admins run, or content they install | [`docs/self-hosting/content.md`](docs/self-hosting/content.md), or the scheduled tasks in [`docs/self-hosting/README.md`](docs/self-hosting/README.md#scheduled-tasks) |
| Changes `docker-compose.yml`, `deploy/nginx.conf` or `deploy/*.service`, or needs a manual step on upgrade | A version note in [`docs/self-hosting/upgrading.md`](docs/self-hosting/upgrading.md#version-notes) |
| Changes the code layout or adds a backend app | [`docs/development/architecture.md`](docs/development/architecture.md) |
| Only changes the editor, with nothing for admins to do | No docs needed. Add it to the feature list in the README if it's a notable feature |

`make docs-check` (part of `make lint`) fails when a setting in the code, either `.env.example` or
`docker-compose.yml` is missing from `configuration.md`.

### Rules

1. **The folders are fixed.** `self-hosting/` is for what runs on your servers, `integrations/` for outside services,
   `development/` for working on the code. A new feature adds a file, not a folder.
2. **Name pages after what they do**, e.g. `stock-media.md`, never after a provider or an issue number.
3. **Each fact lives in one place.** Setting names and defaults are only in `configuration.md`; other pages link to
   it instead of repeating them.
4. **Don't rename or move published pages**, so links in issues and elsewhere keep working.
5. **Pages in `integrations/` and optional parts in `self-hosting/` share one layout:** What it does → Requirements →
   Turn it on → Settings → Check it works → Troubleshooting.
6. **Write for someone setting Doory up:** commands they can copy, the defaults, and how to check that it works.
   Name the services Doory works with where an admin needs to know them, but don't recommend one over another;
   use `example.com` addresses in examples.
