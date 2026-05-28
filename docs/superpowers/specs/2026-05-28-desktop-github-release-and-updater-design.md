# Desktop GitHub Release Distribution and Updater Design

Date: 2026-05-28
Status: Draft for review
Owner: Codex

## Context

The desktop release pipeline already has the beginnings of a tag-driven GitHub Release flow, but the current implementation is split across two incompatible models:

- the workflow can build and upload release artifacts to GitHub Releases
- the same workflow still depends on external object storage and release-admin configuration
- the local release scripts still assume a WoAI-style publishing backend and file metadata contract
- the current handwritten release builder is effectively Windows-only and only produces `win-x64` artifacts
- the desktop updater still resolves latest versions and download URLs through WoAI public API conventions

The user requirement is now different and narrower:

- GitHub Release becomes the only release source
- the first official desktop release workflow must publish multiple operating systems and CPU architectures
- macOS must include both `arm64` and `x64`
- the update system must stop depending on WoAI and instead detect updates from GitHub Releases
- Windows may keep in-app self-update first, but the first rollout does not need full self-update parity on macOS and Linux

This means the work is not a cosmetic workflow cleanup. It is a source-of-truth change for distribution and update metadata.

## Goals

- Make GitHub Release the only distribution source for desktop builds.
- Publish these first-pass release targets from one tag-driven workflow:
  - `win-x64`
  - `linux-x64`
  - `macos-arm64`
  - `macos-x64`
- Remove external object storage and release-admin APIs from the release success path.
- Replace WoAI update discovery with GitHub Release discovery.
- Preserve Windows in-app bundle update installation.
- Allow macOS and Linux to detect updates and surface a correct download target even before native in-app installation is implemented.
- Keep asset naming predictable so release selection and update targeting stay deterministic.

## Non-Goals

- No object storage upload flow in the first-pass release workflow.
- No WoAI public software API compatibility layer.
- No first-pass in-app bundle replacement for macOS or Linux.
- No custom CDN or mirror layer in this work.
- No attempt to solve all packaging polish issues beyond the four required release targets.
- No requirement to delete every old release helper immediately if it is not on the critical path for the new workflow.

## Approaches Considered

### A. GitHub Release as the single source of truth, with matrix builds and GitHub-based update checks

Build each target in GitHub Actions, publish all platform assets to one GitHub Release, and teach the updater to query GitHub Releases directly.

Pros:

- matches the current product decision exactly
- removes dependency on external release infrastructure
- gives one coherent source of truth for release notes, version metadata, and assets
- keeps the first rollout tractable by preserving Windows-only in-app installation

Cons:

- updater parsing must be rewritten away from the current WoAI contract
- asset naming becomes a hard contract that must stay stable

### B. Publish to GitHub Release, but keep a custom manifest file as the updater source of truth

Generate a release manifest asset and have the updater fetch that manifest instead of reading GitHub Release API payloads directly.

Pros:

- keeps the updater contract tightly controlled by the repo
- allows richer metadata than GitHub Release exposes directly

Cons:

- creates a second source of truth on top of GitHub Release
- reintroduces a release-side metadata pipeline before the simpler model is proven
- keeps more of the old manifest mindset alive than necessary

### C. Publish multi-platform releases and implement full in-app self-update for all platforms immediately

Ship GitHub Release publishing and complete self-update flows for Windows, macOS, and Linux in one pass.

Pros:

- most complete end-user story
- avoids platform asymmetry in the updater

Cons:

- too large for a safe first release migration
- current installer and replacement logic is heavily Windows-specific
- macOS signing, bundle replacement, and Linux bundle replacement semantics would substantially expand scope

## Recommendation

Choose Approach A.

The right first coherent release model is:

- GitHub tag triggers one multi-target workflow
- each platform build publishes assets to one GitHub Release
- GitHub Release metadata becomes the updater source
- Windows keeps in-app update install support
- macOS and Linux detect updates and route users to correct downloads until native installation support exists

