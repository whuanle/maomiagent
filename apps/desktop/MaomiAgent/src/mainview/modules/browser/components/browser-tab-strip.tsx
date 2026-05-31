import { CloseOutlined, LoadingOutlined, PlusOutlined } from "@ant-design/icons";
import { Button } from "antd";

import type { DesktopBrowserTabState } from "../../../../shared/desktop-browser";
import type { BrowserShellCopy } from "./browser-shell-copy";

type BrowserTabStripProps = {
  copy: BrowserShellCopy;
  tabs: DesktopBrowserTabState[];
  activeTabId: string | null;
  creating: boolean;
  closingTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCreate: () => void;
};

export function BrowserTabStrip(props: BrowserTabStripProps) {
  return (
    <div className="browser-tab-strip" role="tablist" aria-label={props.copy.newTab}>
      <div className="browser-tab-strip-scroll">
        {props.tabs.map((tab) => {
          const active = tab.id === props.activeTabId;
          const displayUrl = tab.url || tab.draftUrl || props.copy.blankPage;

          return (
            <div
              key={tab.id}
              className={`browser-tab${active ? " browser-tab-active" : ""}`}
            >
              <button
                type="button"
                className="browser-tab-button"
                role="tab"
                aria-selected={active}
                onClick={() => props.onActivate(tab.id)}
              >
                <span className="browser-tab-leading">
                  {tab.loading
                    ? <LoadingOutlined className="browser-tab-loading" />
                    : <span className="browser-tab-dot" aria-hidden="true" />}
                </span>
                <span className="browser-tab-text">
                  <span className="browser-tab-title">{tab.title || props.copy.newTab}</span>
                  <span className="browser-tab-url">{displayUrl}</span>
                </span>
              </button>
              <button
                type="button"
                className="browser-tab-close"
                aria-label={`${props.copy.closeTab} ${tab.title || props.copy.newTab}`}
                disabled={props.closingTabId === tab.id}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onClose(tab.id);
                }}
              >
                <CloseOutlined />
              </button>
            </div>
          );
        })}
      </div>

      <Button
        className="browser-tab-add"
        icon={<PlusOutlined />}
        loading={props.creating}
        onClick={props.onCreate}
      >
        {props.copy.newTab}
      </Button>
    </div>
  );
}
