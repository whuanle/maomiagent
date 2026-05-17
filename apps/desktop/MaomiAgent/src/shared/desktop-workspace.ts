export type DesktopWorkspaceItem = {
  workspaceId: string;
  name: string;
  directoryPath: string;
  note?: string;
  isPinned: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type DesktopWorkspaceListQuery = {
  q?: string;
  limit?: number;
  offset?: number;
};

export type DesktopWorkspaceListResponse = {
  items: DesktopWorkspaceItem[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

export type DesktopWorkspaceCreateInput = {
  workspaceId?: string;
  name?: string;
  directoryPath: string;
  note?: string;
  isPinned?: boolean;
  tags?: string[];
};

export type DesktopWorkspaceUpdateInput = {
  name?: string;
  note?: string | null;
  directoryPath?: string;
  isPinned?: boolean;
  tags?: string[];
};

export type DesktopWorkspaceCreateResponse = {
  item: DesktopWorkspaceItem;
  created: boolean;
};

export type DesktopWorkspaceRemoveResponse = {
  removed: boolean;
};

export type DesktopWorkspaceFileTreeNodeType = "file" | "directory";

export type DesktopWorkspaceFileTreeNode = {
  name: string;
  path: string;
  type: DesktopWorkspaceFileTreeNodeType;
  absolutePath: string;
  extension?: string;
  ignored: boolean;
};

export type DesktopWorkspaceFileTreeResult = {
  workspaceId: string;
  rootPath: string;
  path: string;
  nodes: DesktopWorkspaceFileTreeNode[];
};

export type DesktopWorkspaceFileContentResult = {
  workspaceId: string;
  rootPath: string;
  path: string;
  absolutePath: string;
  content: string;
  binary: boolean;
  truncated: boolean;
  previewHeadContent?: string;
  previewTailContent?: string;
  mimeType?: string;
  previewBase64?: string;
};