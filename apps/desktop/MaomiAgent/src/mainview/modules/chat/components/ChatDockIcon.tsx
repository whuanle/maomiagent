import type { LanguageCode } from "../../../config/titlebar";
import type { ChatWorkbenchDockKey } from "../types";

function renderIconPath(key: ChatWorkbenchDockKey) {
  if (key === "terminal") {
    return (
      <>
        <path d="M6.5 8L8.64286 10L6.5 12" stroke="currentColor" strokeLinecap="square" />
        <path d="M10.9286 12H13.5" stroke="currentColor" strokeLinecap="square" />
        <path d="M2 18H18V2H2V18Z" stroke="currentColor" strokeLinecap="square" />
      </>
    );
  }

  if (key === "settings") {
    return (
      <>
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" />
        <path d="M10 3.5V5.2" stroke="currentColor" strokeLinecap="square" />
        <path d="M10 14.8V16.5" stroke="currentColor" strokeLinecap="square" />
        <path d="M3.5 10H5.2" stroke="currentColor" strokeLinecap="square" />
        <path d="M14.8 10H16.5" stroke="currentColor" strokeLinecap="square" />
        <path d="M5.4 5.4L6.6 6.6" stroke="currentColor" strokeLinecap="square" />
        <path d="M13.4 13.4L14.6 14.6" stroke="currentColor" strokeLinecap="square" />
        <path d="M13.4 6.6L14.6 5.4" stroke="currentColor" strokeLinecap="square" />
        <path d="M5.4 14.6L6.6 13.4" stroke="currentColor" strokeLinecap="square" />
      </>
    );
  }

  if (key === "changes") {
    return (
      <>
        <path d="M4 16V4" stroke="currentColor" strokeLinecap="square" />
        <path d="M10 16V8" stroke="currentColor" strokeLinecap="square" />
        <path d="M16 16V6" stroke="currentColor" strokeLinecap="square" />
        <path d="M2 18H18" stroke="currentColor" strokeLinecap="square" />
      </>
    );
  }

  if (key === "files") {
    return (
      <>
        <path d="M18 18V5H9.5L7.5 2H2L2 18H5" stroke="currentColor" strokeLinecap="square" />
        <path d="M18 18H5" stroke="currentColor" strokeLinecap="square" />
        <path d="M18 18V8.5H5V18" stroke="currentColor" strokeLinecap="square" />
      </>
    );
  }

  if (key === "git") {
    return (
      <>
        <circle cx="5" cy="5" r="2" stroke="currentColor" />
        <circle cx="15" cy="3.5" r="2" stroke="currentColor" />
        <circle cx="15" cy="15.5" r="2" stroke="currentColor" />
        <path d="M7 5H9.5C11.433 5 13 3.433 13 1.5" stroke="currentColor" strokeLinecap="square" />
        <path d="M7 5H9.5C11.433 5 13 6.567 13 8.5V12" stroke="currentColor" strokeLinecap="square" />
      </>
    );
  }

  if (key === "secondary") {
    return (
      <>
        <path d="M3 5H17" stroke="currentColor" strokeLinecap="square" />
        <path d="M3 10H17" stroke="currentColor" strokeLinecap="square" />
        <path d="M3 15H17" stroke="currentColor" strokeLinecap="square" />
        <path d="M3 4H17V16H3V4Z" stroke="currentColor" />
      </>
    );
  }

  return (
    <>
      <path d="M7.86667 2H5.2H2V18H5.2H7.86667" stroke="currentColor" />
      <path d="M7.86667 2H18V18H7.86667" stroke="currentColor" />
      <path d="M7.86667 2V18" stroke="currentColor" />
    </>
  );
}

export function resolveWorkbenchDockTitle(language: LanguageCode, key: ChatWorkbenchDockKey) {
  if (language === "en-US") {
    if (key === "settings") return "Settings";
    if (key === "sidebar") return "Runtime panel";
    if (key === "terminal") return "WebShell";
    if (key === "files") return "Workspace files";
    if (key === "changes") return "Code changes";
    if (key === "git") return "Git";
    return "Secondary panel";
  }

  if (key === "settings") return "设置";
  if (key === "sidebar") return "运行检查面板";
  if (key === "terminal") return "WebShell";
  if (key === "files") return "工作区文件";
  if (key === "changes") return "代码改动";
  if (key === "git") return "Git";
  return "副栏";
}

export function ChatDockIcon(props: { dockKey: ChatWorkbenchDockKey }) {
  return (
    <svg
      className="chat-sidebar-dock-icon"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {renderIconPath(props.dockKey)}
    </svg>
  );
}