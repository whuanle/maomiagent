import { Empty } from "antd";
import { useEffect, useMemo, useState } from "react";

import type { DesktopGitChangesResult } from "../../../../shared/desktop-git";
import type { LanguageCode } from "../../../config/titlebar";
import {
  DESKTOP_GIT_BRIDGE_READY_EVENT,
  hasDesktopGitBridge,
} from "../../../lib/desktop-git";
import { GitChangesWorkbench } from "../../git/components/changes-workbench";
import { openGitRouteWithReview } from "../../git/git-page-ui-state";
import { createGitTranslator } from "../../git/i18n";
import "../../git/page.css";

type Props = {
  active: boolean;
  language: LanguageCode;
  workspaceId?: string;
  changes: DesktopGitChangesResult | null;
  loading: boolean;
  activeFilePath?: string;
  onSelectFile?: (path: string) => void;
  onRefresh: () => Promise<void>;
};

export function ConversationGitTab(props: Props) {
  const copy = useMemo(() => createGitTranslator(props.language), [props.language]);
  const [bridgeReady, setBridgeReady] = useState(() => hasDesktopGitBridge());

  useEffect(() => {
    const syncBridgeState = () => {
      setBridgeReady(hasDesktopGitBridge());
    };

    syncBridgeState();
    window.addEventListener(DESKTOP_GIT_BRIDGE_READY_EVENT, syncBridgeState);
    return () => window.removeEventListener(DESKTOP_GIT_BRIDGE_READY_EVENT, syncBridgeState);
  }, []);

  if (!bridgeReady) {
    return (
      <div className="git-page git-page-empty">
        <Empty description={copy.emptyNoBridge} />
      </div>
    );
  }

  if (!props.workspaceId) {
    return (
      <div className="git-page git-page-empty">
        <Empty description={copy.emptyNoWorkspace} />
      </div>
    );
  }

  const workspaceId = props.workspaceId;

  return (
    <div className="git-page-panel-shell">
      <div className="git-page-changes-shell">
        <GitChangesWorkbench
          language={props.language}
          workspaceId={workspaceId}
          copy={copy}
          changes={props.changes}
          loading={props.loading}
          selectedReviewFilePath={props.activeFilePath}
          hideInlineReview
          onRefresh={() => props.onRefresh()}
          onSelectedReviewFilePathChange={(path) => {
            if (!path) {
              return;
            }

            props.onSelectFile?.(path);
          }}
          onOpenReview={(path) => {
            props.onSelectFile?.(path);
            openGitRouteWithReview({
              workspaceId,
              path,
            });
          }}
        />
      </div>
    </div>
  );
}