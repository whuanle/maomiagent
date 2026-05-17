import type {
  DesktopSkillItem,
  DesktopSkillsAdoptInput,
  DesktopSkillsAdoptResponse,
  DesktopSkillsDiscoveryResponse,
  DesktopSkillsListQuery,
  DesktopSkillsListResponse,
  DesktopSkillsMarketInstallInput,
  DesktopSkillsMarketInstallResponse,
  DesktopSkillsMarketProvider,
  DesktopSkillsMarketSearchQuery,
  DesktopSkillsMarketSearchResponse,
  DesktopSkillsPatchInput,
  DesktopSkillsRuntimeEffectiveResult,
} from "../models/desktop-skills.models";

export interface DesktopSkillsQueryPort {
  list(input?: DesktopSkillsListQuery): Promise<DesktopSkillsListResponse>;
  get(skillId: string): Promise<DesktopSkillItem | null>;
  discover(input?: { q?: string }): Promise<DesktopSkillsDiscoveryResponse>;
  getEffective(workspaceId?: string, q?: string): Promise<DesktopSkillsRuntimeEffectiveResult>;
}

export interface DesktopSkillsCommandPort {
  adopt(input: DesktopSkillsAdoptInput): Promise<DesktopSkillsAdoptResponse>;
  patch(skillId: string, input: DesktopSkillsPatchInput): Promise<DesktopSkillItem | null>;
  setEnabled(skillId: string, enabled: boolean): Promise<DesktopSkillItem | null>;
  remove(skillId: string): Promise<boolean>;
}

export interface DesktopSkillsMarketPort {
  listProviders(): DesktopSkillsMarketProvider[];
  search(input?: DesktopSkillsMarketSearchQuery): Promise<DesktopSkillsMarketSearchResponse>;
  install(input: DesktopSkillsMarketInstallInput): Promise<DesktopSkillsMarketInstallResponse>;
}

export type DesktopSkillsPort = DesktopSkillsQueryPort & DesktopSkillsCommandPort;