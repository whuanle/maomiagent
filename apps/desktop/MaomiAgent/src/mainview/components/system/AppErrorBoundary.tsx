import { Button } from "antd";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render failed", error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="app-error-boundary">
        <div className="app-error-boundary__panel">
          <h1 className="app-error-boundary__title">界面渲染失败</h1>
          <p className="app-error-boundary__copy">当前页面在渲染时抛出了异常，已被全局错误边界拦截。</p>
          <pre className="app-error-boundary__message">{this.state.error.message || String(this.state.error)}</pre>
          <div className="app-error-boundary__actions">
            <Button type="primary" onClick={() => window.location.reload()}>
              重新加载
            </Button>
          </div>
        </div>
      </div>
    );
  }
}