import { CodeOutlined, CopyOutlined, EyeOutlined } from "@ant-design/icons";
import { Alert, App, Button, Tooltip } from "antd";
import mermaid from "mermaid";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { LanguageCode } from "../../../../config/titlebar";
import {
  parseConversationChartPreviewSource,
  type ConversationAxisChartPreviewModel,
  type ConversationPieChartPreviewModel,
} from "../../../../lib/conversation-code-block-chart-preview";
import {
  normalizeConversationCodeBlockText,
  parseConversationCodeBlockInfoString,
  resolveConversationCodeBlockLanguageLabel,
  resolveConversationCodeBlockMonacoLanguage,
  resolveConversationCodeBlockPreviewMode,
} from "../../../../lib/conversation-code-block-preview";
import { looksLikeMermaidMindmapSource } from "../../../../lib/conversation-mindmap-preview";
import {
  ConversationMarkdownPreview,
  type ConversationMarkdownEmbeddedCodeBlockInput,
} from "../conversation-markdown-preview";
import { ConversationMindmapPreview } from "./conversation-mindmap-preview";
import { PreviewPanelSourceEditor, PreviewPanelToolbar } from "./preview-panel-shared";

type Props = {
  title?: string;
  subtitle?: string;
  code: string;
  infoString?: string;
  uiLanguage?: LanguageCode;
  hideHead?: boolean;
  plain?: boolean;
  headVariant?: "default" | "language-only";
};

