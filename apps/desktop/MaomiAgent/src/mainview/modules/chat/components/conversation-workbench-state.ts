import { upsertConversationAttachedTabs } from "./attached-tabs";
import type {
  ChatAttachedTabState,
  ChatWorkbenchDockKey,
  ChatWorkbenchPanelKey,
} from "../types";

export type RightPaneSize = number | string;

export type PaneSizes = {
  right: RightPaneSize;
  terminal: number;
};

export type ConversationWorkbenchViewState = {
  historySidebarVisible: boolean;
  mainPanelVisible: boolean;
  secondaryPanelVisible: boolean;
  terminalVisible: boolean;
  activePanelKey: ChatWorkbenchPanelKey;
  activeAttachedTabKey?: string;
  attachedTabs: ChatAttachedTabState[];
  paneSizes: PaneSizes;
};

const DEFAULT_RIGHT_PANE_WIDTH = "42%";
const DEFAULT_TERMINAL_PANE_HEIGHT = 248;

function resolveConversationWorkbenchPanelKey(key: string): ChatWorkbenchPanelKey {
  if (key === "settings") {
    return "settings";
  }

  if (key === "changes") {
    return "changes";
  }

  if (key === "git") {
    return "git";
  }

  return "files";
}

export function hasVisibleConversationWorkbenchPanels(
  current: Pick<ConversationWorkbenchViewState, "mainPanelVisible" | "secondaryPanelVisible">,
) {
  return current.mainPanelVisible || current.secondaryPanelVisible;
}

export function resolveActiveAttachedTabKey(input: {
  preferredAttachedTabKey?: string;
  availableAttachedTabKeys: string[];
}) {
  if (
    input.preferredAttachedTabKey
    && input.availableAttachedTabKeys.includes(input.preferredAttachedTabKey)
  ) {
    return input.preferredAttachedTabKey;
  }

  return input.availableAttachedTabKeys[0];
}

export function createConversationWorkbenchViewState(): ConversationWorkbenchViewState {
  return {
    historySidebarVisible: true,
    mainPanelVisible: false,
    secondaryPanelVisible: false,
    terminalVisible: false,
    activePanelKey: "files",
    activeAttachedTabKey: undefined,
    attachedTabs: [],
    paneSizes: {
      right: DEFAULT_RIGHT_PANE_WIDTH,
      terminal: DEFAULT_TERMINAL_PANE_HEIGHT,
    },
  };
}

export function toggleConversationWorkbenchHistorySidebar(
  current: ConversationWorkbenchViewState,
): ConversationWorkbenchViewState {
  return {
    ...current,
    historySidebarVisible: !current.historySidebarVisible,
  };
}

export function applyConversationWorkbenchDockAction(
  current: ConversationWorkbenchViewState,
  dockKey: ChatWorkbenchDockKey,
): ConversationWorkbenchViewState {
  if (dockKey === "terminal") {
    return {
      ...current,
      terminalVisible: !current.terminalVisible,
    };
  }

  if (dockKey === "sidebar") {
    if (hasVisibleConversationWorkbenchPanels(current)) {
      return {
        ...current,
        mainPanelVisible: false,
        secondaryPanelVisible: false,
      };
    }

    return {
      ...current,
      mainPanelVisible: true,
      secondaryPanelVisible: current.attachedTabs.length > 0,
    };
  }

  if (dockKey === "secondary") {
    if (current.attachedTabs.length === 0) {
      return current;
    }

    if (current.secondaryPanelVisible) {
      return {
        ...current,
        secondaryPanelVisible: false,
      };
    }

    return {
      ...current,
      secondaryPanelVisible: true,
      activeAttachedTabKey: resolveActiveAttachedTabKey({
        preferredAttachedTabKey: current.activeAttachedTabKey,
        availableAttachedTabKeys: current.attachedTabs.map((item) => item.key),
      }),
    };
  }

  if (
    dockKey !== "settings"
    && dockKey !== "files"
    && dockKey !== "changes"
    && dockKey !== "git"
  ) {
    return current;
  }

  return {
    ...current,
    activePanelKey: resolveConversationWorkbenchPanelKey(dockKey),
    mainPanelVisible: true,
  };
}

export function openConversationWorkbenchAttachedTab(
  current: ConversationWorkbenchViewState,
  nextTab: ChatAttachedTabState,
): ConversationWorkbenchViewState {
  const nextAttachedTabs = upsertConversationAttachedTabs(current.attachedTabs, nextTab);
  return {
    ...current,
    mainPanelVisible: true,
    attachedTabs: nextAttachedTabs,
    activeAttachedTabKey: nextTab.key,
    secondaryPanelVisible: true,
  };
}

