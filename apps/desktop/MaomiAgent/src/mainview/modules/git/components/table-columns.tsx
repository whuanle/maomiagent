import { Tag, Typography, type TableProps } from "antd";

import type {
  DesktopGitBranchItem,
  DesktopGitChangeItem,
  DesktopGitHistoryItem,
  DesktopGitReviewItem,
} from "../../../../shared/desktop-git";

type Copy = {
  columnPath: string;
  columnStatus: string;
  columnStaged: string;
  columnUnstaged: string;
  columnAdditions: string;
  columnDeletions: string;
  columnBranch: string;
  columnKind: string;
  columnUpstream: string;
  columnSync: string;
  columnCommit: string;
  columnSubject: string;
  columnAuthor: string;
  columnWhen: string;
  columnFilesChanged: string;
  localBranch: string;
  remoteBranch: string;
  currentBranch: string;
  reviewPatch: string;
};

const { Text } = Typography;

function renderStatusTag(status: DesktopGitChangeItem["status"]) {
  const color =
    status === "added"
      ? "green"
      : status === "modified"
        ? "gold"
        : status === "deleted"
          ? "red"
          : status === "renamed"
            ? "blue"
            : status === "conflict"
              ? "volcano"
              : "default";

  return <Tag color={color}>{status}</Tag>;
}

function renderSyncText(ahead: number, behind: number) {
  return `${ahead}/${behind}`;
}

export function buildChangesColumns(
  copy: Copy,
): NonNullable<TableProps<DesktopGitChangeItem>["columns"]> {
  return [
    {
      title: copy.columnPath,
      dataIndex: "path",
      key: "path",
      ellipsis: true,
      render: (value: string, record) => (
        <div>
          <div>{value}</div>
          {record.previousPath ? <Text type="secondary">{record.previousPath}</Text> : null}
        </div>
      ),
    },
    {
      title: copy.columnStatus,
      dataIndex: "status",
      key: "status",
      width: 120,
      render: renderStatusTag,
    },
    {
      title: copy.columnStaged,
      dataIndex: "stagedStatus",
      key: "stagedStatus",
      width: 100,
      render: (value?: string) => value || "-",
    },
    {
      title: copy.columnUnstaged,
      dataIndex: "unstagedStatus",
      key: "unstagedStatus",
      width: 110,
      render: (value?: string) => value || "-",
    },
    {
      title: copy.columnAdditions,
      dataIndex: "additions",
      key: "additions",
      width: 80,
      align: "right",
    },
    {
      title: copy.columnDeletions,
      dataIndex: "deletions",
      key: "deletions",
      width: 80,
      align: "right",
    },
  ];
}

export function buildReviewColumns(
  copy: Copy,
): NonNullable<TableProps<DesktopGitReviewItem>["columns"]> {
  return [
    {
      title: copy.columnPath,
      dataIndex: "path",
      key: "path",
      ellipsis: true,
    },
    {
      title: copy.columnStatus,
      dataIndex: "status",
      key: "status",
      width: 120,
      render: renderStatusTag,
    },
    {
      title: copy.columnAdditions,
      dataIndex: "additions",
      key: "additions",
      width: 80,
      align: "right",
    },
    {
      title: copy.columnDeletions,
      dataIndex: "deletions",
      key: "deletions",
      width: 80,
      align: "right",
    },
  ];
}

export function renderReviewExpandedRow(copy: Copy, record: DesktopGitReviewItem) {
  return (
    <div className="git-page-review-expanded">
      <Text strong>{copy.reviewPatch}</Text>
      <pre className="git-page-review-patch">{record.patch || "-"}</pre>
    </div>
  );
}

export function buildBranchesColumns(
  copy: Copy,
): NonNullable<TableProps<DesktopGitBranchItem>["columns"]> {
  return [
    {
      title: copy.columnBranch,
      dataIndex: "name",
      key: "name",
      ellipsis: true,
      render: (value: string, record) => (
        <div>
          <div>{value}</div>
          {record.current ? <Text type="secondary">{copy.currentBranch}</Text> : null}
        </div>
      ),
    },
    {
      title: copy.columnKind,
      dataIndex: "kind",
      key: "kind",
      width: 110,
      render: (value: DesktopGitBranchItem["kind"]) =>
        value === "local" ? copy.localBranch : copy.remoteBranch,
    },
    {
      title: copy.columnUpstream,
      dataIndex: "upstream",
      key: "upstream",
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
    {
      title: copy.columnSync,
      key: "sync",
      width: 110,
      render: (_, record) => renderSyncText(record.ahead, record.behind),
    },
    {
      title: copy.columnCommit,
      dataIndex: "lastCommitHash",
      key: "lastCommitHash",
      width: 120,
      render: (value?: string) => value || "-",
    },
    {
      title: copy.columnSubject,
      dataIndex: "lastCommitSubject",
      key: "lastCommitSubject",
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
  ];
}

export function buildHistoryColumns(
  copy: Copy,
): NonNullable<TableProps<DesktopGitHistoryItem>["columns"]> {
  return [
    {
      title: copy.columnCommit,
      dataIndex: "shortHash",
      key: "shortHash",
      width: 120,
    },
    {
      title: copy.columnSubject,
      dataIndex: "subject",
      key: "subject",
      ellipsis: true,
    },
    {
      title: copy.columnAuthor,
      dataIndex: "authorName",
      key: "authorName",
      width: 160,
      ellipsis: true,
      render: (value?: string) => value || "-",
    },
    {
      title: copy.columnWhen,
      dataIndex: "authoredRelative",
      key: "authoredRelative",
      width: 140,
      render: (value: string | undefined, record: DesktopGitHistoryItem) =>
        value || record.authoredAt || "-",
    },
    {
      title: copy.columnFilesChanged,
      dataIndex: "filesChanged",
      key: "filesChanged",
      width: 90,
      align: "right",
    },
    {
      title: copy.columnAdditions,
      dataIndex: "additions",
      key: "additions",
      width: 80,
      align: "right",
    },
    {
      title: copy.columnDeletions,
      dataIndex: "deletions",
      key: "deletions",
      width: 80,
      align: "right",
    },
  ];
}