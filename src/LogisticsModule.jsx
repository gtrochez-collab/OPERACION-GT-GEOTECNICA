// =====================================================================
// GeoLogistics — Flota, mantenimientos, combustible, motoristas y despachos
// =====================================================================
// REDISEÑO COMPLETO (17-nov-2026, Gerson: "se quedó con la apariencia de
// antes; que sea un mega módulo de una empresa logística; cada carro con su
// ficha bien hecha; consumo de combustible; motoristas de GeoTeam; despachos
// en cajitas de vidrio como GeoShopping, no kanban; pocos textos").
//
// Pestañas: Dashboard · Despachos · Flota · Mantenimientos · Motoristas.
// · Flota = carnets de vidrio por vehículo → FICHA (foto, datos, documentos,
//   próximo servicio, rendimiento) con su historial de mantenimientos,
//   cargas de combustible, pendientes y despachos.
// · Combustible (NUEVO, `lg-combustible`): cargas con odómetro, galones,
//   monto y "tanque lleno"; el rendimiento (km por galón) sale por el método
//   de tanque lleno (logistica-calc.js, con pruebas).
// · Motoristas = los de GeoTeam por cargo + los que se agreguen a mano
//   (`lg-motoristas`: licencia y vencimiento).
// · Despachos = bandeja agrupada por proyecto (filas de vidrio compactables),
//   misma lógica de siempre: candado de ficha, subir ficha firmada, EPP.
//
// Storage: lg-vehicles · lg-maintenances · lg-combustible · lg-motoristas ·
// lg-despachos (compartido con GeoShopping/GeoMachinery/GeoSafety) ·
// cp-purchases / mq-purchases (fichas) · cp-projects · hr-emps5 (lectura).
// TODA escritura: getCloud → cambio sobre lo fresco → set → verify.
// =====================================================================

import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { store } from "./supabase.js";
import Logo from "./Logo.jsx";
import { GT_CSS } from "./gt-ui.js";
import { generateFichaPDF, restoreFiles } from "./PurchasesModule.jsx";
import { VisorArchivo } from "./visor-archivo.jsx";
import { hoyISO } from "./fechas.js";
import { ROLE_LABEL } from "./users.js";
import { MOVIL_CSS, BarraMovil, BarraInferior, TituloMovil, PantallaCarga, TiraMovil } from "./movil.jsx";
import { Input, Select, Textarea, Btn, Chip, Modal, C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, ORANGE, ORANGE_DARK, CHARCOAL, useIsMobile, fmtFecha } from "./geocost-ui.jsx";
import {
  diasEntre, rendimientoCombustible, gastoCombustiblePorMes, estadoPreventivo, ORDEN_URGENCIA, proximoKmSugerido,
  intervaloKmDe, vencimiento, parsePendientes, quitarLinea, alertasVehiculo, listaMotoristas, urgenciaDespacho,
  vistaDeDespacho, entregasPorMes, ultimosMeses,
  NIVELES_COMBUSTIBLE, usoAbierto, ultimoKmBitacora, validarSalida, validarLlegada,
} from "./logistica-calc.js";

const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.10)" };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const nf0 = (n) => Math.round(Number(n) || 0).toLocaleString("es-HN");
const nf1 = (n) => (Number(n) || 0).toLocaleString("es-HN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtL = (n) => `L ${(Number(n) || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCorto = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `L ${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `L ${(v / 1e3).toFixed(v >= 1e4 ? 0 : 1)}k` : `L ${nf0(v)}`; };
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesLabel = (ym) => { const [y, m] = String(ym).split("-").map(Number); return `${MES_CORTO[m - 1] || ""} ${String(y).slice(2)}`; };
const fechaCorta = (iso) => { if (!iso) return "—"; const [, m, d] = String(iso).slice(0, 10).split("-").map(Number); return `${d} ${MES_CORTO[m - 1] || ""}`; };
const masDias = (iso, n) => { const [y, m, d] = String(iso).split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
const leerLS = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
const escribirLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage */ } };

// ── Íconos de línea (monocromos, currentColor) ──
const ICO = {
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 4v4h6V4z",
  camion: "M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  llave: "M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  ruta: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h4M18 9v6a4 4 0 0 1-4 4h-4",
  persona: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  gota: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z",
  mas: "M12 5v14M5 12h14",
  flecha: "M9 6l6 6-6 6",
  alerta: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M5 12l5 5L20 7",
  doc: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5",
  camara: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  subir: "M12 16V4M7 9l5-5 5 5M4 20h16",
  ojo: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  lapiz: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  basura: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  licencia: "M3 6h18v12H3zM7 10h4M7 14h6M15 10h2",
  velocimetro: "M12 14l4-4M4 18a9 9 0 1 1 16 0",
};
const Ico = ({ d, size = 18, color = "currentColor", sw = 1.8 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><path d={d} /></svg>;

// Silueta del vehículo según el tipo (cuando no tiene foto)
const Silueta = ({ tipo = "", size = 96, color = "#8C857D" }) => {
  const t = String(tipo).toLowerCase();
  const sw = 3;
  if (t.includes("moto")) return <svg width={size} height={size * 0.62} viewBox="0 0 160 100" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="34" cy="70" r="20" /><circle cx="126" cy="70" r="20" /><path d="M34 70l26-28h34l14 28M60 42l-8-12h-12M94 42l14-14h12M76 42l-6 28h56" /></svg>;
  if (!t.includes("pickup") && (t.includes("cami") || t.includes("cabezal"))) return <svg width={size} height={size * 0.62} viewBox="0 0 160 100" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 22h88v50H8zM96 38h30l22 20v14H96z" /><path d="M106 44h16l12 12h-28z" /><circle cx="32" cy="76" r="11" /><circle cx="74" cy="76" r="11" /><circle cx="126" cy="76" r="11" /></svg>;
  return <svg width={size} height={size * 0.62} viewBox="0 0 160 100" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M8 70V52l10-4h44l16-18h38l16 18h12l8 6v16z" /><path d="M66 48l12-14h30l10 14z" /><circle cx="38" cy="72" r="12" /><circle cx="124" cy="72" r="12" /></svg>;
};

// Placa estilo Honduras (blanca, banda superior)
const Placa = ({ plate, grande = false }) => {
  const s = grande ? 1.35 : 1;
  return <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", background: "#fff", border: "1.5px solid rgba(44,42,40,.75)", borderRadius: 6 * s, overflow: "hidden", boxShadow: "0 1px 0 rgba(44,42,40,.12)", minWidth: 92 * s }}>
    <div style={{ width: "100%", background: CHARCOAL, color: "#fff", font: `700 ${6.5 * s}px/1 var(--mono)`, letterSpacing: ".3em", textAlign: "center", padding: `${2.5 * s}px 0` }}>HONDURAS</div>
    <div style={{ font: `800 ${15 * s}px/1 var(--mono)`, letterSpacing: ".08em", color: CHARCOAL, padding: `${4 * s}px ${10 * s}px ${5 * s}px`, whiteSpace: "nowrap" }}>{plate || "—"}</div>
  </div>;
};

// Curvas de nivel de la franja del carnet (las del login, calculadas una vez)
const curvasDe = (W, H, N, M, seed, niveles, nivelNaranja) => {
  const perm = (() => { const p = [...Array(256).keys()]; let sd = seed; for (let i = 255; i > 0; i--) { sd = (sd * 16807) % 2147483647; const j = sd % (i + 1); [p[i], p[j]] = [p[j], p[i]]; } const o = new Uint8Array(512); for (let i = 0; i < 512; i++) o[i] = p[i & 255]; return o; })();
  const fade = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), X = xi & 255, Y = yi & 255, xf = x - xi, yf = y - yi; const h = (a, b) => perm[perm[(X + a) & 255] + ((Y + b) & 255)] / 255; const u = fade(xf), v = fade(yf); return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v; };
  const f = (x, y) => n2(x, y) * .6 + n2(x * 2.1 + 7.3, y * 2.1 + 3.1) * .3 + n2(x * 4.4 + 1.7, y * 4.4 + 9.2) * .1;
  const g = []; for (let j = 0; j <= M; j++) { g[j] = []; for (let i = 0; i <= N; i++) g[j][i] = f(i * 0.11, j * 0.19); }
  const cw = W / N, ch = H / M;
  const nivel = (lv) => {
    let d = "";
    const lerp = (a, b, va, vb) => (lv - va) / (vb - va || 1e-9) * (b - a) + a;
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const a = g[j][i], b = g[j][i + 1], c = g[j + 1][i + 1], dd = g[j + 1][i];
      const x0 = i * cw, x1 = (i + 1) * cw, y0 = j * ch, y1 = (j + 1) * ch;
      const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (dd > lv ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const T = [lerp(x0, x1, a, b), y0], R = [x1, lerp(y0, y1, b, c)], B = [lerp(x0, x1, dd, c), y1], L = [x0, lerp(y0, y1, a, dd)];
      const seg = { 1: [L, B], 2: [B, R], 3: [L, R], 4: [T, R], 5: [T, L, B, R], 6: [T, B], 7: [T, L], 8: [T, L], 9: [T, B], 10: [T, R, L, B], 11: [T, R], 12: [L, R], 13: [B, R], 14: [L, B] }[idx];
      for (let k = 0; k < seg.length; k += 2) d += `M${seg[k][0].toFixed(1)} ${seg[k][1].toFixed(1)}L${seg[k + 1][0].toFixed(1)} ${seg[k + 1][1].toFixed(1)}`;
    }
    return d;
  };
  return { tenues: niveles.map(nivel).join(""), naranja: nivelNaranja != null ? nivel(nivelNaranja) : "", W, H };
};
const curvasFranja = curvasDe(240, 70, 56, 17, 20261117, [.34, .40, .46, .52, .58, .64], .49);
const CURVAS_FRANJA = <svg viewBox={`0 0 ${curvasFranja.W} ${curvasFranja.H}`} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
  <path d={curvasFranja.tenues} fill="none" stroke="rgba(232,118,45,.30)" strokeWidth=".7" strokeLinecap="round" />
  <path d={curvasFranja.naranja} fill="none" stroke="rgba(232,118,45,.9)" strokeWidth="1" strokeLinecap="round" />
</svg>;

// ── Constantes ──
const TIPOS_VEHICULO = ["Pickup / Camioneta", "Camion / Cabezal", "Motocicleta"];
const TIPO_CORTO = { "Pickup / Camioneta": "Pickup", "Camion / Cabezal": "Camión", "Motocicleta": "Moto" };
const ESTADOS_VEHICULO = [
  { value: "operativo", label: "Disponible", c: C_VERDE, dot: "#3E8E5A" },
  { value: "asignado", label: "En proyecto", c: C_AZUL, dot: "#1D5FAF" },
  { value: "mantenimiento", label: "En mantenimiento", c: C_AMARILLO, dot: "#C99A06" },
  { value: "reparacion", label: "En reparación", c: C_NARANJA, dot: ORANGE },
  { value: "fuera_servicio", label: "Fuera de servicio", c: C_ROJO, dot: "#B03024" },
];
const estadoCfg = (v) => ESTADOS_VEHICULO.find(s => s.value === v) || ESTADOS_VEHICULO[0];
const enTaller = (v) => v.estado === "mantenimiento" || v.estado === "reparacion";
const PROPIETARIOS = ["Subterra Honduras", "Geotecnica Soluciones", "Alquilado", "Otro"];
const COMBUSTIBLES = ["Diésel", "Gasolina"];

const TIPOS_MANT = [
  { value: "preventivo", label: "Preventivo", c: C_VERDE },
  { value: "correctivo", label: "Correctivo", c: C_AMARILLO },
  { value: "emergencia", label: "Emergencia", c: C_ROJO },
];
const tipoMantCfg = (v) => TIPOS_MANT.find(t => t.value === v) || TIPOS_MANT[1];

const TIPOS_DESPACHO = [
  { value: "material_compra", label: "Material de compra", corto: "Compra", defaultOrigen: "", defaultDestino: "Proyecto" },
  { value: "material_plantel_proyecto", label: "Material: Plantel → Proyecto", corto: "Plantel → Proyecto", defaultOrigen: "Plantel", defaultDestino: "Proyecto" },
  { value: "material_proyecto_plantel", label: "Material: Proyecto → Plantel", corto: "Proyecto → Plantel", defaultOrigen: "Proyecto", defaultDestino: "Plantel" },
  { value: "material_proyecto_proyecto", label: "Material: Proyecto → Proyecto", corto: "Entre proyectos", defaultOrigen: "", defaultDestino: "" },
  { value: "personal", label: "Personal", corto: "Personal", defaultOrigen: "", defaultDestino: "" },
  { value: "equipo_maquinaria", label: "Equipo / Maquinaria", corto: "Equipo", defaultOrigen: "", defaultDestino: "" },
  { value: "repuesto_maquinas", label: "Repuesto de máquinas", corto: "Repuesto", defaultOrigen: "", defaultDestino: "Proyecto" },
  { value: "otro", label: "Otro", corto: "Otro", defaultOrigen: "", defaultDestino: "" },
];
const tipoDespCfg = (v) => TIPOS_DESPACHO.find(t => t.value === v) || TIPOS_DESPACHO[TIPOS_DESPACHO.length - 1];
const ESTADOS_DESPACHO = [
  { value: "pendiente", label: "Por hacer", c: C_NARANJA },
  { value: "programado", label: "Programado", c: C_AZUL },
  { value: "en_ruta", label: "En ruta", c: C_AMARILLO },
  { value: "entregado", label: "Entregado", c: C_VERDE },
  { value: "cerrado", label: "Cerrado", c: C_GRIS },
  { value: "cancelado", label: "Cancelado", c: C_ROJO },
];
const estadoDespCfg = (v) => ESTADOS_DESPACHO.find(s => s.value === v) || ESTADOS_DESPACHO[0];
const origenDespacho = (d) => d.source === "maquinas" ? { label: "GeoMachinery", c: C_GRIS } : d.source === "compra" ? { label: "GeoShopping", c: C_GRIS } : d.source === "epp" ? { label: "EPP", c: C_AMARILLO } : { label: "Interno", c: C_GRIS };
const URG_C = { atrasado: C_ROJO, hoy: C_NARANJA, manana: C_NARANJA, pronto: C_AMARILLO, ok: C_GRIS };
const URG_P = { vencido: { c: C_ROJO, bar: "#C0392B" }, pronto: { c: C_NARANJA, bar: ORANGE }, ok: { c: C_VERDE, bar: "#3E8E5A" }, sin_plan: { c: C_GRIS, bar: "#B8B1A8" } };
const LICENCIAS = ["Liviana", "Pesada", "Motocicleta", "Profesional"];

// Ficha de entrega de la compra (para llevar al proveedor): los archivos viven
// en cp-file-*; restoreFiles los hidrata antes de armar el PDF.
const COMPANIES_MAP = { subterra: { name: "Subterra Honduras" }, geotecnica: { name: "Geotecnica Soluciones" } };
const descargarFichaCompra = async (purchase, allProjects) => {
  const proj = allProjects.find(p => p.short === purchase.projectCode) || null;
  const companyName = COMPANIES_MAP[purchase.company]?.name || "";
  const [hydrated] = await restoreFiles([purchase]);
  await generateFichaPDF(hydrated || purchase, proj, companyName);
};

// ── VUELO DEL CARNET (27-nov-2026, Gerson: "el efecto de GeoTeam, que la ficha
// se viene de la pantalla a la foto"). El carnet chico vuela desde su lugar en
// la flota hasta el carnet grande de la ficha girando sobre su eje (frente =
// el carnet chico, dorso = el grande), como CarnetVolteo de GeoTeam. Al volver
// hace el viaje al revés. Sin backdrop-filter mientras viaja (era el tirón en
// GeoTeam) y respeta prefers-reduced-motion.
const VUELO_CSS = `.lg-viaje .gt-vidrio{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;background:#fff!important;box-shadow:none!important}
@keyframes lgFichaEntra{from{opacity:0;transform:translateY(14px)}}
.lg-ficha-entra{animation:lgFichaEntra 620ms cubic-bezier(.22,1,.36,1) 260ms backwards}
@media (prefers-reduced-motion:reduce){.lg-ficha-entra{animation:none}}`;
const prefiereQuieto = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
function VueloCarnet({ desde, hasta, frente, dorso, alReves = false, onFin }) {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    // setTimeout y no requestAnimationFrame: con la pestaña en segundo plano el rAF se pausa y el carnet quedaba quieto.
    const t0 = setTimeout(() => setListo(true), 34);
    const t = setTimeout(onFin, alReves ? 880 : 980);
    return () => { clearTimeout(t0); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const W = hasta.width, s = desde.width / W;
  const enOrigen = alReves ? listo : !listo;
  const curva = alReves ? "cubic-bezier(.65,0,.35,1)" : "cubic-bezier(.22,1,.36,1)";
  const dur = alReves ? 800 : 900;
  const cara = { position: "absolute", left: 0, top: 0, width: W, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", borderRadius: 22, overflow: "hidden", background: "#fff", boxShadow: "0 30px 80px rgba(28,26,24,.26), 0 0 0 1px rgba(44,42,40,.07)" };
  return createPortal(<div className="lg-viaje" style={{ position: "fixed", inset: 0, zIndex: 900, pointerEvents: "none" }}>
    <style>{GT_CSS}{VUELO_CSS}</style>
    <div style={{ position: "absolute", left: hasta.left, top: hasta.top, width: W, height: enOrigen ? desde.height / s : hasta.height, transformOrigin: "top left", transform: enOrigen ? `translate(${desde.left - hasta.left}px, ${desde.top - hasta.top}px) scale(${s})` : "none", transition: `transform ${dur}ms ${curva}, height ${dur}ms ${curva}`, perspective: 1600, willChange: "transform" }}>
      <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d", transform: enOrigen ? "rotateY(0deg)" : "rotateY(180deg)", transition: `transform ${dur + 60}ms ${curva}`, willChange: "transform" }}>
        <div style={{ ...cara, height: "100%" }}>{frente}</div>
        <div style={{ ...cara, height: "100%", transform: "rotateY(180deg)" }}>{dorso}</div>
      </div>
    </div>
  </div>, document.body);
}

// Foto JPEG comprimida (≤ maxPx) — como GeoInventory
const comprimirImagen = (file, maxPx = 900) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onerror = () => reject(new Error("No se pudo leer la foto"));
  r.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error("La foto no se pudo abrir"));
    img.onload = () => {
      const k = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.78));
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
});

// Cache de fotos (vehículos y colaboradores) — cp-file-<id>
const FOTOS = new Map();
const Foto = ({ fileId, alt = "", style: sx, fallback = null }) => {
  const [src, setSrc] = useState(fileId ? FOTOS.get(fileId) || null : null);
  useEffect(() => {
    let vivo = true;
    if (!fileId) { setSrc(null); return; }
    if (FOTOS.has(fileId)) { setSrc(FOTOS.get(fileId)); return; }
    (async () => { try { const f = await store.get(`cp-file-${fileId}`); if (f?.dataUrl) { FOTOS.set(fileId, f.dataUrl); if (vivo) setSrc(f.dataUrl); } } catch { /* sin foto */ } })();
    return () => { vivo = false; };
  }, [fileId]);
  if (!src) return fallback;
  return <img src={src} alt={alt} style={{ display: "block", objectFit: "cover", ...sx }} />;
};
const iniciales = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
const Avatar = ({ emp, size = 44, radio = 14 }) => <div style={{ width: size, height: size, borderRadius: radio, overflow: "hidden", background: "rgba(44,42,40,.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#6E6862", font: `800 ${size * 0.34}px/1 var(--display)` }}>
  <Foto fileId={emp?.photo?.fileId} alt={emp?.fullName} style={{ width: size, height: size }} fallback={<span>{iniciales(emp?.fullName)}</span>} />
</div>;