function resolveConversationPreviewActionErrorText(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "未知错误";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function describeArc(input: {
  centerX: number;
  centerY: number;
  radius: number;
  innerRadius?: number;
  startAngle: number;
  endAngle: number;
}) {
  const start = {
    x: input.centerX + (input.radius * Math.cos(input.startAngle)),
    y: input.centerY + (input.radius * Math.sin(input.startAngle)),
  };
  const end = {
    x: input.centerX + (input.radius * Math.cos(input.endAngle)),
    y: input.centerY + (input.radius * Math.sin(input.endAngle)),
  };
  const largeArcFlag = input.endAngle - input.startAngle > Math.PI ? 1 : 0;

  if (!input.innerRadius) {
    return [
      `M ${input.centerX} ${input.centerY}`,
      `L ${start.x} ${start.y}`,
      `A ${input.radius} ${input.radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
      "Z",
    ].join(" ");
  }

  const innerEnd = {
    x: input.centerX + (input.innerRadius * Math.cos(input.endAngle)),
    y: input.centerY + (input.innerRadius * Math.sin(input.endAngle)),
  };
  const innerStart = {
    x: input.centerX + (input.innerRadius * Math.cos(input.startAngle)),
    y: input.centerY + (input.innerRadius * Math.sin(input.startAngle)),
  };

  return [
    `M ${start.x} ${start.y}`,
    `A ${input.radius} ${input.radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${input.innerRadius} ${input.innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function ConversationAxisChartPreview(props: { model: ConversationAxisChartPreviewModel }) {
  const width = Math.max(640, props.model.categories.length * 110);
  const height = 360;
  const padding = { top: 20, right: 24, bottom: 64, left: 56 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...props.model.series.flatMap((series) => series.values),
  );
  const barSeries = props.model.series.filter((series) => series.chartType === "bar");
  const lineSeries = props.model.series.filter((series) => series.chartType === "line");
  const stepX = props.model.categories.length > 1
    ? chartWidth / (props.model.categories.length - 1)
    : chartWidth;

  return (
    <div className="conversation-code-preview-surface-chart-shell">
      <div className="conversation-code-preview-surface-stats">
        <div className="conversation-code-preview-surface-stat">
          <span className="conversation-code-preview-surface-stat-label">类目</span>
          <span className="conversation-code-preview-surface-stat-value">{props.model.categories.length}</span>
        </div>
        <div className="conversation-code-preview-surface-stat">
          <span className="conversation-code-preview-surface-stat-label">序列</span>
          <span className="conversation-code-preview-surface-stat-value">{props.model.series.length}</span>
        </div>
        <div className="conversation-code-preview-surface-stat">
          <span className="conversation-code-preview-surface-stat-label">最大值</span>
          <span className="conversation-code-preview-surface-stat-value">{formatNumber(maxValue)}</span>
        </div>
      </div>
      <div className="conversation-code-preview-surface-chart-card">
        {props.model.title ? (
          <div className="conversation-code-preview-surface-chart-title">{props.model.title}</div>
        ) : null}
        <div className="conversation-code-preview-surface-chart-canvas">
          <div className="conversation-code-preview-surface-chart-viewport">
            <svg
              className="conversation-code-preview-surface-chart-svg"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={props.model.title ?? "Chart preview"}
            >
              {Array.from({ length: 5 }).map((_, index) => {
                const ratio = index / 4;
                const y = padding.top + chartHeight - (chartHeight * ratio);
                const label = formatNumber(maxValue * ratio);
                return (
                  <g key={`grid-${ratio}`}>
                    <line
                      x1={padding.left}
                      x2={padding.left + chartWidth}
                      y1={y}
                      y2={y}
                      stroke="rgba(148, 163, 184, 0.25)"
                    />
                    <text x={padding.left - 10} y={y + 4} fontSize="11" fill="currentColor" textAnchor="end">
                      {label}
                    </text>
                  </g>
                );
              })}

              {barSeries.map((series, seriesIndex) => {
                const barWidth = Math.max(14, Math.min(32, (stepX * 0.64) / Math.max(barSeries.length, 1)));
                return series.values.map((value, categoryIndex) => {
                  const groupCenter = padding.left + (categoryIndex * stepX);
                  const groupOffset = ((seriesIndex - ((barSeries.length - 1) / 2)) * barWidth);
                  const x = groupCenter + groupOffset - (barWidth / 2);
                  const barHeight = (value / maxValue) * chartHeight;
                  const y = padding.top + chartHeight - barHeight;
                  return (
                    <rect
                      key={`${series.name}-${props.model.categories[categoryIndex]}`}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(barHeight, 1)}
                      rx="6"
                      fill={series.color}
                      opacity="0.92"
                    />
                  );
                });
              })}

              {lineSeries.map((series) => {
                const points = series.values.map((value, categoryIndex) => {
                  const x = padding.left + (categoryIndex * stepX);
                  const y = padding.top + chartHeight - ((value / maxValue) * chartHeight);
                  return { x, y };
                });
                return (
                  <g key={series.name}>
                    <polyline
                      fill="none"
                      stroke={series.color}
                      strokeWidth="3"
                      points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                    />
                    {points.map((point, index) => (
                      <circle key={`${series.name}-point-${index}`} cx={point.x} cy={point.y} r="4" fill={series.color} />
                    ))}
                  </g>
                );
              })}

              {props.model.categories.map((category, index) => {
                const x = padding.left + (index * stepX);
                return (
                  <text key={category} x={x} y={height - 18} fontSize="12" fill="currentColor" textAnchor="middle">
                    {category}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
        <div className="conversation-code-preview-surface-chart-legend">
          {props.model.series.map((series) => (
            <div key={series.name} className="conversation-code-preview-surface-legend-item">
              <span className="conversation-code-preview-surface-legend-swatch" style={{ background: series.color }} />
              <span className="conversation-code-preview-surface-legend-text">{series.name}</span>
              <span className="conversation-code-preview-surface-legend-value">
                {series.chartType === "line" ? "Line" : "Bar"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConversationPieChartPreview(props: { model: ConversationPieChartPreviewModel }) {
  const radius = 120;
  const innerRadius = props.model.style === "doughnut" ? 64 : undefined;
  const total = Math.max(1, props.model.slices.reduce((sum, item) => sum + item.value, 0));
  let currentAngle = -Math.PI / 2;

  return (
    <div className="conversation-code-preview-surface-chart-shell is-pie">
      <div className="conversation-code-preview-surface-chart-card is-pie">
        {props.model.title ? (
          <div className="conversation-code-preview-surface-chart-title">{props.model.title}</div>
        ) : null}
        <div className="conversation-code-preview-surface-chart-canvas is-pie">
          <div className="conversation-code-preview-surface-chart-viewport is-pie">
            <svg className="conversation-code-preview-surface-chart-svg is-pie" viewBox="0 0 320 320">
              {props.model.slices.map((slice) => {
                const angle = (slice.value / total) * Math.PI * 2;
                const startAngle = currentAngle;
                const endAngle = currentAngle + angle;
                currentAngle = endAngle;
                return (
                  <path
                    key={slice.name}
                    d={describeArc({
                      centerX: 160,
                      centerY: 160,
                      radius,
                      innerRadius,
                      startAngle,
                      endAngle,
                    })}
                    fill={slice.color}
                  />
                );
              })}
            </svg>
          </div>
        </div>
        <div className="conversation-code-preview-surface-chart-legend is-pie">
          {props.model.slices.map((slice) => (
            <div key={slice.name} className="conversation-code-preview-surface-legend-item">
              <span className="conversation-code-preview-surface-legend-swatch" style={{ background: slice.color }} />
              <span className="conversation-code-preview-surface-legend-text">{slice.name}</span>
              <span className="conversation-code-preview-surface-legend-value">{formatNumber(slice.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MermaidPreview(props: { code: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diagramId = useId().replace(/:/g, "-");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let disposed = false;
    container.innerHTML = "";
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "neutral",
    });

    void mermaid.render(`desktop-mermaid-${diagramId}`, props.code)
      .then(({ svg }) => {
        if (!disposed && container) {
          container.innerHTML = svg;
        }
      })
      .catch((error) => {
        if (!disposed && container) {
          container.innerHTML = `<pre>${String(error)}</pre>`;
        }
      });

    return () => {
      disposed = true;
    };
  }, [diagramId, props.code]);

  return (
    <div className="conversation-code-preview-surface-diagram">
      <div ref={containerRef} />
    </div>
  );
}

export function ConversationCodePreviewPanel(props: Props) {
  const { message } = App.useApp();
  const normalizedCode = useMemo(() => normalizeConversationCodeBlockText(props.code), [props.code]);
  const parsedInfo = useMemo(
    () => parseConversationCodeBlockInfoString(props.infoString),
    [props.infoString],
  );
  const previewMode = useMemo(
    () => resolveConversationCodeBlockPreviewMode({
      previewKind: parsedInfo.previewKind,
      fenceLanguage: parsedInfo.fenceLanguage,
    }),
    [parsedInfo.fenceLanguage, parsedInfo.previewKind],
  );
  const languageLabel = resolveConversationCodeBlockLanguageLabel(parsedInfo.fenceLanguage);
  const monacoLanguage = resolveConversationCodeBlockMonacoLanguage(parsedInfo.fenceLanguage);
  const chartParseResult = useMemo(
    () => previewMode === "chart" ? parseConversationChartPreviewSource(normalizedCode) : null,
    [normalizedCode, previewMode],
  );
  const effectiveHeadVariant = props.headVariant ?? "default";
  const isEn = props.uiLanguage === "en-US";
  const isMindmapDiagram = useMemo(
    () => previewMode === "diagram" && looksLikeMermaidMindmapSource(normalizedCode),
    [normalizedCode, previewMode],
  );
  const embeddedLanguageLabel = isMindmapDiagram
    ? (isEn ? "Mindmap" : "脑图")
    : (languageLabel ?? (parsedInfo.fenceLanguage || undefined));
  const [showSource, setShowSource] = useState(previewMode === "source");
  const supportsRenderedPreview = previewMode !== "source";
  const showingSource = previewMode === "source" || showSource;

  useEffect(() => {
    setShowSource(previewMode === "source");
  }, [previewMode, normalizedCode, props.infoString]);

  const handleToggleSource = useCallback(() => {
    if (!supportsRenderedPreview) {
      return;
    }

    setShowSource((current) => !current);
  }, [supportsRenderedPreview]);

  const handleCopyCode = useCallback(async () => {
    const writeText = globalThis.navigator?.clipboard?.writeText;
    if (typeof writeText !== "function") {
      message.error(isEn ? "Copy is unavailable in this environment" : "当前环境不支持复制代码");
      return;
    }

    try {
      await writeText.call(globalThis.navigator.clipboard, normalizedCode);
      message.success(isEn ? "Code copied" : "已复制代码");
    } catch (error) {
      const prefix = isEn ? "Copy failed" : "复制代码失败";
      message.error(`${prefix}: ${resolveConversationPreviewActionErrorText(error)}`);
    }
  }, [isEn, message, normalizedCode]);

  const renderEmbeddedCodeBlock = useMemo(
    () => (input: ConversationMarkdownEmbeddedCodeBlockInput) => {
      if (input.previewMode === "source") {
        return undefined;
      }

      return (
        <div className="conversation-code-preview-surface-markdown-embedded-block">
          <ConversationCodePreviewPanel
            code={input.code}
            infoString={input.infoString}
            plain
            headVariant="language-only"
          />
        </div>
      );
    },
    [],
  );

  const previewContent = previewMode === "markdown" ? (
    <div className="conversation-code-preview-surface-preview is-markdown">
      <div className="conversation-code-preview-surface-markdown">
        <ConversationMarkdownPreview
          markdown={normalizedCode}
          renderEmbeddedCodeBlock={renderEmbeddedCodeBlock}
        />
      </div>
    </div>
  ) : previewMode === "diagram" ? (
    <div className={`conversation-code-preview-surface-preview is-diagram${isMindmapDiagram ? " is-mindmap" : ""}`}>
      {isMindmapDiagram ? (
        <ConversationMindmapPreview
          language={props.uiLanguage ?? "zh-CN"}
          sourceText={normalizedCode}
        />
      ) : (
        <MermaidPreview code={normalizedCode} />
      )}
    </div>
  ) : previewMode === "chart" ? (
    chartParseResult?.model?.kind === "axis" ? (
      <div className="conversation-code-preview-surface-preview is-chart">
        <ConversationAxisChartPreview model={chartParseResult.model} />
      </div>
    ) : chartParseResult?.model?.kind === "pie" ? (
      <div className="conversation-code-preview-surface-preview is-chart">
        <ConversationPieChartPreview model={chartParseResult.model} />
      </div>
    ) : (
      <div className="conversation-code-preview-surface-preview is-chart">
        <Alert
          type="warning"
          showIcon
          title={chartParseResult?.error ?? "无法识别图表规范"}
        />
      </div>
    )
  ) : null;

  const headNode = !props.hideHead ? (
    effectiveHeadVariant === "language-only" ? (
      embeddedLanguageLabel ? (
        <div className="conversation-code-preview-surface-head is-language-only">
          <span className="conversation-code-preview-surface-language-text">{embeddedLanguageLabel}</span>
        </div>
      ) : null
    ) : (
      <div className="conversation-code-preview-surface-head">
        {props.title ? <div className="conversation-code-preview-surface-chart-title">{props.title}</div> : null}
        {props.subtitle ? <div className="workspace-file-rich-preview-subtitle">{props.subtitle}</div> : null}
      </div>
    )
  ) : null;

  const topLevelToolbarLabel = useMemo(() => {
    const baseLabel = props.subtitle?.trim()
      || props.title?.trim()
      || embeddedLanguageLabel
      || parsedInfo.fenceLanguage
      || (isEn ? "Code preview" : "代码预览");

    if (showingSource) {
      return `${baseLabel} ${isEn ? "source" : "源码"}`;
    }

    return baseLabel;
  }, [embeddedLanguageLabel, isEn, parsedInfo.fenceLanguage, props.subtitle, props.title, showingSource]);

  if (props.plain) {
    return (
      <div
        className="conversation-code-preview-surface"
        data-preview-mode={previewMode}
        data-preview-chrome="plain"
      >
        {headNode}
        {showingSource ? (
          <PreviewPanelSourceEditor
            path={props.title?.trim() || parsedInfo.fenceLanguage || "code-preview"}
            content={normalizedCode}
            monacoLanguage={monacoLanguage}
            emptyDescription={isEn ? "No source available." : "暂无源码"}
          />
        ) : previewContent}
      </div>
    );
  }

  return (
    <div className="workspace-file-preview-panel" data-preview-view={showingSource ? "source" : "preview"}>
      <PreviewPanelToolbar
        displayPath={topLevelToolbarLabel}
        actions={(
          <>
            {supportsRenderedPreview ? (
              <Tooltip title={showingSource ? (isEn ? "Back to preview" : "切回预览") : (isEn ? "View source" : "查看源码")}>
                <Button
                  type="text"
                  size="small"
                  className={`workspace-file-preview-panel-action${showingSource ? " is-active" : ""}`}
                  icon={showingSource ? <EyeOutlined /> : <CodeOutlined />}
                  aria-label={showingSource ? (isEn ? "Back to preview" : "切回预览") : (isEn ? "View source" : "查看源码")}
                  onClick={handleToggleSource}
                />
              </Tooltip>
            ) : null}
            <Tooltip title={isEn ? "Copy code" : "复制代码"}>
              <Button
                type="text"
                size="small"
                className="workspace-file-preview-panel-action"
                icon={<CopyOutlined />}
                aria-label={isEn ? "Copy code" : "复制代码"}
                onClick={() => {
                  void handleCopyCode();
                }}
              />
            </Tooltip>
          </>
        )}
      />
      {showingSource ? (
        <PreviewPanelSourceEditor
          path={props.title?.trim() || parsedInfo.fenceLanguage || "code-preview"}
          content={normalizedCode}
          monacoLanguage={monacoLanguage}
          emptyDescription={isEn ? "No source available." : "暂无源码"}
        />
      ) : (
        <div
          className="conversation-code-preview-surface"
          data-preview-mode={previewMode}
          data-preview-chrome="plain"
        >
          {previewContent}
        </div>
      )}
    </div>
  );
}