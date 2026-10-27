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
//     `origenSupply`: todo lo que hoy excluye borradores lo sigue excluyendo;
//     GeoCost lo cuenta como comprometido por la marca.
//   · Las automatizaciones por hora (martes 15:00, viernes 12:00) NO escriben
//     nada — se calculan al abrir (`estadoEfectivoLinea`); no hay servidor.
//   · Toda la lógica con regla de negocio vive en geosupply-calc.js (pura,
//     testeada con `npm test`). Acá solo hay estado, guardado y pantalla.
//   · GUARDADO: nunca se escribe el array con la foto local. Cada acción es
//     una función sobre el registro FRESCO de la nube (`actualizarSolicitud(id,
//     fn)`): se lee con getCloud, se aplica, se escribe y se verifica. Así
//     Óscar y Gerson pueden tocar líneas distintas de la misma solicitud sin
//     pisarse.
//
// Keys propias: sp-solicitudes, sp-cotizaciones, sp-config. Los PDFs van en
// `cp-file-<id>` (el MISMO prefijo de GeoShopping) para que el borrador los
// abra con su FileSlot y el paquete de cierre los adjunte sin más.
import { useState, useEffect, useRef, useMemo } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";
import { USERS, ROLE_LABEL } from "./users.js";
import { hoyISO } from "./fechas.js";
import { num, UNIDADES, TASA_DEFAULT, movimientosCompras, VARILLAS, LARGOS_VARILLA, esPartidaVarillaPorPeso, cantidadDeVarilla, pesoLanceKg, nombreVarilla, kgPorUnidad } from "./geocost-calc.js";
import { Input, Select, Textarea, Btn, Chip, Modal, C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, fmtL, fmtUSD, uid, useIsMobile } from "./geocost-ui.jsx";
import { VisorArchivo } from "./visor-archivo.jsx";
import { safeDynamicImport } from "./lazyLoad.js";
import { leerPdf, parsearCotizacion, lineasSupplyDesdeLectura, lineaSupplyDe, memoriaDeCompras } from "./leer-cotizacion.js";
import {
  configEfectiva, corteActual, corteDe, etiquetaCorte, hitoDeCorte, estadoHito, fmtFalta, llegadaEstimada, fmtDiaCorto, fmtDiaLargo,
  DIAS_SEMANA, estadoEfectivoLinea, solicitudActiva, ESTADOS_LINEA, ESTADOS_SOLICITUD, ESTADOS_COTIZACION, estadoCabecera,
  estadoInicialLinea, alertasDeLinea, ALERTAS, puedeCancelar, aplicarAccionLinea, pendienteDeCompra, saldoDePartida, partidasPedibles,
  puPresupuestoUSD, evaluarCotizacion, siguienteFolio, siguienteCodigoCompra, borradorDesdeCotizacion, fueraDeCorte, metricasDashboard,
  LINEA_TERMINAL, esPedidoPlantel, pendientePlantel, ymdSumar, partesHN, enviadaEnCorte, round2,
} from "./geosupply-calc.js";

const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const CHARCOAL = "#2C2A28";
const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.07)", borde: "rgba(192,57,43,.22)" };
const TONO = { gris: C_GRIS, verde: C_VERDE, azul: C_AZUL, amarillo: C_AMARILLO, naranja: C_NARANJA, rojo: C_ROJO };
const SEM = { verde: { c: C_VERDE, label: "Verde" }, amarillo: { c: C_AMARILLO, label: "Amarillo" }, rojo: { c: C_ROJO, label: "Rojo" }, sin_base: { c: C_GRIS, label: "Sin base" } };
const fileKey = (id) => `cp-file-${id}`;

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

const fmtHora = (hhmm) => {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (isNaN(h)) return "";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "p.m." : "a.m."}`;
};
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("es-HN", { timeZone: "America/Tegucigalpa", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtCant = (n) => num(n).toLocaleString("es-HN", { maximumFractionDigits: 2 });
const fmtPct = (p) => p == null || !isFinite(p) ? "—" : `${p > 0 ? "+" : ""}${(p * 100).toFixed(1)} %`;
const fmtDias = (d) => d == null ? "—" : d < 1 ? `${Math.round(d * 24)} h` : `${d.toFixed(1)} d`;
const nombreUsuario = (username, usuarios) => usuarios.find(u => u.username === username)?.label || USERS.find(u => u.username === username)?.label || username || "—";

// Ícono del módulo (la misma caja con flecha del Panel de Control).
const IconoSupply = ({ size = 21 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v8" /><path d="m8.5 6.5 3.5-3.5 3.5 3.5" /><path d="M3.3 9.8 12 13.8l8.7-4" /><path d="M4 9.8v7.4a1 1 0 0 0 .55.9L12 21.5l7.45-3.4a1 1 0 0 0 .55-.9V9.8" /><path d="M12 13.8v7.7" /></svg>;

// ── Controles compartidos (estilo vidrio) ──
const pillBtn = (label, active, onClick, { n, c, disabled, title, key } = {}) => <button key={key || label} title={title} disabled={disabled} onClick={onClick} style={{ padding: "7px 13px", borderRadius: 999, border: active ? "none" : "1px solid rgba(44,42,40,.12)", background: active ? (c || ORANGE_DARK) : "rgba(255,255,255,.6)", color: active ? "#fff" : "#5C5853", font: "700 12px/1 var(--sans)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>{label}{n != null && <span style={{ opacity: .75, fontWeight: 600 }}>{n}</span>}</button>;
const Buscador = ({ value, onChange, placeholder }) => <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1, minWidth: 180, padding: "8px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 999, fontSize: 13, background: "rgba(255,255,255,.7)", outline: "none", fontFamily: "inherit" }} />;
const Vacio = ({ children }) => <div className="gt-vidrio" style={{ padding: "44px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>{children}</div>;
const chipEstado = (mapa, k) => { const e = mapa[k]; return <Chip c={TONO[e?.tono] || C_GRIS}>{e?.label || k}</Chip>; };
const chipSem = (s) => <Chip c={SEM[s]?.c || C_GRIS}>{SEM[s]?.label || s}</Chip>;

// Grupo compactable por proyecto (mismo patrón de Por coordinar en GeoShopping).
function Grupo({ titulo, sub, abierto, onToggle, derecha, children, alerta }) {
  return <div className="gt-vidrio" style={{ overflow: "hidden", background: alerta ? C_NARANJA.bg : undefined }}>
    <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}>
      <span aria-hidden style={{ width: 22, color: "var(--text-3)", display: "inline-block", transition: "transform .2s", transform: abierto ? "rotate(90deg)" : "none" }}>›</span>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>{titulo}</div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>{derecha}</div>
    </div>
    {abierto && <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>}
  </div>;
}

// Pasos de una línea (tracking tipo "dónde va mi pedido").
// 13-oct-2026 (Gerson): "Compras" → "En cotización"; "En compra" →
// "Pendiente de pago", que pasa a "Pagado" en verde cuando la Lic. Carolina
// paga; "Llega a obra" → "En camino a tu proyecto", que pasa a "Entregado en
// tu proyecto" en verde cuando hay ficha firmada (Logística la exige al marcar
// entregado) — ahí se completa el proceso.
const PASOS = ["Enviada", "Almacén", "En cotización", "Aprobación", "Pendiente de pago", "En camino a tu proyecto"];
const etiquetaPaso = (i, paso) => i === 4 && paso.idx >= 5 ? "Pagado"
  : i === 5 && paso.idx === 5 && paso.estado === "fin" && paso.etapa === "entregado" ? "Entregado en tu proyecto"
  : PASOS[i];
// `entrega` = {completa, ficha, cerrada, despachoEntregado} de la compra (entregaDe).
const pasoDeLinea = (l, sol, purchase, entrega = {}) => {
  if (!l) return { idx: 0, estado: "activo" };
  if (l.estado === "rechazada") return { idx: -1, estado: "rechazada" };
  if (l.estado === "pendiente_coord") return { idx: 0, estado: "alerta", nota: "Esperando al Coordinador" };
  if (l.estado === "revision_almacen") return { idx: 1, estado: "activo" };
  if (l.estado === "despachada_almacen") return { idx: 1, estado: "fin", nota: "Sale de almacén" };
  if (l.estado === "por_cotizar") return { idx: 2, estado: "activo" };
  if (l.estado === "cotizada") return { idx: 3, estado: "activo" };
  if (l.estado === "comprada") {
    if (entrega.completa) return { idx: 5, estado: "fin", etapa: "entregado", nota: entrega.ficha ? "Entregado · ficha firmada" : "Cerrada sin ficha" };
    if (purchase && (purchase.status === "pagado" || purchase.status === "finalizado")) return { idx: 5, estado: "activo", etapa: "pagado", nota: entrega.despachoEntregado ? "Entregado · falta subir la ficha firmada" : purchase.deliveryStatus === "entrega_proveedor" ? "Lo entrega el proveedor" : "Pagado, en camino" };
    if (purchase && purchase.status === "validado") return { idx: 4, estado: "activo", etapa: "pendiente_pago", nota: "En Tesorería" };
    return { idx: 4, estado: "activo", etapa: "pendiente_pago", nota: "Con Finanzas" };
  }
  return { idx: 0, estado: "activo" };
};
function PasosLinea({ paso, compact }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "nowrap", overflowX: "auto" }}>
    {PASOS.map((p, i) => {
      const hecho = paso.idx > i || (paso.estado === "fin" && paso.idx === i);
      const actual = paso.idx === i && paso.estado !== "fin";
      const rechazada = paso.estado === "rechazada";
      const color = rechazada ? C_ROJO.color : hecho ? C_VERDE.color : actual ? (paso.estado === "alerta" ? ORANGE_DARK : ORANGE) : "rgba(44,42,40,.18)";
      const noAplica = paso.estado === "fin" && i > paso.idx;
      const etq = etiquetaPaso(i, paso);
      return <div key={p} style={{ display: "flex", alignItems: "center", flex: i < PASOS.length - 1 ? "1 1 0" : "0 0 auto", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: compact ? 44 : 64 }}>
          <span style={{ width: compact ? 14 : 18, height: compact ? 14 : 18, borderRadius: "50%", background: hecho ? color : "transparent", border: `2px solid ${color}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 900, opacity: noAplica ? .35 : 1, boxShadow: actual ? `0 0 0 4px ${paso.estado === "alerta" ? C_NARANJA.bg : "rgba(232,118,45,.18)"}` : "none" }}>{hecho ? "✓" : ""}</span>
          {!compact && <span style={{ fontSize: 10, fontWeight: actual || etq !== p ? 800 : 600, color: etq !== p ? C_VERDE.color : actual ? CHARCOAL : noAplica ? "var(--text-faint)" : "var(--text-3)", whiteSpace: "nowrap" }}>{etq}</span>}
        </div>
        {i < PASOS.length - 1 && <div style={{ flex: 1, height: 2, background: paso.idx > i ? C_VERDE.color : "rgba(44,42,40,.12)", margin: compact ? "0 2px 0" : "0 4px 14px", minWidth: 8 }} />}
      </div>;
    })}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM DE SOLICITUD (residente) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function SolicitudFormImpl({ solicitud, proyectos, presDe, saldoDe, catalogo = [], cfg, ahora, userKey, onGuardar, onClose, isMobile, proyectoInicial = "", subirPdf, verArchivo }) {
  const [subiendoCot, setSubiendoCot] = useState(false);
  const [f, setF] = useState(() => solicitud ? { ...solicitud, lineas: (solicitud.lineas || []).map(l => ({ ...l })) } : { projectCode: proyectoInicial, fechaRequeridaObra: "", urgente: false, justificacionUrgencia: "", notas: "", lineas: [] });
  const [q, setQ] = useState("");
  const [sol, setSol] = useState("");
  const [fuera, setFuera] = useState(null);     // { descripcion, unidad, cantidad, justificacion }
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  // "Pedir al plantel / taller" (26-oct-2026): no es compra, no usa receta.
  const esPlantel = f.tipo === "plantel";
  const pres = esPlantel ? null : presDe(f.projectCode);
  const sinReceta = !!f.projectCode && !pres;
  const libre = sinReceta || esPlantel;
  const pedibles = partidasPedibles(pres);
  const soluciones = [...new Set(pedibles.map(p => String(p.solucion || "").trim()).filter(Boolean))];
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // La varilla (partida en Ton) se puede agregar varias veces: una línea por diámetro.
  const yaEsta = (id) => f.lineas.some(l => l.partidaId === id) && !esPartidaVarillaPorPeso(pedibles.find(p => p.id === id));
  const agregar = (p) => {
    if (yaEsta(p.id)) return;
    const vr = esPartidaVarillaPorPeso(p) ? { varilla: { n: "", largo: 9, lances: "" } } : {};
    u("lineas", [...f.lineas, { id: uid(), partidaId: p.id, descripcion: p.nombre, unidad: p.unidad || "", categoria: p.categoria || "", solucion: p.solucion || "", cantidad: "", fueraPresupuesto: false, ...vr }]);
  };
  // Varilla: diámetro + largo + lances → cantidad en la unidad de la partida.
  const uVarilla = (id, k, v) => u("lineas", f.lineas.map(l => {
    if (l.id !== id) return l;
    const varilla = { ...(l.varilla || {}), [k]: k === "lances" ? v : Number(v) };
    const cant = varilla.n && num(varilla.lances) > 0 ? cantidadDeVarilla(varilla, l.unidad) : "";
    return { ...l, varilla, cantidad: cant ? String(cant) : "" };
  }));
  const uLinea = (id, k, v) => u("lineas", f.lineas.map(l => l.id === id ? { ...l, [k]: v } : l));
  const quitar = (id) => u("lineas", f.lineas.filter(l => l.id !== id));
  const saldoLinea = (l) => l.partidaId ? saldoDe(f.projectCode, l.partidaId, f.id) : null;
  // Suma TODAS las líneas de la misma partida (la varilla puede venir en varias).
  const excede = (l) => { const s = saldoLinea(l); const tot = f.lineas.filter(x => x.partidaId && x.partidaId === l.partidaId).reduce((a, x) => a + num(x.cantidad), 0); return !!s && !s.sinCantidad && tot > s.saldo + 0.0001; };
  const corte = corteDe(ahora, cfg, { urgente: !!f.urgente });
  const etq = etiquetaCorte(corte);
  const lleg = llegadaEstimada(corte, cfg);
  const errores = (enviar) => {
    const e = [];
    if (!f.projectCode) e.push("Elegí el proyecto.");
    if (enviar && !f.fechaRequeridaObra) e.push("Poné la fecha en que lo necesitás en obra.");
    if (enviar && f.fechaRequeridaObra && f.fechaRequeridaObra < hoyISO()) e.push("La fecha requerida en obra ya pasó.");
    if (enviar && !f.lineas.length) e.push("Agregá al menos un ítem.");
    f.lineas.forEach(l => {
      if (l.varilla && enviar && (!l.varilla.n || !(num(l.varilla.lances) > 0))) e.push(`${l.descripcion || "Varilla"}: elegí la varilla y cuántos lances.`);
      else if (enviar && !(num(l.cantidad) > 0)) e.push(`${l.descripcion || "Ítem"}: la cantidad debe ser mayor que 0.`);
      if (l.fueraPresupuesto && (!String(l.descripcion || "").trim() || (enviar && !sinReceta && String(l.justificacion || "").trim().length < 5))) e.push(`${l.descripcion || "Ítem fuera de presupuesto"}: escribí qué es y por qué no está en la receta.`);
    });
    if (f.urgente && enviar && String(f.justificacionUrgencia || "").trim().length < 5) e.push("Una urgente necesita justificación.");
    return e;
  };
  const guardar = async (enviar) => {
    const errs = errores(enviar);
    if (errs.length) return alert(errs.join("\n"));
    if (enviar && f.urgente && !confirm("Marcaste la solicitud como URGENTE: se salta el corte, pero cada ítem pasa primero por el Coordinador y queda medido. ¿Enviar igual?")) return;
    setSaving(true);
    try {
      const lineas = f.lineas.map(l => ({ ...l, cantidad: num(l.cantidad), excedeSaldo: excede(l), ...(l.fueraPresupuesto ? { sinReceta } : {}),
        // La varilla se describe por lo que se pide: "Varilla #5 (5/8") de 9 m · 20 lances"
        ...(l.varilla && l.varilla.n ? { varilla: { n: Number(l.varilla.n), largo: Number(l.varilla.largo || 9), lances: num(l.varilla.lances) }, descripcion: `${nombreVarilla(l.varilla)} · ${num(l.varilla.lances).toLocaleString("es-HN")} lances` } : {}) }));
      await onGuardar({ ...f, lineas }, enviar);
    } finally { setSaving(false); }
  };
  const CTRL = { padding: "8px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 10, fontSize: 13, outline: "none", background: "#F4F4F2", fontFamily: "inherit", boxSizing: "border-box" };
  const cambiarTipo = (t) => { if (t === (f.tipo || "compra")) return; if (f.lineas.length && !confirm("Cambiar el tipo quita lo que ya agregaste. ¿Seguir?")) return; setF(p => ({ ...p, tipo: t, lineas: [], urgente: false, justificacionUrgencia: "" })); setFuera(null); };
  const editable = !solicitud || solicitud.estado === "borrador";
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {editable && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 4, borderRadius: 14, background: "rgba(44,42,40,.06)" }}>
      {[["compra", "Comprar material", "Pasa por el proceso de compra"], ["plantel", "Pedir al plantel / taller", "Lo que ya hay o se produce acá: placas, varillas roscadas…"]].map(([k, t, d]) => {
        const on = (f.tipo || "compra") === k;
        return <button key={k} type="button" onClick={() => cambiarTipo(k)} aria-pressed={on} style={{ padding: "10px 12px", borderRadius: 11, border: "none", background: on ? "#fff" : "transparent", boxShadow: on ? "0 2px 8px rgba(44,42,40,.12)" : "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: on ? CHARCOAL : "var(--text-2)" }}>{t}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>{d}</div>
        </button>;
      })}
    </div>}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: 12 }}>
      <Select label={esPlantel ? "Para qué proyecto *" : "Proyecto *"} options={[{ group: "Con receta en GeoCost", options: proyectos.filter(p => presDe(p.short)).map(p => ({ value: p.short, label: p.name || p.short })) }, { group: "Sin receta", options: proyectos.filter(p => !presDe(p.short)).map(p => ({ value: p.short, label: p.name || p.short })) }].filter(g => g.options.length)} value={f.projectCode} onChange={e => { u("projectCode", e.target.value); u("lineas", f.lineas.filter(l => l.fueraPresupuesto || l.plantel)); setSol(""); }} emptyLabel="Elegí el proyecto" disabled={!!solicitud && solicitud.estado !== "borrador"} />
      <Input label="Lo necesito en obra el *" type="date" value={f.fechaRequeridaObra || ""} min={hoyISO()} onChange={e => u("fechaRequeridaObra", e.target.value)} />
    </div>
    {esPlantel && <div style={{ padding: "10px 14px", borderRadius: 12, background: C_AZUL.bg, color: C_AZUL.color, fontSize: 12.5 }}>Le llega directo a Almacén (Óscar), que te lo va enviando según se produzca. Si no lo hay, te lo devuelve con una nota.</div>}
    {!esPlantel && f.projectCode && !pres && <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(44,42,40,.05)", color: "var(--text-2)", fontSize: 12.5 }}>Este proyecto no tiene receta: pedí lo que haga falta y lo aprueba el Coordinador.</div>}

    {/* LA RECETA DESPLEGADA (27-oct-2026, pedido de los ingenieros: "que
        salga la receta completa al pedir, así no se nos olvida nada"). Toda la
        receta agrupada por categoría (y solución, si tiene varias); el
        buscador solo FILTRA. Cada ítem con su saldo y un toque para agregar. */}
    {pres && (() => {
      const filtrados = pedibles.filter(p => (!sol || String(p.solucion || "").trim() === sol) && (q.trim().length < 2 || norm(`${p.nombre} ${p.categoria} ${p.solucion || ""}`).includes(norm(q))));
      const grupos = [];
      filtrados.forEach(p => { const k = [soluciones.length > 1 && !sol ? String(p.solucion || "").trim() : "", p.categoria || "Otros"].filter(Boolean).join(" · "); let g = grupos.find(x => x.k === k); if (!g) grupos.push(g = { k, items: [] }); g.items.push(p); });
      const nAgregados = pedibles.filter(p => f.lineas.some(l => l.partidaId === p.id)).length;
      return <div className="gt-vidrio" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div className="gt-label" style={{ color: "var(--text-3)" }}>La receta del proyecto · {pedibles.length} ítems</div>
          {nAgregados > 0 && <span style={{ fontSize: 11.5, fontWeight: 800, color: C_VERDE.color }}>{nAgregados} agregado{nAgregados === 1 ? "" : "s"}</span>}
        </div>
        {soluciones.length > 1 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{pillBtn("Todas", !sol, () => setSol(""), { c: CHARCOAL })}{soluciones.map(s => pillBtn(s, sol === s, () => setSol(s), { c: CHARCOAL }))}</div>}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar la receta (ej. tubo, cemento, varilla)…" style={{ ...CTRL, width: "100%", padding: "10px 14px", fontSize: 13.5, borderRadius: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: isMobile ? 380 : 420, overflowY: "auto", paddingRight: 2 }}>
          {grupos.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: "6px 2px" }}>Nada en la receta con "{q}". Si de verdad hace falta, agregalo <b>fuera de presupuesto</b> abajo.</div>}
          {grupos.map(g => <div key={g.k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", justifyContent: "space-between", padding: "4px 4px 6px", background: "linear-gradient(#FBFBFA 75%, rgba(251,251,250,0))", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-2)" }}>
              <span>{g.k}</span><span style={{ color: "var(--text-3)", fontWeight: 600 }}>{g.items.length}</span>
            </div>
            {g.items.map(p => {
              const s = saldoDe(f.projectCode, p.id, f.id);
              const ya = yaEsta(p.id);
              const enLista = f.lineas.filter(l => l.partidaId === p.id);
              const agotado = s && !s.sinCantidad && s.saldo <= 0;
              return <div key={p.id} role="button" tabIndex={0} onClick={() => !ya && agregar(p)} onKeyDown={e => { if ((e.key === "Enter" || e.key === " ") && !ya) { e.preventDefault(); agregar(p); } }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, cursor: ya ? "default" : "pointer", background: enLista.length ? C_VERDE.bg : "transparent", border: `1px solid ${enLista.length ? "rgba(5,150,105,.18)" : "transparent"}`, transition: "background .15s" }}
                onMouseEnter={e => { if (!enLista.length) e.currentTarget.style.background = "rgba(44,42,40,.04)"; }} onMouseLeave={e => { if (!enLista.length) e.currentTarget.style.background = "transparent"; }}>
                <span aria-hidden style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, background: enLista.length ? "#059669" : "rgba(44,42,40,.07)", color: enLista.length ? "#fff" : "var(--text-2)" }}>{enLista.length ? "✓" : "+"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, lineHeight: 1.3 }}>{p.nombre}</div>
                  {enLista.length > 0 && <div style={{ fontSize: 11, color: C_VERDE.color, fontWeight: 700, marginTop: 1 }}>En tu pedido{enLista.some(l => num(l.cantidad) > 0) ? ` · ${enLista.map(l => `${fmtCant(num(l.cantidad))} ${l.unidad || ""}`).join(" + ")}` : " · poné la cantidad abajo"}</div>}
                </div>
                <div style={{ fontSize: 11.5, textAlign: "right", lineHeight: 1.35, flexShrink: 0 }}>
                  {s?.sinCantidad ? <span style={{ color: "var(--text-3)" }}>sin cantidad</span> : <>
                    <div style={{ color: agotado ? C_ROJO.color : CHARCOAL, fontWeight: 800 }}>{fmtCant(s.saldo)} {p.unidad}</div>
                    <div style={{ color: "var(--text-3)", fontSize: 10.5 }}>quedan de {fmtCant(s.presupuestada)} en la receta</div>
                  </>}
                </div>
              </div>;
            })}
          </div>)}
        </div>
      </div>;
    })()}

    {/* Proyecto SIN receta: catálogo con lo de las otras recetas. */}
    {!esPlantel && sinReceta && catalogo.length > 0 && (() => {
      const filtrados = catalogo.filter(c => q.trim().length < 2 || norm(`${c.nombre} ${c.categoria}`).includes(norm(q)));
      const grupos = [];
      filtrados.forEach(c => { let g = grupos.find(x => x.k === c.categoria); if (!g) grupos.push(g = { k: c.categoria, items: [] }); g.items.push(c); });
      const enPedido = (c) => f.lineas.filter(l => !l.partidaId && norm(l.descripcion) === norm(c.nombre) && norm(l.unidad) === norm(c.unidad));
      const agregarCat = (c) => { if (enPedido(c).length) return; u("lineas", [...f.lineas, { id: uid(), partidaId: null, descripcion: c.nombre, unidad: c.unidad, categoria: c.categoria, cantidad: "", fueraPresupuesto: true, justificacion: "", deCatalogo: true }]); };
      return <div className="gt-vidrio" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div className="gt-label" style={{ color: "var(--text-3)" }}>Materiales de otras recetas · {catalogo.length}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 3 }}>Tocá lo que se parezca a lo que necesitás. Si no está, agregalo abajo con "+ Agregar ítem".</div>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar (ej. tubo, cemento, varilla)…" style={{ ...CTRL, width: "100%", padding: "10px 14px", fontSize: 13.5, borderRadius: 12 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: isMobile ? 340 : 380, overflowY: "auto", paddingRight: 2 }}>
          {grupos.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: "6px 2px" }}>Nada parecido a "{q}". Agregalo abajo con "+ Agregar ítem".</div>}
          {grupos.map(g => <div key={g.k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", justifyContent: "space-between", padding: "4px 4px 6px", background: "linear-gradient(#FBFBFA 75%, rgba(251,251,250,0))", fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-2)" }}>
              <span>{g.k}</span><span style={{ color: "var(--text-3)", fontWeight: 600 }}>{g.items.length}</span>
            </div>
            {g.items.map(c => {
              const ya = enPedido(c);
              return <div key={c.k} role="button" tabIndex={0} onClick={() => agregarCat(c)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); agregarCat(c); } }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 12, cursor: ya.length ? "default" : "pointer", background: ya.length ? C_VERDE.bg : "transparent", border: `1px solid ${ya.length ? "rgba(5,150,105,.18)" : "transparent"}` }}
                onMouseEnter={e => { if (!ya.length) e.currentTarget.style.background = "rgba(44,42,40,.04)"; }} onMouseLeave={e => { if (!ya.length) e.currentTarget.style.background = "transparent"; }}>
                <span aria-hidden style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, background: ya.length ? "#059669" : "rgba(44,42,40,.07)", color: ya.length ? "#fff" : "var(--text-2)" }}>{ya.length ? "✓" : "+"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, lineHeight: 1.3 }}>{c.nombre}</div>
                  <div style={{ fontSize: 11, color: ya.length ? C_VERDE.color : "var(--text-3)", fontWeight: ya.length ? 700 : 500, marginTop: 1 }}>{ya.length ? "En tu pedido · poné la cantidad abajo" : `en ${c.proyectos.slice(0, 2).join(", ")}${c.proyectos.length > 2 ? ` y ${c.proyectos.length - 2} más` : ""}`}</div>
                </div>
                {c.unidad && <span style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 700, flexShrink: 0 }}>{c.unidad}</span>}
              </div>;
            })}
          </div>)}
        </div>
      </div>;
    })()}

    {/* Líneas agregadas */}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Lo que pedís · {f.lineas.length} {f.lineas.length === 1 ? "ítem" : "ítems"}</div>
        {!fuera && <button type="button" onClick={() => setFuera({ descripcion: "", unidad: "", cantidad: "", justificacion: "" })} style={{ background: "none", border: "none", color: "var(--naranja-texto-chico)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{libre ? "+ Agregar ítem" : "+ Agregar ítem fuera de presupuesto"}</button>}
      </div>
      {f.lineas.length === 0 && !fuera && <div style={{ padding: "18px", textAlign: "center", color: "var(--text-3)", fontSize: 13, border: "1px dashed rgba(44,42,40,.18)", borderRadius: 14 }}>Todavía no agregaste nada.</div>}
      {f.lineas.map(l => {
        const s = saldoLinea(l);
        const ex = excede(l);
        return <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: l.fueraPresupuesto && !sinReceta ? C_AMARILLO.bg : ex ? C_NARANJA.bg : "rgba(255,255,255,.75)", border: "1px solid rgba(44,42,40,.08)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{l.descripcion}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
              {l.fueraPresupuesto ? (sinReceta ? null : <Chip c={C_AMARILLO}>Fuera de presupuesto</Chip>) : <span style={{ fontSize: 11, color: "var(--text-3)" }}>{[l.solucion, l.categoria].filter(Boolean).join(" · ")}</span>}
              {s && !s.sinCantidad && <span style={{ fontSize: 11, color: ex ? C_ROJO.color : "var(--text-3)", fontWeight: ex ? 800 : 500 }}>saldo {fmtCant(s.saldo)} {l.unidad}</span>}
              {ex && <Chip c={C_ROJO}>Excede el saldo · lo aprueba el Coordinador</Chip>}
            </div>
            {l.fueraPresupuesto && !sinReceta && <input value={l.justificacion || ""} onChange={e => uLinea(l.id, "justificacion", e.target.value)} placeholder="Por qué hace falta y no está en la receta *" style={{ ...CTRL, width: "100%", marginTop: 6, background: "#fff" }} />}
          </div>
          {l.varilla
            ? <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <select value={l.varilla.n || ""} onChange={e => uVarilla(l.id, "n", e.target.value)} style={{ ...CTRL, width: 112 }}>
                <option value="">Varilla</option>{VARILLAS.map(v => <option key={v.n} value={v.n}>#{v.n} ({v.pulg})</option>)}
              </select>
              <select value={l.varilla.largo || 9} onChange={e => uVarilla(l.id, "largo", e.target.value)} style={{ ...CTRL, width: 74 }}>
                {LARGOS_VARILLA.map(x => <option key={x} value={x}>{x} m</option>)}
              </select>
              <input type="number" min="0" step="1" value={l.varilla.lances || ""} onChange={e => uVarilla(l.id, "lances", e.target.value)} placeholder="Lances" style={{ ...CTRL, width: 84, textAlign: "right", fontWeight: 700 }} />
              <span style={{ fontSize: 11.5, color: "var(--text-2)", minWidth: 70 }}>{num(l.cantidad) > 0 ? `= ${num(l.cantidad).toLocaleString("es-HN", { maximumFractionDigits: 3 })} ${l.unidad}` : l.varilla.n ? `${pesoLanceKg(l.varilla.n, l.varilla.largo || 9)} kg c/u` : ""}</span>
            </div>
            : <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min="0" step="any" value={l.cantidad} onChange={e => uLinea(l.id, "cantidad", e.target.value)} placeholder="Cant." style={{ ...CTRL, width: 90, textAlign: "right", fontWeight: 700 }} />
              <span style={{ fontSize: 12, color: "var(--text-2)", minWidth: 40 }}>{l.unidad || ""}</span>
            </div>}
          <button type="button" onClick={() => quitar(l.id)} title="Quitar" style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>;
      })}
      {fuera && <div style={{ padding: 12, borderRadius: 14, background: libre ? "rgba(44,42,40,.04)" : C_AMARILLO.bg, border: libre ? "1px solid rgba(44,42,40,.10)" : `1px solid rgba(138,90,0,.2)`, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: 8 }}>
        <div style={{ gridColumn: "1/-1", fontSize: 12, color: libre ? CHARCOAL : C_AMARILLO.color, fontWeight: 700 }}>{libre ? "Qué necesitás" : "Ítem fuera de presupuesto — lo revisa el Coordinador antes de seguir"}</div>
        <input value={fuera.descripcion} onChange={e => setFuera({ ...fuera, descripcion: e.target.value })} placeholder={esPlantel ? "Qué es (ej. Placa 0.20×0.20 m × 12 mm + tuerca y arandela) *" : "Qué es (ej. Cinta métrica 50 m) *"} style={{ ...CTRL, background: "#fff" }} />
        <input list="sp-unidades" value={fuera.unidad} onChange={e => setFuera({ ...fuera, unidad: e.target.value })} placeholder="Unidad" style={{ ...CTRL, background: "#fff" }} />
        <datalist id="sp-unidades">{UNIDADES.map(x => <option key={x} value={x} />)}</datalist>
        <input type="number" min="0" step="any" value={fuera.cantidad} onChange={e => setFuera({ ...fuera, cantidad: e.target.value })} placeholder="Cantidad *" style={{ ...CTRL, background: "#fff" }} />
        <input value={fuera.justificacion} onChange={e => setFuera({ ...fuera, justificacion: e.target.value })} placeholder={libre ? "Para qué es (opcional: ej. mantenimiento de la soldadora)" : "Por qué hace falta y no está en la receta *"} style={{ ...CTRL, background: "#fff", gridColumn: "1/-1" }} />
        <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn small variant="ghost" onClick={() => setFuera(null)}>Cancelar</Btn>
          <Btn small onClick={() => {
            if (!fuera.descripcion.trim() || !(num(fuera.cantidad) > 0) || (!libre && fuera.justificacion.trim().length < 5)) return alert(libre ? "Completá qué es y la cantidad." : "Completá qué es, la cantidad y la justificación.");
            u("lineas", [...f.lineas, { id: uid(), partidaId: null, descripcion: fuera.descripcion.trim(), unidad: fuera.unidad.trim(), categoria: "", cantidad: fuera.cantidad, ...(esPlantel ? { plantel: true, fueraPresupuesto: false } : { fueraPresupuesto: true }), justificacion: fuera.justificacion.trim() }]);
            setFuera(null);
          }}>Agregar</Btn>
        </div>
      </div>}
    </div>

    {/* COTIZACIONES QUE YA TRAE (26-oct-2026, pedido de Óscar): si quien pide
        ya consiguió la cotización, la adjunta acá y Compras la usa de una. */}
    {!esPlantel && subirPdf && <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", borderRadius: 14, border: "1px dashed rgba(44,42,40,.18)" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>¿Ya tenés cotización?</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Adjuntala (PDF o foto) y Compras la usa directo. Opcional.</div>
      </div>
      {(f.cotizacionesAdjuntas || []).map(r => <span key={r.fileId} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: "rgba(44,42,40,.06)", fontSize: 12 }}>
        <button type="button" onClick={() => verArchivo && verArchivo(r)} style={{ background: "none", border: "none", padding: 0, color: CHARCOAL, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || "Cotización"}</button>
        <button type="button" title="Quitar" onClick={() => u("cotizacionesAdjuntas", (f.cotizacionesAdjuntas || []).filter(x => x.fileId !== r.fileId))} style={{ background: "none", border: "none", padding: 0, color: "var(--text-3)", cursor: "pointer" }}>✕</button>
      </span>)}
      <label style={{ display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 999, background: "#fff", border: "1px solid rgba(44,42,40,.14)", color: CHARCOAL, fontSize: 12.5, fontWeight: 800, cursor: subiendoCot ? "wait" : "pointer" }}>
        {subiendoCot ? "Subiendo…" : (f.cotizacionesAdjuntas || []).length ? "+ Otra" : "Adjuntar cotización"}
        <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} disabled={subiendoCot} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setSubiendoCot(true); try { const ref = await subirPdf(file); if (ref) setF(p => ({ ...p, cotizacionesAdjuntas: [...(p.cotizacionesAdjuntas || []), ref] })); } finally { setSubiendoCot(false); } }} />
      </label>
    </div>}

    {/* Urgente + notas */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile || esPlantel ? "1fr" : "1fr 1fr", gap: 12 }}>
      {!esPlantel && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: CHARCOAL, cursor: "pointer" }}>
          <input type="checkbox" checked={!!f.urgente} onChange={e => u("urgente", e.target.checked)} /> Es urgente (se salta el corte)
        </label>
        {f.urgente && <input value={f.justificacionUrgencia || ""} onChange={e => u("justificacionUrgencia", e.target.value)} placeholder="Por qué no puede esperar al corte *" style={{ ...CTRL, width: "100%", background: C_ROJO.bg, border: `1px solid ${C_ROJO.borde}` }} />}
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Entra al <b>{etq.titulo}</b> · llega a obra <b>{fmtDiaCorto(lleg.desde)} – {fmtDiaCorto(lleg.hasta)}</b>.</div>
      </div>}
      <Textarea label="Notas (opcional)" value={f.notas || ""} onChange={e => u("notas", e.target.value)} placeholder="Dónde se recibe, con quién, horarios…" style={{ minHeight: 56 }} />
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
      <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
      <Btn variant="dark" onClick={() => guardar(false)} disabled={saving}>Guardar borrador</Btn>
      <Btn onClick={() => guardar(true)} disabled={saving}>{saving ? "Enviando…" : esPlantel ? "Enviar al plantel" : "Enviar solicitud"}</Btn>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM DE COTIZACIÓN (Compras) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
