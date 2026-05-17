import { createDecipheriv } from "node:crypto";
import { promises as fs } from "node:fs";
import { extname, join } from "node:path";

import {
  type WechatCdnMedia,
  type WechatMessageItem,
  WECHAT_MESSAGE_ITEM_TYPE,
} from "./wechat-api-client";

type WechatSavedMediaAsset = {
  kind: "image" | "voice" | "file" | "video";
  path: string;
  mimeType?: string;
  fileName?: string;
  sizeBytes: number;
};

type WechatVoiceDecoder = (
  silkBuffer: Buffer,
  sampleRate: number,
) => Promise<{
  data: Uint8Array;
  duration?: number;
}>;

const DEFAULT_IMAGE_EXTENSION = ".jpg";
const DEFAULT_VIDEO_EXTENSION = ".mp4";
const DEFAULT_VOICE_EXTENSION = ".silk";
const DEFAULT_VOICE_TRANSCODED_EXTENSION = ".wav";
const DEFAULT_FILE_EXTENSION = ".bin";

const MIME_BY_EXTENSION: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".silk": "audio/silk",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function inferMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function normalizeFilenameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_") || "media";
}

function decryptAesEcb(buffer: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv(
    "aes-128-ecb",
    Uint8Array.from(key),
    null,
  );
  const head = decipher.update(Uint8Array.from(buffer));
  const tail = decipher.final();
  const merged = new Uint8Array(head.length + tail.length);
  merged.set(head, 0);
  merged.set(tail, head.length);
  return Buffer.from(merged);
}

function parseAesKeyBase64(value: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 16) {
    return decoded;
  }

  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }

  throw new Error("invalid wechat media aes_key");
}

function buildCdnDownloadUrl(cdnBaseUrl: string, encryptQueryParam: string): string {
  return `${ensureTrailingSlash(cdnBaseUrl)}download?encrypted_query_param=${encodeURIComponent(encryptQueryParam)}`;
}

function pcmBytesToWav(pcm: Uint8Array, sampleRate: number): Buffer {
  const pcmBytes = pcm.byteLength;
  const totalSize = 44 + pcmBytes;
  const buf = Buffer.allocUnsafe(totalSize);
  let offset = 0;

  buf.write("RIFF", offset);
  offset += 4;
  buf.writeUInt32LE(totalSize - 8, offset);
  offset += 4;
  buf.write("WAVE", offset);
  offset += 4;

  buf.write("fmt ", offset);
  offset += 4;
  buf.writeUInt32LE(16, offset);
  offset += 4;
  buf.writeUInt16LE(1, offset);
  offset += 2;
  buf.writeUInt16LE(1, offset);
  offset += 2;
  buf.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset);
  offset += 4;
  buf.writeUInt16LE(2, offset);
  offset += 2;
  buf.writeUInt16LE(16, offset);
  offset += 2;

  buf.write("data", offset);
  offset += 4;
  buf.writeUInt32LE(pcmBytes, offset);
  offset += 4;

  buf.set(pcm, offset);
  return buf;
}

