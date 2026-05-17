import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { getDesktopWorkspaceFileTree } from "../../../lib/desktop-workspace";
import type { DesktopWorkspaceFileTreeNode } from "../../../../shared/desktop-workspace";

type Input = {
  active: boolean;
  workspaceId?: string;
};

function normalizeWorkspaceInspectorPath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
}

function listWorkspaceInspectorAncestorDirectories(path: string) {
  const normalized = normalizeWorkspaceInspectorPath(path);
  if (!normalized) {
    return [""];
  }

  const segments = normalized.split("/");
  return ["", ...segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"))];
}

export function useWorkspaceInspectorFileTree(input: Input) {
  const [nodesByDir, setNodesByDir] = useState<Record<string, DesktopWorkspaceFileTreeNode[]>>({});
  const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>({});
  const [changesExpandedByPath, setChangesExpandedByPath] = useState<Record<string, boolean>>({});
  const [loadingByPath, setLoadingByPath] = useState<Record<string, boolean>>({});
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const nodesByDirRef = useRef(nodesByDir);
  const loadingByPathRef = useRef(loadingByPath);

  useEffect(() => {
    nodesByDirRef.current = nodesByDir;
  }, [nodesByDir]);

  useEffect(() => {
    loadingByPathRef.current = loadingByPath;
  }, [loadingByPath]);

  useEffect(() => {
    setNodesByDir({});
    setExpandedByPath({});
    setChangesExpandedByPath({});
    setLoadingByPath({});
    setFileTreeError(null);
    setSelectedFilePath("");
  }, [input.workspaceId]);

  const loadDirectory = useCallback(async (path: string, force = false) => {
    const normalizedPath = normalizeWorkspaceInspectorPath(path);
    if (!input.workspaceId) {
      return;
    }
    if (!force && nodesByDirRef.current[normalizedPath] !== undefined) {
      return;
    }
    if (loadingByPathRef.current[normalizedPath]) {
      return;
    }

    setLoadingByPath((current) => ({
      ...current,
      [normalizedPath]: true,
    }));

    try {
      const result = await getDesktopWorkspaceFileTree(input.workspaceId, normalizedPath || undefined);
      setNodesByDir((current) => ({
        ...current,
        [normalizedPath]: result.nodes,
      }));
      if (!normalizedPath) {
        setFileTreeError(null);
      }
    } catch (error) {
      if (!normalizedPath) {
        setFileTreeError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoadingByPath((current) => ({
        ...current,
        [normalizedPath]: false,
      }));
    }
  }, [input.workspaceId]);

  useEffect(() => {
    if (!input.active || !input.workspaceId) {
      return;
    }

    setExpandedByPath((current) => current[""] ? current : { ...current, "": true });
    void loadDirectory("");
  }, [input.active, input.workspaceId, loadDirectory]);

  const selectFile = useCallback((path: string) => {
    const normalizedPath = normalizeWorkspaceInspectorPath(path);
    if (!normalizedPath) {
      return;
    }

    const ancestors = listWorkspaceInspectorAncestorDirectories(normalizedPath);
    setSelectedFilePath(normalizedPath);
    setExpandedByPath((current) => {
      const next = { ...current };
      ancestors.forEach((directory) => {
        next[directory] = true;
      });
      return next;
    });
    setChangesExpandedByPath((current) => {
      const next = { ...current };
      ancestors.forEach((directory) => {
        next[directory] = true;
      });
      return next;
    });

    ancestors.forEach((directory) => {
      if (directory && nodesByDirRef.current[directory] === undefined) {
        void loadDirectory(directory);
      }
    });
  }, [loadDirectory]);

  const toggleDirectoryState = useCallback((
    path: string,
    setExpandedState: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  ) => {
    const normalizedPath = normalizeWorkspaceInspectorPath(path);
    if (!normalizedPath) {
      let nextExpanded = false;
      setExpandedState((current) => {
        nextExpanded = current[""] !== true;
        return { ...current, "": nextExpanded };
      });
      if (nextExpanded) {
        void loadDirectory("", true);
      }
      return;
    }

    setExpandedState((current) => {
      const nextExpanded = current[normalizedPath] !== true;
      if (nextExpanded) {
        void loadDirectory(normalizedPath, true);
      }
      return {
        ...current,
        [normalizedPath]: nextExpanded,
      };
    });
  }, [loadDirectory]);

  const toggleFilesDirectory = useCallback((path: string) => {
    toggleDirectoryState(path, setExpandedByPath);
  }, [toggleDirectoryState]);

  const toggleChangesDirectory = useCallback((path: string) => {
    toggleDirectoryState(path, setChangesExpandedByPath);
  }, [toggleDirectoryState]);

  const refreshLoadedDirectories = useCallback(async () => {
    const directories = Object.keys(nodesByDirRef.current);
    if (directories.length === 0) {
      await loadDirectory("", true);
      return;
    }

    for (const directory of directories) {
      await loadDirectory(directory, true);
    }
  }, [loadDirectory]);

  return {
    nodesByDir,
    expandedByPath,
    changesExpandedByPath,
    loadingByPath,
    fileTreeError,
    selectedFilePath,
    selectFile,
    openFile: selectFile,
    refreshLoadedDirectories,
    toggleFilesDirectory,
    toggleChangesDirectory,
  };
}