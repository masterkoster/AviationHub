import * as Sentry from "@sentry/nextjs";

// Server-side Sentry init (Node.js runtime). Inert until a DSN exists —
// `enabled` is explicitly gated so no client is spun up, no network calls
// are made, and nothing is queued in memory when NEXT_PUBLIC_SENTRY_DSN
// is unset.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) && process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
