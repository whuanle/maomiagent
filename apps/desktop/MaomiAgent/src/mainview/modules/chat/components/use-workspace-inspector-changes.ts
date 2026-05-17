import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getDesktopGitChanges } from "../../../lib/desktop-git";

import type { DesktopGitChangesResult } from "../../../../shared/desktop-git";
import { buildInspectorChangeStatusMap } from "./workspace-inspector-state-model";

type Input = {
  active: boolean;
  workspaceId?: string;
};

export function useWorkspaceInspectorChanges(input: Input) {
  const [changes, setChanges] = useState<DesktopGitChangesResult | null>(null);
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState<string | null>(null);

  useEffect(() => {
    setChanges(null);
    setChangesLoading(false);
    setChangesError(null);
  }, [input.workspaceId]);

  const refreshChanges = useCallback(async () => {
    if (!input.workspaceId) {
      setChanges(null);
      setChangesError(null);
      return;
    }

    setChangesLoading(true);
    try {
      const result = await getDesktopGitChanges(input.workspaceId);
      setChanges(result);
      setChangesError(null);
    } catch (error) {
      setChanges(null);
      setChangesError(error instanceof Error ? error.message : String(error));
    } finally {
      setChangesLoading(false);
    }
  }, [input.workspaceId]);

  useEffect(() => {
    if (!input.active || !input.workspaceId) {
      return;
    }

    void refreshChanges();
  }, [input.active, input.workspaceId, refreshChanges]);

  const changeStatusMap = useMemo(
    () => buildInspectorChangeStatusMap(changes?.items ?? []),
    [changes?.items],
  );
  const changedPaths = useMemo(
    () => changes?.items.map((item) => item.path) ?? [],
    [changes?.items],
  );

  return {
    changes,
    changesLoading,
    changesError,
    changeStatusMap,
    changedPaths,
    refreshChanges,
  };
}