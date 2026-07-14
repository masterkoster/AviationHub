import * as Sentry from "@sentry/nextjs";

// Client-side Sentry init. Next.js automatically loads this file in the
// browser bundle (no wiring needed in instrumentation.ts for the client
// runtime). Inert until a DSN exists — see sentry.server.config.ts for why
// `enabled` is explicit rather than relying on dsn-undefined behavior alone.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
