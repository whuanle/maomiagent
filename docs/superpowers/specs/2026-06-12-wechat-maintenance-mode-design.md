# 微信渠道 24 小时维护模式设计

## 目标

为微信渠道增加一个按账号生效的维护模式开关。

- 维护模式按微信账号单独开启
- 开启后默认持续 24 小时
- 维护模式有效期内，当前微信账号发起的会话消息自动放宽交互审批阻断
- 到期后自动失效，不需要额外人工关闭
- 实现尽量简单，不引入能力白名单、审批流、额外策略中心或复杂调度

## 约束

- 只影响微信渠道，不影响桌面聊天、飞书或其他入口
- 不为固定能力建表，必须兼容后续动态新增的 skills 和 MCP
- 不新增后台定时任务
- 不改变底层权限引擎的全局行为
- 页面交互保持最小，只提供按账号开启和关闭维护模式的入口

## 推荐方案

采用“微信账号维护到期时间 + 微信入口自动注入 approvalMode=auto”的最短链路方案。

核心原因：

- 现有会话发送接口已经支持通过 `metadata.interactionGovernance.approvalMode` 控制权限交互行为
- `approvalMode = "auto"` 可以自动通过后续运行里出现的 permission interaction
- 这样不需要提前知道未来会增加哪些 skill、MCP 或工具能力
- 只在微信消息进入会话前做一次判断，链路最短，侵入最小

## 方案对比

### 方案 A：维护模式映射到 `approvalMode = "auto"`（推荐）

在微信账号维护模式有效期内，微信模块调用 `conversationCommand.sendMessage(...)` 时附带：

- `metadata.interactionGovernance.approvalMode = "auto"`

优点：

- 实现最短
- 不依赖固定能力集合
- 自动兼容动态新增工具
- 不需要改底层权限匹配规则

缺点：

- 放宽范围较大，但符合本次“化繁为简”的目标

### 方案 B：维护模式写入 `permissionRules`

为微信会话写入若干 `permissionRules` 做自动放行。

优点：

- 表面上更细粒度

缺点：

- 当前 permission rule 依赖精确 scope 匹配，不适合覆盖动态扩展能力
- 后续新增工具时容易漏配置
- 维护成本更高

### 方案 C：底层统一识别微信来源后绕过

在更底层的权限或交互层识别“微信来源”，然后整体跳过阻断。

优点：

- 理论上覆盖最广

缺点：

- 侵入更深
- 影响面更大
- 后续最容易变乱

## 数据设计

直接在微信账号存储结构上增加一个字段：

- `maintenanceUntil?: string`

含义：

- ISO 时间字符串
- 当前时间早于该值时，代表账号维护模式有效
- 缺失、空值或已过期时，代表未开启

落点：

- `WechatModuleStorage.accounts[]`
- `WechatAccountView`

不新增独立表，不新增额外状态容器。

## 模块设计

### 1. 微信服务层

文件：

- `apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.ts`

新增职责：

- 读写账号的 `maintenanceUntil`
- 提供按账号开启维护模式和关闭维护模式的方法
- 在处理入站微信消息时判断该账号是否处于维护模式
- 仅在维护模式有效时，为本次会话发送附加 `approvalMode = "auto"`

实现方式：

- 新增 `enableAccountMaintenance(accountId)`：
  - 将账号的 `maintenanceUntil` 设置为 `Date.now() + 24h`
  - 持久化存储
- 新增 `disableAccountMaintenance(accountId)`：
  - 清除 `maintenanceUntil`
  - 持久化存储
- 新增辅助判断：
  - `isAccountMaintenanceActive(account)`
  - 负责判断是否未过期
- 在 `processQueuedMessage(...)` 中调用 `conversationCommand.sendMessage(...)` 前构造 metadata：
  - 维护模式生效时带上 `interactionGovernance.approvalMode = "auto"`
  - 未生效时不附带该字段

### 2. 微信共享类型

文件：

- `apps/desktop/MaomiAgent/src/shared/desktop-wechat.ts`

新增内容：

- `WechatAccountView.maintenanceUntil?: string`
- 新增维护模式命令输入或直接复用简单命令接口

建议保持最小：

- 新增一个简单输入类型，例如：
  - `WechatAccountMaintenanceInput = { enabled: boolean }`

### 3. 微信 RPC

文件：

- `apps/desktop/MaomiAgent/src/shared/desktop-rpc.ts`
- 对应桌面端实际 RPC handler 所在文件

新增能力：

- 按账号切换维护模式

建议形式：

- `wechat.setAccountMaintenance`

输入：

- `accountId`
- `enabled`

行为：

- `enabled = true` 时设置到期时间为当前时间后 24 小时
- `enabled = false` 时清空到期时间

### 4. 微信页面

文件：

- `apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.tsx`
- `apps/desktop/MaomiAgent/src/mainview/modules/wechat/components/account-records-panel.tsx`

页面保持最小化：

- 不新增说明卡
- 不新增独立详情区
- 不新增复杂设置面板

在账号表格中增加一列或在操作区增加轻量操作：

