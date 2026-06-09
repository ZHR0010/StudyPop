# StudyPop Desktop

The desktop client is a secured Electron shell around the production StudyPop
web client. It uses the same Firebase accounts, `/api/v1` backend, OpenAI
features, and synchronized state as the web and iOS clients.

## Development

Install dependencies from the repository root, start the StudyPop server, then:

```powershell
$env:STUDYPOP_APP_URL="http://127.0.0.1:5173"
npm run desktop:dev
```

Without `STUDYPOP_APP_URL`, the desktop app loads the production StudyPop URL.

## Build

```powershell
npm run desktop:dist
```

Public installers must be code-signed. Configure the certificate through
electron-builder's supported environment variables in CI; never commit it.

