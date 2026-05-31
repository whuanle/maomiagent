# Git 审查工作台缓存、分栏与进度优化设计

## 背景

当前 Git 审查工作台存在三个连续体验问题：

1. `Commit 审查` 和 `代码审查` 的结果只保存在前端内存 `Map` 中，页面切走或应用重启后无法恢复。
2. 左侧树形分栏默认过窄，层级较深时文件名和统计信息容易被挤压，而且用户无法自己调整宽度。
3. 审查运行中顶部显示 `正在分析 x / xx`，信息密度高但观感偏慢，缺少更直接的视觉反馈。

用户希望：

- Git 审查结果在重新打开页面和应用重启后仍可恢复。
- 缓存写入工作区内的 `.maomi` 目录，而不是仅存在本地浏览器存储。
- 左侧分栏默认更宽，并支持拖拽调整宽度。
- 审查进度改为百分比进度条。
- 旧结果在工作区发生变化时仍可查看，但要明确提示“结果可能已过期”。
- 用户始终可以主动重新开始审查并覆盖缓存。

## 目标

- 为 `Commit 审查` 和 `代码审查` 提供统一的工作区级持久缓存。
- 在不阻塞页面打开的前提下恢复上次审查结果。
- 用轻量状态签名识别缓存是否过期，并向用户显式提示。
- 把 Git 审查工作台改为可拖拽分栏布局，并记住用户上次调整后的宽度。
- 将运行中状态从文字计数切换为百分比进度条，同时保留最小必要的辅助信息。

## 非目标

- 不在本次设计中重做 AI 审查提示词、规则命中策略或问题文案本身。
- 不引入后台异步任务队列，也不做离线批处理。
- 不把分栏宽度同步到工作区 `.maomi`；宽度属于界面偏好，继续保存在前端本地状态。
- 不把“缓存过期检测”做成全量深度 diff 校验，避免打开页面时重新引入高成本扫描。

## 方案选择

### 方案 A：前端本地缓存

把现有内存缓存替换为 `localStorage` 或 `sessionStorage`，并把顶部状态改为进度条。

优点：

- 改动最少。
- 不需要新增桌面侧读写能力。

缺点：

- 不满足“缓存到工作区 `.maomi`”的要求。
- 无法自然随工作区迁移。
- 过期判断只能依赖前端局部状态，可信度有限。

### 方案 B：工作区 `.maomi` 持久缓存 + 轻量状态签名 + 可拖拽分栏

为桌面工作区桥接补充文本文件读写能力，把 Git 审查缓存落到 `.maomi/git-review/` 下。前端恢复缓存后，根据当前审查目标和轻量状态签名判断是否过期。工作台布局改为 `Ant Design Splitter`，支持拖拽并记住宽度。进度改为百分比进度条。

优点：

- 直接满足用户对 `.maomi` 持久缓存的要求。
- `Commit 审查` 和 `代码审查` 可以复用一套缓存协议。
- 支持应用重启后恢复，也能在工作区内部留存结果。
- 分栏和进度优化可以一次性收口。

缺点：

- 需要补一条新的工作区文件桥接能力。
- 需要设计缓存格式和过期规则。

### 方案 C：Git 模块专用缓存 RPC

仅为 Git 审查增加专用缓存读写 RPC，不扩展通用工作区文件桥接。

优点：

- Git 模块接口更聚焦。
- 可避免通用文件桥接过宽。

缺点：

- 会把工作区内文件持久化能力固化成 Git 私有实现。
- 后续其它模块若也要写 `.maomi`，仍需重复建设。

### 结论

采用方案 B。

原因：

- 它同时满足 `.maomi` 持久缓存、过期提示、拖拽分栏和进度优化四个核心诉求。
- 需要新增的桌面能力很小，只是把已有 `DesktopWorkspaceService.writeTextFile()` 对应能力补到主界面桥接层，不会引入过重的新基础设施。

## 总体设计

实现分成四块：

1. 工作区文件桥接扩展：为主界面补充读取和写入工作区文本文件的桥接接口。
2. Git 审查缓存协议：在 `.maomi/git-review/` 下定义统一的缓存目录、文件命名和缓存数据结构。
3. Git 审查工作台恢复与过期提示：页面启动时恢复缓存，运行新审查时刷新结果，并显式处理“可能已过期”状态。
4. 分栏与进度 UI：左栏改为可拖拽分栏，状态区改成百分比进度条。

