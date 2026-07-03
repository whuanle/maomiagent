import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Empty,
  Form,
  Input,
  Select,
  Spin,
} from "antd";
import { useEffect, useMemo, useState } from "react";

import type { DesktopGitRepositorySettings } from "../../../../shared/desktop-git";
import {
  getDesktopGitSettings,
  saveDesktopGitSettings,
} from "../../../lib/desktop-git";
import type { GitPageCopy } from "../i18n";
import type { GitSettingsCopy } from "../settings-copy";

type Props = {
  workspaceId: string;
  pageCopy: GitPageCopy;
  copy: GitSettingsCopy;
};

type FormValue = {
  userName?: string;
  userEmail?: string;
  defaultBranch?: string;
  autocrlf?: string;
  pullRebase?: string;
  pushDefault?: string;
  fetchPrune?: string;
  remotes?: Array<{
    name?: string;
    url?: string;
  }>;
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function toRepositorySettings(values: FormValue): DesktopGitRepositorySettings {
  return {
    userName: values.userName,
    userEmail: values.userEmail,
    defaultBranch: values.defaultBranch,
    autocrlf: values.autocrlf,
    pullRebase: values.pullRebase,
    pushDefault: values.pushDefault,
    fetchPrune: values.fetchPrune,
    remotes: (values.remotes ?? [])
      .map((item) => ({
        name: item.name?.trim() ?? "",
        url: item.url?.trim() ?? "",
      }))
      .filter((item) => item.name && item.url),
  };
}

export function GitSettingsRepositoryTab(props: Props) {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [form] = Form.useForm<FormValue>();

  const pullRebaseOptions = useMemo(() => [
    { label: "false", value: "false" },
    { label: "true", value: "true" },
    { label: "merges", value: "merges" },
    { label: "interactive", value: "interactive" },
  ], []);

  const pushDefaultOptions = useMemo(() => [
    { label: "simple", value: "simple" },
    { label: "current", value: "current" },
    { label: "upstream", value: "upstream" },
    { label: "matching", value: "matching" },
    { label: "nothing", value: "nothing" },
  ], []);

  const fetchPruneOptions = useMemo(() => [
    { label: "false", value: "false" },
    { label: "true", value: "true" },
  ], []);

  const autocrlfOptions = useMemo(() => [
    { label: props.copy.autocrlfOptionFalse, value: "false" },
    { label: props.copy.autocrlfOptionTrue, value: "true" },
    { label: props.copy.autocrlfOptionInput, value: "input" },
  ], [props.copy.autocrlfOptionFalse, props.copy.autocrlfOptionInput, props.copy.autocrlfOptionTrue]);

  async function loadRepositorySettings() {
    setLoading(true);
    try {
      const result = await getDesktopGitSettings(props.workspaceId);
      setIsGitRepo(result.isGitRepo);
      form.setFieldsValue({
        userName: result.repository.userName,
        userEmail: result.repository.userEmail,
        defaultBranch: result.repository.defaultBranch,
        autocrlf: result.repository.autocrlf,
        pullRebase: result.repository.pullRebase,
        pushDefault: result.repository.pushDefault,
        fetchPrune: result.repository.fetchPrune,
        remotes: result.repository.remotes ?? (result.repository.originUrl
          ? [{ name: "origin", url: result.repository.originUrl }]
          : []),
      });
    } catch (error) {
      message.error(`${props.copy.loadFailed}: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRepositorySettings();
  }, [props.workspaceId]);

  async function saveRepositorySettings() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const result = await saveDesktopGitSettings(props.workspaceId, {
        repository: toRepositorySettings(values),
      });
      message.success(result.message);
      await loadRepositorySettings();
    } catch (error) {
      message.error(`${props.copy.saveFailed}: ${normalizeError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="git-page-settings-body">
      <div className="git-page-settings-section-header">
        <div className="git-page-settings-section-title">{props.copy.sectionRepository}</div>
        <div className="git-page-settings-section-description">{props.copy.sectionRepositoryDescription}</div>
      </div>
      <div className="git-page-toolbar git-page-settings-toolbar">
        <Button onClick={() => void loadRepositorySettings()} disabled={loading || saving}>{props.copy.reloadButton}</Button>
        <Button type="primary" onClick={() => void saveRepositorySettings()} loading={saving} disabled={!isGitRepo}>{props.copy.saveButton}</Button>
      </div>
      {loading ? (
        <div className="git-page-empty"><Spin /></div>
      ) : !isGitRepo ? (
        <div className="git-page-empty"><Empty description={props.pageCopy.emptyNotGitRepo} /></div>
      ) : (
        <Form form={form} layout="vertical" autoComplete="off" className="git-page-settings-form">
          <Form.Item label={props.copy.userName} name="userName">
            <Input allowClear />
          </Form.Item>
          <Form.Item label={props.copy.userEmail} name="userEmail">
            <Input allowClear />
          </Form.Item>
          <Form.Item label={props.copy.remotes} extra={<span className="git-page-settings-help">{props.copy.remotesHelp}</span>}>
            <Form.List name="remotes">
              {(fields, { add, remove }) => (
                <div className="git-page-settings-remote-list">
                  {fields.map((field) => (
                    <div key={field.key} className="git-page-settings-remote-row">
                      <Form.Item
                        className="git-page-settings-remote-name"
                        name={[field.name, "name"]}
                        rules={[
                          { required: true, message: props.copy.remoteName },
                          {
                            pattern: /^\S+$/,
                            message: props.copy.remoteName,
                          },
                        ]}
                      >
                        <Input allowClear placeholder={props.copy.remoteName} />
                      </Form.Item>
                      <Form.Item
                        className="git-page-settings-remote-url"
                        name={[field.name, "url"]}
                        rules={[{ required: true, message: props.copy.remoteUrl }]}
                      >
                        <Input allowClear placeholder={props.copy.remoteUrl} />
                      </Form.Item>
                      <Button
                        type="text"
                        className="git-page-settings-remote-remove"
                        aria-label={props.copy.removeRemoteButton}
                        onClick={() => remove(field.name)}
                        icon={<MinusCircleOutlined />}
                      />
                    </div>
                  ))}
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ name: "", url: "" })}>
                    {props.copy.addRemoteButton}
                  </Button>
                </div>
              )}
            </Form.List>
          </Form.Item>
          <Form.Item label={props.copy.defaultBranch} name="defaultBranch">
            <Input allowClear />
          </Form.Item>
          <div className="git-page-settings-grid-2">
            <Form.Item
              label={props.copy.autocrlf}
              name="autocrlf"
              className="git-page-settings-field"
              extra={<span className="git-page-settings-help">{props.copy.autocrlfHelp}</span>}
            >
              <Select allowClear options={autocrlfOptions} />
            </Form.Item>
            <Form.Item
              label={props.copy.pullRebase}
              name="pullRebase"
              className="git-page-settings-field"
              extra={<span className="git-page-settings-help">{props.copy.pullRebaseHelp}</span>}
            >
              <Select allowClear options={pullRebaseOptions} />
            </Form.Item>
          </div>
          <div className="git-page-settings-grid-2">
            <Form.Item
              label={props.copy.pushDefault}
              name="pushDefault"
              className="git-page-settings-field"
              extra={<span className="git-page-settings-help">{props.copy.pushDefaultHelp}</span>}
            >
              <Select allowClear options={pushDefaultOptions} />
            </Form.Item>
            <Form.Item
              label={props.copy.fetchPrune}
              name="fetchPrune"
              className="git-page-settings-field"
              extra={<span className="git-page-settings-help">{props.copy.fetchPruneHelp}</span>}
            >
              <Select allowClear options={fetchPruneOptions} />
            </Form.Item>
          </div>
        </Form>
      )}
    </div>
  );
}
