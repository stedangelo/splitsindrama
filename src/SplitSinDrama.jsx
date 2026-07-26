import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabase";
import heic2any from "heic2any";

// Parsea el texto OCR de una boleta chilena
function parseBoleta(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items = [];

  // Palabras a ignorar (no son ítems consumibles)
  const SKIP = /propina|tip|descuento|discount|subtotal|total|iva|servicio|boleta|folio|rut|fecha|hora|mesa|garzón|garzon|caja|ticket|gracias|vuelto|efectivo|tarjeta|débito|credito|transbank|propina\s*sugerida/i;

  for (const line of lines) {
    if (SKIP.test(line)) continue;

    // Busca precio al final de la línea: $1.990 o 1990 o 1.990
    const priceMatch = line.match(/\$?\s*([\d]{1,3}(?:[.,]\d{3})+|\d{3,6})[\s]*$/);
    if (!priceMatch) continue;

    const priceRaw = priceMatch[1].replace(/[.,]/g, "");
    const price = parseInt(priceRaw);
    if (!price || price < 100 || price > 500000) continue; // filtro de precios razonables

    // Nombre: todo lo que está antes del precio
    let name = line.slice(0, line.lastIndexOf(priceMatch[0])).trim();

    // Detectar cantidad al inicio: "2x", "x2", "2 x", "2-"
    let qty = 1;
    const qtyMatch = name.match(/^(\d+)\s*[xX\-]\s*/);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1]) || 1;
      name = name.slice(qtyMatch[0].length).trim();
    }

    // Limpiar prefijos comunes
    name = name.replace(/^(JM:|Agr\.?|AGR\.?)\s*/i, "").trim();

    if (!name || name.length < 2) continue;

    items.push({ name, qty, price });
  }

  return items;
}

const STEPS = ["Cuenta", "Ajustes", "Reparto", "Resultado"];
const FREE_SCANS = 99999;
const MP_PAYMENT_LINK = "https://link.mercadopago.cl/donc3lla";
const PACKS = [
  { id: "starter", label: "Starter", scans: 5,  price: 990  },
  { id: "popular", label: "Popular", scans: 15, price: 1990, highlight: true },
  { id: "full",    label: "Full",    scans: 35, price: 3490 },
];
const PCOLORS = ['#2563FF','#9333EA','#2FB877','#E8B23A','#EC4899','#06B6D4','#F97316','#8B5CF6'];

const fmtCLP = (n) => "$" + Math.round(n).toLocaleString("es-CL");
const fmtNum = (n) => Math.round(n).toLocaleString("es-CL");
const initials = (n) => n.trim().slice(0, 2).toUpperCase();
const pcolor = (i) => PCOLORS[i % PCOLORS.length];

// Design tokens
const T = {
  bg: "#0A0A0A", surface: "#141414", surface2: "#1A1A1A", surface3: "#202020",
  border: "rgba(255,255,255,.08)", borderStrong: "rgba(255,255,255,.14)",
  borderAccent: "rgba(37,99,255,.55)",
  text: "#FAFAFA", textDim: "#A0A0A0", textFaint: "#6B6B6B",
  accent: "#2563FF", accentHi: "#4F82FF", accentSoft: "rgba(37,99,255,.14)",
  accentGlow: "rgba(37,99,255,.45)",
  ok: "#2FB877", warn: "#E8B23A",
  radius: 16, radiusSm: 11, radiusLg: 22,
};

