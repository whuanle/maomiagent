# Feishu Push-Only Without Remote Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Feishu document push succeed as soon as the Feishu write API succeeds, without automatic remote pullback, while keeping the editor on the current local Markdown and leaving explicit pull as the only remote refresh path.

**Architecture:** Keep the change inside the desktop Feishu runtime. Replace post-push remote confirmation with a local settlement helper that writes a new pushed baseline into workspace caches, then return the pushed local document view directly. Lock the contract with targeted runtime tests for both IR patch pushes and plain Markdown overwrite pushes, including a second push without an intervening pull.

**Tech Stack:** TypeScript, Bun tests, Desktop Feishu workspace caches, Ant Design workbench consumer (no expected UI code change)

---

## File Map

- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
  - remove post-push remote confirmation from both push paths
  - add a local post-push settlement helper
  - persist a pushed baseline into workspace markdown / IR / source caches
  - neutralize local post-push revision constraints so another push can happen before an explicit pull
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
  - replace confirmation-oriented assertions with push-only assertions
  - assert no automatic remote re-read after successful push
  - add repeated-push regression coverage
- Verify only: `apps/desktop/MaomiAgent/src/mainview/modules/feishu/components/docs-workbench.tsx`
  - no code change expected because it already treats any non-`blocked` push result as success
