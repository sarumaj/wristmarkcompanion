# CI

Forgejo Actions on the homelab's runners (`.forgejo/workflows/ci.yml`), on every push to `main`
and every pull request.

| Job | Runs on | What it checks |
|---|---|---|
| `checks` | `docker`, in `node:24-bookworm` | The viewer's lint (ESLint). The tools parse. `watch/source/MarkerDictionary.mc` is what `tools/generate-dictionary.mjs` writes from the pinned js-aruco2 ([002](decisions/002-marker-dictionary.md)) |
| `image` | `ubuntu-latest` (has Docker) | The viewer's image builds, and `tools/smoke-test.sh` passes: health check, page, library, privacy headers, 404 |
| watch | not yet | See below |

Run the same checks locally:

```sh
npm ci --prefix viewer
npm run --prefix viewer lint
node tools/generate-dictionary.mjs --check
docker build -t wristmark-viewer:test viewer && tools/smoke-test.sh wristmark-viewer:test
```

## Artifacts and storage

Artifacts and repository storage cost money on this Forgejo, so:

- CI uploads no artifacts. The image is built, tested and deleted, and pushed nowhere.
- Release packages (`.iq`, the viewer build) are attached to Forgejo releases for version tags
  only (milestone 5).
- No binaries, build output, signing keys or large 3D assets in Git (`.gitignore`). An asset
  above a few hundred KB needs the owner's approval first.

## The watch app in CI: open question

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

Option 1 is the recommendation. Until it's decided, the watch code is checked only where it can
be without the SDK: the generated table.

The developer signing key will come from a CI secret for the release workflow (milestone 5). It
is never committed.
