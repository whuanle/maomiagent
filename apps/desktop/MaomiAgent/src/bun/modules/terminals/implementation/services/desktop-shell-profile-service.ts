import { existsSync } from "node:fs";
import path from "node:path";

import type { DesktopTerminalShellKind } from "../../abstraction/models/desktop-terminals.models";
import type {
  DesktopResolvedShellKind,
  DesktopShellProfile,
} from "./desktop-shell-profile.models";

export type DesktopShellExecutableProbe = {
  which(command: string): string | null;
  env(name: string): string | null;
  fileExists(filePath: string): boolean;
};

type DesktopShellProfileServiceInput = {
  platform?: NodeJS.Platform;
  probe?: DesktopShellExecutableProbe;
};

type ShellCandidate = {
  resolvedKind: DesktopResolvedShellKind;
  executable: string;
  acceptable: boolean;
};

const DEFAULT_PROBE: DesktopShellExecutableProbe = {
  which(command) {
    return Bun.which(command) ?? null;
  },
  env(name) {
    const envName = Object.keys(process.env).find((key) => key.toLowerCase() === name.toLowerCase());
    const value = envName ? process.env[envName] : undefined;
    return typeof value === "string" && value.trim() ? value : null;
  },
  fileExists(filePath) {
    return existsSync(filePath);
  },
};

export class DesktopShellProfileService {
  private readonly platform: NodeJS.Platform;
  private readonly probe: DesktopShellExecutableProbe;

  constructor(input: DesktopShellProfileServiceInput = {}) {
    this.platform = input.platform ?? process.platform;
    this.probe = input.probe ?? DEFAULT_PROBE;
  }

  resolvePreferredShell(): DesktopShellProfile {
    if (this.platform === "win32") {
      const candidate = this.resolveFirstWindowsCandidate();
      if (candidate) {
        return this.createProfile(candidate, {
          requestedKind: null,
          source: "preferred",
        });
      }

      throw new Error("No supported Windows shell was found. Checked pwsh, powershell.exe, Git Bash, COMSPEC, and cmd.exe.");
    }

    const bash = this.resolvePosixCommand("bash");
    if (bash) {
      return this.createProfile({
        resolvedKind: "bash",
        executable: bash,
        acceptable: true,
      }, {
        requestedKind: null,
        source: "preferred",
      });
    }

    const sh = this.resolvePosixCommand("sh");
    if (sh) {
      return this.createProfile({
        resolvedKind: "sh",
        executable: sh,
        acceptable: true,
      }, {
        requestedKind: null,
        source: "preferred",
      });
    }

    throw new Error("No supported POSIX shell was found. Checked bash and sh.");
  }

  resolveExplicitShell(kind: DesktopTerminalShellKind): DesktopShellProfile {
    const candidate = this.resolveExplicitCandidate(kind);
    if (!candidate) {
      throw new Error(`Requested shell is unavailable: ${kind}`);
    }

    return this.createProfile(candidate, {
      requestedKind: kind,
      source: "explicit",
    });
  }

  listAvailableShells(): DesktopShellProfile[] {
    if (this.platform === "win32") {
      return this.listWindowsCandidates().map((candidate) => this.createProfile(candidate, {
        requestedKind: null,
        source: "preferred",
      }));
    }

    return (["bash", "sh"] as const)
      .map((command) => {
        const executable = this.resolvePosixCommand(command);
        if (!executable) {
          return null;
        }

        return this.createProfile({
          resolvedKind: command as DesktopResolvedShellKind,
          executable,
          acceptable: true,
        }, {
          requestedKind: null,
          source: "preferred",
        });
      })
      .filter((item): item is DesktopShellProfile => Boolean(item));
  }

  private resolveExplicitCandidate(kind: DesktopTerminalShellKind): ShellCandidate | null {
    if (this.platform === "win32") {
      if (kind === "powershell") {
        return this.resolveWindowsPowerShell();
      }

      if (kind === "cmd") {
        return this.resolveWindowsComSpec() ?? this.resolveWindowsCmd();
      }

      if (kind === "bash") {
        return this.resolveWindowsGitBash() ?? this.resolvePosixCommandCandidate("bash");
      }

      return this.resolvePosixCommandCandidate("sh");
    }

    if (kind === "powershell") {
      return this.resolveCrossPlatformPowerShell();
    }

    if (kind === "cmd") {
      return null;
    }

    if (kind === "bash") {
      return this.resolvePosixCommandCandidate("bash");
    }

    return this.resolvePosixCommandCandidate("sh");
  }

  private resolveFirstWindowsCandidate(): ShellCandidate | null {
    for (const candidate of this.listWindowsCandidates()) {
      if (candidate.acceptable) {
        return candidate;
      }
    }

    return null;
  }

