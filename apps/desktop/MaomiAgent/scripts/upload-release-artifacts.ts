import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

import {
  inferAssetKind,
  inferPackageFormat,
  normalizeText,
  parseArtifactFileName,
  resolveReleaseAppCode,
  resolveReleaseChannel,
  resolveReleaseNotes,
  resolveReleaseVersion,
  resolveReleaseVersionCode,
  resolveArtifactDirectory,
  resolveUploadPlanPath,
  type ReleaseUploadPlan,
  type ReleaseUploadPlanItem,
} from "./release-common";
import { resolveReleaseEndpoints } from "./release-endpoints";

type UploadTicket = {
  uploadUrl?: string;
  assetId: number;
  fileId: number;
  releaseId: number;
};

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  const artifactDirectory = resolveArtifactDirectory();
  const releaseEndpoints = resolveReleaseEndpoints();
  const uploadPlanPath = resolve(
    artifactDirectory,
    normalizeText(process.env.MAOMI_RELEASE_UPLOAD_PLAN_FILE) || basename(resolveUploadPlanPath(artifactDirectory)),
  );
  const requestUrl = releaseEndpoints.uploadRequestUrl;
  const completeUrl = releaseEndpoints.uploadCompleteUrl;
  const authHeader = normalizeText(process.env.MAOMI_RELEASE_UPLOAD_AUTH_HEADER) || "X-WoAI-Publish-Key";
  const authToken = normalizeText(process.env.MAOMI_RELEASE_UPLOAD_AUTH_TOKEN);
  const adminReleasesUrl = releaseEndpoints.adminReleasesUrl;
  const adminAuthHeader = normalizeText(process.env.MAOMI_RELEASE_ADMIN_AUTH_HEADER) || "Authorization";
  const adminAuthToken = normalizeAdminAuthToken(adminAuthHeader, normalizeText(process.env.MAOMI_RELEASE_ADMIN_AUTH_TOKEN));
  const appCode = resolveReleaseAppCode();
  const channel = resolveReleaseChannel();
  const version = await resolveReleaseVersion();
  const versionCode = resolveReleaseVersionCode(version);
  const releaseNotes = await resolveReleaseNotes();
  const releaseTitle = normalizeText(process.env.MAOMI_RELEASE_TITLE) || `${appCode} ${version}`;
  const isForceUpdate = readBooleanEnv("MAOMI_RELEASE_IS_FORCE_UPDATE");
  const isPushEnabled = readBooleanEnv("MAOMI_RELEASE_IS_PUSH_ENABLED");
  const isPrerelease = readBooleanEnv("MAOMI_RELEASE_IS_PRERELEASE") || version.includes("-");
  const minSupportedVersionCode = readOptionalIntegerEnv("MAOMI_RELEASE_MIN_SUPPORTED_VERSION_CODE");
  const uploadPlan = JSON.parse(await Bun.file(uploadPlanPath).text()) as ReleaseUploadPlan;

  if (!Array.isArray(uploadPlan.items) || uploadPlan.items.length === 0) {
    throw new Error(`Upload plan ${uploadPlanPath} does not contain any items`);
  }

  let releaseId: number | undefined;

  for (const item of uploadPlan.items) {
    if (item.kind !== "artifact") {
      console.log(`[release-upload] skipped non-asset ${basename(item.sourcePath)}`);
      continue;
    }

    const ticket = await requestUploadTicket({
      requestUrl,
      authHeader,
      authToken,
      appCode,
      channel,
      version,
      versionCode,
      item,
    });

    if (releaseId && releaseId !== ticket.releaseId) {
      throw new Error(`Unexpected releaseId ${ticket.releaseId} for ${basename(item.sourcePath)}; expected ${releaseId}`);
    }
    releaseId = ticket.releaseId;

    if (ticket.uploadUrl) {
      await uploadPlanItem(item, ticket.uploadUrl);
      console.log(`[release-upload] uploaded ${basename(item.sourcePath)}`);

      await completeUpload({
        completeUrl: resolveCompleteUrl(requestUrl, completeUrl, ticket.assetId),
        authHeader,
        authToken,
        item,
        assetId: ticket.assetId,
        fileId: ticket.fileId,
      });
      console.log(`[release-upload] completed ${basename(item.sourcePath)}`);
      continue;
    }

    console.log(`[release-upload] reused existing ${basename(item.sourcePath)}`);
  }

  if (!releaseId) {
    throw new Error("No artifact releaseId was produced during upload");
  }

  if (!adminAuthToken) {
    console.warn("[release-upload] skipped draft release metadata update because MAOMI_RELEASE_ADMIN_AUTH_TOKEN is missing");
    console.warn("[release-upload] uploaded assets remain draft-only until the release is updated and published through woai admin APIs");
    return;
  }

  await updateReleaseMetadata({
    adminReleasesUrl,
    authHeader: adminAuthHeader,
    authToken: adminAuthToken,
    releaseId,
    title: releaseTitle,
    releaseNotes,
    isForceUpdate,
    isPushEnabled,
    isPrerelease,
    minSupportedVersionCode,
  });
  console.log(`[release-upload] updated draft release ${releaseId}`);

  if (!releaseEndpoints.autoPublish) {
    console.log("[release-upload] kept release in draft mode because MAOMI_RELEASE_AUTO_PUBLISH is disabled");
    return;
  }

  await publishRelease({
    adminReleasesUrl,
    authHeader: adminAuthHeader,
    authToken: adminAuthToken,
    releaseId,
  });
  console.log(`[release-upload] published release ${releaseId}`);
}

