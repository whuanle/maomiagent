# Desktop Portable Distribution and Single npm Package Design

Date: 2026-05-30
Status: Draft for review
Owner: Codex

## Context

The current desktop release flow is still shaped around Electrobun's updater-oriented artifact model:

- Windows publishes a `Setup.zip` that still contains `Setup.exe` plus a hidden `.installer` directory.
- Linux publishes a self-extracting installer archive and a `tar.zst` bundle.
- macOS publishes `dmg` plus `.app.tar.zst`.
- the repo-level updater contract still assumes `.tar.zst` and `update.json` are meaningful release assets

That model is technically workable, but it is not the distribution model the product now wants.

The new requirement is intentionally simpler:

- if a user-facing `.zip` exists, do not also expose `.zst`
- Windows and Linux should prefer portable, no-install packages
- macOS should also prefer a portable package when practical, but may fall back to `dmg`
- the desktop app should also be installable from npm as a single package name
- `npm i -g maomiagent` must install a GUI launcher, not a CLI-only tool
- the npm package must be self-contained and must not download platform assets during install

This changes the distribution source of truth again. The previous GitHub Release plus in-app updater design is no longer the end state. GitHub Release remains important, but only as a user-facing download channel. The updater-style `.tar.zst` contract should no longer define what the user sees.

## Goals

- Publish only user-facing desktop assets to GitHub Release.
- Make Windows distribution primarily a portable zip.
- Make Linux distribution primarily a portable zip.
- Make macOS distribution primarily an `.app.zip` when validation is acceptable, with `dmg` as the fallback.
- Stop publishing `.tar.zst`, `update.json`, and hidden installer sidecars as release assets.
- Publish one npm package name, `maomiagent`, that works across supported desktop targets.
- Ensure `npm i -g maomiagent` installs a command that launches the GUI.
- Keep the npm package self-contained, with no install-time or first-run network download.
- Reuse one shared CI build pipeline so GitHub Release assets and npm package contents come from the same platform bundles.

## Non-Goals

- No split npm packages such as per-platform package names.
- No install-time download of runtime bundles from GitHub or any other host.
- No preservation of the current in-app self-update installation flow.
- No requirement to keep `.tar.zst` as part of the public release contract.
- No first-pass support for package-manager-native Linux formats such as `deb` or `rpm`.
- No app store packaging or notarization workflow redesign beyond what is needed for zipped `.app` validation.

## Approaches Considered

### A. One npm package with embedded portable platform archives, plus portable GitHub Release assets

Build every desktop target in CI, convert those outputs into portable archives, publish those archives to GitHub Release, and assemble a single npm package that embeds all platform archives. The npm package extracts only the current platform's runtime during installation and exposes a `maomi-agent` command that launches the GUI.

Pros:

- exactly matches the requirement for one package name and no second download
- keeps GitHub Release and npm publication aligned around the same build outputs
- removes updater-only assets from the user-facing release contract
- lets Windows and Linux move to a much simpler portable story immediately

Cons:

- the npm package will be materially larger because it contains multiple platform runtimes
- packaging logic must be added to assemble portable zips and the npm bundle layout
- macOS still needs separate validation because `.app.zip` behaves differently from `dmg`

### B. One npm package with all runtimes already unpacked

Instead of shipping embedded zip archives in the npm package, publish the single npm package with every platform runtime already unpacked inside it.

Pros:

- simpler launcher logic because no extraction step is needed
- easier to inspect packaged contents after install

Cons:

- the installed package becomes much larger on disk than necessary
- publish artifacts become noisy and harder to reason about
- the npm tarball grows faster because compression is less efficient than shipping a small number of prepared platform archives

### C. Platform-specific npm packages or install-time download

Use either per-platform npm packages or a single stub npm package that downloads the current platform runtime during install.

Pros:

- smallest install size per user
- closest to common native-module distribution patterns

Cons:

- directly conflicts with the user's requirement for one package name and no second download
- adds release indirection and operational complexity the new direction is specifically trying to remove

## Recommendation

Choose Approach A.

