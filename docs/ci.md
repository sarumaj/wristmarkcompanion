# CI

Forgejo Actions on the homelab's runners (`.forgejo/workflows/ci.yml`), on every push to `main`
and every pull request.

| Job      | Runs on                           | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|----------|-----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `checks` | `docker`, in `node:24-bookworm`   | The viewer's lint (ESLint). The tools parse. The Markdown's lint (line length, aligned tables). `watch/source/MarkerDictionary.mc` is what `tools/generate-dictionary.mjs` writes from the pinned js-aruco2 ([002](decisions/002-marker-dictionary.md)), and the launcher icon what `tools/generate-icon.mjs` draws from it                                                                                                                                                                   |
| `e2e`    | `docker`, in Playwright's image   | `viewer/test`: in Chromium, under the production CSP, every marker of the marker page is detected with its ID (also at an angle, rotated and small), a frontal marker's pose gives the predicted distance, the viewer, fed a marker through Chromium's fake camera, shows its model and the debug overlay (and the gizmo for an ID without content), `content.json` passes its check and every model stands on the marker, and the watch's table and round layout give the detector's markers |
| `image`  | `ubuntu-latest` (has Docker)      | The viewer's image builds, and `tools/smoke-test.sh` passes: health check, pages, libraries, privacy headers, 404                                                                                                                                                                                                                                                                                                                                                                             |
| `watch`  | `ubuntu-latest` (the SDK mounted) | `tools/build-watch.sh`: the watch app compiles with the strict type check and warnings shown, for every device in `watch/manifest.xml`, signed with a throwaway key                                                                                                                                                                                                                                                                                                                           |

Run the same checks locally:

```sh
npm ci --prefix viewer
npm run --prefix viewer lint
viewer/node_modules/.bin/markdownlint-cli2 "**/*.md" "#viewer/node_modules"
node tools/align-tables.mjs docs/*.md   # aligns tables, which markdownlint only reports
node tools/generate-dictionary.mjs --check
node tools/generate-icon.mjs --check
docker build -t wristmark-viewer:test viewer && tools/smoke-test.sh wristmark-viewer:test
# the end-to-end tests, in the image CI uses (its Playwright matches package-lock.json):
docker run --rm --ipc=host -v "$PWD:/w" -w /w/viewer mcr.microsoft.com/playwright:v1.64.1-noble npm test
```

## Artifacts and storage

Artifacts and repository storage cost money on this Forgejo, so:

- CI uploads no artifacts. The image is built, tested and deleted, and pushed nowhere.
- Release packages (`.iq`, the viewer build) are attached to Forgejo releases for version tags
  only (milestone 5).
- No binaries, build output, signing keys or large 3D assets in Git (`.gitignore`). An asset
  above a few hundred KB needs the owner's approval first.

## The watch app in CI

Compiling the watch app needs the Connect IQ SDK, the device files and a Java runtime. The SDK
comes only through Garmin's SDK Manager, after signing in with a Garmin account
([Getting Started](https://developer.garmin.com/connect-iq/connect-iq-basics/getting-started/)).
Connect IQ supports only Ubuntu among Linux distributions (same page).

The [SDK license agreement](https://developer.garmin.com/connect-iq/sdk/), checked on
2026-11-15, constrains how CI may get it:

- "license to use the Program Materials for the sole purpose of developing and testing
  Applications". CI builds and tests are development.
- "You agree not to rent, lease, lend, upload to or host on any website or server, sell,
  redistribute, or sublicense the Program Materials, in whole or in part, or to enable others to
  do so."
- No copying "except as expressly permitted under this Agreement".

The options, none chosen or automated yet (the owner decides):

1. **Install the SDK on the runner hosts (anvil, anvil2) once, by hand**, with the owner's
   account, and mount it read-only into the watch job. It stays on the owner's machines for the
   owner's development. It isn't pushed to any registry, website or shared image.
2. **Bake it into a runner image** in the Forgejo container registry. This is simpler for jobs,
   but the registry is a server, and the license forbids uploading the SDK to or hosting it on a
   server. Not recommended.
3. **Download it in each job** with the owner's Garmin credentials as a secret. That needs an
   unofficial command-line SDK manager (Garmin offers only the graphical one), and stores an
   account password in CI. Not recommended.
4. **No watch build in CI**: build and test in the simulator locally, and build release
   packages by hand.

Chosen: option 1, with the unofficial command line SDK manager
(`lindell/connect-iq-sdk-manager-cli`) run by hand on `anvil` (HomeLab's role `connectiq_sdk`,
runbook `connectiq-update`). The SDK is read-only at `/opt/connectiq` in the runner container
`ci`, the only one that runs the owner's jobs alone, so a watch job runs on `ubuntu-latest`
(that container's host label).

- **The SDK version** is the job's `CONNECTIQ_SDK`. Renovate doesn't update it: a new version
  is first installed on `anvil` (`connectiq-update <version> <device>...`), then set in the job.
- **The device files** for each `<iq:product>` of the manifest must be installed there too. The
  script fails with the missing device's name.
- **The signing key** of these builds is made by `tools/build-watch.sh` for each run and deleted
  afterwards. The builds aren't kept (no artifacts) and never released.

Locally, with the SDK from Garmin's SDK Manager (on macOS, set `CONNECTIQ_HOME` to
`"$HOME/Library/Application Support/Garmin/ConnectIQ"`):

```sh
tools/build-watch.sh 9.3.0   # writes watch/bin/wristmark-<device>.prg
```

The developer signing key will come from a CI secret for the release workflow (milestone 5). It
is never committed.
