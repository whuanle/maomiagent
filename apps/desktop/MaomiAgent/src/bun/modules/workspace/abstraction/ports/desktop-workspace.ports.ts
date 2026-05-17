import type {
  DesktopWorkspaceCreateInput,
  DesktopWorkspaceFileContentResult,
  DesktopWorkspaceFileTreeResult,
  DesktopWorkspaceItem,
  DesktopWorkspaceListQuery,
  DesktopWorkspaceListResponse,
  DesktopWorkspaceUpdateInput,
} from "../models/desktop-workspace.models";

export interface DesktopWorkspaceQueryPort {
  list(input?: DesktopWorkspaceListQuery): Promise<DesktopWorkspaceListResponse>;
  get(workspaceId: string): Promise<DesktopWorkspaceItem | null>;
  getFileTree(workspaceId: string, path?: string): Promise<DesktopWorkspaceFileTreeResult>;
  getFileContent(workspaceId: string, path: string): Promise<DesktopWorkspaceFileContentResult>;
}

export interface DesktopWorkspaceCommandPort {
  create(input: DesktopWorkspaceCreateInput): Promise<{ item: DesktopWorkspaceItem; created: boolean }>;
  update(workspaceId: string, input: DesktopWorkspaceUpdateInput): Promise<DesktopWorkspaceItem | null>;
  remove(workspaceId: string): Promise<boolean>;
  writeTextFile(workspaceId: string, path: string, content: string): Promise<DesktopWorkspaceFileContentResult>;
}

export type DesktopWorkspacePort = DesktopWorkspaceQueryPort & DesktopWorkspaceCommandPort;