async function requestUploadTicket(input: {
  requestUrl: string;
  authHeader: string;
  authToken: string;
  appCode: string;
  channel: string;
  version: string;
  versionCode: number;
  item: ReleaseUploadPlanItem;
}): Promise<UploadTicket> {
  const fileName = basename(input.item.sourcePath);
  const parsed = parseArtifactFileName(fileName);
  const digests = await computeFileDigests(input.item.sourcePath);

  if (digests.sha256 !== input.item.sha256) {
    throw new Error(`SHA256 mismatch for ${fileName}`);
  }

  const response = await fetch(input.requestUrl, {
    method: "POST",
    headers: buildJsonHeaders(input.authHeader, input.authToken),
    body: JSON.stringify({
      softwareCode: input.appCode,
      version: input.version,
      versionCode: input.versionCode,
      channel: input.channel,
      os: parsed.os,
      arch: parsed.arch,
      packageType: inferAssetKind(parsed.artifactName),
      packageFormat: inferPackageFormat(parsed.artifactName),
      fileName,
      contentType: input.item.contentType,
      fileSize: input.item.size,
      md5: digests.md5,
      sha256: input.item.sha256,
    }),
  });

  if (!response.ok) {
    throw new Error(`Upload ticket request failed (${response.status}) for ${fileName}: ${await response.text()}`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const uploadUrl = pickFirstText(payload, ["uploadUrl"]);
  const assetId = pickFirstInteger(payload, ["assetId"]);
  const fileId = pickFirstInteger(payload, ["fileId"]);
  const releaseId = pickFirstInteger(payload, ["releaseId"]);

  if (!assetId || !fileId || !releaseId) {
    throw new Error(`Upload ticket response is missing releaseId/assetId/fileId for ${fileName}`);
  }

  return {
    uploadUrl,
    assetId,
    fileId,
    releaseId,
  };
}

async function uploadPlanItem(item: ReleaseUploadPlanItem, uploadUrl: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": item.contentType,
      "Cache-Control": item.cacheControl,
    },
    body: Bun.file(item.sourcePath),
  });

  if (!response.ok) {
    throw new Error(`Artifact upload failed (${response.status}) for ${basename(item.sourcePath)}: ${await response.text()}`);
  }
}

async function completeUpload(input: {
  completeUrl: string;
  authHeader: string;
  authToken: string;
  item: ReleaseUploadPlanItem;
  assetId: number;
  fileId: number;
}): Promise<void> {
  const response = await fetch(input.completeUrl, {
    method: "POST",
    headers: buildJsonHeaders(input.authHeader, input.authToken),
    body: JSON.stringify({
      fileId: input.fileId,
      sha256: input.item.sha256,
    }),
  });

  if (!response.ok) {
    throw new Error(`Upload completion failed (${response.status}) for asset ${input.assetId}: ${await response.text()}`);
  }
}

