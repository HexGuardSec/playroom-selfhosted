# Security policy

## Supported versions

Only the latest release receives security fixes. Update with `git pull && docker compose up -d --build`.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub instead: the repository's **Security** tab, then **Report a vulnerability**. Include:

- what an attacker can do, and under which conditions (signed in or not, local network or internet);
- the steps to reproduce, or a proof of concept;
- the Playroom version or commit, and how it is deployed (Docker, systemd, reverse proxy).

You should get an answer within a week. Once a fix is released, you will be credited in the changelog unless you prefer to stay anonymous.

## Scope

In scope:
- authentication, sessions and the setup code;
- leaks of API keys or tokens;
- cross-site scripting, CSRF, path traversal;
- anything that lets a visitor change data or read a private collection.

Out of scope:
- vulnerabilities in the platforms' own APIs (Steam, PlayStation, Xbox, IGDB);
- denial of service that needs a large volume of traffic;
- findings that require root access to the server or to its `data/` folder.

## Hardening checklist for self-hosters

- Expose Playroom to the internet only behind a reverse proxy with HTTPS, with `TRUST_PROXY=true`.
- Use a long, unique password.
- Restrict access to the server and to backups of `data/`: it holds your API keys and session hashes.
- Keep Docker and the host system up to date.