// Control segmentado estilo iOS
const Segmentado = ({ opciones, valor, onChange }) => <div style={{ display: "inline-flex", alignSelf: "flex-start", flexWrap: "wrap", gap: 2, padding: 3, borderRadius: 12, background: "rgba(44,42,40,.07)" }}>
  {opciones.map(o => { const v = typeof o === "string" ? o : o.value; const l = typeof o === "string" ? o : o.label; const on = v === valor; return <button key={v} type="button" onClick={() => onChange(v)} style={{ padding: "7px 13px", borderRadius: 9, border: "none", background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 3px rgba(44,42,40,.14)" : "none", color: on ? CHARCOAL : "#6E6862", font: `${on ? 800 : 600} 12.5px/1 var(--sans)`, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>; })}
</div>;
const Seccion = ({ titulo, children }) => <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
  <div className="gt-label" style={{ color: "var(--text-3)" }}>{titulo}</div>
  {children}
</div>;
const grid = (cols, gap = 12) => ({ display: "grid", gridTemplateColumns: cols, gap });
const Pie = ({ onCancel, onSave, txt, guardando }) => <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, borderTop: "1px solid rgba(44,42,40,.08)", marginTop: 4 }}>
  <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
  <Btn onClick={onSave} disabled={guardando}>{guardando ? "Guardando…" : txt}</Btn>
</div>;
const useCelu = () => typeof window !== "undefined" && window.innerWidth < 768;

// ═════════════════════════ FORMULARIOS (nivel de módulo) ═════════════════════════
function VehiculoForm({ vehicle, proyectos, motoristas, onCancel, onSave }) {
  const celu = useCelu();
  const [f, setF] = useState(() => ({
    plate: "", type: "Pickup / Camioneta", brand: "", model: "", year: "", color: "", owner: "Geotecnica Soluciones",
    combustible: "Diésel", vin: "", motor: "", kmActual: "", estado: "operativo", projectCode: "", motorista: "", motoristaEmpId: "",
    mantIntervaloKm: "", proxMantenimientoKm: "", proxMantenimientoFecha: "", pendientesReparacion: "",
    seguro: "", seguroPoliza: "", seguroVence: "", revisionVence: "", notas: "",
    ...(vehicle || {}),
  }));
  const [guardando, setGuardando] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const c3 = celu ? "1fr 1fr" : "1fr 1fr 1fr";
  const opcMot = motoristas.map(m => ({ value: m.emp.id, label: m.emp.fullName }));
  return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    <Seccion titulo="Identificación">
      <Segmentado opciones={TIPOS_VEHICULO.map(t => ({ value: t, label: TIPO_CORTO[t] }))} valor={f.type} onChange={v => u("type", v)} />
      <div style={grid(c3)}>
        <Input label="Placa *" value={f.plate} onChange={e => u("plate", e.target.value.toUpperCase())} placeholder="HAA1234" />
        <Input label="Marca" value={f.brand} onChange={e => u("brand", e.target.value)} placeholder="Toyota" />
        <Input label="Modelo" value={f.model} onChange={e => u("model", e.target.value)} placeholder="Hilux" />
        <Input label="Año" type="number" value={f.year || ""} onChange={e => u("year", e.target.value)} />
        <Input label="Color" value={f.color} onChange={e => u("color", e.target.value)} />
        <Select label="Propietario" options={PROPIETARIOS} value={f.owner} onChange={e => u("owner", e.target.value)} />
        <Select label="Combustible" options={COMBUSTIBLES} value={f.combustible} onChange={e => u("combustible", e.target.value)} />
        <Input label="VIN / chasis" value={f.vin} onChange={e => u("vin", e.target.value.toUpperCase())} />
        <Input label="Motor" value={f.motor} onChange={e => u("motor", e.target.value.toUpperCase())} />
      </div>
    </Seccion>
    <Seccion titulo="Dónde está">
      <Segmentado opciones={ESTADOS_VEHICULO} valor={f.estado} onChange={v => u("estado", v)} />
      <div style={grid(celu ? "1fr" : "1fr 1fr")}>
        <Select label="Proyecto" options={proyectos.map(p => ({ value: p.short, label: p.short }))} value={f.projectCode} onChange={e => u("projectCode", e.target.value)} emptyLabel="Sin asignar" />
        <Select label="Motorista" options={opcMot} value={f.motoristaEmpId || ""} onChange={e => { const m = motoristas.find(x => x.emp.id === e.target.value); setF(p => ({ ...p, motoristaEmpId: e.target.value, motorista: m ? m.emp.fullName : "" })); }} emptyLabel={f.motorista && !f.motoristaEmpId ? f.motorista : "Sin motorista"} />
      </div>
    </Seccion>
    <Seccion titulo="Kilometraje y servicio">
      <div style={grid(celu ? "1fr 1fr" : "1fr 1fr 1fr 1fr")}>
        <Input label="Km actual" type="number" value={f.kmActual || ""} onChange={e => u("kmActual", e.target.value)} />
        <Input label="Servicio cada (km)" type="number" value={f.mantIntervaloKm || ""} onChange={e => u("mantIntervaloKm", e.target.value)} placeholder="5000" />
        <Input label="Próximo servicio (km)" type="number" value={f.proxMantenimientoKm || ""} onChange={e => u("proxMantenimientoKm", e.target.value)} />
        <Input label="O en fecha" type="date" value={f.proxMantenimientoFecha || ""} onChange={e => u("proxMantenimientoFecha", e.target.value)} />
      </div>
    </Seccion>
    <Seccion titulo="Documentos">
      <div style={grid(celu ? "1fr 1fr" : "1fr 1fr 1fr 1fr")}>
        <Input label="Aseguradora" value={f.seguro} onChange={e => u("seguro", e.target.value)} />
        <Input label="Póliza" value={f.seguroPoliza} onChange={e => u("seguroPoliza", e.target.value)} />
        <Input label="Seguro vence" type="date" value={f.seguroVence || ""} onChange={e => u("seguroVence", e.target.value)} />
        <Input label="Revisión vence" type="date" value={f.revisionVence || ""} onChange={e => u("revisionVence", e.target.value)} />
      </div>
    </Seccion>
    <Textarea label="Pendientes de reparación (uno por línea)" value={f.pendientesReparacion || ""} onChange={e => u("pendientesReparacion", e.target.value)} />
    <Textarea label="Notas" value={f.notas || ""} onChange={e => u("notas", e.target.value)} />
    <Pie onCancel={onCancel} guardando={guardando} txt={vehicle ? "Guardar cambios" : "Agregar vehículo"} onSave={async () => {
      if (!String(f.plate).trim()) return alert("La placa es obligatoria.");
      setGuardando(true);
      const ahora = new Date().toISOString();
      const rec = {
        ...f, plate: String(f.plate).toUpperCase().trim(), id: f.id || uid(),
        kmActual: Number(f.kmActual) || 0, year: Number(f.year) || null,
        mantIntervaloKm: Number(f.mantIntervaloKm) || null,
        proxMantenimientoKm: Number(f.proxMantenimientoKm) || null,
        updatedAt: ahora, createdAt: f.createdAt || ahora,
      };
      const ok = await onSave(rec);
      setGuardando(false);
      if (ok) onCancel();
    }} />
  </div>;
}

function MantForm({ vehicle, vehicles, prefill, onCancel, onSave }) {
  const celu = useCelu();
  const [f, setF] = useState(() => {
    const tipo = prefill?.tipo || "preventivo";
    const km = vehicle?.kmActual || "";
    return {
      vehicleId: vehicle?.id || "", type: tipo, fecha: hoyISO(), kmAlRealizar: km,
      description: prefill?.descripcion || "", workshop: "", cost: "",
      proxKm: tipo === "preventivo" && vehicle ? (proximoKmSugerido(vehicle, km) || "") : "", proxFecha: "", notas: "",
      rawLineToRemove: prefill?.rawLine || null,
    };
  });
  const [guardando, setGuardando] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const veh = vehicles.find(x => x.id === f.vehicleId);
  const recalcProx = (p) => (p.type === "preventivo" && veh ? (proximoKmSugerido(veh, p.kmAlRealizar) || "") : p.proxKm);
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <Segmentado opciones={TIPOS_MANT} valor={f.type} onChange={v => setF(p => { const n = { ...p, type: v }; return { ...n, proxKm: v === "preventivo" ? recalcProx(n) : p.proxKm }; })} />
    <div style={grid(celu ? "1fr 1fr" : "2fr 1fr 1fr")}>
      <Select label="Vehículo *" options={vehicles.map(v => ({ value: v.id, label: `${v.plate} · ${v.brand || ""} ${v.model || ""}` }))} value={f.vehicleId} onChange={e => { const v = vehicles.find(x => x.id === e.target.value); setF(p => { const n = { ...p, vehicleId: e.target.value, kmAlRealizar: v?.kmActual || p.kmAlRealizar }; return { ...n, proxKm: n.type === "preventivo" && v ? (proximoKmSugerido(v, n.kmAlRealizar) || "") : n.proxKm }; }); }} emptyLabel="Elegir" />
      <Input label="Fecha *" type="date" value={f.fecha} onChange={e => u("fecha", e.target.value)} />
      <Input label="Km" type="number" value={f.kmAlRealizar} onChange={e => setF(p => { const n = { ...p, kmAlRealizar: e.target.value }; return { ...n, proxKm: recalcProx(n) }; })} />
    </div>
    <Textarea label="Qué se le hizo *" value={f.description} onChange={e => u("description", e.target.value)} placeholder="Cambio de aceite y filtros" />
    <div style={grid("1fr 1fr")}>
      <Input label="Taller / mecánico" value={f.workshop} onChange={e => u("workshop", e.target.value)} />
      <Input label="Costo (L)" type="number" step="0.01" value={f.cost} onChange={e => u("cost", e.target.value)} />
    </div>
    <div style={{ padding: 14, borderRadius: 16, background: "rgba(44,42,40,.04)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="gt-label" style={{ color: "var(--text-3)" }}>Próximo servicio</div>
      <div style={grid("1fr 1fr")}>
        <Input label="A los (km)" hint={veh ? `cada ${nf0(intervaloKmDe(veh))} km` : ""} type="number" value={f.proxKm} onChange={e => u("proxKm", e.target.value)} />
        <Input label="O en fecha" type="date" value={f.proxFecha} onChange={e => u("proxFecha", e.target.value)} />
      </div>
    </div>
    <Textarea label="Notas" value={f.notas} onChange={e => u("notas", e.target.value)} />
    {f.rawLineToRemove && <Chip c={C_VERDE} style={{ alignSelf: "flex-start", whiteSpace: "normal" }}>Se quita de pendientes: {f.rawLineToRemove.trim()}</Chip>}
    <Pie onCancel={onCancel} guardando={guardando} txt="Registrar" onSave={async () => {
      if (!f.vehicleId) return alert("Elegí el vehículo.");
      if (!f.description.trim()) return alert("Escribí qué se le hizo.");
      if (!f.fecha) return alert("Falta la fecha.");
      setGuardando(true);
      const ok = await onSave({
        id: uid(), vehicleId: f.vehicleId, type: f.type, fecha: f.fecha, kmAlRealizar: Number(f.kmAlRealizar) || 0,
        description: f.description.trim(), workshop: f.workshop.trim(), cost: Number(f.cost) || 0,
        proxKm: Number(f.proxKm) || null, proxFecha: f.proxFecha || null, notas: f.notas.trim(), createdAt: new Date().toISOString(),
      }, f.rawLineToRemove);
      setGuardando(false);
      if (ok) onCancel();
    }} />
  </div>;
}

function CargaForm({ vehicle, vehicles, motoristas, cargas, onCancel, onSave }) {
  const celu = useCelu();
  const [f, setF] = useState({ vehicleId: vehicle?.id || "", fecha: hoyISO(), km: "", galones: "", monto: "", lleno: true, estacion: "", motoristaEmpId: vehicle?.motoristaEmpId || "" });
  const [guardando, setGuardando] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const veh = vehicles.find(x => x.id === f.vehicleId);
  const ultima = cargas.filter(c => c.vehicleId === f.vehicleId).sort((a, b) => (Number(b.km) || 0) - (Number(a.km) || 0))[0];
  const kmMin = Math.max(Number(veh?.kmActual) || 0, Number(ultima?.km) || 0);
  const precio = Number(f.galones) > 0 && Number(f.monto) > 0 ? Number(f.monto) / Number(f.galones) : null;
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={grid(celu ? "1fr" : "2fr 1fr")}>
      <Select label="Vehículo *" options={vehicles.map(v => ({ value: v.id, label: `${v.plate} · ${v.brand || ""} ${v.model || ""}` }))} value={f.vehicleId} onChange={e => { const v = vehicles.find(x => x.id === e.target.value); setF(p => ({ ...p, vehicleId: e.target.value, motoristaEmpId: v?.motoristaEmpId || p.motoristaEmpId })); }} emptyLabel="Elegir" />
      <Input label="Fecha *" type="date" value={f.fecha} onChange={e => u("fecha", e.target.value)} />
    </div>
    <div style={grid(celu ? "1fr 1fr" : "1fr 1fr 1fr")}>
      <Input label="Odómetro (km) *" hint={kmMin ? `último ${nf0(kmMin)}` : ""} type="number" value={f.km} onChange={e => u("km", e.target.value)} />
      <Input label="Galones *" type="number" step="0.01" value={f.galones} onChange={e => u("galones", e.target.value)} />
      <Input label="Monto (L)" type="number" step="0.01" value={f.monto} onChange={e => u("monto", e.target.value)} />
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <Segmentado opciones={[{ value: "si", label: "Tanque lleno" }, { value: "no", label: "Carga parcial" }]} valor={f.lleno ? "si" : "no"} onChange={v => u("lleno", v === "si")} />
      {precio && <Chip>L {precio.toFixed(2)} / galón</Chip>}
    </div>
    <div style={grid(celu ? "1fr" : "1fr 1fr")}>
      <Input label="Gasolinera" value={f.estacion} onChange={e => u("estacion", e.target.value)} />
      <Select label="Motorista" options={motoristas.map(m => ({ value: m.emp.id, label: m.emp.fullName }))} value={f.motoristaEmpId} onChange={e => u("motoristaEmpId", e.target.value)} emptyLabel="—" />
    </div>
    {Number(f.km) > 0 && kmMin > 0 && Number(f.km) < kmMin && <Chip c={C_AMARILLO} style={{ alignSelf: "flex-start" }}>El odómetro es menor que el último registrado ({nf0(kmMin)} km)</Chip>}
    <Pie onCancel={onCancel} guardando={guardando} txt="Guardar carga" onSave={async () => {
      if (!f.vehicleId) return alert("Elegí el vehículo.");
      if (!(Number(f.km) > 0)) return alert("Poné el kilometraje del odómetro.");
      if (!(Number(f.galones) > 0)) return alert("Poné los galones.");
      setGuardando(true);
      const m = motoristas.find(x => x.emp.id === f.motoristaEmpId);
      const ok = await onSave({ id: uid(), vehicleId: f.vehicleId, fecha: f.fecha, km: Number(f.km), galones: Number(f.galones), monto: Number(f.monto) || 0, lleno: !!f.lleno, estacion: f.estacion.trim(), motoristaEmpId: f.motoristaEmpId || "", motorista: m?.emp.fullName || "", createdAt: new Date().toISOString() });
      setGuardando(false);
      if (ok) onCancel();
    }} />
  </div>;
}

function DespachoForm({ despacho, vehicles, motoristas, proyectos, presetProjectCode, onCancel, onSave, onDelete }) {
  const celu = useCelu();
  const [f, setF] = useState(() => despacho ? { ...despacho } : (() => {
    const tipo = "material_plantel_proyecto"; const cfg = tipoDespCfg(tipo);
    return { source: "manual", sourcePurchaseId: null, tipo, descripcion: "", origen: cfg.defaultOrigen, destino: presetProjectCode ? `Proyecto ${presetProjectCode}` : cfg.defaultDestino, projectCode: presetProjectCode || "", vehicleId: "", motorista: "", motoristaEmpId: "", fechaNecesaria: "", fechaProgramada: "", estado: "pendiente", notas: "" };
  })());
  const [guardando, setGuardando] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!despacho;
  const vieneDeCompra = !!f.sourcePurchaseId;
  const onTipo = (t) => { const cfg = tipoDespCfg(t); setF(p => ({ ...p, tipo: t, origen: (!p.origen || TIPOS_DESPACHO.some(x => x.defaultOrigen === p.origen)) ? (cfg.defaultOrigen || p.origen) : p.origen, destino: (!p.destino || TIPOS_DESPACHO.some(x => x.defaultDestino === p.destino)) ? (cfg.defaultDestino || p.destino) : p.destino })); };
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {!vieneDeCompra && <Select label="Tipo" options={TIPOS_DESPACHO.filter(t => t.value !== "material_compra" && t.value !== "repuesto_maquinas").map(t => ({ value: t.value, label: t.label }))} value={f.tipo} onChange={e => onTipo(e.target.value)} emptyLabel="—" />}
    <div style={grid(celu ? "1fr" : "2fr 1fr")}>
      <Textarea label="Qué se mueve *" value={f.descripcion} onChange={e => u("descripcion", e.target.value)} />
      <Select label="Proyecto" options={proyectos.map(p => ({ value: p.short, label: p.short }))} value={f.projectCode} onChange={e => u("projectCode", e.target.value)} emptyLabel="Sin proyecto" />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "end" }}>
      <Input label="Origen *" value={f.origen} onChange={e => u("origen", e.target.value)} />
      <div style={{ paddingBottom: 10, color: ORANGE }}><Ico d={ICO.flecha} size={20} /></div>
      <Input label="Destino *" value={f.destino} onChange={e => u("destino", e.target.value)} />
    </div>
    <div style={grid(celu ? "1fr 1fr" : "1fr 1fr")}>
      <Input label="Se necesita en obra" type="date" value={f.fechaNecesaria || ""} onChange={e => u("fechaNecesaria", e.target.value)} />
      <Input label="Sale el" type="date" value={f.fechaProgramada || ""} onChange={e => u("fechaProgramada", e.target.value)} />
    </div>
    <div style={grid(celu ? "1fr" : "1fr 1fr")}>
      <Select label="Vehículo" options={vehicles.filter(v => v.estado !== "fuera_servicio").map(v => ({ value: v.id, label: `${v.plate} · ${v.brand || ""} ${v.model || ""}` }))} value={f.vehicleId || ""} onChange={e => { const v = vehicles.find(x => x.id === e.target.value); setF(p => ({ ...p, vehicleId: e.target.value, ...(v?.motoristaEmpId && !p.motoristaEmpId ? { motoristaEmpId: v.motoristaEmpId, motorista: v.motorista } : {}) })); }} emptyLabel="Sin asignar" />
      <Select label="Motorista" options={motoristas.map(m => ({ value: m.emp.id, label: m.emp.fullName }))} value={f.motoristaEmpId || ""} onChange={e => { const m = motoristas.find(x => x.emp.id === e.target.value); setF(p => ({ ...p, motoristaEmpId: e.target.value, motorista: m ? m.emp.fullName : "" })); }} emptyLabel={f.motorista && !f.motoristaEmpId ? f.motorista : "Sin asignar"} />
    </div>
    {isEdit && <Seccion titulo="Estado"><Segmentado opciones={ESTADOS_DESPACHO} valor={f.estado} onChange={v => u("estado", v)} /></Seccion>}
    <Textarea label="Notas" value={f.notas || ""} onChange={e => u("notas", e.target.value)} />
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 14, borderTop: "1px solid rgba(44,42,40,.08)", flexWrap: "wrap" }}>
      <div>{isEdit && onDelete && <Btn variant="danger" small onClick={onDelete}>Eliminar</Btn>}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn disabled={guardando} onClick={async () => {
          if (!f.descripcion.trim() || !String(f.origen).trim() || !String(f.destino).trim()) return alert("Falta qué se mueve, el origen o el destino.");
          setGuardando(true);
          const ahora = new Date().toISOString();
          const ok = await onSave({
            ...f, id: f.id || uid(), descripcion: f.descripcion.trim(), origen: String(f.origen).trim(), destino: String(f.destino).trim(),
            motorista: (f.motorista || "").trim(), notas: (f.notas || "").trim(), fechaNecesaria: f.fechaNecesaria || "",
            estado: f.estado === "pendiente" && f.vehicleId && f.fechaProgramada ? "programado" : f.estado,
            updatedAt: ahora, createdAt: f.createdAt || ahora,
          });
          setGuardando(false);
          if (ok) onCancel();
        }}>{guardando ? "Guardando…" : isEdit ? "Guardar" : "Crear"}</Btn>
      </div>
    </div>
  </div>;
}

function ProgramarForm({ despacho, vehicles, motoristas, onCancel, onSave }) {
  const [fecha, setFecha] = useState(despacho.fechaProgramada || masDias(hoyISO(), 1));
  const [necesaria, setNecesaria] = useState(despacho.fechaNecesaria || "");
  const [vehicleId, setVehicleId] = useState(despacho.vehicleId || "");
  const [motId, setMotId] = useState(despacho.motoristaEmpId || "");
  const [guardando, setGuardando] = useState(false);
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ fontSize: 13.5, color: "var(--text-2)", lineHeight: 1.45 }}>{String(despacho.descripcion || "").slice(0, 160)}</div>
    <div style={grid("1fr 1fr")}>
      <Input label="Sale el *" type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
      <Input label="Se necesita en obra" type="date" value={necesaria} onChange={e => setNecesaria(e.target.value)} />
    </div>
    <div style={grid("1fr 1fr")}>
      <Select label="Vehículo" options={vehicles.filter(v => v.estado !== "fuera_servicio").map(v => ({ value: v.id, label: `${v.plate} · ${v.brand || ""} ${v.model || ""}` }))} value={vehicleId} onChange={e => { setVehicleId(e.target.value); const v = vehicles.find(x => x.id === e.target.value); if (v?.motoristaEmpId && !motId) setMotId(v.motoristaEmpId); }} emptyLabel="Después" />
      <Select label="Motorista" options={motoristas.map(m => ({ value: m.emp.id, label: m.emp.fullName }))} value={motId} onChange={e => setMotId(e.target.value)} emptyLabel={despacho.motorista && !motId ? despacho.motorista : "Después"} />
    </div>
    <Pie onCancel={onCancel} guardando={guardando} txt="Programar" onSave={async () => {
      if (!fecha) return alert("Falta la fecha.");
      setGuardando(true);
      const m = motoristas.find(x => x.emp.id === motId);
      const ok = await onSave({ ...despacho, fechaProgramada: fecha, fechaNecesaria: necesaria || despacho.fechaNecesaria || "", vehicleId: vehicleId || despacho.vehicleId || "", motoristaEmpId: motId || despacho.motoristaEmpId || "", motorista: m ? m.emp.fullName : despacho.motorista || "", estado: "programado", updatedAt: new Date().toISOString() });
      setGuardando(false);
      if (ok) onCancel();
    }} />
  </div>;
}

