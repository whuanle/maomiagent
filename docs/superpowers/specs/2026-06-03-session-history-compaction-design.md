# Session History Compaction Design

## Background

聊天链路已经做过两轮减重：

- active 期间的 session detail 改成节流，避免流式事件被 detail churn 拖慢
- 重工具历史在 prompt codec 阶段改成摘要化，避免 `workspace_write_file`、`workspace_read_file`、`terminal_*` 直接把大正文回灌到下一轮

这些优化已经显著改善了首轮流式体验，但真实对话仍存在一个高频问题：

- 第一轮处理文件后，第二轮和后续轮次明显变慢
- 大文件修订、连续自我修正、多轮 agent 写文件场景容易出现 provider timeout
- 对话进行中，整个桌面程序偶发变卡，其他页面加载也可能受影响

已有诊断表明，慢会话的主要瓶颈不是前端没显示，而是 provider-facing prompt 在后续轮次持续膨胀。尤其是处理文件后，上一轮的大文本、旧 reasoning、旧工具链上下文会继续进入下一轮，导致首包变慢、整轮变长、超时概率上升。

## Problem Statement

当前系统仍采用“原始消息历史为主、局部裁剪为辅”的策略：

- 原始会话消息完整保存
- 旧 tool output 会做有限 pruning
- 部分重工具输入输出会在 OpenAI codec 层做摘要化

但系统仍缺少会话级 compaction 机制，因此存在几个结构性问题：

1. 后续轮次仍会反复背负旧 assistant text、旧 reasoning、旧工具链历史。
2. 文件处理后，上一轮的大内容虽然已经写入本地文件，但仍可能以历史消息形态继续进入后续 prompt。
3. 历史越长，prompt 选择和编码越重，Bun 主线程压力也越大，可能影响其他页面数据加载。
4. 当前优化更像“补丁式减重”，还没有把历史拆成“摘要层”和“近期原文层”。

## Goals

- 在不改变 UI 和完整会话存储的前提下，显著降低第二轮及后续轮次的 prompt 体积。
- 让处理大文件后的后续轮次不再明显膨胀，降低 provider timeout 概率。
- 保留最近几轮的原始上下文，避免摘要化过度导致模型失去局部细节。
- 让会话历史 compaction 成为 prompt 组装的常规机制，而不是仅在极端超限时补救。
- 保留足够的诊断埋点，便于观察历史选择、摘要生成、prompt 编码是否导致主线程卡顿。

## Non-Goals

- 不修改 UI 会话展示方式。
- 不删除或覆盖原始消息、原始工具结果、原始 reasoning。
- 不在本轮实现“超限后自动继续执行”的完整 replay/continue 机制。
- 不引入一次额外的大模型请求来专门总结每一轮内容。
- 不在这一轮改动权限交互、多 session 并行、runtime event 路由。

## Reference: opencode

`E:\\opensoure\\opencode` 的处理方式对本设计有直接启发：

- `session/compaction.ts` 提供显式的 session compaction，而不是只裁剪单个字段。
- compaction 后保留一份 anchored summary，再保留最近的 tail turns 原文。
- `message-v2.ts` 会过滤掉已 compacted 的旧历史，避免每轮都背完整原文。
- tool output 也有单独的 compacted/truncated 机制。

本项目不照搬 opencode 的完整机制，但采用同样的核心思想：

- 完整历史继续保存
- provider-facing history 改成“summary + recent tail + current turn”
- 旧历史默认不再整段回灌

## Proposed Approach

推荐采用轻量版的 session history compaction。

### 1. Provider-facing history 分层

下一轮发送给 provider 的历史固定拆成三层：

1. `session summary`
   - 表示更早历史的滚动摘要
   - 内容包括任务目标、约束、已完成事项、关键决策、关键错误、相关文件、下一步事项

2. `recent tail`
   - 保留最近 `2` 个用户轮次及其后的 assistant/tool 原始记录
   - 这是当前对话最可能依赖的局部细节层

