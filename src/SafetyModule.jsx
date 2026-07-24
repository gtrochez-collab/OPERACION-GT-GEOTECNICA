// =====================================================================
// GEOSAFETY — EPP: catalogo, inventario, proveedores, requisiciones y dotacion
// =====================================================================
// Modelo "Amazon interno": los encargados agregan EPP al carrito y envian
// una requisicion indicando PARA QUE COLABORADOR(ES) va cada item (amarrado
// a hr-emps5 de GeoTeam) y el MOTIVO. Un mismo item puede repartirse entre
// varias personas (ej: 10 guantes → 4 a Juan, 6 a Pedro).
//   - primera_vez : dotacion inicial (sin cargo)
//   - perdida     : perdida/extravio → ALERTA: se deduce en planilla
//   - danio       : dano/desgaste normal (sin cargo)
//
// Pestana DOTACION: ficha visual de cada colaborador (avatar EPP) que mapea
// en tiempo real que equipo TIENE y que le FALTA respecto a la dotacion
// base. Se alimenta de las requisiciones ENTREGADAS (amarrado a la solicitud
// y a quien va asignado). El ideal: todos con su EPP completo.
//
// Storage keys (Supabase via store):
//   - ep-providers : proveedores de EPP
//   - ep-items     : catalogo {nombre, categoria, tipoEpp, proveedorId, precio, stock, foto, descripcion}
//   - ep-reqs      : requisiciones {numero, solicitante, lineas[], estado}
//   - cp-file-<id> : fotos de items (reutiliza el storage de archivos)
//   Lee (NO escribe): hr-emps5 — empleados de GeoTeam (con sus fotos).
//
// Flujo requisicion: pendiente → aprobada → entregada (descuenta stock).
// =====================================================================

import { useState, useEffect, useMemo } from "react";
import { store } from "./supabase.js";
import { BRAND, FONT, R } from "./theme.js";

// ── Constantes de dominio ──
const CATEGORIAS = [
  { value: "construccion", label: "EPP Construcción", icon: "🏗️" },
  { value: "concreto",     label: "EPP Concreto",     icon: "🧱" },
  { value: "soldadura",    label: "EPP Soldadura",    icon: "🔥" },
  { value: "mecanica",     label: "EPP Mecánica",     icon: "🔧" },
  { value: "torno",        label: "EPP Torno",        icon: "⚙️" },
];
const catLabel = (v) => CATEGORIAS.find((c) => c.value === v)?.label || v || "—";
const catIcon = (v) => CATEGORIAS.find((c) => c.value === v)?.icon || "🦺";

// Tipos de EPP por parte del cuerpo — mapean a los "slots" del avatar.
const EPP_TIPOS = [
  { value: "casco",      label: "Casco",                icon: "⛑️" },
  { value: "lentes",     label: "Lentes / Gafas",       icon: "🥽" },
  { value: "mascarilla", label: "Mascarilla / Careta",  icon: "😷" },
  { value: "auditiva",   label: "Protección auditiva",  icon: "🎧" },
  { value: "chaleco",    label: "Chaleco / Camisa",     icon: "🦺" },
  { value: "guantes",    label: "Guantes",              icon: "🧤" },
  { value: "botas",      label: "Botas",                icon: "🥾" },
  { value: "arnes",      label: "Arnés",                icon: "🪢" },
  { value: "otro",       label: "Otro EPP",             icon: "🧰" },
];
const tipoDef = (v) => EPP_TIPOS.find((t) => t.value === v) || EPP_TIPOS[EPP_TIPOS.length - 1];
// Dotacion base que idealmente TODOS deberian tener.
const BASELINE = ["casco", "lentes", "chaleco", "guantes", "botas"];

const MOTIVOS = [
  { value: "primera_vez", label: "Primera vez (dotación)", chip: "PRIMERA VEZ", color: BRAND.blue,   bg: BRAND.blueSoft },
  { value: "perdida",     label: "Pérdida / extravío ⚠",   chip: "PÉRDIDA",     color: BRAND.red,    bg: BRAND.redSoft },
  { value: "danio",       label: "Daño / desgaste",        chip: "DAÑO",        color: BRAND.yellow, bg: BRAND.yellowSoft },
];
const motivoDef = (v) => MOTIVOS.find((m) => m.value === v) || MOTIVOS[0];

const PROV_SEED = ["Chispa Safety", "Larach y Compañía", "La Mundial", "Summit", "Infra", "Amazon"];

const ESTADOS = {
  pendiente: { label: "PENDIENTE",  color: BRAND.yellow, bg: BRAND.yellowSoft },
  aprobada:  { label: "APROBADA",   color: BRAND.blue,   bg: BRAND.blueSoft },
  entregada: { label: "ENTREGADA",  color: BRAND.green,  bg: BRAND.greenSoft },
  rechazada: { label: "RECHAZADA",  color: BRAND.red,    bg: BRAND.redSoft },
};

const GREEN = "#059669";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmtL = (n) => "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const coTag = (c) => (c === "subterra" ? "SUB" : "GEO");

