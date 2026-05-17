import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const DEFAULT_PORTS = [1431, 4198]
const DEFAULT_PORT_STATE_FILES = [path.join('output', 'dev-run', 'app-web-dev-port.json')]
const DEFAULT_WINDOWS_EXE_NAME = 'maomi_agent.exe'
const DEFAULT_WINDOWS_DEBUG_ARTIFACTS = ['maomi_agent.exe', 'maomi_agent.pdb']
const DEFAULT_WINDOWS_DEBUG_DIR = path.join('app', 'src-tauri', 'target', 'debug')
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')

function getOption(name) {
  const prefix = `--${name}=`
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix))
  return argument ? argument.slice(prefix.length).trim() : ''
}

function parsePortsOption(raw) {
  if (!raw) {
    return DEFAULT_PORTS
  }

  const ports = raw
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0)

  return ports.length > 0 ? [...new Set(ports)] : DEFAULT_PORTS
}

function parseCsvOption(raw, fallback) {
  if (!raw) {
    return fallback
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return values.length > 0 ? values : fallback
}

const PORTS = parsePortsOption(getOption('ports'))
const PORT_STATE_FILES = parseCsvOption(getOption('state-files'), DEFAULT_PORT_STATE_FILES)
  .map((value) => path.resolve(REPO_ROOT, value))
const WINDOWS_EXE_NAME = getOption('exe') || DEFAULT_WINDOWS_EXE_NAME
const WINDOWS_DEBUG_ARTIFACTS = parseCsvOption(getOption('artifacts'), DEFAULT_WINDOWS_DEBUG_ARTIFACTS)
const WINDOWS_DEBUG_DIR = path.resolve(REPO_ROOT, getOption('debug-dir') || DEFAULT_WINDOWS_DEBUG_DIR)

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : ''
    const stderr = typeof error.stderr === 'string' ? error.stderr : ''
    const combined = [stdout, stderr].filter(Boolean).join('\n').trim()

    if (combined) {
      const wrapped = new Error(combined)
      wrapped.cause = error
      throw wrapped
    }

    throw error
  }
}

function getWindowsPortPids(port) {
  const output = run('netstat', ['-ano', '-p', 'tcp'])
  const pids = new Set()

  for (const line of output.split(/\r?\n/)) {
    if (!line.includes(`:${port}`)) {
      continue
    }

    const columns = line.trim().split(/\s+/)
    const localAddress = columns[1]
    const pid = columns.at(-1)

    if (!localAddress || !pid) {
      continue
    }

    if (!localAddress.endsWith(`:${port}`)) {
      continue
    }

    if (/^\d+$/.test(pid) && pid !== '0') {
      pids.add(pid)
    }
  }

  return [...pids]
}

function getUnixPortPids(port) {
  const commands = [
    ['lsof', ['-ti', `tcp:${port}`]],
    ['fuser', ['-n', 'tcp', String(port)]],
  ]

  for (const [command, args] of commands) {
    try {
      const output = run(command, args)
      return [...new Set(output.split(/\s+/).map((value) => value.trim()).filter((value) => /^\d+$/.test(value)))]
    } catch {
      continue
    }
  }

  return []
}

function getPortPids(port) {
  if (process.platform === 'win32') {
    return getWindowsPortPids(port)
  }

  return getUnixPortPids(port)
}

function killPid(pid) {
  if (process.platform === 'win32') {
    run('taskkill', ['/PID', String(pid), '/F', '/T'])
    return
  }

  run('kill', ['-9', String(pid)])
}

function killWindowsDesktopProcess() {
  if (process.platform !== 'win32') {
    return false
  }

  try {
    run('taskkill', ['/IM', WINDOWS_EXE_NAME, '/F', '/T'])
    return true
  } catch {
    return false
  }
}

async function removeWindowsDebugArtifacts() {
  if (process.platform !== 'win32') {
    return []
  }

  const removed = []

  for (const fileName of WINDOWS_DEBUG_ARTIFACTS) {
    const filePath = path.join(WINDOWS_DEBUG_DIR, fileName)

    try {
      await fs.access(filePath)
      await fs.rm(filePath, { force: true })
      removed.push(filePath)
    } catch {
      continue
    }
  }

  return removed
}

async function loadRecordedPorts() {
  const ports = []

  for (const filePath of PORT_STATE_FILES) {
    try {
      const raw = (await fs.readFile(filePath, 'utf-8')).trim()
      if (!raw) {
        continue
      }

      const parsed = JSON.parse(raw)
      const port = Number.parseInt(String(parsed?.port ?? ''), 10)
      if (Number.isInteger(port) && port > 0) {
        ports.push(port)
      }
    } catch {
      continue
    }
  }

  return [...new Set(ports)]
}

async function clearPortStateFiles() {
  const removed = []

  for (const filePath of PORT_STATE_FILES) {
    try {
      await fs.access(filePath)
      await fs.rm(filePath, { force: true })
      removed.push(filePath)
    } catch {
      continue
    }
  }

  return removed
}

async function main() {
  const recordedPorts = await loadRecordedPorts()
  const portsToClean = [...new Set([...PORTS, ...recordedPorts])]
  const killedByPort = []

  for (const port of portsToClean) {
    const pids = getPortPids(port)

    for (const pid of pids) {
      try {
        killPid(pid)
        killedByPort.push({ port, pid })
      } catch (error) {
        console.warn(`[dev-clean-ports] failed to kill pid ${pid} on port ${port}: ${error.message}`)
      }
    }
  }

  const killedDesktop = killWindowsDesktopProcess()
  const removedArtifacts = await removeWindowsDebugArtifacts()
  const removedPortStateFiles = await clearPortStateFiles()

  if (killedByPort.length === 0 && !killedDesktop && removedArtifacts.length === 0 && removedPortStateFiles.length === 0) {
    console.log('[dev-clean-ports] nothing to clean')
    return
  }

  for (const { port, pid } of killedByPort) {
    console.log(`[dev-clean-ports] killed pid ${pid} on port ${port}`)
  }

  if (killedDesktop) {
    console.log(`[dev-clean-ports] killed ${WINDOWS_EXE_NAME}`)
  }

  for (const artifact of removedArtifacts) {
    console.log(`[dev-clean-ports] removed ${artifact}`)
  }

  for (const filePath of removedPortStateFiles) {
    console.log(`[dev-clean-ports] removed ${filePath}`)
  }
}

main().catch((error) => {
  console.error(`[dev-clean-ports] ${error.message}`)
  process.exitCode = 1
})
