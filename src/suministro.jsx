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
import { conteoAlDia, ultimoDiaConteo, esConsumible, aplicarMovimiento, keyMovimientos, siguientesCodigos } from "./geoinventory-calc.js";
import {
  KEY_PROGRAMACIONES, KEY_PROG_HIST, KEY_PROYECTOS_ACTIVOS, DIAS_ROJO, DIAS_META, num, sumarDias, lunesDe, diasDeSemana, diaCorto, fechaCorta,
  semanasDe, cantidadDia, totalSemana, totalMaterial, programacionVigente, siguienteNumero, ponerCantidad, itemDeMaterial, coberturaProyecto, sinAcentos, resumenDias,
  KEY_CIERRES, cierreDe, cierresDe, quedoAntesDe, consumoDia, cumplimientoDia, movimientosProyecto, idUbicProyecto, stockEnProyecto,
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
const COB_CORTO = { obra: "lo cubre el proyecto", almacen: "mandar del almacén", falta: "comprar" };
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
  const [d, setD] = useState({ cierres: [], progs: [], items: [], activos: null, resp: {}, usuarios: [], cargando: true, error: "" });
  const cargar = useCallback(async () => {
    try {
      const [pg, it, ac, rp, us, ci] = await Promise.all([
        store.getCloud(KEY_PROGRAMACIONES), store.getCloud("inv-items"),
        store.getCloud(KEY_PROYECTOS_ACTIVOS).catch(() => null), store.getCloud("hr-jornal-responsables").catch(() => null), store.getCloud("gt-usuarios").catch(() => []),
        store.getCloud(KEY_CIERRES).catch(() => []),
      ]);
      setD({ cierres: Array.isArray(ci) ? ci : [], progs: Array.isArray(pg) ? pg : [], items: Array.isArray(it) ? it : [], activos: ac && Array.isArray(ac.shorts) && ac.shorts.length ? ac.shorts : null, resp: rp && typeof rp === "object" ? rp : {}, usuarios: Array.isArray(us) ? us : [], cargando: false, error: "" });
    } catch { setD(x => ({ ...x, cargando: false, error: "No se pudo leer la nube. Revisá la señal y tocá ↻." })); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const labelDe = (u) => [...USERS, ...d.usuarios].find(x => x.username === u)?.label || u;
  /** Guarda una programación sobre la lista FRESCA de la nube (reemplaza por id) y verifica. */
  const guardarProg = async (prog) => {
    let nube;
    try { nube = await store.getCloud(KEY_PROGRAMACIONES); } catch { alert("No hay conexión con la nube: no se guardó. Probá otra vez."); return false; }
    const lista = Array.isArray(nube) ? nube : [];
    // RESPALDO: si ya había una versión guardada de esta programación, se copia
    // a sp-programaciones-hist ANTES de pisarla. Si el respaldo no se puede
    // confirmar, NO se guarda el cambio (nunca se pierde lo publicado).
    const previa = lista.find(p => p.id === prog.id);
    if (previa && previa.updatedAt) {
      const resp = { id: uid(), progId: prog.id, projectCode: previa.projectCode, numero: previa.numero, reemplazadaAt: prog.updatedAt || new Date().toISOString(), reemplazadaPor: prog.updatedBy || "", version: previa };
      try {
        const h = await store.getCloud(KEY_PROG_HIST);
        const okH = await store.set(KEY_PROG_HIST, [...(Array.isArray(h) ? h : []), resp]);
        const vh = okH ? await store.getCloud(KEY_PROG_HIST) : null;
        if (!(Array.isArray(vh) && vh.some(x => x.id === resp.id))) throw new Error("sin verificar");
      } catch { alert("No pude guardar el respaldo de la versión anterior: no se guardó el cambio. Probá otra vez."); return false; }
    }
    const next = previa ? lista.map(p => p.id === prog.id ? prog : p) : [...lista, prog];
    const ok = await store.set(KEY_PROGRAMACIONES, next);
    if (!ok) { alert("La nube no aceptó el guardado. Probá otra vez."); return false; }
    try {
      const v = await store.getCloud(KEY_PROGRAMACIONES);
      if (!(Array.isArray(v) && v.some(p => p.id === prog.id && p.updatedAt === prog.updatedAt))) { alert("Se guardó, pero no pude confirmarlo. Tocá ↻ en un momento."); return false; }
      setD(x => ({ ...x, progs: v }));
    } catch { setD(x => ({ ...x, progs: next })); }
    return true;
  };
  /**
   * REGISTRO DEL DÍA (25-nov-2026): guarda en sp-cierres lo que llegó y lo que
   * quedó de cada material, y deja GeoInventory igual: suma lo que llegó y no
   * estaba registrado y pone el conteo (sin pisar lo que pasó después de esa
   * fecha). `reg` = {projectCode, fecha, progId, materiales {matId: {...}}, nota}.
   */
  const registrarDia = async (reg, user, movsInv) => {
    const at = new Date().toISOString();
    // 1) el registro (la fuente de la planificación)
    let lista;
    try { lista = await store.getCloud(KEY_CIERRES); } catch { alert("No hay conexión con la nube: no se guardó. Probá otra vez."); return false; }
    lista = Array.isArray(lista) ? lista : [];
    const previo = cierreDe(lista, reg.projectCode, reg.fecha);
    const rec = { ...(previo || {}), ...reg, id: previo?.id || uid(), por: user.username, porNombre: user.nombre, at: previo?.at || at, updatedAt: at,
      historial: previo ? [...(previo.historial || []), { at: previo.updatedAt || previo.at, porNombre: previo.porNombre, materiales: previo.materiales, nota: previo.nota || "" }] : [] };
    const next = previo ? lista.map(c => c.id === previo.id ? rec : c) : [...lista, rec];
    if (!(await store.set(KEY_CIERRES, next))) { alert("La nube no aceptó el guardado. Probá otra vez."); return false; }
    try { const v = await store.getCloud(KEY_CIERRES); if (!(Array.isArray(v) && v.some(c => c.id === rec.id && c.updatedAt === at))) { alert("Se guardó, pero no pude confirmarlo. Tocá ↻ en un momento."); return false; } setD(x => ({ ...x, cierres: v })); }
    catch { setD(x => ({ ...x, cierres: next })); }
    // 2) GeoInventory
    const avisos = [];
    try {
      const arr0 = await store.getCloud("inv-items"); let arr = Array.isArray(arr0) ? [...arr0] : [];
      const ub = idUbicProyecto(reg.projectCode), movsN = [], ids = [];
      const quien = { by: user.username, byName: user.nombre };
      Object.entries(reg.materiales || {}).forEach(([matId, r]) => {
        if (r.quedo === "" || r.quedo == null) return;
        let it = itemDeMaterial(arr.filter(i => !i.eliminado), { nombre: r.nombre, itemId: r.itemId });
        if (!it) {
          const codigo = siguientesCodigos(arr, "MAT", 1)[0];
          it = { id: uid(), codigo, tipo: "cantidad", nombre: r.nombre, categoria: "materiales", unidad: r.unidad || "Unidad", stock: {}, notas: "", marca: "", modelo: "", serie: "", createdAt: at, createdBy: user.username, createdByNombre: user.nombre, updatedAt: at };
          arr.push(it);
          movsN.push({ id: uid(), at, ...quien, itemId: it.id, codigo, nombre: it.nombre, accion: "crear", a: ub, cantidad: 0, deRegistroDia: true });
        }
        const mp = movimientosProyecto(movsInv, it.id, reg.projectCode);
        let cur = it;
        const extra = Math.round((num(r.llego) - mp.entradasDel(reg.fecha)) * 100) / 100;
        if (extra > 0) {
          const e = aplicarMovimiento(cur, { accion: "entrada", a: ub, cantidad: extra, motivo: `Llegó el ${reg.fecha} (registro del día)` }, { ...quien, id: uid(), at });
          if (!e.error) { cur = e.item; movsN.push({ ...e.mov, deRegistroDia: true }); }
        }
        if (mp.contadoDespues(reg.fecha)) { avisos.push(`${r.nombre}: alguien contó después del ${reg.fecha}; el inventario no se tocó.`); }
        else {
          const nuevo = Math.max(0, Math.round((num(r.quedo) + mp.netoDespues(reg.fecha)) * 100) / 100);
          const c = aplicarMovimiento(cur, { accion: "conteo", en: ub, nuevo, motivo: `Registro del día ${reg.fecha}: quedaron ${num(r.quedo)}${r.consumo != null ? ` · se usaron ${r.consumo}` : ""}` }, { ...quien, id: uid(), at });
          if (!c.error) { cur = c.item; movsN.push({ ...c.mov, deRegistroDia: true, fechaRegistro: reg.fecha }); }
        }
        cur = { ...cur, updatedAt: at };
        arr = arr.map(x => x.id === cur.id ? cur : x); ids.push(cur.id);
      });
      if (ids.length) {
        if (!(await store.set("inv-items", arr))) throw new Error("La nube no aceptó el inventario.");
        const back = await store.getCloud("inv-items");
        if (!(Array.isArray(back) && ids.every(id => back.some(x => x.id === id && x.updatedAt === at)))) throw new Error("La nube no confirmó el inventario.");
        setD(x => ({ ...x, items: back }));
        const porKey = {}; movsN.forEach(m => { const k = keyMovimientos(m.at); (porKey[k] = porKey[k] || []).push(m); });
        for (const [k, l] of Object.entries(porKey)) { const c = await store.getCloud(k); const a = Array.isArray(c) ? c : []; const idsM = new Set(a.map(x => x.id)); await store.set(k, [...a, ...l.filter(x => !idsM.has(x.id))]); }
      }
    } catch (e) { console.warn("[Registro del día] inventario", e); avisos.push(`El registro quedó guardado, pero el inventario de GeoInventory no se pudo actualizar (${e?.message || e}). Volvé a guardar el registro en un momento.`); }
    if (avisos.length) alert(avisos.join("\n"));
    return true;
  };
  return { ...d, cargar, guardarProg, registrarDia, labelDe };
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

function EditorProgramacion({ prog: inicial, S, user, proyectos, puedeEditar, isMobile, receta, onVolver, respaldo = null }) {
  const [p, setP] = useState(inicial);
  // Respaldos de esta programación (versiones anteriores que se pisaron al guardar)
  const [respaldos, setRespaldos] = useState([]);
  const [verResp, setVerResp] = useState(false);
  const [viendo, setViendo] = useState(null);
  const [registrando, setRegistrando] = useState(null);   // fecha del "Registrar el día"
  const registroDe = (f, matId) => cierreDe(S.cierres, inicial.projectCode, f)?.materiales?.[matId] || null;
  const cargarResp = useCallback(async () => {
    if (respaldo || inicial._nueva) return;
    try { const h = await store.getCloud(KEY_PROG_HIST); setRespaldos((Array.isArray(h) ? h : []).filter(x => x.progId === inicial.id).sort((a, b) => String(b.reemplazadaAt).localeCompare(String(a.reemplazadaAt)))); } catch { /* best effort */ }
  }, [inicial.id, inicial._nueva, respaldo]);
  useEffect(() => { cargarResp(); }, [cargarResp]);
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
  const cob = useMemo(() => { const r = coberturaProyecto({ short: p.projectCode, prog: p, items: S.items, hoy, cierres: S.cierres }); const m = {}; r.filas.forEach(f => { if (f.matId) m[f.matId] = f; }); return m; }, [p, S.items, S.cierres, hoy]);
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
  // Cambiar el nombre (24-nov-2026: "Cemento" de Aurea es Cemento GU, no el HE
  // de San Miguel). Al renombrar se suelta del artículo de GeoInventory que
  // tuviera amarrado; al guardar se vuelve a buscar con el nombre nuevo.
  const renombrarMat = (m) => {
    const nombre = (prompt("Nombre del material (ej. Cemento GU):", m.nombre) || "").trim();
    if (!nombre) return;
    if ((p.materiales || []).some(x => x.id !== m.id && sinAcentos(x.nombre) === sinAcentos(nombre))) { alert("Ya hay otro material con ese nombre."); return; }
    const unidad = (prompt("Unidad (Bolsa, m3, Barril…):", m.unidad || "") || "").trim() || m.unidad;
    up(x => ({ ...x, materiales: x.materiales.map(y => y.id === m.id ? { ...y, nombre, unidad, itemId: "" } : y) }));
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
      if (await S.guardarProg(conItems)) { setP(conItems); setSucio(false); cargarResp(); }
    } finally { setGuardando(false); }
  };
  const salir = () => { if (sucio && !confirm("Tenés cambios sin guardar. ¿Salir igual?")) return; onVolver(); };
  const [generando, setGenerando] = useState(false);
  const pdf = async () => {
    setGenerando(true);
    try { await pdfSuministro({ hoy, proyectos: [{ short: p.projectCode, nombre: nombreDe(proyectos, p.projectCode), prog: p, filas: coberturaProyecto({ short: p.projectCode, prog: p, items: S.items, hoy, cierres: S.cierres }).filas.map(f => ({ ...f, receta: f.matId ? recetaDeMaterial(receta, p.projectCode, p.materiales.find(m => m.id === f.matId), pendienteDe(f.matId)) : null })) }] }); }
    catch (e) { console.error(e); alert("No se pudo armar el PDF: " + (e?.message || e)); }
    finally { setGenerando(false); }
  };
  const nombre = nombreDe(proyectos, p.projectCode);
  const restaurar = (r) => {
    if (!confirm(`¿Volver a la versión que guardó ${r.version.updatedBy || r.version.creadaPor} el ${fmtDT(r.version.updatedAt)}? La de ahora queda también en respaldos al guardar.`)) return;
    const v = r.version;
    setP(x => ({ ...x, materiales: (v.materiales || []).map(m => ({ ...m })), semanas: [...(v.semanas || [])], dias: JSON.parse(JSON.stringify(v.dias || {})), nota: v.nota || "" }));
    setSucio(true); setViendo(null); setVerResp(false);
  };
  if (viendo) return <EditorProgramacion prog={viendo.version} S={S} user={user} proyectos={proyectos} puedeEditar={false} isMobile={isMobile} receta={receta} respaldo={{ ...viendo, onRestaurar: puedeEditar ? () => restaurar(viendo) : null }} onVolver={() => setViendo(null)} />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    {respaldo && <div style={{ padding: "10px 14px", borderRadius: 14, background: C_AMARILLO.bg, color: C_AMARILLO.color, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 220 }}>Respaldo · así estaba antes de que {respaldo.reemplazadaPor || "alguien"} la cambiara el {fmtDT(respaldo.reemplazadaAt)}. Solo lectura.</span>
      {respaldo.onRestaurar && <Btn small onClick={respaldo.onRestaurar}>Volver a esta versión</Btn>}
    </div>}
    <div className="gt-vidrio" style={{ padding: isMobile ? 12 : 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="gt-circulo" onClick={salir} aria-label="Atrás" style={{ width: 36, height: 36, fontSize: 15 }}>←</button>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ font: "800 17px/1.2 var(--display)", color: CHARCOAL }}>{p.projectCode} · {tituloProg(p)}</div>
        <div style={{ fontSize: 12, color: "#8A847D", marginTop: 3 }}>{nombre ? `${nombre} · ` : ""}{p.updatedAt ? `guardada por ${p.updatedBy} · ${fmtDT(p.updatedAt)}` : "sin guardar"}</div>
      </div>
      {editable && !inicial._nueva && !respaldo && <Btn variant="dark" onClick={() => { if (sucio && !confirm("Tenés cambios sin guardar en la programación. ¿Registrar el día igual? (los cambios siguen acá)")) return; setRegistrando(hoyISO()); }}>Registrar el día</Btn>}
      {respaldos.length > 0 && <Btn variant="ghost" onClick={() => setVerResp(true)}>Respaldos ({respaldos.length})</Btn>}
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
              <td style={{ ...TD, fontWeight: 700, minWidth: 170, padding: "6px 10px" }}>{editable ? <button type="button" title="Cambiar el nombre o la unidad" onClick={() => renombrarMat(m)} style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}>{m.nombre}</button> : m.nombre} <span style={{ color: "#8A847D", fontWeight: 500 }}>({m.unidad})</span>{editable && si === 0 && <button type="button" onClick={() => quitarMat(m.id)} title="Quitar material" style={{ marginLeft: 4, border: "none", background: "none", color: "#B5AFA6", cursor: "pointer", fontSize: 12 }}>✕</button>}
                <ExistenciaMat f={cob[m.id]} />
                {si === 0 && (editable || num(m.usoDiario) > 0) && <button type="button" disabled={!editable} title="Cuánto se usa en un día de trabajo. Con esto, lo programado son las ENTREGAS y cada día se descuenta este consumo." onClick={() => { const v = prompt(`¿Cuánto ${m.nombre} se usa en un día de trabajo? (${m.unidad}) — vacío para quitarlo`, m.usoDiario || ""); if (v === null) return; const n = num(String(v).replace(",", ".")); up(x => ({ ...x, materiales: x.materiales.map(y => y.id === m.id ? { ...y, usoDiario: n > 0 ? n : 0 } : y) })); }} style={{ display: "block", marginTop: 2, border: "none", background: "none", padding: 0, font: "600 11px/1.3 var(--sans)", color: num(m.usoDiario) > 0 ? CHARCOAL : "#A9A39B", cursor: editable ? "pointer" : "default", textAlign: "left" }}>{num(m.usoDiario) > 0 ? <>Usa <b style={{ fontFamily: "var(--mono)" }}>{fmtN(m.usoDiario)}</b> por día{editable ? " · cambiar" : ""}</> : "+ uso por día"}</button>}
                {si === 0 && <RecetaChica r={recetaDeMaterial(receta, p.projectCode, m, pendienteDe(m.id))} partidas={partidasRec} editable={editable} valor={m.partidaId || ""} onElegir={(v) => up(x => ({ ...x, materiales: x.materiales.map(y => y.id === m.id ? { ...y, partidaId: v } : y) }))} />}
              </td>
              {dias.map(f => { const rg = registroDe(f, m.id); const cumR = rg ? cumplimientoDia(cantidadDia(p, f, m.id), rg.llego) : null; const e = rg ? null : cob[m.id]?.dias?.[f]; const c = rg ? (cumR ? CUM[cumR] : null) : e ? COB_DIA[e.estado] : null; return <td key={f} title={e ? `${c.txt}${e.falta ? ` · faltan ${fmtN(e.falta)} ${m.unidad} ese día` : ""}` : rg ? "Día registrado" : ""} style={{ ...TD, textAlign: "center", padding: "4px 4px" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {editable ? <input type="number" inputMode="decimal" min="0" step="any" value={cantidadDia(p, f, m.id) || ""} onChange={e => up(x => ({ ...x, dias: ponerCantidad(x.dias, f, m.id, e.target.value) }))} style={{ ...CTRL, width: isMobile ? 58 : 64, textAlign: "center", padding: "6px 3px", fontFamily: "var(--mono)", fontWeight: 700, ...(c ? { background: c.bg, color: c.color, borderColor: `${c.color}40` } : {}) }} />
                  : <span style={{ display: "inline-block", minWidth: 50, padding: "6px 4px", borderRadius: 8, fontFamily: "var(--mono)", fontWeight: 700, ...(c ? { background: c.bg, color: c.color } : {}) }}>{cantidadDia(p, f, m.id) ? fmtN(cantidadDia(p, f, m.id)) : ""}</span>}
                {rg ? <RegistroCelda r={rg} programado={cantidadDia(p, f, m.id)} /> : <QuedaAlmacen e={e} />}
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
    {registrando && <Modal title={`Registrar el día · ${p.projectCode}`} onClose={() => setRegistrando(null)} wide fondoCierra={false}>
      <RegistroDiaImpl prog={p} S={S} user={user} fechaInicial={registrando} isMobile={isMobile} onClose={() => setRegistrando(null)} />
    </Modal>}
    {verResp && <Modal title={`Respaldos · ${tituloProg(p)}`} onClose={() => setVerResp(false)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, color: "#6E6862" }}>Cada vez que alguien cambia esta programación, la versión de antes queda guardada acá.</div>
        {respaldos.map(r => <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(44,42,40,.04)", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>Guardada por {r.version.updatedBy || r.version.creadaPor} · {fmtDT(r.version.updatedAt)}</div>
            <div style={{ fontSize: 11.5, color: "#8A847D", marginTop: 2 }}>La cambió {r.reemplazadaPor || "—"} · {fmtDT(r.reemplazadaAt)} · {(r.version.materiales || []).map(m => `${fmtN(totalMaterial(r.version, m.id))} ${m.unidad} ${m.nombre}`).join(" · ")}</div>
          </div>
          <Btn small variant="ghost" onClick={() => { setViendo(r); setVerResp(false); }}>Ver</Btn>
          {editable && <Btn small onClick={() => restaurar(r)}>Volver a esta</Btn>}
        </div>)}
      </div>
    </Modal>}
  </div>;
}


// ═══════════════════════ REGISTRO DEL DÍA (25-nov-2026) ═══════════════════════
// Gerson: "con Neftalí todos los días vamos a ver cuánto es el conteo al final
// del día; que diga lo consumido y que en la planificación se refleje". Por
// material: lo que LLEGÓ ese día y lo que QUEDÓ al cierre → se usó = lo que
// había + llegó − quedó. Guarda en sp-cierres y deja GeoInventory al día.
const mesesDesde = (fecha, hoy) => { const out = []; let y = +fecha.slice(0, 4), m = +fecha.slice(5, 7); const yh = +hoy.slice(0, 4), mh = +hoy.slice(5, 7); while (y < yh || (y === yh && m <= mh)) { out.push(`inv-mov-${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } } return out; };
function RegistroDiaImpl({ prog, S, user, fechaInicial, onClose, isMobile }) {
  const hoy = hoyISO();
  const short = prog.projectCode, ub = idUbicProyecto(short);
  const [fecha, setFecha] = useState(fechaInicial || hoy);
  const [movs, setMovs] = useState(null);
  const [filas, setFilas] = useState({});
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    let vivo = true; setMovs(null);
    Promise.all(mesesDesde(fecha, hoy).map(k => store.getCloud(k).catch(() => []))).then(r => { if (vivo) setMovs(r.flatMap(x => Array.isArray(x) ? x : [])); });
    return () => { vivo = false; };
  }, [fecha, hoy]);
  const itemDe = (m) => itemDeMaterial(S.items, m);
  const base = useMemo(() => {
    const o = {};
    (prog.materiales || []).forEach(m => {
      const it = itemDe(m); const mp = it && movs ? movimientosProyecto(movs, it.id, short) : null;
      const yaInv = mp ? mp.entradasDel(fecha) : 0;
      const prev = quedoAntesDe(S.cierres, short, fecha, m.id);
      const conInv = it && (it.stock?.[ub] != null || it.conteos?.[ub]);
      const antes = prev ? prev.quedo : conInv && mp ? Math.max(0, Math.round((stockEnProyecto(it, short) - mp.netoDespues(fecha) - yaInv) * 100) / 100) : null;
      o[m.id] = { it, yaInv, antes, antesDe: prev ? `quedaron el ${diaCorto(prev.fecha).toLowerCase()} ${fechaCorta(prev.fecha)}` : conInv ? "según GeoInventory" : "" };
    });
    return o;
  }, [prog, S.items, S.cierres, movs, fecha]); // eslint-disable-line react-hooks/exhaustive-deps
  // Al cambiar de fecha: lo ya registrado ese día, o lo que el inventario ya sabe que llegó.
  useEffect(() => {
    if (!movs) return;
    const ya = cierreDe(S.cierres, short, fecha);
    const f = {};
    (prog.materiales || []).forEach(m => { const r = ya?.materiales?.[m.id]; f[m.id] = r ? { llego: r.llego === "" || r.llego == null ? "" : String(r.llego), quedo: r.quedo === "" || r.quedo == null ? "" : String(r.quedo) } : { llego: base[m.id]?.yaInv ? String(base[m.id].yaInv) : "", quedo: "" }; });
    setFilas(f); setNota(ya?.nota || "");
  }, [fecha, movs]); // eslint-disable-line react-hooks/exhaustive-deps
  const yaHay = cierreDe(S.cierres, short, fecha);
  const set = (id, k, v) => setFilas(x => ({ ...x, [id]: { ...(x[id] || {}), [k]: v } }));
  const guardar = async () => {
    const mats = {};
    (prog.materiales || []).forEach(m => {
      const f = filas[m.id] || {}; if (f.llego === "" && f.quedo === "") return;
      const b = base[m.id] || {};
      mats[m.id] = { nombre: m.nombre, unidad: m.unidad, itemId: b.it?.id || m.itemId || "", programado: cantidadDia(prog, fecha, m.id), llego: f.llego === "" ? 0 : num(f.llego), quedo: f.quedo === "" ? "" : num(f.quedo), antes: b.antes, consumo: consumoDia({ antes: b.antes, llego: f.llego, quedo: f.quedo }) };
    });
    if (!Object.keys(mats).length) { alert("Escribí al menos lo que llegó o lo que quedó de un material."); return; }
    const neg = Object.values(mats).filter(r => r.consumo != null && r.consumo < 0);
    if (neg.length && !confirm(`Ojo: ${neg.map(r => r.nombre).join(", ")} quedó con MÁS de lo que había más lo que llegó (se usaría ${neg.map(r => r.consumo).join(", ")}). ¿Guardar igual?`)) return;
    setGuardando(true);
    try { if (await S.registrarDia({ projectCode: short, fecha, progId: prog.id, materiales: mats, nota: nota.trim() }, user, movs || [])) onClose(); }
    finally { setGuardando(false); }
  };
  const inp = { ...CTRL, width: isMobile ? 80 : 92, textAlign: "center", fontFamily: "var(--mono)", fontWeight: 700, padding: "8px 6px" };
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "#6E6862" }}>Día
        <input type="date" value={fecha} max={hoy} onChange={e => e.target.value && setFecha(e.target.value)} style={{ ...CTRL, width: "auto" }} />
      </label>
      {[0, 1].map(n => { const f = sumarDias(hoy, -n); return <button key={f} type="button" onClick={() => setFecha(f)} style={{ minHeight: 34, padding: "6px 12px", borderRadius: 999, border: fecha === f ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: fecha === f ? ORANGE_DARK : "#fff", color: fecha === f ? "#fff" : CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer" }}>{n ? "Ayer" : "Hoy"}</button>; })}
      {yaHay && <span style={{ fontSize: 11.5, color: "#8A847D" }}>Ya registrado por {yaHay.porNombre} · {fmtDT(yaHay.updatedAt)} — lo podés corregir</span>}
    </div>
    {!movs ? <div style={{ fontSize: 13, color: "#8A847D" }}>Leyendo el inventario…</div> : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {!isMobile && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) 80px 104px 104px 90px", gap: 10, padding: "0 10px", fontSize: 10.5, fontWeight: 800, color: "#8A847D", textTransform: "uppercase", letterSpacing: ".04em" }}><span>Material</span><span style={{ textAlign: "right" }}>Programado</span><span style={{ textAlign: "center" }}>Llegó</span><span style={{ textAlign: "center" }}>Quedó al cierre</span><span style={{ textAlign: "right" }}>Se usó</span></div>}
      {(prog.materiales || []).map(m => {
        const f = filas[m.id] || { llego: "", quedo: "" }, b = base[m.id] || {};
        const prog0 = cantidadDia(prog, fecha, m.id), cons = consumoDia({ antes: b.antes, llego: f.llego, quedo: f.quedo });
        const cum = f.llego === "" ? null : cumplimientoDia(prog0, f.llego);
        const cC = cum === "cumplido" ? C_VERDE : cum === "parcial" ? C_AMARILLO : cum === "no_llego" ? C_ROJO : null;
        return <div key={m.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "minmax(0,1.6fr) 80px 104px 104px 90px", gap: isMobile ? 8 : 10, alignItems: "center", padding: "10px", borderRadius: 12, background: "rgba(44,42,40,.035)" }}>
          <div style={{ gridColumn: isMobile ? "1 / -1" : undefined, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: CHARCOAL }}>{m.nombre} <span style={{ fontWeight: 500, color: "#8A847D" }}>({m.unidad})</span></div>
            <div style={{ fontSize: 11, color: "#8A847D", marginTop: 2 }}>{b.antes != null ? <>Había <b style={{ color: CHARCOAL }}>{fmtN(b.antes)}</b> · {b.antesDe}</> : "Primer registro: lo que quede hoy sirve de base"}{b.yaInv > 0 ? ` · ${fmtN(b.yaInv)} ya entraron por GeoInventory` : ""}</div>
          </div>
          {!isMobile && <div style={{ textAlign: "right", fontFamily: "var(--mono)", fontWeight: 700, color: prog0 ? CHARCOAL : "#C2BCB3" }}>{prog0 ? fmtN(prog0) : "—"}</div>}
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontSize: 10.5, color: "#8A847D", fontWeight: 700 }}>{isMobile && `Llegó${prog0 ? ` (prog. ${fmtN(prog0)})` : ""}`}
            <input type="number" inputMode="decimal" min="0" step="any" value={f.llego} onChange={e => set(m.id, "llego", e.target.value)} placeholder="0" style={{ ...inp, ...(cC ? { background: cC.bg, color: cC.color, borderColor: `${cC.color}55` } : {}) }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontSize: 10.5, color: "#8A847D", fontWeight: 700 }}>{isMobile && "Quedó al cierre"}
            <input type="number" inputMode="decimal" min="0" step="any" value={f.quedo} onChange={e => set(m.id, "quedo", e.target.value)} placeholder="—" style={inp} />
          </label>
          <div style={{ gridColumn: isMobile ? "1 / -1" : undefined, textAlign: isMobile ? "left" : "right", fontFamily: "var(--mono)", fontWeight: 800, color: cons == null ? "#C2BCB3" : cons < 0 ? C_ROJO.color : CHARCOAL }}>{cons == null ? "—" : `${isMobile ? "Se usó " : ""}${fmtN(cons)}`}</div>
        </div>;
      })}
    </div>}
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#6E6862" }}>Nota (opcional)
      <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. no se coló por lluvia" style={CTRL} />
    </label>
    <div style={{ fontSize: 11.5, color: "#8A847D" }}>Al guardar, GeoInventory queda con lo que quedó en obra.</div>
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
      <Btn disabled={guardando || !movs} onClick={guardar}>{guardando ? "Guardando…" : "Guardar el día"}</Btn>
    </div>
  </div>;
}

// Junto a la cajita de un día YA registrado: lo que llegó (verde si llegó lo
// programado) y lo que se usó.
const CUM = { cumplido: C_VERDE, parcial: C_AMARILLO, no_llego: { color: "#B03024", bg: "rgba(192,57,43,.08)" }, extra: { color: "#1F4F8C", bg: "rgba(31,79,140,.08)" } };
function RegistroCelda({ r, programado }) {
  const cum = cumplimientoDia(programado, r.llego);
  const c = cum ? CUM[cum] : null;
  return <span style={{ width: 46, textAlign: "left", lineHeight: 1.1 }} title={`Llegó ${fmtN(r.llego)}${programado ? ` de ${fmtN(programado)} programadas` : ""}${r.quedo !== "" && r.quedo != null ? ` · quedaron ${fmtN(r.quedo)}` : ""}${r.consumo != null ? ` · se usaron ${fmtN(r.consumo)}` : ""}`}>
    <span style={{ display: "block", fontSize: 9, fontWeight: 700, color: c ? c.color : "#A9A39B" }}>{cum === "cumplido" ? "✓ llegó" : cum === "no_llego" ? "no llegó" : "llegó"}</span>
    <span style={{ display: "block", fontSize: 11, fontWeight: 800, fontFamily: "var(--mono)", color: c ? c.color : "#8A847D" }}>{fmtN(r.llego)}</span>
    {r.consumo != null && <span style={{ display: "block", fontSize: 9, fontWeight: 600, color: "#6E6862", marginTop: 1 }}>usó {fmtN(r.consumo)}</span>}
  </span>;
}

// ── Piezas de cobertura (a nivel de módulo) ──
// Debajo del material (25-nov-2026, Gerson: "con las 285 que amanecieron hoy
// hace 2 pilotes y amanece con 45 mañana; ¿cuándo necesito más bolsas?"):
// Proyecto N · Almacén N, desde cuándo hay que MANDAR del almacén y desde
// cuándo hay que COMPRAR.
function ExistenciaMat({ f }) {
  if (!f) return null;
  if (!f.enInventario) return <div style={{ fontSize: 10.5, color: "#A9A39B", fontWeight: 500, marginTop: 2 }}>no está en GeoInventory</div>;
  const fs = Object.keys(f.dias || {}).sort();
  const mandar = fs.find(x => f.dias[x].delAlmacen > 0);
  const cubreTodo = fs.length > 0 && fs.every(x => f.dias[x].estado === "obra");
  const comprar = fs.find(x => f.dias[x].estado === "falta");
  return <div style={{ fontSize: 11, fontWeight: 500, marginTop: 2, color: "#6E6862", lineHeight: 1.45 }}>
    <div>Proyecto <b style={{ color: CHARCOAL }}>{fmtN(f.stock)}</b> · Almacén <b style={{ color: CHARCOAL }}>{fmtN(f.almacen?.total)}</b></div>
    {cubreTodo && <div style={{ fontWeight: 700, color: C_VERDE.color }}>El proyecto cubre todo</div>}
    {mandar && <div style={{ fontWeight: 700, color: COB_DIA.almacen.color }}>Mandar del almacén el {diaTxt(mandar)}</div>}
    {comprar && <div style={{ fontWeight: 700, color: "#B03024" }}>Comprar para el {diaTxt(comprar)}</div>}
  </div>;
}

// Al lado de la cajita del día: con qué amanece el proyecto (tooltip) y
// queda N (lo cubre el proyecto) · mandar N (del almacén) · comprar N.
function QuedaAlmacen({ e }) {
  if (!e) return <span style={{ width: 44 }} />;
  const t = e.estado === "obra" ? { l: "queda", n: e.obraQueda, c: CHARCOAL } : e.estado === "almacen" ? { l: "mandar", n: e.delAlmacen, c: COB_DIA.almacen.color } : { l: "comprar", n: e.falta, c: COB_DIA.falta.color };
  return <span title={`Amanece con ${fmtN(e.amanece)}${e.entra ? ` · entran ${fmtN(e.entra)}` : ""} · se usan ${fmtN(e.usa)}${e.delAlmacen > 0 ? ` · mandar ${fmtN(e.delAlmacen)} del almacén` : ""}${e.falta > 0 ? ` · comprar ${fmtN(e.falta)}` : ""}`} style={{ width: 44, textAlign: "left", lineHeight: 1.1 }}>
    {e.estado === "falta" && e.delAlmacen > 0 && <><span style={{ display: "block", fontSize: 9, fontWeight: 600, color: COB_DIA.almacen.color }}>mandar</span>
    <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--mono)", color: COB_DIA.almacen.color, marginBottom: 2 }}>{fmtN(e.delAlmacen)}</span></>}
    <span style={{ display: "block", fontSize: 9, fontWeight: 600, color: e.estado === "obra" ? "#A9A39B" : t.c }}>{t.l}</span>
    <span style={{ display: "block", fontSize: 11.5, fontWeight: 800, fontFamily: "var(--mono)", color: t.c }}>{fmtN(t.n)}</span>
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
      const r = coberturaProyecto({ short, prog, items: S.items, hoy, cierres: S.cierres });
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
  const vis = soloAlerta ? datos.filter(d => d.peor === "rojo" || d.peor === "ambar" || (d.filas.some(f => f.enInventario) && !d.alDia)) : datos;
  const ult = ultimoDiaConteo(hoy);
  // Proyectos plegables (25-nov-2026, Gerson: "que se desplieguen para que no
  // se vea tan cargada la pantalla"). Preferencia de pantalla → localStorage.
  const [abiertos, setAbiertos] = useState(() => { try { return JSON.parse(localStorage.getItem("gt-cob-abiertos") || "[]"); } catch { return []; } });
  const alternar = (sh) => setAbiertos(a => { const n = a.includes(sh) ? a.filter(x => x !== sh) : [...a, sh]; try { localStorage.setItem("gt-cob-abiertos", JSON.stringify(n)); } catch { /* sin storage */ } return n; });
  const ultimoUso = (short, matId) => { const l = cierresDe(S.cierres, short).filter(c => c.materiales?.[matId]?.consumo != null); const u = l[l.length - 1]; return u ? { fecha: u.fecha, consumo: u.materiales[matId].consumo } : null; };
  const pillR = (on, txt, c, onClick) => <button type="button" onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 30, padding: "4px 11px", borderRadius: 999, border: on ? "1px solid transparent" : "1px solid rgba(44,42,40,.10)", background: on ? CHARCOAL : "rgba(255,255,255,.7)", color: on ? "#fff" : "#5C5853", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>{c && <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />}{txt}</button>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div className="gt-vidrio" style={{ padding: isMobile ? "10px 12px" : "10px 14px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL, marginRight: 4 }}>Cobertura</span>
      {pillR(!soloAlerta, `Todos ${datos.length}`, null, () => setSoloAlerta(false))}
      {pillR(false, `${nRojo} en rojo`, nRojo ? "#B03024" : "#D8D2C8", () => setSoloAlerta(true))}
      {pillR(false, `${nAmbar} en ámbar`, nAmbar ? "#E8A33D" : "#D8D2C8", () => setSoloAlerta(true))}
      {pillR(false, `${sinConteo} sin conteo`, sinConteo ? "#B03024" : "#D8D2C8", () => setSoloAlerta(true))}
      {soloAlerta && pillR(true, "Solo lo que necesita atención ×", null, () => setSoloAlerta(false))}
      <span style={{ flex: 1 }} />
      <span role="button" title="Volver a leer de la nube" className="gt-circulo" onClick={S.cargar} style={{ width: 32, height: 32, fontSize: 14 }}>↻</span>
      <Btn small variant="ghost" disabled={generando || !datos.some(d => d.prog)} onClick={pdfTodo}>{generando ? "Armando…" : "PDF"}</Btn>
    </div>
    {S.error && <div style={{ color: C_ROJO.color, fontSize: 13 }}>{S.error}</div>}
    {S.cargando ? <div style={{ fontSize: 13, color: "#8A847D" }}>Cargando…</div>
      : vis.length === 0 ? <div className="gt-vidrio" style={{ padding: "30px 20px", textAlign: "center", color: "#8A847D", fontSize: 13.5 }}>{soloAlerta ? "Nada en rojo ni en ámbar. Todos al día." : "Todavía no hay proyectos con programación ni inventario de consumibles."}</div>
      : vis.map(d => {
        const abierto = abiertos.includes(d.short);
        const conProg = d.filas.filter(f => f.semaforo !== "sin_programa" && f.semaforo !== "sin_dato");
        const faltas = conProg.map(f => resumenDias(f.dias, f.porDia).faltaDesde).filter(Boolean).sort();
        const color = d.peor === "rojo" ? "#B03024" : d.peor === "ambar" ? "#C98A1E" : d.peor === "verde" ? "#3E8E5A" : "#B8B1A8";
        const resumen = !d.prog ? "Sin programación" : faltas.length ? `Falta material desde el ${diaTxt(faltas[0])}` : conProg.length ? "Cubierto" : "Sin datos del inventario";
        const conteoTxt = !d.filas.some(f => f.enInventario) ? "" : d.alDia ? `contado ${fmtDT(d.ultimoConteo)}` : d.ultimoConteo ? `sin conteo desde ${fmtDT(d.ultimoConteo)}` : "nunca contado";
        return <div key={d.short} className="gt-vidrio" style={{ padding: 0, overflow: "hidden" }}>
          <div role="button" tabIndex={0} aria-expanded={abierto} onClick={() => alternar(d.short)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(d.short); } }}
            style={{ padding: isMobile ? "12px 14px" : "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL }}>{d.short}</div>
              <div style={{ fontSize: 11.5, color: "#8A847D", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.resp.length ? d.resp.join(", ") : "sin residente asignado"}{d.prog ? ` · ${tituloProg(d.prog)}` : ""}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: faltas.length ? color : d.prog ? "#3E8E5A" : "#8A847D" }}>{resumen}</div>
              {conteoTxt && <div style={{ fontSize: 11, color: d.alDia ? "#8A847D" : "#B03024", marginTop: 2 }}>{conteoTxt}</div>}
            </div>
            <span aria-hidden style={{ color: "#A39C92", fontSize: 13, transform: abierto ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</span>
          </div>
          {abierto && <div style={{ borderTop: "1px solid rgba(44,42,40,.07)", padding: isMobile ? "4px 14px 10px" : "4px 16px 12px" }}>
            {d.filas.length === 0 ? <div style={{ padding: "10px 0", fontSize: 12.5, color: "#8A847D" }}>Sin materiales todavía.{!d.prog && onIrPlanificacion ? <> <button type="button" onClick={onIrPlanificacion} style={{ border: "none", background: "none", color: ORANGE_DARK, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>Hacer la programación</button></> : ""}</div>
              : d.filas.map(f => {
                const sinP = f.semaforo === "sin_programa" || f.semaforo === "sin_dato"; const r = resumenDias(f.dias, f.porDia); const sm = SEMA[f.semaforo];
                const uso = f.matId ? ultimoUso(d.short, f.matId) : null;
                const estado = f.semaforo === "sin_dato" ? "no está en GeoInventory" : f.semaforo === "sin_programa" ? "sin programación" : f.cubreTodo ? "cubre toda la programación" : r.faltaDesde ? `falta desde el ${diaTxt(r.faltaDesde)}` : "";
                return <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(44,42,40,.05)", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sinP ? "#D8D2C8" : sm.c.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL }}>{f.nombre} <span style={{ fontWeight: 500, color: "#8A847D", fontSize: 12 }}>{f.unidad}</span></div>
                    <div style={{ fontSize: 11.5, color: "#8A847D", marginTop: 2 }}>{f.enInventario ? <>Proyecto <b style={{ color: CHARCOAL }}>{fmtN(f.stock)}</b> · almacén <b style={{ color: CHARCOAL }}>{fmtN(f.almacen?.total)}</b></> : "—"}{uso ? <> · se usaron <b style={{ color: CHARCOAL }}>{fmtN(uso.consumo)}</b> el {diaTxt(uso.fecha)}</> : ""}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, fontWeight: 700, color: sinP ? "#A39C92" : sm.c.color, flexShrink: 0 }}>
                    {estado}
                    {!sinP && f.faltanParaMeta > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: "#B03024", marginTop: 2 }}>faltan {fmtN(f.faltanParaMeta)} para la semana</div>}
                    {!sinP && r.mandar > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: COB_DIA.almacen.color, marginTop: 2 }}>mandar {fmtN(r.mandar)} del almacén</div>}
                  </div>
                </div>;
              })}
          </div>}
        </div>;
      })}
  </div>;
}
