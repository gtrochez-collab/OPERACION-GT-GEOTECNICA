// =====================================================================
// SUMINISTRO A OBRA — lógica PURA (24-nov-2026, Gerson)
// =====================================================================
// "Estamos muy desconectados con el suministro de materiales en proyectos:
// no tenemos dónde ver cuánto cemento o aditivo tienen. Quiero ir unos 3 días
// o una semana adelante de la operación para que nunca nos quedemos sin
// material."
//
// Tres piezas:
//   · PROGRAMACIÓN (GeoSupply → Planificación, la carga Neftalí): por proyecto,
//     cuánto material se necesita CADA DÍA (su Excel "Programación de
//     agregados Aurea No. 1": material · cantidad por día · total semana).
//     Key `sp-programaciones`.
//   · INVENTARIO EN OBRA (GeoInventory, lo actualiza el residente): stock del
//     consumible en la ubicación `proy:<short>` + su último conteo.
//   · COBERTURA (GeoSupply → Cobertura): stock vs programación → para cuántos
//     días alcanza, semáforo (rojo < 3 días · ámbar < 7 · verde) y cuánto
//     falta para cubrir una semana.
// Sin React ni store: se prueba con `npm test` (tests/suministro-calc.test.mjs).
// =====================================================================

import { esConsumible } from "./geoinventory-calc.js";

export const KEY_PROGRAMACIONES = "sp-programaciones";
// Proyectos activos que elige Gerson (GeoInventory → Proyectos → Elegir activos).
// {shorts: [short], updatedAt, updatedBy}. Vacío = todos se ven como antes.
export const KEY_PROYECTOS_ACTIVOS = "gt-proyectos-activos";
export const DIAS_ROJO = 3;       // menos de esto: rojo
export const DIAS_META = 7;       // la meta: una semana adelante

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const DIA = 86400000;
const aUTC = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const sumarDias = (iso, n) => new Date(aUTC(iso) + n * DIA).toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((aUTC(b) - aUTC(a)) / DIA);
export const diaSemana = (iso) => new Date(aUTC(iso)).getUTCDay();
/** Lunes de la semana de la fecha. */
export const lunesDe = (iso) => sumarDias(iso, -((diaSemana(iso) + 6) % 7));
const DIAS_C = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const diaCorto = (iso) => DIAS_C[diaSemana(iso)];
export const fechaCorta = (iso) => `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]}`;
/** Las 6 fechas (lunes a sábado) de la semana que empieza en `lunes`. */
export const diasDeSemana = (lunes) => Array.from({ length: 6 }, (_, i) => sumarDias(lunes, i));

export const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ── Programaciones ──
// {id, projectCode, numero, titulo, semanas: [lunes], materiales: [{id, nombre,
//  unidad, itemId}], dias: {fecha: {matId: n}}, nota, creadaPor, creadaAt,
//  updatedAt, updatedBy, anulada}
/** Semanas de la programación (los lunes guardados + los que tengan cantidades), en orden. */
export const semanasDe = (prog) => {
  const s = new Set((prog?.semanas || []).filter(Boolean));
  Object.keys(prog?.dias || {}).forEach(f => s.add(lunesDe(f)));
  return [...s].sort();
};
export const cantidadDia = (prog, fecha, matId) => num(prog?.dias?.[fecha]?.[matId]);
export const totalSemana = (prog, lunes, matId) => r2(diasDeSemana(lunes).reduce((a, f) => a + cantidadDia(prog, f, matId), 0));
export const totalMaterial = (prog, matId) => r2(Object.values(prog?.dias || {}).reduce((a, d) => a + num(d?.[matId]), 0));
/** La programación vigente del proyecto: la de número más alto que no esté anulada. */
export const programacionVigente = (progs, short) => (progs || [])
  .filter(p => p && !p.anulada && p.projectCode === short)
  .sort((a, b) => num(b.numero) - num(a.numero) || String(b.creadaAt || "").localeCompare(String(a.creadaAt || "")))[0] || null;
export const siguienteNumero = (progs, short) => 1 + Math.max(0, ...(progs || []).filter(p => p && p.projectCode === short).map(p => num(p.numero)));
/** Pone (o borra con vacío/0) una cantidad del día; devuelve los `dias` nuevos. */
export const ponerCantidad = (dias, fecha, matId, v) => {
  const n = { ...(dias || {}) }; const d = { ...(n[fecha] || {}) };
  const x = v === "" || v == null ? 0 : num(v);
  if (x > 0) d[matId] = r2(x); else delete d[matId];
  if (Object.keys(d).length) n[fecha] = d; else delete n[fecha];
  return n;
};

