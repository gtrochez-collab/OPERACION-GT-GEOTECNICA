// =====================================================================
// CONTRATISTAS DE SERVICIOS — El Salvador (13-nov-2026, pedido de Gerson:
// "vamos a ocupar hacer toda asistencia, la de los contratistas y la de
// los permanentes; desde la asistencia nace la planilla").
// GeoTeam → Asistencia → Contratistas. Dos vistas:
//   · Asistencia de la quincena: una fila por CONTRATO (una persona puede
//     tener varios: Carlos Pérez = vigilancia + asistencia vial) con los días
//     de la quincena (tocar: 1 → ½ → 2 → 0 → vacío) y sus horas extra; los de
//     pago por UNIDAD (el perforista) llevan la cantidad. Abajo, la
//     estimación: suma global − 10 % de ISR = líquido, con PDF y Excel
//     calcados de la "Estimación de Pago Contratistas de Servicios".
//   · Contratistas: la lista con sus datos de pago y sus contratos.
// Lógica pura en contratistas-calc.js (con pruebas). Se guarda con mezcla a
// tres vías + verificación; el borrador vive en localStorage hasta guardar.
// =====================================================================
import { useState, useEffect, useMemo, useCallback } from "react";
import { store } from "./supabase.js";
import { hoyISO } from "./fechas.js";
import { MONEDA, DOC_ID } from "./operacion.js";
import { esFeriado, nombreFeriado } from "./holidays.js";
import { Modal, ORANGE, ORANGE_DARK, CHARCOAL, uid, useIsMobile } from "./geocost-ui.jsx";
import { abrirReporte, reporteHTML, rKpis, rTabla, escHTML, libroExcel, hojaExcel, descargarExcel } from "./reporte-estilo.js";
import {
  KEY_CONTRATISTAS, keyAsistContrat, diasQuincena, quincenaDeFecha, liquidarContrato, estimacionQuincena,
  ponerDia, ponerHoras, ponerPorDia, ponerCampo, mezclarAsistencia, validarContratista, formatoDui, valorHoraDe, servicioDe, RETENCION_ISR,
} from "./contratistas-calc.js";