  private listWindowsCandidates(): ShellCandidate[] {
    return [
      this.resolveWindowsPwsh(),
      this.resolveWindowsPowerShell(),
      this.resolveWindowsGitBash(),
      this.resolveWindowsComSpec(),
      this.resolveWindowsCmd(),
    ].filter((item): item is ShellCandidate => Boolean(item));
  }

  private resolveWindowsPwsh(): ShellCandidate | null {
    const executable = this.resolveCommand("pwsh") ?? this.resolveCommand("pwsh.exe");
    return executable
      ? {
          resolvedKind: "pwsh",
          executable,
          acceptable: true,
        }
      : null;
  }

  private resolveWindowsPowerShell(): ShellCandidate | null {
    const executable = this.resolveCommand("powershell.exe") ?? this.resolveCommand("powershell");
    return executable
      ? {
          resolvedKind: "powershell",
          executable,
          acceptable: true,
        }
      : null;
  }

  private resolveWindowsGitBash(): ShellCandidate | null {
    const gitPath = this.resolveCommand("git");
    if (!gitPath) {
      return null;
    }

    const candidates = [
      // Common Git for Windows layout when `git.exe` resolves to `Git\\cmd\\git.exe`.
      path.win32.join(path.win32.dirname(gitPath), "..", "bin", "bash.exe"),
      // Alternate layouts when `git.exe` resolves inside `Git\\mingw64\\bin` or `Git\\usr\\bin`.
      path.win32.join(path.win32.dirname(gitPath), "..", "..", "bin", "bash.exe"),
    ];

    for (const candidate of candidates) {
      if (!this.probe.fileExists(candidate)) {
        continue;
      }

      return {
        resolvedKind: "bash",
        executable: candidate,
        acceptable: true,
      };
    }

    return null;
  }

  private resolveWindowsComSpec(): ShellCandidate | null {
    const executable = this.probe.env("ComSpec") ?? this.probe.env("COMSPEC");
    if (!executable) {
      return null;
    }

    return {
      resolvedKind: "cmd",
      executable,
      acceptable: true,
    };
  }

  private resolveWindowsCmd(): ShellCandidate | null {
    const executable = this.resolveCommand("cmd.exe") ?? this.resolveCommand("cmd");
    return executable
      ? {
          resolvedKind: "cmd",
          executable,
          acceptable: true,
        }
      : null;
  }

  private resolveCrossPlatformPowerShell(): ShellCandidate | null {
    const executable = this.resolveCommand("pwsh") ?? this.resolveCommand("pwsh.exe")
      ?? this.resolveCommand("powershell") ?? this.resolveCommand("powershell.exe");
    if (!executable) {
      return null;
    }

    return {
      resolvedKind: this.readExecutableName(executable) === "pwsh" ? "pwsh" : "powershell",
      executable,
      acceptable: true,
    };
  }

  private resolvePosixCommandCandidate(command: "bash" | "sh"): ShellCandidate | null {
    const executable = this.resolvePosixCommand(command);
    return executable
      ? {
          resolvedKind: command,
          executable,
          acceptable: true,
        }
      : null;
  }

  private resolvePosixCommand(command: "bash" | "sh"): string | null {
    return this.resolveCommand(command);
  }

  private resolveCommand(command: string): string | null {
    const resolved = this.probe.which(command);
    return typeof resolved === "string" && resolved.trim() ? resolved.trim() : null;
  }

  private createProfile(
    candidate: ShellCandidate,
    input: {
      requestedKind: DesktopTerminalShellKind | null;
      source: "preferred" | "explicit";
    },
  ): DesktopShellProfile {
    return {
      requestedKind: input.requestedKind,
      resolvedKind: candidate.resolvedKind,
      executable: candidate.executable,
      args: this.resolveStartupArgs(candidate.resolvedKind),
      displayName: this.resolveDisplayName(candidate.resolvedKind),
      acceptable: candidate.acceptable,
      isPowerShell: candidate.resolvedKind === "pwsh" || candidate.resolvedKind === "powershell",
      isPosix: candidate.resolvedKind === "bash" || candidate.resolvedKind === "sh",
      supportsAndAnd: candidate.resolvedKind !== "powershell",
      source: input.source,
    };
  }

  private resolveStartupArgs(kind: DesktopResolvedShellKind): string[] {
    if (kind === "pwsh" || kind === "powershell") {
      return ["-NoLogo", "-NoProfile"];
    }

    if (kind === "cmd") {
      return ["/D"];
    }

    if (kind === "bash") {
      return ["--noprofile", "--norc", "-i"];
    }

    return ["-i"];
  }

  private resolveDisplayName(kind: DesktopResolvedShellKind): string {
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

  private readExecutableName(executable: string): string {
    return path.win32.parse(executable).name.toLowerCase();
  }
}
