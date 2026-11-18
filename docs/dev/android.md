# The Android app

The viewer as an Android app: [Capacitor](https://capacitorjs.com/) 8 (MIT) puts the viewer's
files into the APK and shows them in the system's WebView. Everything the web viewer does, the
app does the same way: the camera, the models, the hand tracking, pairing with the watch. There
is no iOS app: iOS builds need macOS and an Apple developer account (decided 2026-11-17);
iPhones use the viewer in Safari.

| Part                   | Where                                                                                                                          |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| Capacitor's project    | `app/` (`capacitor.config.json`, `package.json`), `app/android/`                                                               |
| The viewer's files     | `app/www`, made by `tools/build-app-web.sh` (not in Git)                                                                       |
| Launcher icons, splash | From the viewer's icons by `tools/generate-app-icons.sh` (libvips)                                                             |
| The SDK                | `tools/install-android-sdk.sh`: Google's tools, pinned and checked                                                             |
| The build              | `tools/build-android.sh debug\|release`                                                                                        |
| CI                     | The `android` job: the debug APK and App Bundle of every pull request, not kept                                                |
| Release                | `release.yml`: the signed APK and App Bundle on the release, `wristmark-vX.Y.Z.apk` and `.aab` ([Google Play](google-play.md)) |

## How it differs from the web viewer

- **Its pages' origin is `https://localhost`** (Capacitor's), so the control channel's relay
  is called at the viewer's public address, `https://wristmark.apps.ciepiela.org/relay/v1`
  (`js/app.js`, `RELAY`; another with `WRISTMARK_ORIGIN`,
  [the viewer's address](watch.md#the-viewers-address)), and the relay allows that origin
  (CORS, `relay/relay.go`, `appOrigin`). Every request still needs its channel's token.
- **Offline:** the app needs the network only for the relay.
- **The camera:** the manifest asks for `CAMERA`; the WebView asks the person when the page
  wants the camera, as a browser does.
- **Updates** come with a new APK: a change of the viewer reaches the app at the next release.

## Build

Needs Java 21, Node.js 22 or later, and libvips only to make the icons again.

```bash
tools/install-android-sdk.sh ~/.cache/android/sdk
npm ci --prefix viewer --ignore-scripts
ANDROID_HOME=~/.cache/android/sdk tools/build-android.sh debug
# app/build/app-debug.apk: adb install app/build/app-debug.apk
```

On studio, without Java, the same in a container: `eclipse-temurin:21-jdk-noble` with Node.js
added, the SDK and Gradle's caches mounted from `~/.cache`.

- **Version:** `APP_VERSION` (`X.Y.Z`, the tag without its `v`) is the version name; the version
  code is `X·10000 + Y·100 + Z` (0.2.0 is 200). Without it, 0.0.1.
- **After changing the viewer's icons:** `tools/generate-app-icons.sh`, and commit the result.

## Signing {#signing}

Android installs an update only when it is signed with the same key as the installed app, so the
release key never changes. Losing it means everyone uninstalls and installs again.

| What                    | Where                                                                      |
|-------------------------|----------------------------------------------------------------------------|
| The keystore (PKCS12)   | `~/wristmark-signing/wristmark-release.p12` on studio; a copy kept offline |
| Its password            | `~/wristmark-signing/keystore-password.txt`; the key has the same password |
| The key's alias         | `wristmark` (RSA 4096, valid until 2056)                                   |
| CI's secrets            | `ANDROID_KEYSTORE` (base64 of the keystore), `ANDROID_KEYSTORE_PASSWORD`   |
| The certificate SHA-256 | `b3295ca076aaa3baa9e1f1a56a7e696b85777e2a15e22765014a4b7aa0ea243b`         |

The release workflow writes the keystore to a temporary file for its step only and checks that
the APK's and the App Bundle's certificate is the one above, so nothing signed otherwise goes
out. Google Play re-signs what it installs: [give it this key](google-play.md#app-signing), or
Play's and these APKs can't update each other. The keystore
and its password are never in Git.

## Install

From a release's `wristmark-vX.Y.Z.apk` ([the user guide](../user/guide.md#what-you-need)).
Updates install over it as long as they come from the same key (above).

## F-Droid {#f-droid}

F-Droid builds the apps it publishes from their source on its own servers, signs them with its
own key, and refuses prebuilt binaries. What is ready here, and what is left:

| Need                      | State                                                                                                                                                                                                                     |
|---------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| A build from source only  | **Ready:** `WRISTMARK_HANDS=off` leaves MediaPipe (prebuilt WebAssembly and model) out of `app/www`, and the viewer hides the hand button (a test checks it). Capacitor, three.js and js-aruco2 are MIT, plain JavaScript |
| No dependency metadata    | **Ready:** `dependenciesInfo` is off in `app/android/app/build.gradle`                                                                                                                                                    |
| Texts and images          | **Ready:** `fastlane/metadata/android/en-US/`, shared with [Google Play](google-play.md#5-the-store-listing), outside Git LFS (F-Droid clones without it). Screenshots: yours to add in `images/phoneScreenshots/`        |
| Changelogs (optional)     | `changelogs/<versionCode>.txt`, at most 500 characters: a few lines from `CHANGELOG.md` per release                                                                                                                       |
| **The source in public**  | **Open:** the repository is private; F-Droid builds only from a public one (this Forgejo with the repository public, or a mirror, e.g. on Codeberg)                                                                       |
| The recipe and its review | **Open:** below, as a merge request to [fdroiddata](https://gitlab.com/fdroid/fdroiddata); the maintainers' review takes weeks                                                                                            |

**Signatures:** F-Droid's APK has F-Droid's key and no hand tracking, so it can't update over
ours or Play's, nor they over it; people pick one source. (Publishing our own APK through
F-Droid needs a reproducible build, which the hand tracking in ours rules out.)

**The recipe**, `metadata/org.ciepiela.wristmark.yml` (the URLs once public). Capacitor's CLI
needs Node.js 22 or later, newer than the build server's Debian has, so the recipe fetches
Node.js and checks it:

```yaml
Categories: [Multimedia]
License: GPL-3.0-or-later
SourceCode: https://git.ciepiela.org/dawid/wristmarkcompanion
IssueTracker: https://git.ciepiela.org/dawid/wristmarkcompanion/issues
RepoType: git
Repo: https://git.ciepiela.org/dawid/wristmarkcompanion.git
Builds:
  - versionName: 0.3.0
    versionCode: 300
    commit: v0.3.0
    subdir: app/android/app
    sudo:
      - curl -fsSLo /tmp/node.tar.xz https://nodejs.org/dist/v24.22.2/node-v24.22.2-linux-x64.tar.xz
      - echo "48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75  /tmp/node.tar.xz" | sha256sum -c -
      - tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
    # One shell, the lines joined with &&, from the subdir: hence the first cd.
    prebuild:
      - cd ../../..
      - npm ci --prefix viewer --ignore-scripts --omit=dev
      - rm -rf viewer/node_modules/@mediapipe
      - npm ci --prefix app --ignore-scripts
      - WRISTMARK_HANDS=off tools/build-app-web.sh
      - cd app && npx cap sync android
    scandelete:
      - viewer/node_modules
      - app/node_modules
    gradle: [yes]
AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9.]+$
CurrentVersion: 0.3.0
CurrentVersionCode: 300
```

The version is the first release with the no-hands build. The relay is free software in the
same repository, so the app's network use needs no anti-feature.

**Files here and LFS:** F-Droid's servers clone without Git LFS, so nothing the build reads may
be in LFS: `app/android/` and `fastlane/` are excluded in `.gitattributes`.
