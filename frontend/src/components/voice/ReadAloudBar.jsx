/**
 * src/components/voice/ReadAloudBar.jsx
 *
 * Global "Read Aloud" control for a detail/read screen. Render once near
 * the top of the screen. Pairs with `useReadAloud`. Mirrors
 * src/components/voice/ReadAloudBar.jsx in the mobile app.
 */
import { Volume2, VolumeX } from 'lucide-react'
import { getVoiceLanguage, LANGUAGES } from '../../services/voice'

export default function ReadAloudTrigger({ readAloud, className = '' }) {
  const { state, currentLabel, playAll, stop } = readAloud
  const lang = getVoiceLanguage()
  const langInfo = LANGUAGES.find(l => l.code === lang)
  if (!langInfo?.readAloud) return null

  if (state === 'playing') {
    return (
      <button
        type="button"
        onClick={stop}
        className={`inline-flex items-center gap-2 bg-brand-600 text-white rounded-full px-4 py-2 text-sm font-semibold max-w-xs ${className}`}
      >
        <VolumeX size={15} className="shrink-0" />
        <span className="truncate">{currentLabel ? `Reading: ${currentLabel}…` : 'Reading…'}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={playAll}
      className={`inline-flex items-center gap-2 bg-slate-100 text-slate-600 rounded-full px-4 py-2 text-sm font-semibold hover:bg-slate-200 transition-colors ${className}`}
    >
      <Volume2 size={15} />
      Read Aloud
    </button>
  )
}