## 数据设计

### 缓存目录

缓存根目录固定为：

```text
.maomi/git-review/
```

目录结构：

```text
.maomi/git-review/
  commit/
    <cache-key>.json
  code/
    <cache-key>.json
```

其中：

- `commit/` 存储 `Commit 审查`
- `code/` 存储 `代码审查`

### cache key 规则

缓存文件名使用稳定 key，并在落盘前做路径安全清洗。

`Commit 审查` 的 key 由以下信息组合：

- `surface=commit`
- 审查目标类型：`current`、`commit`、`pr`
- 目标标识：
  - `current`：固定标识 `staged`
  - `commit`：提交 hash
  - `pr`：`baseRef...headRef`

`代码审查` 的 key 由以下信息组合：

- `surface=code`
- scope 类型：`project`、`directory`、`file`
- scope 路径：
  - `project`：固定标识 `project`
  - `directory`：目录相对路径
  - `file`：文件相对路径

key 原始值经过哈希后作为文件名，避免路径过长和特殊字符问题。JSON 内保留可读的原始元数据，便于排查。

### 缓存内容

缓存内容统一使用 versioned JSON：

```json
{
  "version": 1,
  "surface": "commit",
  "workspaceId": "maomiagent-6c954376",
  "cacheKey": "commit::commit::abc123",
  "savedAt": "2026-06-01T10:00:00.000Z",
  "stale": false,
  "signature": {},
  "selection": {},
  "results": {}
}
```

字段语义：

- `version`：缓存协议版本，便于后续迁移。
- `surface`：`commit` 或 `code`。
- `workspaceId`：写入时的工作区 id，仅作辅助信息。
- `cacheKey`：原始逻辑 key。
- `savedAt`：缓存写入时间。
- `stale`：写入时固定为 `false`，读取时由当前环境重新计算，不信任历史值。
- `signature`：当前缓存对应的轻量状态签名。
- `selection`：恢复页面所需的最小选择状态。
- `results`：审查结果主体。

### Commit 审查签名

`Commit 审查` 使用与目标类型匹配的轻量签名：

- `commit`
  - `targetType: "commit"`
  - `targetHash`
- `current`
  - `targetType: "current"`
  - `branch`
  - `stagedFileCount`
  - `stagedAdditions`
  - `stagedDeletions`
  - `stagedPathsDigest`
- `pr`
  - `targetType: "pr"`
  - `baseRef`
  - `headRef`
  - `compareFileCount`
  - `compareAdditions`
  - `compareDeletions`
  - `comparePathsDigest`

判定规则：

- `commit` 只要 `targetHash` 不一致即视为过期。
- `current` 和 `pr` 只要任一摘要字段变化即视为过期。

### 代码审查签名

`代码审查` 的签名使用轻量扫描摘要，不重新读取全部文件内容：

- `scopeType`
- `scopePath`
- `fileCount`
- `pathsDigest`
- `latestTimestamp?`

其中：

- `fileCount` 和 `pathsDigest` 由当前 scope 内的文件路径列表生成。
- `latestTimestamp` 只有在现有或新增轻量接口能稳定提供文件更新时间时才写入；当前实现若拿不到稳定更新时间，则直接省略该字段，不用“当前扫描时间”这类每次都会变化的值兜底。

判定规则：

- 只要 `scopeType`、`scopePath`、`fileCount`、`pathsDigest` 或可用的 `latestTimestamp` 有变化，即标记为“结果可能已过期”。

本次只做轻量判断，不做“自动丢弃旧结果”。

## 桌面桥接设计

### 新增工作区文本文件桥接

现有 `DesktopWorkspaceService` 已经具备：

- `getFileContent(workspaceId, path)`
- `writeTextFile(workspaceId, path, content)`

但主界面桥接目前只暴露了读取目录树和读取文件内容，未暴露工作区文本写入，也缺少更直接的文本写入封装。

本次补充：

- RPC 类型定义增加工作区文本写入接口。
- `electrobun-window-bridge` 挂载对应桥接。
- `mainview/lib/desktop-workspace.ts` 增加 `writeDesktopWorkspaceTextFile(...)` 封装。

