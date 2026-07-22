# Mechanic access + Hangar system — design

> Plan doc (David, 2026-07-22). Design only — **nothing built yet**.

## Locked decisions (reviewed 2026-07-22)
- **Dedicated Hangar model** (not an org-variant): `Hangar` + `HangarAircraft` + `HangarMechanic` + `Maintenance.hangarId`.
- **Scope = full maintenance, not just squawks.** The mechanic view shows pilot
  squawks (`Maintenance`) **and scheduled inspections / what's due & overdue**
  (`AircraftInspection` — annual, 100-hr, etc.) **and grounded aircraft**.
- **Powers = manage.** A mechanic can change squawk status (open → in-progress →
  resolved), **ground / return-to-service**, and add notes, photos, and a work
  record. **Cannot** touch billing, members, or bookings/scheduling.
- **Both club and hangar.** Build the club `MECHANIC` role (Phase 1) and the
  hangar path (Phase 2); one maintenance view spans all of a mechanic's scopes.
- **Independent mechanics (no club/hangar) get a third access model — direct
  per-aircraft grants**, two sources: an owner grants their regular A&P *standing*
  access from the aircraft page, and a *marketplace hire* auto-grants *temporary*
  job-scoped access (ties in the existing `Mechanic` / `MaintenanceRequest` flow).
- **Creds:** owner *assignment* is enough — no verified A&P required; if the
  mechanic has a `Mechanic` profile, show their A&P/IA on sign-offs.
- **Hangar v1:** owner adds *their own* aircraft only. Cross-owner consent
  (someone else's plane in your hangar) is **Phase 3**. A hangar may include a
  club aircraft the owner also manages.
- **Personal-squawk linkage:** ensure personal `Maintenance` rows carry the
  `nNumber` so `HangarAircraft` tail-matching works (fixed at build time).

## The goal
Let a mechanic who's part of a flying club, or assigned to a hangar, **see and
manage squawks** for the aircraft they're responsible for:
- **Club:** a mechanic the club owner has given the mechanic role → sees that club's squawks.
- **Hangar:** an owner registers a hangar, adds aircraft, assigns a mechanic → that mechanic sees squawks for the hangar's aircraft (works outside any club).

## Three access models, one principle
> *A mechanic is granted maintenance visibility over a set of aircraft.*

That set is the **union** of:
1. **Club** — org membership + `MECHANIC` role (mostly reuse; squawks are already `organizationId`-scoped).
2. **Hangar** — a mechanic assigned to a hangar (new facility entity).
3. **Direct aircraft grant** — an owner grants a mechanic access to a specific
   aircraft: *standing* ("my A&P") or *job-scoped* (a marketplace hire). This is
   how independent/freelance mechanics with no club/hangar get in.

## "Team mechanic" ≠ marketplace `Mechanic`
There's already a `Mechanic` model (A&P/IA creds, ratings, quotes, `MechanicQuote`/
`MechanicReview`) — that's **find-and-hire-a-mechanic** (marketplace). This new
capability is **team access**: a mechanic on your club/hangar seeing your squawks.
- Access comes from the **role/assignment**, NOT from having a marketplace listing.
- They *link*: when a team mechanic has a `Mechanic` profile, show their A&P/IA on
  sign-offs. But you don't need a marketplace listing to be a club/hangar mechanic.

---

## Data model (dedicated)

### Club mechanic role (reuse — no new tables)
- `OrganizationMember.role` gains the value **`MECHANIC`** (it's already a free
  string; default `pilot`). NOTE: existing roles are mixed-case (`pilot` default,
  `ADMIN`/`TREASURER` in `lib/club/roles.ts`) — normalize when we touch this.
- Add to `lib/club/roles.ts`: `MAINTENANCE_ROLES = ['ADMIN','MECHANIC']` (+ owner)
  and `isMaintenanceRole()`, mirroring the existing `FINANCE_ROLES`/`isFinanceRole`.
- A `MECHANIC` member can read + manage the club's squawks, but NOT billing/
  members/admin. Regular members still only *report* squawks.

### Hangar (new — raw-SQL tables, accessed via raw SQL like our other new tables)
```
Hangar
  id            uuid pk
  ownerUserId   User id (registrant)
  name          text
  locationIcao  text?         airport it's at
  city, state   text?
  notes         text?
  isActive      bool = true
  createdAt, updatedAt

HangarAircraft            one aircraft placed in a hangar
  id            uuid pk
  hangarId      -> Hangar
  nNumber       text          the tail (universal key)
  ownerUserId   User id?      whose aircraft (for cross-owner consent)
  userAircraftId  text?       link to personal aircraft, if known
  clubAircraftId  text?       link to a club aircraft, if applicable
  status        'active' | 'pending' | 'removed'   (pending = awaiting owner consent)
  addedAt

HangarMechanic            a mechanic assigned to a hangar
  id            uuid pk
  hangarId      -> Hangar
  mechanicUserId  User id
  status        'invited' | 'active' | 'removed'
  invitedAt, respondedAt
```

### Direct aircraft grant (new — independent mechanics)
```
AircraftMechanicGrant     owner grants a mechanic access to one aircraft
  id             uuid pk
  nNumber        text          the aircraft
  ownerUserId    User id       who granted it
  mechanicUserId User id       the mechanic
  scope          'all' | 'job'         standing whole-aircraft vs one job
  source         'direct' | 'marketplace'
  jobRequestId   -> MaintenanceRequest?   set for marketplace hires
  status         'invited' | 'active' | 'ended'
  createdAt, endedAt
```
- **Direct/standing** ("my A&P"): owner invites from the aircraft page → `scope='all'`,
  `source='direct'`, no auto-expiry.
