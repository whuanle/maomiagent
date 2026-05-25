import type { FeishuDocIR } from "../../../../../shared/desktop-feishu-doc-ir";

export type FeishuDocWorkspaceRuntimeResult = {
  status: "succeeded" | "blocked" | "failed";
  message?: string;
};

export class FeishuDocWorkspaceRuntime {
  constructor(private readonly deps: {
    cache: {
      readDocument(docId: string): Promise<FeishuDocIR | null>;
      readBase?(docId: string): Promise<FeishuDocIR | null>;
      writeDocument(docId: string, ir: FeishuDocIR): Promise<void>;
      writeBase(docId: string, ir: FeishuDocIR): Promise<void>;
      writeRemote(docId: string, ir: FeishuDocIR): Promise<void>;
      backupDocument(docId: string, timestamp: string): Promise<string>;
    };
    remote: { pull(input: { docId: string; workspaceId: string }): Promise<FeishuDocIR> };
    assets: { hydrateAssets(input: FeishuDocIR, workspaceId: string): Promise<FeishuDocIR> };
    push: { execute(input: { base: FeishuDocIR; current: FeishuDocIR }): Promise<FeishuDocWorkspaceRuntimeResult> };
  }) {}

  async openDocument(input: { docId: string; workspaceId: string }): Promise<{ source: "cache" | "remote"; ir: FeishuDocIR }> {
    const cached = await this.deps.cache.readDocument(input.docId);
    if (cached) {
      return { source: "cache", ir: cached };
    }

    const remote = await this.deps.assets.hydrateAssets(await this.deps.remote.pull(input), input.workspaceId);
    await this.deps.cache.writeDocument(input.docId, remote);
    await this.deps.cache.writeBase(input.docId, remote);
    return { source: "remote", ir: remote };
  }

  async pullLatest(input: { docId: string; workspaceId: string; overwrite: boolean }): Promise<{ ir: FeishuDocIR; backupPath?: string }> {
    const remote = await this.deps.assets.hydrateAssets(await this.deps.remote.pull(input), input.workspaceId);
    await this.deps.cache.writeRemote(input.docId, remote);
    if (!input.overwrite) {
      return { ir: remote };
    }

    const current = await this.deps.cache.readDocument(input.docId);
    const backupPath = current ? await this.deps.cache.backupDocument(input.docId, new Date().toISOString()) : undefined;
    await this.deps.cache.writeDocument(input.docId, remote);
    await this.deps.cache.writeBase(input.docId, remote);
    return { ir: remote, backupPath };
  }

  async pushDocument(input: { docId: string; workspaceId: string }): Promise<FeishuDocWorkspaceRuntimeResult> {
    const current = await this.deps.cache.readDocument(input.docId);
    const base = await this.deps.cache.readBase?.(input.docId);
    if (!current || !base) {
      return { status: "failed", message: "Document IR cache is incomplete" };
    }
    return this.deps.push.execute({ base, current });
  }
}