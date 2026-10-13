// ═══════════════════════════════════════════════════════════════════════════
// GeoInventory — Inventario, ubicaciones y herramientas (13-oct-2026)
// ═══════════════════════════════════════════════════════════════════════════
// Tres preguntas sobre cada cosa: qué es, dónde está y cuánto hay (o en qué
// estado está). Pensado PRIMERO PARA CELULAR: Óscar carga el Almacén Central
// caminando por la bodega y Ana las oficinas.
//
// Reglas de la casa:
//   · Misma estética que GeoShopping/GeoSupply (GT_CSS, vidrio, naranja/carbón).
//   · Lógica en geoinventory-calc.js (pura, con pruebas). Acá: estado,
//     guardado y pantalla.
//   · GUARDADO: `guardarItems(fn)` aplica `fn` a la lista FRESCA de la nube
//     (getCloud → set → verify por ids). Los códigos (MAT-0001…) se asignan
//     ahí, sobre la lista fresca, para que dos personas cargando a la vez no
//     repitan código. El historial (`inv-mov-AAAA-MM`) se escribe solo.
//   · Fotos: canvas a 800 px / JPEG 0.75 → `cp-file-<id>` (el mismo almacén de
//     archivos de GeoShopping). El artículo guarda solo {fileId, name, size}.
//   · Forms a NIVEL DE MÓDULO (no se remontan al subir una foto).
//
// Keys: inv-items · inv-ubicaciones · inv-mov-AAAA-MM · cp-file-<id>.
import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";
import { USERS, ROLE_LABEL } from "./users.js";
import { safeDynamicImport } from "./lazyLoad.js";
import { Input, Select, Textarea, Btn, Chip, Modal, C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, uid, useIsMobile } from "./geocost-ui.jsx";
import { VisorArchivo } from "./visor-archivo.jsx";
import {
  CATEGORIAS, categoriaDe, esHerramienta, TIPOS_HERRAMIENTA, tipoHerramientaLabel, estadosDe, estadoInicial, estadoLabel,
  ubicacionesDe, nombreUbicacion, TIPO_UBICACION, sugerirExistentes, siguientesCodigos, codigoDeTexto, esCodigo,
  stockDe, stockEn, ubicacionesConStock, aplicarMovimiento, textoMovimiento, keyMovimientos, ACCIONES,
  permisosDe, resumenInventario, buscarItems, UNIDADES, num, plantillaCSV, parseTabla, prepararImportacion,
} from "./geoinventory-calc.js";
import { generarEtiquetasPDF, qrDataUrl, urlDeFicha } from "./geoinventory-etiquetas.js";

