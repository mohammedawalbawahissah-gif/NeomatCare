import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { referralsApi, facilitiesApi, transportApi } from '@/api/client'
import { PageSpinner, StatusBadge, EmptyState, Alert, Modal, Spinner, FormField } from '@/components/ui'
import { ArrowRightLeft, ArrowLeft, Clock, CheckCircle, ChevronRight, Sparkles, Search, Phone } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import HandoverBriefPanel from '@/components/ai/HandoverBriefPanel'
import VoiceEntryBar, { VoiceEntryTrigger } from '@/components/voice/VoiceEntryBar'
import useVoiceEntry from '@/hooks/useVoiceEntry'
import ReadAloudTrigger from '@/components/voice/ReadAloudBar'
import useReadAloud from '@/hooks/useReadAloud'

// ── Referral List ─────────────────────────────────────────────────────────────
export function ReferralsPage() {
  const [referrals, setReferrals] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    referralsApi.list()
      .then(({ data }) => setReferrals(Array.isArray(data) ? data : data.results || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <PageSpinner />

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="section-title">Referrals</h1>
        <p className="text-slate-500 text-sm mt-1">{referrals.length} referral{referrals.length !== 1 ? 's' : ''}</p>
      </div>

      {referrals.length === 0 ? (
        <EmptyState icon={ArrowRightLeft} title="No referrals yet" description="Referrals are created from an emergency case" />
      ) : (
        <div className="card divide-y divide-slate-50">
          {referrals.map(r => (
            <Link key={r.id} to={`/app/referrals/${r.id}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                <ArrowRightLeft size={16} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {r.referring_facility_name} → {r.receiving_facility_name}
                </p>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <Clock size={10} /> {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} · {r.created_by_name}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={r.status} />
                <ChevronRight size={16} className="text-slate-300" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Create Referral Modal ─────────────────────────────────────────────────────
// Two selection modes:
//   "suggestion" — runs the AI engine, shows ranked facilities
//   "manual"     — lets the user pick any active facility from a dropdown
//
// Either way the same ReferralCreateSerializer payload is sent:
//   { emergency_case_id, receiving_facility_id, engine_recommendation_id?,
//     engine_version?, override_reason? }
export function CreateReferralModal({ open, onClose, emergencyCaseId, onCreated }) {
  // Step: 'select_mode' | 'suggestion' | 'manual' | 'confirm' | 'transport'
  const [step, setStep]                     = useState('select_mode')
  const [createdReferral, setCreatedReferral] = useState(null)
  const [suggestion, setSuggestion]         = useState(null)   // engine response
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError]     = useState('')

  const [allFacilities, setAllFacilities]   = useState([])
  const [facilitiesLoading, setFacilitiesLoading] = useState(false)
  const [facilitySearch, setFacilitySearch] = useState('')

  // The facility the clinician finally picks (either from suggestion or manual)
  const [selectedFacility, setSelectedFacility] = useState(null)
  const [overrideReason, setOverrideReason]     = useState('')
  const overrideVoiceFields = [{ key: 'override', label: 'Override Reason', get: () => overrideReason, set: setOverrideReason }]
  const overrideVoiceEntry = useVoiceEntry(overrideVoiceFields)

  const [saving, setSaving]   = useState(false)
  const [saveError, setSaveError] = useState('')

  // Transport step state
  const [vehicles, setVehicles]           = useState([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [transportNotes, setTransportNotes]   = useState('')
  const transportVoiceFields = [{ key: 'notes', label: 'Transport Notes', get: () => transportNotes, set: setTransportNotes }]
  const transportVoiceEntry = useVoiceEntry(transportVoiceFields)
  const [transportSaving, setTransportSaving] = useState(false)
  const [transportError, setTransportError]   = useState('')

  // Reset when modal opens/closes
  useEffect(() => {
    if (!open) {
      setStep('select_mode')
      setSuggestion(null)
      setSuggestError('')
      setSelectedFacility(null)
      setOverrideReason('')
      setSaveError('')
      setFacilitySearch('')
      setCreatedReferral(null)
      setVehicles([])
      setSelectedVehicle(null)
      setTransportNotes('')
      setTransportError('')
    }
  }, [open])

  // ── Engine suggestion flow ──────────────────────────────────────────────────
  const runSuggestion = async () => {
    setSuggestLoading(true)
    setSuggestError('')
    try {
      const { data } = await referralsApi.suggest(emergencyCaseId)
      setSuggestion(data)
      setStep('suggestion')
      // Pre-select the top recommendation if one exists
      if (data.recommended_facility) {
        setSelectedFacility({
          id:   data.recommended_facility.id,
          name: data.recommended_facility.name,
          isRecommended: true,
        })
      }
    } catch (err) {
      setSuggestError('Could not fetch AI suggestions. You can still select a facility manually.')
      setStep('suggestion') // show the empty state with manual fallback
    } finally {
      setSuggestLoading(false)
    }
  }

  // ── Manual facility fetch ───────────────────────────────────────────────────
  const loadFacilities = async () => {
    if (allFacilities.length > 0) { setStep('manual'); return }
    setFacilitiesLoading(true)
    try {
      const { data } = await facilitiesApi.list()
      setAllFacilities(Array.isArray(data) ? data : data.results || [])
    } catch {
      // still navigate to manual step — empty list shows a message
    } finally {
      setFacilitiesLoading(false)
      setStep('manual')
    }
  }

  // ── Determine if override reason is needed ──────────────────────────────────
  const engineRecId  = suggestion?.recommended_facility?.id
  const isOverride   = engineRecId && selectedFacility?.id && selectedFacility.id !== engineRecId
  const needsOverride = isOverride && !overrideReason.trim()

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedFacility) return
    setSaving(true)
    setSaveError('')
    try {
      const payload = {
        emergency_case_id:     emergencyCaseId,
        receiving_facility_id: selectedFacility.id,
        ...(suggestion?.engine_version && { engine_version: suggestion.engine_version }),
        ...(engineRecId               && { engine_recommendation_id: engineRecId }),
        ...(isOverride                && { override_reason: overrideReason }),
      }
      const { data } = await referralsApi.create(payload)
      setCreatedReferral(data)
      // Load available vehicles and move to transport step
      setVehiclesLoading(true)
      setStep('transport')
      transportApi.vehicles.available()
        .then(({ data: v }) => setVehicles(Array.isArray(v) ? v : v.results || []))
        .catch(() => setVehicles([]))
        .finally(() => setVehiclesLoading(false))
    } catch (err) {
      const d = err?.response?.data
      setSaveError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to create referral.')
    } finally {
      setSaving(false)
    }
  }

  const handleTransportSubmit = async () => {
    if (!selectedVehicle || !createdReferral) return
    setTransportSaving(true)
    setTransportError('')
    try {
      await transportApi.requests.create({
        vehicle:  selectedVehicle.id,
        referral: createdReferral.id,
        ...(transportNotes && { notes: transportNotes }),
      })
      onCreated(createdReferral)
      onClose()
    } catch (err) {
      const d = err?.response?.data
      setTransportError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to assign transport.')
    } finally {
      setTransportSaving(false)
    }
  }

  const handleSkipTransport = () => {
    onCreated(createdReferral)
    onClose()
  }

  const filteredFacilities = allFacilities.filter(f =>
    f.name?.toLowerCase().includes(facilitySearch.toLowerCase()) ||
    f.level_display?.toLowerCase().includes(facilitySearch.toLowerCase())
  )

  if (!open) return null

  // ── Shared confirm footer ───────────────────────────────────────────────────
  const ConfirmSection = () => (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      {selectedFacility && (
        <div className="bg-brand-50 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-400 mb-0.5">Selected facility</p>
          <p className="text-sm font-semibold text-brand-700">{selectedFacility.name}</p>
          {isOverride && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
              ⚠ Overriding engine recommendation — please provide a reason below
            </p>
          )}
        </div>
      )}

      {isOverride && (
        <FormField label="Override Reason" required>
          <VoiceEntryTrigger onClick={overrideVoiceEntry.start} count={overrideVoiceFields.length} className="mb-2" />
          <textarea
            rows={2}
            value={overrideReason}
            onChange={e => setOverrideReason(e.target.value)}
            className="input-field resize-none"
            placeholder="Why are you selecting a different facility than recommended?"
          />
          <VoiceEntryBar voiceEntry={overrideVoiceEntry} />
        </FormField>
      )}

      {saveError && <Alert type="error" message={saveError} />}

      <div className="flex gap-3">
        <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
        <button
          onClick={handleSubmit}
          disabled={!selectedFacility || needsOverride || saving}
          className="btn-primary flex-1 justify-center"
        >
          {saving ? <Spinner size={16} className="text-white" /> : 'Create Referral'}
        </button>
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={step === 'transport' ? 'Assign Transport' : 'Create Referral'}>
      <div className="space-y-4">

        {/* ── Step: select_mode ─────────────────────────────────────────── */}
        {step === 'select_mode' && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">How would you like to select the receiving facility?</p>

            <button
              onClick={runSuggestion}
              disabled={suggestLoading}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-brand-200 bg-brand-50 hover:bg-brand-100 transition-colors text-left"
            >
              <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
                {suggestLoading
                  ? <Spinner size={16} className="text-white" />
                  : <Sparkles size={16} className="text-white" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-800">AI Facility Suggestion</p>
                <p className="text-xs text-brand-600 mt-0.5">
                  Let the engine rank facilities by danger signs, capacity, and distance
                </p>
              </div>
            </button>

            <button
              onClick={loadFacilities}
              disabled={facilitiesLoading}
              className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200 hover:bg-slate-50 transition-colors text-left"
            >
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                {facilitiesLoading
                  ? <Spinner size={16} className="text-slate-500" />
                  : <Search size={16} className="text-slate-500" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Manual Selection</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Browse and select a facility from the full list
                </p>
              </div>
            </button>
          </div>
        )}

        {/* ── Step: suggestion ──────────────────────────────────────────── */}
        {step === 'suggestion' && (
          <div className="space-y-4">
            {suggestError && <Alert type="warning" message={suggestError} />}

            {!suggestError && suggestion && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    AI Recommendations
                  </p>
                  <span className="text-xs text-slate-400">
                    {suggestion.total_ranked_facilities} facilit{suggestion.total_ranked_facilities === 1 ? 'y' : 'ies'} ranked
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {/* Top recommendation */}
                  {suggestion.recommended_facility && (() => {
                    const f = suggestion.recommended_facility
                    const isSelected = selectedFacility?.id === f.id
                    return (
                      <button key={f.id} onClick={() => setSelectedFacility({ id: f.id, name: f.name, isRecommended: true })}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}>
                        <div className="w-8 h-8 bg-brand-100 rounded-lg flex items-center justify-center shrink-0">
                          <Sparkles size={14} className="text-brand-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 truncate">{f.name}</p>
                          <p className="text-xs text-slate-400 capitalize">{f.level_display || f.level} · {f.distance_km ? `${f.distance_km} km` : 'distance unknown'}</p>
                        </div>
                        <span className="text-xs font-semibold text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full shrink-0">Top Pick</span>
                      </button>
                    )
                  })()}

                  {/* Alternatives */}
                  {(suggestion.alternatives || []).map(f => {
                    const isSelected = selectedFacility?.id === f.id
                    return (
                      <button key={f.id} onClick={() => setSelectedFacility({ id: f.id, name: f.name })}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                        <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                          <ArrowRightLeft size={13} className="text-slate-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                          <p className="text-xs text-slate-400 capitalize">{f.level_display || f.level} · {f.distance_km ? `${f.distance_km} km` : 'distance unknown'}</p>
                        </div>
                      </button>
                    )
                  })}

                  {!suggestion.recommended_facility && (
                    <p className="text-sm text-slate-400 text-center py-6">No facilities ranked by the engine.</p>
                  )}
                </div>
              </>
            )}

            {/* Always offer manual fallback */}
            <button
              onClick={loadFacilities}
              className="w-full text-xs text-brand-600 hover:text-brand-700 font-medium py-1 text-center flex items-center justify-center gap-1"
            >
              <Search size={12} /> Select a different facility manually
            </button>

            <ConfirmSection />
          </div>
        )}

        {/* ── Step: manual ──────────────────────────────────────────────── */}
        {step === 'manual' && (
          <div className="space-y-4">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={facilitySearch}
                onChange={e => setFacilitySearch(e.target.value)}
                className="input-field pl-8"
                placeholder="Search facilities by name or level…"
                autoFocus
              />
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {facilitiesLoading && (
                <div className="flex justify-center py-6"><Spinner size={20} className="text-brand-500" /></div>
              )}
              {!facilitiesLoading && filteredFacilities.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">No facilities found.</p>
              )}
              {!facilitiesLoading && filteredFacilities.map(f => {
                const isSelected = selectedFacility?.id === f.id
                return (
                  <button key={f.id} onClick={() => setSelectedFacility({ id: f.id, name: f.name })}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                      <ArrowRightLeft size={13} className="text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{f.level_display || 'Facility'}</p>
                    </div>
                    {isSelected && <CheckCircle size={16} className="text-brand-500 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Let them go back to try AI suggestion */}
            <button
              onClick={() => { setStep('select_mode'); setSuggestion(null) }}
              className="w-full text-xs text-brand-600 hover:text-brand-700 font-medium py-1 text-center flex items-center justify-center gap-1"
            >
              <Sparkles size={12} /> Try AI suggestion instead
            </button>

            <ConfirmSection />
          </div>
        )}

        {/* ── Step: transport ───────────────────────────────────────────── */}
        {step === 'transport' && (
          <div className="space-y-4">
            <div className="bg-brand-50 rounded-lg px-4 py-3 flex items-center gap-2">
              <CheckCircle size={16} className="text-brand-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-brand-700">Referral created successfully</p>
                <p className="text-xs text-brand-500">{selectedFacility?.name}</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">Assign a vehicle</p>
              <p className="text-xs text-slate-400 mb-3">Select an available vehicle to transport the patient</p>

              {vehiclesLoading && (
                <div className="flex justify-center py-6"><Spinner size={20} className="text-brand-500" /></div>
              )}

              {!vehiclesLoading && vehicles.length === 0 && (
                <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-sm text-slate-500 font-medium">No vehicles available</p>
                  <p className="text-xs text-slate-400 mt-1">You can assign transport later from the referral detail</p>
                </div>
              )}

              {!vehiclesLoading && vehicles.length > 0 && (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {vehicles.map(v => {
                    const isSelected = selectedVehicle?.id === v.id
                    const icon = { ambulance: '🚑', car: '🚗', motorcycle: '🏍️', tricycle: '🛺', truck: '🚛', other: '🚐' }[v.vehicle_type] || '🚗'
                    return (
                      <button key={v.id} onClick={() => setSelectedVehicle(v)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                        <span className="text-xl shrink-0">{icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800">{v.registration}</p>
                          <p className="text-xs text-slate-400 capitalize">
                            {v.vehicle_type?.replace(/_/g, ' ')}
                            {v.make ? ` · ${v.make}` : ''}
                            {v.model ? ` ${v.model}` : ''}
                            {v.driver_name ? ` · 👤 ${v.driver_name}` : ''}
                          </p>
                        </div>
                        {isSelected && <CheckCircle size={16} className="text-brand-500 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedVehicle && (
              <div className="space-y-3">
                {/* Driver contact card */}
                {selectedVehicle.driver_name && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assigned Driver</p>
                      <p style={{ margin: '2px 0 0', fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>👤 {selectedVehicle.driver_name}</p>
                      {selectedVehicle.driver_phone && (
                        <p style={{ margin: '1px 0 0', fontSize: '0.78rem', color: '#475569' }}>{selectedVehicle.driver_phone}</p>
                      )}
                    </div>
                    {selectedVehicle.driver_phone && (
                      <a href={'tel:' + selectedVehicle.driver_phone}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#207652', color: 'white', borderRadius: '8px', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        <Phone size={14} /> Call Driver
                      </a>
                    )}
                    {!selectedVehicle.driver_phone && (
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>No phone on record</span>
                    )}
                  </div>
                )}
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
                  <VoiceEntryTrigger onClick={transportVoiceEntry.start} count={transportVoiceFields.length} className="mb-2" />
                  <textarea rows={2} value={transportNotes} onChange={e => setTransportNotes(e.target.value)}
                    className="input-field resize-none" placeholder="Any notes for the driver..." />
                  <VoiceEntryBar voiceEntry={transportVoiceEntry} />
                </div>
              </div>
            )}

            {transportError && <Alert type="error" message={transportError} />}

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button onClick={handleSkipTransport} className="btn-secondary flex-1 justify-center">
                Skip for now
              </button>
              <button onClick={handleTransportSubmit}
                disabled={!selectedVehicle || transportSaving}
                className="btn-primary flex-1 justify-center">
                {transportSaving ? <Spinner size={16} className="text-white" /> : 'Assign & Finish'}
              </button>
            </div>
          </div>
        )}

      </div>
    </Modal>
  )
}

function StatusModal({ open, onClose, referral, onUpdated }) {
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const voiceFields = [{ key: 'note', label: 'Note', get: () => note, set: setNote }]
  const voiceEntry = useVoiceEntry(voiceFields)

  const validNext = referral?.valid_next_statuses || []

  const STATUS_LABELS = {
    PENDING:'Mark Pending', ACCEPTED:'Accept', IN_TRANSIT:'Mark In Transit',
    RECEIVED:'Mark Received', COMPLETED:'Complete', CANCELLED:'Cancel', FAILED:'Mark Failed',
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await referralsApi.updateStatus(referral.id, newStatus, note)
      onUpdated(data)
      onClose()
    } catch (err) {
      const d = err.response?.data
      setError(typeof d === 'object' ? Object.values(d).flat().join(' ') : 'Failed to update status.')
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Update Referral Status">
      <Alert type="error" message={error} className="mb-4" />
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="New Status" required>
          <select required value={newStatus} onChange={e => setNewStatus(e.target.value)} className="input-field">
            <option value="">— Select —</option>
            {validNext.map(s => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
          </select>
        </FormField>
        <FormField label="Note">
          <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} className="mb-2" />
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            className="input-field resize-none" placeholder="Optional note about this transition..." />
        </FormField>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" disabled={!newStatus || saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={16} className="text-white" /> : 'Update'}
          </button>
        </div>
      </form>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}

// ── Outcome Modal ─────────────────────────────────────────────────────────────
function OutcomeModal({ open, onClose, referral, onUpdated }) {
  const [form, setForm]     = useState({ maternal_outcome:'unknown', neonatal_outcome:'unknown', outcome_notes:'' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const voiceFields = [{ key: 'outcome_notes', label: 'Outcome Notes', get: () => form.outcome_notes, set: (v) => setForm(f => ({ ...f, outcome_notes: v })) }]
  const voiceEntry = useVoiceEntry(voiceFields)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { data } = await referralsApi.outcome(referral.id, form)
      onUpdated(data)
      onClose()
    } catch { setError('Failed to save outcome.') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record Outcome">
      <Alert type="error" message={error} className="mb-4" />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Maternal Outcome" required>
            <select value={form.maternal_outcome} onChange={e => setForm(f=>({...f,maternal_outcome:e.target.value}))} className="input-field">
              <option value="unknown">Unknown</option>
              <option value="survived">Survived</option>
              <option value="died">Died</option>
            </select>
          </FormField>
          <FormField label="Neonatal Outcome" required>
            <select value={form.neonatal_outcome} onChange={e => setForm(f=>({...f,neonatal_outcome:e.target.value}))} className="input-field">
              <option value="unknown">Unknown</option>
              <option value="survived">Survived</option>
              <option value="died">Died</option>
            </select>
          </FormField>
        </div>
        <FormField label="Outcome Notes">
          <VoiceEntryTrigger onClick={voiceEntry.start} count={voiceFields.length} className="mb-2" />
          <textarea rows={2} value={form.outcome_notes} onChange={e => setForm(f=>({...f,outcome_notes:e.target.value}))}
            className="input-field resize-none" placeholder="Additional notes..." />
        </FormField>
        <div className="flex gap-3 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
            {saving ? <Spinner size={16} className="text-white" /> : 'Save Outcome'}
          </button>
        </div>
      </form>
      <VoiceEntryBar voiceEntry={voiceEntry} />
    </Modal>
  )
}

// ── Referral Detail ───────────────────────────────────────────────────────────
export function ReferralDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [referral, setReferral]         = useState(null)
  const [loading, setLoading]           = useState(true)
  const [statusModal, setStatusModal]   = useState(false)
  const [outcomeModal, setOutcomeModal] = useState(false)

  useEffect(() => {
    referralsApi.detail(id)
      .then(({ data }) => setReferral(data))
      .finally(() => setLoading(false))
  }, [id])

  // Hooks must run unconditionally on every render, so this is computed
  // before the loading/not-found early-returns below, using a safe fallback.
  const rSafe = referral || {}
  const [handoverSpeakable, setHandoverSpeakable] = useState(null)
  const readAloudItems = [
    { label: 'Route', text: `From ${rSafe.referring_facility_name || 'unknown'} to ${rSafe.receiving_facility_name || 'unknown'}` },
    ...(rSafe.override_reason ? [{ label: 'Override reason', text: rSafe.override_reason }] : []),
    ...((rSafe.maternal_outcome && rSafe.maternal_outcome !== 'unknown') || (rSafe.neonatal_outcome && rSafe.neonatal_outcome !== 'unknown') ? [{ label: 'Outcomes', text: `Maternal: ${rSafe.maternal_outcome}, Neonatal: ${rSafe.neonatal_outcome}` }] : []),
    ...(rSafe.outcome_notes ? [{ label: 'Outcome notes', text: rSafe.outcome_notes }] : []),
    ...(handoverSpeakable ? [{ label: 'AI handover brief', text: handoverSpeakable }] : []),
  ]
  const readAloud = useReadAloud(readAloudItems)

  if (loading) return <PageSpinner />
  if (!referral) return <div className="p-6"><Alert type="error" message="Referral not found." /></div>

  const r = referral
  const canUpdateStatus  = r.valid_next_statuses?.length > 0
  const canRecordOutcome = ['RECEIVED','COMPLETED'].includes(r.status)

  const OUTCOME_COLOR = { survived:'text-brand-600', died:'text-danger-600', unknown:'text-slate-400' }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <h1 className="section-title">Referral</h1>
          <p className="text-xs text-slate-400 font-mono">{r.id}</p>
        </div>
        <StatusBadge status={r.status} />
      </div>

      <ReadAloudTrigger readAloud={readAloud} />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          {/* Route */}
          <div className="card px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Referral Route</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-center bg-slate-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-400 mb-0.5">From</p>
                <p className="text-sm font-semibold text-slate-800">{r.referring_facility_name}</p>
              </div>
              <ArrowRightLeft size={18} className="text-slate-300 shrink-0" />
              <div className="flex-1 text-center bg-brand-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-400 mb-0.5">To</p>
                <p className="text-sm font-semibold text-slate-800">{r.receiving_facility_name}</p>
              </div>
            </div>
            {r.engine_recommendation_name && (
              <p className="text-xs text-slate-400 mt-3 text-center">
                Engine recommended: <span className="font-medium text-brand-600">{r.engine_recommendation_name}</span>
                {r.override_reason && <span> · Override: "{r.override_reason}"</span>}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className="card px-5 py-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Timeline</p>
            <div className="space-y-3">
              {(r.timeline || []).map(t => (
                <div key={t.id} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand-50 border-2 border-brand-200 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle size={12} className="text-brand-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {t.from_status ? `${t.from_status} → ${t.to_status}` : t.to_status}
                    </p>
                    {t.note && <p className="text-xs text-slate-500">{t.note}</p>}
                    <p className="text-xs text-slate-400">
                      {t.changed_by_name} · {format(new Date(t.timestamp), 'dd MMM, HH:mm')}
                    </p>
                  </div>
                </div>
              ))}
              {!r.timeline?.length && <p className="text-sm text-slate-400 text-center py-4">No timeline entries yet.</p>}
            </div>
          </div>

          {/* Outcomes */}
          {(r.maternal_outcome !== 'unknown' || r.neonatal_outcome !== 'unknown') && (
            <div className="card px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Outcomes</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-xs text-slate-400 mb-0.5">Maternal</p>
                  <p className={`text-sm font-semibold capitalize ${OUTCOME_COLOR[r.maternal_outcome]}`}>{r.maternal_outcome}</p>
                </div>
                <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-center">
                  <p className="text-xs text-slate-400 mb-0.5">Neonatal</p>
                  <p className={`text-sm font-semibold capitalize ${OUTCOME_COLOR[r.neonatal_outcome]}`}>{r.neonatal_outcome}</p>
                </div>
              </div>
              {r.outcome_notes && <p className="text-xs text-slate-500 mt-2">{r.outcome_notes}</p>}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* AI Handover Brief */}
          <HandoverBriefPanel referralId={r.id} onSpeakableText={setHandoverSpeakable} />

          <div className="card px-5 py-4 space-y-3">
            <div><p className="text-xs text-slate-400">Created by</p><p className="text-sm font-medium text-slate-800">{r.created_by_name}</p></div>
            <div><p className="text-xs text-slate-400">Created</p><p className="text-sm font-medium text-slate-800">{format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}</p></div>
            <div><p className="text-xs text-slate-400">Updated</p><p className="text-sm font-medium text-slate-800">{formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}</p></div>
            {r.emergency_case_id && (
              <div>
                <p className="text-xs text-slate-400">Case</p>
                <Link to={`/app/cases/${r.emergency_case_id}`} className="text-sm font-medium text-brand-600 hover:underline">View Case</Link>
              </div>
            )}
          </div>
          <div className="space-y-2">
            {canUpdateStatus  && <button onClick={() => setStatusModal(true)}  className="btn-primary w-full justify-center">Update Status</button>}
            {canRecordOutcome && <button onClick={() => setOutcomeModal(true)} className="btn-secondary w-full justify-center">Record Outcome</button>}
          </div>
        </div>
      </div>

      <StatusModal  open={statusModal}  onClose={() => setStatusModal(false)}  referral={r} onUpdated={setReferral} />
      <OutcomeModal open={outcomeModal} onClose={() => setOutcomeModal(false)} referral={r} onUpdated={setReferral} />
    </div>
  )
}
