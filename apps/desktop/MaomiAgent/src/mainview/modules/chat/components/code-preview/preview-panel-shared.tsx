import Editor from "@monaco-editor/react";
import { Empty } from "antd";
import type { editor as MonacoEditorNs } from "monaco-editor";
import { useEffect, useRef, type ReactNode } from "react";

import { isDarkThemeMode, readThemeMode } from "../../../../theme/antd-theme";

const PREVIEW_PANEL_MONACO_LINE_HEIGHT = 20;

type PreviewPanelToolbarProps = {
  displayPath: ReactNode;
  actions?: ReactNode;
};

type PreviewPanelSourceEditorProps = {
  path?: string;
  content: string;
  monacoLanguage: string;
  emptyDescription?: ReactNode;
  readOnly?: boolean;
  onChange?: (value: string) => void;
};

export function PreviewPanelToolbar(props: PreviewPanelToolbarProps) {
  return (
    <div className="workspace-file-preview-panel-toolbar">
      <div className="workspace-file-preview-panel-path">{props.displayPath}</div>
      {props.actions ? (
        <div className="workspace-file-preview-panel-actions">{props.actions}</div>
      ) : null}
    </div>
  );
}

export function PreviewPanelSourceEditor(props: PreviewPanelSourceEditorProps) {
  const sourceHostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);
  const layoutFrameRef = useRef<number | null>(null);
  const monacoTheme = isDarkThemeMode(readThemeMode()) ? "vs-dark" : "vs";
  const readOnly = props.readOnly ?? true;

  useEffect(() => {
    const host = sourceHostRef.current;
    if (!host || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const layoutEditor = () => {
      const editor = editorRef.current;
      if (!editor) {
        return;
      }

      const rect = host.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      editor.layout({
        width: rect.width,
        height: rect.height,
      });
    };

    const scheduleLayout = () => {
      if (typeof window === "undefined") {
        layoutEditor();
        return;
      }

      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
      }

      layoutFrameRef.current = window.requestAnimationFrame(() => {
        layoutFrameRef.current = null;
        layoutEditor();
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleLayout();
    });
    observer.observe(host);
    scheduleLayout();

    return () => {
      if (typeof window !== "undefined" && layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
      observer.disconnect();
    };
  }, [props.content, props.monacoLanguage, props.path]);

  if (!props.content) {
    return (
      <div className="conversation-code-preview-surface-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={props.emptyDescription ?? "文件为空"}
        />
      </div>
    );
  }

  return (
    <div ref={sourceHostRef} className="conversation-code-preview-surface-source">
      <div className="workspace-file-preview-panel-editor-shell">
        <Editor
          path={props.path}
          value={props.content}
          height="100%"
          language={props.monacoLanguage}
          theme={monacoTheme}
          className="conversation-code-preview-monaco-host"
          wrapperProps={{
            className: "conversation-code-preview-monaco-wrapper",
          }}
          onMount={(editor) => {
            editorRef.current = editor;
            if (typeof window === "undefined") {
              editor.layout();
              return;
            }

            window.requestAnimationFrame(() => {
              const host = sourceHostRef.current;
              if (!host) {
                editor.layout();
                return;
              }

              const rect = host.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                editor.layout({
                  width: rect.width,
                  height: rect.height,
                });
                return;
              }

              editor.layout();
            });
          }}
          onChange={(value) => {
            if (!props.onChange) {
              return;
            }
            props.onChange(value ?? "");
          }}
          options={{
            automaticLayout: false,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: PREVIEW_PANEL_MONACO_LINE_HEIGHT,
            readOnly,
            scrollBeyondLastLine: false,
            glyphMargin: false,
            folding: false,
            hideCursorInOverviewRuler: true,
            lineDecorationsWidth: 6,
            lineNumbersMinChars: 3,
            overviewRulerBorder: false,
            renderLineHighlight: "none",
            scrollbar: {
              vertical: "visible",
              horizontal: "visible",
              useShadows: false,
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              verticalSliderSize: 6,
              horizontalSliderSize: 6,
            },
            smoothScrolling: true,
            wordWrap: "off",
            wrappingIndent: "none",
          }}
        />
      </div>
    </div>
  );
}