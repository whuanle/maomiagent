import Editor from "@monaco-editor/react"
import { Alert } from "antd"
import type { editor as MonacoEditorNs } from "monaco-editor"
import { useEffect, useRef } from "react"
import { isDarkThemeMode, readThemeMode } from "../../../theme/antd-theme"

const FEISHU_DOC_SOURCE_EDITOR_LINE_HEIGHT = 20

export function FeishuDocSourceEditor(props: {
  value: string
  error: string
  path?: string
  language?: string
  readOnly?: boolean
  onChange: (value: string) => void
}) {
  const sourceHostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null)
  const layoutFrameRef = useRef<number | null>(null)
  const monacoTheme = isDarkThemeMode(readThemeMode()) ? "vs-dark" : "vs"

  useEffect(() => {
    const host = sourceHostRef.current
    if (!host || typeof ResizeObserver === "undefined") {
      return undefined
    }

    const layoutEditor = () => {
      const editor = editorRef.current
      if (!editor) {
        return
      }

      const rect = host.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return
      }

      editor.layout({
        width: rect.width,
        height: rect.height,
      })
    }

    const scheduleLayout = () => {
      if (typeof window === "undefined") {
        layoutEditor()
        return
      }

      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current)
      }

      layoutFrameRef.current = window.requestAnimationFrame(() => {
        layoutFrameRef.current = null
        layoutEditor()
      })
    }

    const observer = new ResizeObserver(() => {
      scheduleLayout()
    })

    observer.observe(host)
    scheduleLayout()

    return () => {
      if (typeof window !== "undefined" && layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current)
        layoutFrameRef.current = null
      }
      observer.disconnect()
    }
  }, [props.language, props.path, props.value])

  return (
    <div data-testid="feishu-doc-source-editor" className="feishu-doc-source-editor">
      {props.error ? <Alert showIcon type="error" message={props.error} /> : null}
      <div ref={sourceHostRef} className="feishu-doc-source-editor-host">
        <Editor
          path={props.path}
          value={props.value}
          height="100%"
          language={props.language ?? "markdown"}
          theme={monacoTheme}
          className="feishu-doc-source-editor-monaco"
          wrapperProps={{
            className: "feishu-doc-source-editor-wrapper",
          }}
          onMount={(editor) => {
            editorRef.current = editor
            if (typeof window === "undefined") {
              editor.layout()
              return
            }

            window.requestAnimationFrame(() => {
              const host = sourceHostRef.current
              if (!host) {
                editor.layout()
                return
              }

              const rect = host.getBoundingClientRect()
              if (rect.width > 0 && rect.height > 0) {
                editor.layout({
                  width: rect.width,
                  height: rect.height,
                })
                return
              }

              editor.layout()
            })
          }}
          onChange={(value) => props.onChange(value ?? "")}
          options={{
            automaticLayout: false,
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: FEISHU_DOC_SOURCE_EDITOR_LINE_HEIGHT,
            readOnly: props.readOnly ?? false,
            scrollBeyondLastLine: false,
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 3,
            overviewRulerBorder: false,
            renderLineHighlight: props.readOnly ? "none" : "gutter",
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
            wordWrap: "on",
            wrappingIndent: "same",
          }}
        />
      </div>
    </div>
  )
}