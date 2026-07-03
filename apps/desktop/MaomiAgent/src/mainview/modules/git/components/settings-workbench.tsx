import { Tabs } from "antd";

import type { GitPageCopy } from "../i18n";
import type { GitSettingsCopy } from "../settings-copy";
import { GitSettingsGitignoreTab } from "./settings-gitignore-tab";
import { GitSettingsGlobalTab } from "./settings-global-tab";
import { GitSettingsRepositoryTab } from "./settings-repository-tab";

type Props = {
  workspaceId: string;
  copy: GitPageCopy;
  settingsCopy: GitSettingsCopy;
};

export function GitSettingsWorkbench(props: Props) {
  return (
    <div className="git-page-panel-shell">
      <Tabs
        className="git-page-settings-tabs"
        items={[
          {
            key: "global",
            label: props.settingsCopy.globalTab,
            children: (
              <GitSettingsGlobalTab
                workspaceId={props.workspaceId}
                copy={props.settingsCopy}
              />
            ),
          },
          {
            key: "repository",
            label: props.settingsCopy.repositoryTab,
            children: (
              <GitSettingsRepositoryTab
                workspaceId={props.workspaceId}
                pageCopy={props.copy}
                copy={props.settingsCopy}
              />
            ),
          },
          {
            key: "gitignore",
            label: props.settingsCopy.gitignoreTab,
            children: (
              <GitSettingsGitignoreTab
                workspaceId={props.workspaceId}
                pageCopy={props.copy}
                copy={props.settingsCopy}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
