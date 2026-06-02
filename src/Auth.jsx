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

  const loginWithGoogle = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  };

  const T = {
    bg: "#F7F6F2", card: "#FFFFFF", border: "#E8E5DE",
    text: "#1A1917", text2: "#6B6860", text3: "#A8A49D",
    accent: "#1A1917", accentText: "#FFFFFF", radius: 14,
  };

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100svh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "2.5rem 2rem", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
        <div style={{ fontSize: 40, marginBottom: "0.75rem" }}>✨</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: T.text, letterSpacing: "-0.5px" }}>Split Sin Drama</h1>
        <p style={{ fontSize: 13, color: T.text3, margin: "0 0 2rem" }}>Sube la boleta · IA extrae todo · divide sin pelea</p>

        <button
          onClick={loginWithGoogle}
          disabled={loading}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "11px 16px", border: `1px solid ${T.border}`, borderRadius: 8, background: T.card, cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, color: T.text, fontFamily: "inherit", opacity: loading ? 0.6 : 1, transition: "all 0.15s" }}>
          <GoogleIcon />
          {loading ? "Redirigiendo..." : "Continuar con Google"}
        </button>

        <p style={{ fontSize: 11, color: T.text3, marginTop: "1.5rem", lineHeight: 1.5 }}>
          5 escaneos gratis · sin tarjeta de crédito
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
    </svg>
  );
}
