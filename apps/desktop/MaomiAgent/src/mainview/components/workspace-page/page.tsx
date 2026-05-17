import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { LanguageCode } from "../../config/titlebar";
import type { Translate } from "../../i18n";
import { chooseDesktopDirectory } from "../../lib/desktop-window";
import {
  createDesktopWorkspace,
  DESKTOP_WORKSPACE_BRIDGE_READY_EVENT,
  hasDesktopWorkspaceBridge,
  listDesktopWorkspaces,
  removeDesktopWorkspace,
  updateDesktopWorkspace,
} from "../../lib/desktop-workspace";
import type { DesktopWorkspaceItem } from "../../../shared/desktop-workspace";
import { AppTableCard } from "../shared/AppTableCard";
import "./page.css";

type Props = {
  language: LanguageCode;
  t: Translate;
  active: boolean;
};

type WorkspaceFilter = "all" | "pinned" | "unpinned";

type WorkspaceFormValues = {
  name: string;
  directoryPath: string;
  note: string;
  tags: string;
  isPinned: boolean;
};

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

function formatTimestamp(value: string, language: LanguageCode): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(language);
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseTags(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveDirectoryLeafName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  if (!normalized || /^[A-Za-z]:$/.test(normalized)) {
    return "";
  }

  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? "";
}

const initialFormValues: WorkspaceFormValues = {
  name: "",
  directoryPath: "",
  note: "",
  tags: "",
  isPinned: false,
};

