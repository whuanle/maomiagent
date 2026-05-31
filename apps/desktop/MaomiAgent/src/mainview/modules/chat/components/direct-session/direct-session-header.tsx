import { Input } from "antd";
import { useEffect, useRef, useState } from "react";

import type { DirectSessionHeaderViewModel } from "./types";
import { resolveSessionTitleRenameInput } from "./direct-session-title-edit";

type Props = {
  header: DirectSessionHeaderViewModel;
};

export function DirectSessionHeader(props: Props) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(props.header.title);
  const skipBlurSubmitRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraftTitle(props.header.title);
    }
  }, [editing, props.header.title]);

  const submitRename = async () => {
    if (!props.header.onRename || props.header.savingTitle) {
      setEditing(false);
      return;
    }

    const normalizedTitle = resolveSessionTitleRenameInput(props.header.title, draftTitle);
    if (!normalizedTitle) {
      setDraftTitle(props.header.title);
      setEditing(false);
      return;
    }

    await props.header.onRename(normalizedTitle);
    setEditing(false);
  };

  return (
    <header className="chat-direct-session-strip" aria-label={props.header.ariaLabel}>
      <div className="chat-direct-session-strip-main">
        <div className="chat-direct-session-strip-title-row">
          {props.header.editable && props.header.onRename ? (
            editing ? (
              <Input
                autoFocus
                className="chat-direct-session-strip-title-input"
                value={draftTitle}
                placeholder={props.header.renamePlaceholder}
                disabled={props.header.savingTitle}
                onChange={(event) => {
                  setDraftTitle(event.target.value);
                }}
                onBlur={() => {
                  if (skipBlurSubmitRef.current) {
                    skipBlurSubmitRef.current = false;
                    return;
                  }
                  void submitRename();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    skipBlurSubmitRef.current = true;
                    setDraftTitle(props.header.title);
                    setEditing(false);
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitRename();
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="chat-direct-session-strip-title-button"
                title={props.header.titleHint}
                aria-label={props.header.renameActionLabel}
                onClick={() => {
                  setDraftTitle(props.header.title);
                  setEditing(true);
                }}
              >
                <span className="chat-direct-session-strip-title">{props.header.title}</span>
              </button>
            )
          ) : (
            <h2 className="chat-direct-session-strip-title" title={props.header.titleHint}>
              {props.header.title}
            </h2>
          )}
        </div>
        <span className={`chat-direct-session-strip-status is-${props.header.statusTone}`}>
          {props.header.statusLabel}
        </span>
      </div>
    </header>
  );
}

export default DirectSessionHeader;
