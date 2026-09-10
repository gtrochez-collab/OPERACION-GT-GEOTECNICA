// ═══════════════════════════════════════════════════════════════════════════
// GeoCost — formularios y modales (9-sep-2026). TODOS a NIVEL DE MÓDULO (un
// componente definido dentro de otro se remonta y pierde lo tipeado).
// No hablan con `store`: reciben onSave(...) → Promise<boolean> (true = OK).
// Mientras esperan muestran "Guardando — no cerrés" y bloquean el cierre; si
// vuelve false se quedan abiertos (el padre ya avisó con alert).
// Lo tipeado vive como STRING en el estado (inputs controlados) y se convierte
// a número con num() al guardar — nunca antes.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useMemo, useRef } from "react";
import {
  Input, Select, Textarea, Btn, Chip, Modal, Label, useIsMobile,
  fmtUSD, fmtL, fmtUSD0, fmtFecha, fmtFechaHora, uid,
  C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, ORANGE, CHARCOAL,
} from "./geocost-ui.jsx";
import {
  CATEGORIAS, MODULOS_PARTIDA, UNIDADES, RENGLONES_MOV_DEFAULT, TASA_DEFAULT,
  num, hnlToUsd, usdToHnl, montoPartida, partidasParaModulo, PLANTILLA_VILLA_SAN_MIGUEL,
} from "./geocost-calc.js";

// ── Estados de una movilización (flujo de colores igual a GeoShopping) ──
export const ESTADOS_MOV = {
  solicitada: { label: "Solicitada", ...C_GRIS },
  recibida:   { label: "Recibida",   ...C_AZUL },
  acreditada: { label: "Acreditada", ...C_VERDE },
  cancelada:  { label: "Cancelada",  color: "#B03024", bg: "rgba(192,57,43,.08)" },
};

// ── Constantes locales ──
const SOLUCIONES = ["Cimentación", "Retención", "Anclajes", "Micropilotes", "Inyección"];
const BANCOS = ["BAC Credomatic", "Banco Atlántida", "Ficohsa", "Banpaís", "Banco de Occidente", "Davivienda", "Banrural", "Lafise", "Promerica", "Banhcafé", "Ficensa", "Banco Azteca"];
const TIPOS_CUENTA = ["Ahorros", "Cheques"];
const MAX_FILE = 2 * 1024 * 1024;   // comprobante ≤ 2 MB: el límite empírico de cp-file-* (más grande, store.set falla contra Supabase)
const fmtMB = (b) => (Number(b || 0) / 1024 / 1024).toFixed(2) + " MB";

const LBL   = { fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" };  // espejo del LABEL de geocost-ui (no exportado)
const CELDA = { padding: "8px 10px", fontSize: 13, borderRadius: 10 };                       // inputs compactos de tabla
const MONO  = { fontFamily: "var(--mono)", fontVariantNumeric: "tabular-nums" };
const SUNK  = { background: "#F4F4F2", border: "1px solid rgba(44,42,40,.06)", borderRadius: 14, padding: "12px 14px" };

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// número guardado → texto para input controlado ("" si no hay)
const str = (x) => (x == null || x === "" || Number(x) === 0) ? "" : String(x);
const normMaq = (s) => String(s || "").replace(/[\s-]/g, "").toUpperCase();
// Hoy en Tegucigalpa (YYYY-MM-DD) — nunca la hora local del dispositivo
const hoyISO = () => {
  try { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
};
// Días de calendario entre dos "YYYY-MM-DD" (en UTC para que no corran). SIN +1:
// 9-sep → 14-oct = 35 días, igual que la ficha que Gerson armaba y que el PDF.
const diasEntre = (a, b) => {
  if (!a || !b) return 0;
  const d = (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000;
  return isNaN(d) ? 0 : Math.round(d);
};
// `proyectosNombre` puede venir como función, Map u objeto {short: nombre}
const nombreDe = (proyectosNombre, short) => {
  try {
    if (typeof proyectosNombre === "function") return proyectosNombre(short) || short;
    if (proyectosNombre instanceof Map) return proyectosNombre.get(short) || short;
    if (proyectosNombre && typeof proyectosNombre === "object") return proyectosNombre[short] || short;
  } catch { /* cae al short */ }
  return short || "";
};

// ── Iconos de línea (stroke 1.8, sin emojis) ──
const Ico = ({ d, size = 16, style: sx }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={sx}>{d}</svg>;
const ICO = {
  x:       <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  mas:     <><path d="M5 12h14" /><path d="M12 5v14" /></>,
  flecha:  <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  clip:    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  ojo:     <><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>,
  check:   <path d="M20 6 9 17l-5-5" />,
};

// ── Piezas compartidas ──
const SPIN_CSS = `@keyframes gcSpin{to{transform:rotate(360deg)}}`;
// Chip de guardado. Se muestra junto a los botones y el modal no se puede cerrar mientras esté.
export function Guardando({ texto = "Guardando — no cerrés" }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: C_NARANJA.color, background: C_NARANJA.bg }}>
    <style>{SPIN_CSS}</style>
    <span style={{ width: 13, height: 13, border: `2px solid ${ORANGE}`, borderTopColor: "transparent", borderRadius: "50%", animation: "gcSpin .8s linear infinite", flexShrink: 0 }} />
    {texto}
  </span>;
}

const BtnQuitar = ({ onClick, title = "Quitar", disabled }) => <button type="button" onClick={onClick} title={title} aria-label={title} disabled={disabled} style={{ width: 30, height: 30, borderRadius: "50%", border: "1px solid rgba(44,42,40,.10)", background: "rgba(44,42,40,.04)", color: "#6E6862", cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0, opacity: disabled ? .5 : 1 }}><Ico d={ICO.x} size={14} /></button>;

// Bloque plegable (acordeón simple: cada uno abre/cierra por su lado)
const Seccion = ({ titulo, sub, abierta, onToggle, derecha, children }) => <div style={{ border: "1px solid rgba(44,42,40,.08)", borderRadius: 16, overflow: "hidden", background: "#fff" }}>
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "rgba(44,42,40,.03)" }}>
    <button type="button" onClick={onToggle} aria-expanded={abierta} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", color: CHARCOAL, textAlign: "left", fontFamily: "inherit" }}>
      <span style={{ display: "inline-flex", color: "#6E6862", transition: "transform .2s var(--curva)", transform: abierta ? "rotate(0)" : "rotate(-90deg)" }}><Ico d={ICO.chevron} /></span>
      <span style={{ font: "700 14px/1.2 var(--display)" }}>{titulo}</span>
      {sub && <span style={{ fontSize: 12, color: "#6E6862", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>}
    </button>
    {derecha}
  </div>
  {abierta && <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>}
</div>;

const PieAcciones = ({ saving, onClose, izquierda, children }) => <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
  <div style={{ fontSize: 12, color: "#6E6862" }}>{izquierda}</div>
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    {saving && <Guardando />}
    <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
    {children}
  </div>
</div>;

const Dato = ({ label, children, mono }) => <div style={{ minWidth: 0 }}>
  <div style={LBL}>{label}</div>
  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3, overflowWrap: "anywhere", ...(mono ? MONO : {}) }}>{children || "—"}</div>
