import type {
  AgentBundleMemberInput,
  AgentCreateInput,
  AgentItem,
  AgentPatchInput,
  AgentsListQuery,
  AgentsListResponse,
  DesktopAgentBundleSaveInput,
  DesktopAgentBundleSaveResponse,
  DesktopAgentBundleView,
  DesktopAgentCreateResponse,
  DesktopAgentDeleteResponse,
  OpencodeAgentImportInput,
  OpencodeAgentImportPreview,
  OpencodeAgentImportResult,
} from "../../shared/desktop-agents";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopAgentsBridge = {
  listDesktopAgents: (query?: AgentsListQuery) => Promise<AgentsListResponse>;
  getDesktopAgent: (agentId: string) => Promise<AgentItem | null>;
  getDesktopAgentBundle: (agentId: string) => Promise<DesktopAgentBundleView>;
  createDesktopAgent: (input: AgentCreateInput) => Promise<DesktopAgentCreateResponse>;
  updateDesktopAgent: (agentId: string, input: AgentPatchInput) => Promise<AgentItem | null>;
  saveDesktopAgentBundle: (input: DesktopAgentBundleSaveInput) => Promise<DesktopAgentBundleSaveResponse>;
  setDesktopAgentEnabled: (agentId: string, enabled: boolean) => Promise<AgentItem | null>;
  removeDesktopAgent: (agentId: string) => Promise<DesktopAgentDeleteResponse>;
  previewDesktopAgentImport: (input: OpencodeAgentImportInput) => Promise<OpencodeAgentImportPreview>;
  importDesktopAgents: (input: OpencodeAgentImportInput) => Promise<OpencodeAgentImportResult>;
};

declare global {
  interface Window {
    maomiDesktopAgents?: DesktopAgentsBridge;
  }
}

export const DESKTOP_AGENTS_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopAgentsBridge(): DesktopAgentsBridge {
  const bridge = window.maomiDesktopAgents;
  if (!bridge) {
    throw new Error("Desktop agents bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopAgentsBridge(): boolean {
  return Boolean(window.maomiDesktopAgents);
}

export function listDesktopAgents(query: AgentsListQuery = {}): Promise<AgentsListResponse> {
  return getDesktopAgentsBridge().listDesktopAgents(query);
}

export function getDesktopAgent(agentId: string): Promise<AgentItem | null> {
  return getDesktopAgentsBridge().getDesktopAgent(agentId);
}

export function getDesktopAgentBundle(agentId: string): Promise<DesktopAgentBundleView> {
  return getDesktopAgentsBridge().getDesktopAgentBundle(agentId);
}

export function createDesktopAgent(
  input: AgentCreateInput,
): Promise<DesktopAgentCreateResponse> {
  return getDesktopAgentsBridge().createDesktopAgent(input);
}

export function updateDesktopAgent(
  agentId: string,
  input: AgentPatchInput,
): Promise<AgentItem | null> {
  return getDesktopAgentsBridge().updateDesktopAgent(agentId, input);
}

export function saveDesktopAgentBundle(
  input: DesktopAgentBundleSaveInput,
): Promise<DesktopAgentBundleSaveResponse> {
  return getDesktopAgentsBridge().saveDesktopAgentBundle(input);
}

export function setDesktopAgentEnabled(
  agentId: string,
  enabled: boolean,
): Promise<AgentItem | null> {
  return getDesktopAgentsBridge().setDesktopAgentEnabled(agentId, enabled);
}

export function removeDesktopAgent(
  agentId: string,
): Promise<DesktopAgentDeleteResponse> {
  return getDesktopAgentsBridge().removeDesktopAgent(agentId);
}

export function previewDesktopAgentImport(
  input: OpencodeAgentImportInput,
): Promise<OpencodeAgentImportPreview> {
  return getDesktopAgentsBridge().previewDesktopAgentImport(input);
}

export function importDesktopAgents(
  input: OpencodeAgentImportInput,
): Promise<OpencodeAgentImportResult> {
  return getDesktopAgentsBridge().importDesktopAgents(input);
}