3. `current turn`
   - 当前最新用户消息和必要附件
   - 始终完整保真

### 2. 每轮生成 turn digest

每轮 assistant 完成后，基于本轮已有消息生成一份轻量 `turn digest`，不额外发起大模型请求。

`turn digest` 的目标不是给用户展示，而是给后续 `session summary` 合并提供稳定、短小、结构化的来源。

建议包含以下字段：

- userIntent
- assistantOutcome
- toolsUsed
- touchedFiles
- keyErrors
- carriedForwardContext

其中：

- `toolsUsed` 只保留工具名和关键元数据
- `touchedFiles` 只保留路径和操作类型
- `assistantOutcome` 保留简洁结论，不复制长正文
- `carriedForwardContext` 只保留下一轮仍需要知道的信息

### 3. 超阈值后启用 rolling session summary

并不是所有会话都一开始就走 summary。

默认流程：

- 短对话优先使用最近原始历史
- 当 provider-facing prompt 的预计体积超过阈值时，启用 `session summary + recent tail`

启用后：

- 更老的 `turn digest` 会合并为一份 `rolling session summary`
- 最近 `2` 个用户轮次仍保留原始记录
- 当前用户消息继续完整保留

这样可以避免把所有对话都过早摘要化，同时能在进入多轮 agent 修订场景时稳定控制体积。

### 4. 与现有工具历史压缩协同

本设计不是替代已有的 tool-history compaction，而是在其上再加一层会话级压缩。

协同关系如下：

- 旧重工具输入输出仍先经过现有 `tool-history-compaction.ts`
- 会话级 compaction 再决定哪些旧消息不再进入 provider-facing prompt
- 即使 recent tail 中仍包含某些工具记录，也会优先使用已经压缩过的历史版本

这样既能减掉“单条消息太大”，也能减掉“历史条目太多”。

## Architecture

### New data layer

新增两类派生数据：

- `turn digest`
- `session summary`

它们都属于 provider-facing compaction 的派生产物，不替代原始消息。

原始消息、原始工具结果、原始 reasoning 继续按现有方式完整保存。

### Prompt assembly pipeline

新的 provider-facing prompt 组装顺序：

1. 读取原始会话消息
2. 构造或读取已有 `turn digests`
3. 判断是否超过 compaction 阈值
4. 未超过阈值：
   - 继续走当前的“原始历史 + 现有 tool compaction”
5. 超过阈值：
   - 使用 `session summary + recent tail + current turn`
6. 再进入现有 provider-facing normalizer 和 prompt codec

### Placement

推荐把新逻辑放在 `turn-request-normalizers.ts` 上游或同层的 provider-facing history builder 中，而不是散落到多个 provider codec。

原因：

- compaction 是 provider-facing request 级别的通用行为
- 不应只修 OpenAI 路径
- Google、Anthropic、OpenAI 都应该共享同一份“历史选择结果”

## Data Model

### Turn digest

建议的最小结构：

```ts
type ConversationTurnDigest = {
  sessionId: string;
  turnId: string;
  parentUserMessageId: string;
  assistantMessageId: string;
  createdAt: number;
  userIntent?: string;
  assistantOutcome?: string;
  toolsUsed: Array<{
    toolName: string;
    summary?: string;
    status?: "completed" | "error";
  }>;
  touchedFiles: Array<{
    path: string;
    operation?: "read" | "write" | "edit" | "command";
  }>;
  keyErrors: string[];
  carriedForwardContext: string[];
};
```

### Session summary

建议的最小结构：

```ts
type ConversationSessionSummary = {
  sessionId: string;
  updatedAt: number;
  coveredThroughTurnId: string;
  summaryText: string;
  recentTailUserTurnCount: number;
};
```

`summaryText` 采用固定结构化模板，避免自由散文导致冗长和不稳定。

建议模板：

- Goal
- Constraints
- Progress
- Key Decisions
- Relevant Files
- Open Issues
- Next Steps

## Summary Generation Strategy

