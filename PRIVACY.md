# Privacy Policy

**Kick + Twitch Chat** (Chrome extension)

Last updated: October 25, 2026

Kick + Twitch Chat shows Kick and Twitch chat together in one feed on kick.com and twitch.tv. It does not collect, sell or share personal data. It has no developer-run server and no analytics.

## What is stored

The extension saves only these items in your browser:

- **Settings**, in `chrome.storage.sync`: the on/off switch, display options (timestamps, badges, tints, color bar, Kick icon) and any Kick/Twitch channel mappings you set. If Chrome Sync is turned on, Chrome syncs these settings between your signed-in browsers.
- **Caches of public data**, in `chrome.storage.local`: Twitch's global badge list (refreshed every 24 hours) and 7TV emote sets (refreshed every hour, at most 30 sets).

Chat messages are shown on the page and are never saved. Uninstalling the extension removes its stored data from your browser.

## Network requests

To show chat, the extension connects directly from your browser to these services:

| Service | Used for |
| --- | --- |
| kick.com, web.kick.com | Public channel info, live chat connection details, recent public chat history |
| Kick realtime servers, Pusher (`ws-*.pusher.com`) | Live Kick chat |
| irc-ws.chat.twitch.tv | Live Twitch chat, read-only with an anonymous guest login |
| gql.twitch.tv | Twitch's public global badge list |
| 7tv.io, cdn.7tv.app | 7TV emote sets and images |
| Kick and Twitch image servers | Emote and badge images |

These requests contain only what is needed to fetch public data, such as a channel name or ID. As with any web request, these services can see your IP address and browser information, and their own privacy policies apply.

On kick.com, the extension calls Kick's API from the page the same way the site does, so your browser may attach its existing Kick cookies to those requests. The extension never reads or stores those cookies.

## What the extension does not do

- It does not ask for or use any account, login or OAuth token.
- It does not send chat messages. You post in each site's own chat box.
- It does not track you, show ads or use analytics.
- It does not sell data, share it with third parties or use it for anything except showing chat.

## Changes

Changes to this policy will be published in this file with a new date.

## Contact

Open an issue at <https://github.com/abilliontokens/kick-twitch-chat/issues>.
