// Pure utilities for comparing a PLANNED route to an ACTUAL flown track
// (imported from a GPX/CSV recording). No React/DOM dependencies so this
// can be unit tested and reused outside the component tree.

export type LatLon = {
  latitude: number;
  longitude: number;
};

export type TrackPt = {
  lat: number;
  lon: number;
  timestamp?: string;
};

export type Leg = {
  distanceNm: number;
  timeHr: number;
  fuelGal: number;
  cost: number;
};

export type CompareFlightInput = {
  plannedWaypoints: LatLon[];
  track: TrackPt[];
  tasKts: number;
  burnGph: number;
  fuelPricePerGal: number;
};

export type CompareFlightResult = {
  planned: Leg;
  actual: Leg;
  delta: Leg;
};

const EARTH_RADIUS_NM = 3440.065;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lon points, in nautical miles. */
export function haversineNm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  if (
    !Number.isFinite(aLat) || !Number.isFinite(aLon) ||
    !Number.isFinite(bLat) || !Number.isFinite(bLon)
  ) {
    return 0;
  }

  const dLat = toRadians(bLat - aLat);
  const dLon = toRadians(bLon - aLon);
  const lat1 = toRadians(aLat);
  const lat2 = toRadians(bLat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));

  const distance = EARTH_RADIUS_NM * c;
  return Number.isFinite(distance) ? distance : 0;
}

function sumDistanceNm(points: { lat: number; lon: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineNm(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  }
  return total;
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : 0;
}

function buildLeg(distanceNm: number, timeHr: number, burnGph: number, fuelPricePerGal: number): Leg {
  const safeDistanceNm = Number.isFinite(distanceNm) ? distanceNm : 0;
  const safeTimeHr = Number.isFinite(timeHr) ? timeHr : 0;
  const fuelGal = Number.isFinite(burnGph) ? burnGph * safeTimeHr : 0;
  const cost = Number.isFinite(fuelPricePerGal) ? fuelGal * fuelPricePerGal : 0;

  return {
    distanceNm: safeDistanceNm,
    timeHr: safeTimeHr,
    fuelGal: Number.isFinite(fuelGal) ? fuelGal : 0,
    cost: Number.isFinite(cost) ? cost : 0,
  };
}

/**
 * Compare a planned route (sequence of waypoints) against an actual flown
 * track (sequence of GPS track points), producing planned/actual/delta legs
 * covering distance, time, fuel burn, and cost.
 */
export function compareFlight(input: CompareFlightInput): CompareFlightResult {
  const { plannedWaypoints, track, tasKts, burnGph, fuelPricePerGal } = input;

  // --- Planned leg ---
  const plannedDistanceNm = plannedWaypoints.length >= 2
    ? sumDistanceNm(plannedWaypoints.map(wp => ({ lat: wp.latitude, lon: wp.longitude })))
    : 0;
  const plannedTimeHr = safeDivide(plannedDistanceNm, tasKts);
  const planned = buildLeg(plannedDistanceNm, plannedTimeHr, burnGph, fuelPricePerGal);

  // --- Actual leg ---
  const actualDistanceNm = track.length >= 2
    ? sumDistanceNm(track.map(pt => ({ lat: pt.lat, lon: pt.lon })))
    : 0;

  let actualTimeHr = 0;
  const first = track[0];
  const last = track[track.length - 1];
  if (first?.timestamp && last?.timestamp) {
    const startMs = new Date(first.timestamp).getTime();
    const endMs = new Date(last.timestamp).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      actualTimeHr = (endMs - startMs) / 3_600_000;
    } else {
      actualTimeHr = safeDivide(actualDistanceNm, tasKts);
    }
  } else {
    actualTimeHr = safeDivide(actualDistanceNm, tasKts);
  }

  const actual = buildLeg(actualDistanceNm, actualTimeHr, burnGph, fuelPricePerGal);

  // --- Delta (actual - planned) ---
  const delta: Leg = {
    distanceNm: actual.distanceNm - planned.distanceNm,
    timeHr: actual.timeHr - planned.timeHr,
    fuelGal: actual.fuelGal - planned.fuelGal,
    cost: actual.cost - planned.cost,
  };

  return { planned, actual, delta };
}