- 未开启时显示：`开启维护模式`
- 已开启时显示：`关闭维护模式`
- 同时展示：`维护中 · 截止时间`

交互要求：

- 开启时不弹复杂表单，直接生效 24 小时
- 操作结果通过 `message.success` / `message.error`
- 刷新当前微信状态，保证列表立即反映新状态

## 数据流

### 开启维护模式

1. 用户在微信账号表格点击“开启维护模式”
2. 前端调用 `wechat.setAccountMaintenance({ accountId, enabled: true })`
3. 微信服务写入该账号的 `maintenanceUntil = now + 24h`
4. 返回最新微信状态
5. 前端刷新表格，展示维护截止时间

### 关闭维护模式

1. 用户点击“关闭维护模式”
2. 前端调用 `wechat.setAccountMaintenance({ accountId, enabled: false })`
3. 微信服务清空 `maintenanceUntil`
4. 返回最新微信状态
5. 前端刷新表格

### 微信消息进入执行链路

1. 微信渠道收到入站消息
2. `DesktopWechatService.processQueuedMessage(...)` 处理消息
3. 根据当前账号判断维护模式是否仍有效
4. 若有效，则在 `conversationCommand.sendMessage(...)` 时附加：
   - `metadata.interactionGovernance.approvalMode = "auto"`
5. 对话运行时自动通过 permission interaction
6. 若无效，则维持原有行为

## 过期处理

不引入后台清理器。

采用懒判断方案：

- `getState()` 时可顺手将已过期账号视为未开启
- `processQueuedMessage(...)` 时再次判断，确保运行时行为正确

是否立即回写清理：

- 推荐回写清理，但只在读取状态或处理消息时顺手执行
- 不需要额外调度器

这样既保证状态展示正确，也不增加复杂度。

## 错误处理

- 账号不存在：直接抛出明确错误
- 存储写入失败：前端展示失败消息，不更新视图
- 维护模式字段非法或时间解析失败：按未开启处理
- 账号已过期：按未开启处理，并在合适时机顺手清理字段

## 测试设计

### 服务层测试

文件：

- `apps/desktop/MaomiAgent/src/bun/modules/wechat/implementation/services/desktop-wechat-service.binding.test.ts`

新增测试覆盖：

- 开启维护模式后，微信转发消息会向 `sendMessage(...)` 注入：
  - `metadata.interactionGovernance.approvalMode = "auto"`
- 维护模式关闭后，不会注入该字段
- 维护模式已过期时，不会注入该字段
- 开启维护模式会把 `maintenanceUntil` 设置到未来 24 小时附近
- 关闭维护模式会清空 `maintenanceUntil`

### 页面测试

文件：

- `apps/desktop/MaomiAgent/src/mainview/modules/wechat/page.regression.test.tsx`

新增测试覆盖：

- 账号记录中存在维护模式按钮
- 已开启时显示维护截止时间
- 点击开启后调用维护模式 RPC
- 点击关闭后调用维护模式 RPC

## 影响范围

直接影响：

- 微信共享类型
- 微信服务层
- 微信 RPC
- 微信账号列表 UI
- 微信服务测试
- 微信页面测试

不影响：

- 飞书渠道
- 普通桌面聊天会话
- 底层全局权限治理算法
- 技能与 MCP 的注册方式

## 风险

### 风险 1：维护模式放宽范围较大

说明：

- 维护模式基于 `approvalMode = "auto"`，意味着本次微信账号发起的会话里，权限交互会自动通过

结论：

- 这是本次需求有意选择的结果
- 通过“按账号 + 24 小时自动失效”控制范围

### 风险 2：过期状态展示和运行时状态不一致

说明：

- 如果只在界面判断，不在运行时判断，可能出现显示已过期但实际仍放行的问题

处理：

- 必须在 `processQueuedMessage(...)` 再做一次真实判断

### 风险 3：后续动态工具增加后是否继续生效

说明：

- 如果采用固定能力白名单，未来容易漏掉

处理：

- 本方案基于自动审批模式，不依赖固定能力列表，因此天然兼容动态扩展

## 实施步骤

1. 扩展微信共享类型与存储结构，增加 `maintenanceUntil`
2. 扩展微信服务接口，增加按账号开启和关闭维护模式的方法
3. 扩展桌面 RPC，暴露维护模式切换能力
4. 在 `processQueuedMessage(...)` 注入维护模式 metadata
5. 更新微信账号表格操作区与状态展示
6. 补齐服务层和页面层测试

## 验证

- 手动在微信页面为某账号开启维护模式
- 确认列表中立刻显示维护截止时间
- 使用该微信账号触发会话，并验证权限交互不再停留等待人工批准
- 关闭维护模式后再次触发同类操作，确认恢复原有阻断行为
- 将到期时间改为过去时间并重新触发，确认不会继续自动放行

## 结论

本次功能采用“按微信账号记录维护到期时间，并在微信入站消息转发时临时注入 `approvalMode = auto`”的最简实现。

这个方案满足以下要求：

- 用户使用方式简单
- 实现链路短
- 不依赖固定能力列表
- 自动兼容未来动态增加的 skills 和 MCP
- 不把复杂性扩散到全局权限系统
