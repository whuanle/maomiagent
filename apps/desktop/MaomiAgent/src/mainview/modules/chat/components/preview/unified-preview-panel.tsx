import { Empty, Spin } from "antd";
import { useEffect, useState } from "react";

import type { LanguageCode } from "../../../../config/titlebar";
import type { ChatAttachedTabState } from "../../../chat/types";

type ConversationPreviewRouterComponent =
  typeof import("./preview-router").ConversationPreviewRouter;

type Props = {
  language: LanguageCode;
  preview: ChatAttachedTabState;
};

export function UnifiedPreviewPanel(props: Props) {
  const [LoadedPreviewRouter, setLoadedPreviewRouter] =
    useState<null | ConversationPreviewRouterComponent>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void import("./preview-router").then((module) => {
      if (cancelled) {
        return;
      }

      setLoadedPreviewRouter(() => module.ConversationPreviewRouter);
      setLoadError("");
    }).catch((error) => {
      if (cancelled) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div className="chat-module-panel-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={props.language === "en-US"
            ? `Failed to load preview: ${loadError}`
            : `加载预览失败：${loadError}`}
        />
      </div>
    );
  }

  if (!LoadedPreviewRouter) {
    return (
      <div className="chat-module-panel-empty">
        <Spin size="small" />
      </div>
    );
  }

  return <LoadedPreviewRouter preview={props.preview} />;
}