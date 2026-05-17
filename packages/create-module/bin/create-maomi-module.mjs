#!/usr/bin/env node

import { access, mkdir, readdir, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import process from "node:process"

function printUsage() {
  console.log(`
create-maomi-module <target-dir> [options]

Options:
  --module-id <value>         Override generated moduleId
  --package-name <value>      Override generated package name
  --title <value>             Override generated title
  --description <value>       Override generated description
  --requires-workspace        Mark module navigation.requiresWorkspace=true
  --force                     Overwrite existing files when target already exists
  --help                      Show this help
`)
}

function parseArgs(argv) {
  const options = {
    targetDir: "",
    moduleId: "",
    packageName: "",
    title: "",
    description: "",
    requiresWorkspace: false,
    force: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token) {
      continue
    }
    if (!token.startsWith("--")) {
      if (!options.targetDir) {
        options.targetDir = token
        continue
      }
      throw new Error(`Unexpected argument: ${token}`)
    }

    switch (token) {
      case "--module-id":
        options.moduleId = readRequiredOptionValue(argv, ++index, token)
        break
      case "--package-name":
        options.packageName = readRequiredOptionValue(argv, ++index, token)
        break
      case "--title":
        options.title = readRequiredOptionValue(argv, ++index, token)
        break
      case "--description":
        options.description = readRequiredOptionValue(argv, ++index, token)
        break
      case "--requires-workspace":
        options.requiresWorkspace = true
        break
      case "--force":
        options.force = true
        break
      case "--help":
      case "-h":
        options.help = true
        break
      default:
        throw new Error(`Unknown option: ${token}`)
    }
  }

  return options
}

function readRequiredOptionValue(argv, index, optionName) {
  const value = argv[index]
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value`)
  }
  return value.trim()
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : ""
}

function slugifySegment(value) {
  const normalized = normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return normalized || "module-app"
}

function deriveModuleId(targetDirName) {
  const base = slugifySegment(targetDirName).replace(/-/g, ".")
  return `example.${base}`
}

function derivePackageName(targetDirName) {
  return `@maomiagent/${slugifySegment(targetDirName)}`
}

function deriveTitle(targetDirName) {
  const raw = normalizeText(targetDirName)
  const englishWords = raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()

  if (!englishWords) {
    return "Maomi Module"
  }

  if (/[A-Za-z]/.test(englishWords)) {
    return englishWords
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }

  return englishWords
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")
}

async function pathExists(pathname) {
  try {
    await access(pathname)
    return true
  } catch {
    return false
  }
}

async function ensureTargetDirectory(targetDir, force) {
  const exists = await pathExists(targetDir)
  if (!exists) {
    await mkdir(targetDir, { recursive: true })
    return
  }

  const entries = await readdir(targetDir)
  if (entries.length > 0 && !force) {
    throw new Error(`Target directory is not empty: ${targetDir}`)
  }
}

async function writeTextFile(pathname, content, force) {
  await mkdir(dirname(pathname), { recursive: true })
  if (!force && await pathExists(pathname)) {
    throw new Error(`Refusing to overwrite existing file: ${pathname}`)
  }
  await writeFile(pathname, content, "utf-8")
}

function buildPackageJson(input) {
  return JSON.stringify(
    {
      name: input.packageName,
      version: "0.1.0",
      type: "module",
      description: input.description,
      keywords: ["maomiagent", "maomi-module"],
      files: ["dist", "server", "maomi.module.json", "README.md"],
      maomiModule: "./maomi.module.json",
    },
    null,
    2,
  ) + "\n"
}

function buildManifest(input) {
  return JSON.stringify(
    {
      moduleId: input.moduleId,
      name: input.title,
      version: "0.1.0",
      description: input.description,
      navigation: {
        title: input.title,
        icon: "app-window",
        order: 400,
        requiresWorkspace: input.requiresWorkspace,
      },
      ui: {
        kind: "iframe-app",
        entry: "./dist/ui/index.html",
      },
      server: {
        entry: "./server/index.mjs",
      },
      permissions: [
        "workspace.read",
        "models.read",
        "conversation.read",
        "module.storage.read",
        "module.storage.write",
      ],
    },
    null,
    2,
  ) + "\n"
}

function buildReadme(input) {
  return `# ${input.title}

这是通过 \`create-maomi-module\` 生成的 MaomiAgent 应用层模块。

## 模块信息

- moduleId: \`${input.moduleId}\`
- packageName: \`${input.packageName}\`
- requiresWorkspace: \`${String(input.requiresWorkspace)}\`

## 导入方式

在 MaomiAgent 设置页的模块管理里导入：

1. 当前本地目录路径
2. 当前包名 \`${input.packageName}\`

## 当前模板演示

- 读取宿主 bootstrap context
- 读取活动工作区
- 读取模型列表
- 读取会话列表
- 读写模块私有存储
- 从 UI 调用模块 server
- 调用宿主内置导航
- 回传模块运行态 \`report-state\`

## 目录结构

\`\`\`text
${input.targetDirName}/
  package.json
  maomi.module.json
  README.md
  server/
    index.mjs
  dist/
    ui/
      index.html
      styles.css
      main.js
\`\`\`

## 开发方式

这个模板默认是零构建静态模块，直接修改：

- \`dist/ui/index.html\`
- \`dist/ui/styles.css\`
- \`dist/ui/main.js\`

如果后续你要换成自己的构建链，也只需要保证最终产物仍然输出到 \`dist/ui/\`，并保持 \`maomi.module.json\` 的 \`ui.entry\` 指向正确文件。
`
}

