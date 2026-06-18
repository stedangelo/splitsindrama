import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const T = {
  bg: "#0a0a0f", surface: "#13131a", surface2: "#1c1c26", border: "#2a2a3a",
  borderStrong: "#3a3a50", borderAccent: "#2563ff", text: "#f0f0f8",
  textDim: "#8888aa", textFaint: "#55556a", accent: "#2563ff", accentHi: "#4d7fff",
  accentSoft: "rgba(37,99,255,.13)", accentGlow: "rgba(37,99,255,.35)", radius: 14,
};
const pcolors = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#14b8a6"];
const pcolor = i => pcolors[i % pcolors.length];
const initials = n => n?.trim().split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const fmtCLP = n => "$" + Math.round(n).toLocaleString("es-CL");

export default function SalaView({ sessionId }) {
  const [session, setSession] = useState(null);
  const [marks, setMarks] = useState({});
  const [myMemberId, setMyMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const channelRef = useRef(null);

  // Load session
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (error || !data) { setError("Sala no encontrada"); setLoading(false); return; }
      setSession(data);
      setMarks(deserializeMarks(data.marks || {}));
      setLoading(false);
    }
    load();
  }, [sessionId]);

  // Realtime subscription
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sessionId}`
      }, payload => {
        setMarks(deserializeMarks(payload.new.marks || {}));
      })
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [session, sessionId]);

  const deserializeMarks = (raw) => {
    const out = {};
    for (const [k, v] of Object.entries(raw || {})) out[k] = new Set(v);
    return out;
  };

  const serializeMarks = (m) => {
    const out = {};
    for (const [k, v] of Object.entries(m)) out[k] = [...v];
    return out;
  };

  const toggleMark = async (itemId, memberId) => {
    const next = { ...marks };
    if (!next[itemId]) next[itemId] = new Set();
    else next[itemId] = new Set(next[itemId]);
    if (next[itemId].has(memberId)) next[itemId].delete(memberId);
    else next[itemId].add(memberId);
    setMarks(next);
    await supabase.from("sessions").update({ marks: serializeMarks(next) }).eq("id", sessionId);
  };

  if (loading) return (
    <div style={{ minHeight: "100svh", background: T.bg, display: "grid", placeItems: "center", color: T.textDim, fontFamily: "Geist, sans-serif" }}>
      Cargando sala…
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100svh", background: T.bg, display: "grid", placeItems: "center", color: T.textDim, fontFamily: "Geist, sans-serif", textAlign: "center", padding: 24 }}>
      <div>
        <div style={{ fontSize: 40, marginBottom: 16 }}>😕</div>
        <div style={{ fontSize: 18, color: T.text, marginBottom: 8 }}>Sala no encontrada</div>
        <div style={{ fontSize: 14 }}>{error}</div>
      </div>
    </div>
  );

  const { items, members, tip, disc } = session;
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const discAmt = subtotal * (disc || 0) / 100;
  const tipAmt = (subtotal - discAmt) * (tip || 0) / 100;
  const grand = subtotal - discAmt + tipAmt;
  const factor = subtotal > 0 ? grand / subtotal : 1;

  const getPerPerson = () => {
    const per = {};
    members.forEach(m => per[m.id] = { base: 0, final: 0 });
    items.forEach(it => {
      const set = marks[it.id];
      if (!set || set.size === 0) return;
      const share = it.price / set.size;
      set.forEach(pid => { if (per[pid] !== undefined) per[pid].base += share; });
    });
    members.forEach(m => { per[m.id].final = per[m.id].base * factor; });
    return per;
  };
  const per = getPerPerson();

  const myIdx = myMemberId ? members.findIndex(m => m.id === myMemberId) : -1;
  const myMember = myIdx >= 0 ? members[myIdx] : null;

  return (
    <div style={{ minHeight: "100svh", background: T.bg, fontFamily: "Geist, sans-serif", color: T.text }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700, fontSize: 17, letterSpacing: "-.02em" }}>
          <span style={{ color: T.text }}>Split </span>
          <span style={{ color: T.accentHi }}>Sin Drama</span>
        </div>
        <div style={{ fontSize: 12, color: T.textDim }}>Sala compartida</div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px 48px" }}>

        {/* Elegir mi nombre */}
        {!myMemberId ? (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 6 }}>¿Quién eres tú?</h2>
            <p style={{ color: T.textDim, fontSize: 14, marginBottom: 20 }}>Elige tu nombre para marcar lo que consumiste.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {members.map((m, i) => (
                <button key={m.id} onClick={() => setMyMemberId(m.id)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                  borderRadius: T.radius, border: `1px solid ${T.border}`,
                  background: T.surface, color: T.text, fontFamily: "inherit",
                  fontSize: 15, fontWeight: 500, cursor: "pointer", textAlign: "left",
                  transition: "border-color .15s, background .15s",
                }}>
                  <span style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, color: "#fff", background: pcolor(i), flexShrink: 0 }}>{initials(m.name)}</span>
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {/* Mi nombre seleccionado */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, color: "#fff", background: pcolor(myIdx) }}>{initials(myMember.name)}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{myMember.name}</div>
                  <div style={{ fontSize: 12, color: T.accentHi }}>{fmtCLP(per[myMemberId]?.final || 0)} te toca</div>
                </div>
              </div>
              <button onClick={() => setMyMemberId(null)} style={{ fontSize: 12, color: T.textDim, background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>Cambiar</button>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 600, color: T.textDim, marginBottom: 12, textTransform: "uppercase", letterSpacing: ".04em", fontSize: 12 }}>Marca lo que consumiste</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
              {items.map(it => {
                const on = marks[it.id]?.has(myMemberId);
                const sharedWith = marks[it.id] ? [...marks[it.id]].filter(id => id !== myMemberId) : [];
                return (
                  <button key={it.id} onClick={() => toggleMark(it.id, myMemberId)} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                    borderRadius: T.radius,
                    border: `1px solid ${on ? T.borderAccent : T.border}`,
                    background: on ? T.accentSoft : T.surface,
                    color: T.text, fontFamily: "inherit", cursor: "pointer", textAlign: "left",
                    transition: "all .15s",
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center",
                      background: on ? T.accent : T.surface2,
                      border: `1px solid ${on ? "transparent" : T.border}`,
                      color: on ? "#fff" : "transparent",
                      transition: "all .15s",
                    }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{it.name}</div>
                      <div style={{ fontSize: 11.5, color: T.textFaint, marginTop: 1 }}>
                        {it.qty > 1 ? `${it.qty}× · ` : ""}{fmtCLP(it.price)}
                        {sharedWith.length > 0 && (
                          <span style={{ color: T.accentHi }}> · compartido</span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontFamily: "monospace", color: on ? T.accentHi : T.textFaint, fontWeight: 600, flexShrink: 0 }}>
                      {on ? fmtCLP(it.price / (marks[it.id]?.size || 1)) : ""}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mi subtotal */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: T.textDim }}>Sin propina</span>
                <span style={{ fontSize: 13, fontFamily: "monospace", color: T.textDim }}>{fmtCLP(per[myMemberId]?.base || 0)}</span>
              </div>
              {tip > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: T.textDim }}>Propina ({tip}%)</span>
                  <span style={{ fontSize: 13, fontFamily: "monospace", color: T.textDim }}>+{fmtCLP((per[myMemberId]?.final || 0) - (per[myMemberId]?.base || 0))}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Tu total</span>
                <span style={{ fontSize: 18, fontFamily: "monospace", fontWeight: 700, color: T.accentHi }}>{fmtCLP(per[myMemberId]?.final || 0)}</span>
              </div>
            </div>

            {/* Resumen todos */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textFaint, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 10 }}>Todos en la mesa</div>
              {members.map((m, i) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, color: "#fff", background: pcolor(i), flexShrink: 0 }}>{initials(m.name)}</span>
                  <span style={{ flex: 1, fontSize: 14, color: m.id === myMemberId ? T.text : T.textDim, fontWeight: m.id === myMemberId ? 600 : 400 }}>{m.name}</span>
                  <span style={{ fontSize: 13, fontFamily: "monospace", color: per[m.id]?.final > 0 ? T.text : T.textFaint }}>{fmtCLP(per[m.id]?.final || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
