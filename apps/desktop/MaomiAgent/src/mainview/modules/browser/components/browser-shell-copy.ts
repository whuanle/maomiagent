import type { LanguageCode } from "../../../config/titlebar";

export type BrowserShellCopy = {
  newTab: string;
  noTab: string;
  startBrowsing: string;
  openPageHint: string;
  blankPage: string;
  loading: string;
  ready: string;
  back: string;
  forward: string;
  refresh: string;
  addressPlaceholder: string;
  addressLabel: string;
  extract: string;
  screenshot: string;
  interact: string;
  closeTab: string;
  closePanel: string;
  loadFailed: string;
  actionFailed: string;
  runExtract: string;
  runScreenshot: string;
  runInteract: string;
  selector: string;
  value: string;
  scrollX: string;
  scrollY: string;
  timeoutMs: string;
  waitOptional: string;
  noExtractResult: string;
  noScreenshotResult: string;
  noInteractionResult: string;
  click: string;
  type: string;
  scroll: string;
  wait: string;
  links: string;
};

export function createBrowserShellCopy(language: LanguageCode): BrowserShellCopy {
  if (language === "en-US") {
    return {
      newTab: "New Tab",
      noTab: "No tabs",
      startBrowsing: "Start browsing",
      openPageHint: "Enter a URL to open a page",
      blankPage: "No page",
      loading: "Loading",
      ready: "Ready",
      back: "Back",
      forward: "Forward",
      refresh: "Refresh",
      addressPlaceholder: "Enter URL",
      addressLabel: "Address bar",
      extract: "Extract",
      screenshot: "Screenshot",
      interact: "Interact",
      closeTab: "Close Tab",
      closePanel: "Close",
      loadFailed: "Load failed",
      actionFailed: "Action failed",
      runExtract: "Run Extract",
      runScreenshot: "Run Screenshot",
      runInteract: "Run Interaction",
      selector: "Selector",
      value: "Value",
      scrollX: "X",
      scrollY: "Y",
      timeoutMs: "Timeout (ms)",
      waitOptional: "Optional",
      noExtractResult: "No extract result",
      noScreenshotResult: "No screenshot",
      noInteractionResult: "No interaction result",
      click: "Click",
      type: "Type",
      scroll: "Scroll",
      wait: "Wait",
      links: "Links",
    };
  }

  return {
    newTab: "新建页卡",
    noTab: "暂无标签页",
    startBrowsing: "开始浏览",
    openPageHint: "输入 URL 以打开页面",
    blankPage: "未打开页面",
    loading: "正在加载",
    ready: "就绪",
    back: "后退",
    forward: "前进",
    refresh: "刷新",
    addressPlaceholder: "输入 URL",
    addressLabel: "地址栏",
    extract: "提取",
    screenshot: "截图",
    interact: "交互",
    closeTab: "关闭标签页",
    closePanel: "收起",
    loadFailed: "加载失败",
    actionFailed: "操作失败",
    runExtract: "执行提取",
    runScreenshot: "执行截图",
    runInteract: "执行交互",
    selector: "选择器",
    value: "内容",
    scrollX: "X",
    scrollY: "Y",
    timeoutMs: "超时(ms)",
    waitOptional: "可留空",
    noExtractResult: "暂无提取结果",
    noScreenshotResult: "暂无截图",
    noInteractionResult: "暂无交互结果",
    click: "点击",
    type: "输入",
    scroll: "滚动",
    wait: "等待",
    links: "链接",
  };
}

export function normalizeBrowserUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
}

export function normalizeBrowserError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatBrowserTime(value: string | undefined): string {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function resolveBrowserHost(value: string): string {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).host || value;
  } catch {
    return value;
  }
}
