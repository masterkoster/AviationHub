'use client'

/**
 * ROOT global error boundary — catches errors that escape EVERY other
 * boundary (including the root layout's Providers tree). This is the
 * last line of defense before Next.js shows its own generic error.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ margin: 0, padding: '24px', fontFamily: 'ui-monospace, monospace', background: '#0a0a0a', color: '#ff5555' }}>
        <h2 style={{ fontSize: '15px', marginBottom: '12px' }}>Root global error captured</h2>
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