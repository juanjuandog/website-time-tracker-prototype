# OrbitLog

Local-first time tracking for the websites and apps you actually use.

OrbitLog is a macOS time journal that watches your active browser tab or frontmost app, turns it into daily / weekly / monthly summaries, and keeps everything on your own machine. It is built for people who want a readable record of where their time went without sending browsing data to a third-party service.

> Status: beta. Useful for technical users on macOS, still being polished for a wider release.

## Preview

Screenshots are coming next. Recommended files:

| View | Path |
| --- | --- |
| Dashboard | `docs/screenshots/dashboard.png` |
| Category prompt | `docs/screenshots/category-prompt.png` |
| Markdown report | `docs/screenshots/markdown-report.png` |

## Highlights

- **Local-first by default**: activity is stored in a local SQLite database under `data/activity.sqlite`.
- **Website and app tracking**: supported browsers include Safari, Chrome, Edge, Brave, Arc, and Chromium.
- **Readable reports**: export Markdown reports with daily, weekly, and monthly summaries.
- **Manual category rules**: classify unknown websites or apps into learning, entertainment, social, or other.
- **Desktop companion prompt**: a lightweight always-on-top classification window works outside the dashboard.
- **Warm dashboard UI**: browse time by day, week, month, website, page, and category.

## How It Works

OrbitLog runs a small local Node.js service. On macOS, it uses AppleScript to read the frontmost app and, for supported browsers, the current tab URL and title. The dashboard remains a normal local webpage at `localhost`, while the optional Tauri companion handles desktop-level prompts.

```text
macOS active app / browser tab
        ↓
Node.js local service
        ↓
SQLite activity store
        ↓
Web dashboard + Markdown export
```

## Quick Start

Requirements:

- macOS
- Node.js
- Rust toolchain, only needed for the Tauri companion or desktop build

Install dependencies:

```bash
npm install
```

Start the local dashboard:

```bash
npm start
```

Open the printed local URL, usually:

```text
http://localhost:4174
```

Start the desktop classification companion:

```bash
npm run companion
```

## Build Desktop App

Development mode:

```bash
npm run desktop
```

Production build:

```bash
npm run desktop:build
```

Typical macOS outputs:

```text
src-tauri/target/release/bundle/macos/OrbitLog.app
src-tauri/target/release/bundle/dmg/OrbitLog_0.1.0_aarch64.dmg
```

## macOS Permissions

OrbitLog needs macOS permission to inspect the current foreground app and browser tab.

If the dashboard shows a read error, open:

```text
System Settings > Privacy & Security
```

Then grant the terminal or app you use to run OrbitLog:

- Accessibility
- Automation

## Supported Browsers

Current URL detection works for:

- Safari
- Google Chrome
- Microsoft Edge
- Brave Browser
- Arc
- Chromium

Firefox needs an extension or another integration path and is not supported yet for precise URL detection.

## Privacy

OrbitLog is designed as a local-first tool:

- No account is required.
- No cloud service is used.
- No browsing data is uploaded by the app.
- Activity data is stored locally in SQLite.
- Ignore rules can skip sensitive domains such as banking, email, and password-related sites.

See [Privacy](docs/PRIVACY.md) for more detail.

## Known Limitations

- macOS only for now.
- Browser URL reading depends on macOS Automation permission.
- Some full-screen apps or multi-monitor setups may affect where the companion prompt appears.
- Sleep, wake, and idle detection are handled defensively, but edge cases may still create small timing errors.
- Windows support would require a separate active-window and browser URL implementation.

## Roadmap

- Add polished screenshots and a short demo GIF.
- Package a signed macOS beta release.
- Improve first-run permission guidance.
- Add safer backup / reset tools for local data.
- Add optional browser extension support for Firefox and more reliable URL detection.
- Add Windows support through native foreground-window tracking.

## Development

Useful commands:

```bash
npm start
npm run companion
npm run desktop
npm run desktop:build
```

The main files are:

- `server.js`: local tracker service, SQLite storage, summaries, Markdown export.
- `public/`: web dashboard and companion prompt UI.
- `src-tauri/`: Tauri companion and desktop wrapper.

## License

MIT
