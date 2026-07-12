// ── Aviation Terms ──
export interface GlossaryEntry {
  term: string
  definition: string
  category: 'aviation' | 'feature'
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  // ── Aviation Terms ──
  { term: 'VFR', category: 'aviation', definition: 'Visual Flight Rules — flying by visual reference to the ground and sky. Requires minimum weather conditions (visibility + cloud clearance) to operate without an instrument flight plan.' },
  { term: 'IFR', category: 'aviation', definition: 'Instrument Flight Rules — flying solely by reference to instruments. Required when weather conditions are below VFR minimums. Pilots must hold an instrument rating.' },
  { term: 'MVFR', category: 'aviation', definition: 'Marginal Visual Flight Rules — weather conditions between VFR and IFR. Typical ceiling 1,000–3,000 ft AGL and/or visibility 3–5 statute miles.' },
  { term: 'LIFR', category: 'aviation', definition: 'Low IFR — weather conditions with ceilings below 1,000 ft AGL and/or visibility less than 3 statute miles. Requires instrument proficiency.' },
  { term: 'METAR', category: 'aviation', definition: 'Meteorological Aerodrome Report — hourly weather observation from airports worldwide. Includes wind, visibility, ceiling, temperature, dew point, altimeter, and remarks.' },
  { term: 'TAF', category: 'aviation', definition: 'Terminal Aerodrome Forecast — a 24-30 hour weather forecast for a specific airport issued 4 times daily by weather authorities (NWS in the US).' },
  { term: 'NOTAM', category: 'aviation', definition: 'Notice to Air Missions — time-critical aeronautical information about temporary changes to facilities, services, procedures, or hazards along an air route.' },
  { term: 'ATIS', category: 'aviation', definition: 'Automatic Terminal Information Service — continuous broadcast of recorded airport information (weather, runways in use, notices) on a dedicated frequency.' },
  { term: 'AWOS', category: 'aviation', definition: 'Automated Weather Observing System — a fully automated weather station that reports real-time conditions at airports without human observation.' },
  { term: 'ASOS', category: 'aviation', definition: 'Automated Surface Observing System — a more advanced automated weather station used at larger airports, reporting additional data like precipitation type and freezing rain.' },
  { term: 'FSS', category: 'aviation', definition: 'Flight Service Station — provides pre-flight briefings, weather updates, flight plan filing, and in-flight assistance. In the US, operated by Leidos under contract with the FAA.' },
  { term: 'KTAS', category: 'aviation', definition: 'Knots True Airspeed — the actual speed of the aircraft through the air mass, corrected for altitude and temperature. Used for flight planning and performance calculations.' },
  { term: 'KIAS', category: 'aviation', definition: 'Knots Indicated Airspeed — the speed shown on the airspeed indicator. Used for operating limitations (V-speeds) and ATC separation.' },
  { term: 'KCAS', category: 'aviation', definition: 'Knots Calibrated Airspeed — indicated airspeed corrected for instrument and position errors. Used for performance charts and regulatory compliance.' },
  { term: 'GS', category: 'aviation', definition: 'Ground Speed — the actual speed of the aircraft over the ground. Calculated by combining true airspeed with wind effects. Used for navigation and ETAs.' },
  { term: 'Mach', category: 'aviation', definition: 'The ratio of an aircraft\'s true airspeed to the speed of sound. Mach 1.0 = the speed of sound (~661 knots at 35,000 ft). Used primarily in jet aviation.' },
  { term: 'Vne', category: 'aviation', definition: 'Velocity Never Exceed — the maximum speed the aircraft can ever be flown. Exceeding Vne risks structural damage or failure. Marked as the red line on the airspeed indicator.' },
  { term: 'Vno', category: 'aviation', definition: 'Velocity Normal Operating — the maximum speed for operations in turbulent air (maximum structural cruising speed). Above this speed, only smooth air is permitted.' },
  { term: 'Vx', category: 'aviation', definition: 'Best Angle of Climb Speed — the airspeed that gives the greatest altitude gain over a given horizontal distance. Used for obstacle clearance during takeoff.' },
  { term: 'Vy', category: 'aviation', definition: 'Best Rate of Climb Speed — the airspeed that gives the greatest altitude gain over a given time. Used for normal climb after clearing obstacles.' },
  { term: 'Va', category: 'aviation', definition: 'Maneuvering Speed — the maximum speed at which full or abrupt control deflections can be applied without exceeding the aircraft\'s structural limits.' },
  { term: 'Vfe', category: 'aviation', definition: 'Maximum Flap Extended Speed — the highest speed at which the flaps can be extended. Exceeding Vfe with flaps out can cause structural damage.' },
  { term: 'AGL', category: 'aviation', definition: 'Above Ground Level — altitude measured from the ground directly below the aircraft. Used for traffic patterns, obstacle clearance, and terrain avoidance.' },
  { term: 'MSL', category: 'aviation', definition: 'Mean Sea Level — altitude measured from average sea level. Used for flight levels, airway altitudes, and altimeter settings. Most aviation altitudes are MSL.' },
  { term: 'FL', category: 'aviation', definition: 'Flight Level — an altitude above 18,000 ft MSL in the US, expressed in hundreds of feet (e.g., FL350 = 35,000 ft). Uses a standard altimeter setting of 29.92 inHg.' },
  { term: 'QNH', category: 'aviation', definition: 'Altimeter setting that adjusts the altimeter to read elevation above MSL when on the ground. Used for en-route altitudes below the transition level.' },
  { term: 'QNE', category: 'aviation', definition: 'The standard altimeter setting of 29.92 inHg / 1013.25 hPa used at and above the transition altitude (18,000 ft in the US).' },
  { term: 'HAA', category: 'aviation', definition: 'Height Above Airport — the height of the aircraft above the airport elevation. Commonly used for circling approaches and pattern work.' },
  { term: 'HAT', category: 'aviation', definition: 'Height Above Touchdown — the height of the aircraft above the touchdown zone elevation. Used in instrument approach minimums.' },
  { term: 'DME', category: 'aviation', definition: 'Distance Measuring Equipment — a radio navigation system that provides slant-range distance in nautical miles from a ground station to the aircraft.' },
  { term: 'VOR', category: 'aviation', definition: 'VHF Omnidirectional Range — a ground-based radio navigation system that provides bearing information to/from the station. The backbone of the US airway system.' },
  { term: 'NDB', category: 'aviation', definition: 'Non-Directional Beacon — a low-frequency radio navigation aid. Used with ADF (Automatic Direction Finder) to determine bearing to the station.' },
  { term: 'ILS', category: 'aviation', definition: 'Instrument Landing System — a precision approach system providing both lateral (localizer) and vertical (glideslope) guidance to the runway.' },
  { term: 'LOC', category: 'aviation', definition: 'Localizer — the lateral component of an ILS that provides left-right guidance aligned with the runway centerline.' },
  { term: 'LNAV', category: 'aviation', definition: 'Lateral Navigation — GPS-based navigation providing horizontal guidance along a defined flight path. Used in non-precision approaches.' },
  { term: 'VNAV', category: 'aviation', definition: 'Vertical Navigation — GPS-based navigation providing vertical guidance. Adds descent path information to GPS approaches.' },
  { term: 'RNAV', category: 'aviation', definition: 'Area Navigation — a navigation method allowing aircraft to fly any desired flight path within the coverage of ground- or space-based navigation aids, not limited to straight-line paths between ground stations.' },
  { term: 'GPS', category: 'aviation', definition: 'Global Positioning System — satellite-based navigation system providing precise position, velocity, and time information worldwide.' },
  { term: 'WAAS', category: 'aviation', definition: 'Wide Area Augmentation System — a satellite-based augmentation system that improves GPS accuracy to ~3 meters, enabling precision approaches without ground-based equipment.' },
  { term: 'ADS-B', category: 'aviation', definition: 'Automatic Dependent Surveillance-Broadcast — a surveillance technology where aircraft broadcast their GPS position, speed, and identity to ATC and nearby aircraft. Required by the FAA in most controlled airspace since 2020.' },
  { term: 'TCAS', category: 'aviation', definition: 'Traffic Collision Avoidance System — an airborne system that monitors transponder-equipped aircraft nearby and issues Resolution Advisories (RA) to avoid mid-air collisions.' },
  { term: 'SQUAWK', category: 'aviation', definition: 'A four-digit code assigned by ATC to identify an aircraft on radar. Entered into the transponder. Standard codes: 1200 (VFR), 7600 (radio failure), 7700 (emergency).' },
  { term: 'ETE', category: 'aviation', definition: 'Estimated Time En Route — the total time expected for a flight segment, from departure to arrival, based on planned ground speed and distance.' },
  { term: 'ETA', category: 'aviation', definition: 'Estimated Time of Arrival — the time at which the aircraft is expected to arrive at the destination or waypoint.' },
  { term: 'PNR', category: 'aviation', definition: 'Point of No Return — the point along a flight path where the aircraft no longer has enough fuel to return to the departure airport. Beyond PNR, must continue to destination.' },
  { term: 'W&B', category: 'aviation', definition: 'Weight and Balance — the calculation of total aircraft weight and the location of the center of gravity (CG). Critical for safe flight; must be within limits for every flight.' },
  { term: 'CG', category: 'aviation', definition: 'Center of Gravity — the point where the aircraft balances. Must remain within the manufacturer\'s specified forward and aft limits for safe control of the aircraft.' },
  { term: 'MAC', category: 'aviation', definition: 'Mean Aerodynamic Chord — the average chord (width) of the wing. CG position is often expressed as a percentage of MAC (%MAC) in larger aircraft.' },
  { term: 'ZFW', category: 'aviation', definition: 'Zero Fuel Weight — the total weight of the aircraft including crew, passengers, cargo, and everything except fuel. Used for structural loading limits.' },
  { term: 'RTOW', category: 'aviation', definition: 'Regulated Takeoff Weight — the maximum takeoff weight permitted under current conditions (temperature, altitude, runway length, obstacles). Used in performance calculations.' },
  { term: 'LDTW', category: 'aviation', definition: 'Landing Weight — the weight of the aircraft at the time of landing. Must be within structural limits for the landing gear and airframe.' },

