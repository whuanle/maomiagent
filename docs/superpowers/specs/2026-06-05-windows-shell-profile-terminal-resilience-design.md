# Windows Shell Profile And Terminal Resilience Design

## Context

The current desktop terminal flow is fragile on Windows because shell selection is hard-coded in the terminal service and the conversation tools describe Windows execution as if PowerShell were always available and appropriate.

Today the runtime behavior is roughly:

- `terminal_create_session` or `terminal_execute` reaches `DesktopTerminalsService`
- `DesktopTerminalsService` maps `shellKind` directly to a fixed executable and fixed startup args
- the created session keeps only the coarse `shellKind`
- conversation tool descriptions tell the model to prefer PowerShell-native commands on Windows

This creates several failure modes:

- machines where `powershell.exe` exists but is restricted, broken, or not suitable still default to PowerShell
- `pwsh` and Windows PowerShell 5.1 are treated as one concept even though command chaining and behavior differ
- `cmd.exe` fallback is not modeled as a first-class shell, so the AI can keep producing PowerShell syntax while the session is actually running in `cmd`
- shell selection logic is buried inside terminal startup instead of being a reusable runtime capability

`opencode` handles this more robustly by separating shell discovery and shell metadata from PTY creation, then using the resolved shell to drive both execution and prompt generation. We should adopt the same shape in the desktop architecture.

## Goals

- Make Windows terminal session startup resilient without relying on one hard-coded default shell.
- Introduce a first-class shell profile abstraction that can be reused by terminal startup and AI tool descriptions.
- Keep shell choice stable for the lifetime of a terminal session.
- Make the AI aware of the real shell in use so generated commands match the current environment.
- Preserve backwards compatibility for existing tool calls that pass `shellKind` or omit it entirely.

## Non-Goals

- Replacing the terminal session model with a one-shot command runner in this iteration.
- Building a new settings UI for shell preference selection in this iteration.
- Translating commands between shells after a session has already been created.
- General shell environment probing on desktop startup outside the terminal module.

## Design Summary

Add a new `DesktopShellProfile` capability inside the terminals module. This capability is responsible for discovering available shells, resolving the preferred shell for the current machine, resolving explicit shell requests, and returning a normalized profile object with metadata required by both PTY startup and AI prompt generation.

`DesktopTerminalsService` stops hard-coding Windows shell startup logic. Instead it asks the profile resolver for a concrete shell profile, starts the terminal host with that profile, and stores both requested shell information and resolved shell information on the session record.

Conversation builtin tools stop assuming that all Windows sessions should be treated as PowerShell sessions. Tool descriptions and tool results should reflect the resolved shell profile so the model can produce shell-appropriate command syntax.

## New Runtime Model

### DesktopShellKind

The existing public shell kinds remain:

- `powershell`
- `cmd`
- `bash`
- `sh`

Internally we add a more precise resolved shell identity so that `pwsh` and Windows PowerShell are no longer collapsed into the same runtime meaning.

### DesktopResolvedShellKind

Introduce an internal resolved kind:

- `pwsh`
- `powershell`
- `cmd`
- `bash`
- `sh`

This internal kind is derived from the real executable path or resolved command.

### DesktopShellProfile

Add a normalized profile object:

```ts
type DesktopShellProfile = {
  requestedKind: DesktopTerminalShellKind | null;
  resolvedKind: "pwsh" | "powershell" | "cmd" | "bash" | "sh";
  executable: string;
  args: string[];
  displayName: string;
  acceptable: boolean;
  isPowerShell: boolean;
  isPosix: boolean;
  supportsAndAnd: boolean;
  source: "preferred" | "explicit";
};
```

Field intent:

- `requestedKind`: the shell kind explicitly requested by the caller, or `null` when the runtime picked the shell automatically
- `resolvedKind`: the actual shell identity used by the process
- `executable`: the concrete binary path or command to spawn
- `args`: startup args for the interactive session
- `displayName`: UI- and tool-friendly name such as `PowerShell 7+`, `Windows PowerShell`, or `cmd.exe`
- `acceptable`: whether the shell is valid as an automatic default
- `isPowerShell`: whether the shell uses PowerShell semantics
- `isPosix`: whether the shell uses POSIX semantics
- `supportsAndAnd`: whether `&&` is safe for dependent command chaining in that shell
- `source`: whether the shell came from automatic selection or explicit request

## Shell Discovery Strategy

### Windows Candidate Order

Windows automatic selection uses the following candidate order, aligned with `opencode`:

1. `pwsh`
2. `powershell.exe`
3. Git Bash
4. `COMSPEC`
5. `cmd.exe`

Rules:

- Use the first candidate that resolves to a real executable and is marked acceptable.
- `pwsh` and `powershell.exe` are both acceptable defaults.
- Git Bash is acceptable when discovered from the Git installation.
- `cmd.exe` is acceptable as the last built-in fallback.

