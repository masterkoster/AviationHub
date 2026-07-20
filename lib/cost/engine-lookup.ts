import type { PrismaClient } from '@prisma/client';
import { matchEngineKey } from './aircraft-cost';

export type EngineMatchSource = 'engine' | 'airframe' | 'manual';

export type EngineReference = {
  engineModelKey: string;
  tboHours: number | null;
  overhaulCost: number | null;
  propOverhaulHours: number | null;
  propOverhaulCost: number | null;
  annualInspectionCost: number | null;
  costYear: number;
  engineModel: string | null;
  isEstimate: boolean;
  /** How the reference was chosen: exact engine string, airframe guess, or an explicit user pick. */
  matchedBy: EngineMatchSource;
};

/**
 * Conservative airframe → engine-family guess for the common GA fleet.
 *
 * The FAA registry's engine columns are unpopulated, so when we can't match on
 * the engine model string we fall back to the (populated) airframe make/model.
 * This is a SUGGESTION only — engine choice varies by sub-model and year, so the
 * caller should let the pilot confirm/override. Returns null when unsure rather
 * than guessing wildly. The returned value is always one of the seeded keys.
 */
export function suggestEngineKeyFromAirframe(
  mfr: string | null | undefined,
  model: string | null | undefined
): string | null {
  if (!model) return null;
  // FAA MODEL values carry trailing CSV junk (e.g. "SR22 ,4,1,..."); take the
  // leading model token only.
  const tok = (model.toUpperCase().trim().match(/^[A-Z0-9-]+/) || [''])[0];
  if (!tok) return null;
  const M = (mfr || '').toUpperCase();

  // ── Cessna ──
  if (/CESSNA|TEXTRON/.test(M) || /^\d{3}/.test(tok)) {
    if (/^152/.test(tok)) return 'O-235';
    if (/^150/.test(tok)) return 'O-200';
    if (/^140/.test(tok)) return 'C-90';
    if (/^172(S|R|SP)/.test(tok)) return 'IO-360';
    if (/^17[27]/.test(tok)) return 'O-320'; // 172M/N, 177 default
    if (/^170/.test(tok)) return 'O-300';
    if (/^18[02]/.test(tok)) return 'O-470'; // 180, 182
    if (/^A?185/.test(tok)) return 'IO-520';
    if (/^206/.test(tok)) return 'IO-540';
    if (/^210/.test(tok)) return 'IO-520';
  }
  // ── Piper ──
  if (/PIPER/.test(M) || /^PA-/.test(tok) || /^J3/.test(tok)) {
    if (/^PA-28-18/.test(tok)) return 'O-360'; // Archer 180/181
    if (/^PA-28-23/.test(tok)) return 'O-540'; // Dakota 235/236
    if (/^PA-28/.test(tok)) return 'O-320'; // Cherokee/Warrior 140/150/160/161
    if (/^PA-3[24]/.test(tok)) return 'IO-540'; // Saratoga/Lance/Seneca
    if (/^PA-24/.test(tok)) return 'IO-540'; // Comanche
    if (/^PA-18/.test(tok)) return 'O-320'; // Super Cub
    if (/^(J3|PA-11|PA-12|PA-17)/.test(tok)) return 'C-90';
  }
  // ── Cirrus ──
  if (/CIRRUS/.test(M) || /^SR2/.test(tok)) {
    if (/^SR22T/.test(tok)) return 'TSIO-550';
    if (/^SR22/.test(tok)) return 'IO-550';
    if (/^SR20/.test(tok)) return 'IO-360';
  }
  // ── Mooney ──
  if (/MOONEY/.test(M) || /^M20/.test(tok)) {
    if (/^M20(R|S|T|U|V)/.test(tok)) return 'IO-550'; // Ovation/Acclaim
    if (/^M20/.test(tok)) return 'IO-360';
  }
  // ── Beechcraft (Bonanza / Baron) ──
  if (/BEECH/.test(M)) {
    if (/^(A36|G36|36|V35|A35|N35|P35|S35|V35|33|F33|A33|E33|G33|55|A55|B55|C55|D55|E55|58)/.test(tok)) return 'IO-550';
    if (/^76/.test(tok)) return 'O-360';
    if (/^77/.test(tok)) return 'O-235';
  }
  // ── Diamond ──
  if (/DIAMOND/.test(M)) {
    if (/^DA40/.test(tok)) return 'IO-360';
    if (/^DA20/.test(tok)) return 'IO-240';
  }
  // ── Grumman American ──
  if (/GRUMMAN|AMERICAN/.test(M)) {
    if (/^AA-?5/.test(tok)) return 'O-360';
    if (/^AA-?1/.test(tok)) return 'O-235';
  }
  return null;
}

