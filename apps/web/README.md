# apps/web (planned target)

This directory is reserved for the web application once the repository migration finishes.

Current web runtime still lives in the root `app/` Next.js structure.

Migration policy:
- Move web-only pages, API routes, and web auth into `apps/web`.
- Keep shared styling and reusable UI in `packages/*`.
- Keep desktop runtime isolated from this app.
