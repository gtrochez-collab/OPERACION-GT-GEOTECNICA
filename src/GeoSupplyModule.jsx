// ═══════════════════════════════════════════════════════════════════════════
// GeoSupply — Solicitudes de material (2-oct-2026, pedido de Gerson)
// ═══════════════════════════════════════════════════════════════════════════
// Del residente a la aprobación: el ingeniero residente pide ítems de la
// receta del PM (cc-presupuestos), Almacén (Óscar) revisa stock, Compras (Ana)
// cotiza, el Coordinador (Gerson) aprueba y la cotización aprobada cae como
// BORRADOR en GeoShopping para que Finanzas solo complete condición de pago,
// fecha, "Va a" y responsable de cierre, y la envíe a Tesorería.
//
// Reglas de oro (acordadas en la Fase 0, no re-litigar):
//   · No se duplica nada: proyectos (projects.js + cp-projects), proveedores
//     (cp-providers), usuarios (users.js + gt-usuarios), partidas/receta
//     (cc-presupuestos) y la tasa (cc-config) se LEEN de donde ya viven.
//   · El borrador en GeoShopping mantiene `status:"borrador"` y lleva la marca
//     `origenSupply`: todo lo que hoy excluye borradores lo sigue excluyendo.
//   · Las automatizaciones por hora (martes 15:00, viernes 12:00) NO escriben
//     nada — se calculan al abrir (`estadoEfectivoLinea`); no hay servidor.
//   · Toda la lógica con regla de negocio vive en geosupply-calc.js (pura,
//     testeada con `npm test`). Acá solo hay estado, guardado y pantalla.
//
// Keys propias: sp-solicitudes, sp-cotizaciones, sp-config, sp-file-<id>.
import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";
import { USERS, ROLE_LABEL } from "./users.js";
import { hoyISO } from "./fechas.js";
import { Input, Select, Btn, Chip, Modal, C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, fmtL, uid, useIsMobile } from "./geocost-ui.jsx";
import {
  configEfectiva, corteActual, etiquetaCorte, hitoDeCorte, estadoHito, fmtFalta, llegadaEstimada, fmtDiaCorto,
  DIAS_SEMANA, contarPendientes, estadoEfectivoLinea, solicitudActiva, ESTADOS_LINEA, ESTADOS_SOLICITUD, estadoCabecera,
} from "./geosupply-calc.js";

const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const CHARCOAL = "#2C2A28";
const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.07)", borde: "rgba(192,57,43,.22)" };
const TONO = { gris: C_GRIS, verde: C_VERDE, azul: C_AZUL, amarillo: C_AMARILLO, naranja: C_NARANJA, rojo: C_ROJO };

// Quién es quién dentro del módulo. `asistente_compras` es Ana (Compras),
// `logistica` es Óscar (Almacén). Finanzas y gerencia solo miran.
const rolSupply = (userRole) => (
  userRole === "admin" ? "coordinador"
    : userRole === "residente" ? "residente"
    : userRole === "logistica" ? "almacen"
    : userRole === "asistente_compras" ? "compras"
    : (userRole === "costos" || userRole === "compras_ops" || userRole === "tesoreria") ? "finanzas"
    : userRole === "gerencia" ? "gerencia"
    : null
);
const ROL_LABEL = { coordinador: "Coordinador de Operaciones", residente: "Ingeniero Residente", almacen: "Almacén", compras: "Compras", finanzas: "Finanzas (solo lectura)", gerencia: "Gerencia (solo lectura)" };

const fmtFechaCorta = (ymd) => fmtDiaCorto(ymd);
const fmtHora = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (isNaN(h)) return "";
  const ap = h >= 12 ? "p.m." : "a.m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ap}`;
};

