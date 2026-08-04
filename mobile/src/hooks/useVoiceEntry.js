/**
 * src/hooks/useVoiceEntry.js
 *
 * Drives ONE global, sequential dictation flow across an ordered list of
 * free-text fields on a form — replaces the old per-field DictateButton
 * pattern. Tap "Start Voice Entry" and the app starts listening on field 1
 * immediately; the user speaks, taps "Next field", it finalizes field 1 and
 * auto-starts listening on field 2, and so on until the last field, where
 * the same control reads "Done". No per-field taps required beyond that
 * single "Next" between fields (tap-to-advance, not auto-pause-detection —
 * deliberate, since auto-advance-on-silence risks cutting a health worker
 * off mid-sentence).
 *
 * Only pass free-text fields in. Dropdowns, multi-select, dates, and
 * number-only fields (blood group, danger signs, gestational age, vitals,
 * etc.) have no natural "dictate this" behavior and must stay manual —
 * getting that wrong on a field like danger signs is a patient-safety
 * mistake, not a cosmetic one, so this hook makes no attempt to fuzzy-match
 * speech onto those.
 *
 * @param {Array<{ key: string, label: string, get: () => string, set: (text: string) => void }>} fields
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { startListening, getVoiceLanguage } from '../services/voice';

export default function useVoiceEntry(fields) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [state, setState] = useState('idle'); // idle | listening | transcribing
  const [error, setError] = useState('');

  const stopRef = useRef(null);
  const indexRef = useRef(0);
  const advanceOnEndRef = useRef(false);
  const doAdvanceRef = useRef(() => {});

  useEffect(() => { indexRef.current = index; }, [index]);

  const startCapture = useCallback((fld) => {
    if (!fld) return;
    setError('');
    setState('listening');
    const lang = getVoiceLanguage();
    stopRef.current = startListening(lang, {
      onResult: (text) => {
        // Append rather than overwrite — re-capturing a field (or a second
        // sentence within it) adds on rather than clobbering what's there,
        // same contract as the old DictateButton.
        const prev = fld.get() || '';
        fld.set(prev ? `${prev} ${text}` : text);
      },
      onError: (err) => {
        setError(err.message);
        setState('idle');
        advanceOnEndRef.current = false;
      },
      onEnd: () => {
        setState('idle');
        if (advanceOnEndRef.current) {
          advanceOnEndRef.current = false;
          doAdvanceRef.current();
        }
      },
    });
  }, []);

  const doAdvance = useCallback(() => {
    const i = indexRef.current;
    if (i + 1 >= fields.length) {
      setActive(false);
      setState('idle');
      setIndex(0);
      indexRef.current = 0;
    } else {
      const ni = i + 1;
      indexRef.current = ni;
      setIndex(ni);
      startCapture(fields[ni]);
    }
  }, [fields, startCapture]);
  doAdvanceRef.current = doAdvance;

  /** Begin the flow: opens the bar and immediately starts listening on field 1. */
  const start = useCallback(() => {
    if (!fields.length) return;
    setActive(true);
    indexRef.current = 0;
    setIndex(0);
    setError('');
    startCapture(fields[0]);
  }, [fields, startCapture]);

  /** Manual mic tap — start/stop capture on the CURRENT field without advancing. */
  const toggleCapture = useCallback(() => {
    const fld = fields[indexRef.current];
    if (state === 'listening') {
      const lang = getVoiceLanguage();
      if (lang !== 'en') setState('transcribing');
      stopRef.current?.();
    } else if (state === 'idle') {
      startCapture(fld);
    }
  }, [state, fields, startCapture]);

  /** The one control between fields: finalize current capture (if any) and move on. */
  const next = useCallback(() => {
    if (state === 'listening') {
      advanceOnEndRef.current = true;
      const lang = getVoiceLanguage();
      if (lang !== 'en') setState('transcribing');
      stopRef.current?.();
    } else if (state === 'idle') {
      doAdvance();
    }
    // if 'transcribing', a result is already in flight — ignore extra taps
  }, [state, doAdvance]);

  /** Abandon the flow. Anything already captured into fields stays; only the
   *  in-flight (not yet finalized) recording, if any, is discarded. */
  const cancel = useCallback(() => {
    advanceOnEndRef.current = false;
    stopRef.current?.cancel?.();
    setActive(false);
    setState('idle');
    setIndex(0);
    indexRef.current = 0;
    setError('');
  }, []);

  return {
    active,
    field: fields[index] || null,
    index,
    total: fields.length,
    state,
    error,
    start,
    toggleCapture,
    next,
    cancel,
  };
}
