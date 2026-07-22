'use client';

import { useMemo, useState } from 'react';
import { compareFlight, type Leg, type TrackPt } from './lib/compareFlight';

interface PostFlightReviewProps {
  plannedWaypoints: { latitude: number; longitude: number; icao?: string; name?: string }[];
  tasKts: number;
  burnGph: number;
  fuelPricePerGal?: number;
}

const DEFAULT_FUEL_PRICE = 6.0;

// --- Parsing helpers (mirrors FlightPlayback.tsx's approach) ---

function parseGpxTrack(content: string): TrackPt[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/xml');
  const trkpts = doc.querySelectorAll('trkpt');

  const points: TrackPt[] = [];
  trkpts.forEach((pt) => {
    const lat = parseFloat(pt.getAttribute('lat') || '');
    const lon = parseFloat(pt.getAttribute('lon') || '');
    const time = pt.querySelector('time')?.textContent || undefined;

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      points.push({ lat, lon, timestamp: time });
    }
  });

  return points;
}

function parseCsvTrack(content: string): TrackPt[] {
  const lines = content.split('\n');
  const points: TrackPt[] = [];

  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push({ lat, lon, timestamp: parts[2] || undefined });
      }
    }
  }

  return points;
}

// --- Formatting helpers ---

function formatHm(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return '0:00';
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function formatDelta(value: number, decimals: number, suffix: string = ''): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}${suffix}`;
}

function deltaColorClass(value: number, tolerance: number): string {
  if (Math.abs(value) <= tolerance) return 'text-muted-foreground';
  return value > 0 ? 'text-amber-400' : 'text-emerald-400';
}

// --- SVG map helpers ---

type MapPoint = { lat: number; lon: number };

function projectPoints(
  planned: MapPoint[],
  actual: MapPoint[],
  width: number,
  height: number,
  padding: number
): { plannedPx: [number, number][]; actualPx: [number, number][] } {
  const all = [...planned, ...actual];
  if (all.length === 0) {
    return { plannedPx: [], actualPx: [] };
  }

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of all) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  // Degenerate case (single point, or all points identical): center a small box.
  if (minLat === maxLat) {
    minLat -= 0.01;
    maxLat += 0.01;
  }
  if (minLon === maxLon) {
    minLon -= 0.01;
    maxLon += 0.01;
  }

  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;

  const project = (p: MapPoint): [number, number] => {
    const x = padding + ((p.lon - minLon) / lonSpan) * usableW;
    // Flip Y so north is up.
    const y = padding + (1 - (p.lat - minLat) / latSpan) * usableH;
    return [x, y];
  };

  return {
    plannedPx: planned.map(project),
    actualPx: actual.map(project),
  };
}

function pointsToPolyline(pts: [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

const LEG_ROWS: { key: keyof Leg; label: string; decimals: number; suffix: string; deltaTolerance: number }[] = [
  { key: 'distanceNm', label: 'Distance', decimals: 0, suffix: ' nm', deltaTolerance: 0.5 },
  { key: 'fuelGal', label: 'Fuel', decimals: 1, suffix: ' gal', deltaTolerance: 0.1 },
  { key: 'cost', label: 'Cost', decimals: 2, suffix: '', deltaTolerance: 0.01 },
];

export default function PostFlightReview({
  plannedWaypoints,
  tasKts,
  burnGph,
  fuelPricePerGal,
}: PostFlightReviewProps) {
  const [track, setTrack] = useState<TrackPt[]>([]);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const effectiveFuelPrice = fuelPricePerGal ?? DEFAULT_FUEL_PRICE;

  const comparison = useMemo(() => {
    if (track.length === 0) return null;
    return compareFlight({
      plannedWaypoints,
      track,
      tasKts,
      burnGph,
      fuelPricePerGal: effectiveFuelPrice,
    });
  }, [plannedWaypoints, track, tasKts, burnGph, effectiveFuelPrice]);

  const mapProjection = useMemo(() => {
    const plannedPts: MapPoint[] = plannedWaypoints.map(wp => ({ lat: wp.latitude, lon: wp.longitude }));
    const actualPts: MapPoint[] = track.map(t => ({ lat: t.lat, lon: t.lon }));
    return projectPoints(plannedPts, actualPts, 320, 200, 16);
  }, [plannedWaypoints, track]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const lowerName = file.name.toLowerCase();
        let parsed: TrackPt[] = [];

        if (lowerName.endsWith('.gpx')) {
          parsed = parseGpxTrack(content);
        } else if (lowerName.endsWith('.csv')) {
          parsed = parseCsvTrack(content);
        } else {
          setError('Unsupported file type. Please upload a .gpx or .csv track log.');
          return;
        }

        if (parsed.length === 0) {
          setError('No valid track points found in that file.');
          return;
        }

        setTrack(parsed);
        setFilename(file.name);
      } catch (err) {
        console.error(err);
        setError('Error parsing file. Please check the format.');
      }
    };

    reader.onerror = () => {
      setError('Could not read that file.');
    };

    reader.readAsText(file);
  };

  const hasPlanned = plannedWaypoints.length >= 2;
  const hasActual = track.length >= 1;

  return (
    <div className="bg-background rounded-lg p-3 space-y-3 border border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Post-flight review</h3>
        {filename && (
          <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={filename}>{filename}</span>
        )}
      </div>

      {/* File upload */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Import flown track (GPX, CSV)</label>
        <input
          type="file"
          accept=".gpx,.csv"
          onChange={handleFileUpload}
          className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-foreground text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-sky-600 file:text-foreground file:cursor-pointer file:text-xs"
        />
      </div>

      {error && (
        <div className="bg-red-500/20 text-red-400 p-2 rounded text-xs">{error}</div>
      )}

      {!hasActual && !error && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Upload your flown track to compare it against this plan.</p>
          <p className="text-muted-foreground/70">In ForeFlight: More → Track Logs → Export → GPX, then import here.</p>
        </div>
      )}

      {hasActual && comparison && (
        <>
          {/* Map overlay */}
          <div className="bg-secondary rounded p-2">
            <svg viewBox="0 0 320 200" className="w-full h-auto" role="img" aria-label="Planned route vs actual flown track">
              {mapProjection.plannedPx.length > 0 && (
                mapProjection.plannedPx.length === 1 ? (
                  <circle
                    cx={mapProjection.plannedPx[0][0]}
                    cy={mapProjection.plannedPx[0][1]}
                    r={3}
                    className="fill-sky-400"
                  />
                ) : (
                  <polyline
                    points={pointsToPolyline(mapProjection.plannedPx)}
                    fill="none"
                    className="stroke-sky-400"
                    strokeWidth={2}
                    strokeDasharray="5,4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )
              )}
              {mapProjection.actualPx.length > 0 && (
                mapProjection.actualPx.length === 1 ? (
                  <circle
                    cx={mapProjection.actualPx[0][0]}
                    cy={mapProjection.actualPx[0][1]}
                    r={3}
                    className="fill-emerald-400"
                  />
                ) : (
                  <polyline
                    points={pointsToPolyline(mapProjection.actualPx)}
                    fill="none"
                    className="stroke-emerald-400"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )
              )}
            </svg>
            <div className="flex items-center gap-4 mt-1 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 border-t-2 border-dashed border-sky-400" /> Planned
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-emerald-400" /> Actual
              </span>
            </div>
          </div>

          {!hasPlanned && (
            <div className="text-[10px] text-amber-400">
              Add at least 2 waypoints to your plan to see a planned-vs-actual comparison.
            </div>
          )}

          {/* Comparison table */}
          <div className="text-xs">
            <div className="grid grid-cols-4 gap-1 text-muted-foreground font-medium border-b border-border pb-1">
              <span>Metric</span>
              <span className="text-right">Planned</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Δ</span>
            </div>

            {/* Time row (special h:mm formatting) */}
            <div className="grid grid-cols-4 gap-1 py-1 border-b border-border/50">
              <span className="text-muted-foreground">Time</span>
              <span className="text-right text-foreground">{formatHm(comparison.planned.timeHr)}</span>
              <span className="text-right text-foreground">{formatHm(comparison.actual.timeHr)}</span>
              <span className={`text-right ${deltaColorClass(comparison.delta.timeHr, 0.02)}`}>
                {formatDelta(comparison.delta.timeHr * 60, 0, 'm')}
              </span>
            </div>

            {LEG_ROWS.map((row) => (
              <div key={row.key} className="grid grid-cols-4 gap-1 py-1 border-b border-border/50 last:border-b-0">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="text-right text-foreground">
                  {row.key === 'cost' ? '$' : ''}{comparison.planned[row.key].toFixed(row.decimals)}{row.suffix}
                </span>
                <span className="text-right text-foreground">
                  {row.key === 'cost' ? '$' : ''}{comparison.actual[row.key].toFixed(row.decimals)}{row.suffix}
                </span>
                <span className={`text-right ${deltaColorClass(comparison.delta[row.key], row.deltaTolerance)}`}>
                  {row.key === 'cost' ? '$' : ''}{formatDelta(comparison.delta[row.key], row.decimals)}{row.suffix}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground/70">
            Actual fuel is estimated from flight time — no engine-monitor data used.
          </p>
        </>
      )}
    </div>
  );
}
