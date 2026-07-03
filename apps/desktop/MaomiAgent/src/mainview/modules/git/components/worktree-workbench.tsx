import {
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Segmented,
  Space,
  Table,
  Tag,
} from "antd";
import { useMemo, useState } from "react";

import type {
  DesktopGitModuleSnapshotResult,
  DesktopGitOperationResult,
  DesktopGitWorktreeItem,
} from "../../../../shared/desktop-git";
import {
  createDesktopGitWorktree,
  pruneDesktopGitWorktrees,
  removeDesktopGitWorktree,
} from "../../../lib/desktop-git";
import { openDesktopPathInFileManager } from "../../../lib/desktop-window";
import type { GitPageCopy } from "../i18n";
import type { GitWorktreeCopy } from "../worktree-copy";

type Props = {
  workspaceId: string;
  pageCopy: GitPageCopy;
  copy: GitWorktreeCopy;
  snapshot: DesktopGitModuleSnapshotResult | null;
  loading: boolean;
  onRefresh: (silent?: boolean) => Promise<void>;
};

type AddWorktreeFormValue = {
  mode: "new-branch" | "existing-ref";
  path: string;
  branchName?: string;
  reference?: string;
  startPoint?: string;
  force?: boolean;
  detach?: boolean;
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function resolveStatusTags(item: DesktopGitWorktreeItem, copy: GitWorktreeCopy) {
  const tags: string[] = [];
  if (item.current) {
    tags.push(copy.currentLabel);
  }
  if (item.detached) {
    tags.push(copy.detachedLabel);
  }
  if (item.locked) {
    tags.push(copy.lockedLabel);
  }
  if (item.prunable) {
    tags.push(copy.prunableLabel);
  }
  if (item.bare) {
    tags.push(copy.bareLabel);
  }
  return tags;
}

export function GitWorktreeWorkbench(props: Props) {
  const { message, modal } = AntdApp.useApp();
  const [searchValue, setSearchValue] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [addForm] = Form.useForm<AddWorktreeFormValue>();

  const addMode = Form.useWatch("mode", addForm) ?? "new-branch";

  const isGitRepo = props.snapshot?.worktrees.isGitRepo ?? false;
  const allItems = props.snapshot?.worktrees.items ?? [];

  const filteredItems = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    if (!keyword) {
      return allItems;
    }

    return allItems.filter((item) => {
      const branch = item.branch ?? "";
      const head = item.head ?? "";
      return item.path.toLowerCase().includes(keyword)
        || branch.toLowerCase().includes(keyword)
        || head.toLowerCase().includes(keyword);
    });
  }, [allItems, searchValue]);

  async function runOperation(actionKey: string, operation: () => Promise<DesktopGitOperationResult>) {
    setBusyAction(actionKey);
    try {
      const result = await operation();
      message.success(result.message);
      await props.onRefresh(true);
    } catch (error) {
      message.error(normalizeError(error));
    } finally {
      setBusyAction(null);
    }
  }

  const columns = useMemo(() => {
    return [
      {
        title: props.copy.pathColumn,
        dataIndex: "path",
        key: "path",
        ellipsis: true,
        width: "44%",
      },
      {
        title: props.copy.branchColumn,
        dataIndex: "branch",
        key: "branch",
        width: "16%",
        render: (_value: string | undefined, record: DesktopGitWorktreeItem) => record.branch || props.copy.noBranchLabel,
      },
      {
        title: props.copy.headColumn,
        dataIndex: "head",
        key: "head",
        width: "12%",
        render: (value: string | undefined) => value ? value.slice(0, 8) : "-",
      },
      {
        title: props.copy.statusColumn,
        key: "status",
        width: "18%",
        render: (_value: unknown, record: DesktopGitWorktreeItem) => (
          <Space size={4} wrap>
            {resolveStatusTags(record, props.copy).map((tag) => <Tag key={tag}>{tag}</Tag>)}
          </Space>
        ),
      },
      {
        title: props.copy.actionsColumn,
        key: "actions",
        width: "10%",
        align: "right" as const,
        render: (_value: unknown, record: DesktopGitWorktreeItem) => (
          <Space size={4} wrap>
            <Button
              type="link"
              size="small"
              disabled={Boolean(busyAction)}
              onClick={() => {
                void openDesktopPathInFileManager(record.path).catch((error) => {
                  message.error(normalizeError(error));
                });
              }}
            >
              {props.copy.openDirectoryButton}
            </Button>
            <Button
              type="link"
              danger
              size="small"
              disabled={record.current || Boolean(busyAction)}
              onClick={() => {
                modal.confirm({
                  title: props.copy.removeWorktreeTitle(record.path),
                  content: props.copy.removeWorktreeDescription,
                  okText: props.copy.confirmDelete,
                  cancelText: props.copy.confirmCancel,
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    await runOperation(`worktree:remove:${record.path}`, () =>
                      removeDesktopGitWorktree(props.workspaceId, { path: record.path, force: true }));
                  },
                });
              }}
            >
              {props.copy.removeButton}
            </Button>
          </Space>
        ),
      },
    ];
  }, [busyAction, message, modal, props.copy, props.workspaceId]);

  if (props.snapshot && !isGitRepo) {
    return (
      <div className="git-page-panel-shell">
        <div className="git-page-empty">
          <Empty description={props.pageCopy.emptyNotGitRepo} />
        </div>
      </div>
    );
  }

  return (
    <div className="git-page-panel-shell">
      <div className="git-page-toolbar">
        <Input
          className="git-page-worktree-search"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          prefix={<SearchOutlined />}
          placeholder={props.copy.searchPlaceholder}
          allowClear
        />
        <Button
          icon={<PlusOutlined />}
          type="primary"
          disabled={Boolean(busyAction)}
          onClick={() => {
            addForm.resetFields();
            addForm.setFieldsValue({
              mode: "new-branch",
              force: false,
              detach: false,
            });
            setAddModalOpen(true);
          }}
        >
          {props.copy.addButton}
        </Button>
        <Button
          disabled={Boolean(busyAction)}
          onClick={() => {
            void runOperation("worktree:prune", () => pruneDesktopGitWorktrees(props.workspaceId));
          }}
        >
          {props.copy.pruneButton}
        </Button>
      </div>
      <div className="git-page-panel-shell">
        <Table<DesktopGitWorktreeItem>
          rowKey={(item) => item.path}
          size="small"
          loading={props.loading || Boolean(busyAction)}
          columns={columns}
          dataSource={filteredItems}
          pagination={false}
          locale={{
            emptyText: props.copy.emptyDescription,
          }}
        />
      </div>
      <Modal
        open={addModalOpen}
        title={props.copy.addModalTitle}
        okText={props.copy.addModalConfirm}
        cancelText={props.copy.confirmCancel}
        onCancel={() => setAddModalOpen(false)}
        style={{ top: 72 }}
        onOk={() => {
          void addForm.validateFields()
            .then((values) => {
              setAddModalOpen(false);
              const isNewBranchMode = values.mode === "new-branch";
              void runOperation(`worktree:add:${values.path}`, () =>
                createDesktopGitWorktree(props.workspaceId, {
                  path: values.path,
                  branchName: isNewBranchMode ? values.branchName : undefined,
                  startPoint: isNewBranchMode ? values.startPoint : values.reference,
                  force: values.force,
                  detach: isNewBranchMode ? false : values.detach,
                }));
            })
            .catch(() => undefined);
        }}
      >
        <Form
          form={addForm}
          layout="vertical"
          autoComplete="off"
          initialValues={{
            mode: "new-branch",
            force: false,
            detach: false,
          }}
        >
          <Form.Item name="mode" label={props.copy.addModeLabel}>
            <Segmented
              block
              options={[
                { label: props.copy.addModeNewBranch, value: "new-branch" },
                { label: props.copy.addModeExistingRef, value: "existing-ref" },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="path"
            label={props.copy.pathLabel}
            rules={[{ required: true, message: props.copy.pathPlaceholder }]}
          >
            <Input placeholder={props.copy.pathPlaceholder} />
          </Form.Item>
          {addMode === "new-branch" ? (
            <>
              <Form.Item
                name="branchName"
                label={props.copy.branchNameLabel}
                rules={[{ required: true, message: props.copy.branchNamePlaceholder }]}
              >
                <Input placeholder={props.copy.branchNamePlaceholder} />
              </Form.Item>
              <Form.Item name="startPoint" label={props.copy.startPointLabel}>
                <Input placeholder={props.copy.startPointPlaceholder} />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="reference"
              label={props.copy.startPointLabel}
              rules={[{ required: true, message: props.copy.startPointPlaceholder }]}
            >
              <Input placeholder={props.copy.startPointPlaceholder} />
            </Form.Item>
          )}
          <Form.Item name="force" valuePropName="checked">
            <Checkbox>{props.copy.forceLabel}</Checkbox>
          </Form.Item>
          {addMode === "existing-ref" ? (
            <Form.Item name="detach" valuePropName="checked">
              <Checkbox>{props.copy.detachLabel}</Checkbox>
            </Form.Item>
          ) : null}
        </Form>
      </Modal>
    </div>
  );
}