async function fetchCdnBytes(url: string, timeoutMs = 30_000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `wechat cdn request failed: HTTP ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function loadWechatVoiceDecoder(): Promise<WechatVoiceDecoder | null> {
  try {
    const dynamicImport = new Function("specifier", "return import(specifier)") as (
      specifier: string,
    ) => Promise<unknown>;
    const module = await dynamicImport("silk-wasm") as {
      decode?: WechatVoiceDecoder;
    };
    return typeof module.decode === "function" ? module.decode : null;
  } catch {
    return null;
  }
}

async function transcodeWechatSilkToWav(input: {
  silkBuffer: Buffer;
  sampleRate?: number;
  decoder?: WechatVoiceDecoder;
}): Promise<Buffer | null> {
  const decoder = input.decoder ?? await loadWechatVoiceDecoder();
  if (!decoder) {
    return null;
  }

  try {
    const sampleRate = input.sampleRate ?? 24_000;
    const result = await decoder(input.silkBuffer, sampleRate);
    if (!(result.data instanceof Uint8Array) || result.data.byteLength === 0) {
      return null;
    }
    return pcmBytesToWav(result.data, sampleRate);
  } catch {
    return null;
  }
}

async function downloadAndDecryptWechatMedia(input: {
  cdnBaseUrl: string;
  media: WechatCdnMedia;
}): Promise<Buffer> {
  const encryptQueryParam = input.media.encrypt_query_param?.trim();
  if (!encryptQueryParam) {
    throw new Error("wechat media encrypt_query_param is required");
  }

  const encrypted = await fetchCdnBytes(buildCdnDownloadUrl(input.cdnBaseUrl, encryptQueryParam));
  const aesKey = input.media.aes_key?.trim();
  if (!aesKey) {
    return encrypted;
  }

  return decryptAesEcb(encrypted, parseAesKeyBase64(aesKey));
}

function buildSavedMediaPath(input: {
  destinationDir: string;
  messageId: string;
  kind: WechatSavedMediaAsset["kind"];
  fileName?: string;
  fallbackExtension: string;
}): string {
  const stem = normalizeFilenameSegment(`${input.messageId}-${input.kind}`);
  const ext = input.fileName ? extname(input.fileName) || input.fallbackExtension : input.fallbackExtension;
  return join(input.destinationDir, `${stem}${ext}`);
}

async function saveWechatMediaBuffer(input: {
  destinationDir: string;
  messageId: string;
  kind: WechatSavedMediaAsset["kind"];
  buffer: Buffer;
  mimeType?: string;
  fileName?: string;
  fallbackExtension: string;
}): Promise<WechatSavedMediaAsset> {
  await fs.mkdir(input.destinationDir, { recursive: true });
  const savedPath = buildSavedMediaPath({
    destinationDir: input.destinationDir,
    messageId: input.messageId,
    kind: input.kind,
    fileName: input.fileName,
    fallbackExtension: input.fallbackExtension,
  });
  await fs.writeFile(savedPath, Uint8Array.from(input.buffer));

  return {
    kind: input.kind,
    path: savedPath,
    mimeType: input.mimeType,
    fileName: input.fileName,
    sizeBytes: input.buffer.byteLength,
  };
}

export async function saveWechatInboundMediaItem(input: {
  messageId: string;
  item: WechatMessageItem;
  cdnBaseUrl: string;
  destinationDir: string;
}): Promise<WechatSavedMediaAsset | null> {
  if (input.item.type === WECHAT_MESSAGE_ITEM_TYPE.IMAGE && input.item.image_item?.media?.encrypt_query_param) {
    const imageItem = input.item.image_item;
    const media = imageItem.media ?? {};
    const decrypted = imageItem.aeskey?.trim()
      ? decryptAesEcb(
          await fetchCdnBytes(buildCdnDownloadUrl(input.cdnBaseUrl, media.encrypt_query_param ?? "")),
          Buffer.from(imageItem.aeskey.trim(), "hex"),
        )
      : await downloadAndDecryptWechatMedia({
          cdnBaseUrl: input.cdnBaseUrl,
          media,
        });
    return saveWechatMediaBuffer({
      destinationDir: input.destinationDir,
      messageId: input.messageId,
      kind: "image",
      buffer: decrypted,
      mimeType: "image/jpeg",
      fallbackExtension: DEFAULT_IMAGE_EXTENSION,
    });
  }

  if (input.item.type === WECHAT_MESSAGE_ITEM_TYPE.VOICE && input.item.voice_item?.media?.encrypt_query_param) {
    const decrypted = await downloadAndDecryptWechatMedia({
      cdnBaseUrl: input.cdnBaseUrl,
      media: input.item.voice_item.media,
    });
    const transcoded = await transcodeWechatSilkToWav({
      silkBuffer: decrypted,
    });
    return saveWechatMediaBuffer({
      destinationDir: input.destinationDir,
      messageId: input.messageId,
      kind: "voice",
      buffer: transcoded ?? decrypted,
      mimeType: transcoded ? "audio/wav" : "audio/silk",
      fallbackExtension: transcoded ? DEFAULT_VOICE_TRANSCODED_EXTENSION : DEFAULT_VOICE_EXTENSION,
    });
  }

  if (input.item.type === WECHAT_MESSAGE_ITEM_TYPE.FILE && input.item.file_item?.media?.encrypt_query_param) {
    const fileItem = input.item.file_item;
    const fileName = fileItem.file_name?.trim() || undefined;
    const decrypted = await downloadAndDecryptWechatMedia({
      cdnBaseUrl: input.cdnBaseUrl,
      media: fileItem.media ?? {},
    });
    return saveWechatMediaBuffer({
      destinationDir: input.destinationDir,
      messageId: input.messageId,
      kind: "file",
      buffer: decrypted,
      mimeType: fileName ? inferMimeType(fileName) : "application/octet-stream",
      fileName,
      fallbackExtension: DEFAULT_FILE_EXTENSION,
    });
  }

  if (input.item.type === WECHAT_MESSAGE_ITEM_TYPE.VIDEO && input.item.video_item?.media?.encrypt_query_param) {
    const videoItem = input.item.video_item;
    const decrypted = await downloadAndDecryptWechatMedia({
      cdnBaseUrl: input.cdnBaseUrl,
      media: videoItem.media ?? {},
    });
    return saveWechatMediaBuffer({
      destinationDir: input.destinationDir,
      messageId: input.messageId,
      kind: "video",
      buffer: decrypted,
      mimeType: "video/mp4",
      fallbackExtension: DEFAULT_VIDEO_EXTENSION,
    });
  }

  return null;
}
