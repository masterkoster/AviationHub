import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Loads the Sentry config matching the current runtime (nodejs vs edge).
 *
 * No-ops everywhere if NEXT_PUBLIC_SENTRY_DSN is unset — see
 * sentry.server.config.ts / sentry.edge.config.ts / instrumentation-client.ts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors from nested React Server Components (including errors
// surfaced by the App Router's server rendering, API routes, etc).
// Sentry.captureRequestError itself checks whether the SDK was initialized
// with a DSN, so this stays inert when NEXT_PUBLIC_SENTRY_DSN is unset.
export const onRequestError = Sentry.captureRequestError;
