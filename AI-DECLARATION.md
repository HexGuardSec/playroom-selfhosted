# AI declaration

Playroom was built with significant help from an AI assistant (Claude, by Anthropic).
This page says what the AI did and what a human did, so you can judge the project with the full picture.

## Who did what

| Area | AI involvement | Details |
|---|---|---|
| Design | Pair | The maintainer defined the features, the platforms, the look and the security requirements (one owner account, keys kept on the server, public or private collection). The AI proposed the architecture: Node.js without dependencies, file-based storage, the connectors and the API. |
| Implementation | Generated | Most of the code was written by the AI from the maintainer's requests, then run and checked on the maintainer's homelab. |
| Testing | Generated | The automated tests were written by the AI. The maintainer tests every release by hand on a real collection (Steam, PlayStation, Xbox, Nintendo). |
| Documentation | Generated | README, translations, changelog and comments were written by the AI and reviewed by the maintainer. |
| Review | Generated | Code and security reviews were done by the AI, with GitHub CodeQL running on every push. The maintainer decides what is fixed and tests the result. |
| Deployment | Generated | CI, Docker image, GitHub Pages demo and Dependabot settings were written by the AI. |

Levels:
**Hint** (AI suggests, human does), **Assisted** (AI does part, human does most),
**Pair** (about half and half), **Generated** (human asks, AI writes).

## What this means for you

- Every change is reviewed and tested by the maintainer before release, and the code is open: you can read all of it.
- Security matters to this project: if you find a problem, please report it privately (see [SECURITY.md](SECURITY.md)).
- Contributions written by hand are very welcome.
