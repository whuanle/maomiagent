import { promises as fs } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..")

const ROOT_FILES = [
  "package.json",
  "README.md",
]

const ROOT_DIRECTORIES = [
  ".github/workflows",
  "scripts",
]

const IGNORED_FILES = new Set([
  "scripts/verify-no-root-src-refs.mjs",
])

const FILE_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".mjs",
  ".yml",
  ".yaml",
])

const PATTERNS = [
  {
    label: "legacy --cwd src entry",
    regex: /--cwd\s+src\b/g,
  },
  {
    label: "legacy root src-tauri path",
    regex: /\bsrc\/src-tauri\b/g,
  },
  {
    label: "legacy root sidecar path",
    regex: /\bsrc\/sidecar\b/g,
  },
  {
    label: "legacy --cwd app entry",
    regex: /--cwd\s+app\b/g,
  },
  {
    label: "legacy --cwd opencode entry",
    regex: /--cwd\s+opencode\b/g,
  },
  {
    label: "legacy app package path",
    regex: /\bapp\/package\.json\b/g,
  },
  {
    label: "legacy app src-tauri path",
    regex: /\bapp\/src-tauri\b/g,
  },
  {
    label: "legacy app shared path",
    regex: /\bapp\/shared\b/g,
  },
  {
    label: "legacy app runtime path",
    regex: /\bapp\/runtime\b/g,
  },
  {
    label: "legacy app sidecar path",
    regex: /\bapp\/sidecar\b/g,
  },
  {
    label: "legacy opencode packages path",
    regex: /\bopencode\/packages\b/g,
  },
  {
    label: "legacy opencode node_modules path",
    regex: /\bopencode\/node_modules\b/g,
  },
]

async function readTextFile(relativePath) {
  return fs.readFile(path.join(REPO_ROOT, relativePath), "utf8")
}

async function collectFiles(relativePath, results) {
  const absolutePath = path.join(REPO_ROOT, relativePath)
  const entries = await fs.readdir(absolutePath, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    const childRelativePath = path.posix.join(relativePath.replace(/\\/g, "/"), entry.name)
    if (entry.isDirectory()) {
      await collectFiles(childRelativePath, results)
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (!FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      continue
    }

    if (IGNORED_FILES.has(childRelativePath)) {
      continue
    }

    results.push(childRelativePath)
  }
}

function buildLineIndex(content, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (content.charCodeAt(index) === 10) {
      line += 1
    }
  }
  return line
}

async function main() {
  const files = [...ROOT_FILES]
  for (const directory of ROOT_DIRECTORIES) {
    await collectFiles(directory, files)
  }

  const findings = []

  for (const relativePath of files) {
    const content = await readTextFile(relativePath)

    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0
      let match
      while ((match = pattern.regex.exec(content)) !== null) {
        findings.push({
          relativePath,
          line: buildLineIndex(content, match.index),
          label: pattern.label,
          text: match[0],
        })
      }
    }
  }

  if (findings.length === 0) {
    console.log("[verify-no-root-src-refs] no root-level legacy src/app/opencode references found")
    return
  }

  for (const finding of findings) {
    console.error(
      `[verify-no-root-src-refs] ${finding.relativePath}:${finding.line} ${finding.label}: ${finding.text}`,
    )
  }

  process.exitCode = 1
}

main().catch((error) => {
  console.error(
    `[verify-no-root-src-refs] ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exitCode = 1
})
