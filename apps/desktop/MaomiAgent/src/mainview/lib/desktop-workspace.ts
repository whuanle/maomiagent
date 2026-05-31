import type {
  DesktopWorkspaceCreateInput,
  DesktopWorkspaceCreateResponse,
  DesktopWorkspaceFileContentResult,
  DesktopWorkspaceFileTreeResult,
  DesktopWorkspaceItem,
  DesktopWorkspaceListQuery,
  DesktopWorkspaceListResponse,
  DesktopWorkspaceRemoveResponse,
  DesktopWorkspaceUpdateInput,
} from "../../shared/desktop-workspace";
import { DESKTOP_WINDOW_BRIDGE_READY_EVENT } from "./desktop-window";

type DesktopWorkspaceBridge = {
  listDesktopWorkspaces: (query?: DesktopWorkspaceListQuery) => Promise<DesktopWorkspaceListResponse>;
  getDesktopWorkspace: (workspaceId: string) => Promise<DesktopWorkspaceItem | null>;
  getDesktopWorkspaceFileTree: (workspaceId: string, path?: string) => Promise<DesktopWorkspaceFileTreeResult>;
  getDesktopWorkspaceFileContent: (workspaceId: string, path: string) => Promise<DesktopWorkspaceFileContentResult>;
  writeDesktopWorkspaceTextFile: (
    workspaceId: string,
    path: string,
    content: string,
  ) => Promise<DesktopWorkspaceFileContentResult>;
  createDesktopWorkspace: (input: DesktopWorkspaceCreateInput) => Promise<DesktopWorkspaceCreateResponse>;
  updateDesktopWorkspace: (
    workspaceId: string,
    input: DesktopWorkspaceUpdateInput,
  ) => Promise<DesktopWorkspaceItem | null>;
  removeDesktopWorkspace: (workspaceId: string) => Promise<DesktopWorkspaceRemoveResponse>;
};

declare global {
  interface Window {
    maomiDesktopWorkspace?: DesktopWorkspaceBridge;
  }
}

export const DESKTOP_WORKSPACE_BRIDGE_READY_EVENT = DESKTOP_WINDOW_BRIDGE_READY_EVENT;

function getDesktopWorkspaceBridge(): DesktopWorkspaceBridge {
  const bridge = window.maomiDesktopWorkspace;
  if (!bridge) {
    throw new Error("Desktop workspace bridge is unavailable.");
  }

  return bridge;
}

export function hasDesktopWorkspaceBridge(): boolean {
  return Boolean(window.maomiDesktopWorkspace);
}

export function listDesktopWorkspaces(
  query: DesktopWorkspaceListQuery = {},
): Promise<DesktopWorkspaceListResponse> {
  return getDesktopWorkspaceBridge().listDesktopWorkspaces(query);
}

export function getDesktopWorkspace(
  workspaceId: string,
): Promise<DesktopWorkspaceItem | null> {
  return getDesktopWorkspaceBridge().getDesktopWorkspace(workspaceId);
}

export function getDesktopWorkspaceFileTree(
  workspaceId: string,
  path?: string,
): Promise<DesktopWorkspaceFileTreeResult> {
  return getDesktopWorkspaceBridge().getDesktopWorkspaceFileTree(workspaceId, path);
}

export function getDesktopWorkspaceFileContent(
  workspaceId: string,
  path: string,
): Promise<DesktopWorkspaceFileContentResult> {
  return getDesktopWorkspaceBridge().getDesktopWorkspaceFileContent(workspaceId, path);
}

export function writeDesktopWorkspaceTextFile(
  workspaceId: string,
  path: string,
  content: string,
): Promise<DesktopWorkspaceFileContentResult> {
  return getDesktopWorkspaceBridge().writeDesktopWorkspaceTextFile(workspaceId, path, content);
}

export function createDesktopWorkspace(
  input: DesktopWorkspaceCreateInput,
): Promise<DesktopWorkspaceCreateResponse> {
  return getDesktopWorkspaceBridge().createDesktopWorkspace(input);
}

export function updateDesktopWorkspace(
  workspaceId: string,
  input: DesktopWorkspaceUpdateInput,
): Promise<DesktopWorkspaceItem | null> {
  return getDesktopWorkspaceBridge().updateDesktopWorkspace(workspaceId, input);
}

export function removeDesktopWorkspace(
  workspaceId: string,
): Promise<DesktopWorkspaceRemoveResponse> {
  return getDesktopWorkspaceBridge().removeDesktopWorkspace(workspaceId);
}
