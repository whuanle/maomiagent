import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { FeishuDocIRAsset } from "../../../../../shared/desktop-feishu-doc-ir";

function safePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_") || "unknown";
}

function extensionFromMime(mime: string): string {
  if (mime === "image/png") {
    return ".png";
  }
  if (mime === "image/jpeg") {
    return ".jpg";
  }
  if (mime === "image/webp") {
    return ".webp";
  }
  if (mime === "application/pdf") {
    return ".pdf";
  }
  return ".bin";
}

export class FeishuDocAssetCache {
  constructor(private readonly cacheRoot: string) {}

  async writeAsset(input: {
    workspaceId: string;
    docId: string;
    token: string;
    kind: FeishuDocIRAsset["kind"];
    mime: string;
    bytes: Uint8Array;
    width?: number;
    height?: number;
    name?: string;
  }): Promise<FeishuDocIRAsset & { absolutePath: string }> {
    const hash = createHash("sha256").update(input.bytes).digest("hex");
    const cacheKey = `sha256:${hash}`;
    const workspacePart = safePart(input.workspaceId);
    const docPart = safePart(input.docId);
    const fileName = `${safePart(input.token)}-${hash}${extensionFromMime(input.mime)}`;
    const relativePath = join(workspacePart, docPart, fileName);
    const absolutePath = join(this.cacheRoot, relativePath);

    await mkdir(join(this.cacheRoot, workspacePart, docPart), { recursive: true });
    await writeFile(absolutePath, input.bytes);

    return {
      token: input.token,
      kind: input.kind,
      mime: input.mime,
      cacheKey,
      status: "cached",
      localPath: relativePath,
      checksum: cacheKey,
      width: input.width,
      height: input.height,
      name: input.name,
      absolutePath,
    };
  }
}