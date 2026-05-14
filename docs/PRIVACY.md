# Privacy

OrbitLog is built around a local-first privacy model.

## What Is Stored

OrbitLog stores activity records locally in SQLite:

```text
data/activity.sqlite
```

Records may include:

- app name
- website domain
- page title
- URL, depending on the selected record mode
- start and end time
- duration

Local settings are stored in:

```text
data/settings.json
```

## What Is Not Uploaded

OrbitLog does not upload activity data to a hosted service.

There is no account system, sync backend, telemetry endpoint, or analytics service in the app.

## Sensitive Sites

The default ignore list skips common sensitive patterns such as:

- `localhost`
- `127.0.0.1`
- `bank`
- `paypal`
- `stripe`
- `gmail`
- `mail`
- `password`
- `1password`
- `bitwarden`
- `lastpass`

You can adjust ignore rules in local settings.

## URL Detail

OrbitLog supports multiple record modes in local settings:

- full URL
- URL without query / hash
- domain only

For sharing screenshots or reports, domain-only mode is usually the safest choice.

## Permissions

On macOS, OrbitLog needs Accessibility and Automation permissions to read the active app and supported browser tabs. These permissions are used locally for tracking only.
