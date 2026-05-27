import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// 假设 BoardBlock 组件已导出
import { BoardBlock } from "../feishu-docs-local-preview";

describe("BoardBlock", () => {
  const token = "test-board-token";
  const width = 400;
  const height = 300;
  const align = "center";
  const imageUrl = "https://example.com/board-snapshot.png";

  it("优先渲染快照图片", () => {
    render(
      <BoardBlock
        token={token}
        width={width}
        height={height}
        align={align}
        whiteboardPreviewUrls={{ [token]: imageUrl }}
      />
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", imageUrl);
    expect(img).toHaveStyle({ width: `${width}px`, height: `${height}px` });
  });

  it("无快照时兜底 token", () => {
    render(
      <BoardBlock
        token={token}
        width={width}
        height={height}
        align={align}
        whiteboardPreviewUrls={{}}
      />
    );
    expect(screen.getByText(`无快照，token: ${token}`)).toBeInTheDocument();
  });
});
