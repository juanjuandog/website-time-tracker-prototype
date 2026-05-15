# Setup Guide

This guide is for technical macOS users who want to try OrbitLog from source.

## Requirements

- macOS
- Node.js
- npm
- Rust toolchain, required for the Tauri companion and desktop build

## 1. Install Dependencies

```bash
npm install
```

## 2. Start The Local Dashboard

```bash
npm start
```

Open the printed local URL, usually:

```text
http://localhost:4174
```

## 3. Grant macOS Permissions

OrbitLog needs permission to read the foreground app and supported browser tabs.

Open:

```text
System Settings > Privacy & Security
```

Grant the terminal or app running OrbitLog:

- Accessibility
- Automation

If the dashboard shows a read error, quit and restart the local service after granting permissions.

## 4. Start The Desktop Companion

The companion is a lightweight desktop process for unknown website / app category prompts.

```bash
npm run companion
```

The dashboard still runs in your browser. The companion only shows the small category prompt when needed.

## 5. Build A macOS App

```bash
npm run desktop:build
```

Common outputs:

```text
src-tauri/target/release/bundle/macos/OrbitLog.app
src-tauri/target/release/bundle/dmg/OrbitLog_0.1.0_aarch64.dmg
```

## Troubleshooting

### The dashboard cannot read my current page

Check macOS Accessibility and Automation permissions. Also make sure you are using a supported browser.

### The companion prompt does not show

The prompt only appears when the current website or app has no category rule yet.

### Firefox URL is not detected

Firefox is not supported for precise URL detection yet. It will need a browser extension or another integration path.

### Timing looks wrong after sleep

OrbitLog has idle and sleep gap protection, but edge cases can still happen. Please open an issue with your macOS version and what happened.
