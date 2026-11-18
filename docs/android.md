# The Android app

The viewer as an Android app: [Capacitor](https://capacitorjs.com/) 8 (MIT) puts the viewer's
files into the APK and shows them in the system's WebView. Everything the web viewer does, the
app does the same way: the camera, the models, the hand tracking, pairing with the watch. There
is no iOS app: iOS builds need macOS and an Apple developer account (decided 2026-11-17);
iPhones use the viewer in Safari.

| Part                        | Where                                                                |
|-----------------------------|----------------------------------------------------------------------|
| Capacitor's project         | `app/` (`capacitor.config.json`, `package.json`), `app/android/`     |
| The viewer's files          | `app/www`, made by `tools/build-app-web.sh` (not in Git)             |
| Launcher icons, splash      | From the viewer's icons by `tools/generate-app-icons.sh` (libvips)   |
| The SDK                     | `tools/install-android-sdk.sh`: Google's tools, pinned and checked   |
| The build                   | `tools/build-android.sh debug\|release`                              |
| CI                          | The `android` job: the debug APK of every pull request, not kept     |
| Release                     | `release.yml`: the signed APK on the release, `wristmark-vX.Y.Z.apk` |

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
the APK's certificate is the one above, so an APK signed otherwise never goes out. The keystore
and its password are never in Git.

## Install

From the release's assets, `wristmark-vX.Y.Z.apk`: open it on the phone and allow installing
apps from that source when Android asks. Updates install over it, as long as they come from the
same key (above).

## F-Droid {#f-droid}

F-Droid builds the apps it publishes from their source on its own servers. With a
[reproducible build](https://f-droid.org/docs/Reproducible_Builds/) it publishes the developer's
own signed APK instead, so updates from either source install over each other. What publishing
here needs, in order:

1. **The source in public.** The repository is private; F-Droid builds from a public Git
   repository (this Forgejo with the repository made public, or a public mirror, e.g. on
   Codeberg).
2. **No prebuilt binaries in the build.** F-Droid's scanner refuses what isn't built from source:
   - **MediaPipe** (hand tracking, Apache-2.0) comes from npm as WebAssembly and its model as a
     file from Google's storage. Both are prebuilt. Either the F-Droid build leaves the hand
     tracking out (the button hidden when its files are missing), or they are built from
     MediaPipe's source, which needs Bazel and Emscripten: a large job.
   - **`gradle-wrapper.jar`** is allowed: F-Droid uses its own Gradle.
   - **Capacitor, three.js, js-aruco2** are MIT, from source on npm: accepted. npm itself is
     allowed in a build recipe.
3. **No dependency metadata blob** in the APK: `dependenciesInfo` is off in
   `app/android/app/build.gradle` already.
4. **Store texts and images in the repository**, where F-Droid reads them: Fastlane's layout,
   `fastlane/metadata/android/en-US/` (`title.txt`, `short_description.txt`,
   `full_description.txt`, `images/icon.png`, `images/phoneScreenshots/`).
5. **The recipe**, `metadata/org.ciepiela.wristmark.yml` in a merge request to
   [fdroiddata](https://gitlab.com/fdroid/fdroiddata), roughly:

   ```yaml
   Categories: [Multimedia]
   License: GPL-3.0-or-later
   SourceCode: https://git.ciepiela.org/dawid/wristmarkcompanion
   IssueTracker: https://git.ciepiela.org/dawid/wristmarkcompanion/issues
   RepoType: git
   Repo: https://git.ciepiela.org/dawid/wristmarkcompanion.git
   Binaries: https://git.ciepiela.org/dawid/wristmarkcompanion/releases/download/v%v/wristmark-v%v.apk
   AllowedAPKSigningKeys: b3295ca076aaa3baa9e1f1a56a7e696b85777e2a15e22765014a4b7aa0ea243b
   Builds:
     - versionName: 0.2.0
       versionCode: 200
       commit: v0.2.0
       subdir: app/android/app
       sudo:
         - apt-get update
         - apt-get install -y nodejs npm
       prebuild:
         - npm ci --prefix ../../../viewer --ignore-scripts
         - cd ../.. && npm ci --ignore-scripts && ../tools/build-app-web.sh && npx cap sync android
       gradle: [yes]
   AutoUpdateMode: Version
   UpdateCheckMode: Tags ^v[0-9.]+$
   ```

   `Binaries` with `AllowedAPKSigningKeys` asks F-Droid to compare its build with our APK and
   publish ours when they match bit for bit; that needs the same Node.js, JDK and build tools on
   both sides. Without them F-Droid signs with its own key.
6. **Review:** F-Droid's maintainers check the recipe and the app; it takes weeks. The relay is
   free software in the same repository, so the app's network use needs no anti-feature.

**Quicker: an F-Droid repository of our own.** `fdroidserver` (`fdroid update`) makes a
repository index from our signed APKs; served from any static host, people add its address in
the F-Droid client once and get updates there. No review, no rebuild, and MediaPipe stays.

**Files here and LFS:** F-Droid's servers clone without Git LFS, so nothing the build reads may
be in LFS: `app/android/` is excluded in `.gitattributes`.
