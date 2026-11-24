// =====================================================================
// SUMINISTRO A OBRA — pantallas (24-nov-2026, Gerson)
// =====================================================================
// Viven dentro de GeoSupply:
//   · PlanificacionVista: la programación de entregas por proyecto (la carga
//     Neftalí, igual que su Excel: material · cantidad por día · total semana).
//   · CoberturaVista: lo que hay en obra (GeoInventory, lo cuenta el
//     residente) contra la programación → para cuántos días alcanza.
// La lógica pura vive en suministro-calc.js.
// =====================================================================
import { useState, useEffect, useMemo, useCallback } from "react";
import { store } from "./supabase.js";
import { hoyISO } from "./fechas.js";
import { Btn, Chip, Modal, C_GRIS, C_VERDE, C_AMARILLO, C_NARANJA, uid } from "./geocost-ui.jsx";
import { USERS } from "./users.js";
import { UNIDADES } from "./geocost-calc.js";
import { conteoAlDia, ultimoDiaConteo, esConsumible } from "./geoinventory-calc.js";
import {
  KEY_PROGRAMACIONES, KEY_PROYECTOS_ACTIVOS, DIAS_ROJO, DIAS_META, num, sumarDias, lunesDe, diasDeSemana, diaCorto, fechaCorta,
  semanasDe, cantidadDia, totalSemana, totalMaterial, programacionVigente, siguienteNumero, ponerCantidad, itemDeMaterial, coberturaProyecto, sinAcentos, resumenDias,
} from "./suministro-calc.js";
import { saldoDePartida, partidasPedibles } from "./geosupply-calc.js";
import { pdfSuministro } from "./suministro-reporte.js";

