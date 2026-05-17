import { expect, test } from "bun:test";

import type { DesktopWechatPort } from "../../abstraction/ports/desktop-wechat.ports";
import type { WechatConversationRuntimeContextView } from "../../../../../shared/desktop-wechat";
import { DesktopWechatConversationCapabilityProvider } from "./desktop-wechat-conversation-capability-provider";

function createRuntimeContext(): WechatConversationRuntimeContextView {
  return {
    sessionId: "wechat-session",
    workspaceId: "workspace-1",
    accountId: "wechat-account",
    peerId: "peer-1",
    bindingKey: "wechat-account:peer-1",
    lastContextToken: "context-token-1",
    pendingMessageCount: 0,
    recentMessages: [
      {
        accountId: "wechat-account",
        peerId: "peer-1",
        messageId: "message-1",
        conversationKey: "wechat-account:peer-1",
        status: "completed",
        queryPreview: "看下这个截图",
        responsePreview: "处理中",
        mediaAssets: [{
          kind: "image",
          path: "E:/workspace/shot.png",
          fileName: "shot.png",
          mimeType: "image/png",
          sizeBytes: 128,
        }],
        createdAt: "2026-05-07T00:00:00.000Z",
        updatedAt: "2026-05-07T00:00:00.000Z",
      },
    ],
  };
}

test("desktop wechat capability provider exposes bound conversation tools", async () => {
  const textCalls: Array<{ sessionId: string; text: string; contextToken?: string }> = [];
  const mediaCalls: Array<{ sessionId: string; filePath: string; caption?: string; contextToken?: string }> = [];
  const provider = new DesktopWechatConversationCapabilityProvider({
    getConversationRuntimeContext: async () => createRuntimeContext(),
    sendConversationText: async (input) => {
      textCalls.push(input);
      return {
        clientId: "text-client-1",
        contextToken: input.contextToken,
      };
    },
    sendConversationMedia: async (input) => {
      mediaCalls.push(input);
      return {
        clientId: "media-client-1",
        kind: "image",
        fileName: "result.png",
        mimeType: "image/png",
        contextToken: input.contextToken,
      };
    },
  } satisfies Pick<DesktopWechatPort, "getConversationRuntimeContext" | "sendConversationText" | "sendConversationMedia">);

  const contribution = await provider.resolveRuntimeContribution({
    workspaceId: "workspace-1",
    sessionId: "wechat-session",
    sessionMetadata: {
      conversationSettings: {
        capabilityPreferences: {
          "wechat.runtime": true,
        },
      },
    },
  });

  expect(contribution?.toolSources).toHaveLength(1);
  expect(contribution?.toolHandlers).toHaveLength(2);

  const catalog = await contribution!.toolSources![0]!.listTools();
  if (!("source" in catalog)) {
    throw new Error("Expected tool source snapshot");
  }

  expect(catalog.source.sourceId).toBe("desktop.wechat.conversation");
  expect(catalog.tools.map((tool) => tool.name)).toEqual([
    "wechat_send_text",
    "wechat_send_media_file",
  ]);

  const textHandler = contribution!.toolHandlers!.find((handler) => handler.descriptor.name === "wechat_send_text");
  const mediaHandler = contribution!.toolHandlers!.find((handler) => handler.descriptor.name === "wechat_send_media_file");
  expect(textHandler).toBeTruthy();
  expect(mediaHandler).toBeTruthy();

  await textHandler!.execute({
    call: {
      input: {
        text: "请回个收到",
      },
    },
  } as any);
  await mediaHandler!.execute({
    call: {
      input: {
        filePath: "E:/workspace/result.png",
        caption: "这是结果图",
      },
    },
  } as any);

  expect(textCalls).toEqual([
    {
      sessionId: "wechat-session",
      text: "请回个收到",
      contextToken: undefined,
    },
  ]);
  expect(mediaCalls).toEqual([
    {
      sessionId: "wechat-session",
      filePath: "E:/workspace/result.png",
      caption: "这是结果图",
      contextToken: undefined,
    },
  ]);
});

test("desktop wechat capability provider stays disabled outside bound sessions", async () => {
  const provider = new DesktopWechatConversationCapabilityProvider({
    getConversationRuntimeContext: async () => undefined,
    sendConversationText: async () => ({ clientId: "unused" }),
    sendConversationMedia: async () => ({
      clientId: "unused",
      kind: "image",
      fileName: "unused.png",
      mimeType: "image/png",
    }),
  } satisfies Pick<DesktopWechatPort, "getConversationRuntimeContext" | "sendConversationText" | "sendConversationMedia">);

  const contribution = await provider.resolveRuntimeContribution({
    workspaceId: "workspace-1",
    sessionId: "desktop-session",
  });

  expect(contribution).toBeUndefined();
});

test("desktop wechat capability provider resolves wechat service lazily", async () => {
  let resolveCount = 0;
  const provider = new DesktopWechatConversationCapabilityProvider(() => {
    resolveCount += 1;
    return {
      getConversationRuntimeContext: async () => undefined,
      sendConversationText: async () => ({ clientId: "unused" }),
      sendConversationMedia: async () => ({
        clientId: "unused",
        kind: "image",
        fileName: "unused.png",
        mimeType: "image/png",
      }),
    } satisfies Pick<DesktopWechatPort, "getConversationRuntimeContext" | "sendConversationText" | "sendConversationMedia">;
  });

  expect(resolveCount).toBe(0);
  await provider.listCapabilities();
  expect(resolveCount).toBe(0);

  await provider.resolveRuntimeContribution({
    workspaceId: "workspace-1",
    sessionId: "desktop-session",
  });

  expect(resolveCount).toBe(1);
});
