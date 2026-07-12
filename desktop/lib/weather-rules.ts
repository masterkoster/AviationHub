/**
 * Weather Rules Engine — certs + weather conditions → warnings.
 * Pure functions — no side effects.
 */

import type {
  MetarData,
  PilotCertStatus,
  WeatherWarning,
  FlightCategory,
} from './weather-types'

// ── Load Pilot Status from local SQLite ──

export async function loadPilotCertStatus(userId: string): Promise<PilotCertStatus | null> {
  if (!userId || typeof window === 'undefined') return null

  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql')
    const db = await Database.load('sqlite:aviationhub.db')

    // Read currency_rules
    const currencyRows = await db.select<Array<{
      code: string; completed: number | null; required: number | null; next_due: string | null
    }>>(
      `SELECT code, completed, required, next_due FROM currency_rules WHERE user_id = ?`,
      [userId]
    )

    const currencies = new Map(currencyRows.map((r) => [r.code, r]))

    // Read certifications (medical, bfr, ipc, license)
    const certRows = await db.select<Array<{
      type: string; expiry_date: string | null; ratings: string | null; name: string | null
    }>>(
      `SELECT type, expiry_date, ratings, name FROM certifications WHERE userId = ?`,
      [userId]
    )

    const medCert = certRows.find((c) => c.type === 'medical')
    const bfrCert = certRows.find((c) => c.type === 'bfr')
    const ipcCert = certRows.find((c) => c.type === 'ipc')
    const licenseCert = certRows.find((c) => c.type === 'license')

    // Medical
    const medExpiry = medCert?.expiry_date ?? currencies.get('MEDICAL')?.next_due ?? null
    const medClass = medCert?.name?.includes('1st') ? 1 : medCert?.name?.includes('2nd') ? 2 : medCert?.name?.includes('3rd') ? 3 : null

    // BFR
    const bfrExpiry = bfrCert?.expiry_date ?? currencies.get('FLIGHT_REVIEW')?.next_due ?? null

    // License & ratings
    const licenseName = licenseCert?.name ?? ''
    const ratings = (licenseCert?.ratings ?? '') + ' ' + (certRows.flatMap(c => c.ratings || '').join(' '))
    const hasInstrumentRating = /instrument/i.test(ratings)
    const licenseType = licenseName.includes('ATP') ? 'ATP' as const
      : licenseName.includes('CPL') ? 'CPL' as const
        : licenseName.includes('PPL') ? 'PPL' as const
          : 'Unknown' as const

    // Currency rules
    const night = currencies.get('NIGHT_CURRENCY')
    const ifrCurr = currencies.get('IFR_CURRENCY')
    const dayCurr = currencies.get('DAY_CURRENCY')

    return {
      hasInstrumentRating,
      licenseType,
      medicalClass: medClass,
      medicalExpiry: medExpiry,
      medicalExpired: medExpiry ? new Date(medExpiry) < new Date() : false,
      bfrCurrent: bfrExpiry ? new Date(bfrExpiry) > new Date() : false,
      bfrExpiry,
      ipcCurrent: ipcCert?.expiry_date ? new Date(ipcCert.expiry_date) > new Date() : false,
      nightCurrency: {
        completed: night?.completed ?? 0,
        required: night?.required ?? 3,
        current: (night?.completed ?? 0) >= (night?.required ?? 3),
      },
      ifrCurrency: {
        completed: ifrCurr?.completed ?? 0,
        required: ifrCurr?.required ?? 6,
        current: (ifrCurr?.completed ?? 0) >= (ifrCurr?.required ?? 6),
      },
      dayCurrency: {
        completed: dayCurr?.completed ?? 0,
        required: dayCurr?.required ?? 3,
        current: (dayCurr?.completed ?? 0) >= (dayCurr?.required ?? 3),
      },
    }
  } catch {
    return null
  }
}

// ── Sunset calculation (no API needed) ──

interface SunsetResult {
  sunrise: Date
  sunset: Date
  isNight: boolean
  civilTwilightEnd: Date
}

/**
 * Calculate sunrise/sunset using NOAA's solar position algorithm.
 * Simplified but accurate to ~2 minutes for aviation purposes.
 */