// ── Avatar de empleado (foto o iniciales) ──
const empInitials = (fullName) => {
  if (!fullName) return "?";
  const clean = String(fullName).replace(/^(Lic\.|Ing\.|Sr\.|Sra\.|Dr\.)\s+/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
};
const empColor = (name) => {
  const palette = ["#2C5F5D", "#8B3A3A", "#B45309", "#3E6A99", "#7B5FA8", "#5A8A4F", "#C75F1F", "#0F4C75"];
  let h = 0; for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
};
const EmpAvatar = ({ name, dataUrl, size = 90, borderRadius = "50%", style: sx }) => {
  const st = { width: size, height: size, borderRadius, flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", ...(sx || {}) };
  if (dataUrl) return <div style={{ ...st, background: "#F1F5F9" }}><img src={dataUrl} alt={name || ""} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>;
  return <div style={{ ...st, background: empColor(name), color: "#fff", fontWeight: 700, fontSize: size * 0.36, letterSpacing: 0.5 }}>{empInitials(name)}</div>;
};

// ── Compresion + upload de imagenes (mismo patron que GeoTeam) ──
const compressImage = (file) => new Promise((resolve, reject) => {
  const timeoutId = setTimeout(() => reject(new Error("Compresión tardó demasiado — imagen muy grande")), 15000);
  const img = new Image();
  const fr = new FileReader();
  fr.onerror = () => { clearTimeout(timeoutId); reject(new Error("FileReader falló")); };
  fr.onload = () => {
    img.onerror = () => { clearTimeout(timeoutId); reject(new Error("No se pudo decodificar la imagen")); };
    img.onload = () => {
      try {
        const MAX = 500;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        clearTimeout(timeoutId);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      } catch (e) { clearTimeout(timeoutId); reject(e); }
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
});
const withTimeout = (promise, ms, label = "operación") => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${ms}ms — ${label} no respondió`)), ms))]);

// ── Avatar EPP: figura que muestra que equipo TIENE (color) y que le FALTA ──
// `has` = Set de tipos de EPP que el colaborador posee. Los slots de la
// dotacion base que faltan se dibujan como contorno punteado gris.
const EppFigure = ({ has, size = 120 }) => {
  const p = (t) => has.has(t);
  const miss = (t) => !p(t) && BASELINE.includes(t);
  const NEUTRAL = "#8B847C";
  const COLORS = { casco: "#F59E0B", lentes: "#3E6A99", mascarilla: "#6B7280", auditiva: "#7B5FA8", chaleco: "#E8762D", guantes: "#5A8A4F", botas: "#6B4423", arnes: "#2C2A28" };
  const MISS_ST = { fill: "none", stroke: "#C9C2B7", strokeWidth: 1.6, strokeDasharray: "3 2.5" };
  const on = (t) => ({ fill: COLORS[t], stroke: "rgba(0,0,0,0.18)", strokeWidth: 1 });
  return (
    <svg viewBox="0 0 120 176" width={size} height={size * 176 / 120} style={{ display: "block" }}>
      {/* Cuerpo base neutro (siempre visible) */}
      <line x1="44" y1="70" x2="26" y2="108" stroke={NEUTRAL} strokeWidth="5" strokeLinecap="round" />
      <line x1="76" y1="70" x2="94" y2="108" stroke={NEUTRAL} strokeWidth="5" strokeLinecap="round" />
      <line x1="52" y1="116" x2="48" y2="158" stroke={NEUTRAL} strokeWidth="6" strokeLinecap="round" />
      <line x1="68" y1="116" x2="72" y2="158" stroke={NEUTRAL} strokeWidth="6" strokeLinecap="round" />
      <circle cx="60" cy="40" r="17" fill="#F1EDE5" stroke={NEUTRAL} strokeWidth="2" />
      <rect x="55" y="55" width="10" height="9" rx="2" fill="#F1EDE5" stroke={NEUTRAL} strokeWidth="1.5" />

      {/* Auditiva (orejeras) */}
      {p("auditiva") && (<g><rect x="39" y="35" width="7" height="12" rx="3" {...on("auditiva")} /><rect x="74" y="35" width="7" height="12" rx="3" {...on("auditiva")} /></g>)}

      {/* Chaleco / torso */}
      {p("chaleco") ? (
        <g>
          <path d="M42 64 h36 a4 4 0 0 1 4 4 v44 a4 4 0 0 1 -4 4 h-36 a4 4 0 0 1 -4 -4 v-44 a4 4 0 0 1 4 -4 z" {...on("chaleco")} />
          <rect x="47" y="72" width="26" height="4" fill="#FDE68A" opacity="0.9" />
          <rect x="47" y="98" width="26" height="4" fill="#FDE68A" opacity="0.9" />
          <line x1="60" y1="64" x2="60" y2="116" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
        </g>
      ) : miss("chaleco") ? (
        <rect x="38" y="64" width="44" height="52" rx="6" {...MISS_ST} />
      ) : null}

      {/* Arnes (sobre el torso) */}
      {p("arnes") && (<g stroke={COLORS.arnes} strokeWidth="3.5" fill="none" strokeLinecap="round"><line x1="46" y1="66" x2="74" y2="112" /><line x1="74" y1="66" x2="46" y2="112" /></g>)}

      {/* Casco (domo + ala) */}
      {p("casco") ? (
        <g><path d="M43 40 a17 15 0 0 1 34 0 z" {...on("casco")} /><rect x="39" y="38" width="42" height="5" rx="2.5" {...on("casco")} /><rect x="58" y="24" width="4" height="7" rx="2" {...on("casco")} /></g>
      ) : miss("casco") ? (
        <path d="M42 42 a18 16 0 0 1 36 0" {...MISS_ST} />
      ) : null}

      {/* Lentes */}
      {p("lentes") ? (
        <g><rect x="47" y="37" width="26" height="8" rx="4" {...on("lentes")} opacity="0.92" /><line x1="60" y1="41" x2="60" y2="41" stroke="#fff" strokeWidth="1" /></g>
      ) : miss("lentes") ? (
        <rect x="47" y="37" width="26" height="8" rx="4" {...MISS_ST} />
      ) : null}

      {/* Mascarilla */}
      {p("mascarilla") && (<path d="M50 46 h20 l-3 11 h-14 z" {...on("mascarilla")} />)}

      {/* Guantes */}
      {p("guantes") ? (
        <g><circle cx="24" cy="110" r="7.5" {...on("guantes")} /><circle cx="96" cy="110" r="7.5" {...on("guantes")} /></g>
      ) : miss("guantes") ? (
        <g><circle cx="24" cy="110" r="7.5" {...MISS_ST} /><circle cx="96" cy="110" r="7.5" {...MISS_ST} /></g>
      ) : null}

      {/* Botas */}
      {p("botas") ? (
        <g><path d="M40 152 h10 v8 h4 v6 h-18 v-6 z" {...on("botas")} /><path d="M66 152 h10 l4 14 h-18 v-6 h4 z" {...on("botas")} /></g>
      ) : miss("botas") ? (
        <g><path d="M40 152 h10 v8 h4 v6 h-18 v-6 z" {...MISS_ST} /><path d="M66 152 h10 l4 14 h-18 v-6 h4 z" {...MISS_ST} /></g>
      ) : null}
    </svg>
  );
};

// ── UI primitives ──
const BTN_V = {
  primary: { background: BRAND.orange, color: "#fff", border: `1px solid ${BRAND.orange}` },
  success: { background: GREEN, color: "#fff", border: `1px solid ${GREEN}` },
  danger:  { background: BRAND.red, color: "#fff", border: `1px solid ${BRAND.red}` },
  info:    { background: BRAND.blue, color: "#fff", border: `1px solid ${BRAND.blue}` },
  ghost:   { background: "#fff", color: BRAND.ink, border: `1px solid ${BRAND.border}` },
};
const Btn = ({ children, onClick, variant = "primary", small, disabled, style }) => (
  <button onClick={onClick} disabled={disabled} style={{ ...BTN_V[variant], padding: small ? "5px 10px" : "9px 16px", borderRadius: R.sm, fontSize: small ? 12 : 13, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, fontFamily: FONT.body, ...style }}>{children}</button>
);
const Field = ({ label, children }) => (
  <label style={{ display: "block" }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>{label}</div>
    {children}
  </label>
);
const inputSt = { width: "100%", padding: "9px 11px", borderRadius: R.sm, border: `1px solid ${BRAND.border}`, fontSize: 13, fontFamily: FONT.body, background: "#fff", color: BRAND.charcoal, boxSizing: "border-box" };
const Input = ({ label, ...p }) => <Field label={label}><input {...p} style={{ ...inputSt, ...p.style }} /></Field>;
const TextArea = ({ label, ...p }) => <Field label={label}><textarea {...p} style={{ ...inputSt, resize: "vertical", minHeight: 60, ...p.style }} /></Field>;
const Select = ({ label, options, placeholder, ...p }) => (
  <Field label={label}>
    <select {...p} style={{ ...inputSt, ...p.style }}>
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </Field>
);
const Chip = ({ color, bg, children, style }) => (
  <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: R.full, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color, background: bg, whiteSpace: "nowrap", ...style }}>{children}</span>
);
const Modal = ({ title, onClose, children, width = 640 }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(44,42,40,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}>
    <div onClick={(e) => e.stopPropagation()} style={{ background: BRAND.cream, borderRadius: R.lg, width: "100%", maxWidth: width, boxShadow: BRAND.shadowLg, border: `1px solid ${BRAND.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 22px", borderBottom: `1px solid ${BRAND.border}` }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: BRAND.charcoal, fontFamily: FONT.display }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: BRAND.stone }}>×</button>
      </div>
      <div style={{ padding: 22 }}>{children}</div>
    </div>
  </div>
);
const th = { padding: "9px 10px", textAlign: "left", fontSize: 10.5, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: `2px solid ${BRAND.border}`, whiteSpace: "nowrap" };
const td = { padding: "9px 10px", fontSize: 13, color: BRAND.charcoal, borderBottom: `1px solid ${BRAND.borderSoft}`, verticalAlign: "middle" };

// =====================================================================
export default function SafetyModule({ userRole, userName, onBack, onLogout }) {
  const [providers, setProviders] = useState([]);
  const [items, setItems] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [emps, setEmps] = useState([]);
  const [photoCache, setPhotoCache] = useState({}); // {fileId: dataUrl}
  const [loaded, setLoaded] = useState(false);
  const [sec, setSec] = useState("catalogo");
  const [modal, setModal] = useState(null); // {t: "cart"|"item"|"prov"|"ficha", ...}
  const [cart, setCart] = useState([]);     // [{key, itemId, dests:[{empId, qty, motivo}]}]
  const [fCat, setFCat] = useState("");
  const [fProv, setFProv] = useState("");
  const [fQ, setFQ] = useState("");
  const [fReqEstado, setFReqEstado] = useState("");
  const [fDotQ, setFDotQ] = useState("");
  const [fDotCo, setFDotCo] = useState("");
  const [fDotFalta, setFDotFalta] = useState(false); // solo con faltantes

  const canManage = ["admin", "costos", "almacenista"].includes(userRole);
  const canDeduct = canManage || userRole === "tesoreria";
  const readOnly = userRole === "gerencia";

  useEffect(() => {
    (async () => {
      const [pv, it, rq, em] = await Promise.all([
        store.get("ep-providers"), store.get("ep-items"), store.get("ep-reqs"), store.get("hr-emps5"),
      ]);
      setProviders(Array.isArray(pv) ? pv : []);
      setItems(Array.isArray(it) ? it : []);
      setReqs(Array.isArray(rq) ? rq : []);
      setEmps(Array.isArray(em) ? em : []);
      setLoaded(true);
    })();
  }, []);

  // Bulk-load de fotos (items + empleados) desde cp-file-<id>, solo las que faltan.
  useEffect(() => {
    const need = new Set();
    for (const it of items) { const f = it.foto?.fileId; if (f && !photoCache[f]) need.add(f); }
    for (const e of emps) { const f = e.photo?.fileId; if (f && !photoCache[f]) need.add(f); }
    if (!need.size) return;
    (async () => {
      const res = await Promise.all([...need].map(async (fid) => { try { const full = await store.get(`cp-file-${fid}`); return [fid, full?.dataUrl || null]; } catch { return [fid, null]; } }));
      setPhotoCache((prev) => { const next = { ...prev }; let ch = false; for (const [fid, url] of res) if (url) { next[fid] = url; ch = true; } return ch ? next : prev; });
    })();
  }, [items, emps]); // eslint-disable-line react-hooks/exhaustive-deps

  const sProv = async (v) => { setProviders(v); const ok = await store.set("ep-providers", v); if (!ok) alert("⚠ No se guardó en la nube (ep-providers)."); return ok; };
  const sItems = async (v) => { setItems(v); const ok = await store.set("ep-items", v); if (!ok) alert("⚠ No se guardó en la nube (ep-items)."); return ok; };
  const sReqs = async (v) => { setReqs(v); const ok = await store.set("ep-reqs", v); if (!ok) alert("⚠ No se guardó en la nube (ep-reqs)."); return ok; };

  const provName = (id) => providers.find((p) => p.id === id)?.nombre || "—";
  const itemById = (id) => items.find((i) => i.id === id);
  const empById = (id) => emps.find((e) => e.id === id);
  const empPhoto = (e) => (e?.photo?.fileId ? photoCache[e.photo.fileId] : null);
  const itemPhoto = (it) => (it?.foto?.fileId ? photoCache[it.foto.fileId] : null);
  const activeEmps = useMemo(() => emps.filter((e) => e.status === "active").sort((a, b) => String(a.fullName).localeCompare(b.fullName)), [emps]);

  // ── Dotacion: que EPP tiene cada colaborador (de requisiciones ENTREGADAS) ──
  // Devuelve { tiene:[{tipo,nombre,qty,reqs:[num],lastDate,motivos}], tipos:Set, pend:[...] }
  const dotacionDe = useMemo(() => {
    const map = {}; // empId -> {entregado:{}, pend:{}}
    for (const r of reqs) {
      if (r.estado === "rechazada") continue;
      const entregada = r.estado === "entregada";
      for (const l of r.lineas || []) {
        if (!l.paraEmpId) continue;
        if (!map[l.paraEmpId]) map[l.paraEmpId] = { entregado: {}, pend: {} };
        const bucket = entregada ? map[l.paraEmpId].entregado : map[l.paraEmpId].pend;
        const tipo = l.tipoEpp || itemById(l.itemId)?.tipoEpp || "otro";
        const k = (l.itemId || l.nombre) + "|" + tipo;
        if (!bucket[k]) bucket[k] = { tipo, nombre: l.nombre, qty: 0, reqs: [], lastDate: null, motivos: {} };
        bucket[k].qty += l.qty;
        if (!bucket[k].reqs.includes(r.numero)) bucket[k].reqs.push(r.numero);
        bucket[k].motivos[l.motivo] = (bucket[k].motivos[l.motivo] || 0) + l.qty;
        const d = r.entregadaAt || r.fecha;
        if (!bucket[k].lastDate || String(d) > String(bucket[k].lastDate)) bucket[k].lastDate = d;
      }
    }
    const out = {};
    for (const e of emps) {
      const m = map[e.id] || { entregado: {}, pend: {} };
      const tiene = Object.values(m.entregado);
      const pend = Object.values(m.pend);
      const tipos = new Set(tiene.map((x) => x.tipo));
      const falta = BASELINE.filter((t) => !tipos.has(t));
      out[e.id] = { tiene, pend, tipos, falta, completo: falta.length === 0 && tiene.length > 0 };
    }
    return out;
  }, [reqs, emps, items]); // eslint-disable-line react-hooks/exhaustive-deps

  const perdidas = useMemo(() => {
    const o = [];
    for (const r of reqs) { if (r.estado === "rechazada") continue; (r.lineas || []).forEach((l, idx) => { if (l.motivo === "perdida") o.push({ req: r, linea: l, idx }); }); }
    return o.sort((a, b) => String(b.req.fecha).localeCompare(String(a.req.fecha)));
  }, [reqs]);
  const perdidasPend = perdidas.filter((p) => !p.linea.deducido);
  const reqsPendientes = reqs.filter((r) => r.estado === "pendiente").length;

  // ── Carrito (multi-colaborador por item) ──
  const addToCart = (item) => {
    setCart((c) => {
      const ex = c.find((l) => l.itemId === item.id);
      if (ex) return c.map((l) => (l === ex ? { ...l, dests: l.dests.map((d, i) => (i === 0 ? { ...d, qty: (Number(d.qty) || 0) + 1 } : d)) } : l));
      return [...c, { key: uid(), itemId: item.id, dests: [{ empId: "", qty: 1, motivo: "" }] }];
    });
  };
  const cartUnits = cart.reduce((s, l) => s + l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0), 0);
  const cartTotal = cart.reduce((s, l) => s + (Number(itemById(l.itemId)?.precio) || 0) * l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0), 0);
  const lineUnits = (l) => l.dests.reduce((a, d) => a + (Number(d.qty) || 0), 0);
  const updDest = (lineKey, di, patch) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: l.dests.map((d, i) => (i === di ? { ...d, ...patch } : d)) } : l)));
  const addDest = (lineKey) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: [...l.dests, { empId: "", qty: 1, motivo: "" }] } : l)));
  const rmDest = (lineKey, di) => setCart((c) => c.map((l) => (l.key === lineKey ? { ...l, dests: l.dests.filter((_, i) => i !== di) } : l)).filter((l) => l.dests.length));

  const enviarRequisicion = async () => {
    if (!cart.length) return;
    const lineas = [];
    for (const l of cart) {
      const it = itemById(l.itemId) || {};
      for (const d of l.dests) {
        if (!Number(d.qty) || Number(d.qty) < 1) return alert(`Cantidad inválida en "${it.nombre}".`);
        if (!d.empId) return alert(`Falta indicar PARA QUIÉN va "${it.nombre}".`);
        if (!d.motivo) return alert(`Falta el MOTIVO de "${it.nombre}".`);
        const emp = empById(d.empId) || {};
        lineas.push({ itemId: l.itemId, nombre: it.nombre, categoria: it.categoria, tipoEpp: it.tipoEpp || "otro", proveedor: provName(it.proveedorId), precio: Number(it.precio) || 0, qty: Number(d.qty), paraEmpId: d.empId, paraNombre: emp.fullName || "—", paraEmpresa: emp.company || "", motivo: d.motivo, deducido: false });
      }
    }
    const numero = "EPP-" + String(reqs.length + 1).padStart(3, "0");
    const req = { id: uid(), numero, solicitante: userName, fecha: new Date().toISOString(), estado: "pendiente", lineas, total: lineas.reduce((s, l) => s + l.precio * l.qty, 0) };
    const ok = await sReqs([req, ...reqs]);
    if (!ok) return;
    const tienePerdida = lineas.some((l) => l.motivo === "perdida");
    setCart([]); setModal(null); setSec("requisiciones");
    alert(`✅ Requisición ${numero} enviada.` + (tienePerdida ? "\n\n⚠ Incluye PÉRDIDA/EXTRAVÍO: quedó registrada en \"Descuentos planilla\"." : ""));
  };

  const setEstadoReq = async (req, estado) => {
    const verbo = { aprobada: "APROBAR", rechazada: "RECHAZAR", entregada: "marcar ENTREGADA" }[estado];
    if (!confirm(`¿${verbo} la requisición ${req.numero}?` + (estado === "entregada" ? "\n\nSe descontará el stock y el EPP quedará asignado a cada colaborador en su ficha de dotación." : ""))) return;
    const upd = reqs.map((r) => (r.id === req.id ? { ...r, estado, [estado + "Por"]: userName, [estado + "At"]: new Date().toISOString() } : r));
    const ok = await sReqs(upd);
    if (!ok) return;
    if (estado === "entregada") {
      const ni = items.map((it) => { const q = (req.lineas || []).filter((l) => l.itemId === it.id).reduce((s, l) => s + l.qty, 0); return q ? { ...it, stock: Math.max(0, (Number(it.stock) || 0) - q) } : it; });
      const ok2 = await sItems(ni);
      if (!ok2) alert("⚠ Quedó ENTREGADA pero el stock NO se actualizó. Ajustalo en Inventario.");
    }
  };
  const toggleDeducido = async (reqId, idx) => {
    const upd = reqs.map((r) => r.id !== reqId ? r : { ...r, lineas: r.lineas.map((l, i) => (i === idx ? { ...l, deducido: !l.deducido, deducidoPor: !l.deducido ? userName : undefined, deducidoAt: !l.deducido ? new Date().toISOString() : undefined } : l)) });
    await sReqs(upd);
  };

  // ══════════════════════════ CATALOGO ══════════════════════════
  const renderCatalogo = () => {
    const vis = items.filter((it) => (!fCat || it.categoria === fCat) && (!fProv || it.proveedorId === fProv) && (!fQ || String(it.nombre).toLowerCase().includes(fQ.toLowerCase()))).sort((a, b) => String(a.nombre).localeCompare(b.nombre));
    return (
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div style={{ flex: "1 1 220px" }}><Input label="Buscar" placeholder="Casco, guantes, careta…" value={fQ} onChange={(e) => setFQ(e.target.value)} /></div>
          <div style={{ flex: "0 1 200px" }}><Select label="Categoría" placeholder="Todas" options={CATEGORIAS} value={fCat} onChange={(e) => setFCat(e.target.value)} /></div>
          <div style={{ flex: "0 1 200px" }}><Select label="Proveedor" placeholder="Todos" options={providers.map((p) => ({ value: p.id, label: p.nombre }))} value={fProv} onChange={(e) => setFProv(e.target.value)} /></div>
          {canManage && <Btn variant="ghost" onClick={() => setModal({ t: "item" })}>+ Nuevo ítem</Btn>}
        </div>
        {!items.length ? (
          <div style={{ textAlign: "center", padding: 60, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>
            <div style={{ fontSize: 40 }}>🦺</div>
            <div style={{ fontWeight: 700, color: BRAND.ink, marginTop: 8 }}>El catálogo está vacío</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{canManage ? "Cargá los proveedores y luego agregá ítems (con foto, tipo de EPP y precio real)." : "El administrador aún no carga ítems de EPP."}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
            {vis.map((it) => {
              const sinStock = (Number(it.stock) || 0) <= 0;
              const bajo = !sinStock && (Number(it.stock) || 0) <= (Number(it.minStock) || 0);
              const foto = itemPhoto(it); const tp = tipoDef(it.tipoEpp);
              return (
                <div key={it.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: BRAND.shadowSm }}>
                  <div style={{ height: 130, background: foto ? "#F1EDE5" : BRAND.beigeLight, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", borderBottom: `1px solid ${BRAND.borderSoft}` }}>
                    {foto ? <img src={foto} alt={it.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ fontSize: 46, opacity: 0.5 }}>{catIcon(it.categoria)}</div>}
                    <span style={{ position: "absolute", top: 8, left: 8 }}><Chip color={BRAND.graphite} bg="rgba(255,255,255,0.9)">{tp.icon} {tp.label}</Chip></span>
                  </div>
                  <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, color: BRAND.charcoal, lineHeight: 1.25 }}>{it.nombre}</div>
                    {it.descripcion && <div style={{ fontSize: 11.5, color: BRAND.stone, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{it.descripcion}</div>}
                    <div style={{ fontSize: 12, color: BRAND.stone }}>🏪 {provName(it.proveedorId)}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 4 }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: GREEN }}>{fmtL(it.precio)}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: sinStock ? BRAND.red : bajo ? "#B45309" : BRAND.graphite }}>{sinStock ? "Sin stock" : `Stock: ${it.stock}${bajo ? " ⚠" : ""}`}</div>
                    </div>
                    {!readOnly && <Btn onClick={() => addToCart(it)} style={{ width: "100%" }}>🛒 Agregar al carrito</Btn>}
                    {canManage && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn small variant="ghost" style={{ flex: 1 }} onClick={() => setModal({ t: "item", item: it })}>✏️ Editar</Btn>
                        <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿Borrar "${it.nombre}" del catálogo?\n\nLas requisiciones ya creadas no se tocan.`)) return; await sItems(items.filter((x) => x.id !== it.id)); }}>🗑</Btn>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!vis.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 30, color: BRAND.stone, fontSize: 13 }}>Sin resultados con esos filtros.</div>}
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════ CARRITO ══════════════════════════
  const CartModal = () => (
    <Modal title={`🛒 Carrito de EPP (${cartUnits} uds)`} onClose={() => setModal(null)} width={860}>
      {!cart.length ? (
        <div style={{ textAlign: "center", padding: 30, color: BRAND.stone }}>El carrito está vacío. Agregá EPP desde el catálogo.</div>
      ) : (
        <>
          <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink, marginBottom: 14 }}>
            Por cada ítem indicá <b>a qué colaborador(es)</b> va y el <b>motivo</b>. Podés repartir un mismo ítem entre varias personas (ej: 10 guantes → 4 a uno, 6 a otro) con <b>“+ Agregar colaborador”</b>.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cart.map((l) => {
              const it = itemById(l.itemId) || {};
              return (
                <div key={l.key} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: BRAND.charcoal }}>{tipoDef(it.tipoEpp).icon} {it.nombre} <span style={{ fontWeight: 600, color: GREEN }}>· {fmtL(it.precio)}</span> <span style={{ fontWeight: 600, color: BRAND.stone, fontSize: 12 }}>· {lineUnits(l)} uds</span></div>
                    <button onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))} style={{ background: "none", border: "none", color: BRAND.red, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Quitar ítem</button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {l.dests.map((d, di) => (
                      <div key={di}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr 30px", gap: 8, alignItems: "end" }}>
                          <Select label={di === 0 ? "Para (colaborador)" : ""} placeholder="— Seleccionar —" value={d.empId} onChange={(e) => updDest(l.key, di, { empId: e.target.value })} options={activeEmps.map((e) => ({ value: e.id, label: `${e.fullName} · ${coTag(e.company)}` }))} />
                          <Input label={di === 0 ? "Cant." : ""} type="number" min="1" value={d.qty} onChange={(e) => updDest(l.key, di, { qty: e.target.value })} />
                          <Select label={di === 0 ? "Motivo" : ""} placeholder="— Seleccionar —" value={d.motivo} onChange={(e) => updDest(l.key, di, { motivo: e.target.value })} options={MOTIVOS.map((m) => ({ value: m.value, label: m.label }))} />
                          <button onClick={() => rmDest(l.key, di)} title="Quitar colaborador" style={{ height: 38, background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.sm, color: BRAND.red, cursor: "pointer", fontWeight: 800 }}>×</button>
                        </div>
                        {d.motivo === "perdida" && (
                          <div style={{ marginTop: 5, background: BRAND.redSoft, border: `1px solid ${BRAND.red}40`, borderRadius: R.sm, padding: "5px 9px", fontSize: 11.5, fontWeight: 700, color: BRAND.red }}>
                            ⚠ {fmtL((Number(it.precio) || 0) * (Number(d.qty) || 1))} se deducirán de la planilla de {empById(d.empId)?.fullName || "el colaborador"}.
                          </div>
                        )}
                      </div>
                    ))}
                    <div><Btn small variant="ghost" onClick={() => addDest(l.key)}>+ Agregar colaborador</Btn></div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.charcoal }}>Total: <span style={{ color: GREEN }}>{fmtL(cartTotal)}</span></div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Seguir viendo</Btn>
              <Btn variant="success" onClick={enviarRequisicion}>📨 Enviar requisición</Btn>
            </div>
          </div>
        </>
      )}
    </Modal>
  );

  // ══════════════════════════ REQUISICIONES ══════════════════════════
  const renderRequisiciones = () => {
    const vis = reqs.filter((r) => !fReqEstado || r.estado === fReqEstado);
    return (
      <div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "0 1 220px" }}><Select label="Estado" placeholder="Todos" value={fReqEstado} onChange={(e) => setFReqEstado(e.target.value)} options={Object.entries(ESTADOS).map(([v, d]) => ({ value: v, label: d.label }))} /></div>
          <div style={{ fontSize: 12.5, color: BRAND.stone, paddingBottom: 10 }}>{vis.length} requisición(es)</div>
        </div>
        {!vis.length && <div style={{ textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin requisiciones todavía. Se crean desde el catálogo con el carrito 🛒.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {vis.map((r) => {
            const est = ESTADOS[r.estado] || ESTADOS.pendiente;
            const tienePerdida = (r.lineas || []).some((l) => l.motivo === "perdida");
            return (
              <div key={r.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
                {tienePerdida && <div style={{ background: BRAND.redSoft, borderBottom: `1px solid ${BRAND.red}30`, padding: "7px 16px", fontSize: 12, fontWeight: 800, color: BRAND.red }}>⚠ CONTIENE PÉRDIDA/EXTRAVÍO — genera descuento en planilla</div>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONT.mono, fontWeight: 800, fontSize: 14, color: BRAND.orange }}>{r.numero}</span>
                    <Chip color={est.color} bg={est.bg}>{est.label}</Chip>
                    <span style={{ fontSize: 12.5, color: BRAND.graphite }}>Solicitó: <b>{r.solicitante}</b> · {fmtDate(r.fecha)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 800, color: GREEN, fontSize: 14 }}>{fmtL(r.total)}</span>
                    {canManage && r.estado === "pendiente" && <><Btn small variant="success" onClick={() => setEstadoReq(r, "aprobada")}>✓ Aprobar</Btn><Btn small variant="danger" onClick={() => setEstadoReq(r, "rechazada")}>✕ Rechazar</Btn></>}
                    {canManage && r.estado === "aprobada" && <Btn small variant="info" onClick={() => setEstadoReq(r, "entregada")}>📦 Marcar entregada</Btn>}
                    {userRole === "admin" && <Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿ELIMINAR la requisición ${r.numero}?\n\nSe borra del historial. No se puede deshacer.`)) return; await sReqs(reqs.filter((x) => x.id !== r.id)); }}>🗑</Btn>}
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Ítem</th><th style={th}>Tipo</th><th style={th}>Proveedor</th><th style={th}>Para</th><th style={th}>Motivo</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>Precio</th><th style={{ ...th, textAlign: "right" }}>Subtotal</th></tr></thead>
                    <tbody>
                      {(r.lineas || []).map((l, i) => {
                        const m = motivoDef(l.motivo);
                        return (
                          <tr key={i}>
                            <td style={{ ...td, fontWeight: 700 }}>{l.nombre}</td>
                            <td style={td}>{tipoDef(l.tipoEpp).icon} {tipoDef(l.tipoEpp).label}</td>
                            <td style={td}>{l.proveedor}</td>
                            <td style={td}>{l.paraNombre} <span style={{ fontSize: 10, color: BRAND.stone, fontWeight: 700 }}>{l.paraEmpresa ? coTag(l.paraEmpresa) : ""}</span></td>
                            <td style={td}><Chip color={m.color} bg={m.bg}>{m.chip}</Chip>{l.motivo === "perdida" && l.deducido && <Chip color={GREEN} bg={BRAND.greenSoft} style={{ marginLeft: 5 }}>DEDUCIDO ✓</Chip>}</td>
                            <td style={{ ...td, textAlign: "right" }}>{l.qty}</td>
                            <td style={{ ...td, textAlign: "right" }}>{fmtL(l.precio)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: GREEN }}>{fmtL(l.precio * l.qty)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ══════════════════════════ DOTACION (fichas visuales) ══════════════════════════
  const renderDotacion = () => {
    let list = activeEmps;
    if (fDotCo) list = list.filter((e) => e.company === fDotCo);
    if (fDotQ) list = list.filter((e) => String(e.fullName).toLowerCase().includes(fDotQ.toLowerCase()));
    if (fDotFalta) list = list.filter((e) => !dotacionDe[e.id]?.completo);
    const completos = activeEmps.filter((e) => dotacionDe[e.id]?.completo).length;
    return (
      <div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${GREEN}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Con EPP completo</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: GREEN, marginTop: 4 }}>{completos} <span style={{ fontSize: 15, color: BRAND.stone, fontWeight: 700 }}>/ {activeEmps.length}</span></div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>dotación base: {BASELINE.map((t) => tipoDef(t).icon).join(" ")}</div>
          </div>
          <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${BRAND.red}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Con faltantes</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.red, marginTop: 4 }}>{activeEmps.length - completos}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>colaboradores a completar dotación</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div style={{ flex: "1 1 220px" }}><Input label="Buscar colaborador" placeholder="Nombre…" value={fDotQ} onChange={(e) => setFDotQ(e.target.value)} /></div>
          <div style={{ flex: "0 1 200px" }}><Select label="Empresa" placeholder="Todas" options={[{ value: "geotecnica", label: "Geotecnica" }, { value: "subterra", label: "Subterra" }]} value={fDotCo} onChange={(e) => setFDotCo(e.target.value)} /></div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 700, color: BRAND.ink, paddingBottom: 9, cursor: "pointer" }}>
            <input type="checkbox" checked={fDotFalta} onChange={(e) => setFDotFalta(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} /> Solo con faltantes
          </label>
        </div>
        {!emps.length ? (
          <div style={{ textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>No hay empleados cargados. Se leen de GeoTeam.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 }}>
            {list.map((e) => {
              const dot = dotacionDe[e.id] || { tiene: [], falta: BASELINE, tipos: new Set(), completo: false, pend: [] };
              return (
                <div key={e.id} onClick={() => setModal({ t: "ficha", empId: e.id })} style={{ background: "#fff", border: `1px solid ${dot.completo ? GREEN + "55" : BRAND.border}`, borderRadius: R.lg, padding: 14, cursor: "pointer", boxShadow: BRAND.shadowSm, transition: "transform .1s" }} onMouseEnter={(ev) => (ev.currentTarget.style.transform = "translateY(-2px)")} onMouseLeave={(ev) => (ev.currentTarget.style.transform = "none")}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <div style={{ background: BRAND.beigeLight, borderRadius: R.md, padding: 4, border: `1px solid ${BRAND.borderSoft}` }}><EppFigure has={dot.tipos} size={72} /></div>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <EmpAvatar name={e.fullName} dataUrl={empPhoto(e)} size={34} borderRadius={8} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: BRAND.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.fullName}</div>
                          <div style={{ fontSize: 10.5, color: BRAND.stone }}>{coTag(e.company)} · {e.position || "—"}</div>
                        </div>
                      </div>
                      {dot.completo
                        ? <Chip color={GREEN} bg={BRAND.greenSoft}>✓ EPP COMPLETO</Chip>
                        : <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}><span style={{ fontSize: 10.5, fontWeight: 800, color: BRAND.red }}>FALTA:</span>{dot.falta.map((t) => <span key={t} title={tipoDef(t).label} style={{ fontSize: 15 }}>{tipoDef(t).icon}</span>)}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {!list.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 30, color: BRAND.stone, fontSize: 13 }}>Sin colaboradores con esos filtros.</div>}
          </div>
        )}
      </div>
    );
  };

  const FichaModal = ({ empId }) => {
    const e = empById(empId); if (!e) return null;
    const dot = dotacionDe[empId] || { tiene: [], pend: [], falta: BASELINE, tipos: new Set(), completo: false };
    return (
      <Modal title="Ficha de dotación EPP" onClose={() => setModal(null)} width={720}>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ background: BRAND.beigeLight, borderRadius: R.lg, padding: 10, border: `1px solid ${BRAND.borderSoft}` }}><EppFigure has={dot.tipos} size={150} /></div>
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <EmpAvatar name={e.fullName} dataUrl={empPhoto(e)} size={56} borderRadius={12} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: BRAND.charcoal }}>{e.fullName}</div>
                <div style={{ fontSize: 12.5, color: BRAND.stone }}>{e.position || "—"} · {coTag(e.company)}</div>
                {e.dni && <div style={{ fontSize: 11.5, color: BRAND.stone, fontFamily: FONT.mono }}>{e.dni}</div>}
              </div>
            </div>
            <div style={{ marginTop: 4 }}>{dot.completo ? <Chip color={GREEN} bg={BRAND.greenSoft} style={{ fontSize: 12, padding: "5px 12px" }}>✓ DOTACIÓN BASE COMPLETA</Chip> : <Chip color={BRAND.red} bg={BRAND.redSoft} style={{ fontSize: 12, padding: "5px 12px" }}>FALTAN {dot.falta.length} DE LA DOTACIÓN BASE</Chip>}</div>
            {/* Checklist dotacion base */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              {BASELINE.map((t) => { const ok = dot.tipos.has(t); return (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: ok ? BRAND.charcoal : BRAND.stone }}>
                  <span style={{ fontSize: 16 }}>{tipoDef(t).icon}</span>
                  <span style={{ flex: 1, fontWeight: ok ? 700 : 400 }}>{tipoDef(t).label}</span>
                  {ok ? <span style={{ color: GREEN, fontWeight: 800 }}>✓ tiene</span> : <span style={{ color: BRAND.red, fontWeight: 800 }}>✗ falta</span>}
                </div>
              ); })}
            </div>
          </div>
        </div>

        {/* EPP entregado (amarrado a requisiciones) */}
        <div style={{ fontSize: 12, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>EPP asignado (entregado)</div>
        {!dot.tiene.length ? (
          <div style={{ background: BRAND.beigeLight, borderRadius: R.md, padding: 16, fontSize: 13, color: BRAND.stone, textAlign: "center" }}>Todavía no se le ha entregado ningún EPP.</div>
        ) : (
          <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.md, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Tipo</th><th style={th}>Ítem</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={th}>Últ. entrega</th><th style={th}>Requisición</th></tr></thead>
              <tbody>
                {dot.tiene.map((x, i) => (
                  <tr key={i}>
                    <td style={td}>{tipoDef(x.tipo).icon} {tipoDef(x.tipo).label}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{x.nombre}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{x.qty}</td>
                    <td style={td}>{fmtDate(x.lastDate)}</td>
                    <td style={{ ...td, fontFamily: FONT.mono, fontSize: 11.5, color: BRAND.orange, fontWeight: 700 }}>{x.reqs.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!dot.pend.length && (
          <div style={{ marginTop: 12, background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink }}>
            🚚 En trámite (aprobado, aún sin entregar): {dot.pend.map((x) => `${x.nombre} (${x.qty})`).join(" · ")}
          </div>
        )}
      </Modal>
    );
  };

  // ══════════════════════════ INVENTARIO ══════════════════════════
  const renderInventario = () => {
    const sorted = [...items].sort((a, b) => String(a.categoria).localeCompare(b.categoria) || String(a.nombre).localeCompare(b.nombre));
    const valorTotal = items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.stock) || 0), 0);
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 13, color: BRAND.graphite }}>{items.length} ítems · Valor del inventario: <b style={{ color: GREEN }}>{fmtL(valorTotal)}</b></div>
          {canManage && <Btn onClick={() => setModal({ t: "item" })}>+ Nuevo ítem</Btn>}
        </div>
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Ítem</th><th style={th}>Tipo</th><th style={th}>Categoría</th><th style={th}>Proveedor</th><th style={{ ...th, textAlign: "right" }}>Precio</th><th style={{ ...th, textAlign: "right" }}>Stock</th><th style={{ ...th, textAlign: "right" }}>Mín.</th>{canManage && <th style={{ ...th, textAlign: "right" }}>Acciones</th>}</tr></thead>
              <tbody>
                {sorted.map((it) => {
                  const sinStock = (Number(it.stock) || 0) <= 0; const bajo = (Number(it.stock) || 0) <= (Number(it.minStock) || 0);
                  return (
                    <tr key={it.id} style={{ background: sinStock ? BRAND.redSoft : bajo ? BRAND.yellowSoft : "transparent" }}>
                      <td style={{ ...td, fontWeight: 700 }}>{it.nombre}</td>
                      <td style={td}>{tipoDef(it.tipoEpp).icon} {tipoDef(it.tipoEpp).label}</td>
                      <td style={td}>{catLabel(it.categoria)}</td>
                      <td style={td}>{provName(it.proveedorId)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: GREEN }}>{fmtL(it.precio)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: sinStock ? BRAND.red : bajo ? "#B45309" : BRAND.charcoal }}>{Number(it.stock) || 0}{bajo && " ⚠"}</td>
                      <td style={{ ...td, textAlign: "right", color: BRAND.stone }}>{Number(it.minStock) || 0}</td>
                      {canManage && <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}><Btn small variant="ghost" onClick={() => setModal({ t: "item", item: it })}>✏️</Btn>{" "}<Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (!confirm(`¿Borrar "${it.nombre}" del catálogo?`)) return; await sItems(items.filter((x) => x.id !== it.id)); }}>🗑</Btn></td>}
                    </tr>
                  );
                })}
                {!items.length && <tr><td style={{ ...td, textAlign: "center", color: BRAND.stone, padding: 30 }} colSpan={canManage ? 8 : 7}>Sin ítems. Agregalos con "+ Nuevo ítem".</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ── Form de ítem (con foto + tipo EPP + descripcion) ──
  const ItemForm = ({ item }) => {
    const [f, setF] = useState(item || { nombre: "", categoria: "", tipoEpp: "", proveedorId: "", precio: "", stock: 0, minStock: 2, descripcion: "", foto: null });
    const [uploading, setUploading] = useState(false);
    const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
    const handleFile = async (file) => {
      if (!file) return;
      if (!file.type?.startsWith("image/")) { alert("Seleccioná una imagen (JPG/PNG)."); return; }
      setUploading(true);
      try {
        const dataUrl = await compressImage(file);
        const fileId = uid();
        const ok = await withTimeout(store.set(`cp-file-${fileId}`, { name: file.name, type: "image/jpeg", size: dataUrl.length, dataUrl }), 25000, "subir foto");
        if (!ok) throw new Error("Supabase rechazó el upload.");
        setPhotoCache((prev) => ({ ...prev, [fileId]: dataUrl }));
        setF((p) => ({ ...p, foto: { fileId, name: file.name } }));
      } catch (err) { alert("No se pudo subir la foto: " + (err?.message || err)); }
      finally { setUploading(false); }
    };
    const fotoUrl = f.foto?.fileId ? photoCache[f.foto.fileId] : null;
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {/* Foto */}
        <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", gap: 16, padding: "12px 14px", background: BRAND.beigeLight, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.md }}>
          <div style={{ width: 78, height: 78, borderRadius: R.md, overflow: "hidden", background: "#fff", border: `1px solid ${BRAND.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {fotoUrl ? <img src={fotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 34, opacity: 0.5 }}>📷</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.ink }}>Foto del artículo</div>
            <div style={{ fontSize: 11, color: uploading ? "#B45309" : BRAND.stone }}>{uploading ? "⏳ Subiendo…" : (f.foto ? "Imagen cargada" : "Opcional — ayuda a identificar el EPP.")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={{ display: "inline-flex", alignItems: "center", padding: "6px 14px", background: BRAND.orange, color: "#fff", borderRadius: R.sm, cursor: uploading ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, opacity: uploading ? 0.6 : 1 }}>
                {f.foto ? "Cambiar foto" : "Subir foto"}
                <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploading} onChange={(ev) => { const file = ev.target.files?.[0]; ev.target.value = ""; if (file) handleFile(file); }} />
              </label>
              {f.foto && <Btn small variant="ghost" onClick={() => u("foto", null)}>Quitar</Btn>}
            </div>
          </div>
        </div>
        <div style={{ gridColumn: "1/-1" }}><Input label="Nombre del ítem" placeholder="Ej: Casco tipo I con barbiquejo" value={f.nombre} onChange={(e) => u("nombre", e.target.value)} /></div>
        <Select label="Tipo de EPP (parte del cuerpo)" placeholder="— Seleccionar —" options={EPP_TIPOS.map((t) => ({ value: t.value, label: `${t.icon} ${t.label}` }))} value={f.tipoEpp} onChange={(e) => u("tipoEpp", e.target.value)} />
        <Select label="Categoría (área)" placeholder="— Seleccionar —" options={CATEGORIAS} value={f.categoria} onChange={(e) => u("categoria", e.target.value)} />
        <Select label="Proveedor" placeholder="— Seleccionar —" options={providers.map((p) => ({ value: p.id, label: p.nombre }))} value={f.proveedorId} onChange={(e) => u("proveedorId", e.target.value)} />
        <Input label="Precio real (L)" type="number" min="0" step="0.01" value={f.precio} onChange={(e) => u("precio", e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Stock actual" type="number" min="0" value={f.stock} onChange={(e) => u("stock", e.target.value)} />
          <Input label="Stock mínimo" type="number" min="0" value={f.minStock} onChange={(e) => u("minStock", e.target.value)} />
        </div>
        <div style={{ gridColumn: "1/-1" }}><TextArea label="Descripción" placeholder="Talla, norma, material, especificaciones…" value={f.descripcion} onChange={(e) => u("descripcion", e.target.value)} /></div>
        {!providers.length && <div style={{ gridColumn: "1/-1", background: BRAND.yellowSoft, borderRadius: R.sm, padding: "8px 12px", fontSize: 12.5, color: "#8a6d0b" }}>⚠ No hay proveedores — andá a la pestaña Proveedores primero.</div>}
        <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="success" disabled={uploading} onClick={async () => {
            if (!f.nombre.trim()) return alert("Poné el nombre del ítem.");
            if (!f.tipoEpp) return alert("Seleccioná el tipo de EPP.");
            if (!f.categoria) return alert("Seleccioná la categoría.");
            if (!f.proveedorId) return alert("Seleccioná el proveedor.");
            if (f.precio === "" || Number(f.precio) < 0) return alert("Poné el precio real.");
            const rec = { ...f, precio: Number(f.precio), stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0, id: f.id || uid() };
            const ok = await sItems(item ? items.map((x) => (x.id === rec.id ? rec : x)) : [...items, rec]);
            if (ok) setModal(null);
          }}>{item ? "Guardar cambios" : "Agregar al catálogo"}</Btn>
        </div>
      </div>
    );
  };

  // ══════════════════════════ PROVEEDORES ══════════════════════════
  const renderProveedores = () => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 13, color: BRAND.graphite }}>{providers.length} proveedor(es) de EPP</div>
        {canManage && (
          <div style={{ display: "flex", gap: 8 }}>
            {!providers.length && <Btn variant="info" onClick={async () => { if (!confirm("¿Cargar los 6 proveedores iniciales?\n\n" + PROV_SEED.join(" · "))) return; await sProv(PROV_SEED.map((n) => ({ id: uid(), nombre: n, contacto: "", telefono: "", correo: "", notas: "" }))); }}>⚡ Cargar los 6 proveedores</Btn>}
            <Btn onClick={() => setModal({ t: "prov" })}>+ Nuevo proveedor</Btn>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {providers.map((p) => {
          const nItems = items.filter((i) => i.proveedorId === p.id).length;
          return (
            <div key={p.id} style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, padding: 16, boxShadow: BRAND.shadowSm }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: BRAND.charcoal }}>🏪 {p.nombre}</div>
                {canManage && <div style={{ display: "flex", gap: 4 }}><Btn small variant="ghost" onClick={() => setModal({ t: "prov", prov: p })}>✏️</Btn><Btn small variant="ghost" style={{ color: BRAND.red }} onClick={async () => { if (nItems && !confirm(`"${p.nombre}" tiene ${nItems} ítem(s) que quedarían sin proveedor.\n\n¿Borrar igual?`)) return; if (!nItems && !confirm(`¿Borrar al proveedor "${p.nombre}"?`)) return; await sProv(providers.filter((x) => x.id !== p.id)); }}>🗑</Btn></div>}
              </div>
              <div style={{ fontSize: 12.5, color: BRAND.graphite, marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                {p.contacto && <div>👤 {p.contacto}</div>}{p.telefono && <div>📞 {p.telefono}</div>}{p.correo && <div>✉️ {p.correo}</div>}{p.notas && <div style={{ color: BRAND.stone }}>{p.notas}</div>}
              </div>
              <div style={{ marginTop: 10 }}><Chip color={BRAND.orange} bg={BRAND.orangeBg}>{nItems} ÍTEM(S) EN CATÁLOGO</Chip></div>
            </div>
          );
        })}
        {!providers.length && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 50, color: BRAND.stone, background: "#fff", borderRadius: R.lg, border: `1px dashed ${BRAND.border}` }}>Sin proveedores. {canManage ? "Usá \"⚡ Cargar los 6 proveedores\"." : ""}</div>}
      </div>
    </div>
  );

  const ProvForm = ({ prov }) => {
    const [f, setF] = useState(prov || { nombre: "", contacto: "", telefono: "", correo: "", notas: "" });
    const u = (k, v) => setF((p) => ({ ...p, [k]: v }));
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1/-1" }}><Input label="Nombre" value={f.nombre} onChange={(e) => u("nombre", e.target.value)} /></div>
        <Input label="Contacto" value={f.contacto} onChange={(e) => u("contacto", e.target.value)} />
        <Input label="Teléfono" value={f.telefono} onChange={(e) => u("telefono", e.target.value)} />
        <div style={{ gridColumn: "1/-1" }}><Input label="Correo" value={f.correo} onChange={(e) => u("correo", e.target.value)} /></div>
        <div style={{ gridColumn: "1/-1" }}><Input label="Notas" value={f.notas} onChange={(e) => u("notas", e.target.value)} /></div>
        <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
          <Btn variant="success" onClick={async () => { if (!f.nombre.trim()) return alert("Poné el nombre."); const rec = { ...f, id: f.id || uid() }; const ok = await sProv(prov ? providers.map((x) => (x.id === rec.id ? rec : x)) : [...providers, rec]); if (ok) setModal(null); }}>{prov ? "Guardar cambios" : "Agregar proveedor"}</Btn>
        </div>
      </div>
    );
  };

  // ══════════════════════════ DESCUENTOS ══════════════════════════
  const renderDescuentos = () => {
    const totalPend = perdidasPend.reduce((s, p) => s + p.linea.precio * p.linea.qty, 0);
    return (
      <div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${BRAND.red}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Pendiente de deducir</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: BRAND.red, marginTop: 4 }}>{fmtL(totalPend)}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>{perdidasPend.length} pérdida(s) sin deducir</div>
          </div>
          <div style={{ flex: "1 1 200px", background: "#fff", border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${GREEN}`, borderRadius: R.md, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 }}>Ya deducidas</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: GREEN, marginTop: 4 }}>{perdidas.length - perdidasPend.length}</div>
            <div style={{ fontSize: 12, color: BRAND.stone }}>histórico de descuentos aplicados</div>
          </div>
        </div>
        <div style={{ background: BRAND.redSoft, border: `1px solid ${BRAND.red}30`, borderRadius: R.md, padding: "10px 14px", fontSize: 12.5, color: BRAND.ink, marginBottom: 14 }}>⚠ Cada EPP solicitado por <b>pérdida/extravío</b> aparece acá para <b>deducirse de la planilla</b> del colaborador. Cuando tesorería lo aplique, se marca "Deducido".</div>
        <div style={{ background: "#fff", border: `1px solid ${BRAND.border}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: BRAND.beigeLight }}><th style={th}>Fecha</th><th style={th}>Colaborador</th><th style={th}>Ítem perdido</th><th style={th}>Requisición</th><th style={{ ...th, textAlign: "right" }}>Cant.</th><th style={{ ...th, textAlign: "right" }}>A deducir</th><th style={th}>Estado</th>{canDeduct && <th style={{ ...th, textAlign: "right" }}>Acción</th>}</tr></thead>
              <tbody>
                {perdidas.map(({ req, linea, idx }) => (
                  <tr key={req.id + "-" + idx} style={{ background: linea.deducido ? "transparent" : BRAND.redSoft }}>
                    <td style={td}>{fmtDate(req.fecha)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{linea.paraNombre} <span style={{ fontSize: 10, color: BRAND.stone, fontWeight: 700 }}>{linea.paraEmpresa ? coTag(linea.paraEmpresa) : ""}</span></td>
                    <td style={td}>{tipoDef(linea.tipoEpp).icon} {linea.nombre}</td>
                    <td style={{ ...td, fontFamily: FONT.mono, fontWeight: 700, color: BRAND.orange }}>{req.numero}</td>
                    <td style={{ ...td, textAlign: "right" }}>{linea.qty}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 800, color: BRAND.red }}>{fmtL(linea.precio * linea.qty)}</td>
                    <td style={td}>{linea.deducido ? <Chip color={GREEN} bg={BRAND.greenSoft}>DEDUCIDO ✓{linea.deducidoPor ? ` · ${linea.deducidoPor}` : ""}</Chip> : <Chip color={BRAND.red} bg={BRAND.redSoft}>PENDIENTE</Chip>}</td>
                    {canDeduct && <td style={{ ...td, textAlign: "right" }}><Btn small variant={linea.deducido ? "ghost" : "success"} onClick={() => { if (!linea.deducido && !confirm(`¿Marcar como DEDUCIDO en planilla?\n\n${linea.paraNombre} — ${linea.nombre} (${fmtL(linea.precio * linea.qty)})`)) return; toggleDeducido(req.id, idx); }}>{linea.deducido ? "↩ Revertir" : "✓ Deducido"}</Btn></td>}
                  </tr>
                ))}
                {!perdidas.length && <tr><td style={{ ...td, textAlign: "center", color: BRAND.stone, padding: 30 }} colSpan={canDeduct ? 8 : 7}>Sin pérdidas registradas. 🎉</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════ LAYOUT ══════════════════════════
  const TABS = [
    { id: "catalogo", label: "🛒 Catálogo" },
    { id: "requisiciones", label: "📋 Requisiciones", badge: reqsPendientes },
    { id: "dotacion", label: "👷 Dotación" },
    { id: "inventario", label: "📦 Inventario" },
    { id: "proveedores", label: "🏪 Proveedores" },
    { id: "descuentos", label: "⚠️ Descuentos planilla", badge: perdidasPend.length, badgeColor: BRAND.red },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BRAND.beige, fontFamily: FONT.body, display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#fff", borderBottom: `1px solid ${BRAND.border}`, padding: "14px 26px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: R.md, background: "#B45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21 }}>🦺</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.charcoal, fontFamily: FONT.display }}>GeoSafety</div>
            <div style={{ fontSize: 11.5, color: BRAND.stone }}>EPP · Catálogo, dotación y requisiciones — Grupo Geotecnica</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!readOnly && <Btn variant={cartUnits ? "primary" : "ghost"} onClick={() => setModal({ t: "cart" })}>🛒 Carrito{cartUnits ? ` (${cartUnits})` : ""}</Btn>}
          <span style={{ fontSize: 12.5, color: BRAND.graphite, fontWeight: 600 }}>{userName}</span>
          <Btn variant="ghost" onClick={onBack}>← Módulos</Btn>
          <Btn variant="ghost" onClick={onLogout}>Salir</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "14px 26px 0", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setSec(t.id)} style={{ padding: "9px 16px", borderRadius: `${R.md}px ${R.md}px 0 0`, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: FONT.body, border: `1px solid ${sec === t.id ? BRAND.border : "transparent"}`, borderBottom: "none", background: sec === t.id ? "#fff" : "transparent", color: sec === t.id ? BRAND.orange : BRAND.graphite }}>
            {t.label}{t.badge ? <span style={{ marginLeft: 6, background: t.badgeColor || BRAND.orange, color: "#fff", borderRadius: R.full, padding: "1px 7px", fontSize: 10.5, fontWeight: 800 }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>

      <div style={{ padding: "20px 26px 40px", maxWidth: 1280, margin: "0 auto", width: "100%", boxSizing: "border-box", flex: 1 }}>
        {!loaded ? <div style={{ textAlign: "center", padding: 60, color: BRAND.stone }}>Cargando GeoSafety…</div> : (
          <>
            {sec === "catalogo" && renderCatalogo()}
            {sec === "requisiciones" && renderRequisiciones()}
            {sec === "dotacion" && renderDotacion()}
            {sec === "inventario" && renderInventario()}
            {sec === "proveedores" && renderProveedores()}
            {sec === "descuentos" && renderDescuentos()}
          </>
        )}
      </div>

      {/* Footer de créditos */}
      <div style={{ textAlign: "center", padding: "16px 20px 22px", fontSize: 11.5, color: BRAND.ash, borderTop: `1px solid ${BRAND.borderSoft}` }}>
        Lic. Gerson &nbsp;&amp;&nbsp; Ing. Nanu &nbsp;·&nbsp; <b style={{ color: BRAND.stone }}>GAIB Services</b>
      </div>

      {modal?.t === "cart" && <CartModal />}
      {modal?.t === "item" && <Modal title={modal.item ? "Editar ítem" : "Nuevo ítem de EPP"} onClose={() => setModal(null)}><ItemForm item={modal.item} /></Modal>}
      {modal?.t === "prov" && <Modal title={modal.prov ? "Editar proveedor" : "Nuevo proveedor"} onClose={() => setModal(null)} width={520}><ProvForm prov={modal.prov} /></Modal>}
      {modal?.t === "ficha" && <FichaModal empId={modal.empId} />}
    </div>
  );
}