  // ── Feature Dictionary ──
  { term: 'Dashboard', category: 'feature', definition: 'Your aviation command center. Displays flight statistics, FTL gauges, recent flights, weather at home airport, charts, and quick-access tools. Fully customizable — use the gear icon to show or hide widgets.' },
  { term: 'Flights (Logbook)', category: 'feature', definition: 'Browse your complete flight logbook. Search, filter by date/aircraft/route, sort columns, and review every flight you\'ve recorded. Supports both local SQLite and cloud sync.' },
  { term: 'Add Flight', category: 'feature', definition: 'Quickly log a new flight. Enter aircraft, route departure/arrival times, pilot role, and remarks. Auto-calculates duration and pulls aircraft defaults from your fleet.' },
  { term: 'Totals', category: 'feature', definition: 'Yearly, monthly, and all-time flight time breakdowns. View hours by category (PIC, SIC, dual, instrument, cross-country, night) with progress bars toward your goals.' },
  { term: 'Currency', category: 'feature', definition: 'Stay current at a glance. Monitors 90-day, 6-month, and 12-month rolling requirements for day/VFR, night, instrument, and other regulatory currencies.' },
  { term: 'Aircraft', category: 'feature', definition: 'Manage your aircraft fleet. View specs, edit weight & balance data (empty weight, CG, arm stations, fuel capacity), auto-fill from reference database, and track maintenance documents.' },
  { term: 'Map', category: 'feature', definition: 'Interactive flight planning map powered by MapLibre GL. Search airports by name/ICAO, build multi-waypoint routes with drag-reorder, view METAR weather on click, and export to GPX/FPL/JSON.' },
  { term: 'Calendar', category: 'feature', definition: 'View your flight history on an interactive calendar. Spot flying patterns, identify gaps, and click any date to see flights logged that day.' },
  { term: 'Profile', category: 'feature', definition: 'Your personal pilot profile. Manage certifications (medical, BFR, IPC), upload documents, view logbook statistics, set avatar color, and backup/restore your data.' },
  { term: 'Settings', category: 'feature', definition: 'Customize your experience — theme (light/dark/system), display preferences (duration format, timezone, units), notifications, privacy controls, data export, and app updates.' },
  { term: 'Saved Routes', category: 'feature', definition: 'Store frequently flown routes with custom names. Open, duplicate, or delete saved routes from the map sidebar. Import routes from GPX/FPL/JSON files with merge or replace options.' },
  { term: 'FTL Gauges', category: 'feature', definition: 'Flight Time Limitation gauges showing 28-day, 90-day, and 12-month rolling flight hours in a circular SVG gauge format. Helps commercial pilots track duty limitations.' },
  { term: 'Weight & Balance', category: 'feature', definition: 'Full weight and balance calculator on the map and aircraft detail pages. Enter passengers, baggage, and fuel loads; visual CG envelope shows whether you\'re within limits.' },
  { term: 'Weather', category: 'feature', definition: 'Real-time METAR weather cards on the dashboard and map. Click any airport on the map to view its current conditions, fuel prices, frequencies, and runway info.' },
  { term: 'Export', category: 'feature', definition: 'Export flight plans in GPX (ForeFlight/Garmin compatible), FPL (with W&B data comments), or JSON formats. Also export nav logs as PDF or detailed HTML for printing.' },
  { term: 'Tiles Cache', category: 'feature', definition: 'Map tiles are cached locally for faster loading and offline use. Clear the cache in Settings to free disk space, or use the Update button on the map to refresh tile data.' },
]

export function searchGlossary(query: string): GlossaryEntry[] {
  const q = query.toLowerCase().trim()
  if (!q) return GLOSSARY_ENTRIES
  return GLOSSARY_ENTRIES.filter(
    (e) =>
      e.term.toLowerCase().includes(q) ||
      e.definition.toLowerCase().includes(q),
  )
}

export function getGlossaryByCategory(): { aviation: GlossaryEntry[]; feature: GlossaryEntry[] } {
  const aviation = GLOSSARY_ENTRIES.filter((e) => e.category === 'aviation')
  const feature = GLOSSARY_ENTRIES.filter((e) => e.category === 'feature')
  return { aviation, feature }
}
