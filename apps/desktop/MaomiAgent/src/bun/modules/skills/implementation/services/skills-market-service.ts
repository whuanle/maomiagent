import { spawn } from "node:child_process";
import type { DesktopSkillsMarketPort, DesktopSkillsPort } from "../../abstraction/ports/desktop-skills.ports";
import {
  DesktopSkillsError,
  type DesktopSkillItem,
  type DesktopSkillsMarketInstallResponse,
  type DesktopSkillsMarketItem,
  type DesktopSkillsMarketProvider,
  type DesktopSkillsMarketProviderId,
} from "../../abstraction/models/desktop-skills.models";
import type { RuntimeLogger } from "../../../logs";

const SKILLS_MARKET_PROVIDERS: DesktopSkillsMarketProvider[] = [
  { id: "all", label: "all" },
  { id: "skills.sh", label: "skills.sh" },
  { id: "npm", label: "npm" },
  { id: "github", label: "GitHub" },
];

const ANSI_ESCAPE_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const SKILLS_REF_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$/;

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSlug(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function stripAnsi(input: string): string {
  return input.replace(ANSI_ESCAPE_RE, "");
}

function normalizeProvider(value: unknown): DesktopSkillsMarketProviderId {
  const provider = trimString(value).toLowerCase();
  if (!provider || provider === "all") {
    return "all";
  }
  if (provider === "skills.sh" || provider === "npm" || provider === "github") {
    return provider;
  }
  throw new DesktopSkillsError("INVALID_ARGUMENT", "unsupported skills market provider", {
    field: "provider",
    provider,
  });
}

function normalizeInstallRef(raw: unknown): string {
  const value = trimString(raw);
  if (!value) {
    throw new DesktopSkillsError("INVALID_ARGUMENT", "installRef is required", {
      field: "installRef",
    });
  }
  if (SKILLS_REF_RE.test(value)) {
    return value;
  }

  const urlMatch = value.match(/^https?:\/\/skills\.sh\/([^/\s]+)\/([^/\s]+)\/([^/?#\s]+)/i);
  if (urlMatch) {
    const [, owner, repo, skill] = urlMatch;
    const installRef = `${owner}/${repo}@${skill}`;
    if (SKILLS_REF_RE.test(installRef)) {
      return installRef;
    }
  }

  throw new DesktopSkillsError("INVALID_ARGUMENT", "invalid installRef format", {
    field: "installRef",
    expected: "owner/repo@skill or https://skills.sh/{owner}/{repo}/{skill}",
  });
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = trimString(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function dedupeMarketItems(items: DesktopSkillsMarketItem[], limit: number): DesktopSkillsMarketItem[] {
  const map = new Map<string, DesktopSkillsMarketItem>();
  for (const item of items) {
    map.set(`${item.provider}:${item.installRef}`, item);
  }
  return [...map.values()]
    .sort((left, right) => {
      const leftInstalls = left.installs ?? -1;
      const rightInstalls = right.installs ?? -1;
      if (leftInstalls !== rightInstalls) {
        return rightInstalls - leftInstalls;
      }
      return left.title.localeCompare(right.title, "en", { sensitivity: "base" });
    })
    .slice(0, limit);
}

function parseSkillsFindOutput(raw: string, limit: number): DesktopSkillsMarketItem[] {
  const lines = stripAnsi(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dedup = new Map<string, DesktopSkillsMarketItem>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const urlMatch = line.match(/https?:\/\/skills\.sh\/([^/\s]+)\/([^/\s]+)\/([^/?#\s]+)/i);
    if (!urlMatch) {
      continue;
    }
    const [, owner, repo, slug] = urlMatch;
    const installRef = `${owner}/${repo}@${slug}`;
    const previousLine = index > 0 ? lines[index - 1] : "";
    const installs = Number.parseInt(previousLine.match(/(\d+)\s+installs?/i)?.[1] ?? "", 10);
    const titleRaw = previousLine.replace(/\d+\s+installs?.*$/i, "").replace(/\s+/g, " ").trim();
    dedup.set(installRef, {
      provider: "skills.sh",
      installRef,
      skillId: toSlug(slug),
      title: titleRaw || slug,
      url: urlMatch[0],
      repository: `${owner}/${repo}`,
      installs: Number.isFinite(installs) ? installs : undefined,
    });
  }

  if (dedup.size === 0) {
    for (const line of lines) {
      const refMatch = line.match(/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+)/);
      if (!refMatch) {
        continue;
      }

      const installRef = refMatch[1];
      if (!SKILLS_REF_RE.test(installRef)) {
        continue;
      }
      if (installRef.toLowerCase() === "owner/repo@skill" || line.includes("<")) {
        continue;
      }

      const [, tail] = installRef.split("@");
      dedup.set(installRef, {
        provider: "skills.sh",
        installRef,
        skillId: toSlug(tail ?? installRef),
        title: installRef,
      });
    }
  }

  const sorted = [...dedup.values()]
    .sort((left, right) => {
      const leftInstalls = left.installs ?? -1;
      const rightInstalls = right.installs ?? -1;
      if (leftInstalls !== rightInstalls) {
        return rightInstalls - leftInstalls;
      }
      return left.installRef.localeCompare(right.installRef, "en", {
        sensitivity: "base",
      });
    });

  return sorted.slice(0, limit);
}

export class SkillsMarketService implements DesktopSkillsMarketPort {
  constructor(
    private readonly logger: RuntimeLogger,
    private readonly skillsManagement: DesktopSkillsPort,
  ) {}

  listProviders(): DesktopSkillsMarketProvider[] {
    return SKILLS_MARKET_PROVIDERS;
  }

  private async writeLog(
    level: "info" | "warn" | "error",
    message: string,
    context?: Record<string, unknown>,
  ) {
    try {
      await this.logger[level](message, { context });
    } catch {
      // Ignore runtime log failures for market operations.
    }
  }

  private runCli(
    command: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new DesktopSkillsError("TIMEOUT", "skills command timeout", {
          command,
          args,
          timeoutMs,
        }));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new DesktopSkillsError("INTERNAL_ERROR", "skills command failed to start", {
          command,
          args,
          reason: error.message,
        }));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          code: typeof code === "number" ? code : -1,
        });
      });
    });
  }

  private async runSkillsCli(
    args: string[],
    timeoutMs = 120_000,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
    return this.runCli(npxCommand, ["-y", "skills", ...args], timeoutMs);
  }

  async search(input: {
    provider?: unknown;
    q?: unknown;
    limit?: unknown;
  } = {}) {
    const provider = normalizeProvider(input.provider);
    const q = trimString(input.q);
    if (!q) {
      throw new DesktopSkillsError("INVALID_ARGUMENT", "q is required for market search", {
        field: "q",
      });
    }

    const rawLimit = Number(input.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(50, Math.floor(rawLimit)))
      : 20;
    const targets: Array<Exclude<DesktopSkillsMarketProviderId, "all">> =
      provider === "all" ? ["skills.sh", "npm", "github"] : [provider];

    const results = await Promise.all(
      dedupeStrings([q]).slice(0, 6).flatMap((query) =>
        targets.map((target) => {
          if (target === "skills.sh") {
            return this.searchSkillsSh(query, limit);
          }
          if (target === "npm") {
            return this.searchNpm(query, limit);
          }
          return this.searchGithub(query, limit);
        }),
      ),
    );

    const items = dedupeMarketItems(results.flat(), limit);
    await this.writeLog("info", "skills market search completed", {
      provider,
      q,
      limit,
      resultCount: items.length,
    });

    return {
      provider,
      items,
      providers: SKILLS_MARKET_PROVIDERS,
    };
  }

  async install(input: {
    provider?: DesktopSkillsMarketProviderId | unknown;
    installRef?: unknown;
  }): Promise<DesktopSkillsMarketInstallResponse> {
    const provider = normalizeProvider(input.provider);
    if (provider !== "all" && provider !== "skills.sh") {
      throw new DesktopSkillsError("INVALID_ARGUMENT", "unsupported skills market provider", {
        field: "provider",
        provider,
      });
    }

    const result = await this.installFromSkillsSh(input.installRef);
    await this.writeLog("info", "skills market install completed", {
      provider: "skills.sh",
      installRef: result.installRef,
      skillId: result.item.skillId,
      created: result.created,
    });

    return {
      provider: "skills.sh",
      installRef: result.installRef,
      item: result.item,
      created: result.created,
    };
  }

  private async searchSkillsSh(q: string, limit: number): Promise<DesktopSkillsMarketItem[]> {
    try {
      const cli = await this.runSkillsCli(["find", q, "--yes"]);
      return cli.code === 0 ? parseSkillsFindOutput(`${cli.stdout}\n${cli.stderr}`, limit) : [];
    } catch {
      return [];
    }
  }

  private async searchNpm(q: string, limit: number): Promise<DesktopSkillsMarketItem[]> {
    try {
      const response = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(`${q} skill`)}&size=${Math.min(limit, 20)}`,
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json() as {
        objects?: Array<{
          package?: { name?: string; description?: string; links?: { npm?: string } };
          score?: { final?: number };
        }>;
      };

      return (Array.isArray(data.objects) ? data.objects : [])
        .map((entry) => {
          const name = trimString(entry.package?.name);
          if (!name) {
            return null;
          }
          return {
            provider: "npm" as const,
            installRef: name,
            skillId: toSlug(name.includes("/") ? name.split("/").pop() ?? name : name),
            title: trimString(entry.package?.description) || name,
            url: trimString(entry.package?.links?.npm) || `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
            repository: name,
            installs: typeof entry.score?.final === "number" ? Math.round(entry.score.final * 1000) : undefined,
          };
        })
        .filter(isPresent)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  private async searchGithub(q: string, limit: number): Promise<DesktopSkillsMarketItem[]> {
    try {
      const response = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(`${q} skill in:name,description`)}&per_page=${Math.min(limit, 20)}`,
        { headers: { Accept: "application/vnd.github+json", "User-Agent": "MaomiAgent" } },
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json() as {
        items?: Array<{
          full_name?: string;
          description?: string;
          html_url?: string;
          stargazers_count?: number;
          name?: string;
        }>;
      };

      return (Array.isArray(data.items) ? data.items : [])
        .map((repository) => {
          const fullName = trimString(repository.full_name);
          const name = trimString(repository.name);
          const installRef = fullName || toSlug(name);
          if (!installRef) {
            return null;
          }
          return {
            provider: "github" as const,
            installRef,
            skillId: toSlug(name || fullName),
            title: trimString(repository.description) || fullName || installRef,
            url: trimString(repository.html_url) || undefined,
            repository: fullName || undefined,
            installs: typeof repository.stargazers_count === "number" ? repository.stargazers_count : undefined,
          };
        })
        .filter(isPresent)
        .slice(0, limit);
    } catch {
      return [];
    }
  }

  private async installFromSkillsSh(
    installRefRaw: unknown,
  ): Promise<{ item: DesktopSkillItem; created: boolean; installRef: string }> {
    const installRef = normalizeInstallRef(installRefRaw);
    const [, rawSkillId] = installRef.split("@");
    const expectedSkillId = toSlug(rawSkillId ?? installRef);
    const installResult = await this.runSkillsCli(["add", installRef, "-g", "-y"], 180_000);

    if (installResult.code !== 0) {
      throw new DesktopSkillsError("INSTALL_FAILED", "skills.sh install failed", {
        installRef,
        code: installResult.code,
        stdout: stripAnsi(installResult.stdout).trim(),
        stderr: stripAnsi(installResult.stderr).trim(),
      });
    }

    const discovered = await this.skillsManagement.discover({ q: expectedSkillId });
    const allDiscovered = discovered.items.length > 0 ? discovered : await this.skillsManagement.discover();
    const preferredSourceNames = new Set(["skills_sh"]);
    const preferredPathHints = [".skills\\", "/.skills/"];
    const candidate =
      allDiscovered.items.find((item) => item.hasSkillMarkdown && item.source === "skills_sh" && item.skillId === expectedSkillId)
      ?? allDiscovered.items.find((item) =>
        item.hasSkillMarkdown
        && preferredSourceNames.has(item.source)
        && preferredPathHints.some((hint) => item.sourcePath.toLowerCase().includes(hint)))
      ?? allDiscovered.items.find((item) => item.hasSkillMarkdown && item.skillId === expectedSkillId)
      ?? allDiscovered.items.find((item) => item.hasSkillMarkdown && item.sourcePath.toLowerCase().includes(expectedSkillId))
      ?? allDiscovered.items.find((item) => item.hasSkillMarkdown && preferredSourceNames.has(item.source))
      ?? allDiscovered.items.find((item) => item.hasSkillMarkdown);

    if (!candidate) {
      throw new DesktopSkillsError("INSTALL_NOT_DISCOVERED", "skill installed but not discovered in local skill paths", {
        installRef,
        expectedSkillId,
        discoveredCount: allDiscovered.items.length,
        discoveredSources: allDiscovered.sources
          .filter((item) => item.itemsCount > 0 || item.existingPaths.length > 0)
          .map((item) => ({
            source: item.source,
            existingPaths: item.existingPaths,
            itemsCount: item.itemsCount,
          })),
        stdout: stripAnsi(installResult.stdout).trim(),
        stderr: stripAnsi(installResult.stderr).trim(),
      });
    }

    const result = await this.skillsManagement.adopt({
      skillId: candidate.skillId,
      sourcePath: candidate.sourcePath,
      scope: "global",
      enabled: true,
      metadata: {
        market: {
          provider: "skills.sh",
          installRef,
        },
      },
    });

    return {
      ...result,
      installRef,
    };
  }
}