'use client'

import { useEffect } from 'react'

/**
 * Next.js global-error boundary for the /desktop segment.
 * This catches errors that escape the layout-level error boundary,
 * and shows the ACTUAL error message instead of the generic
 * "Application error: a client-side exception has occurred".
 */
export default function DesktopGlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[DesktopGlobalError]', error)
  }, [error])

  return (
    <html>
      <body style={{ margin: 0, padding: '24px', fontFamily: 'monospace', background: '#0a0a0a', color: '#ff4444' }}>
        <h2 style={{ fontSize: '16px', marginBottom: '12px' }}>Desktop global error</h2>
        <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: '1.4' }}>
{error?.message || 'Unknown error'}

---

Stack:
{error?.stack || '(no stack)'}

---

Digest: {error?.digest || '(none)'}
        </pre>
        <button
          onClick={reset}
          style={{ marginTop: '12px', padding: '6px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}