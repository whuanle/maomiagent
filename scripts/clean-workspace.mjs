import { promises as fs } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..")
const REMOVE_ALL = process.argv.includes("--all")

const DEFAULT_TARGETS = [
  "apps/desktop/MaomiAgent/dist",
  "apps/desktop/MaomiAgent/build",
  "apps/desktop/MaomiAgent/build-alt",
  "apps/desktop/MaomiAgent/build-hmr",
  "apps/desktop/MaomiAgent/build-hmr-watch",
  "apps/desktop/MaomiAgent/build-stable",
  ".tmp",
  "tmp",
  "output",
]

const ALL_TARGETS = [
  "apps/desktop/MaomiAgent/node_modules",
  "node_modules",
]

function resolveRepoPath(relativePath) {
  const absolutePath = path.resolve(REPO_ROOT, relativePath)
  const relative = path.relative(REPO_ROOT, absolutePath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to clean path outside repository: ${relativePath}`)
  }
  return absolutePath
}

async function pathExists(absolutePath) {
  try {
    await fs.access(absolutePath)
    return true
  } catch {
    return false
  }
}

async function removeRelativePath(relativePath, removed) {
  const absolutePath = resolveRepoPath(relativePath)
  if (!(await pathExists(absolutePath))) {
    return
  }

  try {
    await fs.rm(absolutePath, {
      recursive: true,
      force: true,
    })
    removed.push(relativePath)
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && (error.code === "EBUSY" || error.code === "EPERM")
    ) {
      console.warn(`[clean-workspace] skipped busy path ${relativePath}`)
      return
    }

    throw error
  }
}

async function removeTempSidecarLogs(removed) {
  const entries = await fs.readdir(REPO_ROOT, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    if (!/^tmp-sidecar-.*\.(err|out)\.log$/i.test(entry.name)) {
      continue
    }

    await fs.rm(path.join(REPO_ROOT, entry.name), {
      force: true,
    })
    removed.push(entry.name)
  }
}

async function main() {
  const removed = []

  for (const target of DEFAULT_TARGETS) {
    await removeRelativePath(target, removed)
  }

  if (REMOVE_ALL) {
    for (const target of ALL_TARGETS) {
      await removeRelativePath(target, removed)
    }
  }

  await removeTempSidecarLogs(removed)

  if (removed.length === 0) {
    console.log("[clean-workspace] nothing to clean")
    return
  }

  for (const item of removed) {
    console.log(`[clean-workspace] removed ${item}`)
  }
}

main().catch((error) => {
  console.error(`[clean-workspace] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
