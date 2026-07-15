/**
 * Magnetic variation utility
 */
import { calculateMagneticVariation, trueToMagnetic } from './magneticVariation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Calculate great circle distance in nautical miles
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in NM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/*
 * GPX Export - Generate GPX 1.1 format for flight plans
 * Compatible with ForeFlight, Garmin Pilot, SkyDemon, OpenCPN, etc.
 */

export interface Waypoint {
  icao: string;
  name?: string;
  latitude: number;
  longitude: number;
}

export interface FlightPlanData {
  name?: string;
  waypoints: Waypoint[];
  aircraftType?: string;
  cruisingAltitude?: number;
  departureTime?: string;
  fuelCapacity?: number;
  fuelBurnRate?: number;
}

export function generateGPX(plan: FlightPlanData): string {
  const { name = 'Flight Plan', waypoints, aircraftType, cruisingAltitude } = plan;
  
  const gpxHeader = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" 
     creator="FuelSaver - Flight Planning Tool"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXML(name)}</name>
    <desc>Flight plan created with FuelSaver</desc>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <rte>
    <name>${escapeXML(name)}</name>`;
  
  const gpxFooter = `
  </rte>
</gpx>`;
  
  const routePoints = waypoints.map((wp, idx) => {
    const isDeparture = idx === 0;
    const isArrival = idx === waypoints.length - 1;
    let type = 'AIRPORT';
    
    if (isDeparture) type = 'DEPARTURE';
    else if (isArrival) type = 'ARRIVAL';
    else type = 'WAYPOINT';
    
    return `
    <rtept lat="${wp.latitude.toFixed(6)}" lon="${wp.longitude.toFixed(6)}">
      <name>${escapeXML(wp.icao)}</name>
      <type>${type}</type>
      <extensions>
        <waypointType>${type}</waypointType>
        ${wp.name ? `<waypointName>${escapeXML(wp.name)}</waypointName>` : ''}
        ${aircraftType ? `<aircraftType>${escapeXML(aircraftType)}</aircraftType>` : ''}
        ${cruisingAltitude ? `<cruisingAltitude>${cruisingAltitude}</cruisingAltitude>` : ''}
      </extensions>
    </rtept>`;
  }).join('');
  
  return gpxHeader + routePoints + gpxFooter;
}

export async function downloadGPX(plan: FlightPlanData): Promise<void> {
  const gpx = generateGPX(plan);
  const filename = (plan.name || 'flight-plan').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  
  await downloadFile(gpx, `${filename}.gpx`, 'application/gpx+xml');
}

/**
 * FPL Format - Simple text format for Garmin 430/530/G1000
 * One ICAO code per line, with optional W&B metadata header
 */
export interface WbExportData {
  emptyWeight: number
  emptyCg: number
  frontSeats: number
  rearSeats: number
  baggage: number
  fuelGal: number
  fuelWeight: number
  totalWeight: number
  cg: number
  cgMin: number
  cgMax: number
  withinLimits: boolean
  armPilot: number
  armPassenger: number
  armBaggage: number
  armFuel: number
}

export function generateFPL(waypoints: Waypoint[], wb?: WbExportData): string {
  const lines: string[] = []

  if (wb) {
    lines.push(`-- WEIGHT & BALANCE --`)
    lines.push(`Empty Weight: ${wb.emptyWeight} lbs @ CG ${wb.emptyCg}"`)
    lines.push(`Front Seats: ${wb.frontSeats} lbs (arm ${wb.armPilot}")`)
    lines.push(`Rear Seats: ${wb.rearSeats} lbs (arm ${wb.armPassenger}")`)
    lines.push(`Baggage: ${wb.baggage} lbs (arm ${wb.armBaggage}")`)
    lines.push(`Fuel: ${wb.fuelGal} gal / ${wb.fuelWeight} lbs (arm ${wb.armFuel}")`)
    lines.push(`Total Weight: ${wb.totalWeight} lbs`)
    lines.push(`CG: ${wb.cg.toFixed(2)}" (limits: ${wb.cgMin}" - ${wb.cgMax}")`)
    lines.push(`Status: ${wb.withinLimits ? 'WITHIN LIMITS' : 'OUT OF LIMITS'}`)
    lines.push(`-- ROUTE --`)
  }

  lines.push(...waypoints.map(wp => wp.icao))
  return lines.join('\n')
}

