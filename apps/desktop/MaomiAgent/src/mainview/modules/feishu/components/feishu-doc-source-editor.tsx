import { Alert, Input } from "antd"

const { TextArea } = Input

export function FeishuDocSourceEditor(props: {
  value: string
  error: string
  readOnly?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div data-testid="feishu-doc-source-editor" className="feishu-doc-source-editor">
      {props.error ? <Alert showIcon type="error" message={props.error} /> : null}
      <TextArea
        className="feishu-docs-editor-textarea"
        value={props.value}
        readOnly={props.readOnly}
        spellCheck={false}
        autoSize={false}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
}