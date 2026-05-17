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
      presentation?: ModuleHostLocalSurfacePresentation;
      metadata?: Record<string, unknown>;
    }
  | {
      workspaceId?: string;
      kind: "browser";
      title?: string;
      url?: string;
      address?: string;
      workspaceRelativePath?: string;
      presentation?: ModuleHostLocalSurfacePresentation;
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
      presentation?: ModuleHostLocalSurfacePresentation;
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

export type ModuleHostTaskCreateRequest = {
  workspaceId?: string;
  payload: Record<string, unknown>;
};

export type ModuleHostTaskUpdateRequest = {
  taskId: string;
  workspaceId?: string;
  payload: Record<string, unknown>;
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

export type ModuleHostMcpTransport = "stdio" | "http-streamable" | "sse";
export type ModuleHostMcpScope = "global" | "workspace";
export type ModuleHostMcpAuthMode = "none" | "token" | "basic" | "custom";

export type ModuleHostMcpRegistrationInput = {
  name: string;
  scope?: ModuleHostMcpScope;
  enabled?: boolean;
  transport: ModuleHostMcpTransport;
  endpoint: string;
  authMode?: ModuleHostMcpAuthMode;
  timeoutMs?: number;
  retry?: {
    maxAttempts?: number;
    backoffMs?: number;
  };
  concurrencyHint?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  description?: string;
  precedence?: number;
};

export type ModuleHostMcpRegistration = ModuleHostMcpRegistrationInput & {
  scope: ModuleHostMcpScope;
  enabled: boolean;
};

export type ModuleServerContext = {
  module: {
    moduleId: string;
    name: string;
    version: string;
    packageName: string;
    sourceType: string;
    sourceSpec: string;
    permissions: string[];
    navigation: {
      title: string;
      icon?: string;
      order: number;
      requiresWorkspace: boolean;
    };
  };
  request: {
    method: string;
    url: string;
    pathname: string;
    search: string;
    headers: Record<string, string>;
  };
  host: {
    apiBaseUrl: string;
    workspace: {
      getActive: () => Promise<unknown>;
      list: (input?: Record<string, unknown>) => Promise<unknown>;
    };
    models: {
      list: () => Promise<unknown>;
    };
    conversations: {
      list: (input?: Record<string, unknown>) => Promise<unknown>;
      getContext: (input: Record<string, unknown>) => Promise<unknown>;
    };
    storage: {
      get: <T = unknown>(key: string) => Promise<T | null>;
      set: (key: string, value: unknown) => Promise<void>;
      remove: (key: string) => Promise<void>;
    };
    mcp: {
      list: () => Promise<ModuleHostMcpRegistration[]>;
      register: (
        input: ModuleHostMcpRegistrationInput,
      ) => Promise<ModuleHostMcpRegistration>;
      registerMany: (
        input: ModuleHostMcpRegistrationInput[],
      ) => Promise<ModuleHostMcpRegistration[]>;
      replace: (
        input: ModuleHostMcpRegistrationInput[],
      ) => Promise<ModuleHostMcpRegistration[]>;
      unregister: (
        input: {
          name: string;
          scope?: ModuleHostMcpScope;
        },
      ) => Promise<boolean>;
      clear: () => Promise<boolean>;
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
      create: (input: ModuleHostTaskCreateRequest) => Promise<ModuleHostTaskRecord>;
      update: (input: ModuleHostTaskUpdateRequest) => Promise<ModuleHostTaskRecord>;
      runNow: (input: ModuleHostTaskTargetInput) => Promise<ModuleHostTaskRunNowResult>;
      runManyNow: (input: ModuleHostTaskBatchTargetInput) => Promise<ModuleHostTaskRunManyNowResult>;
      pauseSchedule: (input: ModuleHostTaskTargetInput) => Promise<ModuleHostTaskRecord>;
      pauseManySchedules: (input: ModuleHostTaskBatchTargetInput) => Promise<ModuleHostTaskBatchResult>;
      resumeSchedule: (input: ModuleHostTaskTargetInput) => Promise<ModuleHostTaskRecord>;
      resumeManySchedules: (input: ModuleHostTaskBatchTargetInput) => Promise<ModuleHostTaskBatchResult>;
    };
  };
};

export type ModuleServerLifecycleContext = {
  module: ModuleServerContext["module"];
  host: ModuleServerContext["host"];
};

export type ModuleServerFetchHandler = (
  request: Request,
  context: ModuleServerContext,
) => Response | Promise<Response> | unknown | Promise<unknown>;

export type ModuleServerLifecycleHandler = (
  context: ModuleServerLifecycleContext,
) => void | Promise<void>;

export type ModuleServerDefinition = {
  fetch?: ModuleServerFetchHandler;
  activate?: ModuleServerLifecycleHandler;
  dispose?: ModuleServerLifecycleHandler;
};

export declare function defineMaomiModuleServer(
  input: ModuleServerFetchHandler | ModuleServerDefinition,
): ModuleServerDefinition;

export declare function json(data: unknown, init?: ResponseInit): Response;
export declare function text(value: unknown, init?: ResponseInit): Response;
export declare function notFound(message?: string): Response;
