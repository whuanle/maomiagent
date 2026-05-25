import type { FeishuDocIR } from "../../../../shared/desktop-feishu-doc-ir"
import type { FeishuTranslate as Translate } from "../types"
import { FeishuDocsLocalPreview } from "./feishu-docs-local-preview"

export function FeishuDocVisualEditor(props: {
  ir: FeishuDocIR
  mdx: string
  t?: Translate
  mediaPreviewUrls?: Record<string, string>
  mediaPreviewErrors?: Record<string, string>
  whiteboardPreviewUrls?: Record<string, string>
  whiteboardPreviewFocusRects?: Record<string, { left: number; top: number; width: number; height: number }>
  whiteboardPreviewErrors?: Record<string, string>
  onChange: (mdx: string) => void
}) {
  void props.ir
  void props.onChange
  return (
    <div data-testid="feishu-doc-visual-editor" className="feishu-doc-visual-editor">
      <FeishuDocsLocalPreview
        markdown={props.mdx}
        t={props.t}
        mediaPreviewUrls={props.mediaPreviewUrls}
        mediaPreviewErrors={props.mediaPreviewErrors}
        whiteboardPreviewUrls={props.whiteboardPreviewUrls}
        whiteboardPreviewFocusRects={props.whiteboardPreviewFocusRects}
        whiteboardPreviewErrors={props.whiteboardPreviewErrors}
      />
    </div>
  )
}