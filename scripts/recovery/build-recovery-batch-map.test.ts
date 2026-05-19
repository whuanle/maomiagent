import { describe, expect, test } from "bun:test";

import type { GitStatusEntry } from "./collect-recovery-inventory";
import {
  buildBatchManifests,
  resolvePriorityBatchOrder,
} from "./build-recovery-batch-map";

const sampleEntries: GitStatusEntry[] = [
  {
    code: " M",
    kind: "modified",
    module: "skills",
    path: "apps/desktop/MaomiAgent/src/mainview/modules/skills/page.tsx",
  },
  {
    code: " M",
    kind: "modified",
    module: "git",
    path: "apps/desktop/MaomiAgent/src/mainview/modules/git/components/changes-workbench.tsx",
  },
  {
    code: " M",
    kind: "modified",
    module: "browser",
    path: "apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx",
  },
  {
    code: " M",
    kind: "modified",
    module: "feishu",
    path: "apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx",
  },
];

describe("resolvePriorityBatchOrder", () => {
  test("keeps the approved wave order", () => {
    expect(resolvePriorityBatchOrder()).toEqual([
      "B-SKILLS-001",
      "B-GIT-001",
      "B-BROWSER-001",
      "B-SHARED-BASE-001",
      "B-CHAT-CORE-001",
      "B-CHAT-THINK-002",
      "B-FEISHU-001",
      "B-WECHAT-001",
    ]);
  });
});

describe("buildBatchManifests", () => {
  test("places the thinking chain into its own manual batch", () => {
    const manifests = buildBatchManifests({ statusEntries: sampleEntries });
    const thinkingBatch = manifests.find((item) => item.id === "B-CHAT-THINK-002");

    expect(thinkingBatch?.mode).toBe("manual-chain");
    expect(thinkingBatch?.targetPaths).toContain(
      "apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts",
    );
    expect(thinkingBatch?.targetPaths).toContain(
      "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.ts",
    );
  });

  test("emits copy-safe manifests for skills, git, browser, feishu, and wechat", () => {
    const manifests = buildBatchManifests({ statusEntries: sampleEntries });

    expect(manifests.find((item) => item.id === "B-SKILLS-001")?.mode).toBe("copy");
    expect(manifests.find((item) => item.id === "B-GIT-001")?.mode).toBe("copy");
    expect(manifests.find((item) => item.id === "B-BROWSER-001")?.mode).toBe("copy");
    expect(manifests.find((item) => item.id === "B-FEISHU-001")?.mode).toBe("copy");
    expect(manifests.find((item) => item.id === "B-WECHAT-001")?.mode).toBe("copy");
  });
});
