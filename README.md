# Kick + Twitch Chat

[github.com/abilliontokens/kick-twitch-chat](https://github.com/abilliontokens/kick-twitch-chat)

A Chrome extension that merges a streamer's **Twitch** chat into their **Kick** chat in one
live scrolling list. Kick messages carry a Kick-green tint, a green source bar and the Kick
logo in the gutter; Twitch messages carry a purple tint and the Twitch glyph, and keep their
Twitch colors, badges and emotes. Both feeds stay live; Kick's own input, emote picker and
moderation stay untouched.

![merged chat](docs/screenshot.png)

## Download

- Releases: <https://github.com/abilliontokens/kick-twitch-chat/releases/latest>
- `kick-twitch-chat-1.0.0.zip` — clean package for the Chrome Web Store, or extract it and load unpacked.
- `kick-twitch-chat.crx` — self-signed CRX3 package (ID `fofamlemiddpagjngookpcokbdnokbcp`). Chrome stable blocks off-store CRX installs; use the ZIP/unpacked build unless your browser or enterprise policy allows CRX sideloading.

## Install

Chrome 137+ removed the `--load-extension` command-line switch, so load it from the UI:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. **Load unpacked** → select this folder (`D:\kick_twitch`).
4. Open any Kick channel (`https://kick.com/<channel>`) or the popout chat
   (`https://kick.com/popout/<channel>/chat`).

The merged pane mounts inside Kick's chat column. Click the gear in the pane bar for quick
display settings, or the toolbar icon for the full popup.

## Usage

- **Twitch channel**: defaults to the same name as the Kick channel. If the streamer uses a
  different Twitch name, set it in the popup (`Twitch channel for this Kick channel`) once per
  Kick channel. The mapping is stored in `chrome.storage.sync`.
- **Native** button (pane bar): temporarily shows Kick's original message list instead of the
  merged list. Click **Merged** to switch back.
- **Gear** (pane bar): toggles timestamps, badges, Twitch tint, Kick tint and the Kick icon.
- **Popup**: enable/disable on Kick, map the Twitch channel, and change the same display
  settings. Everything is saved to `chrome.storage.sync` and applied to open tabs live.

Settings:

| Setting | Effect |
| --- | --- |
| Enabled on Kick | Mounts/removes the merged pane. |
| Timestamps | Shows HH:MM before each message. |
| Badges | Master switch for all badges. |
| Kick badges | Hides only Kick level/identity icons, keeps Twitch badges. |
| Twitch tint | Purple background + left bar for Twitch messages. |
| Kick tint | Green background for Kick messages. |
| Color bar | Colored source bar at the far left of every message (purple for Twitch, green for Kick), independent of the tints. |
| Kick icon | Kick logo in the gutter of each Kick message. |

## How it works

- **Kick chat** is read directly from Kick's realtime gateway. Guest clients get a connection
  token from `web.kick.com/api/v1/realtime/connection`, a channel token from
  `/auth/channel` (empty for guests), and subscribe to `chatrooms.<chatId>.v2` over
  Centrifugo at `wss://realtime.*.platform.kick.com`. Recent history is seeded from
  `web.kick.com/api/v1/chat/<chatId>/history`. No account or cookies are required.
- **Twitch chat** uses anonymous read-only IRC over WebSocket
  (`wss://irc-ws.chat.twitch.tv:443`, `NICK justinfan…`) with the `tags` capability, which
  provides display names, colors, badges, emotes, replies and bits. No OAuth token.
- **7TV emotes** are resolved from the 7TV v3 API (global set + the Kick/Twitch channel set)
  because the 7TV browser extension cannot inject into our pane. Zero-width emotes are
  overlaid. Trimmed emote indexes are cached in `storage.local` for an hour.
- **Twitch badge images** come from Twitch's public GQL `badges` query (global sets) through
  the service worker and are cached for a day. Channel-specific subscriber/founder badges have
  per-channel artwork that needs OAuth, so they render as compact text pills (`SUB`, `GIFTER`,
  …).
- The pane is an overlay inside the messages container: Kick's list is a virtualized,
  absolutely-positioned stack and cannot be interleaved safely. Kick's list keeps running
  underneath; the **Native** button reveals it.

## Limitations

- Read-only. Twitch messages cannot be sent from here; type in Kick's own input for Kick chat.
- Replacing the native list means Kick's per-message hover actions (reply, mention, mod tools)
  are not available in the merged view; use **Native** for those.
- Anonymous Twitch IRC is a public read path Twitch may rate-limit or change; if it stops
  working, the pane bar turns red/connecting.
- Kick's realtime/chat endpoints are internal and may change. The pane reports connection
  failures instead of failing silently.
- 7TV personal emotes (account-only, no channel set) are not included.

## Permissions

- `storage` — settings and badge/emote caches.
- `https://gql.twitch.tv/*` — Twitch global badge metadata.
- `https://7tv.io/*` — 7TV emote sets (fetched by the service worker, trimmed and cached).
- Content script on `kick.com` — mounts the pane and reads Kick chat data.
- Runtime network: Twitch IRC WebSocket, Kick realtime WebSocket/API, Twitch/Kick/7TV CDNs.

## Development

The extension is plain MV3, no build step. `src/` holds the content scripts, `src/background.js`
the service worker, `popup/` the toolbar UI.

`tools/` contains the local verification harness used to test against a real Chrome:

```bash
bun tools/load_ext.js      # launch Chrome with --enable-unsafe-extension-debugging and load unpacked
bun tools/reload_ext.js    # uninstall + reload after code edits
bun tools/verify.js https://kick.com/popout/xqc/chat 45000
bun tools/verify_nav.js    # Native toggle + SPA navigation
bun tools/verify_settings.js
```

It talks CDP on port 9333 and writes screenshots/evidence into `research/`.