export function calculateSunset(lat: number, lon: number, date: Date): SunsetResult {
  const PI = Math.PI
  const rad = (deg: number) => (deg * PI) / 180
  const deg = (rad: number) => (rad * 180) / PI

  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  )

  const zenith = rad(90.833) // official sunset = 90.833°
  const civilZenith = rad(96) // civil twilight = 96°

  const lngHour = lon / 15
  const approxTime = dayOfYear + (6 - lngHour) / 24 // sunrise approximation
  const approxTimeSet = dayOfYear + (18 - lngHour) / 24 // sunset approximation

  function calcSun(approx: number, rising: boolean): Date | null {
    const meanAnomaly = rad(0.9856 * approx - 3.289)
    const sunCenter = rad(1.916 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly))
    const eclipticLon = meanAnomaly + sunCenter + rad(282.634) + rad(0.000047 * dayOfYear)
    const declination = rad(23.4393 * Math.sin(eclipticLon) - 0.0000004 * Math.sin(2 * eclipticLon + rad(0.513)))

    const hourAngle = Math.acos(
      (Math.cos(zenith) - Math.sin(rad(lat)) * Math.sin(declination)) /
      (Math.cos(rad(lat)) * Math.cos(declination))
    )

    const hourAngleCivil = Math.acos(
      (Math.cos(civilZenith) - Math.sin(rad(lat)) * Math.sin(declination)) /
      (Math.cos(rad(lat)) * Math.cos(declination))
    )

    const ra = Math.atan2(Math.cos(eclipticLon) * Math.cos(23.4393), Math.cos(eclipticLon))
    const raDeg = (deg(ra) + 360) % 360

    const utcTime = rising
      ? 360 - deg(hourAngle) - raDeg + 0.06571 * approx + 6.622
      : deg(hourAngle) + raDeg - 0.06571 * approx + 6.622

    const hours = (utcTime / 15 + lngHour + 12) % 24
    const result = new Date(date)
    result.setUTCHours(Math.floor(hours))
    result.setUTCMinutes(Math.floor((hours % 1) * 60))
    result.setUTCSeconds(0)

    return result
  }

  const sunrise = calcSun(approxTime, true) || new Date(date)
  const sunset = calcSun(approxTimeSet, false) || new Date(date)
  const civilTwilightEnd = new Date(sunset)
  civilTwilightEnd.setMinutes(civilTwilightEnd.getMinutes() + 30) // approximate civil twilight

  const now = date
  const isNight = now > civilTwilightEnd || now < sunrise

  // For civil twilight calculation
  function calcCivilTwilight(approx: number, rising: boolean): Date {
    const meanAnomaly = rad(0.9856 * approx - 3.289)
    const sunCenter = rad(1.916 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly))
    const eclipticLon = meanAnomaly + sunCenter + rad(282.634) + rad(0.000047 * dayOfYear)
    const declination = rad(23.4393 * Math.sin(eclipticLon) - 0.0000004 * Math.sin(2 * eclipticLon + rad(0.513)))

    const hourAngle = Math.acos(
      (Math.cos(civilZenith) - Math.sin(rad(lat)) * Math.sin(declination)) /
      (Math.cos(rad(lat)) * Math.cos(declination))
    )

    const ra = Math.atan2(Math.cos(eclipticLon) * Math.cos(23.4393), Math.cos(eclipticLon))
    const raDeg = (deg(ra) + 360) % 360

    const utcTime = rising
      ? 360 - deg(hourAngle) - raDeg + 0.06571 * approx + 6.622
      : deg(hourAngle) + raDeg - 0.06571 * approx + 6.622

    const hours = (utcTime / 15 + lngHour + 12) % 24
    const result = new Date(date)
    result.setUTCHours(Math.floor(hours))
    result.setUTCMinutes(Math.floor((hours % 1) * 60))
    result.setUTCSeconds(0)
    return result
  }

  const civEnd = calcCivilTwilight(approxTimeSet, false)
  const isNightCivil = now > civEnd || now < sunrise

  return {
    sunrise,
    sunset,
    isNight: isNightCivil,
    civilTwilightEnd: civEnd,
  }
}

// ── Temperature conversion ──

function cToF(c: number): number {
  return c * 9 / 5 + 32
}

// ── Freezing level estimation ──

/**
 * Estimate freezing level from surface temp and dewpoint.
 * Uses standard lapse rate of 2°C per 1000ft.
 */
