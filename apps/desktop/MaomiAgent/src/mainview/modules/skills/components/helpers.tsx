import { Badge, Typography } from "antd";
import type { ReactNode } from "react";
import type { Translate } from "../../../i18n";
import type {
  DesktopDiscoveredSkillItem,
  DesktopSkillEffectiveRow,
  DesktopSkillItem,
  DesktopSkillsDiscoveryState,
  DesktopSkillsMarketItem,
  DesktopSkillsMarketProviderId,
} from "../../../../shared/desktop-skills";

const { Text } = Typography;

export type SkillFormValues = {
  skillId: string;
  name: string;
  label: string;
  enabled: boolean;
  sourcePath: string;
  tagsText: string;
  description: string;
};

export type SourceSummary = {
  source: string;
  label: string;
  strategy: string;
  candidatePaths: string[];
  existingPaths: string[];
  count: number;
  managedCount: number;
};

export const skillIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/;

export const initialSkillFormValues: SkillFormValues = {
  skillId: "",
  name: "",
  label: "",
  enabled: true,
  sourcePath: "",
  tagsText: "",
  description: "",
};

export function buildTabLabel(label: string, count?: number) {
  return (
    <span className="skills-page-tab-label">
      <span>{label}</span>
      {typeof count === "number" ? <Badge count={count} showZero className="skills-page-tab-badge" /> : null}
    </span>
  );
}

export function normalizeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function managedSkillDisplayName(item: DesktopSkillItem) {
  return item.label || item.name || item.skillId;
}

export function discoveryStateLabel(t: Translate, state: DesktopSkillsDiscoveryState) {
  return t(`技能页.发现.值.state.${state}` as never);
}

export function discoveryStateTagColor(state: DesktopSkillsDiscoveryState) {
  if (state === "changed") return "processing" as const;
  if (state === "adopted") return "success" as const;
  if (state === "conflicted") return "error" as const;
  if (state === "unchanged") return "default" as const;
  return "warning" as const;
}

export function managedStateMeta(t: Translate, row: DesktopDiscoveredSkillItem) {
  if (!row.managed) {
    return { color: "default" as const, label: t("技能页.值.未接入") };
  }
  return row.enabled
    ? { color: "processing" as const, label: t("技能页.值.已接入启用") }
    : { color: "warning" as const, label: t("技能页.值.已接入停用") };
}

export function skillMarkdownMeta(t: Translate, present: boolean) {
  return present
    ? { color: "success" as const, label: t("技能页.值.存在") }
    : { color: "default" as const, label: t("技能页.值.缺失") };
}

export function marketProviderLabel(t: Translate, provider: DesktopSkillsMarketProviderId, fallback?: string) {
  if (provider === "all") return t("技能页.市场.来源.all");
  if (provider === "skills.sh") return t("技能页.市场.来源.skillsSh");
  if (provider === "npm") return t("技能页.市场.来源.npm");
  if (provider === "github") return t("技能页.市场.来源.github");
  return fallback || provider;
}

export function effectiveDecisionMeta(t: Translate, row: DesktopSkillEffectiveRow) {
  const label = t(`技能页.生效.值.decision.${row.decision}` as never);
  if (row.decision === "effective") return { color: "success" as const, label };
  if (row.decision === "disabled") return { color: "warning" as const, label };
  return { color: "error" as const, label };
}

export function effectiveInclusionMeta(t: Translate, included: boolean) {
  return included
    ? { color: "success" as const, label: t("技能页.生效.值.已注入") }
    : { color: "default" as const, label: t("技能页.生效.值.未注入") };
}

export function rowKeyForDiscovery(item: DesktopDiscoveredSkillItem) {
  return `${item.source}:${item.skillId}:${item.sourcePath}`;
}

export function rowKeyForMarket(item: DesktopSkillsMarketItem) {
  return `${item.provider}:${item.installRef}`;
}

export function toSkillPayload(values: SkillFormValues): Record<string, unknown> {
  return {
    skillId: values.skillId.trim(),
    name: values.name.trim() || undefined,
    label: values.label.trim() || undefined,
    scope: "global",
    enabled: values.enabled,
    sourcePath: values.sourcePath.trim() || undefined,
    tags: values.tagsText
      ? values.tagsText.split(",").map((tag) => tag.trim()).filter(Boolean)
      : undefined,
    description: values.description.trim() || undefined,
  };
}

export function buildMetric(label: string, value: ReactNode) {
  return (
    <span className="skills-page-metric" key={label}>
      <Text type="secondary">{label}</Text>
      <Text strong>{value}</Text>
    </span>
  );
}