export async function downloadFPL(waypoints: Waypoint[], wb?: WbExportData): Promise<void> {
  const fpl = generateFPL(waypoints, wb);
  const filename = 'flight-plan';

  await downloadFile(fpl, `${filename}.fpl`, 'text/plain');
}

/**
 * JSON Export - Full flight plan data
 */
export async function downloadJSON(plan: FlightPlanData): Promise<void> {
  const json = JSON.stringify(plan, null, 2);
  const filename = (plan.name || 'flight-plan').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  
  await downloadFile(json, `${filename}.json`, 'application/json');
}

// Helper function to escape XML special characters
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper function to trigger file download
async function downloadFile(content: string, filename: string, mimeType: string): Promise<void> {
  // Detect Tauri environment
  const isTauri =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ ||
        (window as unknown as Record<string, unknown>).__TAURI__
    )

  if (isTauri) {
    // ── Tauri path ────────────────────────────────────────────────
    // Step 1: Write to appDataDir (always in fs:default scope, guaranteed to work)
    // Step 2: Try to copy to user-chosen location via save dialog
    try {
      const { writeFile, mkdir, copyFile, remove } = await import('@tauri-apps/plugin-fs')
      const { appDataDir } = await import('@tauri-apps/api/path')

      const encoder = new TextEncoder()
      const bytes = encoder.encode(content)

      // Write to appDataDir first (known to be in scope)
      const appDir = await appDataDir()
      const tmpDir = `${appDir}exports`
      await mkdir(tmpDir, { recursive: true })
      const tmpPath = `${tmpDir}/${filename}`
      await writeFile(tmpPath, bytes)

      // Now try to copy to user-chosen location
      try {
        const { save } = await import('@tauri-apps/plugin-dialog')
        const destPath = await save({
          defaultPath: filename,
          filters: [{ name: filename.split('.').pop()?.toUpperCase() || 'File', extensions: [filename.split('.').pop() || '*'] }],
        })
        if (destPath) {
          await copyFile(tmpPath, destPath)
          try { await remove(tmpPath) } catch { /* ignore cleanup errors */ }
          return
        }
        // User cancelled dialog — file stays in appDataDir/exports/
      } catch {
        // Dialog not available — file stays in appDataDir/exports/
      }

      console.info(`[export] File saved to: ${tmpPath}`)
      return
    } catch (err) {
      console.error('[export] Tauri file export failed:', err)
      // Don't re-throw — file was saved to appDataDir at minimum
      return
    }
  }

  // ── Browser fallback ──────────────────────────────────────────
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  
  document.body.appendChild(a);
  a.click();
  
  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ============================================
// NAV LOG EXPORT
// ============================================

export interface NavLogLeg {
  from: Waypoint;
  to: Waypoint;
  course: number;           // True course (degrees)
  distance: number;         // Nautical miles
  tas: number;              // True airspeed (knots)
  windDirection: number;    // Wind from direction (degrees)
  windSpeed: number;        // Wind speed (knots)
  groundspeed: number;      // Groundspeed (knots)
  windCorrection: number;   // Wind correction angle (degrees)
  magneticVariation: number; // Magnetic variation at midpoint (degrees)
  trueHeading: number;      // True heading
  magneticHeading: number;  // Magnetic heading
  time: number;             // Time enroute (minutes)
  fuelNeeded: number;       // Fuel needed (gallons)
  fuelWithReserves: number; // Fuel with 25% reserves
  cost: number;             // Cost for this leg
}

export interface NavLogData {
  name?: string;
  aircraft: string;
  departure: string;
  arrival: string;
  cruisingAltitude: number;
  date: string;
  legs: NavLogLeg[];
  totalDistance: number;
  totalTime: number;
  totalFuel: number;
  totalCost: number;
}

export interface StoredNavLogExport {
  id: string;
  name: string;
  createdAt: string;
  detailed: boolean;
  navLogData: NavLogData;
}

const NAV_LOG_EXPORTS_KEY = 'navLogExports';

/**
 * Calculate great circle true course between two points
 */
function calculateTrueCourse(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  
  const x = Math.sin(dLon) * Math.cos(lat2Rad);
  const y = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  
  let course = (Math.atan2(x, y) * 180) / Math.PI;
  course = ((course % 360) + 360) % 360; // Normalize to 0-360
  return Math.round(course);
}

