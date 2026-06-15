import { describe, expect, test } from "bun:test";

import {
  normalizeDesktopTerminalPromptShell,
  renderDesktopTerminalCreateSessionDescription,
  renderDesktopTerminalExecuteDescription,
  validateDesktopTerminalCommandForShell,
} from "../implementation/services/desktop-terminal-shell-prompt";

describe("desktop terminal shell prompt", () => {
  test("renders cmd guidance for chaining, batch invocation, quoting, and captured output", () => {
    const shell = normalizeDesktopTerminalPromptShell({
      resolvedShellKind: "cmd",
      shellDisplayName: "cmd.exe",
    });

    const createDescription = renderDesktopTerminalCreateSessionDescription(shell);
    const executeDescription = renderDesktopTerminalExecuteDescription(shell);

    expect(createDescription).toContain("cmd.exe");
    expect(createDescription).toContain("double quotes");
    expect(createDescription).toContain("`call` before `.cmd` or `.bat`");
    expect(createDescription).toContain("captured output");
    expect(executeDescription).toContain("`&&`");
    expect(executeDescription).toContain("double quotes");
    expect(executeDescription).toContain("`call` before `.cmd` or `.bat`");
    expect(executeDescription).toContain("returned output");
    expect(executeDescription).toContain("create a session for you");
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
    expect(executeDescription).toContain("returned output");
    expect(executeDescription).toContain("create a session for you");
  });

  test("renders pwsh guidance with && support plus quoting and captured output", () => {
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
    expect(executeDescription).toContain("returned output");
    expect(executeDescription).toContain("create a session for you");
    expect(executeDescription).not.toContain("if ($?)");
  });

  test("flags PowerShell syntax in cmd sessions", () => {
    const shell = normalizeDesktopTerminalPromptShell({
      resolvedShellKind: "cmd",
      shellDisplayName: "cmd.exe",
    });

    expect(validateDesktopTerminalCommandForShell({
      shell,
      command: "Get-ChildItem -Force",
    })).toEqual(expect.objectContaining({
      code: "terminal_shell_command_mismatch",
      suggestedPattern: expect.stringContaining("cmd.exe syntax"),
    }));
  });

  test("flags cmd syntax in Windows PowerShell sessions", () => {
    const shell = normalizeDesktopTerminalPromptShell({
      resolvedShellKind: "powershell",
      shellDisplayName: "Windows PowerShell",
    });

    expect(validateDesktopTerminalCommandForShell({
      shell,
      command: "if exist package.json type package.json",
    })).toEqual(expect.objectContaining({
      code: "terminal_shell_command_mismatch",
      suggestedPattern: expect.stringContaining("PowerShell syntax"),
    }));
  });
});