const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const CHARCOAL = "#2C2A28";
const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.07)", borde: "rgba(192,57,43,.22)" };
const TONO = { gris: C_GRIS, verde: C_VERDE, azul: C_AZUL, amarillo: C_AMARILLO, naranja: C_NARANJA, rojo: C_ROJO };
const K_ITEMS = "inv-items", K_UBIC = "inv-ubicaciones";
const fileKey = (id) => `cp-file-${id}`;
const fmtN = (n) => num(n).toLocaleString("es-HN", { maximumFractionDigits: 2 });
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("es-HN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDia = (iso) => iso ? new Date(iso).toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long" }) : "—";
const diaDe = (iso) => String(iso || "").slice(0, 10);
const CTRL = { padding: "10px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 12, fontSize: 14, outline: "none", background: "#F4F4F2", fontFamily: "inherit", boxSizing: "border-box", width: "100%", minHeight: 44 };
const LBL = { fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" };
const pillBtn = (label, active, onClick, { n, c, disabled, title, key, grande } = {}) => <button key={key || label} type="button" title={title} disabled={disabled} onClick={onClick} aria-pressed={active}
  style={{ padding: grande ? "11px 16px" : "8px 14px", minHeight: grande ? 44 : 36, borderRadius: 999, border: active ? "none" : "1px solid rgba(44,42,40,.12)", background: active ? (c || ORANGE_DARK) : "rgba(255,255,255,.65)", color: active ? "#fff" : "#5C5853", font: `700 ${grande ? 13.5 : 12.5}px/1 var(--sans)`, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
  {label}{n != null && <span style={{ opacity: .75, fontWeight: 600 }}>{n}</span>}</button>;
const Vacio = ({ children }) => <div className="gt-vidrio" style={{ padding: "44px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>{children}</div>;
const chipEstado = (item) => { const e = estadosDe(item)[item?.estado]; return <Chip c={TONO[e?.tono] || C_GRIS}>{e?.label || item?.estado || "—"}</Chip>; };
const Buscador = ({ value, onChange, placeholder, onEnter, inputRef, autoFocus }) => <input ref={inputRef} autoFocus={autoFocus} value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(value); }} placeholder={placeholder} inputMode="search" style={{ flex: 1, minWidth: 160, padding: "10px 14px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 999, fontSize: 14, background: "rgba(255,255,255,.75)", outline: "none", fontFamily: "inherit", minHeight: 44 }} />;

// ── Iconos de línea (monocromos, como el panel) ──
const Ico = ({ d, size = 20, color = "currentColor", sw = 1.8 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const ICO = {
  agregar: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  buscar: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  escanear: <><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M7 12h10" /></>,
  ubicaciones: <><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11Z" /><circle cx="12" cy="10" r="2.2" /></>,
  camara: <><path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.2" /></>,
  galeria: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.5" /><path d="m21 16-5-5-8 8" /></>,
  materiales: <><path d="M3.3 7.5 12 3l8.7 4.5v9L12 21l-8.7-4.5v-9Z" /><path d="M3.3 7.5 12 12l8.7-4.5M12 12v9" /></>,
  insumos_perforacion: <><path d="M12 3v6M9 9h6l-1 11h-4L9 9Z" /><path d="M8 6h8" /></>,
  herramientas_perforacion: <><path d="M14.5 4.5a4 4 0 0 0-5.2 5.2L4 15l5 5 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.7 2.7-2.3-2.3 2.7-2.7Z" /></>,
  mobiliario: <><path d="M5 11V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5" /><path d="M4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4v-3Z" /><path d="M6 16v4M18 16v4" /></>,
  computo: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  otros: <><circle cx="6" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18" cy="12" r="1.6" /></>,
  herramienta: <><path d="M14.5 4.5a4 4 0 0 0-5.2 5.2L4 15l5 5 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.7 2.7-2.3-2.3 2.7-2.7Z" /></>,
  movimientos: <><path d="M4 7h12l-3-3M20 17H8l3 3" /></>,
  persona: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  qr: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" /></>,
  imprimir: <><path d="M6 9V4h12v5M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" /><rect x="6" y="14" width="12" height="6" /></>,
  check: <><path d="m5 12 4.5 4.5L19 7" /></>,
};

// ── Foto comprimida (800 px, JPEG 0.75) ──
const comprimirFoto = (file, MAX = 800) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("La foto tardó demasiado en procesarse")), 20000);
  const fr = new FileReader();
  fr.onerror = () => { clearTimeout(t); reject(new Error("No se pudo leer la foto")); };
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => { clearTimeout(t); reject(new Error("No se pudo decodificar la foto")); };
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
        clearTimeout(t); resolve(c.toDataURL("image/jpeg", 0.75));
      } catch (e) { clearTimeout(t); reject(e); }
    };
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
});

// ── Foto de un artículo (carga perezosa con cache compartido) ──
const fotoCache = new Map();          // fileId → dataUrl | Promise
const cargarFoto = (fileId) => {
  if (!fileId) return Promise.resolve(null);
  const c = fotoCache.get(fileId);
  if (c) return typeof c === "string" ? Promise.resolve(c) : c;
  const p = store.getCloud(fileKey(fileId)).then(f => { const d = f?.dataUrl || null; fotoCache.set(fileId, d); return d; }).catch(() => { fotoCache.delete(fileId); return null; });
  fotoCache.set(fileId, p);
  return p;
};
function Foto({ foto, size = 56, radius = 12, onClick, categoria, style: sx }) {
  const fileId = foto?.fileId;
  const [src, setSrc] = useState(() => { const c = fotoCache.get(fileId); return typeof c === "string" ? c : null; });
  useEffect(() => { let vivo = true; if (!fileId) { setSrc(null); return; } cargarFoto(fileId).then(d => { if (vivo) setSrc(d); }); return () => { vivo = false; }; }, [fileId]);
  const base = { width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: "hidden", background: "rgba(44,42,40,.06)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)", cursor: onClick && src ? "zoom-in" : "default", ...(sx || {}) };
  if (src) return <div style={base} onClick={onClick}><img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /></div>;
  return <div style={base}><Ico d={ICO[categoria] || ICO.otros} size={Math.max(16, size * 0.42)} color="rgba(44,42,40,.35)" /></div>;
}

// ── Buscador de colaboradores de GeoTeam (para "Asignado a") ──
function BuscaEmpleado({ emps, value, onChange, placeholder = "Buscar colaborador…" }) {
  const [q, setQ] = useState("");
  const sel = emps.find(e => e.id === value);
  const lista = q.trim().length >= 2 ? emps.filter(e => `${e.fullName} ${e.position || ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  if (sel) return <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
    <Chip c={C_AZUL} style={{ fontSize: 13, padding: "7px 12px" }}><Ico d={ICO.persona} size={14} /> {sel.fullName}</Chip>
    <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{sel.position}{sel.project ? ` · ${sel.project}` : ""}</span>
    <button type="button" onClick={() => onChange("", "")} style={{ background: "none", border: "none", color: C_ROJO.color, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Quitar</button>
  </div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} style={CTRL} />
    {lista.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {lista.map(e => <button key={e.id} type="button" onClick={() => { onChange(e.id, e.fullName); setQ(""); }} style={{ textAlign: "left", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(44,42,40,.08)", background: "rgba(255,255,255,.8)", cursor: "pointer", fontFamily: "inherit", fontSize: 13.5, color: CHARCOAL, minHeight: 44 }}><b>{e.fullName}</b> <span style={{ color: "var(--text-3)", fontSize: 12 }}>· {e.position}{e.project ? ` · ${e.project}` : ""}</span></button>)}
    </div>}
    {q.trim().length >= 2 && !lista.length && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Nadie en GeoTeam con ese nombre.</div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGREGAR — la pantalla que Óscar y Ana usan mañana (a nivel de módulo)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠ A nivel de módulo: un componente definido DENTRO del form se remonta en
// cada re-render y los inputs pierden el foco con cada tecla.
function PasoCaja({ n, titulo, children, extra, isMobile }) {
  return <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: CHARCOAL, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 12px/1 var(--sans)", flexShrink: 0 }}>{n}</span>
      <span style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>{titulo}</span>
      {extra && <span style={{ marginLeft: "auto" }}>{extra}</span>}
    </div>
    {children}
  </div>;
}
const FORM_VACIO = { foto: null, nombre: "", tipo: "cantidad", categoria: "materiales", cantidad: "", unidad: "Unidad", estado: "", asignadoA: "", asignadoNombre: "", iguales: "1", herrTipo: "broca", diametro: "", marca: "", modelo: "", serie: "", estante: "", notas: "" };
function AgregarFormImpl({ ubicaciones, ubicFija, setUbicFija, items, emps, onGuardar, onSumar, ocupado, isMobile, ultimo, setUltimo }) {
  const [f, setF] = useState(() => ({ ...FORM_VACIO, ...(ultimo || {}) }));
  const [existente, setExistente] = useState(null);    // artículo existente elegido de las sugerencias
  const [sumar, setSumar] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [guardado, setGuardado] = useState(null);       // aviso verde "Guardado MAT-0012"
  const nombreRef = useRef(null);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const ubic = ubicaciones.find(x => x.id === ubicFija);
  const esHer = f.categoria === "herramientas_perforacion";
  const sugeridos = existente ? [] : sugerirExistentes(f.nombre, items, { categoria: f.categoria });
  const estados = estadosDe({ categoria: f.categoria });
  const tomarFoto = async (file) => {
    if (!file) return;
    setProcesando(true);
    try { u("foto", { dataUrl: await comprimirFoto(file), name: file.name || "foto.jpg" }); }
    catch (e) { alert("No pude procesar la foto: " + (e?.message || e)); }
    finally { setProcesando(false); }
  };
  const elegirExistente = (it) => {
    setExistente(it);
    if (it.tipo === "cantidad") { setSumar(""); }
    else setF(p => ({ ...p, nombre: it.nombre, tipo: "individual", categoria: it.categoria, marca: it.marca || "", modelo: it.modelo || "", herrTipo: it.herramienta?.tipo || p.herrTipo, diametro: it.herramienta?.diametro || "", unidad: it.unidad || p.unidad, fotoDe: it.foto || null, foto: null }));
  };
  const limpiarExistente = () => { setExistente(null); setSumar(""); setF(p => ({ ...p, fotoDe: null })); };
  const validar = () => {
    if (!ubic) return "Elegí la ubicación donde estás cargando.";
    if (existente?.tipo === "cantidad") return num(sumar) > 0 ? null : "Escribí cuánto vas a sumar.";
    if (!String(f.nombre).trim()) return "Escribí el nombre.";
    if (f.tipo === "cantidad" && !(num(f.cantidad) > 0)) return "Escribí la cantidad.";
    if (f.tipo === "cantidad" && !String(f.unidad).trim()) return "Elegí la unidad.";
    if (f.tipo === "individual" && !(num(f.iguales) >= 1 && num(f.iguales) <= 200)) return "¿Cuántos iguales? Entre 1 y 200.";
    if (esHer && !String(f.diametro).trim()) return "Escribí el diámetro de la herramienta.";
    return null;
  };
  const guardar = async (otro) => {
    const e = validar(); if (e) return alert(e);
    setGuardado(null);
    let r;
    if (existente?.tipo === "cantidad") r = await onSumar(existente, num(sumar), ubicFija);
    else r = await onGuardar({ ...f, estado: f.estado || estadoInicial(f.categoria), ubicacionId: ubicFija }, { fotoDe: f.fotoDe });
    if (!r) return;
    setGuardado(r);
    const memoria = { tipo: f.tipo, categoria: f.categoria, unidad: f.unidad, herrTipo: f.herrTipo };
    setUltimo(memoria);
    setExistente(null); setSumar("");
    setF({ ...FORM_VACIO, ...memoria });
    if (otro) setTimeout(() => nombreRef.current?.focus(), 50);
  };
  const Paso = PasoCaja;   // componente ESTABLE (a nivel de módulo)
  const inputFoto = (capture) => <label style={{ flex: 1, minHeight: 56, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 14px", borderRadius: 14, border: `1px dashed ${ORANGE}`, background: "rgba(232,118,45,.06)", color: "var(--naranja-tinta)", font: "800 13.5px/1 var(--sans)", cursor: procesando ? "wait" : "pointer" }}>
    <Ico d={capture ? ICO.camara : ICO.galeria} size={20} /> {procesando ? "Procesando…" : capture ? "Tomar foto" : "De la galería"}
    <input type="file" accept="image/*" {...(capture ? { capture: "environment" } : {})} disabled={procesando} style={{ display: "none" }} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; tomarFoto(file); }} />
  </label>;

  return <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 720, margin: "0 auto", width: "100%" }}>
    {guardado && <div style={{ padding: "12px 16px", borderRadius: 14, background: C_VERDE.bg, color: C_VERDE.color, fontSize: 13.5, display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}><Ico d={ICO.check} size={18} /> {guardado}</div>}
    <Paso isMobile={isMobile} n="1" titulo="Dónde estás cargando" extra={ubic && <Chip c={C_NARANJA} style={{ fontSize: 12 }}>{TIPO_UBICACION[ubic.tipo]}</Chip>}>
      <select value={ubicFija} onChange={e => setUbicFija(e.target.value)} style={{ ...CTRL, fontWeight: 700, fontSize: 15 }}>
        <option value="">— Elegí la ubicación —</option>
        {ubicaciones.map(x => <option key={x.id} value={x.id}>{x.nombre}{x.tipo === "proyecto" && x.nombreLargo && x.nombreLargo !== x.nombre ? ` — ${x.nombreLargo}` : ""}</option>)}
      </select>
      <div style={{ fontSize: 12, color: "var(--text-3)" }}>Se queda fija: todo lo que cargués va ahí hasta que la cambiés.</div>
    </Paso>

    <Paso isMobile={isMobile} n="2" titulo="Foto">
      {f.foto || f.fotoDe
        ? <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {f.foto ? <img src={f.foto.dataUrl} alt="" style={{ width: 96, height: 96, borderRadius: 14, objectFit: "cover" }} /> : <Foto foto={f.fotoDe} size={96} radius={14} categoria={f.categoria} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{f.foto ? "Lista." : "Usa la misma foto del artículo existente."}</div>
            <div style={{ display: "flex", gap: 8 }}>{inputFoto(true)}{!isMobile && inputFoto(false)}</div>
            <button type="button" onClick={() => setF(p => ({ ...p, foto: null, fotoDe: null }))} style={{ alignSelf: "flex-start", background: "none", border: "none", color: C_ROJO.color, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Quitar foto</button>
          </div>
        </div>
        : <div style={{ display: "flex", gap: 8 }}>{inputFoto(true)}{inputFoto(false)}</div>}
    </Paso>

    <Paso isMobile={isMobile} n="3" titulo="Qué es">
      <input ref={nombreRef} value={f.nombre} onChange={e => { u("nombre", e.target.value); if (existente) limpiarExistente(); }} placeholder="Ej. Cemento GU 42.5 kg · Broca 1.20 m · Monitor 24&quot;" style={{ ...CTRL, fontSize: 16, fontWeight: 600 }} autoCapitalize="sentences" />
      {sugeridos.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={LBL}>¿Es alguno de estos? Tocalo y no se duplica</div>
        {sugeridos.map(it => <button key={it.id} type="button" onClick={() => elegirExistente(it)} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, border: "1px solid rgba(44,42,40,.1)", background: "rgba(255,255,255,.8)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", minHeight: 52 }}>
          <Foto foto={it.foto} size={40} radius={10} categoria={it.categoria} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nombre}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{it.codigo} · {it.tipo === "cantidad" ? `${fmtN(stockDe(it))} ${it.unidad} en total${ubicFija ? ` · ${fmtN(stockEn(it, ubicFija))} acá` : ""}` : `individual · ${estadoLabel(it)}`}</div>
          </div>
          <span style={{ color: "var(--naranja-tinta)", fontWeight: 800, fontSize: 12 }}>{it.tipo === "cantidad" ? "Sumar" : "Otro igual"}</span>
        </button>)}
      </div>}
      {existente && existente.tipo === "cantidad" && <div style={{ padding: 12, borderRadius: 14, background: C_VERDE.bg, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, color: C_VERDE.color }}><b>Ya existe: {existente.nombre}</b> ({existente.codigo}) · hay {fmtN(stockEn(existente, ubicFija))} {existente.unidad} en {ubic?.nombre || "esta ubicación"}. Solo sumás.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" inputMode="decimal" min="0" step="any" value={sumar} onChange={e => setSumar(e.target.value)} placeholder="Cuánto entra" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right", flex: 1 }} autoFocus />
          <span style={{ fontWeight: 700, color: "var(--text-2)" }}>{existente.unidad}</span>
          <button type="button" onClick={limpiarExistente} style={{ background: "none", border: "none", color: "var(--text-3)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>No es este</button>
        </div>
      </div>}
      {existente && existente.tipo === "individual" && <div style={{ fontSize: 12.5, color: C_AZUL.color, background: C_AZUL.bg, borderRadius: 12, padding: "9px 12px" }}>Vas a crear <b>otro igual</b> a {existente.codigo}, con su propio código. <button type="button" onClick={limpiarExistente} style={{ background: "none", border: "none", color: C_AZUL.color, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>No es igual</button></div>}
    </Paso>

    {!(existente?.tipo === "cantidad") && <>
      <Paso isMobile={isMobile} n="4" titulo="Tipo y categoría">
        <div style={{ display: "flex", gap: 8 }}>
          {pillBtn("Por cantidad", f.tipo === "cantidad", () => u("tipo", "cantidad"), { grande: true, c: CHARCOAL })}
          {pillBtn("Individual (con código propio)", f.tipo === "individual", () => u("tipo", "individual"), { grande: true, c: CHARCOAL })}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{f.tipo === "cantidad" ? "Cosas iguales entre sí: cemento, picas, sillas. Se cuenta cuántas hay." : "Cada unidad es única: lleva número de serie, se asigna a una persona o es herramienta de perforación."}</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 8 }}>
          {CATEGORIAS.map(c => { const act = f.categoria === c.id; return <button key={c.id} type="button" onClick={() => { u("categoria", c.id); if (c.id === "herramientas_perforacion") u("tipo", "individual"); u("estado", ""); }} aria-pressed={act}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", minHeight: 52, borderRadius: 14, border: act ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: act ? ORANGE_DARK : "rgba(255,255,255,.65)", color: act ? "#fff" : "#5C5853", font: "700 13px/1.2 var(--sans)", cursor: "pointer", textAlign: "left" }}>
            <Ico d={ICO[c.id]} size={20} /> {c.corto}</button>; })}
        </div>
      </Paso>

      {f.tipo === "cantidad"
        ? <Paso isMobile={isMobile} n="5" titulo="Cuánto hay">
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 8 }}>
            <input type="number" inputMode="decimal" min="0" step="any" value={f.cantidad} onChange={e => u("cantidad", e.target.value)} placeholder="Cantidad" style={{ ...CTRL, fontSize: 20, fontWeight: 800, textAlign: "right" }} />
            <input list="inv-unidades" value={f.unidad} onChange={e => u("unidad", e.target.value)} placeholder="Unidad" style={{ ...CTRL, fontWeight: 700 }} />
            <datalist id="inv-unidades">{UNIDADES.map(x => <option key={x} value={x} />)}</datalist>
          </div>
          {ubic?.tipo === "almacen" && <input value={f.estante} onChange={e => u("estante", e.target.value)} placeholder="Estante (opcional) · ej. A-2" list="inv-estantes" style={CTRL} />}
          <datalist id="inv-estantes">{[...new Set(items.map(i => i.estante).filter(Boolean))].map(x => <option key={x} value={x} />)}</datalist>
        </Paso>
        : <Paso isMobile={isMobile} n="5" titulo={esHer ? "La herramienta" : "Detalle"}>
          {esHer && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>{TIPOS_HERRAMIENTA.map(t => pillBtn(t.label, f.herrTipo === t.id, () => u("herrTipo", t.id), { key: t.id, grande: true, c: CHARCOAL }))}</div>
            <input value={f.diametro} onChange={e => u("diametro", e.target.value)} placeholder="Diámetro · ej. 1.20 m" style={{ ...CTRL, fontWeight: 700 }} />
          </div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={LBL}>Estado</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{Object.entries(estados).map(([k, e]) => pillBtn(e.label, (f.estado || estadoInicial(f.categoria)) === k, () => u("estado", k), { key: k, grande: true, c: TONO[e.tono]?.color }))}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
            <input value={f.marca} onChange={e => u("marca", e.target.value)} placeholder="Marca (opcional)" style={CTRL} />
            <input value={f.modelo} onChange={e => u("modelo", e.target.value)} placeholder="Modelo (opcional)" style={CTRL} />
            <input value={f.serie} onChange={e => u("serie", e.target.value)} placeholder="N° de serie (opcional)" style={CTRL} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={LBL}>Asignado a (opcional)</div>
            <BuscaEmpleado emps={emps} value={f.asignadoA} onChange={(id, nombre) => setF(p => ({ ...p, asignadoA: id, asignadoNombre: nombre }))} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(44,42,40,.04)", borderRadius: 12, padding: "8px 12px" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, flex: 1 }}>¿Cuántos iguales?</span>
            <input type="number" inputMode="numeric" min="1" max="200" value={f.iguales} onChange={e => u("iguales", e.target.value)} style={{ ...CTRL, width: 90, textAlign: "center", fontWeight: 800, fontSize: 16 }} />
          </div>
          {num(f.iguales) > 1 && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Se crean {num(f.iguales)} con la misma foto y datos, cada uno con su código{f.asignadoA ? " (el asignado solo va en el primero; los demás los asignás desde su ficha)" : ""}.</div>}
        </Paso>}
      <Textarea label="Nota (opcional)" value={f.notas} onChange={e => u("notas", e.target.value)} style={{ minHeight: 48 }} placeholder="Algo que valga la pena recordar" />
    </>}

    <div style={{ position: "sticky", bottom: 8, zIndex: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" disabled={ocupado || procesando} onClick={() => guardar(true)} style={{ flex: 2, minHeight: 54, borderRadius: 16, border: "none", background: ORANGE_DARK, color: "#fff", font: "800 15px/1 var(--sans)", cursor: ocupado ? "wait" : "pointer", boxShadow: "0 10px 24px rgba(199,95,31,.28)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Ico d={ICO.agregar} size={20} /> {ocupado ? "Guardando…" : existente?.tipo === "cantidad" ? "Sumar y agregar otro" : "Guardar y agregar otro"}</button>
      <button type="button" disabled={ocupado || procesando} onClick={() => guardar(false)} style={{ flex: 1, minHeight: 54, borderRadius: 16, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.9)", color: CHARCOAL, font: "700 14px/1 var(--sans)", cursor: "pointer" }}>Guardar</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM de ubicación (oficina nueva / responsable) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function UbicacionFormImpl({ ubicacion, usuarios, onSave, onClose, ocupado }) {
  const nueva = !ubicacion;
  const [f, setF] = useState(() => ({ nombre: ubicacion?.nombre || "", responsable: ubicacion?.responsable || "", activa: ubicacion?.activa !== false }));
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const resp = usuarios.find(x => x.username === f.responsable);
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {(nueva || ubicacion.tipo === "oficina") && <Input label="Nombre de la oficina *" value={f.nombre} onChange={e => u("nombre", e.target.value)} placeholder="Ej. Oficina Operaciones · Recepción · Sala de reuniones" autoFocus />}
    {!nueva && ubicacion.tipo !== "oficina" && <div style={{ fontSize: 13, color: "var(--text-2)" }}><b>{ubicacion.nombre}</b> · {TIPO_UBICACION[ubicacion.tipo]}</div>}
    <Select label="Responsable (usuario del sistema)" emptyLabel="— Sin responsable —" options={usuarios.map(x => ({ value: x.username, label: `${x.label} · ${ROLE_LABEL[x.role] || x.role}` }))} value={f.responsable} onChange={e => u("responsable", e.target.value)} />
    {!nueva && ubicacion.tipo === "oficina" && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><input type="checkbox" checked={f.activa} onChange={e => u("activa", e.target.checked)} /> Activa (si la desactivás deja de aparecer, pero no se borra nada)</label>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
      <Btn variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Btn>
      <Btn disabled={ocupado} onClick={() => { if ((nueva || ubicacion.tipo === "oficina") && !String(f.nombre).trim()) return alert("Escribí el nombre."); onSave({ ...f, responsableNombre: resp?.label || "" }); }}>{ocupado ? "Guardando…" : "Guardar"}</Btn>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FICHA de un artículo (modal) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function FichaImpl({ item, ubicaciones, emps, maquinas, perms, onAccion, onEditar, onEliminar, onEtiqueta, verFoto, ocupado, isMobile, movs }) {
  const [accion, setAccion] = useState(null);   // entrada | salida | mover | ajustar | asignar | maquina
  const [f, setF] = useState({});
  const [qr, setQr] = useState(null);
  const [verQr, setVerQr] = useState(false);
  useEffect(() => { let vivo = true; qrDataUrl(urlDeFicha(item.codigo), 180).then(d => { if (vivo) setQr(d); }).catch(() => {}); return () => { vivo = false; }; }, [item.codigo]);
  useEffect(() => { setAccion(null); setF({}); }, [item.id, item.updatedAt]);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const cat = categoriaDe(item.categoria);
  const estados = estadosDe(item);
  const enUbic = ubicacionesConStock(item);
  const ubicPrincipal = item.tipo === "individual" ? item.ubicacionId : (enUbic[0]?.id || "");
  const maquina = maquinas.find(m => m.id === item.maquinaId);
  const abrir = (a) => { setAccion(accion === a ? null : a); setF({ de: ubicPrincipal, a: "", cantidad: "", nuevo: "", motivo: "", en: ubicPrincipal }); };
  const ejecutar = async (m) => { const ok = await onAccion(item, m); if (ok) { setAccion(null); setF({}); } };
  const cambiarEstado = (k) => {
    if (k === item.estado) return;
    if (k === "en_operacion") { setAccion("maquina"); setF({ maquinaId: item.maquinaId || "" }); return; }
    ejecutar({ accion: "estado", estado: k });
  };
  const btnAccion = ({ id, label, icono, c = CHARCOAL, show = true }) => show ? <button key={id} type="button" onClick={() => abrir(id)} aria-pressed={accion === id} disabled={ocupado}
    style={{ flex: "1 1 auto", minHeight: 48, padding: "10px 12px", borderRadius: 14, border: accion === id ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: accion === id ? c : "rgba(255,255,255,.75)", color: accion === id ? "#fff" : CHARCOAL, font: "700 13px/1 var(--sans)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{icono && <Ico d={icono} size={16} />}{label}</button> : null;
  const selUbic = (val, onChange, excluir) => <select value={val} onChange={e => onChange(e.target.value)} style={CTRL}>
    <option value="">— Ubicación —</option>{ubicaciones.filter(x => x.id !== excluir).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
  </select>;
  const caja = (children) => <div style={{ padding: 12, borderRadius: 14, background: "rgba(44,42,40,.04)", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
  const historial = (movs || []).filter(m => m.itemId === item.id).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: isMobile ? "wrap" : "nowrap" }}>
      <Foto foto={item.foto} size={isMobile ? 120 : 150} radius={18} categoria={item.categoria} onClick={() => item.foto?.fileId && verFoto(item.foto)} />
      <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 14, color: CHARCOAL }}>{item.codigo}</span>
          <Chip c={C_GRIS}>{cat.corto}</Chip>
          {item.tipo === "individual" ? chipEstado(item) : <Chip c={C_AZUL}>{fmtN(stockDe(item))} {item.unidad}</Chip>}
        </div>
        <div style={{ font: "800 20px/1.15 var(--display)", color: CHARCOAL }}>{item.nombre}</div>
        {esHerramienta(item) && <div style={{ fontSize: 13, color: "var(--text-2)" }}>{tipoHerramientaLabel(item.herramienta?.tipo)}{item.herramienta?.diametro ? ` · Ø ${item.herramienta.diametro}` : ""}{maquina ? <> · en <b>{maquina.nombre}</b></> : item.maquinaNombre ? <> · en <b>{item.maquinaNombre}</b></> : ""}</div>}
        {(item.marca || item.modelo || item.serie) && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{[item.marca, item.modelo, item.serie ? `S/N ${item.serie}` : ""].filter(Boolean).join(" · ")}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {enUbic.length === 0 && <div style={{ fontSize: 13, color: C_ROJO.color, fontWeight: 700 }}>Sin existencias en ninguna ubicación</div>}
          {enUbic.map(x => <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><Ico d={ICO.ubicaciones} size={15} color={ORANGE_DARK} /><b>{nombreUbicacion(ubicaciones, x.id)}</b>{item.tipo === "cantidad" && <span style={{ color: "var(--text-2)" }}>· {fmtN(x.cantidad)} {item.unidad}</span>}{item.estante && <span style={{ color: "var(--text-3)" }}>· estante {item.estante}</span>}</div>)}
          {item.tipo === "individual" && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}><Ico d={ICO.persona} size={15} color={item.asignadoA ? C_AZUL.color : "rgba(44,42,40,.3)"} />{item.asignadoA ? <b>{item.asignadoNombre}</b> : <span style={{ color: "var(--text-3)" }}>Sin asignar</span>}</div>}
        </div>
        {item.notas && <div style={{ fontSize: 12.5, color: "var(--text-2)", whiteSpace: "pre-line" }}>{item.notas}</div>}
      </div>
      <button type="button" onClick={() => setVerQr(v => !v)} title="QR de esta ficha" style={{ width: 64, height: 64, borderRadius: 14, border: "1px solid rgba(44,42,40,.1)", background: "#fff", padding: 6, cursor: "pointer", flexShrink: 0 }}>{qr ? <img src={qr} alt="QR" style={{ width: "100%", height: "100%" }} /> : <Ico d={ICO.qr} size={28} color="rgba(44,42,40,.4)" />}</button>
    </div>
    {verQr && qr && <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 14, background: "#fff", borderRadius: 16 }}><img src={qr} alt="QR" style={{ width: 200, height: 200 }} /><div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 16 }}>{item.codigo}</div><div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Escanealo con la cámara del celular y abre esta ficha.</div></div>}

    {item.tipo === "individual" && perms.estado && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={LBL}>Estado · un toque</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{Object.entries(estados).map(([k, e]) => pillBtn(e.label, item.estado === k, () => cambiarEstado(k), { key: k, grande: true, c: TONO[e.tono]?.color, disabled: ocupado }))}</div>
      {accion === "maquina" && caja(<>
        <div style={LBL}>¿En qué máquina está?</div>
        <select value={f.maquinaId || ""} onChange={e => u("maquinaId", e.target.value)} style={CTRL}><option value="">— Máquina de GeoMachinery —</option>{maquinas.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.tipo ? ` · ${m.tipo}` : ""}</option>)}</select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado || !f.maquinaId} onClick={() => ejecutar({ accion: "estado", estado: "en_operacion", maquinaId: f.maquinaId, maquinaNombre: maquinas.find(m => m.id === f.maquinaId)?.nombre || "" })}>En operación</Btn></div>
      </>)}
    </div>}

    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {btnAccion({ id: "entrada", label: "Entrada", icono: ICO.agregar, c: C_VERDE.color, show: item.tipo === "cantidad" && perms.cargar })}
      {btnAccion({ id: "salida", label: "Salida", icono: ICO.movimientos, c: ORANGE_DARK, show: item.tipo === "cantidad" && perms.cargar })}
      {btnAccion({ id: "mover", label: "Mover", icono: ICO.ubicaciones, c: ORANGE_DARK, show: item.tipo === "individual" && perms.mover })}
      {btnAccion({ id: "asignar", label: item.asignadoA ? "Reasignar" : "Asignar", icono: ICO.persona, c: C_AZUL.color, show: item.tipo === "individual" && perms.asignar })}
      {btnAccion({ id: "ajustar", label: "Ajustar", c: C_ROJO.color, show: item.tipo === "cantidad" && perms.ajustar })}
      {perms.editar && <button type="button" onClick={() => onEditar(item)} style={{ minHeight: 48, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "700 13px/1 var(--sans)", cursor: "pointer" }}>Editar</button>}
      {perms.imprimir && <button type="button" onClick={() => onEtiqueta(item)} title="Etiqueta QR en PDF" style={{ minHeight: 48, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "700 13px/1 var(--sans)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Ico d={ICO.imprimir} size={16} />Etiqueta</button>}
    </div>

    {accion === "entrada" && caja(<>
      <div style={LBL}>Entra a</div>{selUbic(f.a || ubicPrincipal, v => u("a", v))}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="number" inputMode="decimal" min="0" step="any" value={f.cantidad || ""} onChange={e => u("cantidad", e.target.value)} placeholder="Cantidad" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right" }} autoFocus /><b>{item.unidad}</b></div>
      <input value={f.motivo || ""} onChange={e => u("motivo", e.target.value)} placeholder="Nota (opcional) · ej. llegó de Larach" style={CTRL} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado} onClick={() => ejecutar({ accion: "entrada", a: f.a || ubicPrincipal, cantidad: f.cantidad, motivo: f.motivo })}>Registrar entrada</Btn></div>
    </>)}
    {accion === "salida" && caja(<>
      <div style={LBL}>Sale de</div>{selUbic(f.de, v => u("de", v))}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="number" inputMode="decimal" min="0" step="any" value={f.cantidad || ""} onChange={e => u("cantidad", e.target.value)} placeholder="Cantidad" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right" }} autoFocus /><b>{item.unidad}</b><span style={{ fontSize: 12, color: "var(--text-3)" }}>hay {fmtN(stockEn(item, f.de))}</span></div>
      <div style={LBL}>Hacia (opcional: si va a otra ubicación, entra allá)</div>{selUbic(f.a || "", v => u("a", v), f.de)}
      <div style={LBL}>Entregado a (opcional)</div><BuscaEmpleado emps={emps} value={f.entregadoA || ""} onChange={(id, nombre) => setF(p => ({ ...p, entregadoA: id, entregadoNombre: nombre }))} />
      <input value={f.motivo || ""} onChange={e => u("motivo", e.target.value)} placeholder="Nota (opcional)" style={CTRL} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado} onClick={() => ejecutar({ accion: "salida", de: f.de, a: f.a, cantidad: f.cantidad, motivo: f.motivo, entregadoA: f.entregadoA, entregadoNombre: f.entregadoNombre })}>Registrar salida</Btn></div>
    </>)}
    {accion === "mover" && caja(<>
      <div style={LBL}>Mover a</div>{selUbic(f.a || "", v => u("a", v), item.ubicacionId)}
      {esHerramienta(item) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><span style={LBL}>Queda</span>{Object.entries(estados).filter(([k]) => k !== "en_operacion").map(([k, e]) => pillBtn(e.label, (f.estado || item.estado) === k, () => u("estado", k), { key: k, c: TONO[e.tono]?.color }))}</div>}
      <input value={f.motivo || ""} onChange={e => u("motivo", e.target.value)} placeholder="Nota (opcional)" style={CTRL} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado || !f.a} onClick={() => ejecutar({ accion: "mover", a: f.a, motivo: f.motivo, ...(esHerramienta(item) && f.estado ? { estado: f.estado } : {}) })}>Mover</Btn></div>
    </>)}
    {accion === "asignar" && caja(<>
      <div style={LBL}>Asignar a (colaborador de GeoTeam)</div><BuscaEmpleado emps={emps} value={f.empId ?? item.asignadoA ?? ""} onChange={(id, nombre) => setF(p => ({ ...p, empId: id, empNombre: nombre, tocado: true }))} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn>{item.asignadoA && <Btn small variant="danger" disabled={ocupado} onClick={() => ejecutar({ accion: "asignar", empId: "" })}>Devuelto (quitar)</Btn>}<Btn small disabled={ocupado || !f.empId || f.empId === item.asignadoA} onClick={() => ejecutar({ accion: "asignar", empId: f.empId, empNombre: f.empNombre })}>Asignar</Btn></div>
    </>)}
    {accion === "ajustar" && caja(<>
      <div style={{ fontSize: 12.5, color: C_ROJO.color, fontWeight: 700 }}>Corrección de inventario: la cantidad queda en lo que escribas. Queda registrado con tu nombre.</div>
      <div style={LBL}>En</div>{selUbic(f.en, v => u("en", v))}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 13, color: "var(--text-2)" }}>hay {fmtN(stockEn(item, f.en))} →</span><input type="number" inputMode="decimal" min="0" step="any" value={f.nuevo || ""} onChange={e => u("nuevo", e.target.value)} placeholder="Cantidad real" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right" }} autoFocus /><b>{item.unidad}</b></div>
      <input value={f.motivo || ""} onChange={e => u("motivo", e.target.value)} placeholder="Motivo (corto) · ej. conteo físico" style={CTRL} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small variant="danger" disabled={ocupado} onClick={() => ejecutar({ accion: "ajuste", en: f.en, nuevo: f.nuevo, motivo: f.motivo })}>Ajustar</Btn></div>
    </>)}

    {historial.length > 0 && <details>
      <summary style={{ fontSize: 12, color: "var(--text-3)", cursor: "pointer", fontWeight: 700 }}>Historial reciente ({historial.length})</summary>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
        {historial.map(m => <div key={m.id} style={{ fontSize: 12, color: "var(--text-2)", display: "flex", gap: 8, flexWrap: "wrap" }}><span style={{ color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--mono)" }}>{fmtDT(m.at)}</span><span><b>{ACCIONES[m.accion] || m.accion}</b> · {textoMovimiento(m, ubicaciones)}{m.motivo ? ` · ${m.motivo}` : ""} <span style={{ color: "var(--text-3)" }}>— {m.byName || m.by}</span></span></div>)}
      </div>
    </details>}
    {perms.eliminar && <div style={{ display: "flex", justifyContent: "flex-end" }}><button type="button" onClick={() => onEliminar(item)} style={{ background: "none", border: "none", color: C_ROJO.color, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Eliminar artículo</button></div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// EDITAR artículo (modal) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function EditarFormImpl({ item, onSave, onClose, ocupado, isMobile }) {
  const [f, setF] = useState(() => ({ nombre: item.nombre, categoria: item.categoria, unidad: item.unidad || "", marca: item.marca || "", modelo: item.modelo || "", serie: item.serie || "", estante: item.estante || "", notas: item.notas || "", herrTipo: item.herramienta?.tipo || "broca", diametro: item.herramienta?.diametro || "", foto: null }));
  const [procesando, setProcesando] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const esHer = f.categoria === "herramientas_perforacion";
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {f.foto ? <img src={f.foto.dataUrl} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover" }} /> : <Foto foto={item.foto} size={72} radius={14} categoria={item.categoria} />}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: `1px dashed ${ORANGE}`, color: "var(--naranja-tinta)", fontSize: 13, fontWeight: 800, cursor: "pointer", background: "rgba(232,118,45,.06)" }}>
        <Ico d={ICO.camara} size={18} /> {procesando ? "Procesando…" : "Cambiar foto"}
        <input type="file" accept="image/*" style={{ display: "none" }} disabled={procesando} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setProcesando(true); try { u("foto", { dataUrl: await comprimirFoto(file), name: file.name }); } catch (err) { alert(err?.message || err); } finally { setProcesando(false); } }} />
      </label>
    </div>
    <Input label="Nombre *" value={f.nombre} onChange={e => u("nombre", e.target.value)} />
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><div style={LBL}>Categoría</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{CATEGORIAS.map(c => pillBtn(c.corto, f.categoria === c.id, () => u("categoria", c.id), { key: c.id }))}</div><div style={{ fontSize: 11.5, color: "var(--text-3)" }}>El código no cambia aunque cambie la categoría.</div></div>
    {item.tipo === "cantidad" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><Input label="Unidad" list="inv-unidades-e" value={f.unidad} onChange={e => u("unidad", e.target.value)} /><datalist id="inv-unidades-e">{UNIDADES.map(x => <option key={x} value={x} />)}</datalist><Input label="Estante" value={f.estante} onChange={e => u("estante", e.target.value)} /></div>}
    {esHer && item.tipo === "individual" && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}><div style={{ display: "flex", gap: 6, alignItems: "end" }}>{TIPOS_HERRAMIENTA.map(t => pillBtn(t.label, f.herrTipo === t.id, () => u("herrTipo", t.id), { key: t.id }))}</div><Input label="Diámetro" value={f.diametro} onChange={e => u("diametro", e.target.value)} /></div>}
    {item.tipo === "individual" && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}><Input label="Marca" value={f.marca} onChange={e => u("marca", e.target.value)} /><Input label="Modelo" value={f.modelo} onChange={e => u("modelo", e.target.value)} /><Input label="N° de serie" value={f.serie} onChange={e => u("serie", e.target.value)} /></div>}
    <Textarea label="Nota" value={f.notas} onChange={e => u("notas", e.target.value)} style={{ minHeight: 56 }} />
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Btn><Btn disabled={ocupado || procesando} onClick={() => { if (!String(f.nombre).trim()) return alert("Escribí el nombre."); onSave(f); }}>{ocupado ? "Guardando…" : "Guardar cambios"}</Btn></div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTAR desde Excel (CSV o celdas pegadas) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function ImportarFormImpl({ ubicaciones, ubicFija, emps, onImportar, onClose, ocupado }) {
  const [texto, setTexto] = useState("");
  const [ubicDefault, setUbicDefault] = useState(ubicFija || "");
  const prep = texto.trim() ? prepararImportacion(parseTabla(texto).filas, { ubicaciones, ubicacionDefault: ubicDefault, empleados: emps }) : null;
  const descargarPlantilla = () => { const blob = new Blob(["﻿" + plantillaCSV()], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "plantilla-geoinventory.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>Copiá las celdas de Excel (con la fila de títulos) y pegalas acá, o subí un CSV. Columnas: <b>nombre, categoria, tipo, cantidad, unidad, ubicacion, estado, marca, modelo, serie, asignado</b>. Solo <b>nombre</b> es obligatoria. <button type="button" onClick={descargarPlantilla} style={{ background: "none", border: "none", color: ORANGE_DARK, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 13, textDecoration: "underline", padding: 0 }}>Descargar plantilla</button></div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <label style={{ display: "inline-flex", alignItems: "center", padding: "9px 14px", borderRadius: 999, border: `1px dashed ${ORANGE}`, color: "var(--naranja-tinta)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", background: "rgba(232,118,45,.06)" }}>Subir CSV<input type="file" accept=".csv,text/csv,.txt,.tsv" style={{ display: "none" }} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) setTexto(await file.text()); }} /></label>
      <select value={ubicDefault} onChange={e => setUbicDefault(e.target.value)} style={{ ...CTRL, width: "auto", minWidth: 200, flex: 1 }}><option value="">Ubicación si la fila no trae</option>{ubicaciones.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
    </div>
    <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder={"nombre\tcategoria\ttipo\tcantidad\tunidad\tubicacion\nCemento GU\tMateriales\tcantidad\t120\tBolsa\tAlmacén Central"} style={{ ...CTRL, minHeight: 140, fontFamily: "var(--mono)", fontSize: 12.5 }} />
    {prep && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: prep.errores.length ? C_AMARILLO.color : C_VERDE.color }}>{prep.listos.length} para crear{prep.errores.length ? ` · ${prep.errores.length} con error (no se importan)` : ""}</div>
      {prep.errores.slice(0, 8).map((e, i) => <div key={i} style={{ fontSize: 12, color: C_ROJO.color }}>Fila {e.fila}: {e.error}</div>)}
      <div style={{ maxHeight: 180, overflow: "auto", fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 3 }}>
        {prep.listos.slice(0, 40).map((l, i) => <div key={i}><b>{l.nombre}</b> · {categoriaDe(l.categoria).corto} · {l.tipo === "cantidad" ? `${fmtN(l.cantidad)} ${l.unidad}` : `${l.cantidad} individual(es) · ${l.estado}`} · {nombreUbicacion(ubicaciones, l.ubicacionId)}{l.asignadoNombre ? ` · ${l.asignadoNombre}` : ""}</div>)}
        {prep.listos.length > 40 && <div>… y {prep.listos.length - 40} más</div>}
      </div>
    </div>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Btn><Btn disabled={ocupado || !prep?.listos.length} onClick={() => onImportar(prep.listos)}>{ocupado ? "Importando…" : `Importar ${prep?.listos.length || 0}`}</Btn></div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCÁNER con la cámara (modal) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function EscanerImpl({ onCodigo, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");
  useEffect(() => {
    let scanner = null, vivo = true;
    (async () => {
      try {
        const mod = await safeDynamicImport(() => import("qr-scanner"), "escáner QR");
        const QrScanner = mod.default || mod;
        if (!vivo || !videoRef.current) return;
        scanner = new QrScanner(videoRef.current, (r) => { const c = codigoDeTexto(r?.data ?? r); if (c) { scanner?.stop(); onCodigo(c); } }, { returnDetailedScanResult: true, highlightScanRegion: true, preferredCamera: "environment", maxScansPerSecond: 6 });
        await scanner.start();
      } catch (e) { setError("No pude abrir la cámara: " + (e?.message || e) + ". Podés escribir el código abajo."); }
    })();
    return () => { vivo = false; try { scanner?.stop(); scanner?.destroy(); } catch {} };
  }, []);
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ borderRadius: 16, overflow: "hidden", background: "#111", aspectRatio: "1 / 1", maxHeight: 380 }}><video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline /></div>
    {error && <div style={{ fontSize: 12.5, color: C_AMARILLO.color, background: C_AMARILLO.bg, borderRadius: 12, padding: "9px 12px" }}>{error}</div>}
    <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Apuntá al QR de la etiqueta. Con un lector USB o Bluetooth, escaneá acá:</div>
    <div style={{ display: "flex", gap: 8 }}><input value={manual} onChange={e => setManual(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { const c = codigoDeTexto(manual); if (c) onCodigo(c); else alert("Eso no es un código del inventario (ej. HER-0001)."); } }} placeholder="HER-0001" autoFocus style={{ ...CTRL, fontFamily: "var(--mono)", fontWeight: 800, textTransform: "uppercase" }} /><Btn onClick={() => { const c = codigoDeTexto(manual); if (c) onCodigo(c); else alert("Eso no es un código del inventario (ej. HER-0001)."); }}>Abrir</Btn></div>
    <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn variant="ghost" onClick={onClose}>Cerrar</Btn></div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function GeoInventoryModule({ userRole, userName, userKey, onBack, onLogout }) {
  const isMobile = useIsMobile(760);
  const perms = permisosDe(userRole);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState([]);
  const [ubicGuardadas, setUbicGuardadas] = useState([]);
  const [customProjects, setCustomProjects] = useState([]);
  const [emps, setEmps] = useState([]);
  const [maquinas, setMaquinas] = useState([]);
  const [usuariosNube, setUsuariosNube] = useState([]);
  const [movs, setMovs] = useState([]);
  const [mesesMov, setMesesMov] = useState(() => { const d = new Date(); const a = new Date(d.getFullYear(), d.getMonth() - 1, 1); return [keyMovimientos(d.toISOString()), keyMovimientos(a.toISOString())]; });
  const [ocupado, setOcupado] = useState(false);
  const [sec, setSec] = useState("inicio");
  const [modal, setModal] = useState(null);
  const [visor, setVisor] = useState(null);
  const [ubicFija, setUbicFijaRaw] = useState(() => { try { return localStorage.getItem(`gt-inv-ubic-${userKey}`) || ""; } catch { return ""; } });
  const setUbicFija = (v) => { setUbicFijaRaw(v); try { v ? localStorage.setItem(`gt-inv-ubic-${userKey}`, v) : localStorage.removeItem(`gt-inv-ubic-${userKey}`); } catch {} };
  const [ultimo, setUltimo] = useState(null);
  // Buscar
  const [q, setQ] = useState("");
  const [fUbic, setFUbic] = useState("");
  const [fCat, setFCat] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [verMas, setVerMas] = useState(40);
  const [herrVista, setHerrVista] = useState("ubicacion");
  const [herrEstado, setHerrEstado] = useState("");
  const [movQ, setMovQ] = useState("");
  const buscadorRef = useRef(null);
  const hashRef = useRef(typeof window !== "undefined" ? codigoDeTexto(window.location.hash) : null);

  const cargar = async () => {
    try {
      const [it, ub, cp, em, mq, us, ...mv] = await Promise.all([store.getCloud(K_ITEMS), store.getCloud(K_UBIC), store.getCloud("cp-projects"), store.getCloud("hr-emps5"), store.getCloud("mq-machines"), store.getCloud("gt-usuarios"), ...mesesMov.map(k => store.getCloud(k))]);
      setItems(Array.isArray(it) ? it : []); setUbicGuardadas(Array.isArray(ub) ? ub : []); setCustomProjects(Array.isArray(cp) ? cp : []);
      setEmps((Array.isArray(em) ? em : []).filter(e => e && e.status !== "inactive").sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es")));
      setMaquinas((Array.isArray(mq) ? mq : []).map(m => ({ id: m.id, nombre: m.nombre || m.name || "", tipo: m.tipo || "" })).filter(m => m.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true })));
      setUsuariosNube(Array.isArray(us) ? us.filter(x => x && x.activo !== false) : []);
      setMovs(mv.flatMap(x => Array.isArray(x) ? x : []));
    } catch (e) { console.warn("[GeoInventory] carga", e); }
    finally { setLoaded(true); }
  };
  useEffect(() => { cargar(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const onFocus = () => { if (!ocupado && !modal) cargar(); }; window.addEventListener("focus", onFocus); return () => window.removeEventListener("focus", onFocus); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupado, modal]);
  // Enlace profundo del QR: #inv=HER-0001 → abre la ficha
  useEffect(() => {
    if (!loaded || !hashRef.current) return;
    const it = items.find(i => String(i.codigo).toUpperCase() === hashRef.current && !i.eliminado);
    hashRef.current = null;
    try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
    if (it) setModal({ t: "ficha", id: it.id }); else alert("No encontré ese código en el inventario.");
  }, [loaded, items]);

  // ── Derivados ──
  const proyectos = (() => {
    const base = new Set(CANONICAL_PROJECTS.map(p => p.short)); const out = [];
    CANONICAL_PROJECTS.forEach(p => { const x = customProjects.find(c => c.short === p.short); if (x?.hidden || x?.deleted) return; out.push({ ...p, ...(x || {}) }); });
    customProjects.forEach(c => { if (base.has(c.short) || c.hidden || c.deleted) return; out.push(c); });
    return out;
  })();
  const ubicaciones = ubicacionesDe({ guardadas: ubicGuardadas, proyectos });
  const usuarios = [...USERS.filter(x => x.role !== "marcaje"), ...usuariosNube].map(x => ({ username: x.username, label: x.label, role: x.role }));
  const vivos = items.filter(i => i && !i.eliminado);
  const resumen = resumenInventario(items);
  const esSoloLectura = !perms.cargar;
  const nav = [
    { id: "inicio", label: "Inicio" },
    ...(perms.cargar ? [{ id: "agregar", label: "Agregar" }] : []),
    { id: "buscar", label: "Buscar" },
    { id: "ubicaciones", label: "Ubicaciones" },
    { id: "herramientas", label: "Herramientas" },
    { id: "movimientos", label: "Movimientos" },
  ];

  // ── Guardado robusto ──
  const subirFoto = async (foto) => {
    if (!foto?.dataUrl) return null;
    const fileId = uid();
    const ok = await store.set(fileKey(fileId), { name: foto.name || "foto.jpg", type: "image/jpeg", size: foto.dataUrl.length, dataUrl: foto.dataUrl });
    if (!ok) throw new Error("No se pudo subir la foto a la nube.");
    fotoCache.set(fileId, foto.dataUrl);
    return { fileId, name: foto.name || "foto.jpg", type: "image/jpeg", size: foto.dataUrl.length };
  };
  const apendMovs = async (nuevos) => {
    if (!nuevos?.length) return;
    const porKey = {};
    nuevos.forEach(m => { const k = keyMovimientos(m.at); (porKey[k] = porKey[k] || []).push(m); });
    for (const [k, lista] of Object.entries(porKey)) {
      try { const c = await store.getCloud(k); const arr = Array.isArray(c) ? c : []; const ids = new Set(arr.map(x => x.id)); await store.set(k, [...arr, ...lista.filter(x => !ids.has(x.id))]); }
      catch (e) { console.warn("[GeoInventory] historial", k, e); }
    }
    setMovs(p => [...p, ...nuevos]);
  };
  /** fn(listaFresca) → { arr, ids, movs, resultado } ; escribe y verifica. */
  const guardarItems = async (fn) => {
    if (ocupado) return null;
    setOcupado(true);
    try {
      const c = await store.getCloud(K_ITEMS);
      const arr = Array.isArray(c) ? c : [];
      const r = fn(arr);
      if (!r) return null;
      const ok = await store.set(K_ITEMS, r.arr);
      if (!ok) throw new Error("La nube no aceptó el guardado.");
      const back = await store.getCloud(K_ITEMS);
      const porId = new Map((Array.isArray(back) ? back : []).map(x => [x.id, x]));
      const falta = (r.ids || []).find(id => { const x = porId.get(id); const mio = r.arr.find(y => y.id === id); return !x || (mio?.updatedAt && x.updatedAt !== mio.updatedAt); });
      if (falta) throw new Error("La nube no confirmó el guardado. Reintentá.");
      setItems(Array.isArray(back) ? back : r.arr);
      await apendMovs(r.movs);
      return r.resultado ?? true;
    } catch (e) { alert((e?.message || String(e)) + "\n\nNo se guardó."); console.warn("[GeoInventory]", e); return null; }
    finally { setOcupado(false); }
  };
  const quien = () => ({ by: userKey, byName: userName });

  // Crear uno o varios artículos (desde Agregar o Importar)
  const crearArticulos = async (defs, { fotoDe = null, foto = null } = {}) => {
    let fotoRef = fotoDe || null;
    if (foto?.dataUrl) { try { fotoRef = await subirFoto(foto); } catch (e) { alert(e.message); return null; } }
    const at = new Date().toISOString();
    return guardarItems((arr) => {
      const nuevos = [], movsN = [], ids = [];
      const porPrefijo = {};
      defs.forEach(d => {
        const cat = categoriaDe(d.categoria);
        const n = d.tipo === "individual" ? Math.max(1, Math.round(num(d.iguales || d.cantidad || 1))) : 1;
        const codigos = siguientesCodigos([...arr, ...nuevos], cat.prefijo, n);
        porPrefijo[cat.prefijo] = (porPrefijo[cat.prefijo] || 0) + n;
        for (let k = 0; k < n; k++) {
          const base = { id: uid(), codigo: codigos[k], tipo: d.tipo, nombre: String(d.nombre).trim(), categoria: cat.id, foto: d.fotoRef !== undefined ? d.fotoRef : fotoRef, marca: d.marca || "", modelo: d.modelo || "", serie: n > 1 ? "" : (d.serie || ""), notas: d.notas || "", createdAt: at, createdBy: userKey, createdByNombre: userName, updatedAt: at };
          const it = d.tipo === "individual"
            ? { ...base, ubicacionId: d.ubicacionId, estado: d.estado || estadoInicial(cat.id), asignadoA: k === 0 ? (d.asignadoA || "") : "", asignadoNombre: k === 0 ? (d.asignadoNombre || "") : "", ...(cat.id === "herramientas_perforacion" ? { herramienta: { tipo: d.herrTipo || d.herramienta?.tipo || "broca", diametro: String(d.diametro || d.herramienta?.diametro || "").trim() } } : {}) }
            : { ...base, unidad: String(d.unidad || "Unidad").trim(), estante: d.estante || "", stock: { [d.ubicacionId]: num(d.cantidad) } };
          nuevos.push(it); ids.push(it.id);
          movsN.push({ id: uid(), at, ...quien(), itemId: it.id, codigo: it.codigo, nombre: it.nombre, accion: "crear", a: d.ubicacionId, cantidad: d.tipo === "cantidad" ? num(d.cantidad) : 1 });
          if (k === 0 && d.asignadoA && d.tipo === "individual") movsN.push({ id: uid(), at, ...quien(), itemId: it.id, codigo: it.codigo, nombre: it.nombre, accion: "asignar", asignadoA: d.asignadoA, asignadoNombre: d.asignadoNombre || "" });
        }
      });
      const resumenTxt = nuevos.length === 1 ? `Guardado ${nuevos[0].codigo} · ${nuevos[0].nombre}` : `Guardados ${nuevos.length}: ${Object.entries(porPrefijo).map(([p, n]) => `${n} ${p}`).join(", ")}`;
      return { arr: [...arr, ...nuevos], ids, movs: movsN, resultado: resumenTxt };
    });
  };
  const sumarExistente = (item, cantidad, ubicacionId) => guardarItems((arr) => {
    const cur = arr.find(x => x.id === item.id); if (!cur) return (alert("El artículo ya no está."), null);
    const r = aplicarMovimiento(cur, { accion: "entrada", a: ubicacionId, cantidad }, { ...quien(), id: uid() });
    if (r.error) return (alert(r.error), null);
    const rec = { ...r.item, updatedAt: new Date().toISOString() };
    return { arr: arr.map(x => x.id === rec.id ? rec : x), ids: [rec.id], movs: [r.mov], resultado: `Sumados ${fmtN(cantidad)} ${cur.unidad} a ${cur.nombre} · ahora ${fmtN(stockEn(rec, ubicacionId))} en ${nombreUbicacion(ubicaciones, ubicacionId)}` };
  });
  const accionSobre = async (item, m) => {
    const r0 = aplicarMovimiento(item, m, quien());
    if (r0.error) { alert(r0.error); return false; }
    const r = await guardarItems((arr) => {
      const cur = arr.find(x => x.id === item.id); if (!cur) return (alert("El artículo ya no está."), null);
      const rr = aplicarMovimiento(cur, m, { ...quien(), id: uid() });
      if (rr.error) return (alert(rr.error), null);
      const rec = { ...rr.item, updatedAt: new Date().toISOString() };
      return { arr: arr.map(x => x.id === rec.id ? rec : x), ids: [rec.id], movs: [rr.mov] };
    });
    return !!r;
  };
  const editarArticulo = async (item, f) => {
    let fotoRef;
    if (f.foto?.dataUrl) { try { fotoRef = await subirFoto(f.foto); } catch (e) { alert(e.message); return; } }
    const cambios = { nombre: String(f.nombre).trim(), categoria: f.categoria, marca: f.marca, modelo: f.modelo, serie: f.serie, notas: f.notas, ...(item.tipo === "cantidad" ? { unidad: String(f.unidad || "Unidad").trim(), estante: f.estante } : {}), ...(fotoRef ? { foto: fotoRef } : {}), ...(f.categoria === "herramientas_perforacion" && item.tipo === "individual" ? { herramienta: { tipo: f.herrTipo, diametro: String(f.diametro).trim() } } : {}) };
    // Si cambia de familia de estados (herramienta ↔ equipo), el estado se traduce
    if (item.tipo === "individual" && (f.categoria === "herramientas_perforacion") !== esHerramienta(item)) cambios.estado = estadoInicial(f.categoria);
    const ok = await accionSobre(item, { accion: "editar", cambios });
    if (ok) setModal({ t: "ficha", id: item.id });
  };
  const eliminarArticulo = async (item) => {
    if (!confirm(`¿Eliminar ${item.codigo} · ${item.nombre}?\n\nDeja de verse en el inventario (queda en el historial quién lo eliminó).`)) return;
    const ok = await accionSobre(item, { accion: "eliminar" });
    if (ok) setModal(null);
  };
  const guardarUbicacion = async (ubicacion, f) => {
    if (ocupado) return; setOcupado(true);
    try {
      const c = await store.getCloud(K_UBIC); const arr = Array.isArray(c) ? c : [];
      const at = new Date().toISOString();
      const rec = ubicacion
        ? { ...(arr.find(x => x.id === ubicacion.id) || { id: ubicacion.id, tipo: ubicacion.tipo, createdAt: at, createdBy: userKey }), ...(ubicacion.tipo === "oficina" ? { nombre: String(f.nombre).trim(), activa: f.activa !== false } : {}), responsable: f.responsable || "", responsableNombre: f.responsableNombre || "", updatedAt: at, updatedBy: userKey }
        : { id: `of:${uid()}`, tipo: "oficina", nombre: String(f.nombre).trim(), responsable: f.responsable || "", responsableNombre: f.responsableNombre || "", activa: true, createdAt: at, createdBy: userKey, updatedAt: at };
      if (!ubicacion && arr.some(x => x.tipo === "oficina" && x.activa !== false && String(x.nombre).trim().toLowerCase() === rec.nombre.toLowerCase())) { alert("Ya hay una oficina con ese nombre."); return; }
      const next = arr.some(x => x.id === rec.id) ? arr.map(x => x.id === rec.id ? rec : x) : [...arr, rec];
      const ok = await store.set(K_UBIC, next); if (!ok) throw new Error("La nube no aceptó el guardado.");
      const back = await store.getCloud(K_UBIC);
      if (!(Array.isArray(back) ? back : []).some(x => x.id === rec.id && x.updatedAt === at)) throw new Error("La nube no confirmó el guardado.");
      setUbicGuardadas(back); setModal(null);
    } catch (e) { alert((e?.message || e) + "\n\nNo se guardó."); }
    finally { setOcupado(false); }
  };
  const importar = async (listos) => {
    const r = await crearArticulos(listos.map(l => ({ ...l, iguales: l.tipo === "individual" ? l.cantidad : 1, fotoRef: null })));
    if (r) { alert(r); setModal(null); setSec("buscar"); }
  };
  const etiquetas = async (lista, titulo) => {
    if (!lista.length) return alert("No hay artículos para etiquetar.");
    if (lista.length > 240 && !confirm(`Son ${lista.length} etiquetas (${Math.ceil(lista.length / 24)} hojas). ¿Seguir?`)) return;
    try { await generarEtiquetasPDF(lista.map(i => ({ codigo: i.codigo, nombre: i.nombre, ubicacionNombre: i.tipo === "individual" ? nombreUbicacion(ubicaciones, i.ubicacionId) : ubicacionesConStock(i).map(x => nombreUbicacion(ubicaciones, x.id)).join(", ") })), { titulo }); }
    catch (e) { alert("No pude generar el PDF: " + (e?.message || e)); }
  };
  const verFoto = async (ref) => { const d = await cargarFoto(ref?.fileId); if (!d) return alert("No se pudo cargar la foto."); setVisor({ name: ref.name || "foto.jpg", type: "image/jpeg", dataUrl: d }); };
  const abrirCodigo = (codigo) => {
    const it = vivos.find(i => String(i.codigo).toUpperCase() === String(codigo).toUpperCase());
    if (!it) return alert(`No encontré ${codigo} en el inventario.`);
    setModal({ t: "ficha", id: it.id });
  };
  const irAUbicacion = (id) => { setFUbic(id); setQ(""); setFCat(""); setFEstado(""); setFTipo(""); setSec("buscar"); };

  // ── Piezas de lista ──
  const filaItem = (it, { mostrarUbic = true } = {}) => {
    const enU = ubicacionesConStock(it);
    return <div key={it.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setModal({ t: "ficha", id: it.id })} onKeyDown={e => { if (e.key === "Enter") setModal({ t: "ficha", id: it.id }); }} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
      <Foto foto={it.foto} size={52} radius={12} categoria={it.categoria} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 11.5, color: "var(--text-3)" }}>{it.codigo}</span>
          {it.tipo === "individual" ? chipEstado(it) : null}
          {it.asignadoA && <Chip c={C_AZUL} style={{ fontSize: 11 }}>{it.asignadoNombre}</Chip>}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nombre}</div>
        {mostrarUbic && <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{enU.length ? enU.map(x => `${nombreUbicacion(ubicaciones, x.id)}${it.tipo === "cantidad" ? ` · ${fmtN(x.cantidad)}` : ""}`).join(" · ") : "Sin existencias"}{it.maquinaNombre ? ` · en ${it.maquinaNombre}` : ""}</div>}
      </div>
      {it.tipo === "cantidad" && <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 18px/1 var(--display)", color: CHARCOAL }}>{fmtN(stockDe(it))}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>{it.unidad}</div></div>}
    </div>;
  };
  const tarjetaGrande = (label, icono, onClick, color = ORANGE_DARK) => <button type="button" onClick={onClick} style={{ flex: "1 1 140px", minHeight: 92, borderRadius: 20, border: "none", background: color, color: "#fff", font: "800 15px/1.2 var(--sans)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 12px 26px ${color}44` }}><Ico d={icono} size={26} sw={2} />{label}</button>;
  const stat = (n, label, c, onClick) => <div onClick={onClick} className={onClick ? "gt-vidrio gt-vidrio-hover" : "gt-vidrio"} style={{ padding: "12px 14px", flex: "1 1 120px", cursor: onClick ? "pointer" : "default", display: "flex", flexDirection: "column", gap: 3 }}><div style={{ font: "800 24px/1 var(--display)", color: c?.color || CHARCOAL }}>{fmtN(n)}</div><div className="gt-label" style={{ color: "var(--text-3)", fontSize: 10 }}>{label}</div></div>;

  // ── Pantallas ──
  const renderInicio = () => {
    const recientes = [...movs].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8);
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {perms.cargar && tarjetaGrande("Agregar", ICO.agregar, () => setSec("agregar"))}
        {tarjetaGrande("Buscar", ICO.buscar, () => { setSec("buscar"); setTimeout(() => buscadorRef.current?.focus(), 80); }, CHARCOAL)}
        {tarjetaGrande("Escanear", ICO.escanear, () => setModal({ t: "escanear" }), "#1D5FAF")}
        {tarjetaGrande("Ubicaciones", ICO.ubicaciones, () => setSec("ubicaciones"), "#5C5853")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {stat(resumen.articulos, "artículos", null, () => { setFUbic(""); setFCat(""); setFEstado(""); setSec("buscar"); })}
        {stat(resumen.disponibles, "herramientas disponibles", C_VERDE, () => { setHerrEstado("disponible"); setSec("herramientas"); })}
        {stat(resumen.enOperacion, "en operación", C_NARANJA, () => { setHerrEstado("en_operacion"); setSec("herramientas"); })}
        {stat(resumen.requierenTrabajo, "requieren trabajo", C_ROJO, () => { setHerrEstado("requiere_trabajo"); setSec("herramientas"); })}
        {stat(resumen.asignados, "equipos asignados a personas", C_AZUL, () => { setFTipo("individual"); setFCat(""); setFUbic(""); setFEstado(""); setQ(""); setSec("buscar"); })}
      </div>
      {vivos.length === 0 && <Vacio>{perms.cargar ? "Todavía no hay nada cargado. Tocá Agregar, fijá la ubicación y empezá con la foto." : "Todavía no hay nada en el inventario."}</Vacio>}
      {recientes.length > 0 && <div className="gt-vidrio" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div className="gt-label" style={{ color: "var(--text-3)" }}>Últimos movimientos</div><button type="button" onClick={() => setSec("movimientos")} style={{ background: "none", border: "none", color: ORANGE_DARK, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Ver todos →</button></div>
        {recientes.map(m => <div key={m.id} style={{ display: "flex", gap: 10, fontSize: 12.5, alignItems: "baseline", flexWrap: "wrap" }}><span style={{ fontFamily: "var(--mono)", color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }}>{fmtDT(m.at)}</span><span style={{ flex: 1, minWidth: 160 }}><b>{ACCIONES[m.accion] || m.accion}</b> · {m.nombre} <span style={{ color: "var(--text-3)" }}>({m.codigo})</span> · {textoMovimiento(m, ubicaciones)}</span><span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{m.byName || m.by}</span></div>)}
      </div>}
    </div>;
  };
  const renderAgregar = () => <AgregarFormImpl ubicaciones={ubicaciones} ubicFija={ubicFija} setUbicFija={setUbicFija} items={vivos} emps={emps} ocupado={ocupado} isMobile={isMobile} ultimo={ultimo} setUltimo={setUltimo}
    onGuardar={(d, { fotoDe }) => crearArticulos([d], { fotoDe, foto: d.foto })} onSumar={sumarExistente} />;
  const renderBuscar = () => {
    const res = buscarItems(vivos, { q, ubicacionId: fUbic, categoria: fCat, estado: fEstado, tipo: fTipo }).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const hayFiltro = q || fUbic || fCat || fEstado || fTipo;
    const estadosFiltro = fCat === "herramientas_perforacion" ? estadosDe({ categoria: "herramientas_perforacion" }) : fCat && fCat !== "herramientas_perforacion" ? estadosDe({ categoria: fCat }) : null;
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="gt-vidrio" style={{ padding: isMobile ? 10 : 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Buscador inputRef={buscadorRef} value={q} onChange={v => { setQ(v); setVerMas(40); }} placeholder="Nombre, código, serie o persona…" onEnter={(v) => { const c = codigoDeTexto(v); if (c) abrirCodigo(c); }} />
          <button type="button" onClick={() => setModal({ t: "escanear" })} title="Escanear QR" style={{ width: 44, height: 44, borderRadius: 999, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.75)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", color: CHARCOAL, flexShrink: 0 }}><Ico d={ICO.escanear} size={20} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select value={fUbic} onChange={e => setFUbic(e.target.value)} style={{ ...CTRL, width: "auto", minHeight: 36, padding: "6px 10px", fontSize: 12.5, borderRadius: 999, maxWidth: 220 }}><option value="">Todas las ubicaciones</option>{ubicaciones.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          {CATEGORIAS.map(c => pillBtn(c.corto, fCat === c.id, () => { setFCat(fCat === c.id ? "" : c.id); setFEstado(""); }, { key: c.id }))}
          {pillBtn("Individuales", fTipo === "individual", () => setFTipo(fTipo === "individual" ? "" : "individual"), { c: CHARCOAL })}
          {estadosFiltro && Object.entries(estadosFiltro).map(([k, e]) => pillBtn(e.label, fEstado === k, () => setFEstado(fEstado === k ? "" : k), { key: k, c: TONO[e.tono]?.color }))}
          {hayFiltro && <Btn small variant="ghost" onClick={() => { setQ(""); setFUbic(""); setFCat(""); setFEstado(""); setFTipo(""); }}>Limpiar</Btn>}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>{res.length} {res.length === 1 ? "artículo" : "artículos"}</span>
          {perms.imprimir && res.length > 0 && <Btn small variant="ghost" onClick={() => etiquetas(res, fUbic ? nombreUbicacion(ubicaciones, fUbic) : fCat || "inventario")}><Ico d={ICO.imprimir} size={14} /> Etiquetas ({res.length})</Btn>}
          {perms.importar && <Btn small variant="ghost" onClick={() => setModal({ t: "importar" })}>Importar Excel</Btn>}
        </div>
      </div>
      {res.length === 0 ? <Vacio>{vivos.length === 0 ? "Todavía no hay nada cargado." : "Nada coincide con la búsqueda."}</Vacio> : <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>{res.slice(0, verMas).map(it => filaItem(it))}</div>}
      {res.length > verMas && <div style={{ display: "flex", justifyContent: "center" }}><Btn variant="ghost" onClick={() => setVerMas(v => v + 60)}>Ver más ({res.length - verMas})</Btn></div>}
    </div>;
  };
  const renderUbicaciones = () => {
    const cuenta = (id) => { const en = vivos.filter(i => stockEn(i, id) > 0); return { n: en.length, her: en.filter(esHerramienta).length, ind: en.filter(i => i.tipo === "individual").length }; };
    const grupos = [["Almacén y bodegas", ubicaciones.filter(u => ["almacen", "vault", "taller"].includes(u.tipo))], ["Oficinas", ubicaciones.filter(u => u.tipo === "oficina")], ["Proyectos", ubicaciones.filter(u => u.tipo === "proyecto")]];
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {perms.ubicaciones && <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn onClick={() => setModal({ t: "ubicacion", u: null })}>+ Nueva oficina</Btn></div>}
      {grupos.map(([titulo, lista]) => <div key={titulo} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>{titulo} · {lista.length}</div>
        {lista.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{titulo === "Oficinas" ? "Todavía no hay oficinas. Creá la primera con + Nueva oficina." : "—"}</div>}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
          {lista.map(u2 => { const c = cuenta(u2.id); const resp = usuarios.find(x => x.username === u2.responsable); return <div key={u2.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => irAUbicacion(u2.id)} onKeyDown={e => { if (e.key === "Enter") irAUbicacion(u2.id); }} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(232,118,45,.10)", color: ORANGE_DARK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO.ubicaciones} size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u2.nombre}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resp ? resp.label : u2.responsableNombre || "Sin responsable"}{u2.tipo === "proyecto" && u2.nombreLargo && u2.nombreLargo !== u2.nombre ? ` · ${u2.nombreLargo}` : ""}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 18px/1 var(--display)", color: c.n ? CHARCOAL : "rgba(44,42,40,.3)" }}>{c.n}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>{c.her ? `${c.her} herr.` : c.ind ? `${c.ind} indiv.` : "artículos"}</div></div>
            {perms.ubicaciones && <button type="button" onClick={e => { e.stopPropagation(); setModal({ t: "ubicacion", u: u2 }); }} title="Responsable / editar" style={{ width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.7)", cursor: "pointer", color: "var(--text-2)", fontSize: 14, fontFamily: "inherit" }}>✎</button>}
          </div>; })}
        </div>
      </div>)}
    </div>;
  };
  const renderHerramientas = () => {
    const her = vivos.filter(esHerramienta).filter(h => !herrEstado || h.estado === herrEstado);
    const estados = estadosDe({ categoria: "herramientas_perforacion" });
    const porGrupo = {};
    her.forEach(h => { const k = herrVista === "ubicacion" ? (h.ubicacionId || "") : (h.herramienta?.tipo || "otro"); (porGrupo[k] = porGrupo[k] || []).push(h); });
    const orden = Object.keys(porGrupo).sort((a, b) => (herrVista === "ubicacion" ? nombreUbicacion(ubicaciones, a).localeCompare(nombreUbicacion(ubicaciones, b), "es") : a.localeCompare(b)));
    const total = vivos.filter(esHerramienta);
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: isMobile ? 10 : 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {pillBtn("Por ubicación", herrVista === "ubicacion", () => setHerrVista("ubicacion"), { c: CHARCOAL })}{pillBtn("Por tipo", herrVista === "tipo", () => setHerrVista("tipo"), { c: CHARCOAL })}
        <span style={{ width: 1, height: 22, background: "rgba(44,42,40,.12)", margin: "0 4px" }} />
        {pillBtn("Todas", !herrEstado, () => setHerrEstado(""), { n: total.length })}
        {Object.entries(estados).map(([k, e]) => pillBtn(e.label, herrEstado === k, () => setHerrEstado(herrEstado === k ? "" : k), { key: k, c: TONO[e.tono]?.color, n: total.filter(h => h.estado === k).length }))}
        {perms.imprimir && her.length > 0 && <Btn small variant="ghost" style={{ marginLeft: "auto" }} onClick={() => etiquetas(her, "herramientas")}><Ico d={ICO.imprimir} size={14} /> Etiquetas</Btn>}
      </div>
      {her.length === 0 && <Vacio>{total.length === 0 ? "Todavía no hay brocas, buckets ni rompebolones cargados. Se agregan como artículo individual en la categoría Herramientas de perforación." : "Ninguna herramienta en ese estado."}</Vacio>}
      {orden.map(k => <div key={k} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>{herrVista === "ubicacion" ? nombreUbicacion(ubicaciones, k) : tipoHerramientaLabel(k) || "Sin tipo"} · {porGrupo[k].length}</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
          {porGrupo[k].sort((a, b) => String(a.herramienta?.diametro || "").localeCompare(String(b.herramienta?.diametro || ""), "es", { numeric: true })).map(h => { const e = estados[h.estado] || estados.disponible; const c = TONO[e.tono]; return <div key={h.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setModal({ t: "ficha", id: h.id })} onKeyDown={ev => { if (ev.key === "Enter") setModal({ t: "ficha", id: h.id }); }} style={{ padding: 10, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, borderTop: `3px solid ${c.color}` }}>
            <Foto foto={h.foto} size="100%" radius={12} categoria={h.categoria} style={{ aspectRatio: "4 / 3", height: "auto" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}><span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 11, color: "var(--text-3)" }}>{h.codigo}</span><Chip c={c} style={{ fontSize: 10.5 }}>{e.label}</Chip></div>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: CHARCOAL, lineHeight: 1.2 }}>{tipoHerramientaLabel(h.herramienta?.tipo)}{h.herramienta?.diametro ? ` Ø ${h.herramienta.diametro}` : ""}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.nombre}</div>
            {h.estado === "en_operacion" && h.maquinaNombre && <div style={{ fontSize: 11.5, color: C_NARANJA.color, fontWeight: 700 }}>En {h.maquinaNombre}</div>}
            {herrVista === "tipo" && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{nombreUbicacion(ubicaciones, h.ubicacionId)}</div>}
          </div>; })}
        </div>
      </div>)}
    </div>;
  };
  const renderMovimientos = () => {
    const lista = [...movs].filter(m => !movQ || `${m.codigo} ${m.nombre} ${m.byName} ${m.motivo || ""}`.toLowerCase().includes(movQ.toLowerCase())).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const porDia = {}; lista.forEach(m => { const d = diaDe(m.at); (porDia[d] = porDia[d] || []).push(m); });
    const cargarMesAnterior = async () => { const ultimo = mesesMov[mesesMov.length - 1]; const [y, mo] = ultimo.replace("inv-mov-", "").split("-").map(Number); const prev = keyMovimientos(new Date(y, mo - 2, 1).toISOString()); setMesesMov(p => [...p, prev]); try { const c = await store.getCloud(prev); setMovs(p => [...p, ...(Array.isArray(c) ? c : [])]); } catch {} };
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: isMobile ? 10 : 14, display: "flex", gap: 8, alignItems: "center" }}><Buscador value={movQ} onChange={setMovQ} placeholder="Buscar por artículo, código o persona" /><span style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{lista.length}</span></div>
      {lista.length === 0 && <Vacio>Sin movimientos todavía.</Vacio>}
      {Object.keys(porDia).map(d => <div key={d} className="gt-vidrio" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="gt-label" style={{ color: "var(--text-3)", textTransform: "capitalize" }}>{fmtDia(d + "T12:00:00")}</div>
        {porDia[d].map(m => <div key={m.id} role="button" tabIndex={0} onClick={() => { const it = items.find(i => i.id === m.itemId); if (it) setModal({ t: "ficha", id: it.id }); }} style={{ display: "flex", gap: 10, fontSize: 12.5, alignItems: "baseline", flexWrap: "wrap", cursor: "pointer", padding: "4px 0" }}>
          <span style={{ fontFamily: "var(--mono)", color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }}>{new Date(m.at).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}</span>
          <span style={{ flex: 1, minWidth: 180 }}><b>{ACCIONES[m.accion] || m.accion}</b> · {m.nombre} <span style={{ color: "var(--text-3)" }}>({m.codigo})</span> · {textoMovimiento(m, ubicaciones)}{m.motivo ? <span style={{ color: "var(--text-2)" }}> · {m.motivo}</span> : ""}</span>
          <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{m.byName || m.by}</span>
        </div>)}
      </div>)}
      <div style={{ display: "flex", justifyContent: "center" }}><Btn variant="ghost" onClick={cargarMesAnterior}>Cargar un mes más atrás</Btn></div>
    </div>;
  };

  const renderModal = () => {
    if (!modal) return null;
    const m = modal;
    if (m.t === "ficha") { const it = items.find(i => i.id === m.id); if (!it) return null; return <Modal title={it.codigo} onClose={() => setModal(null)} wide><FichaImpl item={it} ubicaciones={ubicaciones} emps={emps} maquinas={maquinas} perms={perms} ocupado={ocupado} isMobile={isMobile} movs={movs} verFoto={verFoto} onAccion={accionSobre} onEditar={(it2) => setModal({ t: "editar", id: it2.id })} onEliminar={eliminarArticulo} onEtiqueta={(it2) => etiquetas([it2], it2.codigo)} /></Modal>; }
    if (m.t === "editar") { const it = items.find(i => i.id === m.id); if (!it) return null; return <Modal title={`Editar ${it.codigo}`} onClose={() => setModal({ t: "ficha", id: it.id })}><EditarFormImpl item={it} ocupado={ocupado} isMobile={isMobile} onSave={(f) => editarArticulo(it, f)} onClose={() => setModal({ t: "ficha", id: it.id })} /></Modal>; }
    if (m.t === "ubicacion") return <Modal title={m.u ? `${m.u.nombre}` : "Nueva oficina"} onClose={() => setModal(null)}><UbicacionFormImpl ubicacion={m.u} usuarios={usuarios} ocupado={ocupado} onSave={(f) => guardarUbicacion(m.u, f)} onClose={() => setModal(null)} /></Modal>;
    if (m.t === "importar") return <Modal title="Importar desde Excel" onClose={() => setModal(null)} wide><ImportarFormImpl ubicaciones={ubicaciones} ubicFija={ubicFija} emps={emps} ocupado={ocupado} onImportar={importar} onClose={() => setModal(null)} /></Modal>;
    if (m.t === "escanear") return <Modal title="Escanear" onClose={() => setModal(null)}><EscanerImpl onCodigo={(c) => { setModal(null); abrirCodigo(c); }} onClose={() => setModal(null)} /></Modal>;
    return null;
  };

  // ═══════════════════════════ ROOT ═══════════════════════════
  if (!perms.ver) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", color: "#6E6862", fontSize: 13 }}>Este usuario no tiene acceso a GeoInventory.</div>;
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", fontFamily: "inherit", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoInventory…</div>;
  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
  const secOk = nav.some(x => x.id === sec) ? sec : "inicio";
  return <div className="gt-root gt-entra-modulo" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative", overflow: "hidden" }}>
    <style>{GT_CSS}</style>
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />
    <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: isMobile ? "10px 12px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, minWidth: 0 }}>
        {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
        <img src={logoUrl} alt="Geotecnica Soluciones" style={{ height: isMobile ? 28 : 34, width: "auto", display: "block" }} />
        <div title="GeoInventory" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO.materiales} size={22} /></div>
        {!isMobile && <div style={{ font: "800 15px/1 var(--display)", color: "var(--text)" }}>GeoInventory</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {!isMobile && <div style={{ textAlign: "right" }}><div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{userName || "Usuario"}</div><div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{esSoloLectura ? "Solo lectura" : ROLE_LABEL[userRole] || userRole}</div></div>}
        {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer", fontFamily: "inherit" }}>{isMobile ? "Salir" : "Cerrar sesión"}</button>}
      </div>
    </div>
    <div style={{ position: "relative", zIndex: 2, display: "flex", borderBottom: "1px solid rgba(44,42,40,.08)", overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: isMobile ? 4 : 20, scrollbarWidth: "none" }}>
      {nav.map(x => { const active = secOk === x.id; return <button key={x.id} onClick={() => setSec(x.id)} style={{ padding: isMobile ? "12px 13px" : "14px 18px", background: "transparent", border: "none", boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none", color: active ? "var(--naranja-tinta)" : "var(--text-3)", font: `${active ? 800 : 600} 13px/1 var(--sans)`, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{x.label}</button>; })}
    </div>
    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "10px 12px 24px" : "14px 32px 28px" }}>
        {secOk === "inicio" ? renderInicio() : secOk === "agregar" ? renderAgregar() : secOk === "buscar" ? renderBuscar() : secOk === "ubicaciones" ? renderUbicaciones() : secOk === "herramientas" ? renderHerramientas() : renderMovimientos()}
      </div>
    </div>
    {renderModal()}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}
