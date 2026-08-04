/**
 * src/hooks/useReadAloud.js
 *
 * Drives ONE global "Read Aloud" control per screen — replaces the old
 * pattern of a SpeakButton next to individual fields. Tap it once and the
 * screen is read top-to-bottom in display order: labels are skipped, only
 * values/content are spoken (e.g. "fever and reduced fetal movement", not
 * "Presenting Complaint label field value fever..."). Purely decorative UI
 * (icons, dividers, empty/unset optional fields) never gets passed in here
 * in the first place — callers build `items` from only the content worth
 * hearing. AI-generated panels (risk narration, handover briefs, etc.) are
 * read in full since that's diagnostic content, not filler.
 *
 * @param {Array<{ label?: string, text: string }>} items - already filtered to non-empty content
 */
import { useState, useRef, useCallback } from 'react';
import { speak, stopSpeaking, getVoiceLanguage } from '../services/voice';

export default function useReadAloud(items) {
  const [state, setState] = useState('idle'); // idle | playing
  const [index, setIndex] = useState(-1);
  const cancelledRef = useRef(false);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    stopSpeaking();
    setState('idle');
    setIndex(-1);
  }, []);

  const playAll = useCallback(async () => {
    if (!items.length) return;
    cancelledRef.current = false;
    setState('playing');
    const lang = getVoiceLanguage();
    for (let i = 0; i < items.length; i++) {
      if (cancelledRef.current) break;
      setIndex(i);
      const item = items[i];
      const spoken = item.label ? `${item.label}. ${item.text}` : item.text;
      try {
        await speak(spoken, lang);
      } catch {
        // one item failing to play shouldn't stop the rest of the screen
      }
    }
    if (!cancelledRef.current) {
      setState('idle');
      setIndex(-1);
    }
  }, [items]);

  return { state, index, currentLabel: items[index]?.label || null, playAll, stop };
}
