# IMDb ttFetch — Chrome Extension (Manifest V3)

![screenshot](https://raw.githubusercontent.com/JohnySir/IMDb-ttFetch/refs/heads/main/assets/screenshot.jpg)

> **Notice:** I created this extension for my own personal use and workflow, but made it open-source for anyone who might find it helpful!

**IMDb ttFetch** is a lightweight, zero-telemetry, privacy-first browser extension designed to instantly fetch and copy IMDb Title IDs (`tt1234567` or `1234567`), extract clean title metadata, and preview or jump to the Parents Guide / Content Advisory with zero friction.

---

## ✨ Features

- 🖱️ **Floating Action Buttons (Shadow DOM):** Injected directly on IMDb title pages:
  - **`★ Copy IMDb ID`**: One-click ID copy (`tt0111161` or `0111161`).
  - **`★ Copy Title`**: Clean title copy formatted as `Title Year` (e.g. `Inception 2010`) or `Just Title` (e.g. `Inception`).
  - **`★ Parents Guide`**: Direct navigation to `https://www.imdb.com/title/{imdb_id}/parentalguide/`. Automatically grayed out with a `not-allowed` indicator if no advisory exists (*"Add content advisory"*).
  - **`👁 Peek` (Sneak Peek Modal)**: Paired side-by-side with Parents Guide. Opens an animated popup showing content rating severity for all 5 categories with color-coded status bars.
- 🎨 **Visual Content Rating Indicators:**
  - 🟢 **Mild / None:** Green left accent bar (`#46d369`).
  - 🟡 **Moderate:** Gold/Yellow left accent bar (`#f5c518`).
  - 🔴 **Severe:** Red left accent bar (`#ff4d4f`).
- ⌨️ **Global Keyboard Shortcut:** `Ctrl+Shift+C` (`⌘+Shift+C` on macOS) copies the active tab's IMDb ID instantly from anywhere.
- 🖱️ **Right-Click Context Menu:** Right-click any IMDb page, link, or selected text → **Copy IMDb ID**.
- 🧩 **Action Popup:** Displays the active tab's resolved ID and title, instant copy buttons, and searchable recent copy history with relative timestamps.
- ⚙️ **Configurable Settings with Instant Reload:**
  - Choose `tt0111161` vs `0111161` ID format.
  - Choose `Title Year` vs `Just Title` title format.
  - Individually toggle any of the 5 Sneak Peek rating categories.
  - Independently toggle floating buttons or context menu.
  - Adjust toast duration and copy history size.
  - **Instant Reload:** Saving options immediately reloads the extension in the background.
- 🚀 **High Performance & Zero Build Step:** Multi-tier extraction with early-exit short-circuiting, $O(1)$ AST traversal, and event-driven SPA navigation handling.

---

## 📦 Installation (Developer Mode)

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the extension folder (`IMDb-ttFetch` or project root).
5. Visit any IMDb page (e.g., [`https://www.imdb.com/title/tt0111161/`](https://www.imdb.com/title/tt0111161/)) — the floating buttons will appear at the bottom-right!

---

## 🚀 Usage

| Action | How |
|---|---|
| **Copy IMDb ID** | Click the floating **`★ Copy IMDb ID`** button |
| **Copy Title** | Click the floating **`★ Copy Title`** button |
| **Open Parents Guide** | Click the floating **`★ Parents Guide`** button (auto-disabled if none exists) |
| **Sneak Peek Content Ratings** | Click the paired **`👁 Peek`** button |
| **Keyboard Shortcut** | Press `Ctrl+Shift+C` / `⌘+Shift+C` (remap at `chrome://extensions/shortcuts`) |
| **Copy from Link or Text** | Right-click any link or selected text → **Copy IMDb ID** |
| **Recent Copies History** | Click extension icon in toolbar → click any history item to re-copy |
| **Customize Preferences** | Right-click icon → **Options** (or open via popup footer) |

---

## 🛡️ Parents Guide & Sneak Peek Deep Dive

### 1. Direct Jump (`★ Parents Guide`)
- Scans the page metadata for advisory availability.
- If IMDb displays *"Add content advisory"*, the button is grayed out with a `cursor: not-allowed` indicator and tooltip.
- If available, clicking opens the title's official Parental Guide page.

### 2. Sneak Peek Modal (`👁 Peek`)
- **Zero-Latency In-Page Extraction:** If content ratings are present in the page's `__NEXT_DATA__` or DOM, the modal opens **instantly (0ms)** without network requests.
- **Background Fetch Relay:** If ratings aren't on the main page, the service worker fetches and caches the rating in memory while displaying a smooth loading spinner.
- **Category Filter Support:** In Options, each of the 5 categories can be individually enabled or disabled:
  - *Sex & Nudity*
  - *Violence & Gore*
  - *Profanity*
  - *Alcohol, Drugs & Smoking*
  - *Frightening & Intense Scenes*
- **Quick Dismissal:** Easily dismiss the popup by pressing `Escape` or clicking anywhere outside.

---

## ⚙️ Options & Settings

| Option Category | Setting | Description |
|---|---|---|
| **ID Format** | `tt`-prefixed / Digits-only | `tt0111161` vs `0111161` |
| **Title Format** | `Title Year` / `Just Title` | `Inception 2010` vs `Inception` |
| **Parents Guide & Sneak Peek** | Show Sneak Peek button | Toggle the paired `👁 Peek` button |
| | Category Toggles (5x) | Select which content rating categories to display |
| **Floating Buttons** | Copy ID / Copy Title / Parents Guide | Toggle each floating action button individually |
| **Context Menu** | Enable context menu | Toggle the right-click context menu item |
| **Toast & History** | Notification Duration | Toast display time (ms) |
| | History Size | Number of recent items retained in local storage |

---

## 🔒 Privacy & Permissions

- 🛡️ **Zero Telemetry:** No analytics, tracking, or remote tracking scripts.
- 🛡️ **Local Storage Only:** Copy history and user preferences are stored purely locally via `chrome.storage.local` and `chrome.storage.sync`.
- 🛡️ **Write-Only Clipboard:** Requests `clipboardWrite` only; never reads your clipboard.
- 🛡️ **Minimal Scope:** Restricted to `https://*.imdb.com/*` only (no broad `<all_urls>` permission).

| Permission | Purpose |
|---|---|
| `storage` | Stores user settings and local copy history |
| `contextMenus` | Registers the right-click "Copy IMDb ID" item |
| `clipboardWrite` | Writes copied IDs/titles to the system clipboard |
| `commands` | Listens for the `Ctrl+Shift+C` global keyboard shortcut |

---

## 📂 Project Structure

```
IMDb-ttFetch/
├── manifest.json              # Chrome MV3 manifest declaration & permissions
├── README.md                  # Public documentation & usage guide
├── LICENSE                    # MIT open-source license
├── plan.md                    # Technical architecture & design plan
├── memory.md                  # Detailed developer memory & specification
│
├── src/
│   ├── imdb-id.js             # Core extraction engine (Single Source of Truth)
│   ├── content.js             # Content script (Shadow DOM buttons & Peek modal)
│   ├── background.js          # Service worker (Context menu, shortcuts, history, fetch relay)
│   ├── popup.html             # Action popup UI markup
│   ├── popup.js               # Action popup logic & history manager
│   ├── popup.css              # Action popup styling
│   ├── options.html           # Settings page markup
│   ├── options.js             # Settings logic, validation, & auto-reload
│   └── options.css            # Settings page styling
│
├── icons/
│   ├── icon16.png             # 16x16 icon
│   ├── icon32.png             # 32x32 icon
│   ├── icon48.png             # 48x48 icon
│   └── icon128.png            # 128x128 icon
│
├── test/
│   └── id-lib.test.mjs        # Automated smoke test suite (82 passing assertions)
│
└── dist/
    └── imdb-ttfetch.zip       # Packaged release archive
```

---

## 🧪 Testing

Run the automated test suite natively using Node.js:

```bash
node test/id-lib.test.mjs
```

**Test Coverage:** 82 test assertions verifying URL parsing, Next.js GraphQL payload handling, DOM hero extraction, JSON-LD parsing, fallback title sanitization, Parents Guide availability detection, and multi-tier rating extraction.

---

## 📄 License

MIT License — free for personal and commercial use.