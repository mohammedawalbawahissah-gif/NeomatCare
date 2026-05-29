import { useNavigate } from 'react-router-dom'
import { Heart, ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 bg-brand-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Heart size={28} className="text-brand-400" />
        </div>
        <p className="text-8xl font-display text-white mb-2">404</p>
        <p className="text-slate-400 text-lg mb-8">This page doesn't exist.</p>
        <button onClick={() => navigate('/app/dashboard')}
          className="inline-flex items-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-xl transition-colors">
          <ArrowLeft size={16} /> Back to Dashboard
        </button>
      </div>
    </div>
  )
}
