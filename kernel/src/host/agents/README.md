# MaomiKernel Runtime Agents

`runtime/agents` 负责 runtime 侧的 agent 编目与选择策略。

当前阶段包含：

- `AgentRegistry`
- `DefaultAgentPolicyResolver`

这里不负责：

- turn 内部实际选择逻辑
- model stream / processor 状态机
