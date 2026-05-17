import { ArrowLeftOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons"
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CodeToggle,
  codeBlockPlugin,
  codeMirrorPlugin,
  CreateLink,
  diffSourcePlugin,
  headingsPlugin,
  InsertCodeBlock,
  InsertTable,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  Separator,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  type MDXEditorMethods,
  type ViewMode,
} from "@mdxeditor/editor"
import "@mdxeditor/editor/style.css"
import {
  Button,
  Checkbox,
  Form,
  Input,
  Switch,
  type FormInstance,
} from "antd"
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { LanguageCode } from "../../../config/titlebar"
import type {
  AgentItem,
} from "../../../../shared/desktop-agents"
import type { AgentsTranslate } from "../agents-i18n"
import "./agent-editor-page.css"

const PROMPT_CODE_BLOCK_LANGUAGES: Record<string, string> = {
  text: "Plain text",
  markdown: "Markdown",
  json: "JSON",
  yaml: "YAML",
  bash: "Bash",
  shell: "Shell",
  ts: "TypeScript",
  js: "JavaScript",
  python: "Python",
}

type AgentEditorFieldName = "agentId" | "name" | "mode" | "description" | "prompt" | "enabled"

function AgentPromptToolbar() {
  return (
    <>
      <UndoRedo />
      <Separator />
      <BlockTypeSelect />
      <Separator />
      <BoldItalicUnderlineToggles />
      <CodeToggle />
      <Separator />
      <ListsToggle />
      <Separator />
      <CreateLink />
      <InsertTable />
      <InsertCodeBlock />
    </>
  )
}

type PromptEditorErrorBoundaryProps = {
  children: React.ReactNode
  fallback: React.ReactNode
  onError?: () => void
  resetKey: string
}

type PromptEditorErrorBoundaryState = {
  hasError: boolean
}

class PromptEditorErrorBoundary extends Component<
  PromptEditorErrorBoundaryProps,
  PromptEditorErrorBoundaryState
> {
  state: PromptEditorErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): PromptEditorErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error("Agent prompt rich editor render failed", error)
    this.props.onError?.()
  }

  componentDidUpdate(prevProps: PromptEditorErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export type AgentEditorChildFormValues = {
  draftKey: string
  agentId: string
  name: string
  mode: Extract<AgentItem["mode"], "subagent" | "all">
  description: string
  prompt: string
  enabled: boolean
}

export type AgentEditorFormValues = {
  agentId: string
  name: string
  mode: AgentItem["mode"]
  description: string
  prompt: string
  enabled: boolean
  childAgents: AgentEditorChildFormValues[]
  linkedAgentIds: string[]
}

type Props = {
  editingItem: AgentItem | null
  form: FormInstance<AgentEditorFormValues>
  saving: boolean
  availableAgents: AgentItem[]
  t: AgentsTranslate
  language: LanguageCode
  onBack: () => void
  onSave: () => void
}

type AgentEditorFormPath = Parameters<FormInstance<AgentEditorFormValues>["setFieldValue"]>[0]

function PromptRichTextIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="agent-editor-page-view-switch-icon">
      <path d="M3 4.5h10M6 4.5V12M10 4.5V12M4.5 12h7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PromptDiffIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="agent-editor-page-view-switch-icon">
      <path d="M5 3.5v9M11 3.5v9M2.5 5.5h3M2.5 10.5h3M10.5 5.5h3M10.5 10.5h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function PromptMarkdownIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="agent-editor-page-view-switch-icon">
      <path d="M2.5 4.5l2.5 3.2L7.5 4.5v7M10 5l-2 3 2 3M12 11l2-3-2-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function createChildDraftKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `child-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function countPromptCharacters(value: string): number {
  return Array.from(value).length
}

function createEmptyChildAgent(): AgentEditorChildFormValues {
  return {
    draftKey: createChildDraftKey(),
    agentId: "",
    name: "",
    mode: "subagent",
    description: "",
    prompt: "",
    enabled: true,
  }
}

