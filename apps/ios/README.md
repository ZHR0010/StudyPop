# StudyPop iOS

Native SwiftUI client for iPhone and iPad. It uses the same Firebase accounts,
versioned StudyPop API, OpenAI features, and synchronized state as web and
Electron.

## Requirements

- macOS with the current supported Xcode.
- XcodeGen (`brew install xcodegen`).
- An Apple Developer team for device builds and distribution.
- Firebase Email/Password Authentication enabled for the shared project.
- Firestore and Storage rules deployed from the repository root.

## Generate and run

```bash
cd apps/ios
xcodegen generate
open StudyPop.xcodeproj
```

Select an Apple Development team in Signing & Capabilities, then run on an
iOS 17 or newer simulator. Camera, microphone, and flashlight tests must also
be run on a physical device.

## Release gate

The project deliberately contains no Apple signing identity or private
provisioning profile. Add those through Xcode or CI secrets. Before public
release, replace or license any companion assets based on protected
characters.

