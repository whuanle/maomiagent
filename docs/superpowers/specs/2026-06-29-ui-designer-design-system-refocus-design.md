# UI Designer Design System Refocus Design

Date: 2026-06-29

## Goal

修正 `UI 设计师` 模块的产品定位与阶段流转，使它回到“为项目沉淀设计系统”的主目标：

1. 主线产物聚焦主题、样式、布局、组件规范、页面骨架和设计规格书。
2. 保留 `设计稿预览壳`、`组件展示壳`、`最小业务示例壳`，但它们只作为设计验证产物，不再主导模块心智。
3. 修复“已有项目范围或已有设计内容，但点击开始设计后仍显示全部未确认”的状态问题。

## User-approved direction

已经确认按下面的方向收敛：

- 模块不再默认走向“完整系统生成”或“完整项目交付”。
- 三类轻壳产物都保留：
  - `设计稿预览壳`
  - `组件展示壳`
  - `最小业务示例壳`
- 默认推进顺序以 `设计系统基线` 为先，再扩展到组件、布局和轻壳验证。

## Confirmed findings

### Current agent prompt still biases toward full project specification

内置 `UI 设计师` prompt 位于 [apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts:114)。

当前文案把目标定义成“可运行模板项目规格”和“项目骨架”，这会把会话稳定推向更完整的工程交付，而不是先收敛设计系统。

### Stage goals still overemphasize project completion instead of design-system convergence

阶段 schema 服务位于 [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/stage-schema-service.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/stage-schema-service.ts:72)。

虽然已有 `scope/theme/patterns/layouts/pages/spec` 这些设计包文件，但当前阶段目标仍然把页面、范围和规格组织得更像完整项目规划流程，而不是“设计系统主线 + 轻壳验证层”。

### Project scope is saved, but status display depends on unstable interpretation across stages

项目范围表单提交逻辑位于 [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/hooks/use-ui-designer-shell-state.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/hooks/use-ui-designer-shell-state.ts:1621)。

这里会把范围稳定写入 `design/scope.json`，字段来自 [project-scope-flow.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/project-scope-flow.ts:1) 中定义的：

- `projectType`
- `businessType`
- `targetPlatform`
- `currentObjective`
- `deliverySummary`

但阶段展示与后续阶段结果没有严格围绕同一套字段和同一套状态规则持续解析，因此容易出现“数据已经存在，但界面仍按未确认渲染”的错位。

### Current stage model structure can be retained, but semantics need to be tightened

阶段详情解析位于 [stage-view-model-resolver.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/stage-view-model-resolver.ts:221)。

现有文件结构与 fallback 思路本身可复用，不需要推翻设计包目录；真正需要修改的是：

- 阶段数量与语义
- 字段归一化规则
- `开始设计` 的默认推进逻辑
- 右侧详情与中间摘要的统一状态口径

## Non-goals

- 不把 `UI 设计师` 退化成纯聊天页或纯文档编辑器。
- 不在本次改造里引入新的复杂双模式工作台。
- 不新增完整业务项目生成流程。
- 不推翻现有设计包目录结构。
- 不在本次改造里定义所有视觉细节或完整组件资产，只收敛工作流、状态与产物边界。

## Recommended approach

采用“设计系统主导，多产物挂靠”的最小收敛方案。

### 1. Reposition the module around design-system outputs

把模块主目标明确改为：

- 为当前项目沉淀一套可复用的设计系统结论。
- 输出主题基线、样式规范、布局规范、组件模式、页面骨架和设计规格书。
- 用三类轻壳产物验证设计结论，而不是承诺完整业务系统交付。

禁止默认滑向以下心智：

- 完整项目脚手架
- 全量业务页面生成
- 完整系统设计与完整项目交付

### 2. Collapse the workflow into five primary stages

把当前偏散的阶段收敛为 5 个主阶段：

1. `项目范围确认`
2. `设计系统基线`
3. `组件与交互模式`
4. `页面骨架与验证壳`
5. `设计规格整理`

含义调整如下：

- `技术栈确认` 不再作为单独主阶段膨胀存在，而是降级为设计系统落地约束，主要挂到 `设计系统基线`。
- `页面与模块确认` 不再表达“完整页面清单”，而是表达页面骨架和三类轻壳验证内容。
- 三类轻壳始终从属于设计系统验证，不再成为新的项目主线。

### 3. Keep the existing design package files, but tighten their meaning

继续沿用现有设计包文件：

- `design/scope.json`
- `design/theme.json`
- `design/patterns.json`
- `design/layouts.json`
- `design/pages.json`
- `design/design-spec.md`
- `design/sources.md`

但从这次改造开始，统一语义：

