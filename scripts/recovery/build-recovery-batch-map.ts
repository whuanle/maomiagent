import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { GitStatusEntry } from "./collect-recovery-inventory";
import { KNOWN_THINKING_EVIDENCE } from "./collect-recovery-inventory";
import { normalizeRepoPath, resolveRecoveryOutputPath } from "./recovery-paths";

export type RecoveryManifestMode = "copy" | "manual-chain";

export type RecoveryCopyEntry = {
  targetPath: string;
  sourceLayer: "layerA" | "layerB";
  sourcePath: string;
};

export type RecoveryManifest = {
  id: string;
  wave: string;
  module: string;
  mode: RecoveryManifestMode;
  summary: string;
  validationCommands: string[];
  entries?: RecoveryCopyEntry[];
  targetPaths?: string[];
  thinkingEvidence?: typeof KNOWN_THINKING_EVIDENCE;
};

const SKILLS_PATHS = [
  "apps/desktop/MaomiAgent/src/bun/modules/skills/implementation/services/desktop-skills-conversation-capability-provider.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/skills/implementation/services/managed-skills-service.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/skills/implementation/services/skills-discovery-definitions.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/skills/components/helpers.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/skills/components/panels.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/skills/components/table-columns.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/skills/page.tsx",
] as const;

const GIT_COPY_PATHS = [
  "apps/desktop/MaomiAgent/src/bun/modules/git/abstraction/models/desktop-git.models.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/git/abstraction/ports/desktop-git.ports.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/git/implementation/services/desktop-git-inspector.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/git/implementation/services/desktop-git-service.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/git/index.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/git/components/changes-workbench.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-ai-review-workbench-next.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-ai-review-workbench.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/git/components/gitignore-editor-modal.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/git/i18n.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/git/page.css",
] as const;

const BROWSER_PATHS = [
  "apps/desktop/MaomiAgent/src/mainview/modules/browser/page.css",
  "apps/desktop/MaomiAgent/src/mainview/modules/browser/page.tsx",
] as const;

const FEISHU_PATHS = [
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/abstraction/ports/desktop-feishu-store.ports.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/abstraction/ports/desktop-feishu.ports.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/composition/feishu.module.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/action-handlers/calendar-domain-action-handler.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-conversation-capability-provider.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-smart-assistant-action-registry.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-state-hydrator.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/stores/desktop-feishu-store.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/assistant-placeholder-panel.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/bot-config-panel.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/detail-panel.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-local-preview.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/feishu-docs-render-utils.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/integration-panel.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/personal-docs-panel.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/smart-assistant-panel.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/page-state.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.css",
  "apps/desktop/MaomiAgent/src/mainview/modules/feishu/page.tsx",
] as const;

const WECHAT_PATHS = [
  "apps/desktop/MaomiAgent/src/bun/modules/wechat/composition/wechat.module.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts",
] as const;

const CHAT_THINK_PATHS = [
  "apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx",
  "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.test.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.ts",
  "apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.test.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/conversation/implementation/services/desktop-conversation-service.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/conversation/tests/desktop-conversation-service.test.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/ai/implementation/services/desktop-ai-conversation-runtime.ts",
  "apps/desktop/MaomiAgent/src/bun/modules/ai/tests/desktop-ai-conversation-runtime-restrictions.test.ts",
] as const;

function copyEntries(paths: readonly string[]): RecoveryCopyEntry[] {
  return paths.map((repoPath) => ({
    targetPath: normalizeRepoPath(repoPath),
    sourceLayer: "layerB",
    sourcePath: normalizeRepoPath(repoPath),
  }));
}

export function resolvePriorityBatchOrder() {
  return [
    "B-SKILLS-001",
    "B-GIT-001",
    "B-BROWSER-001",
    "B-SHARED-BASE-001",
    "B-CHAT-CORE-001",
    "B-CHAT-THINK-002",
    "B-FEISHU-001",
    "B-WECHAT-001",
  ];
}

