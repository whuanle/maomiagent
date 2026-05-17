import { Alert } from "antd";
import { MindMapViewer, type MindMapViewerRef } from "@xiangfa/mindmap/viewer";
import { useEffect, useMemo, useRef } from "react";
import "@xiangfa/mindmap/style.css";

import type { LanguageCode } from "../../../../config/titlebar";
import { buildConversationMindmapPreviewData } from "../../../../lib/conversation-mindmap-preview";

type Props = {
  language: LanguageCode;
  sourceText: string;
};

export function ConversationMindmapPreview(props: Props) {
  const isEn = props.language === "en-US";
  const viewerRef = useRef<MindMapViewerRef | null>(null);
  const previewResult = useMemo(
    () => buildConversationMindmapPreviewData(props.sourceText),
    [props.sourceText],
  );

  useEffect(() => {
    if (!previewResult.ok || typeof window === "undefined") {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      viewerRef.current?.fitView();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [previewResult, props.sourceText]);

  if (!previewResult.ok) {
    return (
      <div className="conversation-code-preview-surface-empty conversation-mindmap-preview-error">
        <Alert
          type="warning"
          showIcon
          message={isEn ? "Mindmap preview is unavailable" : "当前无法生成脑图预览"}
          description={previewResult.error}
        />
      </div>
    );
  }

  const ariaLabel = isEn
    ? `Mindmap preview for ${previewResult.data.text}`
    : `${previewResult.data.text} 脑图预览`;

  return (
    <div className="conversation-code-preview-surface-diagram conversation-code-preview-surface-mindmap">
      <div className="conversation-mindmap-preview-host" role="img" aria-label={ariaLabel}>
        <MindMapViewer
          key={props.sourceText}
          ref={viewerRef}
          data={previewResult.data}
          defaultDirection="both"
          theme="light"
          locale={isEn ? "en-US" : "zh-CN"}
          toolbar={false}
        />
      </div>
    </div>
  );
}

export default ConversationMindmapPreview;