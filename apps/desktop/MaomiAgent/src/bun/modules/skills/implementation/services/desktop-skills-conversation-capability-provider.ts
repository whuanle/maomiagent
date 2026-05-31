import { promises as fs } from "node:fs";
import { join } from "node:path";

import type { RegisteredToolHandler } from "#maomiagent/kernel/src/adapters";
import type { ToolDescriptor } from "#maomiagent/kernel/core";
import type { ToolSource } from "#maomiagent/kernel/src/host/tools";

import type { DesktopAgentsQueryPort } from "../../../agents";
import type { DesktopConversationCapabilityProvider } from "../../../conversation/abstraction/ports/desktop-conversation-capabilities.ports";
import type { DesktopSkillEffectiveRow } from "../../abstraction/models/desktop-skills.models";
import type { DesktopSkillsQueryPort } from "../../abstraction/ports/desktop-skills.ports";

type ConversationSkillToolBinding = {
  row: DesktopSkillEffectiveRow;
  descriptor: ToolDescriptor;
  skillFilePath: string;
};

function readCapabilityEnabled(sessionMetadata: Record<string, unknown> | undefined) {
  const conversationSettings = sessionMetadata?.conversationSettings;
  if (!conversationSettings || typeof conversationSettings !== "object" || Array.isArray(conversationSettings)) {
    return true;
  }

  const settings = conversationSettings as Record<string, unknown>;
  const capabilityPreferences = settings.capabilityPreferences;
  if (capabilityPreferences && typeof capabilityPreferences === "object" && !Array.isArray(capabilityPreferences)) {
    const explicit = (capabilityPreferences as Record<string, unknown>)["skills.runtime"];
    if (typeof explicit === "boolean") {
      return explicit;
    }
  }

  return true;
}

function sanitizeToolSegment(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized || "skill";
}

function listEffectiveRows(rows: readonly DesktopSkillEffectiveRow[]) {
  return rows.filter((row) => row.included && row.decision === "effective");
}

