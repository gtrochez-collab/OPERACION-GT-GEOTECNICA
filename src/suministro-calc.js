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
//     falta para cubrir una semana. El semáforo mira OBRA + ALMACÉN (lo libre
//     y lo comprometido para el proyecto): rojo = hay que COMPRAR; si la obra
//     sola no alcanza pero el almacén sí, toca MANDAR del almacén.
// Sin React ni store: se prueba con `npm test` (tests/suministro-calc.test.mjs).
// =====================================================================

import { esConsumible, compromisosDe, disponibleEn } from "./geoinventory-calc.js";

export const KEY_PROGRAMACIONES = "sp-programaciones";
// Respaldos (24-nov-2026, Gerson: "que quede siempre respaldo por si llega a
// cambiar una ya publicada"): antes de pisar una programación guardada, la
// versión anterior se copia acá. [{id, progId, projectCode, numero,
// reemplazadaAt, reemplazadaPor, version: <la programación tal cual estaba>}]
export const KEY_PROG_HIST = "sp-programaciones-hist";
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
  if (!n) return null;
  const exacto = vivos.find(i => sinAcentos(i.nombre) === n);
  if (exacto) return exacto;
  // "Cemento HE" ↔ "Cemento HE Argos": todas las palabras de uno están en el
  // otro. Solo si hay UN candidato (con dos, no se adivina) y el nombre corto
  // trae al menos DOS palabras: "Cemento" a secas no dice cuál (24-nov-2026,
  // Aurea usa Cemento GU y se estaba amarrando al HE Argos de San Miguel).
  const pal = (t) => sinAcentos(t).replace(/[^a-z0-9/". ]/g, " ").split(/\s+/).filter(Boolean);
  const a = pal(mat.nombre);
  const cand = vivos.filter(i => { const b = pal(i.nombre); const [chico, grande] = a.length <= b.length ? [a, b] : [b, a]; return chico.length >= 2 && chico.every(w => grande.includes(w)); });
  return cand.length === 1 ? cand[0] : null;
};
export const stockEnProyecto = (item, short) => num(item?.stock?.[idUbicProyecto(short)]);
/**
 * Lo que hay en ALMACÉN (todas las ubicaciones que no son proyectos) para este
 * proyecto: lo libre + lo que ya está comprometido PARA él. Lo comprometido
 * para otro proyecto no cuenta (24-nov-2026: 400 en el plantel, 130 de Torre
 * Adobe → para San Miguel hay 270).
 */
export const almacenParaProyecto = (item, short) => {
  const destino = idUbicProyecto(short);
  let libre = 0, apartado = 0, comprometidoOtros = 0;
  Object.keys(item?.stock || {}).filter(k => !k.startsWith("proy:")).forEach(de => {
    libre += disponibleEn(item, de);
    compromisosDe(item, de).forEach(c => { if (c.para === destino) apartado += num(c.cantidad); else comprometidoOtros += num(c.cantidad); });
  });
  return { libre: r2(libre), apartado: r2(apartado), comprometidoOtros: r2(comprometidoOtros), total: r2(libre + apartado) };
};
/**
 * Día por día: con qué se cubre lo programado desde hoy.
 * → {fecha: {estado "obra" | "almacen" | "falta", falta}} (falta = lo que no alcanza ESE día).
 */
export const estadoPorDia = ({ obra = 0, almacen = 0, porDia = {}, hoy }) => {
  const out = {}; let acum = 0, almPrev = num(almacen);
  Object.keys(porDia || {}).filter(f => f >= hoy && num(porDia[f]) > 0).sort().forEach(f => {
    const q = num(porDia[f]); const antes = acum; acum = r2(acum + q);
    // Lo que quedaría en obra y en almacén después de ese día (se gasta primero la obra).
    const almQ = r2(Math.max(0, num(almacen) - Math.max(0, acum - num(obra))));
    const queda = { usa: q, amanece: r2(Math.max(0, num(obra) - antes)), obraQueda: r2(Math.max(0, num(obra) - acum)), almQueda: almQ, delAlmacen: r2(almPrev - almQ) };
    almPrev = almQ;
    if (acum <= num(obra) + 1e-9) out[f] = { estado: "obra", falta: 0, ...queda };
    else if (acum <= num(obra) + num(almacen) + 1e-9) out[f] = { estado: "almacen", falta: 0, ...queda };
    else out[f] = { estado: "falta", falta: r2(Math.min(q, acum - num(obra) - num(almacen))), cubierto: r2(Math.max(0, num(obra) + num(almacen) - antes)), ...queda };
  });
  return out;
};
/**
 * PLANIFICACIÓN AUTOMÁTICA con consumo estándar (25-nov-2026, Gerson: "Allan
 * necesita sí o sí 240 bolsas al día; la planificación debería ser automática,
 * que nunca baje de 240"). Cada día de trabajo tiene que AMANECER con al menos
 * `uso`: si amanece con menos, la entrega de ese día es lo que falta (primero
 * del almacén → mandar; lo que no hay ahí → comprar). queda = max(amanece, uso) − uso.
 * HOY sin cierre: el stock ya es con lo que amaneció (incluye lo que llegó hoy).
 * Los cierres de cada día corrigen el punto de partida.
 */
export const estadoConUso = ({ obra = 0, almacen = 0, uso = 0, fechas = [], hoy }) => {
  const out = {}; let p = num(obra), alm = num(almacen); const usa = num(uso);
  [...new Set(fechas)].filter(f => f >= hoy).sort().forEach(f => {
    const amanece = r2(p);
    const entrega = r2(Math.max(0, usa - amanece));
    const delAlmacen = r2(Math.min(alm, entrega)); alm = r2(alm - delAlmacen);
    const falta = r2(entrega - delAlmacen);
    const queda = r2(amanece + entrega - usa); p = queda;
    out[f] = { estado: falta > 0 ? "falta" : delAlmacen > 0 ? "almacen" : "obra", amanece, entrega, entra: entrega, usa, obraQueda: queda, almQueda: alm, delAlmacen, falta };
  });
  return out;
};
/** Resumen tipo `coberturaMaterial` a partir de los días de `estadoConUso`. modo "obra" = solo el proyecto; "total" = con el almacén. */
export const coberturaDesdeDias = (dias = {}, hoy, modo = "total", meta = DIAS_META) => {
  const fs = Object.keys(dias).sort();
  if (!fs.length) return { programado7: 0, alcanzaDias: null, faltaDesde: null, cubreTodo: false, faltanParaMeta: 0, semaforo: "sin_programa" };
  const hasta = sumarDias(hoy, meta - 1);
  const programado7 = r2(fs.filter(f => f <= hasta).reduce((a, f) => a + num(dias[f].usa), 0));
  const faltanParaMeta = r2(fs.filter(f => f <= hasta).reduce((a, f) => a + num(dias[f].falta) + (modo === "obra" ? num(dias[f].delAlmacen) : 0), 0));
  const faltaDesde = fs.find(f => modo === "obra" ? dias[f].estado !== "obra" : dias[f].estado === "falta") || null;
  if (!faltaDesde) { const d = diasEntre(hoy, fs[fs.length - 1]) + 1; return { programado7, alcanzaDias: d, faltaDesde: null, cubreTodo: true, faltanParaMeta, semaforo: d < DIAS_ROJO ? "ambar" : "verde" }; }
  const alcanzaDias = diasEntre(hoy, faltaDesde);
  return { programado7, alcanzaDias, faltaDesde, cubreTodo: false, faltanParaMeta, semaforo: alcanzaDias < DIAS_ROJO ? "rojo" : alcanzaDias < meta ? "ambar" : "verde" };
};
/**
 * Resumen de `estadoPorDia`: hasta qué día cubre la obra, hasta cuál con el
 * almacén, desde cuándo falta, cuánto falta en toda la programación y cuánto
 * hay que MANDAR del almacén (lo programado de los días que cubre el almacén).
 */
export const resumenDias = (dias = {}, porDia = {}) => {
  const fs = Object.keys(dias || {}).sort();
  const obraHasta = fs.filter(f => dias[f].estado === "obra").pop() || null;
  const totalHasta = fs.filter(f => dias[f].estado !== "falta").pop() || null;
  const faltaDesde = fs.find(f => dias[f].estado === "falta") || null;
  const faltaTotal = r2(fs.reduce((a, f) => a + num(dias[f].falta), 0));
  // Lo que hay que MANDAR = lo que sale del almacén (nunca lo que ya cubre la obra).
  const mandar = r2(fs.reduce((a, f) => a + num(dias[f].delAlmacen), 0));
  return { primero: fs[0] || null, obraHasta, totalHasta, faltaDesde, faltaTotal, mandar, hayProgramacion: fs.length > 0 };
};
/** Día anterior a `fecha` (el último que sí queda cubierto). */
export const cubreHasta = (cob, hoy) => !cob || cob.semaforo === "sin_programa" ? null : cob.cubreTodo ? "todo" : cob.faltaDesde && cob.faltaDesde > hoy ? sumarDias(cob.faltaDesde, -1) : null;
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
export function coberturaProyecto({ short, prog = null, items = [], hoy: hoyReal, cierres = null }) {
  const ubic = idUbicProyecto(short);
  // Con el cierre de hoy ya registrado, el stock del proyecto YA es lo que quedó:
  // la proyección arranca mañana (si no, se restaría dos veces lo de hoy).
  const hoy = cierres && cierreDe(cierres, short, hoyReal) ? sumarDias(hoyReal, 1) : hoyReal;
  const filas = [];
  const usados = new Set();
  (prog?.materiales || []).forEach(m => {
    const it = itemDeMaterial(items, m);
    if (it) usados.add(it.id);
    const porDia = {}; Object.entries(prog.dias || {}).forEach(([f, d]) => { if (num(d?.[m.id]) > 0) porDia[f] = num(d[m.id]); });
    const stock = it ? stockEnProyecto(it, short) : 0;
    const alm = it ? almacenParaProyecto(it, short) : { libre: 0, apartado: 0, comprometidoOtros: 0, total: 0 };
    const uso = num(m.usoDiario);
    const diasUso = it && uso > 0 ? estadoConUso({ obra: stock, almacen: alm.total, uso, fechas: semanasDe(prog).flatMap(diasDeSemana), hoy }) : null;
    const obra = diasUso ? coberturaDesdeDias(diasUso, hoy, "obra") : coberturaMaterial({ stock, porDia, hoy });
    const total = diasUso ? coberturaDesdeDias(diasUso, hoy, "total") : coberturaMaterial({ stock: stock + alm.total, porDia, hoy });
    filas.push({ key: m.id, matId: m.id, nombre: m.nombre || it?.nombre || "", unidad: m.unidad || it?.unidad || "", partidaId: m.partidaId || "", item: it, enInventario: !!it, stock, almacen: alm, conteo: it ? conteoEnProyecto(it, short) : null, programadoTotal: totalMaterial(prog, m.id), porDia,
      // Sin artículo en el inventario no se sabe cuánto hay: no se pinta nada (no es "falta").
      usoDiario: uso, obra, dias: diasUso || (it ? estadoPorDia({ obra: stock, almacen: alm.total, porDia, hoy }) : {}), ...total, ...(it ? {} : { semaforo: "sin_dato" }) });
  });
  (items || []).filter(i => i && !i.eliminado && esConsumible(i) && !usados.has(i.id) && (num(i.stock?.[ubic]) > 0 || i.conteos?.[ubic])).forEach(it => {
    const alm = almacenParaProyecto(it, short);
    filas.push({ key: it.id, nombre: it.nombre, unidad: it.unidad || "", item: it, enInventario: true, stock: stockEnProyecto(it, short), almacen: alm, conteo: conteoEnProyecto(it, short), programadoTotal: 0, porDia: {}, obra: coberturaMaterial({ stock: 0, porDia: {}, hoy }), dias: {}, ...coberturaMaterial({ stock: stockEnProyecto(it, short), porDia: {}, hoy }) });
  });
  const ORDEN = { rojo: 0, ambar: 1, verde: 2, sin_dato: 3, sin_programa: 4 };
  filas.sort((a, b) => (ORDEN[a.semaforo] ?? 9) - (ORDEN[b.semaforo] ?? 9) || String(a.nombre).localeCompare(String(b.nombre), "es"));
  const ultimoConteo = filas.map(f => f.conteo?.at || "").filter(Boolean).sort().pop() || "";
  const peor = filas.find(f => f.semaforo === "rojo") ? "rojo" : filas.find(f => f.semaforo === "ambar") ? "ambar" : filas.find(f => f.semaforo === "verde") ? "verde" : "sin_programa";
  return { short, filas, ultimoConteo, peor };
}

// =====================================================================
// REGISTRO DEL DÍA (25-nov-2026, Gerson: "con Neftalí todos los días vamos a
// ver cuánto es el conteo al final del día; que diga lo consumido, que en la
// planificación se refleje y que se ponga en verde si se entregó según la
// planificación")
// =====================================================================
// Un registro por proyecto y fecha en `sp-cierres`:
//   {id, projectCode, fecha, progId, materiales: {matId: {nombre, unidad,
//    itemId, programado, llego, quedo, antes, consumo}}, nota, por, porNombre,
//    at, updatedAt, historial[]}
// consumo = lo que había (lo que quedó el registro anterior) + lo que llegó
// − lo que quedó. Sin registro anterior se toma lo que decía GeoInventory.
export const KEY_CIERRES = "sp-cierres";

export const cierreDe = (cierres, short, fecha) => (cierres || []).find(c => c && c.projectCode === short && c.fecha === fecha) || null;
export const cierresDe = (cierres, short) => (cierres || []).filter(c => c && c.projectCode === short).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
/** Lo que quedó de ese material en el último registro ANTES de la fecha (null si no hay). */
export const quedoAntesDe = (cierres, short, fecha, matId) => {
  const prev = cierresDe(cierres, short).filter(c => c.fecha < fecha && c.materiales?.[matId] && c.materiales[matId].quedo !== "" && c.materiales[matId].quedo != null);
  const u = prev[prev.length - 1];
  return u ? { fecha: u.fecha, quedo: num(u.materiales[matId].quedo) } : null;
};
/** Consumo del día; null si no hay con qué comparar o no se contó. */
export const consumoDia = ({ antes, llego, quedo }) => {
  if (antes == null || quedo === "" || quedo == null) return null;
  return r2(num(antes) + num(llego) - num(quedo));
};
/** ¿Llegó lo programado? cumplido · parcial · no_llego · extra (llegó sin estar programado) · null. */
export const cumplimientoDia = (programado, llego) => {
  const p = num(programado), l = num(llego);
  if (p > 0) return l >= p - 1e-9 ? "cumplido" : l > 0 ? "parcial" : "no_llego";
  return l > 0 ? "extra" : null;
};
/** Día de Honduras de un timestamp ISO. */
export const diaHNDe = (iso) => { try { return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Tegucigalpa" }); } catch { return String(iso || "").slice(0, 10); } };
/**
 * Movimientos de GeoInventory de UN artículo hacia/desde la ubicación del
 * proyecto. `entradasDel(fecha)` = lo que ya entró ese día (salidas del almacén
 * hacia el proyecto o entradas directas); `netoDespues(fecha)` = lo que cambió
 * DESPUÉS de ese día (para no pisar lo de hoy al registrar un día anterior);
 * `contadoDespues` = alguien contó después (entonces no se toca el stock).
 */
export const movimientosProyecto = (movs, itemId, short) => {
  const ub = idUbicProyecto(short);
  const del = (movs || []).filter(m => m && m.itemId === itemId && !m.deRegistroDia);
  // `paraFecha`: una salida del almacén mandada por la planificación cuenta
  // como llegada del día para el que se mandó (aunque salga la noche antes).
  const dia = (m) => m.paraFecha || diaHNDe(m.at);
  const signo = (m) => (m.accion === "entrada" || m.accion === "crear") && m.a === ub ? num(m.cantidad)
    : m.accion === "salida" ? (m.a === ub ? num(m.cantidad) : 0) - (m.de === ub ? num(m.cantidad) : 0) : 0;
  return {
    entradasDel: (fecha) => r2(del.filter(m => dia(m) === fecha && ((m.accion === "entrada" && m.a === ub) || (m.accion === "salida" && m.a === ub))).reduce((a, m) => a + num(m.cantidad), 0)),
    netoDespues: (fecha) => r2(del.filter(m => dia(m) > fecha).reduce((a, m) => a + signo(m), 0)),
    contadoDespues: (fecha) => del.some(m => dia(m) > fecha && (m.accion === "conteo" || m.accion === "ajuste") && m.en === ub),
  };
};

/**
 * ENVÍOS DEL ALMACÉN (25-nov-2026, Gerson: "que le mande automático a almacén
 * la notificación de que tiene que mandar para mañana esas 125 bolsas").
 * De la programación vigente de cada proyecto: lo que la planificación dice que
 * hay que MANDAR del almacén hoy o mañana. Se apaga solo al darle salida (el
 * stock pasa al proyecto y la cobertura deja de pedirlo).
 */
export const enviosPendientes = ({ progs = [], items = [], cierres = [], hoy, hasta = null }) => {
  const tope = hasta || sumarDias(hoy, 1);
  const shorts = [...new Set((progs || []).filter(p => p && !p.anulada).map(p => p.projectCode))];
  const out = [];
  shorts.forEach(short => {
    const prog = programacionVigente(progs, short); if (!prog) return;
    coberturaProyecto({ short, prog, items, hoy, cierres }).filas.forEach(f => {
      if (!f.matId || !f.item) return;
      Object.entries(f.dias || {}).filter(([d, e]) => d <= tope && num(e.delAlmacen) > 0).sort().forEach(([d, e]) => {
        out.push({ key: `${short}|${f.matId}|${d}`, short, matId: f.matId, material: f.nombre, unidad: f.unidad, itemId: f.item.id, codigo: f.item.codigo, fecha: d, cantidad: num(e.delAlmacen), comprar: num(e.falta) });
      });
    });
  });
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.short.localeCompare(b.short));
};
