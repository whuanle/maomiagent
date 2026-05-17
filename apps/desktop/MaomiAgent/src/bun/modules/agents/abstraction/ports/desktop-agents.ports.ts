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
} from "../models/desktop-agents.models";

export interface DesktopAgentsQueryPort {
  list(input?: AgentsListQuery): Promise<AgentsListResponse>;
  get(agentId: string): Promise<AgentItem | null>;
  getBundle(agentId: string): Promise<DesktopAgentBundleView>;
}

export interface DesktopAgentsCommandPort {
  create(input: AgentCreateInput): Promise<DesktopAgentCreateResponse>;
  update(agentId: string, input: AgentPatchInput): Promise<AgentItem | null>;
  saveBundle(input: DesktopAgentBundleSaveInput): Promise<DesktopAgentBundleSaveResponse>;
  setEnabled(agentId: string, enabled: boolean): Promise<AgentItem | null>;
  remove(agentId: string): Promise<DesktopAgentDeleteResponse>;
  previewImport(input: OpencodeAgentImportInput): Promise<OpencodeAgentImportPreview>;
  importAgents(input: OpencodeAgentImportInput): Promise<OpencodeAgentImportResult>;
}

export type DesktopAgentsPort = DesktopAgentsQueryPort & DesktopAgentsCommandPort;