const CHARCOAL = "#2C2A28";
const ORANGE_DARK = "#C75F1F";
const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.08)" };
const SEMA = { rojo: { c: C_ROJO, txt: "Rojo" }, ambar: { c: C_AMARILLO, txt: "Ámbar" }, verde: { c: C_VERDE, txt: "Verde" }, sin_programa: { c: C_GRIS, txt: "Sin programación" }, sin_dato: { c: C_GRIS, txt: "No está en el inventario" } };
const fmtN = (n) => num(n).toLocaleString("es-HN", { maximumFractionDigits: 2 });
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString("es-HN", { timeZone: "America/Tegucigalpa", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const CTRL = { padding: "8px 10px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 10, fontSize: 14, outline: "none", background: "#F4F4F2", fontFamily: "inherit", boxSizing: "border-box", width: "100%" };
const TH = { padding: "8px 8px", fontSize: 11, fontWeight: 800, color: "#6E6862", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid rgba(44,42,40,.08)" };
const TD = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid rgba(44,42,40,.05)", verticalAlign: "middle" };
// Con qué se cubre cada día programado (la misma paleta en pantalla y en el PDF)
export const COB_DIA = {
  obra: { bg: "rgba(5,150,105,.13)", color: "#047857", txt: "Lo cubre lo que hay en obra" },
  almacen: { bg: "rgba(31,79,140,.12)", color: "#1F4F8C", txt: "Lo cubre el almacén · hay que mandarlo" },
  falta: { bg: "rgba(192,57,43,.14)", color: "#B03024", txt: "No alcanza · hay que comprar" },
};
const COB_CORTO = { obra: "obra", almacen: "almacén", falta: "falta" };
const leyendaChica = () => <div style={{ display: "flex", gap: 10, fontSize: 10.5, color: "#8A847D" }}>{Object.entries(COB_DIA).map(([k, c]) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, boxShadow: `inset 0 0 0 1px ${c.color}33` }} />{COB_CORTO[k]}</span>)}</div>;
const diaTxt = (iso) => iso ? `${diaCorto(iso).toLowerCase()} ${+iso.slice(8)}` : "";
const normU = (u) => sinAcentos(u).replace(/[^a-z0-9]/g, "").replace(/s$/, "");
/** Partida de la receta del material: presupuesto, lo comprado y lo que queda (en cantidad). */
export const recetaDeMaterial = (receta, short, m, pendiente) => {
  if (!receta || !m?.partidaId) return null;
  const pres = receta.presDe?.(short); const partida = (pres?.partidas || []).find(x => x.id === m.partidaId);
  if (!partida) return null;
  const sd = saldoDePartida({ partida, purchases: receta.purchases || [], solicitudes: receta.solicitudes || [] });
  const misma = normU(partida.unidad) && normU(partida.unidad) === normU(m.unidad);
  return { partida, ...sd, misma, pasa: misma && sd && !sd.sinCantidad ? Math.max(0, num(pendiente) - num(sd.saldo)) : 0 };
};
const MATERIALES_TIPICOS = [["Cemento GU", "Bolsa"], ["Arena", "m3"], ['Grava 3/8"', "m3"], ["Aditivo", "Galón"], ["Varilla", "Lance"]];

// ── Datos compartidos (todo con getCloud) ──
export function useSuministro() {
  const [d, setD] = useState({ progs: [], items: [], activos: null, resp: {}, usuarios: [], cargando: true, error: "" });
  const cargar = useCallback(async () => {
    try {
      const [pg, it, ac, rp, us] = await Promise.all([
        store.getCloud(KEY_PROGRAMACIONES), store.getCloud("inv-items"),
        store.getCloud(KEY_PROYECTOS_ACTIVOS).catch(() => null), store.getCloud("hr-jornal-responsables").catch(() => null), store.getCloud("gt-usuarios").catch(() => []),
      ]);
      setD({ progs: Array.isArray(pg) ? pg : [], items: Array.isArray(it) ? it : [], activos: ac && Array.isArray(ac.shorts) && ac.shorts.length ? ac.shorts : null, resp: rp && typeof rp === "object" ? rp : {}, usuarios: Array.isArray(us) ? us : [], cargando: false, error: "" });
    } catch { setD(x => ({ ...x, cargando: false, error: "No se pudo leer la nube. Revisá la señal y tocá ↻." })); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const labelDe = (u) => [...USERS, ...d.usuarios].find(x => x.username === u)?.label || u;
  /** Guarda una programación sobre la lista FRESCA de la nube (reemplaza por id) y verifica. */
  const guardarProg = async (prog) => {
    let nube;
    try { nube = await store.getCloud(KEY_PROGRAMACIONES); } catch { alert("No hay conexión con la nube: no se guardó. Probá otra vez."); return false; }
    const lista = Array.isArray(nube) ? nube : [];
    const next = lista.some(p => p.id === prog.id) ? lista.map(p => p.id === prog.id ? prog : p) : [...lista, prog];
    const ok = await store.set(KEY_PROGRAMACIONES, next);
    if (!ok) { alert("La nube no aceptó el guardado. Probá otra vez."); return false; }
    try {
      const v = await store.getCloud(KEY_PROGRAMACIONES);
      if (!(Array.isArray(v) && v.some(p => p.id === prog.id && p.updatedAt === prog.updatedAt))) { alert("Se guardó, pero no pude confirmarlo. Tocá ↻ en un momento."); return false; }
      setD(x => ({ ...x, progs: v }));
    } catch { setD(x => ({ ...x, progs: next })); }
    return true;
  };
  return { ...d, cargar, guardarProg, labelDe };
}

const nombreDe = (proyectos, s) => { const p = (proyectos || []).find(x => x.short === s); return p?.name && p.name !== s ? p.name : ""; };
const tituloProg = (p) => `Programación No. ${p.numero}`;
const rangoProg = (p) => { const f = Object.keys(p.dias || {}).sort(); return f.length ? `${diaCorto(f[0])} ${fechaCorta(f[0])} – ${diaCorto(f[f.length - 1])} ${fechaCorta(f[f.length - 1])}` : "sin fechas todavía"; };

// ═══════════════════════════ PLANIFICACIÓN ═══════════════════════════
export function PlanificacionVista({ user, proyectos = [], puedeEditar, isMobile, receta }) {
  const S = useSuministro();
  const [editando, setEditando] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const hoy = hoyISO();
  const activos = S.activos ? new Set(S.activos) : null;
  const opcionesProy = useMemo(() => [...proyectos].filter(p => p.short).sort((a, b) => (activos && activos.has(a.short) ? 0 : 1) - (activos && activos.has(b.short) ? 0 : 1) || String(a.short).localeCompare(String(b.short), "es", { numeric: true })), [proyectos, S.activos]); // eslint-disable-line react-hooks/exhaustive-deps
  const porProy = useMemo(() => { const m = {}; S.progs.filter(p => p && !p.anulada).forEach(p => { (m[p.projectCode] = m[p.projectCode] || []).push(p); }); Object.values(m).forEach(l => l.sort((a, b) => num(b.numero) - num(a.numero))); return m; }, [S.progs]);

  if (editando) return <EditorProgramacion prog={editando} S={S} user={user} proyectos={proyectos} puedeEditar={puedeEditar} isMobile={isMobile} receta={receta} onVolver={() => { setEditando(null); S.cargar(); }} />;

  const crear = (short, base = null) => {
    const lunes = lunesDe(hoy);
    setEditando({
      id: uid(), projectCode: short, numero: siguienteNumero(S.progs, short), titulo: "Programación de entregas",
      semanas: base ? semanasDe(base).filter(l => l >= lunes).slice(0, 2) : [lunes], materiales: base ? base.materiales.map(m => ({ ...m })) : [], dias: {}, nota: "",
      creadaPor: user.nombre, creadaAt: new Date().toISOString(), _nueva: true,
    });
    setNuevo(false);
  };
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>Programación de entregas</div>
        <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 4 }}>Cuánto material necesita cada proyecto por día. Con esto se calcula para cuántos días le alcanza lo que tiene en obra.</div>
      </div>
      <span role="button" title="Volver a leer de la nube" className="gt-circulo" onClick={S.cargar} style={{ width: 36, height: 36, fontSize: 15 }}>↻</span>
      {puedeEditar && <Btn onClick={() => setNuevo(true)}>+ Nueva programación</Btn>}
    </div>
    {S.error && <div style={{ color: C_ROJO.color, fontSize: 13 }}>{S.error}</div>}
    {S.cargando ? <div style={{ fontSize: 13, color: "#8A847D" }}>Cargando…</div>
      : Object.keys(porProy).length === 0 ? <div className="gt-vidrio" style={{ padding: "36px 20px", textAlign: "center", color: "#8A847D", fontSize: 14 }}>Todavía no hay programaciones.{puedeEditar ? " Tocá + Nueva programación y empezá con el proyecto que más material necesita." : ""}</div>
      : Object.entries(porProy).sort(([a], [b]) => a.localeCompare(b, "es")).map(([short, lista]) => { const v = lista[0]; return <div key={short} className="gt-vidrio" style={{ padding: isMobile ? 14 : 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ font: "800 15.5px/1.2 var(--display)", color: CHARCOAL }}>{short}</div>
            {nombreDe(proyectos, short) && <div style={{ fontSize: 11.5, color: "#8A847D", marginTop: 2 }}>{nombreDe(proyectos, short)}</div>}
          </div>
          {puedeEditar && <Btn small variant="ghost" onClick={() => crear(short, v)}>Nueva versión (No. {siguienteNumero(S.progs, short)})</Btn>}
        </div>
        <div role="button" tabIndex={0} onClick={() => setEditando(v)} onKeyDown={e => { if (e.key === "Enter") setEditando(v); }} className="gt-vidrio-hover" style={{ borderRadius: 14, background: "rgba(232,118,45,.06)", padding: "10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><Chip c={C_NARANJA}>{tituloProg(v)} · vigente</Chip><span style={{ fontSize: 12.5, color: "#6E6862" }}>{rangoProg(v)}</span><span style={{ marginLeft: "auto", fontSize: 11.5, color: "#8A847D" }}>{v.updatedBy || v.creadaPor}</span></div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(v.materiales || []).map(m => <span key={m.id} style={{ fontSize: 12.5, color: CHARCOAL }}><b>{fmtN(totalMaterial(v, m.id))}</b> {m.unidad} {m.nombre}<span style={{ color: "#C2BCB3" }}> · </span></span>)}</div>
        </div>
        {lista.length > 1 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontSize: 11.5, color: "#8A847D" }}>Anteriores:</span>{lista.slice(1).map(p => <button key={p.id} type="button" onClick={() => setEditando(p)} style={{ border: "none", background: "rgba(44,42,40,.05)", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, color: "#6E6862", cursor: "pointer", fontFamily: "inherit" }}>No. {p.numero}</button>)}</div>}
      </div>; })}
    {nuevo && <Modal title="Nueva programación" onClose={() => setNuevo(false)}>
      <ElegirProyecto opciones={opcionesProy} activos={activos} onElegir={(s) => crear(s, programacionVigente(S.progs, s))} onClose={() => setNuevo(false)} />
    </Modal>}
  </div>;
}

function ElegirProyecto({ opciones, activos, onElegir, onClose }) {
  const [s, setS] = useState("");
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#5C5853" }}>Proyecto
      <select value={s} onChange={e => setS(e.target.value)} style={{ ...CTRL, minHeight: 44 }}>
        <option value="">— Elegí —</option>
        {activos && <optgroup label="Activos">{opciones.filter(p => activos.has(p.short)).map(p => <option key={p.short} value={p.short}>{p.short}</option>)}</optgroup>}
        <optgroup label={activos ? "Otros" : "Proyectos"}>{opciones.filter(p => !activos || !activos.has(p.short)).map(p => <option key={p.short} value={p.short}>{p.short}</option>)}</optgroup>
      </select>
    </label>
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><Btn variant="ghost" onClick={onClose}>Cancelar</Btn><Btn disabled={!s} onClick={() => onElegir(s)}>Empezar</Btn></div>
  </div>;
}

function EditorProgramacion({ prog: inicial, S, user, proyectos, puedeEditar, isMobile, receta, onVolver }) {
  const [p, setP] = useState(inicial);
  const [sucio, setSucio] = useState(!!inicial._nueva);
  const [guardando, setGuardando] = useState(false);
  const [nuevoMat, setNuevoMat] = useState({ nombre: "", unidad: "" });
  const editable = puedeEditar;
  const up = (fn) => { setP(x => fn(x)); setSucio(true); };
  const semanas = semanasDe(p);
  const hoy = hoyISO();
  // Cobertura EN VIVO: cada vez que se escribe una cantidad se recalcula con lo
  // que hay en obra y en almacén (24-nov-2026, Gerson: "que diga en almacén hay
  // para cubrir hasta tal día").
  const cob = useMemo(() => { const r = coberturaProyecto({ short: p.projectCode, prog: p, items: S.items, hoy }); const m = {}; r.filas.forEach(f => { if (f.matId) m[f.matId] = f; }); return m; }, [p, S.items, hoy]);
  const pres = receta?.presDe?.(p.projectCode) || null;
  const partidasRec = partidasPedibles(pres);
  const pendienteDe = (matId) => Object.entries(p.dias || {}).filter(([f]) => f >= hoy).reduce((a, [, d]) => a + num(d?.[matId]), 0);
  const consumibles = useMemo(() => (S.items || []).filter(i => i && !i.eliminado && esConsumible(i)).map(i => ({ nombre: i.nombre, unidad: i.unidad || "" })), [S.items]);
  const sugeridos = [...new Map([...MATERIALES_TIPICOS.map(([n, u]) => ({ nombre: n, unidad: u })), ...consumibles].map(x => [sinAcentos(x.nombre), x])).values()];
  const agregarMat = () => {
    const nombre = nuevoMat.nombre.trim(); if (!nombre) return;
    if ((p.materiales || []).some(m => sinAcentos(m.nombre) === sinAcentos(nombre))) { alert("Ese material ya está en la programación."); return; }
    const sug = sugeridos.find(x => sinAcentos(x.nombre) === sinAcentos(nombre));
    const unidad = nuevoMat.unidad.trim() || sug?.unidad || "";
    if (!unidad) { alert("Poné la unidad (Bolsa, m3, Galón…)."); return; }
    up(x => ({ ...x, materiales: [...(x.materiales || []), { id: uid(), nombre, unidad }] }));
    setNuevoMat({ nombre: "", unidad: "" });
  };
  const quitarMat = (id) => { if (!confirm("¿Quitar este material y sus cantidades de la programación?")) return; up(x => { const dias = {}; Object.entries(x.dias || {}).forEach(([f, d]) => { const n = { ...d }; delete n[id]; if (Object.keys(n).length) dias[f] = n; }); return { ...x, materiales: x.materiales.filter(m => m.id !== id), dias }; }); };
  const agregarSemana = () => up(x => { const ult = semanasDe(x).pop() || lunesDe(hoyISO()); return { ...x, semanas: [...new Set([...(x.semanas || []), sumarDias(ult, 7)])] }; });
  const quitarSemana = (lunes) => { const tiene = diasDeSemana(lunes).some(f => p.dias?.[f]); if (tiene && !confirm("Esta semana tiene cantidades. ¿Quitarla igual?")) return; up(x => { const dias = { ...(x.dias || {}) }; diasDeSemana(lunes).forEach(f => delete dias[f]); return { ...x, semanas: (x.semanas || []).filter(l => l !== lunes), dias }; }); };
  const guardar = async () => {
    if (!p.materiales?.length) { alert("Agregá al menos un material."); return; }
    setGuardando(true);
    try {
      const at = new Date().toISOString();
      const { _nueva, ...limpio } = p;
      const conItems = { ...limpio, semanas: semanasDe(p), materiales: p.materiales.map(m => ({ ...m, itemId: itemDeMaterial(S.items, m)?.id || m.itemId || "" })), updatedAt: at, updatedBy: user.nombre };
      if (await S.guardarProg(conItems)) { setP(conItems); setSucio(false); }
    } finally { setGuardando(false); }
  };
  const salir = () => { if (sucio && !confirm("Tenés cambios sin guardar. ¿Salir igual?")) return; onVolver(); };
  const [generando, setGenerando] = useState(false);
  const pdf = async () => {
    setGenerando(true);
    try { await pdfSuministro({ hoy, proyectos: [{ short: p.projectCode, nombre: nombreDe(proyectos, p.projectCode), prog: p, filas: coberturaProyecto({ short: p.projectCode, prog: p, items: S.items, hoy }).filas.map(f => ({ ...f, receta: f.matId ? recetaDeMaterial(receta, p.projectCode, p.materiales.find(m => m.id === f.matId), pendienteDe(f.matId)) : null })) }] }); }
    catch (e) { console.error(e); alert("No se pudo armar el PDF: " + (e?.message || e)); }
    finally { setGenerando(false); }
  };
  const nombre = nombreDe(proyectos, p.projectCode);
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div className="gt-vidrio" style={{ padding: isMobile ? 12 : 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="gt-circulo" onClick={salir} aria-label="Atrás" style={{ width: 36, height: 36, fontSize: 15 }}>←</button>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ font: "800 17px/1.2 var(--display)", color: CHARCOAL }}>{p.projectCode} · {tituloProg(p)}</div>
        <div style={{ fontSize: 12, color: "#8A847D", marginTop: 3 }}>{nombre ? `${nombre} · ` : ""}{p.updatedAt ? `guardada por ${p.updatedBy} · ${fmtDT(p.updatedAt)}` : "sin guardar"}</div>
      </div>
      <Btn variant="ghost" disabled={generando} onClick={pdf}>{generando ? "Armando PDF…" : "PDF"}</Btn>
      {editable && <Btn disabled={!sucio || guardando} onClick={guardar}>{guardando ? "Guardando…" : sucio ? "Guardar" : "Guardado"}</Btn>}
    </div>

    {editable && <div className="gt-vidrio" style={{ padding: isMobile ? 12 : 14, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ flex: "2 1 220px", display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#6E6862" }}>Material
        <input list="sum-materiales" value={nuevoMat.nombre} onChange={e => { const v = e.target.value; const s = sugeridos.find(x => sinAcentos(x.nombre) === sinAcentos(v)); setNuevoMat(m => ({ nombre: v, unidad: s && !m.unidad ? s.unidad : m.unidad })); }} onKeyDown={e => { if (e.key === "Enter") agregarMat(); }} placeholder="Cemento GU, Arena, Grava 3/8…" style={CTRL} />
        <datalist id="sum-materiales">{sugeridos.map(x => <option key={x.nombre} value={x.nombre} />)}</datalist>
      </label>
      <label style={{ flex: "1 1 110px", display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#6E6862" }}>Unidad
        <input list="sum-unidades" value={nuevoMat.unidad} onChange={e => setNuevoMat(m => ({ ...m, unidad: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") agregarMat(); }} placeholder="Bolsa" style={CTRL} />
        <datalist id="sum-unidades">{UNIDADES.map(u => <option key={u} value={u} />)}</datalist>
      </label>
      <Btn variant="dark" onClick={agregarMat}>+ Material</Btn>
    </div>}

    {(p.materiales || []).length === 0 ? <div className="gt-vidrio" style={{ padding: "30px 20px", textAlign: "center", color: "#8A847D", fontSize: 13.5 }}>Agregá los materiales que se programan (cemento, arena, grava…).</div>
      : semanas.map((lunes, si) => { const dias = diasDeSemana(lunes); return <div key={lunes} className="gt-vidrio" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid rgba(44,42,40,.07)" }}>
          <span style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>Semana {si + 1}</span><span style={{ fontSize: 12, color: "#8A847D" }}>{fechaCorta(lunes)} – {fechaCorta(dias[5])}</span>
          {si === 0 && <div style={{ marginLeft: 10 }}>{leyendaChica()}</div>}
          {editable && semanas.length > 1 && <button type="button" onClick={() => quitarSemana(lunes)} style={{ marginLeft: "auto", border: "none", background: "none", color: C_ROJO.color, font: "700 11.5px/1 var(--sans)", cursor: "pointer" }}>Quitar semana</button>}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={{ ...TH, minWidth: 150 }}>Material</th>{dias.map(f => <th key={f} style={{ ...TH, textAlign: "center", color: f === hoyISO() ? ORANGE_DARK : TH.color }}>{diaCorto(f)} {+f.slice(8)}</th>)}<th style={{ ...TH, textAlign: "right" }}>Total semana</th></tr></thead>
            <tbody>{p.materiales.map(m => <tr key={m.id}>
              <td style={{ ...TD, fontWeight: 700, minWidth: 170, padding: "6px 10px" }}>{m.nombre} <span style={{ color: "#8A847D", fontWeight: 500 }}>({m.unidad})</span>{editable && si === 0 && <button type="button" onClick={() => quitarMat(m.id)} title="Quitar material" style={{ marginLeft: 4, border: "none", background: "none", color: "#B5AFA6", cursor: "pointer", fontSize: 12 }}>✕</button>}
                <ExistenciaMat f={cob[m.id]} />
                {si === 0 && <RecetaChica r={recetaDeMaterial(receta, p.projectCode, m, pendienteDe(m.id))} partidas={partidasRec} editable={editable} valor={m.partidaId || ""} onElegir={(v) => up(x => ({ ...x, materiales: x.materiales.map(y => y.id === m.id ? { ...y, partidaId: v } : y) }))} />}
              </td>
              {dias.map(f => { const e = cob[m.id]?.dias?.[f]; const c = e ? COB_DIA[e.estado] : null; return <td key={f} title={e ? `${c.txt}${e.falta ? ` · faltan ${fmtN(e.falta)} ${m.unidad} ese día` : ""}` : ""} style={{ ...TD, textAlign: "center", padding: "4px 4px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {editable ? <input type="number" inputMode="decimal" min="0" step="any" value={cantidadDia(p, f, m.id) || ""} onChange={e => up(x => ({ ...x, dias: ponerCantidad(x.dias, f, m.id, e.target.value) }))} style={{ ...CTRL, width: isMobile ? 58 : 64, textAlign: "center", padding: "6px 3px", fontFamily: "var(--mono)", fontWeight: 700, ...(c ? { background: c.bg, color: c.color, borderColor: `${c.color}40` } : {}) }} />
                  : <span style={{ display: "inline-block", minWidth: 50, padding: "6px 4px", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700, ...(c ? { background: c.bg, color: c.color } : {}) }}>{cantidadDia(p, f, m.id) ? fmtN(cantidadDia(p, f, m.id)) : ""}</span>}
                <QuedaAlmacen e={e} />
                </div>
              </td>; })}
              <td style={{ ...TD, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 800 }}>{fmtN(totalSemana(p, lunes, m.id))}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>; })}
    {(p.materiales || []).length > 0 && <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
      {editable && <Btn variant="ghost" onClick={agregarSemana}>+ Semana</Btn>}
      <div className="gt-vidrio" style={{ padding: "10px 14px", flex: 1, minWidth: 240, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#6E6862" }}>TOTAL PROGRAMADO</span>
        {p.materiales.map(m => <span key={m.id} style={{ fontSize: 13 }}><b style={{ fontFamily: "var(--mono)" }}>{fmtN(totalMaterial(p, m.id))}</b> {m.unidad} {m.nombre}</span>)}
      </div>
    </div>}
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#6E6862" }}>Nota
      <textarea value={p.nota || ""} disabled={!editable} onChange={e => up(x => ({ ...x, nota: e.target.value }))} rows={2} placeholder="Ej. sale del Look Ahead del 23 nov; el cemento lo pone el cliente…" style={{ ...CTRL, resize: "vertical" }} />
    </label>
  </div>;
}


// ── Piezas de cobertura (a nivel de módulo) ──
// Debajo del material: solo cuánto hay en obra y en almacén (24-nov-2026,
// Gerson: "en obra hay tantos, en almacén tantos, ya, solo eso").
function ExistenciaMat({ f }) {
  if (!f) return null;
  if (!f.enInventario) return <div style={{ fontSize: 10.5, color: "#A9A39B", fontWeight: 500, marginTop: 2 }}>no está en GeoInventory</div>;
  return <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2, color: "#6E6862" }}>En obra <b style={{ color: CHARCOAL }}>{fmtN(f.stock)}</b> · en almacén <b style={{ color: CHARCOAL }}>{fmtN(f.almacen?.total)}</b></div>;
}

// Al lado de la cajita del día: lo que quedaría en almacén después de ese día
// (o lo que falta, en rojo).
function QuedaAlmacen({ e }) {
  if (!e) return <span style={{ width: 40 }} />;
  const falta = e.estado === "falta";
  return <span style={{ width: 40, textAlign: "left", lineHeight: 1.1 }}>
    <span style={{ display: "block", fontSize: 9, fontWeight: 600, color: falta ? COB_DIA.falta.color : "#A9A39B" }}>{falta ? "faltan" : "almacén"}</span>
    <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--mono)", color: falta ? COB_DIA.falta.color : COB_DIA.almacen.color }}>{fmtN(falta ? e.falta : e.almQueda)}</span>
  </span>;
}

// Partida de la receta en chiquito: un select discreto; solo avisa si la
// programación pide más de lo que queda en la receta.
function RecetaChica({ r, partidas, editable, valor, onElegir }) {
  if (!editable && !r) return null;
  return <div style={{ marginTop: 2 }}>
    {editable && partidas.length > 0 && <select value={valor} onChange={e => onElegir(e.target.value)} title={r && r.misma && !r.sinCantidad ? `Receta: presupuesto ${fmtN(r.presupuestada)} · comprado ${fmtN(r.comprada)} · quedan ${fmtN(r.saldo)} ${r.partida.unidad}` : "Partida del presupuesto (receta) de donde sale este material"} style={{ border: "none", background: "transparent", padding: 0, font: "500 10.5px/1.3 var(--sans)", color: "#A9A39B", maxWidth: 200, cursor: "pointer" }}>
      <option value="">receta…</option>
      {partidas.map(x => <option key={x.id} value={x.id}>{x.solucion ? `${x.solucion} · ` : ""}{x.nombre}{x.unidad ? ` (${x.unidad})` : ""}</option>)}
    </select>}
    {r && r.misma && !r.sinCantidad && <span style={{ fontSize: 10.5, fontWeight: 600, color: r.pasa > 0 ? C_ROJO.color : "#8A847D", marginLeft: editable ? 6 : 0 }}>quedan {fmtN(r.saldo)}{r.pasa > 0 ? ` · se pasa ${fmtN(r.pasa)}` : ""}</span>}
  </div>;
}

function LineaReceta({ r, partidas, editable, valor, onElegir }) {
  if (!partidas?.length && !r) return null;
  return <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
    {editable && partidas.length > 0 && <select value={valor} onChange={e => onElegir(e.target.value)} title="Partida del presupuesto (receta) de donde sale este material" style={{ ...CTRL, width: "auto", maxWidth: 260, padding: "4px 6px", fontSize: 11, fontWeight: 600, background: "rgba(44,42,40,.04)" }}>
      <option value="">Partida de la receta…</option>
      {partidas.map(x => <option key={x.id} value={x.id}>{x.solucion ? `${x.solucion} · ` : ""}{x.nombre}{x.unidad ? ` (${x.unidad})` : ""}</option>)}
    </select>}
    {r && <div style={{ fontSize: 11, fontWeight: 500, color: r.pasa > 0 ? C_ROJO.color : "#6E6862" }}>
      {!editable && <>Receta: {r.partida.nombre} · </>}
      {r.sinCantidad ? "la partida no trae cantidad" : !r.misma ? `${fmtN(r.presupuestada)} ${r.partida.unidad} presupuestados · unidad distinta, no se compara` : <>presupuesto <b>{fmtN(r.presupuestada)}</b> · comprado {fmtN(r.comprada)}{r.enSolicitudes ? ` · pedido ${fmtN(r.enSolicitudes)}` : ""} · <b>quedan {fmtN(r.saldo)}</b> {r.partida.unidad}</>}
      {r.pasa > 0 && <div style={{ fontWeight: 700 }}>La programación pide {fmtN(r.pasa)} más de lo que queda en la receta</div>}
    </div>}
  </div>;
}

// ═══════════════════════════ COBERTURA ═══════════════════════════
export function CoberturaVista({ proyectos = [], isMobile, onIrPlanificacion, receta }) {
  const S = useSuministro();
  const hoy = hoyISO();
  const [soloAlerta, setSoloAlerta] = useState(false);
  const datos = useMemo(() => {
    const conInv = new Set();
    (S.items || []).forEach(i => { if (i && !i.eliminado && esConsumible(i)) Object.keys(i.stock || {}).concat(Object.keys(i.conteos || {})).forEach(k => { if (k.startsWith("proy:")) conInv.add(k.slice(5)); }); });
    const conProg = new Set((S.progs || []).filter(p => p && !p.anulada).map(p => p.projectCode));
    const shorts = [...new Set([...(S.activos || []), ...conProg, ...conInv])];
    return shorts.map(short => {
      const prog = programacionVigente(S.progs, short);
      const r = coberturaProyecto({ short, prog, items: S.items, hoy });
      const fechaC = r.ultimoConteo ? new Date(r.ultimoConteo).toLocaleDateString("en-CA", { timeZone: "America/Tegucigalpa" }) : "";
      return { ...r, prog, activo: !S.activos || S.activos.includes(short), alDia: !!fechaC && conteoAlDia(fechaC, hoy), resp: (S.resp[short] || []).map(S.labelDe) };
    }).sort((a, b) => ({ rojo: 0, ambar: 1, verde: 2, sin_programa: 3 })[a.peor] - ({ rojo: 0, ambar: 1, verde: 2, sin_programa: 3 })[b.peor] || a.short.localeCompare(b.short, "es"));
  }, [S.items, S.progs, S.activos, S.resp, hoy]); // eslint-disable-line react-hooks/exhaustive-deps
  const [generando, setGenerando] = useState(false);
  const pdfTodo = async () => {
    setGenerando(true);
    try {
      const lista = datos.filter(d => d.prog).map(d => ({ short: d.short, nombre: nombreDe(proyectos, d.short), prog: d.prog, filas: d.filas.map(f => { const mat = d.prog.materiales?.find(m => m.id === f.matId); return { ...f, receta: mat ? recetaDeMaterial(receta, d.short, mat, Object.entries(f.porDia || {}).filter(([x]) => x >= hoy).reduce((a, [, n]) => a + num(n), 0)) : null }; }) }));
      await pdfSuministro({ hoy, proyectos: lista });
    } catch (e) { console.error(e); alert("No se pudo armar el PDF: " + (e?.message || e)); }
    finally { setGenerando(false); }
  };
  const nRojo = datos.filter(d => d.peor === "rojo").length, nAmbar = datos.filter(d => d.peor === "ambar").length;
  const sinConteo = datos.filter(d => d.filas.some(f => f.enInventario) && !d.alDia).length;
  const vis = soloAlerta ? datos.filter(d => d.peor === "rojo" || d.peor === "ambar" || !d.alDia) : datos;
  const ult = ultimoDiaConteo(hoy);
  const tile = (n, l, c) => <div style={{ flex: "1 1 120px", padding: "10px 14px", borderRadius: 14, background: c?.bg || "rgba(44,42,40,.04)" }}><div style={{ font: "800 24px/1 var(--display)", color: c?.color || CHARCOAL }}>{n}</div><div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 4 }}>{l}</div></div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>Cobertura de material en obra</div>
          <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 4 }}>Meta: siempre entre {DIAS_ROJO} días y una semana adelante, contando lo que hay en obra y en almacén. Rojo = alcanza menos de {DIAS_ROJO} días · ámbar = menos de {DIAS_META}.</div>
        </div>
        <span role="button" title="Volver a leer de la nube" className="gt-circulo" onClick={S.cargar} style={{ width: 36, height: 36, fontSize: 15 }}>↻</span>
        <Btn variant="ghost" disabled={generando || !datos.some(d => d.prog)} onClick={pdfTodo}>{generando ? "Armando PDF…" : "PDF"}</Btn>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tile(nRojo, "proyectos en rojo", nRojo ? C_ROJO : null)}
        {tile(nAmbar, "en ámbar", nAmbar ? C_AMARILLO : null)}
        {tile(sinConteo, `sin conteo desde el ${diaCorto(ult).toLowerCase()} ${fechaCorta(ult)}`, sinConteo ? C_ROJO : null)}
        {tile(datos.length, "proyectos vigilados")}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {[[false, "Todos"], [true, "Solo lo que necesita atención"]].map(([v, l]) => <button key={l} type="button" onClick={() => setSoloAlerta(v)} style={{ minHeight: 34, padding: "6px 13px", borderRadius: 999, border: soloAlerta === v ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: soloAlerta === v ? ORANGE_DARK : "rgba(255,255,255,.75)", color: soloAlerta === v ? "#fff" : CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer" }}>{l}</button>)}
      </div>
    </div>
    {S.error && <div style={{ color: C_ROJO.color, fontSize: 13 }}>{S.error}</div>}
    {S.cargando ? <div style={{ fontSize: 13, color: "#8A847D" }}>Cargando…</div>
      : vis.length === 0 ? <div className="gt-vidrio" style={{ padding: "36px 20px", textAlign: "center", color: "#8A847D", fontSize: 14 }}>{soloAlerta ? "Nada en rojo ni en ámbar. Todos al día." : "Todavía no hay proyectos con programación ni inventario de consumibles. Empezá cargando la programación y el inventario del proyecto en GeoInventory."}</div>
      : vis.map(d => <div key={d.short} className="gt-vidrio" style={{ padding: 0, overflow: "hidden", boxShadow: d.peor === "rojo" ? "inset 3px 0 0 #B03024" : d.peor === "ambar" ? "inset 3px 0 0 #E8A33D" : undefined }}>
        <div style={{ padding: isMobile ? "12px 14px" : "14px 18px", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap", borderBottom: "1px solid rgba(44,42,40,.07)" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>{d.short}</div>
            <div style={{ fontSize: 12, color: "#8A847D", marginTop: 3 }}>{d.resp.length ? d.resp.join(", ") : "sin residente asignado"}{nombreDe(proyectos, d.short) ? ` · ${nombreDe(proyectos, d.short)}` : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {d.filas.some(f => f.enInventario) && <Chip c={d.alDia ? C_VERDE : C_ROJO} title={d.ultimoConteo ? `Último conteo ${fmtDT(d.ultimoConteo)}` : ""}>{d.alDia ? `Contado ${fmtDT(d.ultimoConteo)}` : d.ultimoConteo ? `No contó · último ${fmtDT(d.ultimoConteo)}` : "Nunca ha contado"}</Chip>}
            {d.prog ? <Chip c={C_GRIS}>{tituloProg(d.prog)}</Chip> : <button type="button" onClick={onIrPlanificacion} style={{ border: "none", background: "rgba(44,42,40,.06)", borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, color: "#6E6862", cursor: onIrPlanificacion ? "pointer" : "default", fontFamily: "inherit" }}>Sin programación</button>}
          </div>
        </div>
        {d.filas.length === 0 ? <div style={{ padding: "14px 18px", fontSize: 12.5, color: "#8A847D" }}>Sin materiales todavía: falta la programación o el inventario del proyecto.</div>
          : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={{ ...TH, paddingLeft: 18 }}>Material</th><th style={{ ...TH, textAlign: "right" }}>En obra</th><th style={{ ...TH, textAlign: "right" }}>En almacén</th><th style={{ ...TH, textAlign: "right" }}>Próx. 7 días</th><th style={TH}>La obra cubre</th><th style={TH}>Con almacén</th><th style={{ ...TH, textAlign: "right" }}>Falta para la semana</th>{!isMobile && <th style={TH}>Contado</th>}</tr></thead>
            <tbody>{d.filas.map(f => { const sm = SEMA[f.semaforo]; const r = resumenDias(f.dias, f.porDia); const sinP = f.semaforo === "sin_programa" || f.semaforo === "sin_dato"; const mat = d.prog?.materiales?.find(m => m.id === f.matId); const rec = mat ? recetaDeMaterial(receta, d.short, mat, Object.entries(f.porDia || {}).filter(([x]) => x >= hoy).reduce((a, [, n]) => a + num(n), 0)) : null; return <tr key={f.key}>
              <td style={{ ...TD, paddingLeft: 18, fontWeight: 700 }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: sinP ? "#D8D2C8" : sm.c.color, marginRight: 8 }} />{f.nombre}{!f.enInventario && <div style={{ fontSize: 11, color: C_ROJO.color, fontWeight: 600, marginLeft: 17 }}>no está en el inventario</div>}{rec && <div style={{ marginLeft: 17 }}><LineaReceta r={rec} partidas={[]} /></div>}</td>
              <td style={{ ...TD, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 800 }}>{fmtN(f.stock)} <span style={{ fontFamily: "var(--sans)", fontWeight: 500, color: "#8A847D", fontSize: 11.5 }}>{f.unidad}</span></td>
              <td style={{ ...TD, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700 }} title={f.almacen?.comprometidoOtros ? `${fmtN(f.almacen.comprometidoOtros)} más están comprometidas para otros proyectos` : ""}>{fmtN(f.almacen?.total)}</td>
              <td style={{ ...TD, textAlign: "right", fontFamily: "var(--mono)" }}>{sinP ? "—" : fmtN(f.programado7)}</td>
              <td style={{ ...TD, color: sinP ? "#8A847D" : COB_DIA.obra.color, fontWeight: 700, whiteSpace: "nowrap" }}>{sinP ? (f.semaforo === "sin_dato" ? "—" : "Sin programación") : r.obraHasta ? (f.obra?.cubreTodo ? "Todo" : `hasta ${diaTxt(r.obraHasta)}`) : <span style={{ color: COB_DIA.falta.color }}>ni el {diaTxt(r.primero)}</span>}</td>
              <td style={{ ...TD, color: sinP ? "#8A847D" : sm.c.color, fontWeight: 700, whiteSpace: "nowrap" }}>{sinP ? "—" : f.cubreTodo ? "Toda la programación" : r.totalHasta ? `hasta ${diaTxt(r.totalHasta)} · falta el ${diaTxt(r.faltaDesde)}` : `falta desde el ${diaTxt(r.faltaDesde)}`}{!sinP && r.mandar > 0 && <div style={{ fontSize: 10.5, fontWeight: 600, color: COB_DIA.almacen.color }}>mandar {fmtN(r.mandar)} del almacén</div>}</td>
              <td style={{ ...TD, textAlign: "right", fontFamily: "var(--mono)", fontWeight: 800, color: f.faltanParaMeta > 0 ? C_ROJO.color : "#8A847D" }}>{f.faltanParaMeta > 0 ? `${fmtN(f.faltanParaMeta)} ${f.unidad}` : "—"}</td>
              {!isMobile && <td style={{ ...TD, fontSize: 11.5, color: "#8A847D", whiteSpace: "nowrap" }}>{f.conteo ? `${fmtDT(f.conteo.at)}${f.conteo.byName ? ` · ${String(f.conteo.byName).split(" ")[0]}` : ""}` : "—"}</td>}
            </tr>; })}</tbody>
          </table></div>}
      </div>)}
  </div>;
}