export function closeConversationWorkbenchAttachedTab(
  current: ConversationWorkbenchViewState,
  tabKey: string,
): ConversationWorkbenchViewState {
  const nextAttachedTabs = current.attachedTabs.filter((item) => item.key !== tabKey);
  const nextActiveAttachedTabKey = resolveActiveAttachedTabKey({
    preferredAttachedTabKey:
      current.activeAttachedTabKey === tabKey
        ? undefined
        : current.activeAttachedTabKey,
    availableAttachedTabKeys: nextAttachedTabs.map((item) => item.key),
  });
  const nextSecondaryPanelVisible = nextAttachedTabs.length > 0
    ? current.secondaryPanelVisible
    : false;

  return {
    ...current,
    attachedTabs: nextAttachedTabs,
    activeAttachedTabKey: nextActiveAttachedTabKey,
    secondaryPanelVisible: nextSecondaryPanelVisible,
  };
}

export function closeConversationWorkbenchAllAttachedTabs(
  current: ConversationWorkbenchViewState,
): ConversationWorkbenchViewState {
  if (current.attachedTabs.length === 0 && !current.secondaryPanelVisible) {
    return current;
  }

  return {
    ...current,
    attachedTabs: [],
    activeAttachedTabKey: undefined,
    secondaryPanelVisible: false,
  };
}

export function closeConversationWorkbenchMainPanel(
  current: ConversationWorkbenchViewState,
): ConversationWorkbenchViewState {
  if (!current.mainPanelVisible) {
    return current;
  }

  return {
    ...current,
    mainPanelVisible: false,
  };
}

export function closeConversationWorkbenchSecondaryPanel(
  current: ConversationWorkbenchViewState,
): ConversationWorkbenchViewState {
  if (!current.secondaryPanelVisible) {
    return current;
  }

  return {
    ...current,
    secondaryPanelVisible: false,
  };
}

function toPercentageSize(size: number, total: number): string {
  if (!Number.isFinite(size) || !Number.isFinite(total) || total <= 0) {
    return DEFAULT_RIGHT_PANE_WIDTH;
  }

  const percentage = Number(((size / total) * 100).toFixed(1));
  return `${percentage}%`;
}

export function resizeConversationWorkbenchMainPane(
  current: ConversationWorkbenchViewState,
  sizes: number[],
): ConversationWorkbenchViewState {
  const nextWidth = sizes[1];
  const totalWidth = sizes.reduce((sum, item) => sum + item, 0);
  if (typeof nextWidth !== "number") {
    return current;
  }

  const nextRightPaneSize = toPercentageSize(nextWidth, totalWidth);
  if (nextRightPaneSize === current.paneSizes.right) {
    return current;
  }

  return {
    ...current,
    paneSizes: {
      ...current.paneSizes,
      right: nextRightPaneSize,
    },
  };
}

export function resizeConversationWorkbenchTerminalPane(
  current: ConversationWorkbenchViewState,
  sizes: number[],
): ConversationWorkbenchViewState {
  const nextHeight = sizes[1];
  if (typeof nextHeight !== "number" || nextHeight === current.paneSizes.terminal) {
    return current;
  }

  return {
    ...current,
    paneSizes: {
      ...current.paneSizes,
      terminal: nextHeight,
    },
  };
}

export function selectConversationWorkbenchPanel(
  current: ConversationWorkbenchViewState,
  key: string,
): ConversationWorkbenchViewState {
  const nextActivePanelKey = resolveConversationWorkbenchPanelKey(key);
  if (
    nextActivePanelKey === current.activePanelKey
    && current.mainPanelVisible
  ) {
    return current;
  }

  return {
    ...current,
    activePanelKey: nextActivePanelKey,
    mainPanelVisible: true,
  };
}

export function selectConversationWorkbenchAttachedTab(
  current: ConversationWorkbenchViewState,
  key: string,
): ConversationWorkbenchViewState {
  if (
    !current.attachedTabs.some((item) => item.key === key)
    || (current.activeAttachedTabKey === key && current.secondaryPanelVisible)
  ) {
    return current;
  }

  return {
    ...current,
    activeAttachedTabKey: key,
    secondaryPanelVisible: true,
  };
}
