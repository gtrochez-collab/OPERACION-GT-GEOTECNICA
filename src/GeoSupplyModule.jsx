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
import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";
import { USERS, ROLE_LABEL } from "./users.js";
import { hoyISO } from "./fechas.js";
import { num, UNIDADES, TASA_DEFAULT } from "./geocost-calc.js";
import { Input, Select, Textarea, Btn, Chip, Modal, C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, fmtL, fmtUSD, uid, useIsMobile } from "./geocost-ui.jsx";
import { VisorArchivo } from "./visor-archivo.jsx";
import {
  configEfectiva, corteActual, corteDe, etiquetaCorte, hitoDeCorte, estadoHito, fmtFalta, llegadaEstimada, fmtDiaCorto, fmtDiaLargo,
  DIAS_SEMANA, estadoEfectivoLinea, solicitudActiva, ESTADOS_LINEA, ESTADOS_SOLICITUD, ESTADOS_COTIZACION, estadoCabecera,
  estadoInicialLinea, alertasDeLinea, ALERTAS, puedeCancelar, aplicarAccionLinea, pendienteDeCompra, saldoDePartida, partidasPedibles,
  puPresupuestoUSD, evaluarCotizacion, siguienteFolio, siguienteCodigoCompra, borradorDesdeCotizacion, fueraDeCorte, metricasDashboard,
  LINEA_TERMINAL, ymdSumar, partesHN, enviadaEnCorte, round2,
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
const PASOS = ["Enviada", "Almacén", "Compras", "Aprobación", "En compra", "Llega a obra"];
const pasoDeLinea = (l, sol, purchase, despachoEntregado) => {
  if (!l) return { idx: 0, estado: "activo" };
  if (l.estado === "rechazada") return { idx: -1, estado: "rechazada" };
  if (l.estado === "pendiente_coord") return { idx: 0, estado: "alerta", nota: "Esperando al Coordinador" };
  if (l.estado === "revision_almacen") return { idx: 1, estado: "activo" };
  if (l.estado === "despachada_almacen") return { idx: 1, estado: "fin", nota: "Sale de almacén" };
  if (l.estado === "por_cotizar") return { idx: 2, estado: "activo" };
  if (l.estado === "cotizada") return { idx: 3, estado: "activo" };
  if (l.estado === "comprada") {
    if (despachoEntregado) return { idx: 5, estado: "fin", nota: "Entregada en obra" };
    if (purchase && (purchase.status === "pagado" || purchase.status === "finalizado")) return { idx: 5, estado: "activo", nota: "Pagada, en camino" };
    if (purchase && purchase.status === "validado") return { idx: 4, estado: "activo", nota: "En Tesorería" };
    return { idx: 4, estado: "activo", nota: "Con Finanzas" };
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
      return <div key={p} style={{ display: "flex", alignItems: "center", flex: i < PASOS.length - 1 ? "1 1 0" : "0 0 auto", minWidth: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: compact ? 44 : 64 }}>
          <span style={{ width: compact ? 14 : 18, height: compact ? 14 : 18, borderRadius: "50%", background: hecho ? color : "transparent", border: `2px solid ${color}`, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 900, opacity: noAplica ? .35 : 1, boxShadow: actual ? `0 0 0 4px ${paso.estado === "alerta" ? C_NARANJA.bg : "rgba(232,118,45,.18)"}` : "none" }}>{hecho ? "✓" : ""}</span>
          {!compact && <span style={{ fontSize: 10, fontWeight: actual ? 800 : 600, color: actual ? CHARCOAL : noAplica ? "var(--text-faint)" : "var(--text-3)", whiteSpace: "nowrap" }}>{p}</span>}
        </div>
        {i < PASOS.length - 1 && <div style={{ flex: 1, height: 2, background: paso.idx > i ? C_VERDE.color : "rgba(44,42,40,.12)", margin: compact ? "0 2px 0" : "0 4px 14px", minWidth: 8 }} />}
      </div>;
    })}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM DE SOLICITUD (residente) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
