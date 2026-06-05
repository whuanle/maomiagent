import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

type ChannelWorkspaceKind = "wechat" | "feishu";

export type ChannelDedicatedWorkspaceDescriptor = {
  workspaceId: string;
  directoryPath: string;
  name: string;
};

function sanitizeWorkspacePart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "channel-scope";
}

function buildWorkspaceId(channel: ChannelWorkspaceKind, scopeKey: string): string {
  const readable = sanitizeWorkspacePart(scopeKey).slice(0, 40);
  const digest = createHash("sha1")
    .update(`${channel}:${scopeKey}`)
    .digest("hex")
    .slice(0, 12);
  return `${channel}-${readable}-${digest}`.slice(0, 64);
}

export function buildChannelDedicatedWorkspaceDescriptor(input: {
  channel: ChannelWorkspaceKind;
  scopeKey: string;
  label: string;
}): ChannelDedicatedWorkspaceDescriptor {
  const workspaceId = buildWorkspaceId(input.channel, input.scopeKey);
  return {
    workspaceId,
    directoryPath: join(
      homedir(),
      ".maomiagent",
      "desktop",
      "workspaces",
      "channels",
      input.channel,
      workspaceId,
    ),
    name: `${input.channel === "wechat" ? "微信用户" : "飞书会话"} ${input.label || workspaceId}`.trim(),
  };
}
