import { NextResponse } from 'next/server'

// Dev-only route to verify Sentry error capture end-to-end — never
// available in production. Hitting this route throws, which the
// instrumentation.ts `onRequestError` hook reports to Sentry (when
// NEXT_PUBLIC_SENTRY_DSN is configured). See docs/MONITORING.md.
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  throw new Error('Sentry test error — thrown intentionally by app/api/dev/sentry-test/route.ts')
}
