# BoardBlock 组件集成与测试说明

## 组件功能
- 支持飞书 board 块的快照图片优先渲染。
- 无快照时自动兜底显示 token 信息。
- 支持 width/height/align 属性适配。

## 用法示例
```tsx
import { BoardBlock } from "../board-block";

<BoardBlock
  token="test-board-token"
  width={400}
  height={300}
  align="center"
  whiteboardPreviewUrls={{ "test-board-token": "https://example.com/board-snapshot.png" }}
/>
```

## 测试用例
- 已覆盖：
  - 有快照时渲染图片，尺寸/对齐生效
  - 无快照时兜底 token

## 集成建议
- 可直接在 feishu-docs-local-preview.tsx 的 board/whiteboard/diagram 分支调用。
- 只需传入 token、尺寸、快照映射表。

---
如需批量适配其他飞书自定义块，复用此模式即可。