如有必要，可同时补一个轻量 `readDesktopWorkspaceTextFile(...)` 别名，内部仍复用既有 `getDesktopWorkspaceFileContent(...)`。

### 缓存访问帮助函数

在 Git 模块内新增独立缓存帮助文件，负责：

- 构建缓存路径
- 序列化和反序列化缓存内容
- 清洗和校验缓存结构
- 比较签名并返回 `fresh` / `stale`

该层只关心缓存协议，不承载 UI 状态。

## 前端交互设计

### 页面恢复

Git 审查工作台初始化时：

1. 根据当前 `workspaceId` 和 surface 计算可恢复的 cache key。
2. 读取对应缓存文件。
3. 若缓存结构合法，则先恢复结果和最小选择状态。
4. 再用当前目标生成新签名并比较：
   - 一致：直接作为最新结果展示。
   - 不一致：继续展示旧结果，但标记为“结果可能已过期”。

恢复结果不应阻塞主界面首屏，只允许在局部显示轻量 loading。

### 运行新审查

点击 `开始审查` 或 `重新开始审查` 后：

- 清理本轮错误状态和进行中状态。
- 保留上次已展示结果，避免右侧详情瞬间变空。
- 本轮结果返回后整体替换内存状态。
- 写回对应缓存文件，覆盖旧缓存。

如果本轮失败：

- 保留上次成功结果。
- 顶部状态区显示当前失败信息。
- 不用失败结果覆盖已有可用缓存。

### 过期提示

当缓存签名不一致时：

- 结果区继续展示缓存内容。
- 顶部或结果区头部展示明显但不过度夸张的提示：`结果可能已过期`。
- 不自动触发后台重跑。
- 用户仍可点击 `重新开始审查` 主动更新。

### 重新开始审查

`重新开始审查` 的语义是：

- 以当前选中的目标重新执行一次完整审查。
- 成功后覆盖同 key 缓存。
- 失败时不清掉上次可用结果。

### 结果选择恢复

缓存恢复的最小选择状态包括：

- `Commit 审查`
  - `commitTargetType`
  - `selectedGitSource`
  - `selectedCommitHash`
  - `gitSelectedPath`
  - `selectedFindingId`
- `代码审查`
  - `codeReviewScopeType`
  - `codeReviewScopePath`
  - `selectedFindingId`

恢复时若所选路径或 finding 已不存在，则回退到：

- 第一个可用文件
- 第一个可用 finding
- 若都不存在，则只展示结果概览空态

## 分栏设计

### 默认布局

Git 审查工作台从固定 `grid-template-columns` 改为 `Ant Design Splitter`。

默认行为：

- 左栏默认宽度提高到明显大于当前实现的一档。
- 中间分隔条可拖拽。
- 保持右侧代码和结论区域最小可用宽度。

### 宽度约束

需要设置：

- 左栏最小宽度
- 左栏最大宽度
- 在较小窗口下的合理回退宽度

目标是避免：

- 左栏被拖到几乎不可读
- 左栏过宽挤压右侧代码区

### 宽度记忆

宽度属于界面偏好，保存在前端本地状态，而不是 `.maomi`。

存储 key 按 `workspace + surface` 组织，例如：

- `git-review-layout::<workspaceId>::commit`
- `git-review-layout::<workspaceId>::code`

这样：

- 同一工作区下 `Commit 审查` 和 `代码审查` 可记住不同宽度。
- 重启后仍可恢复用户上次拖拽结果。

## 进度条设计

### 展示方式

顶部状态区将“正在分析 x / xx”替换为百分比进度条：

- 主视觉展示 `Progress` 条和百分比。
- `x / xx` 不再作为主文案出现。
- 若仍需要调试信息，可作为 tooltip 或辅助 title 提供。

### 计算方式

继续沿用现有 `completed / total` 数据源：

- `percent = total > 0 ? floor(completed / total * 100) : 0`

适用范围：

- `Commit 审查`
- `代码审查`

### 状态切换

- 未运行：显示空白或提示，不显示进度条。
- 运行中：显示进度条和百分比。
- 失败：显示错误文案。
- 成功：显示简短完成状态或继续显示审查来源提示。

