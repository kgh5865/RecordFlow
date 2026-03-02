import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] text-[#cccccc] gap-4 p-8">
          <div className="text-2xl">⚠</div>
          <div className="text-sm font-medium">렌더링 오류가 발생했습니다</div>
          <div className="text-xs text-[#888] max-w-md text-center break-all">
            {this.state.error?.message}
          </div>
          <button
            className="px-4 py-1.5 text-xs rounded bg-[#007acc] hover:bg-[#1a8ad4] text-white transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
