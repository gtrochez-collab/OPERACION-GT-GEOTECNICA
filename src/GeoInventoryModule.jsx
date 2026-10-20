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
  esCaja, PREFIJO_CAJA, prefijoDe, CONTENIDOS_CAJA, MARCAS_CAJA, TAMANOS_CAJA, tamanoLabel, nombreCaja, nivelCaja, estantesDe, nombreEstante, textoEstante, resumenCajas,
  PREFIJO_UBIC, PREFIJO_EST, MUEBLES, muebleLabel, codigoNivel, nivelesDe, resolverCodigo, posicionDe, itemsEnUbicacion, itemsEnEstante, itemsEnNivel, itemsSinEstante, resumenDe, movimientosDe,
} from "./geoinventory-calc.js";
import { generarEtiquetas, generarEtiquetasPDF, qrDataUrl, urlDeFicha } from "./geoinventory-etiquetas.js";

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
const C_NIVEL = { llena: C_VERDE, parcial: C_AMARILLO, vacia: C_GRIS };
const chipCaja = (item) => { const n = nivelCaja(item?.caja); return <Chip c={C_NIVEL[n]}>{fmtN(item?.caja?.cantidad)} de {fmtN(item?.caja?.capacidad || item?.caja?.cantidad)}</Chip>; };
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
  oficina: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1" /><path d="M10 21v-3h4v3" /></>,
  bodega: <><path d="M3 10 12 4l9 6v10H3V10Z" /><path d="M7 20v-6h10v6M7 17h10" /></>,
  taller: <><path d="M14.5 4.5a4 4 0 0 0-5.2 5.2L4 15l5 5 5.3-5.3a4 4 0 0 0 5.2-5.2l-2.7 2.7-2.3-2.3 2.7-2.7Z" /></>,
  proyecto: <><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-5h6v5" /></>,
  nivel: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  flecha: <><path d="m9 6 6 6-6 6" /></>,
  caja: <><path d="M3 9h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" /><path d="M3 9l2-4h14l2 4" /><path d="M10 13h4" /></>,
  estante: <><path d="M4 4v16M20 4v16" /><path d="M4 9h16M4 15h16" /><path d="M7 6.5h3M14 6.5h3M7 12.5h3M14 12.5h3" /></>,
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
// 14-oct-2026 (Gerson: "más compacto, aprovechemos el ancho; ese negro no me
// encanta, suavemos gris"): tarjetas más bajas, número en gris claro.
function PasoCaja({ n, titulo, children, extra, isMobile }) {
  return <div className="gt-vidrio" style={{ padding: isMobile ? 12 : 14, display: "flex", flexDirection: "column", gap: 9 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 22 }}>
      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(44,42,40,.08)", color: "#6E6862", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 11px/1 var(--sans)", flexShrink: 0 }}>{n}</span>
      <span style={{ font: "800 13.5px/1.2 var(--display)", color: CHARCOAL }}>{titulo}</span>
      {extra && <span style={{ marginLeft: "auto" }}>{extra}</span>}
    </div>
    {children}
  </div>;
}
// Control segmentado estilo iOS: pista gris, la opción activa en blanco.
function Segmentado({ opciones, valor, onChange, lleno, chico }) {
  return <div role="radiogroup" style={{ display: lleno ? "flex" : "inline-flex", gap: 3, padding: 3, borderRadius: 12, background: "rgba(44,42,40,.07)", flexWrap: "wrap", maxWidth: "100%", boxSizing: "border-box" }}>
    {opciones.map(([k, l]) => { const act = valor === k; return <button key={k} type="button" role="radio" aria-checked={act} onClick={() => onChange(k)}
      style={{ flex: lleno ? "1 1 0" : "0 0 auto", minHeight: chico ? 32 : 38, padding: chico ? "6px 11px" : "7px 14px", borderRadius: 9, border: "none", background: act ? "#fff" : "transparent", boxShadow: act ? "0 1px 3px rgba(44,42,40,.16), 0 0 0 .5px rgba(44,42,40,.08)" : "none", color: act ? CHARCOAL : "#6E6862", font: `${act ? 800 : 600} ${chico ? 12 : 13}px/1.1 var(--sans)`, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>; })}
  </div>;
}
// Unidad: menú con TODAS las de GeoCost (14-oct: "prefiero un menú con todas
// las disponibles para seleccionar una") + "Otra…" para escribir.
function UnidadSelect({ value, onChange, style: sx }) {
  const enLista = UNIDADES.includes(value);
  const [otra, setOtra] = useState(!!value && !enLista);
  if (otra) return <div style={{ display: "flex", gap: 6, ...(sx || {}) }}>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder="Unidad" style={{ ...CTRL, fontWeight: 700 }} autoFocus />
    <button type="button" onClick={() => { setOtra(false); onChange("Unidad"); }} title="Volver a la lista" style={{ border: "none", background: "rgba(44,42,40,.07)", borderRadius: 10, padding: "0 10px", cursor: "pointer", color: "#6E6862", fontWeight: 800, fontFamily: "inherit" }}>▾</button>
  </div>;
  return <select value={enLista ? value : "Unidad"} onChange={e => { if (e.target.value === "__otra") { setOtra(true); onChange(""); } else onChange(e.target.value); }} style={{ ...CTRL, fontWeight: 700, ...(sx || {}) }}>
    {UNIDADES.map(x => <option key={x} value={x}>{x}</option>)}
    <option value="__otra">Otra…</option>
  </select>;
}
// Estante/rack + nivel dentro de la ubicación (para cualquier artículo).
function PosicionPicker({ estantes, estanteId, nivel, onChange, requerido, onNuevo, ocupado, isMobile }) {
  const [nuevo, setNuevo] = useState(null);
  const sel = estantes.find(e => e.id === estanteId);
  if (nuevo) return <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) auto 84px auto", gap: 8, alignItems: "center", background: "rgba(44,42,40,.04)", borderRadius: 12, padding: 8 }}>
    <input value={nuevo.nombre} onChange={e => setNuevo(p => ({ ...p, nombre: e.target.value }))} placeholder="Nombre · ej. Estante A" style={CTRL} autoFocus />
    <Segmentado chico opciones={MUEBLES} valor={nuevo.mueble} onChange={v => setNuevo(p => ({ ...p, mueble: v, nombre: p.nombre.replace(/^(Estante|Rack)/, v === "rack" ? "Rack" : "Estante") }))} />
    <input type="number" inputMode="numeric" min="1" max="12" value={nuevo.niveles} onChange={e => setNuevo(p => ({ ...p, niveles: e.target.value }))} title="Niveles" placeholder="Niveles" style={{ ...CTRL, textAlign: "center" }} />
    <div style={{ display: "flex", gap: 6 }}><Btn small disabled={ocupado} onClick={async () => { const id = await onNuevo(nuevo); if (id) { onChange(id, "1"); setNuevo(null); } }}>Crear</Btn><Btn small variant="ghost" onClick={() => setNuevo(null)}>✕</Btn></div>
  </div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {estantes.length > 0 && <select value={estanteId || ""} onChange={e => onChange(e.target.value, e.target.value ? (e.target.value === estanteId ? nivel : "1") : "")} style={{ ...CTRL, flex: 1, minWidth: 170, width: "auto" }}>
        {!requerido && <option value="">Fuera de estante</option>}
        {requerido && !estanteId && <option value="">— Elegí el estante o rack —</option>}
        {estantes.map(e => <option key={e.id} value={e.id}>{e.nombre} · {e.niveles} niveles</option>)}
      </select>}
      {onNuevo && <button type="button" onClick={() => setNuevo({ nombre: `Estante ${String.fromCharCode(65 + estantes.length)}`, mueble: "estante", niveles: "4" })} style={{ minHeight: 40, padding: "8px 12px", borderRadius: 12, border: "1px dashed rgba(44,42,40,.22)", background: "transparent", color: "#6E6862", font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>+ Estante / rack</button>}
      {estantes.length === 0 && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{requerido ? "Esta ubicación no tiene estantes: creá el primero." : "Sin estantes acá (opcional)."}</span>}
    </div>
    {sel && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={LBL}>Nivel</span><Segmentado chico opciones={nivelesDe(sel).map(n => [n, n])} valor={String(nivel || "")} onChange={v => onChange(sel.id, v)} /></div>}
  </div>;
}
const FORM_VACIO = { foto: null, foto2: null, foto2De: null, nombre: "", tipo: "cantidad", categoria: "materiales", cantidad: "", unidad: "Unidad", estado: "", asignadoA: "", asignadoNombre: "", iguales: "1", herrTipo: "broca", diametro: "", marca: "", modelo: "", serie: "", notas: "",
  // caja (picas, portapicas): qué trae, cuántas trae, cuántas cajas iguales
  cajaMarca: "", tamano: "", capacidad: "", cajas: "1",
  // posición dentro de la ubicación (estante/rack + nivel), para cualquier tipo
  estanteId: "", nivel: "" };
function AgregarFormImpl({ ubicaciones, ubicFija, setUbicFija, items, emps, estantes, onNuevoEstante, onGuardar, onSumar, ocupado, isMobile, dosColumnas, ultimo, setUltimo }) {
  const [f, setF] = useState(() => ({ ...FORM_VACIO, ...(ultimo || {}) }));
  const [existente, setExistente] = useState(null);    // artículo existente elegido de las sugerencias
  const [sumar, setSumar] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [guardado, setGuardado] = useState(null);       // aviso verde "Guardado MAT-0012"
  const nombreRef = useRef(null);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const ubic = ubicaciones.find(x => x.id === ubicFija);
  const esHer = f.categoria === "herramientas_perforacion";
  const esCajaF = f.tipo === "caja";
  const estantesAqui = estantesDe(estantes, ubicFija);
  const estanteSel = estantesAqui.find(e => e.id === f.estanteId);
  // Si la ubicación cambia y el estante elegido no es de ahí, se suelta
  useEffect(() => { if (f.estanteId && !estantesAqui.some(e => e.id === f.estanteId)) setF(p => ({ ...p, estanteId: "", nivel: "" })); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicFija, estantes.length]);
  const contenidosUsados = [...new Set([...CONTENIDOS_CAJA, ...items.filter(i => i.tipo === "caja").map(i => i.caja?.contenido).filter(Boolean)])];
  const sugeridos = existente ? [] : sugerirExistentes(f.nombre, items, { categoria: f.categoria });
  const estados = estadosDe({ categoria: f.categoria });
  const tomarFoto2 = async (file) => {
    if (!file) return;
    setProcesando(true);
    try { u("foto2", { dataUrl: await comprimirFoto(file), name: file.name || "foto-caja.jpg" }); }
    catch (e) { alert("No pude procesar la foto: " + (e?.message || e)); }
    finally { setProcesando(false); }
  };
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
    else if (it.tipo === "caja") setF(p => ({ ...p, nombre: it.caja?.contenido || it.nombre, tipo: "caja", categoria: it.categoria, cajaMarca: it.caja?.marca || "", tamano: it.caja?.tamano || "", capacidad: String(it.caja?.capacidad || it.caja?.cantidad || ""), fotoDe: it.foto || null, foto: null, foto2De: it.foto2 || null, foto2: null }));
    else setF(p => ({ ...p, nombre: it.nombre, tipo: "individual", categoria: it.categoria, marca: it.marca || "", modelo: it.modelo || "", herrTipo: it.herramienta?.tipo || p.herrTipo, diametro: it.herramienta?.diametro || "", unidad: it.unidad || p.unidad, fotoDe: it.foto || null, foto: null }));
  };
  const limpiarExistente = () => { setExistente(null); setSumar(""); setF(p => ({ ...p, fotoDe: null })); };
  const validar = () => {
    if (!ubic) return "Elegí la ubicación donde estás cargando.";
    if (existente?.tipo === "cantidad") return num(sumar) > 0 ? null : "Escribí cuánto vas a sumar.";
    if (!String(f.nombre).trim()) return esCajaF ? "Escribí qué trae la caja." : "Escribí el nombre.";
    if (f.tipo === "cantidad" && !(num(f.cantidad) > 0)) return "Escribí la cantidad.";
    if (f.tipo === "cantidad" && !String(f.unidad).trim()) return "Elegí la unidad.";
    if (f.tipo === "individual" && !(num(f.iguales) >= 1 && num(f.iguales) <= 200)) return "¿Cuántos iguales? Entre 1 y 200.";
    if (esHer && !esCajaF && !String(f.diametro).trim()) return "Escribí el diámetro de la herramienta.";
    if (esCajaF && !(num(f.capacidad) > 0)) return "¿Cuántas trae cada caja?";
    if (esCajaF && !(num(f.cajas) >= 1 && num(f.cajas) <= 200)) return "¿Cuántas cajas iguales? Entre 1 y 200.";
    if (esCajaF && estantesAqui.length && !f.estanteId) return "Elegí el estante o rack (o creá uno).";
    if (estanteSel && !f.nivel) return "Elegí el nivel.";
    return null;
  };
  const guardar = async (otro) => {
    const e = validar(); if (e) return alert(e);
    setGuardado(null);
    let r;
    if (existente?.tipo === "cantidad") r = await onSumar(existente, num(sumar), ubicFija);
    else r = await onGuardar({ ...f, estado: f.estado || estadoInicial(f.categoria), ubicacionId: ubicFija }, { fotoDe: f.fotoDe, foto2De: f.foto2De });
    if (!r) return;
    setGuardado(r);
    const memoria = { tipo: f.tipo, categoria: f.categoria, unidad: f.unidad, herrTipo: f.herrTipo, estanteId: f.estanteId, nivel: f.nivel, cajaMarca: f.cajaMarca, tamano: f.tamano, capacidad: f.capacidad };
    setUltimo(memoria);
    setExistente(null); setSumar("");
    setF({ ...FORM_VACIO, ...memoria });
    if (otro) setTimeout(() => nombreRef.current?.focus(), 50);
  };
  const Paso = PasoCaja;   // componente ESTABLE (a nivel de módulo)
  const fotoCaja = <label title="Tomar foto" style={{ width: 92, height: 92, flexShrink: 0, borderRadius: 16, border: f.foto || f.fotoDe ? "none" : `1.5px dashed ${ORANGE}`, background: "rgba(232,118,45,.06)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, color: "var(--naranja-tinta)", font: "800 11.5px/1 var(--sans)", cursor: procesando ? "wait" : "pointer", overflow: "hidden", position: "relative" }}>
    {f.foto ? <img src={f.foto.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : f.fotoDe ? <Foto foto={f.fotoDe} size={92} radius={16} categoria={f.categoria} /> : <><Ico d={ICO.camara} size={24} />{procesando ? "…" : "Foto"}</>}
    <input type="file" accept="image/*" capture="environment" disabled={procesando} style={{ display: "none" }} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; tomarFoto(file); }} />
  </label>;
  const linkGaleria = <label style={{ fontSize: 12, fontWeight: 800, color: ORANGE_DARK, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
    <Ico d={ICO.galeria} size={14} /> {f.foto || f.fotoDe ? "Cambiar desde la galería" : "o desde la galería"}
    <input type="file" accept="image/*" disabled={procesando} style={{ display: "none" }} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; tomarFoto(file); }} />
  </label>;

  const colIzq = <>
    <Paso isMobile={isMobile} n="1" titulo="Dónde" extra={ubic && <Chip c={C_NARANJA} style={{ fontSize: 11.5 }}>{TIPO_UBICACION[ubic.tipo]}</Chip>}>
      <select value={ubicFija} onChange={e => setUbicFija(e.target.value)} style={{ ...CTRL, fontWeight: 700 }}>
        <option value="">— Elegí la ubicación —</option>
        {ubicaciones.map(x => <option key={x.id} value={x.id}>{x.nombre}{x.tipo === "proyecto" && x.nombreLargo && x.nombreLargo !== x.nombre ? ` — ${x.nombreLargo}` : ""}</option>)}
      </select>
      {ubic && (estantesAqui.length > 0 || esCajaF || ["almacen", "vault"].includes(ubic.tipo)) && <PosicionPicker estantes={estantesAqui} estanteId={f.estanteId} nivel={f.nivel} requerido={esCajaF && estantesAqui.length > 0} isMobile={isMobile} ocupado={ocupado}
        onChange={(estanteId, nivel) => setF(p => ({ ...p, estanteId, nivel }))} onNuevo={onNuevoEstante ? (d) => onNuevoEstante(ubicFija, d) : null} />}
      <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Se queda fija para lo que sigás cargando.</div>
    </Paso>
    <Paso isMobile={isMobile} n="2" titulo="Foto y nombre">
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {fotoCaja}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
          <input ref={nombreRef} value={f.nombre} onChange={e => { u("nombre", e.target.value); if (existente) limpiarExistente(); }} list={esCajaF ? "inv-contenidos" : undefined} placeholder={esCajaF ? "Qué trae la caja · ej. Pica, Portapica" : 'Ej. Cemento GU 42.5 kg · Broca 1.20 m · Monitor 24"'} style={{ ...CTRL, fontSize: 15, fontWeight: 600 }} autoCapitalize="sentences" />
          {esCajaF && <datalist id="inv-contenidos">{contenidosUsados.map(x => <option key={x} value={x} />)}</datalist>}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>{linkGaleria}{(f.foto || f.fotoDe) && <button type="button" onClick={() => setF(p => ({ ...p, foto: null, fotoDe: null }))} style={{ background: "none", border: "none", color: C_ROJO.color, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0 }}>Quitar foto</button>}</div>
        </div>
      </div>
      {esCajaF && <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 10, borderRadius: 14, background: "rgba(44,42,40,.04)" }}>
        <label title="Foto de la caja" style={{ width: 64, height: 64, flexShrink: 0, borderRadius: 12, border: f.foto2 || f.foto2De ? "none" : `1.5px dashed ${ORANGE}`, background: "rgba(232,118,45,.06)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--naranja-tinta)", cursor: procesando ? "wait" : "pointer", overflow: "hidden" }}>
          {f.foto2 ? <img src={f.foto2.dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : f.foto2De ? <Foto foto={f.foto2De} size={64} radius={12} categoria={f.categoria} /> : <Ico d={ICO.camara} size={22} />}
          <input type="file" accept="image/*" capture="environment" disabled={procesando} style={{ display: "none" }} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; tomarFoto2(file); }} />
        </label>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>Foto de la caja <span style={{ fontWeight: 600, color: "var(--text-3)" }}>(opcional)</span></div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Cómo se ve la caja con lo que trae. Solo se ve al abrir la caja; las tarjetas siguen con la foto de arriba.</div>
        </div>
        {(f.foto2 || f.foto2De) && <button type="button" onClick={() => setF(p => ({ ...p, foto2: null, foto2De: null }))} style={{ background: "none", border: "none", color: C_ROJO.color, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12, padding: 0 }}>Quitar</button>}
      </div>}
      {sugeridos.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={LBL}>¿Es alguno de estos? Tocalo y no se duplica</div>
        {sugeridos.map(it => <button key={it.id} type="button" onClick={() => elegirExistente(it)} style={{ display: "flex", alignItems: "center", gap: 10, padding: 7, borderRadius: 12, border: "1px solid rgba(44,42,40,.1)", background: "rgba(255,255,255,.8)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", minHeight: 48 }}>
          <Foto foto={it.foto} size={36} radius={9} categoria={it.categoria} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nombre}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>{it.codigo} · {it.tipo === "cantidad" ? `${fmtN(stockDe(it))} ${it.unidad} en total${ubicFija ? ` · ${fmtN(stockEn(it, ubicFija))} acá` : ""}` : it.tipo === "caja" ? `caja · ${fmtN(it.caja?.cantidad)} de ${fmtN(it.caja?.capacidad || it.caja?.cantidad)}` : `individual · ${estadoLabel(it)}`}</div>
          </div>
          <span style={{ color: "var(--naranja-tinta)", fontWeight: 800, fontSize: 12 }}>{it.tipo === "cantidad" ? "Sumar" : it.tipo === "caja" ? "Otra igual" : "Otro igual"}</span>
        </button>)}
      </div>}
      {existente && existente.tipo === "cantidad" && <div style={{ padding: 10, borderRadius: 12, background: C_VERDE.bg, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, color: C_VERDE.color }}><b>Ya existe: {existente.nombre}</b> ({existente.codigo}) · hay {fmtN(stockEn(existente, ubicFija))} {existente.unidad} en {ubic?.nombre || "esta ubicación"}. Solo sumás.</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" inputMode="decimal" min="0" step="any" value={sumar} onChange={e => setSumar(e.target.value)} placeholder="Cuánto entra" style={{ ...CTRL, fontSize: 17, fontWeight: 800, textAlign: "right", flex: 1 }} autoFocus />
          <span style={{ fontWeight: 700, color: "var(--text-2)" }}>{existente.unidad}</span>
          <button type="button" onClick={limpiarExistente} style={{ background: "none", border: "none", color: "var(--text-3)", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>No es este</button>
        </div>
      </div>}
      {existente && existente.tipo !== "cantidad" && <div style={{ fontSize: 12, color: C_AZUL.color, background: C_AZUL.bg, borderRadius: 12, padding: "8px 12px" }}>Vas a crear <b>{existente.tipo === "caja" ? "otra caja igual" : "otro igual"}</b> a {existente.codigo}, con su propio código. <button type="button" onClick={limpiarExistente} style={{ background: "none", border: "none", color: C_AZUL.color, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>No es igual</button></div>}
    </Paso>
  </>;

  const colDer = !(existente?.tipo === "cantidad") && <>
    <Paso isMobile={isMobile} n="3" titulo="Tipo y categoría">
      <Segmentado lleno opciones={[["cantidad", "Por cantidad"], ["individual", "Individual"], ["caja", "Caja"]]} valor={f.tipo} onChange={v => setF(p => ({ ...p, tipo: v, categoria: v === "caja" && p.categoria === "materiales" ? "insumos_perforacion" : p.categoria }))} />
      <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4 }}>{f.tipo === "cantidad" ? "Cosas iguales entre sí: cemento, sillas, bolsas. Se cuenta cuántas hay." : f.tipo === "caja" ? "Cajita con N unidades (picas, portapicas). Cada caja lleva su código y QR; las salidas se descuentan de ESA caja." : "Cada unidad es única: con serie, asignada a una persona o herramienta de perforación."}</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, minmax(0,1fr))", gap: 6 }}>
        {CATEGORIAS.map(c => { const act = f.categoria === c.id; return <button key={c.id} type="button" onClick={() => { setF(p => ({ ...p, categoria: c.id, estado: "", tipo: c.id === "herramientas_perforacion" && p.tipo === "cantidad" ? "individual" : p.tipo })); }} aria-pressed={act}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", minHeight: 42, borderRadius: 12, border: act ? "1px solid transparent" : "1px solid rgba(44,42,40,.10)", background: act ? ORANGE_DARK : "rgba(255,255,255,.65)", color: act ? "#fff" : "#5C5853", font: "700 12.5px/1.15 var(--sans)", cursor: "pointer", textAlign: "left" }}>
          <Ico d={ICO[c.id]} size={18} /> {c.corto}</button>; })}
      </div>
    </Paso>
    {esCajaF
      ? <Paso isMobile={isMobile} n="4" titulo="La caja" extra={estanteSel && f.nivel ? <Chip c={C_NARANJA} style={{ fontSize: 11.5 }}>{estanteSel.nombre} · Nivel {f.nivel}</Chip> : null}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
          <input list="inv-marcas-caja" value={f.cajaMarca} onChange={e => u("cajaMarca", e.target.value)} placeholder="Marca (opcional) · ej. Drill Master" style={CTRL} />
          <datalist id="inv-marcas-caja">{[...new Set([...MARCAS_CAJA, ...items.filter(i => i.tipo === "caja").map(i => i.caja?.marca).filter(Boolean)])].map(x => <option key={x} value={x} />)}</datalist>
          <Segmentado chico opciones={[["", "Sin tamaño"], ...TAMANOS_CAJA]} valor={f.tamano} onChange={v => u("tamano", v)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><div style={LBL}>Cuántas trae cada caja</div><input type="number" inputMode="numeric" min="1" step="1" value={f.capacidad} onChange={e => u("capacidad", e.target.value)} placeholder="15" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "center" }} /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><div style={LBL}>¿Cuántas cajas iguales?</div><input type="number" inputMode="numeric" min="1" max="200" value={f.cajas} onChange={e => u("cajas", e.target.value)} style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "center" }} /></div>
        </div>
        {num(f.cajas) > 1 && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Se crean {num(f.cajas)} cajas de {fmtN(f.capacidad) || "…"} {String(f.nombre || "unidades").toLowerCase()}, cada una con su código y QR, en {estanteSel ? `${estanteSel.nombre} nivel ${f.nivel || "?"}` : ubic?.nombre || "la ubicación"}.</div>}
      </Paso>
      : f.tipo === "cantidad"
      ? <Paso isMobile={isMobile} n="4" titulo="Cuánto hay">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 8 }}>
          <input type="number" inputMode="decimal" min="0" step="any" value={f.cantidad} onChange={e => u("cantidad", e.target.value)} placeholder="Cantidad" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right" }} />
          <UnidadSelect value={f.unidad} onChange={v => u("unidad", v)} />
        </div>
      </Paso>
      : <Paso isMobile={isMobile} n="4" titulo={esHer ? "La herramienta" : "Detalle"}>
        {esHer && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0,1fr)", gap: 8, alignItems: "center" }}>
          <Segmentado opciones={TIPOS_HERRAMIENTA.map(t => [t.id, t.label])} valor={f.herrTipo} onChange={v => u("herrTipo", v)} />
          <input value={f.diametro} onChange={e => u("diametro", e.target.value)} placeholder="Diámetro · ej. 1.20 m" style={{ ...CTRL, fontWeight: 700 }} />
        </div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><span style={LBL}>Estado</span>{Object.entries(estados).map(([k, e]) => pillBtn(e.label, (f.estado || estadoInicial(f.categoria)) === k, () => u("estado", k), { key: k, c: TONO[e.tono]?.color }))}</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 8 }}>
          <input value={f.marca} onChange={e => u("marca", e.target.value)} placeholder="Marca (opcional)" style={CTRL} />
          <input value={f.modelo} onChange={e => u("modelo", e.target.value)} placeholder="Modelo (opcional)" style={CTRL} />
          <input value={f.serie} onChange={e => u("serie", e.target.value)} placeholder="N° de serie (opcional)" style={CTRL} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) auto", gap: 8, alignItems: "start" }}>
          <BuscaEmpleado emps={emps} value={f.asignadoA} onChange={(id, nombre) => setF(p => ({ ...p, asignadoA: id, asignadoNombre: nombre }))} placeholder="Asignado a (opcional) · buscar colaborador" />
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(44,42,40,.04)", borderRadius: 12, padding: "4px 4px 4px 12px" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#6E6862", whiteSpace: "nowrap" }}>¿Cuántos iguales?</span>
            <input type="number" inputMode="numeric" min="1" max="200" value={f.iguales} onChange={e => u("iguales", e.target.value)} style={{ ...CTRL, width: 70, textAlign: "center", fontWeight: 800, minHeight: 38 }} />
          </div>
        </div>
        {num(f.iguales) > 1 && <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Se crean {num(f.iguales)} con la misma foto y datos, cada uno con su código{f.asignadoA ? " (el asignado va en el primero; los demás se asignan desde su ficha)" : ""}.</div>}
      </Paso>}
    <input value={f.notas} onChange={e => u("notas", e.target.value)} placeholder="Nota (opcional)" style={{ ...CTRL, background: "rgba(255,255,255,.7)" }} />
  </>;

  return <div style={{ display: "grid", gridTemplateColumns: dosColumnas ? "minmax(0,1fr) minmax(0,1.1fr)" : "minmax(0,1fr)", gap: 12, maxWidth: dosColumnas ? 1180 : 720, margin: "0 auto", width: "100%", alignItems: "start" }}>
    {guardado && <div style={{ gridColumn: "1 / -1", padding: "10px 14px", borderRadius: 14, background: C_VERDE.bg, color: C_VERDE.color, fontSize: 13.5, display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}><Ico d={ICO.check} size={18} /> {guardado}</div>}
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>{colIzq}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>{colDer}</div>
    <div style={{ gridColumn: "1 / -1", position: "sticky", bottom: 8, zIndex: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" disabled={ocupado || procesando} onClick={() => guardar(true)} style={{ flex: 2, minHeight: 52, borderRadius: 16, border: "none", background: ORANGE_DARK, color: "#fff", font: "800 15px/1 var(--sans)", cursor: ocupado ? "wait" : "pointer", boxShadow: "0 10px 24px rgba(199,95,31,.28)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Ico d={ICO.agregar} size={20} /> {ocupado ? "Guardando…" : existente?.tipo === "cantidad" ? "Sumar y agregar otro" : esCajaF && num(f.cajas) > 1 ? `Guardar ${num(f.cajas)} cajas y seguir` : "Guardar y agregar otro"}</button>
      <button type="button" disabled={ocupado || procesando} onClick={() => guardar(false)} style={{ flex: 1, minHeight: 52, borderRadius: 16, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.92)", color: CHARCOAL, font: "700 14px/1 var(--sans)", cursor: "pointer" }}>Guardar</button>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM de estante / rack — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function EstanteFormImpl({ estante, ubicacionNombre, onSave, onClose, ocupado }) {
  const [f, setF] = useState(() => ({ nombre: estante?.nombre || "Estante A", mueble: estante?.mueble || "estante", niveles: String(estante?.niveles || 4) }));
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>En <b>{ubicacionNombre}</b>{estante?.codigo ? <> · código <b style={{ fontFamily: "var(--mono)" }}>{estante.codigo}</b></> : ""}</div>
    <Segmentado lleno opciones={MUEBLES} valor={f.mueble} onChange={v => setF(p => ({ ...p, mueble: v, nombre: estante ? p.nombre : p.nombre.replace(/^(Estante|Rack)/, v === "rack" ? "Rack" : "Estante") }))} />
    <Input label="Nombre *" value={f.nombre} onChange={e => setF(p => ({ ...p, nombre: e.target.value }))} autoFocus />
    <Input label="¿Cuántos niveles tiene?" type="number" min="1" max="12" value={f.niveles} onChange={e => setF(p => ({ ...p, niveles: e.target.value }))} />
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Btn><Btn disabled={ocupado} onClick={() => { if (!String(f.nombre).trim()) return alert("Escribí el nombre."); onSave(f); }}>{ocupado ? "Guardando…" : estante ? "Guardar" : "Crear"}</Btn></div>
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
    {!nueva && ubicacion.codigo && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Código <b style={{ fontFamily: "var(--mono)", color: CHARCOAL }}>{ubicacion.codigo}</b> (no cambia aunque cambie el nombre)</div>}
    {nueva && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Al guardar le doy su código (UBI-…) y te muestro el QR para imprimirlo y pegarlo afuera de la oficina.</div>}
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
function FichaImpl({ item, ubicaciones, emps, maquinas, estantes, perms: permsBase, puedeEn = () => true, onAccion, onEditar, onEliminar, onEtiqueta, verFoto, ocupado, isMobile, movs }) {
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
  const caja = item.tipo === "caja";
  // Alcance (14-oct-2026): fuera de sus ubicaciones, Óscar solo mira.
  const enMia = item.tipo === "cantidad" ? enUbic.some(x => puedeEn(x.id)) : puedeEn(item.ubicacionId);
  const ubEditables = ubicaciones.filter(x => puedeEn(x.id));
  const salidaDesde = item.tipo === "cantidad" ? enUbic.filter(x => puedeEn(x.id)) : [];
  const perms = { ...permsBase, ...(enMia ? {} : { mover: false, asignar: false, estado: false, editar: false, ajustar: false, eliminar: false }), cargar: permsBase.cargar && (item.tipo === "cantidad" ? ubEditables.length > 0 : enMia) };
  const soloMirar = permsBase.cargar && !enMia;
  const estantesDestino = estantesDe(estantes, f.a || item.ubicacionId);
  const nombreEst = (id) => estantes.find(e => e.id === id)?.nombre || "";
  const textoPos = (ubId) => { const p = posicionDe(item, ubId); return p.estanteId && nombreEst(p.estanteId) ? `${nombreEst(p.estanteId)} · Nivel ${p.nivel}` : ""; };
  // Por cantidad: ubicaciones con existencias que tienen estantes (para "Ubicar")
  const ubicConEstantes = item.tipo === "cantidad" ? enUbic.filter(x => puedeEn(x.id) && estantesDe(estantes, x.id).length > 0) : [];
  const ubicPrincipal = item.tipo === "individual" ? item.ubicacionId : ((enUbic.find(x => puedeEn(x.id)) || enUbic[0])?.id || "");
  const destinoEntrada = puedeEn(ubicPrincipal) ? ubicPrincipal : (ubEditables[0]?.id || "");
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
  const selUbic = (val, onChange, excluir, soloMias) => <select value={val} onChange={e => onChange(e.target.value)} style={CTRL}>
    <option value="">— Ubicación —</option>{ubicaciones.filter(x => x.id !== excluir && (!soloMias || puedeEn(x.id))).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
  </select>;
  const cajaUI = (children) => <div style={{ padding: 12, borderRadius: 14, background: "rgba(44,42,40,.04)", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
  const historial = (movs || []).filter(m => m.itemId === item.id).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: isMobile ? "wrap" : "nowrap" }}>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <Foto foto={item.foto} size={isMobile ? 120 : 150} radius={18} categoria={item.categoria} onClick={() => item.foto?.fileId && verFoto(item.foto)} />
        {item.tipo === "caja" && item.foto2?.fileId && <Foto foto={item.foto2} size={isMobile ? 120 : 150} radius={18} categoria={item.categoria} onClick={() => verFoto(item.foto2)} />}
      </div>
      <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 14, color: CHARCOAL }}>{item.codigo}</span>
          <Chip c={C_GRIS}>{cat.corto}</Chip>
          {item.tipo === "individual" ? chipEstado(item) : caja ? <Chip c={C_NARANJA}>Caja</Chip> : <Chip c={C_AZUL}>{fmtN(stockDe(item))} {item.unidad}</Chip>}
        </div>
        <div style={{ font: "800 20px/1.15 var(--display)", color: CHARCOAL }}>{item.nombre}</div>
        {caja && <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ font: "800 34px/1 var(--display)", color: C_NIVEL[nivelCaja(item.caja)].color }}>{fmtN(item.caja?.cantidad)}</span><span style={{ fontSize: 14, color: "var(--text-2)" }}>de {fmtN(item.caja?.capacidad || item.caja?.cantidad)} {String(item.caja?.contenido || "").toLowerCase()}{num(item.caja?.capacidad || item.caja?.cantidad) === 1 ? "" : "s"} en esta caja</span></div>}
        {caja && textoEstante(estantes, item) && <div style={{ fontSize: 13, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 6 }}><Ico d={ICO.estante} size={15} color={ORANGE_DARK} />{textoEstante(estantes, item)}</div>}
        {esHerramienta(item) && <div style={{ fontSize: 13, color: "var(--text-2)" }}>{tipoHerramientaLabel(item.herramienta?.tipo)}{item.herramienta?.diametro ? ` · Ø ${item.herramienta.diametro}` : ""}{maquina ? <> · en <b>{maquina.nombre}</b></> : item.maquinaNombre ? <> · en <b>{item.maquinaNombre}</b></> : ""}</div>}
        {(item.marca || item.modelo || item.serie) && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{[item.marca, item.modelo, item.serie ? `S/N ${item.serie}` : ""].filter(Boolean).join(" · ")}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {enUbic.length === 0 && <div style={{ fontSize: 13, color: C_ROJO.color, fontWeight: 700 }}>Sin existencias en ninguna ubicación</div>}
          {enUbic.map(x => <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}><Ico d={ICO.ubicaciones} size={15} color={ORANGE_DARK} /><b>{nombreUbicacion(ubicaciones, x.id)}</b>{item.tipo === "cantidad" && <span style={{ color: "var(--text-2)" }}>· {fmtN(x.cantidad)} {item.unidad}</span>}{!caja && textoPos(x.id) && <span style={{ color: "var(--text-2)" }}>· {textoPos(x.id)}</span>}{item.estante && !textoPos(x.id) && <span style={{ color: "var(--text-3)" }}>· estante {item.estante}</span>}</div>)}
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
      {accion === "maquina" && cajaUI(<>
        <div style={LBL}>¿En qué máquina está?</div>
        <select value={f.maquinaId || ""} onChange={e => u("maquinaId", e.target.value)} style={CTRL}><option value="">— Máquina de GeoMachinery —</option>{maquinas.map(m => <option key={m.id} value={m.id}>{m.nombre}{m.tipo ? ` · ${m.tipo}` : ""}</option>)}</select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado || !f.maquinaId} onClick={() => ejecutar({ accion: "estado", estado: "en_operacion", maquinaId: f.maquinaId, maquinaNombre: maquinas.find(m => m.id === f.maquinaId)?.nombre || "" })}>En operación</Btn></div>
      </>)}
    </div>}

    {soloMirar && <div style={{ fontSize: 12.5, color: "var(--text-3)", background: "rgba(44,42,40,.05)", borderRadius: 12, padding: "8px 12px" }}>Está en {enUbic.map(x => nombreUbicacion(ubicaciones, x.id)).join(", ") || "otra ubicación"}: lo podés ver, pero lo maneja su responsable.</div>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {btnAccion({ id: "salida", label: caja ? "Salida de la caja" : "Salida", icono: ICO.movimientos, c: ORANGE_DARK, show: (caja ? perms.cargar : item.tipo === "cantidad" && perms.cargar && salidaDesde.length > 0) })}
      {btnAccion({ id: "entrada", label: caja ? "Rellenar" : "Entrada", icono: ICO.agregar, c: C_VERDE.color, show: (item.tipo === "cantidad" || caja) && perms.cargar })}
      {btnAccion({ id: "mover", label: "Mover", icono: ICO.ubicaciones, c: ORANGE_DARK, show: (item.tipo === "individual" || caja) && perms.mover })}
      {btnAccion({ id: "ubicar", label: "Ubicar en estante", icono: ICO.estante, c: ORANGE_DARK, show: ubicConEstantes.length > 0 && perms.mover })}
      {btnAccion({ id: "asignar", label: item.asignadoA ? "Reasignar" : "Asignar", icono: ICO.persona, c: C_AZUL.color, show: item.tipo === "individual" && perms.asignar })}
      {btnAccion({ id: "ajustar", label: "Ajustar", c: C_ROJO.color, show: (item.tipo === "cantidad" || caja) && perms.ajustar })}
      {perms.editar && <button type="button" onClick={() => onEditar(item)} style={{ minHeight: 48, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "700 13px/1 var(--sans)", cursor: "pointer" }}>Editar</button>}
      {perms.imprimir && <button type="button" onClick={() => onEtiqueta(item)} title="Etiqueta QR en PDF" style={{ minHeight: 48, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "700 13px/1 var(--sans)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}><Ico d={ICO.imprimir} size={16} />Etiqueta</button>}
    </div>

    {accion === "entrada" && cajaUI(<>
      {!caja && <><div style={LBL}>Entra a</div>{selUbic(f.a || destinoEntrada, v => u("a", v), undefined, true)}</>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="number" inputMode="decimal" min="0" step="any" value={f.cantidad || ""} onChange={e => u("cantidad", e.target.value)} placeholder="Cantidad" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right" }} autoFocus /><b>{caja ? String(item.caja?.contenido || "").toLowerCase() + "s" : item.unidad}</b>{caja && <span style={{ fontSize: 12, color: "var(--text-3)" }}>caben {fmtN(item.caja?.capacidad)}</span>}</div>
      <input value={f.motivo || ""} onChange={e => u("motivo", e.target.value)} placeholder="Nota (opcional) · ej. llegó de Larach" style={CTRL} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado} onClick={() => ejecutar({ accion: "entrada", a: caja ? ubicPrincipal : (f.a || destinoEntrada), cantidad: f.cantidad, motivo: f.motivo })}>{caja ? "Rellenar" : "Registrar entrada"}</Btn></div>
    </>)}
    {accion === "salida" && cajaUI(<>
      {!caja && <><div style={LBL}>Sale de</div>{selUbic(f.de, v => u("de", v), undefined, true)}</>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="number" inputMode="decimal" min="0" step="any" value={f.cantidad || ""} onChange={e => u("cantidad", e.target.value)} placeholder="Cantidad" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right" }} autoFocus /><b>{caja ? String(item.caja?.contenido || "").toLowerCase() + "s" : item.unidad}</b><span style={{ fontSize: 12, color: "var(--text-3)" }}>{caja ? `quedan ${fmtN(item.caja?.cantidad)}` : `hay ${fmtN(stockEn(item, f.de))}`}</span></div>
      <div style={LBL}>{caja ? "Para qué proyecto / a dónde van" : "Hacia (opcional: si va a otra ubicación, entra allá)"}</div>{selUbic(f.a || "", v => u("a", v), f.de)}
      <div style={LBL}>Entregado a (opcional)</div><BuscaEmpleado emps={emps} value={f.entregadoA || ""} onChange={(id, nombre) => setF(p => ({ ...p, entregadoA: id, entregadoNombre: nombre }))} />
      <input value={f.motivo || ""} onChange={e => u("motivo", e.target.value)} placeholder="Nota (opcional)" style={CTRL} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado} onClick={() => ejecutar({ accion: "salida", de: caja ? item.ubicacionId : f.de, a: f.a, cantidad: f.cantidad, motivo: f.motivo, entregadoA: f.entregadoA, entregadoNombre: f.entregadoNombre })}>Registrar salida</Btn></div>
    </>)}
    {accion === "mover" && cajaUI(<>
      <div style={LBL}>Ubicación</div>{selUbic(f.a || item.ubicacionId, v => setF(p => ({ ...p, a: v, estanteId: undefined, nivel: undefined })))}
      {estantesDestino.length > 0 && <PosicionPicker estantes={estantesDestino} estanteId={f.estanteId ?? ((f.a || item.ubicacionId) === item.ubicacionId ? item.estanteId || "" : "")} nivel={f.nivel ?? ((f.a || item.ubicacionId) === item.ubicacionId ? item.nivel || "" : "")} isMobile={isMobile} onChange={(estanteId, nivel) => setF(p => ({ ...p, estanteId, nivel }))} />}
      {esHerramienta(item) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><span style={LBL}>Queda</span>{Object.entries(estados).filter(([k]) => k !== "en_operacion").map(([k, e]) => pillBtn(e.label, (f.estado || item.estado) === k, () => u("estado", k), { key: k, c: TONO[e.tono]?.color }))}</div>}
      <input value={f.motivo || ""} onChange={e => u("motivo", e.target.value)} placeholder="Nota (opcional)" style={CTRL} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado} onClick={() => { const a = f.a || item.ubicacionId; const mismo = a === item.ubicacionId; ejecutar({ accion: "mover", a, estanteId: f.estanteId ?? (mismo ? item.estanteId || "" : ""), nivel: f.nivel ?? (mismo ? item.nivel || "" : ""), motivo: f.motivo, ...(esHerramienta(item) && f.estado ? { estado: f.estado } : {}) }); }}>Mover</Btn></div>
    </>)}
    {accion === "ubicar" && cajaUI(<>
      <div style={LBL}>En</div>
      <select value={f.en || ubicConEstantes[0]?.id || ""} onChange={e => setF(p => ({ ...p, en: e.target.value, estanteId: undefined, nivel: undefined }))} style={CTRL}>{ubicConEstantes.map(x => <option key={x.id} value={x.id}>{nombreUbicacion(ubicaciones, x.id)} · {fmtN(x.cantidad)} {item.unidad}</option>)}</select>
      {(() => { const en = f.en || ubicConEstantes[0]?.id; const p = posicionDe(item, en); return <PosicionPicker estantes={estantesDe(estantes, en)} estanteId={f.estanteId ?? p.estanteId} nivel={f.nivel ?? p.nivel} isMobile={isMobile} onChange={(estanteId, nivel) => setF(q => ({ ...q, estanteId, nivel }))} />; })()}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn><Btn small disabled={ocupado} onClick={() => { const en = f.en || ubicConEstantes[0]?.id; const p = posicionDe(item, en); ejecutar({ accion: "ubicar", en, estanteId: f.estanteId ?? p.estanteId, nivel: f.nivel ?? p.nivel }); }}>Guardar lugar</Btn></div>
    </>)}
    {accion === "asignar" && cajaUI(<>
      <div style={LBL}>Asignar a (colaborador de GeoTeam)</div><BuscaEmpleado emps={emps} value={f.empId ?? item.asignadoA ?? ""} onChange={(id, nombre) => setF(p => ({ ...p, empId: id, empNombre: nombre, tocado: true }))} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn small variant="ghost" onClick={() => setAccion(null)}>Cancelar</Btn>{item.asignadoA && <Btn small variant="danger" disabled={ocupado} onClick={() => ejecutar({ accion: "asignar", empId: "" })}>Devuelto (quitar)</Btn>}<Btn small disabled={ocupado || !f.empId || f.empId === item.asignadoA} onClick={() => ejecutar({ accion: "asignar", empId: f.empId, empNombre: f.empNombre })}>Asignar</Btn></div>
    </>)}
    {accion === "ajustar" && cajaUI(<>
      <div style={{ fontSize: 12.5, color: C_ROJO.color, fontWeight: 700 }}>Corrección de inventario: la cantidad queda en lo que escribas. Queda registrado con tu nombre.</div>
      {!caja && <><div style={LBL}>En</div>{selUbic(f.en, v => u("en", v), undefined, true)}</>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 13, color: "var(--text-2)" }}>hay {fmtN(caja ? item.caja?.cantidad : stockEn(item, f.en))} →</span><input type="number" inputMode="decimal" min="0" step="any" value={f.nuevo || ""} onChange={e => u("nuevo", e.target.value)} placeholder="Cantidad real" style={{ ...CTRL, fontSize: 18, fontWeight: 800, textAlign: "right" }} autoFocus /><b>{caja ? String(item.caja?.contenido || "").toLowerCase() + "s" : item.unidad}</b></div>
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
  const [f, setF] = useState(() => ({ nombre: item.nombre, categoria: item.categoria, unidad: item.unidad || "", marca: item.marca || "", modelo: item.modelo || "", serie: item.serie || "", estante: item.estante || "", notas: item.notas || "", herrTipo: item.herramienta?.tipo || "broca", diametro: item.herramienta?.diametro || "", foto: null, foto2: null,
    contenido: item.caja?.contenido || "", cajaMarca: item.caja?.marca || "", tamano: item.caja?.tamano || "", capacidad: String(item.caja?.capacidad || "") }));
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
    {item.tipo === "caja" && <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {f.foto2 ? <img src={f.foto2.dataUrl} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: "cover" }} /> : item.foto2 ? <Foto foto={item.foto2} size={72} radius={14} categoria={item.categoria} /> : <div style={{ width: 72, height: 72, borderRadius: 14, background: "rgba(44,42,40,.05)" }} />}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 12, border: `1px dashed ${ORANGE}`, color: "var(--naranja-tinta)", fontSize: 13, fontWeight: 800, cursor: "pointer", background: "rgba(232,118,45,.06)" }}>
        <Ico d={ICO.camara} size={18} /> {procesando ? "Procesando…" : item.foto2 || f.foto2 ? "Cambiar foto de la caja" : "Agregar foto de la caja"}
        <input type="file" accept="image/*" style={{ display: "none" }} disabled={procesando} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setProcesando(true); try { u("foto2", { dataUrl: await comprimirFoto(file), name: file.name }); } catch (err) { alert(err?.message || err); } finally { setProcesando(false); } }} />
      </label>
    </div>}
    {item.tipo === "caja"
      ? <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
        <Input label="Qué trae la caja *" value={f.contenido} onChange={e => u("contenido", e.target.value)} />
        <Input label="Marca" value={f.cajaMarca} onChange={e => u("cajaMarca", e.target.value)} />
        <div style={{ display: "flex", gap: 6, alignItems: "end", flexWrap: "wrap" }}>{TAMANOS_CAJA.map(([k, l]) => pillBtn(l, f.tamano === k, () => u("tamano", f.tamano === k ? "" : k), { key: k }))}</div>
        <Input label="Cuántas caben (capacidad)" type="number" min="1" value={f.capacidad} onChange={e => u("capacidad", e.target.value)} />
      </div>
      : <Input label="Nombre *" value={f.nombre} onChange={e => u("nombre", e.target.value)} />}
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><div style={LBL}>Categoría</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{CATEGORIAS.map(c => pillBtn(c.corto, f.categoria === c.id, () => u("categoria", c.id), { key: c.id }))}</div><div style={{ fontSize: 11.5, color: "var(--text-3)" }}>El código no cambia aunque cambie la categoría.</div></div>
    {item.tipo === "cantidad" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><Input label="Unidad" list="inv-unidades-e" value={f.unidad} onChange={e => u("unidad", e.target.value)} /><datalist id="inv-unidades-e">{UNIDADES.map(x => <option key={x} value={x} />)}</datalist><Input label="Estante" value={f.estante} onChange={e => u("estante", e.target.value)} /></div>}
    {esHer && item.tipo === "individual" && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}><div style={{ display: "flex", gap: 6, alignItems: "end" }}>{TIPOS_HERRAMIENTA.map(t => pillBtn(t.label, f.herrTipo === t.id, () => u("herrTipo", t.id), { key: t.id }))}</div><Input label="Diámetro" value={f.diametro} onChange={e => u("diametro", e.target.value)} /></div>}
    {item.tipo === "individual" && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}><Input label="Marca" value={f.marca} onChange={e => u("marca", e.target.value)} /><Input label="Modelo" value={f.modelo} onChange={e => u("modelo", e.target.value)} /><Input label="N° de serie" value={f.serie} onChange={e => u("serie", e.target.value)} /></div>}
    <Textarea label="Nota" value={f.notas} onChange={e => u("notas", e.target.value)} style={{ minHeight: 56 }} />
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={onClose} disabled={ocupado}>Cancelar</Btn><Btn disabled={ocupado || procesando} onClick={() => { if (item.tipo === "caja" ? !String(f.contenido).trim() : !String(f.nombre).trim()) return alert(item.tipo === "caja" ? "Escribí qué trae la caja." : "Escribí el nombre."); onSave(f); }}>{ocupado ? "Guardando…" : "Guardar cambios"}</Btn></div>
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
// QR de una ubicación / estante / nivel (modal) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function QRImpl({ codigo, titulo, subtitulo, onImprimir, extraBoton, onClose }) {
  const [qr, setQr] = useState(null);
  useEffect(() => { let vivo = true; qrDataUrl(urlDeFicha(codigo), 360).then(d => { if (vivo) setQr(d); }).catch(() => {}); return () => { vivo = false; }; }, [codigo]);
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
    <div style={{ font: "800 20px/1.2 var(--display)", color: CHARCOAL }}>{titulo}</div>
    {subtitulo && <div style={{ fontSize: 13, color: "var(--text-2)" }}>{subtitulo}</div>}
    <div style={{ padding: 14, background: "#fff", borderRadius: 18, boxShadow: "0 0 0 1px rgba(44,42,40,.08)" }}>{qr ? <img src={qr} alt={`QR ${codigo}`} style={{ width: 230, height: 230, display: "block" }} /> : <div style={{ width: 230, height: 230 }} />}</div>
    <div style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 18, color: CHARCOAL }}>{codigo}</div>
    <div style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 320 }}>Pegalo afuera. Al escanearlo con la cámara del celular se abre GeoInventory directo acá.</div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
      {onImprimir && <Btn onClick={onImprimir}><Ico d={ICO.imprimir} size={15} /> Imprimir etiqueta</Btn>}
      {extraBoton}
      <Btn variant="ghost" onClick={onClose}>Cerrar</Btn>
    </div>
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
  // Enlace profundo del QR: #inv=HER-0001 (artículo) · UBI-0003 (ubicación) ·
  // EST-0002 (estante/rack) · EST-0002-N3 (nivel) → abre lo que corresponde.
  useEffect(() => {
    if (!loaded || !hashRef.current) return;
    const c = hashRef.current;
    hashRef.current = null;
    try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch {}
    abrirCodigo(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, items]);

  // ── Derivados ──
  const proyectos = (() => {
    const base = new Set(CANONICAL_PROJECTS.map(p => p.short)); const out = [];
    CANONICAL_PROJECTS.forEach(p => { const x = customProjects.find(c => c.short === p.short); if (x?.hidden || x?.deleted) return; out.push({ ...p, ...(x || {}) }); });
    customProjects.forEach(c => { if (base.has(c.short) || c.hidden || c.deleted) return; out.push(c); });
    return out;
  })();
  const ubicaciones = ubicacionesDe({ guardadas: ubicGuardadas, proyectos });
  // Dónde puede MANIPULAR este usuario (Óscar: Almacén Central + donde es responsable)
  const editables = new Set(perms.alcance === "propias" ? ubicaciones.filter(u2 => u2.id === "almacen" || (u2.responsable && u2.responsable === userKey)).map(u2 => u2.id) : ubicaciones.map(u2 => u2.id));
  const puedeEn = (ubId) => !!perms.cargar && (perms.alcance !== "propias" || editables.has(ubId));
  const ubicacionesMias = ubicaciones.filter(u2 => puedeEn(u2.id));
  const estantes = estantesDe(ubicGuardadas);
  // Inicio = navegación por ubicaciones (14-oct-2026): ubicación › estante/rack › nivel
  const [ruta, setRutaRaw] = useState({});                 // {ubic, est, niv}
  const setRuta = (r) => { setRutaRaw(r || {}); try { document.getElementById("inv-scroll")?.scrollTo({ top: 0 }); } catch {} };
  // Grupos plegables de Inicio (14-oct-2026: "permitime minimizar proyectos,
  // oficinas y almacén"). Preferencia de pantalla → localStorage.
  const [cerrados, setCerradosRaw] = useState(() => { try { return JSON.parse(localStorage.getItem("gt-inv-grupos-cerrados") || "[]"); } catch { return []; } });
  const toggleGrupo = (k) => setCerradosRaw(p => { const n = p.includes(k) ? p.filter(x => x !== k) : [...p, k]; try { localStorage.setItem("gt-inv-grupos-cerrados", JSON.stringify(n)); } catch {} return n; });
  const [movUbic, setMovUbic] = useState("");
  const [qUbic, setQUbic] = useState("");
  const anchoGrande = !useIsMobile(1000);
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
  const crearArticulos = async (defs, { fotoDe = null, foto = null, foto2De = null } = {}) => {
    let fotoRef = fotoDe || null;
    if (foto?.dataUrl) { try { fotoRef = await subirFoto(foto); } catch (e) { alert(e.message); return null; } }
    let foto2Ref = foto2De || null;
    if (defs[0]?.foto2?.dataUrl) { try { foto2Ref = await subirFoto(defs[0].foto2); } catch (e) { alert(e.message); return null; } }
    const at = new Date().toISOString();
    return guardarItems((arr) => {
      const nuevos = [], movsN = [], ids = [];
      const porPrefijo = {};
      defs.forEach(d => {
        const cat = categoriaDe(d.categoria);
        const n = d.tipo === "individual" ? Math.max(1, Math.round(num(d.iguales || d.cantidad || 1))) : d.tipo === "caja" ? Math.max(1, Math.round(num(d.cajas || 1))) : 1;
        const prefijo = d.tipo === "caja" ? PREFIJO_CAJA : cat.prefijo;
        const codigos = siguientesCodigos([...arr, ...nuevos], prefijo, n);
        porPrefijo[prefijo] = (porPrefijo[prefijo] || 0) + n;
        // el estante tiene que ser de ESA ubicación (la memoria del form puede traer uno de otra)
        const estanteId = d.estanteId && estantesDe(ubicGuardadas, d.ubicacionId).some(e => e.id === d.estanteId) ? d.estanteId : "";
        for (let k = 0; k < n; k++) {
          const base = { id: uid(), codigo: codigos[k], tipo: d.tipo, nombre: String(d.nombre).trim(), categoria: cat.id, foto: d.fotoRef !== undefined ? d.fotoRef : fotoRef, marca: d.marca || "", modelo: d.modelo || "", serie: n > 1 ? "" : (d.serie || ""), notas: d.notas || "", createdAt: at, createdBy: userKey, createdByNombre: userName, updatedAt: at };
          const it = d.tipo === "caja"
            ? { ...base, ...(foto2Ref ? { foto2: foto2Ref } : {}), marca: "", nombre: nombreCaja({ contenido: String(d.contenido || d.nombre).trim(), marca: d.cajaMarca || d.marca || "", tamano: d.tamano || "" }), ubicacionId: d.ubicacionId, estanteId, nivel: estanteId ? String(d.nivel || "1") : "", caja: { contenido: String(d.contenido || d.nombre).trim(), marca: d.cajaMarca || d.marca || "", tamano: d.tamano || "", cantidad: num(d.capacidad || d.cantidad), capacidad: num(d.capacidad || d.cantidad) } }
            : d.tipo === "individual"
            ? { ...base, ubicacionId: d.ubicacionId, estanteId, nivel: estanteId ? String(d.nivel || "1") : "", estado: d.estado || estadoInicial(cat.id), asignadoA: k === 0 ? (d.asignadoA || "") : "", asignadoNombre: k === 0 ? (d.asignadoNombre || "") : "", ...(cat.id === "herramientas_perforacion" ? { herramienta: { tipo: d.herrTipo || d.herramienta?.tipo || "broca", diametro: String(d.diametro || d.herramienta?.diametro || "").trim() } } : {}) }
            : { ...base, unidad: String(d.unidad || "Unidad").trim(), estante: d.estante || "", stock: { [d.ubicacionId]: num(d.cantidad) }, ...(estanteId ? { posiciones: { [d.ubicacionId]: { estanteId, nivel: String(d.nivel || "1") } } } : {}) };
          nuevos.push(it); ids.push(it.id);
          movsN.push({ id: uid(), at, ...quien(), itemId: it.id, codigo: it.codigo, nombre: it.nombre, accion: "crear", a: d.ubicacionId, cantidad: d.tipo === "cantidad" ? num(d.cantidad) : d.tipo === "caja" ? num(d.capacidad || d.cantidad) : 1, ...(d.tipo === "caja" ? { contenido: it.caja.contenido } : {}) });
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
    let foto2Ref;
    if (f.foto2?.dataUrl) { try { foto2Ref = await subirFoto(f.foto2); } catch (e) { alert(e.message); return; } }
    const cambios = item.tipo === "caja"
      ? (() => { const c = { ...(item.caja || {}), contenido: String(f.contenido).trim(), marca: String(f.cajaMarca || "").trim(), tamano: f.tamano || "", capacidad: Math.max(num(f.capacidad), num(item.caja?.cantidad)) || num(item.caja?.cantidad) }; return { nombre: nombreCaja(c), categoria: f.categoria, caja: c, notas: f.notas, ...(fotoRef ? { foto: fotoRef } : {}), ...(foto2Ref ? { foto2: foto2Ref } : {}) }; })()
      : { nombre: String(f.nombre).trim(), categoria: f.categoria, marca: f.marca, modelo: f.modelo, serie: f.serie, notas: f.notas, ...(item.tipo === "cantidad" ? { unidad: String(f.unidad || "Unidad").trim(), estante: f.estante } : {}), ...(fotoRef ? { foto: fotoRef } : {}), ...(f.categoria === "herramientas_perforacion" && item.tipo === "individual" ? { herramienta: { tipo: f.herrTipo, diametro: String(f.diametro).trim() } } : {}) };
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
        : { id: `of:${uid()}`, tipo: "oficina", nombre: String(f.nombre).trim(), codigo: siguientesCodigos(arr, PREFIJO_UBIC)[0], responsable: f.responsable || "", responsableNombre: f.responsableNombre || "", activa: true, createdAt: at, createdBy: userKey, updatedAt: at };
      if (!ubicacion && arr.some(x => x.tipo === "oficina" && x.activa !== false && String(x.nombre).trim().toLowerCase() === rec.nombre.toLowerCase())) { alert("Ya hay una oficina con ese nombre."); return; }
      const next = arr.some(x => x.id === rec.id) ? arr.map(x => x.id === rec.id ? rec : x) : [...arr, rec];
      const ok = await store.set(K_UBIC, next); if (!ok) throw new Error("La nube no aceptó el guardado.");
      const back = await store.getCloud(K_UBIC);
      if (!(Array.isArray(back) ? back : []).some(x => x.id === rec.id && x.updatedAt === at)) throw new Error("La nube no confirmó el guardado.");
      setUbicGuardadas(back);
      // Oficina nueva: de una vez su QR para pegarlo afuera
      if (!ubicacion && rec.codigo) setModal({ t: "qr", codigo: rec.codigo, titulo: rec.nombre, subtitulo: "Oficina", grande: { codigo: rec.codigo, titulo: rec.nombre, subtitulo: "Oficina" } });
      else setModal(null);
    } catch (e) { alert((e?.message || e) + "\n\nNo se guardó."); }
    finally { setOcupado(false); }
  };
  // Estantes (viven en inv-ubicaciones como tipo "estante"): mismo guardado robusto
  const guardarRegistroUbic = async (rec, { prefijoCodigo = "" } = {}) => {
    if (ocupado) return null; setOcupado(true);
    try {
      const c = await store.getCloud(K_UBIC); const arr = Array.isArray(c) ? c : [];
      const at = new Date().toISOString();
      const full = { ...(arr.find(x => x.id === rec.id) || { createdAt: at, createdBy: userKey }), ...rec, updatedAt: at, updatedBy: userKey };
      if (prefijoCodigo && !full.codigo) full.codigo = siguientesCodigos(arr, prefijoCodigo)[0];
      const next = arr.some(x => x.id === full.id) ? arr.map(x => x.id === full.id ? full : x) : [...arr, full];
      const ok = await store.set(K_UBIC, next); if (!ok) throw new Error("La nube no aceptó el guardado.");
      const back = await store.getCloud(K_UBIC);
      if (!(Array.isArray(back) ? back : []).some(x => x.id === full.id && x.updatedAt === at)) throw new Error("La nube no confirmó el guardado.");
      setUbicGuardadas(back); return full;
    } catch (e) { alert((e?.message || e) + "\n\nNo se guardó."); return null; }
    finally { setOcupado(false); }
  };
  const nuevoEstante = async (ubicacionId, { nombre, niveles, mueble = "estante" }) => {
    const n = String(nombre || "").trim(); if (!n) { alert("Escribí el nombre."); return null; }
    if (estantesDe(ubicGuardadas, ubicacionId).some(e => e.nombre.toLowerCase() === n.toLowerCase())) { alert("Ya hay uno con ese nombre acá."); return null; }
    const rec = await guardarRegistroUbic({ id: `est:${uid()}`, tipo: "estante", mueble, ubicacionId, nombre: n, niveles: Math.min(12, Math.max(1, Math.round(num(niveles) || 4))), orden: estantesDe(ubicGuardadas, ubicacionId).length + 1, activa: true }, { prefijoCodigo: PREFIJO_EST });
    return rec?.id || null;
  };
  const guardarEstante = async (e, ubicacionId, f) => {
    if (!e) { const id = await nuevoEstante(ubicacionId, f); if (id) setModal(null); return; }
    const niveles = Math.min(12, Math.max(1, Math.round(num(f.niveles) || e.niveles || 4)));
    const fuera = itemsEnEstante(vivos, e).filter(i => num(posicionDe(i, e.ubicacionId).nivel) > niveles);
    if (fuera.length) return alert(`Hay ${fuera.length} artículo(s) en niveles arriba del ${niveles}. Movelos primero.`);
    const rec = await guardarRegistroUbic({ ...e, nombre: String(f.nombre).trim() || e.nombre, mueble: f.mueble || e.mueble || "estante", niveles }, { prefijoCodigo: PREFIJO_EST });
    if (rec) setModal(null);
  };
  const quitarEstante = async (e) => {
    const enEl = itemsEnEstante(vivos, e).length;
    if (enEl) return alert(`${e.nombre} tiene ${enEl} artículo(s). Movelos primero.`);
    if (!confirm(`¿Quitar ${e.nombre}?`)) return;
    const rec = await guardarRegistroUbic({ ...e, activa: false });
    if (rec) setRuta({ ubic: e.ubicacionId });
  };
  // Códigos UBI/EST bajo demanda: las ubicaciones fijas y los proyectos no
  // tienen registro hasta que alguien les pone responsable o pide su QR.
  // Devuelve la lista FRESCA de inv-ubicaciones (o null si no se pudo).
  const asegurarCodigos = async ({ ubicIds = [], estIds = [] } = {}) => {
    const faltanU = ubicIds.filter(id => !ubicaciones.find(x => x.id === id)?.codigo);
    const faltanE = estIds.filter(id => !estantes.find(x => x.id === id)?.codigo);
    if (!faltanU.length && !faltanE.length) return ubicGuardadas;
    if (!perms.imprimir || faltanU.some(id => !puedeEn(id)) || faltanE.some(id => !puedeEn(estantes.find(x => x.id === id)?.ubicacionId))) { alert("Todavía no tiene código. Lo genera su responsable (o Gerson, la Lic. Carolina o Ana)."); return null; }
    if (ocupado) return null; setOcupado(true);
    try {
      const c = await store.getCloud(K_UBIC); const arr = Array.isArray(c) ? c.map(x => ({ ...x })) : [];
      const at = new Date().toISOString();
      faltanU.forEach(id => {
        const i = arr.findIndex(x => x.id === id);
        if (i >= 0 && arr[i].codigo) return;
        const codigo = siguientesCodigos(arr, PREFIJO_UBIC)[0];
        if (i >= 0) arr[i] = { ...arr[i], codigo, updatedAt: at, updatedBy: userKey };
        else arr.push({ id, tipo: ubicaciones.find(x => x.id === id)?.tipo || "", codigo, createdAt: at, createdBy: userKey, updatedAt: at, updatedBy: userKey });
      });
      faltanE.forEach(id => { const i = arr.findIndex(x => x.id === id); if (i < 0 || arr[i].codigo) return; arr[i] = { ...arr[i], codigo: siguientesCodigos(arr, PREFIJO_EST)[0], updatedAt: at, updatedBy: userKey }; });
      const ok = await store.set(K_UBIC, arr); if (!ok) throw new Error("La nube no aceptó el guardado.");
      const back = await store.getCloud(K_UBIC); const lista = Array.isArray(back) ? back : [];
      if ([...faltanU, ...faltanE].some(id => !lista.find(x => x.id === id)?.codigo)) throw new Error("La nube no confirmó los códigos.");
      setUbicGuardadas(lista); return lista;
    } catch (e) { alert((e?.message || e) + "\n\nNo se generó el código."); return null; }
    finally { setOcupado(false); }
  };
  const subUbic = (u) => u.tipo === "proyecto" ? (u.nombreLargo && u.nombreLargo.toLowerCase() !== String(u.nombre).toLowerCase() ? u.nombreLargo : "Proyecto") : TIPO_UBICACION[u.tipo] || "";
  const verQRUbicacion = async (u) => {
    let codigo = u.codigo;
    if (!codigo) { const back = await asegurarCodigos({ ubicIds: [u.id] }); if (!back) return; codigo = ubicacionesDe({ guardadas: back, proyectos }).find(x => x.id === u.id)?.codigo; }
    if (codigo) setModal({ t: "qr", codigo, titulo: u.nombre, subtitulo: subUbic(u), grande: { codigo, titulo: u.nombre, subtitulo: subUbic(u) } });
  };
  const verQREstante = async (e, nivel = "") => {
    let est = e;
    if (!est.codigo) { const back = await asegurarCodigos({ estIds: [e.id] }); if (!back) return; est = estantesDe(back).find(x => x.id === e.id) || e; }
    if (!est.codigo) return;
    const ubN = nombreUbicacion(ubicaciones, est.ubicacionId);
    if (nivel) { const codigo = codigoNivel(est, nivel); return setModal({ t: "qr", codigo, titulo: `${est.nombre} · Nivel ${nivel}`, subtitulo: ubN, chica: { codigo, nombre: `${est.nombre} · Nivel ${nivel}`, ubicacionNombre: ubN } }); }
    setModal({ t: "qr", codigo: est.codigo, titulo: est.nombre, subtitulo: `${ubN} · ${muebleLabel(est)} de ${est.niveles} niveles`, grande: { codigo: est.codigo, titulo: est.nombre, subtitulo: `${ubN} · ${muebleLabel(est)}` }, estanteId: est.id });
  };
  /** PDF: etiqueta grande de cada estante/rack + una chica por cada nivel. */
  const imprimirEstantes = async (lista, titulo) => {
    if (!lista.length) return;
    const back = await asegurarCodigos({ estIds: lista.map(e => e.id) }); if (!back) return;
    const ests = estantesDe(back).filter(e => lista.some(x => x.id === e.id));
    const ubN = (e) => nombreUbicacion(ubicaciones, e.ubicacionId);
    try { await generarEtiquetas({ grandes: ests.map(e => ({ codigo: e.codigo, titulo: e.nombre, subtitulo: `${ubN(e)} · ${muebleLabel(e)}` })), chicas: ests.flatMap(e => nivelesDe(e).map(n => ({ codigo: codigoNivel(e, n), nombre: `${e.nombre} · Nivel ${n}`, ubicacionNombre: ubN(e) }))) }, { titulo }); }
    catch (err) { alert("No pude generar el PDF: " + (err?.message || err)); }
  };
  const imprimirUbicaciones = async (lista, titulo) => {
    if (!lista.length) return;
    const back = await asegurarCodigos({ ubicIds: lista.map(u => u.id) }); if (!back) return;
    const ubs = ubicacionesDe({ guardadas: back, proyectos }).filter(u => lista.some(x => x.id === u.id));
    try { await generarEtiquetas({ grandes: ubs.map(u => ({ codigo: u.codigo, titulo: u.nombre, subtitulo: subUbic(u) })) }, { titulo }); }
    catch (err) { alert("No pude generar el PDF: " + (err?.message || err)); }
  };
  const importar = async (listos) => {
    const defs = listos.map(l => {
      if (l.tipo !== "caja") return { ...l, iguales: l.tipo === "individual" ? l.cantidad : 1, fotoRef: null };
      const est = l.estanteNombre ? estantesDe(ubicGuardadas, l.ubicacionId).find(e => e.nombre.toLowerCase() === l.estanteNombre.toLowerCase()) : null;
      return { ...l, fotoRef: null, estanteId: est?.id || "", nivel: est ? (l.nivel || "1") : "" };
    });
    const sinEstante = listos.filter(l => l.tipo === "caja" && l.estanteNombre && !defs.find(d => d === l)).length;
    const r = await crearArticulos(defs);
    if (r) { alert(r + (sinEstante ? `\n\n${sinEstante} caja(s) traían un estante que no existe: quedaron sin estante.` : "")); setModal(null); setSec("buscar"); }
  };
  const etiquetas = async (lista, titulo) => {
    if (!lista.length) return alert("No hay artículos para etiquetar.");
    if (lista.length > 240 && !confirm(`Son ${lista.length} etiquetas (${Math.ceil(lista.length / 24)} hojas). ¿Seguir?`)) return;
    try { await generarEtiquetasPDF(lista.map(i => ({ codigo: i.codigo, nombre: i.tipo === "caja" ? `${i.nombre} · ${fmtN(i.caja?.capacidad || i.caja?.cantidad)}` : i.nombre, ubicacionNombre: i.tipo === "caja" ? [nombreUbicacion(ubicaciones, i.ubicacionId), textoEstante(estantes, i)].filter(Boolean).join(" · ") : i.tipo === "individual" ? nombreUbicacion(ubicaciones, i.ubicacionId) : ubicacionesConStock(i).map(x => nombreUbicacion(ubicaciones, x.id)).join(", ") })), { titulo }); }
    catch (e) { alert("No pude generar el PDF: " + (e?.message || e)); }
  };
  const verFoto = async (ref) => { const d = await cargarFoto(ref?.fileId); if (!d) return alert("No se pudo cargar la foto."); setVisor({ name: ref.name || "foto.jpg", type: "image/jpeg", dataUrl: d }); };
  // Cualquier código (escaneado, tipeado o del lector USB) → lo que corresponde
  const abrirCodigo = (codigo) => {
    const r = resolverCodigo(codigo, { items, guardadas: ubicGuardadas, ubicaciones });
    if (!r) return alert(`No encontré ${codigo} en el inventario.`);
    if (r.tipo === "item") return setModal({ t: "ficha", id: r.item.id });
    setModal(null); setSec("inicio");
    if (r.tipo === "ubicacion") setRuta({ ubic: r.ubicacionId });
    else if (r.tipo === "estante") setRuta({ ubic: r.estante.ubicacionId, est: r.estante.id });
    else setRuta({ ubic: r.estante.ubicacionId, est: r.estante.id, niv: r.nivel });
  };
  const irAUbicacion = (id) => { setSec("inicio"); setRuta({ ubic: id }); };
  // Fuera del Vault, si lo último que se cargó fueron cajas, vuelve a "por cantidad"
  const agregarAqui = (ubicacionId, { estanteId = "", nivel = "", tipo } = {}) => { setUbicFija(ubicacionId); setUltimo(p => { const t = tipo || (p?.tipo === "caja" ? "cantidad" : p?.tipo); return { ...(p || {}), estanteId, nivel, ...(t ? { tipo: t, ...(t === "caja" ? { categoria: "insumos_perforacion" } : {}) } : {}) }; }); setSec("agregar"); };
  const nombreEstanteDe = (id) => estantes.find(e => e.id === id)?.nombre || "";
  const textoPosicion = (it, ubId) => { const p = posicionDe(it, ubId); const n = nombreEstanteDe(p.estanteId); return n ? `${n} · Nivel ${p.nivel}` : ""; };

  // ── Piezas de lista ──
  const filaItem = (it, { mostrarUbic = true } = {}) => {
    const enU = ubicacionesConStock(it);
    return <div key={it.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setModal({ t: "ficha", id: it.id })} onKeyDown={e => { if (e.key === "Enter") setModal({ t: "ficha", id: it.id }); }} style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
      <Foto foto={it.foto} size={52} radius={12} categoria={it.categoria} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 11.5, color: "var(--text-3)" }}>{it.codigo}</span>
          {it.tipo === "individual" ? chipEstado(it) : it.tipo === "caja" ? chipCaja(it) : null}
          {it.asignadoA && <Chip c={C_AZUL} style={{ fontSize: 11 }}>{it.asignadoNombre}</Chip>}
        </div>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.tipo === "caja" ? `Caja · ${it.nombre}` : it.nombre}</div>
        {mostrarUbic && <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.tipo === "caja" ? [nombreUbicacion(ubicaciones, it.ubicacionId), textoEstante(estantes, it)].filter(Boolean).join(" · ") : enU.length ? enU.map(x => [nombreUbicacion(ubicaciones, x.id), it.tipo === "cantidad" ? fmtN(x.cantidad) : "", textoPosicion(it, x.id)].filter(Boolean).join(" · ")).join(" | ") : "Sin existencias"}{it.maquinaNombre ? ` · en ${it.maquinaNombre}` : ""}</div>}
      </div>
      {it.tipo === "cantidad" && <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 18px/1 var(--display)", color: CHARCOAL }}>{fmtN(stockDe(it))}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>{it.unidad}</div></div>}
      {it.tipo === "caja" && <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 18px/1 var(--display)", color: C_NIVEL[nivelCaja(it.caja)].color }}>{fmtN(it.caja?.cantidad)}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>{String(it.caja?.contenido || "").toLowerCase()}s</div></div>}
    </div>;
  };

  // ── Pantallas ──
  // ═══════════════ INICIO: ubicaciones como tarjetas de vidrio ═══════════════
  // 14-oct-2026 (Gerson): "en Inicio a cada responsable le sale su ubicación
  // en una cajita de vidrio; a mí, la Lic., Óscar y Ana todas; pico adentro y
  // veo su inventario; si tiene estantes, cajitas con los estantes; entro a uno
  // y salen los niveles; entro al nivel y salen las cajitas".
  const ICO_UBIC = { almacen: ICO.bodega, vault: ICO.estante, taller: ICO.taller, oficina: ICO.oficina, proyecto: ICO.proyecto };
  const resumenTxt = (r) => [r.articulos ? `${r.articulos} artículo${r.articulos === 1 ? "" : "s"}` : "", ...r.enCajas.slice(0, 2).map(x => `${fmtN(x.unidades)} ${x.contenido.toLowerCase()}${x.unidades === 1 ? "" : "s"}`), r.herramientas ? `${r.herramientas} herr.` : ""].filter(Boolean).join(" · ");
  const migas = (partes) => <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 13 }}>
    <button type="button" className="gt-circulo" onClick={partes[partes.length - 2]?.[1] || (() => setRuta({}))} aria-label="Atrás" style={{ width: 34, height: 34, fontSize: 15, marginRight: 4 }}>←</button>
    {partes.map(([t, fn], i) => <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {i > 0 && <Ico d={ICO.flecha} size={13} color="rgba(44,42,40,.35)" />}
      {fn && i < partes.length - 1 ? <button type="button" onClick={fn} style={{ background: "none", border: "none", padding: 0, color: "var(--text-3)", font: "700 13px/1 var(--sans)", cursor: "pointer" }}>{t}</button> : <span style={{ color: CHARCOAL, font: "800 13px/1 var(--sans)" }}>{t}</span>}
    </span>)}
  </div>;
  const chipCodigo = (codigo, onClick) => <button type="button" onClick={onClick} title="Ver / imprimir el QR" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "800 11.5px/1 var(--mono)", cursor: "pointer" }}><Ico d={ICO.qr} size={14} />{codigo || "QR"}</button>;
  const tarjetaUbicacion = (u2, { destacada } = {}) => {
    const r = resumenDe(itemsEnUbicacion(vivos, u2.id));
    const ests = estantesDe(ubicGuardadas, u2.id);
    const resp = usuarios.find(x => x.username === u2.responsable);
    const vacia = r.articulos === 0;
    return <div key={u2.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => irAUbicacion(u2.id)} onKeyDown={e => { if (e.key === "Enter") irAUbicacion(u2.id); }}
      style={{ padding: isMobile ? 12 : 14, display: "flex", flexDirection: "column", gap: isMobile ? 8 : 10, cursor: "pointer", minHeight: 0, ...(destacada ? { boxShadow: `inset 0 0 0 1.5px ${ORANGE}55` } : {}) }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 13, background: vacia ? "rgba(44,42,40,.06)" : "rgba(232,118,45,.12)", color: vacia ? "#8C857D" : ORANGE_DARK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO_UBIC[u2.tipo] || ICO.ubicaciones} size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u2.nombre}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 3 }}>{resp ? resp.label : u2.responsableNombre || (u2.tipo === "proyecto" ? subUbic(u2) : "Sin responsable")}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 22px/1 var(--display)", color: vacia ? "rgba(44,42,40,.25)" : CHARCOAL }}>{r.articulos}</div><div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>artículos</div></div>
      </div>
      {(ests.length > 0 || r.enCajas.length > 0 || r.herramientas > 0 || (u2.codigo && !isMobile)) && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: "auto" }}>
        {ests.length > 0 && <Chip c={C_GRIS} style={{ fontSize: 11 }}>{ests.length} {ests.length === 1 ? muebleLabel(ests[0]).toLowerCase() : "estantes/racks"}</Chip>}
        {r.enCajas.slice(0, 2).map(x => <Chip key={x.contenido} c={C_NARANJA} style={{ fontSize: 11 }}>{fmtN(x.unidades)} {x.contenido.toLowerCase()}{x.unidades === 1 ? "" : "s"}</Chip>)}
        {r.herramientas > 0 && <Chip c={C_AZUL} style={{ fontSize: 11 }}>{r.herramientas} herr.</Chip>}
        {u2.codigo && <span style={{ marginLeft: "auto", font: "700 10.5px/1 var(--mono)", color: "var(--text-3)" }}>{u2.codigo}</span>}
      </div>}
    </div>;
  };
  const grilla = (children) => <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(270px, 1fr))", gap: 10 }}>{children}</div>;
  const tituloGrupo = (t, extra, clave) => <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
    <div className="gt-label" style={{ color: "var(--text-3)" }}>{t}</div>
    {extra}</div>;
  // Cabecera de grupo de Inicio: fila de vidrio grande, plegable (14-oct-2026:
  // "más grandes para que se vean cool; minimizados el vacío se veía feo")
  const cabeceraGrupo = ({ clave, titulo, n, icono, sub, extra }) => { const ab = abierto(clave); return <div key={clave} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} aria-expanded={ab} onClick={() => toggleGrupo(clave)} onKeyDown={e => { if (e.key === "Enter") toggleGrupo(clave); }}
    style={{ padding: isMobile ? "12px 14px" : "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", marginTop: 2 }}>
    <div style={{ width: 42, height: 42, borderRadius: 13, background: "rgba(232,118,45,.12)", color: ORANGE_DARK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={icono} size={21} /></div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ font: `800 ${isMobile ? 16 : 17.5}px/1.15 var(--display)`, color: CHARCOAL }}>{titulo}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{sub}</div>}
    </div>
    {extra && <span onClick={e => e.stopPropagation()}>{extra}</span>}
    <span style={{ minWidth: 34, height: 30, padding: "0 10px", borderRadius: 999, background: "rgba(44,42,40,.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 13px/1 var(--sans)", color: CHARCOAL }}>{n}</span>
    <span style={{ display: "inline-flex", transform: ab ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }}><Ico d={ICO.flecha} size={18} color="#8C857D" /></span>
  </div>; };
  const abierto = (k) => !cerrados.includes(k) || !!qUbic;
  const renderInicio = () => {
    if (ruta.ubic) return renderUbicacionVista();
    const mias = ubicaciones.filter(u2 => u2.responsable && u2.responsable === userKey);
    const noMia = (u2) => !mias.includes(u2) || !!qUbic;   // las tuyas van arriba, no se repiten
    const fijas = ubicaciones.filter(u2 => ["almacen", "vault", "taller"].includes(u2.tipo) && noMia(u2));
    const oficinas = ubicaciones.filter(u2 => u2.tipo === "oficina" && noMia(u2));
    const proys = ubicaciones.filter(u2 => u2.tipo === "proyecto" && noMia(u2));
    const proysCon = proys.filter(u2 => itemsEnUbicacion(vivos, u2.id).length > 0 || estantesDe(ubicGuardadas, u2.id).length > 0);
    const proysSin = proys.filter(u2 => !proysCon.includes(u2));
    const filtroU = (l) => qUbic.trim() ? l.filter(u2 => `${u2.nombre} ${u2.nombreLargo || ""} ${u2.codigo || ""}`.toLowerCase().includes(qUbic.toLowerCase())) : l;
    const statBtn = (n, label, c, onClick) => <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, padding: "4px 2px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}><span style={{ font: "800 17px/1 var(--display)", color: c?.color || CHARCOAL }}>{fmtN(n)}</span><span style={{ fontSize: 12, color: "var(--text-3)" }}>{label}</span></button>;
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
        <button type="button" onClick={() => setModal({ t: "escanear" })} style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minHeight: 50, padding: "0 20px", borderRadius: 16, border: "none", background: "#1D5FAF", color: "#fff", font: "800 14.5px/1 var(--sans)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: "0 10px 22px rgba(29,95,175,.25)" }}><Ico d={ICO.escanear} size={21} sw={2} /> Escanear QR</button>
        {perms.cargar && <button type="button" onClick={() => setSec("agregar")} style={{ flex: isMobile ? "1 1 0" : "0 0 auto", minHeight: 50, padding: "0 20px", borderRadius: 16, border: "none", background: ORANGE_DARK, color: "#fff", font: "800 14.5px/1 var(--sans)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: "0 10px 22px rgba(199,95,31,.25)" }}><Ico d={ICO.agregar} size={21} sw={2} /> Agregar</button>}
        <input value={qUbic} onChange={e => setQUbic(e.target.value)} enterKeyHint="go" onKeyDown={e => { if (e.key !== "Enter") return; const c = codigoDeTexto(qUbic); if (c) { setQUbic(""); abrirCodigo(c); } }} placeholder="Filtrar ubicaciones o escribir un código…" style={{ flex: isMobile ? "1 1 100%" : "1 1 220px", minHeight: 50, padding: "0 16px", borderRadius: 16, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.75)", fontSize: 14, outline: "none", fontFamily: "inherit" }} />
      </div>
      <div className="gt-vidrio" style={{ padding: "8px 14px", display: "flex", gap: isMobile ? 10 : 20, flexWrap: "wrap", alignItems: "center" }}>
        {statBtn(resumen.articulos, "artículos", null, () => { setQ(""); setFUbic(""); setFCat(""); setFEstado(""); setFTipo(""); setSec("buscar"); })}
        {resumen.cajas > 0 && statBtn(resumen.cajas, "cajas", C_NARANJA, () => { setFTipo("caja"); setFUbic(""); setFCat(""); setSec("buscar"); })}
        {statBtn(resumen.disponibles, "herr. disponibles", C_VERDE, () => { setHerrEstado("disponible"); setSec("herramientas"); })}
        {statBtn(resumen.enOperacion, "en operación", C_NARANJA, () => { setHerrEstado("en_operacion"); setSec("herramientas"); })}
        {statBtn(resumen.requierenTrabajo, "requieren trabajo", C_ROJO, () => { setHerrEstado("requiere_trabajo"); setSec("herramientas"); })}
        {statBtn(resumen.asignados, "asignados a personas", C_AZUL, () => { setFTipo("individual"); setFCat(""); setFUbic(""); setFEstado(""); setQ(""); setSec("buscar"); })}
      </div>
      {mias.length > 0 && !qUbic && <>{cabeceraGrupo({ clave: "mias", titulo: "Tus ubicaciones", n: mias.length, icono: ICO.persona, sub: "Donde sos responsable" })}{abierto("mias") && grilla(mias.map(u2 => tarjetaUbicacion(u2, { destacada: true })))}</>}
      {filtroU(fijas).length > 0 && <>{cabeceraGrupo({ clave: "fijas", titulo: "Almacén y bodegas", n: filtroU(fijas).length, icono: ICO.bodega, sub: resumenTxt(resumenDe(fijas.flatMap(u2 => itemsEnUbicacion(vivos, u2.id)))) || "Almacén Central, GeoDrill Vault y taller" })}{abierto("fijas") && grilla(filtroU(fijas).map(u2 => tarjetaUbicacion(u2)))}</>}
      {(filtroU(oficinas).length > 0 || (perms.ubicaciones && !qUbic)) && <>{cabeceraGrupo({ clave: "oficinas", titulo: "Oficinas de plantel", n: filtroU(oficinas).length, icono: ICO.oficina, sub: oficinas.length ? resumenTxt(resumenDe(oficinas.flatMap(u2 => itemsEnUbicacion(vivos, u2.id)))) || "Sin inventario todavía" : "Todavía no hay oficinas", extra: perms.ubicaciones && <Btn small variant="ghost" onClick={() => setModal({ t: "ubicacion", u: null })}>+ Nueva oficina</Btn> })}
        {abierto("oficinas") && (filtroU(oficinas).length ? grilla(filtroU(oficinas).map(u2 => tarjetaUbicacion(u2))) : <div style={{ fontSize: 12.5, color: "var(--text-3)", paddingLeft: 4 }}>Creá la primera con + Nueva oficina: cada una sale con su código QR para pegar afuera.</div>)}</>}
      {filtroU(proys).length > 0 && <>{cabeceraGrupo({ clave: "proyectos", titulo: "Proyectos", n: filtroU(proys).length, icono: ICO.proyecto, sub: proysCon.length ? `${proysCon.length} con inventario` : "Ninguno con inventario todavía" })}
        {abierto("proyectos") && grilla([...filtroU(proysCon), ...filtroU(proysSin)].map(u2 => tarjetaUbicacion(u2)))}</>}
    </div>;
  };
  // ── Dentro de una ubicación ──
  const renderUbicacionVista = () => {
    const u2 = ubicaciones.find(x => x.id === ruta.ubic);
    if (!u2) return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{migas([["Ubicaciones", () => setRuta({})], ["No encontrada"]])}<Vacio>Esa ubicación ya no existe.</Vacio></div>;
    const ests = estantesDe(ubicGuardadas, u2.id);
    if (ruta.est) { const e = ests.find(x => x.id === ruta.est); if (e) return ruta.niv ? renderNivelVista(u2, e, String(ruta.niv)) : renderEstanteVista(u2, e); }
    const aqui = itemsEnUbicacion(vivos, u2.id);
    const sueltos = ests.length ? itemsSinEstante(vivos, u2.id, ests) : aqui;
    const r = resumenDe(aqui);
    const resp = usuarios.find(x => x.username === u2.responsable);
    const movsAqui = movimientosDe(movs, u2.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const porCat = CATEGORIAS.map(c => [c, sueltos.filter(i => i.categoria === c.id)]).filter(([, l]) => l.length);
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {migas([["Ubicaciones", () => setRuta({})], [u2.nombre]])}
      <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(232,118,45,.12)", color: ORANGE_DARK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO_UBIC[u2.tipo] || ICO.ubicaciones} size={27} /></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ font: "800 21px/1.15 var(--display)", color: CHARCOAL }}>{u2.nombre}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>{subUbic(u2)} · {resp ? `responsable ${resp.label}` : "sin responsable"}{r.articulos ? ` · ${resumenTxt(r)}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(u2.codigo || puedeEn(u2.id)) && chipCodigo(u2.codigo || "Generar QR", () => verQRUbicacion(u2))}
          {puedeEn(u2.id) && <Btn small onClick={() => agregarAqui(u2.id, { tipo: u2.tipo === "vault" ? "caja" : undefined })}><Ico d={ICO.agregar} size={14} /> Agregar aquí</Btn>}
          {puedeEn(u2.id) && <Btn small variant="ghost" onClick={() => setModal({ t: "estante", e: null, ubicacionId: u2.id })}>+ Estante / rack</Btn>}
          {perms.cargar && !puedeEn(u2.id) && <Chip c={C_GRIS} style={{ fontSize: 11.5 }}>Solo lectura</Chip>}
          {perms.ubicaciones && <Btn small variant="ghost" onClick={() => setModal({ t: "ubicacion", u: u2 })}>Responsable</Btn>}
        </div>
      </div>
      {ests.length > 0 && <>
        {tituloGrupo(`Estantes y racks · ${ests.length}`, perms.imprimir && <Btn small variant="ghost" onClick={() => imprimirEstantes(ests, `estantes-${u2.nombre}`)}><Ico d={ICO.imprimir} size={13} /> QR de estantes y niveles</Btn>)}
        {grilla(ests.map(e => { const en = itemsEnEstante(vivos, e); const re = resumenDe(en); return <div key={e.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setRuta({ ubic: u2.id, est: e.id })} onKeyDown={ev => { if (ev.key === "Enter") setRuta({ ubic: u2.id, est: e.id }); }} style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", minHeight: 112 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(44,42,40,.06)", color: "#5C5853", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO.estante} size={22} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL }}>{e.nombre}</div><div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>{muebleLabel(e)} · {e.niveles} niveles</div></div>
            <div style={{ textAlign: "right" }}><div style={{ font: "800 22px/1 var(--display)", color: en.length ? CHARCOAL : "rgba(44,42,40,.25)" }}>{en.length}</div><div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>{re.cajas && re.cajas === en.length ? "cajas" : "artículos"}</div></div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: "auto" }}>
            {re.enCajas.slice(0, 2).map(x => <Chip key={x.contenido} c={C_NARANJA} style={{ fontSize: 11 }}>{fmtN(x.unidades)} {x.contenido.toLowerCase()}{x.unidades === 1 ? "" : "s"}</Chip>)}
            {e.codigo && <span style={{ marginLeft: "auto", font: "700 10.5px/1 var(--mono)", color: "var(--text-3)" }}>{e.codigo}</span>}
          </div>
        </div>; }))}
      </>}
      {tituloGrupo(ests.length ? `Fuera de estante · ${sueltos.length}` : `Inventario · ${aqui.length}`, perms.imprimir && sueltos.length > 0 && <Btn small variant="ghost" onClick={() => etiquetas(sueltos, u2.nombre)}><Ico d={ICO.imprimir} size={13} /> Etiquetas ({sueltos.length})</Btn>)}
      {sueltos.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{ests.length ? "Todo está en sus estantes." : puedeEn(u2.id) ? "Vacío. Tocá Agregar aquí y empezá con la foto." : "Vacío."}</div>
        : porCat.map(([c, l]) => <div key={c.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, color: "#6E6862" }}><Ico d={ICO[c.id]} size={14} />{c.label} · {l.length}</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>{l.map(it => filaItem(it, { mostrarUbic: false }))}</div>
        </div>)}
      {movsAqui.length > 0 && <div className="gt-vidrio" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div className="gt-label" style={{ color: "var(--text-3)" }}>Movimientos de aquí</div><button type="button" onClick={() => { setMovUbic(u2.id); setSec("movimientos"); }} style={{ background: "none", border: "none", color: ORANGE_DARK, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>Ver todos →</button></div>
        {movsAqui.slice(0, 6).map(m => <div key={m.id} style={{ display: "flex", gap: 10, fontSize: 12.5, alignItems: "baseline", flexWrap: "wrap" }}><span style={{ fontFamily: "var(--mono)", color: "var(--text-3)", fontSize: 11, whiteSpace: "nowrap" }}>{fmtDT(m.at)}</span><span style={{ flex: 1, minWidth: 160 }}><b>{ACCIONES[m.accion] || m.accion}</b> · {m.nombre} · {textoMovimiento(m, ubicaciones)}</span><span style={{ color: "var(--text-3)", fontSize: 11.5 }}>{m.byName || m.by}</span></div>)}
      </div>}
    </div>;
  };
  // ── Dentro de un estante / rack: sus niveles ──
  const renderEstanteVista = (u2, e) => {
    const en = itemsEnEstante(vivos, e);
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {migas([["Ubicaciones", () => setRuta({})], [u2.nombre, () => setRuta({ ubic: u2.id })], [e.nombre]])}
      <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(44,42,40,.06)", color: "#5C5853", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO.estante} size={27} /></div>
        <div style={{ flex: 1, minWidth: 200 }}><div style={{ font: "800 21px/1.15 var(--display)", color: CHARCOAL }}>{e.nombre}</div><div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>{muebleLabel(e)} de {e.niveles} niveles · {u2.nombre}{en.length ? ` · ${resumenTxt(resumenDe(en))}` : ""}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(e.codigo || puedeEn(u2.id)) && chipCodigo(e.codigo || "Generar QR", () => verQREstante(e))}
          {perms.imprimir && (e.codigo || puedeEn(u2.id)) && <Btn small variant="ghost" onClick={() => imprimirEstantes([e], e.nombre)}><Ico d={ICO.imprimir} size={13} /> QR del {muebleLabel(e).toLowerCase()} y niveles</Btn>}
          {puedeEn(u2.id) && <Btn small variant="ghost" onClick={() => setModal({ t: "estante", e, ubicacionId: u2.id })}>Editar</Btn>}
          {perms.ubicaciones && <Btn small variant="danger" onClick={() => quitarEstante(e)}>Quitar</Btn>}
        </div>
      </div>
      {grilla(nivelesDe(e).map(n => { const l = itemsEnNivel(vivos, e, n); const rn = resumenDe(l); return <div key={n} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setRuta({ ubic: u2.id, est: e.id, niv: n })} onKeyDown={ev => { if (ev.key === "Enter") setRuta({ ubic: u2.id, est: e.id, niv: n }); }} style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", minHeight: 84 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: l.length ? "rgba(232,118,45,.12)" : "rgba(44,42,40,.05)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em", color: "var(--text-3)" }}>NIVEL</span><span style={{ font: "800 22px/1 var(--display)", color: l.length ? ORANGE_DARK : "rgba(44,42,40,.3)" }}>{n}</span></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: l.length ? CHARCOAL : "var(--text-3)" }}>{l.length ? `${l.length} ${rn.cajas === l.length ? (l.length === 1 ? "caja" : "cajas") : (l.length === 1 ? "artículo" : "artículos")}` : "Vacío"}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rn.enCajas.map(x => `${fmtN(x.unidades)} ${x.contenido.toLowerCase()}${x.unidades === 1 ? "" : "s"}`).join(" · ") || (l.length ? l.slice(0, 2).map(i => i.nombre).join(" · ") : codigoNivel(e, n))}</div>
        </div>
        <Ico d={ICO.flecha} size={18} color="rgba(44,42,40,.3)" />
      </div>; }))}
    </div>;
  };
  // ── Dentro de un nivel: las cajitas y lo que haya ──
  const tarjetaCaja = (c) => { const n = nivelCaja(c.caja); const col = C_NIVEL[n]; const cap = num(c.caja?.capacidad || c.caja?.cantidad) || 1; const pct = Math.max(0, Math.min(1, num(c.caja?.cantidad) / cap));
    return <div key={c.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setModal({ t: "ficha", id: c.id })} onKeyDown={ev => { if (ev.key === "Enter") setModal({ t: "ficha", id: c.id }); }} style={{ padding: 12, display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}>
      <Foto foto={c.foto} size={58} radius={13} categoria={c.categoria} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 11.5, color: "var(--text-3)" }}>{c.codigo}</span>{c.caja?.marca && <span style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.caja.marca}</span>}</div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.caja?.contenido}{c.caja?.tamano ? ` ${tamanoLabel(c.caja.tamano).toLowerCase()}` : ""}</div>
        <div style={{ height: 6, borderRadius: 99, background: "rgba(44,42,40,.08)", overflow: "hidden" }}><div style={{ width: `${pct * 100}%`, height: "100%", background: col.color, borderRadius: 99 }} /></div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 22px/1 var(--display)", color: col.color }}>{fmtN(c.caja?.cantidad)}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>de {fmtN(cap)}</div></div>
    </div>; };
  const renderNivelVista = (u2, e, n) => {
    const l = itemsEnNivel(vivos, e, n).sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
    const cajas = l.filter(i => i.tipo === "caja"), otros = l.filter(i => i.tipo !== "caja");
    const rn = resumenDe(l);
    const niveles = nivelesDe(e);
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {migas([["Ubicaciones", () => setRuta({})], [u2.nombre, () => setRuta({ ubic: u2.id })], [e.nombre, () => setRuta({ ubic: u2.id, est: e.id })], [`Nivel ${n}`]])}
      <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 54, height: 54, borderRadius: 16, background: "rgba(232,118,45,.12)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em", color: "var(--text-3)" }}>NIVEL</span><span style={{ font: "800 24px/1 var(--display)", color: ORANGE_DARK }}>{n}</span></div>
        <div style={{ flex: 1, minWidth: 180 }}><div style={{ font: "800 20px/1.15 var(--display)", color: CHARCOAL }}>{e.nombre} · Nivel {n}</div><div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>{u2.nombre}{l.length ? ` · ${resumenTxt(rn)}` : " · vacío"}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(e.codigo || puedeEn(u2.id)) && chipCodigo(e.codigo ? codigoNivel(e, n) : "Generar QR", () => verQREstante(e, n))}
          {puedeEn(u2.id) && <Btn small onClick={() => agregarAqui(u2.id, { estanteId: e.id, nivel: n, tipo: u2.tipo === "vault" ? "caja" : undefined })}><Ico d={ICO.agregar} size={14} /> Agregar aquí</Btn>}
          {perms.imprimir && l.length > 0 && <Btn small variant="ghost" onClick={() => etiquetas(l, `${e.nombre}-nivel-${n}`)}><Ico d={ICO.imprimir} size={13} /> Etiquetas ({l.length})</Btn>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{niveles.map(x => pillBtn(`Nivel ${x}`, x === n, () => setRuta({ ubic: u2.id, est: e.id, niv: x }), { key: x, c: "#6E6862" }))}</div>
      {l.length === 0 && <Vacio>Nivel vacío.{puedeEn(u2.id) ? " Tocá Agregar aquí: la ubicación, el estante y el nivel ya van puestos." : ""}</Vacio>}
      {cajas.length > 0 && grilla(cajas.map(tarjetaCaja))}
      {otros.length > 0 && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 8 }}>{otros.map(it => filaItem(it, { mostrarUbic: false }))}</div>}
    </div>;
  };
  const renderAgregar = () => <AgregarFormImpl ubicaciones={ubicacionesMias} ubicFija={ubicFija} setUbicFija={setUbicFija} items={vivos} emps={emps} estantes={estantes} onNuevoEstante={perms.cargar ? nuevoEstante : null} ocupado={ocupado} isMobile={isMobile} dosColumnas={anchoGrande} ultimo={ultimo} setUltimo={setUltimo}
    onGuardar={(d, { fotoDe, foto2De }) => crearArticulos([d], { fotoDe, foto2De, foto: d.foto })} onSumar={sumarExistente} />;
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
          {pillBtn("Cajas", fTipo === "caja", () => setFTipo(fTipo === "caja" ? "" : "caja"), { c: CHARCOAL })}
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
  // ── UBICACIONES (administración): código/QR, responsable, oficinas ──
  const renderUbicaciones = () => {
    const grupos = [["Almacén y bodegas", ubicaciones.filter(u2 => ["almacen", "vault", "taller"].includes(u2.tipo))], ["Oficinas de plantel", ubicaciones.filter(u2 => u2.tipo === "oficina")], ["Proyectos", ubicaciones.filter(u2 => u2.tipo === "proyecto")]];
    const noProyectos = ubicaciones.filter(u2 => u2.tipo !== "proyecto");
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: isMobile ? 10 : 14, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", flex: "1 1 260px" }}>Cada ubicación, estante y nivel tiene su <b>código y QR</b>: pegalo afuera y al escanearlo se abre lo que hay adentro.</div>
        {perms.imprimir && <Btn small variant="ghost" onClick={() => imprimirUbicaciones(noProyectos, "almacen-bodegas-oficinas")}><Ico d={ICO.imprimir} size={13} /> QR de almacén, bodegas y oficinas</Btn>}
        {perms.ubicaciones && <Btn small onClick={() => setModal({ t: "ubicacion", u: null })}>+ Nueva oficina</Btn>}
      </div>
      {grupos.map(([titulo, lista]) => <div key={titulo} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>{titulo} · {lista.length}</div>
        {lista.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{titulo.startsWith("Oficinas") ? "Todavía no hay oficinas." : "—"}</div>}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(360px, 1fr))", gap: 6 }}>
          {lista.map(u2 => { const n = itemsEnUbicacion(vivos, u2.id).length; const ne = estantesDe(ubicGuardadas, u2.id).length; const resp = usuarios.find(x => x.username === u2.responsable); return <div key={u2.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => irAUbicacion(u2.id)} onKeyDown={e => { if (e.key === "Enter") irAUbicacion(u2.id); }} style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(232,118,45,.10)", color: ORANGE_DARK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO_UBIC[u2.tipo] || ICO.ubicaciones} size={17} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u2.nombre}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resp ? resp.label : u2.responsableNombre || "Sin responsable"} · {n} artículo{n === 1 ? "" : "s"}{ne ? ` · ${ne} estante${ne === 1 ? "" : "s"}` : ""}</div>
            </div>
            <span onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(u2.codigo || puedeEn(u2.id)) && chipCodigo(u2.codigo || "QR", () => verQRUbicacion(u2))}
              {perms.ubicaciones && <button type="button" onClick={() => setModal({ t: "ubicacion", u: u2 })} title="Responsable / editar" style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.7)", cursor: "pointer", color: "var(--text-2)", fontSize: 14, fontFamily: "inherit" }}>✎</button>}
            </span>
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
    const lista = (movUbic ? movimientosDe(movs, movUbic) : [...movs]).filter(m => !movQ || `${m.codigo} ${m.nombre} ${m.byName} ${m.motivo || ""}`.toLowerCase().includes(movQ.toLowerCase())).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const porDia = {}; lista.forEach(m => { const d = diaDe(m.at); (porDia[d] = porDia[d] || []).push(m); });
    const cargarMesAnterior = async () => { const ultimo = mesesMov[mesesMov.length - 1]; const [y, mo] = ultimo.replace("inv-mov-", "").split("-").map(Number); const prev = keyMovimientos(new Date(y, mo - 2, 1).toISOString()); setMesesMov(p => [...p, prev]); try { const c = await store.getCloud(prev); setMovs(p => [...p, ...(Array.isArray(c) ? c : [])]); } catch {} };
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: isMobile ? 10 : 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={movUbic} onChange={e => setMovUbic(e.target.value)} style={{ ...CTRL, width: "auto", minHeight: 44, borderRadius: 999, maxWidth: 260, fontWeight: 700 }}><option value="">Todas las ubicaciones</option>{ubicaciones.map(u2 => <option key={u2.id} value={u2.id}>{u2.nombre}</option>)}</select>
        <Buscador value={movQ} onChange={setMovQ} placeholder="Buscar por artículo, código o persona" /><span style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>{lista.length}</span>
      </div>
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
    if (m.t === "ficha") { const it = items.find(i => i.id === m.id); if (!it) return null; return <Modal title={it.codigo} onClose={() => setModal(null)} wide><FichaImpl item={it} ubicaciones={ubicaciones} emps={emps} maquinas={maquinas} estantes={estantes} perms={perms} puedeEn={puedeEn} ocupado={ocupado} isMobile={isMobile} movs={movs} verFoto={verFoto} onAccion={accionSobre} onEditar={(it2) => setModal({ t: "editar", id: it2.id })} onEliminar={eliminarArticulo} onEtiqueta={(it2) => etiquetas([it2], it2.codigo)} /></Modal>; }
    if (m.t === "editar") { const it = items.find(i => i.id === m.id); if (!it) return null; return <Modal title={`Editar ${it.codigo}`} onClose={() => setModal({ t: "ficha", id: it.id })}><EditarFormImpl item={it} ocupado={ocupado} isMobile={isMobile} onSave={(f) => editarArticulo(it, f)} onClose={() => setModal({ t: "ficha", id: it.id })} /></Modal>; }
    if (m.t === "ubicacion") return <Modal title={m.u ? `${m.u.nombre}` : "Nueva oficina"} onClose={() => setModal(null)}><UbicacionFormImpl ubicacion={m.u} usuarios={usuarios} ocupado={ocupado} onSave={(f) => guardarUbicacion(m.u, f)} onClose={() => setModal(null)} /></Modal>;
    if (m.t === "importar") return <Modal title="Importar desde Excel" onClose={() => setModal(null)} wide><ImportarFormImpl ubicaciones={ubicacionesMias} ubicFija={ubicFija} emps={emps} ocupado={ocupado} onImportar={importar} onClose={() => setModal(null)} /></Modal>;
    if (m.t === "escanear") return <Modal title="Escanear" onClose={() => setModal(null)}><EscanerImpl onCodigo={(c) => { setModal(null); abrirCodigo(c); }} onClose={() => setModal(null)} /></Modal>;
    if (m.t === "estante") return <Modal title={m.e ? `Editar ${m.e.nombre}` : "Nuevo estante / rack"} onClose={() => setModal(null)}><EstanteFormImpl estante={m.e} ubicacionNombre={nombreUbicacion(ubicaciones, m.ubicacionId)} ocupado={ocupado} onSave={(f) => guardarEstante(m.e, m.ubicacionId, f)} onClose={() => setModal(null)} /></Modal>;
    if (m.t === "qr") { const est = m.estanteId ? estantes.find(x => x.id === m.estanteId) : null; return <Modal title="Código QR" onClose={() => setModal(null)}><QRImpl codigo={m.codigo} titulo={m.titulo} subtitulo={m.subtitulo} onClose={() => setModal(null)}
      onImprimir={perms.imprimir ? async () => { try { await generarEtiquetas(m.grande ? { grandes: [m.grande] } : { chicas: [m.chica] }, { titulo: m.codigo }); } catch (err) { alert("No pude generar el PDF: " + (err?.message || err)); } } : null}
      extraBoton={est && perms.imprimir ? <Btn variant="ghost" onClick={() => imprimirEstantes([est], est.nombre)}>Con sus {est.niveles} niveles</Btn> : null} /></Modal>; }
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
      {nav.map(x => { const active = secOk === x.id; return <button key={x.id} onClick={() => { if (x.id === "inicio" && secOk === "inicio") setRuta({}); setSec(x.id); }} style={{ padding: isMobile ? "12px 13px" : "14px 18px", background: "transparent", border: "none", boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none", color: active ? "var(--naranja-tinta)" : "var(--text-3)", font: `${active ? 800 : 600} 13px/1 var(--sans)`, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{x.label}</button>; })}
    </div>
    <div id="inv-scroll" style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "10px 12px 24px" : "14px 32px 28px" }}>
        {secOk === "inicio" ? renderInicio() : secOk === "agregar" ? renderAgregar() : secOk === "buscar" ? renderBuscar() : secOk === "ubicaciones" ? renderUbicaciones() : secOk === "herramientas" ? renderHerramientas() : renderMovimientos()}
      </div>
    </div>
    {renderModal()}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}