This is the smallest design that fully removes WoAI from the release and update contract without inventing a new intermediate backend.

## Proposed Design

### 1. Release workflow architecture

The desktop release workflow should become a two-stage GitHub Actions pipeline:

- `build` jobs run as a matrix over explicit target entries
- `publish-release` runs after all target builds and publishes one GitHub Release for the tag

The initial matrix should include:

- `windows-2025` + `win-x64`
- `ubuntu-24.04` + `linux-x64`
- `macos-15` + `macos-arm64`
- `macos-15-intel` + `macos-x64`

The workflow should keep the current tag-trigger behavior and release metadata normalization, but stop referencing:

- object storage URLs
- release-admin URLs
- publish secrets for non-GitHub systems
- release manifest generation as a publish prerequisite

Each matrix job should:

- check out the repository
- set up Bun
- install desktop dependencies
- run repo verification
- normalize the release version from the tag
- build only its assigned platform target
- upload its generated artifacts as a workflow artifact

The final publish job should:

- download all matrix artifacts
- create or update the GitHub Release for the tag
- attach all platform assets to the same release
- use GitHub-generated release notes unless explicitly overridden later

Explicit runner labels are preferred over `*-latest` so release behavior does not drift silently when GitHub changes default runner mappings.

### 2. Build script refactor

The current handwritten release builder should stop acting as a Windows-only packager.

Instead, the repo-level release build path should become a thin orchestration layer around Electrobun:

- `release:prepare-web` still builds the renderer and branding assets
- `release:build` receives the target platform from environment variables set by CI
- `electrobun.config.ts` reads a concrete target set for the current invocation
- the repo script normalizes output placement and asset naming, instead of reimplementing every platform bundle layout itself

The key change is that the repo should no longer hardcode a single release environment such as `stable-win-x64`. It should derive:

- release channel
- release version
- target OS
- target arch

from CI inputs.

The build layer should remain responsible for naming consistency. It should not become responsible for recreating platform-native bundle internals that Electrobun already knows how to produce.

### 3. GitHub Release asset contract

GitHub Release asset filenames become the updater contract.

The release workflow should publish assets that match a stable naming convention:

- `stable-win-x64-MaomiAgent.tar.zst`
- `stable-win-x64-MaomiAgentSetup.exe`
- `stable-linux-x64-MaomiAgent.tar.zst`
- `stable-macos-arm64-MaomiAgent.app.tar.zst`
- `stable-macos-arm64-MaomiAgent.dmg`
- `stable-macos-x64-MaomiAgent.app.tar.zst`
- `stable-macos-x64-MaomiAgent.dmg`

Preview releases follow the same rule with the `preview-` prefix.

Contract rules:

- every platform release must provide at least one bundle asset
- Windows should provide both a bundle and an installer
- macOS should provide bundle and DMG when Electrobun produces both
- Linux may ship only the bundle in the first rollout if no installer-grade artifact is consistently available
- the updater must prefer bundle assets for in-app installation
- installer assets remain user-facing download targets

Optional sidecar assets such as `update.json` or patch files may still be emitted if useful for Windows verification or future optimization, but GitHub Release is the source of truth, not any external manifest.

### 4. Updater configuration contract

`update-config.json` should stop encoding WoAI public service coordinates.

The packaged update configuration should instead describe a GitHub repository source, for example:

- provider: `github`
- owner: repository owner
- repo: repository name
- channel: `stable` or `preview`
- os: target OS
- arch: target architecture

The runtime config loader should stop reading:

- public software API base URL
- software code
- WoAI latest-version route
- WoAI file download indirection

The loader should continue to preserve per-bundle `channel`, `os`, and `arch`, because those remain necessary for platform-specific asset selection.

### 5. GitHub Release discovery semantics

Updater discovery should use GitHub Releases directly.

Stable channel behavior:

- query the repository latest release
- accept only non-draft, non-prerelease releases

Preview channel behavior:

- list releases
- choose the most recent non-draft prerelease

The updater parser should read:

