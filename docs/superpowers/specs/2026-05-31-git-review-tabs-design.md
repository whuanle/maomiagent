# Git Review Tabs Design

Date: 2026-05-31
Status: Draft for review
Owner: Codex

## Context

The current Git module exposes one top-level tab for AI review:

- `AI审查代码` / `AI Code Review`

Inside that tab, the page switches between two different modes in one workbench:

- `Git 审查` / `Git review`
- `全项目分析` / `Project analysis`

The current implementation lives mainly in:

- `apps/desktop/MaomiAgent/src/mainview/modules/git/page.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/git/git-page-ui-state.ts`
- `apps/desktop/MaomiAgent/src/mainview/modules/git/i18n.ts`
- `apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-ai-review-workbench-next.tsx`

That structure is now mismatched with the intended product meaning.

The user requirement is to split one vague AI-review entry into two explicit top-level tasks:

- `Commit 审查`
  - review one commit
  - review one PR
  - review current uncommitted changes
- `代码审查`
  - analyze the whole project by default
  - support narrowing to directory or file
  - focus on architecture, design, patterns, maintainability, testing, performance, and security issues

This is not just a copy update. The current page mixes commit-scoped review state and project-scoped analysis state inside one component tree and one persistence model.

## Goals

- Replace the single `AI审查代码` top-level tab with two explicit top-level tabs:
  - `Commit 审查`
  - `代码审查`
- Make `Commit 审查` responsible only for commit-like review targets:
  - current changes
  - single commit
  - PR
- Make `代码审查` responsible only for project-scope analysis:
  - whole project by default
  - optionally narrowed to directory or file
- Split page state, copy, and result models so commit-level and project-level review no longer share one page-mode toggle.
- Preserve reusable lower-level review capabilities where they still fit:
  - diff preview
  - review finding rendering
  - markdown export
  - AI execution and rule fallback

## Non-Goals

- This work does not redesign the Git `变更` or `分支` tabs.
- This work does not build a new dashboard, overview cards, stats cards, or explanatory landing state.
- This work does not redesign the desktop Git snapshot bridge itself.
- This work does not require a full review-domain rewrite across backend and frontend.
- This work does not require completing every possible PR integration source in phase one; it only requires that PR be treated as a first-class review target in the page model.

## Problem

The current single-tab design creates four product and implementation problems.

### 1. The top-level navigation is semantically vague

`AI审查代码` groups together two tasks with different user intent:

- reviewing one change set before merge
- studying the project as a whole

Users have to enter one broad bucket and then learn an internal mode split that does not match their goal.

### 2. The current workbench mixes two review units

Commit review is organized around:

- one review target
- changed files
- diff-based findings

Project review is organized around:

- one scope
- project files or tree
- issue-based findings

Those are different units of work and should not be modeled as one `mode` switch inside one workbench.

### 3. Copy and result framing leak across modes

The current workbench still carries mixed terminology such as:

- `Git 审查`
- `全项目分析`
- `提交列表`
- `审查列表`
- `提交代码`
- `代码`

This makes it easy for commit-review copy to appear in project-analysis flows and vice versa.

### 4. Shared page state encourages future coupling

The current UI state stores a single `ai-review` tab and shared review selections. That makes it harder to:

- restore the correct context for each review task
- add more commit-review entry points later
- evolve project-analysis filters independently

## Approaches Considered

### A. Keep one AI-review tab and move the mode toggle elsewhere

Keep `AI审查代码` as one top-level tab and keep one large workbench component, but adjust internal navigation.

Pros:

- smallest code change
- lowest short-term migration risk

Cons:

- preserves the core semantic problem
- keeps state and copy coupled
- makes future feature growth harder

### B. Split into two top-level tabs and two workbenches

Replace `AI审查代码` with:

- `Commit 审查`
- `代码审查`

Keep shared execution and presentation helpers where useful, but split the page-level state and page components.

Pros:

- directly matches user mental model
- fixes the current navigation ambiguity
- limits refactor scope to the Git module page and review workbenches
- keeps room for future PR and architecture-review growth

Cons:

- requires state migration and copy reorganization
- requires some helper extraction from the current large component

