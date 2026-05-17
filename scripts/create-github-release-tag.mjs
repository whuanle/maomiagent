import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..")
const DESKTOP_PACKAGE_JSON = path.join(REPO_ROOT, "apps", "desktop", "MaomiAgent", "package.json")

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeVersion(value) {
  return normalizeText(value).replace(/^[vV]/, "")
}

function parseFlag(name) {
  return process.argv.includes(name)
}

function parseOption(name) {
  const prefix = `${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))
  return value ? value.slice(prefix.length) : ""
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function tryRunGit(args) {
  try {
    return runGit(args)
  } catch {
    return ""
  }
}

function readDesktopVersion() {
  const raw = readFileSync(DESKTOP_PACKAGE_JSON, "utf8")
  const parsed = JSON.parse(raw)
  const version = normalizeVersion(parsed?.version)
  if (!version) {
    throw new Error("Missing version in apps/desktop/MaomiAgent/package.json")
  }
  return version
}

function main() {
  const packageVersion = readDesktopVersion()
  const requestedVersion = normalizeVersion(parseOption("--version"))
  const dryRun = parseFlag("--dry-run")
  const push = parseFlag("--push")

  if (requestedVersion && requestedVersion !== packageVersion) {
    throw new Error(
      `Requested version ${requestedVersion} does not match apps/desktop/MaomiAgent/package.json version ${packageVersion}`,
    )
  }

  const version = requestedVersion || packageVersion
  const tag = `v${version}`
  const headCommit = runGit(["rev-parse", "HEAD"])
  const existingCommit = tryRunGit(["rev-list", "-n", "1", tag])

  if (existingCommit && existingCommit !== headCommit) {
    throw new Error(`Tag ${tag} already exists on ${existingCommit}, current HEAD is ${headCommit}`)
  }

  if (existingCommit) {
    console.log(`[release-tag] ${tag} already exists on current HEAD`)
  } else if (dryRun) {
    console.log(`[release-tag] would create annotated tag ${tag} on ${headCommit}`)
  } else {
    execFileSync("git", ["tag", "-a", tag, "-m", `MaomiAgent release ${tag}`], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    })
    console.log(`[release-tag] created ${tag}`)
  }

  if (!push) {
    console.log(`[release-tag] next: git push origin ${tag}`)
    return
  }

  if (dryRun) {
    console.log(`[release-tag] would push ${tag} to origin`)
    return
  }

  execFileSync("git", ["push", "origin", tag], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  })
  console.log(`[release-tag] pushed ${tag}`)
}

try {
  main()
} catch (error) {
  console.error(`[release-tag] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
