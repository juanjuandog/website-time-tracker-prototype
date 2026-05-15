# Contributing

Thanks for your interest in OrbitLog.

OrbitLog is still beta software, so the most useful contributions are:

- bug reports with macOS version and browser details
- permission / setup feedback
- browser compatibility notes
- screenshots or UX feedback
- small, focused fixes

## Development

Install dependencies:

```bash
npm install
```

Run the local dashboard:

```bash
npm start
```

Run the desktop companion:

```bash
npm run companion
```

Check the Tauri project:

```bash
cd src-tauri
cargo check
```

## Pull Requests

Please keep pull requests focused. A good PR usually changes one behavior or one part of the UI at a time.

Before opening a PR:

- run `node --check server.js`
- run `node --check public/app.js`
- run `cargo check` in `src-tauri`
- avoid committing local data under `data/`
- avoid committing build output under `src-tauri/target/`

## Privacy

Please do not include real browsing history, private URLs, access tokens, emails, or screenshots with sensitive information in issues or pull requests.
