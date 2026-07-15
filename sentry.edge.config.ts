import * as Sentry from "@sentry/nextjs";

// Edge runtime Sentry init (middleware, edge API routes). Inert until a
// DSN exists — see sentry.server.config.ts for why `enabled` is explicit.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN) && process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});