export function estimateFreezingLevel(tempC: number, dewpointC?: number): number {
  const lapseRate = 2 // °C per 1000ft
  const freezingAlt = (tempC / lapseRate) * 1000
  return Math.round(freezingAlt / 100) * 100 // round to nearest 100
}

// ── Ceiling estimation from METAR ──

/**
 * Estimate ceiling from METAR sky condition.
 */
export function estimateCeiling(rawText?: string): number | undefined {
  if (!rawText) return undefined
  // Look for OVC, BKN, or -OVC patterns like "OVC008" or "BKN020"
  const match = rawText.match(/\b(OVC|BKN|-OVC)\s*(\d{3})/)
  if (match) {
    return parseInt(match[2]) * 100 // convert to feet (008 = 800ft)
  }
  return undefined // no ceiling (CLR/SKC/FEW/SCT)
}

// ── Main Rules Engine ──

export interface RulesInput {
  metar: MetarData | undefined
  pilotStatus: PilotCertStatus | null
  departureIcao: string
  departureTime: Date
  departureLat?: number
  departureLon?: number
  destinationMetar?: MetarData
  destinationIcao?: string
}

export interface RulesResult {
  warnings: WeatherWarning[]
  canFlyVfr: boolean
  overallStatus: 'ok' | 'caution' | 'warning'
}

/**
 * Evaluate all weather/cert rules and return warnings + status.
 * Pure function — no side effects, no async.
 */