- **Marketplace**: accepting a `MechanicQuote` / scheduling a job auto-creates a
  grant with `scope='job'`, `source='marketplace'`, `jobRequestId` set; it flips to
  `ended` when the job closes. This is the bridge between the marketplace (discovery
  + hire) and access (the grant).

### Squawk (`Maintenance`) change
Add a nullable **`hangarId`** column (idempotent raw-SQL migration). Two ways a
squawk becomes hangar-visible:
- **Derived (primary):** the squawk's aircraft (`clubAircraftId`, or `nNumber` for
  personal) is in `HangarAircraft(status='active')` of a hangar → visible to that
  hangar's active mechanics.
- **Direct (optional):** a squawk filed straight against a hangar carries `hangarId`.

---

## Visibility rules (the core "squawks I can see" query)
For the current user, union of:
1. **Club squawks:** `Maintenance.organizationId IN (clubs where I'm OWNER/ADMIN/MECHANIC)`.
2. **Hangar squawks:** aircraft in hangars where I'm an `active` `HangarMechanic`
   (via `HangarAircraft`), matched to `Maintenance` by `clubAircraftId`/`nNumber`
   (plus any `Maintenance.hangarId` direct rows).
3. **Direct-grant squawks:** aircraft with an `active` `AircraftMechanicGrant` for me
   (matched by `nNumber`); a `scope='job'` grant narrows to that job's squawk.

Same union applies to **inspections** (`AircraftInspection`) for those aircraft —
the mechanic view is squawks + inspections due/overdue + grounded, per the locked scope.

Owners always see their own aircraft's squawks. A club member without a
maintenance role sees only what the club already shows them (report + own).

**Open modeling detail:** personal-aircraft squawks. `Maintenance` today links via
`clubAircraftId` (+ a `PERSONAL` type). We need a clean way to tie a personal
squawk to a tail so `HangarAircraft.nNumber` matching works — resolve this when we
build hangars (likely: ensure personal `Maintenance` rows carry the `nNumber`).

---

## Endpoints (planned)

**Club (mostly reuse + gate):**
- Existing squawks fetch (the desktop squawks page already calls the club
  maintenance endpoint) — gate management actions to `isMaintenanceRole`.
- `PATCH` club member role → `MECHANIC` (owner/admin grants; reuse member-role update).

**Hangar (new):**
- `POST /api/hangars` — register (owner).
- `GET /api/hangars` — hangars I own + hangars I mechanic for.
- `PATCH/DELETE /api/hangars/[id]` — owner edits/archives.
- `POST /api/hangars/[id]/aircraft` — add a tail; own aircraft → `active`, someone
  else's → `pending` (consent).
- `POST /api/hangars/[id]/mechanics` — invite/assign by username/email.
- `PATCH /api/hangars/[id]/mechanics/[mid]` — accept / decline / remove.
- `GET /api/squawks` — unified feed of everything the caller can see (clubs +
  hangars), filterable by aircraft / severity / status.

---

## Mechanic experience (UI)
One **Squawks / Maintenance** workspace:
- **Scope switcher** — which club(s) / hangar(s) to view (or "all").
- **Filters** — aircraft, severity (LOW/MED/HIGH), status, grounded-only.
- **Actions** — change status (open → in-progress → resolved), add notes + photos
  (reuse `DocumentUploader`), toggle grounded/airworthy.
- Optional: the mechanic's A&P/IA (from `Mechanic` profile) shows on sign-offs.
- **Desktop:** the existing `/desktop/flying-club/squawks` page becomes the *club*
  scope; extend it with the scope switcher to include hangars, and add a
  mechanic-aware entry point in nav (visible when the user is a mechanic somewhere).

---

## Phasing
1. **Club mechanic role** — add `MECHANIC` role + `isMaintenanceRole`, gate the
   existing squawks page/actions, add the desktop entry point. *(Small, all reuse.)*
2. **Hangar + direct grants** — the hangar tables + `Maintenance.hangarId` migration,
   the `AircraftMechanicGrant` table, hangar CRUD + add-aircraft (own fleet) +
   assign-mechanic, the owner's "add my A&P" direct grant from the aircraft page,
   and the unified maintenance view (`GET /api/maintenance` spanning club + hangar +
   grants, squawks + inspections) with a scope switcher.
3. **Marketplace bridge + cross-owner + workflow** — accepting a marketplace quote
   auto-creates a job-scoped grant; cross-owner hangar consent (owner A's plane in
   owner B's hangar → A accepts); notifications on new/grounding squawks; and
   "log work → maintenance record / airworthiness entry".

## Open questions to settle before Phase 2
- Personal-aircraft squawk ↔ tail linkage (above).
- Invite a mechanic who isn't a user yet (email invite → account) vs existing-user only.
- Should a hangar require the mechanic to have a verified `Mechanic`/A&P profile,
  or is the owner's assignment enough? (Recommend: assignment is enough; creds shown if present.)
- Notifications channel (reuse `lib/club/notifications.ts`).

Related: [[web-vs-desktop-routes]], [[product-direction-2026-07]], [[flying-club-distinct-identity]].
