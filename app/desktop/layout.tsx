'use client'

import { Component, ReactNode } from 'react'
import { DesktopShell } from '@/desktop/components/desktop-shell'

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Root error boundary for the desktop shell. Catches any render-time
 * exception (e.g. undefined access, missing provider, etc) and shows the
 * actual error message instead of a blank "Application error" page.
 */
class DesktopErrorBoundary extends Component<{ children: ReactNode }, State> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error('[DesktopErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <div className="max-w-lg space-y-4">
            <h1 className="text-lg font-bold text-destructive">
              Desktop render error
            </h1>
            <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack}
            </pre>
            <button
              onClick={() => {
                this.setState({ hasError: false })
                window.location.reload()
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function DesktopLayout({ children }: { children: React.ReactNode }) {
  return (
    <DesktopErrorBoundary>
      <DesktopShell>{children}</DesktopShell>
    </DesktopErrorBoundary>
  )
}