import COS from "cos-nodejs-sdk-v5"
import { access, readFile, readdir, stat } from "node:fs/promises"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ARTIFACT_DIRECTORY_PREFIX = "maomi-agent-updater-bundle-"
const DEFAULT_PUBLIC_BASE_URL = "https://maomiai-1252707544.cos.ap-guangzhou.myqcloud.com"
const DEFAULT_ARTIFACT_PREFIX = "packages/maomiagent-desktop"

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, "")
}

function normalizePathPrefix(value) {
  return normalizeText(value)
    .replace(/\\+/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/")
}

function readRequiredEnv(name) {
  const value = normalizeText(process.env[name])
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function resolveChannel(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === "beta" || normalized === "internal") {
    return normalized
  }
  return "stable"
}

function resolveVersion() {
  const raw = normalizeText(
    process.env.MAOMI_AGENT_RELEASE_VERSION
      ?? process.env.GITHUB_REF_NAME,
  )
  const normalized = raw.replace(/^[vV]/, "")
  if (!normalized) {
    throw new Error("Missing release version. Set MAOMI_AGENT_RELEASE_VERSION or GITHUB_REF_NAME.")
  }
  return normalized
}

function resolvePublicBaseUrl() {
  return normalizeBaseUrl(
    process.env.MAOMI_AGENT_UPDATE_PUBLIC_BASE_URL
      ?? process.env.MAOMI_AGENT_OSS_BUCKET_URL,
  ) || DEFAULT_PUBLIC_BASE_URL
}

function resolveArtifactPrefix() {
  return normalizePathPrefix(
    process.env.MAOMI_AGENT_UPDATE_ARTIFACT_PREFIX
      ?? process.env.MAOMI_AGENT_OSS_PREFIX,
  ) || DEFAULT_ARTIFACT_PREFIX
}

function resolveBundleRoot() {
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  return resolve(
    normalizeText(process.env.MAOMI_AGENT_UPDATE_BUNDLE_ROOT)
      || resolve(scriptDir, "..", "..", "..", ".tmp", "updater-bundles"),
  )
}

function buildObjectKey(...segments) {
  return segments
    .map((segment) => normalizePathPrefix(segment))
    .filter(Boolean)
    .join("/")
}

function buildPublicUrl(baseUrl, objectKey) {
  const encodedPath = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return new URL(encodedPath, `${normalizeBaseUrl(baseUrl)}/`).toString()
}

function parseCosBucketInfo(publicBaseUrl) {
  const parsedUrl = new URL(publicBaseUrl)
  const match = parsedUrl.host.match(/^([^.]+)\.cos\.([^.]+)\.myqcloud\.com$/)
  if (!match) {
    throw new Error(
      `Unsupported COS bucket URL: ${publicBaseUrl}. Expected https://<bucket>.cos.<region>.myqcloud.com`,
    )
  }

  return {
    bucket: match[1],
    region: match[2],
  }
}

function parseTargetTriple(target) {
  const normalized = normalizeText(target).toLowerCase()
  const arch = normalized.startsWith("x86_64-")
    ? "x86_64"
    : normalized.startsWith("i686-")
      ? "i686"
      : normalized.startsWith("aarch64-")
        ? "aarch64"
        : normalized.startsWith("armv7-")
          ? "armv7"
          : null

  const platform = normalized.includes("windows")
    ? "windows"
    : normalized.includes("apple-darwin")
      ? "darwin"
      : normalized.includes("linux")
        ? "linux"
        : null

  if (!arch || !platform) {
    throw new Error(`Unsupported Tauri target triple: ${target}`)
  }

  return {
    target: normalized,
    arch,
    platform,
    platformKey: `${platform}-${arch}`,
  }
}

function parseTargetFromArtifactDirectory(directoryName) {
  return directoryName.startsWith(ARTIFACT_DIRECTORY_PREFIX)
    ? directoryName.slice(ARTIFACT_DIRECTORY_PREFIX.length)
    : directoryName
}

function rankArtifact(input) {
  const fileName = input.fileName.toLowerCase()
  const preferences = input.platform === "windows"
    ? [".exe", ".msi", ".zip"]
    : input.platform === "darwin"
      ? [".app.tar.gz", ".tar.gz", ".zip", ".dmg"]
      : [".appimage", ".deb", ".rpm", ".tar.gz", ".zip"]

  const exactIndex = preferences.findIndex((suffix) => fileName.endsWith(suffix))
  return exactIndex >= 0 ? exactIndex : preferences.length
}

function selectPreferredArtifact(input) {
  if (input.candidates.length === 0) {
    throw new Error(`No updater artifacts were found for ${input.platformKey}`)
  }

  const ranked = [...input.candidates]
    .map((candidate) => ({
      candidate,
      rank: rankArtifact({
        platform: input.platform,
        fileName: candidate.fileName,
      }),
    }))
    .sort((left, right) => left.rank - right.rank || left.candidate.fileName.localeCompare(right.candidate.fileName, "en"))

  const best = ranked[0]
  const next = ranked[1]
  if (best && next && best.rank === next.rank) {
    throw new Error(
      `Multiple updater artifacts matched ${input.platformKey}: ${ranked.map((item) => item.candidate.fileName).join(", ")}`,
    )
  }

  return best.candidate
}

async function walkFiles(directoryPath) {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  })

  const results = []
  for (const entry of entries) {
    const fullPath = resolve(directoryPath, entry.name)
    if (entry.isDirectory()) {
      results.push(...await walkFiles(fullPath))
      continue
    }

    if (entry.isFile()) {
      results.push(fullPath)
    }
  }

  return results
}