const fmt$ = (n) => MONEDA + " " + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n) => { const v = Number(n) || 0; return v % 1 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v); };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_C = ["D", "L", "M", "M", "J", "V", "S"];
const nombreQ = (p, q) => `${q === "1Q" ? "Primera" : "Segunda"} quincena de ${MESES[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}`;
const qAnterior = (p, q) => { if (q === "2Q") return { periodo: p, quincena: "1Q" }; const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return { periodo: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, quincena: "2Q" }; };
const qSiguiente = (p, q) => { if (q === "1Q") return { periodo: p, quincena: "2Q" }; const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m, 1)); return { periodo: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, quincena: "1Q" }; };
const diaSem = (iso) => new Date(iso + "T12:00:00Z").getUTCDay();
const CICLO = ["", 1, 0.5, 2, 0];
const siguienteValor = (v) => CICLO[(CICLO.indexOf(v === undefined ? "" : v) + 1) % CICLO.length];
const textoDia = (v) => v === "" || v == null ? "" : v === 0.5 ? "½" : String(v);
const LBL = { fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" };
const CTRL = { minHeight: 40, padding: "8px 11px", borderRadius: 11, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.9)", fontSize: 14, fontFamily: "inherit", color: CHARCOAL, width: "100%", boxSizing: "border-box", outline: "none" };
const btn = (primario) => ({ minHeight: 38, padding: "9px 16px", borderRadius: 999, border: primario ? "none" : "1px solid rgba(44,42,40,.14)", background: primario ? ORANGE : "rgba(255,255,255,.8)", color: primario ? "#fff" : "#5C5853", font: "700 13px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" });
const pill = (on) => ({ padding: "8px 14px", borderRadius: 999, border: "none", background: on ? CHARCOAL : "rgba(44,42,40,.06)", color: on ? "#fff" : "#5C5853", font: "700 12.5px/1 var(--sans)", cursor: "pointer" });
const draftKey = (p, q) => `gt-contrat-draft-sv-${p}-${q}`;
// Mismos estilos que la hoja de asistencia de GeoTeam (TH_H / TD_H / PAL_CELDA de HRModule).
const TH_H = { padding: "8px 10px", textAlign: "left", color: "#6E6862", fontWeight: 700, borderBottom: "1px solid rgba(44,42,40,.08)", whiteSpace: "nowrap", fontSize: 11 };
const TD_H = { padding: "6px 10px", color: "#2C2A28", whiteSpace: "nowrap" };
const PAL = {
  presente: { bg: "#DCF3E4", fg: "#177243" }, descanso: { bg: "#F1F0ED", fg: "#8B847C" }, nsp: { bg: "#F7DEDC", fg: "#B03024" },
  inc: { bg: "#FBEFC4", fg: "#8A5A00" }, extra: { bg: "#FBE3D0", fg: "#A94E16" },
};

// ── Form del contratista (a nivel de módulo: no se remonta al teclear) ──
const contratoVacio = () => ({ id: uid(), codigo: "", servicio: "", rol: "", proyecto: "", modo: "dia", unidad: "", tarifa: "", valorHora: "", activo: true });
export function ContratistaForm({ inicial, todos, proyectos = [], onGuardar, onCancelar, guardando }) {
  const [f, setF] = useState(() => inicial ? JSON.parse(JSON.stringify(inicial)) : { id: uid(), nombre: "", dui: "", telefono: "", correo: "", direccion: "", banco: { nombre: "", cuenta: "", nota: "" }, activo: true, contratos: [contratoVacio()] });
  const [err, setErr] = useState("");
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const uc = (id, k, v) => setF(p => ({ ...p, contratos: p.contratos.map(c => c.id === id ? { ...c, [k]: v } : c) }));
  const guardar = () => {
    const limpio = { ...f, nombre: f.nombre.trim().toUpperCase(), contratos: (f.contratos || []).filter(c => c.servicio.trim() || Number(c.tarifa) > 0).map(c => ({ ...c, tarifa: Number(c.tarifa) || 0, valorHora: c.valorHora === "" ? "" : Number(c.valorHora) || 0 })) };
    const e = validarContratista(limpio, todos);
    if (e) { setErr(e); return; }
    onGuardar(limpio);
  };
  const campo = (lab, k, props = {}) => <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>{lab}</span><input value={f[k] || ""} onChange={e => u(k, e.target.value)} style={CTRL} {...props} /></label>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
      {campo("Nombre completo *", "nombre")}
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>{DOC_ID}</span><input value={f.dui || ""} onChange={e => u("dui", formatoDui(e.target.value))} placeholder="03938537-2" inputMode="numeric" style={{ ...CTRL, fontFamily: "var(--mono)" }} /></label>
      {campo("Teléfono", "telefono", { inputMode: "tel" })}
      {campo("Correo", "correo", { type: "email" })}
    </div>
    {campo("Dirección completa", "direccion")}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Banco</span><input value={f.banco?.nombre || ""} onChange={e => u("banco", { ...(f.banco || {}), nombre: e.target.value })} placeholder="BAC, Banco Agrícola…" style={CTRL} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Cuenta</span><input value={f.banco?.cuenta || ""} onChange={e => u("banco", { ...(f.banco || {}), cuenta: e.target.value })} style={{ ...CTRL, fontFamily: "var(--mono)" }} /></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Nota de la cuenta</span><input value={f.banco?.nota || ""} onChange={e => u("banco", { ...(f.banco || {}), nota: e.target.value })} placeholder="ej. cuenta de Domingo Cruz" style={CTRL} /></label>
    </div>
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>Contratos</span>
        <button type="button" onClick={() => u("contratos", [...(f.contratos || []), contratoVacio()])} style={{ ...btn(false), minHeight: 32, padding: "7px 12px", fontSize: 12 }}>+ Contrato</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(f.contratos || []).map(c => <div key={c.id} style={{ borderRadius: 14, background: "rgba(44,42,40,.035)", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Código</span><input value={c.codigo} onChange={e => uc(c.id, "codigo", e.target.value.toUpperCase())} placeholder="SVSERV26-002" style={{ ...CTRL, fontFamily: "var(--mono)" }} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "span 2" }}><span style={LBL}>Servicio *</span><input value={c.servicio} onChange={e => uc(c.id, "servicio", e.target.value)} placeholder="Servicio de vigilancia nocturna" style={CTRL} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Rol</span><input value={c.rol || ""} onChange={e => uc(c.id, "rol", e.target.value)} placeholder="Motorista" style={CTRL} /></label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Ubicación / proyecto</span>
            {proyectos.length
              ? <select value={c.proyecto || ""} onChange={e => uc(c.id, "proyecto", e.target.value)} style={CTRL}>
                <option value="">Sin ubicación</option>
                {proyectos.map(pr => <option key={pr.short} value={pr.short}>{pr.short}{pr.code && pr.code !== pr.short ? ` · ${pr.code}` : ""}</option>)}
                {c.proyecto && !proyectos.some(pr => pr.short === c.proyecto) && <option value={c.proyecto}>{c.proyecto}</option>}
              </select>
              : <input value={c.proyecto || ""} onChange={e => uc(c.id, "proyecto", e.target.value)} style={CTRL} />}</label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Se paga</span><select value={c.modo || "dia"} onChange={e => uc(c.id, "modo", e.target.value)} style={CTRL}><option value="dia">Por día</option><option value="unidad">Por unidad</option></select></label>
          {c.modo === "unidad" && <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Unidad</span><input value={c.unidad || ""} onChange={e => uc(c.id, "unidad", e.target.value)} placeholder="metro, sondeo…" style={CTRL} /></label>}
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>{c.modo === "unidad" ? `Tarifa por ${c.unidad || "unidad"} (${MONEDA}) *` : `Tarifa por día (${MONEDA}) *`}</span><input value={c.tarifa} onChange={e => uc(c.id, "tarifa", e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" style={{ ...CTRL, fontFamily: "var(--mono)" }} /></label>
          {c.modo !== "unidad" && <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Hora extra ({MONEDA})</span><input value={c.valorHora} onChange={e => uc(c.id, "valorHora", e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder={Number(c.tarifa) ? (Number(c.tarifa) / 8).toFixed(4) : "tarifa ÷ 8"} style={{ ...CTRL, fontFamily: "var(--mono)" }} /></label>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 40 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "#5C5853" }}><input type="checkbox" checked={c.activo !== false} onChange={e => uc(c.id, "activo", e.target.checked)} /> Activo</label>
            {(f.contratos || []).length > 1 && <button type="button" onClick={() => { if (confirm("¿Quitar este contrato?")) u("contratos", f.contratos.filter(x => x.id !== c.id)); }} style={{ border: "none", background: "none", color: "#B03024", cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>Quitar</button>}
          </div>
        </div>)}
      </div>
    </div>
    {err && <div style={{ color: "#B03024", fontSize: 13, fontWeight: 600 }}>{err}</div>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <button type="button" onClick={onCancelar} style={btn(false)}>Cancelar</button>
      <button type="button" disabled={guardando} onClick={guardar} style={{ ...btn(true), opacity: guardando ? .6 : 1 }}>{guardando ? "Guardando…" : "Guardar"}</button>
    </div>
  </div>;
}

// ── Reportes: Estimación de pago (PDF por HTML y Excel) ──
// Calcados de la "Estimación de Pago Contratistas de Servicios" de Roberto
// (Batch Q01 NOV.26): hoja PROVEEDORES SERVICIOS (detalle: código, nombre,
// proyecto/UG, rol, DUI, valor hora, tarifa, período, total entregado, suma por
// días, horas extra diurnas y nocturnas, suma global, ISR, líquido, comentarios)
// y hoja RESUMEN PARA PAGOS (con dirección, correo, teléfono, banco y cuenta).
const fechaCorta = (iso) => { const [y, m, d] = String(iso || "").split("-"); return d ? `${d}/${m}/${y}` : ""; };
const filasReporte = (est, { periodo, quincena, proyectos = [] } = {}) => {
  const ds = periodo ? diasQuincena(periodo, quincena) : [];
  return est.filas.map(f => {
    const pr = proyectos.find(x => x.short === f.contrato.proyecto);
    const porUnidad = f.contrato.modo === "unidad";
    return {
      codigo: f.contrato.codigo || "", nombre: f.persona.nombre, dui: f.persona.dui || "",
      proyecto: [pr?.code && pr.code !== pr.short ? pr.code : "", f.contrato.proyecto || ""].filter(Boolean).join(" "),
      rol: (f.contrato.rol || "").toUpperCase(), servicio: servicioDe(f.contrato),
      valorHora: porUnidad ? 0 : valorHoraDe(f.contrato), tarifa: f.tarifa,
      inicio: fechaCorta(ds[0]), fin: fechaCorta(ds[ds.length - 1]),
      entregado: porUnidad ? f.unidades : f.dias, unidadEntregado: porUnidad ? (f.contrato.unidad || "unidades") : "días",
      sumaDias: f.montoBase, precioHe: porUnidad ? 0 : valorHoraDe(f.contrato),
      heD: f.horasD, sumaHeD: f.montoHeD, heN: f.horasN, sumaHeN: f.montoHeN,
      suma: f.suma, retencion: f.retencion, liquido: f.liquido,
      detalle: porUnidad ? `${fmtN(f.unidades)} ${f.contrato.unidad || "unidades"}` : `${fmtN(f.dias)} días${f.horas ? ` + ${fmtN(f.horas)} h extra` : ""}`,
      direccion: f.persona.direccion || "", correo: f.persona.correo || "", telefono: f.persona.telefono || "",
      banco: f.persona.banco?.nombre || "", cuenta: [f.persona.banco?.cuenta, f.persona.banco?.nota ? `(${f.persona.banco.nota})` : ""].filter(Boolean).join(" "),
      comentario: (f.contrato.servicio || "").toUpperCase(),
    };
  });
};
export const estimacionPDF = (w, { periodo, quincena, est, elaboradoPor, proyectos = [] }) => {
  const filas = filasReporte(est, { periodo, quincena, proyectos });
  const n = (v) => v ? fmtN(v) : "—";
  const m$ = (v) => v ? fmt$(v) : "—";
  const cuerpo = rKpis([
    { label: "Contratos", valor: String(est.filas.length), mono: false },
    { label: "Personas", valor: String(est.personas), mono: false },
    { label: "Suma global", valor: fmt$(est.suma) },
    { label: `Retención ISR ${Math.round(RETENCION_ISR * 100)} %`, valor: fmt$(est.retencion), tono: "rojo" },
    { label: "Líquido a pagar", valor: fmt$(est.liquido), tono: "naranja" },
  ]) + `<h3 style="font:800 14px/1.2 var(--display, sans-serif);margin:22px 0 8px">Proveedores de servicios</h3>` + rTabla({
    columnas: [{ t: "Código / nombre" }, { t: "Proyecto / UG · rol" }, { t: "Tarifa", num: true }, { t: "Entregado", num: true }, { t: "Suma por días / obra", num: true }, { t: "HE diurnas", num: true }, { t: "HE nocturnas", num: true }, { t: "Valor hora", num: true }, { t: "Suma global", num: true }, { t: "ISR 10 %", num: true }, { t: "Líquido a pagar", num: true }],
    filas: filas.map(f => [`<span style="color:#8A847D;font-size:10px">${escHTML(f.codigo)}</span><br><b>${escHTML(f.nombre)}</b><br><span style="color:#8A847D;font-size:10px">${DOC_ID} ${escHTML(f.dui)}</span>`, `${escHTML(f.proyecto)}<br><span style="color:#8A847D;font-size:10px">${escHTML(f.rol)}</span>`, `${fmt$(f.tarifa)}<br><span style="color:#8A847D;font-size:10px">${f.unidadEntregado === "días" ? "por día" : "por " + escHTML(f.unidadEntregado)}</span>`, `${fmtN(f.entregado)}<br><span style="color:#8A847D;font-size:10px">${escHTML(f.unidadEntregado)}</span>`, fmt$(f.sumaDias), `${n(f.heD)}${f.heD ? `<br><span style="color:#8A847D;font-size:10px">${fmt$(f.sumaHeD)}</span>` : ""}`, `${n(f.heN)}${f.heN ? `<br><span style="color:#8A847D;font-size:10px">${fmt$(f.sumaHeN)}</span>` : ""}`, m$(f.precioHe), fmt$(f.suma), fmt$(f.retencion), `<b>${fmt$(f.liquido)}</b>`]),
    total: ["<b>SUMAS</b>", "", "", "", fmt$(filas.reduce((a, f) => a + f.sumaDias, 0)), fmt$(filas.reduce((a, f) => a + f.sumaHeD, 0)), fmt$(filas.reduce((a, f) => a + f.sumaHeN, 0)), "", fmt$(est.suma), fmt$(est.retencion), `<b>${fmt$(est.liquido)}</b>`],
  }) + `<h3 style="font:800 14px/1.2 var(--display, sans-serif);margin:22px 0 8px">Resumen para pagos</h3>` + rTabla({
    columnas: [{ t: "Nombre completo" }, { t: DOC_ID }, { t: "Servicio eventual" }, { t: "Suma global", num: true }, { t: "Retención ISR", num: true }, { t: "Líquido a pagar", num: true }, { t: "Dirección completa" }, { t: "Teléfono" }, { t: "Banco" }, { t: "Cuenta" }],
    filas: filas.map(f => [`<b>${escHTML(f.nombre)}</b>${f.correo ? `<br><span style="color:#8A847D;font-size:10px">${escHTML(f.correo)}</span>` : ""}`, escHTML(f.dui), escHTML(f.servicio), fmt$(f.suma), fmt$(f.retencion), `<b>${fmt$(f.liquido)}</b>`, `<span style="font-size:10px">${escHTML(f.direccion)}</span>`, escHTML(f.telefono), escHTML(f.banco), `<span style="font-size:10px">${escHTML(f.cuenta)}</span>`]),
    total: ["<b>TOTAL A PAGAR</b>", "", "", fmt$(est.suma), fmt$(est.retencion), `<b>${fmt$(est.liquido)}</b>`, "", "", "", ""],
  }) + `<div style="display:flex;justify-content:space-around;margin-top:46px;font-size:11px;color:#5B5650"><div style="text-align:center;min-width:220px;border-top:1px solid #2C2A28;padding-top:6px"><b>Elaborado por</b><br>${escHTML(elaboradoPor || "")}</div><div style="text-align:center;min-width:220px;border-top:1px solid #2C2A28;padding-top:6px"><b>Aprobado por</b></div></div>`;
  abrirReporte(w, reporteHTML({ titulo: "Estimación de pago · Contratistas de servicios", subtitulo: `${nombreQ(periodo, quincena)} · ${fechaCorta(diasQuincena(periodo, quincena)[0])} al ${fechaCorta(diasQuincena(periodo, quincena).slice(-1)[0])} · retención de ISR ${Math.round(RETENCION_ISR * 100)} %`, empresa: "subterra", cuerpo }));
};
export const estimacionExcel = async ({ periodo, quincena, est, proyectos = [] }) => {
  const wb = await libroExcel();
  const filas = filasReporte(est, { periodo, quincena, proyectos });
  const sum = (k) => Math.round(filas.reduce((a, f) => a + (Number(f[k]) || 0), 0) * 100) / 100;
  hojaExcel(wb, {
    nombre: "Proveedores servicios", titulo: "Planilla · Proveedores de servicios", subtitulo: `${nombreQ(periodo, quincena)} · ISR aplicable ${Math.round(RETENCION_ISR * 100)} %`,
    columnas: [{ t: "Código de contrato", key: "codigo", ancho: 15 }, { t: "Nombre completo", key: "nombre", ancho: 32 }, { t: "Proyecto / UG actual", key: "proyecto", ancho: 28 }, { t: "Rol", key: "rol", ancho: 16 }, { t: DOC_ID, key: "dui", ancho: 12 }, { t: "Valor hora", key: "valorHora", ancho: 11, formato: "lps3" }, { t: "Servicios diarios / obra", key: "tarifa", ancho: 13, formato: "lps" }, { t: "Inicio del período", key: "inicio", ancho: 12 }, { t: "Fin del período", key: "fin", ancho: 12 }, { t: "Total entregado", key: "entregado", ancho: 11, formato: "num2" }, { t: "Suma por días laborados", key: "sumaDias", ancho: 14, formato: "lps" }, { t: "Precio hora extra diurna", key: "precioHe", ancho: 12, formato: "lps3" }, { t: "Horas extras diurnas", key: "heD", ancho: 10, formato: "num2" }, { t: "Suma horas extras diurnas", key: "sumaHeD", ancho: 13, formato: "lps" }, { t: "Precio hora extra nocturna", key: "precioHe", ancho: 12, formato: "lps3" }, { t: "Horas extras nocturnas", key: "heN", ancho: 10, formato: "num2" }, { t: "Suma horas extras nocturnas", key: "sumaHeN", ancho: 13, formato: "lps" }, { t: "Suma global", key: "suma", ancho: 13, formato: "lps" }, { t: "Retención ISR aplicable", key: "retencion", ancho: 13, formato: "lps" }, { t: "Líquido a pagar", key: "liquido", ancho: 14, formato: "lps" }, { t: "Comentarios", key: "comentario", ancho: 34 }],
    filas, total: { nombre: "SUMAS", sumaDias: sum("sumaDias"), sumaHeD: sum("sumaHeD"), sumaHeN: sum("sumaHeN"), suma: est.suma, retencion: est.retencion, liquido: est.liquido },
  });
  hojaExcel(wb, {
    nombre: "Resumen para pagos", titulo: "Resumen para pagos · Contratistas de servicios", subtitulo: nombreQ(periodo, quincena),
    columnas: [{ t: "Nombre completo", key: "nombre", ancho: 32 }, { t: DOC_ID, key: "dui", ancho: 12 }, { t: "Servicio eventual", key: "servicio", ancho: 44 }, { t: "Suma global", key: "suma", ancho: 13, formato: "lps" }, { t: "Retención ISR", key: "retencion", ancho: 13, formato: "lps" }, { t: "Monto líquido a pagar", key: "liquido", ancho: 15, formato: "lps" }, { t: "Dirección completa", key: "direccion", ancho: 46 }, { t: "Correo electrónico", key: "correo", ancho: 28 }, { t: "Teléfono", key: "telefono", ancho: 12 }, { t: "Banco", key: "banco", ancho: 16 }, { t: "Cuenta", key: "cuenta", ancho: 30 }],
    filas, total: { nombre: "TOTAL A PAGAR", suma: est.suma, retencion: est.retencion, liquido: est.liquido },
  });
  await descargarExcel(wb, `Estimacion_Contratistas_${quincena}_${periodo}.xlsx`);
};

// ── Pantalla ──
export function ContratistasSV({ user, puedeEditar, soloAsistencia = false, soloLista = false, q: busqueda = "", proyectos = [], onVolver }) {
  // soloAsistencia: el PM (Edy) solo marca días y horas — no ve montos, ni la
  // lista de contratistas, ni exporta (eso es de RRHH / administración).
  const verMontos = !soloAsistencia;
  const isMobile = useIsMobile();
  const hoy = hoyISO();
  const [vista, setVista] = useState(soloLista ? "lista" : "asistencia");
  const [q, setQ] = useState(() => quincenaDeFecha(hoy));
  const [lista, setLista] = useState(null);
  const [base, setBase] = useState(null);     // la asistencia como vino de la nube
  const [local, setLocal] = useState(null);   // con mis cambios
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(null);     // {inicial} | null
  const [verInactivos, setVerInactivos] = useState(false);
  const [celdaHe, setCeldaHe] = useState(null);    // celda con el menú de horas extra abierto ("contrato|fecha")
  const key = keyAsistContrat(q.periodo, q.quincena);
  const fechas = useMemo(() => diasQuincena(q.periodo, q.quincena), [q]);

  const cargarLista = useCallback(async () => {
    try { const v = await store.getCloud(KEY_CONTRATISTAS); setLista(Array.isArray(v) ? v : []); }
    catch { setErr("No se pudo leer la lista de contratistas. Revisá la conexión."); setLista([]); }
  }, []);
  useEffect(() => { cargarLista(); }, [cargarLista]);
  useEffect(() => {
    let vivo = true;
    setBase(null); setLocal(null);
    (async () => {
      try {
        const v = await store.getCloud(key);
        if (!vivo) return;
        const b = v && typeof v === "object" ? v : { periodo: q.periodo, quincena: q.quincena, registros: {} };
        setBase(b);
        let d = null; try { d = JSON.parse(localStorage.getItem(draftKey(q.periodo, q.quincena)) || "null"); } catch { d = null; }
        setLocal(d && d.registros ? mezclarAsistencia(d.base || b, d, b) : b);
      } catch { if (vivo) { setErr("No se pudo leer la asistencia de la quincena. Revisá la conexión."); setBase({ registros: {} }); setLocal({ registros: {} }); } }
    })();
    return () => { vivo = false; };
  }, [key, q.periodo, q.quincena]);
  const sucio = !!(base && local && JSON.stringify(base.registros || {}) !== JSON.stringify(local.registros || {}));
  useEffect(() => {
    if (!base || !local) return;
    try { if (sucio) localStorage.setItem(draftKey(q.periodo, q.quincena), JSON.stringify({ ...local, base })); else localStorage.removeItem(draftKey(q.periodo, q.quincena)); } catch { /* sin espacio */ }
  }, [local, base, sucio, q.periodo, q.quincena]);

  const editar = (fn) => { if (!puedeEditar) return; setLocal(l => fn(l || { registros: {} })); };

  const guardarAsistencia = async () => {
    if (!sucio) return;
    setGuardando(true);
    try {
      for (let intento = 0; intento < 3; intento++) {
        const nube = await store.getCloud(key);
        const mezcla = { ...mezclarAsistencia(base, local, nube || { registros: {} }), periodo: q.periodo, quincena: q.quincena, updatedAt: new Date().toISOString(), updatedBy: user?.nombre || "" };
        const ok = await store.set(key, mezcla);
        if (!ok) throw new Error("set");
        const ver = await store.getCloud(key);
        if (ver && ver.updatedAt === mezcla.updatedAt) {
          setBase(ver); setLocal(ver);
          try { localStorage.removeItem(draftKey(q.periodo, q.quincena)); } catch { /* */ }
          return;
        }
      }
      alert("Se guardó, pero no pude confirmarlo. Volvé a abrir la quincena para revisar.");
    } catch {
      alert("No se pudo guardar la asistencia: la nube no responde. Tus cambios siguen en este navegador; intentá de nuevo.");
    } finally { setGuardando(false); }
  };

  const guardarContratista = async (p) => {
    setGuardando(true);
    try {
      const nube = await store.getCloud(KEY_CONTRATISTAS);
      const arr = Array.isArray(nube) ? nube : [];
      const ahora = new Date().toISOString();
      const existe = arr.some(x => x.id === p.id);
      const reg = existe ? { ...p, updatedAt: ahora, updatedBy: user?.nombre || "" } : { ...p, createdAt: ahora, createdBy: user?.nombre || "" };
      const next = existe ? arr.map(x => x.id === p.id ? reg : x) : [...arr, reg];
      if (!(await store.set(KEY_CONTRATISTAS, next))) throw new Error("set");
      const ver = await store.getCloud(KEY_CONTRATISTAS);
      if (!Array.isArray(ver) || !ver.some(x => x.id === p.id)) throw new Error("verify");
      setLista(ver); setForm(null);
    } catch { alert("No se pudo guardar el contratista. Revisá la conexión e intentá de nuevo."); }
    finally { setGuardando(false); }
  };

  if (!lista || !local) return <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", color: "#6E6862" }}>{err || "Cargando contratistas…"}</div>;

  const activos = lista.filter(p => p.activo !== false);
  const contratos = activos.flatMap(p => (p.contratos || []).filter(c => c.activo !== false).map(c => ({ p, c })));
  const est = estimacionQuincena(activos.map(p => ({ ...p, contratos: (p.contratos || []).filter(c => c.activo !== false) })), local);

  const cabecera = <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
    <button type="button" className="gt-circulo" onClick={() => { if (sucio && !confirm("Tenés cambios sin guardar en la asistencia (siguen guardados en este navegador). ¿Salir?")) return; onVolver(); }} aria-label="Atrás" style={{ width: 34, height: 34, fontSize: 15 }}>←</button>
    <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>Contratistas de servicios</div>
    <span style={{ fontSize: 12.5, color: "#6E6862" }}>{verMontos ? `se pagan por quincena · retención de ISR ${Math.round(RETENCION_ISR * 100)} %` : "días de servicio y horas extra de la quincena"}</span>
    <div style={{ flex: 1 }} />
    {verMontos && <div style={{ display: "flex", gap: 6 }}>
      <button type="button" style={pill(vista === "asistencia")} onClick={() => setVista("asistencia")}>Asistencia</button>
      <button type="button" style={pill(vista === "lista")} onClick={() => setVista("lista")}>Contratistas {activos.length}</button>
    </div>}
  </div>;

  const modal = form && <Modal title={form.inicial ? "Editar contratista" : "Nuevo contratista"} onClose={() => !guardando && setForm(null)} wide fondoCierra={false}>
    <ContratistaForm inicial={form.inicial} todos={lista} proyectos={proyectos} guardando={guardando} onCancelar={() => setForm(null)} onGuardar={guardarContratista} />
  </Modal>;

  if (vista === "lista" && verMontos) {
    const bq = String(busqueda || "").trim().toLowerCase();
    const mostrados = (verInactivos ? lista : activos).filter(p => !bq || `${p.nombre} ${p.dui} ${(p.contratos || []).map(c => `${c.codigo} ${c.servicio} ${c.rol}`).join(" ")}`.toLowerCase().includes(bq));
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!soloLista && cabecera}
      <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#5C5853", flex: 1 }}>{activos.length} contratistas · {contratos.length} contratos activos{soloLista ? " · la asistencia y la estimación de pago están en Asistencia → Contratistas" : ""}</span>
        {lista.length !== activos.length && <button type="button" style={pill(verInactivos)} onClick={() => setVerInactivos(v => !v)}>Ver inactivos</button>}
        {puedeEditar && <button type="button" style={btn(true)} onClick={() => setForm({ inicial: null })}>+ Contratista</button>}
      </div>
      {mostrados.length === 0 && <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>Todavía no hay contratistas.</div>}
      {mostrados.map(p => <div key={p.id} className="gt-vidrio" style={{ padding: isMobile ? 14 : "14px 18px", opacity: p.activo === false ? .6 : 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ font: "800 15px/1.25 var(--display)", color: CHARCOAL }}>{p.nombre}</div>
            <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 3 }}>{[p.dui && `${DOC_ID} ${p.dui}`, p.telefono, p.correo].filter(Boolean).join(" · ") || "Sin datos de contacto"}</div>
            <div style={{ fontSize: 12, color: "#8A847D", marginTop: 2 }}>{[p.banco?.nombre, p.banco?.cuenta, p.banco?.nota && `(${p.banco.nota})`].filter(Boolean).join(" · ") || "Sin cuenta bancaria"}</div>
          </div>
          {puedeEditar && <div style={{ display: "flex", gap: 6 }}>
            <button type="button" style={{ ...btn(false), minHeight: 32, padding: "7px 12px", fontSize: 12 }} onClick={() => setForm({ inicial: p })}>Editar</button>
            <button type="button" style={{ ...btn(false), minHeight: 32, padding: "7px 12px", fontSize: 12 }} onClick={() => { if (confirm(p.activo === false ? `¿Reactivar a ${p.nombre}?` : `¿Dar de baja a ${p.nombre}? No se borra: deja de salir en la asistencia.`)) guardarContratista({ ...p, activo: p.activo === false }); }}>{p.activo === false ? "Reactivar" : "Dar de baja"}</button>
          </div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {(p.contratos || []).map(c => <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", borderRadius: 12, background: "rgba(44,42,40,.04)", opacity: c.activo === false ? .55 : 1 }}>
            <span style={{ font: "600 11.5px/1 var(--mono)", color: "#8A847D" }}>{c.codigo || "Sin código"}</span>
            <span style={{ font: "700 13px/1.3 var(--sans)", color: CHARCOAL, flex: 1, minWidth: 160 }}>{servicioDe(c)}{c.rol ? <span style={{ fontWeight: 500, color: "#6E6862" }}> · {c.rol}</span> : null}</span>
            {c.proyecto && <span style={{ fontSize: 12, color: "#6E6862" }}>{c.proyecto}</span>}
            <span style={{ font: "700 12.5px/1 var(--sans)", color: CHARCOAL }}>{c.modo === "unidad" ? `${fmt$(c.tarifa)} / ${c.unidad || "unidad"}` : `${fmt$(c.tarifa)} / día · ${fmt$(valorHoraDe(c))} / h extra`}</span>
          </div>)}
        </div>
      </div>)}
      {modal}
    </div>;
  }

  // ── Asistencia de la quincena: MISMO formato que la hoja de asistencia de
  // GeoTeam (13-nov-2026, Gerson: "tal cual, literal, como la llenamos en
  // Honduras"): tarjeta con la leyenda, resumen por ubicación y una tabla por
  // ubicación con un renglón por contrato, los días en columnas (D y F en
  // naranja), "Todos presentes" y los totales a la derecha. Tocá la celda:
  // 1 → ½ → 2 → 0 → vacío; click derecho: horas extra de ese día.
  const reg = (id) => local.registros?.[id] || {};
  const ubicaciones = Object.entries(contratos.reduce((m, { c }) => { const u = c.proyecto || ""; m[u] = (m[u] || 0) + 1; return m; }, {})).sort((a, b) => String(a[0] || "~").localeCompare(String(b[0] || "~"), "es"));
  const gruposUbic = ubicaciones.map(([u]) => [u, contratos.filter(({ c }) => (c.proyecto || "") === u)]);
  const proyDe = (u) => proyectos.find(p => p.short === u);
  const dias = fechas.map(f => { const d = +f.slice(8), y = +f.slice(0, 4), m0 = +f.slice(5, 7) - 1; const fer = esFeriado(y, m0, d); return { fecha: f, day: d, dow: DIAS_C[diaSem(f)], isSun: diaSem(f) === 0, isHoliday: fer, holidayName: fer ? nombreFeriado(y, m0, d) : "" }; });
  const colorCelda = (v) => v === 1 ? PAL.presente : v === 0.5 ? PAL.inc : v === 2 ? PAL.extra : v === 0 ? PAL.nsp : null;
  // Contratistas: el servicio se da TODOS los días, domingos y feriados incluidos
  // (Excel de Roberto Q01 NOV.26: 15 días en una quincena de 15).
  const todosLlenos = (filas) => filas.every(({ c }) => c.modo === "unidad" || dias.every(d => (reg(c.id).dias || {})[d.fecha] !== undefined));
  const todosPresentes = (filas) => {
    const llenos = todosLlenos(filas);
    editar(l => filas.reduce((acc, { c }) => c.modo === "unidad" ? acc : dias.reduce((a2, d) => {
      const v = (a2.registros?.[c.id]?.dias || {})[d.fecha];
      if (llenos) return ponerDia(a2, c.id, d.fecha, "");
      return v === undefined ? ponerDia(a2, c.id, d.fecha, 1) : a2;
    }, acc), l));
  };
  const ant = qAnterior(q.periodo, q.quincena), sig = qSiguiente(q.periodo, q.quincena);
  const cambiarQ = (n) => { if (sucio && !confirm("Tenés cambios sin guardar (siguen en este navegador). ¿Cambiar de quincena?")) return; setCeldaHe(null); setQ(n); };
  const salir = () => { if (sucio && !confirm("Tenés cambios sin guardar en la asistencia (siguen guardados en este navegador). ¿Salir?")) return; onVolver(); };
  const nombreQc = `${q.quincena} ${MESES[+q.periodo.slice(5, 7) - 1].slice(0, 3)} ${q.periodo.slice(0, 4)}`;

  return <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 90 }}>
    {cabecera}
    <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="gt-circulo" onClick={() => cambiarQ(ant)} aria-label="Quincena anterior" style={{ width: 32, height: 32 }}>‹</button>
      <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, minWidth: 220, textAlign: "center" }}>{nombreQ(q.periodo, q.quincena)}</div>
      <button type="button" className="gt-circulo" onClick={() => cambiarQ(sig)} aria-label="Quincena siguiente" style={{ width: 32, height: 32 }}>›</button>
    </div>

    <div className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>{nombreQc} · Contratistas de servicios</div>
        <div style={{ fontSize: 12, color: "#6E6862", marginTop: 3 }}>Tocá una celda para cambiarla (1 → ½ → 2 → 0). Click derecho: horas extra de ese día (diurnas o nocturnas).{contratos.some(({ c }) => c.modo === "unidad") ? " El perforista lleva los metros de cada día (bitácora de Geo Ops)." : ""}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {[["1", "Servicio", PAL.presente], ["½", "Medio día", PAL.inc], ["2", "Doble", PAL.extra], ["0", "No vino", PAL.nsp], ["+h", "Horas extra", PAL.extra]].map(([k, l, c]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6E6862" }}><span style={{ minWidth: 22, textAlign: "center", padding: "2px 6px", borderRadius: 6, background: c.bg, color: c.fg, fontWeight: 800, fontSize: 10.5 }}>{k}</span>{l}</span>)}
      </div>
    </div>

    {contratos.length === 0 && <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>No hay contratos activos.{verMontos ? " Agregalos en la pestaña Contratistas." : ""}</div>}

    {gruposUbic.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
      {gruposUbic.map(([u, filas]) => {
        const personas = new Set(filas.map(({ p }) => p.id)).size;
        const dSum = filas.reduce((a, { c }) => a + liquidarContrato(c, reg(c.id)).dias, 0);
        const hSum = filas.reduce((a, { c }) => a + liquidarContrato(c, reg(c.id)).horas, 0);
        return <div key={u} className="gt-vidrio" style={{ padding: "11px 14px" }}>
          <div style={{ font: "800 13.5px/1.2 var(--display)", color: CHARCOAL }}>{u || "Sin ubicación"}</div>
          <div style={{ fontSize: 11, color: "#A39C92", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{proyDe(u)?.name || "Subterra El Salvador"}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 10, fontSize: 12, flexWrap: "wrap", color: "#6E6862" }}>
            <span><b style={{ color: CHARCOAL }}>{personas}</b> persona{personas !== 1 ? "s" : ""}</span>
            <span><b style={{ color: CHARCOAL }}>{fmtN(dSum)}</b> días</span>
            {hSum > 0 && <span><b style={{ color: CHARCOAL }}>{fmtN(hSum)}</b> h extra</span>}
          </div>
        </div>;
      })}
    </div>}

    {gruposUbic.map(([u, filas]) => {
      const llenos = todosLlenos(filas);
      return <div key={u} className="gt-vidrio" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", borderBottom: "1px solid rgba(44,42,40,.07)" }}>
          <span style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>{u || "Sin ubicación"} <span style={{ color: "#A39C92", fontWeight: 600, fontSize: 12.5 }}>{filas.length}</span></span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "#A39C92" }}>{proyDe(u)?.code || ""}</span>
            {puedeEditar && <button type="button" onClick={() => todosPresentes(filas)} style={{ minHeight: 30, padding: "5px 12px", borderRadius: 999, border: llenos ? "1px solid rgba(192,57,43,.3)" : "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.75)", color: llenos ? "#B03024" : CHARCOAL, font: "700 12px/1 var(--sans)", cursor: "pointer" }}>{llenos ? "Limpiar" : "Todos presentes"}</button>}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: "rgba(44,42,40,.025)" }}>
              <th style={{ ...TH_H, position: "sticky", left: 0, background: "#FAFAF9", zIndex: 2, minWidth: 190 }}>Contratista</th>
              {dias.map(d => <th key={d.fecha} title={d.isHoliday ? `Feriado: ${d.holidayName}` : ""} style={{ ...TH_H, textAlign: "center", minWidth: 32 }}>
                <div style={{ fontSize: 10, color: (d.isHoliday || d.isSun) ? "#A94E16" : "#A39C92", fontWeight: d.isHoliday ? 700 : 600 }}>{d.isHoliday ? "F" : d.dow}</div>{d.day}
              </th>)}
              <th style={{ ...TH_H, textAlign: "center" }}>Días / ML</th>
              <th style={{ ...TH_H, textAlign: "center" }}>HE diur.</th>
              <th style={{ ...TH_H, textAlign: "center" }}>HE noct.</th>
              {verMontos && <th style={{ ...TH_H, textAlign: "right" }}>Suma global</th>}
              {verMontos && <th style={{ ...TH_H, textAlign: "right" }}>Líquido</th>}
            </tr></thead>
            <tbody>{filas.map(({ p, c }) => {
              const r = reg(c.id), liq = liquidarContrato(c, r);
              return <tr key={c.id} style={{ borderBottom: "1px solid rgba(44,42,40,.06)" }}>
                <td style={{ ...TD_H, position: "sticky", left: 0, background: "#FAFAF9", zIndex: 1, fontWeight: 600, fontSize: 11 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>{p.nombre}</span>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600, color: "#A39C92", letterSpacing: 0.5 }}>{c.codigo || ""}{c.rol ? ` · ${c.rol.toUpperCase()}` : ""}{c.modo === "unidad" ? ` · ${(c.unidad || "UNIDAD").toUpperCase()} POR DÍA` : ""}</span>
                    {r.nota && <span title={r.nota} style={{ fontSize: 9.5, fontWeight: 500, color: "#A94E16", maxWidth: 220, whiteSpace: "normal", lineHeight: 1.25 }}>{r.nota}</span>}
                  </div>
                </td>
                {c.modo === "unidad"
                  ? dias.map(d => {
                    const u = (r.uni || {})[d.fecha];
                    return <td key={d.fecha} style={{ ...TD_H, padding: 2, textAlign: "center", border: "1px solid rgba(44,42,40,.06)", background: u ? PAL.presente.bg : "transparent", minWidth: 44 }}>
                      <input type="number" min="0" step="0.01" disabled={!puedeEditar} value={u ?? ""} placeholder="·" aria-label={`${c.unidad || "unidades"} del ${d.day}`}
                        onChange={e => editar(l => ponerPorDia(l, c.id, "uni", d.fecha, e.target.value === "" ? 0 : Math.max(0, Number(e.target.value))))}
                        style={{ width: 44, border: "none", background: "transparent", textAlign: "center", font: "700 11px/1 var(--mono)", color: PAL.presente.fg, outline: "none", padding: "6px 0" }} />
                    </td>;
                  })
                  : dias.map(d => {
                    const v = (r.dias || {})[d.fecha], hD = (r.he || {})[d.fecha] || 0, hN = (r.heN || {})[d.fecha] || 0;
                    const k = `${c.id}|${d.fecha}`, abierto = celdaHe === k;
                    const pc = colorCelda(v);
                    return <td key={d.fecha} title={d.isHoliday ? d.holidayName : "Click derecho: horas extra"}
                      onClick={() => puedeEditar && editar(l => ponerDia(l, c.id, d.fecha, siguienteValor(v)))}
                      onContextMenu={(ev) => { ev.preventDefault(); if (puedeEditar) setCeldaHe(abierto ? null : k); }}
                      style={{ ...TD_H, textAlign: "center", cursor: puedeEditar ? "pointer" : "default", background: pc ? pc.bg : "transparent", color: pc ? pc.fg : "#2C2A28", fontWeight: 700, userSelect: "none", minWidth: 32, border: "1px solid rgba(44,42,40,.06)", position: "relative", fontSize: 11.5 }}>
                      {textoDia(v) || <span style={{ color: "#D8D4CE" }}>·</span>}
                      {(hD > 0 || hN > 0) && <div style={{ fontSize: 8, color: "#A94E16", lineHeight: 1, fontWeight: 800, marginTop: 1 }}>{hD > 0 ? `+${fmtN(hD)}h` : ""}{hN > 0 ? `${hD > 0 ? " " : "+"}${fmtN(hN)}n` : ""}</div>}
                      {abierto && <div style={{ position: "absolute", top: "100%", left: 0, background: "#fff", border: "1px solid #CBD5E1", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,.15)", zIndex: 10, minWidth: 170, padding: 8, textAlign: "left" }} onClick={ev => ev.stopPropagation()}>
                        <div style={{ fontSize: 10.5, color: "#64748b", marginBottom: 6, fontWeight: 600 }}>Horas extra · {d.dow} {d.day}</div>
                        {[["he", "Diurnas", hD], ["heN", "Nocturnas", hN]].map(([campo, lab, actual]) => <div key={campo} style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: "#8A847D", fontWeight: 700, marginBottom: 4 }}>{lab}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {[0, 1, 2, 3, 4, 5, 6].map(n => <button key={n} type="button" onClick={() => { editar(l => ponerPorDia(l, c.id, campo, d.fecha, n)); }} style={{ minWidth: 28, padding: "5px 0", borderRadius: 6, border: "1px solid rgba(44,42,40,.12)", background: actual === n || (!actual && n === 0) ? "#FBE3D0" : "#fff", font: "700 11.5px/1 var(--sans)", cursor: "pointer" }}>{n}</button>)}
                          </div>
                          <input type="number" min="0" max="16" step="0.5" defaultValue={actual || ""} placeholder="Otra cantidad + Enter" onKeyDown={e => { if (e.key === "Enter") editar(l => ponerPorDia(l, c.id, campo, d.fecha, Math.max(0, Math.min(16, Number(e.currentTarget.value) || 0)))); }} style={{ marginTop: 4, width: "100%", boxSizing: "border-box", padding: "4px 8px", borderRadius: 6, border: "1px solid #CBD5E1", fontSize: 11.5 }} />
                        </div>)}
                        <button type="button" onClick={() => setCeldaHe(null)} style={{ width: "100%", marginTop: 2, padding: "6px 0", borderRadius: 6, border: "none", background: CHARCOAL, color: "#fff", font: "700 11.5px/1 var(--sans)", cursor: "pointer" }}>Listo</button>
                      </div>}
                    </td>;
                  })}
                <td style={{ ...TD_H, textAlign: "center", fontWeight: 800 }} title={c.modo === "unidad" && !Object.keys(r.uni || {}).length && r.unidades ? "Total de la quincena sin detalle por día" : ""}>{c.modo === "unidad" ? `${fmtN(liq.unidades)} ${c.unidad ? c.unidad.split(" ")[0] : ""}` : fmtN(liq.dias)}</td>
                <td style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: liq.horasD ? "#A94E16" : "#A39C92" }}>{c.modo === "unidad" ? "—" : fmtN(liq.horasD) || "0"}</td>
                <td style={{ ...TD_H, textAlign: "center", fontWeight: 700, color: liq.horasN ? "#A94E16" : "#A39C92" }}>{c.modo === "unidad" ? "—" : fmtN(liq.horasN) || "0"}</td>
                {verMontos && <td style={{ ...TD_H, textAlign: "right", fontWeight: 600 }}>{fmt$(liq.suma)}</td>}
                {verMontos && <td style={{ ...TD_H, textAlign: "right", fontWeight: 800 }}>{fmt$(liq.liquido)}</td>}
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>;
    })}

    {contratos.length > 0 && verMontos && <div className="gt-vidrio" style={{ padding: isMobile ? 14 : "14px 18px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, flex: 1, minWidth: 180 }}>Estimación de pago<div style={{ fontSize: 12, fontWeight: 500, color: "#6E6862", marginTop: 3 }}>{est.filas.length} contratos · {est.personas} personas · sale de esta asistencia</div></div>
      <div style={{ textAlign: "right" }}><div style={{ font: "700 14px/1 var(--sans)" }}>{fmt$(est.suma)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>suma global</div></div>
      <div style={{ textAlign: "right" }}><div style={{ font: "700 14px/1 var(--sans)", color: "#B03024" }}>−{fmt$(est.retencion)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>retención ISR</div></div>
      <div style={{ textAlign: "right" }}><div style={{ font: "800 19px/1 var(--display)", color: ORANGE_DARK }}>{fmt$(est.liquido)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>total a pagar</div></div>
    </div>}

    <div style={{ position: "sticky", bottom: 10, zIndex: 5, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
      {sucio && <span style={{ fontSize: 12.5, color: ORANGE_DARK, fontWeight: 600, marginRight: "auto", background: "rgba(255,255,255,.92)", padding: "6px 12px", borderRadius: 999 }}>Cambios sin guardar</span>}
      <button type="button" onClick={salir} style={{ minHeight: 44, padding: "10px 24px", borderRadius: 999, border: "none", background: "#EEEDEA", color: CHARCOAL, font: "700 14px/1 var(--sans)", cursor: "pointer" }}>Cerrar</button>
      {verMontos && <button type="button" disabled={!est.filas.length} onClick={() => estimacionExcel({ periodo: q.periodo, quincena: q.quincena, est, proyectos }).catch(() => alert("No se pudo generar el Excel."))} style={{ minHeight: 44, padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(44,42,40,.16)", background: "#fff", color: CHARCOAL, font: "700 14px/1 var(--sans)", cursor: "pointer" }}>Exportar Excel</button>}
      {verMontos && <button type="button" disabled={!est.filas.length} onClick={() => { const w = window.open("", "_blank"); estimacionPDF(w, { periodo: q.periodo, quincena: q.quincena, est, elaboradoPor: user?.nombre, proyectos }); }} style={{ minHeight: 44, padding: "10px 20px", borderRadius: 999, border: "1px solid rgba(44,42,40,.16)", background: "#fff", color: CHARCOAL, font: "700 14px/1 var(--sans)", cursor: "pointer" }}>Exportar PDF</button>}
      {puedeEditar && <button type="button" disabled={!sucio || guardando} onClick={guardarAsistencia} style={{ minHeight: 44, padding: "10px 26px", borderRadius: 999, border: "none", background: ORANGE, color: "#fff", font: "800 14px/1 var(--sans)", cursor: "pointer", opacity: !sucio || guardando ? .55 : 1, boxShadow: "0 8px 20px rgba(232,118,45,.28)" }}>{guardando ? "Guardando…" : "Guardar asistencia"}</button>}
    </div>
    {modal}
  </div>;
}
