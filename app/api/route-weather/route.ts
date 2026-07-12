import { NextRequest, NextResponse } from 'next/server';

function httpGet(url: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const req = protocol.get(url, { 
      headers: { 'User-Agent': 'AviationHub/1.0' },
      timeout: 10000 
    }, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode || 500, data }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065; // Earth radius in NM
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// NOAA winds aloft altitude levels in feet
const WIND_ALTITUDES = [3000, 6000, 9000, 12000, 18000, 24000, 30000, 34000, 39000];
const WIND_FIELDS = ['three', 'six', 'nine', 'twelve', 'eighteen', 'twentyfour', 'thirty', 'thirtyfour', 'thirtynine'];

interface WindPoint {
  lat: number;
  lon: number;
  station: string;
  winds: { altitude: number; dir: number; speed: number; temp?: number }[];
}

// Parse NOAA winds aloft JSON response
function parseWindsAloft(data: any[]): WindPoint[] {
  const points: WindPoint[] = [];
  
  for (const station of data) {
    if (!station.lat || !station.lon) continue;
    
    const winds: WindPoint['winds'] = [];
    
    for (let i = 0; i < WIND_FIELDS.length; i++) {
      const raw = station[WIND_FIELDS[i]];
      if (!raw || typeof raw !== 'string') continue;
      
      // Parse format: "DDDff" or "DDDffTT" where DDD=dir, ff=speed, TT=temp
      // e.g., "2725" = 270° @ 25kt, "2725M05" = 270° @ 25kt, -5°C
      let dir = parseInt(raw.substring(0, 2)) * 10; // First 2 digits * 10 = direction
      let speed = parseInt(raw.substring(2, 4));
      
      // Handle light/variable winds (9900 = light and variable)
      if (dir === 990) {
        dir = 0;
        speed = 0;
      }
      // Handle winds > 100 kts (direction encoded as 50+ means add 100 to speed)
      if (dir > 360) {
        dir -= 500;
        speed += 100;
      }
      
      if (!isNaN(dir) && !isNaN(speed)) {
        let temp: number | undefined;
        const tempStr = raw.substring(4);
        if (tempStr) {
          if (tempStr.startsWith('M')) {
            temp = -parseInt(tempStr.substring(1));
          } else if (/^\d+$/.test(tempStr)) {
            temp = parseInt(tempStr);
          }
        }
        winds.push({ altitude: WIND_ALTITUDES[i], dir, speed, temp });
      }
    }
    
    if (winds.length > 0) {
      points.push({
        lat: station.lat,
        lon: station.lon,
        station: station.station || station.id || 'UNK',
        winds,
      });
    }
  }
  
  return points;
}

// Find closest wind reporting station to a point
function findClosestWind(lat: number, lon: number, altitude: number, windPoints: WindPoint[]): { dir: number; speed: number } {
  if (windPoints.length === 0) {
    return { dir: 270, speed: 15 }; // Fallback: light westerly
  }
  
  // Find closest station
  let closest = windPoints[0];
  let minDist = calculateDistance(lat, lon, closest.lat, closest.lon);
  
  for (const wp of windPoints) {
    const dist = calculateDistance(lat, lon, wp.lat, wp.lon);
    if (dist < minDist) {
      minDist = dist;
      closest = wp;
    }
  }
  
  // Interpolate wind at requested altitude
  const winds = closest.winds.sort((a, b) => a.altitude - b.altitude);
  
  // Find bracketing altitudes
  let lower = winds[0];
  let upper = winds[winds.length - 1];
  
  for (let i = 0; i < winds.length - 1; i++) {
    if (winds[i].altitude <= altitude && winds[i + 1].altitude >= altitude) {
      lower = winds[i];
      upper = winds[i + 1];
      break;
    }
  }
  
  // Interpolate
  if (lower.altitude === upper.altitude) {
    return { dir: lower.dir, speed: lower.speed };
  }
  
  const frac = (altitude - lower.altitude) / (upper.altitude - lower.altitude);
  const speed = Math.round(lower.speed + (upper.speed - lower.speed) * frac);
  
  // Direction interpolation (handle wrap-around at 360°)
  let dirDiff = upper.dir - lower.dir;
  if (dirDiff > 180) dirDiff -= 360;
  if (dirDiff < -180) dirDiff += 360;
  let dir = Math.round(lower.dir + dirDiff * frac);
  if (dir < 0) dir += 360;
  if (dir >= 360) dir -= 360;
  
  return { dir, speed };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const { 
      waypoints, 
      altitude = 5500, 
      aircraftTAS = 120,
      fuelBurnGph = 9.9  // Accept fuel burn from client
    } = await request.json();
    
    if (!waypoints || waypoints.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 waypoints' }, { status: 400 });
    }

    // Determine region based on route center
    const centerLat = (waypoints[0].lat + waypoints[waypoints.length - 1].lat) / 2;
    const centerLon = (waypoints[0].lon + waypoints[waypoints.length - 1].lon) / 2;
    
    let region = 'all'; // Use 'all' to get nationwide data
    if (centerLon < -120) region = 'sfo';
    else if (centerLon < -105) region = 'slc';
    else if (centerLon < -95) region = 'dfw';
    else if (centerLon < -85) region = 'chi';
    else if (centerLon < -75) region = 'mia';
    else region = 'bos';
    
    // Fetch REAL winds aloft from NOAA
    let windPoints: WindPoint[] = [];
    let windDataSource = 'fallback';
    
    try {
      const url = `https://aviationweather.gov/api/data/windtemp?region=${region}&format=json`;
      const response = await httpGet(url);
      
      if (response.status === 200) {
        const rawData = JSON.parse(response.data);
        if (Array.isArray(rawData) && rawData.length > 0) {
          windPoints = parseWindsAloft(rawData);
          windDataSource = 'noaa';
        }
      }
    } catch (e) {
      console.log('Wind data fetch failed, using fallback:', e);
    }

    // Calculate segment impacts using REAL wind data
    const segments: any[] = [];
    let totalDistance = 0;
    let totalTimeWithWind = 0;
    let totalTimeStillAir = 0;
    
    for (let i = 0; i < waypoints.length - 1; i++) {
      const from = waypoints[i];
      const to = waypoints[i + 1];
      const distance = calculateDistance(from.lat, from.lon, to.lat, to.lon);
      
      // Calculate true course
      const dLon = (to.lon - from.lon) * Math.PI / 180;
      const y = Math.sin(dLon) * Math.cos(to.lat * Math.PI / 180);
      const x = Math.cos(from.lat * Math.PI / 180) * Math.sin(to.lat * Math.PI / 180) -
                Math.sin(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.cos(dLon);
      let trueCourse = Math.atan2(y, x) * 180 / Math.PI;
      if (trueCourse < 0) trueCourse += 360;
      
      // Get wind at segment midpoint
      const midLat = (from.lat + to.lat) / 2;
      const midLon = (from.lon + to.lon) / 2;
      const wind = findClosestWind(midLat, midLon, altitude, windPoints);
      
      // Calculate headwind/tailwind component
      // Wind comes FROM windDir, we're heading TO trueCourse
      const windAngle = (wind.dir - trueCourse) * Math.PI / 180;
      const headwind = wind.speed * Math.cos(windAngle); // Positive = headwind, negative = tailwind
      const crosswind = Math.abs(wind.speed * Math.sin(windAngle));
      
      // Ground speed (simplified: TAS - headwind component)
      // More accurate would use wind triangle, but this is close for GA speeds
      const groundSpeed = Math.max(aircraftTAS * 0.5, aircraftTAS - headwind);
      
      // Time calculations (in hours)
      const timeStillAir = distance / aircraftTAS;
      const timeWithWind = distance / groundSpeed;
      
      // Fuel calculations using ACTUAL aircraft fuel burn
      const fuelStillAir = timeStillAir * fuelBurnGph;
      const fuelWithWind = timeWithWind * fuelBurnGph;
      const fuelDiff = fuelWithWind - fuelStillAir;
      const fuelImpactPercent = fuelStillAir > 0 ? (fuelDiff / fuelStillAir) * 100 : 0;
      
      segments.push({
        from: from.icao || `WP${i}`,
        to: to.icao || `WP${i+1}`,
        distance: Math.round(distance),
        trueCourse: Math.round(trueCourse),
        windFrom: wind.dir,
        windSpeed: wind.speed,
        headwind: Math.round(headwind),
        crosswind: Math.round(crosswind),
        tas: aircraftTAS,
        groundSpeed: Math.round(groundSpeed),
        timeStillAir: Math.round(timeStillAir * 60),
        timeWithWind: Math.round(timeWithWind * 60),
        fuelStillAir: Math.round(fuelStillAir * 10) / 10,
        fuelWithWind: Math.round(fuelWithWind * 10) / 10,
        fuelImpact: Math.round(fuelDiff * 10) / 10,
        fuelImpactPercent: Math.round(fuelImpactPercent * 10) / 10,
        significant: Math.abs(headwind) >= 15 || Math.abs(fuelImpactPercent) >= 10
      });
      
      totalDistance += distance;
      totalTimeWithWind += timeWithWind;
      totalTimeStillAir += timeStillAir;
    }
    
    const totalFuelStillAir = totalTimeStillAir * fuelBurnGph;
    const totalFuelWithWind = totalTimeWithWind * fuelBurnGph;
    const overallFuelImpact = totalFuelWithWind - totalFuelStillAir;
    const overallImpactPercent = totalFuelStillAir > 0 ? (overallFuelImpact / totalFuelStillAir) * 100 : 0;
    
    return NextResponse.json({
      segments,
      summary: {
        totalDistance: Math.round(totalDistance),
        totalTimeStillAir: Math.round(totalTimeStillAir * 60),
        totalTimeWithWind: Math.round(totalTimeWithWind * 60),
        timeDifference: Math.round((totalTimeWithWind - totalTimeStillAir) * 60),
        fuelStillAir: Math.round(totalFuelStillAir * 10) / 10,
        fuelWithWind: Math.round(totalFuelWithWind * 10) / 10,
        fuelImpact: Math.round(overallFuelImpact * 10) / 10,
        fuelImpactPercent: Math.round(overallImpactPercent * 10) / 10,
        significant: Math.abs(overallImpactPercent) >= 10
      },
      aircraft: {
        tas: aircraftTAS,
        fuelBurnGph,
      },
      wind: {
        source: windDataSource,
        stationsUsed: windPoints.length,
        region,
      },
      altitude,
    });
    
  } catch (error: any) {
    console.error('Route weather calculation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