// Ícono del módulo (la misma caja con flecha del Panel de Control).
const IconoSupply = ({ size = 21 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v8" /><path d="m8.5 6.5 3.5-3.5 3.5 3.5" /><path d="M3.3 9.8 12 13.8l8.7-4" /><path d="M4 9.8v7.4a1 1 0 0 0 .55.9L12 21.5l7.45-3.4a1 1 0 0 0 .55-.9V9.8" /><path d="M12 13.8v7.7" /></svg>;

export default function GeoSupplyModule({ userRole, userName, userKey, userProyectos = [], onBack, onLogout }) {
  const isMobile = useIsMobile();
  const rol = rolSupply(userRole);
  const esCoordinador = rol === "coordinador";
  const soloLectura = rol === "finanzas" || rol === "gerencia";

  // ── Datos ──
  const [loaded, setLoaded] = useState(false);
  const [solicitudes, setSolicitudes] = useState([]);
  const [cotizaciones, setCotizaciones] = useState([]);
  const [spConfig, setSpConfig] = useState(null);
  const [presupuestos, setPresupuestos] = useState([]);
  const [ccConfig, setCcConfig] = useState(null);
  const [customProjects, setCustomProjects] = useState([]);
  const [providers, setProviders] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const cfg = configEfectiva(spConfig);

  // Reloj para las cuentas regresivas (cada 30 s basta).
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30000); return () => clearInterval(t); }, []);

  // Todo con getCloud (nunca store.get: su re-sync de cache viejo puede
  // ESCRIBIR keys ajenas desde una pantalla que solo las lee).
  const leer = async (k) => { try { return await store.getCloud(k); } catch (e) { console.warn(`[GeoSupply] no se pudo leer ${k}:`, e?.message || e); return undefined; } };
  const cargar = async () => {
    const [sol, cot, cf, pr, cc, cp, pv, pu, us] = await Promise.all([
      leer("sp-solicitudes"), leer("sp-cotizaciones"), leer("sp-config"), leer("cc-presupuestos"), leer("cc-config"),
      leer("cp-projects"), leer("cp-providers"), leer("cp-purchases"), leer("gt-usuarios"),
    ]);
    if (Array.isArray(sol)) setSolicitudes(sol);
    if (Array.isArray(cot)) setCotizaciones(cot);
    if (cf && typeof cf === "object") setSpConfig(cf);
    if (Array.isArray(pr)) setPresupuestos(pr);
    if (cc && typeof cc === "object") setCcConfig(cc);
    if (Array.isArray(cp)) setCustomProjects(cp);
    if (Array.isArray(pv)) setProviders(pv);
    if (Array.isArray(pu)) setPurchases(pu);
    if (Array.isArray(us)) setUsuarios(us);
  };
  useEffect(() => { let vivo = true; (async () => { await cargar(); if (vivo) setLoaded(true); })(); return () => { vivo = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Refresco al volver a la pestaña — las bandejas son colas de trabajo.
  useEffect(() => { const f = () => { if (document.visibilityState === "visible") cargar(); }; window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Proyectos: lista unificada base + custom (misma regla que GeoTeam) ──
  const proyectos = (() => {
    const base = new Set(CANONICAL_PROJECTS.map(p => p.short));
    const out = [];
    CANONICAL_PROJECTS.forEach(p => { const x = customProjects.find(c => c.short === p.short); if (x?.hidden || x?.deleted) return; out.push({ ...p, ...(x || {}) }); });
    customProjects.forEach(c => { if (base.has(c.short) || c.hidden || c.deleted) return; out.push(c); });
    return out.sort((a, b) => String(a.short).localeCompare(String(b.short), "es", { sensitivity: "base", numeric: true }));
  })();
  const proyectoDe = (short) => proyectos.find(p => p.short === short) || null;
  const nombreProy = (short) => proyectoDe(short)?.name || short || "—";
  // El residente ve SOLO sus proyectos. Se leen frescos de gt-usuarios (si
  // Gerson le agregó uno hoy, no tiene que volver a loguearse).
  const miUsuario = usuarios.find(u => u.username === userKey) || null;
  const misProyectos = rol === "residente" ? (miUsuario?.proyectos || userProyectos || []) : proyectos.map(p => p.short);
  const residentes = usuarios.filter(u => u.role === "residente" && u.activo !== false);

  // ── Navegación por rol ──
  const [sec, setSec] = useState(() => (rol === "coordinador" || rol === "finanzas" || rol === "gerencia") ? "hoy" : "solicitudes");
  const NAV = {
    coordinador: [{ id: "hoy", label: "Hoy" }, { id: "solicitudes", label: "Solicitudes" }, { id: "config", label: "Configuración" }],
    residente:   [{ id: "solicitudes", label: "Mis solicitudes" }],
    almacen:     [{ id: "solicitudes", label: "Solicitudes" }],
    compras:     [{ id: "solicitudes", label: "Solicitudes" }],
    finanzas:    [{ id: "hoy", label: "Hoy" }, { id: "solicitudes", label: "Solicitudes" }],
    gerencia:    [{ id: "hoy", label: "Hoy" }, { id: "solicitudes", label: "Solicitudes" }],
  };
  const nav = NAV[rol] || [];

  // ── Piezas de UI ──
  const pill = (label, active, onClick, n) => <button key={label} onClick={onClick} style={{ padding: "7px 13px", borderRadius: 999, border: active ? "none" : "1px solid rgba(44,42,40,.12)", background: active ? ORANGE_DARK : "rgba(255,255,255,.6)", color: active ? "#fff" : "#5C5853", font: "700 12px/1 var(--sans)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>{label}{n != null && <span style={{ opacity: .75, fontWeight: 600 }}>{n}</span>}</button>;
  const stat = (n, l, { c, onClick } = {}) => <button key={l} onClick={onClick} disabled={!onClick} style={{ background: "transparent", border: "none", padding: isMobile ? "4px 10px" : "4px 18px", textAlign: "left", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", borderRight: isMobile ? "none" : "1px solid rgba(44,42,40,.08)" }}>
    <div style={{ font: "800 22px/1 var(--display)", color: c || CHARCOAL, letterSpacing: "-.02em" }}>{n}</div>
    <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>{l}</div>
  </button>;
  const chipEstado = (mapa, k) => { const e = mapa[k]; return <Chip c={TONO[e?.tono] || C_GRIS}>{e?.label || k}</Chip>; };

  // ── Resumen del corte en curso (para Hoy y para el residente) ──
  const corte = corteActual(ahora);
  const etq = etiquetaCorte(corte);
  const hitos = ["cierreSolicitudes", "almacenHasta", "aprobacionHasta"].map(n => ({ ...hitoDeCorte(corte, n, cfg), ...estadoHito(hitoDeCorte(corte, n, cfg), ahora) }));
  const HITO_LABEL = { cierreSolicitudes: "Cierre de solicitudes", almacenHasta: "Revisión de almacén", aprobacionHasta: "Cotizaciones aprobadas" };
  const llegada = llegadaEstimada(corte, cfg);
  const activas = solicitudes.filter(solicitudActiva);
  const lineasEf = activas.flatMap(s => (s.lineas || []).map(l => ({ l, s, ef: estadoEfectivoLinea(l, s, cfg, ahora) })));
  const n = {
    alertas: lineasEf.filter(x => x.ef.estado === "pendiente_coord").length,
    almacen: lineasEf.filter(x => x.ef.estado === "revision_almacen").length,
    porCotizar: lineasEf.filter(x => x.ef.estado === "por_cotizar").length,
    cotizadas: cotizaciones.filter(q => q.estado === "enviada").length,
    devueltas: cotizaciones.filter(q => q.estado === "devuelta").length,
    delCorte: activas.filter(s => s.corte && s.corte.anio === corte.anio && s.corte.semana === corte.semana).length,
  };
  // Lo que falta para el viernes: todo lo que aún no está aprobado ni despachado ni rechazado.
  const faltanViernes = lineasEf.filter(x => !["despachada_almacen", "comprada", "rechazada"].includes(x.ef.estado)).length;

  // ═══════════════════════════ HOY ═══════════════════════════
  const renderHoy = () => {
    const hViernes = hitos[2];
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Tira resumen: cada número es un acceso directo */}
      <div className="gt-vidrio" style={{ padding: "12px 10px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: isMobile ? 6 : 0 }}>
        <div style={{ padding: isMobile ? "4px 10px" : "4px 18px", borderRight: isMobile ? "none" : "1px solid rgba(44,42,40,.08)" }}>
          <div style={{ font: "800 15px/1.1 var(--display)", color: CHARCOAL }}>{etq.titulo}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>{etq.sub}</div>
        </div>
        {stat(n.alertas, "alertas por aprobar", { c: n.alertas ? ORANGE_DARK : undefined })}
        {stat(n.cotizadas, "cotizaciones por aprobar", { c: n.cotizadas ? ORANGE_DARK : undefined })}
        {stat(n.almacen, "en almacén")}
        {stat(n.porCotizar + n.devueltas, "en compras")}
        <div style={{ padding: isMobile ? "4px 10px" : "4px 18px", marginLeft: isMobile ? 0 : "auto" }}>
          <div style={{ font: "800 15px/1.1 var(--display)", color: hViernes.pasado ? "var(--text-3)" : faltanViernes ? ORANGE_DARK : C_VERDE.color }}>
            {hViernes.pasado ? "Corte cerrado" : faltanViernes ? `Faltan ${faltanViernes}` : "Todo aprobado"}
          </div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>viernes {fmtHora(hViernes.hora)} · {fmtFalta(hViernes.faltaMin)}</div>
        </div>
      </div>

      {/* Dos cajas grandes de vidrio, como Accounting */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <div className="gt-vidrio" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, minHeight: 220 }}>
          <div className="gt-label" style={{ color: "var(--text-3)" }}>Por aprobar</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={{ font: "800 44px/1 var(--display)", color: (n.alertas + n.cotizadas) ? ORANGE_DARK : CHARCOAL, letterSpacing: "-.03em" }}>{n.alertas + n.cotizadas}</div>
            <div style={{ fontSize: 13, color: "var(--text-2)" }}>{(n.alertas + n.cotizadas) === 1 ? "decisión pendiente" : "decisiones pendientes"}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip c={n.alertas ? C_NARANJA : C_GRIS}>{n.alertas} alertas de ítems</Chip>
            <Chip c={n.cotizadas ? C_NARANJA : C_GRIS}>{n.cotizadas} cotizaciones</Chip>
            {n.devueltas > 0 && <Chip c={C_AMARILLO}>{n.devueltas} devueltas a Compras</Chip>}
          </div>
          <div style={{ marginTop: "auto", fontSize: 12.5, color: "var(--text-3)" }}>
            {(n.alertas + n.cotizadas) === 0 ? "Nada esperando tu decisión." : "Las bandejas de alertas y cotizaciones llegan en la siguiente entrega."}
          </div>
        </div>

        <div className="gt-vidrio" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <div className="gt-label" style={{ color: "var(--text-3)" }}>Corte en curso</div>
            <Chip c={C_GRIS}>{n.delCorte} {n.delCorte === 1 ? "solicitud" : "solicitudes"}</Chip>
          </div>
          <div style={{ font: "800 22px/1.1 var(--display)", color: CHARCOAL, letterSpacing: "-.02em" }}>{etq.titulo}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
            {hitos.map(h => <div key={h.nombre} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 12, background: h.pasado ? "rgba(44,42,40,.04)" : "rgba(255,255,255,.55)", border: "1px solid rgba(44,42,40,.07)" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: h.pasado ? C_VERDE.bg : C_NARANJA.bg, color: h.pasado ? C_VERDE.color : C_NARANJA.color, fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{h.pasado ? "✓" : "·"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: h.pasado ? "var(--text-3)" : CHARCOAL }}>{HITO_LABEL[h.nombre]}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{fmtFechaCorta(h.ymd)} · {fmtHora(h.hora)}</div>
              </div>
              <Chip c={h.pasado ? C_GRIS : C_NARANJA}>{fmtFalta(h.faltaMin)}</Chip>
            </div>)}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>
            Llegada estimada a obra: <b>{fmtFechaCorta(llegada.desde)} – {fmtFechaCorta(llegada.hasta)}</b>
          </div>
        </div>
      </div>
    </div>;
  };

  // ═══════════════════════════ SOLICITUDES (lista) ═══════════════════════════
  const [solQ, setSolQ] = useState("");
  const [solProy, setSolProy] = useState("");
  const renderSolicitudes = () => {
    const visibles = solicitudes
      .filter(s => rol !== "residente" || s.residente === userKey)
      .filter(s => !solProy || s.projectCode === solProy)
      .filter(s => !solQ || `${s.folio} ${nombreProy(s.projectCode)} ${s.residente}`.toLowerCase().includes(solQ.toLowerCase()))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const proyectosConSol = [...new Set(solicitudes.map(s => s.projectCode))];
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rol === "residente" && <div className="gt-vidrio" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ font: "800 15px/1.1 var(--display)", color: CHARCOAL }}>{etq.titulo}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>
          {hitos[0].pasado
            ? <>Lo que enviés ahora entra al <b>corte siguiente</b> (cierre {DIAS_SEMANA[cfg.cortes.cierreSolicitudes.dia]} {fmtHora(cfg.cortes.cierreSolicitudes.hora)}).</>
            : <>Enviá antes del <b>{DIAS_SEMANA[cfg.cortes.cierreSolicitudes.dia]} {fmtHora(cfg.cortes.cierreSolicitudes.hora)}</b> ({fmtFalta(hitos[0].faltaMin)}) · llega a obra <b>{fmtFechaCorta(llegada.desde)} – {fmtFechaCorta(llegada.hasta)}</b>.</>}
        </div>
      </div>}
      {solicitudes.length > 0 && <div className="gt-vidrio" style={{ padding: isMobile ? "10px 14px" : "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <input value={solQ} onChange={e => setSolQ(e.target.value)} placeholder="Buscar folio, proyecto o residente" style={{ flex: 1, minWidth: 180, padding: "8px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 999, fontSize: 13, background: "rgba(255,255,255,.7)", outline: "none", fontFamily: "inherit" }} />
        {rol !== "residente" && proyectosConSol.length > 1 && <select value={solProy} onChange={e => setSolProy(e.target.value)} style={{ padding: "8px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 999, fontSize: 13, background: "rgba(255,255,255,.7)", fontFamily: "inherit" }}>
          <option value="">Todos los proyectos</option>
          {proyectosConSol.map(p => <option key={p} value={p}>{nombreProy(p)}</option>)}
        </select>}
        {(solQ || solProy) && <Btn small variant="ghost" onClick={() => { setSolQ(""); setSolProy(""); }}>Limpiar</Btn>}
      </div>}
      {visibles.length === 0
        ? <div className="gt-vidrio" style={{ padding: "44px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
          {solicitudes.length === 0
            ? (rol === "residente" ? "Todavía no tenés solicitudes." : "Todavía no hay solicitudes de material.")
            : "Nada coincide con el filtro."}
        </div>
        : visibles.map(s => {
          const est = estadoCabecera(s);
          const ls = s.lineas || [];
          return <div key={s.id} className="gt-vidrio gt-vidrio-hover" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: CHARCOAL }}>{s.folio}</div>
            {chipEstado(ESTADOS_SOLICITUD, est)}
            {s.urgente && <Chip c={C_ROJO}>Urgente</Chip>}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{nombreProy(s.projectCode)}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{ls.length} {ls.length === 1 ? "ítem" : "ítems"} · pidió {usuarios.find(u => u.username === s.residente)?.label || s.residente} · {s.corte ? etiquetaCorte(s.corte).titulo : "sin corte"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: CHARCOAL }}>{s.fechaRequeridaObra ? fmtFechaCorta(s.fechaRequeridaObra) : "—"}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 3 }}>requerida en obra</div>
            </div>
          </div>;
        })}
    </div>;
  };

  // ═══════════════════════════ CONFIGURACIÓN ═══════════════════════════
  const [cfgDraft, setCfgDraft] = useState(null);
  const [cfgSaving, setCfgSaving] = useState(false);
  const draft = cfgDraft || cfg;
  const uCorte = (nombre, k, v) => setCfgDraft({ ...draft, cortes: { ...draft.cortes, [nombre]: { ...draft.cortes[nombre], [k]: k === "dia" ? Number(v) : v } } });
  const guardarConfig = async () => {
    const d = cfgDraft; if (!d) return;
    if (!(Number(d.semaforo.verde) >= 0 && Number(d.semaforo.amarillo) > Number(d.semaforo.verde))) return alert("El umbral amarillo debe ser mayor que el verde.");
    if (!(Number(d.cortes.llegadaHasta) >= Number(d.cortes.llegadaDesde))) return alert("La llegada 'hasta' no puede ser antes que 'desde'.");
    setCfgSaving(true);
    try {
      const rec = { ...d, semaforo: { verde: Number(d.semaforo.verde), amarillo: Number(d.semaforo.amarillo) }, toleranciaTotalL: Number(d.toleranciaTotalL) || 0, updatedAt: new Date().toISOString(), updatedBy: userName };
      const ok = await store.set("sp-config", rec);
      if (!ok) return alert("No se pudo guardar la configuración en la nube. Reintentá.");
      const back = await store.getCloud("sp-config");
      if (!back || back.updatedAt !== rec.updatedAt) return alert("VERIFICACIÓN FALLÓ: la nube no refleja la configuración.");
      setSpConfig(back); setCfgDraft(null);
    } catch (e) { alert("Sin conexión con la nube: " + (e?.message || e)); }
    finally { setCfgSaving(false); }
  };
  const DIAS_OPC = [1, 2, 3, 4, 5, 6, 7].map(d => ({ value: String(d), label: DIAS_SEMANA[d] }));
  const PERSONAS = USERS.filter(u => u.role !== "marcaje").map(u => u.label).filter((v, i, a) => a.indexOf(v) === i);
  const renderConfig = () => <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
    <div className="gt-vidrio" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="gt-label" style={{ color: "var(--text-3)" }}>Calendario semanal</div>
      {[["cierreSolicitudes", "Cierre de solicitudes", "Después de esta hora, la solicitud entra al corte siguiente (salvo urgentes)."],
        ["almacenHasta", "Revisión de almacén hasta", "Lo que almacén no revisó pasa solo a Por cotizar, marcado “sin revisión de almacén”."],
        ["aprobacionHasta", "Cotizaciones aprobadas", "Lo que no esté aprobado queda “fuera de corte”."]].map(([k, t, d]) => <div key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 150px", gap: 10, alignItems: "end" }}>
        <Select label={t} options={DIAS_OPC} value={String(draft.cortes[k].dia)} onChange={e => uCorte(k, "dia", e.target.value)} emptyLabel="día" />
        <Input label="Hora" type="time" value={draft.cortes[k].hora} onChange={e => uCorte(k, "hora", e.target.value)} />
        <div style={{ gridColumn: "1/-1", fontSize: 11.5, color: "var(--text-3)", marginTop: -4 }}>{d}</div>
      </div>)}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Select label="Llega a obra desde" options={DIAS_OPC} value={String(draft.cortes.llegadaDesde)} onChange={e => setCfgDraft({ ...draft, cortes: { ...draft.cortes, llegadaDesde: Number(e.target.value) } })} emptyLabel="día" />
        <Select label="Hasta" options={DIAS_OPC} value={String(draft.cortes.llegadaHasta)} onChange={e => setCfgDraft({ ...draft, cortes: { ...draft.cortes, llegadaHasta: Number(e.target.value) } })} emptyLabel="día" />
        <div style={{ gridColumn: "1/-1", fontSize: 11.5, color: "var(--text-3)", marginTop: -4 }}>De la semana siguiente al corte. Es lo que ve el residente como fecha estimada.</div>
      </div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="gt-vidrio" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Semáforo de precio y tolerancias</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Input label="Verde hasta (%)" type="number" step="0.5" min="0" value={Math.round(Number(draft.semaforo.verde) * 1000) / 10} onChange={e => setCfgDraft({ ...draft, semaforo: { ...draft.semaforo, verde: Number(e.target.value) / 100 } })} />
          <Input label="Amarillo hasta (%)" type="number" step="0.5" min="0" value={Math.round(Number(draft.semaforo.amarillo) * 1000) / 10} onChange={e => setCfgDraft({ ...draft, semaforo: { ...draft.semaforo, amarillo: Number(e.target.value) / 100 } })} />
          <Input label="Tolerancia del total (L)" type="number" step="0.5" min="0" value={draft.toleranciaTotalL} onChange={e => setCfgDraft({ ...draft, toleranciaTotalL: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Chip c={C_VERDE}>≤ {Math.round(Number(draft.semaforo.verde) * 1000) / 10} % verde</Chip>
          <Chip c={C_AMARILLO}>≤ {Math.round(Number(draft.semaforo.amarillo) * 1000) / 10} % amarillo</Chip>
          <Chip c={C_ROJO}>más: rojo, justificación obligatoria</Chip>
        </div>
      </div>

      <div className="gt-vidrio" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Cierra con contabilidad, por proyecto</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Se pre-llena en el borrador de GeoShopping. Finanzas lo puede cambiar.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {proyectos.filter(p => presupuestos.some(x => x.projectCode === p.short && x.estado !== "cerrado")).map(p => <div key={p.short} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 200px", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <Select options={PERSONAS} value={draft.cierrePorProyecto[p.short] || ""} onChange={e => setCfgDraft({ ...draft, cierrePorProyecto: { ...draft.cierrePorProyecto, [p.short]: e.target.value } })} emptyLabel="Lo asigna Finanzas" />
          </div>)}
          {!proyectos.some(p => presupuestos.some(x => x.projectCode === p.short && x.estado !== "cerrado")) && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Ningún proyecto tiene receta en GeoCost todavía.</div>}
        </div>
      </div>

      <div className="gt-vidrio" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Residentes y sus proyectos</div>
        {residentes.length === 0
          ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no hay residentes. Se crean en <b>GeoTeam → Accesos</b>, desde la ficha del colaborador.</div>
          : residentes.map(r => <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid rgba(44,42,40,.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, minWidth: 160 }}>{r.label}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(r.proyectos || []).length ? r.proyectos.map(p => <Chip key={p} c={C_GRIS}>{proyectoDe(p)?.name || p}</Chip>) : <Chip c={C_AMARILLO}>Sin proyectos asignados</Chip>}</div>
          </div>)}
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Los accesos y la asignación de proyectos se editan en GeoTeam → Accesos.</div>
      </div>
    </div>

    <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
      {cfgDraft && <Btn variant="ghost" onClick={() => setCfgDraft(null)} disabled={cfgSaving}>Descartar</Btn>}
      <Btn onClick={guardarConfig} disabled={!cfgDraft || cfgSaving}>{cfgSaving ? "Guardando…" : "Guardar configuración"}</Btn>
    </div>
  </div>;

  // ═══════════════════════════ ROOT ═══════════════════════════
  if (!rol) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", color: "#6E6862", fontSize: 13 }}>Este usuario no tiene acceso a GeoSupply.</div>;
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", fontFamily: "inherit", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoSupply…</div>;
  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
  const secOk = nav.some(x => x.id === sec) ? sec : nav[0]?.id;

  return <div className="gt-entra-modulo" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", height: "100vh", fontFamily: "inherit", background: "#F9F9F8", color: CHARCOAL }}>
    <style>{GT_CSS}</style>
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />

    <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: isMobile ? "10px 12px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, minWidth: 0 }}>
        {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
        <img src={logoUrl} alt="Geotecnica Soluciones" style={{ height: isMobile ? 28 : 34, width: "auto", display: "block" }} />
        <div title="GeoSupply — Solicitudes de material" aria-label="GeoSupply" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconoSupply /></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {!isMobile && <div style={{ textAlign: "right" }}>
          <div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{userName || "Usuario"}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{ROL_LABEL[rol] || ROLE_LABEL[userRole] || userRole}</div>
        </div>}
        {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Cerrar sesión</button>}
      </div>
    </div>

    <div style={{ position: "relative", zIndex: 2, display: "flex", borderBottom: "1px solid rgba(44,42,40,.08)", overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: isMobile ? 8 : 20, scrollbarWidth: "thin" }}>
      {nav.map(x => {
        const active = secOk === x.id;
        return <button key={x.id} onClick={() => setSec(x.id)} style={{ padding: isMobile ? "12px 14px" : "14px 18px", background: "transparent", border: "none", boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none", color: active ? "var(--naranja-tinta)" : "var(--text-3)", cursor: "pointer", fontSize: 13.5, fontWeight: active ? 800 : 600, fontFamily: "inherit", transition: "color .15s", whiteSpace: "nowrap" }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text)"; }} onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-3)"; }}>{x.label}</button>;
      })}
    </div>

    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "8px 14px 20px 14px" : "12px 32px 28px 32px" }}>
        {secOk === "hoy" ? renderHoy() : secOk === "config" ? renderConfig() : renderSolicitudes()}
      </div>
    </div>
  </div>;
}