</div>;

// ═══════════════════════════════════════════════════════════════════════════
// PRESUPUESTO — proyecto + partidas (USD) + ficha
// ═══════════════════════════════════════════════════════════════════════════
const filaPartidaVacia = (base = {}) => ({ id: uid(), categoria: "Generales", nombre: "", unidad: "Global", cantidad: "1", pu: "", monto: "", modulo: "compras", nota: "", ...base });
const filaMaterialVacia = () => ({ id: uid(), descripcion: "", cantidad: "", unidad: "" });
// partida guardada (números) → fila editable (strings). Si cantidad y pu vienen, el monto se calcula.
const partidaAFila = (p) => {
  const calc = num(p.cantidad) > 0 && num(p.pu) > 0;
  return { id: p.id || uid(), categoria: p.categoria || "Generales", nombre: p.nombre || "", unidad: p.unidad || "", cantidad: str(p.cantidad), pu: str(p.pu), monto: calc ? "" : str(p.monto), modulo: p.modulo || "libre", nota: p.nota || "" };
};
const fichaDesde = (fi) => {
  const f = fi || {};
  return {
    codigo: f.codigo || "", cliente: f.cliente || "", solucion: f.solucion || "", fechaInicio: f.fechaInicio || "", fechaFin: f.fechaFin || "", pm: f.pm || "",
    maquinaIds: Array.isArray(f.maquinaIds) ? [...f.maquinaIds] : [], maquinasTexto: f.maquinasTexto || "",
    materiales: (f.materiales || []).map(m => ({ id: m.id || uid(), descripcion: m.descripcion || "", cantidad: str(m.cantidad), unidad: m.unidad || "" })),
    notas: f.notas || "",
  };
};
// Misma regla que montoPartida de calc, pero sobre la fila con strings
const esCalculada = (r) => num(r.cantidad) > 0 && num(r.pu) > 0;
const montoFila = (r) => montoPartida({ cantidad: num(r.cantidad), pu: num(r.pu), monto: num(r.monto) });
const OPC_MODULOS = Object.entries(MODULOS_PARTIDA).map(([value, label]) => ({ value, label }));
// Suma 834px + 7 gaps de 8 = 890 ≤ ~898 que da el modal wide (980 − padding − Seccion):
// la versión anterior (968 + gaps) dejaba Módulo y la ✕ fuera sin barra visible.
const COLS_PARTIDA = "118px minmax(170px,1fr) 96px 80px 96px 104px 140px 30px";
const MIN_TABLA_PARTIDA = 890;

