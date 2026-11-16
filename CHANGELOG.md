# Changelog

All notable changes to Playroom are listed here. Versions follow [Semantic Versioning](https://semver.org/).

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
