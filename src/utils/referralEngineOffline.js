/**
 * utils/referralEngineOffline.js
 * --------------------------------
 * A faithful JavaScript port of the backend's referral_engine.py scoring
 * logic — distance, capability match, and bonus scoring — so a real,
 * ranked facility recommendation can still be computed entirely on-device
 * when the server can't be reached, instead of only offering an unranked
 * manual pick from the cached facility list.
 *
 * This is intentionally a PORT, not a reimplementation: the constants
 * (REQUIREMENTS), formulas (haversine, capability_score, bonus, distance
 * penalty, confidence thresholds), and output shape are kept in lockstep
 * with referral_engine.py so a health worker sees materially the same
 * recommendation whether it was computed on the server or on their device.
 * If referral_engine.py's scoring ever changes, this file needs the same
 * change — see the "keep in sync" note above each constant below.
 *
 * Output is shaped to match apps/referrals/views.py's ReferralSuggestView
 * "recommended_facility" / "alternatives" dicts, so ReferralPanel's
 * existing rendering code works unchanged regardless of whether the data
 * came from the server or from here.
 */

// Keep in sync with referral_engine.py REQUIREMENTS.
const REQUIREMENTS = {
  PPH:                  { services: ['BLOOD_BANK', 'SURGERY', 'ICU'], minLevel: 3 },
  APH:                  { services: ['BLOOD_BANK', 'SURGERY'],        minLevel: 2 },
  RUPTURED_UTERUS:      { services: ['SURGERY', 'ICU', 'BLOOD_BANK'], minLevel: 3 },
  ECLAMPSIA:            { services: ['ICU', 'OBSTETRICS'],            minLevel: 2 },
  SEVERE_PRE_ECLAMPSIA: { services: ['ICU', 'OBSTETRICS'],            minLevel: 2 },
  OBSTRUCTED_LABOUR:    { services: ['SURGERY', 'OBSTETRICS'],        minLevel: 2 },
  CORD_PROLAPSE:        { services: ['SURGERY', 'OBSTETRICS'],        minLevel: 2 },
  PUERPERAL_SEPSIS:     { services: ['ICU', 'OBSTETRICS'],            minLevel: 2 },
  CHORIOAMNIONITIS:     { services: ['OBSTETRICS', 'SURGERY'],        minLevel: 2 },
  NEONATAL_DISTRESS:    { services: ['NICU'],                         minLevel: 2 },
  PRETERM_LABOUR:       { services: ['NICU', 'OBSTETRICS'],           minLevel: 2 },
  NEONATAL_SEPSIS:      { services: ['NICU'],                         minLevel: 2 },
  SEVERE_ANAEMIA:       { services: ['BLOOD_BANK'],                   minLevel: 2 },
  MALPRESENTATION:      { services: ['SURGERY', 'OBSTETRICS'],        minLevel: 2 },
}

const AVG_SPEED_KMH = 60.0
const SEARCH_RADIUS_KM = 300.0
const ENGINE_VERSION = '1.0.0' // keep in sync with referral_engine.py EngineResult default

// Keep in sync with referral_engine.py haversine_km.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371.0
  const toRad = (d) => (d * Math.PI) / 180
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dphi = toRad(lat2 - lat1)
  const dlambda = toRad(lng2 - lng1)
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Keep in sync with referral_engine.py _parse_requirements.
function parseRequirements(dangerSigns) {
  const required = new Set()
  let minLevel = 1
  for (const sign of dangerSigns || []) {
    const req = REQUIREMENTS[sign]
    if (!req) continue
    req.services.forEach((s) => required.add(s))
    minLevel = Math.max(minLevel, req.minLevel)
  }
  return { required, minLevel }
}

// Keep in sync with referral_engine.py _implicit_services.
function implicitServices(f) {
  const services = new Set(f.available_services || [])
  if (f.theatre_available) services.add('SURGERY')
  if (f.blood_bank) services.add('BLOOD_BANK')
  if ((f.icu_beds_available || 0) > 0) services.add('ICU')
  if ((f.nicu_cots_available || 0) > 0) services.add('NICU')
  return services
}

function setIntersect(a, b) {
  return new Set([...a].filter((x) => b.has(x)))
}
function setDiff(a, b) {
  return new Set([...a].filter((x) => !b.has(x)))
}

