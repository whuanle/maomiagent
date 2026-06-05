import type { DesktopTerminalShellKind } from "../../abstraction/models/desktop-terminals.models";

export type DesktopResolvedShellKind = "pwsh" | "powershell" | "cmd" | "bash" | "sh";

export type DesktopShellProfile = {
  requestedKind: DesktopTerminalShellKind | null;
  resolvedKind: DesktopResolvedShellKind;
  executable: string;
  args: string[];
  displayName: string;
  acceptable: boolean;
  isPowerShell: boolean;
  isPosix: boolean;
  supportsAndAnd: boolean;
  source: "preferred" | "explicit";
};
