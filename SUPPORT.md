# Getting help

1. **Read the README first**, especially the setup table for each platform and the troubleshooting notes.
2. **Check the server logs**: `docker compose logs -f playroom`. Most sync problems (a private Steam profile, an expired NPSSO token, a wrong IGDB key) are explained there.
3. **Search the existing issues**, open and closed.
4. **Ask on Discord**: the [Hex Ops server](https://discord.gg/xy9nYXxRvW) has a help channel, #entraide.
5. **Open an issue** with the bug report template. Say which version you run, how it is deployed, and paste the relevant log lines.

Before pasting anything, **remove your API keys, NPSSO token, cookies and any webhook URL**. Nobody from the project will ever ask you for them.

Security problems go through [SECURITY.md](SECURITY.md), never through a public issue.