export function evaluateWeatherRules(input: RulesInput): RulesResult {
  const warnings: WeatherWarning[] = []
  const { metar, pilotStatus, departureTime, departureLat, departureLon, destinationMetar } = input

  // ── 1. Night currency check ──
  if (pilotStatus && departureLat !== undefined && departureLon !== undefined) {
    const sunData = calculateSunset(departureLat, departureLon, departureTime)
    if (sunData.isNight && !pilotStatus.nightCurrency.current) {
      warnings.push({
        severity: 'warning',
        message: `Night currency needed — departure at ${departureTime.toLocaleTimeString()}, sunset was at ${sunData.sunset.toLocaleTimeString()}. You have ${pilotStatus.nightCurrency.completed} of ${pilotStatus.nightCurrency.required} night landings required.`,
        detail: 'FAR 61.57(b) requires 3 takeoffs and landings to a full stop at night in the preceding 90 days to carry passengers at night.',
        rule: 'night_currency',
      })
    }
  }

  // ── 2. IFR conditions check ──
  const depCeiling = metar?.ceilingFt ?? estimateCeiling(metar?.rawText)
  const depVis = metar?.visibilitySm
  const isIfrConditions = (depCeiling !== undefined && depCeiling < 1000) ||
    (depVis !== undefined && depVis < 3)

  if (isIfrConditions && pilotStatus) {
    if (!pilotStatus.hasInstrumentRating) {
      warnings.push({
        severity: 'warning',
        message: `IFR conditions at ${input.departureIcao} (ceiling ${depCeiling ?? '?'}ft, visibility ${depVis ?? '?'}SM) — you don't hold an instrument rating.`,
        detail: '14 CFR 91.155 requires VFR weather minimums. Below 1000ft ceiling or 3SM visibility requires IFR clearance and instrument rating.',
        rule: 'ifr_conditions',
      })
    } else if (!pilotStatus.ifrCurrency.current) {
      warnings.push({
        severity: 'caution',
        message: `IFR conditions detected but your instrument currency is not current (${pilotStatus.ifrCurrency.completed} of ${pilotStatus.ifrCurrency.required} approaches).`,
        detail: 'FAR 61.57(c) requires 6 instrument approaches, holding procedures, and intercepting/tracking courses in the preceding 6 months.',
        rule: 'ifr_currency',
      })
    }
  }

  // ── 3. Check destination too ──
  if (destinationMetar && pilotStatus) {
    const destCeiling = destinationMetar?.ceilingFt ?? estimateCeiling(destinationMetar?.rawText)
    const destVis = destinationMetar?.visibilitySm
    const destIfr = (destCeiling !== undefined && destCeiling < 1000) ||
      (destVis !== undefined && destVis < 3)

    if (destIfr && !pilotStatus.hasInstrumentRating) {
      warnings.push({
        severity: 'warning',
        message: `IFR conditions at destination ${input.destinationIcao} (ceiling ${destCeiling ?? '?'}ft, visibility ${destVis ?? '?'}SM) — instrument rating required.`,
        rule: 'ifr_destination',
      })
    }
  }

  // ── 4. VFR minimums check ──
  if (depCeiling !== undefined && depCeiling < 500) {
    warnings.push({
      severity: 'caution',
      message: `Very low ceiling (${depCeiling}ft AGL) at ${input.departureIcao}. Special VFR may be required for departure.`,
      rule: 'low_ceiling',
    })
  } else if (depCeiling !== undefined && depCeiling < 1000) {
    warnings.push({
      severity: 'info',
      message: `Marginal ceiling (${depCeiling}ft AGL) at ${input.departureIcao}. Monitor for possible IFR conditions.`,
      rule: 'marginal_ceiling',
    })
  }

  if (depVis !== undefined) {
    if (depVis < 1) {
      warnings.push({
        severity: 'caution',
        message: `Visibility ${depVis}SM — below basic VFR minimums. Flight not recommended without IFR clearance.`,
        rule: 'low_visibility',
      })
    } else if (depVis < 3) {
      warnings.push({
        severity: 'info',
        message: `Visibility ${depVis}SM — below standard VFR (3SM). Consider IFR or wait for improvement.`,
        rule: 'marginal_visibility',
      })
    }
  }

  // ── 5. Medical check ──
  if (pilotStatus) {
    if (pilotStatus.medicalExpired) {
      warnings.push({
        severity: 'warning',
        message: `Medical certificate expired${pilotStatus.medicalExpiry ? ` on ${new Date(pilotStatus.medicalExpiry).toLocaleDateString()}` : ''}. Flight is not permitted without a valid medical.`,
        rule: 'medical_expired',
      })
    } else if (pilotStatus.medicalExpiry) {
      const daysUntilExpiry = Math.ceil(
        (new Date(pilotStatus.medicalExpiry).getTime() - Date.now()) / 86400000
      )
      if (daysUntilExpiry <= 90 && daysUntilExpiry > 0) {
        warnings.push({
          severity: daysUntilExpiry <= 30 ? 'caution' : 'info',
          message: `Medical certificate expires in ${daysUntilExpiry} days${pilotStatus.medicalExpiry ? ` (${new Date(pilotStatus.medicalExpiry).toLocaleDateString()})` : ''}. Schedule your renewal.`,
          rule: 'medical_soon',
        })
      }
    }
  }

  // ── 6. BFR check ──
  if (pilotStatus && !pilotStatus.bfrCurrent && pilotStatus.bfrExpiry) {
    warnings.push({
      severity: 'warning',
      message: `Flight review (BFR) expired on ${new Date(pilotStatus.bfrExpiry).toLocaleDateString()}. You need a flight review to act as PIC.`,
      rule: 'bfr_expired',
    })
  }

  // ── 7. Icing potential ──
  if (metar?.tempC !== undefined && metar?.dewpointC !== undefined) {
    const spread = metar.tempC - metar.dewpointC
    if (metar.tempC <= 10 && metar.tempC >= -5 && spread <= 3) {
      const freezingAlt = estimateFreezingLevel(metar.tempC, metar.dewpointC)
      warnings.push({
        severity: 'caution',
        message: `Icing conditions possible — temp ${metar.tempC}°C, dewpoint spread ${spread}°C, estimated freezing level ${freezingAlt}ft MSL.`,
        detail: 'Structural icing possible when visible moisture and below-freezing temperatures exist. PIREPs advised.',
        rule: 'icing_potential',
      })
    }
  }

  // ── 8. Wind advisory ──
  if (metar?.windSpeedKts && metar.windSpeedKts >= 25) {
    warnings.push({
      severity: 'caution',
      message: `High winds (${metar.windSpeedKts}kt gusting ${metar.windGustKts ?? metar.windSpeedKts}kt) at ${input.departureIcao}. Exercise caution during takeoff and landing.`,
      rule: 'high_wind',
    })
  }

  // ── Determine overall status ──
  const hasWarnings = warnings.some((w) => w.severity === 'warning')
  const hasCautions = warnings.some((w) => w.severity === 'caution')

  const canFlyVfr = !warnings.some((w) =>
    w.severity === 'warning' && ['night_currency', 'medical_expired', 'bfr_expired', 'ifr_conditions'].includes(w.rule)
  )

  return {
    warnings,
    canFlyVfr,
    overallStatus: hasWarnings ? 'warning' : hasCautions ? 'caution' : 'ok',
  }
}