function SolicitudFormImpl({ solicitud, proyectos, presDe, saldoDe, cfg, ahora, userKey, onGuardar, onClose, isMobile }) {
  const [f, setF] = useState(() => solicitud ? { ...solicitud, lineas: (solicitud.lineas || []).map(l => ({ ...l })) } : { projectCode: proyectos.length === 1 ? proyectos[0].short : "", fechaRequeridaObra: "", urgente: false, justificacionUrgencia: "", notas: "", lineas: [] });
  const [q, setQ] = useState("");
  const [sol, setSol] = useState("");
  const [fuera, setFuera] = useState(null);     // { descripcion, unidad, cantidad, justificacion }
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const pres = presDe(f.projectCode);
  const pedibles = partidasPedibles(pres);
  const soluciones = [...new Set(pedibles.map(p => String(p.solucion || "").trim()).filter(Boolean))];
  const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const encontrados = q.trim().length < 2 ? [] : pedibles.filter(p => (!sol || String(p.solucion || "").trim() === sol) && norm(`${p.nombre} ${p.categoria} ${p.solucion || ""}`).includes(norm(q))).slice(0, 12);
  const yaEsta = (id) => f.lineas.some(l => l.partidaId === id);
  const agregar = (p) => {
    if (yaEsta(p.id)) return;
    u("lineas", [...f.lineas, { id: uid(), partidaId: p.id, descripcion: p.nombre, unidad: p.unidad || "", categoria: p.categoria || "", solucion: p.solucion || "", cantidad: "", fueraPresupuesto: false }]);
    setQ("");
  };
  const uLinea = (id, k, v) => u("lineas", f.lineas.map(l => l.id === id ? { ...l, [k]: v } : l));
  const quitar = (id) => u("lineas", f.lineas.filter(l => l.id !== id));
  const saldoLinea = (l) => l.partidaId ? saldoDe(f.projectCode, l.partidaId, f.id) : null;
  const excede = (l) => { const s = saldoLinea(l); return !!s && !s.sinCantidad && num(l.cantidad) > s.saldo + 0.0001; };
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
      if (enviar && !(num(l.cantidad) > 0)) e.push(`${l.descripcion || "Ítem"}: la cantidad debe ser mayor que 0.`);
      if (l.fueraPresupuesto && (!String(l.descripcion || "").trim() || (enviar && String(l.justificacion || "").trim().length < 5))) e.push(`${l.descripcion || "Ítem fuera de presupuesto"}: escribí qué es y por qué no está en la receta.`);
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
      const lineas = f.lineas.map(l => ({ ...l, cantidad: num(l.cantidad), excedeSaldo: excede(l) }));
      await onGuardar({ ...f, lineas }, enviar);
    } finally { setSaving(false); }
  };
  const CTRL = { padding: "8px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 10, fontSize: 13, outline: "none", background: "#F4F4F2", fontFamily: "inherit", boxSizing: "border-box" };
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: 12 }}>
      <Select label="Proyecto *" options={proyectos.map(p => ({ value: p.short, label: p.name || p.short }))} value={f.projectCode} onChange={e => { u("projectCode", e.target.value); u("lineas", f.lineas.filter(l => l.fueraPresupuesto)); setSol(""); }} emptyLabel="Elegí el proyecto" disabled={!!solicitud && solicitud.estado !== "borrador"} />
      <Input label="Lo necesito en obra el *" type="date" value={f.fechaRequeridaObra || ""} min={hoyISO()} onChange={e => u("fechaRequeridaObra", e.target.value)} />
    </div>
    {f.projectCode && !pres && <div style={{ padding: "10px 14px", borderRadius: 12, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 12.5 }}>Este proyecto no tiene receta en GeoCost: todo lo que pidás va como <b>fuera de presupuesto</b> y lo revisa el Coordinador.</div>}

    {/* Buscador de la receta */}
    {pres && <div className="gt-vidrio" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="gt-label" style={{ color: "var(--text-3)" }}>Ítems de la receta</div>
      {soluciones.length > 1 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{pillBtn("Todas", !sol, () => setSol(""), { c: CHARCOAL })}{soluciones.map(s => pillBtn(s, sol === s, () => setSol(s), { c: CHARCOAL }))}</div>}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscá el material (ej. tubo, cemento, varilla)…" style={{ ...CTRL, width: "100%", padding: "11px 14px", fontSize: 14, borderRadius: 12 }} autoFocus={!solicitud} />
      {q.trim().length >= 2 && <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {encontrados.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text-3)", padding: "6px 2px" }}>Nada en la receta con "{q}". Si de verdad hace falta, agregalo <b>fuera de presupuesto</b> abajo.</div>}
        {encontrados.map(p => {
          const s = saldoDe(f.projectCode, p.id, f.id);
          const ya = yaEsta(p.id);
          return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, background: "rgba(255,255,255,.7)", border: "1px solid rgba(44,42,40,.07)", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>{p.nombre}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{[p.solucion, p.categoria].filter(Boolean).join(" · ")}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-2)", textAlign: "right", lineHeight: 1.5 }}>
              {s?.sinCantidad ? <span style={{ color: C_AMARILLO.color }}>Sin cantidad en la receta</span> : <>
                <div>Receta <b>{fmtCant(s.presupuestada)}</b> {p.unidad} · pedido <b>{fmtCant(s.comprada + s.enSolicitudes)}</b></div>
                <div style={{ color: s.saldo > 0 ? C_VERDE.color : C_ROJO.color, fontWeight: 800 }}>Saldo {fmtCant(s.saldo)} {p.unidad}</div>
              </>}
            </div>
            <Btn small variant={ya ? "ghost" : "primary"} disabled={ya} onClick={() => agregar(p)}>{ya ? "Agregado" : "+ Agregar"}</Btn>
          </div>;
        })}
      </div>}
    </div>}

    {/* Líneas agregadas */}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Lo que pedís · {f.lineas.length} {f.lineas.length === 1 ? "ítem" : "ítems"}</div>
        {!fuera && <button type="button" onClick={() => setFuera({ descripcion: "", unidad: "", cantidad: "", justificacion: "" })} style={{ background: "none", border: "none", color: "var(--naranja-texto-chico)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>+ Agregar ítem fuera de presupuesto</button>}
      </div>
      {f.lineas.length === 0 && !fuera && <div style={{ padding: "18px", textAlign: "center", color: "var(--text-3)", fontSize: 13, border: "1px dashed rgba(44,42,40,.18)", borderRadius: 14 }}>Todavía no agregaste nada.</div>}
      {f.lineas.map(l => {
        const s = saldoLinea(l);
        const ex = excede(l);
        return <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 14, background: l.fueraPresupuesto ? C_AMARILLO.bg : ex ? C_NARANJA.bg : "rgba(255,255,255,.75)", border: "1px solid rgba(44,42,40,.08)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{l.descripcion}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 3 }}>
              {l.fueraPresupuesto ? <Chip c={C_AMARILLO}>Fuera de presupuesto</Chip> : <span style={{ fontSize: 11, color: "var(--text-3)" }}>{[l.solucion, l.categoria].filter(Boolean).join(" · ")}</span>}
              {s && !s.sinCantidad && <span style={{ fontSize: 11, color: ex ? C_ROJO.color : "var(--text-3)", fontWeight: ex ? 800 : 500 }}>saldo {fmtCant(s.saldo)} {l.unidad}</span>}
              {ex && <Chip c={C_ROJO}>Excede el saldo · lo aprueba el Coordinador</Chip>}
            </div>
            {l.fueraPresupuesto && <input value={l.justificacion || ""} onChange={e => uLinea(l.id, "justificacion", e.target.value)} placeholder="Por qué hace falta y no está en la receta *" style={{ ...CTRL, width: "100%", marginTop: 6, background: "#fff" }} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" min="0" step="any" value={l.cantidad} onChange={e => uLinea(l.id, "cantidad", e.target.value)} placeholder="Cant." style={{ ...CTRL, width: 90, textAlign: "right", fontWeight: 700 }} />
            <span style={{ fontSize: 12, color: "var(--text-2)", minWidth: 40 }}>{l.unidad || ""}</span>
          </div>
          <button type="button" onClick={() => quitar(l.id)} title="Quitar" style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>;
      })}
      {fuera && <div style={{ padding: 12, borderRadius: 14, background: C_AMARILLO.bg, border: `1px solid rgba(138,90,0,.2)`, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr", gap: 8 }}>
        <div style={{ gridColumn: "1/-1", fontSize: 12, color: C_AMARILLO.color, fontWeight: 700 }}>Ítem fuera de presupuesto — lo revisa el Coordinador antes de seguir</div>
        <input value={fuera.descripcion} onChange={e => setFuera({ ...fuera, descripcion: e.target.value })} placeholder="Qué es (ej. Cinta métrica 50 m) *" style={{ ...CTRL, background: "#fff" }} />
        <input list="sp-unidades" value={fuera.unidad} onChange={e => setFuera({ ...fuera, unidad: e.target.value })} placeholder="Unidad" style={{ ...CTRL, background: "#fff" }} />
        <datalist id="sp-unidades">{UNIDADES.map(x => <option key={x} value={x} />)}</datalist>
        <input type="number" min="0" step="any" value={fuera.cantidad} onChange={e => setFuera({ ...fuera, cantidad: e.target.value })} placeholder="Cantidad *" style={{ ...CTRL, background: "#fff" }} />
        <input value={fuera.justificacion} onChange={e => setFuera({ ...fuera, justificacion: e.target.value })} placeholder="Por qué hace falta y no está en la receta *" style={{ ...CTRL, background: "#fff", gridColumn: "1/-1" }} />
        <div style={{ gridColumn: "1/-1", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn small variant="ghost" onClick={() => setFuera(null)}>Cancelar</Btn>
          <Btn small onClick={() => {
            if (!fuera.descripcion.trim() || !(num(fuera.cantidad) > 0) || fuera.justificacion.trim().length < 5) return alert("Completá qué es, la cantidad y la justificación.");
            u("lineas", [...f.lineas, { id: uid(), partidaId: null, descripcion: fuera.descripcion.trim(), unidad: fuera.unidad.trim(), categoria: "", cantidad: fuera.cantidad, fueraPresupuesto: true, justificacion: fuera.justificacion.trim() }]);
            setFuera(null);
          }}>Agregar</Btn>
        </div>
      </div>}
    </div>

    {/* Urgente + notas */}
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: CHARCOAL, cursor: "pointer" }}>
          <input type="checkbox" checked={!!f.urgente} onChange={e => u("urgente", e.target.checked)} /> Es urgente (se salta el corte)
        </label>
        {f.urgente && <input value={f.justificacionUrgencia || ""} onChange={e => u("justificacionUrgencia", e.target.value)} placeholder="Por qué no puede esperar al corte *" style={{ ...CTRL, width: "100%", background: C_ROJO.bg, border: `1px solid ${C_ROJO.borde}` }} />}
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Entra al <b>{etq.titulo}</b> · llega a obra <b>{fmtDiaCorto(lleg.desde)} – {fmtDiaCorto(lleg.hasta)}</b>.</div>
      </div>
      <Textarea label="Notas (opcional)" value={f.notas || ""} onChange={e => u("notas", e.target.value)} placeholder="Dónde se recibe, con quién, horarios…" style={{ minHeight: 56 }} />
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
      <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
      <Btn variant="dark" onClick={() => guardar(false)} disabled={saving}>Guardar borrador</Btn>
      <Btn onClick={() => guardar(true)} disabled={saving}>{saving ? "Enviando…" : "Enviar solicitud"}</Btn>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM DE COTIZACIÓN (Compras) — a nivel de módulo
// ═══════════════════════════════════════════════════════════════════════════
// `candidatas`: líneas por cotizar del proyecto [{sol, l, pendiente}].
function CotizacionFormImpl({ cotizacion, projectCode, nombreProy, candidatas, providers, partidaDe, tasa, cfg, onGuardar, onEnviar, onClose, subirPdf, verArchivo, isMobile }) {
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
    u("lineas", [...f.lineas, { requestLineId: c.l.id, requestId: c.sol.id, cantidad: c.pendiente, parcial: false, puLps: "", justificacion: "", descripcion: c.l.descripcion, unidad: c.l.unidad }]);
  };
  const uL = (lid, k, v) => u("lineas", f.lineas.map(x => x.requestLineId === lid ? { ...x, [k]: v } : x));
  const lineaSolicitudDe = (lid) => candidatas.find(c => c.l.id === lid)?.l || null;
  const ev = evaluarCotizacion({ cotizacion: f, tasa, cfg, partidaDe, lineaSolicitudDe });
  const porLinea = (lid) => ev.lineas.find(x => x.requestLineId === lid);
  const sumaChip = ev.total > 0 && ev.lineas.length ? (ev.cuadra ? <Chip c={C_VERDE}>Cuadra con el total</Chip> : <Chip c={C_ROJO}>Diferencia {fmtL(ev.diferencia)}</Chip>) : null;
  const guardar = async (enviar) => {
    if (enviar && !ev.ok) return alert(ev.errores.join("\n"));
    if (!enviar && !String(f.provider || "").trim()) return alert("Elegí el proveedor.");
    setSaving(true);
    try { await (enviar ? onEnviar : onGuardar)({ ...f, totalDeclarado: num(f.totalDeclarado), lineas: f.lineas.map(l => ({ ...l, cantidad: num(l.cantidad), puLps: num(l.puLps) })) }, ev); }
    finally { setSaving(false); }
  };
  const CTRL = { padding: "8px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 10, fontSize: 13, outline: "none", background: "#F4F4F2", fontFamily: "inherit", boxSizing: "border-box" };
  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ fontSize: 12.5, color: "var(--text-2)" }}>Proyecto <b>{nombreProy(f.projectCode)}</b> · una cotización = un proveedor. Los precios van <b>con ISV</b>, tal cual cuadran con el total.</div>
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
              <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.sol.folio} · pendiente <b>{fmtCant(c.pendiente)} {c.l.unidad}</b> · requerido {fmtDiaCorto(c.sol.fechaRequeridaObra)}{c.l.sinRevisionAlmacen ? " · sin revisión de almacén" : ""}{c.l.fueraPresupuesto ? " · fuera de presupuesto" : puPres ? ` · presupuesto ${fmtUSD(puPres)} / ${c.l.unidad} (≈ ${fmtL(puPres * tasa)})` : ""}</div>
            </div>
            {inc && e && chipSem(e.semaforo)}
          </div>
          {inc && fl && <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "110px 1fr 140px 1fr", gap: 8, alignItems: "center" }}>
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
            <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} disabled={subiendo} onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setSubiendo(true); try { const ref = await subirPdf(file); if (ref) u("pdfFile", ref); } finally { setSubiendo(false); } }} />
          </label>}
      </div>
    </div>
    {!ev.cuadra && ev.total > 0 && ev.lineas.length > 0 && <div style={{ padding: "10px 14px", borderRadius: 12, background: C_ROJO.bg, color: C_ROJO.color, fontSize: 12.5 }}>La suma de los ítems no cuadra con el total. Si la cotización trae el ISV solo al final, <b>multiplicá cada precio unitario por 1.15</b>.</div>}
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
  const rol = rolSupply(userRole);
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
  const cargar = async () => {
    const [sol, cot, cf, pr, cc, cp, pv, pu, us, dp] = await Promise.all([
      leer("sp-solicitudes"), leer("sp-cotizaciones"), leer("sp-config"), leer("cc-presupuestos"), leer("cc-config"),
      leer("cp-projects"), leer("cp-providers"), leer("cp-purchases"), leer("gt-usuarios"), leer("lg-despachos"),
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
    if (Array.isArray(dp)) setDespachos(dp);
  };
  useEffect(() => { let vivo = true; (async () => { await cargar(); if (vivo) setLoaded(true); })(); return () => { vivo = false; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Latido: las bandejas son colas de trabajo — al volver a la pestaña y cada
  // 90 s con la pestaña visible (sin modal abierto, para no pisar lo que se tipea).
  const modalRef = useRef(null); modalRef.current = modal;
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible" && !modalRef.current) cargar(); };
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
  const partidaDe = (short, partidaId) => (presDe(short)?.partidas || []).find(p => p.id === partidaId) || null;
  const saldoDe = (short, partidaId, excluirSolicitudId) => { const partida = partidaDe(short, partidaId); return partida ? saldoDePartida({ partida, purchases, solicitudes, excluirSolicitudId }) : null; };
  const miUsuario = usuarios.find(u => u.username === userKey) || null;
  const misProyectos = esResidente ? proyectos.filter(p => (miUsuario?.proyectos || userProyectos || []).includes(p.short)) : proyectos;
  const residentes = usuarios.filter(u => u.role === "residente" && u.activo !== false);
  const quien = (username) => nombreUsuario(username, usuarios);

  // ── Guardado: SIEMPRE sobre el registro fresco de la nube ──
  const auditEntry = (action, note, extra = {}) => ({ action, by: userName, role: userRole, at: new Date().toISOString(), note: note || "", ...extra });
  const escribirLista = async (key, next, idVerificar, updatedAt, setter) => {
    const ok = await store.set(key, next);
    if (!ok) { alert("No se pudo guardar en la nube. Reintentá."); return false; }
    const back = await store.getCloud(key);
    const fila = Array.isArray(back) ? back.find(x => x.id === idVerificar) : null;
    if (!fila || fila.updatedAt !== updatedAt) { alert("VERIFICACIÓN FALLÓ: la nube no refleja el cambio. Recargá y revisá."); return false; }
    setter(back);
    return true;
  };
  // fn(registroFresco) → registro nuevo (o null para abortar). Devuelve el registro guardado o null.
  const actualizarEn = async (key, setter, id, fn) => {
    if (ocupado) return null;
    setOcupado(true);
    try {
      const c = await store.getCloud(key);
      const arr = Array.isArray(c) ? c : [];
      const cur = arr.find(x => x.id === id);
      if (!cur) { alert("El registro ya no está en la nube."); return null; }
      const next = fn(cur);
      if (!next) return null;
      const rec = { ...next, updatedAt: new Date().toISOString() };
      const ok = await escribirLista(key, arr.map(x => x.id === id ? rec : x), id, rec.updatedAt, setter);
      return ok ? rec : null;
    } catch (e) { alert("Sin conexión con la nube: no se guardó."); console.warn("[GeoSupply]", e); return null; }
    finally { setOcupado(false); }
  };
  const crearEn = async (key, setter, armar) => {
    if (ocupado) return null;
    setOcupado(true);
    try {
      const c = await store.getCloud(key);
      const arr = Array.isArray(c) ? c : [];
      const rec = armar(arr);
      if (!rec) return null;
      const full = { ...rec, updatedAt: new Date().toISOString() };
      const ok = await escribirLista(key, [...arr, full], full.id, full.updatedAt, setter);
      return ok ? full : null;
    } catch (e) { alert("Sin conexión con la nube: no se guardó."); console.warn("[GeoSupply]", e); return null; }
    finally { setOcupado(false); }
  };
  const actualizarSolicitud = (id, fn) => actualizarEn("sp-solicitudes", setSolicitudes, id, fn);
  const actualizarCotizacion = (id, fn) => actualizarEn("sp-cotizaciones", setCotizaciones, id, fn);

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
      if (!aud.length) return null;
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
      return { ...s, lineas, estado: "enviada", fechaEnvio: ahoraISO, corte, audit: [...(s.audit || []), auditEntry("enviada", `Enviada al ${etiquetaCorte(corte).titulo}${s.urgente ? " · URGENTE" : ""}`)] };
    };
    let rec;
    if (f.id) {
      rec = await actualizarSolicitud(f.id, (s) => {
        if (s.estado !== "borrador") { alert("Esta solicitud ya fue enviada: no se puede editar."); return null; }
        const base = { ...s, projectCode: f.projectCode, fechaRequeridaObra: f.fechaRequeridaObra, urgente: !!f.urgente, justificacionUrgencia: f.justificacionUrgencia || "", notas: f.notas || "", lineas: f.lineas, audit: [...(s.audit || []), auditEntry("editada", "Borrador editado")] };
        return enviar ? prepararEnvio(base) : base;
      });
    } else {
      rec = await crearEn("sp-solicitudes", setSolicitudes, (arr) => {
        const base = { id: uid(), folio: siguienteFolio(arr, "SUP", new Date(ahoraISO).getFullYear()), projectCode: f.projectCode, residente: userKey, fechaRequeridaObra: f.fechaRequeridaObra, urgente: !!f.urgente, justificacionUrgencia: f.justificacionUrgencia || "", notas: f.notas || "", estado: "borrador", lineas: f.lineas, createdAt: ahoraISO, audit: [auditEntry("creada", "Borrador creado")] };
        return enviar ? prepararEnvio(base) : base;
      });
    }
    if (rec) { setModal(null); if (enviar) alert(`✓ ${rec.folio} enviada al ${etiquetaCorte(rec.corte).titulo}.\nLlegada estimada a obra: ${fmtDiaCorto(llegadaEstimada(rec.corte, cfg).desde)} – ${fmtDiaCorto(llegadaEstimada(rec.corte, cfg).hasta)}.`); }
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
      rec = await crearEn("sp-cotizaciones", setCotizaciones, (arr) => marcar({ id: uid(), folio: siguienteFolio(arr, "CTZ", new Date(ahoraISO).getFullYear()), requestId: f.lineas[0]?.requestId || "", projectCode: f.projectCode, provider: f.provider, providerId: f.providerId || "", numeroProveedor: f.numeroProveedor || "", condicionPago: f.condicionPago || "contado", incluyeISV: f.incluyeISV !== false, totalDeclarado: f.totalDeclarado, pdfFile: f.pdfFile || null, notas: f.notas || "", lineas: f.lineas, estado: "borrador", createdAt: ahoraISO, creadaPor: userKey, audit: [auditEntry("creada", "Borrador de cotización")] }));
    }
    if (!rec) return;
    // Al ENVIAR, las líneas de la solicitud pasan a "cotizada" (por solicitud, una escritura cada una).
    if (enviar) {
      const porSol = {};
      rec.lineas.forEach(l => { (porSol[l.requestId] = porSol[l.requestId] || []).push(l.requestLineId); });
      for (const [solId, ids] of Object.entries(porSol)) await accionLineas(solId, ids, "cotizar", { quoteId: rec.id }, `Cotizada en ${rec.folio} (${rec.provider})`);
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
      const [cotsC, solsC, pursC, provsC, ccC] = await Promise.all([store.getCloud("sp-cotizaciones"), store.getCloud("sp-solicitudes"), store.getCloud("cp-purchases"), store.getCloud("cp-providers"), store.getCloud("cc-config")]);
      const cots = Array.isArray(cotsC) ? cotsC : [], sols = Array.isArray(solsC) ? solsC : [], purs = Array.isArray(pursC) ? pursC : [], provs = Array.isArray(provsC) ? provsC : [];
      const cot = cots.find(x => x.id === q.id);
      if (!cot || cot.estado !== "enviada") { alert("La cotización ya no está por aprobar (alguien más la trabajó)."); return false; }
      const sol = sols.find(s => s.id === cot.requestId);
      if (!sol) { alert("La solicitud de esta cotización ya no existe."); return false; }
      const tasaC = num(ccC?.tasa) || TASA_DEFAULT;
      const lineaSolDe = (lid) => sols.flatMap(s => s.lineas || []).find(l => l.id === lid) || null;
      const ev = evaluarCotizacion({ cotizacion: cot, tasa: tasaC, cfg, partidaDe: (pid) => partidaDe(cot.projectCode, pid), lineaSolicitudDe: lineaSolDe });
      if (!ev.ok) { alert("La cotización tiene errores y no se puede aprobar:\n" + ev.errores.join("\n")); return false; }
      // Enriquecer las líneas con la partida (para los ítems del borrador).
      ev.lineas = ev.lineas.map(l => { const ls = lineaSolDe(l.requestLineId); const pa = ls ? partidaDe(cot.projectCode, ls.partidaId) : null; return { ...l, id: l.requestLineId, partidaId: ls?.partidaId || null, categoria: pa?.categoria || "", nombrePartida: pa?.nombre || ls?.descripcion || "", unidadPartida: pa?.unidad || ls?.unidad || "", solucion: pa?.solucion || "", fueraPresupuesto: !!ls?.fueraPresupuesto }; });
      const ahoraISO = new Date().toISOString();
      // 1) El BORRADOR en GeoShopping (idempotente: si ya existe uno de esta cotización, no se duplica).
      let purchase = purs.find(p => p.origenSupply?.quoteId === cot.id);
      if (!purchase) {
        const proveedor = provs.find(p => p.id === cot.providerId) || provs.find(p => p.name === cot.provider) || null;
        const armado = borradorDesdeCotizacion({ cotizacion: cot, evaluacion: ev, solicitud: sol, proveedor, proyecto: proyectoDe(cot.projectCode), aprobadoPor: userName, tasa: tasaC, cfg, hoy: hoyISO(), ahoraISO, id: uid(), codigo: siguienteCodigoCompra(purs, new Date(ahoraISO).getFullYear()) });
        purchase = armado.purchase;
        const ok = await store.set("cp-purchases", [...purs, purchase]);
        if (!ok) { alert("No se pudo crear el borrador en GeoShopping. Nada se aprobó."); return false; }
        const back = await store.getCloud("cp-purchases");
        if (!Array.isArray(back) || !back.some(p => p.id === purchase.id)) { alert("VERIFICACIÓN FALLÓ: el borrador no quedó en la nube. Nada se aprobó."); return false; }
        setPurchases(back);
        // Proveedor nuevo → al maestro (best effort; Finanzas completa lo bancario).
        if (!proveedor && cot.provider) {
          try { const pv = await store.getCloud("cp-providers"); const arr = Array.isArray(pv) ? pv : []; if (!arr.some(p => p.name === cot.provider)) { await store.set("cp-providers", [...arr, { id: uid(), name: cot.provider, rtn: "", phones: [], contactName: "", contactEmail: "", notes: `Creado desde GeoSupply (${cot.folio}) — completar datos.`, bankAccounts: [], autoImported: true, createdAt: ahoraISO, updatedAt: ahoraISO }]); } } catch (e) { console.warn("[GeoSupply] proveedor nuevo no se guardó:", e); }
        }
      }
      // 2) Las líneas de la solicitud: cantidad comprada + estado.
      let lineas = sol.lineas || []; const aud = [];
      cot.lineas.forEach(cl => {
        const l = lineas.find(x => x.id === cl.requestLineId); if (!l) return;
        const r = aplicarAccionLinea(l, "aprobar_cot", { quoteId: cot.id, cantidad: num(cl.cantidad) });
        if (!r.ok) return;
        lineas = lineas.map(x => x.id === l.id ? r.linea : x);
        aud.push(auditEntry("aprobar_cot", `${l.descripcion}: aprobada en ${cot.folio} → ${purchase.codigo}`, { lineaId: l.id, de: l.estado, a: r.linea.estado }));
      });
      const sol2 = { ...sol, lineas, estado: estadoCabecera({ ...sol, lineas }), audit: [...(sol.audit || []), ...aud], updatedAt: ahoraISO };
      const okS = await store.set("sp-solicitudes", sols.map(s => s.id === sol.id ? sol2 : s));
      if (!okS) { alert(`El borrador ${purchase.codigo} se creó pero la solicitud no se actualizó. Volvé a aprobar: no se duplica.`); return false; }
      // 3) La cotización: aprobada, con la tasa usada y el borrador que generó.
      const cot2 = { ...cot, estado: "aprobada", aprobadoPor: userName, aprobadoAt: ahoraISO, comentario: comentario || "", tasaCambioUsada: tasaC, purchaseId: purchase.id, purchaseCodigo: purchase.codigo, evaluacion: { lineas: ev.lineas, suma: ev.suma, peor: ev.peor, todasVerdes: ev.todasVerdes }, avisos: purchase.origenSupply?.avisos || [], audit: [...(cot.audit || []), auditEntry("aprobada", `Aprobada → borrador ${purchase.codigo} en GeoShopping${comentario ? ` · ${comentario}` : ""}`)], updatedAt: ahoraISO };
      const okC = await store.set("sp-cotizaciones", cots.map(x => x.id === cot.id ? cot2 : x));
      if (!okC) { alert(`El borrador ${purchase.codigo} se creó pero la cotización no se marcó. Volvé a aprobar: no se duplica.`); return false; }
      const [bs, bc] = await Promise.all([store.getCloud("sp-solicitudes"), store.getCloud("sp-cotizaciones")]);
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
    almacen: lineasEf.filter(x => x.ef.estado === "revision_almacen").length,
    porCotizar: lineasEf.filter(x => x.ef.estado === "por_cotizar").length,
    cotizadas: cotEnviadas.length,
    devueltas: cotizaciones.filter(q => q.estado === "devuelta").length,
    delCorte: activas.filter(s => s.corte && s.corte.anio === corte.anio && s.corte.semana === corte.semana).length,
    fueraCorte: activas.filter(s => fueraDeCorte(s, cfg, ahora)).length,
  };
  const faltanViernes = lineasEf.filter(x => !LINEA_TERMINAL.includes(x.ef.estado)).length;
  const purchaseDeLinea = (l) => purchases.find(p => p.origenSupply && (l.quoteIds || []).concat(cotizaciones.filter(q => q.estado === "aprobada" && q.lineas?.some(x => x.requestLineId === l.id)).map(q => q.id)).includes(p.origenSupply.quoteId)) || null;
  const despachoEntregadoDe = (purchase) => !!purchase && despachos.some(d => d.sourcePurchaseId === purchase.id && d.estado !== "cancelado" && (d.estado === "entregado" || d.estado === "cerrado"));

  // ── Piezas de UI ──
  const stat = (v, l, { c, onClick } = {}) => <button key={l} onClick={onClick} disabled={!onClick} style={{ background: "transparent", border: "none", padding: isMobile ? "4px 10px" : "4px 18px", textAlign: "left", cursor: onClick ? "pointer" : "default", fontFamily: "inherit", borderRight: isMobile ? "none" : "1px solid rgba(44,42,40,.08)" }}>
    <div style={{ font: "800 22px/1 var(--display)", color: c || CHARCOAL, letterSpacing: "-.02em" }}>{v}</div>
    <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>{l}</div>
  </button>;
  const filaLinea = ({ s, l, ef, derecha, extra }) => {
    const al = alertasDeLinea(l, s);
    const sd = l.partidaId ? saldoDe(s.projectCode, l.partidaId, s.id) : null;
    return <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14, background: "rgba(255,255,255,.75)", border: "1px solid rgba(44,42,40,.07)", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--text-3)" }}>{s.folio}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{l.descripcion}</span>
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>· <b>{fmtCant(ef?.estado === "por_cotizar" ? pendienteDeCompra(l.estado === "revision_almacen" ? { ...l, aCotizar: l.cantidad } : l) : l.cantidad)}</b> {l.unidad}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>pidió {quien(s.residente)} · requerido <b>{fmtDiaCorto(s.fechaRequeridaObra)}</b>{s.corte ? ` · ${etiquetaCorte(s.corte).titulo}` : ""}</span>
          {al.map(a => <Chip key={a} c={a === "urgente" ? C_ROJO : C_AMARILLO}>{ALERTAS[a]}{a === "excede_saldo" && sd ? ` · saldo ${fmtCant(sd.saldo)}` : ""}</Chip>)}
          {ef?.sinRevisionAlmacen && <Chip c={C_AMARILLO}>Sin revisión de almacén</Chip>}
          {l.fueraPresupuesto && l.justificacion && <span style={{ fontSize: 11, color: "var(--text-2)", fontStyle: "italic" }}>"{l.justificacion}"</span>}
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
  const barraGrupos = (vista, grupos) => grupos.length > 1 && <div style={{ display: "flex", justifyContent: "flex-end" }}>{pillBtn(grupos.every(g => estaAbierto(vista, g.k)) ? "Compactar todo" : "Expandir todo", false, () => { const todos = grupos.every(g => estaAbierto(vista, g.k)); setAbiertos(prev => { const next = { ...prev }; grupos.forEach(g => { next[`${vista}:${g.k}`] = !todos; }); try { localStorage.setItem(`gt-supply-abiertos-${userKey}`, JSON.stringify(next)); } catch {} return next; }); })}</div>;

  // ═══════════════════════════ HOY ═══════════════════════════
  const renderHoy = () => {
    const hViernes = hitos[2];
    const ir = (id) => esCoordinador ? () => setSec(id) : undefined;
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
            <Btn small variant="success" disabled={ocupado} onClick={() => accionLinea(x.s.id, x.l.id, "aprobar_coord", {}, `${x.l.descripcion}: alerta aprobada → almacén`)}>Aprobar</Btn>
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
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gt-vidrio" style={{ padding: "12px 10px", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {stat(items.length, "ítems por revisar", { c: items.length ? ORANGE_DARK : undefined })}
        {stat(grupos.length, "proyectos")}
        <div style={{ padding: isMobile ? "4px 10px" : "4px 18px", marginLeft: isMobile ? 0 : "auto" }}>
          <div style={{ font: "800 15px/1.1 var(--display)", color: hAlm.pasado ? "var(--text-3)" : ORANGE_DARK }}>{hAlm.pasado ? "Plazo cerrado" : fmtFalta(hAlm.faltaMin)}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5, fontSize: 9 }}>revisión hasta {DIAS_CORTOS_[cfg.cortes.almacenHasta.dia]} {fmtHora(hAlm.hora)}</div>
        </div>
      </div>
      {items.length === 0 ? <Vacio>Nada por revisar en almacén.</Vacio> : <>
        {barraGrupos("almacen", grupos)}
        {grupos.map(g => <Grupo key={g.k} titulo={nombreProy(g.k)} sub={`${g.items.length} ${g.items.length === 1 ? "ítem" : "ítems"} · requerido desde ${fmtDiaCorto(g.minFecha)}`} abierto={estaAbierto("almacen", g.k)} onToggle={() => toggleGrupo("almacen", g.k)}
          derecha={puede && <Btn small variant="ghost" disabled={ocupado} onClick={async () => { if (!confirm(`¿Marcar "No hay" en los ${g.items.length} ítems de ${nombreProy(g.k)}? Pasan a Compras.`)) return; const porSol = {}; g.items.forEach(x => { (porSol[x.s.id] = porSol[x.s.id] || []).push(x.l.id); }); for (const [sid, ids] of Object.entries(porSol)) await accionLineas(sid, ids, "almacen_no_hay", {}, "Almacén: no hay (masivo del proyecto)"); }}>No hay nada de esto</Btn>}>
          {g.items.map(x => {
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
    const terminada = (s) => s.estado === "cancelada" || (estadoCabecera(s) === "completada" && (s.lineas || []).every(l => l.estado !== "comprada" || despachoEntregadoDe(purchaseDeLinea(l))));
    const visibles = base
      .filter(s => solVista === "todas" ? true : solVista === "abiertas" ? !terminada(s) : terminada(s))
      .filter(s => !solProy || s.projectCode === solProy)
      .filter(s => !solQ || `${s.folio} ${nombreProy(s.projectCode)} ${quien(s.residente)} ${(s.lineas || []).map(l => l.descripcion).join(" ")}`.toLowerCase().includes(solQ.toLowerCase()))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const proyectosConSol = [...new Set(base.map(s => s.projectCode))];
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {esResidente && <div className="gt-vidrio" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ font: "800 15px/1.1 var(--display)", color: CHARCOAL }}>{etq.titulo}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 4 }}>
            {hitos[0].pasado
              ? <>Lo que enviés ahora entra al <b>corte siguiente</b> (cierre {DIAS_SEMANA[cfg.cortes.cierreSolicitudes.dia]} {fmtHora(cfg.cortes.cierreSolicitudes.hora)}).</>
              : <>Enviá antes del <b>{DIAS_SEMANA[cfg.cortes.cierreSolicitudes.dia]} {fmtHora(cfg.cortes.cierreSolicitudes.hora)}</b> ({fmtFalta(hitos[0].faltaMin)}) · llega a obra <b>{fmtDiaCorto(llegada.desde)} – {fmtDiaCorto(llegada.hasta)}</b>.</>}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          {misProyectos.length === 0 ? <Chip c={C_AMARILLO}>Sin proyectos asignados — pedile acceso a Gerson</Chip> : <Btn onClick={() => setModal({ t: "solicitud" })}>+ Nueva solicitud</Btn>}
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
          const lleg = s.corte ? llegadaEstimada(s.corte, cfg) : null;
          return <div key={s.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setModal({ t: "detalle", id: s.id })} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: CHARCOAL }}>{s.folio}</div>
            {chipEstado(ESTADOS_SOLICITUD, est)}
            {s.urgente && <Chip c={C_ROJO}>Urgente</Chip>}
            {fc && <Chip c={C_ROJO}>Fuera de corte</Chip>}
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{nombreProy(s.projectCode)}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>{ls.length} {ls.length === 1 ? "ítem" : "ítems"}{ls.some(l => l.estado === "rechazada") ? ` · ${ls.filter(l => l.estado === "rechazada").length} rechazado(s)` : ""} · pidió {quien(s.residente)} · {s.corte ? etiquetaCorte(s.corte).titulo : "borrador"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: CHARCOAL }}>{s.fechaRequeridaObra ? fmtDiaCorto(s.fechaRequeridaObra) : "—"}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 3 }}>requerida en obra</div>
            </div>
            {lleg && est !== "completada" && est !== "cancelada" && <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C_AZUL.color }}>{fmtDiaCorto(lleg.desde)} – {fmtDiaCorto(lleg.hasta)}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 3 }}>llegada estimada</div>
            </div>}
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
    const lleg = s.corte ? llegadaEstimada(s.corte, cfg) : null;
    const cots = cotizaciones.filter(q => q.requestId === s.id);
    return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {chipEstado(ESTADOS_SOLICITUD, est)}{s.urgente && <Chip c={C_ROJO}>Urgente</Chip>}{fueraDeCorte(s, cfg, ahora) && <Chip c={C_ROJO}>Fuera de corte</Chip>}
        <span style={{ fontSize: 13, color: "var(--text-2)" }}><b>{nombreProy(s.projectCode)}</b> · pidió {quien(s.residente)} · {s.corte ? etiquetaCorte(s.corte).titulo : "sin enviar"}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        {[["Requerido en obra", s.fechaRequeridaObra ? fmtDiaLargo(s.fechaRequeridaObra) : "—"], ["Enviada", s.fechaEnvio ? fmtDT(s.fechaEnvio) : "—"], ["Llegada estimada", lleg ? `${fmtDiaCorto(lleg.desde)} – ${fmtDiaCorto(lleg.hasta)}` : "—"], ["Ítems", `${(s.lineas || []).length}`]].map(([l, v]) => <div key={l} style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(44,42,40,.04)" }}><div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9 }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL, marginTop: 4 }}>{v}</div></div>)}
      </div>
      {s.urgente && s.justificacionUrgencia && <div style={{ padding: "10px 14px", borderRadius: 12, background: C_ROJO.bg, color: C_ROJO.color, fontSize: 12.5 }}><b>Urgente:</b> {s.justificacionUrgencia}</div>}
      {s.notas && <div style={{ fontSize: 12.5, color: "var(--text-2)" }}><b>Notas:</b> {s.notas}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="gt-label" style={{ color: "var(--text-3)" }}>Dónde va cada ítem</div>
        {(s.lineas || []).map(l => {
          const ef = estadoEfectivoLinea(l, s, cfg, ahora);
          const pu = purchaseDeLinea(l);
          const paso = pasoDeLinea({ ...l, estado: ef.estado === "por_cotizar" && l.estado === "revision_almacen" ? "por_cotizar" : l.estado }, s, pu, despachoEntregadoDe(pu));
          const al = alertasDeLinea(l, s);
          return <div key={l.id} style={{ padding: "12px 14px", borderRadius: 14, background: l.estado === "rechazada" ? C_ROJO.bg : "rgba(255,255,255,.75)", border: "1px solid rgba(44,42,40,.08)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>{l.descripcion} <span style={{ fontWeight: 600, color: "var(--text-2)" }}>· {fmtCant(l.cantidad)} {l.unidad}</span></div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                  {chipEstado(ESTADOS_LINEA, l.estado === "rechazada" ? "rechazada" : ef.estado)}
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
              ? <div style={{ fontSize: 12.5, color: C_ROJO.color }}><b>Rechazado:</b> {l.motivoRechazo || "sin motivo"}</div>
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
        <Btn variant="dark" onClick={() => setModal(null)}>Cerrar</Btn>
      </div>
    </div>;
  };

  // ═══════════════════════════ APROBAR COTIZACIÓN (modal lado a lado) ═══════════════════════════
  const renderAprobar = (q0) => {
    const q = cotizaciones.find(x => x.id === q0.id) || q0;
    const s = solicitudes.find(x => x.id === q.requestId);
    const lineaSolDe = (lid) => (s?.lineas || []).find(l => l.id === lid) || null;
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
              <td style={{ padding: "10px", borderRadius: "12px 0 0 12px", verticalAlign: "top" }}><div style={{ fontWeight: 800, color: CHARCOAL }}>{ls?.descripcion || l.descripcion}</div><div style={{ color: "var(--text-3)", fontSize: 11.5 }}>{ls ? `${fmtCant(ls.cantidad)} ${ls.unidad} pedidos · ${fmtCant(l.pendiente ?? 0)} por comprar` : ""}{ls?.fueraPresupuesto ? " · fuera de presupuesto" : ""}</div></td>
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
          <Btn variant="success" disabled={ocupado || !ev.ok} title={ev.ok ? "Crea el borrador en GeoShopping" : ev.errores[0]} onClick={async () => { const pu = await aprobarCotizacion(q, com); if (pu) { setModal(null); alert(`✓ Aprobada. Borrador ${pu.codigo} creado en GeoShopping para que Finanzas lo envíe a Tesorería.${(pu.origenSupply?.avisos || []).length ? `\n\nAviso: ${pu.origenSupply.avisos.join("; ")}.` : ""}`); } }}>{ocupado ? "Aprobando…" : "Aprobar"}</Btn>
        </>}
      </div>
    </div>;
  };

  // ═══════════════════════════ DASHBOARD ═══════════════════════════
  const renderDashboard = () => {
    const cortes = [...new Set(solicitudes.filter(s => s.corte).map(s => etiquetaCorte(s.corte).id))].sort().reverse();
    const filtros = { projectCode: dashProy || undefined, corteId: dashCorte === "todos" ? undefined : dashCorte === "actual" ? etq.id : dashCorte };
    const m = metricasDashboard({ solicitudes, cotizaciones, purchases, despachos, cfg, ahora, filtros });
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
        {cortes.filter(c => c !== etq.id).slice(0, 6).map(c => pillBtn(c.replace(/^C0?(\d+)-(\d+)$/, "Corte $1 · $2"), dashCorte === c, () => setDashCorte(c), { key: c }))}
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

  // ═══════════════════════════ MODALES ═══════════════════════════
  const renderModal = () => {
    if (!modal) return null;
    const m = modal;
    switch (m.t) {
      case "solicitud": return <Modal title={m.s ? `Editar ${m.s.folio}` : "Nueva solicitud de material"} onClose={() => setModal(null)} wide fondoCierra={false}>
        <SolicitudFormImpl solicitud={m.s} proyectos={misProyectos} presDe={presDe} saldoDe={saldoDe} cfg={cfg} ahora={ahora} userKey={userKey} onGuardar={guardarSolicitud} onClose={() => setModal(null)} isMobile={isMobile} />
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
            onGuardar={(f, ev) => guardarCotizacion(f, ev, false)} onEnviar={async (f, ev) => { await materializarSinRevision(f.lineas); await guardarCotizacion(f, ev, true); }} onClose={() => setModal(null)} subirPdf={subirPdf} verArchivo={verArchivo} />
        </Modal>;
      }
      case "aprobar": return <Modal title={`${m.q.folio} — ${m.q.provider}`} onClose={() => setModal(null)} size="xl">{renderAprobar(m.q)}</Modal>;
      default: return null;
    }
  };

  // ═══════════════════════════ ROOT ═══════════════════════════
  if (!rol) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", color: "#6E6862", fontSize: 13 }}>Este usuario no tiene acceso a GeoSupply.</div>;
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", fontFamily: "inherit", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoSupply…</div>;
  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
  const secOk = nav.some(x => x.id === sec) ? sec : nav[0]?.id;
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
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{ROL_LABEL[rol] || ROLE_LABEL[userRole] || userRole}</div>
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
