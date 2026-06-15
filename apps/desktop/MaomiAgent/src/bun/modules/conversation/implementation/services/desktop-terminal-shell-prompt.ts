import type { DesktopResolvedShellKind, DesktopTerminalShellKind } from "../../../terminals";

export type DesktopTerminalPromptShell = {
  resolvedShellKind: DesktopResolvedShellKind;
  shellDisplayName: string;
};

export type DesktopTerminalCommandValidation = {
  code: "terminal_shell_command_mismatch";
  message: string;
  suggestedPattern: string;
};

const CMD_INCOMPATIBLE_POWERSHELL_COMMAND_RE = /\b(?:Get-ChildItem|Get-Content|Get-Location|Set-Location|Test-Path|Select-Object|Out-File|Set-Content|Add-Content|Remove-Item|Copy-Item|Move-Item|New-Item|Write-Host)\b|(?:^|[\s;(])(?:Get|Set|Remove|Move|Copy|New|Test|Select|Write|Out|Add)-[A-Za-z][\w-]*\b|\$(?:env:[A-Za-z_][A-Za-z0-9_]*|PWD|HOME|\?)/u;
const POWERSHELL_INCOMPATIBLE_CMD_COMMAND_RE = /\bif\s+exist\b|%[A-Za-z_][A-Za-z0-9_]*%|^\s*call\b|(?:^|[\s;(])(?:setlocal|endlocal)\b|^\s*for\s+\/[fdrl]/iu;

export function normalizeDesktopTerminalPromptShell(input: {
  resolvedShellKind?: DesktopResolvedShellKind;
  shellKind?: DesktopTerminalShellKind;
  shellDisplayName?: string;
}): DesktopTerminalPromptShell {
  const resolvedShellKind = input.resolvedShellKind
    ?? (input.shellKind === "powershell" ? "powershell" : input.shellKind)
    ?? "sh";

  return {
    resolvedShellKind,
    shellDisplayName: input.shellDisplayName ?? resolveShellDisplayName(resolvedShellKind),
  };
}

export function renderDesktopTerminalCreateSessionDescription(shell: DesktopTerminalPromptShell): string {
  if (shell.resolvedShellKind === "cmd") {
    return "Open a shell session when later commands need to share the same state. This runtime currently prefers cmd.exe on this machine, so later commands should use cmd syntax such as dir, type, call, and if exist instead of PowerShell cmdlets. Quote paths with spaces by wrapping them in double quotes, use `call` before `.cmd` or `.bat` files when later steps should continue in the same session, and rely on captured output instead of adding paging commands.";
  }

  if (shell.resolvedShellKind === "powershell") {
    return "Open a shell session when later commands need to share the same state. This runtime currently prefers Windows PowerShell 5.1 on this machine, so later commands should use PowerShell-native syntax and dependent commands should prefer `cmd1; if ($?) { cmd2 }` instead of `&&`. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, avoid assuming unsigned `.ps1` scripts are runnable on every machine, and rely on captured output instead of adding paging commands.";
  }

  if (shell.resolvedShellKind === "pwsh") {
    return "Open a shell session when later commands need to share the same state. This runtime currently prefers PowerShell 7+ on this machine, so later commands should use PowerShell-native syntax such as Get-ChildItem or Get-Content and `&&` is available for dependent commands. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, and rely on captured output instead of adding paging commands.";
  }

  return "Open a shell session when later commands need to share the same state. This runtime currently prefers a POSIX-style shell, so later commands should use POSIX shell syntax, quote paths with spaces, and rely on captured output instead of adding paging commands.";
}

export function renderDesktopTerminalExecuteDescription(shell: DesktopTerminalPromptShell): string {
  if (shell.resolvedShellKind === "cmd") {
    return "Execute one command and return the latest captured output. Reuse `sessionId` when you need the same shell state, otherwise this tool can create a session for you. This session is running in cmd.exe, so prefer cmd syntax such as dir, type, call, and if exist. Quote paths with spaces by wrapping them in double quotes, use `&&` only when later commands depend on earlier success, use `call` before `.cmd` or `.bat` files when later steps should continue in the same session, and rely on the returned output instead of adding shell paging or truncation. Do not emit PowerShell cmdlets for this session.";
  }

  if (shell.resolvedShellKind === "powershell") {
    return "Execute one command and return the latest captured output. Reuse `sessionId` when you need the same shell state, otherwise this tool can create a session for you. This session is running in Windows PowerShell 5.1, so prefer PowerShell-native commands and use `cmd1; if ($?) { cmd2 }` instead of `&&` when later commands depend on earlier success. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, avoid assuming unsigned `.ps1` scripts are runnable on every machine, and rely on the returned output instead of adding shell paging or truncation.";
  }

  if (shell.resolvedShellKind === "pwsh") {
    return "Execute one command and return the latest captured output. Reuse `sessionId` when you need the same shell state, otherwise this tool can create a session for you. This session is running in PowerShell 7+, so prefer PowerShell-native commands such as Get-ChildItem or Get-Content and `&&` is available for dependent command chaining. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, and rely on the returned output instead of adding shell paging or truncation.";
  }

  return "Execute one command and return the latest captured output. Reuse `sessionId` when you need the same shell state, otherwise this tool can create a session for you. Always put the literal command text in `command`, use POSIX shell syntax for the active session, quote paths with spaces, and rely on the returned output instead of adding shell paging or truncation.";
}

export function validateDesktopTerminalCommandForShell(input: {
  shell: DesktopTerminalPromptShell;
  command: string;
}): DesktopTerminalCommandValidation | undefined {
  const command = input.command.trim();
  if (!command) {
    return undefined;
  }

  // Keep this intentionally narrow: we only block commands that are very likely to
  // fail in the current shell, and we avoid rewriting or "fixing" commands here.
  if (input.shell.resolvedShellKind === "cmd" && CMD_INCOMPATIBLE_POWERSHELL_COMMAND_RE.test(command)) {
    return {
      code: "terminal_shell_command_mismatch",
      message: "This session is running in cmd.exe, but the command looks like PowerShell syntax. Rewrite it using cmd.exe syntax or create a PowerShell session first.",
      suggestedPattern: "Use cmd.exe syntax such as `dir`, `type`, `if exist`, and `%VAR%` in this session.",
    };
  }

  if (
    (input.shell.resolvedShellKind === "powershell" || input.shell.resolvedShellKind === "pwsh")
    && POWERSHELL_INCOMPATIBLE_CMD_COMMAND_RE.test(command)
  ) {
    return {
      code: "terminal_shell_command_mismatch",
      message: `This session is running in ${input.shell.shellDisplayName}, but the command looks like cmd.exe or batch syntax. Rewrite it using PowerShell syntax or create a cmd session first.`,
      suggestedPattern: input.shell.resolvedShellKind === "powershell"
        ? "Use PowerShell syntax such as `Get-ChildItem` and `cmd1; if ($?) { cmd2 }` in this session."
        : "Use PowerShell syntax such as `Get-ChildItem` and `cmd1 && cmd2` in this session.",
    };
  }

  return undefined;
}

function resolveShellDisplayName(kind: DesktopResolvedShellKind): string {
  if (kind === "pwsh") {
    return "PowerShell 7+";
  }

  if (kind === "powershell") {
    return "Windows PowerShell";
  }

  if (kind === "cmd") {
    return "cmd.exe";
  }

  return kind;
}
