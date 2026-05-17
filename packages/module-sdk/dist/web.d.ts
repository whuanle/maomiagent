export type ModuleRuntimeHealth = "ok" | "warn" | "error";

export type ModuleRuntimeState = {
  ready?: boolean;
  title?: string;
  subtitle?: string;
  badge?: string;
  dirty?: boolean;
  health?: ModuleRuntimeHealth;
  lastUpdatedAt?: string;
};

export type ModuleBridgeContext = {
  moduleId: string;
  moduleName: string;
  routeKey: string;
  theme: "light" | "dark";
  language: "zh-CN" | "en-US";
  activeWorkspaceId?: string;
  permissions: string[];
  navigation: {
    title: string;
    icon?: string;
    order: number;
    requiresWorkspace: boolean;
  };
  host: {
    appName: "MaomiAgent";
    sdkVersion: string;
    apiBaseUrl?: string;
  };
};

export type ModuleSdkOptions = {
  autoReady?: boolean;
  protocol?: string;
  targetOrigin?: string;
  requestTimeoutMs?: number;
};

export type ModuleHostConversationContextInput = {
  sessionId: string;
  workspaceId?: string;
  messageLimit?: number;
};

export type ModuleHostLocalSurfaceKind = "markdown" | "browser" | "editor";
export type ModuleHostLocalSurfaceStatus = "open" | "closed";
export type ModuleHostLocalSurfacePresentationMode =
  | "tab"
  | "sidebar"
  | "modal"
  | "window";
export type ModuleHostLocalSurfaceMountState =
  | "pending_mount"
  | "mounted"
  | "hidden"
  | "failed"
  | "closed";

export type ModuleHostLocalSurfacePresentation = {
  mode: ModuleHostLocalSurfacePresentationMode;
  preferredWidth?: number;
  preferredHeight?: number;
};

export type ModuleHostLocalSurfaceSource = {
  kind: "inline" | "workspace-file" | "file" | "url" | "untitled";
  label: string;
  path?: string;
  absolutePath?: string;
  url?: string;
  exists?: boolean;
};

export type ModuleHostLocalSurfaceMount = {
  executor: "ui-host";
  state: ModuleHostLocalSurfaceMountState;
  requestedAt: string;
  mountedAt?: string;
  lastError?: string;
};

export type ModuleHostLocalSurfaceItem = {
  surfaceId: string;
  workspaceId: string;
  kind: ModuleHostLocalSurfaceKind;
  title: string;
  summary: string;
  status: ModuleHostLocalSurfaceStatus;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  metadata?: Record<string, unknown>;
  presentation: ModuleHostLocalSurfacePresentation;
  mount: ModuleHostLocalSurfaceMount;
  resolved: {
    renderer: "markdown" | "webview" | "monaco-editor";
    engine: string;
    source: ModuleHostLocalSurfaceSource;
    [key: string]: unknown;
  };
};

export type ModuleHostLocalSurfaceListResult = {
  items: ModuleHostLocalSurfaceItem[];
  meta: {
    total: number;
    open: number;
    closed: number;
  };
};

export type ModuleHostLocalSurfaceContentSnapshot =
  | {
      kind: "markdown";
      surfaceId: string;
      markdown: string;
      html: string;
      checksum: string;
    }
  | {
      kind: "editor";
      surfaceId: string;
      content: string;
      language: string;
      version: number;
      checksum: string;
      dirty: boolean;
      readOnly: boolean;
      canSave: boolean;
    };

export type ModuleHostLocalSurfaceListInput = {
  workspaceId?: string;
  includeClosed?: boolean;
  kind?: ModuleHostLocalSurfaceKind;
};

