import path from "node:path";

import { describe, expect, test } from "bun:test";

import { DesktopShellProfileService, type DesktopShellExecutableProbe } from "../implementation/services/desktop-shell-profile-service";

function normalizeWindowsPath(value: string): string {
  return path.win32.normalize(value).replaceAll("\\", "/").toLowerCase();
}

function createProbe(map: Record<string, string | null | undefined>): DesktopShellExecutableProbe {
  return {
    which(command) {
      return map[command] ?? null;
    },
    env(name) {
      return map[name] ?? null;
    },
    fileExists(filePath) {
      const normalizedTarget = normalizeWindowsPath(filePath);
      return Object.values(map).some((candidate) => (
        typeof candidate === "string" && normalizeWindowsPath(candidate) === normalizedTarget
      ));
    },
  };
}

describe("DesktopShellProfileService", () => {
  test("prefers pwsh before Windows PowerShell and cmd", () => {
    const service = new DesktopShellProfileService({
      platform: "win32",
      probe: createProbe({
        pwsh: "C:/Program Files/PowerShell/7/pwsh.exe",
        "powershell.exe": "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
        "cmd.exe": "C:/Windows/System32/cmd.exe",
      }),
    });

    expect(service.resolvePreferredShell()).toMatchObject({
      requestedKind: null,
      resolvedKind: "pwsh",
      executable: "C:/Program Files/PowerShell/7/pwsh.exe",
      displayName: "PowerShell 7+",
      isPowerShell: true,
      supportsAndAnd: true,
      source: "preferred",
    });
  });

  test("uses ComSpec before bare cmd.exe in explicit cmd mode", () => {
    const service = new DesktopShellProfileService({
      platform: "win32",
      probe: createProbe({
        ComSpec: "C:/Windows/System32/cmd.exe",
        "cmd.exe": "D:/tools/cmd.exe",
      }),
    });

    expect(service.resolveExplicitShell("cmd")).toMatchObject({
      requestedKind: "cmd",
      resolvedKind: "cmd",
      executable: "C:/Windows/System32/cmd.exe",
      displayName: "cmd.exe",
      source: "explicit",
    });
  });

  test("throws when explicit powershell cannot be resolved", () => {
    const service = new DesktopShellProfileService({
      platform: "win32",
      probe: createProbe({
        "cmd.exe": "C:/Windows/System32/cmd.exe",
      }),
    });

    expect(() => service.resolveExplicitShell("powershell")).toThrow(/powershell/i);
  });

  test("falls back to cmd in automatic mode when PowerShell-family shells are unavailable", () => {
    const service = new DesktopShellProfileService({
      platform: "win32",
      probe: createProbe({
        COMSPEC: "C:/Windows/System32/cmd.exe",
      }),
    });

    expect(service.resolvePreferredShell()).toMatchObject({
      resolvedKind: "cmd",
      executable: "C:/Windows/System32/cmd.exe",
      source: "preferred",
    });
  });

  test("prefers Git Bash before cmd when PowerShell-family shells are unavailable", () => {
    const service = new DesktopShellProfileService({
      platform: "win32",
      probe: createProbe({
        git: "C:/Program Files/Git/cmd/git.exe",
        COMSPEC: "C:/Windows/System32/cmd.exe",
        "C:/Program Files/Git/bin/bash.exe": "C:/Program Files/Git/bin/bash.exe",
      }),
    });

    expect(service.resolvePreferredShell()).toMatchObject({
      resolvedKind: "bash",
      executable: expect.stringMatching(/git[\\/]+bin[\\/]+bash\.exe$/i),
      displayName: "bash",
      isPosix: true,
      source: "preferred",
    });
  });
});
