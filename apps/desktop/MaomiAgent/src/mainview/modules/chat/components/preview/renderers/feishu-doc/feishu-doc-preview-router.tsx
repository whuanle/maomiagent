import { Empty, Spin } from "antd";
import { useMemo } from "react";

import { FeishuDocVisualEditor } from "../../../../../feishu/components/feishu-doc-visual-editor";
import { createFeishuDocPreviewIR } from "../../../../../feishu/components/feishu-doc-preview-support";
import { useFeishuDocPreviewState } from "./feishu-doc-preview-state";

type Props = {
  workspaceId: string;
  docId: string;
  title: string;
  path: string;
};

const noop = () => {};

export function FeishuDocPreviewRouter(props: Props) {
  const preview = useFeishuDocPreviewState({
    workspaceId: props.workspaceId,
    path: props.path,
  });

  const previewIr = useMemo(() => createFeishuDocPreviewIR({
    docId: props.docId,
    title: props.title,
    markdown: preview.markdown,
  }), [preview.markdown, props.docId, props.title]);

  if (preview.loading) {
    return (
      <div className="chat-inspector-pane-loading">
        <Spin size="small" />
      </div>
    );
  }

  if (preview.error || !preview.result) {
    return (
      <div className="chat-inspector-pane-empty">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={preview.error || "无法读取飞书原文预览"} />
      </div>
    );
  }

  return (
    <FeishuDocVisualEditor
      ir={previewIr}
      mdx={preview.markdown}
      mediaPreviewUrls={preview.mediaPreviewUrls}
      mediaPreviewErrors={preview.mediaPreviewErrors}
      whiteboardPreviewUrls={preview.whiteboardPreviewUrls}
      whiteboardPreviewFocusRects={preview.whiteboardPreviewFocusRects}
      whiteboardPreviewErrors={preview.whiteboardPreviewErrors}
      onChange={noop}
    />
  );
}