import {
  App as AntdApp,
  Button,
  Form,
  Input,
  Select,
  Spin,
} from "antd";
import { useEffect, useMemo, useState } from "react";

import type { DesktopGitGlobalSettings } from "../../../../shared/desktop-git";
import {
  getDesktopGitSettings,
  saveDesktopGitSettings,
} from "../../../lib/desktop-git";
import type { GitSettingsCopy } from "../settings-copy";

type Props = {
  workspaceId: string;
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
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function toGlobalSettings(values: FormValue): DesktopGitGlobalSettings {
  return {
    userName: values.userName,
    userEmail: values.userEmail,
    defaultBranch: values.defaultBranch,
    autocrlf: values.autocrlf,
    pullRebase: values.pullRebase,
    pushDefault: values.pushDefault,
    fetchPrune: values.fetchPrune,
  };
}

export function GitSettingsGlobalTab(props: Props) {
  const { message } = AntdApp.useApp();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  async function loadGlobalSettings() {
    setLoading(true);
    try {
      const result = await getDesktopGitSettings(props.workspaceId);
      form.setFieldsValue({
        userName: result.global.userName,
        userEmail: result.global.userEmail,
        defaultBranch: result.global.defaultBranch,
        autocrlf: result.global.autocrlf,
        pullRebase: result.global.pullRebase,
        pushDefault: result.global.pushDefault,
        fetchPrune: result.global.fetchPrune,
      });
    } catch (error) {
      message.error(`${props.copy.loadFailed}: ${normalizeError(error)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGlobalSettings();
  }, [props.workspaceId]);

  async function saveGlobalSettings() {
    setSaving(true);
    try {
      const values = await form.validateFields();
      const result = await saveDesktopGitSettings(props.workspaceId, {
        global: toGlobalSettings(values),
      });
      message.success(result.message);
      await loadGlobalSettings();
    } catch (error) {
      message.error(`${props.copy.saveFailed}: ${normalizeError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="git-page-settings-body">
      <div className="git-page-settings-section-header">
        <div className="git-page-settings-section-title">{props.copy.sectionGlobal}</div>
        <div className="git-page-settings-section-description">{props.copy.sectionGlobalDescription}</div>
      </div>
      <div className="git-page-toolbar git-page-settings-toolbar">
        <Button onClick={() => void loadGlobalSettings()} disabled={loading || saving}>{props.copy.reloadButton}</Button>
        <Button type="primary" onClick={() => void saveGlobalSettings()} loading={saving}>{props.copy.saveButton}</Button>
      </div>
      {loading ? (
        <div className="git-page-empty"><Spin /></div>
      ) : (
        <Form form={form} layout="vertical" autoComplete="off" className="git-page-settings-form">
          <Form.Item label={props.copy.userName} name="userName">
            <Input allowClear />
          </Form.Item>
          <Form.Item label={props.copy.userEmail} name="userEmail">
            <Input allowClear />
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