It is the smallest design that satisfies all of these at once:

- one npm package name
- no network download during npm install
- portable GitHub Release assets for manual downloads
- one build pipeline that does not maintain separate desktop payloads for GitHub and npm

Approach B is needlessly heavy after installation. Approach C is operationally cleaner from an ecosystem perspective, but it fails the stated product requirement.

## Proposed Design

### 1. User-facing release contract

GitHub Release should only expose the assets a human can act on directly.

Stable assets should follow a deterministic naming scheme such as:

- `stable-win-x64-MaomiAgent-portable.zip`
- `stable-linux-x64-MaomiAgent-portable.zip`
- `stable-macos-arm64-MaomiAgent.app.zip`
- `stable-macos-x64-MaomiAgent.app.zip`

If macOS zip validation is not acceptable for one or both architectures, the affected asset falls back to:

- `stable-macos-arm64-MaomiAgent.dmg`
- `stable-macos-x64-MaomiAgent.dmg`

Preview releases follow the same rule with a `preview-` prefix.

GitHub Release must stop exposing these as first-class release assets:

- `.tar.zst`
- `update.json`
- hidden `.installer` companion directories
- wrapped setup payloads that still require sidecar extraction metadata

Intermediate `.tar` or `.zst` files may still exist temporarily inside CI if a low-level bundling step requires them, but they are no longer part of the public contract and must not be attached to the release.

### 2. Portable bundle layout

Windows and Linux portable archives should extract to a single top-level application folder. The extracted folder should contain an obvious launch entry without requiring the user to navigate into a hidden or implementation-specific directory.

Target experience:

- unzip once
- open the extracted `MaomiAgent` folder
- launch the app from the folder root

For Windows and Linux, the repo's custom packager should therefore normalize runtime layout for portable use. If Electrobun's native layout can be flattened safely, the executable should sit at the bundle root. If flattening is not safe, the packager must still provide a root-level launch entry that forwards to the real runtime binary without exposing `bin/launcher` as the user-facing path.

For macOS, the user-facing portable asset is the `.app` bundle itself inside a zip archive. The `.app` bundle stays in standard macOS layout and should not be reshaped to imitate the Windows or Linux bundle structure.

### 3. Single npm package layout

The npm package should live as a dedicated package inside the repo, separate from the desktop app source package. A new package directory such as `packages/maomiagent-npm` is sufficient.

The published package should be named `maomiagent` and expose:

- command: `maomi-agent`

The package contents should be organized around three surfaces:

- `bin/maomi-agent.js`
  - the globally linked launcher entrypoint
- `runtime-bundles/`
  - one embedded archive per target platform
- `runtime/active/`
  - the extracted runtime for the current machine only

Example embedded bundle names:

- `runtime-bundles/win-x64.zip`
- `runtime-bundles/linux-x64.zip`
- `runtime-bundles/macos-arm64-app.zip`
- `runtime-bundles/macos-x64-app.zip`

The package does not download anything during install. Everything it needs to launch the GUI ships inside the npm tarball.

### 4. npm install and launch behavior

`postinstall` is responsible for extracting exactly one runtime:

- detect current `os` and `arch`
- resolve the matching embedded archive
- extract it into `runtime/active/<platform>`
- write a small metadata file describing the extracted version and target platform

The `maomi-agent` command is only a launcher shim. It should:

- resolve its own installed package root
- find the already extracted active runtime for the current platform
- perform a cheap integrity check that the launch entry exists
- if extraction metadata is missing but the embedded archive exists, perform a last-resort local extraction without network access
- spawn the GUI and then exit

Platform-specific launch behavior:

- Windows: spawn the portable executable directly
- Linux: spawn the portable executable directly
- macOS: launch the extracted `.app` bundle through the standard macOS app launch path

The command remains GUI-first. It is not expected to become a general-purpose CLI shell.

### 5. Build and assembly pipeline

The CI pipeline should still build each desktop target on its native runner:

- `win-x64`
- `linux-x64`
- `macos-arm64`
- `macos-x64`

After the per-platform build completes, the workflow should normalize outputs into user-facing portable assets.

