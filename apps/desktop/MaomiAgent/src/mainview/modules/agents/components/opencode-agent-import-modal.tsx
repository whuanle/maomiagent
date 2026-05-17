import { App as AntdApp, Alert, Form, Input, List, Modal, Select, Switch, Typography } from "antd"
import { useEffect, useMemo, useState } from "react"
import type {
  AgentItem,
  OpencodeAgentImportFormat,
  OpencodeAgentImportResult,
} from "../../../../shared/desktop-agents"
import {
  importDesktopAgents,
  previewDesktopAgentImport,
} from "../../../lib/desktop-agents"
import type { AgentsTranslate } from "../agents-i18n"
import { normalizeError, summarizeAgent } from "../helpers"

const { Text } = Typography

type ImportFormValues = {
  format: OpencodeAgentImportFormat
  agentId: string
  enabled: boolean
  content: string
}

type Props = {
  open: boolean
  t: AgentsTranslate
  onCancel: () => void
  onImported: (result: OpencodeAgentImportResult) => void
}

const INITIAL_VALUES: ImportFormValues = {
  format: "json",
  agentId: "",
  enabled: true,
  content: "",
}

function buildPreviewMessage(
  t: AgentsTranslate,
  preview: { createdCount: number; updatedCount: number } | null,
) {
  if (!preview) {
    return null
  }

  if (preview.updatedCount > 0) {
    return t("智能体页.导入OpenCode.提示.预检更新", {
      新建数: preview.createdCount,
      更新数: preview.updatedCount,
    })
  }

  return t("智能体页.导入OpenCode.提示.预检创建", {
    数量: preview.createdCount,
  })
}

export function OpencodeAgentImportModal(props: Props) {
  const { message } = AntdApp.useApp()
  const { onCancel, onImported, open, t } = props
  const [form] = Form.useForm<ImportFormValues>()
  const format = Form.useWatch("format", form) ?? INITIAL_VALUES.format
  const [preview, setPreview] = useState<{
    items: AgentItem[]
    createdCount: number
    updatedCount: number
  } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    form.setFieldsValue(INITIAL_VALUES)
    setPreview(null)
  }, [form, open])

  const previewMessage = useMemo(() => buildPreviewMessage(t, preview), [preview, t])

  const handlePreview = async () => {
    try {
      const values = await form.validateFields()
      if (!values.content.trim()) {
        throw new Error(t("智能体页.校验.OpenCode导入内容必填"))
      }

      setPreviewing(true)
      const nextPreview = await previewDesktopAgentImport({
        format: values.format,
        agentId: values.agentId.trim() || undefined,
        enabled: values.enabled,
        content: values.content,
      })
      setPreview({
        items: nextPreview.items,
        createdCount: nextPreview.createdCount,
        updatedCount: nextPreview.updatedCount,
      })
    } catch (error) {
      if (typeof error === "object" && error && "errorFields" in error) {
        return
      }
      message.error(`${t("智能体页.反馈.导入OpenCode预检失败")}: ${normalizeError(error)}`)
    } finally {
      setPreviewing(false)
    }
  }

  const handleImport = async () => {
    try {
      const values = await form.validateFields()
      if (!values.content.trim()) {
        throw new Error(t("智能体页.校验.OpenCode导入内容必填"))
      }

      setImporting(true)
      const result = await importDesktopAgents({
        format: values.format,
        agentId: values.agentId.trim() || undefined,
        enabled: values.enabled,
        content: values.content,
      })
      onImported(result)
    } catch (error) {
      if (typeof error === "object" && error && "errorFields" in error) {
        return
      }
      message.error(`${t("智能体页.反馈.导入OpenCode失败")}: ${normalizeError(error)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t("智能体页.弹窗.标题.导入OpenCode")}
      okText={t("智能体页.按钮.确认导入OpenCode")}
      cancelText={t("智能体页.按钮.取消")}
      okButtonProps={{ loading: importing, disabled: previewing }}
      maskClosable={false}
      destroyOnHidden
      width="min(92vw, 980px)"
      onCancel={() => {
        if (previewing || importing) {
          return
        }
        onCancel()
      }}
      onOk={() => {
        void handleImport()
      }}
    >
      <div className="agents-page-import-modal">
        <Form
          form={form}
          layout="vertical"
          initialValues={INITIAL_VALUES}
          className="agents-page-import-form"
        >
          <div className="agents-page-import-grid">
            <Form.Item label={t("智能体页.字段.导入格式")} name="format">
              <Select
                options={[
                  { value: "json", label: "JSON" },
                  { value: "markdown", label: "Markdown" },
                ]}
              />
            </Form.Item>

            <Form.Item shouldUpdate={(prev, next) => prev.format !== next.format} noStyle>
              {() => {
                const currentFormat = form.getFieldValue("format") as OpencodeAgentImportFormat
                return (
                  <Form.Item
                    label={t("智能体页.字段.agentId")}
                    name="agentId"
                    extra={
                      currentFormat === "markdown"
                        ? t("智能体页.提示.OpenCodeAgentId说明")
                        : undefined
                    }
                    rules={currentFormat === "markdown"
                      ? [
                          {
                            required: true,
                            message: t("智能体页.校验.OpenCodeMarkdownAgentId必填"),
                          },
                        ]
                      : undefined}
                  >
                    <Input
                      name="opencode-agent-id"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={t("智能体页.输入.OpenCodeAgentId占位")}
                    />
                  </Form.Item>
                )
              }}
            </Form.Item>
          </div>

          <Form.Item
            label={t("智能体页.字段.导入内容")}
            name="content"
            extra={t("智能体页.提示.导入OpenCode说明")}
            rules={[{ required: true, message: t("智能体页.校验.OpenCode导入内容必填") }]}
          >
            <Input.TextArea
              name="opencode-content"
              rows={12}
              autoComplete="off"
              spellCheck={false}
              placeholder={format === "markdown"
                ? t("智能体页.输入.OpenCodeMarkdown占位")
                : t("智能体页.输入.OpenCodeJson占位")}
            />
          </Form.Item>

          <Form.Item
            label={t("智能体页.字段.导入后启用")}
            name="enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </Form>

        <div className="agents-page-import-actions">
          <button
            type="button"
            className="agents-page-secondary-action"
            disabled={previewing || importing}
            onClick={() => {
              void handlePreview()
            }}
          >
            {t("智能体页.按钮.预检OpenCode")}
          </button>
        </div>

        {previewMessage ? <Alert type="info" showIcon message={previewMessage} /> : null}

        {preview ? (
          <List
            size="small"
            className="agents-page-import-preview-list"
            dataSource={preview.items}
            renderItem={(item) => (
              <List.Item>
                <div className="agents-page-import-preview-item">
                  <div className="agents-page-import-preview-head">
                    <Text strong>{item.name}</Text>
                    <Text code>{item.agentId}</Text>
                  </div>
                  <div className="agents-page-import-preview-summary">
                    {summarizeAgent(item, t)}
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : null}
      </div>
    </Modal>
  )
}

export default OpencodeAgentImportModal