/**
 * caseInfo: { dangerSigns: string[], referringLat: number, referringLng: number }
 * facilities: array shaped like FacilityListSerializer output (id, name,
 *   level, level_display, phone, latitude, longitude, available_services,
 *   icu_beds_available, nicu_cots_available, theatre_available,
 *   blood_bank, on_call_specialist) — i.e. exactly what facilitiesApi.list()
 *   / the offline facility cache already returns, no transformation needed.
 * topN: how many ranked results to return (default 3, matching the server).
 *
 * Returns { recommendedFacility, alternatives, confidence, requiredServices,
 *   engineVersion, totalRankedFacilities } — recommendedFacility/
 *   alternatives are shaped to drop straight into ReferralPanel's existing
 *   card rendering (same keys as the server's recommended_facility/
 *   alternatives dicts, with ai_rationale always null since this is never
 *   AI-assisted).
 */
export function scoreFacilitiesOffline(caseInfo, facilities, topN = 3) {
  const { required, minLevel } = parseRequirements(caseInfo.dangerSigns)
  const scored = []

  for (const f of facilities) {
    const dist = haversineKm(caseInfo.referringLat, caseInfo.referringLng, f.latitude, f.longitude)
    if (dist > SEARCH_RADIUS_KM) continue

    const reasons = []
    const services = implicitServices(f)
    let capabilityScore

    if (f.level < minLevel) {
      capabilityScore = 0.0
      reasons.push(`LEVEL_INSUFFICIENT_${f.level}_REQUIRED_${minLevel}`)
    } else if (required.size > 0) {
      const matched = setIntersect(required, services)
      const missing = setDiff(required, services)
      capabilityScore = matched.size / required.size
      if (matched.size > 0) reasons.push(`HAS_${matched.size}_OF_${required.size}_REQUIRED_SERVICES`)
      if (missing.size > 0) reasons.push(`MISSING_${[...missing].sort().join('_')}`)
    } else {
      capabilityScore = 1.0
    }

    let bonus = 0.0
    if (f.theatre_available) { bonus += 10; reasons.push('THEATRE_AVAILABLE') }
    if (f.blood_bank && required.has('BLOOD_BANK')) { bonus += 10; reasons.push('BLOOD_BANK_AVAILABLE') }
    if ((f.icu_beds_available || 0) > 0 && required.has('ICU')) { bonus += 10; reasons.push(`ICU_BEDS_${f.icu_beds_available}`) }
    if ((f.nicu_cots_available || 0) > 0 && required.has('NICU')) { bonus += 10; reasons.push(`NICU_COTS_${f.nicu_cots_available}`) }
    if (f.on_call_specialist) { bonus += 5; reasons.push('SPECIALIST_ON_CALL') }

    const distancePenalty = Math.min(dist / 10, 20)
    const score = Math.round(((capabilityScore * 50) + bonus + (f.level * 2) - distancePenalty) * 100) / 100
    const travelMinutes = Math.round(((dist / AVG_SPEED_KMH) * 60) * 10) / 10

    let confidence
    if (capabilityScore === 1.0 && score >= 60) confidence = 'HIGH'
    else if (capabilityScore >= 0.5 && score >= 40) confidence = 'MEDIUM'
    else confidence = 'LOW'

    scored.push({
      facility: f,
      score,
      capabilityScore: Math.round(capabilityScore * 10000) / 10000,
      distanceKm: Math.round(dist * 100) / 100,
      estimatedTravelMinutes: travelMinutes,
      reasonCodes: reasons,
      confidence,
    })
  }

  scored.sort((a, b) => b.score - a.score)
  // suggestion_to_dict() on the server filters out zero-capability
  // facilities before returning — match that here too.
  const visible = scored.filter((s) => s.capabilityScore > 0.0)
  const top = visible.slice(0, topN)

  const toFacilityDict = (s, rank) => ({
    id: s.facility.id,
    name: s.facility.name,
    level: s.facility.level,
    level_display: s.facility.level_display || '',
    phone: s.facility.phone || '',
    score: s.score,
    capability_score: s.capabilityScore,
    distance_km: s.distanceKm,
    estimated_travel_minutes: s.estimatedTravelMinutes,
    confidence: s.confidence,
    reason_codes: s.reasonCodes,
    ai_rationale: null,
    rank,
  })

  const ranked = top.map((s, i) => toFacilityDict(s, i + 1))
  const overallConfidence = ranked.length > 0 ? ranked[0].confidence : 'LOW'

  return {
    recommendedFacility: ranked[0] || null,
    alternatives: ranked.slice(1),
    confidence: overallConfidence,
    requiredServices: [...required].sort(),
    engineVersion: ENGINE_VERSION,
    totalRankedFacilities: visible.length,
  }
}
