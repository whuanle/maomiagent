import type { DesktopDatabaseConnection } from "../../../database";
import type { DesktopWorkspaceItem } from "../../abstraction/models/desktop-workspace.models";

type WorkspaceRow = {
  workspace_id: string;
  name: string;
  directory_path: string;
  note: string | null;
  is_pinned: number;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

const WORKSPACES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS desktop_workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  directory_path TEXT NOT NULL,
  note TEXT,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const WORKSPACES_DIRECTORY_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_desktop_workspaces_directory_path
ON desktop_workspaces(directory_path);
`;

function parseJson<TValue>(value: string | null | undefined, fallback: TValue): TValue {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as TValue;
  } catch {
    return fallback;
  }
}

function mapWorkspaceRow(row: WorkspaceRow): DesktopWorkspaceItem {
  return {
    workspaceId: row.workspace_id,
    name: row.name,
    directoryPath: row.directory_path,
    note: row.note ?? undefined,
    isPinned: row.is_pinned === 1,
    tags: parseJson<string[]>(row.tags_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class DesktopWorkspaceStore {
  constructor(private readonly connection: DesktopDatabaseConnection) {
    this.connection.execute(WORKSPACES_TABLE_SQL);
    this.connection.execute(WORKSPACES_DIRECTORY_INDEX_SQL);
  }

  list(): DesktopWorkspaceItem[] {
    return this.connection
      .all<WorkspaceRow>("SELECT * FROM desktop_workspaces ORDER BY is_pinned DESC, updated_at DESC, name ASC")
      .map(mapWorkspaceRow);
  }

  get(workspaceId: string): DesktopWorkspaceItem | null {
    const row = this.connection.get<WorkspaceRow>(
      "SELECT * FROM desktop_workspaces WHERE workspace_id = ?",
      workspaceId,
    );
    return row ? mapWorkspaceRow(row) : null;
  }

  upsert(item: DesktopWorkspaceItem): void {
    this.connection.run(
      `INSERT INTO desktop_workspaces (
        workspace_id, name, directory_path, note, is_pinned, tags_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        name = excluded.name,
        directory_path = excluded.directory_path,
        note = excluded.note,
        is_pinned = excluded.is_pinned,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at`,
      item.workspaceId,
      item.name,
      item.directoryPath,
      item.note ?? null,
      item.isPinned ? 1 : 0,
      JSON.stringify(item.tags),
      item.createdAt,
      item.updatedAt,
    );
  }

  remove(workspaceId: string): boolean {
    const result = this.connection.run("DELETE FROM desktop_workspaces WHERE workspace_id = ?", workspaceId);
    return result.changes > 0;
  }
}