# Discover Page Redesign Plan

## Vision

Replace the current tab-based (Explore States / Community Routes) layout with a richer experience:
- **Left sidebar**: compact state list for navigation
- **Main content**: curated scenic flight plans per state (provided by us, researched ahead of time)
- **Community tab**: community-shared routes with likes and comments

---

## Page Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  🧭 Discover                            [Curated] [Community]    │
├────────────┬─────────────────────────────────────────────────────┤
│ States     │  🌴 California — 10 Scenic Routes                   │
│            │                                                      │
│ 🔍 Search  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│            │  │  [photo] │ │  [photo] │ │  [photo] │            │
│ • CA  ←    │  │ Pacific  │ │  Bay     │ │  Death   │            │
│ • FL       │  │ Coast Hwy│ │  Tour    │ │  Valley  │            │
│ • TX       │  │ 245 nm   │ │  82 nm   │ │  Loop    │            │
│ • AZ       │  └──────────┘ └──────────┘ └──────────┘            │
│ • CO       │                                                      │
│ • AK       │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ • WA       │  │  [photo] │ │  [photo] │ │  [photo] │            │
│ ...        │  │ Yosemite │ │  Big Sur │ │  Wine    │            │
│            │  │ Circuit  │ │  Lookout │ │  Country │            │
│            │  └──────────┘ └──────────┘ └──────────┘            │
│            │                                                      │
│            │  [Load more routes...]                               │
└────────────┴─────────────────────────────────────────────────────┘
```

---

## Part 1: Curated Flight Plans

### Data File: `lib/curated-routes.ts`

Each route is a static TypeScript object. No DB required — they're hardcoded and maintained by us.

```ts
export interface CuratedRoute {
  id: string               // e.g. "ca-pacific-coast"
  stateCode: string        // "CA"
  name: string             // "Pacific Coast Highway Flight"
  description: string      // 2–3 sentence description
  highlights: string[]     // ["Big Sur", "Malibu", "Santa Barbara"]
  tags: string[]           // ["scenic", "coastal", "vfr-recommended"]
  difficulty: 'easy' | 'moderate' | 'advanced'
  aircraftCategory: 'SE' | 'ME' | 'any'
  totalDistanceNm: number
  waypoints: {
    icao: string
    name: string
    latitude: number
    longitude: number
  }[]
  imageSearchTerms: string[]  // for Wikimedia lookup, e.g. ["Big Sur coastline aerial", "Pacific Coast Highway California"]
  bestSeason: string          // "Year-round, VFR conditions common"
}
```

### States to Cover First (Priority Order)

| State | # Routes | Featured Routes |
|-------|----------|-----------------|
| CA    | 10       | Pacific Coast, Bay Tour, Yosemite, Death Valley Loop, Wine Country, Mojave, Channel Islands, Sierra Nevada, Napa to LAX, Catalina Island |
| FL    | 8        | Keys Tour, Everglades, Space Coast, Gulf Coast, Panhandle Beach Run, Tampa Bay, Orlando Loop, Lake Okeechobee |
| AZ    | 8        | Grand Canyon, Sedona Red Rocks, Monument Valley, Sonoran Desert, Verde Valley, Four Corners, Antelope Canyon, Phoenix Metro |
| CO    | 7        | Rocky Mountain High, Telluride Circuit, Royal Gorge, Mesa Verde, Steamboat Springs, Denver Foothills, San Juan Mountains |
| AK    | 6        | Denali Approach, Glacier Bay, Inside Passage, Kodiak Island, Kenai Fjords, Fairbanks to Anchorage |
| TX    | 7        | Big Bend, Hill Country, Gulf Coast, Padre Island, Dallas Metro, San Antonio Loop, Guadalupe Mountains |
| WA    | 6        | San Juan Islands, Mount Rainier, Columbia River Gorge, Olympic Peninsula, Cascades Ridge, Puget Sound Tour |
| MT    | 5        | Glacier NP, Going-to-the-Sun, Flathead Lake, Beartooth Highway, Big Sky |
| UT    | 6        | Zion-Bryce Circuit, Monument Valley, Canyonlands, Bonneville Salt Flats, Arches, Capitol Reef |
| OR    | 5        | Crater Lake, Columbia River, Coast Range, Willamette Valley, Three Sisters |
| NV    | 5        | Las Vegas Strip, Valley of Fire, Great Basin, Lake Tahoe (shared w/ CA), Area 51 Tour |
| HI    | 5        | Big Island Circle, Maui Coast, Na Pali Cliffs, Oahu Tour, Hana Highway Aerial |
| NY    | 5        | Hudson Valley, Finger Lakes, Long Island Shore, Adirondacks, NYC Metro Tour |
| NC    | 4        | Blue Ridge Parkway, Outer Banks, Great Smoky Mountains, Cape Hatteras |
| TN    | 4        | Smoky Mountains, Tennessee River Valley, Nashville Tour, Natchez Trace |
| Remaining 35 states | 2–3 each | TBD |

**Total: ~150 curated routes across all 50 states**

### Image Strategy

For each route, use the **existing** `/api/state-media` Wikimedia approach but with route-specific search terms instead of generic state terms.

Option A (preferred): Reuse the same `/api/state-media` endpoint but extend it to accept attraction-specific queries:
- New endpoint: `GET /api/discover/route-image?q=Big+Sur+coastline+aerial`
- Same Wikimedia commons search logic
- Cache result in a new `RouteImageCache` table or reuse `StateMediaCache` with a composite key

Option B (simpler): For curated routes, bake in a single `previewImageUrl` string pointing to a Wikimedia commons image URL that was manually found during content creation. No API call needed.

**Recommendation: Option B for curated routes** (we control the content, can manually find best photo for each route). API-driven for community routes.

---

## Part 2: Community Routes (Enhanced)

### New DB Models

Add to `prisma/schema.prisma`:

```prisma
model SharedRouteLike {
  id        String   @id @default(uuid()) @db.NVarChar(36)
  routeId   String   @db.NVarChar(36)
  userId    String   @db.NVarChar(36)
  createdAt DateTime @default(now())

  @@unique([routeId, userId])
  @@index([routeId])
  @@map("SharedRouteLike")
}