type RawRefRow = {
  engineModelKey: string;
  tboHours: number | null;
  overhaulCost: unknown;
  propOverhaulHours: number | null;
  propOverhaulCost: unknown;
  annualInspectionCost: unknown;
  costYear: number;
  isEstimate: boolean;
};

function num(v: unknown): number | null {
  return v !== null && v !== undefined ? Number(v) : null;
}

async function fetchRefByKey(
  prisma: PrismaClient,
  key: string,
  year: number
): Promise<RawRefRow | null> {
  const rows = await prisma.$queryRaw<RawRefRow[]>`
    SELECT TOP 1
      [engineModelKey], [tboHours],
      CAST([overhaulCost] AS FLOAT) as overhaulCost,
      [propOverhaulHours],
      CAST([propOverhaulCost] AS FLOAT) as propOverhaulCost,
      CAST([annualInspectionCost] AS FLOAT) as annualInspectionCost,
      [costYear], [isEstimate]
    FROM [EngineMaintenanceProfile]
    WHERE [engineModelKey] = ${key} AND [costYear] = ${year}
  `;
  return rows[0] ?? null;
}

function toReference(
  ref: RawRefRow,
  engineModel: string | null,
  matchedBy: EngineMatchSource
): EngineReference {
  return {
    engineModelKey: ref.engineModelKey,
    tboHours: ref.tboHours ?? null,
    overhaulCost: num(ref.overhaulCost),
    propOverhaulHours: ref.propOverhaulHours ?? null,
    propOverhaulCost: num(ref.propOverhaulCost),
    annualInspectionCost: num(ref.annualInspectionCost),
    costYear: ref.costYear,
    engineModel,
    isEstimate: Boolean(ref.isEstimate),
    matchedBy,
  };
}

/** Look up a reference row by an explicit engine key (the pilot's own pick). */
export async function getEngineReferenceByKey(
  prisma: PrismaClient,
  engineModelKey: string,
  year: number = 2026
): Promise<EngineReference | null> {
  const ref = await fetchRefByKey(prisma, engineModelKey, year);
  return ref ? toReference(ref, ref.engineModelKey, 'manual') : null;
}

/**
 * Resolve a tail number to an engine cost reference.
 *
 * Tries the FAA engine-model string first; if that's absent/unmatched (it
 * usually is — the registry's engine columns are empty), falls back to an
 * airframe-based suggestion. Returns null if nothing can be matched.
 */
export async function resolveEngineReference(
  prisma: PrismaClient,
  nNumber: string,
  year: number = 2026
): Promise<EngineReference | null> {
  const tailUpper = nNumber.toUpperCase();

  const aircraftRows = await prisma.$queryRaw<
    Array<{ engineModel: string | null; engMfr: string | null; mfr: string | null; model: string | null }>
  >`
    SELECT TOP 1 [ENGINE_MODEL] as engineModel, [ENG_MFR] as engMfr, [MFR] as mfr, [MODEL] as model
    FROM [AircraftMaster]
    WHERE [N_NUMBER] = ${tailUpper}
  `;

  const aircraft = aircraftRows[0];
  if (!aircraft) return null;

  const keyRows = await prisma.$queryRaw<Array<{ engineModelKey: string }>>`
    SELECT [engineModelKey] FROM [EngineMaintenanceProfile] WHERE [costYear] = ${year}
  `;
  const keys = keyRows.map((r) => r.engineModelKey);

  // 1) exact engine-model string match
  let matchedKey = aircraft.engineModel ? matchEngineKey(aircraft.engineModel, keys) : null;
  let matchedBy: EngineMatchSource = 'engine';

  // 2) airframe fallback (suggestion)
  if (!matchedKey) {
    const suggested = suggestEngineKeyFromAirframe(aircraft.mfr, aircraft.model);
    if (suggested && keys.includes(suggested)) {
      matchedKey = suggested;
      matchedBy = 'airframe';
    }
  }

  if (!matchedKey) return null;

  const ref = await fetchRefByKey(prisma, matchedKey, year);
  return ref ? toReference(ref, aircraft.engineModel, matchedBy) : null;
}