### C. Fully redesign review domain boundaries first

Before changing the UI, redesign a broader review domain with separate target, scope, execution, and presentation layers.

Pros:

- cleanest long-term architecture

Cons:

- too large for the current need
- risks turning one page correction into a subsystem rewrite

## Recommendation

Choose Approach B.

The user intent has already become clear:

- `Commit 审查` is a change-set review surface
- `代码审查` is a project-analysis surface

That should be reflected at the first navigation level, not hidden behind one generic AI-review bucket. A page-level split gives the right product semantics without expanding scope into a full system redesign.

## Proposed Design

### 1. Top-level navigation

The Git module top-level tabs become:

- `变更`
- `分支`
- `Commit 审查`
- `代码审查`

The old `AI审查代码` tab is removed.

`GitPage` remains responsible for:

- workspace selection
- refresh
- top-level tab switching
- page-level state persistence

`GitPage` no longer owns an internal AI-review mode concept.

### 2. Commit review information architecture

`Commit 审查` is a review surface for one review target.

Supported target types:

- `当前更改`
- `单个提交`
- `PR`

The page uses a resource-style workbench layout with no landing dashboard and no explanatory cards.

Toolbar order, left to right:

- target type selector
- target selector or entry control
- search
- filter
- `开始审查`
- `重新审查`
- `导出 Markdown`

Main workspace layout:

- left: review target list or target context
- center: changed-file list and diff context
- right: review findings and code detail

Behavior by target type:

- `当前更改`
  - left side anchors the current uncommitted workspace state
  - center shows staged and unstaged file changes
  - right shows findings for the current change set
- `单个提交`
  - left shows commit history list
  - center shows files from the selected commit
  - right shows review findings for that commit
- `PR`
  - left shows PR list or PR entry affordance
  - center shows PR file changes
  - right shows review findings for that PR

Result language in this tab must stay commit-scoped:

- `审查意见`
- `问题`
- `建议`
- `提交`
- `PR`
- `当前更改`

It must not use project-analysis framing such as `全项目分析` or `项目范围`.

### 3. Code review information architecture

`代码审查` is a project-analysis surface.

Default entry behavior:

- open directly on `整个项目`
- allow narrowing to `指定目录` or `指定文件`

Toolbar order, left to right:

- scope selector
- search
- issue-type filter
- severity filter
- `开始审查`
- `重新审查`
- `导出 Markdown`

Main workspace layout:

- left: project tree or scoped result tree
- center: issue list
- right: issue detail and code preview

This page is issue-centered rather than file-centered.

Each issue should carry enough structure to answer:

- what kind of project-level problem is this
- how severe is it
- where is it located
- what evidence supports it
- what change direction is recommended

Initial issue categories should follow project-review semantics:

- `架构设计`
- `模块边界`
- `模式使用`
- `可维护性`
- `质量风险`
- `测试缺口`
- `性能/资源`
- `安全`

The old diff-centric category framing should not drive this page.

Empty state behavior must stay minimal:

- if no review has run yet, show only the primary action entry
- do not add overview cards or promotional explanation copy

### 4. Component boundaries

Replace the current single review workbench entry with two independent page components:

- `apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-commit-review-workbench.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-code-review-workbench.tsx`

The current `git-ai-review-workbench-next.tsx` should not remain the long-term page entry point.

Reusable lower-level pieces may stay shared if they are genuinely cross-surface:

- diff preview and diff rendering
- finding normalization and sorting
- markdown export helpers
- AI execution and rule-fallback helpers
- generic detail rendering blocks

Page-level state, page-level copy, and page-level layout must be separated.

### 5. State model and persistence

`git-page-ui-state.ts` should evolve from one shared AI-review selection model to a top-level tab plus per-surface memory model.

Persisted state should include:

- selected workspace
- active top-level Git tab
- recent `Commit 审查` target type and selection
- recent `Commit 审查` selected file and finding
- recent `代码审查` scope and selection
- recent `代码审查` selected issue

This allows users to return to the last meaningful context in each surface without restoring a mixed internal `mode`.

### 6. Copy split