model SharedRouteComment {
  id        String   @id @default(uuid()) @db.NVarChar(36)
  routeId   String   @db.NVarChar(36)
  userId    String   @db.NVarChar(36)
  text      String   @db.NVarChar(2000)
  createdAt DateTime @default(now())

  @@index([routeId, createdAt])
  @@map("SharedRouteComment")
}
```

Also add denormalized counts to `SharedRoute`:
```prisma
// Add fields to existing SharedRoute model:
likesCount    Int @default(0)
commentsCount Int @default(0)
```

### New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/discover/routes/[id]/like` | Required | Toggle like on/off |
| GET | `/api/discover/routes/[id]/comments` | Public | Get comments (paginated) |
| POST | `/api/discover/routes/[id]/comments` | Required | Post a comment |
| DELETE | `/api/discover/routes/[id]/comments/[commentId]` | Required (owner) | Delete own comment |

### Community Route Card UI

```
┌─────────────────────────────────────────────┐
│              [route photo/map]               │
│  SE             KSFO → KSBA → KLAX          │
├─────────────────────────────────────────────┤
│  Pacific Coastal Cruise                      │
│  Beautiful VFR flight along the California  │
│  coast, stopping in Santa Barbara...        │
│                                              │
│  ✈ 312 nm   📅 Jun 15   👤 JohnPilot       │
│                                              │
│  ❤ 24    💬 7    ⬇ 41    [Open to Map]     │
└─────────────────────────────────────────────┘
```

### Route Detail Drawer/Modal

Click on a community route → expand to show:
- Full image carousel (if multiple images)
- Full waypoint list
- Like button (toggleable)
- Comment thread
  - Each comment: username, timestamp, text
  - Text input to add comment (cloud users only)
  - Delete button on own comments

---

## Part 3: Page Layout Overhaul

### Left State Sidebar

Replace the current filter bar approach with a compact left-side state list:

```tsx
// ~180px wide, scrollable
<aside className="w-44 shrink-0 border-r border-border overflow-y-auto">
  <div className="p-2">
    <input placeholder="Filter states..." />
  </div>
  {states.map(s => (
    <button
      key={s.state}
      className={cn("w-full text-left px-3 py-1.5 text-sm ...", selected === s.state && "bg-primary/10 text-primary")}
    >
      <span className="font-mono text-[10px] text-muted-foreground">{s.state}</span>
      {' '}{s.stateName}
    </button>
  ))}
</aside>
```

### Main Content Area

Two sub-tabs at the top right:
- **Curated** — our handpicked routes for the selected state
- **Community** — user-shared routes (filterable, with likes/comments)

The state context persists when switching between tabs (so "California" curated → "California" community shows CA community routes).

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `lib/curated-routes.ts` | Create | Static data for all curated routes |
| `app/desktop/discover/page.tsx` | Rewrite | New layout: sidebar + tabs |
| `prisma/schema.prisma` | Edit | Add `SharedRouteLike`, `SharedRouteComment`, update `SharedRoute` |
| `prisma/migrations/add_route_social.sql` | Create | SQL migration for new tables |
| `app/api/discover/routes/[id]/like/route.ts` | Create | Toggle like |
| `app/api/discover/routes/[id]/comments/route.ts` | Create | Get + post comments |
| `app/api/discover/routes/[id]/comments/[cid]/route.ts` | Create | Delete comment |

---

## Content Work Required (Before Implementation)

For each curated route we need to research and hardcode:
1. Departure/arrival/intermediate ICAO codes with lat/lon
2. A 2–3 sentence description
3. Key highlights (3–5 items)
4. Best season / weather notes
5. Tags (scenic, coastal, mountain, desert, VFR-recommended, etc.)
6. A Wikimedia Commons image URL (manually selected, or search term)

**Suggested approach:** Research 10 CA routes first, implement with those, then expand to remaining states incrementally. CA is the best aviation state to start with.

---

## Decisions (Confirmed)

1. **Curated route images** — ✅ **Manual Wikimedia URL baked into `lib/curated-routes.ts`**. No runtime API call for curated routes; URL is hardcoded per route after manual research.
2. **Default state** — ✅ **Auto-select the user's home airport state**. Read `homeAirport` from user profile, resolve to state code, default to California if no home airport is set.
3. **Curated vs Community tabs** — ✅ **Separate tabs**. Curated (ours) and Community (user-shared) are distinct tabs. State sidebar context is shared between both tabs.

## Remaining Open Questions

1. **Comments moderation** — any flagging/reporting needed, or trust-based for now?
2. **Like counter UX** — optimistic update (instant heart toggle) or wait for server?
3. **Who can post community routes?** — cloud users only (current behavior), or also local-mode users?

---

## Implementation Order

1. Content work: research and write `lib/curated-routes.ts` for CA (10 routes)
2. Page layout overhaul: sidebar + curated grid for the selected state
3. DB schema: add `SharedRouteLike` + `SharedRouteComment` + update `SharedRoute`
4. Run SQL migration
5. API endpoints: like toggle, comments CRUD
6. Community tab: like button, comment count, route detail drawer with comments
7. Expand curated routes to remaining states (incremental content work)