// ── Inventario del proyecto ──
export const idUbicProyecto = (short) => `proy:${short}`;
/** El artículo del inventario de un material: por itemId, o por nombre parecido. */
export const itemDeMaterial = (items, mat) => {
  const vivos = (items || []).filter(i => i && !i.eliminado && esConsumible(i));
  if (mat?.itemId) { const x = vivos.find(i => i.id === mat.itemId); if (x) return x; }
  const n = sinAcentos(mat?.nombre);
  return n ? vivos.find(i => sinAcentos(i.nombre) === n) || null : null;
};
export const stockEnProyecto = (item, short) => num(item?.stock?.[idUbicProyecto(short)]);
export const conteoEnProyecto = (item, short) => item?.conteos?.[idUbicProyecto(short)] || null;

// ── Cobertura ──
/**
 * Para cuántos días alcanza `stock` siguiendo la programación diaria desde hoy.
 * @param porDia  {fecha: cantidad} del material
 * @returns {programado7, alcanzaDias, faltaDesde, cubreTodo, faltanParaMeta, semaforo}
 *   · alcanzaDias: días de calendario desde hoy hasta el primer día que ya no
 *     alcanza (0 = hoy mismo no alcanza). null si no hay programación pendiente.
 *   · cubreTodo: el stock alcanza para toda la programación que queda.
 *   · faltanParaMeta: lo que hay que conseguir para cubrir los próximos 7 días.
 */
export function coberturaMaterial({ stock = 0, porDia = {}, hoy, meta = DIAS_META }) {
  const fechas = Object.keys(porDia || {}).filter(f => f >= hoy && num(porDia[f]) > 0).sort();
  const hasta = sumarDias(hoy, meta - 1);
  const programado7 = r2(fechas.filter(f => f <= hasta).reduce((a, f) => a + num(porDia[f]), 0));
  const faltanParaMeta = r2(Math.max(0, programado7 - num(stock)));
  if (!fechas.length) return { programado7: 0, alcanzaDias: null, faltaDesde: null, cubreTodo: false, faltanParaMeta: 0, semaforo: "sin_programa" };
  let acum = 0, faltaDesde = null;
  for (const f of fechas) { acum = r2(acum + num(porDia[f])); if (acum > num(stock) + 1e-9) { faltaDesde = f; break; } }
  if (!faltaDesde) {
    const ultimo = fechas[fechas.length - 1];
    const dias = diasEntre(hoy, ultimo) + 1;
    return { programado7, alcanzaDias: dias, faltaDesde: null, cubreTodo: true, faltanParaMeta, semaforo: dias < DIAS_ROJO ? "ambar" : "verde" };
  }
  const alcanzaDias = diasEntre(hoy, faltaDesde);
  return { programado7, alcanzaDias, faltaDesde, cubreTodo: false, faltanParaMeta, semaforo: alcanzaDias < DIAS_ROJO ? "rojo" : alcanzaDias < meta ? "ambar" : "verde" };
}

/**
 * Cobertura de un proyecto: une los materiales de la programación vigente con
 * los consumibles que ya tiene en su inventario.
 */
export function coberturaProyecto({ short, prog = null, items = [], hoy }) {
  const ubic = idUbicProyecto(short);
  const filas = [];
  const usados = new Set();
  (prog?.materiales || []).forEach(m => {
    const it = itemDeMaterial(items, m);
    if (it) usados.add(it.id);
    const porDia = {}; Object.entries(prog.dias || {}).forEach(([f, d]) => { if (num(d?.[m.id]) > 0) porDia[f] = num(d[m.id]); });
    const stock = it ? stockEnProyecto(it, short) : 0;
    filas.push({ key: m.id, nombre: m.nombre || it?.nombre || "", unidad: m.unidad || it?.unidad || "", item: it, enInventario: !!it, stock, conteo: it ? conteoEnProyecto(it, short) : null, programadoTotal: totalMaterial(prog, m.id), ...coberturaMaterial({ stock, porDia, hoy }) });
  });
  (items || []).filter(i => i && !i.eliminado && esConsumible(i) && !usados.has(i.id) && (num(i.stock?.[ubic]) > 0 || i.conteos?.[ubic])).forEach(it => {
    filas.push({ key: it.id, nombre: it.nombre, unidad: it.unidad || "", item: it, enInventario: true, stock: stockEnProyecto(it, short), conteo: conteoEnProyecto(it, short), programadoTotal: 0, ...coberturaMaterial({ stock: stockEnProyecto(it, short), porDia: {}, hoy }) });
  });
  const ORDEN = { rojo: 0, ambar: 1, verde: 2, sin_programa: 3 };
  filas.sort((a, b) => (ORDEN[a.semaforo] ?? 9) - (ORDEN[b.semaforo] ?? 9) || String(a.nombre).localeCompare(String(b.nombre), "es"));
  const ultimoConteo = filas.map(f => f.conteo?.at || "").filter(Boolean).sort().pop() || "";
  const peor = filas.find(f => f.semaforo === "rojo") ? "rojo" : filas.find(f => f.semaforo === "ambar") ? "ambar" : filas.find(f => f.semaforo === "verde") ? "verde" : "sin_programa";
  return { short, filas, ultimoConteo, peor };
}