export function WorkspacePage(props: Props) {
  const { message } = AntdApp.useApp();
  const [modal, modalContextHolder] = Modal.useModal();
  const [form] = Form.useForm<WorkspaceFormValues>();
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopWorkspaceBridge());
  const [items, setItems] = useState<DesktopWorkspaceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [filter, setFilter] = useState<WorkspaceFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [editingItem, setEditingItem] = useState<DesktopWorkspaceItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeReady(hasDesktopWorkspaceBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeState);
    return () => window.removeEventListener(DESKTOP_WORKSPACE_BRIDGE_READY_EVENT, syncBridgeState);
  }, []);

  const loadData = useCallback(async () => {
    if (!props.active || !bridgeReady) {
      return;
    }

    try {
      setLoading(true);
      const response = await listDesktopWorkspaces({ limit: 1000, offset: 0 });
      setItems(response.items);
    } catch (error) {
      message.error(`${props.t("工作区页.反馈.加载失败")}: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
    }
  }, [bridgeReady, message, props.active, props.t]);

  useEffect(() => {
    if (!props.active) {
      return;
    }
    void loadData();
  }, [loadData, props.active]);

  const visibleItems = useMemo(() => {
    const query = deferredSearchText.trim().toLowerCase();
    return items
      .filter((item) => {
        if (filter === "pinned") {
          return item.isPinned;
        }
        if (filter === "unpinned") {
          return !item.isPinned;
        }
        return true;
      })
      .filter((item) => {
        if (!query) {
          return true;
        }

        return [item.name, item.directoryPath, item.note ?? "", item.tags.join(" ")]
          .join("\n")
          .toLowerCase()
          .includes(query);
      });
  }, [deferredSearchText, filter, items]);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchText, filter]);

  useEffect(() => {
    const maxPages = Math.max(1, Math.ceil(visibleItems.length / pageSize));
    if (currentPage > maxPages) {
      setCurrentPage(maxPages);
    }
  }, [currentPage, pageSize, visibleItems.length]);

  const pagedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return visibleItems.slice(startIndex, startIndex + pageSize);
  }, [currentPage, pageSize, visibleItems]);

  const openCreateModal = useCallback(() => {
    setEditingItem(null);
    form.setFieldsValue(initialFormValues);
    setModalOpen(true);
  }, [form]);

  const openEditModal = useCallback((item: DesktopWorkspaceItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      name: item.name,
      directoryPath: item.directoryPath,
      note: item.note ?? "",
      tags: item.tags.join(", "),
      isPinned: item.isPinned,
    });
    setModalOpen(true);
  }, [form]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingItem(null);
    form.resetFields();
  }, [form]);

  const handleChooseDirectory = useCallback(async () => {
    try {
      const currentValue = form.getFieldValue("directoryPath")?.trim();
      const currentName = form.getFieldValue("name")?.trim() ?? "";
      const preferredStartingFolder = currentValue || editingItem?.directoryPath?.trim();
      const directoryPath = await chooseDesktopDirectory(
        preferredStartingFolder ? { startingFolder: preferredStartingFolder } : {},
      );

      if (!directoryPath) {
        return;
      }

      const previousDirectoryName = resolveDirectoryLeafName(
        (currentValue || editingItem?.directoryPath) ?? "",
      );
      const nextDirectoryName = resolveDirectoryLeafName(directoryPath);

      if (nextDirectoryName && (!currentName || currentName === previousDirectoryName)) {
        form.setFieldsValue({
          directoryPath,
          name: nextDirectoryName,
        });
        return;
      }

      form.setFieldValue("directoryPath", directoryPath);
    } catch (error) {
      message.error(`${props.t("工作区页.反馈.选择目录失败")}: ${normalizeError(error)}`);
    }
  }, [editingItem?.directoryPath, form, message, props, props.t]);

  const saveWorkspace = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      if (editingItem) {
        await updateDesktopWorkspace(editingItem.workspaceId, {
          name: values.name.trim() || undefined,
          directoryPath: values.directoryPath.trim(),
          note: values.note.trim() || null,
          isPinned: values.isPinned,
          tags: parseTags(values.tags),
        });
        message.success(props.t("工作区页.反馈.更新成功"));
      } else {
        await createDesktopWorkspace({
          name: values.name.trim() || undefined,
          directoryPath: values.directoryPath.trim(),
          note: values.note.trim() || undefined,
          isPinned: values.isPinned,
          tags: parseTags(values.tags),
        });
        message.success(props.t("工作区页.反馈.创建成功"));
      }

      closeModal();
      await loadData();
    } catch (error) {
      if (typeof error === "object" && error && "errorFields" in error) {
        return;
      }
      message.error(`${props.t("工作区页.反馈.保存失败")}: ${normalizeError(error)}`);
    } finally {
      setSaving(false);
    }
  }, [closeModal, editingItem, form, loadData, message, props.t]);

  const handleDelete = useCallback(async (item: DesktopWorkspaceItem) => {
    const confirmed = await modal.confirm({
      title: props.t("工作区页.弹窗.删除标题"),
      content: props.t("工作区页.弹窗.删除说明"),
      okText: props.t("工作区页.按钮.删除"),
      cancelText: props.t("工作区页.按钮.取消"),
      okButtonProps: { danger: true },
    });

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(item.workspaceId);
      await removeDesktopWorkspace(item.workspaceId);
      message.success(props.t("工作区页.反馈.删除成功"));
      await loadData();
    } catch (error) {
      message.error(`${props.t("工作区页.反馈.删除失败")}: ${normalizeError(error)}`);
    } finally {
      setDeletingId(null);
    }
  }, [loadData, message, modal, props.t]);

  const columns = useMemo<TableColumnsType<DesktopWorkspaceItem>>(() => [
    {
      title: props.t("工作区页.列.工作区"),
      dataIndex: "name",
      key: "name",
      width: 280,
      render: (_value, record) => (
        <div className="workspace-page-name-cell">
          <Space size={8} wrap>
            <Typography.Text strong>{record.name}</Typography.Text>
            {record.isPinned ? (
              <Tag bordered={false} className="workspace-page-pin-tag">
                {props.t("工作区页.值.已置顶")}
              </Tag>
            ) : null}
          </Space>
          {record.note?.trim() ? (
            <Typography.Text type="secondary" className="workspace-page-note-text">
              {record.note}
            </Typography.Text>
          ) : null}
        </div>
      ),
    },
    {
      title: props.t("工作区页.列.目录"),
      dataIndex: "directoryPath",
      key: "directoryPath",
      render: (value: string) => (
        <Tooltip title={value}>
          <div className="workspace-page-path-cell">{value}</div>
        </Tooltip>
      ),
    },
    {
      title: props.t("工作区页.列.标签"),
      dataIndex: "tags",
      key: "tags",
      width: 220,
      render: (tags: string[]) => tags.length > 0 ? (
        <Space size={[6, 6]} wrap>
          {tags.map((tag) => (
            <Tag key={tag} bordered={false} className="workspace-page-tag">
              {tag}
            </Tag>
          ))}
        </Space>
      ) : <Typography.Text type="secondary">-</Typography.Text>,
    },
    {
      title: props.t("工作区页.列.更新时间"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 180,
      align: "center",
      render: (value: string) => formatTimestamp(value, props.language),
    },
    {
      title: props.t("工作区页.列.操作"),
      key: "action",
      width: 120,
      align: "center",
      render: (_value, record) => (
        <Space size={10}>
          <Button
            type="link"
            size="small"
            className="workspace-page-action-link"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            {props.t("工作区页.按钮.编辑")}
          </Button>
          <Button
            type="link"
            size="small"
            danger
            className="workspace-page-action-link workspace-page-action-link-danger"
            icon={<DeleteOutlined />}
            loading={deletingId === record.workspaceId}
            onClick={() => void handleDelete(record)}
          >
            {props.t("工作区页.按钮.删除")}
          </Button>
        </Space>
      ),
    },
  ], [deletingId, handleDelete, openEditModal, props.language, props.t]);

  return (
    <section className="workspace-page">
      {modalContextHolder}
      <div className="workspace-page-surface">
        <div className="workspace-page-toolbar-shell">
          <div className="workspace-page-toolbar">
            <Input
              className="workspace-page-search"
              placeholder={props.t("工作区页.字段.搜索占位")}
              value={searchText}
              prefix={<SearchOutlined />}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              className="workspace-page-select"
              value={filter}
              options={[
                { value: "all", label: props.t("工作区页.筛选.全部") },
                { value: "pinned", label: props.t("工作区页.筛选.已置顶") },
                { value: "unpinned", label: props.t("工作区页.筛选.未置顶") },
              ]}
              onChange={(value) => setFilter(value as WorkspaceFilter)}
            />
            <div className="workspace-page-toolbar-actions">
              <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
                {props.t("工作区页.按钮.刷新")}
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                {props.t("工作区页.按钮.新建")}
              </Button>
            </div>
          </div>
        </div>

        <div className="workspace-page-table-shell">
          {bridgeReady ? (
            <AppTableCard
              className="workspace-page-table-card"
              rowKey="workspaceId"
              columns={columns}
              items={pagedItems}
              loading={loading}
              loadingText={props.t("工作区页.提示.加载中")}
              emptyDescription={props.t("工作区页.提示.无工作区")}
              scrollX={1200}
              pagination={{
                total: visibleItems.length,
                currentPage,
                currentPageSize: pageSize,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
                pageSizeLabel: (size) => props.t("工作区页.分页.每页", { 数量: size }),
                totalLabel: props.t("工作区页.分页.总条数", { 总数: visibleItems.length }),
                onChange: (nextPage, nextPageSize) => {
                  setCurrentPage(nextPage);
                  setPageSize(nextPageSize);
                },
              }}
              tableProps={{
                className: "workspace-page-table",
              }}
            />
          ) : (
            <div className="workspace-page-empty-state">
              <Typography.Text type="secondary">
                {props.t("工作区页.提示.桌面桥接不可用")}
              </Typography.Text>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editingItem ? props.t("工作区页.弹窗.编辑标题") : props.t("工作区页.弹窗.新建标题")}
        okText={props.t("工作区页.按钮.保存")}
        cancelText={props.t("工作区页.按钮.取消")}
        onOk={() => void saveWorkspace()}
        onCancel={closeModal}
        confirmLoading={saving}
        destroyOnHidden
        className="workspace-page-modal"
      >
        <Form form={form} layout="vertical" initialValues={initialFormValues}>
          <Form.Item label={props.t("工作区页.字段.名称")} name="name">
            <Input />
          </Form.Item>
          <Form.Item
            label={props.t("工作区页.字段.目录路径")}
            required
            className="workspace-page-directory-field"
          >
            <Space.Compact block>
              <Form.Item
                name="directoryPath"
                noStyle
                rules={[{ required: true, message: props.t("工作区页.校验.目录必填") }]}
              >
                <Input placeholder={props.t("工作区页.字段.目录占位")} />
              </Form.Item>
              <Button icon={<FolderOpenOutlined />} onClick={() => void handleChooseDirectory()}>
                {props.t("工作区页.按钮.选择目录")}
              </Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item label={props.t("工作区页.字段.备注")} name="note">
            <Input.TextArea rows={3} placeholder={props.t("工作区页.字段.备注占位")} />
          </Form.Item>
          <Form.Item label={props.t("工作区页.字段.标签")} name="tags">
            <Input placeholder={props.t("工作区页.字段.标签占位")} />
          </Form.Item>
          <Form.Item label={props.t("工作区页.字段.置顶")} name="isPinned" valuePropName="checked">
            <Switch checkedChildren={props.t("设置页.值.是")} unCheckedChildren={props.t("设置页.值.否")} />
          </Form.Item>
        </Form>
      </Modal>
    </section>
  );
}

export default WorkspacePage;