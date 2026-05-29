import { X, AlertCircle, Info, CheckCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

const STATUS_COLORS = {
  DRAFT:      'bg-slate-100 text-slate-600',
  PENDING:    'bg-amber-100 text-amber-700',
  ACCEPTED:   'bg-brand-100 text-brand-700',
  IN_TRANSIT: 'bg-blue-100 text-blue-700',
  RECEIVED:   'bg-purple-100 text-purple-700',
  COMPLETED:  'bg-brand-100 text-brand-800',
  CANCELLED:  'bg-slate-100 text-slate-500',
  FAILED:     'bg-danger-100 text-danger-700',
  requested:   'bg-amber-100 text-amber-700',
  accepted:    'bg-brand-100 text-brand-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed:   'bg-brand-100 text-brand-800',
  declined:    'bg-danger-100 text-danger-700',
  missed:      'bg-slate-100 text-slate-500',
  available:   'bg-brand-100 text-brand-700',
  dispatched:  'bg-blue-100 text-blue-700',
  returning:   'bg-purple-100 text-purple-700',
  maintenance: 'bg-amber-100 text-amber-700',
  offline:     'bg-slate-100 text-slate-500',
}

export function StatusBadge({ status, className }) {
  const label = status?.replace(/_/g, ' ')
  return (
    <span className={clsx('status-badge', STATUS_COLORS[status] || 'bg-slate-100 text-slate-600', className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  )
}

export function Spinner({ size = 20, className }) {
  return <Loader2 size={size} className={clsx('animate-spin text-brand-600', className)} />
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner size={32} />
    </div>
  )
}

export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const widths = { sm: '360px', md: '540px', lg: '720px', xl: '900px' }
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '16px', overflowY: 'auto',
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative', background: 'white', borderRadius: '16px',
          width: '100%', maxWidth: widths[size],
          boxShadow: '0 25px 50px rgba(0,0,0,0.35)',
          margin: '40px auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid #f1f5f9',
          position: 'sticky', top: 0, background: 'white',
          borderRadius: '16px 16px 0 0', zIndex: 10,
        }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#0f172a' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '8px', color: '#64748b' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

const ALERT_STYLES = {
  error:   { bg: 'bg-danger-50 border-danger-200', text: 'text-danger-800',  Icon: AlertCircle, icon: 'text-danger-500'  },
  success: { bg: 'bg-brand-50 border-brand-200',   text: 'text-brand-800',   Icon: CheckCircle, icon: 'text-brand-500'   },
  info:    { bg: 'bg-blue-50 border-blue-200',      text: 'text-blue-800',    Icon: Info,        icon: 'text-blue-500'    },
  warning: { bg: 'bg-amber-50 border-amber-200',    text: 'text-amber-800',   Icon: AlertCircle, icon: 'text-amber-500'   },
}

export function Alert({ type = 'info', message, className }) {
  if (!message) return null
  const { bg, text, Icon, icon } = ALERT_STYLES[type]
  return (
    <div className={clsx('flex items-start gap-3 px-4 py-3 rounded-lg border text-sm', bg, className)}>
      <Icon size={16} className={clsx('mt-0.5 shrink-0', icon)} />
      <span className={text}>{message}</span>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
          <Icon size={24} className="text-slate-400" />
        </div>
      )}
      <p className="font-medium text-slate-700 mb-1">{title}</p>
      {description && <p className="text-sm text-slate-400 max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  )
}

export function FormField({ label, error, required, children, hint }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-slate-700">
          {label} {required && <span className="text-danger-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  )
}

export function StatCard({ label, value, icon: Icon, trend, color = 'brand', className }) {
  const colors = {
    brand:  'bg-brand-50 text-brand-600',
    danger: 'bg-danger-50 text-danger-600',
    amber:  'bg-amber-50 text-amber-600',
    blue:   'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    slate:  'bg-slate-100 text-slate-600',
  }
  return (
    <div className={clsx('card px-5 py-4 flex items-center gap-4', className)}>
      {Icon && (
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', colors[color])}>
          <Icon size={20} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-2xl font-semibold text-slate-900 leading-none">{value ?? '—'}</p>
        <p className="text-xs text-slate-500 mt-1 truncate">{label}</p>
        {trend && <p className="text-xs text-brand-600 mt-0.5">{trend}</p>}
      </div>
    </div>
  )
}

const DANGER_LABELS = {
  PPH: 'PPH', APH: 'APH', RUPTURED_UTERUS: 'Ruptured Uterus',
  ECLAMPSIA: 'Eclampsia', SEVERE_PRE_ECLAMPSIA: 'Severe Pre-Eclampsia',
  OBSTRUCTED_LABOUR: 'Obstructed Labour', CORD_PROLAPSE: 'Cord Prolapse',
  PUERPERAL_SEPSIS: 'Puerperal Sepsis', CHORIOAMNIONITIS: 'Chorioamnionitis',
  NEONATAL_DISTRESS: 'Neonatal Distress', PRETERM_LABOUR: 'Preterm Labour',
  NEONATAL_SEPSIS: 'Neonatal Sepsis', SEVERE_ANAEMIA: 'Severe Anaemia',
  MALPRESENTATION: 'Malpresentation',
}

export function DangerSignPill({ sign }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-danger-50 text-danger-700 text-xs font-medium border border-danger-100">
      {DANGER_LABELS[sign] || sign}
    </span>
  )
}

export function DangerSignList({ signs = [] }) {
  if (!signs.length) return <span className="text-xs text-slate-400">None recorded</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {signs.map((s) => <DangerSignPill key={s} sign={s} />)}
    </div>
  )
}
