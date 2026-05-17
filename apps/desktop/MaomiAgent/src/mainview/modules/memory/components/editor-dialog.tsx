import {
  Input,
  Modal,
  Select,
} from "antd";

import type {
  MemoryKind,
  MemoryUnit,
} from "../../../lib/desktop-memory";
import type { MemoryTranslate } from "../i18n";
import {
  memoryKindOptions,
  type MemoryFormValues,
} from "../helpers";

const { TextArea } = Input;

type Props = {
  editingUnit: MemoryUnit | null;
  form: MemoryFormValues;
  modalOpen: boolean;
  saving: boolean;
  t: MemoryTranslate;
  workspaceOptions: Array<{ label: string; value: string }>;
  onClose: (open: boolean) => void;
  onFormChange: (updater: (prev: MemoryFormValues) => MemoryFormValues) => void;
  onSave: () => void;
};

export function MemoryEditorDialog(props: Props) {
  const {
    editingUnit,
    form,
    modalOpen,
    saving,
    t,
    workspaceOptions,
    onClose,
    onFormChange,
    onSave,
  } = props;

  const fieldWorkspaceOptions = form.workspaceId && !workspaceOptions.some((item) => item.value === form.workspaceId)
    ? [{ label: form.workspaceId, value: form.workspaceId }, ...workspaceOptions]
    : workspaceOptions;

  return (
    <Modal
      open={modalOpen}
      destroyOnHidden
      maskClosable={false}
      getContainer={false}
      width={760}
      className="memory-page-modal"
      style={{ top: 72 }}
      title={editingUnit ? t("记忆页.弹窗.标题.编辑") : t("记忆页.弹窗.标题.新增")}
      okText={t("记忆页.按钮.保存")}
      cancelText={t("记忆页.按钮.取消")}
      confirmLoading={saving}
      onCancel={() => onClose(false)}
      onOk={onSave}
    >
      <div className="memory-page-modal-form">
        <div className="memory-page-form-grid memory-page-form-grid-compact">
          <label className="memory-page-field">
            <span>{t("记忆页.字段.kind")}</span>
            <Select
              value={form.kind}
              options={memoryKindOptions}
              onChange={(value) => onFormChange((prev) => ({ ...prev, kind: value as MemoryKind }))}
            />
          </label>

          <label className="memory-page-field">
            <span>{t("记忆页.字段.scope")}</span>
            <Select
              disabled={!!editingUnit}
              value={form.scope}
              options={[
                { label: t("记忆页.值.scope.全局"), value: "global" },
                { label: t("记忆页.值.scope.工作区"), value: "workspace" },
              ]}
              onChange={(value) => onFormChange((prev) => ({
                ...prev,
                scope: value as "global" | "workspace",
                workspaceId: value === "workspace" ? prev.workspaceId : "",
              }))}
            />
          </label>
        </div>

        {form.scope === "workspace" ? (
          <label className="memory-page-field">
            <span>{t("记忆页.字段.workspaceId")}</span>
            <Select
              className="memory-page-workspace-select"
              showSearch
              optionFilterProp="label"
              value={form.workspaceId || undefined}
              options={fieldWorkspaceOptions}
              placeholder={t("记忆页.输入.workspaceId占位")}
              disabled={!!editingUnit}
              onChange={(value) => onFormChange((prev) => ({
                ...prev,
                workspaceId: typeof value === "string" ? value : "",
              }))}
            />
          </label>
        ) : null}

        <label className="memory-page-field">
          <span>{t("记忆页.字段.summary")}</span>
          <Input
            value={form.summary}
            onChange={(event) => onFormChange((prev) => ({ ...prev, summary: event.target.value }))}
          />
        </label>

        <label className="memory-page-field">
          <span>{t("记忆页.字段.content")}</span>
          <TextArea
            rows={8}
            value={form.rawContent}
            onChange={(event) => onFormChange((prev) => ({ ...prev, rawContent: event.target.value }))}
          />
        </label>
      </div>
    </Modal>
  );
}