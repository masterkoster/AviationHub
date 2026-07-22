# Mobile apps + ForeFlight interop — plan

> Pick-this-up-later doc. Captures the direction agreed with David (2026-07-20) for
> the iPad/mobile story and ForeFlight (and Garmin) import/export. Nothing here is
> built yet unless a section says "DONE".

## Strategy in one line
Don't compete with ForeFlight's charts/plates/nav. **Complement** it. Our edges:
community fuel prices (cheapest-fuel routing), true cost-of-ownership, flying-club
ops, and a real logbook. Interop lets a pilot use each tool for what it's best at.

## The loop: Plan → Fly → Log
1. **Plan** the cheapest-fuel route in AviationHub (our fuel data beats ForeFlight's).
2. **Send it to ForeFlight** to actually fly it (iOS share sheet / file handoff).
3. **Import the flown track back** → recreate the flight, compare **planned vs actual**,
   and compute the flight's cost. ForeFlight can't close this loop; we can.

## Mobile apps — how to build them
David asked about Swift + Android (Kotlin). Decision/guidance:
- **Don't hand-write two native codebases first.** We already have a Tauri desktop
  app + a working web app. Fastest path = **Tauri v2 mobile** (or Capacitor) wrapping
  the existing web UI → one codebase, reuse everything, and still get the native bits
  that matter: the **iOS share sheet** and **file-type handlers** (needed for the
  ForeFlight handoff + return trip).
- Reserve real Swift/Kotlin for things that truly need native later (e.g. background
  GPS track recording, deep EFB hooks).
- **Build-env caveat:** iOS must be compiled/signed/shipped on a **Mac + Xcode**. Dev
  machine here is Windows — Claude can author/iterate the code, but iOS builds happen
  on a Mac. Android can build on Windows with the SDK.
- "Slowly": web app → PWA / "Add to Home Screen" → Tauri/Capacitor wrapper + share-sheet
  → native modules only where required.

## Interop is FILE HANDOFF, not a live API
There is no official ForeFlight sync API. It's user-initiated file exchange via the iOS
share sheet ("Open in ForeFlight" / "Open in AviationHub"). Smooth, but a tap each way —
not silent background sync. Set expectations accordingly.

## Formats
Export (out to ForeFlight / Garmin / iPad):
- **Route → `.fpl` (Garmin FlightPlan XML) + GPX** + "Send to ForeFlight" (share sheet). START HERE.
- **Logbook → ForeFlight Logbook CSV** (portability; never lock users in).
- **W&B / post-flight cost / logbook → PDF.**
- **Route + fuel stops → KML/GPX** (Google Earth, Garmin Pilot).

Import (into AviationHub):
- **Flown track log → GPX / KML / CSV** → auto-fill a logbook entry + post-flight cost.
- **Existing logbook → ForeFlight Logbook CSV** (the #1 onboarding unlock — pilots won't
  switch without bringing history).
- **A route/flight plan → `.fpl` / GPX** → load into our planner.

**VERIFY BEFORE BUILDING IMPORTERS:** confirm current ForeFlight `.fpl` / Logbook-CSV /
track schemas against ForeFlight's own docs — do not trust memory; formats drift.
(GPX and Garmin `.fpl` are stable open standards and safe to generate for export.)

## Plan-vs-actual + gas (the payoff)
Once we have the planned route (built here) + the imported track (GPX back from the flight):
- **Overlay planned vs actual** on the map — two paths; show where they deviated, plus
  planned-vs-actual **distance, time, altitude profile, groundspeed**.
- **Gas usage:**
  - *Planned:* burn rate × planned time.
  - *Actual:* burn rate × **actual** time (from track timestamps) + any fuel the pilot
    **logged/purchased** (our fuel log).
- **DEFERRED (David, 2026-07-20): ignore true engine-monitor fuel-flow / `EngineDataUpload`
  for now** — most pilots don't have the hardware, and not via ForeFlight. Revisit later
  as an optional "real burn" upgrade.

## Build order
1. **Route export** (`.fpl` + GPX + Send to ForeFlight) on the web planner (`/fuel-saver`). ← current focus
2. **Track import** (GPX → recreate the flown flight).
3. **Plan-vs-actual + gas comparison** view (leans on the cost engine + fuel log).
4. **Logbook CSV import/export** (onboarding; verify format first).
5. **Mobile wrapper** (Tauri/Capacitor) so the handoff is one-tap on iPad.

## Notes
- Web planner lives at `app/fuel-saver` (public, no login). See [[web-vs-desktop-routes]].
- Cost engine + fuel log already exist (desktop `lib/cost/*`, `/api/me/fuel`, Phase 2).
- Longer shot: **ForeFlight Content Packs** could publish community fuel prices as a
  ForeFlight map layer — real differentiator, explore later.
