import { basename } from "node:path";

import {
  buildArtifactObjectKey,
  buildLatestManifestObjectKey,
  buildVersionManifestObjectKey,
  inferAssetKind,
  inferContentType,
  inferPackageFormat,
  listReleaseArtifactFilePaths,
  parseArtifactFileName,
  readFileMetadata,
  resolveArtifactDirectory,
  resolveManifestPath,
  resolveObjectPrefix,
  resolvePublishedAt,
  resolveReleaseAppCode,
  resolveReleaseChannel,
  resolveReleaseNotes,
  resolveReleaseVersion,
  resolveReleaseVersionCode,
  resolveUploadPlanPath,
  type ReleaseManifest,
  type ReleaseManifestAsset,
  type ReleaseManifestPlatform,
  type ReleaseUploadPlan,
  type ReleaseUploadPlanItem,
} from "./release-common";

type MutablePlatform = {
  os: ReleaseManifestPlatform["os"];
  arch: ReleaseManifestPlatform["arch"];
  platformPrefix: string;
  hash?: string;
  updateInfo?: ReleaseManifestAsset;
  bundle?: ReleaseManifestAsset;
  installers: ReleaseManifestAsset[];
  patches: ReleaseManifestAsset[];
};

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  const artifactDirectory = resolveArtifactDirectory();
  const appCode = resolveReleaseAppCode();
  const channel = resolveReleaseChannel();
  const version = await resolveReleaseVersion();
  const versionCode = resolveReleaseVersionCode(version);
  const notes = await resolveReleaseNotes();
  const publishedAt = resolvePublishedAt();
  const generatedAt = new Date().toISOString();
  const objectPrefix = resolveObjectPrefix();
  const manifestPath = resolveManifestPath(artifactDirectory);
  const uploadPlanPath = resolveUploadPlanPath(artifactDirectory);
  const versionManifestObjectKey = buildVersionManifestObjectKey(objectPrefix, appCode, channel, version);
  const latestManifestObjectKey = buildLatestManifestObjectKey(objectPrefix, appCode, channel);
  const artifactFilePaths = await listReleaseArtifactFilePaths(artifactDirectory);

  if (artifactFilePaths.length === 0) {
    throw new Error(`No release artifacts found in ${artifactDirectory}`);
  }

  const platformMap = new Map<string, MutablePlatform>();
  const uploadPlanItems: ReleaseUploadPlanItem[] = [];

  for (const filePath of artifactFilePaths) {
    const fileName = basename(filePath);
    const parsed = parseArtifactFileName(fileName);
    if (parsed.channel !== channel) {
      throw new Error(`Artifact ${fileName} belongs to channel ${parsed.channel}, expected ${channel}`);
    }

    const metadata = await readFileMetadata(filePath);
    const objectKey = buildArtifactObjectKey(
      objectPrefix,
      appCode,
      channel,
      parsed.os,
      parsed.arch,
      version,
      fileName,
    );
    const kind = inferAssetKind(parsed.artifactName);
    const asset: ReleaseManifestAsset = {
      fileName,
      objectKey,
      contentType: inferContentType(parsed.artifactName),
      packageType: kind,
      packageFormat: inferPackageFormat(parsed.artifactName),
      size: metadata.size,
      sha256: metadata.sha256,
    };

    let platform = platformMap.get(parsed.platformPrefix);
    if (!platform) {
      platform = {
        os: parsed.os,
        arch: parsed.arch,
        platformPrefix: parsed.platformPrefix,
        installers: [],
        patches: [],
      };
      platformMap.set(parsed.platformPrefix, platform);
    }

    if (kind === "update-info") {
      if (platform.updateInfo) {
        throw new Error(`Multiple update.json artifacts found for ${parsed.platformPrefix}`);
      }
      const updateInfo = JSON.parse(await Bun.file(filePath).text()) as {
        version?: unknown;
        hash?: unknown;
        platform?: unknown;
        arch?: unknown;
      };
      const updateVersion = typeof updateInfo.version === "string" ? updateInfo.version.trim() : "";
      const updateHash = typeof updateInfo.hash === "string" ? updateInfo.hash.trim() : "";
      if (!updateVersion || !updateHash) {
        throw new Error(`Update info artifact ${fileName} is missing version or hash`);
      }
      if (updateVersion !== version) {
        throw new Error(`Update info artifact ${fileName} has version ${updateVersion}, expected ${version}`);
      }

      platform.hash = updateHash;
      platform.updateInfo = {
        ...asset,
        hash: updateHash,
      };
    } else if (kind === "bundle") {
      if (platform.bundle) {
        throw new Error(`Multiple bundle artifacts found for ${parsed.platformPrefix}`);
      }
      platform.bundle = asset;
    } else if (kind === "patch") {
      const fromHash = parsed.artifactName.replace(/\.patch$/u, "");
      platform.patches.push({
        ...asset,
        fromHash,
      });
    } else {
      platform.installers.push(asset);
    }

    uploadPlanItems.push({
      sourcePath: filePath,
      objectKey,
      contentType: asset.contentType,
      cacheControl: "public, max-age=31536000, immutable",
      size: asset.size,
      sha256: asset.sha256,
      kind: "artifact",
    });
  }

  const platforms: ReleaseManifestPlatform[] = [...platformMap.values()]
    .sort((left, right) => left.platformPrefix.localeCompare(right.platformPrefix, "en"))
    .map((platform) => {
      if (!platform.updateInfo) {
        throw new Error(`Missing update.json artifact for ${platform.platformPrefix}`);
      }
      if (!platform.bundle) {
        throw new Error(`Missing bundle artifact for ${platform.platformPrefix}`);
      }
      if (!platform.hash) {
        throw new Error(`Missing hash for ${platform.platformPrefix}`);
      }

      return {
        os: platform.os,
        arch: platform.arch,
        platformPrefix: platform.platformPrefix,
        hash: platform.hash,
        updateInfo: platform.updateInfo,
        bundle: platform.bundle,
        installers: [...platform.installers].sort((left, right) => left.fileName.localeCompare(right.fileName, "en")),
        patches: [...platform.patches].sort((left, right) => (left.fromHash || "").localeCompare(right.fromHash || "", "en")),
      };
    });

  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    generatedAt,
    publishedAt,
    appCode,
    channel,
    version,
    versionCode,
    notes,
    versionManifestObjectKey,
    latestManifestObjectKey,
    platforms,
  };

  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestMetadata = await readFileMetadata(manifestPath);

  uploadPlanItems.push({
    sourcePath: manifestPath,
    objectKey: versionManifestObjectKey,
    contentType: "application/json; charset=utf-8",
    cacheControl: "no-cache",
    size: manifestMetadata.size,
    sha256: manifestMetadata.sha256,
    kind: "version-manifest",
  });
  uploadPlanItems.push({
    sourcePath: manifestPath,
    objectKey: latestManifestObjectKey,
    contentType: "application/json; charset=utf-8",
    cacheControl: "no-cache",
    size: manifestMetadata.size,
    sha256: manifestMetadata.sha256,
    kind: "latest-manifest",
  });

  const uploadPlan: ReleaseUploadPlan = {
    schemaVersion: 1,
    generatedAt,
    manifestPath,
    items: uploadPlanItems,
  };

  await Bun.write(uploadPlanPath, `${JSON.stringify(uploadPlan, null, 2)}\n`);

  console.log(`Release manifest written: ${manifestPath}`);
  console.log(`Release upload plan written: ${uploadPlanPath}`);
  console.log(`Platforms: ${platforms.map((platform) => `${platform.platformPrefix}@${platform.hash.slice(0, 8)}`).join(", ")}`);
  console.log(`Upload items: ${uploadPlanItems.length}`);
}