async function discoverArtifactsForDirectory(input) {
  const files = await walkFiles(input.directoryPath)
  const signaturePaths = files
    .filter((filePath) => filePath.toLowerCase().endsWith(".sig"))
    .filter((filePath) => !filePath.toLowerCase().endsWith("latest.json.sig"))

  const candidates = []
  for (const signaturePath of signaturePaths) {
    const artifactPath = signaturePath.slice(0, -4)
    try {
      await access(artifactPath)
    } catch {
      continue
    }

    const fileInfo = await stat(artifactPath)
    if (!fileInfo.isFile()) {
      continue
    }

    candidates.push({
      artifactPath,
      fileName: basename(artifactPath),
      signature: (await readFile(signaturePath, "utf8")).trim(),
      body: await readFile(artifactPath),
      fileSize: fileInfo.size,
    })
  }

  const artifact = selectPreferredArtifact({
    platform: input.platform,
    platformKey: input.platformKey,
    candidates,
  })

  return {
    ...input,
    artifact,
  }
}

async function discoverPlatformArtifacts(bundleRoot) {
  const entries = await readdir(bundleRoot, {
    withFileTypes: true,
  })

  const bundleDirectories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      directoryName: entry.name,
      directoryPath: resolve(bundleRoot, entry.name),
    }))
    .sort((left, right) => left.directoryName.localeCompare(right.directoryName, "en"))

  if (bundleDirectories.length === 0) {
    throw new Error(`No updater bundle directories were found under ${bundleRoot}`)
  }

  const results = []
  for (const directory of bundleDirectories) {
    const target = parseTargetFromArtifactDirectory(directory.directoryName)
    const targetInfo = parseTargetTriple(target)
    results.push(await discoverArtifactsForDirectory({
      ...targetInfo,
      directoryName: directory.directoryName,
      directoryPath: directory.directoryPath,
    }))
  }

  return results
}

async function putObject(client, input) {
  await new Promise((resolvePromise, rejectPromise) => {
    client.putObject(
      {
        Bucket: input.bucket,
        Region: input.region,
        Key: input.objectKey,
        Body: input.body,
        ContentLength: input.body.length,
        ContentType: input.contentType,
        CacheControl: input.cacheControl,
      },
      (error) => {
        if (error) {
          rejectPromise(error)
          return
        }
        resolvePromise()
      },
    )
  })
}

function buildManifest(input) {
  const platforms = Object.fromEntries(input.artifacts.map((item) => {
    const objectKey = buildObjectKey(
      input.prefix,
      input.channel,
      `v${input.version}`,
      item.platformKey,
      item.artifact.fileName,
    )

    return [item.platformKey, {
      signature: item.artifact.signature,
      url: buildPublicUrl(input.baseUrl, objectKey),
    }]
  }))

  return {
    version: input.version,
    ...(input.notes ? { notes: input.notes } : {}),
    pub_date: input.publishedAt,
    platforms,
  }
}

async function main() {
  const version = resolveVersion()
  const channel = resolveChannel(process.env.MAOMI_AGENT_UPDATE_CHANNEL)
  const bundleRoot = resolveBundleRoot()
  const publicBaseUrl = resolvePublicBaseUrl()
  const artifactPrefix = resolveArtifactPrefix()
  const notes = normalizeText(process.env.MAOMI_AGENT_RELEASE_NOTES)
  const bucketInfo = parseCosBucketInfo(publicBaseUrl)
  const artifacts = await discoverPlatformArtifacts(bundleRoot)

  const client = new COS({
    SecretId: readRequiredEnv("MAOMI_AGENT_OSS_SECRET_ID"),
    SecretKey: readRequiredEnv("MAOMI_AGENT_OSS_SECRET_KEY"),
    SecurityToken: normalizeText(process.env.MAOMI_AGENT_OSS_SESSION_TOKEN) || undefined,
  })

  for (const item of artifacts) {
    const objectKey = buildObjectKey(
      artifactPrefix,
      channel,
      `v${version}`,
      item.platformKey,
      item.artifact.fileName,
    )

    await putObject(client, {
      ...bucketInfo,
      objectKey,
      body: item.artifact.body,
      contentType: "application/octet-stream",
      cacheControl: "public, max-age=31536000, immutable",
    })

    console.log(`[updater] uploaded ${item.platformKey} -> ${objectKey}`)
  }

  const publishedAt = new Date().toISOString()
  const manifest = buildManifest({
    artifacts,
    baseUrl: publicBaseUrl,
    prefix: artifactPrefix,
    channel,
    version,
    notes,
    publishedAt,
  })
  const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8")
  const latestManifestKey = buildObjectKey(artifactPrefix, channel, "latest.json")
  const versionedManifestKey = buildObjectKey(
    artifactPrefix,
    channel,
    `v${version}`,
    "latest.json",
  )

  await putObject(client, {
    ...bucketInfo,
    objectKey: versionedManifestKey,
    body: manifestBody,
    contentType: "application/json; charset=utf-8",
    cacheControl: "public, max-age=31536000, immutable",
  })
  await putObject(client, {
    ...bucketInfo,
    objectKey: latestManifestKey,
    body: manifestBody,
    contentType: "application/json; charset=utf-8",
    cacheControl: "no-cache",
  })

  console.log(`[updater] uploaded manifest -> ${latestManifestKey}`)
  console.log(`[updater] published ${artifacts.length} platform artifact(s) for v${version}`)
}

await main()