### Turn digest generation

turn digest 在每轮结束后生成，但必须满足两个约束：

1. 不能阻塞流式主路径
2. 不能发起额外 provider 请求

因此 turn digest 只从本轮已有结构化事件中提取：

- 用户文本 part
- assistant text part 的末段
- tool call / tool result
- interaction / error
- 文件路径、命令、退出码等元数据

### Session summary merge

当超过阈值时，将较老的 digests 合并为滚动 summary。

合并规则：

- 保留仍然有效的目标、约束、关键决策
- 已完成事项进入 progress/done
- 未解决问题进入 open issues
- 最近 tail 中仍然保留的细节，不重复写成长文本
- 文件路径、命令、错误字符串尽量原样保留

### Recent tail policy

默认保留最近 `2` 个用户轮次的原始记录。

如果这 `2` 个轮次本身已经超大，则继续优先保留最近轮次，并允许只保留部分 tail，但当前最新用户轮次必须完整保留。

## Performance and Diagnostics

这轮必须把性能边界一起收住，因为用户已观察到：

- 聊天长轮次时，程序整体可能有些卡
- 其他页面有时加载不出数据

因此新增机制必须同时提供最小诊断。

建议埋点：

- `history_selection_ms`
- `turn_digest_build_ms`
- `session_summary_merge_ms`
- `prompt_encode_ms`
- `provider_facing_history_mode`
  - `raw`
  - `raw_with_tool_compaction`
  - `summary_with_recent_tail`

关键原则：

- 摘要生成不插入 streaming hot path
- prompt 组装优先读取已有 digest/summary，不做重复重算
- 遇到异常时直接回退旧路径，而不是在主线程做昂贵补救

## Error Handling and Fallback

新机制必须是“失败降级”，不能是“失败中断”。

### Fallback rules

- `turn digest` 生成失败：
  - 记录日志
  - 本轮不写 digest
  - 后续仍可走旧路径

- `session summary` 合并失败：
  - 记录日志
  - 当前请求退回“原始历史 + 现有 tool compaction”

- digest/summary 数据不一致：
  - 忽略派生数据
  - 重新从原始历史构造 prompt

### Safety principle

宁可这一轮慢一点，也不能因为 compaction 数据损坏导致上下文缺失或回答错误。

## Testing Strategy

至少覆盖以下测试：

1. `turn digest` 生成
   - 写文件、读文件、终端执行、普通文本轮次都能生成稳定摘要

2. `session summary` 合并
   - 多个 digests 能合并成结构稳定的 summary
   - 不会重复堆叠旧信息

3. prompt 选择
   - 未超阈值时，仍走旧路径
   - 超阈值时，切换到 `summary + recent tail + current turn`

4. 回退
   - digest/summary 构造异常时自动回退到旧路径

5. 回归
   - 现有 tool-history compaction 和 reasoning normalization 不被破坏

## Rollout Plan

推荐分两步落地：

### Phase 1

- 新增 `turn digest`
- 新增 provider-facing history selector
- 超阈值时改用 `summary + recent tail`
- 保留完整埋点

### Phase 2

- 根据真实日志调参数
- 评估是否需要进一步压缩旧 reasoning
- 评估是否需要显式持久化更多 compaction 元数据

## Open Questions Resolved

### 是否需要保留全文进入下一轮？

不需要。默认只保留摘要和关键元数据，全文需要时由 agent 再次读取。

### 是否改 UI 或原始会话存储？

不改。只改变 provider-facing prompt。

### 是否需要学习 opencode 的做法？

需要，且本设计已吸收其核心原则：完整历史保留、摘要化旧历史、保留最近 tail。

## Success Criteria

- 处理大文件后的第二轮及后续轮次输入体积明显下降
- 首包时间和整轮耗时更稳定
- `OpenAI request timed out after 240000ms` 这类长轮次超时概率下降
- 用户界面仍然展示完整会话原文
- 即使 compaction 派生数据异常，对话仍能继续，只会回退为旧路径
