import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Window as HappyDomWindow } from "happy-dom";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { DirectSessionComposer } from "./direct-session-composer";
import type { DirectSessionComposerViewModel } from "./types";

const originalDomGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  navigator: globalThis.navigator,
  self: globalThis.self,
  Document: globalThis.Document,
  DocumentFragment: globalThis.DocumentFragment,
  Element: globalThis.Element,
  HTMLElement: globalThis.HTMLElement,
  HTMLInputElement: globalThis.HTMLInputElement,
  HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
  Text: globalThis.Text,
  Comment: globalThis.Comment,
  CustomEvent: globalThis.CustomEvent,
  Event: globalThis.Event,
  EventTarget: globalThis.EventTarget,
  KeyboardEvent: globalThis.KeyboardEvent,
  MouseEvent: globalThis.MouseEvent,
  Node: globalThis.Node,
  SVGElement: globalThis.SVGElement,
  MutationObserver: globalThis.MutationObserver,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
  getComputedStyle: globalThis.getComputedStyle,
};

let testWindow: HappyDomWindow;
let container: HTMLDivElement;
let root: Root;

function installDomWindow() {
  testWindow = new HappyDomWindow({
    url: "https://desktop.maomiagent.test/#chat-composer",
  });
  const requestAnimationFrame = testWindow.requestAnimationFrame?.bind(testWindow)
    ?? ((callback: FrameRequestCallback) => testWindow.setTimeout(() => callback(Date.now()), 0));
  const cancelAnimationFrame = testWindow.cancelAnimationFrame?.bind(testWindow)
    ?? ((handle: ReturnType<typeof testWindow.setTimeout>) => testWindow.clearTimeout(handle));

  Object.assign(globalThis, {
    window: testWindow,
    document: testWindow.document,
    navigator: testWindow.navigator,
    self: testWindow,
    Document: testWindow.Document,
    DocumentFragment: testWindow.DocumentFragment,
    Element: testWindow.Element,
    HTMLElement: testWindow.HTMLElement,
    HTMLInputElement: testWindow.HTMLInputElement,
    HTMLTextAreaElement: testWindow.HTMLTextAreaElement,
    Text: testWindow.Text,
    Comment: testWindow.Comment,
    CustomEvent: testWindow.CustomEvent,
    Event: testWindow.Event,
    EventTarget: testWindow.EventTarget,
    KeyboardEvent: testWindow.KeyboardEvent,
    MouseEvent: testWindow.MouseEvent,
    Node: testWindow.Node,
    SVGElement: testWindow.SVGElement,
    MutationObserver: testWindow.MutationObserver,
    requestAnimationFrame,
    cancelAnimationFrame,
    getComputedStyle: testWindow.getComputedStyle.bind(testWindow),
  });

  Object.defineProperty(globalThis.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: mock(() => {}),
  });
}

function restoreDomWindow() {
  Object.assign(globalThis, originalDomGlobals);
}

function TestComposer() {
  const [draft, setDraft] = useState("/");
  const props: DirectSessionComposerViewModel = {
    language: "zh-CN",
    disabled: false,
    sending: false,
    stopping: false,
    sendDisabled: false,
    draft,
    placeholder: "请输入",
    attachLabel: "添加附件",
    modelPlaceholder: "模型",
    agentPlaceholder: "智能体",
    sendLabel: "发送",
    composerMode: "agent",
    showAttachmentButton: false,
    showModeSwitch: false,
    showModelSelect: false,
    showAgentSelect: false,
    modelOptions: [],
    modelSelectOptions: [],
    agentOptions: [],
    slashCommands: [
      {
        key: "playwright",
        label: "Playwright",
        insertText: "playwright",
        description: "Browser automation",
      },
      {
        key: "search",
        label: "Search",
        insertText: "search",
        description: "Search across connected sources",
      },
    ],
    attachments: [],
    onDraftChange: setDraft,
    onAttachFiles: () => {},
    onRemoveAttachment: () => {},
    onModelChange: () => {},
    onAgentChange: () => {},
    onModeChange: () => {},
    onSubmit: () => {},
    onStop: () => {},
  };

  return <DirectSessionComposer {...props} />;
}

describe("DirectSessionComposer interactions", () => {
  beforeEach(() => {
    installDomWindow();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    restoreDomWindow();
  });

  test("renders slash descriptions and supports arrow navigation with enter selection", async () => {
    await act(async () => {
      root.render(<TestComposer />);
    });

    expect(container.textContent).toContain("Browser automation");
    expect(container.textContent).toContain("Search across connected sources");

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    if (!textarea) {
      return;
    }

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });

    const options = Array.from(container.querySelectorAll('[role="option"]'));
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");

    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });

    expect(container.textContent).toContain("/search");
    expect(container.textContent).toContain("Search");
  });
});
