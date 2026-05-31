import { GlobalOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { createElement, useEffect, useRef } from "react";

import type { DesktopBrowserTabState } from "../../../../shared/desktop-browser";
import {
  resolveBrowserHost,
  type BrowserShellCopy,
} from "./browser-shell-copy";

type DesktopBrowserWebviewElement = HTMLElement & {
  loadURL: (url: string) => void;
  executeJavascript?: (js: string) => void;
  on?: (event: string, listener: (event: CustomEvent<unknown>) => void) => void;
  off?: (event: string, listener: (event: CustomEvent<unknown>) => void) => void;
  toggleHidden?: (hidden?: boolean) => void;
  syncDimensions?: (force?: boolean) => void;
};

const BLANK_WEBVIEW_URL = "about:blank";
const SAME_TAB_LINK_PATCH_SCRIPT = `(() => {
  const runtime = window;
  if (runtime.__maomiBrowserSameTabPatchInstalled) {
    return;
  }

  runtime.__maomiBrowserSameTabPatchInstalled = true;

  const normalizeUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    try {
      return new URL(value, window.location.href).toString();
    } catch {
      return value;
    }
  };

  const rewriteAnchors = () => {
    document.querySelectorAll("a[target='_blank']").forEach((anchor) => {
      anchor.setAttribute("target", "_self");
    });
  };

  rewriteAnchors();

  const observer = new MutationObserver(() => {
    rewriteAnchors();
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["target"],
  });

  const originalOpen = window.open.bind(window);
  window.open = (url, target, features) => {
    const nextUrl = normalizeUrl(typeof url === "string" ? url : String(url ?? ""));
    if (nextUrl) {
      window.location.assign(nextUrl);
      return window;
    }

    return originalOpen(url, target, features);
  };
})();`;

type BrowserWebviewSurfaceProps = {
  active: boolean;
  copy: BrowserShellCopy;
  tab: DesktopBrowserTabState | null;
  syncing: boolean;
  onPageNavigate?: (url: string) => void;
};

function resolveEventUrl(detail: unknown): string | null {
  if (typeof detail === "string") {
    const value = detail.trim();
    return value || null;
  }

  if (detail && typeof detail === "object" && "url" in detail) {
    const value = detail.url;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || null;
    }
  }

  return null;
}

export function BrowserWebviewSurface(props: BrowserWebviewSurfaceProps) {
  const webviewRef = useRef<DesktopBrowserWebviewElement | null>(null);
  const loadedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    const shouldHide = !props.active;
    webview.toggleHidden?.(shouldHide);
    if (shouldHide) {
      return;
    }

    const nextUrl = props.tab?.url?.trim() || BLANK_WEBVIEW_URL;
    if (loadedUrlRef.current === nextUrl) {
      webview.syncDimensions?.(true);
      return;
    }

    loadedUrlRef.current = nextUrl;
    webview.loadURL(nextUrl);
    webview.syncDimensions?.(true);
  }, [props.active, props.tab?.id, props.tab?.url]);

  useEffect(() => {
    return () => {
      webviewRef.current?.toggleHidden?.(true);
    };
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview?.on) {
      return;
    }

    const handleUrlEvent = (event: CustomEvent<unknown>) => {
      const nextUrl = resolveEventUrl(event.detail);
      if (!nextUrl) {
        return;
      }

      loadedUrlRef.current = nextUrl;
      props.onPageNavigate?.(nextUrl);
    };

    const handleDomReady = () => {
      webview.executeJavascript?.(SAME_TAB_LINK_PATCH_SCRIPT);
      webview.syncDimensions?.(true);
    };

    webview.on("did-navigate", handleUrlEvent);
    webview.on("did-navigate-in-page", handleUrlEvent);
    webview.on("did-commit-navigation", handleUrlEvent);
    webview.on("new-window-open", handleUrlEvent);
    webview.on("dom-ready", handleDomReady);

    return () => {
      webview.off?.("did-navigate", handleUrlEvent);
      webview.off?.("did-navigate-in-page", handleUrlEvent);
      webview.off?.("did-commit-navigation", handleUrlEvent);
      webview.off?.("new-window-open", handleUrlEvent);
      webview.off?.("dom-ready", handleDomReady);
    };
  }, [props.onPageNavigate, props.tab?.id]);

  if (!props.tab) {
    return (
      <section className="browser-webview-surface browser-webview-surface-empty">
        {props.syncing ? (
          <Spin tip={props.copy.loading} />
        ) : (
          <div className="browser-webview-window browser-webview-window-blank">
            <div className="browser-webview-canvas browser-webview-canvas-blank">
              <div className="browser-webview-empty-state">
                <GlobalOutlined className="browser-webview-empty-icon" />
                <div className="browser-webview-empty-title">{props.copy.startBrowsing}</div>
                <div className="browser-webview-empty-description">{props.copy.openPageHint}</div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  const pageUrl = props.tab.url || props.tab.draftUrl || props.copy.blankPage;
  const hasLivePage = Boolean(props.tab.url);
  const emptyDescription = pageUrl === props.copy.blankPage
    ? props.copy.openPageHint
    : resolveBrowserHost(pageUrl) || pageUrl;

  return (
    <section className="browser-webview-surface">
      <div className="browser-webview-window">
        <div className="browser-webview-canvas browser-webview-canvas-live">
          {createElement("electrobun-webview", {
            ref: webviewRef,
            className: `browser-webview-frame${hasLivePage ? "" : " browser-webview-frame-blank"}`,
            src: props.tab.url || BLANK_WEBVIEW_URL,
            renderer: "cef",
            title: props.tab.title || pageUrl,
          })}
          {!hasLivePage ? (
            <div className="browser-webview-overlay">
              {props.tab.lastScreenshotResult?.dataUrl ? (
                <img
                  className="browser-webview-capture"
                  src={props.tab.lastScreenshotResult.dataUrl}
                  alt={props.tab.title || pageUrl}
                />
              ) : (
                <div className="browser-webview-empty-state">
                  <GlobalOutlined className="browser-webview-empty-icon" />
                  <div className="browser-webview-empty-title">{props.tab.title || props.copy.startBrowsing}</div>
                  <div className="browser-webview-empty-description">{emptyDescription}</div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
