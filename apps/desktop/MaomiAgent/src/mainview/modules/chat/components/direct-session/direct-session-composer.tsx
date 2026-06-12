import {
  CloseOutlined,
  PaperClipOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Input, Select, Switch, type SelectProps } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useEffect, useMemo, useRef, useState, type ClipboardEventHandler } from "react";

import type { ChatSlashCommandOption } from "../../types";
import { WorkspaceFileIcon } from "../workspace-file-icon";
import { shouldFocusPrefilledDraft } from "./direct-session-composer-prefill";
import { resolveDirectSessionComposerPopupContainer } from "./direct-session-composer-popup";
import { assembleDirectSessionComposerSubmitText } from "./direct-session-composer-submit";
import { resolveDirectSessionComposerSubmitState } from "./direct-session-composer-submit-state";
import {
  applyDirectSessionComposerSlashCommand,
  resolveDirectSessionComposerSlashMatch,
} from "./direct-session-composer-slash";
import type { DirectSessionComposerViewModel } from "./types";

const COMPOSER_SELECT_POPUP_WIDTH = 320;
const IMAGE_ATTACHMENT_EXTENSIONS = new Set(["apng", "avif", "bmp", "gif", "heic", "heif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);
const TOKEN_RING_PATH_LENGTH = 100;

type Props = DirectSessionComposerViewModel;

export function DirectSessionComposer(props: Props) {
  const isEn = props.language === "en-US";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<TextAreaRef | null>(null);
  const previousDraftRef = useRef(props.draft);
  const pendingSelectionRef = useRef<number | null>(null);
  const [selectionRange, setSelectionRange] = useState(() => ({
    start: props.draft.length,
    end: props.draft.length,
  }));
  const [selectedSlashCommand, setSelectedSlashCommand] = useState<ChatSlashCommandOption | undefined>();
  const [dismissedSlashKey, setDismissedSlashKey] = useState<string | null>(null);
  const resolvePopupContainer: SelectProps["getPopupContainer"] = (triggerNode) => (
    resolveDirectSessionComposerPopupContainer(triggerNode)
  );
  const filterAgentOption: SelectProps["filterOption"] = (input, option) => {
    if (!option) {
      return false;
    }

    const optionLabel = typeof option.label === "string" ? option.label : "";
    const searchText = [
      optionLabel,
      typeof option.value === "string" ? option.value : "",
      typeof (option as { description?: unknown }).description === "string"
        ? (option as { description: string }).description
        : "",
    ].join(" ").toLowerCase();

    return searchText.includes(input.toLowerCase());
  };
  const submitState = resolveDirectSessionComposerSubmitState({
    language: props.language,
    sendLabel: props.sendLabel,
    disabled: props.disabled,
    sendDisabled: props.sendDisabled,
    sending: props.sending,
    stopping: props.stopping,
  });
  const attachmentButtonLabel = isEn ? "Attach files" : "添加附件";
  const submitDisabled = submitState.disabled;
  const planModeEnabled = props.composerMode === "plan";
  const modeLabel = isEn ? "Plan mode" : "Plan 模式";
  const planModeAgentPlaceholder = "Plan";
  const showAttachmentButton = props.showAttachmentButton !== false;
  const showModeSwitch = props.showModeSwitch !== false;
  const showModelSelect = props.showModelSelect !== false;
  const showAgentSelect = props.showAgentSelect !== false;
  const showContextDivider = showAttachmentButton
    && (showModeSwitch || showModelSelect || showAgentSelect || Boolean(props.tokenBudgetUsage) || Boolean(props.contextCompressionStatus));
  const slashMatch = useMemo(
    () => resolveDirectSessionComposerSlashMatch({
      draft: props.draft,
      selectionStart: selectionRange.start,
      commands: props.slashCommands,
    }),
    [props.draft, props.slashCommands, selectionRange.start],
  );
  const slashContextKey = slashMatch
    ? `${slashMatch.replaceStart}:${slashMatch.replaceEnd}:${slashMatch.query}`
    : null;
  const visibleSlashMatch = slashMatch && dismissedSlashKey !== slashContextKey
    ? slashMatch
    : undefined;
  const [activeSlashIndex, setActiveSlashIndex] = useState(0);

  function updateSelectionRange(start: number, end = start) {
    setSelectionRange({
      start,
      end,
    });
  }

  function applySlashCommandSelection(commandIndex: number) {
    if (!visibleSlashMatch) {
      return;
    }

    const command = visibleSlashMatch.commands[commandIndex];
    if (!command) {
      return;
    }

    const nextState = applyDirectSessionComposerSlashCommand({
      draft: props.draft,
      replaceStart: visibleSlashMatch.replaceStart,
      replaceEnd: visibleSlashMatch.replaceEnd,
      command,
    });

    pendingSelectionRef.current = nextState.selectionStart;
    setSelectedSlashCommand(nextState.selectedCommand);
    setDismissedSlashKey(null);
    props.onDraftChange(nextState.draft);
    updateSelectionRange(nextState.selectionStart);
  }

  function formatAttachmentSize(sizeBytes?: number) {
    if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return "";
    }

    const units = ["B", "KB", "MB", "GB"];
    let value = sizeBytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    const precision = value >= 100 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(precision)} ${units[unitIndex]}`;
  }

  function resolveAttachmentExtension(name: string) {
    return name.trim().toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
  }

  function isImageAttachment(attachment: Props["attachments"][number]) {
    if (attachment.mimeType?.trim().toLowerCase().startsWith("image/")) {
      return true;
    }

    return IMAGE_ATTACHMENT_EXTENSIONS.has(resolveAttachmentExtension(attachment.name));
  }

  const handleAttachFiles = (files: File[]) => {
    if (files.length === 0 || props.disabled) {
      return;
    }

    props.onAttachFiles(files);
  };

  const handleInputPaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (props.disabled) {
      return;
    }

    const clipboardData = event.clipboardData;
    const filesFromItems = Array.from(clipboardData?.items ?? [])
      .flatMap((item) => item.kind === "file" ? [item.getAsFile()] : [])
      .filter((item): item is File => Boolean(item));
    const files = filesFromItems.length > 0
      ? filesFromItems
      : Array.from(clipboardData?.files ?? []);

    if (files.length === 0) {
      return;
    }

    event.preventDefault();
    handleAttachFiles(files);
  };
  const composerActionsClassName = [
    "chat-direct-composer-actions",
    submitDisabled ? "is-disabled" : "",
    props.sending ? "is-sending" : "",
    props.stopping ? "is-stopping" : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    const previousDraft = previousDraftRef.current;
    previousDraftRef.current = props.draft;

    const textArea = textAreaRef.current?.resizableTextArea?.textArea;
    const composerFocused = Boolean(textArea && textArea.ownerDocument.activeElement === textArea);

    if (!shouldFocusPrefilledDraft(previousDraft, props.draft, { composerFocused })) {
      return;
    }

    const schedule = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame
      : (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 0);

    schedule(() => {
      textAreaRef.current?.focus({ cursor: "start" });
    });
  }, [props.draft]);

  useEffect(() => {
    const maxSelection = props.draft.length;
    setSelectionRange((current) => {
      const start = Math.min(current.start, maxSelection);
      const end = Math.min(current.end, maxSelection);
      if (start === current.start && end === current.end) {
        return current;
      }

      return { start, end };
    });
  }, [props.draft.length]);

  useEffect(() => {
    if (visibleSlashMatch) {
      setActiveSlashIndex((current) => Math.min(current, visibleSlashMatch.commands.length - 1));
      return;
    }

    setActiveSlashIndex(0);
  }, [visibleSlashMatch]);

  useEffect(() => {
    if (slashContextKey && dismissedSlashKey && slashContextKey !== dismissedSlashKey) {
      setDismissedSlashKey(null);
    }
  }, [dismissedSlashKey, slashContextKey]);

  useEffect(() => {
    if (!selectedSlashCommand) {
      return;
    }

    if ((props.slashCommands ?? []).some((command) => command.key === selectedSlashCommand.key)) {
      return;
    }

    setSelectedSlashCommand(undefined);
  }, [props.slashCommands, selectedSlashCommand]);

  useEffect(() => {
    const pendingSelection = pendingSelectionRef.current;
    if (pendingSelection === null) {
      return;
    }

    pendingSelectionRef.current = null;
    const schedule = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame
      : (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 0);

    schedule(() => {
      const textArea = textAreaRef.current?.resizableTextArea?.textArea;
      if (!textArea) {
        return;
      }

      textArea.focus();
      textArea.setSelectionRange(pendingSelection, pendingSelection);
      updateSelectionRange(pendingSelection);
    });
  }, [props.draft]);

  function submitComposer() {
    const selectedCommand = selectedSlashCommand && (props.slashCommands ?? [])
      .some((command) => command.key === selectedSlashCommand.key)
      ? selectedSlashCommand
      : undefined;
    const textOverride = assembleDirectSessionComposerSubmitText({
      draft: props.draft,
      selectedSlashCommand: selectedCommand,
    });

    setSelectedSlashCommand(undefined);
    props.onSubmit({ textOverride });
  }

  return (
    <div className="chat-direct-composer">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="chat-direct-composer-file-input"
          aria-label={attachmentButtonLabel}
          title={attachmentButtonLabel}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            handleAttachFiles(files);
          }}
        />
        <div className="chat-direct-composer-editor">
          {props.attachments.length > 0 ? (
            <div className="chat-direct-composer-attachments">
              {props.attachments.map((attachment) => (
                <span key={attachment.id} className="chat-direct-composer-attachment">
                  <span className="chat-direct-composer-attachment-visual" aria-hidden="true">
                    {isImageAttachment(attachment) && attachment.previewUrl ? (
                      <img
                        className="chat-direct-composer-attachment-preview"
                        src={attachment.previewUrl}
                        alt=""
                      />
                    ) : (
                      <WorkspaceFileIcon
                        path={attachment.name}
                        kind="file"
                        mono
                        className="chat-direct-composer-attachment-icon"
                      />
                    )}
                  </span>
                  <span className="chat-direct-composer-attachment-meta">
                    <span className="chat-direct-composer-attachment-name">{attachment.name}</span>
                    {formatAttachmentSize(attachment.sizeBytes) ? (
                      <span className="chat-direct-composer-attachment-size">{formatAttachmentSize(attachment.sizeBytes)}</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="chat-direct-composer-attachment-remove"
                    aria-label={isEn ? "Remove attachment" : "移除附件"}
                    title={isEn ? "Remove attachment" : "移除附件"}
                    onClick={() => props.onRemoveAttachment(attachment.id)}
                  >
                    <CloseOutlined />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {selectedSlashCommand ? (
            <div className="chat-direct-composer-selected-command">
              <span className="chat-direct-composer-selected-command-token">
                /{selectedSlashCommand.insertText}
              </span>
              <span className="chat-direct-composer-selected-command-label">
                {selectedSlashCommand.label}
              </span>
              <button
                type="button"
                className="chat-direct-composer-selected-command-remove"
                aria-label={isEn ? "Remove command" : "移除命令"}
                title={isEn ? "Remove command" : "移除命令"}
                onClick={() => {
                  setSelectedSlashCommand(undefined);
                  textAreaRef.current?.focus();
                }}
              >
                <CloseOutlined />
              </button>
            </div>
          ) : null}
          <div className="chat-direct-composer-input-shell">
            {visibleSlashMatch ? (
              <div className="chat-direct-composer-slash-floating" role="listbox" aria-label={isEn ? "Skill commands" : "技能命令"}>
                {visibleSlashMatch.commands.map((command, index) => (
                  <button
                    key={command.key}
                    type="button"
                    role="option"
                    aria-selected={index === activeSlashIndex}
                    className={`chat-direct-composer-slash-option${index === activeSlashIndex ? " is-active" : ""}`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onMouseEnter={() => setActiveSlashIndex(index)}
                    onClick={() => applySlashCommandSelection(index)}
                  >
                    <span className="chat-direct-composer-slash-option-head">
                      <span className="chat-direct-composer-slash-option-token">/{command.insertText}</span>
                      <span className="chat-direct-composer-slash-option-label">{command.label}</span>
                    </span>
                    {command.description ? (
                      <span className="chat-direct-composer-slash-option-description">{command.description}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="chat-direct-composer-input-stage">
              <Input.TextArea
                ref={textAreaRef}
                className="chat-direct-composer-input"
                variant="borderless"
                autoSize={{ minRows: 3, maxRows: 10 }}
                disabled={props.disabled}
                placeholder={props.placeholder}
                value={props.draft}
                onChange={(event) => {
                  setDismissedSlashKey(null);
                  updateSelectionRange(event.target.selectionStart, event.target.selectionEnd);
                  props.onDraftChange(event.target.value);
                }}
                onPaste={handleInputPaste}
                onClick={(event) => updateSelectionRange(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
                onFocus={(event) => updateSelectionRange(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
                onKeyUp={(event) => updateSelectionRange(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
                onSelect={(event) => updateSelectionRange(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
                onKeyDown={(event) => {
                  if (props.stopping) {
                    return;
                  }
                  if (visibleSlashMatch) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setActiveSlashIndex((current) => (current + 1) % visibleSlashMatch.commands.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setActiveSlashIndex((current) => (
                        current - 1 + visibleSlashMatch.commands.length
                      ) % visibleSlashMatch.commands.length);
                      return;
                    }
                    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      applySlashCommandSelection(activeSlashIndex);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setDismissedSlashKey(slashContextKey);
                      return;
                    }
                  }
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                    return;
                  }
                  if (props.sendDisabled) {
                    return;
                  }

                  event.preventDefault();
                  submitComposer();
                }}
              />
            </div>
          </div>
          <div className="chat-direct-composer-footer">
            <div className="chat-direct-composer-context-rail">
              <button
                type="button"
                className="chat-direct-composer-attach-button"
                title={props.attachLabel}
                aria-label={props.attachLabel}
                disabled={props.disabled}
                hidden={!showAttachmentButton}
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperClipOutlined />
              </button>
              {showContextDivider ? (
                <span className="chat-direct-composer-context-divider" aria-hidden="true" />
              ) : null}
              {showModeSwitch ? (
                <div className="chat-direct-composer-select-shell">
                  <div className="chat-direct-composer-mode-switch" aria-label={modeLabel}>
                    <span className="chat-direct-composer-mode-switch-label">{modeLabel}</span>
                    <Switch
                      size="small"
                      checked={planModeEnabled}
                      disabled={props.disabled}
                      onChange={(checked) => props.onModeChange(checked ? "plan" : "agent")}
                    />
                  </div>
                </div>
              ) : null}
              {showModelSelect ? (
                <div className="chat-direct-composer-select-shell">
                  <Select
                    className="chat-direct-composer-select"
                    variant="borderless"
                    showSearch
                    popupMatchSelectWidth={COMPOSER_SELECT_POPUP_WIDTH}
                    getPopupContainer={resolvePopupContainer}
                    optionFilterProp="searchText"
                    disabled={props.modelSelectOptions.length === 0}
                    placeholder={props.modelPlaceholder}
                    notFoundContent={isEn ? "No models" : "暂无可用模型"}
                    options={props.modelSelectOptions}
                    value={props.selectedModelValue}
                    aria-label={props.modelPlaceholder}
                    onChange={(value) => props.onModelChange(typeof value === "string" ? value : undefined)}
                  />
                </div>
              ) : null}
              {showAgentSelect ? (
                <div className="chat-direct-composer-select-shell">
                  <Select
                    className="chat-direct-composer-select"
                    variant="borderless"
                    showSearch
                    popupMatchSelectWidth={COMPOSER_SELECT_POPUP_WIDTH}
                    getPopupContainer={resolvePopupContainer}
                    filterOption={filterAgentOption}
                    disabled={props.disabled || planModeEnabled || props.disableAgentSelect === true}
                    placeholder={planModeEnabled ? planModeAgentPlaceholder : props.agentPlaceholder}
                    notFoundContent={isEn ? "No agents" : "暂无可用智能体"}
                    options={props.agentOptions}
                    value={planModeEnabled ? undefined : props.selectedAgentId}
                    aria-label={planModeEnabled ? planModeAgentPlaceholder : props.agentPlaceholder}
                    onChange={(value) => props.onAgentChange(typeof value === "string" ? value : undefined)}
                  />
                </div>
              ) : null}
              {props.tokenBudgetUsage ? (
                <div
                  className={`chat-direct-composer-token-usage is-${props.tokenBudgetUsage.status}`}
                  title={props.tokenBudgetUsage.detailLabel ?? props.tokenBudgetUsage.label}
                  aria-label={props.tokenBudgetUsage.ariaLabel}
                >
                  <svg
                    className="chat-direct-composer-token-usage-ring"
                    viewBox="0 0 40 40"
                    aria-hidden="true"
                  >
                    <circle
                      className="chat-direct-composer-token-usage-ring-track"
                      cx="20"
                      cy="20"
                      r="15"
                      pathLength={TOKEN_RING_PATH_LENGTH}
                    />
                    <circle
                      className="chat-direct-composer-token-usage-ring-progress"
                      cx="20"
                      cy="20"
                      r="15"
                      pathLength={TOKEN_RING_PATH_LENGTH}
                      strokeDasharray={TOKEN_RING_PATH_LENGTH}
                      strokeDashoffset={TOKEN_RING_PATH_LENGTH - props.tokenBudgetUsage.percent}
                    />
                  </svg>
                  <span className="chat-direct-composer-token-usage-inner">
                    <span className="chat-direct-composer-token-usage-value">
                      {props.tokenBudgetUsage.percent}%
                    </span>
                  </span>
                </div>
              ) : null}
              {props.contextCompressionStatus ? (
                <div
                  className={`chat-direct-composer-compaction-status is-${props.contextCompressionStatus.tone}`}
                  title={props.contextCompressionStatus.title}
                >
                  {props.contextCompressionStatus.label}
                </div>
              ) : null}
            </div>
            <div className={composerActionsClassName}>
              <button
                type="button"
                className="chat-direct-composer-submit"
                disabled={submitDisabled}
                onClick={props.sending ? props.onStop : submitComposer}
              >
                {props.sending ? (
                  <CloseOutlined className="chat-direct-composer-submit-icon" />
                ) : (
                  <SendOutlined className="chat-direct-composer-submit-icon" />
                )}
                <span className="chat-direct-composer-submit-label">{submitState.label}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
  );
}

export default DirectSessionComposer;
