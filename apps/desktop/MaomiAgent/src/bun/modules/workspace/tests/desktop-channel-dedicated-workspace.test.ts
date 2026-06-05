import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  buildChannelDedicatedWorkspaceDescriptor,
} from "../implementation/services/desktop-channel-dedicated-workspace";

describe("buildChannelDedicatedWorkspaceDescriptor", () => {
  test("builds a stable WeChat descriptor from channel and scope key", () => {
    const first = buildChannelDedicatedWorkspaceDescriptor({
      channel: "wechat",
      scopeKey: "wechat-user:wxid_123",
      label: "wxid_123",
    });
    const second = buildChannelDedicatedWorkspaceDescriptor({
      channel: "wechat",
      scopeKey: "wechat-user:wxid_123",
      label: "wxid_123",
    });

    expect(first.workspaceId).toBe(second.workspaceId);
    expect(first.workspaceId).toStartWith("wechat-");
    expect(first.directoryPath).toBe(join(
      homedir(),
      ".maomiagent",
      "desktop",
      "workspaces",
      "channels",
      "wechat",
      first.workspaceId,
    ));
    expect(first.name).toContain("微信用户");
  });

  test("separates Feishu tenants even when chatId text matches", () => {
    const tenantA = buildChannelDedicatedWorkspaceDescriptor({
      channel: "feishu",
      scopeKey: "tenant-a:oc_123",
      label: "tenant-a / oc_123",
    });
    const tenantB = buildChannelDedicatedWorkspaceDescriptor({
      channel: "feishu",
      scopeKey: "tenant-b:oc_123",
      label: "tenant-b / oc_123",
    });

    expect(tenantA.workspaceId).not.toBe(tenantB.workspaceId);
    expect(tenantA.directoryPath).not.toBe(tenantB.directoryPath);
  });
});
