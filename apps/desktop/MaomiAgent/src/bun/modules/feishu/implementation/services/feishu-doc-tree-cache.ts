import type { FeishuDocContentView } from "../../../../../shared/desktop-feishu";
import type {
  DesktopFeishuDocContentCacheEntry,
  DesktopFeishuDocTreeBranchCacheEntry,
  DesktopFeishuDocTreeRootCacheEntry,
  DesktopFeishuStorePort,
} from "../../abstraction/ports/desktop-feishu-store.ports";

function keyPart(value: string): string {
  return encodeURIComponent(value.trim());
}

function rootKey(scopeId: string, token: string): string {
  return `${keyPart(scopeId)}::root::${keyPart(token)}`;
}

function branchKey(scopeId: string, rootToken: string, parentToken: string): string {
  return `${keyPart(scopeId)}::branch::${keyPart(rootToken)}::${keyPart(parentToken)}`;
}

function contentKey(scopeId: string, docId: string): string {
  return `${keyPart(scopeId)}::content::${keyPart(docId)}`;
}

export class FeishuDocTreeCache {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly store: DesktopFeishuStorePort) {}

  private enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.then(operation, operation);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  async readRoot(scopeId: string, token: string): Promise<DesktopFeishuDocTreeRootCacheEntry | null> {
    const snapshot = await this.store.read();
    return snapshot.docTreeCache.roots[rootKey(scopeId, token)] ?? null;
  }

  async rememberRootToken(token: string): Promise<void> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return;
    }

    return this.enqueueWrite(async () => {
      const snapshot = await this.store.read();
      await this.store.write({
        ...snapshot,
        docTreeCache: {
          ...snapshot.docTreeCache,
          lastRootToken: normalizedToken,
          lastRootUpdatedAt: new Date().toISOString(),
        },
      });
    });
  }

  async saveRoot(scopeId: string, entry: DesktopFeishuDocTreeRootCacheEntry): Promise<void> {
    return this.enqueueWrite(async () => {
      const snapshot = await this.store.read();
      await this.store.write({
        ...snapshot,
        docTreeCache: {
          ...snapshot.docTreeCache,
          lastRootToken: entry.token,
          lastRootUpdatedAt: entry.loadedAt,
          roots: {
            ...snapshot.docTreeCache.roots,
            [rootKey(scopeId, entry.token)]: entry,
          },
        },
      });
    });
  }

  async readBranch(
    scopeId: string,
    rootToken: string,
    parentToken: string,
  ): Promise<DesktopFeishuDocTreeBranchCacheEntry | null> {
    const snapshot = await this.store.read();
    return snapshot.docTreeCache.branches[branchKey(scopeId, rootToken, parentToken)] ?? null;
  }

  async saveBranch(scopeId: string, entry: DesktopFeishuDocTreeBranchCacheEntry): Promise<void> {
    return this.enqueueWrite(async () => {
      const snapshot = await this.store.read();
      await this.store.write({
        ...snapshot,
        docTreeCache: {
          ...snapshot.docTreeCache,
          branches: {
            ...snapshot.docTreeCache.branches,
            [branchKey(scopeId, entry.rootToken, entry.parentToken)]: entry,
          },
        },
      });
    });
  }

  async readContent(scopeId: string, docId: string): Promise<DesktopFeishuDocContentCacheEntry | null> {
    const snapshot = await this.store.read();
    return snapshot.docTreeCache.contents[contentKey(scopeId, docId)] ?? null;
  }

  async saveContent(
    scopeId: string,
    docId: string,
    item: FeishuDocContentView,
    loadedAt: string,
  ): Promise<void> {
    return this.enqueueWrite(async () => {
      const snapshot = await this.store.read();
      await this.store.write({
        ...snapshot,
        docTreeCache: {
          ...snapshot.docTreeCache,
          contents: {
            ...snapshot.docTreeCache.contents,
            [contentKey(scopeId, docId)]: { docId, item, loadedAt },
          },
        },
      });
    });
  }
}