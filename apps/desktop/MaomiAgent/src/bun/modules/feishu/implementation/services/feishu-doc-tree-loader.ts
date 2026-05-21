import type {
  FeishuDocTreeLoadInput,
  FeishuDocTreeLoadResult,
  FeishuDocTreeMutationEvent,
} from "../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuDocTreeBranchCacheEntry,
  DesktopFeishuDocTreeRootCacheEntry,
} from "../../abstraction/ports/desktop-feishu-store.ports";
import type {
  FeishuDocTreeRecognizedRoot,
  FeishuDocTreeRemoteChildren,
} from "./feishu-doc-tree-remote-source";

export type FeishuDocTreeLoaderCache = {
  readRoot(scopeId: string, token: string): Promise<DesktopFeishuDocTreeRootCacheEntry | null>;
  saveRoot(scopeId: string, entry: DesktopFeishuDocTreeRootCacheEntry): Promise<void>;
  readBranch(
    scopeId: string,
    rootToken: string,
    parentToken: string,
  ): Promise<DesktopFeishuDocTreeBranchCacheEntry | null>;
  saveBranch(scopeId: string, entry: DesktopFeishuDocTreeBranchCacheEntry): Promise<void>;
};

export type FeishuDocTreeLoaderRemote = {
  recognizeRoot(accessToken: string, token: string): Promise<FeishuDocTreeRecognizedRoot>;
  listChildren(accessToken: string, root: FeishuDocTreeRecognizedRoot): Promise<FeishuDocTreeRemoteChildren>;
};

export type FeishuDocTreeLoaderDeps = {
  scopeId(): string;
  accessToken(): Promise<string>;
  now(): string;
  cache: FeishuDocTreeLoaderCache;
  remote: FeishuDocTreeLoaderRemote;
  emit(event: FeishuDocTreeMutationEvent): void;
};

export class FeishuDocTreeLoader {
  constructor(private readonly deps: FeishuDocTreeLoaderDeps) {}

  async loadRoot(input: FeishuDocTreeLoadInput): Promise<FeishuDocTreeLoadResult> {
    const scopeId = this.deps.scopeId();
    const cachedRoot = await this.deps.cache.readRoot(scopeId, input.token);
    const cachedBranch = cachedRoot
      ? await this.deps.cache.readBranch(scopeId, input.token, cachedRoot.rootNodeId)
      : null;

    if (!input.forceRefresh && cachedRoot && cachedBranch) {
      void this.refreshRoot(scopeId, input.token).catch((error) => {
        void error;
      });
      return this.cacheResult(cachedRoot, cachedBranch);
    }

    return this.refreshRoot(scopeId, input.token);
  }

  private async refreshRoot(scopeId: string, token: string): Promise<FeishuDocTreeLoadResult> {
    const accessToken = await this.deps.accessToken();
    const recognizedRoot = await this.deps.remote.recognizeRoot(accessToken, token);
    const children = await this.deps.remote.listChildren(accessToken, recognizedRoot);
    const loadedAt = this.deps.now();

    await this.deps.cache.saveRoot(scopeId, {
      token,
      kind: recognizedRoot.kind,
      rootNodeId: recognizedRoot.rootNodeId,
      title: recognizedRoot.title,
      loadedAt,
    });
    await this.deps.cache.saveBranch(scopeId, {
      rootToken: token,
      parentToken: recognizedRoot.rootNodeId,
      nodes: children.nodes,
      loadedAt,
      complete: !children.hasMore,
    });

    const result: FeishuDocTreeLoadResult = {
      rootToken: token,
      rootKind: recognizedRoot.kind,
      nodes: children.nodes,
      source: "remote",
      refreshing: false,
      stale: false,
      loadedAt,
    };
    this.deps.emit({ type: "root-refreshed", payload: result });
    await this.hydrateChildrenProgressively();
    return result;
  }

  private cacheResult(
    cachedRoot: DesktopFeishuDocTreeRootCacheEntry,
    cachedBranch: DesktopFeishuDocTreeBranchCacheEntry,
  ): FeishuDocTreeLoadResult {
    return {
      rootToken: cachedRoot.token,
      rootKind: cachedRoot.kind,
      nodes: cachedBranch.nodes,
      source: "cache",
      refreshing: true,
      stale: true,
      loadedAt: cachedBranch.loadedAt,
    };
  }

  private async hydrateChildrenProgressively(): Promise<void> {
    return undefined;
  }
}