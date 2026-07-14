'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
// Root global-error replaces the entire <html> document, bypassing
// app/layout.tsx — global styles have to be imported here directly too.
import './globals.css'

/**
 * ROOT global error boundary — catches errors that escape EVERY other
 * boundary (including the root layout's Providers tree). This is the
 * last line of defense before Next.js shows its own generic error.
 *
 * Reports to Sentry when NEXT_PUBLIC_SENTRY_DSN is configured; the SDK
 * itself no-ops (captureException is a harmless call) when it wasn't
 * initialized with a DSN.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <div className="min-h-screen flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. The issue has been reported.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={reset}>Reload</Button>
            </CardContent>
          </Card>
        </div>
      </body>
    </html>
  )
}
