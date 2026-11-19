# Privacy

Playroom is software you run on your own server. The project has no servers, no accounts and no analytics: the maintainers never receive your data.

## What your installation stores

Everything lives in the `data/` folder on your server:

- the owner account: user name, scrypt password hash, session hashes;
- the API keys and tokens you enter in **Settings** (Steam, OpenXBL, PlayStation NPSSO, IGDB);
- your game library, playtime, achievements and trophies, ratings, notes, hidden games and manual Nintendo games;
- the activity history built from each sync.

Nothing is sent anywhere else by Playroom itself. Back up and protect this folder: it contains secrets.

## Who your installation talks to

Your server contacts these services only to fetch **your own** data, with the keys you provided:

| Service | Why | Address |
|---|---|---|
| Steam (Valve) | library, playtime, achievements, covers | `api.steampowered.com`, `store.steampowered.com`, `steamcommunity.com`, Steam CDNs |
| PlayStation Network (Sony) | trophies and profile, through the NPSSO token | `ca.account.sony.com`, `m.np.playstation.com`, `us-prof.np.community.playstation.net` |
| OpenXBL | Xbox history and achievements | `xbl.io` |
| IGDB (Twitch) | covers and time to beat | `api.igdb.com`, `id.twitch.tv`, `images.igdb.com` |

Each of these services applies its own privacy policy to those requests.

## What visitors' browsers load

- Pages, scripts, styles and covers proxied by your server.
- Some covers directly from the Steam and IGDB image servers.
- Nothing else: since version 2.0.2 the fonts (Chakra Petch and Barlow, SIL Open Font License) are served by your own server. No request goes to Google or any font service.

Playroom sets a single cookie: the owner's `HttpOnly`, `SameSite=Strict` session cookie, only after sign-in. There are no tracking or advertising cookies, so no cookie banner is needed.

## Public collections

If you set your collection to **public** in Settings, anyone who can reach your server can see your games, playtime, achievements, ratings, notes and activity. API keys and tokens are never shown. Choose **private** if you do not want that.

## The online demo

The demo at `hexguardsec.github.io/playroom-selfhosted` is a static snapshot with a fake collection, hosted by GitHub Pages. GitHub may log visitors' IP addresses under the [GitHub privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement). The demo has no backend and collects nothing.

## You are the data controller

When you host Playroom for other people (family, friends), you are responsible for their data under the laws that apply to you, such as the GDPR. The project gives you the tools: private mode, export (planned for 2.1) and deletion of the `data/` folder.
