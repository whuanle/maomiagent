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
    return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers cmd.exe on this machine, so later terminal commands should use cmd syntax such as dir, type, call, and if exist instead of PowerShell cmdlets. Quote paths with spaces by wrapping them in double quotes, use `call` before `.cmd` or `.bat` files when later steps should continue in the same session, and inspect command results with `terminal_read_output` instead of adding paging commands.";
  }

  if (shell.resolvedShellKind === "powershell") {
    return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers Windows PowerShell 5.1 on this machine, so later terminal commands should use PowerShell-native syntax and dependent commands should prefer `cmd1; if ($?) { cmd2 }` instead of `&&`. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, avoid assuming unsigned `.ps1` scripts are runnable on every machine, and inspect command results with `terminal_read_output` instead of embedding paging commands.";
  }

  if (shell.resolvedShellKind === "pwsh") {
    return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers PowerShell 7+ on this machine, so later terminal commands should use PowerShell-native syntax such as Get-ChildItem or Get-Content and `&&` is available for dependent commands. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, and inspect command results with `terminal_read_output` instead of embedding paging commands.";
  }

  return "Create a terminal session that can be reused for command execution and output inspection. This runtime currently prefers a POSIX-style shell, so later terminal commands should use POSIX shell syntax, quote paths with spaces, and inspect command results with `terminal_read_output` instead of embedding paging commands.";
}

export function renderDesktopTerminalExecuteDescription(shell: DesktopTerminalPromptShell): string {
  if (shell.resolvedShellKind === "cmd") {
    return "Execute one command in an existing terminal session. Always put the literal command text in `command`. This session is running in cmd.exe, so prefer cmd syntax such as dir, type, call, and if exist. Quote paths with spaces by wrapping them in double quotes, use `&&` only when later commands depend on earlier success, use `call` before `.cmd` or `.bat` files when later steps should continue in the same session, and inspect command results with `terminal_read_output` instead of embedding paging or truncation commands. Do not emit PowerShell cmdlets for this session.";
  }

  if (shell.resolvedShellKind === "powershell") {
    return "Execute one command in an existing terminal session. Always put the literal command text in `command`. This session is running in Windows PowerShell 5.1, so prefer PowerShell-native commands and use `cmd1; if ($?) { cmd2 }` instead of `&&` when later commands depend on earlier success. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, avoid assuming unsigned `.ps1` scripts are runnable on every machine, and inspect command results with `terminal_read_output` instead of embedding paging or truncation commands.";
  }

  if (shell.resolvedShellKind === "pwsh") {
    return "Execute one command in an existing terminal session. Always put the literal command text in `command`. This session is running in PowerShell 7+, so prefer PowerShell-native commands such as Get-ChildItem or Get-Content and `&&` is available for dependent command chaining. Quote paths with spaces, use the call operator like `& 'C:/Path With Spaces/tool.exe'` when invoking a path directly, and inspect command results with `terminal_read_output` instead of embedding paging or truncation commands.";
  }

  return "Execute one command in an existing terminal session. Always put the literal command text in `command`, use POSIX shell syntax for the active session, quote paths with spaces, and inspect command results with `terminal_read_output` instead of embedding paging or truncation commands.";
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
