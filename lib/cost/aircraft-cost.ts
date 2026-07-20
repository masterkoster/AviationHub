// Pure cost-of-ownership calculations for aircraft. No DB access, no imports
// from prisma — callers are responsible for converting Decimal -> number
// before calling into this module.

export type CostProfile = {
  tboHours?: number | null;
  overhaulCost?: number | null;
  propOverhaulHours?: number | null;
  propOverhaulCost?: number | null;
  fuelBurnGph?: number | null;
  oilReservePerHour?: number | null;
  maintReservePerHour?: number | null;
  insuranceAnnual?: number | null;
  hangarMonthly?: number | null;
  annualInspectionCost?: number | null;
  financingMonthly?: number | null;
  subscriptionsAnnual?: number | null;
  otherFixedAnnual?: number | null;
  expectedAnnualHours?: number | null;
  hourlyRateOverride?: number | null;
};

export type ReservesBreakdown = {
  engine: number;
  prop: number;
  maint: number;
  oil: number;
  total: number;
};

export type FlightCostInput = {
  hours: number;
  actualFuelCost?: number | null;
  fuelPricePerGal?: number | null;
  customItems?: { label: string; amount: number }[];
};

export type FlightCostResult = {
  reserves: number;
  fuel: number;
  fixed: number;
  custom: number;
  total: number;
  breakdown: {
    reservesPerHour: number;
    fixedPerHour: number | null;
    hours: number;
    fuelBurnGph: number;
    fuelPricePerGal: number | null;
    actualFuelCost: number | null;
    customItems: { label: string; amount: number }[];
  };
};

/** Round to the nearest cent, guarding against NaN/Infinity. */
function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Coerce a possibly-null number to a safe finite number, defaulting to 0. */
function num(n: number | null | undefined): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

export function reservesPerHour(p: CostProfile): ReservesBreakdown {
  const overhaulCost = num(p.overhaulCost);
  const tboHours = num(p.tboHours);
  const propOverhaulCost = num(p.propOverhaulCost);
  const propOverhaulHours = num(p.propOverhaulHours);

  const engine = overhaulCost > 0 && tboHours > 0 ? overhaulCost / tboHours : 0;
  const prop = propOverhaulCost > 0 && propOverhaulHours > 0 ? propOverhaulCost / propOverhaulHours : 0;
  const maint = num(p.maintReservePerHour);
  const oil = num(p.oilReservePerHour);
  const total = engine + prop + maint + oil;

  return {
    engine: round2(engine),
    prop: round2(prop),
    maint: round2(maint),
    oil: round2(oil),
    total: round2(total),
  };
}

export function fixedAnnual(p: CostProfile): number {
  const total =
    num(p.insuranceAnnual) +
    num(p.hangarMonthly) * 12 +
    num(p.annualInspectionCost) +
    num(p.financingMonthly) * 12 +
    num(p.subscriptionsAnnual) +
    num(p.otherFixedAnnual);
  return round2(total);
}

export function fixedPerHour(p: CostProfile): number | null {
  const hours = num(p.expectedAnnualHours);
  if (hours <= 0) return null;
  return round2(fixedAnnual(p) / hours);
}

export function variablePerHour(p: CostProfile, fuelPricePerGal?: number | null): number {
  const reserves = reservesPerHour(p).total;
  const fuelBurnGph = num(p.fuelBurnGph);
  const price = num(fuelPricePerGal);
  const fuel = fuelBurnGph > 0 && price > 0 ? fuelBurnGph * price : 0;
  return round2(reserves + fuel);
}

export function allInPerHour(p: CostProfile, fuelPricePerGal?: number | null): number {
  const override = num(p.hourlyRateOverride);
  if (override > 0) return round2(override);
  const variable = variablePerHour(p, fuelPricePerGal);
  const fixed = fixedPerHour(p) ?? 0;
  return round2(variable + fixed);
}

export function flightCost(input: FlightCostInput, p: CostProfile): FlightCostResult {
  const hours = num(input.hours);
  const fuelBurnGph = num(p.fuelBurnGph);
  const fuelPricePerGal =
    typeof input.fuelPricePerGal === 'number' && Number.isFinite(input.fuelPricePerGal)
      ? input.fuelPricePerGal
      : null;
  const actualFuelCost =
    typeof input.actualFuelCost === 'number' && Number.isFinite(input.actualFuelCost)
      ? input.actualFuelCost
      : null;

  const reservesPH = reservesPerHour(p).total;
  const reserves = round2(reservesPH * hours);

  let fuel: number;
  if (actualFuelCost !== null) {
    fuel = round2(actualFuelCost);
  } else if (fuelBurnGph > 0 && fuelPricePerGal !== null && fuelPricePerGal > 0) {
    fuel = round2(fuelBurnGph * fuelPricePerGal * hours);
  } else {
    fuel = 0;
  }

  const fixedPH = fixedPerHour(p) ?? 0;
  const fixed = round2(fixedPH * hours);

  const customItems = Array.isArray(input.customItems) ? input.customItems : [];
  const custom = round2(customItems.reduce((sum, item) => sum + num(item?.amount), 0));

  const total = round2(reserves + fuel + fixed + custom);

  return {
    reserves,
    fuel,
    fixed,
    custom,
    total,
    breakdown: {
      reservesPerHour: reservesPH,
      fixedPerHour: fixedPerHour(p),
      hours,
      fuelBurnGph,
      fuelPricePerGal,
      actualFuelCost,
      customItems,
    },
  };
}

/**
 * Match an FAA-registry engine model string (e.g. "IO-360-A1B6") against a
 * list of reference keys (e.g. "O-360", "IO-360"). Normalizes the input and
 * prefers the longest matching key so more-specific families (IO-360, TSIO-550)
 * win over shorter substrings (O-360, IO-550).
 */
export function matchEngineKey(engineModelString: string, keys: string[]): string | null {
  if (!engineModelString || !Array.isArray(keys) || keys.length === 0) return null;
  const normalized = engineModelString.toUpperCase().trim();
  if (!normalized) return null;

  let best: string | null = null;
  for (const key of keys) {
    if (!key) continue;
    const normalizedKey = key.toUpperCase().trim();
    if (!normalizedKey) continue;
    if (normalized.includes(normalizedKey)) {
      if (!best || normalizedKey.length > best.length) {
        best = normalizedKey;
      }
    }
  }
  // Return the original-cased key that matched, not the normalized form —
  // find it back in the input list (case-insensitive) to preserve casing.
  if (best === null) return null;
  const original = keys.find((k) => k && k.toUpperCase().trim() === best);
  return original ?? best;
}
