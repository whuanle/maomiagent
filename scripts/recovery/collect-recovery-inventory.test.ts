import { describe, expect, test } from "bun:test";

import {
  KNOWN_THINKING_EVIDENCE,
  parseGitStatusPorcelain,
  summarizeModuleBuckets,
} from "./collect-recovery-inventory";

describe("parseGitStatusPorcelain", () => {
  test("parses modified, deleted, and untracked paths", () => {
    const parsed = parseGitStatusPorcelain([
      " M apps/desktop/MaomiAgent/src/mainview/modules/skills/page.tsx",
      " D apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-tag-editor-modal.tsx",
      "?? apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/integration-panel.tsx",
    ]);

    expect(parsed).toEqual([
      {
        code: " M",
        kind: "modified",
        module: "skills",
        path: "apps/desktop/MaomiAgent/src/mainview/modules/skills/page.tsx",
      },
      {
        code: " D",
        kind: "deleted",
        module: "git",
        path: "apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-tag-editor-modal.tsx",
      },
      {
        code: "??",
        kind: "untracked",
        module: "feishu",
        path: "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/integration-panel.tsx",
      },
    ]);
  });
});

describe("summarizeModuleBuckets", () => {
  test("groups paths by module and status", () => {
    const summary = summarizeModuleBuckets(parseGitStatusPorcelain([
      " M apps/desktop/MaomiAgent/src/mainview/modules/chat/page.tsx",
      " D apps/desktop/MaomiAgent/src/mainview/modules/chat/components/workspace-file-location.ts",
      "?? apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/integration-panel.tsx",
    ]));

    expect(summary.chat).toEqual({
      modified: 1,
      deleted: 1,
      untracked: 0,
      total: 2,
    });
    expect(summary.feishu).toEqual({
      modified: 0,
      deleted: 0,
      untracked: 1,
      total: 1,
    });
  });
});

describe("KNOWN_THINKING_EVIDENCE", () => {
  test("keeps the confirmed thinking chain object ids", () => {
    expect(KNOWN_THINKING_EVIDENCE.map((item) => item.objectId)).toContain(
      "220329d065802b2e527ec55c874c061fbc30c73c",
    );
    expect(KNOWN_THINKING_EVIDENCE.map((item) => item.objectId)).toContain(
      "0f048928ed0943c701142e714f41a5fbbb93bc7a",
    );
  });
});
