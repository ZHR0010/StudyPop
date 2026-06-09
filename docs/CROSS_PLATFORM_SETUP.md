# StudyPop Cross-Platform Setup

## What is implemented

- Firebase Email/Password authentication shared by web, Electron, and iOS.
- Automatic Firebase ID-token refresh.
- Firestore-backed synchronized StudyPop state through `/api/v1/state`.
- Shared OpenAI answer, study-kit, and transcription routes.
- A secured Electron application and Windows NSIS installer.
- A native SwiftUI iPhone/iPad project with camera, photo picker, voice
  recording, flashlight, subject rooms, chat, study kits, themes, and
  companions.
- OpenAPI contract and automated web, Electron, and iOS CI jobs.

## Firebase console steps

1. Open the `studypop-3d58b` Firebase project.
2. Confirm Authentication > Sign-in method > Email/Password is enabled.
3. Create the Cloud Firestore database in production mode.
4. Create the Firebase Storage bucket.
5. Add these authorized domains:
   - `studypop-flame.vercel.app`
   - Any future custom StudyPop domain
6. Deploy the repository rules:

```powershell
firebase login
firebase use studypop-3d58b
firebase deploy --only firestore:rules,firestore:indexes,storage
```

The Firebase web configuration is public client configuration. Firebase
service-account credentials are private and must exist only in CI or backend
secret storage.

## Vercel environment

Set these variables for Production, Preview, and Development:

```text
OPENAI_API_KEY
OPENAI_MODEL=gpt-5.4-mini
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
```

Redeploy after changing environment variables. The OpenAI key must never be
placed in a web, Electron, or iOS source file.

## Web verification

```powershell
npm install
npm test
npm start
```

Open `http://127.0.0.1:5173`, create an account, ask a question, reload, and
confirm the account and study state return.

## Electron

Run against the local server:

```powershell
$env:STUDYPOP_APP_URL="http://127.0.0.1:5173"
npm run desktop:dev
```

Build the Windows installer:

```powershell
npm run desktop:dist
```

Output:

```text
apps/desktop/release/StudyPop-Setup-1.1.0.exe
```

The locally generated installer is unsigned. Public distribution requires a
Windows code-signing certificate configured as a CI secret.

## iOS

On macOS:

```bash
brew install xcodegen
cd apps/ios
xcodegen generate
open StudyPop.xcodeproj
```

Then:

1. Select the StudyPop target.
2. Choose an Apple Developer team.
3. Confirm the bundle identifier is available.
4. Build on an iOS 17 or newer simulator.
5. Test camera, microphone, and flashlight on a physical iPhone.
6. Archive and upload the beta to TestFlight.

## Production release gates

- Deploy Firestore and Storage rules.
- Run the macOS iOS CI job successfully.
- Test cross-device sync with one real Firebase test account.
- Test denied and restored camera/microphone permissions.
- Add Windows code signing.
- Add Apple signing and TestFlight metadata.
- Replace or license companion assets based on protected characters.
- Publish a privacy policy, support URL, and account-deletion process.