export type ModuleHostOpenLocalSurfaceInput =
  | {
      workspaceId?: string;
      kind: "markdown";
      title?: string;
      markdown?: string;
      workspaceRelativePath?: string;
      presentation?: {
        mode?: "tab" | "sidebar" | "modal" | "window";
        preferredWidth?: number;
        preferredHeight?: number;
      };
      metadata?: Record<string, unknown>;
    }
  | {
      workspaceId?: string;
      kind: "browser";
      title?: string;
      url?: string;
      address?: string;
      workspaceRelativePath?: string;
      presentation?: {
        mode?: "tab" | "sidebar" | "modal" | "window";
        preferredWidth?: number;
        preferredHeight?: number;
      };
      metadata?: Record<string, unknown>;
    }
  | {
      workspaceId?: string;
      kind: "editor";
      title?: string;
      language?: string;
      initialContent?: string;
      workspaceRelativePath?: string;
      line?: number;
      column?: number;
      readOnly?: boolean;
      presentation?: {
        mode?: "tab" | "sidebar" | "modal" | "window";
        preferredWidth?: number;
        preferredHeight?: number;
      };
      metadata?: Record<string, unknown>;
    };

export type ModuleHostLocalSurfaceTargetInput = {
  surfaceId: string;
  workspaceId?: string;
};

export type ModuleHostUpdateLocalSurfaceContentInput =
  ModuleHostLocalSurfaceTargetInput & {
    content: string;
    language?: string;
    persist?: boolean;
    workspaceRelativePath?: string;
  };

export type ModuleHostSaveLocalSurfaceInput =
  ModuleHostLocalSurfaceTargetInput & {
    workspaceRelativePath?: string;
    language?: string;
  };

export type ModuleHostTaskSchedule = {
  kind: string;
  intervalMinutes?: number;
  nextRunAt?: string;
  timezone?: string;
  enabled?: boolean;
  [key: string]: unknown;
};

