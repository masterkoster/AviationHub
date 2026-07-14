# Error monitoring (Sentry)

`@sentry/nextjs` is wired into the app but stays completely inert until a
DSN is configured. Nothing is sent anywhere, and no client is initialized,
until `NEXT_PUBLIC_SENTRY_DSN` is set.

## What's wired

- `instrumentation.ts` — registers `sentry.server.config.ts` (Node runtime)
  or `sentry.edge.config.ts` (Edge runtime) at startup, and exports
  `onRequestError` so server-side errors (including API routes and React
  Server Component rendering errors) are reported.
- `instrumentation-client.ts` — client-side init, loaded automatically by
  Next.js in the browser bundle.
- `sentry.server.config.ts` / `sentry.edge.config.ts` — server/edge init.
- `app/global-error.tsx` — root error boundary; calls
  `Sentry.captureException(error)` and renders a minimal "Something went
  wrong" card with a reload button.
- `next.config.ts` — wrapped with `withSentryConfig` for source map upload
  during build. Source map upload itself is disabled whenever
  `SENTRY_AUTH_TOKEN` is absent, so this never blocks a build.

All four `Sentry.init(...)` calls pass `enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)`
in addition to `dsn`, so the SDK does not spin up a client at all without a DSN.

**Not wired:** the desktop/Tauri tree (`src-tauri/`, `desktop/`). The
desktop app's webview loads the same Next.js client bundle when running in
cloud mode, so client-side error capture already applies there — that's
enough for now. Native Tauri/Rust-side errors are out of scope for this
pass.

## Env vars that activate it

Set in `.env.local` (or your deploy environment) — see `.env.example`:

| Var | Required for | Notes |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Any error reporting at all | Without this, Sentry is fully inert. Exposed client-side by design. |
| `SENTRY_ORG` | Source map upload during build | Optional; only affects build-time symbolication. |
| `SENTRY_PROJECT` | Source map upload during build | Optional. |
| `SENTRY_AUTH_TOKEN` | Source map upload during build | Optional; upload is skipped entirely when absent. |

## GitHub Actions

`.github/workflows/deploy.yml` passes `NEXT_PUBLIC_SENTRY_DSN`,
`SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` through from repo
secrets into the `npm run build` step. Add these as repository secrets
once the Sentry project exists — the workflow is harmless today since
those secrets don't exist yet (env vars just resolve to empty strings).

## How to verify

1. Set `NEXT_PUBLIC_SENTRY_DSN` in `.env.local` to a real DSN from your
   Sentry project (Project Settings → Client Keys).
2. Run the dev server (`npm run dev`).
3. Hit `GET /api/dev/sentry-test` — this route (`app/api/dev/sentry-test/route.ts`)
   is gated to `NODE_ENV=development` (404s otherwise) and throws
   intentionally, which flows through `onRequestError` in `instrumentation.ts`.
4. Check the Sentry project's Issues stream for the event.

To verify the client-side path, trigger any uncaught error in a browser
session (or temporarily `throw` in a client component) and confirm it
shows up in Sentry via `app/global-error.tsx` / the SDK's automatic
client-side capture.