// `candidatas`: líneas por cotizar del proyecto [{sol, l, pendiente}].
function CotizacionFormImpl({ cotizacion, projectCode, nombreProy, candidatas, providers, partidaDe, tasa, cfg, onGuardar, onEnviar, onClose, subirPdf, verArchivo, bajarArchivo, memoria = [], isMobile, quien = (x) => x }) {
  const [f, setF] = useState(() => cotizacion
    ? { ...cotizacion, lineas: (cotizacion.lineas || []).map(l => ({ ...l })) }
    : { projectCode, provider: "", providerId: "", numeroProveedor: "", condicionPago: "contado", incluyeISV: true, totalDeclarado: "", pdfFile: null, notas: "", lineas: [] });
  const [subiendo, setSubiendo] = useState(false);
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const prov = providers.find(p => p.name === f.provider) || null;
  const provNuevo = !!f.provider && !prov;
  // Al elegir un proveedor del maestro: id + condición sugerida.
  useEffect(() => { if (prov && (f.providerId !== prov.id || (!cotizacion && prov.condicionPagoDefault && f.condicionPago !== prov.condicionPagoDefault))) setF(p => ({ ...p, providerId: prov.id, condicionPago: prov.condicionPagoDefault || p.condicionPago })); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prov?.id]);
  const incluida = (lid) => f.lineas.some(x => x.requestLineId === lid);
  const toggle = (c) => {
    if (incluida(c.l.id)) return u("lineas", f.lineas.filter(x => x.requestLineId !== c.l.id));
    const vr = c.l.varilla ? { lances: lancesDe(c.l, c.pendiente), puLance: "" } : {};
    u("lineas", [...f.lineas, { requestLineId: c.l.id, requestId: c.sol.id, cantidad: c.pendiente, parcial: false, puLps: "", justificacion: "", descripcion: c.l.descripcion, unidad: c.l.unidad, ...vr }]);
  };
  const uL = (lid, k, v) => u("lineas", f.lineas.map(x => x.requestLineId === lid ? { ...x, [k]: v } : x));
  // VARILLA: Ana cotiza por LANCE (como viene la cotización); la cantidad y el
  // P.U. por tonelada se derivan solos para el saldo y el semáforo.
  function lancesDe(ls, cant) { const kg = pesoLanceKg(ls.varilla?.n, ls.varilla?.largo); const f2 = kgPorUnidad(ls.unidad); return kg && f2 ? Math.round((num(cant) * f2) / kg) : 0; }
  const uVar = (c, k, v) => u("lineas", f.lineas.map(x => {
    if (x.requestLineId !== c.l.id) return x;
    const nx = { ...x, [k]: v };
    const cant = cantidadDeVarilla({ ...c.l.varilla, lances: nx.lances }, c.l.unidad);
    const puLps = cant > 0 && num(nx.puLance) > 0 ? (num(nx.puLance) * num(nx.lances)) / cant : "";
    return { ...nx, cantidad: cant, puLps, parcial: cant < c.pendiente - 0.0001 };
  }));
  // ── LEER LA COTIZACIÓN (12-oct-2026, Gerson: "cuando Ana suba la cotización,
  // ¿se llenan los campos solos?") — el MISMO lector de GeoMachinery: cada
  // renglón del PDF se empareja con lo que está POR COTIZAR (nombre + medidas
  // + cantidad), y se llenan P.U. con ISV, total, N° y proveedor. Ana revisa.
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState(null);
  const esPdfF = (x) => /pdf/i.test(`${x?.type || ""} ${x?.name || ""}`);
  const aDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const leer = async (dataUrl) => {
    setLeyendo(true); setLectura(null);
    try {
      const filas = await leerPdf(dataUrl, (fn) => safeDynamicImport(fn, "lector de PDF"));
      const r = parsearCotizacion(filas, { providers });
      if (!r.items.length) { setLectura({ error: filas.length < 3 ? "Este PDF no trae texto (es una foto o un escaneo): llená los precios a mano." : "No reconocí los renglones de esta cotización: llená los precios a mano." }); return; }
      if (f.lineas.length && !confirm(`Ya marcaste ${f.lineas.length} ítem(s).\n\n¿Reemplazarlos con lo que leí de la cotización?`)) return;
      const res = lineasSupplyDesdeLectura(r, candidatas, { memoria });
      const pv = r.proveedor ? providers.find(x => x.id === r.proveedor.id) || r.proveedor : null;
      setF(p => ({ ...p, lineas: res.lineas,
        ...(res.ajuste.total != null ? { totalDeclarado: String(res.ajuste.total) } : {}),
        incluyeISV: res.ajuste.modo !== "exenta",
        ...(r.numero && !String(p.numeroProveedor || "").trim() ? { numeroProveedor: r.numero } : {}),
        ...(pv && !String(p.provider || "").trim() ? { provider: pv.name } : {}) }));
      setLectura({ n: r.items.length, m: res.lineas.length, sinPareja: res.sinPareja, ajuste: res.ajuste, numero: r.numero, proveedor: pv?.name || "",
        proveedorOtro: pv && String(f.provider || "").trim() && pv.name !== f.provider ? pv.name : "",
        isvEnLinea: r.items.some(it => it.isvEnLinea), descuento: r.items.some(it => it.descuento) });
    } catch (e) {
      console.warn("[leer cotización]", e);
      if (!e?.isStaleChunk) setLectura({ error: "No pude abrir el PDF: " + (e?.message || e) });
    } finally { setLeyendo(false); }
  };
  const subirYLeer = async (file) => {
    if (!file) return;
    let ref = null;
    setSubiendo(true);
    try { ref = await subirPdf(file); if (ref) u("pdfFile", ref); } finally { setSubiendo(false); }
    if (ref && esPdfF(file)) { try { await leer(await aDataUrl(file)); } catch (e) { alert("No pude leer el archivo: " + (e?.message || e)); } }
  };
  // Cotizaciones que adjuntó quien pidió (26-oct-2026): "Usar esta" la pone
  // como el PDF de esta cotización y, si es PDF, la lee de una.
  const traidas = (() => { const vistos = new Set(); const out = []; candidatas.forEach(c => (c.sol?.cotizacionesAdjuntas || []).forEach(r => { if (r?.fileId && !vistos.has(r.fileId)) { vistos.add(r.fileId); out.push({ ref: r, sol: c.sol }); } })); return out; })();
  const usarTraida = async (ref) => {
    u("pdfFile", ref);
    if (!esPdfF(ref) || !bajarArchivo) return;
    setLeyendo(true);
    let full = null;
    try { full = await bajarArchivo(ref); } finally { setLeyendo(false); }
    if (full?.dataUrl) await leer(full.dataUrl);
  };
  const leerAdjunta = async () => {
    setLeyendo(true);
    let full = null;
    try { full = await bajarArchivo(f.pdfFile); } finally { setLeyendo(false); }
    if (!full?.dataUrl) return alert("No se pudo bajar el PDF de la nube. Reintentá.");
    await leer(full.dataUrl);
  };
  // Un renglón que no reconocí solo → Ana dice a cuál de lo pedido corresponde.
  const asignar = (item, lid) => {
    const c = candidatas.find(x => x.l.id === lid); if (!c) return;
    const ln = lineaSupplyDe(item, c, lectura?.ajuste?.factor || 1.15);
    setF(p => ({ ...p, lineas: [...p.lineas.filter(x => x.requestLineId !== lid), ln] }));
    setLectura(l => l ? { ...l, sinPareja: (l.sinPareja || []).filter(x => x !== item) } : l);
  };
  const lineaSolicitudDe = (lid) => candidatas.find(c => c.l.id === lid)?.l || null;
  const ev = evaluarCotizacion({ cotizacion: f, tasa, cfg, partidaDe, lineaSolicitudDe });
  const porLinea = (lid) => ev.lineas.find(x => x.requestLineId === lid);
  const sumaChip = ev.total > 0 && ev.lineas.length ? (ev.cuadra ? <Chip c={C_VERDE}>Cuadra con el total</Chip> : <Chip c={C_ROJO}>Diferencia {fmtL(ev.diferencia)}</Chip>) : null;
  const guardar = async (enviar) => {
    if (enviar && !ev.ok) return alert(ev.errores.join("\n"));
    if (!enviar && !String(f.provider || "").trim()) return alert("Elegí el proveedor.");
    setSaving(true);
    try { await (enviar ? onEnviar : onGuardar)({ ...f, totalDeclarado: num(f.totalDeclarado), lineas: f.lineas.map(l => ({ ...l, cantidad: num(l.cantidad), puLps: num(l.puLps), ...(l.lances !== undefined ? { lances: num(l.lances), puLance: num(l.puLance) } : {}) })) }, ev); }
    finally { setSaving(false); }
  };
  const CTRL = { padding: "8px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 10, fontSize: 13, outline: "none", background: "#F4F4F2", fontFamily: "inherit", boxSizing: "border-box" };
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {traidas.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 14, background: C_AZUL.bg }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C_AZUL.color }}>Ya viene con cotización</div>
      {traidas.map(({ ref, sol }) => <div key={ref.fileId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5 }}>
        <span style={{ flex: 1, minWidth: 160, color: "var(--text-2)" }}><b style={{ color: CHARCOAL }}>{ref.name || "Cotización"}</b> · la adjuntó {quien(sol.residente)} ({sol.folio})</span>
        <Btn small variant="ghost" onClick={() => verArchivo(ref)}>Ver</Btn>
        <Btn small disabled={leyendo} onClick={() => usarTraida(ref)}>{f.pdfFile?.fileId === ref.fileId ? "En uso" : esPdfF(ref) ? "Usar y leer" : "Usar esta"}</Btn>
      </div>)}
    </div>}
    <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Proyecto <b>{nombreProy(f.projectCode)}</b> · una cotización = un proveedor. Los precios van <b>con ISV</b>, tal cual cuadran con el total.</div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", border: `1px dashed ${ORANGE}`, background: "rgba(232,118,45,.05)", borderRadius: 14, padding: "10px 12px" }}>
      <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: "var(--text-2)" }}><b style={{ color: CHARCOAL }}>Leer la cotización</b> · subí el PDF y lleno los precios, el total, el N° y el proveedor. Vos solo revisás.</div>
      <label style={{ display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 999, background: "#C75F1F", color: "#fff", fontSize: 12.5, fontWeight: 800, cursor: leyendo || subiendo ? "wait" : "pointer", opacity: leyendo || subiendo ? .7 : 1 }}>
        {subiendo ? "Subiendo…" : leyendo ? "Leyendo…" : "Subir PDF y leer"}
        <input type="file" accept="application/pdf,.pdf" style={{ display: "none" }} disabled={leyendo || subiendo} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; subirYLeer(file); }} />
      </label>
      {f.pdfFile && esPdfF(f.pdfFile) && !leyendo && bajarArchivo && <button type="button" onClick={leerAdjunta} style={{ background: "none", border: "none", color: "#C75F1F", fontSize: 12, fontWeight: 800, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>Leer la que ya está adjunta</button>}
    </div>
    {lectura && (lectura.error
      ? <div style={{ fontSize: 12.5, color: C_AMARILLO.color, background: C_AMARILLO.bg, borderRadius: 12, padding: "9px 12px", fontWeight: 600 }}>{lectura.error}</div>
      : (() => {
        const aj = lectura.ajuste || {};
        const bien = ["isv", "exenta", "proporcional"].includes(aj.modo) && !(lectura.sinPareja || []).length;
        const libres = candidatas.filter(c => !incluida(c.l.id));
        return <div style={{ fontSize: 12.5, color: bien ? C_VERDE.color : C_AMARILLO.color, background: bien ? C_VERDE.bg : C_AMARILLO.bg, borderRadius: 12, padding: "10px 12px", lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 6 }}>
          <div>
            <b>Leí {lectura.n} {lectura.n === 1 ? "renglón" : "renglones"}</b>{lectura.proveedor ? <> de <b>{lectura.proveedor}</b></> : ""}{lectura.numero ? <> · cotización <b>{lectura.numero}</b></> : ""} · <b>{f.lineas.filter(x => x.leido).length}</b> {f.lineas.filter(x => x.leido).length === 1 ? "coincide" : "coinciden"} con lo pedido.
            {" "}{aj.modo === "isv" ? <>Les sumé el ISV a los precios · total {fmtL(aj.total)} ✓</>
              : aj.modo === "exenta" ? <>La cotización no cobra ISV: dejé los precios tal cual · total {fmtL(aj.total)}</>
              : aj.modo === "proporcional" ? <>El total ({fmtL(aj.total)}) no es la suma + 15 % (descuento o ítems exentos): lo repartí en los precios para que cuadre</>
              : aj.modo === "no_cuadra" ? <><b>La cotización dice {fmtL(aj.total)}, pero los renglones suman {fmtL(aj.suma)} + ISV = {fmtL(aj.calculado)}: revisá si falta alguno</b></>
              : <>No encontré el total: lo calculé con el 15 % ({fmtL(aj.total)})</>}
            {lectura.isvEnLinea && <> · los precios ya traían ISV</>}{lectura.descuento && <> · traía descuento por línea, ya está aplicado</>}
            {lectura.proveedorOtro && <> · ojo: la cotización parece de <b>{lectura.proveedorOtro}</b></>}
          </div>
          {(lectura.sinPareja || []).length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ fontWeight: 700 }}>Estos renglones no los encontré en lo pedido. Si son lo mismo con otro nombre, decime cuál; si no, no son de esta solicitud y el total no va a cuadrar.</div>
            {lectura.sinPareja.map((it, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200, color: CHARCOAL }}>{fmtCant(it.cantidad)} {it.unidad} × {it.nombre} · {fmtL(it.monto)}</span>
              {libres.length > 0 && <select value="" onChange={e => e.target.value && asignar(it, e.target.value)} style={{ ...CTRL, padding: "6px 8px", maxWidth: "100%", background: "#fff" }}>
                <option value="">Es… (elegí de lo pedido)</option>
                {libres.map(c => <option key={c.l.id} value={c.l.id}>{c.l.descripcion} · {fmtCant(c.pendiente)} {c.l.unidad}</option>)}
              </select>}
            </div>)}
          </div>}
          <div style={{ fontSize: 11.5, opacity: .85 }}>Revisá cada ítem antes de enviar a aprobación.</div>
        </div>;
      })())}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr 1fr", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#6E6862" }}>Proveedor *</label>
        <input list="sp-provs" value={f.provider} onChange={e => u("provider", e.target.value)} placeholder="Buscá en el maestro o escribí uno nuevo" style={{ ...CTRL, width: "100%", padding: "10px 12px", borderRadius: 12 }} />
        <datalist id="sp-provs">{providers.map(p => <option key={p.id} value={p.name} />)}</datalist>
        {provNuevo && <div style={{ fontSize: 11.5, color: C_AMARILLO.color }}>Proveedor nuevo: se crea en el maestro al aprobar; Finanzas le completa los datos bancarios.</div>}
        {prov && !(prov.bankAccounts || []).length && <div style={{ fontSize: 11.5, color: C_AMARILLO.color }}>Este proveedor no tiene datos bancarios en el maestro.</div>}
      </div>
      <Input label="N° de cotización del proveedor" value={f.numeroProveedor || ""} onChange={e => u("numeroProveedor", e.target.value)} placeholder="Ej. COT-1234" />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#6E6862" }}>Condición de pago sugerida</label>
        <div style={{ display: "flex", gap: 6 }}>{pillBtn("Contado", f.condicionPago !== "credito", () => u("condicionPago", "contado"))}{pillBtn("Crédito", f.condicionPago === "credito", () => u("condicionPago", "credito"))}</div>
      </div>
    </div>

    {/* Líneas */}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="gt-label" style={{ color: "var(--text-3)" }}>Ítems que cubre esta cotización · {f.lineas.length} de {candidatas.length} por cotizar</div>
      {candidatas.length === 0 && <div style={{ fontSize: 13, color: "var(--text-3)" }}>No hay ítems por cotizar en este proyecto.</div>}
      {candidatas.map(c => {
        const inc = incluida(c.l.id);
        const fl = f.lineas.find(x => x.requestLineId === c.l.id);
        const e = inc ? porLinea(c.l.id) : null;
        const partida = partidaDe(c.sol.projectCode, c.l.partidaId);
        const puPres = puPresupuestoUSD(partida);
        return <div key={c.l.id} style={{ borderRadius: 14, background: inc ? "rgba(255,255,255,.8)" : "rgba(255,255,255,.45)", border: `1px solid ${inc ? "rgba(44,42,40,.12)" : "rgba(44,42,40,.07)"}`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <input type="checkbox" checked={inc} onChange={() => toggle(c)} />
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{c.l.descripcion}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.sol.folio} · pendiente <b>{fmtCant(c.pendiente)} {c.l.unidad}</b> · requerido {fmtDiaCorto(c.sol.fechaRequeridaObra)}{c.l.sinRevisionAlmacen ? " · sin revisión de almacén" : ""}{c.l.fueraPresupuesto ? (c.l.sinReceta ? " · sin receta" : " · fuera de presupuesto") : puPres ? ` · presupuesto ${fmtUSD(puPres)} / ${c.l.unidad} (≈ ${fmtL(puPres * tasa)})` : ""}</div>
            </div>
            {inc && e && chipSem(e.semaforo)}
          </div>
          {inc && fl?.leido && <div style={{ fontSize: 11, color: fl.leido.score != null && fl.leido.score < 0.5 ? C_AMARILLO.color : "var(--text-3)", marginTop: -3, paddingLeft: 26 }}>
            En la cotización: <b>{fmtCant(fl.leido.cantidad)} {fl.leido.unidad} × {fl.leido.nombre}</b> · {fmtL(fl.leido.monto)} sin ISV{fl.leido.score != null && fl.leido.score < 0.5 ? " · revisá que sea lo mismo" : ""}
          </div>}
          {inc && fl && c.l.varilla && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "110px 1fr 140px 1fr", gap: 8, alignItems: "center" }}>
            <div><div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700 }}>Lances</div><input type="number" min="0" step="1" value={fl.lances ?? ""} onChange={ev2 => uVar(c, "lances", ev2.target.value)} style={{ ...CTRL, width: "100%", textAlign: "right", fontWeight: 700 }} /></div>
            <div style={{ fontSize: 11.5, color: fl.parcial ? C_AMARILLO.color : "var(--text-3)", fontWeight: fl.parcial ? 700 : 500 }}>{nombreVarilla(c.l.varilla)} = {num(fl.cantidad).toLocaleString("es-HN", { maximumFractionDigits: 3 })} {c.l.unidad}{fl.parcial ? " · parcial" : ""}</div>
            <div><div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700 }}>P.U. por lance, con ISV (L)</div><input type="number" min="0" step="any" value={fl.puLance ?? ""} onChange={ev2 => uVar(c, "puLance", ev2.target.value)} style={{ ...CTRL, width: "100%", textAlign: "right", fontWeight: 700 }} /></div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
              <div>Subtotal <b>{fmtL(e?.subtotal)}</b>{num(fl.puLps) > 0 ? ` · ${fmtL(fl.puLps)} / ${c.l.unidad}` : ""}</div>
              {e && e.semaforo !== "sin_base" && <div style={{ color: SEM[e.semaforo].c.color, fontWeight: 700 }}>{fmtPct(e.variacionPct)} vs presupuesto ({fmtUSD(e.puUSD)} vs {fmtUSD(e.puPresupuestoUSD)} / {c.l.unidad})</div>}
            </div>
            {e?.semaforo === "rojo" && <input value={fl.justificacion || ""} onChange={ev2 => uL(c.l.id, "justificacion", ev2.target.value)} placeholder="Está en rojo: justificá la variación de precio *" style={{ ...CTRL, gridColumn: "1/-1", background: C_ROJO.bg, border: `1px solid ${C_ROJO.borde}` }} />}
          </div>}
          {inc && fl && !c.l.varilla && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "110px 1fr 140px 1fr", gap: 8, alignItems: "center" }}>
            <div><div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700 }}>Cantidad</div><input type="number" min="0" step="any" value={fl.cantidad} onChange={ev2 => { const v = ev2.target.value; uL(c.l.id, "cantidad", v); uL(c.l.id, "parcial", num(v) < c.pendiente - 0.0001); }} style={{ ...CTRL, width: "100%", textAlign: "right", fontWeight: 700 }} /></div>
            <div style={{ fontSize: 11.5, color: fl.parcial ? C_AMARILLO.color : "var(--text-3)", fontWeight: fl.parcial ? 700 : 500 }}>{fl.parcial ? `Parcial: quedan ${fmtCant(c.pendiente - num(fl.cantidad))} ${c.l.unidad} para otra cotización` : `${c.l.unidad} (completo)`}</div>
            <div><div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 700 }}>P.U. con ISV (L)</div><input type="number" min="0" step="any" value={fl.puLps} onChange={ev2 => uL(c.l.id, "puLps", ev2.target.value)} style={{ ...CTRL, width: "100%", textAlign: "right", fontWeight: 700 }} /></div>
            <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5 }}>
              <div>Subtotal <b>{fmtL(e?.subtotal)}</b></div>
              {e && e.semaforo !== "sin_base" && <div style={{ color: SEM[e.semaforo].c.color, fontWeight: 700 }}>{fmtPct(e.variacionPct)} vs presupuesto ({fmtUSD(e.puUSD)} vs {fmtUSD(e.puPresupuestoUSD)})</div>}
            </div>
            {e?.semaforo === "rojo" && <input value={fl.justificacion || ""} onChange={ev2 => uL(c.l.id, "justificacion", ev2.target.value)} placeholder="Está en rojo: justificá la variación de precio *" style={{ ...CTRL, gridColumn: "1/-1", background: C_ROJO.bg, border: `1px solid ${C_ROJO.borde}` }} />}
          </div>}
        </div>;
      })}
    </div>

    {/* Total + PDF */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, alignItems: "end" }}>
      <Input label="Total de la cotización, con ISV (L) *" type="number" min="0" step="any" value={f.totalDeclarado} onChange={e => u("totalDeclarado", e.target.value)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#6E6862" }}>Suma de los ítems</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38 }}><b style={{ fontSize: 15 }}>{fmtL(ev.suma)}</b>{sumaChip}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#6E6862" }}>PDF de la cotización *</label>
        {f.pdfFile
          ? <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Btn small variant="info" onClick={() => verArchivo(f.pdfFile)}>Ver {f.pdfFile.name?.slice(0, 22)}</Btn><Btn small variant="ghost" onClick={() => u("pdfFile", null)}>Quitar</Btn></div>
          : <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "9px 14px", borderRadius: 999, border: `1px dashed ${ORANGE}`, color: "var(--naranja-tinta)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", background: "rgba(232,118,45,.06)" }}>
            {subiendo ? "Subiendo…" : "Adjuntar PDF"}
            <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} disabled={subiendo} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; if (!f.lineas.length && esPdfF(file)) return subirYLeer(file); setSubiendo(true); try { const ref = await subirPdf(file); if (ref) u("pdfFile", ref); } finally { setSubiendo(false); } }} />
          </label>}
      </div>
    </div>
    {!ev.cuadra && ev.total > 0 && ev.lineas.length > 0 && <div style={{ padding: "10px 14px", borderRadius: 12, background: C_ROJO.bg, color: C_ROJO.color, fontSize: 12.5 }}>
      {(lectura?.sinPareja || []).length > 0
        ? <>La suma no cuadra porque la cotización trae {lectura.sinPareja.length === 1 ? "un renglón que no es" : `${lectura.sinPareja.length} renglones que no son`} de esta solicitud ({fmtL(lectura.sinPareja.reduce((a, it) => a + it.monto, 0) * (lectura.ajuste?.factor || 1.15))} con ISV). <b>Pedile al proveedor la cotización solo con lo pedido</b>, o asignalo arriba si es lo mismo con otro nombre.</>
        : <>La suma de los ítems no cuadra con el total. Si la cotización trae el ISV solo al final, <b>multiplicá cada precio unitario por 1.15</b>.</>}
    </div>}
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-2)" }}><input type="checkbox" checked={f.incluyeISV !== false} onChange={e => u("incluyeISV", e.target.checked)} /> La cotización incluye ISV (informativo para contabilidad; no cambia la comparación)</label>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
      <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
      <Btn variant="dark" onClick={() => guardar(false)} disabled={saving}>Guardar borrador</Btn>
      <Btn onClick={() => guardar(true)} disabled={saving || !f.lineas.length} title={ev.ok ? "" : ev.errores[0]}>{saving ? "Enviando…" : "Enviar a aprobación"}</Btn>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
