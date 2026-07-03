import {
  App as AntdApp,
  Button,
  Empty,
  Spin,
} from "antd";
import { useEffect, useState } from "react";

import { resolveConversationCodeBlockMonacoLanguage } from "../../../lib/conversation-code-block-preview";
import {
  getDesktopGitIgnore,
  saveDesktopGitIgnore,
} from "../../../lib/desktop-git";
import { PreviewPanelSourceEditor } from "../../chat/components/code-preview/preview-panel-shared";
import type { GitPageCopy } from "../i18n";
import type { GitSettingsCopy } from "../settings-copy";

type Props = {
  workspaceId: string;
  pageCopy: GitPageCopy;
  copy: GitSettingsCopy;
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function GitSettingsGitignoreTab(props: Props) {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [content, setContent] = useState("");

  async function loadGitIgnore() {
    setLoading(true);
    try {
      const result = await getDesktopGitIgnore(props.workspaceId);
      setIsGitRepo(result.isGitRepo);
      setContent(result.content);
    } catch (error) {
      message.error(`${props.copy.gitIgnoreLoadFailed}: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGitIgnore();
  }, [props.workspaceId]);

  async function saveGitIgnore() {
    setSaving(true);
    try {
      const result = await saveDesktopGitIgnore(props.workspaceId, { content });
      message.success(result.message || props.copy.gitIgnoreSavedNotice);
      await loadGitIgnore();
    } catch (error) {
      message.error(`${props.pageCopy.saveFailed}: ${normalizeError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="git-page-settings-body">
      <div className="git-page-settings-section-header">
        <div className="git-page-settings-section-title">{props.copy.sectionGitignore}</div>
        <div className="git-page-settings-section-description">{props.copy.sectionGitignoreDescription}</div>
      </div>
      <div className="git-page-toolbar git-page-settings-toolbar">
        <Button onClick={() => void loadGitIgnore()} disabled={loading || saving}>{props.copy.reloadButton}</Button>
        <Button type="primary" onClick={() => void saveGitIgnore()} loading={saving} disabled={!isGitRepo}>{props.copy.saveButton}</Button>
      </div>
      {loading ? (
        <div className="git-page-empty"><Spin /></div>
      ) : !isGitRepo ? (
        <div className="git-page-empty"><Empty description={props.pageCopy.emptyNotGitRepo} /></div>
      ) : (
        <div className="git-page-gitignore-editor">
          <PreviewPanelSourceEditor
            path=".gitignore"
            content={content}
            monacoLanguage={resolveConversationCodeBlockMonacoLanguage("shell")}
            readOnly={false}
            emptyDescription={props.pageCopy.gitIgnoreEditorPlaceholder}
            onChange={(value) => setContent(value)}
          />
        </div>
      )}
    </div>
  );
}
