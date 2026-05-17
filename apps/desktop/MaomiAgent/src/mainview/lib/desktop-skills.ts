import type {
  DesktopSkillItem,
  DesktopSkillsAdoptInput,
  DesktopSkillsAdoptResponse,
  DesktopSkillsDeleteResponse,
  DesktopSkillsDiscoveryResponse,
  DesktopSkillsListQuery,
  DesktopSkillsListResponse,
  DesktopSkillsMarketInstallInput,
  DesktopSkillsMarketInstallResponse,
  DesktopSkillsMarketProvider,
  DesktopSkillsMarketProviderListResponse,
  DesktopSkillsMarketSearchQuery,
  DesktopSkillsMarketSearchResponse,
  DesktopSkillsMutationAction,
  DesktopSkillsMutationEvent,
  DesktopSkillsPatchInput,
  DesktopSkillsRuntimeEffectiveResult,
} from "../../shared/desktop-skills";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopSkillsBridge = {
  listDesktopSkills: (query?: DesktopSkillsListQuery) => Promise<DesktopSkillsListResponse>;
  getDesktopSkill: (skillId: string) => Promise<DesktopSkillItem | null>;
  discoverDesktopSkills: (query?: { q?: string }) => Promise<DesktopSkillsDiscoveryResponse>;
  getDesktopSkillsEffective: (query: { workspaceId?: string; q?: string }) => Promise<DesktopSkillsRuntimeEffectiveResult>;
  listDesktopSkillsMarketProviders: () => Promise<DesktopSkillsMarketProviderListResponse>;
  searchDesktopSkillsMarket: (query?: DesktopSkillsMarketSearchQuery) => Promise<DesktopSkillsMarketSearchResponse>;
  installDesktopSkillMarket: (input: DesktopSkillsMarketInstallInput) => Promise<DesktopSkillsMarketInstallResponse>;
  adoptDesktopSkill: (input: DesktopSkillsAdoptInput) => Promise<DesktopSkillsAdoptResponse>;
  patchDesktopSkill: (skillId: string, input: DesktopSkillsPatchInput) => Promise<DesktopSkillItem | null>;
  setDesktopSkillEnabled: (skillId: string, enabled: boolean) => Promise<DesktopSkillItem | null>;
  removeDesktopSkill: (skillId: string) => Promise<DesktopSkillsDeleteResponse>;
};

declare global {
  interface Window {
    maomiDesktopSkills?: DesktopSkillsBridge;
  }
}

export const DESKTOP_SKILLS_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;
export const DESKTOP_SKILLS_INVALIDATED_EVENT = "maomi:desktop-skills-invalidated";

function getDesktopSkillsBridge(): DesktopSkillsBridge {
  const bridge = window.maomiDesktopSkills;
  if (!bridge) {
    throw new Error("Desktop skills bridge is unavailable.");
  }

  return bridge;
}

function emitDesktopSkillsInvalidated(
  action: DesktopSkillsMutationAction,
  input: { skillId?: string; installRef?: string },
): void {
  const detail: DesktopSkillsMutationEvent = {
    action,
    skillId: input.skillId,
    installRef: input.installRef,
    at: new Date().toISOString(),
  };

  window.dispatchEvent(
    new CustomEvent<DesktopSkillsMutationEvent>(
      DESKTOP_SKILLS_INVALIDATED_EVENT,
      { detail },
    ),
  );
}

export function hasDesktopSkillsBridge(): boolean {
  return Boolean(window.maomiDesktopSkills);
}

export function listDesktopSkills(
  query: DesktopSkillsListQuery = {},
): Promise<DesktopSkillsListResponse> {
  return getDesktopSkillsBridge().listDesktopSkills(query);
}

export function getDesktopSkill(skillId: string): Promise<DesktopSkillItem | null> {
  return getDesktopSkillsBridge().getDesktopSkill(skillId);
}

export function discoverDesktopSkills(
  query: { q?: string } = {},
): Promise<DesktopSkillsDiscoveryResponse> {
  return getDesktopSkillsBridge().discoverDesktopSkills(query);
}

export function getDesktopSkillsEffective(
  query: { workspaceId?: string; q?: string } = {},
): Promise<DesktopSkillsRuntimeEffectiveResult> {
  return getDesktopSkillsBridge().getDesktopSkillsEffective(query);
}

export async function listDesktopSkillsMarketProviders(): Promise<DesktopSkillsMarketProvider[]> {
  const response = await getDesktopSkillsBridge().listDesktopSkillsMarketProviders();
  return response.items;
}

export function searchDesktopSkillsMarket(
  query: DesktopSkillsMarketSearchQuery = {},
): Promise<DesktopSkillsMarketSearchResponse> {
  return getDesktopSkillsBridge().searchDesktopSkillsMarket(query);
}

export async function installDesktopSkillMarket(
  input: DesktopSkillsMarketInstallInput,
): Promise<DesktopSkillsMarketInstallResponse> {
  const response = await getDesktopSkillsBridge().installDesktopSkillMarket(input);
  emitDesktopSkillsInvalidated("skill.market-installed", {
    skillId: response.item.skillId,
    installRef: response.installRef,
  });
  return response;
}

export async function adoptDesktopSkill(
  input: DesktopSkillsAdoptInput,
): Promise<DesktopSkillsAdoptResponse> {
  const response = await getDesktopSkillsBridge().adoptDesktopSkill(input);
  emitDesktopSkillsInvalidated("skill.adopted", { skillId: response.item.skillId });
  return response;
}

export async function patchDesktopSkill(
  skillId: string,
  input: DesktopSkillsPatchInput,
): Promise<DesktopSkillItem | null> {
  const item = await getDesktopSkillsBridge().patchDesktopSkill(skillId, input);
  if (item) {
    emitDesktopSkillsInvalidated("skill.updated", { skillId: item.skillId });
  }
  return item;
}

export async function setDesktopSkillEnabled(
  skillId: string,
  enabled: boolean,
): Promise<DesktopSkillItem | null> {
  const item = await getDesktopSkillsBridge().setDesktopSkillEnabled(skillId, enabled);
  if (item) {
    emitDesktopSkillsInvalidated(enabled ? "skill.enabled" : "skill.disabled", {
      skillId: item.skillId,
    });
  }
  return item;
}

export async function removeDesktopSkill(skillId: string): Promise<DesktopSkillsDeleteResponse> {
  const response = await getDesktopSkillsBridge().removeDesktopSkill(skillId);
  if (response.deleted) {
    emitDesktopSkillsInvalidated("skill.deleted", { skillId: response.skillId });
  }
  return response;
}