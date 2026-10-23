import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// 捕获渲染期异常，避免整页白屏；改为显示可读错误信息，便于定位。
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-cream-100 px-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 text-center">
            <div className="text-3xl mb-3">⚠️</div>
            <h1 className="text-lg font-bold text-sage-800 mb-2">页面出错了</h1>
            <p className="text-sm text-sage-500 mb-4 leading-relaxed">
              应用运行时发生异常。你可以尝试刷新，或清除该网站的缓存后重试。
            </p>
            <pre className="text-left text-xs text-red-500 bg-red-50 rounded-lg p-3 mb-4 whitespace-pre-wrap break-words max-h-40 overflow-auto">
              {this.state.error.message}
            </pre>
            <button
              onClick={this.handleReload}
              className="w-full h-10 rounded-xl bg-sage-500 text-white font-medium hover:bg-sage-600 transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