That means replacing the current "publish whatever Electrobun emitted" behavior with "publish only the repo-defined portable artifacts".

The publish flow should become:

1. Build each desktop target.
2. Transform each target output into the portable asset contract.
3. Upload those artifacts as workflow artifacts.
4. Publish those artifacts to GitHub Release.
5. Download the same artifacts into the npm package assembly job.
6. Copy the platform archives into `runtime-bundles/`.
7. Write the package version and launcher metadata.
8. Run `npm pack` to validate the final tarball.
9. Publish the single npm package.

This keeps GitHub Release and npm publication aligned to the same version and source payloads.

### 6. Update model

The existing in-app self-update path should be retired as a required release feature.

Under the new design:

- GitHub download users update by downloading a new portable zip or dmg
- npm users update by running `npm update -g maomiagent`

The desktop app may still keep a lightweight "Check for updates" entry, but that entry should no longer attempt in-app bundle replacement. It should instead guide users to one of these actions:

- open the latest GitHub Release page
- or instruct npm-installed users to run `npm update -g maomiagent`

This means the current `desktop-app-update` asset-selection and installer flow is no longer a critical-path runtime system. It can either be removed or reduced to version display plus external guidance.

### 7. macOS packaging rule

macOS needs one additional rule because the portable preference is conditional.

The repo should treat macOS as:

- first choice: `.app.zip`
- fallback: `dmg`

The fallback is release-channel-specific, not npm-package-specific.

For npm packaging, the package still needs a runnable macOS app payload, so the npm package should continue to embed a zipped `.app` bundle for macOS targets. The `dmg` fallback only exists for the human download story on GitHub Release.

If one macOS architecture cannot produce a validated `.app.zip` at release time, the GitHub Release may publish `dmg` for that architecture while the npm package still embeds the internal `.app.zip` runtime used by `maomi-agent`.

### 8. Error handling

The distribution and launcher flow should fail clearly in these cases:

- current platform has no embedded runtime in the npm package
- the embedded archive exists but extraction fails
- extraction succeeds but the launch entry is missing
- the user runs `maomi-agent` from an unsupported `os` or `arch`

Failure messages should name the exact target, for example:

- `Unsupported platform: linux-arm64`
- `Embedded runtime bundle is missing for macos-x64`
- `Portable runtime was extracted but launch entry was not found`

The npm launcher must never silently attempt a network fallback.

### 9. Testing

Coverage should include:

- release workflow tests verifying:
  - the workflow still builds `win-x64`, `linux-x64`, `macos-arm64`, and `macos-x64`
  - GitHub Release only publishes portable zip or dmg assets
  - `.tar.zst` and `update.json` are no longer attached as release assets
- packaging tests verifying:
  - Windows and Linux portable asset names follow the new contract
  - macOS chooses `.app.zip` first and `dmg` only as fallback
  - the npm assembly step copies exactly the expected platform archives
- npm package tests verifying:
  - `package.json` exposes `maomi-agent`
  - `postinstall` extracts only the current platform runtime
  - no install path attempts a network request
  - the launcher resolves the correct executable or `.app` for each supported platform
- smoke tests verifying:
  - a packed npm tarball can be installed globally in CI
  - the `maomi-agent` command can resolve and start the GUI runtime on each supported platform

## Acceptance Criteria

- GitHub Release assets no longer include `.tar.zst`, `update.json`, or sidecar installer payloads.
- Windows releases publish `stable-win-x64-MaomiAgent-portable.zip`.
- Linux releases publish `stable-linux-x64-MaomiAgent-portable.zip`.
- macOS releases publish `.app.zip` when validated, otherwise `dmg`.
- One npm package name, `maomiagent`, can be published for the same desktop version.
- `npm i -g maomiagent` installs a `maomi-agent` command that launches the desktop GUI.
- npm installation does not download platform runtimes from the network.
- npm installation extracts only the current platform runtime.
- In-app self-update is no longer required for release correctness.
- GitHub Release publication and npm publication both consume the same versioned platform build outputs.
