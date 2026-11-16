# Contributing to Playroom

Thanks for your interest! Bug reports, translations and pull requests are all welcome.

## Before you start

- **Bugs and ideas**: open an issue first, with the bug report or feature request template.
- **Security issues**: do not open a public issue. Follow [SECURITY.md](SECURITY.md).
- **Large changes**: open an issue to discuss them before writing the code, so your work is not wasted.

## Local setup

You only need Node.js 20 or newer. There is nothing to install.

```bash
git clone https://github.com/HexGuardSec/playroom-selfhosted.git
cd playroom-selfhosted
DEMO=true node server.js     # fake collection, no account needed
# or
node server.js               # real setup flow; the setup code is printed in the terminal
```

Use `DATA_DIR=/tmp/playroom-dev` to keep test data out of the project folder.

## Before opening a pull request

```bash
npm run check   # syntax, translations complete in every language, no secrets
npm test        # unit tests and tests against a real server
```

Both must pass: the CI runs them on every pull request.

## Ground rules

- **No runtime dependencies.** Playroom relies only on the Node.js standard library and plain browser JavaScript. If you really need a package, explain why in the issue first.
- **Security first.**
  - Never log or return an API key or a session token.
  - Validate every input on the server.
  - Escape every value inserted into HTML with `esc()`.
  - Any endpoint that changes something must go through `requireOwner()`.
- **Keep it small and readable.** Match the existing style: ES modules, 2 spaces, single quotes, comments explaining *why* rather than *what*.
- **Comments and server messages are written in English.** Text shown to users goes through the translation files.

## Adding or fixing a translation

User-facing texts live in:

- `public/i18n.js`: English (the reference) and French;
- `public/lang/<code>.js`: every other language.

To add a language:

1. Copy an existing file, for example `public/lang/es.js`, to `public/lang/<code>.js`. Use a BCP 47 code such as `sv` or `pt-PT`.
2. Translate every value. Keep the keys and the `{placeholders}` exactly as they are.
3. Add the language to the `LANGS` list at the top of `public/i18n.js`, with its name written in that language.
4. For a right-to-left language, also add its code to `RTL` in the same file.
5. Run `npm run check`: it lists any missing or unknown key.

Plurals use an object such as `{ one: '{n} game', other: '{n} games' }`. The forms follow [`Intl.PluralRules`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules) (`zero`, `one`, `two`, `few`, `many`, `other`).

## Adding a platform

Each platform is a module in `src/connectors/` that returns `{ profile, games }`. Each game must have a stable `id` (prefixed with the platform name), `platform`, `title`, `hours`, `lastPlayed` and `achievements` (or `null`). Look at `xbox.js` for a short example, then register the connector in `src/sync.js`, and in `src/presence.js` if it supports "now playing".

## Commit messages

Short, in English, in the imperative mood: `Fix PS5 playtime on games without trophies`.

## License

By contributing, you agree that your contributions are licensed under the [GNU AGPL v3.0](LICENSE), like the rest of the project.
