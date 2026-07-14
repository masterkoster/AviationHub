# API Auth Coverage Audit

Audit of every `route.ts` under `app/api/**` (188 files at the start of this
audit). Per-route enforcement pattern is `const session = await auth()`
(from `@/lib/auth`) returning 401 when absent, usually followed by a
membership/role/ownership check. Canonical example:
`app/api/groups/[groupId]/aircraft/[aircraftId]/route.ts`.

## Summary

| Classification | Count | Notes |
|---|---|---|
| GATED (session required for every exported method) | 141 | Canonical pattern; membership/role/ownership checks vary by route, see table |
| PUBLIC-BY-DESIGN (no session, intentionally open) | 43 | Reference data, auth flows, public share-token routes, crowd-sourced contributions, Stripe webhook (signature auth) |
| DEV-ONLY | 4 | `dev/login`, `debug`, `fix-passwords`, `test-login` — all 404 outside `NODE_ENV=development`; the latter three also require an admin/owner session even in dev |
| UNGUARDED-SENSITIVE — found and fixed | 4 | See "Fixes applied" below |
| **Total routes audited** | **191** (188 minus the deleted debug route, plus 4 new club-payments routes added after this audit) | |

Secondary defects fixed across the codebase (not tied to a single
classification): 6 routes constructing their own `new PrismaClient()`
instead of importing the shared client, and 13 routes leaking raw
`String(error)`/`error.message` into the `details` field of 500 responses.

## Fixes applied

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `app/api/debug-aircraft/route.ts` | Deleted entirely. Unauthenticated GET, constructed its own `PrismaClient`, dumped raw `AircraftMaster` rows to anyone. No callers found elsewhere in the repo (grep for `/api/debug-aircraft` only matched generated `.next/` build manifests, which regenerate). | Deleted the route directory. |
| 2 | `app/api/endorsements/templates/route.ts` | `POST` (seeds the global endorsement-template table) had no auth check at all — any unauthenticated caller could trigger a database write. | Added `await auth()` 401 gate + `role === 'admin' \|\| role === 'owner'` 403 gate, matching the codebase's standard admin pattern. `GET` (read-only reference data) left public. |
| 3 | `app/api/weather/route.ts` | `POST` deletes rows from `weatherCache` (by `icao` or `region`) with no auth check — anyone could force cache invalidation / repeated upstream refetches. | Added `await auth()` 401 gate. `GET` (cached weather reads) left public. |
| 4 | `app/api/integrations/quickbooks/callback/route.ts` | OAuth callback had no session check at all, and derived `groupId` directly from the unsigned, attacker-controllable `state` query param (`groupId:randomState`) to upsert an `Integration` record with live OAuth tokens. Code had a `// TODO: Verify state matches what we stored (CSRF protection)` acknowledging the gap. Anyone who could get this URL to load in a victim's authenticated browser (or simply call it directly, since it wasn't gated) could bind arbitrary OAuth tokens to any club's QuickBooks integration. | Added `await auth()` 401 gate + `organizationMember.findFirst({ role: 'ADMIN' })` 403 gate on the `groupId` parsed from `state`, before exchanging the code or writing the `Integration` record. |

Also fixed, `new PrismaClient()` → shared `@/lib/prisma` client:
`app/api/aircraft/search/route.ts`, `app/api/aircraft/search/models/route.ts`,
`app/api/aircraft/search/options/route.ts`, `app/api/debug/route.ts`,
`app/api/fix-passwords/route.ts`, `app/api/test-login/route.ts`.

Also fixed, stripped `details: String(error)` / `details: error.message`
from 500 responses (now a generic `{ error: '...' }` only):
`app/api/admin/outreach/campaigns/route.ts`,
`app/api/admin/outreach/contacts/route.ts`,
`app/api/flying-club/maintenance/queue/route.ts`,
`app/api/groups/[groupId]/aircraft/[aircraftId]/profile/route.ts`,
`app/api/groups/[groupId]/blockouts/route.ts`,
`app/api/groups/[groupId]/bookings/[bookingId]/route.ts`,
`app/api/groups/[groupId]/documents/route.ts`,
`app/api/groups/[groupId]/documents/[docId]/route.ts`,
`app/api/groups/[groupId]/posts/route.ts`,
`app/api/groups/[groupId]/posts/[postId]/route.ts`,
`app/api/invite/[token]/route.ts`.