async function updateReleaseMetadata(input: {
  adminReleasesUrl: string;
  authHeader: string;
  authToken: string;
  releaseId: number;
  title: string;
  releaseNotes: string;
  isForceUpdate: boolean;
  isPushEnabled: boolean;
  isPrerelease: boolean;
  minSupportedVersionCode?: number;
}): Promise<void> {
  const response = await fetch(joinUrl(input.adminReleasesUrl, String(input.releaseId)), {
    method: "PUT",
    headers: buildJsonHeaders(input.authHeader, input.authToken),
    body: JSON.stringify({
      title: input.title,
      releaseNotes: input.releaseNotes,
      isForceUpdate: input.isForceUpdate,
      isPushEnabled: input.isPushEnabled,
      isPrerelease: input.isPrerelease,
      ...(typeof input.minSupportedVersionCode === "number"
        ? { minSupportedVersionCode: input.minSupportedVersionCode }
        : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Release metadata update failed (${response.status}) for release ${input.releaseId}: ${await response.text()}`);
  }
}

async function publishRelease(input: {
  adminReleasesUrl: string;
  authHeader: string;
  authToken: string;
  releaseId: number;
}): Promise<void> {
  const response = await fetch(joinUrl(input.adminReleasesUrl, String(input.releaseId), "publish"), {
    method: "POST",
    headers: buildJsonHeaders(input.authHeader, input.authToken),
  });

  if (!response.ok) {
    throw new Error(`Release publish failed (${response.status}) for release ${input.releaseId}: ${await response.text()}`);
  }
}

function buildJsonHeaders(authHeader: string, authToken: string): HeadersInit {
  return {
    "Content-Type": "application/json; charset=utf-8",
    ...(authToken ? { [authHeader]: authToken } : {}),
  };
}

function pickFirstText(payload: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function pickFirstBoolean(payload: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    if (typeof payload[key] === "boolean") {
      return payload[key] as boolean;
    }
  }
  return false;
}

function pickFirstInteger(payload: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
  }
  return undefined;
}

function resolveCompleteUrl(requestUrl: string, completeUrl: string, assetId: number): string {
  const trimmed = completeUrl.trim();
  if (trimmed) {
    if (trimmed.includes("{assetId}")) {
      return trimmed.replaceAll("{assetId}", String(assetId));
    }

    return joinUrl(trimmed, String(assetId), "complete");
  }

  if (requestUrl.endsWith("/pre-upload")) {
    return `${requestUrl.slice(0, -"/pre-upload".length)}/${assetId}/complete`;
  }

  return joinUrl(requestUrl, String(assetId), "complete");
}

function joinUrl(base: string, ...segments: string[]): string {
  const normalizedBase = base.replace(/\/+$/u, "");
  const normalizedSegments = segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/gu, ""));
  return [normalizedBase, ...normalizedSegments].join("/");
}

function readBooleanEnv(name: string): boolean {
  const value = normalizeText(process.env[name]).toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function readOptionalIntegerEnv(name: string): number | undefined {
  const value = normalizeText(process.env[name]);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid integer environment variable ${name}: ${value}`);
  }

  return parsed;
}

function normalizeAdminAuthToken(authHeader: string, authToken: string): string {
  if (!authToken) {
    return "";
  }

  if (authHeader.toLowerCase() !== "authorization") {
    return authToken;
  }

  if (/^bearer\s+/iu.test(authToken)) {
    return authToken;
  }

  return `Bearer ${authToken}`;
}

async function computeFileDigests(filePath: string): Promise<{ md5: string; sha256: string }> {
  const file = Bun.file(filePath);
  const md5 = createHash("md5");
  const sha256 = createHash("sha256");

  for await (const chunk of file.stream()) {
    md5.update(chunk);
    sha256.update(chunk);
  }

  return {
    md5: md5.digest("hex"),
    sha256: sha256.digest("hex"),
  };
}