/**
 * src/api/ai.js
 * AI API client for NeoMatCare.
 * All endpoints require authentication via the existing `api` axios instance.
 */
import { api } from './client'

export const aiApi = {
  /**
   * Extract danger signs and structure from a free-text triage note.
   * @param {string} note  - Raw triage note text
   * @param {string} [caseId] - Optional case UUID for context
   */
  triageExtract: (note, caseId = null) =>
    api.post('/api/ai/triage-extract/', { note, case_id: caseId }),

  /**
   * Get a plain-language narration of a patient's risk profile.
   * @param {string} patientId - Patient UUID
   */
  riskNarrate: (patientId) =>
    api.post('/api/ai/risk-narrate/', { patient_id: patientId }),

  /**
   * Detect anomalies in a patient's ANC visit series.
   * @param {string} patientId - Patient UUID
   */
  ancAnomaly: (patientId) =>
    api.post('/api/ai/anc-anomaly/', { patient_id: patientId }),

  /**
   * Draft a clinical handover brief for a referral or case.
   * @param {object} params - { referral_id } or { case_id }
   */
  referralHandover: (params) =>
    api.post('/api/ai/referral-handover/', params),

  /**
   * Recommend optimal transport vehicle for a case.
   * @param {string} caseId
   * @param {number} estimatedTravelMinutes
   * @param {Array}  vehicles - Available vehicles from transport API
   */
  transportRecommend: (caseId, estimatedTravelMinutes, vehicles) =>
    api.post('/api/ai/transport-recommend/', {
      case_id: caseId,
      estimated_travel_minutes: estimatedTravelMinutes,
      vehicles,
    }),

  /**
   * Send a chat message to the role-aware AI assistant.
   * @param {Array}  messages - [{role: 'user'|'assistant', content: string}]
   * @param {object} [context] - Optional page context {page, case_id, patient_id, ...}
   */
  chat: (messages, context = {}) =>
    api.post('/api/ai/chat/', { messages, context }),
}