export type ModuleHostTaskInvocation = {
  driver: string;
  callback?: {
    executor?: string;
    action?: string;
    target?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    timeoutMs?: number;
    retryLimit?: number;
    idempotencyKey?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ModuleHostTaskRecord = {
  taskId: string;
  workspaceId: string;
  title: string;
  goal: string;
  status: string;
  taskType?: string;
  executionMode?: string;
  runMode?: string;
  origin?: string;
  schedule?: ModuleHostTaskSchedule;
  invocation?: ModuleHostTaskInvocation;
  source?: {
    ownerKind?: string;
    ownerId?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type ModuleHostTaskListInput = {
  workspaceId?: string;
  status?: string;
  taskType?: string;
  executionMode?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type ModuleHostTaskTargetInput = {
  taskId: string;
  workspaceId?: string;
};

export type ModuleHostTaskBatchTargetInput = {
  taskIds: string[];
  workspaceId?: string;
};

export type ModuleHostTaskCreateInput = {
  workspaceId?: string;
  title: string;
  goal: string;
  taskType?: string;
  executionMode?: string;
  runMode?: string;
  origin?: string;
  linkedSessionId?: string;
  agentId?: string;
  priority?: string;
  plan?: Record<string, unknown>;
  schedule?: ModuleHostTaskSchedule;
  invocation?: ModuleHostTaskInvocation;
  source?: Record<string, unknown>;
  memoryQuery?: string;
  memoryTraceId?: string;
  memoryRefs?: unknown[];
  orchestration?: Record<string, unknown>;
  longTaskPlan?: Record<string, unknown>;
  redblue?: Record<string, unknown>;
  autopilot?: Record<string, unknown>;
  riskGate?: Record<string, unknown>;
  steps?: Array<{ title: string }>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ModuleHostTaskUpdateInput =
  ModuleHostTaskTargetInput &
  Partial<Omit<ModuleHostTaskCreateInput, "workspaceId">> & {
    progress?: number;
  };

export type ModuleHostTaskRunNowResult = {
  item: ModuleHostTaskRecord;
  dispatch: {
    queued: number;
    ready: number;
    blocked: number;
    picked: number;
    completed: number;
    items: Array<{
      taskId: string;
      from: string;
      to: string;
    }>;
    blockedItems: Array<{
      taskId: string;
      reason: string;
    }>;
  };
};

export type ModuleHostTaskBatchResult = {
  items: ModuleHostTaskRecord[];
  count: number;
  skippedTaskIds: string[];
};

export type ModuleHostTaskRunManyNowResult = ModuleHostTaskBatchResult & {
  dispatch: ModuleHostTaskRunNowResult["dispatch"];
};

export type ModuleUiNotifyInput = {
  tone: "success" | "info" | "warning" | "error";
  message: string;
};

export type ModuleServerFetchInput = {
  path?: string;
  init?: RequestInit;
};

export declare const BRIDGE_PROTOCOL = "maomi.module.bridge";

export declare function createMaomiModuleSdk(
  options?: ModuleSdkOptions,
): {
  protocol: string;
  ready: () => void;
  dispose: () => void;
  request: (method: string, params?: unknown) => Promise<unknown>;
  getContext: () => Promise<ModuleBridgeContext>;
  onContextChange: (
    listener: (context: ModuleBridgeContext) => void,
  ) => () => void;
  reportState: (state: ModuleRuntimeState) => void;
  module: {
    fetch: (path?: string, init?: RequestInit) => Promise<Response>;
  };
  host: {
    workspace: {
      getActive: () => Promise<unknown>;
      list: (input?: Record<string, unknown>) => Promise<unknown>;
    };
    models: {
      list: () => Promise<unknown>;
    };
    conversations: {
      list: (input?: Record<string, unknown>) => Promise<unknown>;
      getContext: (input: ModuleHostConversationContextInput) => Promise<unknown>;
    };
    storage: {
      get: <T = unknown>(key: string) => Promise<T | null>;
      set: (key: string, value: unknown) => Promise<void>;
      remove: (key: string) => Promise<void>;
    };
    localSurfaces: {
      list: (
        input?: ModuleHostLocalSurfaceListInput,
      ) => Promise<ModuleHostLocalSurfaceListResult>;
      open: (input: ModuleHostOpenLocalSurfaceInput) => Promise<ModuleHostLocalSurfaceItem>;
      get: (input: ModuleHostLocalSurfaceTargetInput) => Promise<ModuleHostLocalSurfaceItem>;
      getContent: (
        input: ModuleHostLocalSurfaceTargetInput,
      ) => Promise<ModuleHostLocalSurfaceContentSnapshot>;
      updateContent: (
        input: ModuleHostUpdateLocalSurfaceContentInput,
      ) => Promise<ModuleHostLocalSurfaceItem>;
      save: (input: ModuleHostSaveLocalSurfaceInput) => Promise<ModuleHostLocalSurfaceItem>;
      reload: (input: ModuleHostLocalSurfaceTargetInput) => Promise<ModuleHostLocalSurfaceItem>;
      close: (input: ModuleHostLocalSurfaceTargetInput) => Promise<ModuleHostLocalSurfaceItem>;
    };
    tasks: {
      list: (input?: ModuleHostTaskListInput) => Promise<{
        items: ModuleHostTaskRecord[];
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      }>;
      get: (input: ModuleHostTaskTargetInput) => Promise<ModuleHostTaskRecord>;
      create: (input: ModuleHostTaskCreateInput) => Promise<ModuleHostTaskRecord>;
      update: (input: ModuleHostTaskUpdateInput) => Promise<ModuleHostTaskRecord>;
      runNow: (input: ModuleHostTaskTargetInput) => Promise<ModuleHostTaskRunNowResult>;
      runManyNow: (input: ModuleHostTaskBatchTargetInput) => Promise<ModuleHostTaskRunManyNowResult>;
      pauseSchedule: (input: ModuleHostTaskTargetInput) => Promise<ModuleHostTaskRecord>;
      pauseManySchedules: (input: ModuleHostTaskBatchTargetInput) => Promise<ModuleHostTaskBatchResult>;
      resumeSchedule: (input: ModuleHostTaskTargetInput) => Promise<ModuleHostTaskRecord>;
      resumeManySchedules: (input: ModuleHostTaskBatchTargetInput) => Promise<ModuleHostTaskBatchResult>;
    };
    navigation: {
      openBuiltin: (routeKey: string) => Promise<void>;
      openModule: (moduleId: string) => Promise<void>;
    };
  };
  ui: {
    notify: (input: ModuleUiNotifyInput) => Promise<void>;
  };
};