## 组件与文件边界

建议新增或改造的主要文件：

- `apps/desktop/MaomiAgent/src/mainview/modules/git/components/git-ai-review-workbench-next.tsx`
  - 接入缓存恢复、过期提示、进度条、拖拽分栏。
- `apps/desktop/MaomiAgent/src/mainview/modules/git/components/`
  - 新增 Git 审查缓存帮助文件。
- `apps/desktop/MaomiAgent/src/mainview/modules/git/page.css`
  - 增加 Splitter 和过期提示样式，移除依赖固定 grid 宽度的实现。
- `apps/desktop/MaomiAgent/src/mainview/lib/desktop-workspace.ts`
  - 增加工作区文本写入封装。
- `apps/desktop/MaomiAgent/src/mainview/lib/electrobun-window-bridge.ts`
  - 暴露新增桥接。
- `apps/desktop/MaomiAgent/src/shared/desktop-rpc.ts`
  - 增加对应 RPC 类型。
- `apps/desktop/MaomiAgent/src/bun/index.ts`
  - 注册新增 RPC。

若 Git 审查缓存逻辑继续增长，应进一步拆分成：

- 缓存协议文件
- 签名生成文件
- UI 状态恢复文件

避免把所有逻辑继续堆在单个 workbench 组件里。

## 错误处理

- 缓存文件缺失：按无缓存处理，不报错。
- 缓存 JSON 损坏：忽略该缓存并记录警告，不阻塞页面。
- 写缓存失败：不影响本轮审查展示，只在控制台或日志中记录。
- 读取缓存失败：不阻塞审查启动。
- 宽度偏好非法：回退到默认宽度。
- 过期签名生成失败：保守标记为未确认，不把旧结果当成最新结果。

## 测试设计

需要覆盖以下层级：

### 单元测试

- cache key 生成与路径清洗
- 缓存 JSON 序列化 / 反序列化
- commit 签名比较
- code 签名比较
- 宽度状态读写与非法值回退
- 百分比计算边界：`0/0`、`0/n`、`n/n`

### 组件 / 页面测试

- 恢复新鲜缓存后直接显示结果
- 恢复过期缓存后显示旧结果和“结果可能已过期”
- 点击重新开始审查后保留旧结果，待新结果回来后替换
- 本轮失败时保留旧结果
- 进度区显示百分比条而不是 `x / xx`
- 拖拽宽度后刷新页面仍恢复上次宽度

### 桥接测试

- 工作区文本文件写入 RPC 正常落到 `.maomi/git-review/...`
- 非法路径不能逃逸工作区根目录

## 风险与缓解

### 风险 1：代码审查的过期判断不够精确

原因：

- 当前设计使用轻量签名，不做全文深校验。

缓解：

- 明确把状态表达为“结果可能已过期”，而不是“结果无效”。
- 始终提供显式 `重新开始审查`。

### 风险 2：缓存文件体积偏大

原因：

- 审查结果包含每个文件的 findings 和部分恢复状态。

缓解：

- 缓存只保存恢复所需的最小结果数据，不保存运行期临时字段。
- 后续若体积继续上升，可增加裁剪策略，但不在本次实现内。

### 风险 3：单组件继续膨胀

原因：

- 现有 Git 审查工作台已经承担较多状态和渲染职责。

缓解：

- 本次实现要求把缓存协议和布局偏好逻辑拆到独立文件，避免继续堆叠在 `git-ai-review-workbench-next.tsx`。

## 验收标准

- 用户在 `Commit 审查` 和 `代码审查` 中跑过一次审查后，关闭页面或重启应用，再次打开仍能恢复上次结果。
- 缓存文件实际写入工作区 `.maomi/git-review/` 下。
- 工作区状态变化后，旧结果仍可见，但会明确显示“结果可能已过期”。
- 左侧分栏默认比当前更宽，且用户可以拖拽调整。
- 拖拽后的宽度在同一工作区、同一 surface 下可以恢复。
- 运行中状态主视觉为百分比进度条，不再使用“正在分析 x / xx”作为主展示。
- 用户可以随时重新开始审查，并在成功后覆盖缓存；失败时保留上次可用结果。
