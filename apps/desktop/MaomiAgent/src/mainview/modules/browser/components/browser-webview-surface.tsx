import { GlobalOutlined } from "@ant-design/icons";
import { Button, Spin } from "antd";

import type { DesktopBrowserTabState, DesktopBrowserToolPanel } from "../../../../shared/desktop-browser";
import {
  resolveBrowserHost,
  type BrowserShellCopy,
} from "./browser-shell-copy";

type BrowserWebviewSurfaceProps = {
  copy: BrowserShellCopy;
  tab: DesktopBrowserTabState | null;
  syncing: boolean;
  toolPanel: DesktopBrowserToolPanel;
  onCreateTab: () => void;
};

export function BrowserWebviewSurface(props: BrowserWebviewSurfaceProps) {
  if (!props.tab) {
    return (
      <section className="browser-webview-surface browser-webview-surface-empty">
        {props.syncing ? (
          <Spin tip={props.copy.loading} />
        ) : (
          <div className="browser-webview-empty-card">
            <div className="browser-webview-empty-title">{props.copy.noTab}</div>
            <Button type="primary" onClick={props.onCreateTab}>
              {props.copy.newTab}
            </Button>
          </div>
        )}
      </section>
    );
  }

  const pageUrl = props.tab.url || props.tab.draftUrl || props.copy.blankPage;
  const pageHost = resolveBrowserHost(pageUrl) || props.copy.blankPage;
  const previewText = props.tab.lastExtractResult?.text.trim().slice(0, 280) ?? "";

  return (
    <section className="browser-webview-surface">
      <div className="browser-webview-window">
        <header className="browser-webview-header">
          <div className="browser-webview-header-dots" aria-hidden="true">
            <span className="browser-webview-header-dot" />
            <span className="browser-webview-header-dot" />
            <span className="browser-webview-header-dot" />
          </div>
          <div className="browser-webview-origin">{pageHost}</div>
          <div className="browser-webview-state">
            {props.syncing || props.tab.loading ? props.copy.loading : props.copy.ready}
          </div>
        </header>

        <div className="browser-webview-canvas">
          {props.tab.lastScreenshotResult?.dataUrl ? (
            <img
              className="browser-webview-capture"
              src={props.tab.lastScreenshotResult.dataUrl}
              alt={props.tab.title || pageHost}
            />
          ) : (
            <div className="browser-webview-placeholder">
              <GlobalOutlined className="browser-webview-placeholder-icon" />
              <div className="browser-webview-title">{props.tab.title || props.copy.newTab}</div>
              <div className="browser-webview-url">{pageUrl}</div>
            </div>
          )}

          {previewText ? (
            <div className="browser-webview-overlay">
              <div className="browser-webview-overlay-label">{props.copy.extract}</div>
              <div className="browser-webview-overlay-text">{previewText}</div>
            </div>
          ) : null}
        </div>

        <footer className="browser-webview-footer">
          <span className="browser-webview-chip">{pageUrl}</span>
          {props.tab.lastInteractionResult?.message ? (
            <span className="browser-webview-chip">{props.tab.lastInteractionResult.message}</span>
          ) : null}
          {props.toolPanel !== "closed" ? (
            <span className="browser-webview-chip browser-webview-chip-active">
              {props.toolPanel === "extract"
                ? props.copy.extract
                : props.toolPanel === "screenshot"
                  ? props.copy.screenshot
                  : props.copy.interact}
            </span>
          ) : null}
        </footer>
      </div>
    </section>
  );
}
