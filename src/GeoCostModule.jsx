// ═══════════════════════════════════════════════════════════════════════════
// GeoCost — Central de Costos por Proyecto (9-sep-2026).
// Presupuesto (USD) vs. gasto real (L → USD a la tasa de cc-config) por
// partida, con lo que ya vive en el sistema: compras (GeoShopping), repuestos
// (GeoMachinery), mano de obra (GeoTeam) y las movilizaciones (propias o con
// proveedor externo, 11-sep-2026).
//
// Reglas de la casa (CLAUDE.md):
//  · TODA lectura con store.getCloud — nunca store.get: su re-sync de cache
//    viejo puede ESCRIBIR una key ajena desde una pantalla de solo lectura.
//  · TODA escritura = getCloud → merge por id → store.set → verify con getCloud.
//    Si la nube no responde, se ABORTA con alert (no se guarda a ciegas).
//  · confirm() antes de cancelar/eliminar. Nunca store.set(k, null).
//  · Componentes a NIVEL DE MÓDULO (los forms viven en geocost-forms.jsx);
//    anillos y barras son FUNCIONES dentro del render, no componentes.
//  · Estética Apple/vidrio del rediseño: GT_CSS + gt-*, sin emojis.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useRef } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import {
  ORANGE, ORANGE_DARK, CHARCOAL, C_GRIS, C_VERDE, C_AMARILLO, C_NARANJA,
  useIsMobile, prefiereMenosMovimiento,
  fmtUSD, fmtL, fmtUSD0, fmtL0, fmtPct, fmtFecha,
  uid, Select, Btn, Chip, Vidrio, Label, SEMAFORO,
} from "./geocost-ui.jsx";
import {
  TASA_DEFAULT, num, hnlToUsd, montoPartida,
  opcionesPartidas, partidaMO, proyectosUnificados, nombreProyecto,
  movimientosDeProyecto, resumenPresupuesto, siguienteCodigoMov,
} from "./geocost-calc.js";
import { VisorArchivo } from "./visor-archivo.jsx";
import { PresupuestoForm, MovilizacionForm, MovilizacionDetalle, AjustesTasa, ESTADOS_MOV } from "./geocost-forms.jsx";
import { fichaProyectoPDF, reporteCostosPDF } from "./geocost-pdf.js";

// ── Constantes ──────────────────────────────────────────────────────────────
// Tope del comprobante: 2 MB, el límite empírico de los cp-file-* en todo el
// sistema (arriba de eso el upsert a Supabase falla tras los reintentos).
const MAX_FILE_BYTES = 2 * 1024 * 1024;
// Orden de carga: las 4 primeras son OBLIGATORIAS (sin ellas no hay módulo);
// las de HR pueden fallar — la MO sale "no disponible" y el resto sigue.
// cp-providers (última) es best-effort: solo alimenta el datalist "Proveedor"
// del form de movilización (11-sep-2026); si falla, la lista queda vacía.
const KEYS = ["cc-config", "cc-presupuestos", "cc-movilizaciones", "cp-purchases", "mq-purchases", "cp-projects", "mq-machines", "hr-emps5", "hr-atts2", "hr-he", "hr-he-salbase", "cp-providers"];
const NAV = [{ id: "dashboard", label: "Dashboard" }, { id: "proyectos", label: "Proyectos" }, { id: "movilizaciones", label: "Movilizaciones" }];
const FUENTES = { compras: "Compras", maquinas: "Máquinas", mo: "Mano de obra", movilizacion: "Movilización" };
const ESTADO_COSTO = {
  comprometido: { label: "Comprometido", ...C_GRIS },
  ejecutado:    { label: "Ejecutado",    ...C_VERDE },
  encurso:      { label: "En curso",     ...C_AMARILLO },
};
// Transiciones válidas de una movilización: estado DESTINO ← estados de origen
// permitidos. cambiarEstadoMov las valida contra el estado REAL de la nube.
const DESDE_MOV = { recibida: ["solicitada"], acreditada: ["solicitada", "recibida"], cancelada: ["solicitada", "recibida"] };
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// CSS propio del módulo (hover de la tarjeta "+", filas clickeables). Se monta
// junto a GT_CSS en el root. ⚠ React 19: sin `precedence`.
const CC_CSS = `
.cc-add{border:1.5px dashed rgba(44,42,40,.18);border-radius:var(--radio-card);color:var(--text-3);background:rgba(255,255,255,.35);cursor:pointer;transition:border-color var(--mov-base) var(--curva),color var(--mov-base) var(--curva),background var(--mov-base) var(--curva)}
.cc-add:hover,.cc-add:focus-visible{border-color:var(--marca-2);color:var(--naranja-tinta);background:rgba(232,118,45,.05);outline:none}
.cc-fila{cursor:pointer;border-radius:14px;transition:background var(--mov-rapido)}
.cc-fila:hover{background:rgba(44,42,40,.035)}
.cc-fila:focus-visible{outline:2px solid var(--marca-2);outline-offset:-1px}
.cc-tasa{border:1px solid var(--hairline);background:var(--surface);color:var(--text-2);font:600 12.5px/1 var(--mono);padding:9px 14px;border-radius:999px;cursor:pointer;box-shadow:var(--e0);transition:color var(--mov-rapido),box-shadow var(--mov-base) var(--curva),border-color var(--mov-rapido)}
.cc-tasa:hover{color:var(--naranja-tinta);border-color:rgba(232,118,45,.4);box-shadow:var(--e1)}
.cc-pill{padding:7px 14px;border-radius:999px;border:1px solid rgba(44,42,40,.12);background:rgba(255,255,255,.6);color:var(--text-2);font:700 12px/1 var(--sans);cursor:pointer;white-space:nowrap;transition:background var(--mov-rapido),color var(--mov-rapido)}
.cc-pill:hover{background:rgba(44,42,40,.06)}
.cc-pill[aria-pressed=true]{background:${ORANGE_DARK};border-color:transparent;color:#fff}
`;

// ── Helpers puros ───────────────────────────────────────────────────────────
const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: r.result });
  r.onerror = reject;
  r.readAsDataURL(file);
});

// El comprobante se muestra con <VisorArchivo> (src/visor-archivo.jsx, 10-sep-2026):
// el window.open de acá corría DESPUÉS del await de la nube y el navegador lo
// bloqueaba (caía a descarga en silencio).

const utc = (ymd) => /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || "")) ? new Date(ymd + "T00:00:00Z") : null;
// Días de calendario entre dos fechas YYYY-MM-DD, SIN +1 inclusivo: 9-sep →
// 14-oct = 35 días, igual que la Ficha PDF (duracionDias) y la spec §4.
const diasEntre = (a, b) => { const A = utc(a), B = utc(b); if (!A || !B) return null; return Math.round((B - A) / 86400000); };
const truncar = (s, n) => { const t = String(s || ""); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
// Ajuste: si un ancho (%) supera lo que queda, se recorta (anillos y barras
// nunca dibujan más de una vuelta aunque haya sobregiro)
const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const cssAnim = (prop, ms, delay = 0) => `${prop} ${ms}ms var(--curva) ${delay}ms`;

// Monto USD corto para ejes y etiquetas de barra (Dashboard): $ 0 · $ 850 ·
// $ 31.5k · $ 175k · $ 1.2M — 1 decimal mientras la cifra sea < 100, nunca
// ".0". Los cortes van en 999.5 / 999,500 para que no salga "$ 1000k".
const fmtCorto = (n) => {
  const v = num(n), a = Math.abs(v), s = v < 0 ? "-" : "";
  const cifra = (x) => String(x < 100 ? Math.round(x * 10) / 10 : Math.round(x));
  if (a >= 999500) return `${s}$ ${cifra(a / 1e6)}M`;
  if (a >= 999.5) return `${s}$ ${cifra(a / 1e3)}k`;
  return `${s}$ ${Math.round(a)}`;
};
// Techo "redondo" del eje Y (175,075 → 200,000). Solo múltiplos que dividen
// limpio entre 4: las guías caen en 50k/100k/150k/200k, no en 43.7k.
const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return ([1, 1.2, 2, 3, 4, 6, 8, 10].find(k => f <= k) || 10) * p;
};
// Gris de la barra "Presupuesto" (mismo que el punto "Disponible" de las tarjetas)
const GRIS_BARRA = "rgba(44,42,40,.14)";

