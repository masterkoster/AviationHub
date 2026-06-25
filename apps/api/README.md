# apps/api (planned target)

This directory is reserved for a dedicated API service package.

Current API routes still live under root Next.js routes (`app/api/*`).

Migration policy:
- Extract cloud API to this app/package boundary.
- Maintain Azure SQL integrations and auth contracts.
- Keep a strict contract for desktop sync + web clients.
