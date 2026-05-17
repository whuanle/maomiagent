import {
  Empty,
  Modal,
  Tag,
} from "antd";

import type { MemoryUnit } from "../../../lib/desktop-memory";
import type { MemoryTranslate } from "../i18n";
import {
  formatDateTime,
  formatTokenLabel,
  getMemoryTitle,
} from "../helpers";

type Props = {
  open: boolean;
  selectedUnit: MemoryUnit | null;
  t: MemoryTranslate;
  onClose: () => void;
};

type ContentProps = {
  selectedUnit: MemoryUnit | null;
  t: MemoryTranslate;
};

export function MemoryDetailDialogContent(props: ContentProps) {
  const {
    selectedUnit,
    t,
  } = props;

  if (!selectedUnit) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("记忆页.空状态.无记忆")} />;
  }

  const scopeLabel = selectedUnit.scope === "global"
    ? t("记忆页.值.scope.全局")
    : t("记忆页.值.scope.工作区");
  const workspaceLabel = selectedUnit.scope === "workspace"
    ? (selectedUnit.workspaceId || t("记忆页.值.未设置"))
    : t("记忆页.值.scope.全局");

  return (
    <div className="memory-page-detail-shell">
      <div className="memory-page-chip-row">
        <Tag bordered={false} className={`memory-page-inline-tag${selectedUnit.scope === "global" ? " memory-page-inline-tag-global" : ""}`}>
          {formatTokenLabel(selectedUnit.scope)}
        </Tag>
        <Tag bordered={false} className={`memory-page-status-tag memory-page-status-${selectedUnit.status}`}>
          {formatTokenLabel(selectedUnit.status)}
        </Tag>
        <Tag bordered={false} className="memory-page-inline-tag">
          {formatTokenLabel(selectedUnit.kind)}
        </Tag>
      </div>

      <div className="memory-page-detail-grid">
        <div className="memory-page-detail-item">
          <span>{t("记忆页.字段.scope")}</span>
          <strong>{scopeLabel}</strong>
        </div>
        <div className="memory-page-detail-item">
          <span>{t("记忆页.字段.workspaceId")}</span>
          <strong>{workspaceLabel}</strong>
        </div>
        <div className="memory-page-detail-item">
          <span>{t("记忆页.列.更新时间")}</span>
          <strong>{formatDateTime(selectedUnit.updatedAt)}</strong>
        </div>
        <div className="memory-page-detail-item">
          <span>{t("记忆页.字段.summary")}</span>
          <strong>{selectedUnit.summary || t("记忆页.值.未设置")}</strong>
        </div>
      </div>

      <div className="memory-page-detail-section">
        <span>{t("记忆页.字段.content")}</span>
        <pre>{selectedUnit.rawContent}</pre>
      </div>

      <div className="memory-page-detail-foot">
        <span>{formatDateTime(selectedUnit.createdAt)}</span>
        <span>{formatDateTime(selectedUnit.updatedAt)}</span>
      </div>
    </div>
  );
}

export function MemoryDetailDialog(props: Props) {
  const {
    open,
    selectedUnit,
    t,
    onClose,
  } = props;

  return (
    <Modal
      open={open}
      destroyOnHidden
      footer={null}
      getContainer={false}
      width={680}
      className="memory-page-modal memory-page-detail-modal"
      style={{ top: 72 }}
      title={selectedUnit ? getMemoryTitle(selectedUnit) : t("记忆页.空状态.无记忆")}
      onCancel={onClose}
    >
      <MemoryDetailDialogContent selectedUnit={selectedUnit} t={t} />
    </Modal>
  );
}