- `scope.json` 只描述项目范围、目标平台、当前目标和交付范围。
- `theme.json` 成为设计系统主文件，承载主题、token、视觉基线、排版、密度、间距、状态色与落地约束。
- `patterns.json` 承载组件模式和交互规则。
- `layouts.json` 承载导航结构、页面骨架、内容布局和响应策略。
- `pages.json` 承载三类轻壳和极少量页面骨架样例，而不是完整页面清单。
- `design-spec.md` 承载最终设计规格整理结果。

### 4. Unify status resolution and never wipe recognized progress on start

`开始设计` 或后续阶段入口必须遵循统一规则：

- 如果 `scope.json` 未确认，则优先进入 `项目范围确认`。
- 如果 `scope.json` 已确认，则默认进入 `设计系统基线` 或第一个未完成阶段。
- 不允许因为某个下游文件为空，就把上游已确认阶段重新渲染为“未开始”。
- 不允许在已有设计包存在时，隐式用空状态覆盖当前已识别内容。

项目范围阶段的统一状态规则：

- 只认 `scope.json` 为主真相源。
- 只要 `projectType`、`businessType`、`targetPlatform` 里任意一项存在，就不能是 `empty`。
- 当三项齐全时，状态至少应为“已开始且已确认基础范围”，最多是“待补充”，不能回落到“未开始”。
- `currentObjective` 和 `deliverySummary` 只影响完整度，不影响是否已开始。

### 5. Preserve compatibility on read, standardize structure on write

兼容策略分成两层：

读取层：

- 右侧详情与中间摘要优先读取统一后的新字段。
- 如果新字段缺失，则回退读取旧字段、旧 markdown 章节或旧结构里的同义字段。
- 单文件解析失败时，只影响当前阶段，不拖垮整条流程。

写入层：

- 从这次改造开始，所有新结果写成统一字段。
- 项目范围稳定写入：
  - `projectType`
  - `businessType`
  - `targetPlatform`
  - `currentObjective`
  - `deliverySummary`
- 其他阶段也逐步采用稳定字段，不允许不同阶段对同一含义各写一套不同键名。

## Affected surfaces

- [apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/bun/modules/agents/implementation/services/builtin-agents.ts)
- [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/stage-schema-service.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/stage-schema-service.ts)
- [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/stage-view-model-resolver.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/stage-view-model-resolver.ts)
- [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/project-scope-flow.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/services/project-scope-flow.ts)
- [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/hooks/use-ui-designer-shell-state.ts](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/hooks/use-ui-designer-shell-state.ts)
- [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/components/designer-flow-panel.tsx](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/components/designer-flow-panel.tsx)
- [apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/components/stage-detail-panel.tsx](/f:/workspace/MaomiAgent/apps/desktop/MaomiAgent/src/mainview/modules/ui-designer/components/stage-detail-panel.tsx)

## UI behavior changes

### Primary flow panel

- 中间主流程只展示 5 个主阶段。
- 阶段标题改为更偏设计产物，而不是工程交付。
- `开始设计` 的后续状态文案建议改为 `继续完善`，弱化“重新设计”的重置感。

### Detail panel

- 右侧详情只展示当前阶段已经确认的设计结论与待补充项。
- 详情面板与中间摘要必须共用同一套状态解析结果。

### Error handling

- 设计包中单个文件解析失败时，当前阶段显示 `待补充`，并通过 `message` 做最小必要提示。
- 其余阶段继续显示已识别结果，禁止整页一起掉回“全部未确认”。

## Validation

1. 补状态解析测试，确认已有 `scope.json` 且关键字段存在时，`项目范围确认` 不会回到 `empty`。
2. 补续写流程测试，确认点击 `开始设计` 时，已有范围会直接推进到 `设计系统基线` 或第一个未完成阶段。
3. 补兼容读取测试，确认旧字段或 markdown fallback 仍能在摘要和详情里读出已确认结果。
4. 更新阶段文案与按钮文案测试，确认新阶段名称和 `继续完善` 行为符合“设计系统主导”定位。
5. 补单文件损坏容错测试，确认 `pages.json` 或其他单文件损坏时，不会把所有阶段一起打回未确认。

## Risks

- 旧设计包如果长期依赖非常松散的阶段字段，第一次进入新解析逻辑时，部分阶段可能从“已完成”降为“待补充”；这是更严格的状态收敛，不是数据丢失。
- 现有 prompt 与阶段 schema 的联动较深，若只改 UI 不改 prompt，模块仍会被模型拉回“完整项目”方向，因此需要同时修改提示词、阶段语义和状态解析。
- 如果后续仍保留“正式生成项目”相关文案而不调整语义，用户心智会继续混乱。

## Decision

本次采用“设计系统主导，多产物挂靠，但不默认扩展为完整项目生成”的收敛方案。

实现时优先完成三件事：

1. 调整 `UI 设计师` prompt 与阶段语义。
2. 把主流程收敛为 5 个主阶段。
3. 统一 `scope.json` 与阶段状态解析，确保已有范围和已有设计内容不会被错误重置为未确认。