/**
 * Calculate wind correction angle and groundspeed using E6B formula
 */
function calculateWindEffect(
  trueCourse: number,
  tas: number,
  windDirection: number,
  windSpeed: number
): { groundspeed: number; windCorrection: number } {
  const headingRad = (trueCourse * Math.PI) / 180;
  const windRad = (windDirection * Math.PI) / 180;
  
  // Wind components (wind FROM direction)
  const wx = windSpeed * Math.cos(windRad + Math.PI);
  const wy = windSpeed * Math.sin(windRad + Math.PI);
  
  // Ground speed vector
  const gsx = tas * Math.cos(headingRad) - wx;
  const gsy = tas * Math.sin(headingRad) - wy;
  
  const groundspeed = Math.sqrt(gsx * gsx + gsy * gsy);
  const track = ((Math.atan2(gsy, gsx) * 180) / Math.PI + 360) % 360;
  const windCorrection = track - trueCourse;
  
  return {
    groundspeed: Math.round(groundspeed),
    windCorrection: Math.round(windCorrection)
  };
}

/**
 * Generate Basic Nav Log (simple format)
 */
export function generateBasicNavLog(data: NavLogData): string {
  const { name, aircraft, departure, arrival, date, legs, totalDistance, totalTime, totalFuel, totalCost } = data;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Nav Log - ${name || 'Flight Plan'}</title>
  <style>
    @media print {
      body { font-size: 10pt; }
      .page-break { page-break-before: always; }
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11pt;
      line-height: 1.3;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      color: #333;
    }
    h1 { font-size: 18pt; margin-bottom: 5px; }
    .header { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .meta { display: flex; gap: 30px; flex-wrap: wrap; font-size: 10pt; color: #666; }
    .meta-item { }
    .meta-label { font-weight: bold; color: #333; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-top: 15px;
      font-size: 10pt;
    }
    th, td { 
      border: 1px solid #ddd; 
      padding: 6px 8px; 
      text-align: center;
    }
    th { background: #f5f5f5; font-weight: bold; }
    .waypoint-col { text-align: left; }
    .total-row { background: #f9f9f9; font-weight: bold; }
    .summary { 
      margin-top: 20px; 
      padding: 15px; 
      background: #f5f5f5; 
      border-radius: 5px;
      display: flex;
      gap: 40px;
      flex-wrap: wrap;
    }
    .summary-item { }
    .summary-value { font-size: 16pt; font-weight: bold; color: #333; }
    .summary-label { font-size: 9pt; color: #666; text-transform: uppercase; }
    .footer { 
      margin-top: 30px; 
      font-size: 9pt; 
      color: #999; 
      text-align: center;
      border-top: 1px solid #eee;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${name || 'Flight Plan'}</h1>
    <div class="meta">
      <div class="meta-item"><span class="meta-label">Aircraft:</span> ${aircraft}</div>
      <div class="meta-item"><span class="meta-label">Departure:</span> ${departure}</div>
      <div class="meta-item"><span class="meta-label">Arrival:</span> ${arrival}</div>
      <div class="meta-item"><span class="meta-label">Date:</span> ${date}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>From</th>
        <th>To</th>
        <th>Course</th>
        <th>Dist</th>
        <th>Time</th>
        <th>Fuel</th>
        <th>Cost</th>
      </tr>
    </thead>
    <tbody>
      ${legs.map(leg => `
        <tr>
          <td class="waypoint-col"><strong>${leg.from.icao}</strong><br><small>${leg.from.name || ''}</small></td>
          <td class="waypoint-col"><strong>${leg.to.icao}</strong><br><small>${leg.to.name || ''}</small></td>
          <td>${leg.trueHeading}°</td>
          <td>${leg.distance} NM</td>
          <td>${Math.floor(leg.time)}:${((leg.time % 1) * 60).toFixed(0).padStart(2, '0')}</td>
          <td>${leg.fuelWithReserves.toFixed(1)} gal</td>
          <td>$${leg.cost.toFixed(0)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="2"><strong>TOTAL</strong></td>
        <td></td>
        <td><strong>${totalDistance} NM</strong></td>
        <td><strong>${Math.floor(totalTime)}:${((totalTime % 1) * 60).toFixed(0).padStart(2, '0')}</strong></td>
        <td><strong>${totalFuel.toFixed(1)} gal</strong></td>
        <td><strong>$${totalCost.toFixed(0)}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-item">
      <div class="summary-value">${totalDistance}</div>
      <div class="summary-label">Total Distance (NM)</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${Math.floor(totalTime)}h ${((totalTime % 1) * 60).toFixed(0)}m</div>
      <div class="summary-label">Estimated Time</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${totalFuel.toFixed(1)}</div>
      <div class="summary-label">Fuel Required (gal)</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">$${totalCost.toFixed(0)}</div>
      <div class="summary-label">Estimated Cost</div>
    </div>
  </div>

  <div class="footer">
    Generated by FuelSaver - Flight Planning Tool<br>
    For planning purposes only. Not for navigation.
  </div>
</body>
</html>
  `.trim();
  
  return html;
}

/**
 * Generate Detailed Nav Log (comprehensive format)
 */
export function generateDetailedNavLog(data: NavLogData): string {
  const { name, aircraft, departure, arrival, date, legs, totalDistance, totalTime, totalFuel, totalCost } = data;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Nav Log - ${name || 'Flight Plan'} (Detailed)</title>
  <style>
    @media print {
      body { font-size: 9pt; }
      .page-break { page-break-before: always; }
    }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 10pt;
      line-height: 1.3;
      max-width: 900px;
      margin: 0 auto;
      padding: 15px;
      color: #333;
    }
    h1 { font-size: 16pt; margin-bottom: 5px; }
    .header { margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .meta { display: flex; gap: 25px; flex-wrap: wrap; font-size: 9pt; color: #666; }
    .meta-item { }
    .meta-label { font-weight: bold; color: #333; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-top: 12px;
      font-size: 9pt;
    }
    th, td { 
      border: 1px solid #ddd; 
      padding: 4px 6px; 
      text-align: center;
    }
    th { background: #f0f0f0; font-weight: bold; font-size: 8pt; }
    .waypoint-col { text-align: left; }
    .small { font-size: 8pt; color: #666; }
    .total-row { background: #f5f5f5; font-weight: bold; }
    .summary { 
      margin-top: 15px; 
      padding: 12px; 
      background: #f5f5f5; 
      border-radius: 5px;
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
    }
    .summary-item { }
    .summary-value { font-size: 14pt; font-weight: bold; color: #333; }
    .summary-label { font-size: 8pt; color: #666; text-transform: uppercase; }
    .footer { 
      margin-top: 20px; 
      font-size: 8pt; 
      color: #999; 
      text-align: center;
      border-top: 1px solid #eee;
      padding-top: 8px;
    }
    .wind-info { font-size: 8pt; color: #888; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${name || 'Flight Plan'} - Detailed Nav Log</h1>
    <div class="meta">
      <div class="meta-item"><span class="meta-label">Aircraft:</span> ${aircraft}</div>
      <div class="meta-item"><span class="meta-label">Departure:</span> ${departure}</div>
      <div class="meta-item"><span class="meta-label">Arrival:</span> ${arrival}</div>
      <div class="meta-item"><span class="meta-label">Alt:</span> ${data.cruisingAltitude}ft</div>
      <div class="meta-item"><span class="meta-label">Date:</span> ${date}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2">From</th>
        <th rowspan="2">To</th>
        <th colspan="3">Course (°)</th>
        <th colspan="2">Speed (kts)</th>
        <th rowspan="2">Dist</th>
        <th rowspan="2">Time</th>
        <th colspan="2">Fuel (gal)</th>
        <th rowspan="2">Wind</th>
        <th rowspan="2">Cost</th>
      </tr>
      <tr>
        <th>True</th>
        <th>Mag Var</th>
        <th>Mag</th>
        <th>TAS</th>
        <th>GS</th>
        <th>Burn</th>
        <th>+Res</th>
      </tr>
    </thead>
    <tbody>
      ${legs.map(leg => `
        <tr>
          <td class="waypoint-col"><strong>${leg.from.icao}</strong><br><span class="small">${(leg.from.name || '').substring(0, 20)}</span></td>
          <td class="waypoint-col"><strong>${leg.to.icao}</strong><br><span class="small">${(leg.to.name || '').substring(0, 20)}</span></td>
          <td>${leg.trueHeading}°</td>
          <td>${leg.magneticVariation > 0 ? 'E' + leg.magneticVariation : leg.magneticVariation < 0 ? 'W' + Math.abs(leg.magneticVariation) : '0'}</td>
          <td><strong>${leg.magneticHeading}°</strong></td>
          <td>${leg.tas}</td>
          <td><strong>${leg.groundspeed}</strong></td>
          <td>${leg.distance}</td>
          <td>${Math.floor(leg.time)}:${((leg.time % 1) * 60).toFixed(0).padStart(2, '0')}</td>
          <td>${leg.fuelNeeded.toFixed(1)}</td>
          <td><strong>${leg.fuelWithReserves.toFixed(1)}</strong></td>
          <td class="wind-info">${leg.windDirection}°/${leg.windSpeed}</td>
          <td>$${leg.cost.toFixed(0)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="7"><strong>TOTAL</strong></td>
        <td><strong>${totalDistance}</strong></td>
        <td><strong>${Math.floor(totalTime)}:${((totalTime % 1) * 60).toFixed(0).padStart(2, '0')}</strong></td>
        <td>${(totalFuel - totalFuel * 0.2).toFixed(1)}</td>
        <td><strong>${totalFuel.toFixed(1)}</strong></td>
        <td></td>
        <td><strong>$${totalCost.toFixed(0)}</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-item">
      <div class="summary-value">${totalDistance} NM</div>
      <div class="summary-label">Total Distance</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${Math.floor(totalTime)}h ${((totalTime % 1) * 60).toFixed(0)}m</div>
      <div class="summary-label">Est. Time</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${totalFuel.toFixed(1)} gal</div>
      <div class="summary-label">Fuel +25%</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">$${totalCost.toFixed(0)}</div>
      <div class="summary-label">Est. Cost</div>
    </div>
  </div>

  <div class="footer">
    Generated by FuelSaver - Flight Planning Tool | For planning purposes only | Not for navigation
  </div>
</body>
</html>
  `.trim();
  
  return html;
}

/**
 * Create NavLog data from flight plan
 */
export function createNavLogData(
  waypoints: Waypoint[],
  aircraft: { name: string; speed: number; burnRate: number; fuelCapacity: number },
  cruisingAltitude: number,
  fuelPrices: Record<string, { price100ll: number | null }>,
  windData: Record<string, { direction: number; speed: number }> = {}, // Optional wind by waypoint
  planName?: string
): NavLogData | null {
  if (waypoints.length < 2) return null;

  const derivedName = `Flight ${waypoints[0].icao} to ${waypoints[waypoints.length - 1].icao}`;
  const name = planName?.trim()?.length ? planName.trim() : derivedName;
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'numeric', 
    day: 'numeric' 
  });

  const legs: NavLogLeg[] = [];
  let totalDistance = 0;
  let totalTime = 0;
  let totalFuel = 0;
  let totalCost = 0;

  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1];
    const to = waypoints[i];
    
    // Calculate distance
    const distance = calculateDistance(from.latitude, from.longitude, to.latitude, to.longitude);
    totalDistance += distance;
    
    // Get magnetic variation at midpoint
    const midLat = (from.latitude + to.latitude) / 2;
    const midLon = (from.longitude + to.longitude) / 2;
    const magneticVariation = calculateMagneticVariation(midLat, midLon);
    
    // Get wind data (default if not provided)
    const wind = windData[from.icao] || { direction: 270, speed: 10 }; // Default: wind from west at 10kts
    
    // Calculate true course
    const trueCourse = calculateTrueCourse(from.latitude, from.longitude, to.latitude, to.longitude);
    
    // Calculate wind effects
    const { groundspeed, windCorrection } = calculateWindEffect(
      trueCourse,
      aircraft.speed,
      wind.direction,
      wind.speed
    );
    
    // Calculate headings
    const magneticHeading = trueToMagnetic(trueCourse, magneticVariation);
    const trueHeading = trueCourse;
    
    // Calculate time
    const time = groundspeed > 0 ? distance / groundspeed * 60 : 0; // minutes
    totalTime += time;
    
    // Calculate fuel
    const fuelNeeded = (distance / aircraft.speed) * aircraft.burnRate;
    const fuelWithReserves = fuelNeeded * 1.25;
    totalFuel += fuelWithReserves;
    
    // Calculate cost
    const fuelPrice = fuelPrices[from.icao]?.price100ll || 6.50;
    const legCost = fuelWithReserves * fuelPrice;
    totalCost += legCost;
    
    legs.push({
      from,
      to,
      course: trueCourse,
      distance,
      tas: aircraft.speed,
      windDirection: wind.direction,
      windSpeed: wind.speed,
      groundspeed,
      windCorrection,
      magneticVariation,
      trueHeading,
      magneticHeading,
      time,
      fuelNeeded,
      fuelWithReserves,
      cost: legCost
    });
  }

  return {
    name,
    aircraft: aircraft.name,
    departure: waypoints[0].icao,
    arrival: waypoints[waypoints.length - 1].icao,
    cruisingAltitude,
    date,
    legs,
    totalDistance,
    totalTime,
    totalFuel,
    totalCost
  };
}

/**
 * Download Basic or Detailed Nav Log
 */
export function downloadNavLog(
  waypoints: Waypoint[],
  aircraft: { name: string; speed: number; burnRate: number; fuelCapacity: number },
  cruisingAltitude: number,
  fuelPrices: Record<string, { price100ll: number | null }>,
  detailed: boolean = false,
  planName?: string
): void {
  const navLogData = createNavLogData(waypoints, aircraft, cruisingAltitude, fuelPrices, undefined, planName);
  if (!navLogData) return;

  const html = detailed ? generateDetailedNavLog(navLogData) : generateBasicNavLog(navLogData);
  const filename = `${navLogData.name?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'flight-plan'}-${detailed ? 'detailed' : 'basic'}-navlog`;

  // Open in new window for printing without document.write
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank', 'noopener');
  if (printWindow) {
    const tryPrint = () => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {}
    };
    printWindow.addEventListener('load', tryPrint, { once: true });
    setTimeout(tryPrint, 800);
  }
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Download Nav Log as a styled PDF
 */
export function downloadNavLogPdf(
  waypoints: Waypoint[],
  aircraft: { name: string; speed: number; burnRate: number; fuelCapacity: number },
  cruisingAltitude: number,
  fuelPrices: Record<string, { price100ll: number | null }>,
  options?: { detailed?: boolean; planName?: string }
): void {
  const navLogData = createNavLogData(
    waypoints,
    aircraft,
    cruisingAltitude,
    fuelPrices,
    undefined,
    options?.planName
  );

  if (!navLogData) return;

  const detailed = options?.detailed ?? false;
  const doc = createNavLogPdfDoc(navLogData, { detailed, cruisingAltitude });
  const filenameBase = navLogData.name?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'flight-plan';
  doc.save(`${filenameBase}-navlog.pdf`);

  persistNavLogExport(navLogData, detailed);
}

export function createNavLogPdfDoc(
  navLogData: NavLogData,
  options?: { detailed?: boolean; cruisingAltitude?: number }
): jsPDF {
  const detailed = options?.detailed ?? false;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const margin = 14;
  const lineHeight = 6;
  const headingY = margin + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(navLogData.name || 'Flight Plan Nav Log', margin, headingY);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const metaLines = [
    `Aircraft: ${navLogData.aircraft}`,
    `Route: ${navLogData.departure} → ${navLogData.arrival}`,
    `Altitude: ${(options?.cruisingAltitude ?? navLogData.cruisingAltitude).toLocaleString()} ft`,
    `Date: ${navLogData.date}`
  ];
  metaLines.forEach((line, idx) => {
    doc.text(line, margin, headingY + 10 + idx * lineHeight);
  });

  const tableHead = detailed
    ? [['Leg', 'Course°', 'True HDG°', 'Mag HDG°', 'GS (kt)', 'Dist (NM)', 'Time', 'Fuel (gal)', 'Cost ($)']]
    : [['Leg', 'Course°', 'Dist (NM)', 'Time', 'Fuel (gal)', 'Cost ($)']];

  const formatTime = (timeMinutes: number) => {
    const hours = Math.floor(timeMinutes / 60);
    const minutes = Math.round(timeMinutes % 60);
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  };

  const tableBody = navLogData.legs.map((leg, index) => {
    const legLabel = `${index + 1}. ${leg.from.icao} → ${leg.to.icao}`;
    if (detailed) {
      return [
        legLabel,
        `${leg.course.toFixed(0)}`,
        `${leg.trueHeading.toFixed(0)}`,
        `${leg.magneticHeading.toFixed(0)}`,
        `${leg.groundspeed.toFixed(0)}`,
        `${leg.distance.toFixed(1)}`,
        formatTime(leg.time),
        `${leg.fuelWithReserves.toFixed(1)}`,
        `$${leg.cost.toFixed(0)}`
      ];
    }

    return [
      legLabel,
      `${leg.course.toFixed(0)}`,
      `${leg.distance.toFixed(1)}`,
      formatTime(leg.time),
      `${leg.fuelWithReserves.toFixed(1)}`,
      `$${leg.cost.toFixed(0)}`
    ];
  });

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: headingY + 10 + metaLines.length * lineHeight + 4,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left' }
    }
  });

  const tableY = (doc as any).lastAutoTable?.finalY || 0;
  const summaryY = tableY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Summary', margin, summaryY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const summaryLines = [
    `Total Distance: ${navLogData.totalDistance.toFixed(1)} NM`,
    `Estimated Time: ${formatTime(navLogData.totalTime)}`,
    `Fuel Required: ${navLogData.totalFuel.toFixed(1)} gal`,
    `Estimated Cost: $${navLogData.totalCost.toFixed(0)}`
  ];

  summaryLines.forEach((line, idx) => {
    doc.text(line, margin, summaryY + 6 + idx * lineHeight);
  });

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('Generated by FuelSaver — For planning purposes only', margin, doc.internal.pageSize.getHeight() - margin);

  return doc;
}

function persistNavLogExport(navLogData: NavLogData, detailed: boolean) {
  if (typeof window === 'undefined') return;
  try {
    const existingRaw = localStorage.getItem(NAV_LOG_EXPORTS_KEY);
    const existing: StoredNavLogExport[] = existingRaw ? JSON.parse(existingRaw) : [];
    const entry: StoredNavLogExport = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      name: navLogData.name || `${navLogData.departure} → ${navLogData.arrival}`,
      createdAt: new Date().toISOString(),
      detailed,
      navLogData
    };
    const next = [entry, ...existing].slice(0, 20);
    localStorage.setItem(NAV_LOG_EXPORTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('navlog-exports-updated'));
  } catch (error) {
    console.error('Failed to persist nav log export', error);
  }
}

export function getNavLogExportHistory(): StoredNavLogExport[] {
  if (typeof window === 'undefined') return [];
  try {
    const existingRaw = localStorage.getItem(NAV_LOG_EXPORTS_KEY);
    return existingRaw ? JSON.parse(existingRaw) : [];
  } catch (error) {
    console.error('Failed to load nav log exports', error);
    return [];
  }
}

export interface DeepLinkResult {
  scheme: string;
  fallback?: string;
}

export function generateForeFlightDeepLink(
  waypoints: Waypoint[],
  options?: { planName?: string; altitude?: number }
): DeepLinkResult | null {
  const route = waypoints
    .filter((wp) => wp?.icao)
    .map((wp) => ({ ...wp, icao: (wp.icao || '').toUpperCase() }));
  if (route.length < 2) return null;

  const origin = route[0].icao;
  const destination = route[route.length - 1].icao;
  const intermediate = route.slice(1, -1).map((wp) => wp.icao).join('+');
  const params = new URLSearchParams({
    name: options?.planName || `${origin}-${destination}`,
    origin,
    destination,
  });
  if (intermediate) params.set('waypoints', intermediate);
  if (options?.altitude) params.set('altitude', options.altitude.toString());

  const scheme = `foreflight://route?${params.toString()}`;
  const fallbackRoute = route.map((wp) => wp.icao).join('.');
  const fallback = `https://plan.foreflight.com/plan?route=${encodeURIComponent(fallbackRoute)}`;
  return { scheme, fallback };
}

export function generateGarminDeepLink(
  waypoints: Waypoint[],
  options?: { planName?: string }
): DeepLinkResult | null {
  const route = waypoints
    .filter((wp) => wp?.icao)
    .map((wp) => ({ ...wp, icao: (wp.icao || '').toUpperCase() }));
  if (route.length < 2) return null;

  const routeDots = route.map((wp) => wp.icao).join('..');
  const schemeParams = new URLSearchParams({
    route: routeDots,
  });
  if (options?.planName) {
    schemeParams.set('name', options.planName);
  }
  const scheme = `garminpilot://flightPlan?${schemeParams.toString()}`;
  const fallback = `https://fly.garmin.com/fpl/application?plan=${route.map((wp) => wp.icao).join(',')}`;
  return { scheme, fallback };
}