// Barra de tiempo del proyecto: eje de 5 meses (uno antes del inicio, tres
// después), pista gris y segmento naranja inicio→fin. Pura, sin animación
// (la usan las tarjetas de Proyectos y la cabecera del detalle).
const barraTiempo = (fechaInicio, fechaFin, { alto = 8, conMeses = true } = {}) => {
  const ini = utc(fechaInicio), fin = utc(fechaFin);
  if (!ini) return null;
  const finReal = fin && fin >= ini ? fin : ini;
  const y = ini.getUTCFullYear(), m = ini.getUTCMonth();
  const ejeIni = Date.UTC(y, m - 1, 1), ejeFin = Date.UTC(y, m + 4, 1);
  const span = ejeFin - ejeIni;
  const left = clamp01((ini - ejeIni) / span) * 100;
  const right = clamp01((finReal.getTime() + 86400000 - ejeIni) / span) * 100;
  const meses = Array.from({ length: 5 }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 + i, 1)); return MESES_CORTOS[d.getUTCMonth()]; });
  return <div>
    <div style={{ position: "relative", height: alto, borderRadius: alto, background: "var(--sunk)", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${left}%`, width: `${Math.max(1.5, right - left)}%`, borderRadius: alto, background: ORANGE }} />
    </div>
    {conMeses && <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", marginTop: 5 }}>
      {meses.map((mm, i) => <div key={i} style={{ font: "600 10px/1 var(--mono)", color: "var(--text-faint)", letterSpacing: ".06em", textTransform: "uppercase" }}>{mm}</div>)}
    </div>}
  </div>;
};

const IconoGeoCost = ({ size = 21 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><path d="M7 6h1v4" /><path d="m16.71 13.88.7.71-2.82 2.82" />
</svg>;
const IconoMas = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>;
const IconoAlerta = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>;

// Estilos de tabla (mismos pares que GeoShopping, con tokens)
const TH = { padding: "9px 12px", textAlign: "left", color: "var(--text-3)", fontWeight: 700, borderBottom: "1px solid var(--hairline)", whiteSpace: "nowrap", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em", fontFamily: "var(--mono)" };
const TD = { padding: "9px 12px", color: "var(--text-2)", whiteSpace: "nowrap", fontSize: 13, borderBottom: "1px solid rgba(44,42,40,.05)", verticalAlign: "middle" };
const MONO = { fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" };

// Activa un elemento con Enter/Espacio (tarjetas role="button")
const onKeyActivar = (fn) => (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };

// ═══════════════════════════════════════════════════════════════════════════
export default function GeoCostModule({ userRole, userName, onBack, onLogout }) {
  const isMobile = useIsMobile();
  const reduceMotion = prefiereMenosMovimiento();

  // ── Permisos (spec 6.7) ──
  const isAdmin = userRole === "admin";
  const isCostos = userRole === "costos";
  const isTesoreria = userRole === "tesoreria";
  const isGerencia = userRole === "gerencia";
  const puedeEditarPresupuesto = isAdmin;
  const puedeTasa = isAdmin;
  const puedeReclasificar = isAdmin || isCostos || isTesoreria;
  const puedeCrearMov = isAdmin;
  const puedeRecibirMov = isTesoreria || isAdmin;
  const puedeAcreditarMov = isTesoreria || isAdmin;
  const roleLabel = isAdmin ? "Operaciones" : isTesoreria ? "Tesorería" : isCostos ? "Costos / Operaciones" : isGerencia ? "Gerencia (solo lectura)" : userRole;

  // ── Datos ──
  const [loaded, setLoaded] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  const [config, setConfig] = useState(null);
  const [presupuestos, setPresupuestos] = useState([]);
  const [movilizaciones, setMovilizaciones] = useState([]);
  const [cpPurchases, setCpPurchases] = useState([]);
  const [mqPurchases, setMqPurchases] = useState([]);
  const [customProjects, setCustomProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [emps, setEmps] = useState([]);
  const [atts, setAtts] = useState([]);
  const [hes, setHes] = useState([]);
  const [heSalBase, setHeSalBase] = useState({});
  const [hrOk, setHrOk] = useState(true);
  const [providers, setProviders] = useState([]); // cp-providers, best-effort (datalist del form de movilización)

  // ── UI ──
  const [sec, setSec] = useState("dashboard");
  const [proyActivo, setProyActivo] = useState(null);
  const [partidaAbierta, setPartidaAbierta] = useState(null);
  const [filtroFuente, setFiltroFuente] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [movEstado, setMovEstado] = useState("todas");
  const [movTipo, setMovTipo] = useState("todas");     // todas | propia | proveedor
  const [movProy, setMovProy] = useState("");
  const [modal, setModal] = useState(null);
  const [reclasificando, setReclasificando] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [visor, setVisor] = useState(null); // comprobante de movilización (visor en la app)

  // Guardia anti-pisada del auto-refresh (CLAUDE.md): los diálogos nativos
  // hacen blur+focus y el refresh leería la nube de ANTES del guardado.
  const lastLocalMutAtRef = useRef(0);
  const stamp = () => { lastLocalMutAtRef.current = Date.now(); };

  const tasa = num(config?.tasa) || TASA_DEFAULT;

  // Aplica lo que llegó de la nube al estado. `estricto` = carga inicial:
  // las 4 keys base tienen que venir; en el refresh se toma lo que haya.
  const aplicarCarga = (r, estricto) => {
    const ok = (i) => r[i].status === "fulfilled";
    const v = (i) => r[i].value;
    if (estricto && [0, 1, 2, 3].some(i => !ok(i))) return false;
    if (ok(0)) setConfig(v(0) && typeof v(0) === "object" && !Array.isArray(v(0)) ? v(0) : { tasa: TASA_DEFAULT });
    if (ok(1)) setPresupuestos(Array.isArray(v(1)) ? v(1) : []);
    if (ok(2)) setMovilizaciones(Array.isArray(v(2)) ? v(2) : []);
    if (ok(3)) setCpPurchases(Array.isArray(v(3)) ? v(3) : []);
    if (ok(4)) setMqPurchases(Array.isArray(v(4)) ? v(4) : []);
    if (ok(5)) setCustomProjects(Array.isArray(v(5)) ? v(5) : []);
    if (ok(6)) setMachines(Array.isArray(v(6)) ? v(6) : []);
    if (ok(11)) setProviders(Array.isArray(v(11)) ? v(11) : []);
    const hr = [7, 8, 9, 10].every(ok);
    if (hr) {
      setEmps(Array.isArray(v(7)) ? v(7) : []);
      setAtts(Array.isArray(v(8)) ? v(8) : []);
      setHes(Array.isArray(v(9)) ? v(9) : []);
      setHeSalBase(v(10) && typeof v(10) === "object" ? v(10) : {});
    }
    if (estricto || hr) setHrOk(hr);
    return true;
  };

  const cargar = async () => {
    setErrorCarga(null);
    const r = await Promise.allSettled(KEYS.map(k => store.getCloud(k)));
    if (!aplicarCarga(r, true)) {
      const motivo = r.find(x => x.status === "rejected")?.reason;
      setErrorCarga(motivo?.message || String(motivo || "sin respuesta"));
      return;
    }
    setLoaded(true);
  };
  useEffect(() => { cargar(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh al volver a la pestaña — best-effort, con la guardia de 8 s pre y
  // post fetch (igual que PurchasesModule).
  useEffect(() => {
    const refresh = async () => {
      if (!loaded) return;
      if (Date.now() - lastLocalMutAtRef.current < 8000) { console.log("[GeoCost] refresh omitido: guardado local reciente"); return; }
      try {
        const r = await Promise.allSettled(KEYS.map(k => store.getCloud(k)));
        if (Date.now() - lastLocalMutAtRef.current < 8000) { console.log("[GeoCost] refresh descartado post-fetch"); return; }
        aplicarCarga(r, false);
      } catch (e) { console.warn("[GeoCost] refresh falló:", e?.message || e); }
    };
    const onFocus = () => refresh();
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [loaded]);

  // Los anillos y barras del Dashboard "cargan" al entrar (patrón dashAnim de
  // GeoShopping v4). `loaded` en las deps: si el flip pasa antes de que
  // existan las tarjetas, nacen al 100 % y no animan.
  const [dashAnim, setDashAnim] = useState(reduceMotion);
  useEffect(() => {
    if (reduceMotion) { setDashAnim(true); return; }
    if (!loaded || (sec !== "dashboard" && sec !== "proyectos")) { setDashAnim(false); return; }
    setDashAnim(false);
    const t = setTimeout(() => setDashAnim(true), 160);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, loaded, proyActivo]);

  // Al cambiar de proyecto se cierra la partida expandida y se resetean filtros
  useEffect(() => { setPartidaAbierta(null); setFiltroFuente("todos"); setFiltroEstado("todos"); }, [proyActivo]);

  // ── Derivados ──
  const proyectos = useMemo(() => proyectosUnificados(customProjects), [customProjects]);
  const nombreDe = (short) => nombreProyecto(short, customProjects);
  const proyectoDe = (short) => proyectos.find(p => p.short === short) || { short, name: nombreDe(short) };

  const resumenes = useMemo(() => presupuestos.map(pres => {
    const movs = movimientosDeProyecto({ pres, cpPurchases, mqPurchases, movilizaciones, atts, hes, emps, heSalBase, machines, tasa, customProjects });
    return { pres, movs, resumen: resumenPresupuesto(pres, movs) };
  }), [presupuestos, cpPurchases, mqPurchases, movilizaciones, atts, hes, emps, heSalBase, machines, tasa, customProjects]);

  const activos = resumenes.filter(r => r.pres.estado !== "cerrado");
  // Nombres únicos de cp-providers (sin repetir por mayúsculas) para el
  // datalist "Proveedor" del form de movilización; texto libre sigue valiendo.
  const proveedoresNombre = useMemo(() => {
    const vistos = new Map();
    providers.forEach(p => { const n = String(p?.name || "").trim(); if (n && !vistos.has(n.toLowerCase())) vistos.set(n.toLowerCase(), n); });
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [providers]);

  const rActivo = proyActivo ? resumenes.find(r => r.pres.projectCode === proyActivo) : null;
  // Si el presupuesto activo desapareció (otro usuario lo borró), volver al grid
  useEffect(() => { if (loaded && proyActivo && !rActivo) setProyActivo(null); }, [loaded, proyActivo, rActivo]);

  // ═══════════════════════════════════════════════════════════════════════
  // ESCRITURAS — getCloud → merge por id → set → verify. Todas devuelven
  // Promise<boolean> (los forms se quedan abiertos si es false).
  // ═══════════════════════════════════════════════════════════════════════
  const leerNube = async (key) => {
    try { return { ok: true, value: await store.getCloud(key) }; }
    catch (e) { alert("Sin conexión con la nube. No se guardó nada — intentá de nuevo en un momento."); console.warn("[GeoCost] getCloud falló", key, e); return { ok: false }; }
  };

  const guardarConfig = async (nuevaTasa) => {
    const t = Math.round(num(nuevaTasa) * 10000) / 10000;
    if (!(t > 0)) { alert("La tasa tiene que ser mayor que 0."); return false; }
    const c = await leerNube("cc-config"); if (!c.ok) return false;
    const base = c.value && typeof c.value === "object" && !Array.isArray(c.value) ? c.value : {};
    const at = new Date().toISOString();
    const hist = Array.isArray(base.historialTasa) ? base.historialTasa : [];
    const next = { ...base, tasa: t, tasaActualizadaAt: at, tasaActualizadaPor: userName, historialTasa: [...hist.slice(-49), { tasa: t, at, por: userName }] };
    const ok = await store.set("cc-config", next);
    if (!ok) { alert("No se pudo guardar la tasa en la nube."); return false; }
    try {
      const back = await store.getCloud("cc-config");
      if (num(back?.tasa) !== t) { alert("VERIFICACIÓN FALLÓ: la nube no devolvió la tasa nueva. Revisá antes de seguir."); return false; }
      setConfig(back);
    } catch { alert("Se guardó, pero no se pudo verificar con la nube. Recargá para confirmar."); return false; }
    stamp();
    return true;
  };

  const guardarPresupuesto = async (pres) => {
    const c = await leerNube("cc-presupuestos"); if (!c.ok) return false;
    const lista = Array.isArray(c.value) ? c.value : [];
    const at = new Date().toISOString();
    let id, next;
    if (pres.id && lista.some(x => x.id === pres.id)) {
      id = pres.id;
      next = lista.map(x => x.id === id ? { ...x, ...pres, updatedAt: at, updatedBy: userName, historial: [...(x.historial || []), { at, por: userName, accion: "editado" }] } : x);
    } else {
      if (lista.some(x => x.projectCode === pres.projectCode)) { alert("Ese proyecto ya tiene presupuesto. Editalo desde su tarjeta."); return false; }
      id = uid();
      next = [...lista, { ...pres, id, createdAt: at, createdBy: userName, updatedAt: at, updatedBy: userName, historial: [{ at, por: userName, accion: "creado" }] }];
    }
    const ok = await store.set("cc-presupuestos", next);
    if (!ok) { alert("No se pudo guardar el presupuesto en la nube."); return false; }
    try {
      const back = await store.getCloud("cc-presupuestos");
      const mio = Array.isArray(back) ? back.find(x => x.id === id) : null;
      if (!mio || (mio.partidas || []).length !== (pres.partidas || []).length) { alert("VERIFICACIÓN FALLÓ: el presupuesto no quedó como se guardó. Revisá antes de seguir."); return false; }
      setPresupuestos(back);
    } catch { alert("Se guardó, pero no se pudo verificar con la nube. Recargá para confirmar."); return false; }
    stamp();
    return true;
  };

  const guardarMovilizacion = async (mov) => {
    const c = await leerNube("cc-movilizaciones"); if (!c.ok) return false;
    const lista = Array.isArray(c.value) ? c.value : [];
    const at = new Date().toISOString();
    let id, next;
    if (mov.id && lista.some(x => x.id === mov.id)) {
      const actual = lista.find(x => x.id === mov.id);
      if (actual.estado !== "solicitada") { alert("Solo se puede editar una movilización que sigue Solicitada."); return false; }
      id = mov.id;
      next = lista.map(x => x.id === id ? { ...x, ...mov, audit: [...(x.audit || []), { action: "editada", by: userName, role: userRole, at }] } : x);
    } else {
      id = uid();
      // El form trae tipo/proveedor/cotizacion (11-sep-2026) y se guardan tal cual
      const accion = mov.tipo === "proveedor" ? `creada (con proveedor ${String(mov.proveedor || "").trim()})` : "creada";
      next = [...lista, { ...mov, id, codigo: siguienteCodigoMov(lista), estado: "solicitada", comprobanteFile: null, createdAt: at, createdBy: userName, audit: [{ action: accion, by: userName, role: userRole, at }] }];
    }
    const ok = await store.set("cc-movilizaciones", next);
    if (!ok) { alert("No se pudo guardar la movilización en la nube."); return false; }
    try {
      const back = await store.getCloud("cc-movilizaciones");
      if (!Array.isArray(back) || !back.some(x => x.id === id)) { alert("VERIFICACIÓN FALLÓ: la movilización no aparece en la nube."); return false; }
      setMovilizaciones(back);
    } catch { alert("Se guardó, pero no se pudo verificar con la nube. Recargá para confirmar."); return false; }
    stamp();
    return true;
  };

  // Cambio de estado con sello <estado>At/<estado>Por + audit. `extra` se
  // mezcla en la movilización (ej. comprobanteFile al acreditar). La transición
  // se valida contra el estado REAL de la nube (DESDE_MOV): los perms del
  // detalle salen del estado LOCAL y otro usuario pudo moverla mientras el
  // modal estaba abierto (acreditada → cancelada → eliminada con su comprobante).
  const cambiarEstadoMov = async (id, nuevoEstado, extra = {}, note) => {
    const c = await leerNube("cc-movilizaciones"); if (!c.ok) return false;
    const lista = Array.isArray(c.value) ? c.value : [];
    const actual = lista.find(x => x.id === id);
    if (!actual) { alert("La movilización ya no está en la nube (¿otro usuario la eliminó?)."); return false; }
    if (!(DESDE_MOV[nuevoEstado] || []).includes(actual.estado)) {
      alert(`La movilización ya está ${ESTADOS_MOV[actual.estado]?.label || actual.estado} (la cambió otro usuario). Se actualizó la vista.`);
      setMovilizaciones(lista);
      return false;
    }
    const at = new Date().toISOString();
    const next = lista.map(x => x.id === id ? { ...x, ...extra, estado: nuevoEstado, [`${nuevoEstado}At`]: at, [`${nuevoEstado}Por`]: userName, audit: [...(x.audit || []), { action: nuevoEstado, by: userName, role: userRole, at, note }] } : x);
    const ok = await store.set("cc-movilizaciones", next);
    if (!ok) { alert("No se pudo guardar el cambio en la nube."); return false; }
    try {
      const back = await store.getCloud("cc-movilizaciones");
      if (!Array.isArray(back) || back.find(x => x.id === id)?.estado !== nuevoEstado) { alert("VERIFICACIÓN FALLÓ: la nube no refleja el cambio de estado."); return false; }
      setMovilizaciones(back);
    } catch { alert("Se guardó, pero no se pudo verificar con la nube. Recargá para confirmar."); return false; }
    stamp();
    return true;
  };

  const cancelarMov = async (mov) => {
    if (!confirm(`¿Cancelar la movilización ${mov.codigo || ""}?\n\nDeja de contar en el presupuesto. Se puede eliminar después.`)) return false;
    return cambiarEstadoMov(mov.id, "cancelada", {}, "Cancelada por " + userName);
  };

  const eliminarMov = async (mov) => {
    if (!confirm(`¿ELIMINAR definitivamente la movilización ${mov.codigo || ""}?\n\nEsto no se puede deshacer.`)) return false;
    const c = await leerNube("cc-movilizaciones"); if (!c.ok) return false;
    const lista = Array.isArray(c.value) ? c.value : [];
    const actual = lista.find(x => x.id === mov.id);
    if (!actual) { alert("La movilización ya no está en la nube."); setMovilizaciones(lista); return true; }
    if (!["solicitada", "cancelada"].includes(actual.estado)) { alert("Solo se eliminan movilizaciones Solicitadas o Canceladas."); setMovilizaciones(lista); return false; }
    const next = lista.filter(x => x.id !== mov.id);
    const ok = await store.set("cc-movilizaciones", next);
    if (!ok) { alert("No se pudo eliminar en la nube."); return false; }
    try {
      const back = await store.getCloud("cc-movilizaciones");
      if (!Array.isArray(back) || back.some(x => x.id === mov.id)) { alert("VERIFICACIÓN FALLÓ: la movilización sigue en la nube."); return false; }
      setMovilizaciones(back);
    } catch { alert("Se eliminó, pero no se pudo verificar con la nube. Recargá para confirmar."); return false; }
    stamp();
    // El archivo huérfano se borra best-effort (la operación principal ya quedó)
    const fileId = actual.comprobanteFile?.fileId;
    if (fileId) store.remove("cc-file-" + fileId, { quiet: true });
    return true;
  };

  const adjuntarComprobante = async (mov, file) => {
    if (!file) return false;
    if (file.size > MAX_FILE_BYTES) { alert(`El comprobante pesa ${(file.size / 1024 / 1024).toFixed(2)} MB; el límite es 2 MB — comprimilo o sacale una foto más liviana.`); return false; }
    let leido;
    try { leido = await readFileAsDataUrl(file); } catch { alert("No se pudo leer el archivo."); return false; }
    const fileId = uid();
    const ok = await store.set("cc-file-" + fileId, leido);
    if (!ok) { alert("No se pudo subir el comprobante a la nube."); return false; }
    const acreditada = await cambiarEstadoMov(mov.id, "acreditada", { comprobanteFile: { fileId, name: leido.name, type: leido.type, size: leido.size } }, "Comprobante: " + leido.name);
    if (!acreditada) {
      // cambiarEstadoMov también devuelve false cuando el set SÍ escribió y solo
      // falló el verify: se relee la nube y el archivo se borra SOLO si la
      // movilización no lo referencia. Sin nube se conserva (un archivo suelto
      // es más barato que una acreditada sin comprobante y sin botón para
      // re-adjuntarlo).
      try {
        const back = await store.getCloud("cc-movilizaciones");
        const referenciado = Array.isArray(back) && back.find(x => x.id === mov.id)?.comprobanteFile?.fileId === fileId;
        if (!referenciado) store.remove("cc-file-" + fileId, { quiet: true });
      } catch (e) { console.warn("[GeoCost] no se pudo confirmar si el comprobante quedó referenciado; se conserva", e); }
    }
    return acreditada;
  };

  const verComprobante = async (mov) => {
    const fileId = mov?.comprobanteFile?.fileId;
    if (!fileId) { alert("Esta movilización no tiene comprobante."); return; }
    try {
      const f = await store.getCloud("cc-file-" + fileId);
      if (!f?.dataUrl) { alert("El comprobante no está en la nube."); return; }
      setVisor({ ...f, name: f.name || mov.comprobanteFile.name || "comprobante" });
    } catch { alert("Sin conexión con la nube: no se pudo abrir el comprobante."); }
  };

  // Reclasificar una compra/repuesto a otra partida. SIEMPRE sobre el array de
  // la nube modificado por id (nunca el local) + audit en la compra.
  const reclasificar = async (mov, partidaId) => {
    if (!puedeReclasificar) return false;
    const key = mov.sourceKey;
    if (key !== "cp-purchases" && key !== "mq-purchases") return false;
    const id = mov.origen?.id;
    if (!id) return false;
    const pres = rActivo?.pres || presupuestos.find(p => p.partidas?.some(x => x.id === partidaId));
    const nombre = (pid) => pres?.partidas?.find(x => x.id === pid)?.nombre || (pid ? pid : "Sin partida");
    // {id, partidaId}: el Select controlado muestra el destino elegido mientras
    // se guarda (si no, rebotaba al valor viejo los 1-3 s de los tres viajes)
    setReclasificando({ id, partidaId });
    try {
      const c = await leerNube(key); if (!c.ok) return false;
      if (!Array.isArray(c.value)) { alert("La nube no devolvió la lista de compras."); return false; }
      const actual = c.value.find(x => x.id === id);
      if (!actual) { alert("La compra ya no está en la nube."); return false; }
      const at = new Date().toISOString();
      const updated = c.value.map(x => x.id === id ? { ...x, partidaId, audit: [...(x.audit || []), { action: "partida_reclasificada", by: userName, role: userRole, at, note: `Partida: ${nombre(actual.partidaId)} → ${nombre(partidaId)}` }] } : x);
      const ok = await store.set(key, updated);
      if (!ok) { alert("No se pudo guardar la partida en la nube."); return false; }
      const back = await store.getCloud(key);
      if (!Array.isArray(back) || (back.find(x => x.id === id)?.partidaId || "") !== (partidaId || "")) { alert("VERIFICACIÓN FALLÓ: la nube no refleja la partida nueva."); return false; }
      (key === "cp-purchases" ? setCpPurchases : setMqPurchases)(back);
      stamp();
      return true;
    } catch (e) {
      alert("Sin conexión con la nube: no se pudo reclasificar.");
      console.warn("[GeoCost] reclasificar falló", e);
      return false;
    } finally { setReclasificando(null); }
  };

  // ── PDFs ──
  const descargarFicha = async (r) => {
    if (pdfBusy) return; setPdfBusy(true);
    try { await fichaProyectoPDF({ pres: r.pres, proyecto: proyectoDe(r.pres.projectCode), machines, tasa }); }
    catch (e) { if (!e?.isStaleChunk) alert("No se pudo generar la ficha: " + (e?.message || e)); }
    finally { setPdfBusy(false); }
  };
  const descargarReporte = async (r) => {
    if (pdfBusy) return; setPdfBusy(true);
    try { await reporteCostosPDF({ pres: r.pres, proyecto: proyectoDe(r.pres.projectCode), resumen: r.resumen, movs: r.movs, tasa, userName, machines }); }
    catch (e) { if (!e?.isStaleChunk) alert("No se pudo generar el reporte: " + (e?.message || e)); }
    finally { setPdfBusy(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PIEZAS DE RENDER (funciones, no componentes: dependen de dashAnim)
  // ═══════════════════════════════════════════════════════════════════════
  // Anillo: pista gris, arco carbón = ejecutado, arco naranja = comprometido
  // encadenado después del carbón. Nace en 0 y crece (dashAnim).
  const anillo = (s, { r = 44, stroke = 10, fontSize = 22, delay = 0 } = {}) => {
    const pres = num(s?.presupuestoUSD);
    const ej = pres > 0 ? clamp01(num(s?.ejecutadoUSD) / pres) : 0;
    const com = pres > 0 ? clamp01(num(s?.comprometidoUSD) / pres) : 0;
    const comVis = Math.min(com, 1 - ej);
    const C = 2 * Math.PI * r, size = (r + stroke) * 2, c = size / 2;
    const dash = (f) => dashAnim ? `${f * C} ${C}` : `0 ${C}`;
    const trans = reduceMotion ? "none" : `${cssAnim("stroke-dasharray", 1200, delay)}, ${cssAnim("stroke-dashoffset", 1200, delay)}`;
    return <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(44,42,40,.08)" strokeWidth={stroke} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={CHARCOAL} strokeWidth={stroke} strokeDasharray={dash(ej)} style={{ transition: trans }} />
        <circle cx={c} cy={c} r={r} fill="none" stroke={ORANGE} strokeWidth={stroke} strokeDasharray={dash(comVis)} strokeDashoffset={dashAnim ? -ej * C : 0} style={{ transition: trans }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: `800 ${fontSize}px/1 var(--display)`, letterSpacing: "-.02em", color: s?.semaforo === "sobregiro" ? ORANGE_DARK : "var(--text)" }}>
        {fmtPct(num(s?.pct))}
      </div>
    </div>;
  };

  // Barra doble horizontal: carbón ejecutado + naranja comprometido sobre pista
  const barraDoble = (s, { alto = 6, delay = 0 } = {}) => {
    const pres = num(s?.presupuestoUSD ?? s?.montoUSD);
    const ej = pres > 0 ? clamp01(num(s?.ejecutadoUSD) / pres) : 0;
    const com = pres > 0 ? Math.min(clamp01(num(s?.comprometidoUSD) / pres), 1 - ej) : 0;
    const w = (f) => dashAnim ? `${f * 100}%` : "0%";
    return <div style={{ display: "flex", height: alto, borderRadius: alto, background: "rgba(44,42,40,.08)", overflow: "hidden" }}>
      <div style={{ width: w(ej), height: "100%", background: CHARCOAL, transition: reduceMotion ? "none" : cssAnim("width", 1100, delay), flexShrink: 0 }} />
      <div style={{ width: w(com), height: "100%", background: ORANGE, transition: reduceMotion ? "none" : cssAnim("width", 1100, delay + 80), flexShrink: 0 }} />
    </div>;
  };

  const chipSem = (sem) => { const S = SEMAFORO[sem] || SEMAFORO.ok; return <Chip c={S}>{S.label}</Chip>; };
  // `chico`: a ≤12px el naranja tinta no llega a AA → token --naranja-texto-chico
  const disponibleTxt = (v, fmt = fmtUSD0, chico = false) => <span style={{ ...MONO, color: v < 0 ? (chico ? "var(--naranja-texto-chico)" : ORANGE_DARK) : "var(--text-2)", fontWeight: 700 }}>{fmt(v)}</span>;

  // Nombre de la partida de un movimiento (la MO cae a la partida "mo")
  const nombrePartidaDe = (pres, mov) => {
    const p = pres.partidas?.find(x => x.id === mov.partidaId) || (mov.fuente === "mo" ? partidaMO(pres) : null);
    return p ? p.nombre : null;
  };

  // Tabla de movimientos (detalle de proyecto y partida expandida)
  const tablaMovs = (pres, movs, { compacta = false } = {}) => {
    if (!movs.length) return <div style={{ padding: "18px 12px", color: "var(--text-3)", fontSize: 13 }}>Sin movimientos.</div>;
    return <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: compacta ? 620 : 760 }}>
        <thead><tr>
          <th style={TH}>Fecha</th><th style={TH}>Fuente</th><th style={TH}>Ref</th><th style={TH}>Descripción</th>
          <th style={TH}>Partida</th><th style={TH}>Estado</th><th style={{ ...TH, textAlign: "right" }}>L</th><th style={{ ...TH, textAlign: "right" }}>$</th>
        </tr></thead>
        <tbody>{movs.map(m => {
          const reclasificable = puedeReclasificar && (m.fuente === "compras" || m.fuente === "maquinas") && m.sourceKey;
          const nombrePart = nombrePartidaDe(pres, m);
          const est = m.fuente === "mo" && m.enCurso ? ESTADO_COSTO.encurso : ESTADO_COSTO[m.estado] || ESTADO_COSTO.comprometido;
          const busy = !!reclasificando && reclasificando.id === m.origen?.id;
          return <tr key={m.id}>
            <td style={{ ...TD, ...MONO, fontSize: 12 }}>{fmtFecha(m.fecha)}</td>
            <td style={TD}><Chip>{FUENTES[m.fuente] || m.fuente}</Chip></td>
            <td style={{ ...TD, ...MONO, fontSize: 12, fontWeight: 600 }}>{m.ref}</td>
            <td style={{ ...TD, whiteSpace: "normal", minWidth: 200, maxWidth: 360 }} title={m.descripcion}>
              <div style={{ color: "var(--text)", fontWeight: 500 }}>{truncar(m.descripcion, compacta ? 60 : 90)}</div>
              {m.detalle && <div style={{ color: "var(--text-3)", fontSize: 11.5, marginTop: 2 }}>{truncar(m.detalle, 60)}</div>}
            </td>
            <td style={{ ...TD, minWidth: 180 }}>
              {reclasificable
                ? <Select options={opcionesPartidas(pres, m.fuente === "maquinas" ? "maquinas" : "compras")} value={busy ? reclasificando.partidaId : (m.partidaId || "")} emptyLabel="Por clasificar" disabled={busy} onChange={e => reclasificar(m, e.target.value)} style={{ padding: "7px 10px", fontSize: 12.5, borderRadius: 10, opacity: busy ? .6 : 1, minWidth: 180 }} />
                : nombrePart ? <span style={{ color: "var(--text)", fontWeight: 500 }}>{truncar(nombrePart, 40)}</span> : <span style={{ color: C_AMARILLO.color, fontWeight: 700 }}>Por clasificar</span>}
            </td>
            <td style={TD}><Chip c={est}>{est.label}</Chip></td>
            <td style={{ ...TD, ...MONO, textAlign: "right" }}>{fmtL(m.montoHNL)}</td>
            <td style={{ ...TD, ...MONO, textAlign: "right", fontWeight: 700, color: "var(--text)" }}>{fmtUSD(m.montoUSD)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>;
  };

  const pillBar = (items, valor, setValor) => <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
    {items.map(([id, label]) => <button key={id} className="cc-pill" aria-pressed={valor === id} onClick={() => setValor(id)}>{label}</button>)}
  </div>;

  // ═══════════════════════════════════════════════════════════════════════
  // DASHBOARD — cartera (v3, 11-sep-2026: Gerson, "solo quiero el de barras,
  // ese de ruedita por proyecto y el gasto por mes — 3, no más"). UNA fila:
  // barras verticales agrupadas por proyecto · tarjeta(s) con anillo, una por
  // presupuesto activo apiladas en la columna del medio · gasto por mes
  // apilado. La tira KPI (Presupuesto/Comprometido/Ejecutado/Disponible) y
  // "Por categoría" se retiraron: con un solo proyecto repetían San Miguel.
  // Las gráficas son FUNCIONES (no componentes) que crecen desde 0 con
  // dashAnim, patrón GeoShopping v4; paleta SOLO gris/naranja/carbón.
  // ═══════════════════════════════════════════════════════════════════════
  const renderDashboard = () => {
    const tarjeta = (r, i) => {
      const { pres, resumen: s } = r;
      const cats = (s?.categorias || []).filter(c => num(c.presupuestoUSD) > 0);
      const abrir = () => { setSec("proyectos"); setProyActivo(pres.projectCode); };
      return <div key={pres.id} className="gt-vidrio gt-vidrio-hover gt-sube" role="button" tabIndex={0} onClick={abrir} onKeyDown={onKeyActivar(abrir)} aria-label={`Abrir ${nombreDe(pres.projectCode)}`}
        style={{ padding: 20, cursor: "pointer", display: "flex", flexDirection: "column", gap: 16, animationDelay: `${i * 70}ms` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "800 18px/1.15 var(--display)", letterSpacing: "-.015em", color: "var(--text)" }}>{nombreDe(pres.projectCode)}</div>
            {pres.ficha?.codigo && <div style={{ ...MONO, fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{pres.ficha.codigo}</div>}
          </div>
          {chipSem(s?.semaforo)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {anillo(s, { delay: i * 70 })}
          <div style={{ display: "grid", gap: 9, minWidth: 0 }}>
            {[["Ejecutado", s?.ejecutadoUSD, CHARCOAL], ["Comprometido", s?.comprometidoUSD, ORANGE], ["Disponible", s?.disponibleUSD, null]].map(([l, v, col]) => <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: col || "rgba(44,42,40,.14)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="gt-label" style={{ color: "var(--text-3)" }}>{l}</div>
                <div style={{ ...MONO, fontSize: 13.5, fontWeight: 700, color: num(v) < 0 && l === "Disponible" ? ORANGE_DARK : "var(--text)", marginTop: 2 }}>{fmtUSD0(num(v))}</div>
              </div>
            </div>)}
          </div>
        </div>
        {cats.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 7 }}>
          {cats.map((c, j) => <div key={c.categoria}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-3)", marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{c.categoria}</span>
              <span style={MONO}>{fmtPct(num(c.pct))}</span>
            </div>
            {barraDoble(c, { alto: 6, delay: i * 70 + j * 60 })}
          </div>)}
        </div>}
      </div>;
    };

    // ── Piezas comunes de las gráficas ──
    const trans = (prop, ms, delay = 0) => reduceMotion ? "none" : cssAnim(prop, ms, delay);
    const puntoLeyenda = (color, txt) => <span key={txt} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flexShrink: 0 }} />{txt}
    </span>;
    const cabecera = (titulo, derecha) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <Label>{titulo}</Label>
      {derecha && <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>{derecha}</div>}
    </div>;
    const vacioTxt = (txt, sx) => <div style={{ fontSize: 12, color: "var(--text-faint)", fontStyle: "italic", ...sx }}>{txt}</div>;
    const SERIES = [["Presupuesto", "presupuestoUSD", GRIS_BARRA], ["Comprometido", "comprometidoUSD", ORANGE], ["Ejecutado", "ejecutadoUSD", CHARCOAL]];

    // ── Por proyecto: barras verticales agrupadas (presupuesto · comprometido
    // · ejecutado por presupuesto activo). Eje Y con 4 guías sobre un techo
    // redondo; click en el grupo abre el proyecto. Con más de 6 grupos la
    // tarjeta scrollea horizontal (120px mínimo por grupo) — nunca la página.
    const grafProyectos = () => {
      const H = isMobile ? 170 : 220;
      const n = activos.length;
      const maxY = niceMax(Math.max(0, ...activos.map(r => Math.max(...SERIES.map(([, k]) => num(r.resumen?.[k]))))));
      const ticks = [1, 2, 3, 4].map(k => ({ v: maxY * k / 4, pct: k * 25 }));
      const grupo = (r, i) => {
        const { pres, resumen: s } = r;
        const nombre = nombreDe(pres.projectCode);
        const sem = s?.semaforo || "ok";
        const vals = SERIES.map(([, k]) => num(s?.[k]));
        const px = vals.map(v => clamp01(v / maxY) * H);
        // Etiqueta de valor: se oculta si la barra mide < 14px o si la vecina
        // queda a la misma altura (< 12px) y es más alta — dos "$ 31.5k" de
        // 10.5px encimados no se leen; el title del grupo trae los 3 montos.
        const conLabel = px.map((p, j) => p >= 14
          && !(j > 0 && px[j - 1] >= p && px[j - 1] - p < 12)
          && !(j < px.length - 1 && px[j + 1] > p && px[j + 1] - p < 12));
        const abrir = () => { setSec("proyectos"); setProyActivo(pres.projectCode); };
        const title = `${nombre} — ${SERIES.map(([l], j) => `${l.toLowerCase()} ${fmtUSD0(vals[j])}`).join(" · ")}`;
        return <div key={pres.id} className="cc-fila" role="button" tabIndex={0} onClick={abrir} onKeyDown={onKeyActivar(abrir)} title={title} aria-label={`Abrir ${nombre}`}
          style={{ minWidth: 0, display: "flex", flexDirection: "column", padding: "0 2px 8px" }}>
          <div style={{ height: H, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 6, padding: "0 6px" }}>
            {SERIES.map(([, k, color], j) => {
              const f = clamp01(vals[j] / maxY);
              return <div key={k} style={{ position: "relative", flex: "1 1 0", maxWidth: 34, minWidth: 6, height: dashAnim ? `${Math.max(f * 100, 1)}%` : "0%", borderRadius: "5px 5px 2px 2px", background: color, transition: trans("height", 1100, i * 110 + j * 60) }}>
                {conLabel[j] && <div style={{ position: "absolute", bottom: "100%", left: "50%", transform: "translateX(-50%)", marginBottom: 4, font: "600 10.5px/1 var(--mono)", color: "var(--text-2)", whiteSpace: "nowrap", opacity: dashAnim ? 1 : 0, transition: trans("opacity", 500, i * 110 + j * 60 + 600) }}>{fmtCorto(vals[j])}</div>}
              </div>;
            })}
          </div>
          <div style={{ marginTop: 10, textAlign: "center", minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombre}</div>
            {pres.ficha?.codigo && <div style={{ ...MONO, fontSize: 10.5, color: "var(--text-3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pres.ficha.codigo}</div>}
            {sem !== "ok" && <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}>{chipSem(sem)}</div>}
          </div>
        </div>;
      };
      return <div className="gt-vidrio gt-sube" style={{ padding: 20, minWidth: 0, display: "flex", flexDirection: "column", animationDelay: "40ms" }}>
        {cabecera("Por proyecto", SERIES.map(([l, , color]) => puntoLeyenda(color, l)))}
        <div style={{ overflowX: "auto", paddingBottom: 2, scrollbarWidth: "thin" }}>
          {/* paddingTop deja lugar al valor de una barra al 100 % y a la guía de arriba */}
          <div style={{ position: "relative", display: "flex", alignItems: "flex-start", paddingTop: 16, minWidth: n > 6 ? 54 + n * 128 : undefined }}>
            <div style={{ position: "relative", width: 44, height: H, flexShrink: 0, marginRight: 10 }}>
              {ticks.map(t => <div key={t.pct} style={{ position: "absolute", right: 0, bottom: `${t.pct}%`, transform: "translateY(50%)", font: "600 10px/1 var(--mono)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>{fmtCorto(t.v)}</div>)}
            </div>
            <div aria-hidden style={{ position: "absolute", left: 54, right: 0, top: 16, height: H, pointerEvents: "none" }}>
              {ticks.map(t => <div key={t.pct} style={{ position: "absolute", left: 0, right: 0, bottom: `${t.pct}%`, height: 1, background: "rgba(44,42,40,.06)" }} />)}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: "rgba(44,42,40,.12)" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 8 }}>
              {activos.map(grupo)}
            </div>
          </div>
        </div>
      </div>;
    };

    // ── Gasto por mes: barras apiladas (carbón ejecutado + naranja
    // comprometido) sumando resumen.porMes de todos los activos por YYYY-MM.
    // Alturas en px sobre (H - 18): así el total encima nunca empuja la
    // barra más alta fuera de la pista. H 200 en desktop: la tarjeta ocupa la
    // tercera columna de la fila y así queda a la par de las otras dos (v3).
    const grafMeses = () => {
      const H = isMobile ? 130 : 200;
      const acc = new Map();
      activos.forEach(r => (r.resumen?.porMes || []).forEach(m => {
        if (!m?.mes) return;
        const a = acc.get(m.mes) || { mes: m.mes, ejecutadoUSD: 0, comprometidoUSD: 0 };
        a.ejecutadoUSD += num(m.ejecutadoUSD); a.comprometidoUSD += num(m.comprometidoUSD);
        acc.set(m.mes, a);
      }));
      const meses = [...acc.values()].sort((a, b) => a.mes < b.mes ? -1 : 1).slice(-6).map(m => ({ ...m, total: m.ejecutadoUSD + m.comprometidoUSD }));
      const maxMes = Math.max(0, ...meses.map(m => m.total));
      const etiqueta = (mes) => MESES_CORTOS[Number(mes.slice(5, 7)) - 1] || mes;
      const alto = (v) => maxMes > 0 ? Math.round(clamp01(v / maxMes) * (H - 18)) : 0;
      return <div className="gt-vidrio gt-sube" style={{ padding: 20, minWidth: 0, animationDelay: "120ms" }}>
        {cabecera("Gasto por mes — últimos 6 meses", [puntoLeyenda(CHARCOAL, "Ejecutado"), puntoLeyenda(ORANGE, "Comprometido")])}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${meses.length || 1}, minmax(0,1fr))`, gap: isMobile ? 8 : 10 }}>
          {meses.map((m, i) => {
            const hEj = alto(m.ejecutadoUSD), hCom = alto(m.comprometidoUSD);
            return <div key={m.mes} title={`${etiqueta(m.mes)} ${m.mes.slice(0, 4)}: ${fmtUSD0(m.total)} — ejecutado ${fmtUSD0(m.ejecutadoUSD)} · comprometido ${fmtUSD0(m.comprometidoUSD)}`}
              style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ height: H, width: "100%", maxWidth: 56, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                {m.total > 0 && <div style={{ textAlign: "center", font: "600 10.5px/1 var(--mono)", color: "var(--text-2)", marginBottom: 4, whiteSpace: "nowrap", opacity: dashAnim ? 1 : 0, transition: trans("opacity", 500, i * 90 + 600) }}>{fmtCorto(m.total)}</div>}
                <div style={{ height: dashAnim ? hCom : 0, flexShrink: 0, background: ORANGE, borderRadius: hEj > 0 ? "5px 5px 0 0" : "5px 5px 2px 2px", transition: trans("height", 1100, i * 90 + 80) }} />
                <div style={{ height: dashAnim ? hEj : 0, flexShrink: 0, background: CHARCOAL, borderRadius: hCom > 0 ? "0 0 2px 2px" : "5px 5px 2px 2px", transition: trans("height", 1100, i * 90) }} />
                {m.total <= 0 && <div style={{ height: 3, flexShrink: 0, borderRadius: 2, background: "rgba(44,42,40,.08)" }} />}
              </div>
              <div style={{ font: "700 9.5px/1 var(--mono)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".5px", marginTop: 8 }}>{etiqueta(m.mes)}</div>
            </div>;
          })}
        </div>
        {maxMes <= 0 && vacioTxt("Sin movimientos todavía", { textAlign: "center", marginTop: 10 })}
      </div>;
    };

    if (activos.length === 0) return <Vidrio className="gt-sube" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "38px 20px", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconoGeoCost size={26} /></div>
      <div style={{ font: "800 17px/1.2 var(--display)", color: "var(--text)" }}>Todavía no hay presupuestos</div>
      {puedeEditarPresupuesto && <Btn onClick={() => setModal({ t: "presupuesto", pres: null })}>+ Presupuesto</Btn>}
    </Vidrio>;

    // Las 3 piezas en UNA fila (desktop); en el teléfono se apilan en ese
    // orden. alignItems start: cada tarjeta con su alto natural, sin estirarse.
    // La columna del medio apila una tarjeta con anillo por presupuesto activo.
    return <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1.35fr) minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      {grafProyectos()}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16, minWidth: 0 }}>{activos.map(tarjeta)}</div>
      {grafMeses()}
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PROYECTOS — grid + detalle
  // ═══════════════════════════════════════════════════════════════════════
  const renderProyectosGrid = () => {
    const tarjeta = (r, i) => {
      const { pres, resumen: s } = r;
      const f = pres.ficha || {};
      const cerrado = pres.estado === "cerrado";
      const abrir = () => setProyActivo(pres.projectCode);
      return <div key={pres.id} className="gt-vidrio gt-vidrio-hover gt-sube" role="button" tabIndex={0} onClick={abrir} onKeyDown={onKeyActivar(abrir)} aria-label={`Abrir ${nombreDe(pres.projectCode)}`}
        style={{ padding: 20, cursor: "pointer", display: "flex", flexDirection: "column", gap: 14, animationDelay: `${i * 70}ms`, opacity: cerrado ? .78 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "800 18px/1.15 var(--display)", letterSpacing: "-.015em", color: "var(--text)" }}>{nombreDe(pres.projectCode)}</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              {f.codigo && <span style={{ ...MONO, fontSize: 11, color: "var(--text-3)" }}>{f.codigo}</span>}
              {f.cliente && <span style={{ fontSize: 12, color: "var(--text-2)" }}>{f.cliente}</span>}
            </div>
          </div>
          {cerrado ? <Chip>Cerrado</Chip> : chipSem(s?.semaforo)}
        </div>
        {(f.fechaInicio || f.fechaFin) && <div>
          <div style={{ ...MONO, fontSize: 11.5, color: "var(--text-2)", marginBottom: 7 }}>{fmtFecha(f.fechaInicio)} → {fmtFecha(f.fechaFin)}</div>
          {barraTiempo(f.fechaInicio, f.fechaFin, { alto: 6, conMeses: false })}
        </div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
          <div>
            <Label>Usado</Label>
            <div style={{ font: "800 22px/1 var(--display)", letterSpacing: "-.02em", marginTop: 6, color: s?.semaforo === "sobregiro" ? ORANGE_DARK : "var(--text)" }}>{fmtPct(num(s?.pct))}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <Label>Disponible</Label>
            <div style={{ marginTop: 6, fontSize: 15 }}>{disponibleTxt(num(s?.disponibleUSD))}</div>
          </div>
        </div>
      </div>;
    };
    return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
      {resumenes.map(tarjeta)}
      {puedeEditarPresupuesto && <div className="cc-add gt-sube" role="button" tabIndex={0} onClick={() => setModal({ t: "presupuesto", pres: null })} onKeyDown={onKeyActivar(() => setModal({ t: "presupuesto", pres: null }))}
        style={{ minHeight: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, animationDelay: `${resumenes.length * 70}ms` }}>
        <IconoMas />
        <div style={{ font: "700 14px/1 var(--sans)" }}>Presupuesto</div>
      </div>}
      {resumenes.length === 0 && !puedeEditarPresupuesto && <Vidrio style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Todavía no hay presupuestos.</Vidrio>}
    </div>;
  };

  const renderProyectoDetalle = (r) => {
    const { pres, movs, resumen: s } = r;
    const f = pres.ficha || {};
    const dur = diasEntre(f.fechaInicio, f.fechaFin);
    const sinClas = s?.sinClasificar || { movs: [] };
    // s.movs ya trae partidaId resuelto (la MO cae a su partida "mo")
    const movsFiltrados = (s?.movs || movs).filter(m => (filtroFuente === "todos" || m.fuente === filtroFuente) && (filtroEstado === "todos" || m.estado === filtroEstado));
    const dato = (l, v) => <div style={{ minWidth: 0 }}><Label>{l}</Label><div style={{ font: "700 14px/1.2 var(--sans)", color: "var(--text)", marginTop: 6, ...(l === "Código" ? MONO : {}) }}>{v || "—"}</div></div>;

    return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16 }}>
      {/* Fila superior: volver + acciones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="cc-pill" onClick={() => setProyActivo(null)}>← Proyectos</button>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="ghost" small onClick={() => descargarFicha(r)} disabled={pdfBusy}>Ficha PDF</Btn>
          <Btn variant="dark" small onClick={() => descargarReporte(r)} disabled={pdfBusy}>Reporte PDF</Btn>
          {puedeEditarPresupuesto && <Btn small onClick={() => setModal({ t: "presupuesto", pres })}>Editar</Btn>}
        </div>
      </div>

      {/* Cabecera del proyecto */}
      <Vidrio className="gt-sube" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.6fr) minmax(300px, 1fr)", gap: isMobile ? 22 : 32, padding: isMobile ? 20 : 26 }}>
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <div>
            {f.solucion && <Chip c={C_NARANJA} style={{ marginBottom: 10 }}>{f.solucion}</Chip>}
            <div style={{ font: `800 ${isMobile ? 24 : 30}px/1.1 var(--display)`, letterSpacing: "-.02em", color: "var(--text)" }}>{nombreDe(pres.projectCode)}</div>
            {f.cliente && <div style={{ fontSize: 14, color: "var(--text-2)", marginTop: 6 }}>{f.cliente}</div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 14 }}>
            {dato("Código", f.codigo)}
            {dato("Inicio", f.fechaInicio ? fmtFecha(f.fechaInicio) : null)}
            {dato("Fin", f.fechaFin ? fmtFecha(f.fechaFin) : null)}
            {dato("Duración", dur ? `${dur} días` : null)}
          </div>
          {f.fechaInicio && barraTiempo(f.fechaInicio, f.fechaFin)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 18 : 24, justifyContent: isMobile ? "flex-start" : "flex-end" }}>
          {anillo(s, { r: 56, stroke: 12, fontSize: 26 })}
          <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
            {[["Presupuesto", s?.presupuestoUSD], ["Comprometido", s?.comprometidoUSD], ["Ejecutado", s?.ejecutadoUSD], ["Disponible", s?.disponibleUSD]].map(([l, v]) => <div key={l}>
              <Label>{l}</Label>
              <div style={{ ...MONO, fontSize: 15, fontWeight: 700, color: l === "Disponible" && num(v) < 0 ? ORANGE_DARK : "var(--text)", marginTop: 3 }}>{fmtUSD0(num(v))}</div>
            </div>)}
          </div>
        </div>
      </Vidrio>

      {/* Por clasificar — solo si hay */}
      {sinClas.movs?.length > 0 && <Vidrio className="gt-sube" style={{ padding: 0, border: "1px solid rgba(138,90,0,.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px 10px", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: C_AMARILLO.color }}>
            <IconoAlerta />
            <span style={{ font: "800 14px/1 var(--display)" }}>Por clasificar</span>
            <Chip c={C_AMARILLO}>{sinClas.movs.length}</Chip>
          </div>
          <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{fmtUSD(num(sinClas.usadoUSD))}</div>
        </div>
        <div style={{ padding: "0 8px 8px" }}>{tablaMovs(pres, sinClas.movs, { compacta: true })}</div>
      </Vidrio>}

      {/* Categorías → partidas */}
      {(s?.categorias || []).map((cat, ci) => <Vidrio key={cat.categoria} className="gt-sube" style={{ padding: "16px 20px", animationDelay: `${ci * 60}ms` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ font: "800 15px/1 var(--display)", color: "var(--text)" }}>{cat.categoria}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...MONO, fontSize: 12.5, color: "var(--text-2)" }}><b style={{ color: "var(--text)" }}>{fmtUSD0(num(cat.usadoUSD))}</b> / {fmtUSD0(num(cat.presupuestoUSD))}</span>
            {chipSem(cat.semaforo)}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 2 }}>
          {(cat.partidas || []).map((p, pi) => {
            const abierta = partidaAbierta === p.id;
            const toggle = () => setPartidaAbierta(abierta ? null : p.id);
            const sub = [p.unidad, num(p.cantidad) > 0 ? num(p.cantidad).toLocaleString("es-HN") : null, num(p.pu) > 0 ? `P.U. ${fmtUSD(num(p.pu))}` : null].filter(Boolean).join(" · ");
            return <div key={p.id}>
              <div className="cc-fila" role="button" tabIndex={0} aria-expanded={abierta} onClick={toggle} onKeyDown={onKeyActivar(toggle)}
                style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) minmax(160px, 1fr) auto", gap: isMobile ? 8 : 18, alignItems: "center", padding: "10px 10px" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{p.nombre}</div>
                  {sub && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
                </div>
                <div>{barraDoble({ presupuestoUSD: p.montoUSD ?? montoPartida(p), ejecutadoUSD: p.ejecutadoUSD, comprometidoUSD: p.comprometidoUSD }, { alto: 8, delay: ci * 60 + pi * 40 })}</div>
                <div style={{ textAlign: isMobile ? "left" : "right", minWidth: isMobile ? 0 : 200 }}>
                  <div style={{ ...MONO, fontSize: 12.5, color: "var(--text-2)" }}><b style={{ color: "var(--text)" }}>{fmtUSD0(num(p.usadoUSD))}</b> / {fmtUSD0(num(p.montoUSD ?? montoPartida(p)))}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>Disponible {disponibleTxt(num(p.disponibleUSD), fmtUSD0, true)}</div>
                </div>
              </div>
              {abierta && <div style={{ margin: "2px 6px 10px", borderRadius: 14, background: "rgba(44,42,40,.03)" }}>{tablaMovs(pres, p.movs || [], { compacta: true })}</div>}
            </div>;
          })}
        </div>
      </Vidrio>)}

      {/* Movimientos */}
      <Vidrio className="gt-sube" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ font: "800 15px/1 var(--display)", color: "var(--text)" }}>Movimientos <span style={{ ...MONO, fontSize: 12, color: "var(--text-3)", fontWeight: 600, marginLeft: 6 }}>{movsFiltrados.length}</span></div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {pillBar([["todos", "Todos"], ["compras", "Compras"], ["maquinas", "Máquinas"], ["mo", "Mano de obra"], ["movilizacion", "Movilizaciones"]], filtroFuente, setFiltroFuente)}
            <span style={{ width: 1, background: "var(--hairline)", alignSelf: "stretch" }} />
            {pillBar([["todos", "Todos"], ["comprometido", "Comprometido"], ["ejecutado", "Ejecutado"]], filtroEstado, setFiltroEstado)}
          </div>
        </div>
        {tablaMovs(pres, movsFiltrados)}
      </Vidrio>
    </div>;
  };

  const renderProyectos = () => rActivo ? renderProyectoDetalle(rActivo) : renderProyectosGrid();

  // ═══════════════════════════════════════════════════════════════════════
  // MOVILIZACIONES
  // ═══════════════════════════════════════════════════════════════════════
  const renderMovilizaciones = () => {
    const totalDe = (m) => num(m.total) || (m.renglones || []).reduce((a, r) => a + num(r.monto), 0);
    const suma = (estado) => movilizaciones.filter(m => m.estado === estado).reduce((a, m) => a + totalDe(m), 0);
    const lista = movilizaciones
      .filter(m => movEstado === "todas" || m.estado === movEstado)
      .filter(m => movTipo === "todas" || (m.tipo || "propia") === movTipo)
      .filter(m => !movProy || m.projectCode === movProy)
      .sort((a, b) => String(b.fecha || b.createdAt || "").localeCompare(String(a.fecha || a.createdAt || "")) || String(b.codigo || "").localeCompare(String(a.codigo || "")));
    // Montos grandes en la display (800 real): con ...MONO el navegador
    // sintetizaba el 800 de IBM Plex Mono (solo carga 500/600).
    const celda = (l, v) => <div style={{ minWidth: 0 }}>
      <Label>{l}</Label>
      <div style={{ font: `800 ${isMobile ? 18 : 22}px/1 var(--display)`, letterSpacing: "-.02em", color: "var(--text)", marginTop: 8, fontVariantNumeric: "tabular-nums" }}>{fmtL0(v)}</div>
    </div>;

    const tarjeta = (m, i) => {
      const E = ESTADOS_MOV[m.estado] || ESTADOS_MOV.solicitada;
      const abrir = () => setModal({ t: "movDetalle", id: m.id });
      const total = totalDe(m);
      // Con proveedor externo (11-sep-2026): chip "Proveedor" junto al estado y
      // "Pagar a: <proveedor>"; las propias (o viejas sin tipo) siguen igual.
      const esProv = m.tipo === "proveedor";
      const [aQuienLabel, aQuien] = esProv ? ["Pagar a", m.proveedor || m.acreditarA?.nombre] : ["Acreditar a", m.acreditarA?.nombre];
      return <div key={m.id} className="gt-vidrio gt-vidrio-hover gt-sube" role="button" tabIndex={0} onClick={abrir} onKeyDown={onKeyActivar(abrir)}
        style={{ padding: 18, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, animationDelay: `${i * 50}ms`, opacity: m.estado === "cancelada" ? .7 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>{m.codigo}</span>
          {/* Envuelve: con dos chips en una tarjeta de 280-320px (lo normal del
              auto-fill) el código + chips no caben en una línea y se salían del vidrio */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            {esProv && <Chip style={{ fontSize: 10.5, padding: "3px 8px" }}>Proveedor</Chip>}
            <Chip c={E}>{E.label}</Chip>
          </div>
        </div>
        <div>
          <div className="gt-label" style={{ color: "var(--text-3)" }}>{nombreDe(m.projectCode)}</div>
          <div style={{ font: "700 15px/1.25 var(--sans)", color: "var(--text)", marginTop: 5 }}>{m.origen} → {m.destino}</div>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{fmtFecha(m.fecha)}{m.descripcion ? ` · ${truncar(m.descripcion, 48)}` : ""}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginTop: 4 }}>
          <div>
            <div style={{ font: "800 20px/1 var(--display)", letterSpacing: "-.02em", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{fmtL(total)}</div>
            <div style={{ ...MONO, fontSize: 11.5, color: "var(--text-3)", marginTop: 4 }}>{fmtUSD(hnlToUsd(total, tasa))}</div>
          </div>
          {aQuien && <div style={{ textAlign: "right", fontSize: 11.5, color: "var(--text-3)", minWidth: 0 }}>{aQuienLabel}<br /><b style={{ color: "var(--text-2)" }}>{truncar(aQuien, 28)}</b></div>}
        </div>
      </div>;
    };

    return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16 }}>
      {/* En el teléfono el botón va abajo y ancho completo: al lado de tres
          cifras apiladas quedaba flotando a media tarjeta. */}
      <Vidrio className="gt-sube" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: isMobile ? 14 : 20, flexWrap: "wrap", padding: isMobile ? "16px 18px" : "18px 26px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(auto-fit, minmax(96px, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: isMobile ? 12 : 32, flex: "1 1 240px", minWidth: 0 }}>
          {celda("Solicitadas", suma("solicitada"))}
          {celda("Recibidas", suma("recibida"))}
          {celda("Acreditadas", suma("acreditada"))}
        </div>
        {puedeCrearMov && <Btn style={isMobile ? { width: "100%", justifyContent: "center" } : undefined} onClick={() => { if (!activos.length) { alert("Primero cargá un presupuesto: la movilización baja de una partida."); return; } setModal({ t: "mov", mov: null }); }}>+ Registrar movilización</Btn>}
      </Vidrio>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {pillBar([["todas", "Todas"], ["solicitada", "Solicitadas"], ["recibida", "Recibidas"], ["acreditada", "Acreditadas"], ["cancelada", "Canceladas"]], movEstado, setMovEstado)}
          {/* Grupo chico por tipo (11-sep-2026). Borde izquierdo PEGADO al grupo:
              un separador suelto quedaba huérfano al envolver (Supply Chain). */}
          <div style={{ paddingLeft: 10, borderLeft: "1px solid rgba(44,42,40,.12)" }}>
            {pillBar([["todas", "Todas"], ["propia", "Nuestras"], ["proveedor", "Con proveedor"]], movTipo, setMovTipo)}
          </div>
        </div>
        {presupuestos.length > 1 && <Select options={presupuestos.map(p => ({ value: p.projectCode, label: nombreDe(p.projectCode) }))} value={movProy} emptyLabel="Todos los proyectos" onChange={e => setMovProy(e.target.value)} style={{ width: "auto", minWidth: 200, padding: "8px 12px", fontSize: 13 }} />}
      </div>
      {lista.length === 0
        ? <Vidrio className="gt-sube" style={{ textAlign: "center", color: "var(--text-3)", fontSize: 13, padding: "34px 20px" }}>Sin movilizaciones.</Vidrio>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>{lista.map(tarjeta)}</div>}
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // MODALES (los forms viven en geocost-forms.jsx)
  // ═══════════════════════════════════════════════════════════════════════
  const renderModal = () => {
    if (!modal) return null;
    const cerrar = () => setModal(null);
    if (modal.t === "tasa") return <AjustesTasa config={config || { tasa: TASA_DEFAULT }} puedeEditar={puedeTasa} onSave={guardarConfig} onClose={cerrar} />;
    if (modal.t === "presupuesto") {
      if (!puedeEditarPresupuesto) return null;
      // Proyectos disponibles: los que aún no tienen presupuesto (en edición
      // se incluye el propio para que el select fijo lo muestre)
      const disponibles = proyectos.filter(p => !presupuestos.some(x => x.projectCode === p.short && x.id !== modal.pres?.id));
      return <PresupuestoForm pres={modal.pres} proyectos={disponibles} machines={machines} tasa={tasa} userName={userName}
        onSave={async (p) => { const ok = await guardarPresupuesto(p); if (ok) { cerrar(); if (!modal.pres) { setSec("proyectos"); setProyActivo(p.projectCode); } } return ok; }} onClose={cerrar} />;
    }
    if (modal.t === "mov") {
      if (!puedeCrearMov) return null;
      // El form acepta función, Map u objeto: se pasa la FUNCIÓN (un short
      // llamado "name"/"length" haría reventar Object.assign sobre una función)
      const proyectosNombre = (s) => nombreDe(s);
      return <MovilizacionForm mov={modal.mov} presupuestos={activos.map(r => r.pres)} proyectosNombre={proyectosNombre} tasa={tasa} userName={userName} proveedores={proveedoresNombre}
        onSave={async (m) => { const ok = await guardarMovilizacion(m); if (ok) cerrar(); return ok; }} onClose={cerrar} />;
    }
    if (modal.t === "movDetalle") {
      const mov = movilizaciones.find(m => m.id === modal.id);
      if (!mov) return null;
      const pres = presupuestos.find(p => p.projectCode === mov.projectCode) || null;
      const est = mov.estado;
      const perms = {
        puedeEditar: isAdmin && est === "solicitada",
        puedeRecibir: puedeRecibirMov && est === "solicitada",
        puedeAcreditar: puedeAcreditarMov && (est === "solicitada" || est === "recibida"),
        puedeCancelar: isAdmin && est !== "acreditada" && est !== "cancelada",
        puedeEliminar: isAdmin && (est === "solicitada" || est === "cancelada"),
      };
      return <MovilizacionDetalle mov={mov} pres={pres} tasa={tasa} perms={perms}
        onMarcarRecibida={() => cambiarEstadoMov(mov.id, "recibida", {}, "Recibida por " + userName)}
        onAdjuntarComprobante={(file) => adjuntarComprobante(mov, file)}
        onCancelar={() => cancelarMov(mov)}
        onEliminar={async () => { const ok = await eliminarMov(mov); if (ok) cerrar(); return ok; }}
        onEditar={() => setModal({ t: "mov", mov })}
        onVerComprobante={() => verComprobante(mov)}
        onClose={cerrar} />;
    }
    return null;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // PANTALLAS DE CARGA / ERROR
  // ═══════════════════════════════════════════════════════════════════════
  if (errorCarga) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", color: CHARCOAL, padding: 20 }}>
    <style>{GT_CSS}</style>
    <div className="gt-vidrio" style={{ padding: "30px 32px", maxWidth: 420, textAlign: "center", display: "grid", gap: 14, justifyItems: "center" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center" }}><IconoAlerta /></div>
      <div style={{ font: "800 18px/1.2 var(--display)" }}>Sin conexión con la nube</div>
      <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{errorCarga}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {onBack && <Btn variant="ghost" onClick={onBack}>Volver</Btn>}
        <Btn onClick={cargar}>Reintentar</Btn>
      </div>
    </div>
  </div>;
  // Mismo fondo del sistema: no parpadea entre el panel y el módulo
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", fontFamily: "inherit", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoCost…</div>;

  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;

  // ═══════════════════════════════════════════════════════════════════════
  // LAYOUT (estructura del header/tabs de GeoShopping)
  // ═══════════════════════════════════════════════════════════════════════
  return <div className="gt-entra-modulo" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", height: "100vh", fontFamily: "inherit", background: "#F9F9F8", color: CHARCOAL }}>
    {/* Sistema visual compartido (tokens + clases gt-*). ⚠ SIN `precedence`. */}
    <style>{GT_CSS}</style>
    <style>{CC_CSS}</style>
    {/* Manchas de brillo: sin ellas el backdrop-filter del vidrio no difumina nada */}
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />

    {/* HEADER compacto: volver, logo, icono del módulo · tasa, usuario, salir.
        En celular (375px) no cabía en una fila por el chip de tasa y la página
        entera paneaba: envuelve, el icono se oculta y el chip queda corto. */}
    <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: isMobile ? "10px 12px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, minWidth: 0 }}>
        {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
        <img src={logoUrl} alt="Geotecnica Soluciones" style={{ height: isMobile ? 28 : 34, width: "auto", display: "block" }} />
        {!isMobile && <div title="GeoCost — Central de costos" aria-label="GeoCost" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <IconoGeoCost />
        </div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexShrink: 0, marginLeft: "auto" }}>
        {!hrOk && <Chip c={C_AMARILLO} title="No se pudieron leer asistencia/HE de GeoTeam: la mano de obra no se está sumando">MO no disponible</Chip>}
        <button className="cc-tasa" onClick={() => setModal({ t: "tasa" })} title={puedeTasa ? "Cambiar la tasa de cambio" : "Tasa de cambio vigente"}>{isMobile ? tasa.toFixed(2) : `L ${tasa.toFixed(2)} / $`}</button>
        {!isMobile && <div style={{ textAlign: "right" }}>
          <div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{userName || "Usuario"}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{roleLabel}</div>
        </div>}
        {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Cerrar sesión</button>}
      </div>
    </div>

    {/* TOPNAV — texto limpio, subrayado naranja inset en la activa */}
    <div style={{ position: "relative", zIndex: 2, display: "flex", borderBottom: "1px solid rgba(44,42,40,.08)", overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: isMobile ? 8 : 20, scrollbarWidth: "thin" }}>
      {NAV.map(n => {
        const active = sec === n.id;
        // Tocar "Proyectos" estando en un detalle vuelve al grid
        return <button key={n.id} onClick={() => { if (n.id === "proyectos" && sec === "proyectos") setProyActivo(null); setSec(n.id); }}
          style={{ padding: isMobile ? "12px 14px" : "14px 18px", background: "transparent", border: "none", boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none", color: active ? "var(--naranja-tinta)" : "var(--text-3)", cursor: "pointer", fontSize: 13.5, fontWeight: active ? 800 : 600, fontFamily: "inherit", transition: "color .15s", whiteSpace: "nowrap" }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-3)"; }}
        >{n.label}</button>;
      })}
    </div>

    {/* CONTENIDO */}
    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "8px 14px 20px" : "12px 32px 28px" }}>{
        sec === "dashboard" ? renderDashboard()
          : sec === "proyectos" ? renderProyectos()
          : renderMovilizaciones()
      }</div>
    </div>
    {renderModal()}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}
