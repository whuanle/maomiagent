import { CloseOutlined } from "@ant-design/icons";
import {
  Button,
  Empty,
  Input,
  Select,
  Segmented,
  Typography,
} from "antd";
import { useMemo, useState } from "react";

import type {
  DesktopBrowserInteractionRequest,
  DesktopBrowserTabState,
  DesktopBrowserToolPanel,
} from "../../../../shared/desktop-browser";
import {
  formatBrowserTime,
  type BrowserShellCopy,
} from "./browser-shell-copy";

type BrowserToolPanelProps = {
  copy: BrowserShellCopy;
  tab: DesktopBrowserTabState | null;
  panel: DesktopBrowserToolPanel;
  extracting: boolean;
  screenshotting: boolean;
  interacting: boolean;
  onSelectPanel: (panel: Exclude<DesktopBrowserToolPanel, "closed">) => void;
  onClose: () => void;
  onExtract: () => void;
  onScreenshot: () => void;
  onInteract: (request: DesktopBrowserInteractionRequest) => void;
};

type InteractionKind = DesktopBrowserInteractionRequest["kind"];

export function BrowserToolPanel(props: BrowserToolPanelProps) {
  const [interactionKind, setInteractionKind] = useState<InteractionKind>("click");
  const [selector, setSelector] = useState("");
  const [value, setValue] = useState("");
  const [scrollX, setScrollX] = useState("");
  const [scrollY, setScrollY] = useState("");
  const [timeoutMs, setTimeoutMs] = useState("");

  const segmentedValue = props.panel === "closed" ? "extract" : props.panel;

  const toolOptions = useMemo(() => {
    return [
      { label: props.copy.extract, value: "extract" },
      { label: props.copy.screenshot, value: "screenshot" },
      { label: props.copy.interact, value: "interact" },
    ] as const;
  }, [props.copy.extract, props.copy.interact, props.copy.screenshot]);

  const interactionOptions = useMemo(() => {
    return [
      { label: props.copy.click, value: "click" },
      { label: props.copy.type, value: "type" },
      { label: props.copy.scroll, value: "scroll" },
      { label: props.copy.wait, value: "wait" },
    ] as const;
  }, [props.copy.click, props.copy.scroll, props.copy.type, props.copy.wait]);

  const buildInteractionRequest = (): DesktopBrowserInteractionRequest => {
    if (interactionKind === "type") {
      return {
        kind: "type",
        selector,
        value,
      };
    }

    if (interactionKind === "scroll") {
      return {
        kind: "scroll",
        x: scrollX ? Number.parseInt(scrollX, 10) : undefined,
        y: scrollY ? Number.parseInt(scrollY, 10) : undefined,
      };
    }

    if (interactionKind === "wait") {
      return {
        kind: "wait",
        selector: selector || undefined,
        timeoutMs: timeoutMs ? Number.parseInt(timeoutMs, 10) : undefined,
      };
    }

    return {
      kind: "click",
      selector,
    };
  };

  const renderEmpty = (description: string) => (
    <div className="browser-tool-panel-empty">
      <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE} />
    </div>
  );

  return (
    <aside className={`browser-tool-panel${props.panel === "closed" ? "" : " browser-tool-panel-open"}`}>
      {props.panel === "closed" ? null : (
        <>
          <header className="browser-tool-panel-header">
            <Segmented
              block
              options={toolOptions as unknown as { label: string; value: string }[]}
              value={segmentedValue}
              onChange={(value) => props.onSelectPanel(value as Exclude<DesktopBrowserToolPanel, "closed">)}
            />
            <Button
              type="text"
              icon={<CloseOutlined />}
              aria-label={props.copy.closePanel}
              onClick={props.onClose}
            />
          </header>

          <div className="browser-tool-panel-body">
            {!props.tab ? (
              renderEmpty(props.copy.noTab)
            ) : props.panel === "extract" ? (
              <>
                <Button
                  type="primary"
                  loading={props.extracting}
                  onClick={props.onExtract}
                >
                  {props.copy.runExtract}
                </Button>
                {props.tab.lastExtractResult ? (
                  <div className="browser-tool-panel-result">
                    <div className="browser-tool-panel-result-meta">
                      <span>{props.tab.lastExtractResult.title || props.tab.title}</span>
                      <span>{formatBrowserTime(props.tab.lastExtractResult.capturedAt)}</span>
                    </div>
                    <Typography.Paragraph className="browser-tool-panel-result-text">
                      {props.tab.lastExtractResult.text || props.copy.noExtractResult}
                    </Typography.Paragraph>
                    {props.tab.lastExtractResult.links.length ? (
                      <div className="browser-tool-panel-links">
                        <div className="browser-tool-panel-links-title">{props.copy.links}</div>
                        {props.tab.lastExtractResult.links.slice(0, 4).map((link) => (
                          <div key={`${link.text}-${link.url}`} className="browser-tool-panel-link">
                            <span>{link.text || link.url}</span>
                            <span>{link.url}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : renderEmpty(props.copy.noExtractResult)}
              </>
            ) : props.panel === "screenshot" ? (
              <>
                <Button
                  type="primary"
                  loading={props.screenshotting}
                  onClick={props.onScreenshot}
                >
                  {props.copy.runScreenshot}
                </Button>
                {props.tab.lastScreenshotResult ? (
                  <div className="browser-tool-panel-result">
                    <div className="browser-tool-panel-result-meta">
                      <span>{props.copy.screenshot}</span>
                      <span>{formatBrowserTime(props.tab.lastScreenshotResult.capturedAt)}</span>
                    </div>
                    <img
                      className="browser-tool-panel-image"
                      src={props.tab.lastScreenshotResult.dataUrl}
                      alt={props.tab.title || props.copy.screenshot}
                    />
                  </div>
                ) : renderEmpty(props.copy.noScreenshotResult)}
              </>
            ) : (
              <>
                <div className="browser-tool-panel-form">
                  <Select
                    value={interactionKind}
                    options={interactionOptions as unknown as { label: string; value: string }[]}
                    onChange={(value) => setInteractionKind(value as InteractionKind)}
                  />
                  {(interactionKind === "click" || interactionKind === "type" || interactionKind === "wait") ? (
                    <Input
                      placeholder={interactionKind === "wait"
                        ? `${props.copy.selector} (${props.copy.waitOptional})`
                        : props.copy.selector}
                      value={selector}
                      onChange={(event) => setSelector(event.target.value)}
                    />
                  ) : null}
                  {interactionKind === "type" ? (
                    <Input
                      placeholder={props.copy.value}
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                    />
                  ) : null}
                  {interactionKind === "scroll" ? (
                    <div className="browser-tool-panel-grid">
                      <Input
                        placeholder={props.copy.scrollX}
                        value={scrollX}
                        onChange={(event) => setScrollX(event.target.value)}
                      />
                      <Input
                        placeholder={props.copy.scrollY}
                        value={scrollY}
                        onChange={(event) => setScrollY(event.target.value)}
                      />
                    </div>
                  ) : null}
                  {interactionKind === "wait" ? (
                    <Input
                      placeholder={props.copy.timeoutMs}
                      value={timeoutMs}
                      onChange={(event) => setTimeoutMs(event.target.value)}
                    />
                  ) : null}
                </div>
                <Button
                  type="primary"
                  loading={props.interacting}
                  onClick={() => props.onInteract(buildInteractionRequest())}
                >
                  {props.copy.runInteract}
                </Button>
                {props.tab.lastInteractionResult ? (
                  <div className="browser-tool-panel-result">
                    <div className="browser-tool-panel-result-meta">
                      <span>{props.copy.interact}</span>
                      <span>{formatBrowserTime(props.tab.lastInteractionResult.capturedAt)}</span>
                    </div>
                    <Typography.Paragraph className="browser-tool-panel-result-text">
                      {props.tab.lastInteractionResult.message}
                    </Typography.Paragraph>
                  </div>
                ) : renderEmpty(props.copy.noInteractionResult)}
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
