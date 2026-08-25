# IMDb ttFetch — Chrome Extension

![screenshot](https://raw.githubusercontent.com/JohnySir/IMDb-ttFetch/refs/heads/main/assets/screenshot.jpg)

> **Notice:** I created this extension for my own personal use and workflow, but made it open-source for anyone who might find it helpful!

Fetch and copy IMDb IDs (`tt…`, e.g. `tt0111161`) and clean title metadata from **any IMDb page** with one click, a keyboard shortcut, or the right-click context menu.

- 🖱️ **Floating buttons** — gold `★ Copy IMDb ID` and `★ Copy Title` buttons on every IMDb title page.
- ⌨️ **Keyboard shortcut** — `Ctrl+Shift+C` (`⌘+Shift+C` on macOS) fetches and copies the active tab's IMDb ID.
- 🖱️ **Context menu** — right-click a page, a selection, or a link → **Copy IMDb ID**.
- 🧩 **Popup** — see the current page's ID and title, copy them, and browse your recent copies.
- ⚙️ **Options** — choose `tt0111161` vs `0111161` ID format, `Title Year` vs `Just Title` format, toggle buttons / menu, adjust toast duration and history size.

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Visit `https://www.imdb.com/title/tt0111161/` and click the gold button — done!

## Usage

| Action | How |
|--------|-----|
| Copy current page ID | Click the floating **★ Copy IMDb ID** button |
| Copy title | Click the floating **★ Copy Title** button |
| Keyboard shortcut | `Ctrl+Shift+C` / `⌘+Shift+C` (remap at `chrome://extensions/shortcuts`) |
| Copy from selection / link | Right-click → **Copy IMDb ID** |
| Recent copies | Click the extension icon → click any history entry |
| Change format | Options → **ID format** / **Title format** (auto-reloads extension on Save) |

## How the ID is found

The extension extracts the IMDb title ID from the page's canonical URL, Open Graph
meta tags, the Next.js `__NEXT_DATA__` payload, the page title, and the URL — in
that priority order. It never reads any data you haven't voluntarily copied, and
it never sends anything to the network.

## Privacy

- ✅ No analytics, no tracking, no remote requests.
- ✅ Content scripts are isolated from IMDb's page scripts.
- ✅ Clipboard writes only, never clipboard reads.
- ✅ History is stored **locally** in `chrome.storage.local` and stores only the
  copied ID, page title, and timestamp. You can clear it from the popup.

## Permissions explained

| Permission | Reason |
|------------|--------|
| `storage` | your settings + copy history |
| `contextMenus` | the right-click menu item |
| `clipboardWrite` | writing the ID to the clipboard (never reading) |
| `commands` | the keyboard shortcut |

## Files

```
├── manifest.json       MV3 manifest
├── src/
│   ├── imdb-id.js      ID extraction library (single source of truth)
│   ├── content.js      floating button + toast + message handling
│   ├── background.js   service worker: menu, shortcut, history, clipboard
│   ├── popup.*         popup UI
│   └── options.*       options page
└── icons/              generated 16/48/128 icons
```

## Development

- No build step — load unpacked and edit.
- `node test/id-lib.test.mjs` runs the extraction-library smoke tests.
- `tools/make-icons.ps1` regenerates the icons (requires PowerShell + .NET).

## Web Store compliance notes

- Uses `host_permissions` for `imdb.com` only (no `<all_urls>`).
- Single purpose, minimal scope, no remote code. Category: Productivity.