export function buildBatchManifests(_input: { statusEntries: readonly GitStatusEntry[] }): RecoveryManifest[] {
  return [
    {
      id: "B-SKILLS-001",
      wave: "P1",
      module: "skills",
      mode: "copy",
      summary: "Copy the dirty-source skills changes into the target before chat-dependent waves.",
      validationCommands: [
        "bun run typecheck",
      ],
      entries: copyEntries(SKILLS_PATHS),
    },
    {
      id: "B-GIT-001",
      wave: "P1",
      module: "git",
      mode: "copy",
      summary: "Copy only the modified git files. Keep deleted git paths deferred until intent is reviewed.",
      validationCommands: [
        "bun test apps/desktop/MaomiAgent/src/bun/modules/git/implementation/services/desktop-git-inspector.test.ts",
        "bun run typecheck",
      ],
      entries: copyEntries(GIT_COPY_PATHS),
    },
    {
      id: "B-BROWSER-001",
      wave: "P1",
      module: "browser",
      mode: "copy",
      summary: "Copy the dirty-source browser page changes into the target.",
      validationCommands: [
        "bun run typecheck",
      ],
      entries: copyEntries(BROWSER_PATHS),
    },
    {
      id: "B-SHARED-BASE-001",
      wave: "P2",
      module: "shared",
      mode: "manual-chain",
      summary: "Review shared and bridge surfaces before chat and runtime recovery.",
      validationCommands: [
        "bun run typecheck",
      ],
      targetPaths: [
        "apps/desktop/MaomiAgent/src/shared/desktop-conversation.ts",
        "apps/desktop/MaomiAgent/src/mainview/lib/desktop-conversation.ts",
      ],
    },
    {
      id: "B-CHAT-CORE-001",
      wave: "P3",
      module: "chat",
      mode: "manual-chain",
      summary: "Review chat core changes with compare artifacts before any broad chat overwrite.",
      validationCommands: [
        "bun test apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.test.ts",
        "bun run typecheck",
      ],
      targetPaths: [
        "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-panel.tsx",
        "apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.ts",
        "apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.ts",
      ],
    },
    {
      id: "B-CHAT-THINK-002",
      wave: "P3",
      module: "chat",
      mode: "manual-chain",
      summary: "Restore the thinkingEnabled chain across shared, chat, conversation, and runtime code.",
      validationCommands: [
        "bun test apps/desktop/MaomiAgent/src/mainview/modules/chat/components/conversation-workspace-settings-storage.test.ts apps/desktop/MaomiAgent/src/mainview/modules/chat/hooks/use-chat-workspace-pane-state.test.ts apps/desktop/MaomiAgent/src/bun/modules/conversation/tests/desktop-conversation-service.test.ts apps/desktop/MaomiAgent/src/bun/modules/ai/tests/desktop-ai-conversation-runtime-restrictions.test.ts",
        "bun run typecheck",
      ],
      targetPaths: [...CHAT_THINK_PATHS],
      thinkingEvidence: [...KNOWN_THINKING_EVIDENCE],
    },
    {
      id: "B-FEISHU-001",
      wave: "P4",
      module: "feishu",
      mode: "copy",
      summary: "Copy the dirty-source Feishu module changes, including the two untracked component files.",
      validationCommands: [
        "bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/tests/desktop-feishu-module.test.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.catalog.test.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-service.docs-refresh.test.ts",
        "bun run typecheck",
      ],
      entries: copyEntries(FEISHU_PATHS),
    },
    {
      id: "B-WECHAT-001",
      wave: "P5",
      module: "wechat",
      mode: "copy",
      summary: "Copy the dirty-source WeChat module changes after the shared conversation surface is stable.",
      validationCommands: [
        "bun test apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.catalog.test.ts apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-conversation-capability-provider.test.ts",
        "bun run typecheck",
      ],
      entries: copyEntries(WECHAT_PATHS),
    },
  ];
}

function formatBatchMap(manifests: readonly RecoveryManifest[]) {
  return [
    "# Recovery Batch Map",
    "",
    ...manifests.flatMap((manifest) => {
      const lines = [
        `## ${manifest.id}`,
        "",
        `- wave: ${manifest.wave}`,
        `- module: ${manifest.module}`,
        `- mode: ${manifest.mode}`,
        `- summary: ${manifest.summary}`,
      ];

      if (manifest.validationCommands.length > 0) {
        lines.push("- validation:");
        lines.push(...manifest.validationCommands.map((command) => `  - \`${command}\``));
      }

      lines.push("");
      return lines;
    }),
  ].join("\n");
}

if (import.meta.main) {
  const inventory = JSON.parse(
    await readFile(resolveRecoveryOutputPath("inventory.json"), "utf8"),
  ) as { layerB: { statusEntries: GitStatusEntry[] } };

  const manifests = buildBatchManifests({
    statusEntries: inventory.layerB.statusEntries,
  });

  await mkdir(resolveRecoveryOutputPath("batches"), { recursive: true });

  await writeFile(
    resolveRecoveryOutputPath("batch-map.md"),
    `${formatBatchMap(manifests)}\n`,
    "utf8",
  );

  for (const manifest of manifests) {
    await writeFile(
      resolveRecoveryOutputPath("batches", `${manifest.id}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(`Recovery batch map written to ${resolveRecoveryOutputPath("batch-map.md")}`);
}
