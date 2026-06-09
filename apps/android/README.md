# StudyPop Android

StudyPop Android is a native Kotlin and Jetpack Compose client for Android 8
(API 26) and newer. It uses the same production API, Firebase accounts, cloud
state, OpenAI features, themes, companions, and study rooms as StudyPop Web,
Electron, and iOS.

## Included features

- Email/password sign-up, login, password reset, logout, and account deletion.
- Secure Firebase session storage backed by Android Keystore.
- Cross-device state synchronization through the StudyPop API.
- Study, General, Math, History, Biology, Physics, Economics, Chemistry,
  Literature, and Government rooms.
- Follow-up conversations with the same chat context.
- Note summaries, key points, flashcards, and quizzes.
- Android photo picker and CameraX question capture.
- Native microphone recording and OpenAI transcription.
- Flashlight control on devices with a rear flash.
- Six themes and five selectable companion images.
- Local state persistence for signed-out use.

Media is sent directly to the StudyPop backend for the current request. The
Firebase project's Storage product currently requires a paid billing plan, so
the Android app does not depend on Firebase Storage.

## Build

Requirements:

- JDK 17
- Android SDK Platform 36
- Android SDK Build Tools 36.0.0

From this directory:

```powershell
.\gradlew.bat testDebugUnitTest assembleDebug
```

The debug APK is generated at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

GitHub Actions also builds and uploads `StudyPop-Android-debug-apk` on every
push to `main`.

## Production release

Create a private Android signing keystore and configure release signing outside
the repository before distributing an AAB through Google Play. Never commit a
keystore, its password, or service credentials.

The current companion images and names need documented commercial usage rights
or replacement with original StudyPop characters before public store release.
