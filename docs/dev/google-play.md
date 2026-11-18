# Publishing to Google Play

A guide for the owner: every step in Play Console is yours. Checked against Google's help pages
on 2026-11-18; each step names its page. The app is the viewer in a WebView
([Android](android.md)), package `org.ciepiela.wristmark`.

## 1. The account and its testing requirement

**Personal accounts created after November 13, 2023** must run a closed test with "a minimum
of 12 testers who have been opted in continuously for at least 14 days" before they can apply
for production
([App testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)).
Until then, publishing to production stays disabled. Google usually reviews the application for
production access within seven days.

- **An organization account** (a business with a D-U-N-S number) doesn't have this
  requirement. The page names personal accounts only.
- **The testers** need a Google account and must opt in to the closed test (a link, or an email
  list or Google Group in the console) and stay opted in for 14 days in a row. Family and
  friends with an Android phone count. They don't have to use the app every day, but Google
  asks about their feedback when you apply.

## 2. Create the app

*Play Console → Create app*: name **WristMarkCompanion**, default language English (United
States), **App** (not a game), **Free**. A free app can never become paid.

The package name is fixed by the first upload: `org.ciepiela.wristmark`, the `applicationId` in
`app/android/app/build.gradle`. It can never change.

## 3. App signing: give Play our key {#app-signing}

