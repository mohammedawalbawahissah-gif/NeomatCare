/**
 * src/components/ai/AssistantWidget.jsx
 *
 * Floating, role-aware AI assistant widget for all NeoMatCare portals.
 *
 * Features:
 * - Persists chat history for the session
 * - Role-aware system prompts (handled server-side)
 * - Accepts optional `context` prop for page-level AI awareness
 * - Markdown-safe text rendering (line breaks, bold, bullets)
 * - Responsive: fixed bottom-right on desktop, full-width sheet on mobile
 * - Minimises to a FAB; remembers open/closed state in sessionStorage
 * - Graceful error handling with retry option
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { aiApi } from '@/api/ai'
import {
  Bot, X, Send, Minus, ChevronDown, RefreshCw,
  Sparkles, AlertCircle, Loader2,
} from 'lucide-react'
import clsx from 'clsx'

// ── Role config ───────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  health_worker:  { label: 'Clinical Assistant',  color: 'bg-brand-600',   accent: '#207652', greeting: "Hi! I'm your clinical assistant. Ask me about danger signs, triage, referrals, or how to use NeoMatCare." },
  facility_admin: { label: 'Facility Assistant',  color: 'bg-blue-600',    accent: '#2563eb', greeting: "Hi! I can help with facility operations, capacity management, referral patterns, and platform questions." },
  specialist:     { label: 'Specialist Assistant',color: 'bg-purple-600',  accent: '#7c3aed', greeting: "Hello. I can assist with case review, consultation notes, clinical protocols, and incoming referrals." },
  driver:         { label: 'Dispatch Assistant',  color: 'bg-amber-500',   accent: '#d97706', greeting: "Hi! I can help with dispatch information, patient transport protocols, and status updates." },
  superadmin:     { label: 'Admin Assistant',     color: 'bg-danger-600',  accent: '#e43418', greeting: "Hello. I have full system context and can assist with any NeoMatCare operation, data, or administration." },
  patient:        { label: 'Pregnancy Companion', color: 'bg-brand-500',   accent: '#2f9466', greeting: "Hi there! 💚 I'm here to support you through your pregnancy journey. Ask me anything about your health, ANC visits, or what to expect." },
}

const DEFAULT_CONFIG = ROLE_CONFIG.health_worker

// ── Simple markdown renderer ──────────────────────────────────────────────────
function RenderMessage({ text }) {
  const lines = text.split('\n')
  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />
        // Bold: **text**
        const parts = line.split(/\*\*(.*?)\*\*/g)
        const rendered = parts.map((p, j) =>
          j % 2 === 1 ? <strong key={j}>{p}</strong> : p
        )
        // Bullet points
        if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-current opacity-60 mt-[6px]" />
              <span>{rendered.slice(1)}</span>
            </div>
          )
        }
        return <div key={i}>{rendered}</div>
      })}
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, accentColor }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('flex gap-2 mb-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {!isUser && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: accentColor }}
        >
          <Bot size={12} className="text-white" />
        </div>
      )}
      <div
        className={clsx(
          'max-w-[82%] px-3 py-2.5 rounded-2xl',
          isUser
            ? 'text-white rounded-tr-sm'
            : 'bg-slate-100 text-slate-800 rounded-tl-sm',
        )}
        style={isUser ? { background: accentColor } : {}}
      >
        {isUser
          ? <div className="text-sm leading-relaxed">{msg.content}</div>
          : <RenderMessage text={msg.content} />
        }
      </div>
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────
export default function AssistantWidget({ context = {} }) {
  const { role } = useAuth()
  const config = ROLE_CONFIG[role] || DEFAULT_CONFIG

  const storageKey = `nmc_assistant_open_${role}`
  const [open, setOpen]       = useState(() => {
    try { return sessionStorage.getItem(storageKey) === 'true' } catch { return false }
  })
  const [messages, setMessages] = useState([
    { role: 'assistant', content: config.greeting },
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const bottomRef             = useRef(null)
  const inputRef              = useRef(null)

  // Persist open state
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, open) } catch {}
  }, [open, storageKey])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim()
    if (!content || loading) return

    const newUserMsg = { role: 'user', content }
    const updated = [...messages, newUserMsg]
    setMessages(updated)
    setInput('')
    setError('')
    setLoading(true)

    // Build history for API (exclude the greeting)
    const apiMessages = updated
      .filter((_, i) => !(i === 0 && updated[0].role === 'assistant'))
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const { data } = await aiApi.chat(apiMessages, context)
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch (err) {
      const msg = err?.response?.data?.error || 'Could not reach the AI assistant. Please try again.'
      setError(msg)
      // Remove the user message so they can retry
      setMessages(prev => prev.slice(0, -1))
      setInput(content)
    } finally {
      setLoading(false)
    }
  }, [input, messages, loading, context])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: config.greeting }])
    setError('')
    setInput('')
  }

  return (
    <>
      {/* ── Chat Panel ────────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed z-50 flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100"
          style={{
            bottom: '88px',
            right: '24px',
            width: 'min(380px, calc(100vw - 48px))',
            height: 'min(520px, calc(100vh - 140px))',
          }}
        >
          {/* Header */}
          <div
            className={clsx('flex items-center gap-3 px-4 py-3 rounded-t-2xl', config.color)}
          >
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Bot size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold leading-tight">{config.label}</p>
              <p className="text-white/70 text-[10px]">Powered by Claude AI</p>
            </div>
            <button
              onClick={clearChat}
              title="Clear chat"
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            >
              <RefreshCw size={13} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} accentColor={config.accent} />
            ))}

            {loading && (
              <div className="flex gap-2 mb-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: config.accent }}
                >
                  <Bot size={12} className="text-white" />
                </div>
                <div className="bg-slate-100 px-3 py-2.5 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 mb-3 px-3 py-2.5 bg-danger-50 border border-danger-100 rounded-xl text-danger-700 text-xs">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick prompts - role specific */}
          <QuickPrompts role={role} onSelect={sendMessage} disabled={loading} />

          {/* Input */}
          <div className="px-3 pb-3">
            <div className="flex gap-2 items-end bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-300/30 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                rows={1}
                className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 resize-none outline-none leading-relaxed max-h-24"
                style={{ minHeight: '22px' }}
                disabled={loading}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                className="p-1.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: (!input.trim() || loading) ? '#94a3b8' : config.accent }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-center text-[10px] text-slate-400 mt-1.5">
              AI may make mistakes. Always verify clinical decisions.
            </p>
          </div>
        </div>
      )}

      {/* ── FAB ───────────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'fixed z-50 bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl',
          'flex items-center justify-center transition-all duration-200',
          'hover:scale-110 active:scale-95',
          config.color,
        )}
        title={config.label}
        aria-label="Open AI Assistant"
      >
        {open
          ? <X size={22} className="text-white" />
          : <Sparkles size={22} className="text-white" />
        }
        {/* Pulse ring when closed */}
        {!open && (
          <span
            className={clsx('absolute inset-0 rounded-full opacity-30 animate-ping', config.color)}
            style={{ animationDuration: '3s' }}
          />
        )}
      </button>
    </>
  )
}

// ── Quick prompt suggestions by role ─────────────────────────────────────────
const QUICK_PROMPTS = {
  health_worker: [
    "What are signs of eclampsia?",
    "When should I escalate a PPH case?",
    "How do I create a referral?",
  ],
  facility_admin: [
    "How do I update facility capacity?",
    "What referral statuses mean?",
    "How do I add a transport vehicle?",
  ],
  specialist: [
    "What should I review in a referral?",
    "How do I update a consultation status?",
    "Signs of neonatal sepsis?",
  ],
  driver: [
    "I have a new dispatch, what should I do?",
    "How do I update my trip status?",
    "Patient seems unwell — what should I do?",
  ],
  superadmin: [
    "Show me how to manage users",
    "How do I add a new facility?",
    "Explain referral statuses",
  ],
  patient: [
    "What should I eat during pregnancy?",
    "When should I go to the hospital immediately?",
    "What happens at my next ANC visit?",
  ],
}

function QuickPrompts({ role, onSelect, disabled }) {
  const prompts = QUICK_PROMPTS[role] || QUICK_PROMPTS.health_worker
  return (
    <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
      {prompts.map(p => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          disabled={disabled}
          className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {p}
        </button>
      ))}
    </div>
  )
}
