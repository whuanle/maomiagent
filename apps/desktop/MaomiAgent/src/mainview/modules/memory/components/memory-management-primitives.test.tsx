import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createMemoryTranslator } from "../i18n";
import { createMemoryColumns } from "./table-columns";
import { MemoryPageLayout } from "./page-layout";
import { MemoryToolbar } from "./toolbar";

const t = createMemoryTranslator("zh-CN");

describe("memory management primitives", () => {
  test("toolbar renders record controls without legacy modal entry points", () => {
    const markup = renderToStaticMarkup(
      <>
        <MemoryToolbar
          activeEntry="records"
          scopeFilter="all"
          workspaceIdInput=""
          workspaceOptions={[{ label: "Workspace A (workspace-a)", value: "workspace-a" }]}
          kindFilter="all"
          tierFilter="all"
          statusFilter="all"
          loading={false}
          organizeDays="30"
          queryText=""
          refreshing={false}
          searchQuery=""
          searchLoading={false}
          searchTopK="10"
          t={t}
          onActiveEntryChange={() => undefined}
          onCreate={() => undefined}
          onKindFilterChange={() => undefined}
          onOrganizeDaysChange={() => undefined}
          onQueryTextChange={() => undefined}
          onRefresh={() => undefined}
          onRunOrganize={() => undefined}
          onRunSearch={() => undefined}
          onSearchQueryChange={() => undefined}
          onSearchTopKChange={() => undefined}
          onScopeFilterChange={() => undefined}
          onStatusFilterChange={() => undefined}
          onTierFilterChange={() => undefined}
          onWorkspaceIdInputChange={() => undefined}
        />
        <MemoryToolbar
          activeEntry="records"
          scopeFilter="global"
          workspaceIdInput=""
          workspaceOptions={[{ label: "Workspace A (workspace-a)", value: "workspace-a" }]}
          kindFilter="all"
          tierFilter="all"
          statusFilter="all"
          loading={false}
          organizeDays="30"
          queryText=""
          refreshing={false}
          searchQuery=""
          searchLoading={false}
          searchTopK="10"
          t={t}
          onActiveEntryChange={() => undefined}
          onCreate={() => undefined}
          onKindFilterChange={() => undefined}
          onOrganizeDaysChange={() => undefined}
          onQueryTextChange={() => undefined}
          onRefresh={() => undefined}
          onRunOrganize={() => undefined}
          onRunSearch={() => undefined}
          onSearchQueryChange={() => undefined}
          onSearchTopKChange={() => undefined}
          onScopeFilterChange={() => undefined}
          onStatusFilterChange={() => undefined}
          onTierFilterChange={() => undefined}
          onWorkspaceIdInputChange={() => undefined}
        />
        <MemoryToolbar
          activeEntry="records"
          scopeFilter="workspace"
          workspaceIdInput="workspace-a"
          workspaceOptions={[{ label: "Workspace A (workspace-a)", value: "workspace-a" }]}
          kindFilter="all"
          tierFilter="all"
          statusFilter="all"
          loading={false}
          organizeDays="30"
          queryText=""
          refreshing={false}
          searchQuery=""
          searchLoading={false}
          searchTopK="10"
          t={t}
          onActiveEntryChange={() => undefined}
          onCreate={() => undefined}
          onKindFilterChange={() => undefined}
          onOrganizeDaysChange={() => undefined}
          onQueryTextChange={() => undefined}
          onRefresh={() => undefined}
          onRunOrganize={() => undefined}
          onRunSearch={() => undefined}
          onSearchQueryChange={() => undefined}
          onSearchTopKChange={() => undefined}
          onScopeFilterChange={() => undefined}
          onStatusFilterChange={() => undefined}
          onTierFilterChange={() => undefined}
          onWorkspaceIdInputChange={() => undefined}
        />
      </>,
    );

    expect(markup).toContain("手动添加");
    expect(markup).toContain("记忆记录");
    expect(markup).toContain("理解记忆");
    expect(markup).toContain("整理记忆");
    expect(markup).toContain("全部记忆");
    expect(markup).toContain("仅全局记忆");
    expect(markup).toContain("仅工作区记忆");
    expect(markup).not.toContain("更多工具");
    expect(markup).not.toContain("运行中的记忆");
    expect(markup).not.toContain("当前：全局记忆");
    expect(markup).not.toContain("包含全局记忆");
  });

  test("a single page shell render keeps exactly one top tab strip", () => {
    const markup = renderToStaticMarkup(
      <MemoryPageLayout
        toolbar={
          <MemoryToolbar
            activeEntry="records"
            scopeFilter="all"
            workspaceIdInput=""
            workspaceOptions={[{ label: "Workspace A (workspace-a)", value: "workspace-a" }]}
            kindFilter="all"
            tierFilter="all"
            statusFilter="all"
            loading={false}
            organizeDays="30"
            queryText=""
            refreshing={false}
            searchQuery=""
            searchLoading={false}
            searchTopK="10"
            t={t}
            onActiveEntryChange={() => undefined}
            onCreate={() => undefined}
            onKindFilterChange={() => undefined}
            onOrganizeDaysChange={() => undefined}
            onQueryTextChange={() => undefined}
            onRefresh={() => undefined}
            onRunOrganize={() => undefined}
            onRunSearch={() => undefined}
            onSearchQueryChange={() => undefined}
            onSearchTopKChange={() => undefined}
            onScopeFilterChange={() => undefined}
            onStatusFilterChange={() => undefined}
            onTierFilterChange={() => undefined}
            onWorkspaceIdInputChange={() => undefined}
          />
        }
        main={<div data-testid="memory-main">main</div>}
      />,
    );

    expect((markup.match(/memory-page-entry-tabs/g) ?? [])).toHaveLength(1);
    expect((markup.match(/记忆记录/g) ?? [])).toHaveLength(1);
    expect((markup.match(/理解记忆/g) ?? [])).toHaveLength(1);
    expect((markup.match(/整理记忆/g) ?? [])).toHaveLength(1);
  });

  test("workspace selector stays visible but only enables in workspace-only mode", () => {
    const disabledMarkup = renderToStaticMarkup(
      <MemoryToolbar
        activeEntry="records"
        scopeFilter="all"
        workspaceIdInput=""
        workspaceOptions={[{ label: "Workspace A (workspace-a)", value: "workspace-a" }]}
        kindFilter="all"
        tierFilter="all"
        statusFilter="all"
        loading={false}
        organizeDays="30"
        queryText=""
        refreshing={false}
        searchQuery=""
        searchLoading={false}
        searchTopK="10"
        t={t}
        onActiveEntryChange={() => undefined}
        onCreate={() => undefined}
        onKindFilterChange={() => undefined}
        onOrganizeDaysChange={() => undefined}
        onQueryTextChange={() => undefined}
        onRefresh={() => undefined}
        onRunOrganize={() => undefined}
        onRunSearch={() => undefined}
        onSearchQueryChange={() => undefined}
        onSearchTopKChange={() => undefined}
        onScopeFilterChange={() => undefined}
        onStatusFilterChange={() => undefined}
        onTierFilterChange={() => undefined}
        onWorkspaceIdInputChange={() => undefined}
      />,
    );
    const enabledMarkup = renderToStaticMarkup(
      <MemoryToolbar
        activeEntry="records"
        scopeFilter="workspace"
        workspaceIdInput="workspace-a"
        workspaceOptions={[{ label: "Workspace A (workspace-a)", value: "workspace-a" }]}
        kindFilter="all"
        tierFilter="all"
        statusFilter="all"
        loading={false}
        organizeDays="30"
        queryText=""
        refreshing={false}
        searchQuery=""
        searchLoading={false}
        searchTopK="10"
        t={t}
        onActiveEntryChange={() => undefined}
        onCreate={() => undefined}
        onKindFilterChange={() => undefined}
        onOrganizeDaysChange={() => undefined}
        onQueryTextChange={() => undefined}
        onRefresh={() => undefined}
        onRunOrganize={() => undefined}
        onRunSearch={() => undefined}
        onSearchQueryChange={() => undefined}
        onSearchTopKChange={() => undefined}
        onScopeFilterChange={() => undefined}
        onStatusFilterChange={() => undefined}
        onTierFilterChange={() => undefined}
        onWorkspaceIdInputChange={() => undefined}
      />,
    );

    expect(disabledMarkup).toMatch(/memory-page-workspace-select[^"]*ant-select-disabled/);
    expect(enabledMarkup).not.toMatch(/memory-page-workspace-select[^"]*ant-select-disabled/);
  });

  test("toolbar swaps to understand-memory controls for the understand tab", () => {
    const markup = renderToStaticMarkup(
      <MemoryToolbar
        activeEntry="understand"
        scopeFilter="workspace"
        workspaceIdInput="workspace-a"
        workspaceOptions={[{ label: "Workspace A (workspace-a)", value: "workspace-a" }]}
        kindFilter="all"
        tierFilter="all"
        statusFilter="all"
        loading={false}
        organizeDays="30"
        queryText=""
        refreshing={false}
        searchQuery="偏好"
        searchLoading={false}
        searchTopK="10"
        t={t}
        onActiveEntryChange={() => undefined}
        onCreate={() => undefined}
        onKindFilterChange={() => undefined}
        onOrganizeDaysChange={() => undefined}
        onQueryTextChange={() => undefined}
        onRefresh={() => undefined}
        onRunOrganize={() => undefined}
        onRunSearch={() => undefined}
        onSearchQueryChange={() => undefined}
        onSearchTopKChange={() => undefined}
        onScopeFilterChange={() => undefined}
        onStatusFilterChange={() => undefined}
        onTierFilterChange={() => undefined}
        onWorkspaceIdInputChange={() => undefined}
      />,
    );

    expect(markup).toContain("查看会想起什么");
    expect(markup).not.toContain("手动添加");
  });

  test("main table columns follow the management-first order", () => {
    const columns = createMemoryColumns({
      deletingUnitId: null,
      t,
      onDelete: () => undefined,
      onEdit: () => undefined,
      onView: () => undefined,
    });

    expect(columns.map((column) => String(column.key))).toEqual([
      "content",
      "kind",
      "scope",
      "updatedAt",
      "status",
      "actions",
    ]);
  });
});