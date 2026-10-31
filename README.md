<!-- Copyright 2014 Signal Messenger, LLC -->
<!-- SPDX-License-Identifier: AGPL-3.0-only -->

# zesignal

A fork of [Signal Desktop](https://github.com/signalapp/Signal-Desktop) for the Ze family. It adds a
ZeChat side panel (ask about a conversation, get draft replies) and a local, read-only MCP server so an
agent like ZeChat can read and search your messages. It installs as a Zenie app.

Licensed AGPL-3.0, like upstream. This is not an official Signal build and is not supported by Signal.

## Branches

| Branch               | Content                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| `zesignal` (default) | upstream plus the fork commits; every fork commit subject starts with `zesignal:` |
| `main`               | a plain mirror of upstream `main`, updated by `utility/sync.sh`                   |

## What the fork adds

| File                                                    | What it does                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `app/mcp_server.main.ts`                                | MCP server (Streamable HTTP) in the main process                       |
| `zechat-panel/`                                         | the docked ZeChat panel: the ZeChat web client with a Signal plugin    |
| `app/zechat_link.main.ts`                               | hosts the panel beside Signal; its link to ZeChat and to Signal's data |
| `ts/zechat/ZeChatHost.preload.ts`                       | Signal's side: makes room, follows the open chat, inserts drafts       |
| `app/main.main.ts`                                      | starts the MCP server and the panel host (4 lines)                     |
| `ts/background.preload.ts`                              | mounts Signal's side (2 lines)                                         |
| `ts/components/conversation/ConversationHeader.dom.tsx` | the ZeChat button (10 lines)                                           |
| `utility/run.sh`                                        | build and run from source                                              |
| `utility/install.sh`                                    | package and install into `~/.local` (Zenie finds it there)             |
| `utility/sync.sh`                                       | rebase onto upstream, push, reinstall                                  |
| `zeapp.json`                                            | Zenie manifest                                                         |
| `README.md`                                             | this section, above upstream's README                                  |

### ZeChat panel

The **ZeChat** button in the conversation header (or **Ctrl+Alt+Z**) docks ZeChat on the right of
the window; the conversation narrows to make room.

- It is the ZeChat web client itself: same look, same renderer for markdown, code, formulas and
  diagrams, approvals, Stop, the panel's own past chats.
- Signal is a plugin of it (`zechat-panel/src/signal/`): a card over the composer shows the open
  conversation; with the **Chat** chip on, its last 20 messages go in front of your message. The
  agent can list, read and search your conversations and open one.
- It never sends. `draft_reply` shows a draft card; **Insert** puts it in Signal's composer, and
  you press Send there.
- It reaches ZeChat over its **local link** (`$XDG_RUNTIME_DIR/zechat/link.sock`), not a hub:
  nothing leaves the machine. ZeChat must be running (its window or `zechat serve`). What the
  link does not serve is absent here: Tasks, attachments, the full history (ZeChat's own window
  has the panel's chats too, under `zesignal@link`).
- **The client is proprietary and is not in this repository.** The AGPL code here is the Signal
  plugin, the local-link bridge and the build glue. `utility/run.sh` and `utility/install.sh` copy
  the client in from `../zechat-client` relative to the parent of this checkout's folder (or
  `ZECHAT_CLIENT_REPO`) on every build, so building the panel requires access to it. The copy
  (`zechat-panel/src/client/`, `panel.html`, `public/icons/`) is gitignored; never commit it.

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
a few lines of `app/main.main.ts`, `ts/background.preload.ts` and the conversation header, and
the top of this README.

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

---

_Upstream README follows._

# Signal Desktop

Signal Desktop links with Signal on [Android](https://github.com/signalapp/Signal-Android) or [iOS](https://github.com/signalapp/Signal-iOS) and lets you message from your Windows, macOS, and Linux computers.

[Install the production version](https://signal.org/download/) or help us out by [installing the beta version](https://support.signal.org/hc/articles/360007318471-Signal-Beta).

## Got a question?

You can find answers to a number of frequently asked questions on our [support site](https://support.signal.org/).
The [community forum](https://community.signalusers.org/) is another good place for questions.

## Found a Bug?

Please search for any [existing issues](https://github.com/signalapp/Signal-Desktop/issues) that describe your bug in order to avoid duplicate submissions.

## Have a feature request, question, comment?

Please use our community forum: https://community.signalusers.org/

## Contributing to the project

Please see [CONTRIBUTING.md](https://github.com/signalapp/Signal-Desktop/blob/main/CONTRIBUTING.md). There are lots of ways to contribute - many that don't involve code!

## Donate to Signal

You can donate to Signal from inside Signal apps (Desktop, Android, or iOS), or via the web here: [Signal Technology Foundation](https://signal.org/donate). Signal is an independent 501c3 nonprofit.

## Cryptography Notice

This distribution includes cryptographic software. The country in which you currently reside may have restrictions on the import, possession, use, and/or re-export to another country, of encryption software.
BEFORE using any encryption software, please check your country's laws, regulations and policies concerning the import, possession, or use, and re-export of encryption software, to see if this is permitted.
See <http://www.wassenaar.org/> for more information.

The U.S. Government Department of Commerce, Bureau of Industry and Security (BIS), has classified this software as Export Commodity Control Number (ECCN) 5D002.C.1, which includes information security software using or performing cryptographic functions with asymmetric algorithms.
The form and manner of this distribution makes it eligible for export under the License Exception ENC Technology Software Unrestricted (TSU) exception (see the BIS Export Administration Regulations, Section 740.13) for both object code and source code.

## License

Copyright 2013-2024 Signal Messenger, LLC

Licensed under the GNU AGPLv3: https://www.gnu.org/licenses/agpl-3.0.html
