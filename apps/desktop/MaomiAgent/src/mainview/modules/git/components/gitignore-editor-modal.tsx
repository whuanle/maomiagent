import { Button, Input, Modal, Spin } from "antd";
import { useEffect, useState } from "react";

import type { GitPageCopy } from "../i18n";

type Props = {
  copy: GitPageCopy;
  open: boolean;
  value: string;
  loading?: boolean;
  saving?: boolean;
  onCancel: () => void;
  onSave: (value: string) => void;
};

export function GitIgnoreEditorModal(props: Props) {
  const [draft, setDraft] = useState(props.value);

  useEffect(() => {
    if (props.open) {
      setDraft(props.value);
    }
  }, [props.open, props.value]);

  return (
    <Modal
      open={props.open}
      title={props.copy.gitIgnoreModalTitle}
      onCancel={props.onCancel}
      className="git-page-gitignore-modal"
      footer={[
        <Button key="cancel" onClick={props.onCancel}>
          {props.copy.confirmCancel}
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={props.saving}
          onClick={() => props.onSave(draft)}
        >
          {props.copy.gitIgnoreSaveAction}
        </Button>,
      ]}
      styles={{ body: { padding: 0 }, header: { padding: 0 } }}
      style={{ top: 72 }}
    >
      {props.loading ? (
        <div className="git-page-gitignore-loading">
          <Spin />
        </div>
      ) : (
        <div className="git-page-gitignore-editor">
          <Input.TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            autoSize={false}
            className="git-page-gitignore-input"
            placeholder={props.copy.gitIgnoreEditorPlaceholder}
          />
        </div>
      )}
    </Modal>
  );
}