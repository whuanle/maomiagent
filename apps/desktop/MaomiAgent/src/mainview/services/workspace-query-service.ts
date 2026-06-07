import type {
  DesktopWorkspaceItem,
  DesktopWorkspaceListQuery,
} from "../../shared/desktop-workspace";
import { listDesktopWorkspaces } from "../lib/desktop-workspace";
import { filterSelectableDesktopWorkspaces } from "../lib/desktop-workspace-filter";

export type WorkspaceSelectOption = {
  label: string;
  value: string;
};

export async function getAllWorkspaces(
  query: DesktopWorkspaceListQuery = {},
): Promise<DesktopWorkspaceItem[]> {
  const response = await listDesktopWorkspaces(query);
  return response.items;
}

export async function getNormalWorkspaces(
  query: DesktopWorkspaceListQuery = {},
): Promise<DesktopWorkspaceItem[]> {
  return filterSelectableDesktopWorkspaces(await getAllWorkspaces(query));
}

export function toWorkspaceOptions(
  items: readonly DesktopWorkspaceItem[],
): WorkspaceSelectOption[] {
  return items.map((item) => ({
    label: item.name ? `${item.name} (${item.workspaceId})` : item.workspaceId,
    value: item.workspaceId,
  }));
}
