// ═══════════════════════════════════════════════════════════════════════════
// GeoFinance — Cajas chicas (27-nov-2026, pedido de Gerson)
// ═══════════════════════════════════════════════════════════════════════════
// El enlace entre Finanzas y el campo: el ingeniero pide su caja de la semana
// (compras varias y combustible son DOS cajas), Christian la aprueba y la Lic.
// Carolina la acredita con el comprobante. Desde que se pide queda abierta la
// cajita registradora: cada compra con su factura, que Contabilidad va
// validando sin esperar el paquete de cierre. La lógica vive en
// geofinance-calc.js; toda escritura va sobre la nube FRESCA (getCloud → fn →
// set → verify) y los archivos van a cp-file-<id>.
import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import Logo from "./Logo.jsx";
import { MOVIL_CSS, BarraMovil, BarraInferior, TituloMovil, PantallaCarga } from "./movil.jsx";
import { ORANGE, CHARCOAL, C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, useIsMobile, fmtL, fmtFechaHora, uid, Input, Textarea, Select, Btn, Chip, Modal } from "./geocost-ui.jsx";
import { VisorArchivo } from "./visor-archivo.jsx";
import { PROJECTS, admiteSolicitudes } from "./projects.js";
import { hoyISO } from "./fechas.js";
import { ROLE_LABEL } from "./users.js";
import {
  KEY_CAJAS, TIPOS_CAJA, ESTADOS_CAJA, PASOS_CAJA, permisosFinance, puedeAprobar, num, r2, semanaSugerida, cierreDeSemana, fueraDeCorte,
  opcionesSemana, textoSemana, gastosVigentes, estadoGasto, totalesCaja, siguienteFolio, validarSolicitud, validarGasto, puedeRegistrarGasto,
  puedeEditarGasto, puedeLiquidar, puedeCerrar, puedeCancelar, pendientesFinance, entradaAudit, RUBROS_VARIAS, conceptoItem, itemsValidos, totalItems, estaPorCerrar, pendienteDeCierre, porCerrarPorPersona, TEXTO_PASO,
} from "./geofinance-calc.js";

const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.08)" };
const C_ESTADO = { solicitada: C_GRIS, aprobada: C_AZUL, acreditada: C_NARANJA, liquidada: C_AMARILLO, cerrada: C_VERDE, rechazada: C_ROJO, cancelada: C_ROJO };
const C_VALID = { pendiente: [C_GRIS, "Por validar"], validada: [C_VERDE, "Validada"], observada: [C_AMARILLO, "Observada"] };
const fechaCorta = (ymd) => { if (!ymd) return "—"; const [a, m, d] = String(ymd).slice(0, 10).split("-").map(Number); return new Date(a, m - 1, d).toLocaleDateString("es-HN", { weekday: "short", day: "numeric", month: "short" }); };

const IconoFinance = ({ size = 21 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
  <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
</svg>;
const IconoTipo = ({ tipo, size = 20 }) => tipo === "combustible"
  ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 22h12" /><path d="M4 9h10" /><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18" /><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5" /></svg>
  : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>;

// ── Archivos: foto comprimida (se lee la factura) o PDF de hasta 2 MB ──
const leerDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("No se pudo leer el archivo")); r.readAsDataURL(file); });
const comprimir = async (file, maxPx = 1500) => {
  const src = await leerDataUrl(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("La foto no se pudo abrir")); i.src = src; });
  const k = Math.min(1, maxPx / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
};
const subirArchivo = async (file) => {
  if (!file) return null;
  try {
    let dataUrl, type;
    if (String(file.type).startsWith("image/")) { dataUrl = await comprimir(file); type = "image/jpeg"; }
    else if (file.type === "application/pdf") {
      if (file.size > 2 * 1024 * 1024) { alert("El PDF pesa más de 2 MB. Subí una foto o un PDF más liviano."); return null; }
      dataUrl = await leerDataUrl(file); type = "application/pdf";
    } else { alert("Subí una foto o un PDF."); return null; }
    const fileId = uid();
    const ok = await store.set(`cp-file-${fileId}`, { name: file.name, type, size: Math.round(dataUrl.length * 0.75), dataUrl });
    if (!ok) { alert("No se pudo subir el archivo. Revisá la conexión e intentá de nuevo."); return null; }
    return { fileId, name: file.name, type, size: Math.round(dataUrl.length * 0.75) };
  } catch (e) { alert(e?.message || "No se pudo subir el archivo."); return null; }
};
const bajarArchivo = async (ref) => { const f = await store.get(`cp-file-${ref.fileId}`); return f?.dataUrl ? { ...f, name: f.name || ref.name } : null; };

