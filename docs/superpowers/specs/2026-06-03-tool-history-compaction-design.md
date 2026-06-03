# Tool History Compaction Design

Date: 2026-06-03

## Goal

Reduce follow-up turn prompt size by compacting high-volume tool history before it is encoded into provider requests.

## Confirmed Findings

- Long-running second turns are not primarily caused by frontend rendering delays.
- Large tool call inputs and tool outputs are being preserved into later turns.
- Assistant reasoning history is also preserved, which further increases prompt size.
- In the analyzed session, first-turn large file-write payloads were followed by a sharp jump in second-turn input tokens and much longer provider stream duration.

## Non-Goals

- No change to persisted conversation records.
- No change to what the user sees in the chat UI.
- No change to actual tool execution behavior.
- No cross-provider architecture rewrite in this iteration.

## Recommended Approach

Compact tool history only at prompt-encoding time.

This keeps the stored conversation authoritative while making future turns cheaper:

- storage remains full-fidelity
- UI remains full-fidelity
- provider prompt history becomes summarized for selected heavy tools

## Scope

Apply default compaction to these high-volume tools:

- `workspace_write_file`
- `workspace_read_file`
- `terminal_execute`
- `terminal_read_output`

Other tools remain unchanged in this iteration unless they obviously share the same high-volume pattern.

## Behavioral Changes

### 1. Compact heavy tool call inputs

When a heavy tool call is encoded into follow-up prompt history, large input fields should not be passed through verbatim.

Examples:

- `workspace_write_file`
  - keep: `path`, `workspaceId`
  - replace large `content` with a compact summary containing:
    - character length
    - line count
    - a short preview when safe
- `workspace_read_file`
  - keep: `path`, `workspaceId`
- `terminal_execute`
  - keep: `command`, `cwd`, `workspaceId`
  - trim command text if unusually large
- `terminal_read_output`
  - keep: session id / read target metadata

The compacted tool-call payload should still tell the model what action happened, but not replay the entire large body.

### 2. Compact heavy tool outputs

When a heavy tool result is encoded into follow-up prompt history, replace the full text body with a concise summary and metadata.

Examples:

- `workspace_write_file`
  - include path, absolute path if already available, mime type, truncated flag, character length, line count
  - summary text such as "Wrote markdown file with 1429 lines"
- `workspace_read_file`
  - include path, mime type, truncated flag, character length, line count
  - summary text such as "Read markdown file; content available in workspace storage"
- `terminal_execute`
  - include command, cwd, exit code/status when available, stdout/stderr sizes
  - summary text such as "Started PowerShell command in workspace"
- `terminal_read_output`
  - include exit code/status, stdout/stderr sizes, truncation metadata
  - summary text such as "Terminal output contained an indentation error"

The provider should receive enough information to continue reasoning without dragging the entire file body or terminal transcript forward.

### 3. Preserve ability to re-fetch full content

Because storage remains unchanged, the model can still recover full detail by calling tools again:

- read the file again
- inspect terminal output again
- re-open a generated artifact

This is an intentional tradeoff: cheap default history, explicit re-read when needed.

### 4. Keep compaction targeted and explicit

Compaction logic should live in a focused helper used by prompt encoding or prompt normalization.

The implementation should avoid:

- sprinkling ad hoc truncation rules across many call sites
- mutating stored conversation messages
- provider-specific duplication when a shared preprocessing seam is sufficient

## Data Rules

### File-oriented summaries

For file tools, include:

- path
- workspace identifier when available
- mime type when available
- `truncated`
- character count
- line count
- short content preview only if very small and safe

Never carry the full file body forward for the targeted heavy tools.

### Terminal-oriented summaries

For terminal tools, include:

- command or command preview
- cwd when available
- exit code or running/completed/failed status
- stdout byte count
- stderr byte count
- truncation metadata
- short error preview when available

Never carry full terminal output forward for the targeted heavy tools.

## Reasoning History

This iteration does not fully remove assistant reasoning history.

However, the design should keep the compaction helper structured so a follow-up iteration can also compact or omit historical reasoning for older tool turns.

## Error Handling

- If compaction fails for a message, fall back to the existing unmodified history for correctness, but emit a runtime warning.
- Compaction must never produce invalid provider payload structure.
- Small non-targeted tool history must remain unchanged.

## Testing

Add focused coverage for:

- `workspace_write_file` tool call inputs are summarized before prompt encoding
- `workspace_write_file` tool results are summarized before prompt encoding
- `terminal_*` tool results are summarized before prompt encoding
- non-targeted tools remain unchanged
- persisted conversation detail still contains the original full text

## Rollout Notes

- This is an internal prompt-size optimization only.
- The success metric is lower follow-up prompt volume and fewer long second-turn stalls/timeouts.
- After release, compare:
  - second-turn input tokens before vs after
  - provider first-byte latency on follow-up turns
  - timeout frequency for large file-editing conversations