- Verify only: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/action-handlers/docs-domain-action-handler.ts`
  - no code change expected because blocked / completed summaries still map from `pushStatus`

### Task 1: Remove Remote Confirmation From IR Patch Pushes

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the current patch-path success test with this push-only version:

```ts
test("pushWorkspaceDoc keeps anchored markdown after a successful patch push", async () => {
  const snapshot = createSnapshot();
  const nodeToken = "node_1";
  const resolvedDocId = "doc_1";
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-direct-runtime-"));
  let remoteMarkdown = "# Remote Doc";
  let remoteRevisionId = "1";
  let patchCalls = 0;
  let bundleReads = 0;

  try {
    const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
    const runtime = createRuntimeWithContentSource(
      snapshot,
      {
        readDocumentContent: async (_accessToken, docId) => createContentView(docId, "Remote Doc", remoteMarkdown),
        readDocumentBundle: async (_accessToken, docId) => {
          bundleReads += 1;
          if (bundleReads === 1) {
            return {
              content: createContentView(docId, "Remote Doc", remoteMarkdown),
              ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown, remoteRevisionId),
              source: {
                ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
                document: {
                  document_id: resolvedDocId,
                  title: "Remote Doc",
                  revision_id: remoteRevisionId,
                },
              },
            };
          }

          throw new Error("push should not re-read remote content after a successful patch write");
        },
      },
      workspaceQuery,
      async (url, init) => {
        const target = new URL(String(url));
        if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/text_1`) {
          patchCalls += 1;
          expect(init?.method).toBe("PATCH");
          remoteMarkdown = String(JSON.parse(String(init?.body)).update_text_elements.elements[0].text_run.content);
          remoteRevisionId = "2";

          return new Response(JSON.stringify({
            code: 0,
            data: {},
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        throw new Error(`unexpected fetch url: ${String(url)}`);
      },
    );

    await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

    const pushed = await runtime.pushWorkspaceDoc({
      workspaceId: "ws_1",
      docId: nodeToken,
      markdown: "<!--feishu:block:text_1-->\n# Edited Remote Doc\n<!--/feishu:block:text_1-->\n",
      force: true,
    });

    expect(patchCalls).toBe(1);
    expect(bundleReads).toBe(1);
    expect(pushed.pushStatus).toBe("succeeded");
    expect(pushed.item.markdown).toBe("<!--feishu:block:text_1-->\n# Edited Remote Doc\n<!--/feishu:block:text_1-->\n");
    expect(pushed.item.cache?.hasLocalChanges).toBe(false);

    const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });
    expect(cached.markdown).toBe("<!--feishu:block:text_1-->\n# Edited Remote Doc\n<!--/feishu:block:text_1-->\n");
    expect(cached.cache?.hasLocalChanges).toBe(false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

Expected: FAIL because the current push path still calls `refreshWorkspaceDocAfterPush(...)`, causing either:

- `push should not re-read remote content after a successful patch write`, or
- `Expected: "succeeded" Received: "blocked"`

- [ ] **Step 3: Write minimal implementation**

Add a local settlement helper and use it in the IR patch branch instead of calling `refreshWorkspaceDocAfterPush(...)`:

```ts
private async settleWorkspaceDocAfterSuccessfulPush(input: {
  workspaceId: string;
  docId: string;
  title: string;
  markdown: string;
  existing: FeishuDocContentView;
  ir?: FeishuDocIR | null;
  source?: FeishuDocSourceSnapshot | null;
}): Promise<FeishuDocContentView> {
  const workspaceRoot = await this.resolveWorkspaceDirectoryPath(input.workspaceId);
  const pushedAt = new Date().toISOString();

  if (workspaceRoot) {
    await this.persistWorkspaceOriginalMarkdown({
      workspaceRoot,
      docId: input.docId,
      markdown: input.markdown,
    });

    if (input.ir) {
      await this.persistWorkspaceIR({
        workspaceRoot,
        docId: input.docId,
        ir: input.ir,
      });
    }
  }

  return await this.writeWorkspaceDoc({
    workspaceId: input.workspaceId,
    docId: input.docId,
    title: input.title,
    markdown: input.markdown,
    existing: input.existing,
    baselineMarkdown: input.markdown,
    lastPushedAt: pushedAt,
  }) ?? this.createDocContentView({
    docId: input.docId,
    resolvedDocId: input.existing.resolvedDocId,
    title: input.title,
    markdown: input.markdown,
    existing: input.existing,
  });
}
```

Then replace the structured IR success branch with:

```ts
const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
  workspaceId: input.workspaceId,
  docId: input.docId,
  title: pushTitle,
  markdown: item.markdown,
  existing: decorated,
  ir: compile.current,
});

return {
  item: settled,
  pushStatus: "succeeded",
  warnings: assessment.blockedChanges.map((entry) => entry.reason),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

Expected: PASS for the new patch-path test and no failures in the file at this stage.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
git commit -m "feat: make feishu patch pushes local-first"
```

### Task 2: Remove Remote Confirmation From Plain Markdown Overwrite Pushes

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

Update the plain-Markdown push test so it asserts there is no post-push pullback:

```ts
test("pushWorkspaceDoc keeps plain markdown after a successful overwrite push", async () => {
  const snapshot = createSnapshot();
  const nodeToken = "node_1";
  const resolvedDocId = "doc_1";
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-no-patch-"));
  let remoteMarkdown = "# Remote Doc";
  let remoteRevisionId = "1";
  let convertCalls = 0;
  let deleteCalls = 0;
  let createCalls = 0;
  let bundleReads = 0;

  try {
    const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
    const runtime = createRuntimeWithContentSource(
      snapshot,
      {
        readDocumentContent: async (_accessToken, docId) => createContentView(docId, "Remote Doc", remoteMarkdown),
        readDocumentBundle: async (_accessToken, docId) => {
          bundleReads += 1;
          if (bundleReads === 1) {
            return {
              content: createContentView(resolvedDocId, "Remote Doc", remoteMarkdown),
              ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown, remoteRevisionId),
              source: {
                ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
                document: {
                  document_id: resolvedDocId,
                  title: "Remote Doc",
                  revision_id: remoteRevisionId,
                },
              },
            };
          }

          throw new Error("push should not re-read remote content after a successful markdown overwrite");
        },
      },
      workspaceQuery,
      async (url, init) => {
        const target = new URL(String(url));
        if (target.pathname === "/open-apis/docx/v1/documents/blocks/convert") {
          convertCalls += 1;
          return new Response(JSON.stringify({
            code: 0,
            data: {
              first_level_block_ids: ["tmp_h1", "tmp_b1"],
              blocks: [
                {
                  block_id: "tmp_h1",
                  block_type: 3,
                  heading1: {
                    elements: [{
                      text_run: {
                        content: "Edited Remote Doc",
                      },
                    }],
                  },
                },
                {
                  block_id: "tmp_b1",
                  block_type: 12,
                  bullet: {
                    elements: [{
                      text_run: {
                        content: "item",
                      },
                    }],
                  },
                },
              ],
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/children/batch_delete`) {
          deleteCalls += 1;
          return new Response(JSON.stringify({
            code: 0,
            data: {
              document_revision_id: 2,
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/descendant`) {
          createCalls += 1;
          remoteMarkdown = "# Edited Remote Doc\n\n- item";
          remoteRevisionId = "3";

          return new Response(JSON.stringify({
            code: 0,
            data: {
              document_revision_id: 3,
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        throw new Error(`unexpected fetch url: ${String(url)}`);
      },
    );

    await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

    const pushed = await runtime.pushWorkspaceDoc({
      workspaceId: "ws_1",
      docId: nodeToken,
      title: "Remote Doc",
      markdown: "# Edited Remote Doc\n\n- item",
      force: true,
    });

    expect(convertCalls).toBe(1);
    expect(deleteCalls).toBe(1);
    expect(createCalls).toBe(1);
    expect(bundleReads).toBe(1);
    expect(pushed.pushStatus).toBe("succeeded");
    expect(pushed.item.markdown).toBe("# Edited Remote Doc\n\n- item");
    expect(pushed.item.cache?.hasLocalChanges).toBe(false);

    const cached = await runtime.getWorkspaceDocLocalDraft({ workspaceId: "ws_1", docId: nodeToken });
    expect(cached.markdown).toBe("# Edited Remote Doc\n\n- item");
    expect(cached.cache?.hasLocalChanges).toBe(false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

Expected: FAIL because the plain-Markdown branch still calls `refreshWorkspaceDocAfterPush(...)` and attempts a second remote read.

- [ ] **Step 3: Write minimal implementation**

In `tryPushWorkspaceDocAsMarkdown(...)`, replace the post-push refresh call with the local settlement helper:

```ts
const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
  workspaceId: input.workspaceId,
  docId: input.docId,
  title: input.pushTitle,
  markdown: input.draftMarkdown,
  existing: input.fallbackItem,
  ir: expectedIr,
});

return {
  item: settled,
  pushStatus: "succeeded",
};
```

After both push paths stop using remote confirmation, delete these methods entirely:

```ts
private doesPushRefreshMatchExpected(...) { ... }
private async refreshWorkspaceDocAfterPush(...) { ... }
```

There should be no remaining `refreshWorkspaceDocAfterPush(...)` call from `pushWorkspaceDoc(...)` or `tryPushWorkspaceDocAsMarkdown(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

Expected: PASS for both push-only success tests and no failures in the file at this stage.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
git commit -m "feat: drop feishu push confirmation pullback"
```

### Task 3: Keep Repeated Pushes Working Without An Explicit Pull

**Files:**
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
- Modify: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`
- Test: `apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/action-handlers/docs-domain-action-handler.test.ts`

- [ ] **Step 1: Write the failing regression test**

Add a second-push regression that proves the runtime must stop reusing the old pulled revision after a successful local push:

```ts
test("pushWorkspaceDoc can overwrite the same markdown doc twice without an explicit pull", async () => {
  const snapshot = createSnapshot();
  const nodeToken = "node_1";
  const resolvedDocId = "doc_1";
  const workspaceRoot = await mkdtemp(join(tmpdir(), "maomi-feishu-doc-push-repeat-"));
  let remoteMarkdown = "# Remote Doc";
  let remoteRevisionId = "1";
  let bundleReads = 0;
  const deleteRevisionIds: string[] = [];

  try {
    const workspaceQuery = createWorkspaceQuery("ws_1", workspaceRoot);
    const runtime = createRuntimeWithContentSource(
      snapshot,
      {
        readDocumentContent: async (_accessToken, docId) => createContentView(docId, "Remote Doc", remoteMarkdown),
        readDocumentBundle: async (_accessToken, docId) => {
          bundleReads += 1;
          if (bundleReads === 1) {
            return {
              content: createContentView(resolvedDocId, "Remote Doc", remoteMarkdown),
              ir: createDocumentIRWithText(resolvedDocId, "Remote Doc", remoteMarkdown, remoteRevisionId),
              source: {
                ...createSourceSnapshot(nodeToken, "Remote Doc", resolvedDocId),
                document: {
                  document_id: resolvedDocId,
                  title: "Remote Doc",
                  revision_id: remoteRevisionId,
                },
              },
            };
          }

          throw new Error("push should not pull remote content after the initial open");
        },
      },
      workspaceQuery,
      async (url, init) => {
        const target = new URL(String(url));
        if (target.pathname === "/open-apis/docx/v1/documents/blocks/convert") {
          const content = String(JSON.parse(String(init?.body)).content);
          const heading = content.includes("Second Push") ? "Second Push" : "First Push";

          return new Response(JSON.stringify({
            code: 0,
            data: {
              first_level_block_ids: ["tmp_h1"],
              blocks: [{
                block_id: "tmp_h1",
                block_type: 3,
                heading1: {
                  elements: [{
                    text_run: {
                      content: heading,
                    },
                  }],
                },
              }],
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/children/batch_delete`) {
          deleteRevisionIds.push(target.searchParams.get("document_revision_id") ?? "");
          remoteRevisionId = String(Number(remoteRevisionId) + 1);

          return new Response(JSON.stringify({
            code: 0,
            data: {
              document_revision_id: Number(remoteRevisionId),
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        if (target.pathname === `/open-apis/docx/v1/documents/${resolvedDocId}/blocks/${resolvedDocId}/descendant`) {
          const heading = JSON.parse(String(init?.body)).descendants[0].heading1.elements[0].text_run.content;
          remoteMarkdown = `# ${heading}`;
          remoteRevisionId = String(Number(remoteRevisionId) + 1);

          return new Response(JSON.stringify({
            code: 0,
            data: {
              document_revision_id: Number(remoteRevisionId),
            },
          }), { status: 200, headers: { "content-type": "application/json" } });
        }

        throw new Error(`unexpected fetch url: ${String(url)}`);
      },
    );

    await runtime.openWorkspaceDoc({ workspaceId: "ws_1", docId: nodeToken });

    const first = await runtime.pushWorkspaceDoc({
      workspaceId: "ws_1",
      docId: nodeToken,
      title: "Remote Doc",
      markdown: "# First Push",
      force: true,
    });

    const second = await runtime.pushWorkspaceDoc({
      workspaceId: "ws_1",
      docId: nodeToken,
      title: "Remote Doc",
      markdown: "# Second Push",
      force: true,
    });

    expect(first.pushStatus).toBe("succeeded");
    expect(second.pushStatus).toBe("succeeded");
    expect(deleteRevisionIds).toEqual(["1", "-1"]);
    expect(second.item.markdown).toBe("# Second Push");
    expect(second.item.cache?.hasLocalChanges).toBe(false);
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

Expected: FAIL because the second overwrite still reuses the old pulled revision, so `deleteRevisionIds` remains `["1", "1"]`.

- [ ] **Step 3: Refine the local settlement helper to persist a revision-neutral pushed baseline**

Add helpers that clear revision constraints in the local pushed baseline, then persist both IR and source baselines through the existing workspace cache writers:

```ts
private createLocallyPushedIrBaseline(ir: FeishuDocIR): FeishuDocIR {
  return {
    ...ir,
    document: {
      ...ir.document,
      revisionId: "",
    },
  };
}

private createLocallyPushedSourceBaseline(
  source: FeishuDocSourceSnapshot | null,
  title: string,
): FeishuDocSourceSnapshot | null {
  if (!source) {
    return null;
  }

  return {
    ...source,
    fetchedAt: new Date().toISOString(),
    document: {
      ...source.document,
      title,
      revision_id: "",
    },
  };
}
```

Then update `settleWorkspaceDocAfterSuccessfulPush(...)` to use them:

```ts
if (workspaceRoot) {
  await this.persistWorkspaceOriginalMarkdown({
    workspaceRoot,
    docId: input.docId,
    markdown: input.markdown,
  });

  if (input.ir) {
    await this.persistWorkspaceIR({
      workspaceRoot,
      docId: input.docId,
      ir: this.createLocallyPushedIrBaseline(input.ir),
    });
  }

  const pushedSource = this.createLocallyPushedSourceBaseline(input.source ?? null, input.title);
  if (pushedSource) {
    await this.persistWorkspaceSource({
      workspaceRoot,
      docId: input.docId,
      source: pushedSource,
    });
  }
}
```

Also update the helper call sites so they pass source metadata:

```ts
const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
  workspaceId: input.workspaceId,
  docId: input.docId,
  title: pushTitle,
  markdown: item.markdown,
  existing: decorated,
  ir: compile.current,
  source: sourceState?.document?.snapshot ?? sourceState?.base?.snapshot ?? null,
});
```

```ts
const settled = await this.settleWorkspaceDocAfterSuccessfulPush({
  workspaceId: input.workspaceId,
  docId: input.docId,
  title: input.pushTitle,
  markdown: input.draftMarkdown,
  existing: input.fallbackItem,
  ir: expectedIr,
  source: input.sourceState?.document?.snapshot ?? input.sourceState?.base?.snapshot ?? null,
});
```

- [ ] **Step 4: Run the targeted regression suite**

Run: `bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts`

Expected: PASS with 0 failures, including both push-only tests and the repeated-push regression.

Run: `bun test apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/action-handlers/docs-domain-action-handler.test.ts`

Expected: PASS with 0 failures, proving downstream blocked/completed summaries still work without any action-handler code change.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.ts apps/desktop/MaomiAgent/src/bun/modules/feishu/implementation/services/desktop-feishu-doc-runtime.test.ts
git commit -m "feat: keep feishu pushes repeatable without pull"
```