- release ID
- tag name
- release name
- body
- prerelease flag
- assets list

Version resolution should prefer the tag name and normalize it through the existing WoAI version normalization logic already present in the repo. This preserves the current version comparison model without preserving the old release backend.

Asset parsing should map GitHub assets into the existing generic updater asset shape:

- `assetId` becomes GitHub release asset ID
- `fileName` becomes the GitHub asset name
- `fileSize` becomes the GitHub asset size
- `packageType`, `packageFormat`, `os`, and `arch` continue to be inferred from filename conventions

This preserves the repo's current platform-selection model while swapping out the transport source.

### 6. Update install behavior by platform

#### Windows

Windows keeps the current first-class in-app installation flow.

If the selected GitHub Release contains a matching Windows bundle asset:

- download the bundle directly from the release asset URL
- optionally use a sidecar hash asset if available
- validate size and checksum when metadata exists
- reuse the current extract, replace, and restart flow

If only a Windows installer exists and no bundle exists:

- report that a newer version exists
- do not attempt in-app replacement
- surface the installer download link instead

#### macOS

macOS first-pass behavior is detection plus download routing.

If a matching DMG exists, that should be the preferred user-facing download.
If no DMG exists but a bundle archive exists, that archive becomes the fallback download.

The updater should not attempt in-app bundle replacement in the first rollout.

#### Linux

Linux first-pass behavior is detection plus download routing.

If only a bundle archive exists, the updater should still report the newer version and surface the download URL.

The updater should not attempt in-app replacement in the first rollout.

### 7. Error handling and fallback semantics

Update checks must distinguish these cases:

- updater not configured
- GitHub request failed
- no published release exists for the current channel
- published release exists, but no asset matches the current platform
- current version is already latest
- newer version exists and is downloadable

The updater must not collapse "platform asset missing" into "already latest".

Stable users must never be offered prereleases.
Preview users may be offered prereleases only from the preview selection path.

GitHub Release lookup failures should not crash the desktop shell. They should return a non-fatal update result with a user-facing message that accurately describes the failure.

### 8. Migration impact

The release workflow is the first critical migration surface.

After this design lands:

- GitHub Release becomes the only required publish target
- WoAI release-admin and object-storage configuration are no longer required for a successful release run
- update-config packaging no longer embeds WoAI public API details
- updater runtime no longer depends on WoAI public payloads or download-url indirection

Code that supports old release publishing may remain temporarily if it is not on the new release critical path, but the new workflow and updater must not depend on it.

### 9. Testing

Coverage should include:

- workflow tests verifying:
  - matrix-based multi-target release jobs exist
  - the workflow targets `win-x64`, `linux-x64`, `macos-arm64`, and `macos-x64`
  - GitHub Release publication is the final release step
  - external object-storage and release-admin dependencies are not required in the workflow
- build script tests verifying:
  - target OS and arch are derived from environment inputs
  - asset names follow the release naming contract
- updater config tests verifying:
  - packaged GitHub repository settings are loaded correctly
  - WoAI URL-based defaults are no longer the source of truth
- GitHub release parsing tests verifying:
  - stable release parsing
  - preview release parsing
  - platform-specific asset selection
  - missing-platform-asset behavior
- updater behavior tests verifying:
  - Windows still supports in-app installation when a bundle is present
  - macOS and Linux report updates without attempting unsupported in-app installation

## Acceptance Criteria

- A pushed version tag produces one GitHub Release containing assets for:
  - `win-x64`
  - `linux-x64`
  - `macos-arm64`
  - `macos-x64`
- The release workflow no longer depends on object storage or release-admin APIs.
- The desktop updater no longer calls WoAI release discovery or file download APIs.
- Stable update checks resolve from non-prerelease GitHub Releases only.
- Preview update checks resolve from prerelease GitHub Releases only.
- Windows can still download and apply a bundle update in-app.
- macOS and Linux can detect newer versions and surface correct download targets without attempting unsupported in-app replacement.
- Missing platform assets are reported honestly instead of being treated as "already latest."