// Campo de archivo: cámara del teléfono o galería / PDF.
const CampoArchivo = ({ label, valor, onCambiar, onVer }) => {
  const [subiendo, setSubiendo] = useState(false);
  const camRef = useRef(null), archRef = useRef(null);
  const elegir = async (e) => { const fl = e.target.files?.[0]; e.target.value = ""; if (!fl) return; setSubiendo(true); const ref = await subirArchivo(fl); setSubiendo(false); if (ref) onCambiar(ref); };
  return <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <label style={{ fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" }}>{label}</label>
    <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={elegir} />
    <input ref={archRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={elegir} />
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: `1px dashed ${valor ? "rgba(23,114,67,.35)" : "rgba(44,42,40,.2)"}`, background: valor ? "#F1FAF4" : "#F4F4F2" }}>
      {subiendo ? <span style={{ fontSize: 13, color: "#6E6862" }}>Subiendo…</span>
        : valor ? <>
            <span style={{ fontSize: 13, fontWeight: 600, color: C_VERDE.color, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 120px" }}>Listo · {valor.name}</span>
            <Btn small variant="ghost" onClick={() => onVer(valor)}>Ver</Btn>
            <Btn small variant="ghost" onClick={() => archRef.current?.click()}>Cambiar</Btn>
          </>
        : <>
            <Btn small variant="dark" onClick={() => camRef.current?.click()}>Tomar foto</Btn>
            <Btn small variant="ghost" onClick={() => archRef.current?.click()}>Elegir foto o PDF</Btn>
          </>}
    </div>
  </div>;
};

const Errores = ({ lista }) => lista?.length ? <div style={{ padding: "10px 12px", borderRadius: 12, background: C_ROJO.bg, color: C_ROJO.color, fontSize: 13, lineHeight: 1.45 }}>{lista.map((e, i) => <div key={i}>{e}</div>)}</div> : null;
const Pie = ({ children }) => <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6, flexWrap: "wrap" }}>{children}</div>;
const GRID2 = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 };
const pillS = (activo) => ({ padding: "8px 14px", borderRadius: 999, border: `1px solid ${activo ? "transparent" : "rgba(44,42,40,.12)"}`, background: activo ? CHARCOAL : "#fff", color: activo ? "#fff" : "#5C5853", font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" });

// ── Pedir una caja: SIEMPRE desglosada (en qué se va a usar) ──
const CTRL_IT = { padding: "10px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 11, fontSize: 14, outline: "none", background: "#F4F4F2", color: CHARCOAL, fontFamily: "inherit", width: "100%", boxSizing: "border-box", minWidth: 0 };
const opcionesEquipos = (equipos) => [["vehiculo", "Vehículos"], ["maquina", "Máquinas"]].map(([t, g]) => ({ group: g, options: equipos.filter(e => e.tipo === t).map(e => ({ value: e.id, label: e.nombre })) })).filter(g => g.options.length);
const SolicitudForm = ({ proyectos, cajas, equipos, userKey, proyectoInicial, onGuardar, onClose }) => {
  const hoy = hoyISO();
  const vacio = () => ({ id: uid(), rubro: "", equipoId: "", monto: "", nota: "" });
  const [f, setF] = useState({ tipo: "varias", projectCode: proyectoInicial || "", semana: semanaSugerida(hoy), detalle: "" });
  const [items, setItems] = useState(() => ({ varias: [vacio()], combustible: [vacio()] }));
  const [err, setErr] = useState([]); const [ocupado, setOcupado] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const comb = f.tipo === "combustible", lista = items[f.tipo];
  const setLista = (fn) => setItems(p => ({ ...p, [f.tipo]: fn(p[f.tipo]) }));
  const ui = (id, k, v) => setLista(l => l.map(x => x.id === id ? { ...x, [k]: v } : x));
  const armados = lista.map(it => { const e = comb ? equipos.find(x => x.id === it.equipoId) : null; return comb ? { id: it.id, equipoId: it.equipoId, equipoTipo: e?.tipo || "", equipoNombre: e?.nombre || "", monto: r2(it.monto), nota: String(it.nota || "").trim() } : { id: it.id, rubro: it.rubro, monto: r2(it.monto), nota: String(it.nota || "").trim() }; });
  const total = totalItems(armados);
  const tarde = f.semana && fueraDeCorte(f.semana, hoy);
  const semanas = opcionesSemana(hoy);
  const enviar = async () => {
    const datos = { ...f, items: armados };
    const e = validarSolicitud(datos, cajas, userKey); setErr(e); if (e.length) return;
    const its = itemsValidos(armados);
    setOcupado(true); const ok = await onGuardar({ ...f, items: its, monto: totalItems(its), detalle: f.detalle.trim() }); setOcupado(false); if (ok) onClose();
  };
  return <Modal title="Pedir caja chica" onClose={onClose} fondoCierra={false}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {Object.values(TIPOS_CAJA).map(t => <button key={t.id} type="button" onClick={() => { u("tipo", t.id); setErr([]); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px", borderRadius: 16, border: `1.5px solid ${f.tipo === t.id ? ORANGE : "rgba(44,42,40,.12)"}`, background: f.tipo === t.id ? "rgba(232,118,45,.08)" : "#fff", color: f.tipo === t.id ? "#A94E16" : CHARCOAL, font: "700 14px/1.2 var(--sans)", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}><IconoTipo tipo={t.id} />{t.label}</button>)}
      </div>
      <div style={GRID2}>
        <Select label="Proyecto" value={f.projectCode} onChange={e => u("projectCode", e.target.value)} emptyLabel="Elegí el proyecto" options={proyectos.map(p => ({ value: p.short, label: p.short }))} />
        {semanas.length > 1
          ? <Select label="Para la semana completa" value={f.semana} onChange={e => u("semana", e.target.value)} emptyLabel="—" options={semanas.map(x => ({ value: x, label: textoSemana(x).replace("Semana del ", "") }))} />
          : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}><label style={{ fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" }}>Para la semana completa</label><div style={{ ...CTRL_IT, fontWeight: 600 }}>{textoSemana(f.semana).replace("Semana del ", "")}</div></div>}
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" }}>{comb ? "Para qué vehículos y máquinas" : "En qué se va a usar"}</label>
          <span style={{ fontSize: 12, color: "#8A847D" }}>{comb ? "Un renglón por vehículo o máquina" : "Un renglón por rubro"}</span>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {lista.map((it, i) => <div key={it.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,.8fr) auto", gap: 8, alignItems: "center", padding: "8px", borderRadius: 14, background: "rgba(44,42,40,.035)" }}>
            {comb
              ? <select value={it.equipoId} onChange={e => ui(it.id, "equipoId", e.target.value)} style={CTRL_IT} aria-label={`Vehículo o máquina ${i + 1}`}><option value="">Vehículo o máquina</option>{opcionesEquipos(equipos).map(g => <optgroup key={g.group} label={g.group}>{g.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>)}</select>
              : <select value={it.rubro} onChange={e => ui(it.id, "rubro", e.target.value)} style={CTRL_IT} aria-label={`Rubro ${i + 1}`}><option value="">Rubro</option>{RUBROS_VARIAS.map(r => <option key={r} value={r}>{r}</option>)}</select>}
            <input type="number" inputMode="decimal" min="0" step="0.01" value={it.monto} onChange={e => ui(it.id, "monto", e.target.value)} placeholder="Monto L" style={{ ...CTRL_IT, textAlign: "right" }} aria-label={`Monto ${i + 1}`} />
            <button type="button" onClick={() => setLista(l => l.length > 1 ? l.filter(x => x.id !== it.id) : [vacio()])} aria-label={`Quitar renglón ${i + 1}`} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(44,42,40,.06)", color: "#6E6862", cursor: "pointer", fontSize: 13 }}>✕</button>
            <input value={it.nota} onChange={e => ui(it.id, "nota", e.target.value)} placeholder={comb ? "Nota (opcional)" : it.rubro === "Otro" ? "Qué es" : "Detalle (opcional)"} style={{ ...CTRL_IT, gridColumn: "1 / -1", background: "#fff", fontSize: 13.5 }} aria-label={`Nota ${i + 1}`} />
          </div>)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 12 }}>
          <Btn small variant="ghost" onClick={() => setLista(l => [...l, vacio()])}>+ Agregar renglón</Btn>
          <div style={{ textAlign: "right" }}><span style={{ fontSize: 12, color: "#8A847D", marginRight: 8 }}>Total de la caja</span><b style={{ font: "800 19px/1 var(--display)", color: CHARCOAL }}>{fmtL(total)}</b></div>
        </div>
      </div>
      <Textarea label="Notas generales" value={f.detalle} onChange={e => u("detalle", e.target.value)} placeholder="Opcional" style={{ minHeight: 48 }} />
      {tarde && <div style={{ padding: "10px 12px", borderRadius: 12, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 13 }}>Las cajas de esa semana se pedían a más tardar el {fechaCorta(cierreDeSemana(f.semana))}. Se envía igual, marcada como fuera de tiempo.</div>}
      <Errores lista={err} />
      <Pie><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={enviar} disabled={ocupado}>{ocupado ? "Enviando…" : `Enviar solicitud · ${fmtL(total)}`}</Btn></Pie>
    </div>
  </Modal>;
};

// El desglose de la caja: en qué se va a usar cada lempira.
const Desglose = ({ caja }) => {
  const its = itemsValidos(caja.items);
  if (!its.length) return caja.detalle ? <div style={{ fontSize: 14, color: "#5C5853", lineHeight: 1.5 }}>{caja.detalle}</div> : null;
  return <div>
    <div style={{ borderRadius: 14, border: "1px solid rgba(44,42,40,.08)", overflow: "hidden", background: "rgba(255,255,255,.6)" }}>
      {its.map((it, i) => <div key={it.id || i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 14px", borderTop: i ? "1px solid rgba(44,42,40,.07)" : "none", alignItems: "baseline" }}>
        <div style={{ minWidth: 0 }}><span style={{ font: "600 14px/1.3 var(--sans)", color: CHARCOAL }}>{conceptoItem(it)}</span>{it.equipoTipo === "maquina" && <span style={{ fontSize: 11.5, color: "#8A847D", marginLeft: 8 }}>máquina</span>}{it.nota && <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 2 }}>{it.nota}</div>}</div>
        <b style={{ font: "700 14px/1.3 var(--mono)", color: CHARCOAL, whiteSpace: "nowrap" }}>{fmtL(it.monto)}</b>
      </div>)}
    </div>
    {caja.detalle && <div style={{ fontSize: 13, color: "#6E6862", lineHeight: 1.5, marginTop: 8 }}>{caja.detalle}</div>}
  </div>;
};

// ── Aprobar / rechazar (Christian) ──
const DecisionForm = ({ caja, onAprobar, onRechazar, onClose }) => {
  const [monto, setMonto] = useState(String(caja.monto)); const [nota, setNota] = useState(""); const [modo, setModo] = useState("aprobar"); const [ocupado, setOcupado] = useState(false); const [err, setErr] = useState([]);
  const ir = async () => {
    if (modo === "aprobar") { if (!(num(monto) > 0)) return setErr(["Poné el monto aprobado."]); if (r2(monto) !== r2(caja.monto) && nota.trim().length < 5) return setErr(["Cambiaste el monto: escribí por qué."]); }
    else if (nota.trim().length < 5) return setErr(["Escribí el motivo del rechazo."]);
    setOcupado(true); const ok = modo === "aprobar" ? await onAprobar(r2(monto), nota.trim()) : await onRechazar(nota.trim()); setOcupado(false); if (ok) onClose();
  };
  return <Modal title={`${caja.folio} · ${TIPOS_CAJA[caja.tipo].label}`} onClose={onClose}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13.5, color: "#5C5853", lineHeight: 1.5 }}><b style={{ color: CHARCOAL }}>{caja.solicitante?.nombre}</b> pide <b style={{ color: CHARCOAL }}>{fmtL(caja.monto)}</b> para {caja.projectCode}, {textoSemana(caja.semana).toLowerCase()}.</div>
      <Desglose caja={caja} />
      <div style={{ display: "flex", gap: 8 }}>{[["aprobar", "Aprobar"], ["rechazar", "Rechazar"]].map(([id, l]) => <button key={id} type="button" style={pillS(modo === id)} onClick={() => { setModo(id); setErr([]); }}>{l}</button>)}</div>
      {modo === "aprobar" && <Input label="Monto aprobado (L)" type="number" inputMode="decimal" value={monto} onChange={e => setMonto(e.target.value)} />}
      <Textarea label={modo === "aprobar" ? "Comentario (opcional)" : "Motivo"} value={nota} onChange={e => setNota(e.target.value)} />
      <Errores lista={err} />
      <Pie><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn variant={modo === "aprobar" ? "primary" : "danger"} onClick={ir} disabled={ocupado}>{ocupado ? "Guardando…" : modo === "aprobar" ? "Aprobar y pasar a Tesorería" : "Rechazar"}</Btn></Pie>
    </div>
  </Modal>;
};

// ── Acreditar con comprobante (Lic. Carolina) ──
const AcreditarForm = ({ caja, onGuardar, onVer, onClose }) => {
  const [f, setF] = useState({ fecha: hoyISO(), monto: String(caja.aprobacion?.monto ?? caja.monto), comprobante: null }); const [err, setErr] = useState([]); const [ocupado, setOcupado] = useState(false);
  const ir = async () => {
    const e = []; if (!f.fecha) e.push("Poné la fecha de la transferencia."); if (!(num(f.monto) > 0)) e.push("Poné el monto acreditado."); if (!f.comprobante) e.push("Adjuntá el comprobante de transferencia.");
    setErr(e); if (e.length) return;
    setOcupado(true); const ok = await onGuardar({ fecha: f.fecha, monto: r2(f.monto), comprobante: f.comprobante }); setOcupado(false); if (ok) onClose();
  };
  return <Modal title={`Acreditar ${caja.folio}`} onClose={onClose} fondoCierra={false}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13.5, color: "#5C5853" }}>{TIPOS_CAJA[caja.tipo].label} · {caja.projectCode} · a <b style={{ color: CHARCOAL }}>{caja.solicitante?.nombre}</b></div>
      <div style={GRID2}>
        <Input label="Fecha de la transferencia" type="date" value={f.fecha} onChange={e => setF(p => ({ ...p, fecha: e.target.value }))} />
        <Input label="Monto acreditado (L)" type="number" inputMode="decimal" value={f.monto} onChange={e => setF(p => ({ ...p, monto: e.target.value }))} />
      </div>
      <CampoArchivo label="Comprobante de transferencia" valor={f.comprobante} onCambiar={c => setF(p => ({ ...p, comprobante: c }))} onVer={onVer} />
      <Errores lista={err} />
      <Pie><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={ir} disabled={ocupado}>{ocupado ? "Guardando…" : "Marcar acreditada"}</Btn></Pie>
    </div>
  </Modal>;
};

// ── Registrar una compra en la cajita ──
const GastoForm = ({ caja, gasto, equipos, onGuardar, onVer, onClose }) => {
  const esComb = caja.tipo === "combustible";
  const [f, setF] = useState(() => gasto ? { ...gasto, monto: String(gasto.monto), galones: gasto.galones ? String(gasto.galones) : "", km: gasto.km ? String(gasto.km) : "" } : { fecha: hoyISO(), proveedor: "", descripcion: esComb ? "Diésel" : "", rubro: "", numFactura: "", monto: "", factura: null, vehicleId: (esComb && itemsValidos(caja.items).length === 1 && itemsValidos(caja.items)[0].equipoId) || "", galones: "", km: "" });
  const [err, setErr] = useState([]); const [ocupado, setOcupado] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const ir = async () => {
    const veh = equipos.find(v => v.id === f.vehicleId);
    const g = { ...f, proveedor: f.proveedor.trim(), descripcion: f.descripcion.trim(), numFactura: String(f.numFactura || "").trim(), monto: r2(f.monto), galones: esComb ? r2(f.galones) : 0, km: esComb ? num(f.km) : 0, vehicleId: esComb ? f.vehicleId : "", placa: esComb ? (veh?.corto || "") : "", equipoTipo: esComb ? (veh?.tipo || "") : "" };
    const e = validarGasto(g); setErr(e); if (e.length) return;
    setOcupado(true); const ok = await onGuardar(g); setOcupado(false); if (ok) onClose();
  };
  return <Modal title={gasto ? "Corregir compra" : "Registrar compra"} onClose={onClose} fondoCierra={false}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {gasto?.validacion?.estado === "observada" && <div style={{ padding: "10px 12px", borderRadius: 12, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 13 }}>Contabilidad: {gasto.validacion.nota}</div>}
      <CampoArchivo label="Factura (foto o PDF)" valor={f.factura} onCambiar={c => u("factura", c)} onVer={onVer} />
      <div style={GRID2}>
        <Input label="Fecha" type="date" value={f.fecha} onChange={e => u("fecha", e.target.value)} />
        <Input label="Monto de la factura (L)" type="number" inputMode="decimal" min="0" step="0.01" value={f.monto} onChange={e => u("monto", e.target.value)} placeholder="0.00" />
      </div>
      <div style={GRID2}>
        <Input label={esComb ? "Estación" : "Dónde se compró"} value={f.proveedor} onChange={e => u("proveedor", e.target.value)} placeholder={esComb ? "Ej. Puma El Carrizal" : "Ej. Ferretería Monterroso"} />
        <Input label="N.º de factura" hint="opcional" value={f.numFactura} onChange={e => u("numFactura", e.target.value)} />
      </div>
      <Input label={esComb ? "Qué se cargó" : "Qué se compró"} value={f.descripcion} onChange={e => u("descripcion", e.target.value)} />
      {esComb && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: 12 }}>
        <Select label="Vehículo o máquina" value={f.vehicleId} onChange={e => u("vehicleId", e.target.value)} emptyLabel="Otro / no aplica" options={opcionesEquipos(equipos)} />
        <Input label="Galones" hint="opcional" type="number" inputMode="decimal" value={f.galones} onChange={e => u("galones", e.target.value)} />
        <Input label="Kilometraje" hint="opcional" type="number" inputMode="numeric" value={f.km} onChange={e => u("km", e.target.value)} />
      </div>}
      <Errores lista={err} />
      <Pie><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={ir} disabled={ocupado}>{ocupado ? "Guardando…" : gasto ? "Guardar cambios" : "Registrar compra"}</Btn></Pie>
    </div>
  </Modal>;
};

// ── Liquidar: lo que sobra se devuelve a la empresa ──
const LiquidarForm = ({ caja, onGuardar, onVer, onClose }) => {
  const t = totalesCaja(caja);
  const [f, setF] = useState({ monto: String(t.sobra || ""), fecha: hoyISO(), comprobante: null }); const [err, setErr] = useState([]); const [ocupado, setOcupado] = useState(false);
  const ir = async () => {
    const e = [];
    if (t.sobra) { if (Math.abs(r2(f.monto) - t.sobra) > 1) e.push(`Hay que devolver ${fmtL(t.sobra)}.`); if (!f.comprobante) e.push("Adjuntá el comprobante del depósito de lo que sobró."); }
    setErr(e); if (e.length) return;
    setOcupado(true); const ok = await onGuardar(t.sobra ? { monto: r2(f.monto), fecha: f.fecha, comprobante: f.comprobante } : null); setOcupado(false); if (ok) onClose();
  };
  const fila = (l, v, c) => <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "7px 0", borderBottom: "1px solid rgba(44,42,40,.07)" }}><span style={{ color: "#6E6862" }}>{l}</span><b style={{ color: c || CHARCOAL, fontFamily: "var(--mono)" }}>{v}</b></div>;
  return <Modal title={`Liquidar ${caja.folio}`} onClose={onClose} fondoCierra={false}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>{fila("Acreditado", fmtL(t.acreditado))}{fila(`Gastado · ${t.nGastos} ${t.nGastos === 1 ? "compra" : "compras"}`, fmtL(t.gastado))}{t.falta ? fila("Gastaste de más", fmtL(t.falta), C_ROJO.color) : fila("Sobra · se devuelve", fmtL(t.sobra), t.sobra ? "#A94E16" : C_VERDE.color)}</div>
      {t.sobra > 0 && <>
        <div style={GRID2}>
          <Input label="Monto devuelto (L)" type="number" inputMode="decimal" value={f.monto} onChange={e => setF(p => ({ ...p, monto: e.target.value }))} />
          <Input label="Fecha del depósito" type="date" value={f.fecha} onChange={e => setF(p => ({ ...p, fecha: e.target.value }))} />
        </div>
        <CampoArchivo label="Comprobante del depósito a la empresa" valor={f.comprobante} onCambiar={c => setF(p => ({ ...p, comprobante: c }))} onVer={onVer} />
      </>}
      {t.falta > 0 && <div style={{ padding: "10px 12px", borderRadius: 12, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 13 }}>Queda anotado que pusiste {fmtL(t.falta)} de más para que Finanzas lo vea.</div>}
      <div style={{ fontSize: 12.5, color: "#8A847D" }}>Al liquidar ya no se agregan compras. Contabilidad termina de validar las facturas y cierra la caja.</div>
      <Errores lista={err} />
      <Pie><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn onClick={ir} disabled={ocupado}>{ocupado ? "Guardando…" : "Liquidar caja"}</Btn></Pie>
    </div>
  </Modal>;
};

