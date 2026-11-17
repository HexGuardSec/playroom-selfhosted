# Security policy

## Supported versions

| Version | Security fixes |
|---|---|
| 2.0.x (latest) | Yes |
| 1.x and older | No |

Only the latest release receives security fixes. Update with `docker compose pull && docker compose up -d`.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub instead: the repository's **Security** tab, then **Report a vulnerability**. Include:

- what an attacker can do, and under which conditions (signed in or not, local network or internet);
- the steps to reproduce, or a proof of concept;
- the Playroom version or commit, and how it is deployed (Docker, systemd, reverse proxy).

## What happens next

- **Within 7 days**: an acknowledgement and a first assessment.
- **Within 30 days** for a confirmed issue: a fix, or a plan with a date if it takes longer.
- A GitHub security advisory is published with the fixed release, and a CVE is requested when it is warranted.
- You are credited in the advisory and the changelog, unless you prefer to stay anonymous.

Please give us the time to release a fix before disclosing the issue publicly.

## Safe harbor

Research done in good faith on **your own installation** of Playroom is welcome, and will not lead to any complaint from the project. Do not test against other people's instances, the platforms' APIs (Steam, PlayStation, Xbox, IGDB) or the GitHub Pages demo infrastructure.

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