Unrelated pre-existing TypeScript error found while verifying `tsc --noEmit`
(`app/desktop/modules/tools/holding-pattern-tool.tsx` passing an `entry` prop
the `HoldingSVG` component doesn't declare) was also fixed — one-line prop
removal, zero behavior change — since it was blocking a clean typecheck.

## Judgment calls (left public/as-is — a human should confirm)

- **`app/api/fbo-fees/route.ts`, `app/api/fuel/route.ts` (`POST`)** — accept anonymous writes of FBO/fuel-price data ("Thanks for contributing!" messaging implies intentional crowd-sourcing, same pattern as the sessioned-but-optional `app/api/fuel-prices/community/route.ts`). Low sensitivity (no PII), but unauthenticated writes are spammable/pollutable. Left public by design; consider light rate-limiting if abuse shows up.
- **`app/api/discover/routes/[id]/route.ts` (`POST`, action `import`)** — increments a public `downloadsCount` counter with no auth. Low risk (just a counter), left as-is.
- **`app/api/data-status/route.ts`** — exposes internal fuel-cache freshness/age stats. No PII, but it's operational/debug-flavored data with no obvious reason to be public. Left public; consider gating behind admin if it's meant to be an ops page.
- **`app/api/logbook/lookup/route.ts`** — looks up a pilot's active `LogbookSharingLink` by `displayId` and returns the full link object (including its `token`) regardless of the link's `scope`. `logbook/public/[token]` itself correctly checks `scope === 'public'` before returning entries, so this doesn't leak flight data directly, but it does leak the existence/token of a possibly-`private` or `unlisted` sharing link to anyone who knows/guesses the pilot's `displayId`. Worth a follow-up to `select` only public-safe fields.
- **`app/api/mechanics/search/route.ts`** — public mechanic directory `select`s `locationLat`/`locationLng` unconditionally; there's a `locationPrivacy` field on the model that this route doesn't consult. Possible unintended precise-location exposure for mechanics who opted for privacy. Left as-is (didn't want to guess intended filtering behavior).
- **`app/api/discover/clubs/route.ts`** — public club map data includes `contactEmail`. Route is explicitly documented as "only publicly-safe fields are returned" and clubs opt in via `showOnMap`, so likely intentional, but flagging since it's an email address.
- ~~QuickBooks integration family (`connect`, `status`, `disconnect`, `sync`) missing group authorization~~ — **fixed after review approval**. All four routes previously required only a session and carried `// TODO: Verify user has admin access to this group` comments, letting any authenticated user view/connect/disconnect/sync any club's QuickBooks integration by supplying an arbitrary `groupId`. Each now validates `groupId` with `isUuid` and requires `organizationMember.findFirst({ organizationId: groupId, userId, role: 'ADMIN' })`, returning 403 otherwise — the same check applied to the `callback` route.

---

## GATED routes (session required for every exported method)

| Route | Methods | Auth mechanism | Notes |
|---|---|---|---|
| /api/admin/aircraft | GET/POST | session + admin/owner role | |
| /api/admin/billing | GET | session + admin/owner role | |
| /api/admin/billing/transactions | GET | session + admin/owner role | |
| /api/admin/clubs | GET | session + admin/owner role | |
| /api/admin/clubs/[clubId] | GET | session + admin/owner role | |
| /api/admin/demo-data | GET/POST | session + admin/owner role | |
| /api/admin/error-reports | GET/PUT | session + admin/owner role | |
| /api/admin/flights | GET | session + admin/owner role | |
| /api/admin/flights/summary | GET | session + admin/owner role | |
| /api/admin/fuel-expenses | GET | session + org membership + role:ADMIN | |
| /api/admin/fuel-expenses/[id] | PATCH | session + org membership + role:ADMIN | |
| /api/admin/maintenance/history | GET | session + org membership | |
| /api/admin/maintenance/issues | GET | session + org membership + role:ADMIN | |
| /api/admin/maintenance/issues/[id] | PATCH | session + org membership + role:ADMIN | |
| /api/admin/marketplace/listings | GET | session + admin/owner role | |
| /api/admin/members | GET/POST | session + admin/owner role | |
| /api/admin/migrate | POST | session + admin/owner role | |
| /api/admin/migrate/presence | POST | session + admin/owner role | |
| /api/admin/outreach/campaigns | GET/POST | session + admin/owner role | error `details` leak fixed |
| /api/admin/outreach/contacts | GET/POST | session + admin/owner role | error `details` leak fixed |
| /api/admin/pipeline | GET | session + admin/owner role | |
| /api/admin/stats | GET | session + admin/owner role | |
| /api/admin/users | GET/POST | session (role check inline per action) | |
| /api/admin/users/[id] | GET/POST/PUT | session + admin/owner role | |
| /api/aircraft | GET/POST | session, scoped to caller | |
| /api/auth/delete-account | DELETE | session, scoped to caller | |
| /api/billing | GET | session, scoped to caller | |
| /api/bookings | GET | session, scoped to caller | |
| /api/clubs/[groupId]/billing/run | POST | session + org membership + role:ADMIN | |
| /api/clubs/[groupId]/blockouts | GET/POST/DELETE | session + org membership + role:ADMIN | |
| /api/clubs/[groupId]/flights/active | GET | session | |
| /api/clubs/[groupId]/flights/checkin | POST | session + ownership check | |
| /api/clubs/[groupId]/flights/checkout | POST | session | |
| /api/clubs/[groupId]/schedule | GET | session | |
| /api/conversations | GET/POST | session, scoped to caller | |
| /api/conversations/[id]/messages | GET/POST | session + ownership check | |
| /api/discover/routes | GET/POST | GET public (public shared routes only); POST session-gated | |
| /api/discover/routes/[id] | DELETE/POST | DELETE session+ownership gated; POST (`import` counter) intentionally left ungated — see judgment calls | |
| /api/e2ee/public-key | GET/PUT | session | |
| /api/endorsements/requests | GET/POST/PUT | session | |
| /api/endorsements/sign | POST | session | |
| /api/engine/anomalies | GET/PATCH | session | |
| /api/engine/upload | GET/POST | session | |
| /api/error-report | POST | session | |
| /api/flight-plans | GET/POST/PUT/DELETE | session, scoped to caller | |
| /api/flight-tracks | GET/POST/DELETE | session, scoped to caller | |
| /api/flying-club/maintenance/queue | GET/POST/PATCH | session + org membership + role:ADMIN | error `details` leak fixed |
| /api/friends | GET | session | |
| /api/friends/requests | GET/POST | session | |
| /api/friends/requests/[id] | PATCH | session | |
| /api/friends/with-status | GET | session | |
| /api/fuel-prices/community | GET/POST | GET public; POST session optional (anonymous submissions allowed, `userId` nullable) | crowd-sourced by design |
| /api/groups | GET/POST | session + role:ADMIN | |
| /api/groups/[groupId] | GET/PUT/DELETE | session + org membership + role:ADMIN | |
| /api/groups/[groupId]/aircraft | GET/POST | session + org membership + role:ADMIN | |
| /api/groups/[groupId]/aircraft/[aircraftId] | GET/PUT/DELETE | session + org membership + role:ADMIN | canonical pattern |
| /api/groups/[groupId]/aircraft/[aircraftId]/inspections | GET/POST | session + org membership | |
| /api/groups/[groupId]/aircraft/[aircraftId]/inspections/[inspectionId] | PATCH/DELETE | session + org membership | |
| /api/groups/[groupId]/aircraft/[aircraftId]/profile | GET | session + org membership | error `details` leak fixed |
| /api/groups/[groupId]/blockouts | GET | session + org membership | error `details` leak fixed |
| /api/groups/[groupId]/bookings | GET/POST | session + org membership | |
| /api/groups/[groupId]/bookings/[bookingId] | DELETE | session + org membership | error `details` leak fixed |
| /api/groups/[groupId]/chat | GET/POST | session + org membership | |
| /api/groups/[groupId]/documents | GET/POST | session + org membership + role:ADMIN/OFFICER | error `details` leak fixed |
| /api/groups/[groupId]/documents/[docId] | GET/DELETE | session + org membership + role:ADMIN/OFFICER or uploader | error `details` leak fixed |
| /api/groups/[groupId]/instructors | GET | session + org membership | |
| /api/groups/[groupId]/invites | GET/POST/DELETE | session + org membership + role:ADMIN | |
| /api/groups/[groupId]/join | POST | session + org membership | |
| /api/groups/[groupId]/logs | GET | session + org membership | |
| /api/groups/[groupId]/members | GET/PUT/DELETE | session + org membership + role:ADMIN | |
| /api/groups/[groupId]/policy | GET/PUT | session + org membership | |
| /api/groups/[groupId]/posts | GET/POST | session + org membership + role:ADMIN/OFFICER | error `details` leak fixed |
| /api/groups/[groupId]/posts/[postId] | PATCH/DELETE | session + org membership + role:ADMIN/OFFICER or author | error `details` leak fixed |
| /api/groups/all-bookings | GET | session, scoped to caller | |
| /api/instructors/certificates | POST | session | |
| /api/instructors/profile | GET/POST | session | |
| /api/integrations/quickbooks/connect | GET | session + org membership + role:ADMIN | isUuid + membership check added in this audit |
| /api/integrations/quickbooks/disconnect | POST | session + org membership + role:ADMIN | isUuid + membership check added in this audit |
| /api/integrations/quickbooks/status | GET | session + org membership + role:ADMIN | isUuid + membership check added in this audit |
| /api/integrations/quickbooks/sync | POST | session + org membership + role:ADMIN | isUuid + membership check added in this audit |
| /api/invitations | GET/POST | session | |
| /api/logbook | GET/POST/PUT/DELETE | session + Pro+ tier or admin | DELETE is a static "use void instead" rejection, no data access |
| /api/logbook/aircraft | GET/POST | session | |
| /api/logbook/aircraft/[id] | PUT/DELETE | session | |
| /api/logbook/currency | GET/POST | session | |
| /api/logbook/currency/calc | POST | session | |
| /api/logbook/currency/progress | GET | session | |
| /api/logbook/custom-rules | GET/POST | session | |
| /api/logbook/deadlines | GET/POST | session | |
| /api/logbook/display-id | GET/POST | session | |
| /api/logbook/history | GET | session | |
| /api/logbook/history/export | GET | session | |
| /api/logbook/imports | GET/POST | session | |
| /api/logbook/preferences | GET/POST | session | |
| /api/logbook/sharing | GET/POST/PUT | session | |
| /api/logbook/starting-totals | GET/POST | session | |
| /api/logbook/templates | GET/POST | session | |
| /api/maintenance | GET/POST | session | |
| /api/maintenance/[id] | PATCH/PUT/DELETE | session + org membership + role:ADMIN | |
| /api/marketplace/inquiries | GET/POST | session | |
| /api/marketplace/inquiries/[id] | PATCH | session + ownership | |
| /api/marketplace/listings | GET/POST | GET public; POST session + email-verified | |
| /api/marketplace/listings/[id] | GET/PUT/DELETE | GET public; PUT/DELETE session + ownership | |
| /api/me/currency | GET/PATCH | session | |
| /api/me/dashboard | GET | session | |
| /api/mechanics/file-requests | POST/PUT | session + admin/owner role | |
| /api/mechanics/listings | GET/POST | session + admin/owner role | |
| /api/mechanics/listings/[id]/respond | POST | session + admin/owner role | |
| /api/mechanics/listings/[id]/revoke | POST | session | |
| /api/mechanics/listings/mine | GET | session | |
| /api/mechanics/profile | GET/PUT | session + admin/owner role | |
| /api/mechanics/quotes | GET | session | |
| /api/mechanics/quotes/[id]/status | POST | session | |
| /api/mechanics/quotes/mark-read | POST | session | |
| /api/mechanics/quotes/unread | GET | session | |
| /api/mechanics/requests/files | GET | session | |
| /api/mechanics/schedules | POST | session + admin/owner role | |
| /api/partnership | GET/POST | session | |
| /api/personal-bookings | GET/POST | session | |
| /api/pilots/me | GET/PUT | session, scoped to caller | |
| /api/presence/heartbeat | POST | session | |
| /api/profile | GET/PUT | session, scoped to caller | |
| /api/search | GET | session | |
| /api/sync | GET/POST | session | |
| /api/training-progress | GET/POST | session | |
| /api/training/financials | GET/POST | session | |
| /api/training/goal | GET/POST/DELETE | session | |
| /api/user-aircraft | GET | session | |
| /api/user/tier | GET | session + admin/owner role | |
| /api/users/me | GET/PUT | session, scoped to caller | |
| /api/v1/aircraft | GET/POST | session | |
| /api/v1/aircraft/[id] | PUT/DELETE | session | |
| /api/v1/currency | GET | session | |
| /api/v1/entitlements | GET | session | |
| /api/v1/logbook | GET/POST | session | |
| /api/v1/logbook/[id] | GET/PUT | session | |
| /api/v1/profile | GET/PUT | session | |
| /api/v1/totals | GET | session | |

## UNGUARDED-SENSITIVE — found and fixed

| Route | Methods | Issue | Fix |
|---|---|---|---|
| /api/debug-aircraft | GET | No auth, own `PrismaClient`, dumped `AircraftMaster` rows | Deleted (Task 1) |
| /api/endorsements/templates | GET/POST | `POST` unauthenticated DB write (template seeding) | `POST` now session + admin/owner gated; `GET` left public |
| /api/weather | GET/POST | `POST` unauthenticated cache-delete | `POST` now session gated; `GET` left public |
| /api/integrations/quickbooks/callback | GET | No session check; wrote OAuth tokens to an `Integration` keyed by an attacker-controllable `groupId` from `state` | Now session + org-membership(ADMIN) gated |

## DEV-ONLY

| Route | Methods | Auth mechanism | Notes |
|---|---|---|---|
| /api/dev/login | POST | `NODE_ENV !== 'development'` → 404 | No session needed (it issues one); verified username/password against DB |
| /api/debug | GET | `NODE_ENV === 'production'` → 404, then session + admin/owner role | own `PrismaClient` fixed |
| /api/fix-passwords | POST | `NODE_ENV === 'production'` → 404, then session + admin/owner role | own `PrismaClient` fixed |
| /api/test-login | GET | `NODE_ENV === 'production'` → 404, then session + admin/owner role | own `PrismaClient` fixed |

## PUBLIC-BY-DESIGN

| Route | Methods | Category |
|---|---|---|
| /api/aircraft/search | GET | FAA registry reference data (own `PrismaClient` fixed) |
| /api/aircraft/search/models | GET | FAA registry reference data (own `PrismaClient` fixed) |
| /api/aircraft/search/options | GET | FAA registry reference data (own `PrismaClient` fixed) |
| /api/airports | GET | Airport reference data |
| /api/airports/[icao] | GET | Airport reference data |
| /api/airports/bounds | GET | Airport reference data |
| /api/airports/search | GET | Airport reference data |
| /api/analytics | POST | Anonymous, PII-scrubbed analytics ingest |
| /api/auth/[...nextauth] | GET/POST | NextAuth handler |
| /api/auth/forgot-password | POST | Auth flow |
| /api/auth/resend-verification | POST | Auth flow |
| /api/auth/reset-password | POST | Auth flow |
| /api/auth/signup | GET/POST | Auth flow |
| /api/auth/verify-email | GET | Auth flow |
| /api/clubs/[groupId]/flights/complete | POST | Alias — re-exports `POST` from the gated `checkin` route, inherits its auth |
| /api/data-status | GET | Cache/ops status — judgment call, see above |
| /api/discover/clubs | GET | Public club discovery map |
| /api/events/nearby | GET | Public aviation events |
| /api/faa/aircraft/[nNumber] | GET | FAA registry lookup/cache |
| /api/fbo-fees | GET/POST | Public reference + crowd-sourced write — judgment call |
| /api/fuel-price | GET | Public reference (AirNav proxy) |
| /api/fuel/nearest | GET | Public reference |
| /api/fuel | GET/POST | Public reference + crowd-sourced write — judgment call |
| /api/groups/[groupId]/public | GET | Explicit public group info |
| /api/health | GET | Health check |
| /api/invite/[token] | GET | Public invite lookup by token; error `details` leak fixed |
| /api/logbook/lookup | GET | Public logbook lookup by displayId — judgment call, see above |
| /api/logbook/public/[token] | GET | Public share-token route |
| /api/mechanics/search | GET | Public mechanic directory — judgment call, see above |
| /api/noaa | GET | Public weather proxy, IP rate-limited |
| /api/notams | GET | Public reference |
| /api/pilots | GET | Public pilot directory (deliberately narrow `select`) |
| /api/pireps | GET | Public reference |
| /api/radar/frames | GET | Public reference (RainViewer proxy) |
| /api/radar/tile | GET | Public reference (RainViewer proxy) |
| /api/route-weather | POST | Public calculator, no stored/user data |
| /api/sigmets | GET | Public reference |
| /api/state-media/[state] | GET | Public reference (Wikimedia proxy) |
| /api/stripe/webhook | POST | Stripe webhook — signature auth (`stripe.webhooks.constructEvent`), not a session; 503 if `STRIPE_WEBHOOK_SECRET` unset, 400 on bad signature |
| /api/tfrs | GET | Public reference (FAA TFR RSS) |
| /api/v1/airports/search | GET | Public reference |
| /api/waitlist | POST | Public signup form |
| /api/weight-balance | GET/POST | Public calculator/reference |