// ═══════════════════════════════════════════════════════════════════════════
export default function GeoFinanceModule({ userRole, userName, userKey, onBack, onLogout }) {
  const isMobile = useIsMobile();
  const perm = permisosFinance(userRole, userKey);
  const quien = { username: userKey, nombre: userName, rol: userRole };

  const [cajas, _setCajas] = useState(null);
  const mutRef = useRef(0);
  const setCajas = (v) => { mutRef.current = Date.now(); _setCajas(v); };
  const [custom, setCustom] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [sec, setSec] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [modal, setModal] = useState(null);
  const [visor, setVisor] = useState(null);
  const [filtro, setFiltro] = useState({ estado: "abiertas", tipo: "", q: "" });
  const [ocupado, setOcupado] = useState(false);

  const cargar = async (todo) => {
    try {
      const [c, p, v, mq] = await Promise.all([store.getCloud(KEY_CAJAS), todo ? store.getCloud("cp-projects").catch(() => null) : null, todo ? store.getCloud("lg-vehicles").catch(() => null) : null, todo ? store.getCloud("mq-machines").catch(() => null) : null]);
      if (Date.now() - mutRef.current > 8000) _setCajas(Array.isArray(c) ? c : []);
      if (todo) { setCustom(Array.isArray(p) ? p : []); setVehiculos([
        ...(Array.isArray(v) ? v : []).filter(x => x && x.plate).map(x => ({ id: x.id, tipo: "vehiculo", corto: x.plate, nombre: [x.plate, x.brand, x.model].filter(Boolean).join(" · ") })),
        ...(Array.isArray(mq) ? mq : []).filter(x => x && x.nombre && !x.eliminado).map(x => ({ id: x.id, tipo: "maquina", corto: x.nombre, nombre: x.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true })),
      ]); }
    } catch { _setCajas(prev => prev || []); }
  };
  useEffect(() => {
    cargar(true);
    const f = () => { if (document.visibilityState === "visible") cargar(false); };
    window.addEventListener("focus", f);
    const t = setInterval(f, 60000);
    return () => { window.removeEventListener("focus", f); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Escritura sobre la nube fresca ──
  const escribir = async (fn) => {
    let nube;
    try { nube = await store.getCloud(KEY_CAJAS); } catch { alert("No hay conexión con la nube. No se guardó nada; intentá de nuevo en un momento."); return null; }
    let out;
    try { out = fn(Array.isArray(nube) ? nube : []); } catch (e) { alert(e?.message || "No se pudo guardar."); cargar(false); return null; }
    const ok = await store.set(KEY_CAJAS, out.lista);
    if (!ok) { alert("No se pudo guardar en la nube. Intentá de nuevo."); return null; }
    try {
      const ver = await store.getCloud(KEY_CAJAS);
      if (Array.isArray(ver)) {
        const v = ver.find(x => x.id === out.caja.id);
        if (!v || v.updatedAt !== out.caja.updatedAt) { alert("Se guardó, pero la nube no lo confirma todavía. Recargá la página y revisá."); }
        setCajas(ver); return out.caja;
      }
    } catch { /* el set ya confirmó */ }
    setCajas(out.lista); return out.caja;
  };
  const actualizar = (id, fn) => escribir((base) => {
    const c = base.find(x => x.id === id);
    if (!c) throw new Error("Esa caja ya no existe.");
    const n = { ...fn(c), updatedAt: new Date().toISOString() };
    return { lista: base.map(x => x.id === id ? n : x), caja: n };
  });
  const conAudit = (c, accion, extra) => [...(c.audit || []), entradaAudit(accion, userName, extra)];
  const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };

  const crearCaja = (f) => escribir((base) => {
    const e = validarSolicitud(f, base, userKey); exigir(!e.length, e[0]);
    const ahora = new Date().toISOString(), hoy = hoyISO();
    const caja = { id: uid(), folio: siguienteFolio(base, hoy.slice(0, 4)), tipo: f.tipo, projectCode: f.projectCode, semana: f.semana, fueraDeCorte: fueraDeCorte(f.semana, hoy), monto: f.monto, items: f.items, detalle: f.detalle, solicitante: quien, estado: "solicitada", gastos: [], audit: [entradaAudit("solicitada", userName)], createdAt: ahora, updatedAt: ahora };
    try { localStorage.setItem(`gt-fn-proy-${userKey}`, f.projectCode); } catch { /* preferencia */ }
    return { lista: [...base, caja], caja };
  });
  const aprobar = (id, monto, comentario) => actualizar(id, c => { exigir(puedeAprobar(userRole, userKey, c), "Esa caja ya no está por aprobar."); return { ...c, estado: "aprobada", aprobacion: { por: userName, at: new Date().toISOString(), monto, comentario }, audit: conAudit(c, "aprobada", { monto }) }; });
  const rechazar = (id, motivo) => actualizar(id, c => { exigir(puedeAprobar(userRole, userKey, c), "Esa caja ya no está por aprobar."); return { ...c, estado: "rechazada", rechazo: { por: userName, at: new Date().toISOString(), motivo }, audit: conAudit(c, "rechazada", { motivo }) }; });
  const acreditar = (id, d) => actualizar(id, c => { exigir(perm.acredita && c.estado === "aprobada", "Esa caja ya no está por acreditar."); return { ...c, estado: "acreditada", acreditacion: { por: userName, at: new Date().toISOString(), ...d }, audit: conAudit(c, "acreditada", { monto: d.monto }) }; });
  const guardarGasto = (id, g) => actualizar(id, c => {
    exigir(c.solicitante?.username === userKey, "Solo quien pidió la caja registra sus compras.");
    const previo = (c.gastos || []).find(x => x.id === g.id);
    if (previo) { exigir(puedeEditarGasto(c, previo), "Esa compra ya no se puede corregir."); return { ...c, gastos: c.gastos.map(x => x.id === g.id ? { ...x, ...g, validacion: { estado: "pendiente" }, updatedAt: new Date().toISOString() } : x), audit: conAudit(c, "compra_corregida", { gastoId: g.id, monto: g.monto }) }; }
    exigir(puedeRegistrarGasto(c), "Esta caja ya no recibe compras.");
    const nuevo = { ...g, id: uid(), validacion: { estado: "pendiente" }, por: userName, at: new Date().toISOString() };
    return { ...c, gastos: [...(c.gastos || []), nuevo], audit: conAudit(c, "compra_registrada", { gastoId: nuevo.id, monto: g.monto }) };
  });
  const quitarGasto = (id, g) => actualizar(id, c => { const x = (c.gastos || []).find(y => y.id === g.id); exigir(x && puedeEditarGasto(c, x), "Esa compra ya no se puede quitar."); return { ...c, gastos: c.gastos.map(y => y.id === g.id ? { ...y, anulado: true, anuladoPor: userName, anuladoAt: new Date().toISOString() } : y), audit: conAudit(c, "compra_quitada", { gastoId: g.id, monto: g.monto }) }; });
  const validar = (id, g, estado, nota = "") => actualizar(id, c => { exigir(perm.valida && c.estado !== "cerrada", "Esa caja ya está cerrada."); return { ...c, gastos: (c.gastos || []).map(y => y.id === g.id ? { ...y, validacion: { estado, nota, por: userName, at: new Date().toISOString() } } : y), audit: conAudit(c, estado === "validada" ? "factura_validada" : "factura_observada", { gastoId: g.id, nota }) }; });
  const liquidar = (id, devolucion) => actualizar(id, c => { exigir(c.solicitante?.username === userKey && puedeLiquidar(c), "Esa caja ya no se puede liquidar."); const t = totalesCaja(c); return { ...c, estado: "liquidada", liquidacion: { por: userName, at: new Date().toISOString(), gastado: t.gastado, sobrante: t.sobra, faltante: t.falta, devolucion }, audit: conAudit(c, "liquidada", { gastado: t.gastado, sobrante: t.sobra, faltante: t.falta }) }; });
  const cerrar = (id) => actualizar(id, c => { exigir(perm.cierra && puedeCerrar(c), "Todavía hay facturas sin validar."); return { ...c, estado: "cerrada", cierre: { por: userName, at: new Date().toISOString() }, audit: conAudit(c, "cerrada") }; });
  const cancelar = (id) => actualizar(id, c => { exigir(c.solicitante?.username === userKey && puedeCancelar(c), "Esa caja ya no se puede cancelar."); return { ...c, estado: "cancelada", audit: conAudit(c, "cancelada") }; });

  const ver = async (ref) => { try { const f = await bajarArchivo(ref); if (f) setVisor(f); else alert("No se pudo cargar el archivo desde la nube."); } catch { alert("No se pudo cargar el archivo desde la nube."); } };
  const bajarPdf = async (caja) => {
    setOcupado(true);
    try { const { pdfLiquidacionCaja } = await import("./geofinance-pdf.js"); await pdfLiquidacionCaja({ caja, proyecto: nombreProy(caja.projectCode), bajar: bajarArchivo }); }
    catch (e) { alert("No se pudo generar el PDF. " + (e?.message || "")); }
    setOcupado(false);
  };

  // ── Proyectos (base + custom), los que admiten solicitudes ──
  const proyectos = (() => {
    const base = new Set(PROJECTS.map(p => p.short)), out = [];
    PROJECTS.forEach(p => { const x = custom.find(c => c.short === p.short); if (x?.hidden || x?.deleted) return; out.push({ ...p, ...(x || {}) }); });
    custom.forEach(c => { if (base.has(c.short) || c.hidden || c.deleted) return; out.push(c); });
    return out.filter(p => admiteSolicitudes(p.short)).sort((a, b) => String(a.short).localeCompare(String(b.short), "es", { sensitivity: "base", numeric: true }));
  })();
  const nombreProy = (short) => proyectos.find(p => p.short === short)?.name || short;

  if (cajas === null) return <PantallaCarga titulo="GeoFinance" icono={<IconoFinance size={18} />} />;

  const visibles = perm.veTodo ? cajas : cajas.filter(c => c.solicitante?.username === userKey);
  const mias = cajas.filter(c => c.solicitante?.username === userKey);
  const pend = pendientesFinance({ cajas, rol: userRole, username: userKey });
  const nav = [
    perm.pide && { id: "mis", label: "Mis cajas", badge: pend.observados },
    perm.aprueba && (userRole === "costos" || perm.super || pend.aprobar > 0) && { id: "aprobar", label: "Por aprobar", badge: pend.aprobar },
    perm.acredita && { id: "acreditar", label: "Por acreditar", badge: perm.super ? cajas.filter(c => c.estado === "aprobada").length : pend.acreditar },
    perm.valida && { id: "facturas", label: "Facturas", badge: pend.facturas },
    perm.veTodo && { id: "porcerrar", label: "Por cerrar", badge: pend.cerrar },
    perm.veTodo && { id: "todas", label: "Todas las cajas" },
  ].filter(Boolean);
  const secOk = nav.some(x => x.id === sec) ? sec : (nav.find(x => x.badge > 0) || nav[0])?.id;
  const cajaAbierta = abierta ? visibles.find(c => c.id === abierta) : null;
  const irA = (id) => { setAbierta(null); setSec(id); };

  // ── Piezas ──
  const cifra = (l, v, c) => <div style={{ minWidth: 0 }}>
    <div className="gt-label" style={{ color: "var(--text-3)" }}>{l}</div>
    <div style={{ font: `800 ${isMobile ? 17 : 21}px/1.15 var(--display)`, color: c || CHARCOAL, marginTop: 6, whiteSpace: "nowrap" }}>{v}</div>
  </div>;
  const barra = (t) => { const p = t.base > 0 ? Math.min(1, t.gastado / t.base) : 0; return <div style={{ height: 6, borderRadius: 99, background: "rgba(44,42,40,.08)", overflow: "hidden" }}><div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 99, background: t.falta ? "#C0392B" : ORANGE, transition: "width .6s cubic-bezier(.22,1,.36,1)" }} /></div>; };

  const filaCaja = (c) => {
    const t = totalesCaja(c);
    return <div key={c.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={() => setAbierta(c.id)} onKeyDown={e => { if (e.key === "Enter") setAbierta(c.id); }}
      style={{ padding: isMobile ? "13px 14px" : "14px 20px", cursor: "pointer", display: "grid", gridTemplateColumns: isMobile ? "auto minmax(0,1fr)" : "auto minmax(0,1.5fr) minmax(0,1fr) auto", gap: isMobile ? 12 : 18, alignItems: "center" }}>
      <div style={{ width: 42, height: 42, borderRadius: 13, background: c.tipo === "combustible" ? "rgba(44,42,40,.07)" : "rgba(232,118,45,.12)", color: c.tipo === "combustible" ? CHARCOAL : "#C75F1F", display: "flex", alignItems: "center", justifyContent: "center" }}><IconoTipo tipo={c.tipo} /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "700 15px/1.25 var(--display)", color: CHARCOAL, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.projectCode}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><span style={{ fontFamily: "var(--mono)" }}>{c.folio}</span> · {TIPOS_CAJA[c.tipo]?.corto}{perm.veTodo ? ` · ${c.solicitante?.nombre}` : ""}</div>
        {isMobile && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}><b style={{ fontSize: 14.5 }}>{fmtL(t.base)}</b><Chip c={C_ESTADO[c.estado]}>{ESTADOS_CAJA[c.estado].label}</Chip>{t.porValidar > 0 && perm.valida && <Chip c={C_NARANJA}>{t.porValidar} por validar</Chip>}{t.observados > 0 && <Chip c={C_AMARILLO}>{t.observados} observada{t.observados > 1 ? "s" : ""}</Chip>}</div>}
      </div>
      {!isMobile && <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-3)", marginBottom: 6 }}><span>Gastado {fmtL(t.gastado)}</span><span>{t.nGastos} {t.nGastos === 1 ? "compra" : "compras"}</span></div>
        {barra(t)}
      </div>}
      {!isMobile && <div style={{ textAlign: "right" }}>
        <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>{fmtL(t.base)}</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6, flexWrap: "wrap" }}>
          {c.fueraDeCorte && <Chip c={C_AMARILLO}>Fuera de tiempo</Chip>}
          {t.porValidar > 0 && perm.valida && <Chip c={C_NARANJA}>{t.porValidar} por validar</Chip>}
          {t.observados > 0 && <Chip c={C_AMARILLO}>{t.observados} observada{t.observados > 1 ? "s" : ""}</Chip>}
          {(() => { const p = pendienteDeCierre(c, hoyISO()); return p ? <Chip c={p.atrasada ? C_ROJO : C_GRIS} title={TEXTO_PASO[p.paso]}>Por cerrar{p.atrasada ? ` · ${p.dias} d` : ""}</Chip> : null; })()}
          <Chip c={C_ESTADO[c.estado]}>{ESTADOS_CAJA[c.estado].label}</Chip>
        </div>
      </div>}
    </div>;
  };
  const lista = (cs, vacio) => {
    if (!cs.length) return <div className="gt-vidrio" style={{ padding: "34px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>{vacio}</div>;
    const orden = [...cs].sort((a, b) => String(b.semana).localeCompare(String(a.semana)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const grupos = []; orden.forEach(c => { const g = grupos[grupos.length - 1]; if (g && g.semana === c.semana) g.cajas.push(c); else grupos.push({ semana: c.semana, cajas: [c] }); });
    return grupos.map(g => <div key={g.semana} style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 4px 0" }}>
        <span className="gt-label" style={{ color: "var(--text-3)" }}>{textoSemana(g.semana)}</span>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{g.cajas.length} · {fmtL(g.cajas.reduce((s, c) => s + totalesCaja(c).base, 0))}</span>
      </div>
      {g.cajas.map(filaCaja)}
    </div>);
  };

  const renderMis = () => <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ fontSize: 13, color: "var(--text-3)" }}>Se piden a más tardar el jueves, para toda la semana siguiente. Toca pedir la del {textoSemana(semanaSugerida(hoyISO())).replace("Semana del ", "")}.</div>
      <Btn onClick={() => setModal({ t: "pedir" })}>+ Pedir caja</Btn>
    </div>
    {(() => { const ps = mias.map(c => ({ c, p: pendienteDeCierre(c, hoyISO()) })).filter(x => x.p); if (!ps.length) return null; const suyas = ps.filter(x => x.p.de === "ingeniero"), atr = ps.filter(x => x.p.atrasada);
      return <div className="gt-vidrio" style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: atr.length ? C_ROJO.bg : undefined }}>
        <b style={{ font: "800 15px/1.2 var(--display)", color: atr.length ? C_ROJO.color : CHARCOAL }}>{ps.length} {ps.length === 1 ? "caja por cerrar" : "cajas por cerrar"}</b>
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>{suyas.length ? `${suyas.length} ${suyas.length === 1 ? "depende" : "dependen"} de vos` : "Están con Contabilidad"}{atr.length ? ` · ${atr.length} de una semana que ya terminó` : ""}</span>
      </div>; })()}
    {lista(mias, "Todavía no has pedido ninguna caja.")}
  </>;
  const renderTodas = () => {
    const ABIERTAS = ["solicitada", "aprobada", "acreditada", "liquidada"];
    const q = filtro.q.trim().toLowerCase();
    const cs = visibles.filter(c => (filtro.estado === "abiertas" ? ABIERTAS.includes(c.estado) : filtro.estado === "todas" ? true : c.estado === filtro.estado) && (!filtro.tipo || c.tipo === filtro.tipo)
      && (!q || [c.folio, c.projectCode, c.solicitante?.nombre, c.detalle, ...(c.items || []).map(conceptoItem)].some(x => String(x || "").toLowerCase().includes(q))));
    const ab = visibles.filter(c => ABIERTAS.includes(c.estado));
    const tot = ab.reduce((s, c) => { const t = totalesCaja(c); return { base: s.base + t.base, gastado: s.gastado + t.gastado, porValidar: s.porValidar + t.porValidar }; }, { base: 0, gastado: 0, porValidar: 0 });
    return <>
      <div className="gt-vidrio" style={{ padding: isMobile ? "14px 16px" : "16px 22px", display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0,1fr))`, gap: 16 }}>
        {cifra("Cajas abiertas", ab.length)}{cifra("En la calle", fmtL(r2(tot.base)))}{cifra("Ya con factura", fmtL(r2(tot.gastado)), "#A94E16")}{cifra("Facturas por validar", tot.porValidar)}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {[["abiertas", "Abiertas"], ["solicitada", "Por aprobar"], ["aprobada", "Por acreditar"], ["acreditada", "Acreditadas"], ["liquidada", "Liquidadas"], ["cerrada", "Cerradas"], ["todas", "Todas"]].map(([id, l]) => <button key={id} type="button" style={pillS(filtro.estado === id)} onClick={() => setFiltro(f => ({ ...f, estado: id }))}>{l}</button>)}
        <select value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))} style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(44,42,40,.12)", background: "#fff", fontSize: 12.5, fontFamily: "inherit", color: "#5C5853" }}><option value="">Varias y combustible</option><option value="varias">Compras varias</option><option value="combustible">Combustible</option></select>
        <input value={filtro.q} onChange={e => setFiltro(f => ({ ...f, q: e.target.value }))} placeholder="Buscar" style={{ flex: "1 1 160px", minWidth: 0, padding: "9px 14px", borderRadius: 999, border: "1px solid rgba(44,42,40,.12)", background: "#fff", fontSize: 13.5, fontFamily: "inherit", outline: "none" }} />
      </div>
      {lista(cs, "No hay cajas con ese filtro.")}
    </>;
  };

  const filaGasto = (c, g, i) => {
    const [cv, tv] = C_VALID[estadoGasto(g)];
    const esDueno = c.solicitante?.username === userKey;
    const link = (txt, fn, color) => <button type="button" onClick={fn} style={{ background: "none", border: "none", padding: 0, font: "600 12.5px/1.2 var(--sans)", color: color || "var(--naranja-texto-chico)", cursor: "pointer", fontFamily: "inherit" }}>{txt}</button>;
    return <div key={g.id} style={{ padding: "13px 0", borderTop: i ? "1px solid rgba(44,42,40,.07)" : "none", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "700 14.5px/1.3 var(--sans)", color: CHARCOAL }}>{g.proveedor}</div>
        <div style={{ fontSize: 13, color: "#5C5853", marginTop: 2 }}>{g.descripcion}{g.placa ? ` · ${g.placa}` : ""}{g.galones ? ` · ${g.galones} gal` : ""}{g.km ? ` · ${Number(g.km).toLocaleString("es-HN")} km` : ""}</div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{fechaCorta(g.fecha)}{g.numFactura ? ` · Factura ${g.numFactura}` : ""}</div>
        {estadoGasto(g) === "observada" && g.validacion?.nota && <div style={{ marginTop: 7, padding: "7px 10px", borderRadius: 10, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 12.5 }}>Contabilidad: {g.validacion.nota}</div>}
        <div style={{ display: "flex", gap: 14, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
          {g.factura && link("Ver factura", () => ver(g.factura))}
          {esDueno && puedeEditarGasto(c, g) && link("Corregir", () => setModal({ t: "gasto", caja: c, gasto: g }), "#5C5853")}
          {esDueno && puedeEditarGasto(c, g) && link("Quitar", () => { if (confirm(`¿Quitar la compra de ${g.proveedor} por ${fmtL(g.monto)}?`)) quitarGasto(c.id, g); }, C_ROJO.color)}
          {perm.valida && c.estado !== "cerrada" && estadoGasto(g) !== "validada" && <Btn small variant="success" onClick={() => validar(c.id, g, "validada")}>Validar</Btn>}
          {perm.valida && c.estado !== "cerrada" && estadoGasto(g) !== "observada" && <Btn small variant="ghost" onClick={() => { const n = prompt("¿Qué hay que corregir en esta factura?"); if (n && n.trim().length >= 3) validar(c.id, g, "observada", n.trim()); }}>Observar</Btn>}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, whiteSpace: "nowrap" }}>{fmtL(g.monto)}</div>
        <Chip c={cv} style={{ marginTop: 7 }}>{tv}</Chip>
      </div>
    </div>;
  };

  const renderFacturas = () => {
    const cs = cajas.filter(c => !["cerrada", "rechazada", "cancelada"].includes(c.estado) && (totalesCaja(c).porValidar > 0 || puedeCerrar(c)));
    if (!cs.length) return <div className="gt-vidrio" style={{ padding: "34px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>No hay facturas por validar.</div>;
    return cs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).map(c => {
      const ps = gastosVigentes(c).filter(g => estadoGasto(g) === "pendiente");
      return <div key={c.id} className="gt-vidrio" style={{ padding: isMobile ? "14px 16px" : "16px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "700 15.5px/1.25 var(--display)" }}>{c.projectCode} · {TIPOS_CAJA[c.tipo].corto}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 3 }}><span style={{ fontFamily: "var(--mono)" }}>{c.folio}</span> · {c.solicitante?.nombre} · {textoSemana(c.semana)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Chip c={C_ESTADO[c.estado]}>{ESTADOS_CAJA[c.estado].label}</Chip>
            {perm.cierra && puedeCerrar(c) && <Btn small onClick={() => { if (confirm(`¿Cerrar la caja ${c.folio}? Todas sus facturas están validadas.`)) cerrar(c.id); }}>Cerrar caja</Btn>}
            <Btn small variant="ghost" onClick={() => setAbierta(c.id)}>Abrir</Btn>
          </div>
        </div>
        {ps.map((g, i) => filaGasto(c, g, i))}
      </div>;
    });
  };

  // Qué cajas no ha cerrado cada persona.
  const renderPorCerrar = () => {
    const hoy = hoyISO(), gs = porCerrarPorPersona(cajas, hoy);
    if (!gs.length) return <div className="gt-vidrio" style={{ padding: "34px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>No hay cajas por cerrar.</div>;
    const todas = gs.flatMap(g => g.cajas);
    return <>
      <div className="gt-vidrio" style={{ padding: isMobile ? "14px 16px" : "16px 22px", display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0,1fr))`, gap: 16 }}>
        {cifra("Cajas por cerrar", todas.length)}{cifra("Personas", gs.length)}{cifra("De semanas ya terminadas", todas.filter(x => x.atrasada).length, todas.some(x => x.atrasada) ? C_ROJO.color : undefined)}{cifra("Listas para cerrar", todas.filter(x => x.paso === "cerrar").length, "#A94E16")}
      </div>
      {gs.map(g => <div key={g.username} className="gt-vidrio" style={{ padding: isMobile ? "14px 16px" : "16px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
          <div style={{ font: "800 16.5px/1.25 var(--display)" }}>{g.nombre}</div>
          <div style={{ fontSize: 13, color: g.atrasadas ? C_ROJO.color : "var(--text-3)", fontWeight: g.atrasadas ? 700 : 400 }}>{g.cajas.length} sin cerrar · {fmtL(g.monto)}{g.atrasadas ? ` · ${g.atrasadas} atrasada${g.atrasadas > 1 ? "s" : ""}` : ""}</div>
        </div>
        {g.cajas.map((x, i) => { const c = x.caja; return <div key={c.id} role="button" tabIndex={0} onClick={() => setAbierta(c.id)} onKeyDown={e => { if (e.key === "Enter") setAbierta(c.id); }}
          style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) auto" : "minmax(0,1.4fr) minmax(0,1fr) auto auto", gap: 12, alignItems: "center", padding: "11px 0", borderTop: i ? "1px solid rgba(44,42,40,.07)" : "1px solid rgba(44,42,40,.07)", cursor: "pointer" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "600 14px/1.3 var(--sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.projectCode} · {TIPOS_CAJA[c.tipo]?.corto}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}><span style={{ fontFamily: "var(--mono)" }}>{c.folio}</span> · {textoSemana(c.semana)}</div>
          </div>
          {!isMobile && <div style={{ fontSize: 13, color: x.de === "ingeniero" ? CHARCOAL : "var(--text-3)" }}>{TEXTO_PASO[x.paso]}</div>}
          {!isMobile && <b style={{ fontFamily: "var(--mono)", fontSize: 13.5, whiteSpace: "nowrap" }}>{fmtL(totalesCaja(c).base)}</b>}
          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
            {x.atrasada && <Chip c={C_ROJO}>{x.dias} d</Chip>}
            {isMobile && <Chip c={x.paso === "cerrar" ? C_NARANJA : C_GRIS}>{TEXTO_PASO[x.paso]}</Chip>}
            {perm.cierra && x.paso === "cerrar" && <Btn small onClick={(e) => { e.stopPropagation(); if (confirm(`¿Cerrar la caja ${c.folio}? Todas sus facturas están validadas.`)) cerrar(c.id); }}>Cerrar</Btn>}
          </div>
        </div>; })}
      </div>)}
    </>;
  };

  const renderDetalle = (c) => {
    const t = totalesCaja(c), gs = gastosVigentes(c), esDueno = c.solicitante?.username === userKey;
    const paso = ESTADOS_CAJA[c.estado].paso;
    const nota = (col, txt) => <div style={{ padding: "11px 14px", borderRadius: 14, background: col.bg, color: col.color, fontSize: 13.5, lineHeight: 1.45 }}>{txt}</div>;
    return <>
      <div><button type="button" onClick={() => setAbierta(null)} style={{ background: "none", border: "none", padding: "4px 0", font: "700 13px/1 var(--sans)", color: "var(--text-3)", cursor: "pointer", fontFamily: "inherit" }}>← Cajas</button></div>
      <div className="gt-vidrio" style={{ padding: isMobile ? "16px 16px" : "22px 26px", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <div style={{ width: 50, height: 50, borderRadius: 15, background: "rgba(232,118,45,.12)", color: "#C75F1F", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconoTipo tipo={c.tipo} size={24} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: `800 ${isMobile ? 19 : 23}px/1.15 var(--display)`, letterSpacing: "-.01em" }}>{c.projectCode}</div>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>{TIPOS_CAJA[c.tipo].label} · <span style={{ fontFamily: "var(--mono)" }}>{c.folio}</span> · {c.solicitante?.nombre}</div>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>{textoSemana(c.semana)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{c.fueraDeCorte && <Chip c={C_AMARILLO}>Pedida fuera de tiempo</Chip>}<Chip c={C_ESTADO[c.estado]}>{ESTADOS_CAJA[c.estado].label}</Chip></div>
        </div>
        {paso >= 0 && <div style={{ display: "grid", gridTemplateColumns: `repeat(${PASOS_CAJA.length}, minmax(0,1fr))`, gap: 6 }}>
          {PASOS_CAJA.map((p, i) => <div key={p}>
            <div style={{ height: 5, borderRadius: 99, background: i <= paso ? (i === paso && paso < 4 ? ORANGE : "#2E9E63") : "rgba(44,42,40,.1)" }} />
            <div style={{ fontSize: isMobile ? 10 : 11.5, fontWeight: i === paso ? 800 : 600, color: i <= paso ? CHARCOAL : "#A39C92", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p}</div>
          </div>)}
        </div>}
        <Desglose caja={c} />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${isMobile ? 2 : 4}, minmax(0,1fr))`, gap: 16 }}>
          {cifra("Pedido", fmtL(t.pedido))}
          {cifra(c.acreditacion ? "Acreditado" : "Aprobado", c.acreditacion ? fmtL(t.acreditado) : c.aprobacion ? fmtL(t.aprobado) : "—", c.acreditacion ? C_VERDE.color : undefined)}
          {cifra("Gastado", fmtL(t.gastado), "#A94E16")}
          {t.falta ? cifra("Gastó de más", fmtL(t.falta), C_ROJO.color) : cifra(c.liquidacion ? "Devuelto" : "Queda", fmtL(c.liquidacion ? (c.liquidacion.devolucion?.monto || 0) : t.queda))}
        </div>
        {barra(t)}
        {c.estado === "rechazada" && nota(C_ROJO, `${c.rechazo?.por} la rechazó: ${c.rechazo?.motivo}`)}
        {c.aprobacion?.comentario && nota(C_AZUL, `${c.aprobacion.por}: ${c.aprobacion.comentario}`)}
        {esDueno && ["solicitada", "aprobada"].includes(c.estado) && nota(C_GRIS, "Todavía no se acredita, pero ya podés ir registrando tus compras con su factura.")}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {esDueno && puedeRegistrarGasto(c) && <Btn onClick={() => setModal({ t: "gasto", caja: c })}>+ Registrar compra</Btn>}
          {puedeAprobar(userRole, userKey, c) && <Btn onClick={() => setModal({ t: "decidir", caja: c })}>Aprobar o rechazar</Btn>}
          {perm.acredita && c.estado === "aprobada" && <Btn onClick={() => setModal({ t: "acreditar", caja: c })}>Acreditar</Btn>}
          {esDueno && puedeLiquidar(c) && <Btn variant="dark" onClick={() => setModal({ t: "liquidar", caja: c })}>Liquidar caja</Btn>}
          {perm.cierra && puedeCerrar(c) && <Btn onClick={() => { if (confirm(`¿Cerrar la caja ${c.folio}?`)) cerrar(c.id); }}>Cerrar caja</Btn>}
          {c.acreditacion?.comprobante && <Btn variant="ghost" onClick={() => ver(c.acreditacion.comprobante)}>Comprobante de transferencia</Btn>}
          {c.liquidacion?.devolucion?.comprobante && <Btn variant="ghost" onClick={() => ver(c.liquidacion.devolucion.comprobante)}>Comprobante de devolución</Btn>}
          {(gs.length > 0 || c.acreditacion) && <Btn variant="ghost" disabled={ocupado} onClick={() => bajarPdf(c)}>{ocupado ? "Generando…" : "Liquidación PDF"}</Btn>}
          {esDueno && puedeCancelar(c) && <Btn variant="danger" onClick={() => { if (confirm(`¿Cancelar la solicitud ${c.folio}?`)) cancelar(c.id); }}>Cancelar solicitud</Btn>}
        </div>
      </div>

      <div className="gt-vidrio" style={{ padding: isMobile ? "14px 16px" : "18px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <div style={{ font: "800 16px/1.2 var(--display)" }}>Compras registradas</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>{gs.length ? `${t.validados} de ${gs.length} validadas${c.tipo === "combustible" && t.galones ? ` · ${t.galones} gal` : ""}` : ""}</div>
        </div>
        {gs.length ? gs.map((g, i) => filaGasto(c, g, i)) : <div style={{ padding: "22px 0 10px", color: "var(--text-3)", fontSize: 14 }}>Sin compras todavía.</div>}
      </div>

      <details className="gt-vidrio" style={{ padding: isMobile ? "12px 16px" : "14px 26px" }}>
        <summary style={{ cursor: "pointer", font: "700 13px/1.4 var(--sans)", color: "var(--text-3)" }}>Historial</summary>
        <div style={{ marginTop: 10, display: "grid", gap: 7 }}>{[...(c.audit || [])].reverse().map((a, i) => <div key={i} style={{ fontSize: 12.5, color: "#5C5853", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{String(a.accion).replace(/_/g, " ")}{a.monto ? ` · ${fmtL(a.monto)}` : ""} · {a.por}</span><span style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtFechaHora(a.at)}</span>
        </div>)}</div>
      </details>
    </>;
  };

  const cuerpo = cajaAbierta ? renderDetalle(cajaAbierta)
    : secOk === "mis" ? renderMis()
    : secOk === "aprobar" ? lista(cajas.filter(c => puedeAprobar(userRole, userKey, c)), "No hay cajas por aprobar.")
    : secOk === "acreditar" ? lista(cajas.filter(c => c.estado === "aprobada"), "No hay cajas por acreditar.")
    : secOk === "facturas" ? renderFacturas()
    : secOk === "porcerrar" ? renderPorCerrar()
    : renderTodas();

  const mc = modal?.caja ? (cajas.find(x => x.id === modal.caja.id) || modal.caja) : null;
  const rolTxt = ROLE_LABEL[userRole] || userRole;

  return <div className="gt-entra-modulo" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh", fontFamily: "inherit", background: "#F9F9F8", color: CHARCOAL }}>
    <style>{GT_CSS}</style>
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />
    {isMobile && <>
      <style>{MOVIL_CSS}</style>
      <BarraMovil titulo="GeoFinance" icono={<IconoFinance size={18} />} usuario={userName} rol={rolTxt} onLogout={onLogout} />
      <BarraInferior tituloMas="GeoFinance" secciones={nav} activa={secOk} onElegir={irA} />
    </>}
    {!isMobile && <>
      <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
          <Logo size={34} />
          <div title="GeoFinance — Cajas chicas" aria-label="GeoFinance" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconoFinance /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{userName || "Usuario"}</div>
            <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{rolTxt}</div>
          </div>
          {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Cerrar sesión</button>}
        </div>
      </div>
      {nav.length > 1 && <div style={{ position: "relative", zIndex: 2, display: "flex", borderBottom: "1px solid rgba(44,42,40,.08)", overflowX: "auto", whiteSpace: "nowrap", flexShrink: 0, paddingLeft: 20 }}>
        {nav.map(x => { const activo = secOk === x.id && !cajaAbierta; return <button key={x.id} onClick={() => irA(x.id)} style={{ padding: "14px 18px", background: "transparent", border: "none", boxShadow: activo ? `inset 0 -2px 0 ${ORANGE}` : "none", color: activo ? "var(--naranja-tinta)" : "var(--text-3)", cursor: "pointer", fontSize: 13.5, fontWeight: activo ? 800 : 600, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>{x.label}{x.badge > 0 && <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: ORANGE, color: "#fff", fontSize: 10.5, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{x.badge}</span>}</button>; })}
      </div>}
    </>}
    <div style={{ position: "relative", zIndex: 1, flex: 1 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "8px 14px 24px" : "20px 32px 40px", display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 12 }}>
        {isMobile && !cajaAbierta && <TituloMovil>{(nav.find(x => x.id === secOk) || {}).label || "GeoFinance"}</TituloMovil>}
        {cuerpo}
      </div>
    </div>
    {modal?.t === "pedir" && <SolicitudForm proyectos={proyectos} cajas={cajas} equipos={vehiculos} userKey={userKey} proyectoInicial={(() => { let p = ""; try { p = localStorage.getItem(`gt-fn-proy-${userKey}`) || ""; } catch { /* sin preferencia */ } if (!p && userRole === "logistica") p = "PLAN-TALLER"; return proyectos.some(x => x.short === p) ? p : ""; })()} onGuardar={async (f) => { const c = await crearCaja(f); if (c) setAbierta(c.id); return !!c; }} onClose={() => setModal(null)} />}
    {modal?.t === "decidir" && mc && <DecisionForm caja={mc} onAprobar={(m, n) => aprobar(mc.id, m, n)} onRechazar={(n) => rechazar(mc.id, n)} onClose={() => setModal(null)} />}
    {modal?.t === "acreditar" && mc && <AcreditarForm caja={mc} onGuardar={(d) => acreditar(mc.id, d)} onVer={ver} onClose={() => setModal(null)} />}
    {modal?.t === "gasto" && mc && <GastoForm caja={mc} gasto={modal.gasto} equipos={vehiculos} onGuardar={(g) => guardarGasto(mc.id, g)} onVer={ver} onClose={() => setModal(null)} />}
    {modal?.t === "liquidar" && mc && <LiquidarForm caja={mc} onGuardar={(d) => liquidar(mc.id, d)} onVer={ver} onClose={() => setModal(null)} />}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}