function buildServerIndexMjs(input) {
  return `export default {
  async fetch(request, context) {
    const url = new URL(request.url)

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({
        ok: true,
        moduleId: context.module.moduleId,
        title: context.module.navigation.title,
        path: url.pathname,
      })
    }

    if (url.pathname === "/summary") {
      const [activeWorkspace, models] = await Promise.all([
        context.host.workspace.getActive(),
        context.host.models.list(),
      ])

      return Response.json({
        ok: true,
        moduleId: context.module.moduleId,
        title: context.module.navigation.title,
        activeWorkspaceId: activeWorkspace.active?.workspaceId || null,
        modelCount: models.total,
        generatedAt: new Date().toISOString(),
      })
    }

    return Response.json(
      {
        ok: false,
        code: "NOT_FOUND",
        message: \`Unknown module server route: \${url.pathname}\`,
      },
      { status: 404 },
    )
  },
}
`
}

function buildIndexHtml(input) {
  const title = escapeHtml(input.title)
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="./styles.css" />
  <script type="module" src="./main.js"></script>
</head>
<body>
  <div class="app-shell">
    <header class="page-toolbar">
      <div class="page-heading">
        <p class="eyebrow">MaomiAgent Module</p>
        <h1 id="module-title">${title}</h1>
        <p id="module-subtitle">Waiting for host bootstrap...</p>
      </div>
      <div class="page-actions">
        <button id="refresh-button" type="button">Refresh Host Data</button>
        <button id="refresh-server-button" type="button" class="secondary">Refresh Module Server</button>
        <button id="open-models-button" type="button">Open Models Page</button>
        <button id="save-note-button" type="button">Save Note</button>
        <button id="clear-note-button" type="button" class="secondary">Clear Note</button>
      </div>
    </header>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">Bridge</span>
        <strong id="bridge-status">Connecting</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">Active Workspace</span>
        <strong id="workspace-status">-</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">Models</span>
        <strong id="models-count">0</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">Conversations</span>
        <strong id="conversations-count">0</strong>
      </article>
    </section>

    <main class="content-grid">
      <section class="panel">
        <div class="panel-header">
          <h2>Host Context</h2>
        </div>
        <pre id="context-view" class="code-block">Waiting for context...</pre>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Module Note</h2>
          <span id="note-status" class="muted">No local edits</span>
        </div>
        <textarea id="note-input" class="note-input" placeholder="Write something that belongs to this module..."></textarea>
        <pre id="storage-view" class="code-block">No stored note.</pre>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Models</h2>
        </div>
        <div id="models-view" class="list-empty">No models loaded yet.</div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Conversations</h2>
        </div>
        <div id="conversations-view" class="list-empty">No conversations loaded yet.</div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Module Server</h2>
          <span id="server-status" class="muted">No server response</span>
        </div>
        <pre id="server-view" class="code-block">No module server response.</pre>
      </section>
    </main>
  </div>
</body>
</html>
`
}

function buildStylesCss() {
  return `:root {
  color-scheme: light;
  --page-bg: #f4efe6;
  --panel-bg: rgba(255, 252, 246, 0.94);
  --panel-border: rgba(114, 91, 58, 0.14);
  --text-main: #2d2418;
  --text-muted: #776550;
  --accent: #9b5a2e;
  --accent-soft: rgba(155, 90, 46, 0.14);
  --shadow-soft: 0 22px 48px rgba(70, 45, 22, 0.08);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background:
    radial-gradient(circle at top left, rgba(214, 155, 98, 0.22), transparent 28%),
    linear-gradient(180deg, #fbf7f1 0%, var(--page-bg) 100%);
  color: var(--text-main);
}

button,
textarea {
  font: inherit;
}

button {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 10px 16px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

button.secondary {
  background: rgba(255, 255, 255, 0.78);
  color: var(--text-main);
  border-color: rgba(114, 91, 58, 0.18);
}

button:hover {
  filter: brightness(0.98);
}

.app-shell {
  min-height: 100vh;
  padding: 28px;
}

.page-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 22px;
}

.page-heading h1 {
  margin: 0;
  font-size: 30px;
  line-height: 1.1;
}

.page-heading p {
  margin: 8px 0 0;
  color: var(--text-muted);
}

.eyebrow {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 12px;
  color: var(--accent);
}

.page-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.summary-card,
.panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(10px);
}

.summary-card {
  border-radius: 22px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.summary-label {
  color: var(--text-muted);
  font-size: 13px;
}

.summary-card strong {
  font-size: 20px;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.panel {
  border-radius: 24px;
  padding: 18px;
  min-height: 260px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
}

.muted {
  color: var(--text-muted);
  font-size: 13px;
}

.code-block {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 16px;
  padding: 14px;
  min-height: 180px;
  background: rgba(63, 42, 21, 0.06);
  color: #42311e;
}

.note-input {
  width: 100%;
  min-height: 140px;
  resize: vertical;
  border: 1px solid rgba(114, 91, 58, 0.18);
  border-radius: 18px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-main);
}

.list,
.list-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.list-empty {
  color: var(--text-muted);
}

.list-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(155, 90, 46, 0.07);
}

.list-item strong,
.list-item span {
  display: block;
}

.list-item span {
  color: var(--text-muted);
  font-size: 13px;
  margin-top: 4px;
}

@media (max-width: 1024px) {
  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .app-shell {
    padding: 16px;
  }

  .page-toolbar {
    flex-direction: column;
  }

  .page-actions {
    justify-content: flex-start;
  }

  .summary-grid,
  .content-grid {
    grid-template-columns: 1fr;
  }
}
`
}

function buildMainJs(input) {
  return `import { createMaomiModuleSdk } from "/module-host/sdk/web.js"

const sdk = createMaomiModuleSdk()

const state = {
  context: null,
  activeWorkspace: null,
  models: [],
  conversations: [],
  serverSummary: null,
  savedNote: null,
  noteDraft: "",
  dirty: false,
}

const titleElement = document.getElementById("module-title")
const subtitleElement = document.getElementById("module-subtitle")
const bridgeStatusElement = document.getElementById("bridge-status")
const workspaceStatusElement = document.getElementById("workspace-status")
const modelsCountElement = document.getElementById("models-count")
const conversationsCountElement = document.getElementById("conversations-count")
const contextViewElement = document.getElementById("context-view")
const storageViewElement = document.getElementById("storage-view")
const modelsViewElement = document.getElementById("models-view")
const conversationsViewElement = document.getElementById("conversations-view")
const serverViewElement = document.getElementById("server-view")
const serverStatusElement = document.getElementById("server-status")
const noteInputElement = document.getElementById("note-input")
const noteStatusElement = document.getElementById("note-status")

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\\"", "&quot;")
    .replaceAll("'", "&#39;")
}