`i18n.ts` should no longer expose only one `aiReviewTab`.

It should split review entry copy into explicit tab labels and surface-specific strings, including at minimum:

- `commitReviewTab`
- `codeReviewTab`

And dedicated copy groups for:

- commit review target labels, empty states, actions, status messages, export titles
- code review scope labels, issue categories, empty states, actions, status messages, export titles

This prevents commit-review and project-review wording from bleeding into each other.

### 7. Data flow

#### Commit review

Data flow:

1. read workspace and Git snapshot context
2. resolve review target type:
   - current changes
   - commit
   - PR
3. load the target-specific diff or file list
4. execute review with AI and fallback rules as needed
5. map results into file-scoped findings and details

Error handling:

- target load failure should preserve current page context and show a minimal retry path
- review execution failure should not clear the selected target
- partial file failures should still land partial results with a compact status message

#### Code review

Data flow:

1. read project tree context
2. resolve scope:
   - whole project
   - directory
   - file
3. load content for the selected scope
4. execute project review with AI and fallback rules as needed
5. map results into issue-centered lists, scope distribution, and detailed explanations

Error handling:

- scope-load failure should preserve the current scope choice
- analysis failure should not reset the issue list if a previous run exists
- partial file-read failures should still allow a partial project report

### 8. Export behavior

Markdown export should split into two report shapes:

- `Commit 审查报告`
- `代码审查报告`

`Commit 审查报告` should organize content by:

- target type
- target identity
- changed files
- findings

`代码审查报告` should organize content by:

- review scope
- issue category
- issue severity
- affected paths

The report type should match the page the user is currently using.

### 9. Migration strategy

Phase one should favor a clean page split over long-lived dual wiring.

Recommended sequence:

1. add the new top-level tabs and new tab keys
2. introduce the two new review workbench components
3. move commit-review logic into `git-commit-review-workbench.tsx`
4. move project-review logic into `git-code-review-workbench.tsx`
5. extract only the helpers that are truly shared
6. update UI-state persistence to the new tab and review-surface model
7. remove the old internal review `mode` switch
8. remove the old `AI审查代码` tab entry and obsolete mixed copy

Do not keep both the old internal mode switch and the new top-level split for an extended period. That would preserve duplication and coupling.

## Testing

Add or update tests to cover at least:

1. top-level Git tab switching:
   - `变更`
   - `分支`
   - `Commit 审查`
   - `代码审查`
2. persisted UI state restores the correct top-level tab
3. `Commit 审查` target-type switching:
   - current changes
   - single commit
   - PR
4. `代码审查` scope switching:
   - whole project
   - directory
   - file
5. copy separation:
   - commit-review labels do not appear in code-review flows
   - code-review labels do not appear in commit-review flows
6. partial-failure handling:
   - partial results remain visible
   - retry actions remain available
7. markdown export shape:
   - commit review exports commit-shaped reports
   - code review exports issue-shaped reports

## Risks

### 1. UI-state migration breakage

Changing top-level tab keys and persisted review state may invalidate old session values. The new state reader should handle unknown old values defensively and fall back to a safe default tab.

### 2. Hidden helper coupling in the current large workbench

The existing mixed workbench may contain helpers that implicitly assume one shared `mode`. Those assumptions need to be removed during extraction rather than preserved by adapter glue.

### 3. File-centered assumptions leaking into project review

The current project analysis code may still assume file-centered rendering. The new page should be issue-centered even if some lower-level data collection remains file-based internally.

### 4. PR data-source completeness

The page model should support PR as a first-class target from day one, but some PR target-source details may remain incremental depending on existing Git integration coverage.

## Acceptance

This work is complete when:

1. the Git module top-level tabs show `Commit 审查` and `代码审查` instead of `AI审查代码`
2. `Commit 审查` and `代码审查` render as separate workbench surfaces with separate state and copy
3. `Commit 审查` supports current changes, single commit, and PR as explicit target types
4. `代码审查` defaults to whole-project review and allows narrowing to directory or file
5. persisted UI state restores each review surface independently without relying on an internal mixed review mode
6. markdown export follows the correct report type for each review surface
7. targeted UI tests and typecheck pass
