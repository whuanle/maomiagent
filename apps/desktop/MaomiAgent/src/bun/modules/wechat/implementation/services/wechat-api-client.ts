import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, extname } from "node:path";

const DEFAULT_CHANNEL_VERSION = "0.1.0";

const WECHAT_MESSAGE_TYPE = {
  USER: 1,
  BOT: 2,
} as const;

const WECHAT_MESSAGE_STATE = {
  FINISH: 2,
} as const;

export const WECHAT_MESSAGE_ITEM_TYPE = {
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5,
} as const;

export const WECHAT_UPLOAD_MEDIA_TYPE = {
  IMAGE: 1,
  VIDEO: 2,
  FILE: 3,
  VOICE: 4,
} as const;

type WechatBaseInfo = {
  channel_version?: string;
};

export type WechatApiOptions = {
  baseUrl: string;
  token?: string;
  routeTag?: string;
  timeoutMs?: number;
};

export type WechatTextItem = {
  text?: string;
};

export type WechatCdnMedia = {
  encrypt_query_param?: string;
  aes_key?: string;
  encrypt_type?: number;
};

export type WechatVoiceItem = {
  media?: WechatCdnMedia;
  text?: string;
};

export type WechatFileItem = {
  media?: WechatCdnMedia;
  file_name?: string;
  len?: string;
};

export type WechatImageItem = {
  media?: WechatCdnMedia;
  aeskey?: string;
  mid_size?: number;
};

export type WechatVideoItem = {
  media?: WechatCdnMedia;
  video_size?: number;
};

export type WechatRefMessage = {
  title?: string;
  message_item?: WechatMessageItem;
};

export type WechatMessageItem = {
  type?: number;
  text_item?: WechatTextItem;
  voice_item?: WechatVoiceItem;
  file_item?: WechatFileItem;
  image_item?: WechatImageItem;
  video_item?: WechatVideoItem;
  ref_msg?: WechatRefMessage;
};

export type WechatInboundMessage = {
  seq?: number;
  message_id?: number;
  from_user_id?: string;
  to_user_id?: string;
  create_time_ms?: number;
  session_id?: string;
  message_type?: number;
  message_state?: number;
  item_list?: WechatMessageItem[];
  context_token?: string;
};

type WechatGetUpdatesResponse = {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WechatInboundMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
};

type WechatBotQrResponse = {
  qrcode?: string;
  qrcode_img_content?: string;
};

type WechatBotQrStatusResponse = {
  status?: "wait" | "scaned" | "confirmed" | "expired";
  bot_token?: string;
  ilink_bot_id?: string;
  ilink_user_id?: string;
  baseurl?: string;
};