// Shared styles
const btnPrimary = {
  display: "inline-flex", alignItems: "center", gap: 8,
  fontSize: 14.5, fontWeight: 600, padding: "12px 20px", borderRadius: T.radiusSm,
  background: T.accent, color: "#fff", border: "none", cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: `0 0 0 1px rgba(255,255,255,.1) inset, 0 6px 20px -6px ${T.accentGlow}`,
  transition: "background .2s, box-shadow .25s, transform .15s",
};
const btnGhost = {
  display: "inline-flex", alignItems: "center", gap: 8,
  fontSize: 14.5, fontWeight: 600, padding: "12px 20px", borderRadius: T.radiusSm,
  background: "none", color: T.textDim, border: `1px solid ${T.border}`,
  cursor: "pointer", fontFamily: "inherit",
  transition: "background .2s, color .2s, border-color .2s",
};

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ArrowLeft = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M19 12H5m0 0 6 6m-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function SplitSinDrama({ user }) {
  const [step, setStep] = useState(0);
  const [scanCount, setScanCount] = useState(0);
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [marks, setMarks] = useState({});
  const [tip, setTip] = useState(10);
  const [disc, setDisc] = useState(0);
  const [discMode, setDiscMode] = useState("sin");
  const [newMember, setNewMember] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDetected, setAiDetected] = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [scanDone, setScanDone] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: "" });
  const [copied, setCopied] = useState({});
  const [salaId, setSalaId] = useState(null);
  const [salaLoading, setSalaLoading] = useState(false);
  const [purchasedCredits, setPurchasedCredits] = useState(0);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const savedHistoryRef = useRef(false);
  const lastScanRef = useRef(null);
  const [scanError, setScanError] = useState(false);
  const fileRef = useRef();
  let toastTimer = useRef();

  useEffect(() => {
    supabase.from("scans").select("id", { count: "exact" }).eq("user_id", user.id)
      .then(({ count }) => setScanCount(count || 0));
    supabase.from("subscriptions").select("credits").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setPurchasedCredits(data.credits || 0); });
    supabase.from("sessions").select("*").eq("owner_id", user.id)
      .order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistory(data || []));
  }, [user.id]);

  const loadFromHistory = (sess) => {
    const rawMarks = sess.marks || {};
    const restoredMarks = {};
    for (const [k, v] of Object.entries(rawMarks)) restoredMarks[k] = new Set(v);
    setItems(sess.items || []);
    setMembers(sess.members || []);
    setMarks(restoredMarks);
    setTip(sess.tip ?? 10);
    setDisc(sess.disc ?? 0);
    setDiscMode(sess.disc_mode || "sin");
    setSalaId(null);
    savedHistoryRef.current = true;
    setShowHistory(false);
    setStep(3);
  };

  const computeHistPerPerson = (sess) => {
    const its = sess.items || [];
    const mems = sess.members || [];
    const mkrks = sess.marks || {};
    const sub = its.reduce((s, i) => s + i.price, 0);
    const dAmt = sub * (sess.disc || 0) / 100;
    const tipBase = sess.disc_mode === "con" ? sub - dAmt : sub;
    const g = sub - dAmt + tipBase * (sess.tip || 0) / 100;
    const factor = sub > 0 ? g / sub : 0;
    return mems.map(m => {
      let base = 0;
      its.forEach(it => {
        const arr = mkrks[String(it.id)] || [];
        if (arr.includes(m.id) && arr.length > 0) base += it.price / arr.length;
      });
      return { name: m.name, final: base * factor };
    });
  };

  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast({ show: true, msg });
    toastTimer.current = setTimeout(() => setToast({ show: false, msg: "" }), 2200);
  };

  const serializeMarks = (m) => {
    const out = {};
    for (const [k, v] of Object.entries(m)) out[k] = [...v];
    return out;
  };

  const deserializeMarks = (raw) => {
    const next = {};
    for (const [k, v] of Object.entries(raw || {})) next[k] = new Set(v);
    return next;
  };

  const createSala = async () => {
    setSalaLoading(true);
    try {
      const serialized = serializeMarks(marks);
      const { data, error } = await supabase.from("sessions").insert({
        owner_id: user.id,
        items,
        members,
        marks: serialized,
        tip,
        disc,
        disc_mode: discMode,
      }).select("id, marks").single();
      if (error) throw error;
      // Restore marks from DB response to avoid any React state race
      setMarks(deserializeMarks(data.marks || {}));
      setSalaId(data.id);
    } catch (e) {
      console.error(e);
      showToast("Error al crear sala — intenta de nuevo");
    }
    setSalaLoading(false);
  };

  // Sync marks from sala in real-time (host view) — delay avoids INSERT echo
  useEffect(() => {
    if (!salaId) return;
    let channel;
    const timer = setTimeout(() => {
      channel = supabase
        .channel(`host-${salaId}`)
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${salaId}`
        }, payload => {
          setMarks(deserializeMarks(payload.new.marks || {}));
        })
        .subscribe();
    }, 800);
    return () => { clearTimeout(timer); if (channel) supabase.removeChannel(channel); };
  }, [salaId]);

  // Totals engine
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const discAmt = subtotal * disc / 100;
  const tipBase = discMode === "con" ? subtotal - discAmt : subtotal;
  const tipAmt = tipBase * tip / 100;
  const grand = subtotal - discAmt + tipAmt;
  const factor = subtotal > 0 ? grand / subtotal : 0;

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

  // Scan con Groq vision IA
  const analyzeImage = useCallback(async (base64, mimeType) => {
    setAiLoading(true);
    setScanDone(false);
    setScanError(false);
    lastScanRef.current = { base64, mimeType };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        showToast("Error al leer la boleta — intenta de nuevo");
        setAiLoading(false);
        return;
      }

      const data = await res.json();
      const text = (data.content || []).map(b => b.text || "").join("").trim();
      console.log("Respuesta IA:", text.slice(0, 400));
      const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(clean);
      } catch {
        showToast("No se pudo leer la boleta — intenta con otra foto");
        setAiLoading(false);
        return;
      }

      if (parsed.items?.length > 0) {
        await supabase.from("scans").insert({ user_id: user.id });
        setScanCount(c => c + 1);
        setItems(parsed.items.map(it => ({ id: Date.now() + Math.random(), name: it.name, qty: it.qty || 1, price: Number(it.price) || 0 })));
        if (typeof parsed.propina === "number") setTip(parsed.propina);
        if (typeof parsed.descuento === "number") setDisc(parsed.descuento);
        if (parsed.descMode) setDiscMode(parsed.descMode === "subtotal" ? "con" : "sin");
        if (parsed.propina > 0 || parsed.descuento > 0) setAiDetected({ propina: parsed.propina, descuento: parsed.descuento });
        setScanDone(true);
        showToast(`Boleta lista · ${parsed.items.length} ítems detectados`);
      } else {
        showToast("No se detectaron ítems — intenta con otra foto");
      }
    } catch (e) {
      console.error(e);
      const msg = e.name === "AbortError" ? "Tiempo de espera agotado — intenta de nuevo" : "Error al procesar — intenta de nuevo";
      showToast(msg);
      setScanError(true);
    } finally {
      setAiLoading(false);
    }
  }, [scanCount, user.id]);

  const processFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name?.split(".").pop()?.toLowerCase() || "";
    const isHeic = file.type === "image/heic" || file.type === "image/heif" || ext === "heic" || ext === "heif";
    const isImage = file.type.startsWith("image/") || ["heic", "heif", "jpg", "jpeg", "png", "webp"].includes(ext);
    if (!isImage) return;
    setItems([]); setScanDone(false); setAiLoading(true);

    try {
      let blob = file;
      if (isHeic) {
        blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
        if (Array.isArray(blob)) blob = blob[0];
      }

      let bitmap;
      try {
        bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      } catch {
        // Safari/iOS fallback sin imageOrientation
        bitmap = await createImageBitmap(blob);
      }

      const MAX = 1200;
      let w = bitmap.width, h = bitmap.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.filter = "grayscale(1) contrast(1.5) brightness(1.05)";
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const jpeg = canvas.toDataURL("image/jpeg", 0.82);
      setImgPreview(canvas.toDataURL("image/jpeg", 0.6));
      analyzeImage(jpeg.split(",")[1], "image/jpeg");
    } catch (err) {
      console.error("Error procesando imagen:", err);
      showToast(`Error: ${err.message || "No se pudo leer la imagen"}`);
      setAiLoading(false);
    }
  }, [analyzeImage]);

  const removeItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setMarks(prev => { const m = { ...prev }; delete m[id]; return m; });
  };
  const addManualItem = () => {
    const it = { id: Date.now() + Math.random(), name: "Nuevo ítem", qty: 1, price: 0 };
    setItems(prev => [...prev, it]);
    setMarks(prev => ({ ...prev, [it.id]: new Set() }));
  };
  const updateItem = (id, field, val) => {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: val } : it));
  };

  const addMember = (e) => {
    e?.preventDefault();
    if (!newMember.trim() || members.find(m => m.name === newMember.trim())) return;
    const id = Date.now();
    setMembers(prev => [...prev, { id, name: newMember.trim() }]);
    setNewMember("");
  };
  const removeMember = (id) => {
    setMembers(prev => prev.filter(m => m.id !== id));
    setMarks(prev => {
      const m = { ...prev };
      Object.keys(m).forEach(k => { const s = new Set(m[k]); s.delete(id); m[k] = s; });
      return m;
    });
  };
  const toggleMark = (itemId, personId) => {
    setMarks(prev => {
      const set = new Set(prev[itemId] || []);
      set.has(personId) ? set.delete(personId) : set.add(personId);
      const next = { ...prev, [itemId]: set };
      if (salaId) {
        const serialized = {};
        for (const [k, v] of Object.entries(next)) serialized[k] = [...v];
        supabase.from("sessions").update({ marks: serialized }).eq("id", salaId);
      }
      return next;
    });
  };

  const copyAll = () => {
    const per = getPerPerson();
    let msg = `🧾 *La cuenta — Split Sin Drama*\nTotal: ${fmtCLP(grand)}\n\n`;
    members.forEach(m => { msg += `${m.name}: ${fmtCLP(per[m.id].final)}\n`; });
    msg += `\nIncluye propina ${tip}%${disc > 0 ? ` · descuento ${disc}%` : ""} 🙌`;
    navigator.clipboard.writeText(msg).then(() => showToast("Resumen del grupo copiado"));
  };

  const copyPerson = (m) => {
    const per = getPerPerson();
    const myItems = items.filter(it => marks[it.id]?.has(m.id));
    let msg = `💸 ${m.name}, te toca ${fmtCLP(per[m.id].final)}\n`;
    myItems.forEach(it => { const sh = it.price / marks[it.id].size; msg += `• ${it.name} — ${fmtCLP(sh)}\n`; });
    msg += `(incluye propina ${tip}%${disc > 0 ? ` y descuento ${disc}%` : ""})\n— vía Split Sin Drama`;
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(prev => ({ ...prev, [m.id]: true }));
      setTimeout(() => setCopied(prev => ({ ...prev, [m.id]: false })), 1900);
    });
  };

  const totalScans = FREE_SCANS + purchasedCredits;
  const scansLeft = Math.max(0, totalScans - scanCount);
  const limitReached = scanCount >= totalScans;

  // ─── PAYWALL ──────────────────────────────────────────────
  const renderPaywall = () => (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "32px 16px" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: T.accentSoft, display: "grid", placeItems: "center", marginBottom: 18, color: T.accentHi }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 8 }}>Tus 3 escaneos gratis se acabaron</h2>
      <p style={{ color: T.textDim, fontSize: 14.5, maxWidth: "36ch", marginBottom: 28, lineHeight: 1.6 }}>
        Compra un pack de créditos — no vencen nunca, los usas cuando quieras.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 380, marginBottom: 16 }}>
        {PACKS.map(pack => (
          <a
            key={pack.id}
            href={`${MP_PAYMENT_LINK}?amount=${pack.price}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 20px", borderRadius: T.radius, textDecoration: "none",
              border: `1.5px solid ${pack.highlight ? T.borderAccent : T.border}`,
              background: pack.highlight ? T.accentSoft : T.surface,
              transition: ".15s",
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{pack.scans} escaneos</div>
              <div style={{ fontSize: 12.5, color: pack.highlight ? T.accentHi : T.textFaint, marginTop: 2 }}>
                {pack.highlight ? "⭐ Más popular" : `${fmtCLP(Math.round(pack.price / pack.scans))}/scan`}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: pack.highlight ? T.accentHi : T.text }}>{fmtCLP(pack.price)}</div>
              <div style={{ background: "#009ee3", color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Pagar</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );

  // ─── STEP 0: CUENTA ───────────────────────────────────────
  const renderCuenta = () => (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: T.accentHi, marginBottom: 8 }}>Paso 1 · La cuenta</div>
        <h2 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 7, color: T.text }}>Sube la boleta</h2>
        <p style={{ color: T.textDim, fontSize: 15, maxWidth: "54ch" }}>Saca una foto o arrastra la imagen. La IA detecta cada ítem y su precio automáticamente — tú solo revisas.</p>
      </div>

      {!imgPreview ? (
        <div
          onClick={() => !limitReached && fileRef.current.click()}
          onDragOver={e => { if (!limitReached) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!limitReached) processFile(e.dataTransfer.files[0]); }}
          style={{
            border: `1.5px dashed ${dragOver ? T.accent : T.borderStrong}`,
            borderRadius: T.radius, background: dragOver ? T.accentSoft : T.surface,
            padding: "42px 28px", textAlign: "center", cursor: limitReached ? "not-allowed" : "pointer",
            transition: "border-color .25s, background .25s",
            opacity: limitReached ? 0.5 : 1,
          }}>
          <div style={{
            width: 52, height: 52, margin: "0 auto 16px", borderRadius: 14,
            display: "grid", placeItems: "center",
            background: T.accentSoft, color: T.accentHi,
          }}>
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none">
              <path d="M12 16V5m0 0L8 9m4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: T.text }}>
            {limitReached ? "Alcanzaste el límite de 3 escaneos gratis" : "Arrastra la foto de la boleta"}
          </h3>
          <p style={{ color: T.textDim, fontSize: 13.5 }}>
            {limitReached ? "Próximamente plan premium" : "o haz clic para tomar una foto"}
          </p>
          {!limitReached && (
            <div style={{ color: T.textFaint, fontSize: 12, marginTop: 14 }}>
              Formatos{" "}
              {["JPG", "PNG", "HEIC"].map(f => (
                <span key={f} style={{ display: "inline-block", background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 6, padding: "1px 7px", fontSize: 11.5, color: T.textDim, marginLeft: 4 }}>{f}</span>
              ))}
              {" "}· máx 10 MB · <span style={{ color: scansLeft <= 1 ? T.warn : T.textFaint }}>{scansLeft} escaneo{scansLeft !== 1 ? "s" : ""} restante{scansLeft !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>
      ) : (
        <>
          {aiLoading ? (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "44px 28px", textAlign: "center" }}>
              <div style={{ width: 120, height: 150, margin: "0 auto 22px", borderRadius: 10, position: "relative", background: "#0E0E0E", border: `1px solid ${T.borderStrong}`, overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 14, display: "flex", flexDirection: "column", gap: 7 }}>
                  {[90,60,80,45,75,55,85,40,70].map((w, i) => <i key={i} style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,.1)", display: "block", width: `${w}%` }} />)}
                </div>
                <div style={{ position: "absolute", left: 0, right: 0, height: 36, background: "linear-gradient(transparent, rgba(37,99,255,.28), transparent)", borderTop: `1.5px solid ${T.accentHi}`, animation: "scan 1.3s cubic-bezier(.22,.61,.36,1) infinite" }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Leyendo la boleta…</h3>
              <p style={{ color: T.textDim, fontSize: 13.5, marginBottom: 16 }}>La IA está reconociendo los ítems y precios</p>
              <button onClick={() => { setAiLoading(false); setImgPreview(null); setItems([]); setScanDone(false); if (fileRef.current) fileRef.current.value = ""; }} style={{ fontSize: 13, color: T.textDim, padding: "8px 16px", borderRadius: 9, border: `1px solid ${T.border}`, background: "none", cursor: "pointer", fontFamily: "inherit" }}>
                Cancelar
              </button>
            </div>
          ) : (
            <>
              {scanError && !scanDone ? (
                <div style={{ background: "rgba(220,60,60,.08)", border: "1px solid rgba(220,60,60,.3)", borderRadius: T.radius, padding: "18px 20px", marginBottom: 18, display: "flex", alignItems: "center", gap: 14 }}>
                  <img src={imgPreview} alt="Boleta" style={{ width: 46, height: 58, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `1px solid rgba(220,60,60,.4)` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#f87171" }}>No se pudo leer la boleta</div>
                    <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 3 }}>Puede ser timeout o mala calidad. Intenta de nuevo.</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <button onClick={() => lastScanRef.current && analyzeImage(lastScanRef.current.base64, lastScanRef.current.mimeType)} style={{ fontSize: 13, fontWeight: 600, color: "#fff", padding: "9px 14px", borderRadius: 9, border: "none", background: T.accent, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      Reintentar
                    </button>
                    <button onClick={() => { setImgPreview(null); setItems([]); setScanDone(false); setScanError(false); setAiDetected(null); fileRef.current.value = ""; }} style={{ fontSize: 12, color: T.textDim, padding: "6px 10px", borderRadius: 9, border: `1px solid ${T.border}`, background: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                      Cambiar foto
                    </button>
                  </div>
                </div>
              ) : (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 14 }}>
                <img src={imgPreview} alt="Boleta" style={{ width: 46, height: 58, borderRadius: 8, objectFit: "cover", flexShrink: 0, border: `1px solid ${T.borderStrong}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    Boleta subida
                    {scanDone && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: T.accentHi, background: T.accentSoft, border: `1px solid ${T.borderAccent}`, padding: "3px 9px", borderRadius: 99 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 2l1.6 4.8L18 8.4l-4.4 1.6L12 15l-1.6-5L6 8.4l4.4-1.6L12 2z" fill="currentColor"/></svg>
                        Detectado con IA
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 3 }}>{items.length} ítems detectados</div>
                </div>
                <button onClick={() => { setImgPreview(null); setItems([]); setScanDone(false); setScanError(false); setAiDetected(null); fileRef.current.value = ""; }} style={{ fontSize: 13, color: T.textDim, fontWeight: 500, padding: "8px 13px", borderRadius: 9, border: `1px solid ${T.border}`, background: "none", cursor: "pointer", fontFamily: "inherit" }}>
                  Cambiar foto
                </button>
              </div>
              )}

              {aiDetected && (
                <div style={{ background: "rgba(47,184,119,.08)", border: "1px solid rgba(47,184,119,.25)", borderRadius: T.radiusSm, padding: "10px 14px", marginBottom: 14, fontSize: 12.5, color: T.ok, display: "flex", gap: 8 }}>
                  <span>🤖</span>
                  <span>Detectado: propina {aiDetected.propina}%{aiDetected.descuento > 0 ? `, descuento ${aiDetected.descuento}%` : ""}. Ajusta en el siguiente paso si es necesario.</span>
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.textDim }}>Ítems detectados <span style={{ fontWeight: 400, color: T.textFaint }}>· toca un dato para corregirlo</span></span>
                <span style={{ fontSize: 12.5, color: T.textFaint, fontFamily: "monospace" }}>PRECIO</span>
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius }}>
                {items.map(it => (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ minWidth: 38, height: 28, borderRadius: 7, padding: "0 5px", display: "flex", alignItems: "center", gap: 2, background: T.surface3, color: T.textDim, fontFamily: "monospace", fontSize: 12.5, fontWeight: 600, border: `1px solid ${T.border}`, flexShrink: 0 }}>
                      <input
                        value={it.qty}
                        inputMode="numeric"
                        onChange={e => updateItem(it.id, "qty", Math.max(1, parseInt(e.target.value.replace(/\D/g,"")) || 1))}
                        style={{ width: 16, background: "none", border: "none", color: "inherit", fontFamily: "monospace", fontSize: 12.5, fontWeight: 600, textAlign: "center", outline: "none", padding: 0 }}
                      />
                      <span style={{ color: T.textFaint }}>×</span>
                    </span>
                    <span style={{ flex: 1 }}>
                      <input
                        value={it.name}
                        onChange={e => updateItem(it.id, "name", e.target.value)}
                        style={{ background: "none", border: `1px solid transparent`, borderRadius: 7, color: T.text, fontSize: 14.5, fontWeight: 500, width: "100%", outline: "none", padding: "5px 8px", margin: "-5px -8px", fontFamily: "inherit", transition: "border-color .15s, background .15s" }}
                      />
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 1, fontFamily: "monospace", fontSize: 14, fontWeight: 500, border: `1px solid transparent`, borderRadius: 7, padding: "5px 8px", cursor: "text" }}>
                      <span style={{ color: T.textFaint }}>$</span>
                      <input
                        value={fmtNum(it.price)}
                        inputMode="numeric"
                        onChange={e => updateItem(it.id, "price", parseInt(e.target.value.replace(/\D/g,"")) || 0)}
                        style={{ background: "none", border: "none", color: T.text, fontFamily: "monospace", fontSize: 14, width: 80, textAlign: "right", outline: "none" }}
                      />
                    </span>
                    <button onClick={() => removeItem(it.id)} style={{ width: 26, height: 26, borderRadius: 7, display: "grid", placeItems: "center", color: T.textFaint, background: "none", border: "none", cursor: "pointer", flexShrink: 0, transition: "background .15s, color .15s" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
                <button onClick={addManualItem} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "13px 16px", color: T.textDim, fontSize: 14, fontWeight: 500, background: "none", border: "none", borderTop: `1px solid ${T.border}`, cursor: "pointer", fontFamily: "inherit", transition: "background .15s, color .15s" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
                  Agregar ítem manualmente
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, padding: "16px 18px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm }}>
                <span style={{ fontSize: 14, color: T.textDim, fontWeight: 500 }}>Subtotal de la boleta</span>
                <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 600 }}>{fmtCLP(subtotal)}</span>
              </div>
            </>
          )}
        </>
      )}

      <label htmlFor="file-upload" style={{ display: "none" }} />
      <input id="file-upload" ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { processFile(e.target.files[0]); e.target.value = ""; }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 14, marginTop: 28 }}>
        <button style={{ ...btnPrimary, opacity: items.length === 0 ? 0.4 : 1, cursor: items.length === 0 ? "not-allowed" : "pointer" }} onClick={() => items.length > 0 && setStep(1)}>
          Continuar a ajustes <ArrowRight />
        </button>
      </div>
    </div>
  );

  // ─── STEP 1: AJUSTES ──────────────────────────────────────
  const renderAjustes = () => (
    <div>
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: T.accentHi, marginBottom: 8 }}>Paso 2 · Ajustes</div>
        <h2 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 7 }}>Propina y descuentos</h2>
        <p style={{ color: T.textDim, fontSize: 15, maxWidth: "54ch" }}>Define cuánto suman la propina y los descuentos. Se reparten de forma proporcional a lo que pidió cada uno.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 18 }}>
        {[
          { key: "tip", label: "Propina sugerida", desc: "10% es lo habitual en Chile", val: tip, setVal: setTip, presets: [0, 10, 12, 15] },
          { key: "disc", label: "Descuento", desc: "Cupón, happy hour o promo del local", val: disc, setVal: setDisc, presets: [0, 5, 10, 20] },
        ].map(f => (
          <div key={f.key} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 20 }}>
            <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{f.label}</label>
            <div style={{ fontSize: 12.5, color: T.textFaint, marginBottom: 16 }}>{f.desc}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => f.setVal(Math.max(0, f.val - 1))} style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: T.surface2, border: `1px solid ${T.border}`, color: T.textDim, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>−</button>
              <div style={{ flex: 1, textAlign: "center", fontFamily: "monospace", fontSize: 24, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 7 }}>{f.val}%</div>
              <button onClick={() => f.setVal(Math.min(100, f.val + 1))} style={{ width: 38, height: 38, borderRadius: 10, display: "grid", placeItems: "center", background: T.surface2, border: `1px solid ${T.border}`, color: T.textDim, fontSize: 18, cursor: "pointer", flexShrink: 0 }}>+</button>
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
              {f.presets.map(v => (
                <button key={v} onClick={() => f.setVal(v)} style={{ flex: 1, fontSize: 12.5, fontWeight: 500, padding: 7, borderRadius: 8, fontFamily: "monospace", cursor: "pointer", border: `1px solid ${f.val === v ? T.borderAccent : T.border}`, background: f.val === v ? T.accentSoft : T.surface2, color: f.val === v ? T.accentHi : T.textDim }}>
                  {v}%
                </button>
              ))}
            </div>
            {f.key === "disc" && disc > 0 && (
              <>
                <div style={{ fontSize: 11.5, color: T.textFaint, marginTop: 18, marginBottom: 8 }}>El descuento se aplica…</div>
                <div style={{ display: "flex", gap: 7 }}>
                  {[{ k: "sin", t: "Sin propina", s: "no rebaja la propina" }, { k: "con", t: "Incluida propina", s: "también rebaja la propina" }].map(o => (
                    <button key={o.k} onClick={() => setDiscMode(o.k)} style={{ flex: 1, fontSize: 12.5, fontWeight: 500, padding: "10px 8px", borderRadius: 9, lineHeight: 1.25, cursor: "pointer", border: `1px solid ${discMode === o.k ? T.borderAccent : T.border}`, background: discMode === o.k ? T.accentSoft : T.surface2, color: discMode === o.k ? T.accentHi : T.textDim, fontFamily: "inherit" }}>
                      {o.t}<br/><small style={{ fontSize: 10.5, color: discMode === o.k ? T.accentHi : T.textFaint, opacity: .8, fontWeight: 400 }}>{o.s}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "6px 20px 8px" }}>
        {[
          { l: `Subtotal`, v: fmtCLP(subtotal), minus: false },
          { l: `Descuento (${disc}%)`, v: `−${fmtCLP(discAmt)}`, minus: true },
          { l: `Propina (${tip}%)`, v: `+${fmtCLP(tipAmt)}`, minus: false },
        ].map(row => (
          <div key={row.l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 14, color: T.textDim }}>{row.l}</span>
            <span style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 500, color: row.minus ? T.ok : T.text }}>{row.v}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
          <span style={{ fontSize: 15.5, color: T.text, fontWeight: 600 }}>Total a dividir</span>
          <span style={{ fontFamily: "monospace", fontSize: 21, fontWeight: 700, color: T.accentHi }}>{fmtCLP(grand)}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 28 }}>
        <button style={btnGhost} onClick={() => setStep(0)}><ArrowLeft /> Volver</button>
        <button style={btnPrimary} onClick={() => setStep(2)}>Repartir cuenta <ArrowRight /></button>
      </div>
    </div>
  );

  // ─── STEP 2: REPARTO ──────────────────────────────────────
  const renderReparto = () => {
    const per = getPerPerson();

    // Cuánto se ha marcado en total (sin propina)
    const assignedBase = Object.values(per).reduce((s, p) => s + p.base, 0);
    const assignedFinal = Object.values(per).reduce((s, p) => s + p.final, 0);
    const assignedPct = grand > 0 ? Math.min(100, Math.round(assignedFinal / grand * 100)) : 0;
    const unassignedAmt = grand - assignedFinal;
    const allDone = Math.abs(unassignedAmt) < 1;

    // Columnas sin ningún ítem marcado
    const emptyMembers = new Set(members.filter(m => (per[m.id]?.base || 0) === 0).map(m => m.id));
    return (
      <div>
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: T.accentHi, marginBottom: 8 }}>Paso 3 · Reparto</div>
          <h2 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 7 }}>¿Quiénes y quién pidió qué?</h2>
          <p style={{ color: T.textDim, fontSize: 15, maxWidth: "54ch" }}>Agrega a todos los de la mesa y marca qué consumió cada uno. Lo compartido se divide en partes iguales.</p>
        </div>

        {/* Personas */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
          {members.map((m, i) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 9px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 99 }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, background: pcolor(i) }}>{initials(m.name)}</span>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</span>
              <button onClick={() => removeMember(m.id)} style={{ width: 20, height: 20, borderRadius: "50%", display: "grid", placeItems: "center", color: T.textFaint, background: "none", border: "none", cursor: "pointer" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
          ))}
        </div>

        {/* División rápida */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.textFaint, flexShrink: 0 }}>División rápida:</span>
          {[2, 3, 4, 5, 6, 7, 8].map(n => (
            <button key={n} onClick={() => {
              const next = Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, name: `Persona ${i + 1}` }));
              setMembers(next);
              setMarks({});
            }} style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 14, fontWeight: 600, fontFamily: "monospace", cursor: "pointer", border: `1px solid ${members.length === n && members[0]?.name?.startsWith("Persona") ? T.borderAccent : T.border}`, background: members.length === n && members[0]?.name?.startsWith("Persona") ? T.accentSoft : T.surface2, color: members.length === n && members[0]?.name?.startsWith("Persona") ? T.accentHi : T.textDim, transition: ".15s" }}>
              {n}
            </button>
          ))}
        </div>

        <form onSubmit={addMember} style={{ display: "flex", gap: 10, maxWidth: 420, marginBottom: 28 }}>
          <input
            placeholder="Nombre de la persona…"
            value={newMember}
            onChange={e => setNewMember(e.target.value)}
            maxLength={18}
            autoComplete="off"
            style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "12px 15px", color: T.text, fontSize: 14.5, outline: "none", fontFamily: "inherit" }}
          />
          <button type="submit" style={btnPrimary}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
            Agregar
          </button>
        </form>

        {/* Tabla */}
        {members.length > 0 && items.length > 0 && (
          <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: T.radius, background: T.surface }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: "max-content" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "14px 18px", fontWeight: 600, fontSize: 13, color: T.textDim, borderBottom: `1px solid ${T.border}`, background: T.surface2, minWidth: 200, position: "sticky", top: 0, left: 0, zIndex: 4, boxShadow: "2px 0 6px -2px rgba(0,0,0,.35)" }}>Ítem</th>
                  {members.map((m, i) => (
                    <th key={m.id} style={{ padding: "14px 10px", borderBottom: `1px solid ${T.border}`, background: T.surface2, minWidth: 74, position: "sticky", top: 0, zIndex: 2 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, color: "#fff", background: pcolor(i) }}>{initials(m.name)}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 500, color: T.text }}>{m.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id}>
                    <td style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, minWidth: 200, position: "sticky", left: 0, background: T.surface, zIndex: 1, boxShadow: "2px 0 6px -2px rgba(0,0,0,.35)" }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: T.textFaint, fontFamily: "monospace", marginTop: 2 }}>{it.qty}× · {fmtCLP(it.price)}</div>
                    </td>
                    {members.map(m => {
                      const on = marks[it.id]?.has(m.id);
                      return (
                        <td key={m.id} style={{ padding: 10, borderBottom: `1px solid ${T.border}`, textAlign: "center" }}>
                          <button
                            onClick={() => toggleMark(it.id, m.id)}
                            style={{
                              width: 30, height: 30, borderRadius: 9, margin: "0 auto", display: "grid", placeItems: "center",
                              background: on ? T.accent : T.surface2,
                              border: `1px solid ${on ? "transparent" : T.border}`,
                              color: on ? "#fff" : "transparent",
                              cursor: "pointer",
                              boxShadow: on ? `0 0 0 3px rgba(37,99,255,.16), 0 4px 12px -3px ${T.accentGlow}` : "none",
                              transform: on ? "scale(1.04)" : "scale(1)",
                              transition: "all .15s cubic-bezier(.22,.61,.36,1)",
                            }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: "10px 18px", fontWeight: 500, fontSize: 12.5, color: T.textDim, borderTop: `1px solid ${T.borderStrong}`, background: T.surface2 }}>Sin propina</td>
                  {members.map(m => (
                    <td key={m.id} style={{ padding: "10px 10px", fontFamily: "monospace", fontSize: 12, color: T.textDim, borderTop: `1px solid ${T.borderStrong}`, background: T.surface2, textAlign: "center" }}>
                      {fmtCLP(per[m.id]?.base || 0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: "10px 18px", fontWeight: 700, fontSize: 13, color: T.text, background: T.surface2 }}>Con propina{tip > 0 ? ` (${tip}%)` : ""}{disc > 0 ? ` · desc. ${disc}%` : ""}</td>
                  {members.map(m => (
                    <td key={m.id} style={{ padding: "10px 10px", fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: emptyMembers.has(m.id) ? T.textFaint : T.text, background: T.surface2, textAlign: "center" }}>
                      {emptyMembers.has(m.id) ? "—" : fmtCLP(per[m.id]?.final || 0)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: T.textFaint, fontSize: 12.5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={T.accentHi} strokeWidth="2"/><path d="M12 11v5M12 8h.01" stroke={T.accentHi} strokeWidth="2.2" strokeLinecap="round"/></svg>
          Un ítem marcado por varias personas se reparte equitativamente entre ellas.
        </div>

        {/* Barra de progreso */}
        <div style={{ marginTop: 20, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: allDone ? "#22c55e" : T.text }}>
              {allDone ? "✓ Todo marcado" : `Marcado: ${fmtCLP(assignedFinal)} de ${fmtCLP(grand)}`}
            </span>
            <span style={{ fontSize: 12, color: allDone ? "#22c55e" : T.textDim, fontFamily: "monospace" }}>
              {allDone ? "" : `Falta ${fmtCLP(unassignedAmt)}`}
            </span>
          </div>
          <div style={{ height: 7, borderRadius: 99, background: T.surface2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${assignedPct}%`, borderRadius: 99, background: allDone ? "#22c55e" : T.accent, transition: "width .3s ease" }} />
          </div>
          {emptyMembers.size > 0 && (
            <div style={{ marginTop: 9, fontSize: 12, color: T.textDim }}>
              {members.filter(m => emptyMembers.has(m.id)).map(m => m.name).join(", ")} {emptyMembers.size === 1 ? "no tiene nada marcado — será invitada/o" : "no tienen nada marcado — serán invitadas/os"}
            </div>
          )}
        </div>

        {/* Compartir sala */}
        <div style={{ marginTop: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Sala compartida</div>
          <div style={{ fontSize: 12.5, color: T.textDim, marginBottom: 12 }}>Comparte el link para que cada uno marque lo que consumió desde su cel — en tiempo real.</div>
          {!salaId ? (
            <button
              onClick={createSala}
              disabled={salaLoading || members.length < 1}
              style={{ ...btnPrimary, fontSize: 13, padding: "9px 16px", opacity: members.length < 1 ? 0.4 : 1 }}
            >
              {salaLoading ? "Creando…" : "🔗 Crear sala y copiar link"}
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  readOnly
                  value={`${window.location.origin}/#/sala/${salaId}`}
                  style={{ flex: 1, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 12px", color: T.textDim, fontSize: 12, fontFamily: "monospace", outline: "none" }}
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/#/sala/${salaId}`); showToast("Link copiado"); }}
                  style={{ ...btnPrimary, fontSize: 12, padding: "8px 14px", flexShrink: 0 }}
                >
                  Copiar
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: "#22c55e" }}>✓ Sala activa — los checks aparecen aquí en tiempo real</div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 28 }}>
          <button style={btnGhost} onClick={() => setStep(1)}><ArrowLeft /> Volver</button>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
            {!allDone && members.length >= 1 && (
              <span style={{ fontSize: 11.5, color: "#f59e0b" }}>Falta asignar {fmtCLP(unassignedAmt)}</span>
            )}
            <button
              style={{ ...btnPrimary, opacity: (!allDone || members.length < 1) ? 0.4 : 1, cursor: (!allDone || members.length < 1) ? "not-allowed" : "pointer" }}
              onClick={() => {
                if (!allDone || members.length < 1) return;
                setStep(3);
                if (!savedHistoryRef.current && items.length > 0 && !salaId) {
                  savedHistoryRef.current = true;
                  const serialized = serializeMarks(marks);
                  supabase.from("sessions").insert({
                    owner_id: user.id, items, members, marks: serialized, tip, disc, disc_mode: discMode,
                  }).select("*").single().then(({ data }) => {
                    if (data) setHistory(prev => [data, ...prev.slice(0, 19)]);
                  });
                }
              }}
            >
              Ver resultado <ArrowRight />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ─── STEP 3: RESULTADO ────────────────────────────────────
  const renderResultado = () => {
    const per = getPerPerson();
    return (
      <div>
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: T.accentHi, marginBottom: 8 }}>Paso 4 · Resultado</div>
          <h2 style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-.03em", marginBottom: 7 }}>Cuánto paga cada uno</h2>
          <p style={{ color: T.textDim, fontSize: 15, maxWidth: "54ch" }}>Listo. Cada total ya incluye su parte de propina y descuento. Copia y manda al grupo de WhatsApp.</p>
        </div>

        {/* Total banner */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22, padding: "18px 22px", background: "linear-gradient(120deg, rgba(37,99,255,.1), rgba(37,99,255,.02))", border: `1px solid ${T.borderAccent}`, borderRadius: T.radius }}>
          <div>
            <div style={{ fontSize: 13.5, color: T.textDim }}>Total repartido entre {members.length} personas</div>
            <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700 }}>{fmtCLP(grand)}</div>
          </div>
          <button onClick={copyAll} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, padding: "11px 18px", borderRadius: T.radiusSm, background: "#25D366", color: "#062b14", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Copiar todo para el grupo
          </button>
        </div>

        {/* Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: 14 }}>
          {members.map((m, i) => {
            const d = per[m.id];
            const myItems = items.filter(it => marks[it.id]?.has(m.id));
            const extra = d.final - d.base;
            const color = pcolor(i);
            const isCopied = copied[m.id];
            return (
              <div key={m.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 20, position: "relative", overflow: "hidden", transition: ".2s" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 16 }}>
                  <span style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0, background: color }}>{initials(m.name)}</span>
                  <div>
                    <div style={{ fontSize: 15.5, fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: T.textFaint }}>{myItems.length} ítem{myItems.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 30, fontWeight: 700, letterSpacing: "-.02em", marginBottom: 4 }}>{fmtCLP(d.final)}</div>
                <div style={{ margin: "14px 0 16px", borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                  {myItems.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: T.textFaint }}>Nada marcado todavía</div>
                  ) : (
                    <>
                      {myItems.map(it => {
                        const sh = it.price / marks[it.id].size;
                        return (
                          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0", color: T.textDim }}>
                            <span>{it.name}{marks[it.id].size > 1 ? <span style={{ color: T.textFaint }}> ÷{marks[it.id].size}</span> : ""}</span>
                            <span style={{ fontFamily: "monospace" }}>{fmtCLP(sh)}</span>
                          </div>
                        );
                      })}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "8px 0 3px", borderTop: `1px solid ${T.border}`, marginTop: 6, color: T.textFaint }}>
                        <span>Propina / descuento</span>
                        <span style={{ fontFamily: "monospace" }}>{extra >= 0 ? "+" : "−"}{fmtCLP(Math.abs(extra))}</span>
                      </div>
                    </>
                  )}
                </div>
                <button onClick={() => copyPerson(m)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13.5, fontWeight: 600, padding: 10, borderRadius: 10, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${isCopied ? "rgba(37,211,102,.5)" : T.border}`, background: isCopied ? "rgba(37,211,102,.16)" : T.surface2, color: isCopied ? "#25D366" : T.textDim, transition: ".18s" }}>
                  {isCopied ? <CheckIcon /> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {isCopied ? "¡Copiado!" : "Copiar para WhatsApp"}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 28 }}>
          <button style={btnGhost} onClick={() => setStep(2)}><ArrowLeft /> Volver a marcar</button>
          <button style={btnGhost} onClick={() => { setItems([]); setMembers([]); setMarks({}); setImgPreview(null); setScanDone(false); setAiDetected(null); setSalaId(null); savedHistoryRef.current = false; setStep(0); }}>Nueva cuenta</button>
        </div>
      </div>
    );
  };

  const panels = [renderCuenta, renderAjustes, renderReparto, renderResultado];
  const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuario";
  const userInitials = userName.trim().slice(0, 2).toUpperCase();

  return (
    <div style={{ fontFamily: "'Geist', 'Inter', system-ui, sans-serif", minHeight: "100dvh", display: "flex", flexDirection: "column", background: T.bg, color: T.text, WebkitFontSmoothing: "antialiased" }}>
      <style>{`
        @keyframes scan { 0% { top: -36px; } 100% { top: 150px; } }
        @keyframes fade { from { opacity: .45; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", left: "50%", top: "-10%", transform: "translateX(-50%)", width: "min(900px, 120vw)", aspectRatio: "1", borderRadius: "50%", background: "radial-gradient(closest-side, rgba(37,99,255,.1), transparent 70%)", filter: "blur(10px)" }} />
      </div>

      {/* Topbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 40, background: "rgba(10,10,10,.72)", backdropFilter: "saturate(160%) blur(16px)", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 880, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px clamp(18px, 4vw, 28px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "linear-gradient(150deg, #2563FF, #1843B8)", display: "grid", placeItems: "center", boxShadow: `0 0 0 1px rgba(255,255,255,.08) inset, 0 4px 12px -2px ${T.accentGlow}` }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v18" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                <path d="M5 8.5 9 12l-4 3.5" stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19 8.5 15 12l4 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.02em" }}>Split <span style={{ color: T.accentHi }}>Sin Drama</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <button onClick={() => setShowHistory(true)} title="Ver historial" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, color: T.textDim, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: "6px 11px", cursor: "pointer", fontFamily: "inherit" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Historial
            </button>
            <span style={{ fontSize: 13.5, fontWeight: 500, color: T.textDim }}>{userName}</span>
            <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión" style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, #2F6BFF, #9333EA)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#fff", border: `1px solid ${T.borderStrong}`, cursor: "pointer" }}>
              {userInitials}
            </button>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div style={{ borderBottom: `1px solid ${T.border}`, background: "rgba(10,10,10,.4)" }}>
        <nav style={{ maxWidth: 880, margin: "0 auto", width: "100%", display: "flex", gap: 4, padding: "10px clamp(14px, 4vw, 28px)", overflowX: "auto" }}>
          {STEPS.map((name, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <button key={name} onClick={() => setStep(i)} style={{ flex: 1, minWidth: "max-content", display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderRadius: T.radiusSm, color: isActive ? "#fff" : isDone ? T.ok : T.textFaint, fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", background: isActive ? T.accentSoft : "none", border: "none", cursor: "pointer", fontFamily: "inherit", transition: "background .2s, color .2s" }}>
                <span style={{ width: 21, height: 21, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 600, background: isActive ? T.accent : isDone ? "rgba(47,184,119,.16)" : T.surface3, color: isActive ? "#fff" : isDone ? T.ok : T.textDim, border: `1px solid ${isActive ? "transparent" : isDone ? "rgba(47,184,119,.3)" : T.border}`, boxShadow: isActive ? `0 0 0 3px rgba(37,99,255,.18), 0 4px 12px -2px ${T.accentGlow}` : "none", transition: ".2s" }}>
                  {isDone ? <CheckIcon /> : i + 1}
                </span>
                <span>{name}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <main style={{ maxWidth: 880, margin: "0 auto", width: "100%", padding: "clamp(26px, 5vw, 46px) clamp(18px, 4vw, 28px) 120px", flex: 1, position: "relative", zIndex: 1 }}>
        <div style={{ animation: "fade .45s cubic-bezier(.22,.61,.36,1)" }} key={step}>
          {limitReached && step === 0 ? renderPaywall() : panels[step]()}
        </div>
      </main>

      {/* History panel */}
      {showHistory && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.65)", backdropFilter: "blur(4px)", display: "flex", justifyContent: "flex-end" }} onClick={() => setShowHistory(false)}>
          <div style={{ width: "min(420px, 100vw)", height: "100dvh", background: T.surface, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: "20px 22px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: T.surface, zIndex: 1 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.02em" }}>Historial</div>
                <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 2 }}>Tus últimas cuentas divididas</div>
              </div>
              <button onClick={() => setShowHistory(false)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", color: T.textDim, cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {history.length === 0 ? (
                <div style={{ padding: 48, textAlign: "center", color: T.textFaint, fontSize: 14, lineHeight: 1.6 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🧾</div>
                  No hay cuentas guardadas aún.<br />Termina una cuenta para verla aquí.
                </div>
              ) : history.map(sess => {
                const hGrand = (() => {
                  const sub = (sess.items || []).reduce((s, i) => s + i.price, 0);
                  const dAmt = sub * (sess.disc || 0) / 100;
                  const tipBase = sess.disc_mode === "con" ? sub - dAmt : sub;
                  return sub - dAmt + tipBase * (sess.tip || 0) / 100;
                })();
                const date = new Date(sess.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" });
                const hMembers = sess.members || [];
                const perPerson = computeHistPerPerson(sess);
                return (
                  <div key={sess.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "16px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, color: T.textFaint }}>{date}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>
                          {hMembers.length > 0 ? hMembers.map(m => m.name).join(", ") : "Sin personas"}
                        </div>
                      </div>
                      <div style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, color: T.accentHi }}>{fmtCLP(hGrand)}</div>
                    </div>
                    {perPerson.length > 0 && (
                      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                        {perPerson.map(({ name, final }, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: T.textDim }}>
                            <span>{name}</span>
                            <span style={{ fontFamily: "monospace", color: T.text, fontWeight: 500 }}>{fmtCLP(final)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 12, color: T.textFaint }}>
                        {(sess.items || []).length} ítem{(sess.items || []).length !== 1 ? "s" : ""}
                        {sess.tip > 0 ? ` · Propina ${sess.tip}%` : ""}
                        {sess.disc > 0 ? ` · Descuento ${sess.disc}%` : ""}
                      </div>
                      <button onClick={() => loadFromHistory(sess)} style={{ fontSize: 12.5, fontWeight: 600, color: T.accentHi, background: T.accentSoft, border: `1px solid ${T.borderAccent}`, borderRadius: 8, padding: "6px 13px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                        Cargar cuenta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      <div style={{ position: "fixed", left: "50%", bottom: 28, transform: `translateX(-50%) translateY(${toast.show ? 0 : 20}px)`, background: T.surface3, border: `1px solid ${T.borderStrong}`, padding: "11px 18px", borderRadius: 12, fontSize: 13.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 9, zIndex: 80, boxShadow: "0 20px 40px -12px rgba(0,0,0,.7)", opacity: toast.show ? 1 : 0, pointerEvents: "none", transition: ".3s cubic-bezier(.22,.61,.36,1)", whiteSpace: "nowrap" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke="#25D366" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
        {toast.msg}
      </div>
    </div>
  );
}