function readSelectedAgentId(sessionMetadata: Record<string, unknown> | undefined) {
  const value = sessionMetadata?.selectedAgentId;
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

function readComposerMode(metadata: Record<string, unknown> | undefined) {
  const value = metadata?.composerMode;
  return value === "plan" || value === "agent"
    ? value
    : undefined;
}

async function filterRowsForSelectedAgent(input: {
  rows: readonly DesktopSkillEffectiveRow[];
  agents?: Pick<DesktopAgentsQueryPort, "get">;
  sessionMetadata?: Record<string, unknown>;
  runMetadata?: Record<string, unknown>;
}) {
  if (readComposerMode(input.runMetadata) === "plan" || readComposerMode(input.sessionMetadata) === "plan") {
    return input.rows;
  }

  const selectedAgentId = readSelectedAgentId(input.runMetadata)
    ?? readSelectedAgentId(input.sessionMetadata);
  if (!selectedAgentId || !input.agents) {
    return input.rows;
  }

  const agent = await input.agents.get(selectedAgentId);
  const bindings = agent?.skills?.bindings?.filter((binding) => binding.enabled !== false) ?? [];
  if (bindings.length === 0) {
    return input.rows;
  }

  const allowedSkillIds = new Set(bindings.map((binding) => binding.skillId));
  return input.rows.filter((row) => allowedSkillIds.has(row.item.skillId));
}

function buildBindingName(row: DesktopSkillEffectiveRow, index: number, seen: Set<string>) {
  const base = `skill__${sanitizeToolSegment(row.winnerSkillId)}`;
  let candidate = base;
  let suffix = index + 2;
  while (seen.has(candidate)) {
    candidate = `${base}__${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

function buildSkillToolDescription(row: DesktopSkillEffectiveRow) {
  const label = row.item.label?.trim() || row.item.name.trim() || row.item.skillId;
  const description = row.item.description?.trim();
  return [
    `Load the SKILL.md instructions for workspace skill "${label}".`,
    "Call this when the user's request matches the skill so you can follow its workflow precisely.",
    description,
  ].filter(Boolean).join(" ");
}

function buildConversationSkillToolBindings(
  rows: readonly DesktopSkillEffectiveRow[],
): ConversationSkillToolBinding[] {
  const seenNames = new Set<string>();
  return rows.map((row, index) => ({
    row,
    skillFilePath: join(row.item.managedPath, "SKILL.md"),
    descriptor: {
      name: buildBindingName(row, index, seenNames),
      description: buildSkillToolDescription(row),
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      metadata: {
        toolSourceKind: "desktop-skills",
        operationKind: "instruction_lookup",
        operationLabel: `Load workspace skill ${row.item.skillId}`,
        skillId: row.item.skillId,
      },
    },
  }));
}

class DesktopSkillsConversationToolSource implements ToolSource {
  constructor(private readonly bindings: readonly ConversationSkillToolBinding[]) {}

  async listTools() {
    const signature = this.bindings
      .map((binding) => `${binding.row.item.skillId}:${binding.row.item.updatedAt}`)
      .join("|");
    return {
      source: {
        sourceId: "desktop.skills.conversation",
        signature: `desktop-skills-conversation-v1:${signature}`,
        metadata: {
          toolSourceKind: "desktop-skills",
          skillCount: this.bindings.length,
        },
      },
      tools: this.bindings.map((binding) => binding.descriptor),
    };
  }
}

export class DesktopSkillsConversationCapabilityProvider
  implements DesktopConversationCapabilityProvider {
  constructor(
    private readonly skills: Pick<DesktopSkillsQueryPort, "getEffective">,
    private readonly agents?: Pick<DesktopAgentsQueryPort, "get">,
  ) {}

  async listCapabilities(input: { workspaceId: string; sessionId?: string }) {
    const effective = await this.skills.getEffective(input.workspaceId);
    const rows = listEffectiveRows(effective.items);
    if (rows.length === 0) {
      return [];
    }

    return [{
      capabilityId: "skills.runtime",
      moduleId: "desktop.skills",
      scope: "workspace" as const,
      controlKind: "toggle" as const,
      title: "启用 Skills",
      description: "提供按需加载的 Skill 技能指令。",
      statusText: `${rows.length} 个 Skills 已就绪`,
    }];
  }

  async resolveRuntimeContribution(input: {
    workspaceId: string;
    sessionId?: string;
    sessionMetadata?: Record<string, unknown>;
    runMetadata?: Record<string, unknown>;
  }) {
    if (!readCapabilityEnabled(input.sessionMetadata)) {
      return undefined;
    }

    const effective = await this.skills.getEffective(input.workspaceId);
    const rows = await filterRowsForSelectedAgent({
      rows: listEffectiveRows(effective.items),
      agents: this.agents,
      sessionMetadata: input.sessionMetadata,
      runMetadata: input.runMetadata,
    });
    if (rows.length === 0) {
      return undefined;
    }

    const bindings = buildConversationSkillToolBindings(rows);
    const toolHandlers: RegisteredToolHandler[] = bindings.map((binding) => ({
      descriptor: binding.descriptor,
      execute: async () => {
        let content = "";
        try {
          content = (await fs.readFile(binding.skillFilePath, "utf-8")).trim();
        } catch (error) {
          throw {
            code: "not_found",
            message: `workspace skill is unavailable: ${binding.row.item.skillId}`,
            retryable: false,
            metadata: {
              skillId: binding.row.item.skillId,
              managedPath: binding.row.item.managedPath,
              detail: error instanceof Error ? error.message : String(error),
            },
          };
        }

        if (!content) {
          throw {
            code: "invalid_state",
            message: `workspace skill is empty: ${binding.row.item.skillId}`,
            retryable: false,
            metadata: {
              skillId: binding.row.item.skillId,
              managedPath: binding.row.item.managedPath,
            },
          };
        }

        return {
          skillId: binding.row.item.skillId,
          name: binding.row.item.name,
          label: binding.row.item.label,
          description: binding.row.item.description,
          managedPath: binding.row.item.managedPath,
          content,
        };
      },
    }));

    return {
      toolSources: [new DesktopSkillsConversationToolSource(bindings)],
      toolHandlers,
    };
  }
}