export default function GeoSupplyModule({ userRole, userName, userKey, userProyectos = [], onBack, onLogout }) {
  const isMobile = useIsMobile();
  // ── SIMULACIÓN (12-oct-2026, pedido de Gerson) ──
  // El Coordinador puede correr el proceso completo "viendo como" cada rol, en
  // keys PROPIAS (sp-sim-*): nada llega a GeoShopping, GeoCost ni a nadie. Los
  // borradores que generaría van a `sp-sim-purchases` con código SIM-.
  const rolReal = rolSupply(userRole);
  // 27-oct-2026: la simulación se APAGÓ (arranca el uso real). El código queda
  // por si se quiere volver a enseñar; para prenderla: rolReal === "coordinador".
  const puedeSimular = false;
  const [sim, setSimRaw] = useState(() => { try { return puedeSimular && sessionStorage.getItem("gt-supply-sim") === "1"; } catch { return false; } });
  const [simRol, setSimRol] = useState("residente");
  const setSim = (v) => { setSimRaw(v); try { v ? sessionStorage.setItem("gt-supply-sim", "1") : sessionStorage.removeItem("gt-supply-sim"); } catch {} };
  const rol = sim ? simRol : rolReal;
  const K = sim ? { sol: "sp-sim-solicitudes", cot: "sp-sim-cotizaciones", pur: "sp-sim-purchases" } : { sol: "sp-solicitudes", cot: "sp-cotizaciones", pur: "cp-purchases" };
  const kRef = useRef(K); kRef.current = K;
  const esCoordinador = rol === "coordinador";
  const esResidente = rol === "residente";
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
  const [simPurchases, setSimPurchases] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(null);
  const [visor, setVisor] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const cfg = configEfectiva(spConfig);
  const tasa = num(ccConfig?.tasa) || TASA_DEFAULT;

  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 30000); return () => clearInterval(t); }, []);

  const leer = async (k) => { try { return await store.getCloud(k); } catch (e) { console.warn(`[GeoSupply] no se pudo leer ${k}:`, e?.message || e); return undefined; } };
  // Guardia anti-pisada (26-oct-2026, revisión adversarial): los diálogos
  // nativos disparan `focus` → `cargar` corre EN PARALELO con un guardado y
  // puede pisar la pantalla con la foto de ANTES (patrón de GeoShopping).
  // Toda escritura estampa `lastLocalMutAtRef`; el refresh se salta si hubo
  // una mutación local hace < 8 s (antes y después de leer).
  const lastLocalMutAtRef = useRef(0);
  const marcarMutacion = () => { lastLocalMutAtRef.current = Date.now(); };
  const hayMutacionReciente = () => Date.now() - lastLocalMutAtRef.current < 8000;
  // `ligero`: el latido y el foco releen SOLO lo que cambia seguido (solicitudes
  // y cotizaciones); el resto (compras, despachos, recetas, proveedores…) se
  // relee completo al entrar, al cambiar de simulación y cada ~5 latidos.
  const cargar = async ({ ligero = false } = {}) => {
    if (ligero && hayMutacionReciente()) return;
    const k = kRef.current;
    const enSim = k.pur !== "cp-purchases";
    const [sol, cot, cf, pr, cc, cp, pv, pu, us, dp, sp] = await Promise.all([
      leer(k.sol), leer(k.cot),
      ...(ligero ? [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] : [leer("sp-config"), leer("cc-presupuestos"), leer("cc-config"), leer("cp-projects"), leer("cp-providers"), leer("cp-purchases"), leer("gt-usuarios"), leer("lg-despachos")]),
      enSim ? leer(k.pur) : Promise.resolve([]),
    ]);
    if (ligero && hayMutacionReciente()) return;
    if (kRef.current.sol !== k.sol) return;   // cambió la simulación mientras leía
    // Key ausente (null) = lista vacía; undefined = la nube no respondió.
    if (Array.isArray(sol) || sol === null) setSolicitudes(sol || []);
    if (Array.isArray(cot) || cot === null) setCotizaciones(cot || []);
    if (Array.isArray(sp) || sp === null) setSimPurchases(sp || []);
    if (cf && typeof cf === "object") setSpConfig(cf);
    if (Array.isArray(pr)) setPresupuestos(pr);
    if (cc && typeof cc === "object") setCcConfig(cc);
    if (Array.isArray(cp)) setCustomProjects(cp);
    if (Array.isArray(pv)) setProviders(pv);
    if (Array.isArray(pu)) setPurchases(pu);
    if (Array.isArray(us)) setUsuarios(us);
    if (Array.isArray(dp)) setDespachos(dp);
  };
  useEffect(() => { let vivo = true; (async () => { await cargar(); if (vivo) setLoaded(true); })(); return () => { vivo = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Entrar o salir de la simulación recarga TODO con las otras keys.
  const simPrimeraRef = useRef(true);
  useEffect(() => { if (simPrimeraRef.current) { simPrimeraRef.current = false; return; } setModal(null); cargar(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim]);
  // Latido: las bandejas son colas de trabajo — al volver a la pestaña y cada
  // 90 s con la pestaña visible (sin modal abierto, para no pisar lo que se tipea).
  const modalRef = useRef(null); modalRef.current = modal;
  const latidosRef = useRef(0);
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible" && !modalRef.current) { latidosRef.current++; cargar({ ligero: latidosRef.current % 5 !== 0 }); } };
    window.addEventListener("focus", f);
    const t = setInterval(f, 90000);
    return () => { window.removeEventListener("focus", f); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const presDe = (short) => presupuestos.find(p => p.projectCode === short && p.estado !== "cerrado") || null;
  // CATÁLOGO para proyectos SIN receta (27-oct-2026): los materiales de TODAS
  // las recetas cargadas, sin repetir (nombre + unidad), con en qué proyectos
  // aparecen. El ingeniero ve algo parecido y lo agrega con un toque.
  const catalogo = useMemo(() => {
    const nrm = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const m = new Map();
    presupuestos.filter(p => p && p.estado !== "cerrado").forEach(pr => partidasPedibles(pr).forEach(pa => {
      const k = `${nrm(pa.nombre)}|${nrm(pa.unidad)}`;
      if (!nrm(pa.nombre)) return;
      const x = m.get(k) || { k, nombre: String(pa.nombre).trim(), unidad: pa.unidad || "", categoria: pa.categoria || "Otros", proyectos: [] };
      if (!x.proyectos.includes(pr.projectCode)) x.proyectos.push(pr.projectCode);
      m.set(k, x);
    }));
    return [...m.values()].sort((a, b) => a.categoria.localeCompare(b.categoria, "es") || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base", numeric: true }));
  }, [presupuestos]);
  const partidaDe = (short, partidaId) => (presDe(short)?.partidas || []).find(p => p.id === partidaId) || null;
  // En simulación, los borradores simulados también consumen saldo.
  const purchasesVista = sim ? [...purchases, ...simPurchases] : purchases;
  const saldoDe = (short, partidaId, excluirSolicitudId) => { const partida = partidaDe(short, partidaId); return partida ? saldoDePartida({ partida, purchases: purchasesVista, solicitudes, excluirSolicitudId }) : null; };
  const miUsuario = usuarios.find(u => u.username === userKey) || null;
  // Cualquier residente puede pedir para CUALQUIER proyecto (12-oct-2026,
  // Gerson: "se rotan, cambian de proyecto rápido o se cubren"). Primero los
  // que tienen receta en GeoCost, que son los que de verdad se piden.
  const misProyectos = [...proyectos].sort((a, b) => (presDe(b.short) ? 1 : 0) - (presDe(a.short) ? 1 : 0));
  const residentes = usuarios.filter(u => u.role === "residente" && u.activo !== false);
  const quien = (username) => nombreUsuario(username, usuarios);

  // ── Guardado: SIEMPRE sobre el registro fresco de la nube ──
  const auditEntry = (action, note, extra = {}) => ({ action, by: userName, role: userRole, at: new Date().toISOString(), note: note || "", ...extra });
  // Devuelve "ok" | "perdida" (otro guardado simultáneo pisó el mío: hay que
  // rehacer la operación sobre la nube fresca) | "sin_verificar" (se guardó
  // pero la nube no respondió al confirmar) | false (no se guardó).
  // La "perdida" se detecta con una SEGUNDA lectura ~1.2 s después: dos
  // personas que guardan en la misma ventana leen el mismo array y la última
  // escritura borra a la primera, y la verificación inmediata no lo ve.
  const escribirLista = async (key, next, idVerificar, updatedAt, setter) => {
    marcarMutacion();
    const ok = await store.set(key, next);
    if (!ok) { alert("No se pudo guardar en la nube. Reintentá."); return false; }
    let back;
    try { back = await store.getCloud(key); } catch { alert("Se guardó, pero no pude confirmarlo con la nube. Recargá la página antes de volver a intentar (no lo repitas: podría quedar doble)."); return "sin_verificar"; }
    const fila = Array.isArray(back) ? back.find(x => x.id === idVerificar) : null;
    if (!fila || fila.updatedAt !== updatedAt) return "perdida";
    await new Promise(r => setTimeout(r, 1200));
    try {
      const back2 = await store.getCloud(key);
      const fila2 = Array.isArray(back2) ? back2.find(x => x.id === idVerificar) : null;
      if (!fila2 || fila2.updatedAt !== updatedAt) return "perdida";
      back = back2;
    } catch { /* la primera confirmación ya pasó */ }
    marcarMutacion();
    setter(back);
    return "ok";
  };
  const REINTENTOS_ESCRITURA = 2;
  // fn(registroFresco) → registro nuevo (o null para abortar). Devuelve el registro guardado o null.
  const actualizarEn = async (key, setter, id, fn) => {
    if (ocupado) return null;
    setOcupado(true);
    try {
      for (let intento = 0; ; intento++) {
        const c = await store.getCloud(key);
        const arr = Array.isArray(c) ? c : [];
        const cur = arr.find(x => x.id === id);
        if (!cur) { alert("El registro ya no está en la nube."); return null; }
        const next = fn(cur);
        if (!next) return null;
        const rec = { ...next, updatedAt: new Date().toISOString() };
        const r = await escribirLista(key, arr.map(x => x.id === id ? rec : x), id, rec.updatedAt, setter);
        if (r === "ok") return rec;
        if (r === "perdida" && intento < REINTENTOS_ESCRITURA) { console.warn("[GeoSupply] escritura pisada por otro usuario; reintento", intento + 1); continue; }
        if (r === "perdida") alert("Alguien más guardó al mismo tiempo y mi cambio no quedó. Recargá y volvé a intentar.");
        return null;
      }
    } catch (e) { alert("Sin conexión con la nube: no se guardó."); console.warn("[GeoSupply]", e); return null; }
    finally { setOcupado(false); }
  };
  const crearEn = async (key, setter, armar) => {
    if (ocupado) return null;
    setOcupado(true);
    try {
      for (let intento = 0; ; intento++) {
        const c = await store.getCloud(key);
        const arr = Array.isArray(c) ? c : [];
        const rec = armar(arr);   // el folio se recalcula sobre la lista fresca
        if (!rec) return null;
        const full = { ...rec, updatedAt: new Date().toISOString() };
        const r = await escribirLista(key, [...arr, full], full.id, full.updatedAt, setter);
        if (r === "ok") return full;
        if (r === "perdida" && intento < REINTENTOS_ESCRITURA) { console.warn("[GeoSupply] creación pisada por otro usuario; reintento", intento + 1); continue; }
        if (r === "perdida") alert("Alguien más guardó al mismo tiempo y lo tuyo no quedó. Volvé a intentar.");
        return null;
      }
    } catch (e) { alert("Sin conexión con la nube: no se guardó."); console.warn("[GeoSupply]", e); return null; }
    finally { setOcupado(false); }
  };
  const actualizarSolicitud = (id, fn) => actualizarEn(K.sol, setSolicitudes, id, fn);
  const actualizarCotizacion = (id, fn) => actualizarEn(K.cot, setCotizaciones, id, fn);

  // Acción sobre UNA línea (Coordinador, Almacén, Compras). La transición la
  // valida geosupply-calc; acá solo se aplica al registro fresco y se audita.
  const accionLinea = async (solId, lineaId, accion, payload = {}, nota = "") => {
    const rec = await actualizarSolicitud(solId, (s) => {
      const l = (s.lineas || []).find(x => x.id === lineaId);
      const r = aplicarAccionLinea(l, accion, payload);
      if (!r.ok) { alert(r.error); return null; }
      const lineas = s.lineas.map(x => x.id === lineaId ? r.linea : x);
      const s2 = { ...s, lineas, audit: [...(s.audit || []), auditEntry(accion, nota || `${l.descripcion}: ${l.estado} → ${r.linea.estado}`, { lineaId, de: l.estado, a: r.linea.estado })] };
      return { ...s2, estado: estadoCabecera(s2) };
    });
    return !!rec;
  };
  // Varias líneas de UNA solicitud en una sola escritura (masivo de almacén).
  const accionLineas = async (solId, lineaIds, accion, payload = {}, nota = "") => {
    const rec = await actualizarSolicitud(solId, (s) => {
      let lineas = s.lineas || []; const aud = [];
      lineaIds.forEach(id => {
        const l = lineas.find(x => x.id === id); if (!l) return;
        const r = aplicarAccionLinea(l, accion, payload); if (!r.ok) return;
        lineas = lineas.map(x => x.id === id ? r.linea : x);
        aud.push(auditEntry(accion, nota || `${l.descripcion}: ${l.estado} → ${r.linea.estado}`, { lineaId: id, de: l.estado, a: r.linea.estado }));
      });
      if (!aud.length) { alert("Ninguno de esos ítems estaba en el estado esperado (alguien más los trabajó). Recargá."); return null; }
      const s2 = { ...s, lineas, audit: [...(s.audit || []), ...aud] };
      return { ...s2, estado: estadoCabecera(s2) };
    });
    return !!rec;
  };

  // ── Residente: crear / editar / enviar / cancelar ──
  const guardarSolicitud = async (f, enviar) => {
    const ahoraISO = new Date().toISOString();
    const prepararEnvio = (s) => {
      const corte = corteDe(ahoraISO, cfg, { urgente: !!s.urgente });
      const lineas = (s.lineas || []).map(l => ({ ...l, estado: estadoInicialLinea(l, s), despachadoAlmacen: 0, aCotizar: num(l.cantidad), cantidadComprada: 0, quoteIds: [] }));
      return { ...s, lineas, estado: "enviada", fechaEnvio: ahoraISO, corte, audit: [...(s.audit || []), auditEntry("enviada", esPedidoPlantel(s) ? "Pedido enviado al plantel / taller" : `Enviada al ${etiquetaCorte(corte).titulo}${s.urgente ? " · URGENTE" : ""}`)] };
    };
    let rec;
    if (f.id) {
      rec = await actualizarSolicitud(f.id, (s) => {
        if (s.estado !== "borrador") { alert("Esta solicitud ya fue enviada: no se puede editar."); return null; }
        const base = { ...s, tipo: f.tipo || "compra", projectCode: f.projectCode, fechaRequeridaObra: f.fechaRequeridaObra, urgente: !!f.urgente, justificacionUrgencia: f.justificacionUrgencia || "", notas: f.notas || "", cotizacionesAdjuntas: f.tipo === "plantel" ? [] : (f.cotizacionesAdjuntas || []), lineas: f.lineas, audit: [...(s.audit || []), auditEntry("editada", "Borrador editado")] };
        return enviar ? prepararEnvio(base) : base;
      });
    } else {
      rec = await crearEn(K.sol, setSolicitudes, (arr) => {
        const base = { id: uid(), folio: siguienteFolio(arr, "SUP", new Date(ahoraISO).getFullYear()), projectCode: f.projectCode, residente: userKey, tipo: f.tipo || "compra", ...(rol === "almacen" ? { sinAlmacen: true } : {}), fechaRequeridaObra: f.fechaRequeridaObra, urgente: !!f.urgente, justificacionUrgencia: f.justificacionUrgencia || "", notas: f.notas || "", cotizacionesAdjuntas: f.tipo === "plantel" ? [] : (f.cotizacionesAdjuntas || []), estado: "borrador", lineas: f.lineas, createdAt: ahoraISO, audit: [auditEntry("creada", "Borrador creado")] };
        return enviar ? prepararEnvio(base) : base;
      });
    }
    if (rec && enviar && esPedidoPlantel(rec)) { setModal(null); alert(`✓ ${rec.folio} enviada al plantel. Óscar te lo va enviando.`); return; }
    if (rec) { setModal(null); if (enviar) alert(`✓ ${rec.folio} enviada al ${etiquetaCorte(rec.corte).titulo}.\nLlegada estimada a obra: ${fmtDiaCorto(llegadaEstimada(rec.corte, cfg).desde)} – ${fmtDiaCorto(llegadaEstimada(rec.corte, cfg).hasta)}.`); }
  };
  // ── SIMULACIÓN: borrar UNA solicitud simulada (13-oct-2026, Gerson:
  // "permitime borrar solicitudes hechas como simulación"). SOLO con la
  // simulación prendida y SOLO sobre las keys sp-sim-* (nunca toca
  // sp-solicitudes ni cp-purchases). Se lleva sus cotizaciones (las que solo
  // cubren ítems de ella; a una que también cubre otra solicitud solo se le
  // quitan sus ítems), los borradores simulados que salieron de esas
  // cotizaciones y sus PDF. Cada key: getCloud → quitar → set → verify.
  const borrarSolicitudSim = async (s) => {
    if (!sim || K.sol !== "sp-sim-solicitudes" || K.cot !== "sp-sim-cotizaciones" || K.pur !== "sp-sim-purchases" || ocupado) return;
    const reqDe = (q, l) => l.requestId || q.requestId;
    const tocaSol = (q) => q.requestId === s.id || (q.lineas || []).some(l => reqDe(q, l) === s.id);
    const deEllaSola = (q) => (q.lineas || []).every(l => reqDe(q, l) === s.id);
    const cotsBorrar = cotizaciones.filter(q => tocaSol(q) && deEllaSola(q));
    const cotsMixtas = cotizaciones.filter(q => tocaSol(q) && !deEllaSola(q));
    const idsCot = new Set(cotsBorrar.map(q => q.id)), idsMixtas = new Set(cotsMixtas.map(q => q.id));
    const pursBorrar = simPurchases.filter(p => p.origenSupply && (idsCot.has(p.origenSupply.quoteId) || (p.origenSupply.requestId === s.id && !idsMixtas.has(p.origenSupply.quoteId))));
    const partes = [cotsBorrar.length ? `${cotsBorrar.length} cotización${cotsBorrar.length === 1 ? "" : "es"}` : "", pursBorrar.length ? `${pursBorrar.length} borrador${pursBorrar.length === 1 ? "" : "es"} de GeoShopping simulado` : ""].filter(Boolean);
    if (!confirm(`¿Borrar la solicitud simulada ${s.folio}?${partes.length ? `\n\nTambién se borra${partes.length > 1 || cotsBorrar.length > 1 || pursBorrar.length > 1 ? "n" : ""}: ${partes.join(" y ")}.` : ""}${cotsMixtas.length ? `\n\n${cotsMixtas.length} cotización(es) que también cubren otra solicitud se quedan, sin los ítems de esta.` : ""}\n\nSolo afecta la simulación.`)) return;
    setOcupado(true);
    try {
      const quitar = async (key, setter, transformar, idsFuera) => {
        const c = await store.getCloud(key);
        const arr = Array.isArray(c) ? c : [];
        const next = transformar(arr);
        if (next === arr) return;
        if (!(await store.set(key, next))) throw new Error(`No se guardó ${key}`);
        const back = await store.getCloud(key);
        if ((Array.isArray(back) ? back : []).some(x => idsFuera.has(x.id))) throw new Error(`La nube no confirmó el borrado en ${key}`);
        setter(next);
      };
      const ahoraISO = new Date().toISOString();
      const idsPur = new Set(pursBorrar.map(p => p.id));
      await quitar(K.pur, setSimPurchases, (arr) => idsPur.size ? arr.filter(p => !idsPur.has(p.id)) : arr, idsPur);
      await quitar(K.cot, setCotizaciones, (arr) => (idsCot.size || idsMixtas.size) ? arr.filter(q => !idsCot.has(q.id)).map(q => {
        if (!idsMixtas.has(q.id)) return q;
        const ls = (q.lineas || []).filter(l => reqDe(q, l) !== s.id);
        return { ...q, lineas: ls, requestId: q.requestId === s.id ? (ls[0]?.requestId || q.requestId) : q.requestId, updatedAt: ahoraISO, audit: [...(q.audit || []), auditEntry("editada", `Se quitaron los ítems de ${s.folio} (borrada en la simulación)`)] };
      }) : arr, idsCot);
      await quitar(K.sol, setSolicitudes, (arr) => arr.filter(x => x.id !== s.id), new Set([s.id]));
      // PDFs de las cotizaciones borradas (best-effort)
      await Promise.all(cotsBorrar.map(q => q.pdfFile?.fileId).filter(Boolean).map(id => store.remove(fileKey(id), { quiet: true })));
      setModal(null);
    } catch (e) { alert("No se pudo borrar: " + (e?.message || e) + ". Reintentá."); console.warn("[GeoSupply sim]", e); }
    finally { setOcupado(false); }
  };
  const cancelarSolicitud = async (s) => {
    if (!confirm(`¿Cancelar la solicitud ${s.folio}? No se puede deshacer.`)) return;
    const rec = await actualizarSolicitud(s.id, (c) => puedeCancelar(c) ? { ...c, estado: "cancelada", audit: [...(c.audit || []), auditEntry("cancelada", "Cancelada por el residente")] } : (alert("Ya no se puede cancelar: almacén o compras ya la tocaron."), null));
    if (rec) setModal(null);
  };

  // ── Archivos ──
  const subirPdf = async (file) => {
    if (file.size > 2 * 1024 * 1024) { alert(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(2)} MB (límite 2 MB). Comprimilo antes de subir.`); return null; }
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const fileId = uid();
      const ok = await store.set(fileKey(fileId), { name: file.name, type: file.type, size: file.size, dataUrl });
      if (!ok) { alert("No se pudo subir el archivo a la nube. Reintentá."); return null; }
      return { fileId, name: file.name, type: file.type, size: file.size, subidaAt: new Date().toISOString() };
    } catch (e) { alert("Error subiendo el archivo: " + (e?.message || e)); return null; }
  };
  const verArchivo = async (ref) => {
    if (!ref?.fileId) return;
    try { const full = await store.getCloud(fileKey(ref.fileId)); if (!full?.dataUrl) return alert("No se pudo cargar el archivo."); setVisor({ ...full, name: full.name || ref.name }); }
    catch (e) { alert("Error: " + (e?.message || e)); }
  };

  // ── Compras: cotizaciones ──
  const guardarCotizacion = async (f, ev, enviar) => {
    const ahoraISO = new Date().toISOString();
    const marcar = (q) => enviar ? { ...q, estado: "enviada", enviadaAt: ahoraISO, evaluacion: { lineas: ev.lineas, suma: ev.suma, peor: ev.peor, todasVerdes: ev.todasVerdes }, audit: [...(q.audit || []), auditEntry("enviada", "Enviada a aprobación del Coordinador")] } : q;
    let rec;
    if (f.id) {
      rec = await actualizarCotizacion(f.id, (q) => {
        if (q.estado !== "borrador" && q.estado !== "devuelta") { alert("Esta cotización ya no se puede editar."); return null; }
        return marcar({ ...q, provider: f.provider, providerId: f.providerId || "", numeroProveedor: f.numeroProveedor || "", condicionPago: f.condicionPago || "contado", incluyeISV: f.incluyeISV !== false, totalDeclarado: f.totalDeclarado, pdfFile: f.pdfFile || null, notas: f.notas || "", lineas: f.lineas, audit: [...(q.audit || []), auditEntry("editada", "Cotización editada")] });
      });
    } else {
      rec = await crearEn(K.cot, setCotizaciones, (arr) => marcar({ id: uid(), folio: siguienteFolio(arr, "CTZ", new Date(ahoraISO).getFullYear()), requestId: f.lineas[0]?.requestId || "", projectCode: f.projectCode, provider: f.provider, providerId: f.providerId || "", numeroProveedor: f.numeroProveedor || "", condicionPago: f.condicionPago || "contado", incluyeISV: f.incluyeISV !== false, totalDeclarado: f.totalDeclarado, pdfFile: f.pdfFile || null, notas: f.notas || "", lineas: f.lineas, estado: "borrador", createdAt: ahoraISO, creadaPor: userKey, audit: [auditEntry("creada", "Borrador de cotización")] }));
    }
    if (!rec) return;
    // Al ENVIAR, las líneas de la solicitud pasan a "cotizada" (por solicitud, una escritura cada una).
    if (enviar) {
      const porSol = {};
      rec.lineas.forEach(l => { (porSol[l.requestId] = porSol[l.requestId] || []).push(l.requestLineId); });
      let fallo = false;
      for (const [solId, ids] of Object.entries(porSol)) { const ok = await accionLineas(solId, ids, "cotizar", { quoteId: rec.id }, `Cotizada en ${rec.folio} (${rec.provider})`); if (!ok) fallo = true; }
      // Si las líneas no quedaron marcadas, la cotización NO puede quedar
      // "enviada": seguirían en Por cotizar y se cotizarían dos veces.
      if (fallo) {
        await actualizarCotizacion(rec.id, (q) => ({ ...q, estado: "borrador", enviadaAt: null, audit: [...(q.audit || []), auditEntry("editada", "Volvió a borrador: no se pudieron marcar los ítems de la solicitud")] }));
        alert(`${rec.folio} quedó como BORRADOR: no se pudieron marcar los ítems en la solicitud. Abrila y volvé a enviarla.`);
      }
    }
    setModal(null);
  };
  // Líneas por cotizar de un proyecto: [{sol, l, pendiente}] (incluye las sin revisión de almacén ya vencidas).
  const candidatasDe = (projectCode, cotizacionId) => solicitudes.filter(s => solicitudActiva(s) && s.projectCode === projectCode).flatMap(s => (s.lineas || []).map(l => {
    const ef = estadoEfectivoLinea(l, s, cfg, ahora);
    const yaEnEsta = cotizacionId && (l.quoteIds || []).includes(cotizacionId);
    if (ef.estado !== "por_cotizar" && !yaEnEsta) return null;
    const lEf = ef.sinRevisionAlmacen && l.estado === "revision_almacen" ? { ...l, estado: "por_cotizar", aCotizar: num(l.cantidad), despachadoAlmacen: 0, sinRevisionAlmacen: true } : l;
    return { sol: s, l: lEf, pendiente: pendienteDeCompra(lEf) };
  }).filter(x => x && x.pendiente > 0));
  // Si Compras cotiza una línea que almacén NUNCA revisó (pasó el martes
  // 15:00), primero se materializa ese estado en la nube.
  const materializarSinRevision = async (lineasCot) => {
    const porSol = {};
    lineasCot.forEach(l => {
      const s = solicitudes.find(x => x.id === l.requestId); const ln = (s?.lineas || []).find(x => x.id === l.requestLineId);
      if (ln && ln.estado === "revision_almacen") (porSol[s.id] = porSol[s.id] || []).push(ln.id);
    });
    for (const [solId, ids] of Object.entries(porSol)) await accionLineas(solId, ids, "almacen_no_hay", { sinRevision: true }, "Pasó a Compras sin revisión de almacén (venció el plazo)");
  };

  // ── Coordinador: aprobar / devolver / rechazar cotizaciones ──
  const aprobarCotizacion = async (q, comentario = "") => {
    if (ocupado) return false;
    setOcupado(true);
    try {
      const [cotsC, solsC, pursC, provsC, ccC] = await Promise.all([store.getCloud(K.cot), store.getCloud(K.sol), store.getCloud(K.pur), store.getCloud("cp-providers"), store.getCloud("cc-config")]);
      const cots = Array.isArray(cotsC) ? cotsC : [], sols = Array.isArray(solsC) ? solsC : [], purs = Array.isArray(pursC) ? pursC : [], provs = Array.isArray(provsC) ? provsC : [];
      const cot = cots.find(x => x.id === q.id);
      if (!cot || cot.estado !== "enviada") { alert("La cotización ya no está por aprobar (alguien más la trabajó)."); return false; }
      // Una cotización puede cubrir ítems de VARIAS solicitudes del mismo
      // proyecto (26-oct-2026, revisión adversarial: antes solo se actualizaba
      // la primera y las demás quedaban trabadas en "cotizada" para siempre).
      const solIdDe = (cl) => cl.requestId || cot.requestId;
      const solIds = [...new Set(cot.lineas.map(solIdDe))];
      const solsCot = solIds.map(id => sols.find(s => s.id === id)).filter(Boolean);
      const sol = solsCot[0];
      if (!sol || solsCot.length !== solIds.length) { alert("Alguna solicitud de esta cotización ya no existe."); return false; }
      const tasaC = num(ccC?.tasa) || TASA_DEFAULT;
      const lineaSolDe = (lid) => sols.flatMap(s => s.lineas || []).find(l => l.id === lid) || null;
      const ev = evaluarCotizacion({ cotizacion: cot, tasa: tasaC, cfg, partidaDe: (pid) => partidaDe(cot.projectCode, pid), lineaSolicitudDe: lineaSolDe });
      if (!ev.ok) { alert("La cotización tiene errores y no se puede aprobar:\n" + ev.errores.join("\n")); return false; }
      // ANTES de crear el borrador: cada ítem tiene que estar "cotizada" en ESTA
      // cotización y aceptar la cantidad. Si no, abortar (sin esto se creaba el
      // MAT y las líneas quedaban sin marcar → compra doble).
      const mal = cot.lineas.map(cl => { const l = lineaSolDe(cl.requestLineId); if (!l) return `${cl.descripcion || cl.requestLineId}: ya no está en la solicitud`; if (l.estado !== "cotizada" || !(l.quoteIds || []).includes(cot.id)) return `${l.descripcion}: está en "${ESTADOS_LINEA[l.estado]?.label || l.estado}", no cotizada en ${cot.folio}`; const r = aplicarAccionLinea(l, "aprobar_cot", { quoteId: cot.id, cantidad: num(cl.cantidad) }); return r.ok ? null : `${l.descripcion}: ${r.error}`; }).filter(Boolean);
      if (mal.length) { alert("No se puede aprobar todavía:\n" + mal.join("\n") + "\n\nCompras tiene que reenviar la cotización."); return false; }
      // Enriquecer las líneas con la partida (para los ítems del borrador).
      ev.lineas = ev.lineas.map(l => { const ls = lineaSolDe(l.requestLineId); const pa = ls ? partidaDe(cot.projectCode, ls.partidaId) : null; return { ...l, id: l.requestLineId, partidaId: ls?.partidaId || null, ...(ls?.varilla ? { varilla: { ...ls.varilla, lances: l.lances != null ? num(l.lances) : ls.varilla.lances } } : {}), categoria: pa?.categoria || "", nombrePartida: pa?.nombre || ls?.descripcion || "", unidadPartida: pa?.unidad || ls?.unidad || "", solucion: pa?.solucion || "", fueraPresupuesto: !!ls?.fueraPresupuesto }; });
      const ahoraISO = new Date().toISOString();
      // 1) El BORRADOR en GeoShopping (idempotente: si ya existe uno de esta cotización, no se duplica).
      let purchase = purs.find(p => p.origenSupply?.quoteId === cot.id);
      if (!purchase) {
        const proveedor = provs.find(p => p.id === cot.providerId) || provs.find(p => p.name === cot.provider) || null;
        const armado = borradorDesdeCotizacion({ cotizacion: cot, evaluacion: ev, solicitud: sol, proveedor, proyecto: proyectoDe(cot.projectCode), aprobadoPor: userName, tasa: tasaC, cfg, hoy: hoyISO(), ahoraISO, id: uid(), codigo: siguienteCodigoCompra(purs, new Date(ahoraISO).getFullYear(), sim ? "SIM" : "MAT") });
        purchase = sim ? { ...armado.purchase, simulacion: true } : armado.purchase;
        // Releer cp-purchases JUSTO antes de escribir (la foto de arriba tiene
        // varios segundos): un pago de Tesorería en el medio se perdería.
        const frescoP = await store.getCloud(K.pur); const basePur = Array.isArray(frescoP) ? frescoP : [];
        if (basePur.some(p => p.origenSupply?.quoteId === cot.id)) { purchase = basePur.find(p => p.origenSupply?.quoteId === cot.id); }
        else {
          if (basePur.some(p => p.codigo === purchase.codigo)) purchase = { ...purchase, codigo: siguienteCodigoCompra(basePur, new Date(ahoraISO).getFullYear(), sim ? "SIM" : "MAT") };
          marcarMutacion();
          const ok = await store.set(K.pur, [...basePur, purchase]);
          if (!ok) { alert("No se pudo crear el borrador en GeoShopping. Nada se aprobó."); return false; }
          const back = await store.getCloud(K.pur);
          if (!Array.isArray(back) || !back.some(p => p.id === purchase.id)) { alert("VERIFICACIÓN FALLÓ: el borrador no quedó en la nube. Nada se aprobó."); return false; }
          const idsBase = new Set(basePur.map(p => p.id)); const perdidas = [...idsBase].filter(id => !back.some(p => p.id === id));
          if (perdidas.length) console.warn("[GeoSupply] cp-purchases: filas que no volvieron tras el guardado", perdidas);
          (sim ? setSimPurchases : setPurchases)(back);
        }
        // Proveedor nuevo → al maestro (best effort; Finanzas completa lo bancario).
        if (!proveedor && cot.provider && !sim) {
          try { const pv = await store.getCloud("cp-providers"); const arr = Array.isArray(pv) ? pv : []; if (!arr.some(p => p.name === cot.provider)) { await store.set("cp-providers", [...arr, { id: uid(), name: cot.provider, rtn: "", phones: [], contactName: "", contactEmail: "", notes: `Creado desde GeoSupply (${cot.folio}) — completar datos.`, bankAccounts: [], autoImported: true, createdAt: ahoraISO, updatedAt: ahoraISO }]); } } catch (e) { console.warn("[GeoSupply] proveedor nuevo no se guardó:", e); }
        }
      }
      // 2) Las líneas de CADA solicitud cubierta: cantidad comprada + estado.
      //    Sobre la nube FRESCA (otra persona pudo tocar otra línea en el medio).
      const frescoS = await store.getCloud(K.sol); const baseSol = Array.isArray(frescoS) ? frescoS : [];
      const actualizadas = {};
      for (const sid of solIds) {
        const s0 = baseSol.find(s => s.id === sid); if (!s0) continue;
        let lineas = s0.lineas || []; const aud = [];
        cot.lineas.filter(cl => solIdDe(cl) === sid).forEach(cl => {
          const l = lineas.find(x => x.id === cl.requestLineId); if (!l) return;
          const r = aplicarAccionLinea(l, "aprobar_cot", { quoteId: cot.id, cantidad: num(cl.cantidad) });
          if (!r.ok) return;   // ya aprobada en un intento anterior (idempotente)
          lineas = lineas.map(x => x.id === l.id ? r.linea : x);
          aud.push(auditEntry("aprobar_cot", `${l.descripcion}: aprobada en ${cot.folio} → ${purchase.codigo}`, { lineaId: l.id, de: l.estado, a: r.linea.estado }));
        });
        if (aud.length) actualizadas[sid] = { ...s0, lineas, estado: estadoCabecera({ ...s0, lineas }), audit: [...(s0.audit || []), ...aud], updatedAt: ahoraISO };
      }
      if (Object.keys(actualizadas).length) {
        marcarMutacion();
        const okS = await store.set(K.sol, baseSol.map(s => actualizadas[s.id] || s));
        if (!okS) { alert(`El borrador ${purchase.codigo} se creó pero la solicitud no se actualizó. Volvé a aprobar: no se duplica.`); return false; }
      }
      // 3) La cotización: aprobada, con la tasa usada y el borrador que generó.
      const cot2 = { ...cot, estado: "aprobada", aprobadoPor: userName, aprobadoAt: ahoraISO, comentario: comentario || "", tasaCambioUsada: tasaC, purchaseId: purchase.id, purchaseCodigo: purchase.codigo, evaluacion: { lineas: ev.lineas, suma: ev.suma, peor: ev.peor, todasVerdes: ev.todasVerdes }, avisos: purchase.origenSupply?.avisos || [], audit: [...(cot.audit || []), auditEntry("aprobada", `Aprobada → borrador ${purchase.codigo} en GeoShopping${comentario ? ` · ${comentario}` : ""}`)], updatedAt: ahoraISO };
      const frescoC = await store.getCloud(K.cot); const baseCot = Array.isArray(frescoC) ? frescoC : [];
      marcarMutacion();
      const okC = await store.set(K.cot, baseCot.map(x => x.id === cot.id ? cot2 : x));
      if (!okC) { alert(`El borrador ${purchase.codigo} se creó pero la cotización no se marcó. Volvé a aprobar: no se duplica.`); return false; }
      const [bs, bc] = await Promise.all([store.getCloud(K.sol), store.getCloud(K.cot)]);
      marcarMutacion();
      if (Array.isArray(bs)) setSolicitudes(bs); if (Array.isArray(bc)) setCotizaciones(bc);
      return purchase;
    } catch (e) { alert("Sin conexión con la nube: no se aprobó."); console.warn("[GeoSupply] aprobar", e); return false; }
    finally { setOcupado(false); }
  };
  const devolverCotizacion = async (q, comentario) => {
    if (String(comentario || "").trim().length < 3) return alert("Escribí qué tiene que corregir Compras.");
    const rec = await actualizarCotizacion(q.id, (c) => c.estado === "enviada" ? { ...c, estado: "devuelta", comentario, audit: [...(c.audit || []), auditEntry("devuelta", `Devuelta a Compras: ${comentario}`)] } : (alert("Ya no está por aprobar."), null));
    if (!rec) return false;
    const porSol = {}; rec.lineas.forEach(l => { (porSol[l.requestId] = porSol[l.requestId] || []).push(l.requestLineId); });
    for (const [solId, ids] of Object.entries(porSol)) await accionLineas(solId, ids, "devolver_cot", { quoteId: rec.id }, `${rec.folio} devuelta a Compras`);
    return true;
  };
  const rechazarCotizacion = async (q, motivo) => {
    if (String(motivo || "").trim().length < 3) return alert("El motivo es obligatorio.");
    const rec = await actualizarCotizacion(q.id, (c) => c.estado === "enviada" ? { ...c, estado: "rechazada", comentario: motivo, audit: [...(c.audit || []), auditEntry("rechazada", `Rechazada: ${motivo}`)] } : (alert("Ya no está por aprobar."), null));
    if (!rec) return false;
    const porSol = {}; rec.lineas.forEach(l => { (porSol[l.requestId] = porSol[l.requestId] || []).push(l.requestLineId); });
    for (const [solId, ids] of Object.entries(porSol)) await accionLineas(solId, ids, "devolver_cot", { quoteId: rec.id }, `${rec.folio} rechazada: vuelve a Por cotizar`);
    return true;
  };

  // ── Vistas: estado ──
  const [sec, setSec] = useState(() => esCoordinador ? "hoy" : soloLectura ? "hoy" : rol === "almacen" ? "almacen" : rol === "compras" ? "compras" : "solicitudes");
  const [abiertos, setAbiertos] = useState(() => { try { return JSON.parse(localStorage.getItem(`gt-supply-abiertos-${userKey}`) || "{}"); } catch { return {}; } });
  const toggleGrupo = (vista, k) => setAbiertos(prev => { const next = { ...prev, [`${vista}:${k}`]: !prev[`${vista}:${k}`] }; try { localStorage.setItem(`gt-supply-abiertos-${userKey}`, JSON.stringify(next)); } catch {} return next; });
  const estaAbierto = (vista, k, defecto = true) => abiertos[`${vista}:${k}`] ?? defecto;
  const [solQ, setSolQ] = useState("");
  const [solProy, setSolProy] = useState("");
  const [solVista, setSolVista] = useState("abiertas");
  const [cotVista, setCotVista] = useState("enviada");
  const [parcial, setParcial] = useState(null);      // { solId, lineaId, valor }
  const [envioPl, setEnvioPl] = useState(null);      // { lineaId, valor, nota } — envío del plantel
  const [dashProy, setDashProy] = useState("");
  const [dashCorte, setDashCorte] = useState("todos");

  const NAV = {
    coordinador: [{ id: "hoy", label: "Hoy" }, { id: "alertas", label: "Alertas" }, { id: "cotizaciones", label: "Cotizaciones" }, { id: "solicitudes", label: "Solicitudes" }, { id: "almacen", label: "Almacén" }, { id: "compras", label: "Compras" }, { id: "dashboard", label: "Dashboard" }, { id: "config", label: "Configuración" }],
    residente:   [{ id: "solicitudes", label: "Mis solicitudes" }],
    almacen:     [{ id: "almacen", label: "Almacén" }, { id: "solicitudes", label: "Solicitudes" }],
    compras:     [{ id: "compras", label: "Por cotizar" }, { id: "cotizaciones", label: "Cotizaciones" }, { id: "solicitudes", label: "Solicitudes" }],
    finanzas:    [{ id: "hoy", label: "Hoy" }, { id: "solicitudes", label: "Solicitudes" }, { id: "cotizaciones", label: "Cotizaciones" }, { id: "dashboard", label: "Dashboard" }],
    gerencia:    [{ id: "hoy", label: "Hoy" }, { id: "solicitudes", label: "Solicitudes" }, { id: "cotizaciones", label: "Cotizaciones" }, { id: "dashboard", label: "Dashboard" }],
  };
  const nav = NAV[rol] || [];

  // ── Derivados del corte ──
  const corte = corteActual(ahora);
  const etq = etiquetaCorte(corte);
  const HITO_LABEL = { cierreSolicitudes: "Cierre de solicitudes", almacenHasta: "Revisión de almacén", aprobacionHasta: "Cotizaciones aprobadas" };
  const hitos = ["cierreSolicitudes", "almacenHasta", "aprobacionHasta"].map(n => { const h = hitoDeCorte(corte, n, cfg); return { ...h, ...estadoHito(h, ahora) }; });
  const llegada = llegadaEstimada(corte, cfg);
  const activas = solicitudes.filter(solicitudActiva);
  const lineasEf = activas.flatMap(s => (s.lineas || []).map(l => ({ l, s, ef: estadoEfectivoLinea(l, s, cfg, ahora) })));
  const cotEnviadas = cotizaciones.filter(q => q.estado === "enviada");
  const n = {
    alertas: lineasEf.filter(x => x.ef.estado === "pendiente_coord").length,
    almacen: lineasEf.filter(x => x.ef.estado === "revision_almacen" || x.ef.estado === "plantel_pendiente").length,
    porCotizar: lineasEf.filter(x => x.ef.estado === "por_cotizar").length,
    cotizadas: cotEnviadas.length,
    devueltas: cotizaciones.filter(q => q.estado === "devuelta").length,
    delCorte: activas.filter(s => s.corte && s.corte.anio === corte.anio && s.corte.semana === corte.semana).length,
    fueraCorte: activas.filter(s => fueraDeCorte(s, cfg, ahora)).length,
  };
  const faltanViernes = lineasEf.filter(x => !esPedidoPlantel(x.s) && !LINEA_TERMINAL.includes(x.ef.estado)).length;
  const purchaseDeLinea = (l) => purchasesVista.find(p => p.origenSupply && (l.quoteIds || []).concat(cotizaciones.filter(q => q.estado === "aprobada" && q.lineas?.some(x => x.requestLineId === l.id)).map(q => q.id)).includes(p.origenSupply.quoteId)) || null;
  const despachoEntregadoDe = (purchase) => !!purchase && despachos.some(d => d.sourcePurchaseId === purchase.id && d.estado !== "cancelado" && (d.estado === "entregado" || d.estado === "cerrado"));
  // El proceso se COMPLETA con la ficha de recibido firmada (la sube Logística
  // al entregar —su candado la exige— o Ana si lo entregó el proveedor), o si
  // la compra se cerró sin ficha.
  const entregaDe = (pu) => {
    if (!pu) return { completa: false };
    const ficha = !!pu.delivery?.fichaFile?.fileId || pu.deliveryStatus === "ficha_adjunta";
    const cerrada = pu.deliveryStatus === "cerrado";
    return { completa: ficha || cerrada, ficha, cerrada, despachoEntregado: despachoEntregadoDe(pu) };
  };

  // ── Piezas de UI ──
  const stat = (v, l, { c, onClick } = {}) => <button key={l} onClick={onClick} disabled={!onClick} style={{ background: "transparent", border: "none", padding: isMobile ? "4px 10px" : "4px 18px", textAlign: "left", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", borderRight: isMobile ? "none" : "1px solid rgba(44,42,40,.08)" }}>
    <div style={{ font: "800 22px/1 var(--display)", color: c || CHARCOAL, letterSpacing: "-.02em" }}>{v}</div>
    <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>{l}</div>
  </button>;
  const filaLinea = ({ s, l, ef, derecha, extra, enSolicitud }) => {
    const al = alertasDeLinea(l, s);
    const sd = l.partidaId ? saldoDe(s.projectCode, l.partidaId, s.id) : null;
    return <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.75)", border: "1px solid rgba(44,42,40,.07)", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!enSolicitud && <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{s.folio}</span>}
          <span style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{l.descripcion}</span>
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>· <b>{fmtCant(ef?.estado === "por_cotizar" ? pendienteDeCompra(l.estado === "revision_almacen" ? { ...l, aCotizar: l.cantidad } : l) : l.cantidad)}</b> {l.unidad}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {!enSolicitud && <span style={{ fontSize: 11, color: "var(--text-3)" }}>pidió {quien(s.residente)} · requerido <b>{fmtDiaCorto(s.fechaRequeridaObra)}</b>{s.corte && !esPedidoPlantel(s) ? ` · ${etiquetaCorte(s.corte).titulo}` : ""}</span>}
          {l.solucion && enSolicitud && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{l.solucion}{l.categoria ? ` · ${l.categoria}` : ""}</span>}
          {al.map(a => <Chip key={a} c={a === "urgente" ? C_ROJO : C_AMARILLO}>{ALERTAS[a]}{a === "excede_saldo" && sd ? ` · saldo ${fmtCant(sd.saldo)}` : ""}</Chip>)}
          {ef?.sinRevisionAlmacen && <Chip c={C_AMARILLO}>Sin revisión de almacén</Chip>}
          {(s.cotizacionesAdjuntas || []).length > 0 && <Chip c={C_AZUL}>Trae cotización</Chip>}
          {l.plantel && num(l.enviadoPlantel) > 0 && <Chip c={C_VERDE}>Enviado {fmtCant(l.enviadoPlantel)} de {fmtCant(l.cantidad)}</Chip>}
          {(l.fueraPresupuesto || l.plantel) && l.justificacion && <span style={{ fontSize: 11, color: "var(--text-2)", fontStyle: "italic" }}>"{l.justificacion}"</span>}
          {s.urgente && s.justificacionUrgencia && al.includes("urgente") && <span style={{ fontSize: 11, color: "var(--text-2)", fontStyle: "italic" }}>"{s.justificacionUrgencia}"</span>}
        </div>
        {extra}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{derecha}</div>
    </div>;
  };
  // Agrupa [{s,l,ef}] por proyecto, con orden por fecha requerida.
  const porProyecto = (items) => {
    const m = {};
    items.forEach(x => { (m[x.s.projectCode] = m[x.s.projectCode] || []).push(x); });
    return Object.entries(m).map(([k, v]) => ({ k, items: v.sort((a, b) => String(a.s.fechaRequeridaObra).localeCompare(String(b.s.fechaRequeridaObra))), minFecha: v.map(x => x.s.fechaRequeridaObra).sort()[0] })).sort((a, b) => String(a.minFecha).localeCompare(String(b.minFecha)));
  };
  // Dentro de un proyecto, una cajita POR SOLICITUD (27-oct-2026, Óscar: "no
  // me deja ver qué pidió cada uno, solo así por encima"): folio, quién la
  // pidió, para cuándo, el corte, sus NOTAS y "Ver solicitud"; debajo sus
  // ítems sin repetir esos datos.
  const porSolicitud = (items, fila) => {
    const m = new Map();
    items.forEach(x => { if (!m.has(x.s.id)) m.set(x.s.id, { s: x.s, items: [] }); m.get(x.s.id).items.push(x); });
    return [...m.values()].map(({ s, items: xs }) => <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, borderRadius: 16, background: "rgba(44,42,40,.035)", border: "1px solid rgba(44,42,40,.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "2px 4px" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 800, color: CHARCOAL }}>{s.folio}</span>
        <span style={{ fontSize: 12.5, color: "var(--text-2)", flex: 1, minWidth: 180 }}>pidió <b>{quien(s.residente)}</b> · requerido <b>{fmtDiaCorto(s.fechaRequeridaObra)}</b>{s.corte && !esPedidoPlantel(s) ? ` · ${etiquetaCorte(s.corte).titulo}` : ""} · {xs.length} {xs.length === 1 ? "ítem" : "ítems"}</span>
        {s.urgente && <Chip c={C_ROJO}>Urgente</Chip>}
        {(s.cotizacionesAdjuntas || []).length > 0 && <Chip c={C_AZUL}>Trae cotización</Chip>}
        <Btn small variant="ghost" onClick={() => setModal({ t: "detalle", id: s.id })}>Ver solicitud</Btn>
      </div>
      {s.notas && <div style={{ fontSize: 12.5, color: "var(--text-2)", padding: "0 4px" }}><b>Notas:</b> {s.notas}</div>}
      {xs.map(x => fila({ ...x, enSolicitud: true }))}
    </div>);
  };
  const barraGrupos = (vista, grupos) => grupos.length > 1 && <div style={{ display: "flex", justifyContent: "flex-end" }}>{pillBtn(grupos.every(g => estaAbierto(vista, g.k)) ? "Compactar todo" : "Expandir todo", false, () => { const todos = grupos.every(g => estaAbierto(vista, g.k)); setAbiertos(prev => { const next = { ...prev }; grupos.forEach(g => { next[`${vista}:${g.k}`] = !todos; }); try { localStorage.setItem(`gt-supply-abiertos-${userKey}`, JSON.stringify(next)); } catch {} return next; }); })}</div>;

  // ═══════════════════════════ HOY ═══════════════════════════
  const renderHoy = () => {
    const hViernes = hitos[2];
    const ir = (id) => esCoordinador ? () => setSec(id) : undefined;
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {puedeSimular && !sim && <div className="gt-vidrio" style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, fontSize: 13, color: "var(--text-2)" }}><b style={{ color: CHARCOAL }}>Simulación</b> · probá el proceso completo viendo como cada rol. No toca nada real.</div>
        <Btn small variant="dark" onClick={() => { setSimRol("residente"); setSec("solicitudes"); setSim(true); }}>Simular el proceso</Btn>
      </div>}
      <div className="gt-vidrio" style={{ padding: "12px 10px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: isMobile ? 6 : 0 }}>
        <div style={{ padding: isMobile ? "4px 10px" : "4px 18px", borderRight: isMobile ? "none" : "1px solid rgba(44,42,40,.08)" }}>
          <div style={{ font: "800 15px/1.1 var(--display)", color: CHARCOAL }}>{etq.titulo}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>{etq.sub}</div>
        </div>
        {stat(n.alertas, "alertas por aprobar", { c: n.alertas ? ORANGE_DARK : undefined, onClick: ir("alertas") })}
        {stat(n.cotizadas, "cotizaciones por aprobar", { c: n.cotizadas ? ORANGE_DARK : undefined, onClick: ir("cotizaciones") })}
        {stat(n.almacen, "en almacén", { onClick: ir("almacen") })}
        {stat(n.porCotizar + n.devueltas, "en compras", { onClick: ir("compras") })}
        {n.fueraCorte > 0 && stat(n.fueraCorte, "fuera de corte", { c: C_ROJO.color, onClick: ir("dashboard") })}
        <div style={{ padding: isMobile ? "4px 10px" : "4px 18px", marginLeft: isMobile ? 0 : "auto" }}>
          <div style={{ font: "800 15px/1.1 var(--display)", color: hViernes.pasado ? "var(--text-3)" : faltanViernes ? ORANGE_DARK : C_VERDE.color }}>{hViernes.pasado ? "Corte cerrado" : faltanViernes ? `Faltan ${faltanViernes}` : "Todo aprobado"}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>{DIAS_CORTOS_[cfg.cortes.aprobacionHasta.dia]} {fmtHora(hViernes.hora)} · {fmtFalta(hViernes.faltaMin)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        <div className="gt-vidrio gt-vidrio-hover" role={esCoordinador ? "button" : undefined} onClick={esCoordinador ? () => setSec(n.alertas ? "alertas" : "cotizaciones") : undefined} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14, minHeight: 220, cursor: esCoordinador ? "pointer" : "default" }}>
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
          <div style={{ marginTop: "auto", fontSize: 12.5, color: "var(--text-3)" }}>{(n.alertas + n.cotizadas) === 0 ? "Nada esperando tu decisión." : esCoordinador ? "Tocá para ir a la bandeja." : "Esperando al Coordinador."}</div>
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
                <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{fmtDiaCorto(h.ymd)} · {fmtHora(h.hora)}</div>
              </div>
              <Chip c={h.pasado ? C_GRIS : C_NARANJA}>{fmtFalta(h.faltaMin)}</Chip>
            </div>)}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>Llegada estimada a obra: <b>{fmtDiaCorto(llegada.desde)} – {fmtDiaCorto(llegada.hasta)}</b></div>
        </div>
      </div>
    </div>;
  };

  // ═══════════════════════════ ALERTAS (Coordinador) ═══════════════════════════
  const renderAlertas = () => {
    const items = lineasEf.filter(x => x.ef.estado === "pendiente_coord");
    const grupos = porProyecto(items);
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: "12px 10px", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {stat(items.length, "ítems por decidir", { c: items.length ? ORANGE_DARK : undefined })}
        {stat(items.filter(x => x.l.fueraPresupuesto).length, "fuera de presupuesto")}
        {stat(items.filter(x => x.l.excedeSaldo).length, "exceden el saldo")}
        {stat(items.filter(x => x.s.urgente).length, "urgentes", { c: items.some(x => x.s.urgente) ? C_ROJO.color : undefined })}
      </div>
      {items.length === 0 ? <Vacio>Ningún ítem espera tu decisión.</Vacio> : <>
        {barraGrupos("alertas", grupos)}
        {grupos.map(g => <Grupo key={g.k} titulo={nombreProy(g.k)} sub={`${g.items.length} ${g.items.length === 1 ? "ítem" : "ítems"} · lo más urgente para ${fmtDiaCorto(g.minFecha)}`} abierto={estaAbierto("alertas", g.k)} onToggle={() => toggleGrupo("alertas", g.k)} alerta={g.items.some(x => x.s.urgente)}>
          {g.items.map(x => filaLinea({ ...x, derecha: <>
            <Btn small variant="success" disabled={ocupado} onClick={() => accionLinea(x.s.id, x.l.id, "aprobar_coord", { sinAlmacen: !!x.s.sinAlmacen }, `${x.l.descripcion}: aprobado → ${x.s.sinAlmacen ? "compras" : "almacén"}`)}>Aprobar</Btn>
            <Btn small variant="danger" disabled={ocupado} onClick={() => setModal({ t: "rechazar-linea", s: x.s, l: x.l })}>Rechazar</Btn>
            <button onClick={() => setModal({ t: "detalle", id: x.s.id })} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Ver solicitud</button>
          </> }))}
        </Grupo>)}
      </>}
    </div>;
  };

  // ═══════════════════════════ ALMACÉN (Óscar) ═══════════════════════════
  const renderAlmacen = () => {
    const puede = rol === "almacen" || esCoordinador;
    const items = lineasEf.filter(x => x.ef.estado === "revision_almacen");
    const grupos = porProyecto(items);
    // La cuenta regresiva es la del corte MÁS PRÓXIMO entre lo pendiente (una
    // solicitud enviada el viernes es del corte siguiente: su plazo es el otro
    // martes, no el de esta semana). Sin pendientes, la del corte en curso.
    const hAlm = (() => {
      const hs = items.filter(x => x.s.corte).map(x => { const h = hitoDeCorte(x.s.corte, "almacenHasta", cfg); return { ...h, ...estadoHito(h, ahora) }; }).filter(h => !h.pasado).sort((a, b) => a.faltaMin - b.faltaMin);
      return hs[0] || hitos[1];
    })();
    // PEDIDOS AL PLANTEL / TALLER (26-oct-2026): no tienen plazo de corte; se
    // van enviando por partes según se producen. "No hay" se le devuelve al
    // ingeniero con la nota (él decide si lo pide como compra).
    const itemsPl = lineasEf.filter(x => x.ef.estado === "plantel_pendiente");
    const gruposPl = porProyecto(itemsPl);
    const enviarPl = async (x, cant, nota) => {
      const ok = await accionLinea(x.s.id, x.l.id, "plantel_enviar", { cantidad: num(cant), nota, at: new Date().toISOString(), por: userName }, `Plantel envía ${fmtCant(cant)} ${x.l.unidad} de ${x.l.descripcion}${nota ? ` — ${nota}` : ""}`);
      if (ok) setEnvioPl(null);
    };
    const noHayPl = async (x) => {
      const motivo = prompt(`¿Por qué no se puede enviar "${x.l.descripcion}"? El ingeniero lo va a ver.`, "No lo tenemos en el plantel; pedilo como compra.");
      if (motivo == null) return;
      await accionLinea(x.s.id, x.l.id, "plantel_no_hay", { motivo }, `Plantel: no hay ${x.l.descripcion} — ${motivo}`);
    };
    const bloquePlantel = itemsPl.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="gt-label" style={{ color: "var(--text-3)", paddingLeft: 4 }}>Pedidos al plantel / taller</div>
      {gruposPl.map(g => <Grupo key={"pl-" + g.k} titulo={nombreProy(g.k)} sub={`${g.items.length} ${g.items.length === 1 ? "ítem" : "ítems"} · requerido desde ${fmtDiaCorto(g.minFecha)}`} abierto={estaAbierto("plantel", g.k)} onToggle={() => toggleGrupo("plantel", g.k)}>
        {porSolicitud(g.items, x => {
          const falta = pendientePlantel(x.l);
          const abierto = envioPl && envioPl.lineaId === x.l.id;
          return filaLinea({ ...x, derecha: puede ? (abierto
            ? <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <input autoFocus type="number" min="0" step="any" value={envioPl.valor} onChange={e => setEnvioPl({ ...envioPl, valor: e.target.value })} placeholder={`de ${fmtCant(falta)}`} style={{ width: 90, padding: "7px 10px", border: "1px solid rgba(44,42,40,.15)", borderRadius: 10, fontSize: 13, fontFamily: "inherit", textAlign: "right" }} />
              <span style={{ fontSize: 12, color: "var(--text-2)" }}>{x.l.unidad}</span>
              <input value={envioPl.nota} onChange={e => setEnvioPl({ ...envioPl, nota: e.target.value })} placeholder="Nota (opcional)" style={{ width: 150, padding: "7px 10px", border: "1px solid rgba(44,42,40,.15)", borderRadius: 10, fontSize: 13, fontFamily: "inherit" }} />
              <Btn small disabled={ocupado || !(num(envioPl.valor) > 0)} onClick={() => enviarPl(x, envioPl.valor, envioPl.nota)}>Enviar</Btn>
              <Btn small variant="ghost" onClick={() => setEnvioPl(null)}>✕</Btn>
            </div>
            : <>
              {num(x.l.enviadoPlantel) > 0 && <span style={{ fontSize: 12, color: "var(--text-2)" }}>falta <b>{fmtCant(falta)}</b></span>}
              <Btn small variant="success" disabled={ocupado} onClick={() => { if (confirm(`¿Enviar ${fmtCant(falta)} ${x.l.unidad} de ${x.l.descripcion}? Queda completo.`)) enviarPl(x, falta, ""); }}>Enviar todo</Btn>
              <Btn small variant="info" disabled={ocupado} onClick={() => setEnvioPl({ lineaId: x.l.id, valor: "", nota: "" })}>Una parte</Btn>
              <Btn small variant="ghost" disabled={ocupado} onClick={() => noHayPl(x)}>No hay</Btn>
            </>) : <Chip c={C_AZUL}>En el plantel</Chip> });
        })}
      </Grupo>)}
    </div>;
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: "12px 10px", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {stat(itemsPl.length, "pedidos al plantel", { c: itemsPl.length ? ORANGE_DARK : undefined })}
        {stat(items.length, "ítems por revisar", { c: items.length ? ORANGE_DARK : undefined })}
        {stat(new Set([...grupos, ...gruposPl].map(g => g.k)).size, "proyectos")}
        <div style={{ padding: isMobile ? "4px 10px" : "4px 18px", marginLeft: isMobile ? 0 : "auto" }}>
          <div style={{ font: "800 15px/1.1 var(--display)", color: hAlm.pasado ? "var(--text-3)" : ORANGE_DARK }}>{hAlm.pasado ? "Plazo cerrado" : fmtFalta(hAlm.faltaMin)}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>revisión hasta {DIAS_CORTOS_[cfg.cortes.almacenHasta.dia]} {fmtHora(hAlm.hora)}</div>
        </div>
      </div>
      {bloquePlantel}
      {itemsPl.length > 0 && items.length > 0 && <div className="gt-label" style={{ color: "var(--text-3)", paddingLeft: 4 }}>Revisión de solicitudes de compra</div>}
      {items.length === 0 ? (itemsPl.length ? null : <Vacio>Nada por revisar en almacén.</Vacio>) : <>
        {barraGrupos("almacen", grupos)}
        {grupos.map(g => <Grupo key={g.k} titulo={nombreProy(g.k)} sub={`${g.items.length} ${g.items.length === 1 ? "ítem" : "ítems"} · requerido desde ${fmtDiaCorto(g.minFecha)}`} abierto={estaAbierto("almacen", g.k)} onToggle={() => toggleGrupo("almacen", g.k)}
          derecha={puede && <Btn small variant="ghost" disabled={ocupado} onClick={async () => { if (!confirm(`¿Marcar "No hay" en los ${g.items.length} ítems de ${nombreProy(g.k)}? Pasan a Compras.`)) return; const porSol = {}; g.items.forEach(x => { (porSol[x.s.id] = porSol[x.s.id] || []).push(x.l.id); }); for (const [sid, ids] of Object.entries(porSol)) await accionLineas(sid, ids, "almacen_no_hay", {}, "Almacén: no hay (masivo del proyecto)"); }}>No hay nada de esto</Btn>}>
          {porSolicitud(g.items, x => {
            const enParcial = parcial && parcial.lineaId === x.l.id;
            return filaLinea({ ...x, derecha: puede ? <>
              {enParcial
                ? <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input autoFocus type="number" min="0" step="any" value={parcial.valor} onChange={e => setParcial({ ...parcial, valor: e.target.value })} placeholder={`de ${fmtCant(x.l.cantidad)}`} style={{ width: 100, padding: "7px 10px", border: "1px solid rgba(44,42,40,.15)", borderRadius: 10, fontSize: 13, fontFamily: "inherit", textAlign: "right" }} />
                  <span style={{ fontSize: 12, color: "var(--text-2)" }}>{x.l.unidad} despachados</span>
                  <Btn small disabled={ocupado} onClick={async () => { const ok = await accionLinea(x.s.id, x.l.id, "almacen_parcial", { despachado: num(parcial.valor) }, `Almacén despacha ${parcial.valor} ${x.l.unidad} de ${x.l.descripcion}; el resto a Compras`); if (ok) setParcial(null); }}>Listo</Btn>
                  <Btn small variant="ghost" onClick={() => setParcial(null)}>✕</Btn>
                </div>
                : <>
                  <Btn small variant="success" disabled={ocupado} onClick={() => accionLinea(x.s.id, x.l.id, "almacen_hay", {}, `Almacén despacha completo: ${x.l.descripcion}`)}>Hay</Btn>
                  <Btn small variant="info" disabled={ocupado} onClick={() => setParcial({ solId: x.s.id, lineaId: x.l.id, valor: "" })}>Parcial</Btn>
                  <Btn small variant="ghost" disabled={ocupado} onClick={() => accionLinea(x.s.id, x.l.id, "almacen_no_hay", {}, `Almacén: no hay ${x.l.descripcion} → Compras`)}>No hay</Btn>
                </>}
            </> : <Chip c={C_AZUL}>En revisión</Chip> });
          })}
        </Grupo>)}
      </>}
    </div>;
  };

  // ═══════════════════════════ COMPRAS (Ana) ═══════════════════════════
  const renderCompras = () => {
    const puede = rol === "compras" || esCoordinador;
    const items = lineasEf.filter(x => x.ef.estado === "por_cotizar").map(x => ({ ...x, l: x.ef.sinRevisionAlmacen && x.l.estado === "revision_almacen" ? { ...x.l, estado: "por_cotizar", aCotizar: num(x.l.cantidad), despachadoAlmacen: 0 } : x.l })).filter(x => pendienteDeCompra(x.l) > 0);
    const grupos = porProyecto(items);
    const devueltas = cotizaciones.filter(q => q.estado === "devuelta");
    const borr = cotizaciones.filter(q => q.estado === "borrador");
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: "12px 10px", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {stat(items.length, "ítems por cotizar", { c: items.length ? ORANGE_DARK : undefined })}
        {stat(grupos.length, "proyectos")}
        {stat(devueltas.length, "devueltas por el Coord.", { c: devueltas.length ? C_AMARILLO.color : undefined, onClick: () => { setCotVista("devuelta"); setSec("cotizaciones"); } })}
        {stat(borr.length, "cotizaciones en borrador", { onClick: () => { setCotVista("borrador"); setSec("cotizaciones"); } })}
      </div>
      {devueltas.length > 0 && <div className="gt-vidrio" style={{ padding: "12px 16px", borderLeft: `3px solid ${C_AMARILLO.color}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="gt-label" style={{ color: C_AMARILLO.color }}>Devueltas por el Coordinador</div>
        {devueltas.map(q => <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700 }}>{q.folio}</span><b style={{ fontSize: 13 }}>{q.provider}</b><span style={{ fontSize: 12, color: "var(--text-2)" }}>{nombreProy(q.projectCode)}</span>
          <span style={{ fontSize: 12.5, color: C_AMARILLO.color, fontStyle: "italic", flex: 1 }}>"{q.comentario}"</span>
          {puede && <Btn small onClick={() => setModal({ t: "cotizacion", q })}>Corregir</Btn>}
        </div>)}
      </div>}
      {items.length === 0 ? <Vacio>Nada por cotizar.</Vacio> : <>
        {barraGrupos("compras", grupos)}
        {grupos.map(g => <Grupo key={g.k} titulo={nombreProy(g.k)} sub={`${g.items.length} ${g.items.length === 1 ? "ítem" : "ítems"} · requerido desde ${fmtDiaCorto(g.minFecha)}`} abierto={estaAbierto("compras", g.k)} onToggle={() => toggleGrupo("compras", g.k)}
          derecha={puede && <Btn small onClick={() => setModal({ t: "cotizacion", projectCode: g.k })}>Cotizar ({g.items.length})</Btn>}>
          {g.items.map(x => filaLinea({ ...x, derecha: (x.l.quoteIds || []).length ? <Chip c={C_NARANJA}>Ya en {x.l.quoteIds.length} cotización(es)</Chip> : null }))}
        </Grupo>)}
      </>}
    </div>;
  };

  // ═══════════════════════════ COTIZACIONES (lista + aprobación) ═══════════════════════════
  const renderCotizaciones = () => {
    const VISTAS = [["enviada", "Por aprobar"], ["devuelta", "Devueltas"], ["borrador", "Borradores"], ["aprobada", "Aprobadas"], ["rechazada", "Rechazadas"]];
    const lista = cotizaciones.filter(q => q.estado === cotVista).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const verdes = cotEnviadas.filter(q => q.evaluacion?.todasVerdes);
    const aprobarVerdes = async () => {
      if (!confirm(`¿Aprobar las ${verdes.length} cotizaciones con todos sus ítems en verde? Cada una crea un borrador en GeoShopping.`)) return;
      let ok = 0; for (const q of verdes) { const r = await aprobarCotizacion(q, "Aprobación masiva (todo en verde)"); if (r) ok++; }
      alert(`✓ ${ok} de ${verdes.length} aprobadas.`);
    };
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: isMobile ? "10px 14px" : "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {VISTAS.map(([k, l]) => pillBtn(l, cotVista === k, () => setCotVista(k), { n: cotizaciones.filter(q => q.estado === k).length }))}
        {esCoordinador && cotVista === "enviada" && verdes.length > 0 && <div style={{ marginLeft: "auto" }}><Btn small variant="success" disabled={ocupado} onClick={aprobarVerdes}>Aprobar las {verdes.length} en verde</Btn></div>}
      </div>
      {lista.length === 0 ? <Vacio>{cotVista === "enviada" ? "Ninguna cotización espera aprobación." : "Nada acá."}</Vacio>
        : lista.map(q => {
          const s = solicitudes.find(x => x.id === q.requestId);
          const fc = s && fueraDeCorte(s, cfg, ahora);
          const puedeEditar = (rol === "compras" || esCoordinador) && (q.estado === "borrador" || q.estado === "devuelta");
          return <div key={q.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setModal(puedeEditar ? { t: "cotizacion", q } : { t: "aprobar", q })} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: CHARCOAL }}>{q.folio}</div>
            {chipEstado(ESTADOS_COTIZACION, q.estado)}
            {q.evaluacion?.peor && q.estado !== "borrador" && chipSem(q.evaluacion.peor)}
            {fc && q.estado === "enviada" && <Chip c={C_ROJO}>Fuera de corte</Chip>}
            {s?.urgente && <Chip c={C_ROJO}>Urgente</Chip>}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{q.provider} <span style={{ fontWeight: 500, color: "var(--text-3)" }}>· {nombreProy(q.projectCode)}</span></div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{(q.lineas || []).length} {(q.lineas || []).length === 1 ? "ítem" : "ítems"} · {s?.folio || "—"} · {q.numeroProveedor ? `cot. ${q.numeroProveedor} · ` : ""}{q.estado === "aprobada" ? `→ ${q.purchaseCodigo || "borrador"} · ${fmtDT(q.aprobadoAt)}` : fmtDT(q.updatedAt)}</div>
              {q.comentario && (q.estado === "devuelta" || q.estado === "rechazada") && <div style={{ fontSize: 12, color: C_AMARILLO.color, fontStyle: "italic" }}>"{q.comentario}"</div>}
            </div>
            {!esResidente && <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>{fmtL(q.totalDeclarado)}</div><div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 3 }}>con ISV</div></div>}
          </div>;
        })}
    </div>;
  };

  // ═══════════════════════════ SOLICITUDES (lista) ═══════════════════════════
  const renderSolicitudes = () => {
    const base = solicitudes.filter(s => !esResidente || s.residente === userKey);
    // "Abierta" para quien pidió = todavía hay algo en camino: una solicitud
    // completada en GeoSupply (todo comprado) sigue abierta hasta que lo
    // comprado llegue a obra (despacho entregado en GeoLogistics).
    const terminada = (s) => s.estado === "cancelada" || (estadoCabecera(s) === "completada" && (s.lineas || []).every(l => l.estado !== "comprada" || entregaDe(purchaseDeLinea(l)).completa));
    const visibles = base
      .filter(s => solVista === "todas" ? true : solVista === "abiertas" ? !terminada(s) : terminada(s))
      .filter(s => !solProy || s.projectCode === solProy)
      .filter(s => !solQ || `${s.folio} ${nombreProy(s.projectCode)} ${quien(s.residente)} ${(s.lineas || []).map(l => l.descripcion).join(" ")}`.toLowerCase().includes(solQ.toLowerCase()))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const proyectosConSol = [...new Set(base.map(s => s.projectCode))];
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {(esResidente || rol === "almacen") && <div className="gt-vidrio" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "800 15px/1.1 var(--display)", color: CHARCOAL }}>{etq.titulo}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>
            {hitos[0].pasado
              ? <>Lo que enviés ahora entra al <b>corte siguiente</b> (cierre {DIAS_SEMANA[cfg.cortes.cierreSolicitudes.dia]} {fmtHora(cfg.cortes.cierreSolicitudes.hora)}).</>
              : <>Enviá antes del <b>{DIAS_SEMANA[cfg.cortes.cierreSolicitudes.dia]} {fmtHora(cfg.cortes.cierreSolicitudes.hora)}</b> ({fmtFalta(hitos[0].faltaMin)}) · llega a obra <b>{fmtDiaCorto(llegada.desde)} – {fmtDiaCorto(llegada.hasta)}</b>.</>}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Btn onClick={() => setModal({ t: "solicitud" })}>+ Nueva solicitud</Btn>
        </div>
      </div>}
      <div className="gt-vidrio" style={{ padding: isMobile ? "10px 14px" : "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {[["abiertas", "En camino"], ["cerradas", "Terminadas"], ["todas", "Todas"]].map(([k, l]) => pillBtn(l, solVista === k, () => setSolVista(k)))}
        <Buscador value={solQ} onChange={setSolQ} placeholder="Buscar folio, proyecto, ítem o residente" />
        {!esResidente && proyectosConSol.length > 1 && <select value={solProy} onChange={e => setSolProy(e.target.value)} style={{ padding: "8px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 999, fontSize: 13, background: "rgba(255,255,255,.7)", fontFamily: "inherit" }}>
          <option value="">Todos los proyectos</option>{proyectosConSol.map(p => <option key={p} value={p}>{nombreProy(p)}</option>)}
        </select>}
        {(solQ || solProy) && <Btn small variant="ghost" onClick={() => { setSolQ(""); setSolProy(""); }}>Limpiar</Btn>}
      </div>
      {visibles.length === 0
        ? <Vacio>{base.length === 0 ? (esResidente ? "Todavía no tenés solicitudes." : "Todavía no hay solicitudes de material.") : "Nada coincide con el filtro."}</Vacio>
        : visibles.map(s => {
          const est = estadoCabecera(s);
          const ls = s.lineas || [];
          const fc = fueraDeCorte(s, cfg, ahora);
          const lleg = s.corte && !esPedidoPlantel(s) ? llegadaEstimada(s.corte, cfg) : null;
          return <div key={s.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setModal({ t: "detalle", id: s.id })} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: CHARCOAL }}>{s.folio}</div>
            {chipEstado(ESTADOS_SOLICITUD, est)}
            {esPedidoPlantel(s) && <Chip c={C_AZUL}>Al plantel</Chip>}
            {s.urgente && <Chip c={C_ROJO}>Urgente</Chip>}
            {fc && <Chip c={C_ROJO}>Fuera de corte</Chip>}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{nombreProy(s.projectCode)}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{ls.length} {ls.length === 1 ? "ítem" : "ítems"}{ls.some(l => l.estado === "rechazada") ? ` · ${ls.filter(l => l.estado === "rechazada").length} rechazado(s)` : ""} · pidió {quien(s.residente)} · {esPedidoPlantel(s) ? (s.estado === "borrador" ? "borrador" : "pedido al plantel / taller") : s.corte ? etiquetaCorte(s.corte).titulo : "borrador"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: CHARCOAL }}>{s.fechaRequeridaObra ? fmtDiaCorto(s.fechaRequeridaObra) : "—"}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 3 }}>requerida en obra</div>
            </div>
            {lleg && est !== "completada" && est !== "cancelada" && <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C_AZUL.color }}>{fmtDiaCorto(lleg.desde)} – {fmtDiaCorto(lleg.hasta)}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 3 }}>llegada estimada</div>
            </div>}
            {sim && <button type="button" disabled={ocupado} onClick={e => { e.stopPropagation(); borrarSolicitudSim(s); }} onKeyDown={e => e.stopPropagation()} title="Borrar esta solicitud de la simulación"
              style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${C_ROJO.borde || "rgba(185,28,28,.25)"}`, background: "rgba(255,255,255,.7)", color: C_ROJO.color, fontSize: 12, fontWeight: 800, cursor: ocupado ? "wait" : "pointer", fontFamily: "inherit" }}>Borrar</button>}
          </div>;
        })}
    </div>;
  };

  // ═══════════════════════════ DETALLE DE SOLICITUD (modal) ═══════════════════════════
  const renderDetalle = (id) => {
    const s = solicitudes.find(x => x.id === id);
    if (!s) return <div style={{ color: "var(--text-3)" }}>La solicitud ya no está.</div>;
    const est = estadoCabecera(s);
    const esMia = s.residente === userKey;
    const plantel = esPedidoPlantel(s);
    const lleg = s.corte && !plantel ? llegadaEstimada(s.corte, cfg) : null;
    const cots = cotizaciones.filter(q => q.requestId === s.id || (q.lineas || []).some(l => l.requestId === s.id));
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {chipEstado(ESTADOS_SOLICITUD, est)}{esPedidoPlantel(s) && <Chip c={C_AZUL}>Pedido al plantel / taller</Chip>}{s.urgente && <Chip c={C_ROJO}>Urgente</Chip>}{fueraDeCorte(s, cfg, ahora) && <Chip c={C_ROJO}>Fuera de corte</Chip>}
        <span style={{ fontSize: 13, color: "var(--text-2)" }}><b>{nombreProy(s.projectCode)}</b> · pidió {quien(s.residente)}{plantel ? "" : ` · ${s.corte ? etiquetaCorte(s.corte).titulo : "sin enviar"}`}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        {[["Requerido en obra", s.fechaRequeridaObra ? fmtDiaLargo(s.fechaRequeridaObra) : "—"], ["Enviada", s.fechaEnvio ? fmtDT(s.fechaEnvio) : "—"], plantel ? ["Enviado", `${fmtCant((s.lineas || []).filter(l => l.estado !== "rechazada").reduce((a, l) => a + num(l.enviadoPlantel), 0))} de ${fmtCant((s.lineas || []).filter(l => l.estado !== "rechazada").reduce((a, l) => a + num(l.cantidad), 0))}`] : ["Llegada estimada", lleg ? `${fmtDiaCorto(lleg.desde)} – ${fmtDiaCorto(lleg.hasta)}` : "—"], ["Ítems", `${(s.lineas || []).length}`]].map(([l, v]) => <div key={l} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(44,42,40,.04)" }}><div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9 }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, marginTop: 4 }}>{v}</div></div>)}
      </div>
      {s.urgente && s.justificacionUrgencia && <div style={{ padding: "10px 14px", borderRadius: 12, background: C_ROJO.bg, color: C_ROJO.color, fontSize: 12.5 }}><b>Urgente:</b> {s.justificacionUrgencia}</div>}
      {s.notas && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}><b>Notas:</b> {s.notas}</div>}
      {(s.cotizacionesAdjuntas || []).length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: "var(--text-2)" }}><b>Cotización que trajo:</b>{s.cotizacionesAdjuntas.map(r => <Btn key={r.fileId} small variant="info" onClick={() => verArchivo(r)}>{(r.name || "Ver").slice(0, 28)}</Btn>)}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Dónde va cada ítem</div>
        {(s.lineas || []).map(l => {
          const ef = estadoEfectivoLinea(l, s, cfg, ahora);
          const pu = purchaseDeLinea(l);
          const paso = pasoDeLinea({ ...l, estado: ef.estado === "por_cotizar" && l.estado === "revision_almacen" ? "por_cotizar" : l.estado }, s, pu, entregaDe(pu));
          const al = alertasDeLinea(l, s);
          return <div key={l.id} style={{ padding: "12px 14px", borderRadius: 14, background: l.estado === "rechazada" ? C_ROJO.bg : "rgba(255,255,255,.75)", border: "1px solid rgba(44,42,40,.08)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>{l.descripcion} <span style={{ fontWeight: 600, color: "var(--text-2)" }}>· {fmtCant(l.cantidad)} {l.unidad}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {paso.etapa === "entregado" ? <Chip c={C_VERDE}>Entregado en tu proyecto</Chip>
                    : paso.etapa === "pagado" ? <Chip c={C_AZUL}>Pagado · en camino</Chip>
                    : paso.etapa === "pendiente_pago" ? <Chip c={C_GRIS}>Pendiente de pago</Chip>
                    : chipEstado(ESTADOS_LINEA, l.estado === "rechazada" ? "rechazada" : ef.estado === "por_cotizar" ? "por_cotizar" : ef.estado)}
                  {ef.sinRevisionAlmacen && <Chip c={C_AMARILLO}>Sin revisión de almacén</Chip>}
                  {al.filter(a => a !== "urgente").map(a => <Chip key={a} c={C_AMARILLO}>{ALERTAS[a]}</Chip>)}
                  {num(l.despachadoAlmacen) > 0 && <Chip c={C_VERDE}>{fmtCant(l.despachadoAlmacen)} {l.unidad} de almacén</Chip>}
                  {num(l.cantidadComprada) > 0 && l.estado !== "comprada" && <Chip c={C_VERDE}>{fmtCant(l.cantidadComprada)} {l.unidad} ya en compra</Chip>}
                  {paso.nota && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{paso.nota}</span>}
                </div>
              </div>
              {pu && !esResidente && <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, fontWeight: 700, color: "var(--text-3)" }}>{pu.codigo}</span>}
            </div>
            {l.estado === "rechazada"
              ? <div style={{ fontSize: 12.5, color: C_ROJO.color }}><b>{l.noHayPlantel ? "No lo hay en el plantel:" : "Rechazado:"}</b> {l.motivoRechazo || "sin motivo"}</div>
              : l.plantel ? <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ height: 8, borderRadius: 99, background: "rgba(44,42,40,.08)", overflow: "hidden" }}><div style={{ width: `${Math.min(100, num(l.enviadoPlantel) / Math.max(num(l.cantidad), 0.0001) * 100)}%`, height: "100%", background: C_VERDE.color, borderRadius: 99 }} /></div>
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>Enviado <b>{fmtCant(l.enviadoPlantel || 0)}</b> de {fmtCant(l.cantidad)} {l.unidad}{(l.enviosPlantel || []).length ? " · " + l.enviosPlantel.map(e => `${fmtCant(e.cantidad)} el ${e.at ? fmtDT(e.at) : "—"}${e.nota ? ` (${e.nota})` : ""}`).join(" · ") : ""}</div>
              </div>
              : <PasosLinea paso={paso} compact={isMobile} />}
          </div>;
        })}
      </div>

      {!esResidente && cots.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Cotizaciones</div>
        {cots.map(q => <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700 }}>{q.folio}</span>{chipEstado(ESTADOS_COTIZACION, q.estado)}<b>{q.provider}</b><span style={{ color: "var(--text-2)" }}>{fmtL(q.totalDeclarado)}</span>
          {q.purchaseCodigo && <span style={{ color: "var(--text-3)" }}>→ {q.purchaseCodigo}</span>}
          {q.pdfFile && <button onClick={() => verArchivo(q.pdfFile)} style={{ background: "none", border: "none", color: C_AZUL.color, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>PDF</button>}
        </div>)}
      </div>}

      <details>
        <summary style={{ fontSize: 12, color: "var(--text-3)", cursor: "pointer", fontWeight: 700 }}>Bitácora ({(s.audit || []).length})</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
          {[...(s.audit || [])].reverse().map((a, i) => <div key={i} style={{ fontSize: 11.5, color: "var(--text-2)", display: "flex", gap: 8 }}><span style={{ color: "var(--text-3)", whiteSpace: "nowrap", fontFamily: "var(--mono)" }}>{fmtDT(a.at)}</span><span><b>{a.by}</b> · {a.note || a.action}</span></div>)}
        </div>
      </details>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
        {esMia && s.estado === "borrador" && <><Btn variant="ghost" onClick={() => setModal({ t: "solicitud", s })}>Editar</Btn><Btn variant="danger" disabled={ocupado} onClick={() => cancelarSolicitud(s)}>Eliminar borrador</Btn></>}
        {esMia && s.estado !== "borrador" && puedeCancelar(s) && <Btn variant="danger" disabled={ocupado} onClick={() => cancelarSolicitud(s)}>Cancelar solicitud</Btn>}
        {sim && <Btn variant="danger" disabled={ocupado} onClick={() => borrarSolicitudSim(s)}>Borrar de la simulación</Btn>}
        <Btn variant="dark" onClick={() => setModal(null)}>Cerrar</Btn>
      </div>
    </div>;
  };

  // ═══════════════════════════ APROBAR COTIZACIÓN (modal lado a lado) ═══════════════════════════
  const renderAprobar = (q0) => {
    const q = cotizaciones.find(x => x.id === q0.id) || q0;
    const s = solicitudes.find(x => x.id === q.requestId);
    // La cotización puede cubrir ítems de varias solicitudes: buscar la línea en TODAS.
    const lineaSolDe = (lid) => solicitudes.flatMap(x => x.lineas || []).find(l => l.id === lid) || null;
    const ev = evaluarCotizacion({ cotizacion: q, tasa, cfg, partidaDe: (pid) => partidaDe(q.projectCode, pid), lineaSolicitudDe: lineaSolDe });
    const puede = esCoordinador && q.estado === "enviada";
    const [com, setCom] = [modal?.comentario || "", (v) => setModal({ ...modal, comentario: v })];
    const prov = providers.find(p => p.id === q.providerId) || providers.find(p => p.name === q.provider);
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {chipEstado(ESTADOS_COTIZACION, q.estado)}{ev.lineas.length > 0 && chipSem(ev.peor)}{s?.urgente && <Chip c={C_ROJO}>Urgente</Chip>}{s && fueraDeCorte(s, cfg, ahora) && <Chip c={C_ROJO}>Fuera de corte</Chip>}
        <span style={{ fontSize: 13, color: "var(--text-2)" }}><b>{q.provider}</b> · {nombreProy(q.projectCode)} · {s?.folio} · pidió {quien(s?.residente)}{q.numeroProveedor ? ` · cot. ${q.numeroProveedor}` : ""}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {q.pdfFile ? <Btn small variant="info" onClick={() => verArchivo(q.pdfFile)}>Ver PDF</Btn> : <Chip c={C_ROJO}>Sin PDF</Chip>}
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 800, color: CHARCOAL }}>{fmtL(q.totalDeclarado)}</div><div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9 }}>total con ISV · {ev.cuadra ? "cuadra" : `dif. ${fmtL(ev.diferencia)}`}</div></div>
        </div>
      </div>
      {prov && !(prov.bankAccounts || []).length && <div style={{ padding: "8px 12px", borderRadius: 10, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 12 }}>Proveedor sin datos bancarios en el maestro: el borrador se crea con la advertencia para Finanzas.</div>}
      {!prov && <div style={{ padding: "8px 12px", borderRadius: 10, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 12 }}>Proveedor nuevo: al aprobar se crea en el maestro sin datos bancarios.</div>}
      {/* Tres columnas: pedido · cotizado · presupuesto */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px", fontSize: 12.5 }}>
          <thead><tr>{["Lo pedido", "Lo cotizado", "Presupuesto (P.U.)", ""].map(h => <th key={h} className="gt-label" style={{ textAlign: "left", color: "var(--text-3)", padding: "0 10px 2px", fontSize: 9 }}>{h}</th>)}</tr></thead>
          <tbody>{ev.lineas.map((l, i) => {
            const ls = lineaSolDe(l.requestLineId);
            const pa = ls ? partidaDe(q.projectCode, ls.partidaId) : null;
            const sd = ls?.partidaId ? saldoDe(q.projectCode, ls.partidaId) : null;
            return <tr key={l.requestLineId || i} style={{ background: "rgba(255,255,255,.75)" }}>
              <td style={{ padding: "10px", borderRadius: "12px 0 0 12px", verticalAlign: "top" }}><div style={{ fontWeight: 800, color: CHARCOAL }}>{ls?.descripcion || l.descripcion}</div><div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{ls ? `${fmtCant(ls.cantidad)} ${ls.unidad} pedidos · ${fmtCant(l.pendiente ?? 0)} por comprar` : ""}{ls?.fueraPresupuesto ? (ls.sinReceta ? " · sin receta" : " · fuera de presupuesto") : ""}</div></td>
              <td style={{ padding: "10px", verticalAlign: "top" }}><div style={{ fontWeight: 800, color: CHARCOAL }}>{fmtCant(l.cantidad)} {l.unidad} × {fmtL(l.puLps)}{l.parcial ? <Chip c={C_AMARILLO} style={{ marginLeft: 6 }}>Parcial</Chip> : null}</div><div style={{ color: "var(--text-3)", fontSize: 11.5 }}>subtotal {fmtL(l.subtotal)} · {fmtUSD(l.puUSD)} / {l.unidad}</div>{l.justificacion && <div style={{ fontSize: 11.5, color: C_ROJO.color, fontStyle: "italic" }}>"{l.justificacion}"</div>}</td>
              <td style={{ padding: "10px", verticalAlign: "top" }}>{pa ? <><div style={{ fontWeight: 700, color: CHARCOAL }}>{fmtUSD(l.puPresupuestoUSD)} / {pa.unidad || l.unidad} <span style={{ color: "var(--text-3)", fontWeight: 500 }}>(≈ {fmtL(l.puPresupuestoUSD * tasa)})</span></div><div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{pa.nombre}{sd && !sd.sinCantidad ? ` · saldo ${fmtCant(sd.saldo)} ${pa.unidad}` : ""}</div></> : <span style={{ color: "var(--text-3)" }}>Sin partida</span>}</td>
              <td style={{ padding: "10px", borderRadius: "0 12px 12px 0", verticalAlign: "top", textAlign: "right" }}>{chipSem(l.semaforo)}<div style={{ fontSize: 11.5, color: SEM[l.semaforo]?.c.color, fontWeight: 700, marginTop: 4 }}>{fmtPct(l.variacionPct)}</div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {ev.errores.length > 0 && <div style={{ padding: "10px 14px", borderRadius: 12, background: C_ROJO.bg, color: C_ROJO.color, fontSize: 12.5, display: "flex", flexDirection: "column", gap: 2 }}>{ev.errores.map((e, i) => <div key={i}>· {e}</div>)}</div>}
      {q.estado === "aprobada" && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Aprobada por <b>{q.aprobadoPor}</b> el {fmtDT(q.aprobadoAt)} a tasa L {num(q.tasaCambioUsada).toFixed(2)} → borrador <b>{q.purchaseCodigo}</b> en GeoShopping.{(q.avisos || []).length ? ` Aviso: ${q.avisos.join("; ")}.` : ""}</div>}
      {puede && <Textarea label="Comentario (obligatorio para devolver o rechazar)" value={com} onChange={e => setCom(e.target.value)} placeholder="Qué corregir, o por qué se rechaza" style={{ minHeight: 56 }} />}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
        {puede && <>
          <Btn variant="danger" disabled={ocupado} onClick={async () => { if (await rechazarCotizacion(q, com)) setModal(null); }}>Rechazar</Btn>
          <Btn variant="ghost" disabled={ocupado} onClick={async () => { if (await devolverCotizacion(q, com)) setModal(null); }}>Devolver a Compras</Btn>
          <Btn variant="success" disabled={ocupado || !ev.ok} title={ev.ok ? "Crea el borrador en GeoShopping" : ev.errores[0]} onClick={async () => { const pu = await aprobarCotizacion(q, com); if (pu) { setModal(null); alert(sim ? `✓ Aprobada (simulación). Borrador ${pu.codigo} — lo ves en "GeoShopping simulado", arriba.` : `✓ Aprobada. Borrador ${pu.codigo} creado en GeoShopping para que Finanzas lo envíe a Tesorería.${(pu.origenSupply?.avisos || []).length ? `\n\nAviso: ${pu.origenSupply.avisos.join("; ")}.` : ""}`); } }}>{ocupado ? "Aprobando…" : "Aprobar"}</Btn>
        </>}
      </div>
    </div>;
  };

  // ═══════════════════════════ DASHBOARD ═══════════════════════════
  const renderDashboard = () => {
    const cortes = [...new Set(solicitudes.filter(s => s.corte).map(s => etiquetaCorte(s.corte).id))].sort().reverse();
    const filtros = { projectCode: dashProy || undefined, corteId: dashCorte === "todos" ? undefined : dashCorte === "actual" ? etq.id : dashCorte };
    const m = metricasDashboard({ solicitudes, cotizaciones, purchases: purchasesVista, despachos, cfg, ahora, filtros });
    const barra = (v, max, c) => <div style={{ height: 8, borderRadius: 999, background: "rgba(44,42,40,.08)", overflow: "hidden" }}><div style={{ width: `${max ? Math.min(100, (v / max) * 100) : 0}%`, height: "100%", background: c || ORANGE, borderRadius: 999, transition: "width .6s var(--curva)" }} /></div>;
    const maxProy = Math.max(1, ...m.porProyecto.map(x => x.total));
    const T = m.tiempos;
    const etapas = [["Residente → Almacén", T.almacen], ["Almacén → Cotización", T.cotizacion], ["Cotización → Aprobación", T.aprobacion], ["Aprobación → Tesorería", T.tesoreria], ["Tesorería → Pago", T.pago], ["Pago → Entrega en obra", T.entrega]];
    const maxT = Math.max(1, ...etapas.map(([, v]) => v || 0));
    const card = (titulo, children, sx) => <div className="gt-vidrio" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, ...sx }}><div className="gt-label" style={{ color: "var(--text-3)" }}>{titulo}</div>{children}</div>;
    const pct = (p) => p == null ? "—" : `${Math.round(p * 100)} %`;
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="gt-vidrio" style={{ padding: isMobile ? "10px 14px" : "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {pillBtn("Todos los cortes", dashCorte === "todos", () => setDashCorte("todos"))}
        {pillBtn(etq.titulo, dashCorte === "actual", () => setDashCorte("actual"))}
        {cortes.filter(c => c !== etq.id).slice(0, 6).map(c => pillBtn((() => { const m = /^C0?(\d+)-(\d+)$/.exec(c); return m ? etiquetaCorte({ semana: +m[1], anio: +m[2] }).titulo : c; })(), dashCorte === c, () => setDashCorte(c), { key: c }))}
        <select value={dashProy} onChange={e => setDashProy(e.target.value)} style={{ marginLeft: "auto", padding: "8px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 999, fontSize: 13, background: "rgba(255,255,255,.7)", fontFamily: "inherit" }}>
          <option value="">Todos los proyectos</option>{[...new Set(solicitudes.map(s => s.projectCode))].map(p => <option key={p} value={p}>{nombreProy(p)}</option>)}
        </select>
      </div>
      <div className="gt-vidrio" style={{ padding: "12px 10px", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {stat(m.total, "solicitudes")}
        {stat(pct(m.pctEnCorte), "enviadas dentro del corte", { c: m.pctEnCorte != null && m.pctEnCorte < 0.8 ? C_ROJO.color : undefined })}
        {stat(pct(m.pctUrgentes), "urgentes", { c: m.urgentes ? C_ROJO.color : undefined })}
        {stat(fmtDias(T.leadAprobacion), "envío → aprobación")}
        {stat(m.cotizaciones.aprobadas, "cotizaciones aprobadas")}
        {stat(m.fueraDeCorte.length, "ítems fuera de corte", { c: m.fueraDeCorte.length ? C_ROJO.color : undefined })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
        {card("Por estado", <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{Object.entries(ESTADOS_SOLICITUD).filter(([k]) => k !== "borrador").map(([k, e]) => <Chip key={k} c={TONO[e.tono]}>{e.label} · {m.porEstado[k] || 0}</Chip>)}</div>)}
        {card("Semáforo de precio (ítems aprobados)", m.semaforo.total === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no hay cotizaciones aprobadas.</div> : <>
          <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "rgba(44,42,40,.08)" }}>
            {[["verde", C_VERDE.color], ["amarillo", C_AMARILLO.color], ["rojo", C_ROJO.color]].map(([k, c]) => <div key={k} style={{ width: `${(m.semaforo[k] / m.semaforo.total) * 100}%`, background: c }} />)}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Chip c={C_VERDE}>Verde {pct(m.semaforo.pctVerde)}</Chip><Chip c={C_AMARILLO}>Amarillo {pct(m.semaforo.pctAmarillo)}</Chip><Chip c={C_ROJO}>Rojo {pct(m.semaforo.pctRojo)}</Chip></div>
          {m.variacionPorProyecto.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{m.variacionPorProyecto.map(v => <div key={v.k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span>{nombreProy(v.k)}</span><b style={{ color: v.promedio > cfg.semaforo.amarillo ? C_ROJO.color : v.promedio > cfg.semaforo.verde ? C_AMARILLO.color : C_VERDE.color }}>{fmtPct(v.promedio)} promedio · {v.n} ítems</b></div>)}</div>}
        </>)}
        {card("Por proyecto", m.porProyecto.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Sin solicitudes.</div> : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{m.porProyecto.map(x => <div key={x.k}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}><span style={{ fontWeight: 700 }}>{nombreProy(x.k)}</span><span style={{ color: "var(--text-2)" }}>{x.total} · {x.urgentes ? `${x.urgentes} urg. · ` : ""}en corte {pct(x.pctEnCorte)}</span></div>{barra(x.total, maxProy)}</div>)}</div>)}
        {card("Tiempo promedio por etapa", <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{etapas.map(([l, v]) => <div key={l}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}><span>{l}</span><b>{fmtDias(v)}</b></div>{barra(v || 0, maxT, CHARCOAL)}</div>)}</div>)}
        {card("Por residente", m.porResidente.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Sin solicitudes.</div> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{m.porResidente.map(x => <div key={x.k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5, flexWrap: "wrap" }}><span style={{ fontWeight: 700 }}>{quien(x.k)}</span><span style={{ display: "flex", gap: 6 }}><Chip c={C_GRIS}>{x.total} sol.</Chip><Chip c={x.pctEnCorte != null && x.pctEnCorte < 0.8 ? C_ROJO : C_VERDE}>en corte {pct(x.pctEnCorte)}</Chip><Chip c={x.urgentes ? C_ROJO : C_GRIS}>urgentes {pct(x.pctUrgentes)}</Chip>{x.rechazadas > 0 && <Chip c={C_AMARILLO}>{x.rechazadas} rechazados</Chip>}</span></div>)}</div>)}
        {card("Ítems fuera de corte", m.fueraDeCorte.length === 0 ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Ninguno: todo lo del corte se resolvió a tiempo.</div> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{m.fueraDeCorte.slice(0, 12).map(({ sol: s2, linea: l }) => <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, cursor: "pointer" }} onClick={() => setModal({ t: "detalle", id: s2.id })}><span><b>{s2.folio}</b> · {l.descripcion} · {nombreProy(s2.projectCode)}</span>{chipEstado(ESTADOS_LINEA, l.estado)}</div>)}{m.fueraDeCorte.length > 12 && <div style={{ fontSize: 12, color: "var(--text-3)" }}>+{m.fueraDeCorte.length - 12} más</div>}</div>)}
      </div>
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
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Tasa de cambio actual: <b>L {tasa.toFixed(2)} / $</b> (se edita en GeoCost; al aprobar se guarda la tasa usada).</div>
      </div>
      <div className="gt-vidrio" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Cierra con contabilidad, por proyecto</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Se pre-llena en el borrador de GeoShopping. Finanzas lo puede cambiar.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {proyectos.filter(p => presDe(p.short)).map(p => <div key={p.short} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 200px", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
            <Select options={PERSONAS} value={draft.cierrePorProyecto[p.short] || ""} onChange={e => setCfgDraft({ ...draft, cierrePorProyecto: { ...draft.cierrePorProyecto, [p.short]: e.target.value } })} emptyLabel="Lo asigna Finanzas" />
          </div>)}
          {!proyectos.some(p => presDe(p.short)) && <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Ningún proyecto tiene receta en GeoCost todavía.</div>}
        </div>
      </div>
      <div className="gt-vidrio" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Residentes</div>
        {residentes.length === 0
          ? <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>Todavía no hay residentes. Se crean en <b>GeoTeam → Accesos</b>, desde la ficha del colaborador.</div>
          : residentes.map(r => <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid rgba(44,42,40,.06)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, minWidth: 160 }}>{r.label}</div>
            <Chip c={C_GRIS}>{r.username}</Chip>
          </div>)}
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Cada residente elige el proyecto al hacer la solicitud. Los accesos se dan en GeoTeam → Accesos.</div>
      </div>
    </div>
    <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 10 }}>
      {cfgDraft && <Btn variant="ghost" onClick={() => setCfgDraft(null)} disabled={cfgSaving}>Descartar</Btn>}
      <Btn onClick={guardarConfig} disabled={!cfgDraft || cfgSaving}>{cfgSaving ? "Guardando…" : "Guardar configuración"}</Btn>
    </div>
  </div>;

  // ═══════════════════════════ MODALES ═══════════════════════════
  const renderModal = () => {
    if (!modal) return null;
    const m = modal;
    switch (m.t) {
      case "solicitud": return <Modal title={m.s ? `Editar ${m.s.folio}` : "Nueva solicitud de material"} onClose={() => setModal(null)} wide fondoCierra={false}>
        <SolicitudFormImpl subirPdf={subirPdf} verArchivo={verArchivo} proyectoInicial={rol === "almacen" && proyectos.some(p => p.short === "PLANTEL") ? "PLANTEL" : ""} solicitud={m.s} proyectos={misProyectos} presDe={presDe} saldoDe={saldoDe} catalogo={catalogo} cfg={cfg} ahora={ahora} userKey={userKey} onGuardar={guardarSolicitud} onClose={() => setModal(null)} isMobile={isMobile} />
      </Modal>;
      case "detalle": return <Modal title={solicitudes.find(x => x.id === m.id)?.folio || "Solicitud"} onClose={() => setModal(null)} wide>{renderDetalle(m.id)}</Modal>;
      case "rechazar-linea": return <Modal title={`Rechazar: ${m.l.descripcion}`} onClose={() => setModal(null)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>{m.s.folio} · {nombreProy(m.s.projectCode)} · pidió {quien(m.s.residente)}. El motivo lo ve el residente.</div>
          <Textarea label="Motivo *" value={m.motivo || ""} onChange={e => setModal({ ...m, motivo: e.target.value })} autoFocus />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn><Btn variant="danger" disabled={ocupado} onClick={async () => { if (await accionLinea(m.s.id, m.l.id, "rechazar", { motivo: m.motivo }, `${m.l.descripcion}: rechazado — ${m.motivo}`)) setModal(null); }}>Rechazar ítem</Btn></div>
        </div>
      </Modal>;
      case "cotizacion": {
        const projectCode = m.q?.projectCode || m.projectCode;
        const candidatas = candidatasDe(projectCode, m.q?.id);
        return <Modal title={m.q ? `${m.q.folio} — ${m.q.provider}` : `Nueva cotización — ${nombreProy(projectCode)}`} onClose={() => setModal(null)} wide fondoCierra={false}>
          <CotizacionFormImpl cotizacion={m.q} projectCode={projectCode} nombreProy={nombreProy} candidatas={candidatas} providers={providers} partidaDe={(pid) => partidaDe(projectCode, pid)} tasa={tasa} cfg={cfg} isMobile={isMobile}
            onGuardar={(f, ev) => guardarCotizacion(f, ev, false)} onEnviar={async (f, ev) => { await materializarSinRevision(f.lineas); await guardarCotizacion(f, ev, true); }} onClose={() => setModal(null)} subirPdf={subirPdf} verArchivo={verArchivo} bajarArchivo={(ref) => store.getCloud(fileKey(ref.fileId))} memoria={memoriaDeCompras(purchasesVista)} quien={quien} />
        </Modal>;
      }
      case "sim-shop": return <Modal title="GeoShopping simulado" onClose={() => setModal(null)} wide>{renderSimShop()}</Modal>;
      case "aprobar": return <Modal title={`${m.q.folio} — ${m.q.provider}`} onClose={() => setModal(null)} size="xl">{renderAprobar(m.q)}</Modal>;
      default: return null;
    }
  };

  // ═══════════════════════════ ROOT ═══════════════════════════
  if (!rol) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", color: "#6E6862", fontSize: 13 }}>Este usuario no tiene acceso a GeoSupply.</div>;
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", fontFamily: "inherit", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoSupply…</div>;
  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
  const secOk = nav.some(x => x.id === sec) ? sec : nav[0]?.id;
  // Ver como (simulación): al cambiar de rol se va a SU primera pestaña.
  const SIM_ROLES = [["residente", "Residente"], ["almacen", "Almacén"], ["compras", "Compras"], ["coordinador", "Coordinador"], ["finanzas", "Finanzas"]];
  const verComo = (r) => { setSimRol(r); setSec((NAV[r] || [])[0]?.id || "solicitudes"); setModal(null); };
  const reiniciarSim = async () => {
    if (!confirm("¿Borrar toda la simulación (solicitudes, cotizaciones y borradores simulados) y empezar de cero?")) return;
    const archivos = cotizaciones.map(q => q.pdfFile?.fileId).filter(Boolean);
    await Promise.all([store.remove("sp-sim-solicitudes", { quiet: true }), store.remove("sp-sim-cotizaciones", { quiet: true }), store.remove("sp-sim-purchases", { quiet: true }), ...archivos.map(id => store.remove(fileKey(id), { quiet: true }))]);
    setSolicitudes([]); setCotizaciones([]); setSimPurchases([]); setModal(null);
    verComo("residente");
  };
  const salirSim = () => { setSim(false); setSec("hoy"); };
  const barraSim = sim && <div style={{ position: "relative", zIndex: 2, flexShrink: 0, background: C_AMARILLO.bg, borderBottom: "1px solid rgba(138,90,0,.18)", padding: isMobile ? "8px 12px" : "8px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
    <span style={{ font: "800 12px/1 var(--sans)", color: C_AMARILLO.color, letterSpacing: ".02em" }}>SIMULACIÓN</span>
    <span style={{ fontSize: 12, color: C_AMARILLO.color }}>Ver como</span>
    {SIM_ROLES.map(([k, l]) => pillBtn(l, simRol === k, () => verComo(k), { key: k, c: CHARCOAL }))}
    <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Btn small variant="ghost" onClick={() => setModal({ t: "sim-shop" })}>GeoShopping simulado ({simPurchases.length})</Btn>
      <Btn small variant="ghost" onClick={reiniciarSim}>Reiniciar</Btn>
      <Btn small variant="dark" onClick={salirSim}>Salir de la simulación</Btn>
    </div>
  </div>;
  // Lo que Finanzas vería en "Borradores (n)" y cómo sube GeoCost.
  const actualizarSimPurchase = async (id, cambios, nota) => {
    const rec = await actualizarEn("sp-sim-purchases", setSimPurchases, id, (p) => ({ ...p, ...cambios, audit: [...(p.audit || []), auditEntry(cambios.status || cambios.deliveryStatus || "cambio", nota)] }));
    return !!rec;
  };
  const renderSimShop = () => {
    const ESTADO = { borrador: ["Borrador (Finanzas)", C_GRIS], validado: ["Pendiente Lic. Carolina", C_AZUL], pagado: ["Pagada", C_VERDE] };
    const DEST = { normal: "Normal", prioridad: "Prioridades", cxp: "Cuentas por pagar" };
    const porProy = [...new Set(simPurchases.map(p => p.projectCode))];
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Así le llegarían a Finanzas en GeoShopping → Solicitudes → <b>Borradores</b>, y así subiría GeoCost. Nada de esto es real.</div>
      {simPurchases.length === 0 && <Vacio>Todavía no hay borradores: aparecen cuando el Coordinador aprueba una cotización.</Vacio>}
      {porProy.map(pc => {
        const lista = simPurchases.filter(p => p.projectCode === pc);
        const movs = movimientosCompras({ purchases: lista, projectCode: pc, tasa });
        const comp = movs.filter(m => m.estado === "comprometido").reduce((a, m) => a + m.montoUSD, 0);
        const ejec = movs.filter(m => m.estado === "ejecutado").reduce((a, m) => a + m.montoUSD, 0);
        const porPartida = {};
        movs.forEach(m => { const k = partidaDe(pc, m.partidaId)?.nombre || "Por clasificar"; porPartida[k] = (porPartida[k] || 0) + m.montoUSD; });
        return <div key={pc} className="gt-vidrio" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>{nombreProy(pc)}</b>
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-2)" }}>GeoCost: comprometido <b>{fmtUSD(comp)}</b> · ejecutado <b>{fmtUSD(ejec)}</b></span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{Object.entries(porPartida).map(([k, v]) => <Chip key={k} c={k === "Por clasificar" ? C_AMARILLO : C_GRIS}>{k}: {fmtUSD(v)}</Chip>)}</div>
          {lista.map(p => {
            const [lbl, c] = p.deliveryStatus === "ficha_adjunta" ? ["Entregada con ficha", C_VERDE] : ESTADO[p.status] || [p.status, C_GRIS];
            return <div key={p.id} style={{ padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.75)", border: "1px solid rgba(44,42,40,.08)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--mono)", fontWeight: 800, fontSize: 12 }}>{p.codigo}</span>
                <Chip c={c}>{lbl}</Chip>
                <b style={{ fontSize: 13.5 }}>{p.provider}</b>
                <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{p.origenSupply?.folioSolicitud} · {p.origenSupply?.folioCotizacion}</span>
                <b style={{ marginLeft: "auto", fontSize: 14 }}>{fmtL(p.amount)}</b>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--text-2)", whiteSpace: "pre-line" }}>{p.description}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Chip c={C_GRIS}>{(p.condicionPago || "contado") === "credito" ? "Crédito" : "Contado"}</Chip>
                <Chip c={C_GRIS}>Va a: {DEST[p.destinoPago] || "Normal"}</Chip>
                <Chip c={C_GRIS}>Pago {p.fechaPagoRequerida ? fmtDiaCorto(p.fechaPagoRequerida) : "sin fecha"}</Chip>
                {p.bacAccount ? <Chip c={C_GRIS}>{p.providerBank || "Banco"} {p.bacAccount}</Chip> : null}
                {(p.origenSupply?.avisos || []).map(a => <Chip key={a} c={C_AMARILLO}>{a}</Chip>)}
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {p.status === "borrador" && <Btn small variant="success" disabled={ocupado} onClick={() => actualizarSimPurchase(p.id, { status: "validado", treasuryStatus: "pendiente", validatedAt: new Date().toISOString() }, "Enviada a Tesorería (simulación)")}>Finanzas: enviar a Tesorería</Btn>}
                {p.status === "validado" && <Btn small variant="success" disabled={ocupado} onClick={() => actualizarSimPurchase(p.id, { status: "pagado", treasuryStatus: "pagada", paidAt: hoyISO(), paymentDate: hoyISO() }, "Pagada (simulación)")}>Tesorería: marcar pagada</Btn>}
                {(p.status === "pagado" || p.status === "finalizado") && p.deliveryStatus !== "ficha_adjunta" && <Btn small variant="success" disabled={ocupado} onClick={() => { const at = new Date().toISOString(); actualizarSimPurchase(p.id, { deliveryStatus: "ficha_adjunta", delivery: { ...(p.delivery || {}), entregadoAt: at, fichaUploadedAt: at, simulada: true } }, "Entregado en el proyecto con ficha firmada (simulación)"); }}>Logística: entregado con ficha</Btn>}
              </div>
            </div>;
          })}
        </div>;
      })}
    </div>;
  };

  const badge = { alertas: n.alertas, cotizaciones: esCoordinador ? n.cotizadas : rol === "compras" ? n.devueltas : 0, almacen: n.almacen, compras: n.porCotizar };

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
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{sim ? `Simulando · ${ROL_LABEL[rol]}` : (ROL_LABEL[rol] || ROLE_LABEL[userRole] || userRole)}</div>
        </div>}
        {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Cerrar sesión</button>}
      </div>
    </div>
    <div style={{ position: "relative", zIndex: 2, display: "flex", borderBottom: "1px solid rgba(44,42,40,.08)", overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: isMobile ? 8 : 20, scrollbarWidth: "thin" }}>
      {nav.map(x => {
        const active = secOk === x.id;
        const b = badge[x.id];
        return <button key={x.id} onClick={() => setSec(x.id)} style={{ padding: isMobile ? "12px 14px" : "14px 18px", background: "transparent", border: "none", boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none", color: active ? "var(--naranja-tinta)" : "var(--text-3)", cursor: "pointer", fontSize: 13.5, fontWeight: active ? 800 : 600, fontFamily: "inherit", transition: "color .15s", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6 }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text)"; }} onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-3)"; }}>{x.label}{b > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: ORANGE, color: "#fff", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{b}</span>}</button>;
      })}
    </div>
    {barraSim}
    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "8px 14px 20px 14px" : "12px 32px 28px 32px" }}>
        {secOk === "hoy" ? renderHoy() : secOk === "alertas" ? renderAlertas() : secOk === "almacen" ? renderAlmacen() : secOk === "compras" ? renderCompras() : secOk === "cotizaciones" ? renderCotizaciones() : secOk === "dashboard" ? renderDashboard() : secOk === "config" ? renderConfig() : renderSolicitudes()}
      </div>
    </div>
    {renderModal()}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}

// Días cortos para las tiras (lun, mar…) — índice ISO 1..7.
const DIAS_CORTOS_ = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
