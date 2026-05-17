import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = dirname(fileURLToPath(import.meta.url))

const expectedExports = new Map([
  [".", "./src/index.ts"],
  ["./ai", "./ai/index.ts"],
  ["./ai/contracts", "./ai/contracts/index.ts"],
  ["./ai/channels", "./ai/channels/index.ts"],
  ["./ai/channels/shared", "./ai/channels/shared/index.ts"],
  ["./ai/codecs", "./ai/codecs/index.ts"],
  ["./ai/codecs/shared", "./ai/codecs/shared/index.ts"],
  ["./ai/execution-profiles", "./ai/execution-profiles/index.ts"],
  ["./ioc", "./ioc/index.ts"],
  ["./core", "./core/index.ts"],
  ["./core/algorithms/context", "./core/algorithms/context/index.ts"],
  ["./core/algorithms/retry", "./core/algorithms/retry/index.ts"],
  ["./host", "./src/host/index.ts"],
  ["./host/agents", "./src/host/agents/index.ts"],
  ["./host/application", "./src/host/application/index.ts"],
  ["./host/context", "./src/host/context/index.ts"],
  ["./host/interactions", "./src/host/interactions/index.ts"],
  ["./host/sessions", "./src/host/sessions/index.ts"],
  ["./host/tasks", "./src/host/tasks/index.ts"],
  ["./host/tools", "./src/host/tools/index.ts"],
  ["./host/turn-input-assembler", "./src/host/turn-input-assembler.ts"],
  ["./host/workspace", "./src/host/workspace/index.ts"],
  ["./adapters", "./src/adapters/index.ts"],
  ["./adapters/events", "./src/adapters/events/index.ts"],
  ["./adapters/tools", "./src/adapters/tools/index.ts"],
  ["./adapters/persistence/sqlite", "./src/adapters/persistence/sqlite/index.ts"],
])

const packageJsonPath = resolve(packageDir, "package.json")
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
const actualExports = new Map(Object.entries(packageJson.exports ?? {}))

function fail(message) {
  throw new Error(message)
}

function toPosixPath(value) {
  return value.split(sep).join("/")
}

function listSourceFiles(dir) {
  if (!existsSync(dir)) {
    return []
  }

  const entries = readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolutePath = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(absolutePath))
      continue
    }

    if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push(absolutePath)
    }
  }
  return files
}

function readRelativeSourceFiles(dir) {
  return listSourceFiles(dir).map((absolutePath) => ({
    absolutePath,
    relativePath: toPosixPath(relative(packageDir, absolutePath)),
    text: readFileSync(absolutePath, "utf8"),
  }))
}

function assertNoPattern(files, pattern, message) {
  for (const file of files) {
    const match = file.text.match(pattern)
    if (match) {
      fail(`${message}: ${file.relativePath} matched ${match[0]}`)
    }
  }
}

if (actualExports.size !== expectedExports.size) {
  fail(
    `Unexpected export count. Expected ${expectedExports.size}, received ${actualExports.size}.`,
  )
}

for (const [key, expectedTarget] of expectedExports) {
  const actualTarget = actualExports.get(key)
  if (actualTarget !== expectedTarget) {
    fail(`Export ${key} mismatch. Expected ${expectedTarget}, received ${String(actualTarget)}.`)
  }

  const absoluteTarget = resolve(packageDir, expectedTarget)
  if (!existsSync(absoluteTarget)) {
    fail(`Export target does not exist: ${expectedTarget}`)
  }
}

for (const key of actualExports.keys()) {
  if (!expectedExports.has(key)) {
    fail(`Unexpected export key: ${key}`)
  }
}

const legacyExportPrefixes = [
  "./kernel",
  "./runtime",
  "./support",
]

for (const key of actualExports.keys()) {
  if (legacyExportPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}/`))) {
    fail(`Legacy export key is not allowed: ${key}`)
  }
}

const srcDir = resolve(packageDir, "src")
const forbiddenSourceDirs = ["kernel", "runtime", "support"]
for (const dirName of forbiddenSourceDirs) {
  const dir = resolve(srcDir, dirName)
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    fail(`Legacy source directory is not allowed: src/${dirName}`)
  }
}

const forbiddenAiProviderDirs = [
  "channels/openai",
  "codecs/openai",
]
for (const dirName of forbiddenAiProviderDirs) {
  const dir = resolve(packageDir, "ai", dirName)
  if (existsSync(dir) && statSync(dir).isDirectory()) {
    fail(`Provider-specific AI directory is not allowed in kernel: ai/${dirName}`)
  }
}

const sourceFiles = [
  ...readRelativeSourceFiles(srcDir),
  ...readRelativeSourceFiles(resolve(packageDir, "ai")),
  ...readRelativeSourceFiles(resolve(packageDir, "ioc")),
]
const testFiles = readRelativeSourceFiles(resolve(packageDir, "tests"))
const checkedFiles = [...sourceFiles, ...testFiles]

assertNoPattern(
  checkedFiles,
  /from\s+["'][^"']*(?:\.\.\/)+(?:kernel|runtime|support)(?:\/[^"']*)?["']/,
  "Legacy relative import is not allowed",
)

assertNoPattern(
  checkedFiles,
  /from\s+["']@maomiagent\/kernel\/(?:kernel|runtime|support)(?:\/[^"']*)?["']/,
  "Legacy package import is not allowed",
)

const coreFiles = sourceFiles.filter((file) => file.relativePath.startsWith("src/core/"))
assertNoPattern(
  coreFiles,
  /from\s+["'][^"']*(?:\.\.\/)+(?:host|adapters)(?:\/[^"']*)?["']/,
  "Core must not import host or adapters",
)

const aiFiles = sourceFiles.filter((file) => file.relativePath.startsWith("ai/"))
assertNoPattern(
  aiFiles,
  /from\s+["'][^"']*(?:\.\.\/)+(?:host|adapters)(?:\/[^"']*)?["']/,
  "AI layer must not import host or adapters",
)

const adapterFiles = sourceFiles.filter((file) => file.relativePath.startsWith("src/adapters/"))
assertNoPattern(
  adapterFiles,
  /from\s+["'][^"']*(?:\.\.\/)+host(?:\/[^"']*)?["']/,
  "Adapters must not import host",
)

const rootIndex = readFileSync(resolve(packageDir, "src/index.ts"), "utf8")
if (
  rootIndex.includes("../ai")
  || rootIndex.includes("../ioc")
  || rootIndex.includes("./ai")
  || rootIndex.includes("./ioc")
  || rootIndex.includes("./host")
  || rootIndex.includes("./adapters")
  || rootIndex.includes("./runtime")
  || rootIndex.includes("./support")
  || rootIndex.includes("./kernel")
) {
  fail("Root barrel must stay focused on core abstractions and must not re-export ai, ioc, host, adapters, or legacy layers.")
}

const aiIndex = readFileSync(resolve(packageDir, "ai/index.ts"), "utf8")
if (aiIndex.includes("./channels") || aiIndex.includes("./codecs") || aiIndex.includes("./execution-profiles")) {
  fail("AI root barrel must stay contracts-only.")
}

console.log("kernel public api verified")