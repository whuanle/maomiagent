import { useCallback, useEffect, useState } from "react";

import {
  DESKTOP_SKILLS_BRIDGE_READY_EVENT,
  DESKTOP_SKILLS_INVALIDATED_EVENT,
  getDesktopSkillsEffective,
  hasDesktopSkillsBridge,
} from "../../../lib/desktop-skills";
import type { ChatSlashCommandOption } from "../types";

type UseChatWorkspaceSlashCommandsInput = {
  active: boolean;
  bridgeAvailable: boolean;
  workspaceId?: string;
};

function resolveSlashCommandLabel(input: {
  label?: string;
  name?: string;
  skillId: string;
}) {
  return input.label?.trim()
    || input.name?.trim()
    || input.skillId;
}

export function useChatWorkspaceSlashCommands(input: UseChatWorkspaceSlashCommandsInput) {
  const [items, setItems] = useState<ChatSlashCommandOption[]>([]);

  const reload = useCallback(async () => {
    const workspaceId = input.workspaceId?.trim();
    if (!input.bridgeAvailable || !workspaceId || !hasDesktopSkillsBridge()) {
      setItems([]);
      return;
    }

    try {
      const result = await getDesktopSkillsEffective({ workspaceId });
      const nextItems = result.items
        .filter((row) => row.included && row.decision === "effective")
        .map((row) => ({
          key: row.winnerSkillId,
          label: resolveSlashCommandLabel({
            label: row.item.label,
            name: row.item.name,
            skillId: row.item.skillId,
          }),
          insertText: row.winnerSkillId,
          description: row.item.description?.trim() || undefined,
        }));

      setItems(nextItems);
    } catch {
      setItems([]);
    }
  }, [input.bridgeAvailable, input.workspaceId]);

  useEffect(() => {
    if (!input.active) {
      return;
    }

    void reload();
  }, [input.active, reload]);

  useEffect(() => {
    const handleReload = () => {
      if (!input.active) {
        return;
      }

      void reload();
    };

    window.addEventListener(DESKTOP_SKILLS_BRIDGE_READY_EVENT, handleReload);
    window.addEventListener(DESKTOP_SKILLS_INVALIDATED_EVENT, handleReload);

    return () => {
      window.removeEventListener(DESKTOP_SKILLS_BRIDGE_READY_EVENT, handleReload);
      window.removeEventListener(DESKTOP_SKILLS_INVALIDATED_EVENT, handleReload);
    };
  }, [input.active, reload]);

  return items;
}

export default useChatWorkspaceSlashCommands;
