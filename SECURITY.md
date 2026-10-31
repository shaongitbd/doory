# Security policy

## Supported versions

The `main` branch receives security fixes. Tagged releases are fixed by a new release; only the latest tag is supported.

## Reporting a vulnerability

Report privately through GitHub: **Security** tab → **Report a vulnerability** (private advisory on this repository). Do not open a public issue, and do not include working exploits, user data or third-party credentials in a report.

A useful report states the affected version or commit, the deployment shape (Docker Compose, bare services, hosted at doory.art), what an attacker gains, and the steps to reproduce. A proof of concept against your own instance is welcome.

You will get an acknowledgement, an assessment of severity, and a note when a fix ships or when the report is declined as out of scope. Credit is given in the release notes unless you ask for none.

## Scope

In scope:

- The Django API (`backend/`), the real-time server, the MCP server and the export worker.
- The React frontend and the editor engine (`frontend/src/`).
- The container images and the deployment files in `docker-compose.yml` and `deploy/`.

Out of scope:

- Vulnerabilities in dependencies with no exploitable path in Doory: report those upstream. Dependency advisories are tracked and covered by `.github/workflows/security.yml`.
- Self-hosted instances with a default or short `DJANGO_SECRET_KEY`, with debug enabled in production, or with the admin exposed without protection. `backend/doory/settings/prod.py` refuses to start with a weak key on purpose.
- Denial of service through volume alone (bandwidth, request floods, storage exhaustion) with no amplification.
- Missing hardening headers on a reverse proxy you configured yourself. The reference configuration is `deploy/nginx.conf`.
- Social engineering, phishing pages impersonating Doory, and reports about the domain or the email setup. Those go to the maintainer directly, not through a code advisory.

## Self-hosting

Run the stack behind TLS, keep `DJANGO_DEBUG` off, set a long random `DJANGO_SECRET_KEY`, and do not publish the MCP or AI service ports beyond the reverse proxy. The MCP server authenticates with bearer tokens and is meant for agents, not for browsers on the open internet.
