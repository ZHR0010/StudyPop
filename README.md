# StudyPop

StudyPop is a playful AI study companion for asking questions, turning notes
into summaries and flashcards, and getting friendly subject-specific help on
the web, Windows desktop, and iPhone/iPad.

## Features

- General and subject-specific AI study rooms
- Image upload and camera capture
- Windows voice typing and audio transcription support
- Study summaries, flashcards, and mini quizzes
- Follow-up conversations
- Multiple companions and color themes
- Firebase accounts and cross-device saved study state
- Electron desktop application
- Native SwiftUI iOS application

## Run Locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Add your OpenAI API key to `.env`.
4. Start the app:

```powershell
npm start
```

5. Open `http://127.0.0.1:5173`.

The server automatically tries the next port if `5173` is already in use.

## Cross-Platform Apps

- Windows installer source: `apps/desktop`
- Native iOS source: `apps/ios`
- Shared API contract: `packages/contracts/openapi.yaml`
- Firebase security rules: `firebase`
- Full setup guide: `docs/CROSS_PLATFORM_SETUP.md`

## Private Files

The `.env` file, account data, server logs, and runtime files are excluded
from Git. Never commit an OpenAI API key or real user data.