export function PresupuestoForm({ pres, proyectos = [], machines = [], tasa = TASA_DEFAULT, userName, onSave, onClose }) {
  const isMobile = useIsMobile();
  const edicion = !!pres;
  const [projectCode, setProjectCode] = useState(pres?.projectCode || "");
  const [partidas, setPartidas] = useState(() => (pres?.partidas || []).map(partidaAFila));
  const [ficha, setFicha] = useState(() => fichaDesde(pres?.ficha));
  const [abierta, setAbierta] = useState({ partidas: true, ficha: !!(pres?.ficha?.cliente || pres?.ficha?.codigo) });
  const [saving, setSaving] = useState(false);

  const uF = (k, v) => setFicha(f => ({ ...f, [k]: v }));
  const uP = (id, k, v) => setPartidas(ps => ps.map(r => r.id === id ? { ...r, [k]: v } : r));
  const quitarP = (id) => setPartidas(ps => ps.filter(r => r.id !== id));
  const agregarP = () => setPartidas(ps => { const ult = ps[ps.length - 1]; return [...ps, filaPartidaVacia({ categoria: ult?.categoria || "Generales", modulo: ult?.modulo || "compras" })]; });
  const uM = (id, k, v) => setFicha(f => ({ ...f, materiales: f.materiales.map(m => m.id === id ? { ...m, [k]: v } : m) }));
  const quitarM = (id) => setFicha(f => ({ ...f, materiales: f.materiales.filter(m => m.id !== id) }));
  const agregarM = () => setFicha(f => ({ ...f, materiales: [...f.materiales, filaMaterialVacia()] }));
  const toggleMaq = (id) => setFicha(f => ({ ...f, maquinaIds: f.maquinaIds.includes(id) ? f.maquinaIds.filter(x => x !== id) : [...f.maquinaIds, id] }));

  const total = useMemo(() => partidas.reduce((s, r) => s + montoFila(r), 0), [partidas]);
  const opcProy = useMemo(() => (proyectos || []).map(p => ({ value: p.short, label: p.name && p.name !== p.short ? `${p.short} — ${p.name}` : p.short })), [proyectos]);
  const etiquetaProy = (proyectos || []).find(p => p.short === projectCode)?.name;
  const dias = diasEntre(ficha.fechaInicio, ficha.fechaFin);

  // Plantilla VSM: solo si el proyecto es ese y todavía no hay partidas. Lo ya tipeado en la ficha gana.
  const puedePrecargar = !!PLANTILLA_VILLA_SAN_MIGUEL && projectCode === PLANTILLA_VILLA_SAN_MIGUEL.projectCode && partidas.length === 0;
  const precargar = () => {
    const T = PLANTILLA_VILLA_SAN_MIGUEL;
    setPartidas((T.partidas || []).map(p => partidaAFila({ ...p, id: uid() })));
    const bg = (machines || []).find(m => normMaq(m.nombre) === "BG11B");
    setFicha(f => {
      const t = fichaDesde(T.ficha);
      t.materiales = t.materiales.map(m => ({ ...m, id: uid() }));
      const out = { ...t };
      for (const k of ["codigo", "cliente", "solucion", "fechaInicio", "fechaFin", "pm", "maquinasTexto", "notas"]) if (f[k]) out[k] = f[k];
      if (f.materiales.length) out.materiales = f.materiales;
      out.maquinaIds = Array.from(new Set([...f.maquinaIds, ...t.maquinaIds, ...(bg ? [bg.id] : [])]));
      return out;
    });
    setAbierta({ partidas: true, ficha: true });
  };

  const guardar = async () => {
    if (saving) return;
    if (!projectCode) return alert("Elegí el proyecto.");
    const vacias = [], malas = [], limpias = [];
    partidas.forEach((r, i) => {
      const nombre = (r.nombre || "").trim(); const monto = montoFila(r);
      if (!nombre && monto <= 0 && !num(r.pu)) return vacias.push(i);           // fila sin nada: se descarta
      if (!nombre || monto <= 0) return malas.push(`${i + 1}${nombre ? ` (${nombre})` : ""}`);
      limpias.push({ id: r.id, categoria: r.categoria || "Otros", nombre, unidad: (r.unidad || "").trim(), cantidad: num(r.cantidad), pu: num(r.pu), monto: round2(monto), modulo: r.modulo || "libre", nota: (r.nota || "").trim() });
    });
    if (malas.length) return alert(`Falta nombre o monto en la partida ${malas.join(", ")}.`);
    if (!limpias.length) return alert("Agregá al menos una partida con nombre y monto.");
    if (ficha.fechaInicio && ficha.fechaFin && ficha.fechaFin < ficha.fechaInicio) return alert("La fecha de fin es anterior al inicio.");
    if (vacias.length) alert(`Se descarta${vacias.length > 1 ? "n" : ""} ${vacias.length} fila${vacias.length > 1 ? "s" : ""} vacía${vacias.length > 1 ? "s" : ""}.`);
    const fichaLimpia = {
      codigo: ficha.codigo.trim(), cliente: ficha.cliente.trim(), solucion: ficha.solucion.trim(), fechaInicio: ficha.fechaInicio, fechaFin: ficha.fechaFin, pm: ficha.pm.trim(),
      maquinaIds: [...ficha.maquinaIds], maquinasTexto: ficha.maquinasTexto.trim(),
      materiales: ficha.materiales.filter(m => m.descripcion.trim()).map(m => ({ id: m.id, descripcion: m.descripcion.trim(), cantidad: num(m.cantidad), unidad: (m.unidad || "").trim() })),
      notas: ficha.notas.trim(),
    };
    const presListo = { ...(pres || {}), projectCode, ficha: fichaLimpia, partidas: limpias, moneda: "USD", estado: pres?.estado || "activo" };
    setSaving(true);
    try { const ok = await onSave(presListo); setSaving(false); if (ok) onClose?.(); }
    catch (e) { setSaving(false); alert("No se pudo guardar: " + (e?.message || e)); }
  };

  // Controles de una fila de partida (con o sin label, para tabla o tarjeta móvil)
  const ctrl = (r, lbl) => {
    const calc = esCalculada(r);
    const L = (t) => lbl ? t : undefined;
    return {
      categoria: <Select label={L("Categoría")} options={CATEGORIAS} value={r.categoria} onChange={e => uP(r.id, "categoria", e.target.value)} style={CELDA} />,
      nombre:    <Input label={L("Partida")} value={r.nombre} onChange={e => uP(r.id, "nombre", e.target.value)} placeholder="Nombre de la partida" style={CELDA} />,
      unidad:    <Input label={L("Unidad")} value={r.unidad} list="gc-unidades" onChange={e => uP(r.id, "unidad", e.target.value)} placeholder="Unidad" style={CELDA} />,
      cantidad:  <Input label={L("Cant.")} type="number" min="0" step="any" inputMode="decimal" value={r.cantidad} onChange={e => uP(r.id, "cantidad", e.target.value)} placeholder="0" style={{ ...CELDA, ...MONO }} />,
      pu:        <Input label={L("P.U. $")} type="number" min="0" step="any" inputMode="decimal" value={r.pu} onChange={e => uP(r.id, "pu", e.target.value)} placeholder="0.00" style={{ ...CELDA, ...MONO }} />,
      monto:     <Input label={L("Monto $")} type="number" min="0" step="any" inputMode="decimal" value={calc ? String(montoFila(r)) : r.monto} disabled={calc} onChange={e => uP(r.id, "monto", e.target.value)} placeholder="0.00" title={calc ? "Cantidad × P.U." : "Monto directo"} style={{ ...CELDA, ...MONO, fontWeight: 700, color: calc ? "#5C5853" : CHARCOAL, background: calc ? "rgba(44,42,40,.03)" : undefined }} />,
      modulo:    <Select label={L("Módulo")} options={OPC_MODULOS} value={r.modulo} onChange={e => uP(r.id, "modulo", e.target.value)} style={CELDA} />,
      quitar:    <BtnQuitar onClick={() => quitarP(r.id)} title="Quitar partida" />,
    };
  };

  return <Modal title={edicion ? "Editar presupuesto" : "Nuevo presupuesto"} wide fondoCierra={false} onClose={saving ? undefined : onClose}>
    <datalist id="gc-unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist>
    <datalist id="gc-soluciones">{SOLUCIONES.map(s => <option key={s} value={s} />)}</datalist>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* A) Proyecto */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile || !puedePrecargar ? "minmax(0,1fr)" : "minmax(0,1fr) auto", gap: 10, alignItems: "end" }}>
        {edicion
          ? <Input label="Proyecto" value={etiquetaProy && etiquetaProy !== projectCode ? `${projectCode} — ${etiquetaProy}` : projectCode} disabled />
          : <Select label="Proyecto *" options={opcProy} value={projectCode} onChange={e => setProjectCode(e.target.value)} emptyLabel="Elegí el proyecto" />}
        {puedePrecargar && <Btn variant="ghost" onClick={precargar}>Precargar Villa San Miguel</Btn>}
      </div>

      {/* B) Partidas */}
      <Seccion titulo="Partidas" sub={`${partidas.length} · ${fmtUSD0(total)}`} abierta={abierta.partidas} onToggle={() => setAbierta(a => ({ ...a, partidas: !a.partidas }))}
        derecha={<Btn variant="ghost" small onClick={agregarP}><Ico d={ICO.mas} size={13} /> Partida</Btn>}>
        {!partidas.length && <div style={{ textAlign: "center", padding: "14px 0", color: "#6E6862", fontSize: 13 }}>Sin partidas todavía.</div>}
        {!!partidas.length && (isMobile
          ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* minmax(0,1fr): con "1fr 1fr" los Select de opciones largas inflaban el track y la tarjeta se salía del modal */}
              {partidas.map(r => { const c = ctrl(r, true); return <div key={r.id} style={{ ...SUNK, display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8 }}>
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "flex-end" }}><div style={{ flex: 1, minWidth: 0 }}>{c.nombre}</div>{c.quitar}</div>
                {c.categoria}{c.modulo}{c.unidad}{c.cantidad}{c.pu}{c.monto}
              </div>; })}
            </div>
          : <div style={{ overflowX: "auto", paddingBottom: 4 }}>
              <div style={{ minWidth: MIN_TABLA_PARTIDA }}>
                <div style={{ display: "grid", gridTemplateColumns: COLS_PARTIDA, gap: 8, padding: "0 2px 6px" }}>
                  {["Categoría", "Partida", "Unidad", "Cant.", "P.U. $", "Monto $", "Módulo", ""].map((h, i) => <Label key={i}>{h}</Label>)}
                </div>
                {partidas.map(r => { const c = ctrl(r, false); return <div key={r.id} style={{ display: "grid", gridTemplateColumns: COLS_PARTIDA, gap: 8, alignItems: "center", padding: "3px 2px" }}>
                  {c.categoria}{c.nombre}{c.unidad}{c.cantidad}{c.pu}{c.monto}{c.modulo}{c.quitar}
                </div>; })}
              </div>
            </div>)}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(44,42,40,.08)" }}>
          <Label>Total</Label>
          <span style={{ font: "800 22px/1 var(--display)", letterSpacing: "-.01em" }}>{fmtUSD(total)}</span>
          <span style={{ fontSize: 12, color: "#6E6862", ...MONO }}>{fmtL(usdToHnl(total, tasa))} · L {Number(tasa).toFixed(2)} / $</span>
        </div>
      </Seccion>

      {/* C) Ficha */}
      <Seccion titulo="Ficha" sub={ficha.cliente || ficha.codigo || undefined} abierta={abierta.ficha} onToggle={() => setAbierta(a => ({ ...a, ficha: !a.ficha }))}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))", gap: 10 }}>
          <Input label="Código" value={ficha.codigo} onChange={e => uF("codigo", e.target.value)} placeholder="HF-12-4-19 (2026)" />
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}><Input label="Cliente" value={ficha.cliente} onChange={e => uF("cliente", e.target.value)} /></div>
          <Input label="Solución" list="gc-soluciones" value={ficha.solucion} onChange={e => uF("solucion", e.target.value)} placeholder="Cimentación" />
          <Input label="Inicio" type="date" value={ficha.fechaInicio} onChange={e => uF("fechaInicio", e.target.value)} />
          <Input label="Fin" hint={dias > 0 ? `${dias} días` : undefined} type="date" value={ficha.fechaFin} onChange={e => uF("fechaFin", e.target.value)} />
          <Input label="PM" value={ficha.pm} onChange={e => uF("pm", e.target.value)} />
          <div style={{ gridColumn: isMobile ? "auto" : "span 2" }}><Input label="Máquinas (texto)" value={ficha.maquinasTexto} onChange={e => uF("maquinasTexto", e.target.value)} placeholder="Piloteadora BG-11-B" /></div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LBL}>Máquinas</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(machines || []).map(m => { const on = ficha.maquinaIds.includes(m.id); return <button type="button" key={m.id} onClick={() => toggleMaq(m.id)} aria-pressed={on}
              style={{ borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: `1px solid ${on ? "rgba(232,118,45,.45)" : "rgba(44,42,40,.12)"}`, background: on ? "rgba(232,118,45,.14)" : "#F4F4F2", color: on ? "#A94E16" : "#5C5853", display: "inline-flex", alignItems: "center", gap: 5 }}>
              {on && <Ico d={ICO.check} size={12} />}{m.nombre}{m.tipo === "compresor" ? " · compresor" : ""}
            </button>; })}
            {!(machines || []).length && <span style={{ fontSize: 12, color: "#6E6862" }}>Sin máquinas cargadas.</span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={LBL}>Materiales recurrentes</span>
            <Btn variant="ghost" small onClick={agregarM}><Ico d={ICO.mas} size={13} /> Material</Btn>
          </div>
          {ficha.materiales.map(m => <div key={m.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr) 80px 30px" : "minmax(0,1fr) 110px 150px 30px", gap: 8, alignItems: "center" }}>
            <div style={{ gridColumn: isMobile ? "1 / -1" : "auto" }}><Input value={m.descripcion} onChange={e => uM(m.id, "descripcion", e.target.value)} placeholder="Descripción" style={CELDA} /></div>
            <Input type="number" min="0" step="any" inputMode="decimal" value={m.cantidad} onChange={e => uM(m.id, "cantidad", e.target.value)} placeholder="Cant." style={{ ...CELDA, ...MONO }} />
            {isMobile
              ? <BtnQuitar onClick={() => quitarM(m.id)} title="Quitar material" />
              : <Input value={m.unidad} list="gc-unidades" onChange={e => uM(m.id, "unidad", e.target.value)} placeholder="Unidad" style={CELDA} />}
            {isMobile
              ? <div style={{ gridColumn: "1 / -1" }}><Input value={m.unidad} list="gc-unidades" onChange={e => uM(m.id, "unidad", e.target.value)} placeholder="Unidad" style={CELDA} /></div>
              : <BtnQuitar onClick={() => quitarM(m.id)} title="Quitar material" />}
          </div>)}
          {!ficha.materiales.length && <span style={{ fontSize: 12, color: "#6E6862" }}>Ninguno.</span>}
        </div>

        <Textarea label="Notas" value={ficha.notas} onChange={e => uF("notas", e.target.value)} style={{ minHeight: 56 }} />
      </Seccion>

      <PieAcciones saving={saving} onClose={onClose} izquierda={edicion ? `Editando ${pres.projectCode}` : "Los montos van en USD."}>
        <Btn onClick={guardar} disabled={saving}>{edicion ? "Guardar cambios" : "Crear presupuesto"}</Btn>
      </PieAcciones>
    </div>
  </Modal>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVILIZACIÓN — solicitud de fondos (solo admin la crea/edita en "solicitada")
// ═══════════════════════════════════════════════════════════════════════════
const renglonesDefault = () => RENGLONES_MOV_DEFAULT.map(c => ({ id: uid(), concepto: c, monto: "" }));
const movAForm = (mov, presActivos, proyectosNombre) => {
  if (mov) {
    const a = mov.acreditarA || {};
    const base = mov.renglones?.length ? mov.renglones : RENGLONES_MOV_DEFAULT.map(c => ({ concepto: c }));
    return {
      projectCode: mov.projectCode || "", partidaId: mov.partidaId || "", origen: mov.origen || "", destino: mov.destino || "", fecha: mov.fecha || hoyISO(),
      descripcion: mov.descripcion || "", carga: mov.carga || "", conductor: mov.conductor || "",
      renglones: base.map(r => ({ id: r.id || uid(), concepto: r.concepto || "", monto: str(r.monto) })),
      acreditarA: { nombre: a.nombre || "", banco: a.banco || "", tipoCuenta: a.tipoCuenta || "", cuenta: a.cuenta || "" }, notas: mov.notas || "",
    };
  }
  // Nueva: si hay un solo presupuesto activo, ya viene elegido
  const unico = presActivos.length === 1 ? presActivos[0] : null;
  return {
    projectCode: unico?.projectCode || "", partidaId: unico ? (partidasParaModulo(unico, "movilizacion")[0]?.id || "") : "",
    origen: "", destino: unico ? nombreDe(proyectosNombre, unico.projectCode) : "", fecha: hoyISO(), descripcion: "", carga: "", conductor: "",
    renglones: renglonesDefault(), acreditarA: { nombre: "", banco: "", tipoCuenta: "", cuenta: "" }, notas: "",
  };
};

export function MovilizacionForm({ mov, presupuestos = [], proyectosNombre, tasa = TASA_DEFAULT, userName, onSave, onClose }) {
  const isMobile = useIsMobile();
  const presActivos = useMemo(() => (presupuestos || []).filter(p => p && p.estado !== "cerrado"), [presupuestos]);
  const [f, setF] = useState(() => movAForm(mov, presActivos, proyectosNombre));
  const [saving, setSaving] = useState(false);
  const bloqueada = !!mov && mov.estado !== "solicitada";   // solo se edita mientras nadie la tocó

  const u = (k, v) => setF(x => ({ ...x, [k]: v }));
  const uA = (k, v) => setF(x => ({ ...x, acreditarA: { ...x.acreditarA, [k]: v } }));
  const uR = (id, k, v) => setF(x => ({ ...x, renglones: x.renglones.map(r => r.id === id ? { ...r, [k]: v } : r) }));
  const quitarR = (id) => setF(x => ({ ...x, renglones: x.renglones.filter(r => r.id !== id) }));
  const agregarR = () => setF(x => ({ ...x, renglones: [...x.renglones, { id: uid(), concepto: "", monto: "" }] }));

  const pres = presActivos.find(p => p.projectCode === f.projectCode) || (presupuestos || []).find(p => p.projectCode === f.projectCode) || null;
  const partidasMov = pres ? partidasParaModulo(pres, "movilizacion") : [];
  const total = f.renglones.reduce((s, r) => s + num(r.monto), 0);

  const opcProy = useMemo(() => {
    const o = presActivos.map(p => { const n = nombreDe(proyectosNombre, p.projectCode); return { value: p.projectCode, label: n && n !== p.projectCode ? `${p.projectCode} — ${n}` : p.projectCode }; });
    if (f.projectCode && !o.some(x => x.value === f.projectCode)) o.push({ value: f.projectCode, label: f.projectCode });   // presupuesto cerrado de una mov vieja
    return o;
  }, [presActivos, proyectosNombre, f.projectCode]);

  // Al cambiar de proyecto: partida default = primera de movilización; destino = nombre del proyecto si estaba vacío o era el del anterior
  const elegirProyecto = (code) => setF(x => {
    const p = presActivos.find(q => q.projectCode === code);
    const nombreAnterior = x.projectCode ? nombreDe(proyectosNombre, x.projectCode) : "";
    const destino = p && (!x.destino || x.destino === nombreAnterior) ? nombreDe(proyectosNombre, code) : x.destino;
    return { ...x, projectCode: code, partidaId: p ? (partidasParaModulo(p, "movilizacion")[0]?.id || "") : "", destino };
  });

  const guardar = async () => {
    if (saving || bloqueada) return;
    if (!f.projectCode) return alert("Elegí el proyecto.");
    if (!f.origen.trim()) return alert("Falta el origen.");
    if (!f.destino.trim()) return alert("Falta el destino.");
    if (!f.fecha) return alert("Falta la fecha.");
    const sinConcepto = f.renglones.findIndex(r => num(r.monto) > 0 && !r.concepto.trim());
    if (sinConcepto >= 0) return alert(`El renglón ${sinConcepto + 1} tiene monto pero no concepto.`);
    const renglones = f.renglones.filter(r => num(r.monto) > 0).map(r => ({ id: r.id, concepto: r.concepto.trim(), monto: round2(num(r.monto)) }));
    if (!renglones.length) return alert("Poné al menos un renglón con monto.");
    if (!f.acreditarA.nombre.trim()) return alert("Falta a nombre de quién se acredita.");
    const totalL = round2(renglones.reduce((s, r) => s + r.monto, 0));
    // Si la partida elegida ya no existe en el presupuesto, cae a la primera de movilización
    const partidaId = partidasMov.some(p => p.id === f.partidaId) ? f.partidaId : (partidasMov[0]?.id || f.partidaId || "");
    const movListo = {
      ...(mov || {}), projectCode: f.projectCode, partidaId, origen: f.origen.trim(), destino: f.destino.trim(), fecha: f.fecha,
      descripcion: f.descripcion.trim(), carga: f.carga.trim(), conductor: f.conductor.trim(), renglones, total: totalL,
      acreditarA: { nombre: f.acreditarA.nombre.trim(), banco: f.acreditarA.banco.trim(), tipoCuenta: f.acreditarA.tipoCuenta.trim(), cuenta: f.acreditarA.cuenta.trim() },
      notas: f.notas.trim(),
    };
    setSaving(true);
    try { const ok = await onSave(movListo); setSaving(false); if (ok) onClose?.(); }
    catch (e) { setSaving(false); alert("No se pudo guardar: " + (e?.message || e)); }
  };

  const COLS_R = isMobile ? "minmax(0,1fr) 120px 30px" : "minmax(0,1fr) 170px 30px";
  return <Modal title={mov ? `Editar ${mov.codigo || "solicitud"}` : "Solicitud de fondos"} wide fondoCierra={false} onClose={saving ? undefined : onClose}>
    <datalist id="gc-bancos">{BANCOS.map(b => <option key={b} value={b} />)}</datalist>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {bloqueada && <div style={{ ...SUNK, fontSize: 13, color: C_AMARILLO.color, background: C_AMARILLO.bg, border: "none" }}>Ya está {ESTADOS_MOV[mov.estado]?.label?.toLowerCase() || mov.estado}: no se puede editar.</div>}

      {/* Proyecto + partida */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1.4fr) minmax(0,1fr)", gap: 10, alignItems: "end" }}>
        <Select label="Proyecto *" options={opcProy} value={f.projectCode} onChange={e => elegirProyecto(e.target.value)} emptyLabel="Elegí el proyecto" disabled={bloqueada} />
        {pres && partidasMov.length > 1 && <Select label="Partida" options={partidasMov.map(p => ({ value: p.id, label: p.nombre }))} value={f.partidaId} onChange={e => u("partidaId", e.target.value)} disabled={bloqueada} />}
        {pres && partidasMov.length === 1 && <Input label="Partida" value={partidasMov[0].nombre} disabled />}
        {pres && partidasMov.length === 0 && <div style={{ fontSize: 12, color: C_AMARILLO.color, paddingBottom: 10 }}>Sin partida de movilización — quedará por clasificar.</div>}
      </div>

      {/* Ruta */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr) 160px", gap: 10 }}>
        <Input label="Origen *" value={f.origen} onChange={e => u("origen", e.target.value)} placeholder="Plantel central" disabled={bloqueada} />
        <Input label="Destino *" value={f.destino} onChange={e => u("destino", e.target.value)} placeholder="Proyecto" disabled={bloqueada} />
        <Input label="Fecha *" type="date" value={f.fecha} onChange={e => u("fecha", e.target.value)} disabled={bloqueada} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
        <Input label="Descripción" value={f.descripcion} onChange={e => u("descripcion", e.target.value)} placeholder="Lowboy + Isuzu — movilización de equipos" disabled={bloqueada} />
        <Input label="Carga / equipos" value={f.carga} onChange={e => u("carga", e.target.value)} placeholder="BG-11A" disabled={bloqueada} />
        <Input label="Conductor" value={f.conductor} onChange={e => u("conductor", e.target.value)} disabled={bloqueada} />
      </div>

      {/* Renglones */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={LBL}>Renglones</span>
          {!bloqueada && <Btn variant="ghost" small onClick={agregarR}><Ico d={ICO.mas} size={13} /> Renglón</Btn>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: COLS_R, gap: 8, padding: "0 2px" }}><Label>Concepto</Label><Label>Monto L</Label><span /></div>
        {f.renglones.map(r => <div key={r.id} style={{ display: "grid", gridTemplateColumns: COLS_R, gap: 8, alignItems: "center" }}>
          <Input value={r.concepto} onChange={e => uR(r.id, "concepto", e.target.value)} placeholder="Concepto" style={CELDA} disabled={bloqueada} />
          <Input type="number" min="0" step="any" inputMode="decimal" value={r.monto} onChange={e => uR(r.id, "monto", e.target.value)} placeholder="0.00" style={{ ...CELDA, ...MONO }} disabled={bloqueada} />
          <BtnQuitar onClick={() => quitarR(r.id)} title="Quitar renglón" disabled={bloqueada} />
        </div>)}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid rgba(44,42,40,.08)" }}>
          <Label>Total</Label>
          <span style={{ font: "800 22px/1 var(--display)", letterSpacing: "-.01em" }}>{fmtL(total)}</span>
          <span style={{ fontSize: 12, color: "#6E6862", ...MONO }}>{fmtUSD(hnlToUsd(total, tasa))} · L {Number(tasa).toFixed(2)} / $</span>
        </div>
      </div>

      {/* Acreditar a */}
      <div style={{ ...SUNK, display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(2, minmax(0,1fr))", gap: 10 }}>
        <div style={{ gridColumn: "1 / -1" }}><span style={LBL}>Acreditar a</span></div>
        <div style={{ gridColumn: "1 / -1" }}><Input label="Nombre *" value={f.acreditarA.nombre} onChange={e => uA("nombre", e.target.value)} disabled={bloqueada} style={{ background: "#fff" }} /></div>
        <Input label="Banco" list="gc-bancos" value={f.acreditarA.banco} onChange={e => uA("banco", e.target.value)} disabled={bloqueada} style={{ background: "#fff" }} />
        <Select label="Tipo de cuenta" options={TIPOS_CUENTA} value={f.acreditarA.tipoCuenta} onChange={e => uA("tipoCuenta", e.target.value)} disabled={bloqueada} style={{ background: "#fff" }} />
        <div style={{ gridColumn: "1 / -1" }}><Input label="N° de cuenta" value={f.acreditarA.cuenta} onChange={e => uA("cuenta", e.target.value)} inputMode="numeric" disabled={bloqueada} style={{ background: "#fff", ...MONO }} /></div>
      </div>

      <Textarea label="Notas" value={f.notas} onChange={e => u("notas", e.target.value)} style={{ minHeight: 52 }} disabled={bloqueada} />

      <PieAcciones saving={saving} onClose={onClose} izquierda={mov ? `Creada ${fmtFechaHora(mov.createdAt)}` : "Baja del presupuesto del proyecto."}>
        {!bloqueada && <Btn onClick={guardar} disabled={saving}>{mov ? "Guardar cambios" : "Solicitar fondos"}</Btn>}
      </PieAcciones>
    </div>
  </Modal>;
}

// ═══════════════════════════════════════════════════════════════════════════
// DETALLE DE MOVILIZACIÓN — lectura + acciones según perms
// ═══════════════════════════════════════════════════════════════════════════
const PASOS_MOV = [
  ["solicitada", "Solicitada", "createdAt", "createdBy"],
  ["recibida",   "Recibida",   "recibidaAt", "recibidaPor"],
  ["acreditada", "Acreditada", "acreditadaAt", "acreditadaPor"],
];

export function MovilizacionDetalle({ mov, pres, tasa = TASA_DEFAULT, perms = {}, onMarcarRecibida, onAdjuntarComprobante, onCancelar, onEliminar, onEditar, onVerComprobante, onClose }) {
  const isMobile = useIsMobile();
  const [busy, setBusy] = useState(null);   // texto del spinner mientras el padre trabaja
  const fileRef = useRef(null);
  if (!mov) return null;

  const est = ESTADOS_MOV[mov.estado] || ESTADOS_MOV.solicitada;
  const partida = (pres?.partidas || []).find(p => p.id === mov.partidaId);
  const renglones = mov.renglones || [];
  const total = num(mov.total) || renglones.reduce((s, r) => s + num(r.monto), 0);
  const a = mov.acreditarA || {};
  const idx = mov.estado === "cancelada" ? -1 : PASOS_MOV.findIndex(p => p[0] === mov.estado);
  const audit = (mov.audit || []).slice(-5).reverse();

  // Envuelve una acción del padre: spinner + cierre bloqueado + errores en alert
  const correr = async (texto, fn) => {
    if (busy || typeof fn !== "function") return false;
    setBusy(texto);
    try { const r = await fn(); setBusy(null); return r; }
    catch (e) { setBusy(null); alert("No se pudo completar: " + (e?.message || e)); return false; }
  };
  const recibir = () => correr("Marcando recibida…", () => onMarcarRecibida(mov));
  const cancelar = () => correr("Cancelando…", () => onCancelar(mov));        // el confirm() vive en el padre
  const eliminar = async () => { const r = await correr("Eliminando…", () => onEliminar(mov)); if (r) onClose?.(); };   // cierra solo si el padre confirma con true
  const elegirArchivo = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE) return alert(`El comprobante pesa ${fmtMB(file.size)}; el límite es 2 MB.\n\nComprimilo (PDF: https://smallpdf.com/compress-pdf) o sacale una foto en JPG de calidad media.`);
    await correr("Subiendo…", () => onAdjuntarComprobante(file, mov));
  };

  const titulo = <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
    <span style={{ ...MONO, fontWeight: 700 }}>{mov.codigo || "Movilización"}</span>
    <Chip c={est}>{est.label}</Chip>
  </span>;

  return <Modal title={titulo} wide onClose={busy ? undefined : onClose}>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Proyecto · ruta · fecha */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={LBL}>{mov.projectCode}</span>
            <Chip c={partida ? C_GRIS : C_AMARILLO}>{partida ? partida.nombre : "Por clasificar"}</Chip>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6, font: "800 20px/1.2 var(--display)", letterSpacing: "-.01em" }}>
            <span>{mov.origen || "—"}</span><Ico d={ICO.flecha} size={18} style={{ color: ORANGE, flexShrink: 0 }} /><span>{mov.destino || "—"}</span>
          </div>
        </div>
        <div style={{ textAlign: isMobile ? "left" : "right" }}>
          <div style={LBL}>Fecha</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>{fmtFecha(mov.fecha)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <Dato label="Descripción">{mov.descripcion}</Dato>
        <Dato label="Carga / equipos">{mov.carga}</Dato>
        <Dato label="Conductor">{mov.conductor}</Dato>
      </div>

      {/* Renglones */}
      <div style={{ border: "1px solid rgba(44,42,40,.08)", borderRadius: 14, overflow: "hidden" }}>
        {renglones.map((r, i) => <div key={r.id || i} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 14px", fontSize: 13.5, borderTop: i ? "1px solid rgba(44,42,40,.06)" : "none" }}>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{r.concepto || "—"}</span>
          <span style={{ ...MONO, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtL(r.monto)}</span>
        </div>)}
        {!renglones.length && <div style={{ padding: "9px 14px", fontSize: 13, color: "#6E6862" }}>Sin renglones.</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "10px 14px", background: "rgba(44,42,40,.04)", borderTop: "1px solid rgba(44,42,40,.08)" }}>
          <Label>Total</Label>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={{ font: "800 20px/1 var(--display)", letterSpacing: "-.01em" }}>{fmtL(total)}</span>
            <span style={{ fontSize: 12, color: "#6E6862", ...MONO }}>{fmtUSD(hnlToUsd(total, tasa))}</span>
          </span>
        </div>
      </div>

      {/* Acreditar a + comprobante */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <div style={SUNK}>
          <div style={LBL}>Acreditar a</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{a.nombre || "—"}</div>
          <div style={{ fontSize: 12.5, color: "#5C5853", marginTop: 2 }}>{[a.banco, a.tipoCuenta].filter(Boolean).join(" · ") || "—"}</div>
          {a.cuenta && <div style={{ ...MONO, fontSize: 13, marginTop: 4 }}>{a.cuenta}</div>}
        </div>
        <div style={SUNK}>
          <div style={LBL}>Comprobante</div>
          {mov.comprobanteFile
            ? <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 12.5, color: "#5C5853", overflowWrap: "anywhere" }}>{mov.comprobanteFile.name || "Archivo"}{mov.comprobanteFile.size ? ` · ${(mov.comprobanteFile.size / 1024).toFixed(0)} KB` : ""}</span>
                <Btn variant="ghost" small onClick={() => onVerComprobante?.(mov)} disabled={!!busy} style={{ alignSelf: "flex-start" }}><Ico d={ICO.ojo} size={14} /> Ver comprobante</Btn>
              </div>
            : <div style={{ fontSize: 13, color: "#6E6862", marginTop: 6 }}>{perms.puedeAcreditar ? "Al adjuntarlo queda Acreditada." : "Todavía no hay."}</div>}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <div style={{ display: "flex", alignItems: "center" }}>
          {PASOS_MOV.map(([k, label, atK, porK], i) => {
            const on = i <= idx; const c = ESTADOS_MOV[k];
            return <div key={k} style={{ display: "flex", alignItems: "center", flex: i < PASOS_MOV.length - 1 ? 1 : "0 0 auto" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, minWidth: 74 }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: on ? c.color : "#fff", border: `2px solid ${on ? c.color : "rgba(44,42,40,.18)"}`, boxSizing: "border-box" }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: on ? CHARCOAL : "#6E6862" }}>{label}</span>
                <span style={{ fontSize: 10.5, color: "#6E6862", textAlign: "center", lineHeight: 1.25, minHeight: 13 }}>{on && mov[atK] ? <>{fmtFechaHora(mov[atK])}{mov[porK] ? <><br />{mov[porK]}</> : null}</> : null}</span>
              </div>
              {i < PASOS_MOV.length - 1 && <span style={{ flex: 1, height: 2, margin: "0 6px 34px", background: i < idx ? ESTADOS_MOV[PASOS_MOV[i + 1][0]].color : "rgba(44,42,40,.10)", borderRadius: 2 }} />}
            </div>;
          })}
        </div>
        {mov.estado === "cancelada" && <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 700, color: ESTADOS_MOV.cancelada.color }}>Cancelada {mov.canceladaAt ? fmtFechaHora(mov.canceladaAt) : ""}{mov.canceladaPor ? ` · ${mov.canceladaPor}` : ""}</div>}
      </div>

      {/* Audit compacto */}
      {!!audit.length && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={LBL}>Historial</span>
        {audit.map((x, i) => <div key={i} style={{ fontSize: 12, color: "#5C5853", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...MONO, color: "#6E6862", fontSize: 11 }}>{fmtFechaHora(x.at)}</span>
          <span><b style={{ color: CHARCOAL }}>{x.action}</b>{x.by ? ` · ${x.by}` : ""}{x.note ? <span style={{ color: "#6E6862" }}> — {x.note}</span> : null}</span>
        </div>)}
      </div>}

      {mov.notas && <Dato label="Notas">{mov.notas}</Dato>}

      {/* Acciones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {perms.puedeCancelar && <Btn variant="danger" small onClick={cancelar} disabled={!!busy}>Cancelar solicitud</Btn>}
          {perms.puedeEliminar && <Btn variant="danger" small onClick={eliminar} disabled={!!busy}>Eliminar</Btn>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {busy && <Guardando texto={busy} />}
          <Btn variant="ghost" onClick={onClose} disabled={!!busy}>Cerrar</Btn>
          {perms.puedeEditar && <Btn variant="ghost" onClick={() => onEditar?.(mov)} disabled={!!busy}>Editar</Btn>}
          {perms.puedeRecibir && <Btn variant="info" onClick={recibir} disabled={!!busy}>Marcar recibida</Btn>}
          {perms.puedeAcreditar && <Btn variant="success" onClick={() => fileRef.current?.click()} disabled={!!busy}><Ico d={ICO.clip} size={14} /> Adjuntar comprobante</Btn>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={elegirArchivo} />
    </div>
  </Modal>;
}

// ═══════════════════════════════════════════════════════════════════════════
// TASA DE CAMBIO — modal chico (cc-config.tasa)
// ═══════════════════════════════════════════════════════════════════════════
export function AjustesTasa({ config, puedeEditar, onSave, onClose }) {
  const actual = num(config?.tasa) || TASA_DEFAULT;
  const [v, setV] = useState(String(actual));
  const [saving, setSaving] = useState(false);
  const hist = (config?.historialTasa || []).slice(-8).reverse();

  const guardar = async () => {
    if (saving) return;
    const t = num(v);
    if (!(t > 0)) return alert("Poné una tasa válida (mayor a 0).");
    if (t < 1 || t > 500) return alert("Esa tasa no parece real. Revisala.");
    if (Math.abs(t - actual) < 0.0001) return alert("Es la misma tasa de ahora.");
    setSaving(true);
    try { const ok = await onSave(round2(t)); setSaving(false); if (ok) onClose?.(); }
    catch (e) { setSaving(false); alert("No se pudo guardar: " + (e?.message || e)); }
  };

  return <Modal title="Tasa de cambio" onClose={saving ? undefined : onClose}>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ textAlign: "center", padding: "6px 0 2px" }}>
        <div style={{ font: "800 34px/1 var(--display)", letterSpacing: "-.02em" }}>L {actual.toFixed(2)} <span style={{ fontSize: 16, fontWeight: 600, color: "#6E6862" }}>por $1</span></div>
        <div style={{ fontSize: 12, color: "#6E6862", marginTop: 8 }}>
          {config?.tasaActualizadaAt ? `Actualizada ${fmtFechaHora(config.tasaActualizadaAt)}${config.tasaActualizadaPor ? ` · ${config.tasaActualizadaPor}` : ""}` : "Tasa por defecto."}
        </div>
      </div>

      {puedeEditar && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "end" }}>
        <Input label="Nueva tasa (L por $1)" type="number" min="0" step="0.01" inputMode="decimal" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter") guardar(); }} style={{ ...MONO, fontSize: 16, fontWeight: 700 }} disabled={saving} />
        <Btn onClick={guardar} disabled={saving}>Guardar</Btn>
      </div>}
      <div style={{ fontSize: 12, color: "#6E6862", textAlign: "center" }}>Convierte compras en L a USD para compararlas con el presupuesto.</div>

      {!!hist.length && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LBL}>Historial</span>
        <div style={{ border: "1px solid rgba(44,42,40,.08)", borderRadius: 12, overflow: "hidden" }}>
          {hist.map((h, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 12px", fontSize: 12.5, borderTop: i ? "1px solid rgba(44,42,40,.06)" : "none" }}>
            <span style={{ ...MONO, fontWeight: 700 }}>L {num(h.tasa).toFixed(2)}</span>
            <span style={{ color: "#6E6862", textAlign: "right" }}>{fmtFechaHora(h.at)}{h.por ? ` · ${h.por}` : ""}</span>
          </div>)}
        </div>
      </div>}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        {saving && <Guardando />}
        <Btn variant="ghost" onClick={onClose} disabled={saving}>Cerrar</Btn>
      </div>
    </div>
  </Modal>;
}
