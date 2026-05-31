import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CameraOutlined,
  ControlOutlined,
  ReadOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Input } from "antd";
import type { KeyboardEvent } from "react";

import type { DesktopBrowserToolPanel } from "../../../../shared/desktop-browser";
import type { BrowserShellCopy } from "./browser-shell-copy";

type BrowserToolbarProps = {
  copy: BrowserShellCopy;
  addressValue: string;
  canGoBack: boolean;
  canGoForward: boolean;
  hasActiveTab: boolean;
  toolPanel: DesktopBrowserToolPanel;
  refreshing: boolean;
  onAddressChange: (value: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onSelectTool: (toolPanel: Exclude<DesktopBrowserToolPanel, "closed">) => void;
};

export function BrowserToolbar(props: BrowserToolbarProps) {
  const disabled = !props.hasActiveTab;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      props.onNavigate();
    }
  };

  return (
    <div className="browser-toolbar">
      <div className="browser-toolbar-nav">
        <Button
          icon={<ArrowLeftOutlined />}
          disabled={disabled || !props.canGoBack}
          aria-label={props.copy.back}
          onClick={props.onBack}
        />
        <Button
          icon={<ArrowRightOutlined />}
          disabled={disabled || !props.canGoForward}
          aria-label={props.copy.forward}
          onClick={props.onForward}
        />
        <Button
          icon={<ReloadOutlined />}
          disabled={disabled}
          loading={props.refreshing}
          aria-label={props.copy.refresh}
          onClick={props.onRefresh}
        />
      </div>

      <Input
        aria-label={props.copy.addressLabel}
        className="browser-toolbar-address"
        disabled={disabled}
        placeholder={props.copy.addressPlaceholder}
        value={props.addressValue}
        onChange={(event) => props.onAddressChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="browser-toolbar-tools">
        <Button
          className={props.toolPanel === "extract" ? "browser-toolbar-tool-active" : undefined}
          disabled={disabled}
          icon={<ReadOutlined />}
          onClick={() => props.onSelectTool("extract")}
        >
          {props.copy.extract}
        </Button>
        <Button
          className={props.toolPanel === "screenshot" ? "browser-toolbar-tool-active" : undefined}
          disabled={disabled}
          icon={<CameraOutlined />}
          onClick={() => props.onSelectTool("screenshot")}
        >
          {props.copy.screenshot}
        </Button>
        <Button
          className={props.toolPanel === "interact" ? "browser-toolbar-tool-active" : undefined}
          disabled={disabled}
          icon={<ControlOutlined />}
          onClick={() => props.onSelectTool("interact")}
        >
          {props.copy.interact}
        </Button>
      </div>
    </div>
  );
}
