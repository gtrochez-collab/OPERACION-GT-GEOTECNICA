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
import { Modal, ORANGE, ORANGE_DARK, CHARCOAL, uid, useIsMobile } from "./geocost-ui.jsx";
import { abrirReporte, reporteHTML, rKpis, rTabla, escHTML, libroExcel, hojaExcel, descargarExcel } from "./reporte-estilo.js";
import {
  KEY_CONTRATISTAS, keyAsistContrat, diasQuincena, quincenaDeFecha, liquidarContrato, estimacionQuincena,
  ponerDia, ponerHoras, ponerCampo, mezclarAsistencia, validarContratista, formatoDui, valorHoraDe, servicioDe, RETENCION_ISR,
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

// ── Form del contratista (a nivel de módulo: no se remonta al teclear) ──
const contratoVacio = () => ({ id: uid(), codigo: "", servicio: "", rol: "", proyecto: "", modo: "dia", unidad: "", tarifa: "", valorHora: "", activo: true });
export function ContratistaForm({ inicial, todos, onGuardar, onCancelar, guardando }) {
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
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Proyecto</span><input value={c.proyecto || ""} onChange={e => uc(c.id, "proyecto", e.target.value)} placeholder="SE-30-3-10 Estudio Sky Park" style={CTRL} /></label>
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
const filasReporte = (est) => est.filas.map(f => ({
  nombre: f.persona.nombre, dui: f.persona.dui || "", codigo: f.contrato.codigo || "",
  servicio: servicioDe(f.contrato).toUpperCase(), proyecto: f.contrato.proyecto || "",
  detalle: f.contrato.modo === "unidad" ? `${fmtN(f.unidades)} ${f.contrato.unidad || "unidades"}` : `${fmtN(f.dias)} días${f.horas ? ` + ${fmtN(f.horas)} h extra` : ""}`,
  suma: f.suma, retencion: f.retencion, liquido: f.liquido,
  direccion: f.persona.direccion || "", correo: f.persona.correo || "", telefono: f.persona.telefono || "",
  banco: f.persona.banco?.nombre || "", cuenta: [f.persona.banco?.cuenta, f.persona.banco?.nota ? `(${f.persona.banco.nota})` : ""].filter(Boolean).join(" "),
}));
export const estimacionPDF = (w, { periodo, quincena, est, elaboradoPor }) => {
  const filas = filasReporte(est);
  const cuerpo = rKpis([
    { label: "Contratos", valor: String(est.filas.length), mono: false },
    { label: "Personas", valor: String(est.personas), mono: false },
    { label: "Suma global", valor: fmt$(est.suma) },
    { label: `Retención ISR ${Math.round(RETENCION_ISR * 100)} %`, valor: fmt$(est.retencion), tono: "rojo" },
    { label: "Total a pagar", valor: fmt$(est.liquido), tono: "naranja" },
  ]) + rTabla({
    columnas: [{ t: "Nombre completo" }, { t: DOC_ID }, { t: "Servicio eventual" }, { t: "Detalle" }, { t: "Suma global", num: true }, { t: "Retención ISR", num: true }, { t: "Líquido a pagar", num: true }, { t: "Dirección" }, { t: "Teléfono" }, { t: "Banco" }, { t: "Cuenta" }],
    filas: filas.map(f => [`<b>${escHTML(f.nombre)}</b>${f.correo ? `<br><span style="color:#8A847D;font-size:10px">${escHTML(f.correo)}</span>` : ""}`, escHTML(f.dui), `${escHTML(f.servicio)}${f.codigo ? `<br><span style="color:#8A847D;font-size:10px">${escHTML(f.codigo)}${f.proyecto ? ` · ${escHTML(f.proyecto)}` : ""}</span>` : ""}`, escHTML(f.detalle), fmt$(f.suma), fmt$(f.retencion), `<b>${fmt$(f.liquido)}</b>`, `<span style="font-size:10px">${escHTML(f.direccion)}</span>`, escHTML(f.telefono), escHTML(f.banco), `<span style="font-size:10px">${escHTML(f.cuenta)}</span>`]),
    total: ["<b>TOTAL A PAGAR</b>", "", "", "", fmt$(est.suma), fmt$(est.retencion), `<b>${fmt$(est.liquido)}</b>`, "", "", "", ""],
  }) + `<div style="display:flex;justify-content:space-around;margin-top:46px;font-size:11px;color:#5B5650"><div style="text-align:center;min-width:220px;border-top:1px solid #2C2A28;padding-top:6px"><b>Elaborado por</b><br>${escHTML(elaboradoPor || "")}</div><div style="text-align:center;min-width:220px;border-top:1px solid #2C2A28;padding-top:6px"><b>Aprobado por</b></div></div>`;
  abrirReporte(w, reporteHTML({ titulo: "Estimación de pago · Contratistas de servicios", subtitulo: `${nombreQ(periodo, quincena)} · retención de ISR ${Math.round(RETENCION_ISR * 100)} %`, empresa: "subterra", cuerpo }));
};
export const estimacionExcel = async ({ periodo, quincena, est }) => {
  const wb = await libroExcel();
  const filas = filasReporte(est);
  hojaExcel(wb, {
    nombre: "Estimación", titulo: "Estimación de pago · Contratistas de servicios", subtitulo: nombreQ(periodo, quincena),
    columnas: [{ t: "Nombre completo", key: "nombre", ancho: 34 }, { t: DOC_ID, key: "dui", ancho: 13 }, { t: "Código", key: "codigo", ancho: 15 }, { t: "Servicio eventual", key: "servicio", ancho: 42 }, { t: "Proyecto", key: "proyecto", ancho: 26 }, { t: "Detalle", key: "detalle", ancho: 20 }, { t: "Suma global", key: "suma", ancho: 14, formato: "lps" }, { t: "Retención ISR", key: "retencion", ancho: 14, formato: "lps" }, { t: "Líquido a pagar", key: "liquido", ancho: 15, formato: "lps" }, { t: "Dirección completa", key: "direccion", ancho: 46 }, { t: "Correo", key: "correo", ancho: 28 }, { t: "Teléfono", key: "telefono", ancho: 12 }, { t: "Banco", key: "banco", ancho: 16 }, { t: "Cuenta", key: "cuenta", ancho: 30 }],
    filas, total: { nombre: "TOTAL A PAGAR", suma: est.suma, retencion: est.retencion, liquido: est.liquido },
  });
  await descargarExcel(wb, `Estimacion_Contratistas_${quincena}_${periodo}.xlsx`);
};

// ── Pantalla ──
export function ContratistasSV({ user, puedeEditar, soloAsistencia = false, onVolver }) {
  // soloAsistencia: el PM (Edy) solo marca días y horas — no ve montos, ni la
  // lista de contratistas, ni exporta (eso es de RRHH / administración).
  const verMontos = !soloAsistencia;
  const isMobile = useIsMobile();
  const hoy = hoyISO();
  const [vista, setVista] = useState("asistencia");
  const [q, setQ] = useState(() => quincenaDeFecha(hoy));
  const [lista, setLista] = useState(null);
  const [base, setBase] = useState(null);     // la asistencia como vino de la nube
  const [local, setLocal] = useState(null);   // con mis cambios
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(null);     // {inicial} | null
  const [verInactivos, setVerInactivos] = useState(false);
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
    <ContratistaForm inicial={form.inicial} todos={lista} guardando={guardando} onCancelar={() => setForm(null)} onGuardar={guardarContratista} />
  </Modal>;

  if (vista === "lista" && verMontos) {
    const mostrados = verInactivos ? lista : activos;
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {cabecera}
      <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#5C5853", flex: 1 }}>{activos.length} contratistas · {contratos.length} contratos activos</span>
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

  // ── Asistencia de la quincena ──
  const reg = (id) => local.registros?.[id] || {};
  const cel = { width: isMobile ? 30 : 34, minWidth: isMobile ? 30 : 34, height: 30, borderRadius: 8, border: "1px solid rgba(44,42,40,.10)", font: "700 12.5px/1 var(--sans)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" };
  const colorDia = (v) => v === 1 ? { background: "rgba(62,142,90,.14)", color: "#1F6B3C" } : v === 0.5 ? { background: "rgba(232,118,45,.14)", color: ORANGE_DARK } : v === 2 ? { background: "rgba(31,79,140,.12)", color: "#1F4F8C" } : v === 0 ? { background: "rgba(192,57,43,.10)", color: "#B03024" } : { background: "rgba(255,255,255,.85)", color: "#A39C92" };
  const todosVinieron = (id) => editar(l => fechas.reduce((acc, f) => diaSem(f) === 0 ? acc : ponerDia(acc, id, f, (acc.registros?.[id]?.dias || {})[f] ?? 1), l));
  const ant = qAnterior(q.periodo, q.quincena), sig = qSiguiente(q.periodo, q.quincena);
  const cambiarQ = (n) => { if (sucio && !confirm("Tenés cambios sin guardar (siguen en este navegador). ¿Cambiar de quincena?")) return; setQ(n); };

  return <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 90 }}>
    {cabecera}
    <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button type="button" className="gt-circulo" onClick={() => cambiarQ(ant)} aria-label="Quincena anterior" style={{ width: 32, height: 32 }}>‹</button>
      <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, minWidth: 220, textAlign: "center" }}>{nombreQ(q.periodo, q.quincena)}</div>
      <button type="button" className="gt-circulo" onClick={() => cambiarQ(sig)} aria-label="Quincena siguiente" style={{ width: 32, height: 32 }}>›</button>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11.5, color: "#8A847D" }}>Tocá el día: 1 · ½ · 2 (doble) · 0 (no vino) · vacío</span>
    </div>
    {contratos.length === 0 && <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", color: "#6E6862", fontSize: 13.5 }}>No hay contratos activos. Agregalos en la pestaña Contratistas.</div>}
    {contratos.map(({ p, c }) => {
      const r = reg(c.id), liq = liquidarContrato(c, r);
      return <div key={c.id} className="gt-vidrio" style={{ padding: isMobile ? 12 : "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ font: "800 14.5px/1.25 var(--display)", color: CHARCOAL }}>{p.nombre}</div>
            <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 2 }}>{servicioDe(c)}{c.codigo ? ` · ${c.codigo}` : ""}{c.proyecto ? ` · ${c.proyecto}` : ""}</div>
            {verMontos && <div style={{ fontSize: 11.5, color: "#8A847D", marginTop: 2 }}>{c.modo === "unidad" ? `${fmt$(c.tarifa)} por ${c.unidad || "unidad"}` : `${fmt$(c.tarifa)} por día · hora extra ${fmt$(valorHoraDe(c))}`}</div>}
          </div>
          <div style={{ display: "flex", gap: 16, textAlign: "right", flexWrap: "wrap" }}>
            <div><div style={{ font: "700 13.5px/1 var(--sans)", color: CHARCOAL }}>{c.modo === "unidad" ? `${fmtN(liq.unidades)} ${c.unidad || "u."}` : `${fmtN(liq.dias)} d${liq.horas ? ` · ${fmtN(liq.horas)} h` : ""}`}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>servicio</div></div>
            {verMontos && <><div><div style={{ font: "700 13.5px/1 var(--sans)", color: CHARCOAL }}>{fmt$(liq.suma)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>suma global</div></div>
            <div><div style={{ font: "700 13.5px/1 var(--sans)", color: liq.retencion ? "#B03024" : "#A39C92" }}>{liq.retencion ? `−${fmt$(liq.retencion)}` : "—"}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>ISR 10 %</div></div>
            <div><div style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>{fmt$(liq.liquido)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>líquido</div></div></>}
          </div>
        </div>
        {c.modo === "unidad"
          ? <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <span style={LBL}>{(c.unidad || "Unidades").replace(/^\w/, x => x.toUpperCase())} en la quincena</span>
            <input type="number" min="0" step="0.5" disabled={!puedeEditar} value={r.unidades ?? ""} placeholder="0" onChange={e => editar(l => ponerCampo(l, c.id, "unidades", e.target.value === "" ? undefined : Math.max(0, Number(e.target.value))))} style={{ ...CTRL, width: 110, fontFamily: "var(--mono)" }} />
            <input disabled={!puedeEditar} value={r.nota || ""} placeholder="Nota (ej. sondeos 1 a 3)" onChange={e => editar(l => ponerCampo(l, c.id, "nota", e.target.value || undefined))} style={{ ...CTRL, flex: 1, minWidth: 180 }} />
          </div>
          : <div style={{ overflowX: "auto", marginTop: 12, paddingBottom: 4 }}>
            <div style={{ display: "inline-grid", gridTemplateColumns: `64px repeat(${fechas.length}, auto)`, gap: 4, alignItems: "center" }}>
              <span />
              {fechas.map(f => <span key={f} style={{ textAlign: "center", font: "600 10px/1.2 var(--sans)", color: diaSem(f) === 0 ? ORANGE_DARK : "#8A847D" }}>{DIAS_C[diaSem(f)]}<br />{+f.slice(8)}</span>)}
              <span style={{ ...LBL, fontSize: 10.5 }}>Días</span>
              {fechas.map(f => { const v = (r.dias || {})[f]; return <button key={f} type="button" disabled={!puedeEditar} onClick={() => editar(l => ponerDia(l, c.id, f, siguienteValor(v)))} style={{ ...cel, ...colorDia(v), cursor: puedeEditar ? "pointer" : "default" }}>{textoDia(v)}</button>; })}
              <span style={{ ...LBL, fontSize: 10.5 }}>H. extra</span>
              {fechas.map(f => { const h = (r.he || {})[f]; return <input key={f} type="number" min="0" step="0.5" disabled={!puedeEditar} value={h || ""} onChange={e => editar(l => ponerHoras(l, c.id, f, e.target.value === "" ? 0 : Math.max(0, Math.min(16, Number(e.target.value)))))} style={{ ...cel, padding: 0, textAlign: "center", fontFamily: "var(--mono)", fontSize: 11.5, background: h ? "rgba(232,118,45,.10)" : "rgba(255,255,255,.85)", color: CHARCOAL }} />; })}
            </div>
            {puedeEditar && <button type="button" onClick={() => todosVinieron(c.id)} style={{ marginTop: 8, border: "none", background: "none", color: ORANGE_DARK, font: "700 12px/1 var(--sans)", cursor: "pointer", padding: 0 }}>Marcar 1 en los días vacíos (menos domingos)</button>}
          </div>}
      </div>;
    })}
    {contratos.length > 0 && verMontos && <div className="gt-vidrio" style={{ padding: isMobile ? 14 : "14px 18px", display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, flex: 1, minWidth: 180 }}>Estimación de pago<div style={{ fontSize: 12, fontWeight: 500, color: "#6E6862", marginTop: 3 }}>{est.filas.length} contratos · {est.personas} personas</div></div>
      <div style={{ textAlign: "right" }}><div style={{ font: "700 14px/1 var(--sans)" }}>{fmt$(est.suma)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>suma global</div></div>
      <div style={{ textAlign: "right" }}><div style={{ font: "700 14px/1 var(--sans)", color: "#B03024" }}>−{fmt$(est.retencion)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>retención ISR</div></div>
      <div style={{ textAlign: "right" }}><div style={{ font: "800 19px/1 var(--display)", color: ORANGE_DARK }}>{fmt$(est.liquido)}</div><div className="gt-label" style={{ color: "#A39C92", fontSize: 8.5, marginTop: 4 }}>total a pagar</div></div>
    </div>}
    <div style={{ position: "sticky", bottom: 10, zIndex: 5, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", padding: 10, borderRadius: 18, background: "rgba(255,255,255,.92)", boxShadow: "0 10px 30px rgba(44,42,40,.12)" }}>
      {sucio && <span style={{ alignSelf: "center", fontSize: 12.5, color: ORANGE_DARK, fontWeight: 600, marginRight: "auto" }}>Cambios sin guardar</span>}
      {verMontos && <button type="button" disabled={!est.filas.length} style={btn(false)} onClick={() => estimacionExcel({ periodo: q.periodo, quincena: q.quincena, est }).catch(() => alert("No se pudo generar el Excel."))}>Excel</button>}
      {verMontos && <button type="button" disabled={!est.filas.length} style={btn(false)} onClick={() => { const w = window.open("", "_blank"); estimacionPDF(w, { periodo: q.periodo, quincena: q.quincena, est, elaboradoPor: user?.nombre }); }}>PDF</button>}
      {puedeEditar && <button type="button" disabled={!sucio || guardando} onClick={guardarAsistencia} style={{ ...btn(true), opacity: !sucio || guardando ? .55 : 1 }}>{guardando ? "Guardando…" : "Guardar asistencia"}</button>}
    </div>
    {modal}
  </div>;
}
