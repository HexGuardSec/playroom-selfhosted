# Changelog

All notable changes to Playroom are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Roadmap with target dates (`ROADMAP.md`).
- Privacy notice, legal notice, code of conduct, support guide and `CODEOWNERS`.
- Security policy: supported versions, response times, safe harbor.
- Contributing guide: rules for AI-assisted contributions and licensing of contributions.

## [2.0.1] - 2026-11-16

### Added
- **Online demo** on GitHub Pages, rebuilt every week: https://hexguardsec.github.io/playroom-selfhosted/
- Animated tour and screenshots in the README.
- Multi-arch Docker image (amd64, arm64) published to `ghcr.io/hexguardsec/playroom-selfhosted`.

### Fixed
- Xbox: PC games that the Xbox Game Bar records (Steam, Epic, Riot...) no longer show up as Xbox games. A title now needs a console play, Xbox achievements or Gamerscore.
- Xbox: OpenXBL answers wrapped in `content` are read correctly; an unexpected answer now shows an error instead of an empty library.
- PlayStation: the profile name and avatar fall back to the older profile service, and failures are logged.
- Small phones: the top bar no longer pushes the language picker off screen.
- Nintendo games in the demo now have their covers.

### Security
- API errors send fixed messages instead of exception text (CodeQL `js/xss-through-exception`).

## [2.0.0] - 2026-11-16

First public release.

### Added
- One owner account per installation: password sign-in, guided setup protected by a one-time code printed in the server logs.
- API keys, site name and visibility (public or private) managed from the new **Settings** page; the `.env` file is now optional.
- Private collections, and a key-protected dashboard widget endpoint.
- 15 interface languages, English by default.
- Manual Nintendo games from the website: add, edit, delete, with cover search.
- Hide games (duplicates, demos, software) and show them again from the **Hidden** tab.
- Automated tests (`npm test`) and repository checks (`npm run check`).

### Changed
- PS4 and PS5 trophy lists of the same game are merged into a single entry.
- A cover picked by hand also sets the game's time to beat.

### Security
- scrypt password hashing, `HttpOnly` / `SameSite=Strict` session cookies, brute-force lockout, CSRF protection.
- Strict Content Security Policy and security headers.
- API keys are kept out of URLs, logs and error messages.
- Hardened Docker container: non-root user, read-only file system, no capabilities.

### Removed
- `ADMIN_TOKEN`, replaced by the owner account.
