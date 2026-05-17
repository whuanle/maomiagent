export type DesktopSkillScope = "global";

export type DesktopSkillsListMeta = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

export type DesktopSkillItem = {
  skillId: string;
  name: string;
  label?: string;
  scope: DesktopSkillScope;
  workspaceId?: string;
  enabled: boolean;
  sourcePath?: string;
  managedPath: string;
  tags?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type DesktopSkillsStorage = {
  items: DesktopSkillItem[];
  version: string;
  updatedAt: string;
};

export type DesktopSkillsListQuery = {
  q?: string;
  enabled?: boolean;
  scope?: DesktopSkillScope;
  workspaceId?: string;
  limit?: number;
  offset?: number;
};

export type DesktopSkillsListResponse = {
  items: DesktopSkillItem[];
  meta: DesktopSkillsListMeta;
};

export type DesktopSkillsDiscoveryState =
  | "new"
  | "changed"
  | "unchanged"
  | "conflicted"
  | "adopted";

export type DesktopSkillsDiscoveryConflictType =
  | "ID_CONFLICT"
  | "MANIFEST_INVALID";

export type DesktopDiscoveredSkillItem = {
  skillId: string;
  source: string;
  sourcePath: string;
  hasSkillMarkdown: boolean;
  managed: boolean;
  enabled?: boolean;
  scope?: DesktopSkillScope;
  workspaceId?: string;
  state: DesktopSkillsDiscoveryState;
  conflictType?: DesktopSkillsDiscoveryConflictType;
  explain: string;
};

export type DesktopSkillsDiscoverySourceStatus = {
  source: string;
  label: string;
  strategy: string;
  candidatePaths: string[];
  existingPaths: string[];
  itemsCount: number;
};

export type DesktopSkillsDiscoveryResponse = {
  items: DesktopDiscoveredSkillItem[];
  sources: DesktopSkillsDiscoverySourceStatus[];
};

export type DesktopSkillsAdoptInput = {
  skillId?: string;
  id?: string;
  name?: string;
  label?: string;
  scope?: DesktopSkillScope;
  enabled?: boolean;
  sourcePath?: string;
  tags?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopSkillsAdoptResponse = {
  item: DesktopSkillItem;
  created: boolean;
};

export type DesktopSkillsPatchInput = {
  name?: string;
  label?: string;
  tags?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
};

export type DesktopSkillsMarketProviderId = "all" | "skills.sh" | "npm" | "github";
export type DesktopSkillsMarketItemProviderId = Exclude<DesktopSkillsMarketProviderId, "all">;

export type DesktopSkillsMarketProvider = {
  id: DesktopSkillsMarketProviderId;
  label: string;
};

export type DesktopSkillsMarketItem = {
  provider: DesktopSkillsMarketItemProviderId;
  installRef: string;
  skillId: string;
  title: string;
  url?: string;
  repository?: string;
  installs?: number;
};

export type DesktopSkillsMarketSearchQuery = {
  provider?: DesktopSkillsMarketProviderId;
  q?: string;
  limit?: number;
};

export type DesktopSkillsMarketSearchResponse = {
  provider: DesktopSkillsMarketProviderId;
  items: DesktopSkillsMarketItem[];
  providers: DesktopSkillsMarketProvider[];
};

export type DesktopSkillsMarketProviderListResponse = {
  items: DesktopSkillsMarketProvider[];
};

export type DesktopSkillsMarketInstallInput = {
  provider?: DesktopSkillsMarketProviderId;
  installRef?: string;
};

export type DesktopSkillsMarketInstallResponse = {
  provider: DesktopSkillsMarketProviderId;
  installRef: string;
  item: DesktopSkillItem;
  created: boolean;
};

export type DesktopSkillsDeleteResponse = {
  deleted: boolean;
  skillId: string;
};

export type DesktopSkillRuntimeDecision =
  | "effective"
  | "disabled"
  | "missing_path"
  | "missing_skill_markdown"
  | "duplicate_path";

export type DesktopSkillEffectiveRow = {
  effectiveId: string;
  winnerScope: DesktopSkillScope;
  winnerSkillId: string;
  shadowedSkillId?: string;
  decision: DesktopSkillRuntimeDecision;
  included: boolean;
  explain: string;
  item: DesktopSkillItem;
};

export type DesktopSkillsRuntimeEffectiveResult = {
  workspaceId?: string;
  paths: string[];
  items: DesktopSkillEffectiveRow[];
  diagnostics: {
    totalManaged: number;
    enabledManaged: number;
    effectivePaths: number;
    skippedDisabled: number;
    skippedMissingPath: number;
    skippedMissingSkillMarkdown: number;
    skippedDuplicatePath: number;
  };
};

export type DesktopSkillsMutationAction =
  | "skill.adopted"
  | "skill.updated"
  | "skill.enabled"
  | "skill.disabled"
  | "skill.deleted"
  | "skill.market-installed";

export type DesktopSkillsMutationEvent = {
  action: DesktopSkillsMutationAction;
  skillId?: string;
  installRef?: string;
  at: string;
};

export class DesktopSkillsError extends Error {
  readonly code: string;
  readonly data?: Record<string, unknown>;

  constructor(code: string, message: string, data?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.data = data;
  }
}