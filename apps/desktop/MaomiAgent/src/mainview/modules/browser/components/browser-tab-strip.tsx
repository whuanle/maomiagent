import { CloseOutlined, LoadingOutlined, PlusOutlined } from "@ant-design/icons";
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
                    : null}
                </span>
                <span className="browser-tab-title">{tab.title || props.copy.newTab}</span>
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

        <button
          type="button"
          className="browser-tab-add-icon"
          aria-label={props.copy.newTab}
          disabled={props.creating}
          onClick={props.onCreate}
        >
          {props.creating ? <LoadingOutlined /> : <PlusOutlined />}
        </button>
      </div>
    </div>
  );
}
