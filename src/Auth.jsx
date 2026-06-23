import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const loginWithGoogle = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const sendCode = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) setError("No se pudo enviar el código — intenta de nuevo");
    else setCodeSent(true);
    setLoading(false);
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) setError("Código incorrecto o expirado");
    setLoading(false);
  };

  return (
    <div style={{
      fontFamily: "'Geist', 'Inter', system-ui, sans-serif",
      minHeight: "100dvh",
      background: "#0A0A0A",
      display: "grid",
      placeItems: "center",
      padding: "24px",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Backdrop glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", left: "50%", top: "-10%",
          transform: "translateX(-50%)",
          width: "min(900px, 120vw)", aspectRatio: "1", borderRadius: "50%",
          background: "radial-gradient(closest-side, rgba(37,99,255,.13), transparent 70%)",
          filter: "blur(10px)",
        }} />
      </div>

      <div style={{
        width: "100%", maxWidth: 418, position: "relative", zIndex: 1,
        background: "linear-gradient(180deg, #171717, #121212)",
        border: "1px solid rgba(255,255,255,.08)",
        borderRadius: 22,
        padding: "44px 40px 32px",
        boxShadow: "0 1px 0 rgba(255,255,255,.04) inset, 0 40px 80px -28px rgba(0,0,0,.8)",
      }}>
        {/* Top blue border gradient */}
        <div style={{
          position: "absolute", inset: -1, borderRadius: "inherit",
          background: "linear-gradient(180deg, rgba(37,99,255,.4), transparent 38%)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 1, pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: "linear-gradient(150deg, #2563FF, #1843B8)",
            boxShadow: "0 0 0 1px rgba(255,255,255,.08) inset, 0 6px 18px -4px rgba(37,99,255,.45)",
            display: "grid", placeItems: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 3v18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
              <path d="M5 8.5 9 12l-4 3.5" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M19 8.5 15 12l4 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.02em" }}>
            <span style={{ color: "#fff" }}>Split</span>{" "}
            <span style={{ color: "#4F82FF" }}>Sin Drama</span>
          </div>
        </div>

        <h1 style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 9, lineHeight: 1.18, color: "#FAFAFA" }}>
          Divide la cuenta<br/>sin pelear con nadie.
        </h1>
        <p style={{ color: "#A0A0A0", fontSize: 14.5, marginBottom: 30, maxWidth: "33ch" }}>
          Súbele la foto a la boleta, la IA saca los ítems y cada uno paga lo justo. Listo en 30 segundos.
        </p>

        {/* Google button */}
        <button
          onClick={loginWithGoogle}
          disabled={loading}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 11,
            background: "#fff", color: "#1A1A1A", fontWeight: 600, fontSize: 15,
            padding: "13px 18px", borderRadius: 12, border: "none", cursor: loading ? "not-allowed" : "pointer",
            boxShadow: "0 1px 2px rgba(0,0,0,.3)",
            opacity: loading ? 0.6 : 1,
            fontFamily: "inherit",
            transition: "filter .2s, box-shadow .25s",
          }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/>
          </svg>
          {loading ? "Redirigiendo..." : "Continuar con Google"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0", color: "#6B6B6B", fontSize: 12 }}>
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,.08)" }} />
          o
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,.08)" }} />
        </div>

        {/* Email OTP */}
        {!showEmail ? (
          <button onClick={() => setShowEmail(true)} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "#A0A0A0", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
            Continuar con correo
          </button>
        ) : !codeSent ? (
          <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="email" placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus
              style={{ padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "#1A1A1A", color: "#fff", fontFamily: "inherit", fontSize: 14, outline: "none" }}
            />
            {error && <div style={{ fontSize: 12.5, color: "#f87171" }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => { setShowEmail(false); setError(""); }} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.1)", background: "transparent", color: "#6B6B6B", fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>← Volver</button>
              <button type="submit" disabled={loading} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#2563FF", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
                {loading ? "Enviando..." : "Enviar código"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={verifyCode} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13, color: "#A0A0A0", textAlign: "center" }}>Ingresa el código de 6 dígitos enviado a <strong style={{ color: "#fff" }}>{email}</strong></div>
            <input
              type="text" inputMode="numeric" placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus maxLength={6}
              style={{ padding: "13px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "#1A1A1A", color: "#fff", fontFamily: "monospace", fontSize: 22, outline: "none", textAlign: "center", letterSpacing: "0.3em" }}
            />
            {error && <div style={{ fontSize: 12.5, color: "#f87171", textAlign: "center" }}>{error}</div>}
            <button type="submit" disabled={loading || code.length < 6} style={{ padding: "12px", borderRadius: 10, border: "none", background: "#2563FF", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: (loading || code.length < 6) ? "not-allowed" : "pointer", opacity: (loading || code.length < 6) ? 0.5 : 1 }}>
              {loading ? "Verificando..." : "Entrar"}
            </button>
            <button type="button" onClick={() => { setCodeSent(false); setCode(""); setError(""); }} style={{ padding: "8px", background: "none", border: "none", color: "#6B6B6B", fontFamily: "inherit", fontSize: 12.5, cursor: "pointer" }}>
              ← Cambiar correo
            </button>
          </form>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0", color: "#6B6B6B", fontSize: 12 }}>
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,.08)" }} />
          así de simple
          <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,.08)" }} />
        </div>

        <div style={{ textAlign: "center", color: "#6B6B6B", fontSize: 12.5, lineHeight: 1.6 }}>
          Al continuar aceptas los{" "}
          <a href="#" style={{ color: "#A0A0A0", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,.14)" }}>Términos</a>
          {" "}y la{" "}
          <a href="#" style={{ color: "#A0A0A0", textDecoration: "none", borderBottom: "1px solid rgba(255,255,255,.14)" }}>Privacidad</a>.
          <br/>Sin tarjetas, sin cuentas, sin dramas.
        </div>

        {/* Badges */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
          {["IA lee la boleta", "Pesos chilenos", "Copia a WhatsApp"].map(label => (
            <span key={label} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11.5, color: "#A0A0A0",
              background: "#1A1A1A", border: "1px solid rgba(255,255,255,.08)",
              padding: "6px 11px", borderRadius: 99,
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="m5 13 4 4L19 7" stroke="#4F82FF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
