import { useState, useRef, useEffect } from 'react'
import { Languages, Check } from 'lucide-react'
import { LANGUAGES, getVoiceLanguage, setVoiceLanguage } from '../../services/voice'

export default function VoiceLanguagePicker() {
  const [open, setOpen] = useState(false)
  const [lang, setLang] = useState(getVoiceLanguage())
  const ref = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const choose = (code) => {
    setVoiceLanguage(code)
    setLang(code)
    setOpen(false)
  }

  const current = LANGUAGES.find(l => l.code === lang)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-500 text-xs font-medium transition-colors"
        title="Voice language"
      >
        <Languages size={16}/>
        <span className="hidden sm:inline">{current?.label || 'English'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-56 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50">
          <p className="px-4 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wide">Voice language</p>
          <p className="px-4 pb-2 text-[11px] text-slate-400">Used for dictation and read-aloud everywhere in the app</p>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              onClick={() => choose(l.code)}
              className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-50 text-left"
            >
              <span className="text-slate-700">{l.label}</span>
              {l.code === lang ? <Check size={14} className="text-brand-600"/> : (
                <span className="flex gap-1">
                  {!l.dictation && <span className="text-[9px] text-slate-300">no mic</span>}
                  {!l.readAloud && <span className="text-[9px] text-slate-300">no audio</span>}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