type WechatUploadUrlResponse = {
  upload_param?: string;
  thumb_upload_param?: string;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".wav": "audio/wav",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

function inferMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function aesEcbPaddedSize(size: number): number {
  return Math.ceil((size + 1) / 16) * 16;
}

function encryptAesEcb(buffer: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv(
    "aes-128-ecb",
    Uint8Array.from(key),
    null,
  );
  const head = cipher.update(Uint8Array.from(buffer));
  const tail = cipher.final();
  const merged = new Uint8Array(head.length + tail.length);
  merged.set(head, 0);
  merged.set(tail, head.length);
  return Buffer.from(merged);
}

function buildClientId() {
  return createHash("sha1")
    .update(`${Date.now()}-${randomBytes(8).toString("hex")}`)
    .digest("hex");
}

function buildWechatMessageBody(params: {
  toUserId: string;
  itemList?: WechatMessageItem[];
  contextToken?: string;
}) {
  return {
    msg: {
      from_user_id: "",
      to_user_id: params.toUserId,
      client_id: buildClientId(),
      message_type: WECHAT_MESSAGE_TYPE.BOT,
      message_state: WECHAT_MESSAGE_STATE.FINISH,
      context_token: params.contextToken,
      item_list: params.itemList?.length ? params.itemList : undefined,
    },
  };
}

function buildCdnUploadUrl(cdnBaseUrl: string, uploadParam: string, filekey: string): string {
  return `${ensureTrailingSlash(cdnBaseUrl)}upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildBaseInfo(): WechatBaseInfo {
  return {
    channel_version: DEFAULT_CHANNEL_VERSION,
  };
}

function randomWechatUin(): string {
  const value = Math.floor(Math.random() * 0xffffffff);
  return Buffer.from(String(value), "utf-8").toString("base64");
}

function buildHeaders(opts: {
  token?: string;
  routeTag?: string;
  body: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "Content-Length": String(Buffer.byteLength(opts.body, "utf-8")),
    "X-WECHAT-UIN": randomWechatUin(),
  };

  if (opts.token?.trim()) {
    headers.Authorization = `Bearer ${opts.token.trim()}`;
  }

  if (opts.routeTag?.trim()) {
    headers.SKRouteTag = opts.routeTag.trim();
  }

  return headers;
}

async function apiPost<T>(
  params: WechatApiOptions & {
    endpoint: string;
    body: Record<string, unknown>;
    timeoutMs?: number;
    allowAbortTimeout?: boolean;
  },
): Promise<T> {
  const payload = JSON.stringify({
    ...params.body,
    base_info: buildBaseInfo(),
  });

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL(params.endpoint, ensureTrailingSlash(params.baseUrl)), {
      method: "POST",
      headers: buildHeaders({
        token: params.token,
        routeTag: params.routeTag,
        body: payload,
      }),
      body: payload,
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (params.allowAbortTimeout && error instanceof Error && error.name === "AbortError") {
      return {
        ret: 0,
        msgs: [],
        get_updates_buf: String(params.body.get_updates_buf ?? ""),
      } as T;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function apiGet<T>(
  params: {
    url: string;
    routeTag?: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
  },
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    ...(params.headers ?? {}),
  };

  if (params.routeTag?.trim()) {
    headers.SKRouteTag = params.routeTag.trim();
  }

  try {
    const response = await fetch(params.url, {
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWechatBotQrCode(
  params: WechatApiOptions & {
    botType?: string;
  },
): Promise<WechatBotQrResponse> {
  const url = new URL(
    `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(params.botType?.trim() || "3")}`,
    ensureTrailingSlash(params.baseUrl),
  );
  return apiGet<WechatBotQrResponse>({
    url: url.toString(),
    routeTag: params.routeTag,
    timeoutMs: params.timeoutMs ?? 15_000,
  });
}

export async function fetchWechatQrLoginStatus(
  params: WechatApiOptions & {
    qrcode: string;
  },
): Promise<WechatBotQrStatusResponse> {
  const url = new URL(
    `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(params.qrcode)}`,
    ensureTrailingSlash(params.baseUrl),
  );
  return apiGet<WechatBotQrStatusResponse>({
    url: url.toString(),
    routeTag: params.routeTag,
    timeoutMs: params.timeoutMs ?? 35_000,
    headers: {
      "iLink-App-ClientVersion": "1",
    },
  });
}

export async function getWechatUpdates(
  params: WechatApiOptions & {
    getUpdatesBuf: string;
    timeoutMs?: number;
  },
): Promise<WechatGetUpdatesResponse> {
  return apiPost<WechatGetUpdatesResponse>({
    ...params,
    endpoint: "ilink/bot/getupdates",
    body: {
      get_updates_buf: params.getUpdatesBuf,
    },
    timeoutMs: params.timeoutMs ?? 35_000,
    allowAbortTimeout: true,
  });
}

export async function sendWechatTextMessage(
  params: WechatApiOptions & {
    toUserId: string;
    text: string;
    contextToken?: string;
  },
): Promise<{ clientId: string }> {
  const itemList = params.text.trim()
    ? [{
        type: WECHAT_MESSAGE_ITEM_TYPE.TEXT,
        text_item: {
          text: params.text,
        },
      } satisfies WechatMessageItem]
    : [];
  return sendWechatMessageItems({
    ...params,
    itemList,
  });
}

export async function sendWechatMessageItems(
  params: WechatApiOptions & {
    toUserId: string;
    itemList: WechatMessageItem[];
    contextToken?: string;
  },
): Promise<{ clientId: string }> {
  const body = buildWechatMessageBody({
    toUserId: params.toUserId,
    itemList: params.itemList,
    contextToken: params.contextToken,
  });
  const clientId = String(body.msg.client_id);
  await apiPost<Record<string, unknown>>({
    ...params,
    endpoint: "ilink/bot/sendmessage",
    body,
  });
  return { clientId };
}

export async function fetchWechatUploadUrl(
  params: WechatApiOptions & {
    filekey: string;
    mediaType: number;
    toUserId: string;
    rawSize: number;
    rawFileMd5: string;
    encryptedSize: number;
    aesKeyHex: string;
    noNeedThumb?: boolean;
  },
): Promise<WechatUploadUrlResponse> {
  return apiPost<WechatUploadUrlResponse>({
    ...params,
    endpoint: "ilink/bot/getuploadurl",
    body: {
      filekey: params.filekey,
      media_type: params.mediaType,
      to_user_id: params.toUserId,
      rawsize: params.rawSize,
      rawfilemd5: params.rawFileMd5,
      filesize: params.encryptedSize,
      no_need_thumb: params.noNeedThumb,
      aeskey: params.aesKeyHex,
    },
    timeoutMs: params.timeoutMs ?? 15_000,
  });
}

export async function sendWechatMediaFile(input: {
  filePath: string;
  toUserId: string;
  contextToken?: string;
  caption?: string;
  opts: WechatApiOptions;
  cdnBaseUrl: string;
}): Promise<{
  clientId: string;
  kind: "image" | "voice" | "file" | "video";
  fileName: string;
  mimeType: string;
}> {
  const buffer = await fs.readFile(input.filePath);
  const mimeType = inferMimeType(input.filePath);
  const fileName = basename(input.filePath);
  const kind = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("audio/")
      ? "voice"
    : mimeType.startsWith("video/")
      ? "video"
      : "file";
  const mediaType = kind === "image"
    ? WECHAT_UPLOAD_MEDIA_TYPE.IMAGE
    : kind === "voice"
      ? WECHAT_UPLOAD_MEDIA_TYPE.VOICE
    : kind === "video"
      ? WECHAT_UPLOAD_MEDIA_TYPE.VIDEO
      : WECHAT_UPLOAD_MEDIA_TYPE.FILE;
  const filekey = randomBytes(16).toString("hex");
  const aesKey = randomBytes(16);
  const rawFileMd5 = createHash("md5").update(Uint8Array.from(buffer)).digest("hex");
  const encryptedSize = aesEcbPaddedSize(buffer.byteLength);

  const uploadUrl = await fetchWechatUploadUrl({
    ...input.opts,
    filekey,
    mediaType,
    toUserId: input.toUserId,
    rawSize: buffer.byteLength,
    rawFileMd5,
    encryptedSize,
    aesKeyHex: aesKey.toString("hex"),
    noNeedThumb: true,
  });
  const uploadParam = uploadUrl.upload_param?.trim();
  if (!uploadParam) {
    throw new Error("wechat getuploadurl did not return upload_param");
  }

  const uploadController = new AbortController();
  const uploadTimer = setTimeout(() => uploadController.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch(buildCdnUploadUrl(input.cdnBaseUrl, uploadParam, filekey), {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(encryptAesEcb(buffer, aesKey)),
      signal: uploadController.signal,
    });
  } finally {
    clearTimeout(uploadTimer);
  }

  if (response.status !== 200) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `wechat cdn upload failed: HTTP ${response.status}`);
  }

  const encryptQueryParam = response.headers.get("x-encrypted-param")?.trim();
  if (!encryptQueryParam) {
    throw new Error("wechat cdn upload did not return x-encrypted-param");
  }

  const aesKeyBase64 = Buffer.from(aesKey.toString("hex")).toString("base64");
  const itemList: WechatMessageItem[] = [];
  const caption = input.caption?.trim();

  if (kind === "image") {
    itemList.push({
      type: WECHAT_MESSAGE_ITEM_TYPE.IMAGE,
      image_item: {
        media: {
          encrypt_query_param: encryptQueryParam,
          aes_key: aesKeyBase64,
          encrypt_type: 1,
        },
        mid_size: encryptedSize,
      },
    });
  } else if (kind === "voice") {
    itemList.push({
      type: WECHAT_MESSAGE_ITEM_TYPE.VOICE,
      voice_item: {
        media: {
          encrypt_query_param: encryptQueryParam,
          aes_key: aesKeyBase64,
          encrypt_type: 1,
        },
      },
    });
  } else if (kind === "video") {
    itemList.push({
      type: WECHAT_MESSAGE_ITEM_TYPE.VIDEO,
      video_item: {
        media: {
          encrypt_query_param: encryptQueryParam,
          aes_key: aesKeyBase64,
          encrypt_type: 1,
        },
        video_size: encryptedSize,
      },
    });
  } else {
    itemList.push({
      type: WECHAT_MESSAGE_ITEM_TYPE.FILE,
      file_item: {
        media: {
          encrypt_query_param: encryptQueryParam,
          aes_key: aesKeyBase64,
          encrypt_type: 1,
        },
        file_name: fileName,
        len: String(buffer.byteLength),
      },
    });
  }

  if (caption) {
    await sendWechatMessageItems({
      ...input.opts,
      toUserId: input.toUserId,
      contextToken: input.contextToken,
      itemList: [{
        type: WECHAT_MESSAGE_ITEM_TYPE.TEXT,
        text_item: {
          text: caption,
        },
      }],
    });
  }

  const sent = await sendWechatMessageItems({
    ...input.opts,
    toUserId: input.toUserId,
    contextToken: input.contextToken,
    itemList,
  });

  return {
    clientId: sent.clientId,
    kind,
    fileName,
    mimeType,
  };
}

export async function fetchWechatTypingTicket(
  params: WechatApiOptions & {
    userId: string;
    contextToken?: string;
  },
): Promise<string | undefined> {
  const response = await apiPost<{
    ret?: number;
    typing_ticket?: string;
  }>({
    ...params,
    endpoint: "ilink/bot/getconfig",
    body: {
      ilink_user_id: params.userId,
      context_token: params.contextToken,
    },
    timeoutMs: params.timeoutMs ?? 10_000,
  });

  if (response.ret !== 0) {
    return undefined;
  }

  const ticket = response.typing_ticket?.trim();
  return ticket || undefined;
}

export async function sendWechatTyping(
  params: WechatApiOptions & {
    body: {
      ilink_user_id: string;
      typing_ticket: string;
      status: 1 | 2;
    };
  },
): Promise<void> {
  await apiPost<Record<string, unknown>>({
    ...params,
    endpoint: "ilink/bot/sendtyping",
    body: params.body,
    timeoutMs: params.timeoutMs ?? 10_000,
  });
}

export async function verifyWechatConfigEndpoint(params: WechatApiOptions): Promise<void> {
  const payload = JSON.stringify({
    base_info: buildBaseInfo(),
    get_updates_buf: "",
  });

  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(new URL("ilink/bot/getupdates", ensureTrailingSlash(params.baseUrl)), {
      method: "POST",
      headers: buildHeaders({
        token: params.token,
        routeTag: params.routeTag,
        body: payload,
      }),
      body: payload,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