function MotoristaForm({ mot, emps, vehicles, extras, onCancel, onSave }) {
  const nuevo = !mot;
  const [q, setQ] = useState("");
  const [empId, setEmpId] = useState(mot?.emp.id || "");
  const d = mot?.datos || {};
  const [lic, setLic] = useState({ licenciaNumero: d.licenciaNumero || "", licenciaTipo: d.licenciaTipo || "", licenciaVence: d.licenciaVence || "" });
  const actual = vehicles.find(v => v.motoristaEmpId === empId);
  const [vehId, setVehId] = useState(actual?.id || "");
  const [guardando, setGuardando] = useState(false);
  const ya = new Set((extras || []).filter(x => x.agregado).map(x => x.empId));
  const candidatos = emps.filter(e => e.status !== "inactive" && !ya.has(e.id) && !/motorista|chofer|conductor/i.test(e.position || ""))
    .filter(e => !q.trim() || `${e.fullName} ${e.position} ${e.dni}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  const emp = emps.find(e => e.id === empId);
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {nuevo && !emp && <>
      <Input label="Buscar en GeoTeam" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, cargo o identidad" autoFocus />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {candidatos.map(e => <button key={e.id} type="button" onClick={() => setEmpId(e.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 14, border: "1px solid rgba(44,42,40,.08)", background: "#fff", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
          <Avatar emp={e} size={36} radio={11} />
          <div style={{ minWidth: 0 }}><div style={{ font: "700 13.5px/1.2 var(--sans)", color: CHARCOAL }}>{e.fullName}</div><div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{e.position || "—"}</div></div>
        </button>)}
      </div>
    </>}
    {emp && <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar emp={emp} size={52} radio={16} />
      <div style={{ flex: 1 }}><div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>{emp.fullName}</div><div style={{ fontSize: 12, color: "var(--text-3)" }}>{emp.position} · {emp.phone || "sin teléfono"}</div></div>
      {nuevo && <Btn small variant="ghost" onClick={() => setEmpId("")}>Cambiar</Btn>}
    </div>}
    {emp && <>
      <Seccion titulo="Licencia">
        <div style={grid("1fr 1fr 1fr")}>
          <Input label="Número" value={lic.licenciaNumero} onChange={e => setLic(p => ({ ...p, licenciaNumero: e.target.value }))} />
          <Select label="Tipo" options={LICENCIAS} value={lic.licenciaTipo} onChange={e => setLic(p => ({ ...p, licenciaTipo: e.target.value }))} />
          <Input label="Vence" type="date" value={lic.licenciaVence} onChange={e => setLic(p => ({ ...p, licenciaVence: e.target.value }))} />
        </div>
      </Seccion>
      <Select label="Vehículo asignado" options={vehicles.map(v => ({ value: v.id, label: `${v.plate} · ${v.brand || ""} ${v.model || ""}` }))} value={vehId} onChange={e => setVehId(e.target.value)} emptyLabel="Ninguno" />
    </>}
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 14, borderTop: "1px solid rgba(44,42,40,.08)", flexWrap: "wrap" }}>
      <div>{!nuevo && <Btn small variant="danger" onClick={async () => { if (!confirm(`¿Quitar a ${emp.fullName} de la lista de motoristas? (No se toca su ficha de GeoTeam.)`)) return; setGuardando(true); const ok = await onSave({ empId, quitar: true, porCargo: mot.porCargo }); setGuardando(false); if (ok) onCancel(); }}>Quitar de motoristas</Btn>}</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
        <Btn disabled={!emp || guardando} onClick={async () => { setGuardando(true); const ok = await onSave({ empId, ...lic, vehId, vehAntes: actual?.id || "", agregado: nuevo ? true : undefined }); setGuardando(false); if (ok) onCancel(); }}>{guardando ? "Guardando…" : nuevo ? "Agregar" : "Guardar"}</Btn>
      </div>
    </div>
  </div>;
}

// ═════════════════════════════ MÓDULO ═════════════════════════════
// ═════════════════ MI CARRO — bitácora del motorista (26-nov-2026) ═════════════════
// Óscar Paz: "como el marcaje de asistencia de la tablet: que cada motorista,
// al montarse al carro, registre el kilometraje y cómo está, y al pararlo cómo
// queda". Pantalla pensada para el teléfono: un solo paso a la vez, botones grandes.
const horaCorta = (iso) => { try { return new Date(iso).toLocaleTimeString("es-HN", { hour: "numeric", minute: "2-digit", timeZone: "America/Tegucigalpa" }); } catch { return ""; } };
const fechaHora = (iso) => { try { return new Date(iso).toLocaleString("es-HN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Tegucigalpa" }); } catch { return ""; } };
function CampoFotoTablero({ archivo, onArchivo }) {
  const ref = useRef(null);
  const [prev, setPrev] = useState(null);
  useEffect(() => { if (!archivo) { setPrev(null); return; } const u = URL.createObjectURL(archivo); setPrev(u); return () => URL.revokeObjectURL(u); }, [archivo]);
  return <div>
    <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onArchivo(f); e.target.value = ""; }} />
    <button type="button" onClick={() => ref.current?.click()} style={{ width: "100%", minHeight: 120, borderRadius: 16, border: prev ? "none" : "1.5px dashed rgba(44,42,40,.25)", background: prev ? "#000" : "rgba(44,42,40,.03)", padding: 0, overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6E6862", font: "700 14px/1.3 var(--sans)" }}>
      {prev ? <img src={prev} alt="Tablero" style={{ width: "100%", maxHeight: 220, objectFit: "contain", display: "block" }} /> : <span>Tomar foto del tablero<br /><span style={{ fontWeight: 500, fontSize: 12 }}>que se vea el kilometraje y la aguja del combustible</span></span>}
    </button>
    {prev && <button type="button" onClick={() => ref.current?.click()} style={{ marginTop: 6, border: "none", background: "none", color: "var(--naranja-texto-chico)", font: "700 12.5px/1 var(--sans)", cursor: "pointer", padding: 0 }}>Tomar otra</button>}
  </div>;
}
function FormUso({ tipo, vehiculo, uso, bitacora, onCancel, onGuardar }) {
  const ultimo = tipo === "salida" ? ultimoKmBitacora(bitacora, vehiculo.id) ?? (Number(vehiculo.kmActual) || null) : Number(uso?.salida?.km) || null;
  const [km, setKm] = useState("");
  const [comb, setComb] = useState("");
  const [estado, setEstado] = useState("bien");
  const [nota, setNota] = useState("");
  const [foto, setFoto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const v = tipo === "salida" ? validarSalida({ km, vehiculo, bitacora }) : validarLlegada({ km, uso });
  const listo = v.ok && comb && foto && (estado === "bien" || nota.trim().length >= 3);
  const lbl = { fontSize: 12.5, fontWeight: 700, color: "#6E6862", marginBottom: 6, display: "block" };
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div>
      <span style={lbl}>Kilometraje del tablero</span>
      <input inputMode="numeric" value={km} onChange={e => setKm(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={ultimo ? `último: ${nf0(ultimo)}` : "ej. 125300"} style={{ width: "100%", boxSizing: "border-box", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(44,42,40,.15)", font: "800 26px/1 var(--mono)", textAlign: "center", color: CHARCOAL, background: "#fff" }} />
      {km && v.error && <div style={{ marginTop: 6, fontSize: 12.5, color: C_ROJO.color, fontWeight: 600 }}>{v.error}</div>}
      {km && v.ok && tipo === "salida" && v.salto > 0 && <div style={{ marginTop: 6, fontSize: 12.5, color: ORANGE_DARK, fontWeight: 600 }}>{nf0(v.salto)} km más que la última vez que se registró este carro.</div>}
      {km && v.ok && tipo === "llegada" && <div style={{ marginTop: 6, fontSize: 13, color: "#177243", fontWeight: 700 }}>Recorriste {nf0(v.recorrido)} km</div>}
    </div>
    <div>
      <span style={lbl}>Combustible</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>{NIVELES_COMBUSTIBLE.map(n => <button key={n} type="button" onClick={() => setComb(n)} style={{ padding: "12px 0", borderRadius: 12, border: comb === n ? "none" : "1px solid rgba(44,42,40,.12)", background: comb === n ? CHARCOAL : "#fff", color: comb === n ? "#fff" : CHARCOAL, font: "800 13.5px/1 var(--sans)", cursor: "pointer" }}>{n}</button>)}</div>
    </div>
    <div>
      <span style={lbl}>Foto del tablero</span>
      <CampoFotoTablero archivo={foto} onArchivo={setFoto} />
    </div>
    <div>
      <span style={lbl}>{tipo === "salida" ? "¿Cómo está el carro?" : "¿Cómo queda el carro?"}</span>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[["bien", "Bien"], ["detalle", "Tiene algo"]].map(([k, l]) => <button key={k} type="button" onClick={() => setEstado(k)} style={{ padding: "13px 0", borderRadius: 12, border: estado === k ? "none" : "1px solid rgba(44,42,40,.12)", background: estado === k ? (k === "bien" ? "#177243" : ORANGE_DARK) : "#fff", color: estado === k ? "#fff" : CHARCOAL, font: "800 14px/1 var(--sans)", cursor: "pointer" }}>{l}</button>)}
      </div>
      {(estado === "detalle" || nota) && <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder={estado === "detalle" ? "¿Qué tiene? (llanta baja, golpe, luz encendida…)" : "Nota (opcional)"} style={{ marginTop: 8, width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 12, border: "1px solid rgba(44,42,40,.15)", font: "500 15px/1.4 var(--sans)", resize: "vertical" }} />}
      {estado === "bien" && !nota && <button type="button" onClick={() => setNota(" ")} style={{ marginTop: 6, border: "none", background: "none", color: "#8A847D", font: "600 12.5px/1 var(--sans)", cursor: "pointer", padding: 0 }}>+ Agregar una nota</button>}
    </div>
    <div style={{ display: "flex", gap: 10 }}>
      <Btn variant="ghost" onClick={onCancel} disabled={guardando}>Cancelar</Btn>
      <button type="button" disabled={!listo || guardando} onClick={async () => { setGuardando(true); try { await onGuardar({ km: v.km, combustible: comb, estado, nota: nota.trim(), foto, salto: v.salto || 0, recorrido: v.recorrido }); } finally { setGuardando(false); } }} style={{ flex: 1, padding: "16px 0", borderRadius: 16, border: "none", background: listo ? ORANGE : "rgba(44,42,40,.12)", color: listo ? "#fff" : "#8A847D", font: "800 16px/1 var(--sans)", cursor: listo ? "pointer" : "default" }}>{guardando ? "Guardando…" : tipo === "salida" ? "Registrar salida" : "Registrar llegada"}</button>
    </div>
    {!listo && <div style={{ fontSize: 12, color: "#8A847D", textAlign: "center", marginTop: -6 }}>Falta: {[!v.ok && "kilometraje", !comb && "combustible", !foto && "foto del tablero", estado === "detalle" && nota.trim().length < 3 && "qué tiene el carro"].filter(Boolean).join(" · ")}</div>}
  </div>;
}
function MiCarroImpl({ user, vehicles, bitacora, emps, onRegistrar }) {
  const abierto = usoAbierto(bitacora, { username: user.username });
  const [elegido, setElegido] = useState(null);
  const [hecho, setHecho] = useState(null);
  const vehAbierto = abierto ? vehicles.find(v => v.id === abierto.vehicleId) : null;
  const disponibles = vehicles.filter(v => v.estado !== "fuera" && v.estado !== "baja");
  const mios = disponibles.filter(v => user.empId && v.motoristaEmpId === user.empId);
  const otros = disponibles.filter(v => !mios.includes(v)).sort((a, b) => String(a.plate).localeCompare(String(b.plate)));
  const misUsos = (bitacora || []).filter(b => b.username === user.username && !b.anulado).sort((a, b) => String(b.salida?.at).localeCompare(String(a.salida?.at))).slice(0, 8);
  const tituloVeh = (v) => <><span style={{ font: "800 17px/1.2 var(--mono)", color: CHARCOAL }}>{v.plate || "Sin placa"}</span> <span style={{ fontSize: 13.5, color: "#6E6862", fontWeight: 600 }}>{[v.brand, v.model].filter(Boolean).join(" ")}</span></>;
  const caja = { padding: 18, display: "flex", flexDirection: "column", gap: 14 };
  if (hecho) return <div className="gt-vidrio" style={{ ...caja, alignItems: "center", textAlign: "center", padding: "36px 20px" }}>
    <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#177243", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 900 }}>✓</div>
    <div style={{ font: "800 21px/1.25 var(--display)", color: CHARCOAL }}>{hecho.tipo === "salida" ? "Salida registrada" : "Llegada registrada"}</div>
    <div style={{ fontSize: 14, color: "#6E6862" }}>{hecho.plate} · {nf0(hecho.km)} km{hecho.recorrido != null ? ` · recorriste ${nf0(hecho.recorrido)} km` : ""}</div>
    <Btn onClick={() => setHecho(null)}>Listo</Btn>
  </div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560, margin: "0 auto", width: "100%" }}>
    {abierto ? <div className="gt-vidrio" style={caja}>
      <div className="gt-label" style={{ color: ORANGE_DARK }}>Estás usando</div>
      <div>{vehAbierto ? tituloVeh(vehAbierto) : abierto.plate}</div>
      <div style={{ fontSize: 13.5, color: "#6E6862" }}>Salió {fechaHora(abierto.salida.at)} con <b style={{ color: CHARCOAL }}>{nf0(abierto.salida.km)} km</b> · tanque {abierto.salida.combustible}</div>
      <div style={{ borderTop: "1px solid rgba(44,42,40,.08)", paddingTop: 14 }}>
        <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL, marginBottom: 12 }}>Registrar llegada</div>
        <FormUso tipo="llegada" vehiculo={vehAbierto || { id: abierto.vehicleId }} uso={abierto} bitacora={bitacora} onCancel={() => {}} onGuardar={async (d) => { if (await onRegistrar("llegada", { uso: abierto, ...d })) setHecho({ tipo: "llegada", plate: abierto.plate, km: d.km, recorrido: d.recorrido }); }} />
      </div>
    </div>
    : elegido ? <div className="gt-vidrio" style={caja}>
      <div className="gt-label" style={{ color: ORANGE_DARK }}>Salida</div>
      <div>{tituloVeh(elegido)}</div>
      <FormUso tipo="salida" vehiculo={elegido} bitacora={bitacora} onCancel={() => setElegido(null)} onGuardar={async (d) => { if (await onRegistrar("salida", { vehiculo: elegido, ...d })) { setHecho({ tipo: "salida", plate: elegido.plate, km: d.km }); setElegido(null); } }} />
    </div>
    : <div className="gt-vidrio" style={caja}>
      <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>¿Qué carro vas a usar?</div>
      {[["Tu carro", mios], [mios.length ? "Otros carros" : "Carros", otros]].filter(([, l]) => l.length).map(([t, l]) => <div key={t} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>{t}</div>
        {l.map(v => { const otro = usoAbierto(bitacora, { vehicleId: v.id }); return <button key={v.id} type="button" disabled={!!otro} onClick={() => setElegido(v)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid rgba(44,42,40,.1)", background: otro ? "rgba(44,42,40,.04)" : "#fff", cursor: otro ? "default" : "pointer", textAlign: "left", fontFamily: "inherit", opacity: otro ? .6 : 1 }}>
          <div style={{ width: 52, height: 40, borderRadius: 10, overflow: "hidden", background: "rgba(44,42,40,.06)", flexShrink: 0 }}><Foto fileId={v.foto?.fileId} style={{ width: 52, height: 40 }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>{tituloVeh(v)}<div style={{ fontSize: 12, color: otro ? ORANGE_DARK : "#8A847D", marginTop: 2 }}>{otro ? `En uso · ${otro.motorista}` : (() => { const k = ultimoKmBitacora(bitacora, v.id) ?? Number(v.kmActual); return k > 0 ? `${nf0(k)} km` : "sin kilometraje registrado"; })()}</div></div>
          {!otro && <span style={{ color: ORANGE_DARK, fontWeight: 800 }}>›</span>}
        </button>; })}
      </div>)}
    </div>}
    {misUsos.length > 0 && <div className="gt-vidrio" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="gt-label" style={{ color: "var(--text-3)" }}>Tus últimos registros</div>
      {misUsos.map(b => <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, borderTop: "1px solid rgba(44,42,40,.06)", paddingTop: 8 }}>
        <span><b style={{ fontFamily: "var(--mono)" }}>{b.plate}</b> · {fechaHora(b.salida.at)}</span>
        <span style={{ color: b.llegada ? CHARCOAL : ORANGE_DARK, fontWeight: 700 }}>{b.llegada ? `${nf0(b.recorrido)} km` : "en uso"}</span>
      </div>)}
    </div>}
  </div>;
}

export default function LogisticsModule({ userRole, userName, userKey, userEmpId, onBack, onLogout }) {
  const isAdmin = userRole === "admin";
  // Motorista (26-nov-2026): solo ve "Mi carro" — su salida y llegada del carro.
  const isMotorista = userRole === "motorista";
  const canEdit = isAdmin || userRole === "logistica" || userRole === "recepcion";
  const isMobile = useIsMobile();
  const hoy = hoyISO();

  // ── Guardia anti-pisada del auto-refresh (20-ago-2026): los diálogos
  // nativos disparan `focus` y el refresh leía la nube de ANTES del guardado.
  const lastLocalMutAtRef = useRef(0);
  const [despachos, _setDespachosRaw] = useState([]);
  const setDespachos = (v) => { lastLocalMutAtRef.current = Date.now(); _setDespachosRaw(v); };
  const [vehicles, setVehicles] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [cargas, setCargas] = useState([]);
  const [motExtras, setMotExtras] = useState([]);
  const [bitacora, setBitacora] = useState([]);
  const [emps, setEmps] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [mqPurchases, setMqPurchases] = useState([]);
  const [customProjects, setCustomProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [visorFicha, setVisorFicha] = useState(null);
  const [uploadingFichaId, setUploadingFichaId] = useState(null);

  const [sec, _setSec] = useState(() => { try { return sessionStorage.getItem("gt-lg-sec") || "dashboard"; } catch { return "dashboard"; } });
  const setSec = (s) => { _setSec(s); setFichaId(null); try { sessionStorage.setItem("gt-lg-sec", s); } catch { /* */ } };
  const [fichaId, setFichaId] = useState(null);
  // Vuelo del carnet: {id, fase: "abrir"|"cerrar", desde?, hasta?}
  const [vuelo, setVuelo] = useState(null);
  const fotoDe = (sel) => { const el = document.querySelector(sel); return el ? el.outerHTML.replace(/visibility: ?hidden/g, "visibility: visible") : ""; };
  const rectDe = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  useLayoutEffect(() => {
    if (!vuelo || (vuelo.desde && vuelo.hasta)) return;
    if (vuelo.fase === "abrir") {
      const h = rectDe(`[data-ficha-carnet="${vuelo.id}"]`);
      if (!h) { setVuelo(null); return; }
      setVuelo(x => x && { ...x, hasta: h, dorso: fotoDe(`[data-ficha-carnet="${vuelo.id}"]`) });
    } else {
      const el = document.querySelector(`[data-veh="${vuelo.id}"]`);
      if (!el) { setVuelo(null); return; }
      el.scrollIntoView({ block: "nearest" });
      setVuelo(x => x && { ...x, desde: rectDe(`[data-veh="${vuelo.id}"]`), frente: fotoDe(`[data-veh="${vuelo.id}"]`) });
    }
  }, [vuelo, fichaId]);
  const volverAFlota = () => {
    const id = fichaId, h = rectDe(`[data-ficha-carnet="${id}"]`);
    if (id && h && !prefiereQuieto()) setVuelo({ id, fase: "cerrar", hasta: h, dorso: fotoDe(`[data-ficha-carnet="${id}"]`) });
    setFichaId(null);
  };
  const [fichaTab, setFichaTab] = useState("mant");
  const [flota, setFlota] = useState({ q: "", estado: "", tipo: "" });
  const [mantSub, setMantSub] = useState("programa");
  const [mantFil, setMantFil] = useState({ vehicleId: "", type: "", mes: "" });
  const [despVista, setDespVista] = useState("por_hacer");
  const [despQ, setDespQ] = useState("");
  const [despProy, setDespProy] = useState("");
  const [despMes, setDespMes] = useState(hoy.slice(0, 7));
  const [despAbiertos, setDespAbiertos] = useState(() => leerLS("gt-lg-abiertos", {}));
  const [motQ, setMotQ] = useState("");
  const [anim, setAnim] = useState(false);

  // ── Carga ──
  useEffect(() => {
    (async () => {
      const [v, m, c, mx, d, p, cps, mqp, e] = await Promise.all([
        store.get("lg-vehicles"), store.get("lg-maintenances"), store.get("lg-combustible"), store.get("lg-motoristas"),
        store.get("lg-despachos"), store.get("cp-purchases"), store.get("cp-projects"), store.get("mq-purchases"), store.get("hr-emps5"),
      ]);
      if (Array.isArray(v)) setVehicles(v);
      if (Array.isArray(m)) setMaintenances(m);
      if (Array.isArray(c)) setCargas(c);
      if (Array.isArray(mx)) setMotExtras(mx);
      if (Array.isArray(d)) _setDespachosRaw(d);
      if (Array.isArray(p)) setPurchases(p);
      if (Array.isArray(cps)) setCustomProjects(cps);
      if (Array.isArray(mqp)) setMqPurchases(mqp);
      if (Array.isArray(e)) setEmps(e);
      try { const b = await store.getCloud("lg-bitacora"); if (Array.isArray(b)) setBitacora(b); } catch { /* sin nube: queda vacía */ }
      setLoaded(true);
    })();
  }, []);

  // Refresh al volver a la pestaña (Ana manda órdenes mientras Óscar la tiene abierta)
  useEffect(() => {
    const refresh = async () => {
      if (Date.now() - lastLocalMutAtRef.current < 8000) return;
      try {
        const [d, p, mqp] = await Promise.all([store.get("lg-despachos"), store.get("cp-purchases"), store.get("mq-purchases")]);
        if (Date.now() - lastLocalMutAtRef.current < 8000) return;
        if (Array.isArray(d)) _setDespachosRaw(d);
        if (Array.isArray(p)) setPurchases(p);
        if (Array.isArray(mqp)) setMqPurchases(mqp);
        try { const b = await store.getCloud("lg-bitacora"); if (Array.isArray(b) && Date.now() - lastLocalMutAtRef.current >= 8000) setBitacora(b); } catch { /* */ }
      } catch (err) { console.warn("Auto-refresh falló:", err?.message || err); }
    };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // Animación de los gráficos al entrar al Dashboard
  useEffect(() => {
    if (sec !== "dashboard" || !loaded) return;
    setAnim(false);
    let r2; const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setAnim(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [sec, loaded]);

  const allProjects = customProjects.filter(p => !p.hidden && !p.deleted).slice().sort((a, b) => String(a.short).localeCompare(String(b.short), "es", { sensitivity: "base", numeric: true }));
  const motoristas = listaMotoristas(emps, motExtras);
  const compraDe = (d) => d?.sourcePurchaseId ? (purchases.find(p => p.id === d.sourcePurchaseId) || mqPurchases.find(p => p.id === d.sourcePurchaseId) || null) : null;
  const vehDe = (id) => vehicles.find(v => v.id === id);

  // ── Guardado robusto de listas propias: getCloud → cambio → set → verify ──
  const guardarLista = async (key, setter, mutator) => {
    let nube;
    try { nube = await store.getCloud(key); }
    catch { alert("No hay conexión con la nube. No se guardó nada; intentá de nuevo en un momento."); return null; }
    const next = mutator(Array.isArray(nube) ? nube : []);
    const ok = await store.set(key, next);
    if (!ok) { alert("No se pudo guardar en la nube. Intentá de nuevo."); return null; }
    try {
      const ver = await store.getCloud(key);
      if (Array.isArray(ver)) {
        const ids = new Set(ver.map(x => x?.id || x?.empId));
        const faltan = next.filter(x => (x?.id || x?.empId) && !ids.has(x.id || x.empId));
        if (faltan.length) alert("Se guardó, pero la nube no lo confirma todavía. Recargá la página y revisá.");
        setter(ver); return ver;
      }
    } catch { /* el set ya confirmó */ }
    setter(next); return next;
  };

  const saveVehicle = async (rec) => {
    const dup = vehicles.find(x => x.plate === rec.plate && x.id !== rec.id && rec.plate !== "-" && rec.plate !== "SIN PLACAS");
    if (dup) { alert(`Ya existe un vehículo con placa ${rec.plate}.`); return false; }
    const r = await guardarLista("lg-vehicles", setVehicles, (base) => base.some(x => x.id === rec.id) ? base.map(x => x.id === rec.id ? { ...x, ...rec } : x) : [...base, rec]);
    return !!r;
  };
  const patchVehicle = async (id, patch) => !!(await guardarLista("lg-vehicles", setVehicles, (base) => base.map(x => x.id === id ? { ...x, ...(typeof patch === "function" ? patch(x) : patch), updatedAt: new Date().toISOString() } : x)));
  // ── Bitácora del carro: salida / llegada del motorista ──
  // La foto del tablero se sube PRIMERO (sin foto no se registra, como GeoClock);
  // el uso se escribe sobre la nube FRESCA: si el carro ya está en uso por otro
  // (o el motorista ya tiene uno abierto), no se registra.
  const registrarUso = async (tipo, d) => {
    lastLocalMutAtRef.current = Date.now();
    let fotoId;
    try {
      const dataUrl = await comprimirImagen(d.foto, 1000);
      fotoId = uid();
      const okF = await store.set(`cp-file-${fotoId}`, { name: `tablero-${tipo}.jpg`, type: "image/jpeg", size: Math.round(dataUrl.length * 0.75), dataUrl });
      if (!okF) throw new Error("La nube no aceptó la foto.");
      FOTOS.set(fotoId, dataUrl);
    } catch (e) { alert(`No se pudo subir la foto del tablero (${e?.message || e}). No se registró nada; probá otra vez.`); return false; }
    const at = new Date().toISOString();
    const marca = { at, km: d.km, combustible: d.combustible, estado: d.estado, nota: d.nota || "", fotoId };
    let problema = "";
    let vehicleId;
    const r = await guardarLista("lg-bitacora", setBitacora, (base) => {
      if (tipo === "salida") {
        vehicleId = d.vehiculo.id;
        const otro = usoAbierto(base, { vehicleId });
        if (otro) { problema = `Ese carro ya está en uso por ${otro.motorista} desde ${fechaHora(otro.salida.at)}.`; return base; }
        const mio = usoAbierto(base, { username: userKey });
        if (mio) { problema = `Ya tenés abierto el ${mio.plate}: registrá su llegada primero.`; return base; }
        return [...base, { id: uid(), vehicleId, plate: d.vehiculo.plate || "", empId: userEmpId || null, motorista: userName || userKey, username: userKey, salida: marca, llegada: null, salto: d.salto || 0, recorrido: null, createdAt: at, updatedAt: at }];
      }
      vehicleId = d.uso.vehicleId;
      const cur = base.find(x => x.id === d.uso.id);
      if (!cur || cur.llegada) { problema = "Ese uso ya tenía la llegada registrada."; return base; }
      return base.map(x => x.id === d.uso.id ? { ...x, llegada: marca, recorrido: d.recorrido, updatedAt: at } : x);
    });
    if (problema) { alert(problema); store.remove(`cp-file-${fotoId}`, { quiet: true }); return false; }
    if (!r) return false;
    await patchVehicle(vehicleId, (v) => ({ kmActual: Math.max(Number(v.kmActual) || 0, d.km) }));
    return true;
  };
  const deleteVehicle = async (id) => !!(await guardarLista("lg-vehicles", setVehicles, (base) => base.filter(x => x.id !== id)));

  const saveMaintenance = async (rec, rawLine) => {
    const r = await guardarLista("lg-maintenances", setMaintenances, (base) => [...base, rec]);
    if (!r) return false;
    await patchVehicle(rec.vehicleId, (v) => ({
      kmActual: Math.max(Number(v.kmActual) || 0, Number(rec.kmAlRealizar) || 0),
      pendientesReparacion: rawLine ? quitarLinea(v.pendientesReparacion, rawLine) : v.pendientesReparacion,
      proxMantenimientoKm: rec.proxKm != null ? rec.proxKm : v.proxMantenimientoKm,
      proxMantenimientoFecha: rec.proxFecha || v.proxMantenimientoFecha,
      ...(rec.type === "preventivo" ? { ultimoServicioKm: Number(rec.kmAlRealizar) || null, ultimoServicioFecha: rec.fecha } : {}),
    }));
    return true;
  };
  const deleteMaintenance = async (id) => { await guardarLista("lg-maintenances", setMaintenances, (base) => base.filter(m => m.id !== id)); };

  const saveCarga = async (rec) => {
    const r = await guardarLista("lg-combustible", setCargas, (base) => [...base, rec]);
    if (!r) return false;
    const v = vehDe(rec.vehicleId);
    if (v && rec.km > (Number(v.kmActual) || 0)) await patchVehicle(v.id, (x) => ({ kmActual: Math.max(Number(x.kmActual) || 0, rec.km) }));
    return true;
  };
  const deleteCarga = async (id) => { await guardarLista("lg-combustible", setCargas, (base) => base.filter(c => c.id !== id)); };

  const saveMotorista = async ({ empId, quitar, porCargo, vehId, vehAntes, agregado, ...lic }) => {
    const r = await guardarLista("lg-motoristas", setMotExtras, (base) => {
      const prev = base.find(x => x.empId === empId) || { empId };
      const nuevo = quitar
        ? { ...prev, agregado: false, quitado: !!porCargo, updatedAt: new Date().toISOString() }
        : { ...prev, ...lic, ...(agregado ? { agregado: true } : {}), quitado: false, updatedAt: new Date().toISOString(), updatedBy: userName || "" };
      return base.some(x => x.empId === empId) ? base.map(x => x.empId === empId ? nuevo : x) : [...base, nuevo];
    });
    if (!r) return false;
    if (!quitar && vehId !== undefined && vehId !== vehAntes) {
      const emp = emps.find(e => e.id === empId);
      await guardarLista("lg-vehicles", setVehicles, (base) => base.map(v => {
        if (v.id === vehId) return { ...v, motoristaEmpId: empId, motorista: emp?.fullName || v.motorista, updatedAt: new Date().toISOString() };
        if (v.id === vehAntes) return { ...v, motoristaEmpId: "", motorista: "", updatedAt: new Date().toISOString() };
        return v;
      }));
    }
    return true;
  };

  const subirFotoVehiculo = async (v, file) => {
    if (!file) return;
    try {
      const dataUrl = await comprimirImagen(file);
      const fileId = uid();
      const ok = await store.set(`cp-file-${fileId}`, { name: file.name, type: "image/jpeg", size: Math.round(dataUrl.length * 0.75), dataUrl });
      if (!ok) { alert("No se pudo subir la foto. Intentá de nuevo."); return; }
      FOTOS.set(fileId, dataUrl);
      await patchVehicle(v.id, { foto: { fileId, name: file.name } });
    } catch (e) { alert(e?.message || "No se pudo subir la foto."); }
  };

  // ── Despachos: guardado con merge contra la nube (key compartida) ──
  const saveDespachosWithMerge = async (mutator, opts = {}) => {
    let cloudArr;
    try { const c = await store.getCloud("lg-despachos"); cloudArr = Array.isArray(c) ? c : []; }
    catch { alert("No hay conexión con la nube. No se guardó nada; intentá de nuevo."); return false; }
    const deletedIds = new Set(opts.deletedIds || []);
    const cloudIds = new Set(cloudArr.map(d => d.id));
    const localOnly = despachos.filter(d => !cloudIds.has(d.id) && !deletedIds.has(d.id) && d.createdAt && Date.now() - new Date(d.createdAt).getTime() < 60000);
    const next = mutator([...cloudArr.filter(d => !deletedIds.has(d.id)), ...localOnly]);
    setDespachos(next);
    const ok = await store.set("lg-despachos", next);
    if (!ok) { alert("No se pudo guardar en la nube. Intentá de nuevo."); return false; }
    try {
      const ver = await store.getCloud("lg-despachos");
      if (Array.isArray(ver)) {
        const ids = new Set(ver.map(d => d.id));
        if (next.some(d => !ids.has(d.id))) alert("Se guardó, pero la nube no lo confirma todavía. Recargá la página y revisá.");
      }
    } catch { /* best effort */ }
    return true;
  };

  // REGLA (19-ago-2026): un despacho de COMPRA no se marca entregado/cerrado
  // sin la ficha de recibido firmada (o la compra cerrada sin ficha / en conta).
  const fichaBloqueaEntrega = async (d) => {
    if (!d || !d.sourcePurchaseId) return false;
    if (d.source !== "compra" && d.source !== "maquinas") return false;
    const key = d.source === "maquinas" ? "mq-purchases" : "cp-purchases";
    let arr = key === "cp-purchases" ? (purchases.length ? purchases : null) : (mqPurchases.length ? mqPurchases : null);
    if (!arr) { try { arr = await store.getCloud(key); } catch { arr = null; } }
    if (!Array.isArray(arr)) { alert("No se pudo verificar la ficha de recibido (la nube no respondió). Reintentá en un momento."); return true; }
    const compra = arr.find(x => x && x.id === d.sourcePurchaseId);
    if (!compra) return false;
    const tieneFicha = !!compra.delivery?.fichaFile?.fileId;
    const cerradaSinFicha = compra.deliveryStatus === "cerrado";
    const cerradaConta = !!(compra.conta?.fileId || compra.conta?.facturaFile?.fileId || compra.conta?.legacy);
    if (tieneFicha || cerradaSinFicha || cerradaConta) return false;
    alert(`Falta la FICHA DE RECIBIDO firmada.\n\n${compra.provider || ""} — ${(compra.description || "").slice(0, 80)}\n\nSubí primero la ficha que trajo el motorista ("Subir ficha") y después marcá la entrega. Sin ficha, la compra queda trabada en el cierre contable.`);
    return true;
  };

  // ── Sync GeoSafety (ago 2026): los despachos EPP llevan sourceEppReqId ──
  // Cuando TODOS los despachos vivos de una requisicion EPP quedan
  // entregados/cerrados, la requisicion pasa sola a ENVIADA A PROYECTO en
  // GeoSafety (merge getCloud + guard de estado: solo si sigue EN LOGISTICA).
  // Best-effort: si la nube falla, GeoSafety tiene su cierre manual.
  const syncEppReqPorReq = async (eppReqId, arrPrecargado) => {
    try {
      let arr = arrPrecargado;
      if (!arr) { const all = await store.getCloud("lg-despachos"); arr = Array.isArray(all) ? all : despachos; }
      const hermanos = arr.filter((x) => x.sourceEppReqId === eppReqId && x.estado !== "cancelado");
      if (!hermanos.length || !hermanos.every((x) => x.estado === "entregado" || x.estado === "cerrado")) return;
      const reqsArr = await store.getCloud("ep-reqs");
      if (!Array.isArray(reqsArr)) return;
      const req = reqsArr.find((r) => r.id === eppReqId);
      if (!req || req.estado !== "logistica") return; // ya cerrada/movida en GeoSafety — no pisar
      const ok = await store.set("ep-reqs", reqsArr.map((r) => (r.id === req.id
        ? { ...r, estado: "entregada", entregadaPor: userName || "Logística", entregadaAt: new Date().toISOString() }
        : r)));
      if (ok) alert(`✅ Requisición ${req.numero} quedó ENVIADA A PROYECTO en GeoSafety — todos sus despachos EPP fueron entregados.`);
    } catch { /* sin nube no hay sync; GeoSafety puede cerrarla a mano */ }
  };
  const syncEppReq = async (despachoId) => {
    try {
      const all = await store.getCloud("lg-despachos");
      const arr = Array.isArray(all) ? all : despachos;
      const d = arr.find((x) => x.id === despachoId);
      if (!d || !d.sourceEppReqId) return;
      await syncEppReqPorReq(d.sourceEppReqId, arr);
    } catch { /* sin nube no hay sync */ }
  };

  const saveDespacho = async (rec) => {
    if (rec.estado === "entregado" || rec.estado === "cerrado") {
      const antes = despachos.find(x => x.id === rec.id);
      if ((!antes || (antes.estado !== "entregado" && antes.estado !== "cerrado")) && await fichaBloqueaEntrega(rec)) return false;
    }
    const rec2 = (rec.estado === "entregado" || rec.estado === "cerrado") && !rec.fechaEjecutada ? { ...rec, fechaEjecutada: hoyISO() } : rec;
    const ok = await saveDespachosWithMerge((base) => base.some(d => d.id === rec2.id) ? base.map(d => d.id === rec2.id ? rec2 : d) : [...base, rec2]);
    if (!ok) return false;
    if (rec2.estado === "entregado" || rec2.estado === "cerrado" || rec2.estado === "cancelado") await syncEppReq(rec2.id);
    return true;
  };

  const updateDespachoEstado = async (id, nuevoEstado) => {
    if (nuevoEstado === "entregado" || nuevoEstado === "cerrado") {
      const d = despachos.find(x => x.id === id);
      if (await fichaBloqueaEntrega(d)) return;
    }
    await saveDespachosWithMerge((base) => base.map(d => d.id === id ? {
      ...d, estado: nuevoEstado,
      fechaEjecutada: (nuevoEstado === "entregado" || nuevoEstado === "cerrado") ? (d.fechaEjecutada || hoyISO()) : d.fechaEjecutada,
      updatedAt: new Date().toISOString(),
    } : d));
    if (nuevoEstado === "entregado" || nuevoEstado === "cerrado" || nuevoEstado === "cancelado") await syncEppReq(id);
  };

  const deleteDespacho = async (id) => {
    const reqIdEpp = despachos.find((d) => d.id === id)?.sourceEppReqId;
    await saveDespachosWithMerge((base) => base.filter(d => d.id !== id), { deletedIds: [id] });
    if (reqIdEpp) await syncEppReqPorReq(reqIdEpp);
  };

  const fileKeyCompra = (fileId) => `cp-file-${fileId}`;
  const uploadFichaFirmada = async (despacho, fileObj) => {
    if (!despacho?.sourcePurchaseId) {
      alert("Este despacho no esta vinculado a una compra. No se puede adjuntar ficha de recibido.");
      return false;
    }
    if (!fileObj) return false;
    if (fileObj.size > 2 * 1024 * 1024) {
      alert(`❌ El archivo pesa ${(fileObj.size / 1024 / 1024).toFixed(2)} MB.\n\nLimite maximo: 2 MB.\n\nPara reducir:\n• PDFs: https://smallpdf.com/compress-pdf\n• Fotos: exportar como JPG menor calidad`);
      return false;
    }

    // Los despachos de GeoMachinery (source "maquinas") enlazan su compra en
    // mq-purchases; los de GeoShopping en cp-purchases (19-ago-2026 — antes
    // esta función solo servía para compras y las fichas de máquinas no se
    // podían subir desde Logística).
    const purchKey = despacho.source === "maquinas" ? "mq-purchases" : "cp-purchases";
    const tStart = Date.now();
    console.group(`[uploadFichaFirmada] ${despacho.id} - ${fileObj.name} (${purchKey})`);
    try {
      // 1) Leer archivo como dataUrl
      console.log(`Leyendo archivo (${(fileObj.size / 1024 / 1024).toFixed(2)} MB)...`);
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("Error leyendo el archivo local"));
        r.readAsDataURL(fileObj);
      });

      // 2) Subir cp-file-<id> con RETRY (3 intentos con backoff)
      const fileId = uid();
      const content = { name: fileObj.name, type: fileObj.type, size: fileObj.size, dataUrl };
      console.log(`Subiendo cp-file-${fileId}...`);
      let okFile = false;
      let fileErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          okFile = await store.set(fileKeyCompra(fileId), content);
          if (okFile) {
            console.log(`Archivo subido OK en intento ${attempt}/3`);
            break;
          }
          fileErr = new Error("store.set devolvio false");
        } catch (e) { fileErr = e; }
        if (attempt < 3) {
          const delay = attempt === 1 ? 800 : 2500;
          console.warn(`Intento ${attempt}/3 fallo, reintentando en ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      if (!okFile) {
        alert(`❌ No se pudo subir la ficha a la nube despues de 3 intentos.\n\nProbable causa: conexion inestable o Supabase lento.\n\nQue hacer:\n1. Verifica el WiFi/datos moviles.\n2. Reintenta en 30 segundos.\n3. Si el archivo pesa mas de 1 MB, comprimelo (smallpdf.com).\n\nDetalle tecnico: ${fileErr?.message || "fallo silencioso"}`);
        return false;
      }

      // 3) Pre-fetch cp-purchases DIRECTO de la nube (getCloud) + retry corto.
      // Antes era store.get con fallback al state del render: ante un timeout
      // se reescribia TODO cp-purchases desde una foto vieja y desaparecian
      // solicitudes que otros habian creado (fix ago 2026). Sin nube se
      // aborta: el archivo ya esta subido y el enlace se puede reintentar.
      console.log(`Pre-fetch ${purchKey} (getCloud)...`);
      let cloudPurchases = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          cloudPurchases = await store.getCloud(purchKey);
          break;
        } catch (e) {
          if (attempt === 3) {
            alert("⚠️ No hay conexión con la nube.\n\nEl archivo se subió pero NO se enlazó a la compra (no se guardó nada más, para no arriesgar solicitudes de otros). Reintentá en un momento.");
            return false;
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
      if (!Array.isArray(cloudPurchases)) {
        alert("⚠️ No se pudo leer la lista de compras desde la nube. El archivo se subió pero no se enlazó — reintentá en un momento.");
        return false;
      }
      const arr = cloudPurchases;
      const idx = arr.findIndex(p => p.id === despacho.sourcePurchaseId);
      if (idx === -1) {
        alert("⚠️ No se encontro la compra original. Puede haber sido borrada mientras subias la ficha.\n\nEl archivo ya se subio a la nube pero no se pudo enlazar. Contacta al admin.");
        return false;
      }

      // 4) MERGE robusto: solo actualizamos LA compra especifica, respetamos el resto
      // del cloud tal como esta (asi si Ana/Carolina modificaron otra compra en paralelo,
      // sus cambios no se pisan).
      const orig = arr[idx];
      // Detectar si ya tiene ficha subida (para no pisar involuntariamente)
      if (orig.delivery?.fichaFile?.fileId && orig.delivery.fichaFile.fileId !== undefined) {
        if (!confirm(`Esta compra ya tiene una ficha subida (${orig.delivery.fichaFile.name || "sin nombre"}).\n\n¿Reemplazarla con la nueva ficha?`)) {
          console.log("Usuario cancelo el reemplazo. No se guarda.");
          return false;
        }
      }
      const updated = {
        ...orig,
        deliveryStatus: "ficha_adjunta",
        delivery: {
          ...(orig.delivery || {}),
          fichaFile: { fileId, name: fileObj.name, type: fileObj.type, size: fileObj.size },
          fichaScanned: true,
          fichaUploadedAt: new Date().toISOString(),
          uploadedByLogistica: true,
        },
        audit: [
          ...(orig.audit || []),
          {
            ts: new Date().toISOString(),
            action: "ficha_uploaded_from_logistics",
            note: `Ficha firmada subida desde Logistica: ${fileObj.name}`,
          },
        ],
      };
      const nextPurchases = [...arr];
      nextPurchases[idx] = updated;
      console.log(`Guardando ${purchKey} (total ${nextPurchases.length} compras)...`);

      // 5) Save cp-purchases con retry
      let okSave = false;
      let saveErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          okSave = await store.set(purchKey, nextPurchases);
          if (okSave) break;
          saveErr = new Error("store.set devolvio false");
        } catch (e) { saveErr = e; }
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt === 1 ? 800 : 2500));
      }
      if (!okSave) {
        alert(`⚠️ El archivo se subio (cp-file-${fileId}) pero NO se pudo enlazar a la compra despues de 3 intentos.\n\nQue hacer:\n1. Verifica el WiFi.\n2. Recarga la pagina (Cmd+Shift+R) y reintenta.\n\nLa ficha esta en cloud pero huerfana. Si vuelves a subir, se creara una nueva ref (no es problema, hay stock de storage).\n\nError: ${saveErr?.message || "fallo silencioso"}`);
        return false;
      }

      // 6) VERIFY post-save: re-fetch la MISMA key donde se guardó (purchKey)
      // y confirmar que la compra efectivamente tiene la ficha en cloud.
      // OJO: acá estaba hardcodeado "cp-purchases" — con un despacho de
      // maquinaria el verify leía la lista equivocada y SIEMPRE reportaba
      // fallo aunque la ficha sí se hubiera guardado (fix 19-ago-2026).
      console.log("Verify post-save...");
      try {
        const verify = await store.getCloud(purchKey);
        const verifyArr = Array.isArray(verify) ? verify : [];
        const verified = verifyArr.find(p => p.id === despacho.sourcePurchaseId);
        if (!verified?.delivery?.fichaFile?.fileId) {
          alert(`⚠️ VERIFICACION FALLO: ${purchKey} se guardo pero la compra no muestra la ficha en cloud. Esto indica un problema de sincronizacion.\n\nRecarga la pagina y verifica manualmente. Si el problema persiste, contacta al admin.`);
          console.error("Verify fallo. Enviado:", updated, "| Cloud devolvio:", verified);
          return false;
        }
        if (verified.delivery.fichaFile.fileId !== fileId) {
          console.warn("Verify: cloud tiene una fileId distinta —", verified.delivery.fichaFile.fileId, "vs", fileId, ". Posible race condition con otro usuario.");
          // No fallar, el otro usuario gano — reportar pero no revertir.
        }
      } catch (e) {
        console.warn("No se pudo verificar post-save:", e?.message || e);
        // No fallamos por esto — el save reporto OK, asumimos que fue.
      }

      // 7) Actualizar state local
      if (purchKey === "cp-purchases") setPurchases(nextPurchases); else setMqPurchases(nextPurchases);

      // 8) Marcar despacho como ficha subida (con el helper existente)
      await saveDespachosWithMerge((base) => base.map(d => d.id === despacho.id ? {
        ...d,
        fichaRecibidoFileId: fileId,
        fichaRecibidoUploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } : d), { label: `uploadFichaFirmada-flag ${despacho.id}` });

      console.log(`OK. Total: ${Date.now() - tStart}ms`);
      return true;
    } catch (err) {
      console.error("uploadFichaFirmada error inesperado:", err);
      alert(`Error inesperado subiendo la ficha: ${err?.message || err}\n\nAbri la consola del navegador (Cmd+Option+I) y avisale al admin con lo que salga en rojo.`);
      return false;
    } finally {
      console.groupEnd();
    }
  };

  // ═══════════════════════════ CÁLCULOS COMUNES ═══════════════════════════
  const alertasFlota = vehicles.map(v => ({ v, a: alertasVehiculo(v, hoy) })).filter(x => x.a.length);
  const rendDe = (vid) => rendimientoCombustible(cargas.filter(c => c.vehicleId === vid));
  const statsFlota = {
    total: vehicles.length,
    disponibles: vehicles.filter(v => v.estado === "operativo").length,
    proyecto: vehicles.filter(v => v.estado === "asignado").length,
    taller: vehicles.filter(enTaller).length,
    fuera: vehicles.filter(v => v.estado === "fuera_servicio").length,
  };
  const despAbiertos_ = despachos.filter(d => d.estado === "pendiente" || d.estado === "programado" || d.estado === "en_ruta");
  const statsDesp = {
    porHacer: despachos.filter(d => d.estado === "pendiente").length,
    programados: despachos.filter(d => d.estado === "programado").length,
    enRuta: despachos.filter(d => d.estado === "en_ruta").length,
    atrasados: despAbiertos_.filter(d => urgenciaDespacho(d, hoy)?.nivel === "atrasado").length,
    hoy: despachos.filter(d => (d.estado === "entregado" || d.estado === "cerrado") && d.fechaEjecutada === hoy).length,
  };
  const sinFichaDe = (d) => { const c = compraDe(d); return !!(c && (d.source === "compra" || d.source === "maquinas") && !c.delivery?.fichaFile?.fileId && c.deliveryStatus !== "cerrado" && !(c.conta?.fileId || c.conta?.facturaFile?.fileId || c.conta?.legacy)); };

  // ═══════════════════════════ PIEZAS DE UI ═══════════════════════════
  const tile = (v, l, c, onClick) => <div key={l} className={`gt-vidrio${onClick ? " gt-vidrio-hover" : ""}`} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} style={{ padding: isMobile ? "12px 14px" : "14px 18px", cursor: onClick ? "pointer" : "default", minWidth: 0 }}>
    <div style={{ font: `800 ${isMobile ? 22 : 26}px/1 var(--display)`, color: c || CHARCOAL, letterSpacing: "-.02em" }}>{v}</div>
    <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 7, fontSize: 9.5 }}>{l}</div>
  </div>;
  const tiles = (items) => isMobile ? <TiraMovil items={items.map(([v, l, c]) => ({ v, l, c }))} /> : <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, gap: 12 }}>{items.map(([v, l, c, fn]) => tile(v, l, c, fn))}</div>;
  const pills = (opts, val, set) => <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{opts.map(([k, l, n]) => { const on = k === val; return <button key={k} type="button" onClick={() => set(k)} aria-pressed={on} style={{ padding: "7px 14px", borderRadius: 999, border: on ? "1px solid transparent" : "1px solid rgba(44,42,40,.1)", background: on ? ORANGE_DARK : "rgba(255,255,255,.8)", color: on ? "#fff" : "var(--text-2)", font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", gap: 7, alignItems: "center" }}>{l}{n != null && <span style={{ opacity: on ? .85 : .55, fontSize: 11 }}>{n}</span>}</button>; })}</div>;
  const buscador = (val, set, ph) => <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
    <input value={val} onChange={e => set(e.target.value)} placeholder={ph} style={{ width: "100%", boxSizing: "border-box", height: 40, padding: "0 14px 0 36px", borderRadius: 12, border: "1px solid rgba(44,42,40,.1)", background: "rgba(255,255,255,.85)", fontSize: 14, fontFamily: "inherit", outline: "none", color: CHARCOAL }} />
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8C857D" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 12, top: 12 }} aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
  </div>;
  const selChico = (val, set, opts, vacio) => <select value={val} onChange={e => set(e.target.value)} style={{ height: 40, padding: "0 12px", borderRadius: 12, border: "1px solid rgba(44,42,40,.1)", background: "rgba(255,255,255,.85)", fontSize: 13.5, fontFamily: "inherit", color: CHARCOAL, maxWidth: 260 }}>
    <option value="">{vacio}</option>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>;
  const cajaTitulo = (t, extra) => <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14 }}><div className="gt-label" style={{ color: "var(--text-3)" }}>{t}</div>{extra}</div>;
  const vacio = (txt) => <div className="gt-vidrio" style={{ padding: "34px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>{txt}</div>;
  const linkBtn = (txt, fn, color) => <button type="button" onClick={(e) => { e.stopPropagation(); fn(); }} style={{ background: "none", border: "none", padding: "4px 0", color: color || "var(--text-3)", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>{txt}</button>;
  const abrirFicha = (v, tab = "mant") => { _setSec("flota"); try { sessionStorage.setItem("gt-lg-sec", "flota"); } catch { /* */ } setFichaTab(tab); setFichaId(v.id); };

  // Barras verticales simples (animadas)
  const barras = (datos, { alto = 150, fmt = (x) => x, apiladas = null } = {}) => {
    const max = Math.max(1, ...datos.map(d => apiladas ? apiladas.reduce((s, k) => s + (d[k] || 0), 0) : d.v));
    return <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: alto + 34 }}>
      {datos.map((d, i) => {
        const total = apiladas ? apiladas.reduce((s, k) => s + (d[k] || 0), 0) : d.v;
        return <div key={d.k} title={`${d.l}: ${fmt(total)}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ font: "700 10.5px/1 var(--sans)", color: total ? CHARCOAL : "var(--text-faint)", whiteSpace: "nowrap" }}>{total ? fmt(total) : ""}</div>
          <div style={{ width: "100%", maxWidth: 38, height: alto, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            {(apiladas || ["v"]).slice().reverse().map((k, j) => { const val = apiladas ? d[k] || 0 : d.v; const col = apiladas ? (k === apiladas[0] ? CHARCOAL : ORANGE) : (i === datos.length - 1 ? ORANGE : CHARCOAL); return <div key={k} style={{ height: anim ? `${val / max * 100}%` : "0%", background: col, borderRadius: j === 0 ? "7px 7px 0 0" : 0, transition: `height 1.2s cubic-bezier(.22,1,.36,1) ${i * 70}ms` }} />; })}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>{d.l}</div>
        </div>;
      })}
    </div>;
  };
  const dona = (segs, { size = 150, centro, sub } = {}) => {
    const total = segs.reduce((s, x) => s + x.v, 0) || 1;
    const r = 52, C = 2 * Math.PI * r; let acc = 0;
    return <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 140 140" width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(44,42,40,.06)" strokeWidth="16" />
        {segs.filter(s => s.v > 0).map((s) => { const len = s.v / total * C; const el = <circle key={s.l} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16" style={{ strokeDasharray: `${anim ? Math.max(0, len - 2) : 0} ${C}`, strokeDashoffset: -acc, transition: "stroke-dasharray 1.4s cubic-bezier(.22,1,.36,1)" }}><title>{`${s.l}: ${s.v}`}</title></circle>; acc += len; return el; })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ font: "800 26px/1 var(--display)", color: CHARCOAL }}>{centro}</div>
        {sub && <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>}
      </div>
    </div>;
  };

  // ═══════════════════════════ DASHBOARD ═══════════════════════════
  const renderDashboard = () => {
    const meses = ultimosMeses(hoy, 6);
    const ent = entregasPorMes(despachos);
    const comb = gastoCombustiblePorMes(cargas);
    const mant = {}; maintenances.forEach(m => { const k = String(m.fecha || "").slice(0, 7); mant[k] = (mant[k] || 0) + (Number(m.cost) || 0); });
    const urgentes = despAbiertos_.map(d => ({ d, u: urgenciaDespacho(d, hoy) })).sort((a, b) => (a.u ? a.u.dias : 999) - (b.u ? b.u.dias : 999)).slice(0, 5);
    const rend = vehicles.map(v => ({ v, r: rendDe(v.id) })).filter(x => x.r.kmPorGal).sort((a, b) => b.r.kmPorGal - a.r.kmPorGal);
    const segEstados = ESTADOS_VEHICULO.map(e => ({ l: e.label, v: vehicles.filter(v => (v.estado || "operativo") === e.value).length, color: { operativo: "#3E8E5A", asignado: CHARCOAL, mantenimiento: "#C99A06", reparacion: ORANGE, fuera_servicio: "#C0392B" }[e.value] }));
    const caja = (children, extra = {}) => <div className="gt-vidrio" style={{ padding: isMobile ? 16 : 20, minWidth: 0, display: "flex", flexDirection: "column", ...extra }}>{children}</div>;
    const nivelC = { vencido: C_ROJO, pronto: C_NARANJA, pend: C_GRIS };
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {tiles([
        [statsFlota.total, "vehículos"],
        [statsFlota.disponibles, "disponibles", "#177243", () => { setSec("flota"); setFlota(f => ({ ...f, estado: "operativo" })); }],
        [statsFlota.proyecto, "en proyecto", undefined, () => { setSec("flota"); setFlota(f => ({ ...f, estado: "asignado" })); }],
        [statsFlota.taller + statsFlota.fuera, "en taller o fuera", statsFlota.taller + statsFlota.fuera ? ORANGE_DARK : undefined, () => { setSec("flota"); setFlota(f => ({ ...f, estado: "taller" })); }],
        [statsDesp.porHacer + statsDesp.programados + statsDesp.enRuta, "despachos abiertos", undefined, () => setSec("rutas")],
      ])}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr)", gap: 14 }}>
        {caja(<>
          {cajaTitulo("Despachos", <button type="button" onClick={() => setSec("rutas")} style={{ background: "none", border: "none", color: "var(--naranja-texto-chico)", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Ver todos →</button>)}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
            {[[statsDesp.porHacer, "por hacer", ORANGE_DARK], [statsDesp.programados + statsDesp.enRuta, "en camino"], [statsDesp.atrasados, "atrasados", statsDesp.atrasados ? "#B03024" : undefined], [statsDesp.hoy, "hoy", "#177243"]].map(([v, l, c]) => <div key={l} style={{ padding: "10px 8px", borderRadius: 14, background: "rgba(44,42,40,.04)", textAlign: "center" }}><div style={{ font: "800 21px/1 var(--display)", color: c || CHARCOAL }}>{v}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 5 }}>{l}</div></div>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {urgentes.length === 0 && <div style={{ fontSize: 13, color: "var(--text-3)" }}>Nada pendiente.</div>}
            {urgentes.map(({ d, u }) => <button key={d.id} type="button" onClick={() => { setSec("rutas"); setDespVista(vistaDeDespacho(d)); setDespAbiertos(a => { const n = { ...a, [d.projectCode || "__sin__"]: true }; escribirLS("gt-lg-abiertos", n); return n; }); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, border: "none", background: "rgba(255,255,255,.6)", cursor: "pointer", textAlign: "left", fontFamily: "inherit", minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: u?.nivel === "atrasado" ? "#C0392B" : u && (u.nivel === "hoy" || u.nivel === "manana") ? ORANGE : "#B8B1A8", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.descripcion}</span>
              <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{d.projectCode}</span>
              {u && <Chip c={URG_C[u.nivel]} style={{ fontSize: 10.5, padding: "3px 8px" }}>{u.txt}</Chip>}
            </button>)}
          </div>
        </>)}
        {caja(<>
          {cajaTitulo("Alertas de la flota", <span style={{ font: "800 13px/1 var(--sans)", color: alertasFlota.length ? ORANGE_DARK : "var(--text-3)" }}>{alertasFlota.length}</span>)}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 290, overflowY: "auto", scrollbarWidth: "thin" }}>
            {alertasFlota.length === 0 && <div style={{ fontSize: 13, color: "var(--text-3)" }}>Todo en orden.</div>}
            {alertasFlota.sort((a, b) => (a.a.some(x => x.nivel === "vencido") ? 0 : 1) - (b.a.some(x => x.nivel === "vencido") ? 0 : 1)).map(({ v, a }) => <button key={v.id} type="button" onClick={() => abrirFicha(v, a[0].tipo === "pend" ? "pend" : "mant")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, border: "none", background: "rgba(255,255,255,.6)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ font: "800 11.5px/1 var(--mono)", color: CHARCOAL, minWidth: 74 }}>{v.plate}</span>
              <span style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>{a.map((x, i) => <Chip key={i} c={nivelC[x.nivel]} style={{ fontSize: 10.5, padding: "3px 8px" }}>{x.txt}</Chip>)}</span>
            </button>)}
          </div>
        </>)}
        {caja(<>
          {cajaTitulo("La flota hoy")}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            {dona(segEstados, { centro: vehicles.length, sub: "vehículos" })}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              {segEstados.filter(s => s.v).map(s => <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} /><span style={{ flex: 1, color: "var(--text-2)" }}>{s.l}</span><b style={{ color: CHARCOAL }}>{s.v}</b></div>)}
            </div>
          </div>
        </>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))", gap: 14 }}>
        {caja(<>{cajaTitulo("Entregas por mes")}{barras(meses.map(k => ({ k, l: mesLabel(k), v: ent[k] || 0 })))}</>)}
        {caja(<>{cajaTitulo("Gasto de la flota", <span style={{ display: "flex", gap: 10, fontSize: 10.5, color: "var(--text-3)" }}><span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: CHARCOAL, marginRight: 4 }} />taller</span><span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: ORANGE, marginRight: 4 }} />combustible</span></span>)}{meses.some(k => (mant[k] || 0) + (comb[k] || 0) > 0) ? barras(meses.map(k => ({ k, l: mesLabel(k), mant: mant[k] || 0, comb: comb[k] || 0 })), { apiladas: ["mant", "comb"], fmt: fmtCorto }) : <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.5 }}>Sale con el costo de los mantenimientos y las cargas de combustible.</div>}</>)}
        {caja(<>
          {cajaTitulo("Rendimiento · km por galón")}
          {rend.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.5 }}>Sale solo cuando un vehículo tiene dos cargas con el tanque lleno.<div style={{ marginTop: 12 }}>{canEdit && <Btn small onClick={() => setModal({ t: "carga" })}>Cargar combustible</Btn>}</div></div>
            : <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>{rend.slice(0, 7).map(({ v, r }) => { const max = rend[0].r.kmPorGal; return <button key={v.id} type="button" onClick={() => abrirFicha(v, "comb")} style={{ display: "grid", gridTemplateColumns: "74px minmax(0,1fr) 44px", gap: 8, alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ font: "800 11.5px/1 var(--mono)", color: CHARCOAL, textAlign: "left" }}>{v.plate}</span>
              <span style={{ height: 8, borderRadius: 99, background: "rgba(44,42,40,.06)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: anim ? `${r.kmPorGal / max * 100}%` : "0%", background: ORANGE, borderRadius: 99, transition: "width 1.2s cubic-bezier(.22,1,.36,1)" }} /></span>
              <span style={{ font: "800 12.5px/1 var(--sans)", color: CHARCOAL, textAlign: "right" }}>{nf1(r.kmPorGal)}</span>
            </button>; })}</div>}
        </>)}
      </div>
    </div>;
  };

  // ═══════════════════════════ FLOTA ═══════════════════════════
  const carnet = (v) => {
    const e = estadoCfg(v.estado);
    const al = alertasVehiculo(v, hoy);
    const mot = v.motoristaEmpId ? emps.find(x => x.id === v.motoristaEmpId) : null;
    const abrirConVuelo = (ev) => { const r = ev.currentTarget.getBoundingClientRect(); if (!prefiereQuieto()) setVuelo({ id: v.id, fase: "abrir", desde: { left: r.left, top: r.top, width: r.width, height: r.height }, frente: ev.currentTarget.outerHTML }); abrirFicha(v); };
    return <div key={v.id} data-veh={v.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={abrirConVuelo} onKeyDown={ev => { if (ev.key === "Enter") abrirConVuelo(ev); }} style={{ padding: 0, overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column", visibility: vuelo && vuelo.id === v.id && vuelo.fase === "cerrar" ? "hidden" : "visible" }}>
      <div style={{ position: "relative", height: 58, background: "linear-gradient(135deg,#2C2A28 0%,#3A3633 100%)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {CURVAS_FRANJA}
        <span style={{ position: "relative", font: "700 9px/1 var(--mono)", letterSpacing: ".16em", color: "rgba(255,255,255,.85)", textTransform: "uppercase" }}>{String(v.owner || "").replace(" Soluciones", "").replace(" Honduras", "")}</span>
        <span style={{ position: "relative", font: "700 10px/1 var(--sans)", padding: "4px 9px", borderRadius: 999, background: "rgba(255,255,255,.14)", color: "#fff" }}>{TIPO_CORTO[v.type] || v.type}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: -30, position: "relative" }}>
        <div style={{ width: isMobile ? 122 : 150, height: isMobile ? 72 : 88, borderRadius: 18, background: "#fff", boxShadow: "0 6px 18px rgba(44,42,40,.16)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff" }}>
          <Foto fileId={v.foto?.fileId} alt={v.plate} style={{ width: isMobile ? 122 : 150, height: isMobile ? 72 : 88 }} fallback={<Silueta tipo={v.type} size={isMobile ? 76 : 92} />} />
        </div>
      </div>
      <div style={{ padding: "12px 14px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, flex: 1 }}>
        <Placa plate={v.plate} />
        <div style={{ font: "800 14.5px/1.2 var(--display)", color: CHARCOAL, textAlign: "center" }}>{[v.brand, v.model].filter(Boolean).join(" ") || "—"}{v.year ? <span style={{ fontWeight: 600, color: "var(--text-3)" }}> · {v.year}</span> : null}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", textAlign: "center", minHeight: 14 }}>{mot ? mot.fullName.split(" ").slice(0, 2).join(" ") : v.motorista || (v.projectCode || "")}</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingTop: 9, borderTop: "1px solid rgba(44,42,40,.07)", gap: 8 }}>
          <span style={{ font: "700 11px/1 var(--mono)", color: "var(--text-2)" }}>{v.kmActual ? `${nf0(v.kmActual)} km` : "— km"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 11px/1 var(--sans)", color: "var(--text-2)" }}>
            {al.some(x => x.nivel === "vencido") && <span title={al.map(x => x.txt).join(" · ")} style={{ width: 16, height: 16, borderRadius: "50%", background: "#C0392B", color: "#fff", font: "900 10px/16px var(--display)", textAlign: "center" }}>!</span>}
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: e.dot }} />{e.label}
          </span>
        </div>
      </div>
    </div>;
  };

  const renderFlota = () => {
    if (fichaId) { const v = vehDe(fichaId); if (v) return renderFicha(v); }
    const q = flota.q.trim().toLowerCase();
    const lista = vehicles.filter(v => {
      if (flota.estado === "taller" ? !(enTaller(v) || v.estado === "fuera_servicio") : flota.estado && (v.estado || "operativo") !== flota.estado) return false;
      if (flota.tipo && v.type !== flota.tipo) return false;
      if (q && ![v.plate, v.brand, v.model, v.motorista, v.projectCode, v.color].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => String(a.plate).localeCompare(String(b.plate)));
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {tiles([[statsFlota.total, "vehículos"], [statsFlota.disponibles, "disponibles", "#177243"], [statsFlota.proyecto, "en proyecto"], [statsFlota.taller, "en taller", statsFlota.taller ? ORANGE_DARK : undefined], [statsFlota.fuera, "fuera de servicio", statsFlota.fuera ? "#B03024" : undefined]])}
      <div className="gt-vidrio" style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {buscador(flota.q, (x) => setFlota(f => ({ ...f, q: x })), "Placa, marca, motorista…")}
        {pills([["", "Todos", vehicles.length], ["operativo", "Disponibles"], ["asignado", "En proyecto"], ["taller", "Taller / fuera"]], flota.estado, (x) => setFlota(f => ({ ...f, estado: x })))}
        {selChico(flota.tipo, (x) => setFlota(f => ({ ...f, tipo: x })), TIPOS_VEHICULO.map(t => ({ value: t, label: TIPO_CORTO[t] })), "Todo tipo")}
        {canEdit && <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <Btn variant="ghost" onClick={() => setModal({ t: "carga" })}><Ico d={ICO.gota} size={15} />Combustible</Btn>
          <Btn onClick={() => setModal({ t: "veh" })}><Ico d={ICO.mas} size={15} />Vehículo</Btn>
        </div>}
      </div>
      {lista.length === 0 ? vacio("Ningún vehículo con esos filtros.") :
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(auto-fill, minmax(232px, 1fr))", gap: isMobile ? 10 : 14 }}>{lista.map(carnet)}</div>}
    </div>;
  };

  // ── FICHA DEL VEHÍCULO ──
  const renderFicha = (v) => {
    const e = estadoCfg(v.estado);
    const mot = v.motoristaEmpId ? emps.find(x => x.id === v.motoristaEmpId) : null;
    const prev = estadoPreventivo(v, hoy);
    const r = rendDe(v.id);
    const mants = maintenances.filter(m => m.vehicleId === v.id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const cargasV = cargas.filter(c => c.vehicleId === v.id).sort((a, b) => (Number(b.km) || 0) - (Number(a.km) || 0));
    const pend = parsePendientes(v.pendientesReparacion);
    const despV = despachos.filter(d => d.vehicleId === v.id).sort((a, b) => String(b.fechaEjecutada || b.fechaProgramada || b.createdAt).localeCompare(String(a.fechaEjecutada || a.fechaProgramada || a.createdAt)));
    const anio = hoy.slice(0, 4);
    const gastoAnio = mants.filter(m => String(m.fecha).startsWith(anio)).reduce((s, m) => s + (Number(m.cost) || 0), 0) + cargasV.filter(c => String(c.fecha).startsWith(anio)).reduce((s, c) => s + (Number(c.monto) || 0), 0);
    const seg = vencimiento(v.seguroVence, hoy), rev = vencimiento(v.revisionVence, hoy);
    const chipVence = (x) => !x ? null : <Chip c={x.nivel === "vencido" ? C_ROJO : x.nivel === "pronto" ? C_NARANJA : C_VERDE} style={{ fontSize: 10.5, padding: "3px 8px" }}>{x.nivel === "vencido" ? "Vencido" : `${x.dias} d`}</Chip>;
    const dato = (l, val, extra) => <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(44,42,40,.06)", fontSize: 13 }}><span style={{ color: "var(--text-3)" }}>{l}</span><span style={{ color: CHARCOAL, fontWeight: 600, textAlign: "right", display: "inline-flex", gap: 6, alignItems: "center" }}>{val || "—"}{extra}</span></div>;
    const kpi = (l, val, sub, c) => <div className="gt-vidrio" style={{ padding: "14px 16px", minWidth: 0 }}>
      <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9.5 }}>{l}</div>
      <div style={{ font: "800 22px/1.1 var(--display)", color: c || CHARCOAL, marginTop: 8, letterSpacing: "-.02em" }}>{val}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 5 }}>{sub}</div>}
    </div>;
    const usosV = bitacora.filter(b => b.vehicleId === v.id && !b.anulado).sort((a, b) => String(b.salida?.at).localeCompare(String(a.salida?.at)));
    const TABS = [["bit", "Bitácora", usosV.length], ["mant", "Mantenimientos", mants.length], ["comb", "Combustible", cargasV.length], ["pend", "Pendientes", pend.length], ["desp", "Despachos", despV.length]];
    const fila = (children, key, extra = {}) => <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "rgba(255,255,255,.65)", border: "1px solid rgba(44,42,40,.06)", ...extra }}>{children}</div>;
    let cuerpo;
    if (fichaTab === "mant") cuerpo = <>
      {canEdit && <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn small onClick={() => setModal({ t: "mant", vehicleId: v.id })}><Ico d={ICO.mas} size={14} />Registrar</Btn></div>}
      {mants.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)", padding: 10 }}>Sin mantenimientos registrados.</div> : mants.map(m => { const t = tipoMantCfg(m.type); return fila(<>
        <div style={{ width: 54, textAlign: "center", flexShrink: 0 }}><div style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>{fechaCorta(m.fecha).split(" ")[0]}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>{fechaCorta(m.fecha).split(" ")[1]} {String(m.fecha).slice(2, 4)}</div></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}><Chip c={t.c} style={{ fontSize: 10.5, padding: "3px 8px" }}>{t.label}</Chip>{m.kmAlRealizar ? <span style={{ font: "600 11px/1 var(--mono)", color: "var(--text-3)" }}>{nf0(m.kmAlRealizar)} km</span> : null}{m.workshop && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>· {m.workshop}</span>}</div>
          <div style={{ fontSize: 13.5, color: CHARCOAL, whiteSpace: "pre-line" }}>{m.description}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 13.5px/1 var(--sans)", color: CHARCOAL }}>{m.cost ? fmtL(m.cost) : "—"}</div>{isAdmin && <div style={{ marginTop: 6 }}>{linkBtn("Borrar", () => { if (confirm("¿Borrar este mantenimiento?")) deleteMaintenance(m.id); }, "#B03024")}</div>}</div>
      </>, m.id); })}
    </>;
    else if (fichaTab === "comb") cuerpo = <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 10 }}>
        {[[r.kmPorGal ? nf1(r.kmPorGal) : "—", "km por galón"], [r.galPor100 ? nf1(r.galPor100) : "—", "galones / 100 km"], [r.costoKm ? `L ${r.costoKm.toFixed(2)}` : "—", "costo por km"], [cargasV.length, "cargas"]].map(([val, l]) => <div key={l} style={{ padding: "12px 14px", borderRadius: 14, background: "rgba(44,42,40,.04)" }}><div style={{ font: "800 19px/1 var(--display)", color: CHARCOAL }}>{val}</div><div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5 }}>{l}</div></div>)}
      </div>
      {r.tramos.length > 1 && <div style={{ padding: "10px 4px 0" }}><div className="gt-label" style={{ color: "var(--text-3)", marginBottom: 10 }}>km por galón en cada tanque</div>{barras(r.tramos.slice(-8).map((t, i) => ({ k: `${t.hasta}-${i}`, l: fechaCorta(t.fecha), v: Math.round(t.kmPorGal * 10) / 10 })), { alto: 90 })}</div>}
      {canEdit && <div style={{ display: "flex", justifyContent: "flex-end" }}><Btn small onClick={() => setModal({ t: "carga", vehicleId: v.id })}><Ico d={ICO.gota} size={14} />Cargar combustible</Btn></div>}
      {cargasV.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)", padding: 10 }}>Sin cargas. El rendimiento sale con dos cargas de tanque lleno.</div> : cargasV.map(c => fila(<>
        <div style={{ width: 54, textAlign: "center", flexShrink: 0 }}><div style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>{fechaCorta(c.fecha).split(" ")[0]}</div><div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 3 }}>{fechaCorta(c.fecha).split(" ")[1]}</div></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "700 13.5px/1.2 var(--sans)", color: CHARCOAL }}>{nf1(c.galones)} gal <span style={{ font: "600 11.5px/1 var(--mono)", color: "var(--text-3)", marginLeft: 6 }}>{nf0(c.km)} km</span></div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>{[c.lleno !== false ? "Tanque lleno" : "Parcial", c.estacion, c.motorista].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ font: "800 13.5px/1 var(--sans)", color: CHARCOAL }}>{c.monto ? fmtL(c.monto) : "—"}</div>{canEdit && <div style={{ marginTop: 6 }}>{linkBtn("Borrar", () => { if (confirm("¿Borrar esta carga?")) deleteCarga(c.id); }, "#B03024")}</div>}</div>
      </>, c.id))}
    </>;
    else if (fichaTab === "bit") cuerpo = usosV.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)", padding: 10 }}>Ningún motorista ha registrado este carro todavía. Lo hacen desde su teléfono en GeoLogistics → Mi carro.</div> : usosV.slice(0, 60).map(b => fila(<>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, color: CHARCOAL, fontWeight: 700 }}>{b.motorista} <span style={{ fontWeight: 500, color: "var(--text-3)", fontSize: 12 }}>· {fechaHora(b.salida.at)}{b.llegada ? ` → ${horaCorta(b.llegada.at)}` : ""}</span></div>
        <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 3, fontFamily: "var(--mono)" }}>{nf0(b.salida.km)} → {b.llegada ? nf0(b.llegada.km) : "…"} km · tanque {b.salida.combustible}{b.llegada ? ` → ${b.llegada.combustible}` : ""}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
          {!b.llegada && <Chip c={C_NARANJA} style={{ fontSize: 10.5, padding: "3px 8px" }}>En uso</Chip>}
          {b.salto > 0 && <Chip c={C_ROJO} style={{ fontSize: 10.5, padding: "3px 8px" }}>{nf0(b.salto)} km sin registro antes de esta salida</Chip>}
          {[["salida", b.salida], ["llegada", b.llegada]].filter(([, m]) => m && (m.estado === "detalle" || m.nota)).map(([t, m]) => <Chip key={t} c={m.estado === "detalle" ? C_AMARILLO : C_GRIS} style={{ fontSize: 10.5, padding: "3px 8px" }}>{t === "salida" ? "Al salir" : "Al llegar"}: {m.nota || "tiene algo"}</Chip>)}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
        <span style={{ font: "800 15px/1 var(--sans)", color: CHARCOAL }}>{b.llegada ? `${nf0(b.recorrido)} km` : "—"}</span>
        <span style={{ display: "flex", gap: 8 }}>{[["Foto salida", b.salida.fotoId], ["Foto llegada", b.llegada?.fotoId]].filter(([, id]) => id).map(([t, id]) => <span key={t}>{linkBtn(t, async () => { const f = FOTOS.has(id) ? { dataUrl: FOTOS.get(id), type: "image/jpeg", name: `${t}.jpg` } : await store.get(`cp-file-${id}`); if (f?.dataUrl) setVisorFicha(f); else alert("No se encontró la foto."); })}</span>)}</span>
        {canEdit && <span>{linkBtn("Anular", async () => { const m = prompt("¿Por qué se anula este registro?"); if (!m || m.trim().length < 3) return; await guardarLista("lg-bitacora", setBitacora, base => base.map(x => x.id === b.id ? { ...x, anulado: true, anuladoPor: userName, anuladoAt: new Date().toISOString(), motivoAnulacion: m.trim() } : x)); }, "#B03024")}</span>}
      </div>
    </>, b.id));
    else if (fichaTab === "pend") cuerpo = <>
      {pend.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)", padding: 10 }}>Sin pendientes.</div> : pend.map(p => fila(<>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: ORANGE, flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 13.5, color: CHARCOAL }}>{p.clean}</div>
        {canEdit && <Btn small variant="success" onClick={() => setModal({ t: "mant", vehicleId: v.id, prefill: { tipo: "correctivo", descripcion: p.clean, rawLine: p.raw } })}><Ico d={ICO.check} size={14} />Resuelto</Btn>}
      </>, p.idx))}
      {canEdit && <form onSubmit={async (ev) => { ev.preventDefault(); const inp = ev.currentTarget.elements.nuevo; const t = inp.value.trim(); if (!t) return; inp.value = ""; await patchVehicle(v.id, (x) => ({ pendientesReparacion: [x.pendientesReparacion, t].filter(s => String(s || "").trim()).join("\n") })); }} style={{ display: "flex", gap: 8 }}>
        <input name="nuevo" placeholder="Agregar pendiente…" style={{ flex: 1, height: 40, padding: "0 14px", borderRadius: 12, border: "1px solid rgba(44,42,40,.1)", background: "rgba(255,255,255,.85)", fontSize: 14, fontFamily: "inherit", outline: "none" }} />
        <Btn type="submit" variant="ghost">Agregar</Btn>
      </form>}
    </>;
    else cuerpo = despV.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-3)", padding: 10 }}>Este vehículo no tiene despachos.</div> : despV.slice(0, 40).map(d => { const es = estadoDespCfg(d.estado); return fila(<>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.descripcion}</div><div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>{d.origen} → {d.destino}{d.motorista ? ` · ${d.motorista}` : ""}</div></div>
      <div style={{ textAlign: "right", flexShrink: 0 }}><Chip c={es.c} style={{ fontSize: 10.5, padding: "3px 8px" }}>{es.label}</Chip><div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{fechaCorta(d.fechaEjecutada || d.fechaProgramada)}</div></div>
    </>, d.id); });

    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" className="gt-circulo" onClick={volverAFlota} aria-label="Volver a la flota" style={{ width: 36, height: 36, fontSize: 15 }}>←</button>
        <span style={{ font: "700 13px/1 var(--sans)", color: "var(--text-3)" }}>Flota</span><Ico d={ICO.flecha} size={13} color="rgba(44,42,40,.35)" /><span style={{ font: "800 13px/1 var(--sans)", color: CHARCOAL }}>{v.plate}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "330px minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        {/* Columna izquierda: el carnet grande + datos */}
        <div className="gt-vidrio" data-ficha-carnet={v.id} style={{ padding: 0, overflow: "hidden", visibility: vuelo && vuelo.id === v.id && vuelo.fase === "abrir" ? "hidden" : "visible" }}>
          <div style={{ position: "relative", height: 74, background: "linear-gradient(135deg,#2C2A28 0%,#3A3633 100%)", padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
            {CURVAS_FRANJA}
            <span style={{ position: "relative", font: "700 9.5px/1 var(--mono)", letterSpacing: ".16em", color: "rgba(255,255,255,.85)", textTransform: "uppercase" }}>{v.owner}</span>
            <span style={{ position: "relative", alignSelf: "flex-start", font: "700 10.5px/1 var(--sans)", padding: "5px 10px", borderRadius: 999, background: "rgba(255,255,255,.14)", color: "#fff" }}>{TIPO_CORTO[v.type] || v.type}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: -40, position: "relative" }}>
            <label style={{ position: "relative", width: 250, height: 150, borderRadius: 22, background: "#fff", boxShadow: "0 8px 22px rgba(44,42,40,.18)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: "4px solid #fff", cursor: canEdit ? "pointer" : "default" }} title={canEdit ? "Cambiar foto" : ""}>
              <Foto fileId={v.foto?.fileId} alt={v.plate} style={{ width: 250, height: 150 }} fallback={<Silueta tipo={v.type} size={150} />} />
              {canEdit && <span style={{ position: "absolute", right: 8, bottom: 8, width: 32, height: 32, borderRadius: "50%", background: "rgba(44,42,40,.72)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico d={ICO.camara} size={16} /></span>}
              {canEdit && <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (ev) => { const fl = ev.target.files?.[0]; ev.target.value = ""; await subirFotoVehiculo(v, fl); }} />}
            </label>
          </div>
          <div style={{ padding: "14px 18px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <Placa plate={v.plate} grande />
            <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL, textAlign: "center" }}>{[v.brand, v.model].filter(Boolean).join(" ")}{v.year ? <span style={{ fontWeight: 600, color: "var(--text-3)" }}> · {v.year}</span> : null}</div>
            <Chip c={e.c}>{e.label}</Chip>
            <div style={{ width: "100%", marginTop: 6 }}>
              {dato("Proyecto", v.projectCode)}
              {dato("Motorista", mot ? mot.fullName : v.motorista)}
              {dato("Color", v.color)}
              {dato("Combustible", v.combustible)}
              {v.vin && dato("VIN / chasis", v.vin)}
              {v.motor && dato("Motor", v.motor)}
              {dato("Seguro", v.seguro, chipVence(seg))}
              {v.seguroPoliza && dato("Póliza", v.seguroPoliza)}
              {dato("Revisión", v.revisionVence ? fmtFecha(v.revisionVence) : "", chipVence(rev))}
              {v.notas && <div style={{ fontSize: 12.5, color: "var(--text-2)", padding: "10px 0 0", borderTop: "1px solid rgba(44,42,40,.06)", whiteSpace: "pre-line" }}>{v.notas}</div>}
            </div>
            {canEdit && <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <Btn small variant="ghost" onClick={() => setModal({ t: "veh", d: v })}><Ico d={ICO.lapiz} size={14} />Editar</Btn>
              {isAdmin && <Btn small variant="danger" onClick={async () => { if (!confirm(`¿Eliminar el vehículo ${v.plate}? No se puede deshacer.`)) return; if (await deleteVehicle(v.id)) setFichaId(null); }}>Eliminar</Btn>}
            </div>}
          </div>
        </div>
        {/* Columna derecha */}
        <div className={vuelo && vuelo.id === v.id && vuelo.fase === "abrir" ? "lg-ficha-entra" : ""} style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))", gap: 12 }}>
            {kpi("Kilometraje", v.kmActual ? nf0(v.kmActual) : "—", canEdit ? <button type="button" onClick={async () => { const n = prompt("Kilometraje actual del odómetro:", v.kmActual || ""); if (n == null) return; const k = Number(String(n).replace(/[^\d.]/g, "")); if (!(k > 0)) return; await patchVehicle(v.id, { kmActual: k }); }} style={{ background: "none", border: "none", padding: 0, color: "var(--naranja-texto-chico)", font: "700 11.5px/1 var(--sans)", cursor: "pointer" }}>Actualizar</button> : "km")}
            <div className="gt-vidrio" style={{ padding: "14px 16px", minWidth: 0 }}>
              <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9.5 }}>Próximo servicio</div>
              <div style={{ font: "800 20px/1.1 var(--display)", color: URG_P[prev.urgencia].c.color, marginTop: 8 }}>{prev.urgencia === "sin_plan" ? "Sin plan" : prev.kmFalta !== null ? (prev.kmFalta < 0 ? `+${nf0(-prev.kmFalta)} km` : `${nf0(prev.kmFalta)} km`) : `${prev.diasFalta} d`}</div>
              {prev.pct !== null && <div style={{ height: 6, borderRadius: 99, background: "rgba(44,42,40,.07)", marginTop: 8, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, prev.pct * 100)}%`, background: URG_P[prev.urgencia].bar, borderRadius: 99 }} /></div>}
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 5 }}>{prev.urgencia === "vencido" ? "atrasado" : prev.urgencia === "sin_plan" ? "cargá el próximo km" : v.proxMantenimientoKm ? `a los ${nf0(v.proxMantenimientoKm)}` : fmtFecha(v.proxMantenimientoFecha)}</div>
            </div>
            {kpi("Rendimiento", r.kmPorGal ? nf1(r.kmPorGal) : "—", "km por galón")}
            {kpi(`Gasto ${anio}`, fmtCorto(gastoAnio), "taller + combustible")}
          </div>
          <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            {pills(TABS, fichaTab, setFichaTab)}
            {cuerpo}
          </div>
        </div>
      </div>
    </div>;
  };

  // ═══════════════════════════ MANTENIMIENTOS ═══════════════════════════
  const renderMant = () => {
    const prog = vehicles.map(v => ({ v, p: estadoPreventivo(v, hoy) })).sort((a, b) => ORDEN_URGENCIA[a.p.urgencia] - ORDEN_URGENCIA[b.p.urgencia] || (a.p.kmFalta ?? 1e9) - (b.p.kmFalta ?? 1e9));
    const pendV = vehicles.map(v => ({ v, items: parsePendientes(v.pendientesReparacion) })).filter(x => x.items.length);
    const nPend = pendV.reduce((s, x) => s + x.items.length, 0);
    const mes = hoy.slice(0, 7), anio = hoy.slice(0, 4);
    const gMes = maintenances.filter(m => String(m.fecha).startsWith(mes)).reduce((s, m) => s + (Number(m.cost) || 0), 0);
    const gAnio = maintenances.filter(m => String(m.fecha).startsWith(anio)).reduce((s, m) => s + (Number(m.cost) || 0), 0);
    const vencidos = prog.filter(x => x.p.urgencia === "vencido").length, pronto = prog.filter(x => x.p.urgencia === "pronto").length;
    let hist = maintenances.slice();
    if (mantFil.vehicleId) hist = hist.filter(m => m.vehicleId === mantFil.vehicleId);
    if (mantFil.type) hist = hist.filter(m => m.type === mantFil.type);
    if (mantFil.mes) hist = hist.filter(m => String(m.fecha).startsWith(mantFil.mes));
    hist.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const mesesHist = [...new Set(maintenances.map(m => String(m.fecha).slice(0, 7)))].sort().reverse();
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {tiles([[vencidos, "servicios atrasados", vencidos ? "#B03024" : undefined, () => setMantSub("programa")], [pronto, "servicios próximos", pronto ? ORANGE_DARK : undefined, () => setMantSub("programa")], [nPend, "pendientes de reparación", undefined, () => setMantSub("pend")], [fmtCorto(gMes), "gasto del mes"], [fmtCorto(gAnio), `gasto ${anio}`]])}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {pills([["programa", "Programa preventivo", prog.filter(x => x.p.urgencia !== "sin_plan").length], ["pend", "Pendientes", nPend], ["hist", "Historial", maintenances.length]], mantSub, setMantSub)}
        {canEdit && <div style={{ marginLeft: "auto" }}><Btn onClick={() => setModal({ t: "mant" })}><Ico d={ICO.mas} size={15} />Registrar mantenimiento</Btn></div>}
      </div>
      {mantSub === "programa" && <div className="gt-vidrio" style={{ padding: isMobile ? 8 : 10, display: "flex", flexDirection: "column", gap: 4 }}>
        {prog.map(({ v, p }) => <div key={v.id} role="button" tabIndex={0} onClick={() => abrirFicha(v, "mant")} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "110px minmax(0,1.1fr) minmax(0,1.4fr) 130px auto", gap: 14, alignItems: "center", padding: "11px 12px", borderRadius: 14, cursor: "pointer", background: p.urgencia === "vencido" ? "rgba(192,57,43,.05)" : "transparent" }}>
          {!isMobile && <Placa plate={v.plate} />}
          <div style={{ minWidth: 0 }}>{isMobile && <div style={{ font: "800 12px/1 var(--mono)", color: CHARCOAL, marginBottom: 4 }}>{v.plate}</div>}<div style={{ font: "700 13.5px/1.2 var(--sans)", color: CHARCOAL }}>{[v.brand, v.model].filter(Boolean).join(" ")}</div><div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>{v.kmActual ? `${nf0(v.kmActual)} km` : "sin km"} · cada {nf0(intervaloKmDe(v))} km</div></div>
          {!isMobile && <div style={{ height: 8, borderRadius: 99, background: "rgba(44,42,40,.07)", overflow: "hidden" }}>{p.pct !== null && <div style={{ height: "100%", width: `${Math.min(100, p.pct * 100)}%`, background: URG_P[p.urgencia].bar, borderRadius: 99 }} />}</div>}
          <div style={{ textAlign: isMobile ? "right" : "left" }}><Chip c={URG_P[p.urgencia].c} style={{ fontSize: 11 }}>{p.urgencia === "sin_plan" ? "Sin plan" : p.kmFalta !== null ? (p.kmFalta < 0 ? `Atrasado ${nf0(-p.kmFalta)} km` : `Faltan ${nf0(p.kmFalta)} km`) : p.diasFalta < 0 ? `Atrasado ${-p.diasFalta} d` : `En ${p.diasFalta} d`}</Chip></div>
          {!isMobile && <div onClick={e => e.stopPropagation()}>{canEdit && <Btn small variant={p.urgencia === "vencido" ? "primary" : "ghost"} onClick={() => setModal({ t: "mant", vehicleId: v.id, prefill: { tipo: "preventivo" } })}>Registrar servicio</Btn>}</div>}
        </div>)}
      </div>}
      {mantSub === "pend" && (pendV.length === 0 ? vacio("Ningún vehículo tiene pendientes de reparación.") : <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
        {pendV.map(({ v, items }) => <div key={v.id} className="gt-vidrio" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div role="button" tabIndex={0} onClick={() => abrirFicha(v, "pend")} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 4 }}><Placa plate={v.plate} /><div style={{ minWidth: 0 }}><div style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>{[v.brand, v.model].filter(Boolean).join(" ")}</div><div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{estadoCfg(v.estado).label}</div></div></div>
          {items.map(p => <div key={p.idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,.65)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: ORANGE, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: CHARCOAL }}>{p.clean}</span>
            {canEdit && <Btn small variant="success" onClick={() => setModal({ t: "mant", vehicleId: v.id, prefill: { tipo: "correctivo", descripcion: p.clean, rawLine: p.raw } })}>Resuelto</Btn>}
          </div>)}
        </div>)}
      </div>)}
      {mantSub === "hist" && <>
        <div className="gt-vidrio" style={{ padding: "12px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {selChico(mantFil.vehicleId, (x) => setMantFil(f => ({ ...f, vehicleId: x })), vehicles.map(v => ({ value: v.id, label: v.plate })), "Todos los vehículos")}
          {selChico(mantFil.type, (x) => setMantFil(f => ({ ...f, type: x })), TIPOS_MANT.map(t => ({ value: t.value, label: t.label })), "Todo tipo")}
          {selChico(mantFil.mes, (x) => setMantFil(f => ({ ...f, mes: x })), mesesHist.map(m => ({ value: m, label: mesLabel(m) })), "Todos los meses")}
          <span style={{ marginLeft: "auto", font: "800 14px/1 var(--sans)", color: CHARCOAL }}>{fmtL(hist.reduce((s, m) => s + (Number(m.cost) || 0), 0))}</span>
        </div>
        {hist.length === 0 ? vacio("Sin mantenimientos con esos filtros.") : <div className="gt-vidrio" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {hist.map(m => { const v = vehDe(m.vehicleId); const t = tipoMantCfg(m.type); return <div key={m.id} role="button" tabIndex={0} onClick={() => v && abrirFicha(v, "mant")} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "70px 90px 110px minmax(0,1fr) 130px", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: 12, cursor: "pointer" }}>
            {!isMobile && <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{fechaCorta(m.fecha)}</span>}
            {!isMobile && <span style={{ font: "800 12px/1 var(--mono)", color: CHARCOAL }}>{v?.plate || "—"}</span>}
            {!isMobile && <Chip c={t.c} style={{ fontSize: 10.5, justifySelf: "start" }}>{t.label}</Chip>}
            <div style={{ minWidth: 0 }}>{isMobile && <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}>{fechaCorta(m.fecha)} · <b style={{ color: CHARCOAL }}>{v?.plate}</b> · {t.label}</div>}<div style={{ fontSize: 13, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.description}</div>{m.workshop && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{m.workshop}</div>}</div>
            <span style={{ font: "800 13px/1 var(--sans)", color: CHARCOAL, textAlign: "right" }}>{m.cost ? fmtL(m.cost) : "—"}</span>
          </div>; })}
        </div>}
      </>}
    </div>;
  };

  // ═══════════════════════════ MOTORISTAS ═══════════════════════════
  const renderMotoristas = () => {
    const mesAct = hoy.slice(0, 7);
    const q = motQ.trim().toLowerCase();
    const lista = motoristas.filter(m => !q || `${m.emp.fullName} ${m.emp.position} ${m.emp.dni}`.toLowerCase().includes(q));
    const conVeh = motoristas.filter(m => vehicles.some(v => v.motoristaEmpId === m.emp.id)).length;
    const licPronto = motoristas.filter(m => { const x = vencimiento(m.datos?.licenciaVence, hoy, 45); return x && x.nivel !== "ok"; }).length;
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {tiles([[motoristas.length, "motoristas"], [conVeh, "con vehículo"], [motoristas.length - conVeh, "sin vehículo"], [licPronto, "licencias por vencer", licPronto ? ORANGE_DARK : undefined]])}
      <div className="gt-vidrio" style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {buscador(motQ, setMotQ, "Buscar motorista…")}
        {canEdit && <div style={{ marginLeft: "auto" }}><Btn onClick={() => setModal({ t: "mot" })}><Ico d={ICO.mas} size={15} />Agregar de GeoTeam</Btn></div>}
      </div>
      {lista.length === 0 ? vacio("No hay motoristas. En GeoTeam, los colaboradores con cargo Motorista salen solos aquí.") :
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {lista.map(m => {
            const vs = vehicles.filter(v => v.motoristaEmpId === m.emp.id);
            const lic = vencimiento(m.datos?.licenciaVence, hoy, 45);
            const nDesp = despachos.filter(d => (d.motoristaEmpId === m.emp.id || (d.motorista && d.motorista === m.emp.fullName)) && String(d.fechaEjecutada || "").startsWith(mesAct)).length;
            return <div key={m.emp.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => canEdit && setModal({ t: "mot", m })} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, cursor: canEdit ? "pointer" : "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar emp={m.emp} size={54} radio={17} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL }}>{m.emp.fullName}</div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{m.emp.position}{m.emp.phone ? ` · ${m.emp.phone}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {vs.length ? vs.map(v => <span key={v.id} onClick={(e) => { e.stopPropagation(); abrirFicha(v); }}><Placa plate={v.plate} /></span>) : <Chip>Sin vehículo</Chip>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 10, borderTop: "1px solid rgba(44,42,40,.07)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)" }}><Ico d={ICO.licencia} size={15} color="#8C857D" />{m.datos?.licenciaTipo || "Licencia"}{lic ? <Chip c={lic.nivel === "vencido" ? C_ROJO : lic.nivel === "pronto" ? C_NARANJA : C_VERDE} style={{ fontSize: 10.5, padding: "3px 8px" }}>{lic.nivel === "vencido" ? "Vencida" : `vence ${fmtFecha(m.datos.licenciaVence)}`}</Chip> : <span style={{ color: "var(--text-faint)" }}>sin dato</span>}</span>
                <span style={{ fontSize: 12, color: "var(--text-3)" }}><b style={{ color: CHARCOAL }}>{nDesp}</b> entregas este mes</span>
              </div>
            </div>;
          })}
        </div>}
    </div>;
  };

  // ═══════════════════════════ DESPACHOS (bandeja por proyecto) ═══════════════════════════
  const subirFichaInput = (d, children) => {
    const sube = uploadingFichaId === d.id, alguno = uploadingFichaId !== null;
    return <label onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, background: sube ? "#A39C92" : ORANGE, color: "#fff", font: "700 12.5px/1 var(--sans)", cursor: alguno ? "not-allowed" : "pointer", opacity: alguno && !sube ? .5 : 1, whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(232,118,45,.25)" }}>
      <Ico d={ICO.subir} size={14} />{sube ? "Subiendo…" : children}
      <input type="file" accept=".pdf,image/*" disabled={alguno} style={{ display: "none" }} onChange={async (ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (!f) return; setUploadingFichaId(d.id); try { const ok = await uploadFichaFirmada(d, f); if (ok) alert("Ficha firmada subida y enlazada a la compra."); } finally { setUploadingFichaId(null); } }} />
    </label>;
  };
  const verFicha = async (compra) => {
    try { const ref = compra.delivery.fichaFile; const full = await store.get(`cp-file-${ref.fileId}`); if (!full?.dataUrl) return alert("No se pudo cargar el archivo desde la nube."); setVisorFicha({ ...full, name: full.name || ref.name }); }
    catch (err) { alert("Error abriendo la ficha: " + (err?.message || err)); }
  };
  const tarjetaDespacho = (d) => {
    const compra = compraDe(d);
    const u = d.estado === "pendiente" || d.estado === "programado" || d.estado === "en_ruta" ? urgenciaDespacho(d, hoy) : null;
    const v = vehDe(d.vehicleId);
    const es = estadoDespCfg(d.estado);
    const org = origenDespacho(d);
    const faltaFicha = sinFichaDe(d);
    const entregado = d.estado === "entregado" || d.estado === "cerrado";
    const fondo = "rgba(255,255,255,.78)";
    let principal = null;
    if (canEdit) {
      if (d.estado === "pendiente") principal = <Btn small onClick={() => setModal({ t: "prog", d })}>Programar</Btn>;
      else if (d.estado === "programado") principal = <Btn small variant="dark" onClick={() => updateDespachoEstado(d.id, "en_ruta")}>Salió en ruta</Btn>;
      else if (d.estado === "en_ruta") principal = faltaFicha ? subirFichaInput(d, "Subir ficha") : <Btn small variant="success" onClick={() => { if (confirm("¿Marcar como ENTREGADO?")) updateDespachoEstado(d.id, "entregado"); }}><Ico d={ICO.check} size={14} />Entregado</Btn>;
      else if (entregado && faltaFicha) principal = subirFichaInput(d, "Subir ficha");
    }
    return <div key={d.id} role="button" tabIndex={0} onClick={() => canEdit && setModal({ t: "desp", d })} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 16, alignItems: isMobile ? "stretch" : "center", padding: "13px 15px", borderRadius: 16, background: fondo, border: "1px solid rgba(44,42,40,.07)", cursor: canEdit ? "pointer" : "default" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {compra?.codigo && <span style={{ font: "700 11px/1 var(--mono)", color: "var(--text-2)" }}>{compra.codigo}</span>}
          <Chip c={org.c} style={{ fontSize: 10.5, padding: "3px 8px" }}>{d.source === "manual" ? tipoDespCfg(d.tipo).corto : org.label}</Chip>
          {d.estado !== "pendiente" && <Chip c={es.c} style={{ fontSize: 10.5, padding: "3px 8px" }}>{es.label}{(d.estado === "programado" || d.estado === "en_ruta") && d.fechaProgramada ? ` · ${fechaCorta(d.fechaProgramada)}` : entregado && d.fechaEjecutada ? ` · ${fechaCorta(d.fechaEjecutada)}` : ""}</Chip>}
          {u && <Chip c={URG_C[u.nivel]} style={{ fontSize: 10.5, padding: "3px 8px" }}>{u.nivel === "atrasado" || u.nivel === "hoy" || u.nivel === "manana" ? u.txt : `En obra ${fechaCorta(d.fechaNecesaria)}`}</Chip>}
          {entregado && compra && (faltaFicha ? <Chip c={C_ROJO} style={{ fontSize: 10.5, padding: "3px 8px" }}>Sin ficha</Chip> : compra.delivery?.fichaFile?.fileId ? <Chip c={C_VERDE} style={{ fontSize: 10.5, padding: "3px 8px" }}>Ficha subida</Chip> : null)}
        </div>
        <div style={{ font: "700 14px/1.35 var(--sans)", color: CHARCOAL, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textDecoration: entregado ? "none" : "none" }}>{d.descripcion}</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "var(--text-3)" }}>
          <span>{d.origen} <span style={{ color: ORANGE }}>→</span> {d.destino}</span>
          {(v || d.motorista) && <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Ico d={ICO.camion} size={13} />{[v?.plate, d.motorista].filter(Boolean).join(" · ")}</span>}
          {d.pickupInfo?.contactoProveedor && <span>Contacto: {d.pickupInfo.contactoProveedor}</span>}
        </div>
      </div>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: isMobile ? "row" : "column", alignItems: isMobile ? "center" : "flex-end", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        {principal}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {compra && linkBtn("Ficha de entrega", async () => { try { await descargarFichaCompra(compra, allProjects); } catch (err) { if (!err?.isStaleChunk) alert("No se pudo generar la ficha: " + (err?.message || err)); } })}
          {compra?.delivery?.fichaFile?.fileId && linkBtn("Ver ficha firmada", () => verFicha(compra), "#177243")}
          {canEdit && !entregado && compra && faltaFicha && d.estado !== "en_ruta" && linkBtn("Subir ficha", () => document.getElementById(`lg-ficha-${d.id}`)?.click(), "var(--naranja-texto-chico)")}
          {canEdit && d.estado === "programado" && linkBtn("Entregado", () => { if (confirm("¿Marcar como ENTREGADO?")) updateDespachoEstado(d.id, "entregado"); }, "#177243")}
        </div>
        {canEdit && !entregado && compra && faltaFicha && d.estado !== "en_ruta" && <input id={`lg-ficha-${d.id}`} type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={async (ev) => { const f = ev.target.files?.[0]; ev.target.value = ""; if (!f) return; setUploadingFichaId(d.id); try { const ok = await uploadFichaFirmada(d, f); if (ok) alert("Ficha firmada subida y enlazada a la compra."); } finally { setUploadingFichaId(null); } }} />}
      </div>
    </div>;
  };

  const renderRutas = () => {
    const q = despQ.trim().toLowerCase();
    const enVista = despachos.filter(d => {
      const vi = vistaDeDespacho(d);
      if (despVista === "sin_ficha") { if (!((d.estado === "entregado" || d.estado === "cerrado") && sinFichaDe(d))) return false; }
      else if (vi !== despVista) return false;
      if (despVista === "entregados" && despMes && !String(d.fechaEjecutada || "").startsWith(despMes)) return false;
      if (despProy && (d.projectCode || "__sin__") !== despProy) return false;
      if (q) { const c = compraDe(d); if (![d.descripcion, d.origen, d.destino, d.motorista, d.notas, d.projectCode, c?.codigo, c?.provider].filter(Boolean).join(" ").toLowerCase().includes(q)) return false; }
      return true;
    });
    const nSinFicha = despachos.filter(d => (d.estado === "entregado" || d.estado === "cerrado") && sinFichaDe(d)).length;
    const nEnt = despachos.filter(d => vistaDeDespacho(d) === "entregados" && (!despMes || String(d.fechaEjecutada || "").startsWith(despMes))).length;
    const grupos = {};
    enVista.forEach(d => { const k = d.projectCode || "__sin__"; (grupos[k] = grupos[k] || []).push(d); });
    const urgMin = (arr) => Math.min(...arr.map(d => urgenciaDespacho(d, hoy)?.dias ?? 999));
    const claves = Object.keys(grupos).sort((a, b) => {
      if (despVista === "entregados" || despVista === "sin_ficha") return grupos[b].length - grupos[a].length || a.localeCompare(b);
      return urgMin(grupos[a]) - urgMin(grupos[b]) || grupos[b].length - grupos[a].length || a.localeCompare(b);
    });
    claves.forEach(k => grupos[k].sort((a, b) => despVista === "entregados" || despVista === "sin_ficha" ? String(b.fechaEjecutada || "").localeCompare(String(a.fechaEjecutada || "")) : (urgenciaDespacho(a, hoy)?.dias ?? 999) - (urgenciaDespacho(b, hoy)?.dias ?? 999)));
    const forzarAbierto = !!despProy || !!q || claves.length === 1;
    const abierto = (k) => forzarAbierto || !!despAbiertos[k];
    const toggle = (k) => setDespAbiertos(a => { const n = { ...a, [k]: !a[k] }; escribirLS("gt-lg-abiertos", n); return n; });
    const todos = (val) => { const n = {}; claves.forEach(k => { n[k] = val; }); setDespAbiertos(n); escribirLS("gt-lg-abiertos", n); };
    const mesesEnt = [...new Set(despachos.filter(d => d.fechaEjecutada).map(d => String(d.fechaEjecutada).slice(0, 7)))].sort().reverse();
    const proyOpts = [...new Set(despachos.filter(d => vistaDeDespacho(d) === despVista || despVista === "sin_ficha").map(d => d.projectCode || "__sin__"))].sort().map(k => ({ value: k, label: k === "__sin__" ? "Sin proyecto" : k }));
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {tiles([[statsDesp.porHacer, "por hacer", statsDesp.porHacer ? ORANGE_DARK : undefined, () => setDespVista("por_hacer")], [statsDesp.programados, "programados", undefined, () => setDespVista("en_camino")], [statsDesp.enRuta, "en ruta", undefined, () => setDespVista("en_camino")], [statsDesp.atrasados, "atrasados", statsDesp.atrasados ? "#B03024" : undefined], [statsDesp.hoy, "entregados hoy", "#177243", () => { setDespVista("entregados"); setDespMes(hoy.slice(0, 7)); }]])}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {pills([["por_hacer", "Por hacer", statsDesp.porHacer], ["en_camino", "En camino", statsDesp.programados + statsDesp.enRuta], ["entregados", "Entregados", nEnt], ...(nSinFicha ? [["sin_ficha", "Sin ficha", nSinFicha]] : [])], despVista, (x) => { setDespVista(x); setDespProy(""); })}
        {canEdit && <div style={{ marginLeft: "auto" }}><Btn onClick={() => setModal({ t: "desp" })}><Ico d={ICO.mas} size={15} />Nuevo movimiento</Btn></div>}
      </div>
      <div className="gt-vidrio" style={{ padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {buscador(despQ, setDespQ, "Código, proveedor, qué se mueve…")}
        {selChico(despProy, setDespProy, proyOpts, "Todos los proyectos")}
        {despVista === "entregados" && selChico(despMes, setDespMes, mesesEnt.map(m => ({ value: m, label: mesLabel(m) })), "Todos los meses")}
        {claves.length > 1 && !forzarAbierto && <Btn small variant="ghost" onClick={() => todos(!claves.every(k => despAbiertos[k]))}>{claves.every(k => despAbiertos[k]) ? "Compactar todo" : "Expandir todo"}</Btn>}
        {(despQ || despProy) && <Btn small variant="ghost" onClick={() => { setDespQ(""); setDespProy(""); }}>Limpiar</Btn>}
      </div>
      {claves.length === 0 ? vacio(despVista === "por_hacer" ? "Nada por hacer. Cuando Ana o Fernando coordinen una compra, cae aquí." : "Nada en esta vista.") : claves.map(k => {
        const arr = grupos[k];
        const proj = allProjects.find(p => p.short === k);
        const atr = arr.filter(d => urgenciaDespacho(d, hoy)?.nivel === "atrasado" && vistaDeDespacho(d) !== "entregados").length;
        const sf = arr.filter(d => (d.estado === "entregado" || d.estado === "cerrado") && sinFichaDe(d)).length;
        const ab = abierto(k);
        return <div key={k} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} aria-expanded={ab} onClick={() => !forzarAbierto && toggle(k)} onKeyDown={e => { if (e.key === "Enter" && !forzarAbierto) toggle(k); }} style={{ padding: isMobile ? "12px 14px" : "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: forzarAbierto ? "default" : "pointer" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: ORANGE_DARK, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO.ruta} size={20} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: `800 ${isMobile ? 15 : 16.5}px/1.15 var(--display)`, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k === "__sin__" ? "Sin proyecto" : k}</div>
              {proj?.name && proj.name !== k && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj.name}</div>}
            </div>
            {atr > 0 && <Chip c={C_ROJO} title={`${atr} atrasado${atr === 1 ? "" : "s"}`}>{isMobile ? `${atr} !` : `${atr} atrasado${atr === 1 ? "" : "s"}`}</Chip>}
            {sf > 0 && !isMobile && <Chip c={C_ROJO}>{sf} sin ficha</Chip>}
            <span style={{ minWidth: 34, height: 30, padding: "0 10px", borderRadius: 999, background: "rgba(44,42,40,.06)", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 13px/1 var(--sans)", color: CHARCOAL }}>{arr.length}</span>
            {!forzarAbierto && <span style={{ display: "inline-flex", transform: ab ? "rotate(90deg)" : "none", transition: "transform .2s" }}><Ico d={ICO.flecha} size={18} color="#8C857D" /></span>}
          </div>
          {ab && <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: isMobile ? 0 : 14 }}>{arr.slice(0, 150).map(tarjetaDespacho)}</div>}
        </div>;
      })}
    </div>;
  };

  // ═══════════════════════════ MODALES ═══════════════════════════
  const cerrar = () => setModal(null);
  const renderModal = () => {
    if (!modal) return null;
    if (modal.t === "veh") return <Modal title={modal.d ? `Editar ${modal.d.plate}` : "Nuevo vehículo"} onClose={cerrar} wide fondoCierra={false}><VehiculoForm vehicle={modal.d} proyectos={allProjects} motoristas={motoristas} onCancel={cerrar} onSave={saveVehicle} /></Modal>;
    if (modal.t === "mant") { const v = modal.vehicleId ? vehDe(modal.vehicleId) : null; return <Modal title="Registrar mantenimiento" onClose={cerrar} wide fondoCierra={false}><MantForm vehicle={v} vehicles={vehicles} prefill={modal.prefill} onCancel={cerrar} onSave={saveMaintenance} /></Modal>; }
    if (modal.t === "carga") { const v = modal.vehicleId ? vehDe(modal.vehicleId) : null; return <Modal title="Cargar combustible" onClose={cerrar} fondoCierra={false}><CargaForm vehicle={v} vehicles={vehicles} motoristas={motoristas} cargas={cargas} onCancel={cerrar} onSave={saveCarga} /></Modal>; }
    if (modal.t === "desp") return <Modal title={modal.d ? "Editar despacho" : "Nuevo movimiento"} onClose={cerrar} wide fondoCierra={false}><DespachoForm despacho={modal.d} vehicles={vehicles} motoristas={motoristas} proyectos={allProjects} presetProjectCode={modal.preset} onCancel={cerrar} onSave={saveDespacho} onDelete={modal.d && canEdit ? async () => { if (!confirm("¿Eliminar este despacho?")) return; await deleteDespacho(modal.d.id); cerrar(); } : null} /></Modal>;
    if (modal.t === "prog") return <Modal title="Programar despacho" onClose={cerrar}><ProgramarForm despacho={modal.d} vehicles={vehicles} motoristas={motoristas} onCancel={cerrar} onSave={saveDespacho} /></Modal>;
    if (modal.t === "mot") return <Modal title={modal.m ? "Motorista" : "Agregar motorista"} onClose={cerrar}><MotoristaForm mot={modal.m} emps={emps} vehicles={vehicles} extras={motExtras} onCancel={cerrar} onSave={saveMotorista} /></Modal>;
    return null;
  };

  // ═══════════════════════════ LAYOUT ═══════════════════════════
  const nav = isMotorista ? [{ id: "micarro", label: "Mi carro" }] : [
    { id: "dashboard", label: "Dashboard" },
    { id: "rutas", label: "Despachos" },
    { id: "flota", label: "Flota" },
    { id: "mant", label: "Mantenimientos" },
    { id: "motoristas", label: "Motoristas" },
  ];
  if (!loaded) return <PantallaCarga titulo="GeoLogistics" />;
  const secOk = nav.some(n => n.id === sec) ? sec : nav[0].id;
  const rol = canEdit || isMotorista ? (ROLE_LABEL[userRole] || userRole) : "Solo lectura";
  return <div className="gt-root gt-entra-modulo" style={{ height: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)", position: "relative", overflow: "hidden" }}>
    <style>{GT_CSS}</style>
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />
    {isMobile && <>
      <style>{MOVIL_CSS}</style>
      <BarraMovil titulo="GeoLogistics" icono={<Ico d={ICO.camion} size={18} />} usuario={userName} rol={rol} onLogout={onLogout} />
      <BarraInferior tituloMas="GeoLogistics" secciones={nav} activa={secOk} onElegir={setSec} principales={["dashboard", "rutas", "flota"]} />
    </>}
    {!isMobile && <>
      <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
          <Logo size={34} />
          <div title="GeoLogistics" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO.camion} size={22} /></div>
          <div style={{ font: "800 15px/1 var(--display)", color: "var(--text)" }}>GeoLogistics</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}><div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{userName || "Usuario"}</div><div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{rol}</div></div>
          {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Cerrar sesión</button>}
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 2, display: "flex", borderBottom: "1px solid rgba(44,42,40,.08)", overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: 20, scrollbarWidth: "none" }}>
        {nav.map(x => { const active = secOk === x.id; const badge = x.id === "rutas" ? statsDesp.atrasados : x.id === "mant" ? vehicles.filter(v => estadoPreventivo(v, hoy).urgencia === "vencido").length : 0; return <button key={x.id} onClick={() => setSec(x.id)} style={{ padding: "14px 18px", background: "transparent", border: "none", boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none", color: active ? "var(--naranja-tinta)" : "var(--text-3)", font: `${active ? 800 : 600} 13px/1 var(--sans)`, cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 7 }}>{x.label}{badge > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 99, background: "#C0392B", color: "#fff", font: "800 10.5px/18px var(--sans)", textAlign: "center", boxSizing: "border-box" }}>{badge}</span>}</button>; })}
      </div>
    </>}
    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "10px 12px 24px" : "18px 32px 32px", maxWidth: 1500, margin: "0 auto" }}>
        {isMobile && !fichaId && <TituloMovil>{(nav.find(n => n.id === secOk) || {}).label}</TituloMovil>}
        {secOk === "micarro" ? <MiCarroImpl user={{ username: userKey, nombre: userName, empId: userEmpId }} vehicles={vehicles} bitacora={bitacora} emps={emps} onRegistrar={registrarUso} /> : secOk === "dashboard" ? renderDashboard() : secOk === "rutas" ? renderRutas() : secOk === "flota" ? renderFlota() : secOk === "mant" ? renderMant() : renderMotoristas()}
      </div>
    </div>
    {renderModal()}
    {visorFicha && <VisorArchivo archivo={visorFicha} onClose={() => setVisorFicha(null)} />}
    {vuelo && vuelo.desde && vuelo.hasta && <VueloCarnet key={vuelo.id + vuelo.fase} desde={vuelo.desde} hasta={vuelo.hasta} alReves={vuelo.fase === "cerrar"}
      frente={<div dangerouslySetInnerHTML={{ __html: vuelo.frente || "" }} />} dorso={<div dangerouslySetInnerHTML={{ __html: vuelo.dorso || "" }} />} onFin={() => setVuelo(null)} />}
  </div>;
}
