# zesignal

A fork of [Signal Desktop](https://github.com/signalapp/Signal-Desktop) for the Ze family. It adds a
local, read-only MCP server so an agent like ZeChat can read and search your messages. It installs as a
Zenie app.

Licensed AGPL-3.0, like upstream. This is not an official Signal build and is not supported by Signal.

## Branches

| Branch | Content |
|---|---|
| `zesignal` (default) | upstream plus the fork commits; every fork commit subject starts with `zesignal:` |
| `main` | a plain mirror of upstream `main`, updated by `utility/sync.sh` |

## What the fork adds

| File | What it does |
|---|---|
| `app/mcp_server.main.ts` | MCP server (Streamable HTTP) in the main process |
| `app/main.main.ts` | starts it once the database is open (2 lines) |
| `utility/run.sh` | build and run from source |
| `utility/install.sh` | package and install into `~/.local` (Zenie finds it there) |
| `utility/sync.sh` | rebase onto upstream, push, reinstall |
| `zeapp.json` | Zenie manifest |

### MCP server

- Off unless `ZESIGNAL_MCP=1`. The installed `zesignal` launcher sets it.
- Listens on `127.0.0.1:7643` only (`ZESIGNAL_MCP_PORT` to change).
- Requires the bearer token stored in `~/.config/Signal-zesignal/mcp.json` (mode 0600). Rejects
  requests that carry an `Origin` or an unexpected `Host` header, so web pages cannot reach it.
- Tools (all read-only): `list_conversations`, `read_messages` (page back with `beforeMessageId`),
  `search_messages`.

`utility/run.sh --config` prints the entry to add to `~/.zechat/mcp.json`.

## Requirements

- Linux (tested on Ubuntu with AppArmor), git, and [`n`](https://github.com/tj/n). The scripts fetch
  the exact Node and pnpm versions upstream pins, without changing your global Node.
- `sudo`, only once: Ubuntu blocks the user namespaces Chromium's sandbox needs, so the scripts
  install an AppArmor profile (`/etc/apparmor.d/zesignal-electron`) allowing them for this checkout's
  Electron and the installed build only. Do not run the scripts themselves with `sudo`.

## Install

```bash
git clone https://github.com/rzafiamy/zesignal.git && cd zesignal
git remote add upstream https://github.com/signalapp/Signal-Desktop.git
utility/install.sh
```

Start `zesignal` from the Zenie launcher or a terminal, link it to your phone with the QR code, then
run `utility/run.sh --config` and add the printed entry to ZeChat.

From Zenie, `scripts/build-apps.sh --only zesignal --force` runs the same installer.

Data lives in `~/.config/Signal-zesignal`, separate from an official Signal install.
`utility/install.sh --uninstall` removes the app and keeps the data.

## Resync with upstream and rebuild

Signal builds expire about 90 days after they are built, and old clients get cut off by the
servers, so resync at least monthly.

```bash
utility/sync.sh            # latest stable release tag (recommended)
utility/sync.sh --main     # upstream main (alpha)
utility/sync.sh --to v8.33.0
```

It fetches upstream, rebases the `zesignal:` commits onto the target, force-pushes `zesignal`
(with lease), mirrors upstream `main` to the fork's `main`, and reinstalls. The state before the
rebase is kept as the tag `zesignal-before-sync`.

On conflict the script stops. Resolve, then:

```bash
git add <files> && git rebase --continue
git push --force-with-lease origin zesignal && utility/install.sh
```

or `git rebase --abort` to go back. Conflicts are rare: apart from new files, the fork touches only
two lines of `app/main.main.ts`.

### Doing it by hand

```bash
git fetch --tags upstream
first=$(git log --reverse --format=%H --grep='^zesignal:' | head -1)
git rebase --onto v8.33.0 "$first^" zesignal
git push --force-with-lease origin zesignal
utility/install.sh
```

## Develop

```bash
utility/run.sh              # build and run from source, MCP on
utility/run.sh --no-build   # skip the build
```

Keep fork changes in new files where possible, and prefix every commit subject with `zesignal:`.
