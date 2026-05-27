import React from "react";

export interface BoardBlockProps {
  token: string;
  width?: number;
  height?: number;
  align?: string;
  whiteboardPreviewUrls?: Record<string, string>;
}

export const BoardBlock: React.FC<BoardBlockProps> = ({
  token,
  width,
  height,
  align,
  whiteboardPreviewUrls = {},
}) => {
  const imageUrl = whiteboardPreviewUrls[token];
  if (imageUrl) {
    // 样式请在外部 CSS 文件中通过 .board-block-img 进行维护
    return (
      <img
        src={imageUrl}
        className={"board-block-img" + (align ? ` align-${align}` : "")}
        alt={`Board ${token}`}
        data-width={width}
        data-height={height}
      />
    );
  }
  // 样式请在外部 CSS 文件中通过 .board-placeholder 进行维护
  return (
    <div className="board-placeholder" data-width={width} data-height={height}>
      <span>无快照，token: {token}</span>
    </div>
  );
};
