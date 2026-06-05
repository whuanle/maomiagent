import { describe, expect, test } from "bun:test";

import {
  normalizeDesktopTerminalPromptShell,
  renderDesktopTerminalCreateSessionDescription,
  renderDesktopTerminalExecuteDescription,
} from "../implementation/services/desktop-terminal-shell-prompt";

describe("desktop terminal shell prompt", () => {
  test("renders cmd guidance for chaining, batch invocation, quoting, and output reads", () => {
    const shell = normalizeDesktopTerminalPromptShell({
      resolvedShellKind: "cmd",
      shellDisplayName: "cmd.exe",
    });

    const createDescription = renderDesktopTerminalCreateSessionDescription(shell);
    const executeDescription = renderDesktopTerminalExecuteDescription(shell);

    expect(createDescription).toContain("cmd.exe");
    expect(createDescription).toContain("double quotes");
    expect(createDescription).toContain("`call` before `.cmd` or `.bat`");
    expect(createDescription).toContain("`terminal_read_output`");
    expect(executeDescription).toContain("`&&`");
    expect(executeDescription).toContain("double quotes");
    expect(executeDescription).toContain("`call` before `.cmd` or `.bat`");
    expect(executeDescription).toContain("`terminal_read_output`");
    expect(executeDescription).not.toContain("Get-ChildItem");
  });

  test("renders Windows PowerShell 5.1 guidance without relying on &&", () => {
    const shell = normalizeDesktopTerminalPromptShell({
      resolvedShellKind: "powershell",
      shellDisplayName: "Windows PowerShell",
    });

    const createDescription = renderDesktopTerminalCreateSessionDescription(shell);
    const executeDescription = renderDesktopTerminalExecuteDescription(shell);

    expect(createDescription).toContain("Windows PowerShell 5.1");
    expect(createDescription).toContain("`cmd1; if ($?) { cmd2 }`");
    expect(createDescription).toContain("`& 'C:/Path With Spaces/tool.exe'`");
    expect(createDescription).toContain("unsigned `.ps1` scripts");
    expect(executeDescription).toContain("`cmd1; if ($?) { cmd2 }`");
    expect(executeDescription).toContain("`& 'C:/Path With Spaces/tool.exe'`");
    expect(executeDescription).toContain("unsigned `.ps1` scripts");
    expect(executeDescription).toContain("`terminal_read_output`");
  });

  test("renders pwsh guidance with && support plus quoting and output reads", () => {
    const shell = normalizeDesktopTerminalPromptShell({
      resolvedShellKind: "pwsh",
      shellDisplayName: "PowerShell 7+",
    });

    const createDescription = renderDesktopTerminalCreateSessionDescription(shell);
    const executeDescription = renderDesktopTerminalExecuteDescription(shell);

    expect(createDescription).toContain("PowerShell 7+");
    expect(createDescription).toContain("`&&` is available");
    expect(createDescription).toContain("`& 'C:/Path With Spaces/tool.exe'`");
    expect(executeDescription).toContain("`&&` is available");
    expect(executeDescription).toContain("`& 'C:/Path With Spaces/tool.exe'`");
    expect(executeDescription).toContain("`terminal_read_output`");
    expect(executeDescription).not.toContain("if ($?)");
  });
});
