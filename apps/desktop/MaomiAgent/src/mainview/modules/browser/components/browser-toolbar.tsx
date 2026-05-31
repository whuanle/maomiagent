import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Button, Input } from "antd";
import type { KeyboardEvent } from "react";

import type { BrowserShellCopy } from "./browser-shell-copy";

type BrowserToolbarProps = {
  copy: BrowserShellCopy;
  addressValue: string;
  canGoBack: boolean;
  canGoForward: boolean;
  hasActiveTab: boolean;
  refreshing: boolean;
  onAddressChange: (value: string) => void;
  onNavigate: () => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
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
          type="text"
          icon={<ArrowLeftOutlined />}
          disabled={disabled || !props.canGoBack}
          aria-label={props.copy.back}
          onClick={props.onBack}
        />
        <Button
          type="text"
          icon={<ArrowRightOutlined />}
          disabled={disabled || !props.canGoForward}
          aria-label={props.copy.forward}
          onClick={props.onForward}
        />
        <Button
          type="text"
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
    </div>
  );
}
