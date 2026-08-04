import { useState } from "react"
import { useNavigate, Link, useSearchParams } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Heart, Eye, EyeOff, ArrowRight, CheckCircle, Mail, Lock } from "lucide-react"

const inputStyle = { width:"100%", padding:"10px 14px", border:"1px solid #e2e8f0", borderRadius:"8px", fontSize:"0.875rem", outline:"none", boxSizing:"border-box", background:"white" }
const labelStyle = { display:"block", fontSize:"0.875rem", fontWeight:500, color:"#374151", marginBottom:"6px" }

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [params]  = useSearchParams()
  const registered   = params.get("registered")   === "1"
  const verified     = params.get("verified")      === "1"

  const [form, setForm]       = useState({ email:"", password:"" })
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      const user = await login(form.email, form.password)
      // Send patients straight to their portal
      navigate(user.role === "patient" ? "/app/portal" : "/app/dashboard")
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid email or password.")
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a,#1e293b,#0a2319)", display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
      <div style={{ width:"100%", maxWidth:"420px" }}>
        <div style={{ textAlign:"center", marginBottom:"2rem" }}>
          <div style={{ width:"56px", height:"56px", background:"#2f9466", borderRadius:"16px", display:"inline-flex", alignItems:"center", justifyContent:"center", marginBottom:"1rem", boxShadow:"0 10px 25px rgba(47,148,102,0.35)" }}>
            <Heart size={24} color="white" fill="white" />
          </div>
          <h1 style={{ color:"white", fontFamily:"Georgia, serif", fontSize:"1.9rem", margin:0 }}>NeoMatCare</h1>
          <p style={{ color:"#94a3b8", fontSize:"0.9rem", marginTop:"0.35rem" }}>Emergency Referral System</p>
        </div>

        <div style={{ background:"white", borderRadius:"18px", padding:"2rem", boxShadow:"0 25px 50px rgba(0,0,0,0.4)" }}>
          <h2 style={{ fontFamily:"Georgia, serif", fontSize:"1.35rem", color:"#0f172a", marginBottom:"0.25rem" }}>Welcome back</h2>
          <p style={{ color:"#64748b", fontSize:"0.875rem", marginBottom:"1.5rem" }}>Sign in to your account</p>

          {(registered || verified) && (
            <div style={{ display:"flex", alignItems:"center", gap:"8px", background:"#f0f9f4", border:"1px solid #bbe3ce", borderRadius:"8px", padding:"0.75rem 1rem", color:"#1a5e42", fontSize:"0.875rem", marginBottom:"1rem" }}>
              <CheckCircle size={16} />
              {verified ? "Account verified! Sign in below." : "Account created. Sign in below."}
            </div>
          )}
          {error && (
            <div style={{ background:"#fff4f2", border:"1px solid #ffd0c8", borderRadius:"8px", padding:"0.75rem 1rem", color:"#c02812", fontSize:"0.875rem", marginBottom:"1rem" }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:"1rem" }}>
            <div>
              <label style={labelStyle}>Email Address <span style={{ color:"#e43418" }}>*</span></label>
              <div style={{ position:"relative" }}>
                <Mail size={16} style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} />
                <input type="email" required value={form.email} onChange={set("email")} placeholder="you@facility.gh" style={{ ...inputStyle, paddingLeft:"38px" }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Password <span style={{ color:"#e43418" }}>*</span></label>
              <div style={{ position:"relative" }}>
                <Lock size={16} style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", color:"#94a3b8" }} />
                <input type={showPw ? "text" : "password"} required value={form.password} onChange={set("password")} placeholder="Your password" style={{ ...inputStyle, paddingLeft:"38px", paddingRight:"40px" }} />
                <button type="button" onClick={() => setShowPw(v => !v)} style={{ position:"absolute", right:"12px", top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#94a3b8", padding:0 }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", padding:"12px", background:loading?"#7cb99a":"#207652", color:"white", border:"none", borderRadius:"10px", fontSize:"0.9rem", fontWeight:600, cursor:loading?"not-allowed":"pointer", marginTop:"6px" }}>
              {loading ? "Signing in…" : <><span>Sign In</span><ArrowRight size={16} /></>}
            </button>
          </form>

          {/* Staff register link */}
          <p style={{ textAlign:"center", fontSize:"0.875rem", color:"#64748b", marginTop:"1.25rem" }}>
            Staff account?{" "}
            <Link to="/register" style={{ color:"#207652", fontWeight:600, textDecoration:"none" }}>Register here</Link>
          </p>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:"8px", margin:"1rem 0" }}>
            <div style={{ flex:1, height:"1px", background:"#e2e8f0" }} />
            <span style={{ fontSize:"0.75rem", color:"#94a3b8" }}>OR</span>
            <div style={{ flex:1, height:"1px", background:"#e2e8f0" }} />
          </div>

          {/* Wellness Member register link */}
          <Link to="/patient-register" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:"8px", padding:"11px", background:"#f0f9f4", border:"1.5px solid #2f9466", borderRadius:"10px", color:"#1a5e42", fontSize:"0.875rem", fontWeight:600, textDecoration:"none" }}>
            <Heart size={15} fill="#2f9466" color="#2f9466" />
            Not staff? Create your Health Companion account
          </Link>
        </div>
      </div>
    </div>
  )
}
