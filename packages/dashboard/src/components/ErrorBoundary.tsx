import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode; label?: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
            <AlertTriangle size={22} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold t1">{this.props.label ?? 'Something went wrong'}</p>
            <p className="text-xs t3 mt-1 max-w-xs">{this.state.error.message}</p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-2 text-xs font-medium bg-surface-2 border border-theme hover:bg-surface-3 px-4 py-2 rounded-lg transition-colors t1"
          >
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
