import type { DesktopResolvedShellKind, DesktopTerminalShellKind } from "../../../terminals";

export type DesktopTerminalPromptShell = {
  resolvedShellKind: DesktopResolvedShellKind;
  shellDisplayName: string;
};

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
    return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers cmd.exe on this machine, so later terminal commands should use cmd syntax such as dir, type, call, and if exist instead of PowerShell cmdlets.";
  }

  if (shell.resolvedShellKind === "powershell") {
    return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers Windows PowerShell 5.1 on this machine, so later terminal commands should use PowerShell-native syntax and dependent commands should prefer `cmd1; if ($?) { cmd2 }` instead of `&&`.";
  }

  if (shell.resolvedShellKind === "pwsh") {
    return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers PowerShell 7+ on this machine, so later terminal commands should use PowerShell-native syntax such as Get-ChildItem or Get-Content and `&&` is available for dependent commands.";
  }

  return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers a POSIX-style shell, so later terminal commands should use POSIX shell syntax.";
}

export function renderDesktopTerminalExecuteDescription(shell: DesktopTerminalPromptShell): string {
  if (shell.resolvedShellKind === "cmd") {
    return "Execute one command in an existing terminal session. Always put the literal command text in `command`. This session is running in cmd.exe, so prefer cmd syntax such as dir, type, call, and if exist. Do not emit PowerShell cmdlets for this session.";
  }

  if (shell.resolvedShellKind === "powershell") {
    return "Execute one command in an existing terminal session. Always put the literal command text in `command`. This session is running in Windows PowerShell 5.1, so prefer PowerShell-native commands and use `cmd1; if ($?) { cmd2 }` instead of `&&` when later commands depend on earlier success.";
  }

  if (shell.resolvedShellKind === "pwsh") {
    return "Execute one command in an existing terminal session. Always put the literal command text in `command`. This session is running in PowerShell 7+, so prefer PowerShell-native commands such as Get-ChildItem or Get-Content and `&&` is available for dependent command chaining.";
  }

  return "Execute one command in an existing terminal session. Always put the literal command text in `command` and use POSIX shell syntax for the active session.";
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