function renderList(element, items, emptyText, format) {
  if (!items.length) {
    element.className = "list-empty"
    element.textContent = emptyText
    return
  }

  element.className = "list"
  element.innerHTML = items.map((item) => {
    const view = format(item)
    return [
      "<article class=\\"list-item\\">",
      "  <div>",
      \`    <strong>\${escapeHtml(view.title)}</strong>\`,
      \`    <span>\${escapeHtml(view.meta)}</span>\`,
      "  </div>",
      \`  <span>\${escapeHtml(view.trailing)}</span>\`,
      "</article>",
    ].join("\\n")
  }).join("\\n")
}

function updateDirtyState() {
  const savedValue = state.savedNote?.note || ""
  state.dirty = state.noteDraft !== savedValue
}

function reportRuntimeState(extra = {}) {
  sdk.reportState({
    ready: true,
    title: state.context?.navigation?.title || ${JSON.stringify(input.title)},
    subtitle: state.activeWorkspace?.workspaceId || state.context?.moduleId || ${JSON.stringify(input.moduleId)},
    badge: String(state.models.length),
    dirty: state.dirty,
    health: state.context?.activeWorkspaceId ? "ok" : "warn",
    lastUpdatedAt: new Date().toISOString(),
    ...extra,
  })
}

function render() {
  titleElement.textContent = state.context?.navigation?.title || ${JSON.stringify(input.title)}
  subtitleElement.textContent = state.context
    ? \`Module \${state.context.moduleId} is connected to MaomiAgent host bridge.\`
    : "Waiting for host bootstrap..."
  bridgeStatusElement.textContent = state.context ? "Ready" : "Connecting"
  workspaceStatusElement.textContent = state.activeWorkspace?.workspaceId || state.context?.activeWorkspaceId || "-"
  modelsCountElement.textContent = String(state.models.length)
  conversationsCountElement.textContent = String(state.conversations.length)
  contextViewElement.textContent = JSON.stringify({
    context: state.context,
    activeWorkspace: state.activeWorkspace,
  }, null, 2)
  noteInputElement.value = state.noteDraft
  noteStatusElement.textContent = state.dirty ? "Unsaved changes" : "Saved"
  storageViewElement.textContent = state.savedNote
    ? JSON.stringify(state.savedNote, null, 2)
    : "No stored note."
  serverStatusElement.textContent = state.serverSummary ? "Connected" : "No server response"
  serverViewElement.textContent = state.serverSummary
    ? JSON.stringify(state.serverSummary, null, 2)
    : "No module server response."

  renderList(
    modelsViewElement,
    state.models,
    "No models available for this module.",
    (item) => ({
      title: item.label || item.modelId,
      meta: \`\${item.providerType} / \${item.channelName}\`,
      trailing: item.modelId,
    }),
  )

  renderList(
    conversationsViewElement,
    state.conversations,
    state.context?.activeWorkspaceId
      ? "No conversations found in the active workspace."
      : "No active workspace, so the module is showing an empty conversation list.",
    (item) => ({
      title: item.title || item.sessionId,
      meta: item.updatedAt || item.createdAt || "-",
      trailing: item.mode || "-",
    }),
  )
}

async function loadModuleData() {
  state.context = await sdk.getContext()
  state.activeWorkspace = await sdk.host.workspace.getActive()
  state.models = (await sdk.host.models.list()).items || []

  if (state.context?.activeWorkspaceId) {
    state.conversations = (await sdk.host.conversations.list({
      workspaceId: state.context.activeWorkspaceId,
      limit: 8,
    })).items || []
  } else {
    state.conversations = []
  }

  state.savedNote = await sdk.host.storage.get("module.note")
  const serverResponse = await sdk.module.fetch("/summary")
  if (!serverResponse.ok) {
    throw new Error(\`Module server request failed: \${serverResponse.status}\`)
  }
  state.serverSummary = await serverResponse.json()
  state.noteDraft = state.savedNote?.note || ""
  updateDirtyState()
  render()
  reportRuntimeState()
}

noteInputElement.addEventListener("input", (event) => {
  state.noteDraft = event.target.value
  updateDirtyState()
  render()
  reportRuntimeState()
})

document.getElementById("refresh-button").addEventListener("click", async () => {
  await loadModuleData()
  await sdk.ui.notify({
    tone: "success",
    message: "Module data refreshed from host",
  })
})

document.getElementById("refresh-server-button").addEventListener("click", async () => {
  const serverResponse = await sdk.module.fetch("/summary")
  if (!serverResponse.ok) {
    throw new Error(\`Module server request failed: \${serverResponse.status}\`)
  }
  state.serverSummary = await serverResponse.json()
  render()
  reportRuntimeState()
  await sdk.ui.notify({
    tone: "info",
    message: "Module server summary refreshed",
  })
})

document.getElementById("open-models-button").addEventListener("click", async () => {
  await sdk.host.navigation.openBuiltin("models")
})

document.getElementById("save-note-button").addEventListener("click", async () => {
  const payload = {
    note: state.noteDraft,
    updatedAt: new Date().toISOString(),
  }
  await sdk.host.storage.set("module.note", payload)
  state.savedNote = payload
  updateDirtyState()
  render()
  reportRuntimeState()
  await sdk.ui.notify({
    tone: "success",
    message: "Module note saved",
  })
})

document.getElementById("clear-note-button").addEventListener("click", async () => {
  await sdk.host.storage.remove("module.note")
  state.savedNote = null
  state.noteDraft = ""
  updateDirtyState()
  render()
  reportRuntimeState()
  await sdk.ui.notify({
    tone: "info",
    message: "Module note cleared",
  })
})

sdk.onContextChange((context) => {
  state.context = context
  render()
  reportRuntimeState()
})

loadModuleData().catch(async (error) => {
  render()
  sdk.reportState({
    ready: false,
    title: ${JSON.stringify(input.title)},
    subtitle: error instanceof Error ? error.message : String(error),
    health: "error",
    lastUpdatedAt: new Date().toISOString(),
  })
  await sdk.ui.notify({
    tone: "error",
    message: error instanceof Error ? error.message : String(error),
  })
})
`
}

async function scaffoldModule(options) {
  const targetDir = resolve(process.cwd(), options.targetDir)
  const targetDirName = options.targetDir.split(/[\\\\/]/).filter(Boolean).pop() || "maomi-module"
  const moduleId = normalizeText(options.moduleId) || deriveModuleId(targetDirName)
  const packageName = normalizeText(options.packageName) || derivePackageName(targetDirName)
  const title = normalizeText(options.title) || deriveTitle(targetDirName)
  const description = normalizeText(options.description)
    || `${title} module for MaomiAgent application surfaces.`

  const input = {
    targetDir,
    targetDirName,
    moduleId,
    packageName,
    title,
    description,
    requiresWorkspace: options.requiresWorkspace,
  }

  await ensureTargetDirectory(targetDir, options.force)

  await writeTextFile(join(targetDir, "package.json"), buildPackageJson(input), options.force)
  await writeTextFile(join(targetDir, "maomi.module.json"), buildManifest(input), options.force)
  await writeTextFile(join(targetDir, "README.md"), buildReadme(input), options.force)
  await writeTextFile(join(targetDir, "server", "index.mjs"), buildServerIndexMjs(input), options.force)
  await writeTextFile(join(targetDir, "dist", "ui", "index.html"), buildIndexHtml(input), options.force)
  await writeTextFile(join(targetDir, "dist", "ui", "styles.css"), buildStylesCss(), options.force)
  await writeTextFile(join(targetDir, "dist", "ui", "main.js"), buildMainJs(input), options.force)

  console.log(`Scaffolded MaomiAgent module at ${targetDir}`)
  console.log(`- moduleId: ${moduleId}`)
  console.log(`- packageName: ${packageName}`)
  console.log("")
  console.log("Next steps:")
  console.log("1. Import this directory from MaomiAgent settings -> 模块管理")
  console.log("2. Open the generated menu entry")
  console.log("3. Replace dist/ui/* with your real module UI")
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help || !options.targetDir) {
      printUsage()
      process.exit(options.help ? 0 : 1)
    }
    await scaffoldModule(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.log("")
    printUsage()
    process.exit(1)
  }
}

void main()
