import { useState } from 'react'
import { Volume2, Loader2, VolumeX } from 'lucide-react'
import { speak, stopSpeaking, getVoiceLanguage, LANGUAGES } from '../../services/voice'

/** Drop next to any block of text a person might want read aloud. */
export default function SpeakButton({ text, className = '' }) {
  const [state, setState] = useState('idle') // idle | loading | playing
  const lang = getVoiceLanguage()
  const langInfo = LANGUAGES.find(l => l.code === lang)

  if (!langInfo?.readAloud || !text?.trim()) return null

  const handleClick = async () => {
    if (state === 'playing') { stopSpeaking(); setState('idle'); return }
    setState('loading')
    try {
      // English resolves near-instantly (local synthesis); local languages
      // wait on the backend call — 'loading' distinguishes that pause from
      // the click doing nothing.
      const playPromise = speak(text, lang)
      setState('playing')
      await playPromise
    } catch {
      // silently drop to idle — read-aloud is a convenience, not critical path
    } finally {
      setState('idle')
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={state === 'playing' ? 'Stop' : `Read aloud in ${langInfo.label}`}
      className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 bg-slate-100 text-slate-500 hover:bg-slate-200 ${className}`}
    >
      {state === 'loading' ? <Loader2 size={13} className="animate-spin"/> : state === 'playing' ? <VolumeX size={13}/> : <Volume2 size={13}/>}
    </button>
  )
}
