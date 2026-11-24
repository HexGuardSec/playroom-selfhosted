# Roadmap

This is the plan for the next releases. Dates are targets, not promises: Playroom is a side project maintained in spare time. Ideas and votes are welcome in the issues, with the **feature request** template.

Each release is tracked by a GitHub milestone of the same name.

## 2.0.2 — privacy and housekeeping (released November 2026)

- **Self-host the fonts** (done). Chakra Petch and Barlow ship with Playroom, and the CSP no longer allows any font service.
- **Project policies**: privacy notice, legal notice, code of conduct, support guide (done in this release).
- **Repository protections** (done): no force push or deletion on `main`, protected release tags, secret scanning with push protection.

## 2.1 — notifications and data portability (mid-December 2026)

- **Notifications by webhook** (Discord, ntfy, Gotify or any URL): new trophy or achievement, platinum or 100 %, game finished, sync failure. Webhook URLs are stored like API keys: never logged, never returned by the API.
- **Export** the whole collection to JSON and CSV from the Settings page: your data must stay yours.
- **Backup and restore** of the `data/` folder from the Settings page, with a clear warning that the archive contains API keys.
- **Import from Playnite**: read the file produced by Playnite's library exporter (titles, platforms, playtime, completion status). Covers are fetched by Playroom from IGDB or Steam, never copied from Playnite. Playroom stays independent from Playnite.
- **RomM connector** ([#6](https://github.com/HexGuardSec/playroom-selfhosted/issues/6), requested by the community): enter your RomM URL and a read-only Client API Token in Settings, and Playroom syncs your RomM games and platforms with their covers, with a manual "Sync" button and a clear message when the connection fails. The token is stored like the other API keys. Aiming for 2.1; if it runs into problems, it ships in 2.2 at the latest.

## 2.2 — the collection itself (January 2027)

- **Game status**: playing, finished, 100 %, dropped, on hold, with the date it changed.
- **Physical copies**: box, cartridge or disc, edition, condition, where it is stored. Fits the "museum" idea.
- **Wishlist** and a "next up" list for the backlog.
- **Year in review** page: hours played, games finished, most played platform, best month.
- Better search and filters (platform, status, rating, time to beat).

## 2.3 — more platforms (February 2027)

- **RetroAchievements**, through its official public API.
- **GOG and Epic Games**, through the Playnite import or by hand, since they have no public library API.
- **Steam Deck and emulators**: playtime entered by hand or imported.

## 3.0 — sharing and single sign-on (spring 2027)

- **Several profiles** on one installation (family, roommates), each with its own collection and visibility.
- **Single sign-on with OpenID Connect** (Authelia, Authentik, Keycloak), as an option next to the password.
- **Public share pages** for one game or one list, with an image preview for social networks.
- A documented, versioned **read-only API**.

## All the time

- Security fixes come first and can ship in any patch release (see [SECURITY.md](SECURITY.md)).
- Dependabot updates for GitHub Actions and the Docker base image, reviewed every week.
- CodeQL and the test suite run on every pull request.
- Translations: corrections from native speakers are always welcome.

## Out of scope

- **No piracy features**: no ROM or ISO downloads, no links to them, no DRM circumvention.
- **No scraping behind sign-ins** that the platforms forbid, beyond the APIs already used and documented in [LEGAL.md](LEGAL.md).
- **No telemetry or analytics.** Playroom never phones home.
