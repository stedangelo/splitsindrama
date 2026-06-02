import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabase";

const STEPS = ["Cuenta", "Ajustes", "Personas", "Marcar", "Resultado"];
const fmtCLP = (n) => "$" + Math.round(n).toLocaleString("es-CL");
const COLORS = ["#E07B5A","#5A8FE0","#5ABF8A","#B05AE0","#E0BC5A","#5ADCE0","#E05A8F","#8FE05A","#E05A5A","#5A6BE0"];
const SCAN_LIMIT = 5;

export default function SplitSinDrama({ user }) {
  const [step, setStep] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [items, setItems] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editVal, setEditVal] = useState({ name: "", price: "" });
  const [members, setMembers] = useState([]);
  const [marks, setMarks] = useState({});
  const [propina, setPropina] = useState(10);
  const [descuento, setDescuento] = useState(0);
  const [descMode, setDescMode] = useState("total");
  const [newMember, setNewMember] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDetected, setAiDetected] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    supabase
      .from("scans")
      .select("id", { count: "exact" })
      .eq("user_id", user.id)
      .then(({ count }) => setScanCount(count || 0));
  }, [user.id]);

  const analyzeImage = useCallback(async (base64, mimeType) => {
    if (scanCount >= SCAN_LIMIT) return;
    setAiLoading(true);
    setScanDone(false);
    try {
      await supabase.from("scans").insert({ user_id: user.id });
      setScanCount(c => c + 1);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1200,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
              { type: "text", text: `Analiza esta boleta/cuenta de restaurante o bar chileno. Devuelve ÚNICAMENTE un objeto JSON válido sin texto adicional, sin markdown, sin backticks:
{"items":[{"name":"nombre","qty":1,"price":5990}],"propina":10,"descuento":0,"descMode":"total"}
- items: solo platos y bebidas (sin propina, sin descuentos, sin totales). price = precio total del item, número entero sin puntos ni comas.
- propina: porcentaje detectado (número, 0 si no hay).
- descuento: porcentaje detectado (número, 0 si no hay).
- descMode: "subtotal" si la propina se calcula sobre el monto ORIGINAL antes del descuento; "total" si el descuento aplica sobre todo o no hay descuento.` }
            ]
          }]
        })
      });
      const data = await res.json();
      const text = (data.content || []).map(b => b.text || "").join("");
      const parsed = JSON.parse(text.trim());
      if (parsed.items && Array.isArray(parsed.items)) {
        setItems(parsed.items.map(it => ({ id: Date.now() + Math.random(), name: it.name, qty: it.qty || 1, price: Number(it.price) || 0 })));
        if (typeof parsed.propina === "number") setPropina(parsed.propina);
        if (typeof parsed.descuento === "number") setDescuento(parsed.descuento);
        if (parsed.descMode) setDescMode(parsed.descMode);
        if (parsed.propina > 0 || parsed.descuento > 0) setAiDetected({ propina: parsed.propina, descuento: parsed.descuento, descMode: parsed.descMode });
        setScanDone(true);
      }
    } catch (e) { console.error(e); }
    setAiLoading(false);
  }, [scanCount, user.id]);

  const processFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    setItems([]);
    setScanDone(false);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImgPreview(e.target.result);
      analyzeImage(e.target.result.split(",")[1], file.type);
    };
    reader.readAsDataURL(file);
  }, [analyzeImage, scanCount]);

  const startEdit = (it) => { setEditingId(it.id); setEditVal({ name: it.name, price: it.price }); };
  const saveEdit = () => {
    setItems(prev => prev.map(it => it.id === editingId ? { ...it, name: editVal.name, price: Number(editVal.price) } : it));
    setEditingId(null);
  };
  const removeItem = (id) => { setItems(prev => prev.filter(i => i.id !== id)); setMarks(prev => { const m = { ...prev }; delete m[id]; return m; }); };
  const addManualItem = () => {
    setItems(prev => [...prev, { id: Date.now() + Math.random(), name: "Nuevo item", qty: 1, price: 0 }]);
  };

  const addMember = () => {
    if (!newMember.trim() || members.includes(newMember.trim())) return;
    setMembers(prev => [...prev, newMember.trim()]); setNewMember("");
  };
  const removeMember = (name) => setMembers(prev => prev.filter(m => m !== name));

  const toggleMark = (itemId, member) => setMarks(prev => ({ ...prev, [itemId]: { ...(prev[itemId] || {}), [member]: !(prev[itemId]?.[member]) } }));

  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const propinaFactor = propina / 100;
  const descFactor = descuento / 100;
  const propinaMonto = subtotal * propinaFactor;
  const descuentoMonto = descMode === "total" ? subtotal * (1 + propinaFactor) * descFactor : subtotal * descFactor;
  const grandTotal = descMode === "total" ? subtotal * (1 + propinaFactor) * (1 - descFactor) : subtotal * (1 - descFactor) + subtotal * propinaFactor;
  const getRawTotals = () => { const raw = {}; members.forEach(m => raw[m] = 0); items.forEach(it => { const pp = members.filter(m => marks[it.id]?.[m]); if (!pp.length) return; pp.forEach(m => raw[m] += it.price / pp.length); }); return raw; };
  const getFinalTotal = (raw) => descMode === "total" ? raw * (1 + propinaFactor) * (1 - descFactor) : raw * (1 - descFactor) + raw * propinaFactor;

  const copyResult = () => {
    const raw = getRawTotals();
    let text = "✨ Split Sin Drama\n──────────────────\n";
    members.forEach(m => { text += `${m}: ${fmtCLP(getFinalTotal(raw[m]))}\n`; });
    text += `──────────────────\nTotal: ${fmtCLP(grandTotal)}`;
    if (propinaMonto > 0) text += ` (propina ${propina}% incl.)`;
    if (descuentoMonto > 0) text += ` · Ahorro ${fmtCLP(descuentoMonto)}`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };

  const T = {
    bg: "#F7F6F2", card: "#FFFFFF", border: "#E8E5DE", border2: "#D0CCC2",
    text: "#1A1917", text2: "#6B6860", text3: "#A8A49D",
    accent: "#1A1917", accentText: "#FFFFFF",
    green: "#2A6B1A", greenBg: "#EDF5E8", greenBorder: "#B8D9A8",
    red: "#C0392B", orange: "#C46A00", orangeBg: "#FFF3E0",
    radius: 14, radiusSm: 8,
  };

  const s = {
    app: { fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif", maxWidth: 640, margin: "0 auto", padding: "1.25rem 1rem 3rem", background: "transparent" },
    h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.6px", margin: 0, color: T.text },
    sub: { fontSize: 12, color: T.text3, marginTop: 3 },
    stepBar: { display: "flex", gap: 4, margin: "1.25rem 0" },
    stepBtn: (i) => ({ flex: 1, padding: "7px 3px", border: `1px solid ${i === step ? T.accent : i < step ? T.greenBorder : T.border}`, borderRadius: 8, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px", textTransform: "uppercase", transition: "all 0.15s", background: i === step ? T.accent : i < step ? T.greenBg : T.bg, color: i === step ? T.accentText : i < step ? T.green : T.text3 }),
    card: { background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "1.1rem 1.25rem", marginBottom: "0.85rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" },
    label: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: T.text3, marginBottom: 8 },
    input: { width: "100%", padding: "9px 11px", border: `1px solid ${T.border2}`, borderRadius: T.radiusSm, fontFamily: "inherit", fontSize: 13, outline: "none", background: "#FAFAF8", color: T.text, boxSizing: "border-box" },
    btnDark: { background: T.accent, color: T.accentText, border: "none", borderRadius: T.radiusSm, padding: "9px 18px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 },
    btnLight: { background: "none", color: T.text2, border: `1px solid ${T.border2}`, borderRadius: T.radiusSm, padding: "9px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
    btnGhost: { background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 },
    navRow: { display: "flex", gap: 8, marginTop: "1rem" },
    dropzone: (over) => ({ border: `2px dashed ${over ? T.accent : T.border2}`, borderRadius: T.radius, padding: "2.5rem 1rem", textAlign: "center", cursor: "pointer", transition: "all 0.15s", background: over ? "#F0EFE9" : T.bg }),
    tag: (color) => ({ display: "inline-flex", alignItems: "center", gap: 5, background: color + "15", border: `1px solid ${color}35`, borderRadius: 20, padding: "5px 10px 5px 7px", fontSize: 13, color: T.text }),
    xBtn: (marked) => ({ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${marked ? T.accent : T.border2}`, background: marked ? T.accent : "none", color: marked ? T.accentText : T.text3, cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 700, transition: "all 0.12s" }),
    prow: { display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", color: T.text2 },
    prowFinal: { display: "flex", justifyContent: "space-between", fontSize: 16, padding: "10px 0 3px", color: T.text, fontWeight: 700, borderTop: `1px solid ${T.border}`, marginTop: 6 },
    totalsBox: { background: T.bg, borderRadius: T.radiusSm, padding: "0.85rem 1rem", marginTop: "0.85rem" },
    saveBadge: { background: T.greenBg, color: T.green, borderRadius: 6, fontSize: 11, padding: "2px 7px", marginLeft: 7, fontWeight: 600 },
    detailRow: { display: "flex", justifyContent: "space-between", fontSize: 12, color: T.text2, padding: "2px 0" },
    detailSub: { display: "flex", justifyContent: "space-between", fontSize: 13, color: T.text, padding: "6px 0 2px", borderTop: `1px solid ${T.border}`, marginTop: 4 },
    avatar: (c) => ({ width: 38, height: 38, borderRadius: "50%", background: c + "20", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: c, flexShrink: 0, border: `2px solid ${c}35` }),
    th: { textAlign: "left", fontWeight: 600, fontSize: 10, color: T.text3, padding: "6px 8px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.4px" },
    td: { padding: "7px 8px", borderBottom: `1px solid ${T.bg}`, verticalAlign: "middle" },
  };

  const scansLeft = SCAN_LIMIT - scanCount;
  const limitReached = scansLeft <= 0;

  const renderStep0 = () => (
    <div>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={s.label}>📷 Foto de la boleta</div>
          <div style={{ fontSize: 11, color: limitReached ? T.red : scansLeft <= 2 ? T.orange : T.text3, fontWeight: 600 }}>
            {limitReached ? "Límite alcanzado" : `${scansLeft} escaneo${scansLeft !== 1 ? "s" : ""} gratis restante${scansLeft !== 1 ? "s" : ""}`}
          </div>
        </div>
        {!imgPreview ? (
          <div style={{ ...s.dropzone(dragOver && !limitReached), opacity: limitReached ? 0.5 : 1, cursor: limitReached ? "not-allowed" : "pointer" }}
            onDragOver={e => { if (!limitReached) { e.preventDefault(); setDragOver(true); } }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (!limitReached) processFile(e.dataTransfer.files[0]); }}
            onClick={() => !limitReached && fileRef.current.click()}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🧾</div>
            <p style={{ fontSize: 14, color: T.text2, margin: 0, fontWeight: 500 }}>{limitReached ? "Alcanzaste el límite de 5 escaneos gratis" : "Sube la foto de la cuenta"}</p>
            <p style={{ fontSize: 12, color: T.text3, marginTop: 5, marginBottom: 0 }}>{limitReached ? "Próximamente plan premium" : "La IA detecta items, propina y descuento"}</p>
          </div>
        ) : (
          <div style={{ position: "relative", marginBottom: "0.75rem" }}>
            <img src={imgPreview} alt="Boleta" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, display: "block" }} />
            <button style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, padding: "4px 9px", cursor: "pointer", fontFamily: "inherit" }}
              onClick={() => { setImgPreview(null); setItems([]); setScanDone(false); setAiDetected(null); fileRef.current.value = ""; }}>✕ Quitar</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
        {aiLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0.85rem 0 0.25rem", color: T.text2, fontSize: 13 }}>
            <div style={{ width: 18, height: 18, border: `2.5px solid ${T.border2}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
            Analizando boleta...
          </div>
        )}
      </div>

      {(items.length > 0 || scanDone) && (
        <div style={s.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div style={s.label}>{scanDone ? `✅ ${items.length} items detectados` : "Items"}</div>
            <button style={{ ...s.btnLight, padding: "5px 11px", fontSize: 12 }} onClick={addManualItem}>+ Agregar</button>
          </div>
          {items.map((it, idx) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: idx < items.length - 1 ? `1px solid ${T.bg}` : "none" }}>
              {editingId === it.id ? (
                <>
                  <input style={{ ...s.input, flex: 1, fontSize: 13, padding: "6px 8px" }} value={editVal.name} onChange={e => setEditVal(v => ({ ...v, name: e.target.value }))} onKeyDown={e => e.key === "Enter" && saveEdit()} autoFocus />
                  <input style={{ ...s.input, width: 100, fontSize: 13, padding: "6px 8px" }} type="number" value={editVal.price} onChange={e => setEditVal(v => ({ ...v, price: e.target.value }))} onKeyDown={e => e.key === "Enter" && saveEdit()} />
                  <button style={{ ...s.btnDark, padding: "6px 12px", fontSize: 12 }} onClick={saveEdit}>OK</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 13, color: T.text }}>{it.qty > 1 && <span style={{ fontSize: 11, color: T.text3, marginRight: 4 }}>{it.qty}×</span>}{it.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, minWidth: 72, textAlign: "right" }}>{fmtCLP(it.price)}</span>
                  <button style={{ ...s.btnGhost, color: T.text3, fontSize: 15, padding: "0 2px" }} onClick={() => startEdit(it)}>✏️</button>
                  <button style={{ ...s.btnGhost, color: T.red, fontSize: 15, padding: "0 2px" }} onClick={() => removeItem(it.id)}>🗑</button>
                </>
              )}
            </div>
          ))}
          <div style={{ ...s.totalsBox, marginTop: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 600, color: T.text }}>
              <span>Subtotal</span><span>{fmtCLP(subtotal)}</span>
            </div>
          </div>
        </div>
      )}

      <div style={s.navRow}>
        <button style={{ ...s.btnDark, flex: 1, opacity: items.length === 0 ? 0.45 : 1 }} onClick={() => items.length > 0 && setStep(1)}>
          Siguiente: propina y descuento →
        </button>
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div>
      <div style={s.card}>
        <div style={s.label}>🏷️ Propina y descuento</div>
        {aiDetected && (
          <div style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 10, padding: "0.6rem 0.9rem", marginBottom: "0.85rem", fontSize: 12, color: T.green, display: "flex", gap: 8 }}>
            <span>🤖</span>
            <span><strong>Detectado automáticamente:</strong>{aiDetected.propina > 0 && ` propina ${aiDetected.propina}%`}{aiDetected.descuento > 0 && `, descuento ${aiDetected.descuento}%`}{aiDetected.descMode === "subtotal" && " · propina sobre monto original"}. Ajusta si necesitas.</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[["% Propina", propina, setPropina], ["% Descuento", descuento, setDescuento]].map(([lbl, val, setter]) => (
            <div key={lbl} style={{ background: T.bg, borderRadius: T.radiusSm, padding: "0.75rem 1rem" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", color: T.text3, marginBottom: 8 }}>{lbl}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input style={{ ...s.input, width: 75 }} type="number" min="0" max="100" value={val} onChange={e => setter(Number(e.target.value))} />
                <span style={{ fontSize: 13, color: T.text2 }}>%</span>
              </div>
            </div>
          ))}
        </div>
        {descuento > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", color: T.text3, marginBottom: 7 }}>¿Cómo aplica el descuento?</div>
            <div style={{ display: "flex", border: `1px solid ${T.border2}`, borderRadius: T.radiusSm, overflow: "hidden" }}>
              {[["total", "Descuento sobre todo\n(incl. propina)"], ["subtotal", "Propina sobre original\ndescuento al consumo"]].map(([mode, lbl]) => (
                <button key={mode} style={{ flex: 1, padding: "9px 8px", fontSize: 12, background: descMode === mode ? T.orangeBg : "none", border: "none", borderLeft: mode === "subtotal" ? `1px solid ${T.border2}` : "none", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4, color: descMode === mode ? T.orange : T.text2, fontWeight: descMode === mode ? 600 : 400 }} onClick={() => setDescMode(mode)}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={s.totalsBox}>
          <div style={s.prow}><span>Subtotal</span><span>{fmtCLP(subtotal)}</span></div>
          {propinaMonto > 0 && <div style={s.prow}><span>Propina ({propina}%)</span><span>+ {fmtCLP(propinaMonto)}</span></div>}
          {descuentoMonto > 0 && <div style={{ ...s.prow, color: T.green }}><span>Descuento ({descuento}%)</span><span>− {fmtCLP(descuentoMonto)}</span></div>}
          <div style={s.prowFinal}>
            <span>Total a pagar</span>
            <span>{fmtCLP(grandTotal)}{descuentoMonto > 0 && <span style={s.saveBadge}>Ahorro {fmtCLP(descuentoMonto)}</span>}</span>
          </div>
        </div>
      </div>
      <div style={s.navRow}>
        <button style={s.btnLight} onClick={() => setStep(0)}>← Volver</button>
        <button style={{ ...s.btnDark, flex: 1 }} onClick={() => setStep(2)}>Siguiente: personas →</button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <div style={s.card}>
        <div style={s.label}>👥 ¿Quiénes dividen?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "0.85rem" }}>
          {members.map((m, i) => (
            <div key={m} style={s.tag(COLORS[i % COLORS.length])}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: COLORS[i % COLORS.length] + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: COLORS[i % COLORS.length] }}>{m[0].toUpperCase()}</div>
              <span>{m}</span>
              <button style={{ ...s.btnGhost, color: T.red, fontSize: 14, marginLeft: 2 }} onClick={() => removeMember(m)}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={s.input} placeholder="Nombre" value={newMember} onChange={e => setNewMember(e.target.value)} onKeyDown={e => e.key === "Enter" && addMember()} />
          <button style={s.btnDark} onClick={addMember}>+ Agregar</button>
        </div>
      </div>
      <div style={s.navRow}>
        <button style={s.btnLight} onClick={() => setStep(1)}>← Volver</button>
        <button style={{ ...s.btnDark, flex: 1, opacity: members.length < 2 ? 0.45 : 1 }} onClick={() => members.length >= 2 && setStep(3)}>Siguiente: marcar →</button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      <div style={{ ...s.card, padding: "0.85rem 0.75rem", overflowX: "auto" }}>
        <div style={{ ...s.label, padding: "0 0.5rem 0.5rem" }}>☑️ ¿Quién consumió qué?</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...s.th, minWidth: 130 }}>Item</th>
              <th style={s.th}>$</th>
              {members.map((m, i) => <th key={m} style={{ ...s.th, textAlign: "center", minWidth: 52, color: COLORS[i % COLORS.length] }}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                <td style={{ ...s.td, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.name}>{it.name}</td>
                <td style={{ ...s.td, fontSize: 12, whiteSpace: "nowrap", color: T.text2 }}>{fmtCLP(it.price)}</td>
                {members.map(m => (
                  <td key={m} style={{ ...s.td, textAlign: "center" }}>
                    <button style={s.xBtn(marks[it.id]?.[m])} onClick={() => toggleMark(it.id, m)}>{marks[it.id]?.[m] ? "✓" : ""}</button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={s.navRow}>
        <button style={s.btnLight} onClick={() => setStep(2)}>← Volver</button>
        <button style={{ ...s.btnDark, flex: 1 }} onClick={() => setStep(4)}>Ver resultado →</button>
      </div>
    </div>
  );

  const renderStep4 = () => {
    const raw = getRawTotals();
    return (
      <div>
        <div style={{ ...s.totalsBox, background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius, marginBottom: "0.85rem", padding: "1rem 1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: T.text3, marginBottom: 8 }}>🧮 Resumen</div>
          <div style={s.prow}><span>Subtotal</span><span>{fmtCLP(subtotal)}</span></div>
          {propinaMonto > 0 && <div style={s.prow}><span>Propina ({propina}%)</span><span>+ {fmtCLP(propinaMonto)}</span></div>}
          {descuentoMonto > 0 && <div style={{ ...s.prow, color: T.green }}><span>Descuento ({descuento}%)</span><span>− {fmtCLP(descuentoMonto)}</span></div>}
          <div style={s.prowFinal}><span>Total a pagar</span><span>{fmtCLP(grandTotal)}</span></div>
        </div>

        {members.map((m, i) => {
          const rawM = raw[m] || 0;
          const final = getFinalTotal(rawM);
          const myItems = items.filter(it => marks[it.id]?.[m]);
          const color = COLORS[i % COLORS.length];
          return (
            <div key={m} style={{ ...s.card, borderLeft: `3px solid ${color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: myItems.length ? "0.5rem" : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={s.avatar(color)}>{m.slice(0, 2).toUpperCase()}</div>
                  <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{m}</span>
                </div>
                <span style={{ fontSize: 24, fontWeight: 700, color }}>{fmtCLP(final)}</span>
              </div>
              {myItems.length > 0 && (
                <div style={{ borderTop: `1px solid ${T.bg}`, paddingTop: "0.5rem" }}>
                  {myItems.map(it => { const pp = members.filter(mm => marks[it.id]?.[mm]); return (<div key={it.id} style={s.detailRow}><span>{it.name}{pp.length > 1 ? ` ÷${pp.length}` : ""}</span><span>{fmtCLP(it.price / pp.length)}</span></div>); })}
                  {rawM > 0 && descuento > 0 && descMode === "total" && (<><div style={s.detailSub}><span>Subtotal</span><span>{fmtCLP(rawM)}</span></div><div style={s.detailRow}><span>+ Propina ({propina}%)</span><span>+ {fmtCLP(rawM * propinaFactor)}</span></div><div style={{ ...s.detailRow, color: T.green }}><span>− Descuento ({descuento}%)</span><span>− {fmtCLP(rawM * (1 + propinaFactor) * descFactor)}</span></div></>)}
                  {rawM > 0 && descuento > 0 && descMode === "subtotal" && (<><div style={s.detailSub}><span>Subtotal</span><span>{fmtCLP(rawM)}</span></div><div style={{ ...s.detailRow, color: T.green }}><span>− Descuento ({descuento}%)</span><span>− {fmtCLP(rawM * descFactor)}</span></div><div style={s.detailRow}><span>+ Propina ({propina}% del original)</span><span>+ {fmtCLP(rawM * propinaFactor)}</span></div></>)}
                  {rawM > 0 && descuento === 0 && propina > 0 && (<div style={s.detailSub}><span>Con propina ({propina}%)</span><span>{fmtCLP(final)}</span></div>)}
                </div>
              )}
              {myItems.length === 0 && <p style={{ fontSize: 12, color: T.text3, margin: "4px 0 0" }}>No marcó ningún item</p>}
            </div>
          );
        })}

        <div style={s.navRow}>
          <button style={s.btnLight} onClick={() => setStep(3)}>← Ajustar</button>
          <button style={{ ...s.btnDark, flex: 1 }} onClick={copyResult}>{copied ? "✓ ¡Copiado!" : "📋 Copiar para WhatsApp"}</button>
        </div>
      </div>
    );
  };

  const panels = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div style={s.app}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>
      <div style={{ textAlign: "center", marginBottom: "0.25rem" }}>
        <h1 style={s.h1}>✨ Split Sin Drama</h1>
        <p style={s.sub}>Sube la boleta · IA extrae todo · divide sin pelea</p>
      </div>
      <div style={s.stepBar}>{STEPS.map((name, i) => <button key={name} style={s.stepBtn(i)} onClick={() => setStep(i)}>{name}</button>)}</div>
      {panels[step]()}
    </div>
  );
}
