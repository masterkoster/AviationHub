'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  resetKey?: string | number
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Wraps the Leaflet map so a crash inside Leaflet (bad tile, missing
 * layer, etc) doesn't take down the entire app.
 */
export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('[MapErrorBoundary]', error, errorInfo)
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, error: undefined })
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex h-full items-center justify-center bg-muted/30 p-4">
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Map crashed</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {this.state.error?.message}
              </p>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        )
      )
    }
    return this.props.children
  }
}
