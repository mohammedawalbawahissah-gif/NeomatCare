/**
 * src/components/sync/SyncQueueIndicator.jsx
 *
 * Web mirror of the mobile app's SyncQueueBell — same purpose (every queued
 * write visible and actionable from anywhere), different chrome: a header
 * dropdown next to the notification bell, matching AppLayout's existing
 * pattern, rather than a floating modal panel (there's no mobile-style FAB
 * convention on web — the header already has this exact slot for it).
 *
 * Always rendered, quiet when empty — see the mobile component's comment
 * for why: an icon that appears and disappears reads as a bug.
 */
import { useState, useRef, useEffect } from 'react'
import { RefreshCw, CloudOff, Trash2, UserPlus, ArrowLeftRight, Stethoscope, FileText, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { useOfflineQueue } from '../../contexts/OfflineQueueContext'
import { QueueKindInfo, MAX_RETRIES, isQueueItemFailed, removeFromQueue } from '../../utils/offlineQueue'

const ICONS = { UserPlus, ArrowLeftRight, Stethoscope, FileText }

const timeAgo = (ts) => {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function QueueRow({ item, onDiscard }) {
  const info = QueueKindInfo[item.meta?.kind] || { entityLabel: 'Record', actionLabel: 'Change', icon: 'FileText' }
  const Icon = ICONS[info.icon] || FileText
  const failed = isQueueItemFailed(item)

  return (
    <div className={clsx('flex items-start gap-2.5 w-full px-4 py-3 border-b border-slate-50 last:border-0', failed && 'bg-danger-50/50')}>
      <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', failed ? 'bg-danger-100' : 'bg-amber-100')}>
        <Icon size={15} className={failed ? 'text-danger-600' : 'text-amber-600'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{item.meta?.label || info.entityLabel}</p>
        <p className="text-xs text-slate-500 truncate">{info.actionLabel} · {timeAgo(item.createdAt)}</p>
        <p className={clsx('text-xs mt-0.5', failed ? 'text-danger-600' : 'text-amber-600')}>
          {failed
            ? `Couldn't send after ${MAX_RETRIES} tries: ${item.lastError || 'unknown error'}`
            : item.retries > 0
              ? `Waiting to retry (attempt ${item.retries})`
              : 'Waiting for connection'}
        </p>
      </div>
      <button
        onClick={() => onDiscard(item)}
        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
        title="Discard"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export default function SyncQueueIndicator() {
  const { pending, isOnline, syncing, sync } = useOfflineQueue()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const failed = pending.filter(isQueueItemFailed)
  const waiting = pending.filter((i) => !isQueueItemFailed(i))
  const count = pending.length

  const handleDiscard = async (item) => {
    if (!window.confirm(`Discard "${item.meta?.label || 'this record'}"? It will not be sent to the server.`)) return
    await removeFromQueue(item.id)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
        title="Sync queue"
      >
        {isOnline ? <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} /> : <CloudOff size={18} />}
        {count > 0 && (
          <span className={clsx(
            'absolute top-1 right-1 min-w-[15px] h-[15px] px-0.5 rounded-full text-[9px] text-white font-semibold flex items-center justify-center',
            failed.length > 0 ? 'bg-danger-500' : 'bg-amber-500'
          )}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50 max-h-96 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 shrink-0">
            <div>
              <p className="text-sm font-semibold text-slate-900">Sync Queue</p>
              <p className="text-xs text-slate-500">{isOnline ? 'Online' : 'Offline'} · {count} pending</p>
            </div>
            <button
              onClick={sync}
              disabled={!isOnline || count === 0 || syncing}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
              Sync now
            </button>
          </div>

          <div className="overflow-y-auto">
            {count === 0 && (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">Nothing queued — every record has reached the server.</p>
            )}
            {failed.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                  <AlertCircle size={11} /> Needs attention
                </p>
                {failed.map((item) => <QueueRow key={item.id} item={item} onDiscard={handleDiscard} />)}
              </>
            )}
            {waiting.length > 0 && (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wide">Waiting to sync</p>
                {waiting.map((item) => <QueueRow key={item.id} item={item} onDiscard={handleDiscard} />)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