function resolveRailDescription(value?: string): string | null {
  const description = value?.trim()
  return description ? description : null
}

function isPrimaryRailItem(mode: AgentItem["mode"]): boolean {
  return mode !== "subagent"
}

function resolveAgentIdentityLabel(
  selectedIsRoot: boolean,
  mode: AgentItem["mode"],
  t: AgentsTranslate,
): string {
  if (selectedIsRoot && mode !== "subagent") {
    return t("智能体页.编辑页.标签.主智能体")
  }

  return t("智能体页.编辑页.标签.子智能体")
}

export function AgentEditorPage(props: Props) {
  const { availableAgents, editingItem, form, onBack, onSave, saving, t } = props
  const rootAgentIdValue = Form.useWatch("agentId", form) ?? ""
  const rootNameValue = Form.useWatch("name", form) ?? ""
  const rootModeValue = Form.useWatch("mode", form) ?? "primary"
  const rootDescriptionValue = Form.useWatch("description", form) ?? ""
  const rootPromptValue = Form.useWatch("prompt", form) ?? ""
  const childAgents = Form.useWatch("childAgents", { form, preserve: true }) ?? []
  const linkedAgentIds = Form.useWatch("linkedAgentIds", { form, preserve: true }) ?? []
  const [selectedDraftKey, setSelectedDraftKey] = useState("root")
  const [promptEditorMode, setPromptEditorMode] = useState<"rich" | "fallback">("rich")
  const [promptViewMode, setPromptViewMode] = useState<ViewMode>("rich-text")
  const [promptBaselineByDraftKey, setPromptBaselineByDraftKey] = useState<Record<string, string>>({})
  const promptEditorRef = useRef<MDXEditorMethods>(null)
  const promptEditorSyncedMarkdownRef = useRef<string | null>(null)

  const selectedChildIndex = childAgents.findIndex((child) => child.draftKey === selectedDraftKey)
  const selectedChild = selectedChildIndex >= 0 ? childAgents[selectedChildIndex] : null
  const selectedIsRoot = selectedDraftKey === "root" || !selectedChild
  const selectedModeValue = selectedIsRoot ? rootModeValue : selectedChild.mode
  const selectedPromptValue = selectedIsRoot ? rootPromptValue : selectedChild.prompt
  const [promptEditorRenderMarkdown, setPromptEditorRenderMarkdown] = useState(selectedPromptValue)
  const selectedBaselinePrompt = promptBaselineByDraftKey[selectedIsRoot ? "root" : (selectedChild?.draftKey ?? "root")] ?? ""
  const selectedTitle = selectedIsRoot
    ? rootNameValue.trim() || rootAgentIdValue.trim() || t("智能体页.编辑页.标签.主智能体")
    : selectedChild.name.trim() || selectedChild.agentId.trim() || `${t("智能体页.编辑页.标签.子智能体")} ${selectedChildIndex + 1}`
  const selectedIdentityIsPrimary = selectedIsRoot && selectedModeValue !== "subagent"
  const selectedIdentityLabel = resolveAgentIdentityLabel(selectedIsRoot, selectedModeValue, t)
  const selectedAllowsReuse = selectedModeValue === "all"
  const selectedPromptCharCount = countPromptCharacters(selectedPromptValue)
  const promptEditorResetKey = `${editingItem?.agentId ?? "create"}:${selectedDraftKey}`
  const promptEditorInstanceKey = `${promptEditorResetKey}:${promptViewMode}`
  const promptViewModeOptions = useMemo<Array<{ value: ViewMode; label: string }>>(
    () => [
      { value: "rich-text", label: t("智能体页.值.Prompt视图.richText") },
      { value: "diff", label: t("智能体页.值.Prompt视图.diff") },
      { value: "source", label: t("智能体页.值.Prompt视图.source") },
    ],
    [t],
  )

  const linkedAgentOptions = useMemo(
    () => linkedAgentIds.map((agentId) => {
      const matched = availableAgents.find((item) => item.agentId === agentId)
      return {
        agentId,
        label: matched ? `${matched.name} (${matched.agentId})` : agentId,
      }
    }),
    [availableAgents, linkedAgentIds],
  )

  const promptEditorPlugins = useMemo(
    () => [
      headingsPlugin({ allowedHeadingLevels: [1, 2, 3, 4] }),
      quotePlugin(),
      listsPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      thematicBreakPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "text" }),
      codeMirrorPlugin({ codeBlockLanguages: PROMPT_CODE_BLOCK_LANGUAGES }),
      diffSourcePlugin({
        viewMode: promptViewMode,
        diffMarkdown: selectedBaselinePrompt,
        readOnlyDiff: true,
      }),
      markdownShortcutPlugin(),
      ...(promptViewMode === "rich-text"
        ? [toolbarPlugin({
            toolbarClassName: "agent-editor-page-rich-toolbar",
            toolbarContents: () => <AgentPromptToolbar />,
          })]
        : []),
    ],
    [promptViewMode, selectedBaselinePrompt],
  )

  const selectedFieldName = useCallback((field: AgentEditorFieldName): AgentEditorFormPath => {
    return (selectedIsRoot ? field : ["childAgents", selectedChildIndex, field]) as AgentEditorFormPath
  }, [selectedChildIndex, selectedIsRoot])

  const updateSelectedPromptValue = useCallback((value: string) => {
    form.setFieldValue(selectedFieldName("prompt"), value)
  }, [form, selectedFieldName])

  const handlePromptEditorChange = useCallback((nextMarkdown: string, initialMarkdownNormalize: boolean) => {
    if (initialMarkdownNormalize) {
      return
    }

    promptEditorSyncedMarkdownRef.current = nextMarkdown
    setPromptEditorRenderMarkdown(nextMarkdown)
    updateSelectedPromptValue(nextMarkdown)
  }, [updateSelectedPromptValue])

  const handleAddChild = useCallback(() => {
    const nextChild = createEmptyChildAgent()
    form.setFieldValue("childAgents", [...childAgents, nextChild])
    setSelectedDraftKey(nextChild.draftKey)
  }, [childAgents, form])

  const handleRemoveChild = useCallback((draftKey: string) => {
    const removedIndex = childAgents.findIndex((child) => child.draftKey === draftKey)
    const nextChildren = childAgents.filter((child) => child.draftKey !== draftKey)
    form.setFieldValue("childAgents", nextChildren)

    if (selectedDraftKey === draftKey) {
      const fallbackChild = nextChildren[Math.max(0, removedIndex - 1)]
      setSelectedDraftKey(fallbackChild?.draftKey ?? "root")
    }
  }, [childAgents, form, selectedDraftKey])

  useEffect(() => {
    setSelectedDraftKey("root")
  }, [editingItem?.agentId])

  useEffect(() => {
    const baselineByDraftKey: Record<string, string> = {
      root: rootPromptValue,
    }

    for (const child of childAgents) {
      baselineByDraftKey[child.draftKey] = child.prompt
    }

    setPromptBaselineByDraftKey(baselineByDraftKey)
  }, [editingItem?.agentId])

  useEffect(() => {
    if (selectedDraftKey === "root") {
      return
    }

    if (!childAgents.some((child) => child.draftKey === selectedDraftKey)) {
      setSelectedDraftKey("root")
    }
  }, [childAgents, selectedDraftKey])

  useEffect(() => {
    setPromptEditorMode("rich")
    setPromptViewMode("rich-text")
    setPromptEditorRenderMarkdown(selectedPromptValue)
    promptEditorSyncedMarkdownRef.current = null
  }, [promptEditorResetKey, selectedPromptValue])

  useEffect(() => {
    const nextPrompt = selectedPromptValue
    if (promptEditorSyncedMarkdownRef.current !== nextPrompt) {
      setPromptEditorRenderMarkdown(nextPrompt)
    }

    if (promptEditorMode !== "rich") {
      return
    }

    if (promptEditorSyncedMarkdownRef.current === nextPrompt) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      promptEditorRef.current?.setMarkdown(nextPrompt)
      promptEditorSyncedMarkdownRef.current = nextPrompt
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [promptEditorMode, promptEditorResetKey, selectedPromptValue])

  const handlePromptViewModeChange = useCallback((nextMode: ViewMode) => {
    if (promptEditorMode !== "rich" || promptViewMode === nextMode) {
      return
    }

    const currentMarkdown = promptEditorRef.current?.getMarkdown()
    if (typeof currentMarkdown === "string") {
      promptEditorSyncedMarkdownRef.current = currentMarkdown
      setPromptEditorRenderMarkdown(currentMarkdown)
      updateSelectedPromptValue(currentMarkdown)
    }

    setPromptViewMode(nextMode)
  }, [promptEditorMode, promptViewMode, updateSelectedPromptValue])

  const handlePromptFallback = useCallback(() => {
    setPromptViewMode("rich-text")
    setPromptEditorMode("fallback")
  }, [])

  const handleAllowReuseChange = useCallback((checked: boolean) => {
    const rootIdentityMode = editingItem?.mode === "subagent" ? "subagent" : "primary"
    const nextMode = checked
      ? "all"
      : (selectedIsRoot ? rootIdentityMode : "subagent")

    form.setFieldValue(selectedFieldName("mode"), nextMode)
  }, [editingItem?.mode, form, selectedFieldName, selectedIsRoot])

  const renderPromptViewSwitchIcon = useCallback((mode: ViewMode) => {
    if (mode === "diff") {
      return <PromptDiffIcon />
    }
    if (mode === "source") {
      return <PromptMarkdownIcon />
    }
    return <PromptRichTextIcon />
  }, [])

  return (
    <section className="agent-editor-page">
      <div className="agent-editor-page-toolbar">
        <div className="agent-editor-page-toolbar-main">
          <Button icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={onBack}>
            {t("智能体页.按钮.返回列表")}
          </Button>
          <span className="agent-editor-page-title">
            {editingItem ? t("智能体页.弹窗.标题.编辑") : t("智能体页.弹窗.标题.新建")}
          </span>
        </div>

        <div className="agent-editor-page-toolbar-actions">
          <Button onClick={onBack}>{t("智能体页.按钮.取消")}</Button>
          <Button type="primary" loading={saving} onClick={onSave}>
            {editingItem ? t("智能体页.按钮.保存") : t("智能体页.按钮.新建")}
          </Button>
        </div>
      </div>

      <div className="agent-editor-page-body">
        <Form form={form} layout="vertical" className="agent-editor-page-form">
          <div className="agent-editor-page-surface">
            <div className="agent-editor-page-layout">
              <aside className="agent-editor-page-rail">
                <div className="agent-editor-page-column-header">
                  <span className="agent-editor-page-column-title">
                    {t("智能体页.编辑页.标题.智能体列表")}
                  </span>

                  <Button
                    type="text"
                    className="agent-editor-page-rail-add-button"
                    icon={<PlusOutlined aria-hidden="true" />}
                    aria-label={t("智能体页.按钮.添加子智能体")}
                    title={t("智能体页.按钮.添加子智能体")}
                    disabled={rootModeValue === "subagent"}
                    onClick={handleAddChild}
                  />
                </div>

                <div className="agent-editor-page-rail-list">
                  <button
                    type="button"
                    className={`agent-editor-page-rail-item${selectedIsRoot ? " is-active" : ""}`}
                    onClick={() => setSelectedDraftKey("root")}
                  >
                    <div className="agent-editor-page-rail-item-header">
                      <span className="agent-editor-page-rail-item-title">
                        {rootNameValue.trim() || rootAgentIdValue.trim() || t("智能体页.编辑页.标签.主智能体")}
                      </span>
                      {isPrimaryRailItem(rootModeValue) ? (
                        <span className="agent-editor-page-rail-item-role">
                          {t("智能体页.编辑页.标签.主智能体")}
                        </span>
                      ) : null}
                    </div>
                    {resolveRailDescription(rootDescriptionValue) ? (
                      <span className="agent-editor-page-rail-item-description">
                        {resolveRailDescription(rootDescriptionValue)}
                      </span>
                    ) : null}
                  </button>

                  {childAgents.map((child, index) => {
                    const selected = !selectedIsRoot && child.draftKey === selectedDraftKey
                    const childDescription = resolveRailDescription(child.description)

                    return (
                      <div key={child.draftKey} className="agent-editor-page-rail-row">
                        <button
                          type="button"
                          className={`agent-editor-page-rail-item${selected ? " is-active" : ""}`}
                          onClick={() => setSelectedDraftKey(child.draftKey)}
                        >
                          <div className="agent-editor-page-rail-item-header">
                            <span className="agent-editor-page-rail-item-title">
                              {child.name.trim() || child.agentId.trim() || `${t("智能体页.编辑页.标签.子智能体")} ${index + 1}`}
                            </span>
                          </div>
                          {childDescription ? (
                            <span className="agent-editor-page-rail-item-description">
                              {childDescription}
                            </span>
                          ) : null}
                        </button>

                        <Button
                          type="text"
                          danger
                          className="agent-editor-page-rail-remove"
                          icon={<DeleteOutlined aria-hidden="true" />}
                          onClick={() => handleRemoveChild(child.draftKey)}
                        />
                      </div>
                    )
                  })}
                </div>
              </aside>

              <div className="agent-editor-page-center">
                <div className="agent-editor-page-column-header">
                  <span className="agent-editor-page-column-title">
                    {t("智能体页.编辑页.标题.字段")}
                  </span>

                  {!selectedIsRoot ? (
                    <Button
                      type="text"
                      danger
                      className="agent-editor-page-header-danger"
                      icon={<DeleteOutlined aria-hidden="true" />}
                      onClick={() => handleRemoveChild(selectedDraftKey)}
                    >
                      {t("智能体页.按钮.移除子智能体")}
                    </Button>
                  ) : null}
                </div>

                <div className="agent-editor-page-selection-summary">
                  <span className={`agent-editor-page-selection-badge${selectedIdentityIsPrimary ? " is-root" : " is-child"}`}>
                    {selectedIdentityLabel}
                  </span>
                  <span className="agent-editor-page-selection-name">{selectedTitle}</span>
                </div>

                <Form.Item
                  label={t("智能体页.字段.agentId")}
                  name={selectedFieldName("agentId")}
                  extra={selectedIsRoot && editingItem ? t("智能体页.编辑页.提示.agentId只读") : undefined}
                  rules={[
                    { required: true, message: t("智能体页.校验.agentId格式") },
                    {
                      pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,63}$/,
                      message: t("智能体页.校验.agentId格式"),
                    },
                  ]}
                >
                  <Input
                    autoComplete="off"
                    spellCheck={false}
                    disabled={selectedIsRoot && Boolean(editingItem)}
                    placeholder={selectedIsRoot ? "code-reviewer" : "memory-helper"}
                  />
                </Form.Item>

                <Form.Item label={t("智能体页.字段.mode")}>
                  <div className="agent-editor-page-readonly-field">{selectedIdentityLabel}</div>
                </Form.Item>

                <Form.Item className="agent-editor-page-allow-reuse-item">
                  <Checkbox checked={selectedAllowsReuse} onChange={(event) => handleAllowReuseChange(event.target.checked)}>
                    {t("智能体页.字段.allowReuse")}
                  </Checkbox>
                </Form.Item>

                <Form.Item
                  label={t("智能体页.字段.name")}
                  name={selectedFieldName("name")}
                  rules={[{ required: true, message: t("智能体页.校验.名称必填") }]}
                >
                  <Input autoComplete="off" spellCheck={false} />
                </Form.Item>

                <Form.Item
                  label={t("智能体页.字段.description")}
                  name={selectedFieldName("description")}
                  className="agent-editor-page-description-item"
                >
                  <Input.TextArea rows={8} autoComplete="off" spellCheck={false} />
                </Form.Item>

                {selectedIsRoot ? (
                  <Form.Item
                    label={t("智能体页.字段.enabled")}
                    name={selectedFieldName("enabled")}
                    valuePropName="checked"
                    className="agent-editor-page-enabled-item"
                  >
                    <Switch />
                  </Form.Item>
                ) : null}

                {selectedIsRoot && linkedAgentOptions.length > 0 ? (
                  <div className="agent-editor-page-linked-panel">
                    <div className="agent-editor-page-linked-title">
                      {t("智能体页.编辑页.提示.保留引用说明")}
                    </div>
                    <div className="agent-editor-page-linked-list">
                      {linkedAgentOptions.map((item) => (
                        <span key={item.agentId} className="agent-editor-page-linked-chip">
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="agent-editor-page-main">
                <div className="agent-editor-page-prompt-header">
                  <span className="agent-editor-page-prompt-title">
                    {t("智能体页.编辑页.标题.智能体设定")}
                  </span>
                  <span className="agent-editor-page-prompt-stats">
                    {t("智能体页.编辑页.字数", { 数量: selectedPromptCharCount })}
                  </span>
                  <div className="agent-editor-page-prompt-actions">
                    {promptEditorMode === "fallback" ? (
                      <span className="agent-editor-page-prompt-mode">
                        Plain Text
                      </span>
                    ) : (
                      <div className="agent-editor-page-view-switch" aria-label={t("智能体页.字段.prompt")}>
                        {promptViewModeOptions.map((option) => {
                          const isSelected = promptViewMode === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`agent-editor-page-view-switch-button${isSelected ? " is-active" : ""}`}
                              aria-label={option.label}
                              title={option.label}
                              onClick={() => handlePromptViewModeChange(option.value)}
                            >
                              {renderPromptViewSwitchIcon(option.value)}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="agent-editor-page-prompt-panel">
                  {promptEditorMode === "fallback" ? (
                    <div className="agent-editor-page-fallback-shell">
                      <div className="agent-editor-page-fallback-note">
                        {t("智能体页.提示.Prompt富文本回退")}
                      </div>
                      <Input.TextArea
                        rows={18}
                        autoComplete="off"
                        spellCheck={false}
                        value={selectedPromptValue}
                        className="agent-editor-page-fallback-textarea"
                        onChange={(event) => updateSelectedPromptValue(event.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="agent-editor-page-rich-shell">
                      <PromptEditorErrorBoundary
                        resetKey={promptEditorResetKey}
                        onError={handlePromptFallback}
                        fallback={
                          <div className="agent-editor-page-fallback-shell">
                            <div className="agent-editor-page-fallback-note">
                              {t("智能体页.提示.Prompt富文本回退")}
                            </div>
                            <Input.TextArea
                              rows={18}
                              autoComplete="off"
                              spellCheck={false}
                              value={selectedPromptValue}
                              className="agent-editor-page-fallback-textarea"
                              onChange={(event) => updateSelectedPromptValue(event.target.value)}
                            />
                          </div>
                        }
                      >
                        <MDXEditor
                          key={`agent-editor:${promptEditorInstanceKey}`}
                          ref={promptEditorRef}
                          markdown={promptEditorRenderMarkdown}
                          trim={false}
                          spellCheck={false}
                          suppressHtmlProcessing
                          className="agent-editor-page-rich-editor"
                          contentEditableClassName="agent-editor-page-rich-content"
                          placeholder={(
                            <span className="agent-editor-page-prompt-placeholder">
                              {t("智能体页.输入.Prompt富文本占位")}
                            </span>
                          )}
                          plugins={promptEditorPlugins}
                          onChange={handlePromptEditorChange}
                          onError={handlePromptFallback}
                        />
                      </PromptEditorErrorBoundary>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Form>
      </div>
    </section>
  )
}

export default AgentEditorPage