Google Play only accepts App Bundles (`.aab`), and it signs the APKs it installs itself (Play App
Signing). By default it makes a **new key** for that
([Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)).
Then the app from Play and the APK from our releases (and F-Droid's) would carry different keys,
and Android refuses to install one over the other.

**Recommended: give Play a copy of our release key** (`wristmark`,
[signing](android.md#signing)) before the first release goes to open testing or production. In
*App signing preferences*, choose **Export and upload a key from Java keystore** (our PKCS12
keystore is one). The console offers `pepk.jar` and an encryption key to download; with both in
`~/wristmark-signing/` on studio (no Java there, so in a container):

```sh
docker run --rm -v ~/wristmark-signing:/k -w /k eclipse-temurin:21-jre \
  java -jar pepk.jar --keystore=wristmark-release.p12 --alias=wristmark \
    --keystore-pass=file:keystore-password.txt --key-pass=file:keystore-password.txt \
    --output=wristmark-play.zip --include-cert --rsa-aes-encryption \
    --encryption-key-path=encryption_public_key.pem
```

Upload `wristmark-play.zip`: the key in it is encrypted for Google alone. Then every channel
installs the same signature.

- **The upload key:** the release workflow signs the bundle with the same release key. Google
  recommends a separate upload key "for maximum security". If the console asks for one, make a
  second keystore and add it to CI as a secret pair of its own (ask Claude to wire it).
- **Google's default instead** (its "quantum-ready, hybrid signing"): simpler, but Play and the
  releases' APK can't update each other. Say which you choose; the docs then say it.

## 4. The build

Each release has `wristmark-vX.Y.Z.aab` among its files, signed with the release key and checked
against its certificate like the APK (`release.yml`). Upload it in a release of the closed test
track (*Test and release → Testing → Closed testing*), later in production.

| Requirement      | The app                                                                                                                                                                    |
|------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Target API level | 36 (`app/android/variables.gradle`): what new apps and updates need from August 31, 2026 ([target API](https://developer.android.com/google/play/requirements/target-sdk)) |
| Version code     | `X·10000 + Y·100 + Z` from the tag ([build](android.md#build)); every upload needs a higher one                                                                            |
| Permissions      | `CAMERA` only, which needs no declaration form                                                                                                                             |
| Native code      | None (the detection runs as WebAssembly in the WebView), so the 16 KB page size rule doesn't apply                                                                         |

## 5. The store listing

*Grow users → Store presence → Main store listing*. The listing names no watch maker: Garmin's
name is used only once Garmin approves ([publishing](publishing.md#9-name-and-trademarks)).

The texts and images are in `fastlane/metadata/android/en-US/`, which F-Droid reads too
([F-Droid](android.md#f-droid)); copy them into the form. A test keeps them within the limits.

| Field             | File                    | Limit            |
|-------------------|-------------------------|------------------|
| App name          | `title.txt`             | 30 characters    |
| Short description | `short_description.txt` | 80 characters    |
| Full description  | `full_description.txt`  | 4,000 characters |

The full description leaves hand tracking out: F-Droid's build doesn't have it.

### Graphics

| Asset                     | Play's requirement                      | File                                                                                                      |
|---------------------------|-----------------------------------------|-----------------------------------------------------------------------------------------------------------|
| App icon                  | 512 × 512, 32-bit PNG                   | `images/icon.png`: marker 0 on blue, from `tools/generate-icon.mjs`                                       |
| Feature graphic           | 1024 × 500, JPEG or 24-bit PNG          | `images/featureGraphic.jpg`: the hero image scaled, from `viewer/tools/render-hero.mjs`                   |
| Phone screenshots, 2 to 8 | 16:9 or 9:16, each side 320 to 3,840 px | **Yours to take** on the phone: the camera on the watch with a model, the Help, pairing, the Markers page |

The screenshots should show the app in use, and a real watch on a real wrist reads best. Take
them with the phone's screenshot buttons while the app runs, and put them in
`images/phoneScreenshots/` (`1.png`, `2.png`, ...), where F-Droid shows them too.

### Details

| Field          | Value                                                                                                                              |
|----------------|------------------------------------------------------------------------------------------------------------------------------------|
| Category       | Entertainment                                                                                                                      |
| Tags           | Augmented reality, and what else the console offers that fits                                                                      |
| Contact email  | `contact@ciepiela.org`                                                                                                             |
| Website        | `https://wristmark.apps.ciepiela.org`                                                                                              |
| Privacy policy | `https://wristmark.apps.ciepiela.org/privacy.html` (it covers the app: [deployment](deployment.md#what-the-privacy-page-must-say)) |

## 6. App content

*Policy and programs → App content*: the declarations every app answers.

| Declaration                         | Answer                                                                                                                                                                                                                                                                                                            |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Privacy policy                      | The address above                                                                                                                                                                                                                                                                                                 |
| Ads                                 | No ads                                                                                                                                                                                                                                                                                                            |
| App access                          | All of it without signing in. Instructions for the reviewers: "No watch needed: open \"Markers without a watch\" (below the start screen) on a second screen or printed, and point the camera at a marker."                                                                                                       |
| Content rating                      | The questionnaire: no violence, no user content shared with others, no purchases, no location. Expect "Everyone" / PEGI 3                                                                                                                                                                                         |
| Target audience                     | 13 and over: under 13 brings the Families policy's extra rules                                                                                                                                                                                                                                                    |
| Data safety                         | **No data collected or shared.** The camera image is processed on the device (not in scope). The control channel's messages are end-to-end encrypted, "unreadable by you" (not in scope). Data encrypted in transit: yes ([Data safety](https://support.google.com/googleplay/android-developer/answer/10787469)) |
| Government, financial, health, news | No                                                                                                                                                                                                                                                                                                                |

## 7. Closed test, then production

1. Upload the bundle to the closed test track; add the testers (an email list) and send them the
   opt-in link.
2. After 14 days with 12 testers opted in, *Dashboard → Apply for production* and answer the
   questions about the test.
3. Once approved, promote the release to production; the review of a first release can take
   several days.

Each later release: upload its `.aab` to the track, with a few lines from the changelog as the
release notes.

## Possible review findings

- **A website in a wrapper:** Play's policy refuses apps that only show a website. This one
  ships the viewer inside (it runs offline), uses the camera natively and is the same
  project's, so it should pass; if it is rejected, the answer is that.
- **Missing access:** a reviewer without the watch app sees only a camera. The App access
  instructions (above) point them to the Markers page.
