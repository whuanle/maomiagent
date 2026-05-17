import { Checkbox, Input, Modal } from "antd";
import { useEffect, useState } from "react";

import type { GitPageCopy } from "../i18n";

type GitTagDraft = {
  name: string;
  message: string;
  push: boolean;
};

type Props = {
  copy: GitPageCopy;
  open: boolean;
  initialName?: string;
  initialMessage?: string;
  initialPush?: boolean;
  saving?: boolean;
  onCancel: () => void;
  onSubmit: (draft: GitTagDraft) => void;
};

export function GitTagEditorModal(props: Props) {
  const [draft, setDraft] = useState<GitTagDraft>({
    name: props.initialName ?? "",
    message: props.initialMessage ?? "",
    push: props.initialPush ?? true,
  });

  useEffect(() => {
    if (!props.open) {
      return;
    }

    setDraft({
      name: props.initialName ?? "",
      message: props.initialMessage ?? "",
      push: props.initialPush ?? true,
    });
  }, [props.initialMessage, props.initialName, props.initialPush, props.open]);

  return (
    <Modal
      open={props.open}
      title={props.copy.createTagModalTitle}
      className="git-page-modal git-page-git-tag-modal"
      okText={props.copy.createTagConfirmButton(draft.push)}
      cancelText={props.copy.confirmCancel}
      confirmLoading={props.saving}
      okButtonProps={{ disabled: !draft.name.trim() }}
      onCancel={props.onCancel}
      onOk={() => props.onSubmit(draft)}
      styles={{ body: { padding: 0 }, header: { padding: 0 } }}
      style={{ top: 72 }}
    >
      <div className="git-page-git-tag-editor">
        <label className="git-page-git-tag-field">
          <span className="git-page-git-tag-field-label">{props.copy.createTagNameLabel}</span>
          <Input
            value={draft.name}
            placeholder={props.copy.createTagNamePlaceholder}
            onChange={(event) => setDraft((current) => ({
              ...current,
              name: event.target.value,
            }))}
          />
        </label>
        <label className="git-page-git-tag-field">
          <span className="git-page-git-tag-field-label">{props.copy.createTagMessageLabel}</span>
          <Input.TextArea
            value={draft.message}
            placeholder={props.copy.createTagMessagePlaceholder}
            autoSize={{ minRows: 3, maxRows: 6 }}
            className="git-page-git-tag-textarea"
            onChange={(event) => setDraft((current) => ({
              ...current,
              message: event.target.value,
            }))}
          />
        </label>
        <Checkbox
          checked={draft.push}
          onChange={(event) => setDraft((current) => ({
            ...current,
            push: event.target.checked,
          }))}
        >
          {props.copy.createTagPushLabel}
        </Checkbox>
      </div>
    </Modal>
  );
}