### Non-Windows Candidate Order

Non-Windows behavior remains simple:

- prefer explicit shell request when valid
- otherwise use `bash` when available
- otherwise use `sh`

We do not need to reproduce the full `opencode` shell catalog on non-Windows in this iteration because the reported robustness problem is Windows-specific and the current Linux/macOS path is already adequate.

### Explicit Resolution

If the caller explicitly requests a shell kind:

- `powershell` resolves to the best available PowerShell-family executable according to:
  - explicit `pwsh` if present is not substituted automatically
  - `powershell` request resolves to Windows PowerShell only
- `cmd` resolves to `COMSPEC` first, then `cmd.exe`
- `bash` resolves to Git Bash on Windows or `bash` on non-Windows
- `sh` resolves to `sh`

If the explicit shell cannot be resolved, creation fails with a clear error. We do not silently switch to another shell in explicit mode, because that would break the contract between the caller and the runtime.

### Automatic Resolution

If the caller does not explicitly request a shell kind:

- resolve the preferred shell from the platform-specific candidate list
- on Windows, prefer `pwsh` when present
- use `cmd.exe` only when PowerShell-family shells and Git Bash are unavailable

Automatic fallback happens only during shell selection. Once a session exists, its shell is fixed.

## PTY Startup Integration

### Service Boundary

Add a new service under the terminals module, for example:

- `apps/desktop/MaomiAgent/src/bun/modules/terminals/implementation/services/desktop-shell-profile-service.ts`

This service exposes:

- `resolvePreferredShell()`
- `resolveExplicitShell(kind: DesktopTerminalShellKind)`
- `listAvailableShells()` for diagnostics and future UI use

`DesktopTerminalsService.create()` should:

1. read the requested `shellKind`
2. resolve a `DesktopShellProfile`
3. launch the PTY host using `profile.executable` and `profile.args`
4. store requested and resolved shell metadata on the session record

### Session Record Changes

Extend `DesktopTerminalSessionRecord` with:

- `requestedShellKind?: DesktopTerminalShellKind`
- `resolvedShellKind?: "pwsh" | "powershell" | "cmd" | "bash" | "sh"`
- `resolvedShellCommand?: string`
- `shellDisplayName?: string`

Behavior:

- existing `shellKind` stays for compatibility and should represent the resolved public-facing shell family
- when `resolvedShellKind === "pwsh"` the public `shellKind` remains `powershell`
- when `requestedShellKind` is absent, the session was created in automatic mode

This keeps existing consumers working while giving enough precision for prompt generation and diagnostics.

### Startup Arguments

Initial shell startup arguments should be normalized in the shell profile service:

- `pwsh`: `["-NoLogo", "-NoProfile"]`
- `powershell.exe`: `["-NoLogo", "-NoProfile"]`
- `cmd.exe`: `["/D"]`
- `bash`: `["--noprofile", "--norc", "-i"]`
- `sh`: `["-i"]`

We should not keep `-NoExit` or `/K` in the shell profile args because the PTY itself is already interactive and long-lived. The current host starts the shell process inside the PTY; it does not need an outer one-shot command mode. The service should validate this during implementation against `node-pty` behavior and keep arguments minimal.

## Conversation Tool Changes

### Problem

The current builtin tool descriptions hard-code PowerShell guidance on Windows:

- create session description says Windows should prefer PowerShell sessions
- execute description says Windows should prefer PowerShell-native commands

This becomes misleading when the resolved shell is actually `cmd` or Git Bash.

### Tool Catalog Behavior

Conversation builtin tools should render shell guidance from a helper that consumes a `DesktopShellProfile` or a resolved shell name.

We do not need to expose multiple shell-specific tools. We keep the same tool names:

- `terminal_create_session`
- `terminal_execute`
- `terminal_read_output`
- `terminal_close_session`

But their descriptions and result metadata become shell-aware.

### Description Strategy

Introduce a shell prompt helper similar in spirit to `opencode/src/tool/shell/prompt.ts`.

For `powershell` / `pwsh`:

- explain PowerShell-native command style
- note that `pwsh` supports `&&`
- note that Windows PowerShell 5.1 should use `cmd1; if ($?) { cmd2 }` instead of `&&`

For `cmd`:

- explain `cmd.exe` command style
- avoid PowerShell cmdlet examples
- emphasize `call`, `%VAR%`, and `if exist` semantics

For `bash` / `sh`:

- keep POSIX-oriented guidance

The rendered description should be chosen using:

- explicit shell if the tool call is creating a new session with `shellKind`
- latest active session shell when executing in an existing session
- default preferred shell when neither is available

### Tool Result Metadata

`terminal_create_session` result should include:

- `requestedShellKind`
- `resolvedShellKind`
- `shellDisplayName`

`terminal_execute` result should include:

- `shellKind`
- `resolvedShellKind`
- `shellDisplayName`

This gives the model feedback about what actually happened and lets future tool prompts remain consistent across turns.

## Failure Semantics

### Explicit Shell Failure

If an explicit shell request cannot be resolved:

- return a terminal creation failure
- include the requested shell kind in the error metadata
- do not silently substitute another shell

### Automatic Resolution Failure

If automatic selection cannot resolve any shell:

- return a clear terminal creation failure
- include the candidate list inspected for the current platform

### Startup Failure After Resolution

If a shell resolves but the PTY host cannot start it:

- automatic mode may continue to the next acceptable candidate on Windows
- explicit mode must fail immediately

This preserves the core robustness benefit while keeping explicit caller intent strict.

### Existing Session Execution

`terminal_execute` never changes the shell of an already-created session.

If a session no longer exists and `terminal_execute` auto-creates a new one from a free-form session label, shell resolution runs again for the new session. This is the only case where fallback may happen after a missing session.

## Configuration

Add a future-facing optional shell preference input in the terminal resolver, but do not require UI work in this iteration.

The design should leave room for:

- persisted desktop preference
- workspace-level preference
- conversation/session-level explicit shell request

Resolution priority should be:

1. explicit tool input
2. future persisted shell preference
3. automatic platform default

This spec only requires support for item 1 and item 3, but the resolver API should not block item 2.

## Module Layout

Keep the changes inside the existing terminals module with focused files.

Suggested additions:

- `apps/desktop/MaomiAgent/src/bun/modules/terminals/implementation/services/desktop-shell-profile-service.ts`
- `apps/desktop/MaomiAgent/src/bun/modules/terminals/implementation/services/desktop-shell-profile.models.ts`
- optional tests under `apps/desktop/MaomiAgent/src/bun/modules/terminals/tests`

Conversation tool prompt helpers can live under the conversation module in a dedicated helper file rather than inside the existing large builtin tool file.

Suggested helper:

- `apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-terminal-shell-prompt.ts`

## Data Flow

### Create Session

1. tool handler normalizes input
2. `DesktopTerminalsService.create()` requests a shell profile
3. shell profile resolver resolves automatic or explicit shell
4. PTY host starts the resolved executable with resolved startup args
5. session record is persisted with requested and resolved shell metadata
6. tool result returns the resolved shell metadata

### Execute Command

1. tool handler resolves target session
2. tool handler reads resolved shell metadata from that session or from recent tool results
3. tool description for subsequent turns is rendered against that shell
4. command text is written verbatim into the existing session
5. execution result echoes the shell metadata

## Testing Plan

### Terminal Resolver Tests

Add unit coverage for:

- Windows preferred shell ordering
- `COMSPEC` preference over bare `cmd.exe`
- explicit resolution failures
- `pwsh` vs `powershell.exe` distinction
- Git Bash detection

These tests should avoid depending on the real machine shell inventory by stubbing executable discovery.

### DesktopTerminalsService Tests

Add tests for:

- automatic session creation stores requested and resolved shell metadata
- explicit shell request creates the expected shell profile
- automatic creation falls back to `cmd` when PowerShell-family shells are unavailable
- explicit `powershell` request fails cleanly when unavailable

### Conversation Tool Tests

Add tests for:

- `terminal_create_session` result includes resolved shell metadata
- `terminal_execute` result preserves resolved shell metadata
- shell-specific tool descriptions differ for `cmd` and `powershell`
- `terminal_execute` auto-create path uses the resolver and returns the resolved shell

## Risks And Mitigations

### Risk: Hidden Shell Drift

If execution prompt generation guesses the shell independently from the session record, the AI can drift back to the wrong syntax.

Mitigation:

- drive prompt rendering from session metadata wherever possible
- only use preferred-shell fallback before the first session exists

### Risk: Overloading `shellKind`

If we overload the existing `shellKind` field with `pwsh`, we will break existing consumers.

Mitigation:

- keep public `shellKind` coarse and stable
- add separate resolved-shell fields for precision

### Risk: Partial Fallback Semantics

If we silently fall back after an explicit request, debugging becomes harder and the user loses control.

Mitigation:

- fallback only in automatic mode
- explicit mode fails clearly

## Rollout

Implementation should happen in this order:

1. add shell profile models and resolver service
2. update `DesktopTerminalsService` to consume the resolver
3. extend session record/tool results with resolved shell metadata
4. add shell-aware conversation prompt helper
5. update tests

## Open Decisions

No open product decision remains for this iteration. The shell profile layer, Windows candidate order, explicit-versus-automatic behavior, and session metadata strategy are fixed by this spec.
