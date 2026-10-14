// ═══════════════════════════════════════════════════════════════════════════
// GeoInventory — lógica PURA (sin React ni store), 13-oct-2026
// ═══════════════════════════════════════════════════════════════════════════
// Responde tres preguntas sobre cada cosa: QUÉ es, DÓNDE está y CUÁNTO hay
// (o en qué ESTADO está). Dos tipos de artículo:
//   · "cantidad"   — cosas iguales entre sí (cemento, picas, sillas):
//                    `stock: { [ubicacionId]: n }`.
//   · "individual" — cada unidad es única y lleva su código: `ubicacionId`,
//                    `estado`, `asignadoA` (empId de GeoTeam), marca/modelo/serie,
//                    y si es herramienta de perforación `herramienta {tipo,
//                    diametro}` + `maquinaId` cuando está en operación.
//   · "caja"       — (13-oct-2026, pedido de Gerson para GeoDrill Vault) una
//                    cajita con N unidades de algo (15 picas, 10 portapicas):
//                    código y QR PROPIOS (CAJ-0001), `ubicacionId`, `estanteId`
//                    + `nivel`, y `caja {contenido, marca, tamano, cantidad,
//                    capacidad}`. La salida se registra CONTRA ESA CAJA.
// Todo cambio pasa por `aplicarMovimiento` (devuelve el artículo nuevo y el
// movimiento a guardar) — así el historial es automático e invisible.
// Pruebas: tests/geoinventory-calc.test.mjs (`npm test`).
import { UNIDADES } from "./geocost-calc.js";

export { UNIDADES };
export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// ── Categorías (las 6 del spec) y prefijo de código ──
export const CATEGORIAS = [
  { id: "materiales",               label: "Materiales",                 corto: "Materiales",   prefijo: "MAT" },
  { id: "insumos_perforacion",      label: "Insumos de perforación",     corto: "Insumos",      prefijo: "PER" },
  { id: "herramientas_perforacion", label: "Herramientas de perforación", corto: "Herramientas", prefijo: "HER" },
  { id: "mobiliario",               label: "Mobiliario y oficina",       corto: "Mobiliario",   prefijo: "ADM" },
  { id: "computo",                  label: "Equipo de cómputo",          corto: "Cómputo",      prefijo: "TEC" },
  { id: "otros",                    label: "Otros",                      corto: "Otros",        prefijo: "OTR" },
];
export const categoriaDe = (id) => CATEGORIAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length - 1];
export const PREFIJO_CAJA = "CAJ";
export const prefijoDe = (item) => item?.tipo === "caja" ? PREFIJO_CAJA : categoriaDe(item?.categoria).prefijo;
export const esCaja = (item) => item?.tipo === "caja";
// Lo que suele venir en cajitas (GeoDrill Vault); el contenido es texto libre
export const CONTENIDOS_CAJA = ["Pica", "Portapica", "Muela de encamisado", "Puerta muela de encamisado"];
export const MARCAS_CAJA = ["Jeffry Machine", "Drill Master", "Well Equips"];
export const TAMANOS_CAJA = [["jumbo", "Jumbo"], ["mediana", "Mediana"], ["pequena", "Pequeña"]];
export const tamanoLabel = (t) => TAMANOS_CAJA.find(x => x[0] === t)?.[1] || "";
/** "Pica jumbo · Drill Master" */
export const nombreCaja = (c) => [c?.contenido, tamanoLabel(c?.tamano).toLowerCase(), c?.marca ? `· ${c.marca}` : ""].filter(Boolean).join(" ").replace(" ·", " ·");
/** Llena / parcial / vacía — para el color del chip. */
export const nivelCaja = (c) => { const q = num(c?.cantidad), cap = num(c?.capacidad) || q; if (q <= 0) return "vacia"; if (cap && q < cap) return "parcial"; return "llena"; };
export const esHerramienta = (item) => item?.categoria === "herramientas_perforacion";

export const TIPOS_HERRAMIENTA = [
  { id: "broca",      label: "Broca" },
  { id: "bucket",     label: "Bucket" },
  { id: "rompebolon", label: "Rompebolones" },
];
export const tipoHerramientaLabel = (id) => TIPOS_HERRAMIENTA.find(t => t.id === id)?.label || "";

// ── Estados de los individuales ──
export const ESTADOS_HERRAMIENTA = {
  disponible:       { label: "Disponible",       tono: "verde",   nota: "Operativa, lista para usar" },
  en_operacion:     { label: "En operación",     tono: "naranja", nota: "Montada o trabajando en una máquina" },
  requiere_trabajo: { label: "Requiere trabajo", tono: "rojo",    nota: "Reparación o refuerzo antes de usarse" },
};
export const ESTADOS_EQUIPO = {
  bueno:   { label: "Bueno",   tono: "verde" },
  regular: { label: "Regular", tono: "naranja" },
  malo:    { label: "Malo",    tono: "rojo" },
};
export const estadosDe = (item) => esHerramienta(item) ? ESTADOS_HERRAMIENTA : ESTADOS_EQUIPO;
export const estadoInicial = (categoria) => categoria === "herramientas_perforacion" ? "disponible" : "bueno";
export const estadoLabel = (item) => estadosDe(item)[item?.estado]?.label || item?.estado || "";

// ── Ubicaciones ──
// Tres fijas + oficinas (las crea el Coordinador o Ana) + UNA POR PROYECTO
// (automáticas desde la lista de proyectos; id "proy:<short>"). Lo guardado
// en inv-ubicaciones son las oficinas y los ajustes (responsable, activa) de
// cualquiera; las automáticas no se guardan completas.
export const UBICACIONES_FIJAS = [
  { id: "almacen", nombre: "Almacén Central", tipo: "almacen" },
  { id: "vault",   nombre: "GeoDrill Vault",  tipo: "vault" },
  { id: "taller",  nombre: "Taller externo",  tipo: "taller" },
];
export const TIPO_UBICACION = { almacen: "Almacén", oficina: "Oficina", proyecto: "Proyecto", vault: "Bodega", taller: "Taller" };
export const idProyecto = (short) => `proy:${short}`;
/**
 * guardadas: inv-ubicaciones; proyectos: [{short, name}] de la lista unificada.
 * Devuelve TODAS las ubicaciones visibles, en orden: almacén, oficinas, vault,
 * taller, proyectos (alfabético).
 */
export const ubicacionesDe = ({ guardadas = [], proyectos = [] } = {}) => {
  const porId = new Map((guardadas || []).filter(u => u && u.id).map(u => [u.id, u]));
  const mezcla = (base) => ({ ...base, ...(porId.get(base.id) ? { responsable: porId.get(base.id).responsable || "", responsableNombre: porId.get(base.id).responsableNombre || "", activa: porId.get(base.id).activa !== false, codigo: porId.get(base.id).codigo || "" } : { responsable: "", responsableNombre: "", activa: true, codigo: "" }) });
  const fijas = UBICACIONES_FIJAS.map(mezcla);
  const oficinas = (guardadas || []).filter(u => u && u.tipo === "oficina").map(u => ({ ...u, activa: u.activa !== false }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }));
  const proys = (proyectos || []).filter(p => p && p.short).map(p => mezcla({ id: idProyecto(p.short), nombre: p.short, nombreLargo: p.name || p.short, tipo: "proyecto", projectCode: p.short }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base", numeric: true }));
  return [fijas[0], ...oficinas, fijas[1], fijas[2], ...proys].filter(u => u.activa !== false);
};
// ── Estantes (13-oct-2026): dentro de una ubicación (Vault, Almacén), con N
// niveles. Viven en inv-ubicaciones como {id "est:<id>", tipo "estante",
// ubicacionId, nombre, niveles, orden}. Las cajas guardan estanteId + nivel.
export const PREFIJO_UBIC = "UBI";
export const PREFIJO_EST = "EST";
export const MUEBLES = [["estante", "Estante"], ["rack", "Rack"]];
export const muebleLabel = (e) => (MUEBLES.find(x => x[0] === e?.mueble)?.[1]) || "Estante";
/** Código del NIVEL de un estante: EST-0001-N2 (el QR que va pegado en el nivel). */
export const codigoNivel = (est, nivel) => est?.codigo ? `${est.codigo}-N${nivel}` : "";
export const nivelesDe = (est) => Array.from({ length: Math.max(1, Math.round(num(est?.niveles) || 1)) }, (_, i) => String(i + 1));
export const estantesDe = (guardadas = [], ubicacionId = "") => (guardadas || []).filter(e => e && e.tipo === "estante" && e.activa !== false && (!ubicacionId || e.ubicacionId === ubicacionId))
  .sort((a, b) => (num(a.orden) - num(b.orden)) || String(a.nombre).localeCompare(String(b.nombre), "es", { numeric: true }));
export const nombreEstante = (guardadas, id) => (guardadas || []).find(e => e.id === id)?.nombre || "";
/** "Estante A · Nivel 2" */
export const textoEstante = (guardadas, item) => { if (!item?.estanteId) return item?.estante ? `Estante ${item.estante}` : ""; const n = nombreEstante(guardadas, item.estanteId); return n ? `${n}${item.nivel ? ` · Nivel ${item.nivel}` : ""}` : ""; };
export const nombreUbicacion = (ubicaciones, id) => (ubicaciones || []).find(u => u.id === id)?.nombre || (id ? String(id).replace(/^proy:/, "") : "—");

// ── Nombres: normalizar y sugerir existentes (contra duplicados) ──
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
export const normalizarNombre = (t) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9\s"/.#-]/g, " ").replace(/\s+/g, " ").trim();
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "y", "un", "una", "en"]);
export const tokensNombre = (t) => normalizarNombre(t).split(" ").filter(w => w && !VACIAS.has(w));
/** 0..1: qué tanto se parece lo escrito a un artículo existente. */
export const parecidoNombre = (q, nombre) => {
  const nq = normalizarNombre(q), nn = normalizarNombre(nombre);
  if (!nq || !nn) return 0;
  if (nq === nn) return 1;
  if (nn.startsWith(nq)) return 0.9;
  if (nn.includes(nq)) return 0.8;
  const A = tokensNombre(q), B = tokensNombre(nombre);
  if (!A.length || !B.length) return 0;
  const hit = A.filter(a => B.some(b => b === a || (a.length >= 3 && b.startsWith(a)) || (b.length >= 5 && a.length >= 5 && a.startsWith(b.slice(0, 5))))).length;
  return (2 * hit) / (A.length + B.length);
};
/**
 * Mientras se escribe el nombre: artículos existentes que se parecen, mejor
 * primero (máx `max`). Con `categoria` los de esa categoría suben.
 */
export const sugerirExistentes = (q, items, { categoria = "", max = 5, minimo = 0.3 } = {}) => {
  if (String(q || "").trim().length < 2) return [];
  return (items || []).filter(i => i && !i.eliminado).map(i => ({ item: i, score: parecidoNombre(q, i.nombre) + (categoria && i.categoria === categoria ? 0.05 : 0) }))
    .filter(x => x.score >= minimo).sort((a, b) => b.score - a.score || String(a.item.nombre).localeCompare(String(b.item.nombre)))
    .slice(0, max).map(x => x.item);
};

// ── Códigos: MAT-0001, HER-0001… correlativos por prefijo, sobre la lista FRESCA de la nube ──
export const siguientesCodigos = (items, prefijo, n = 1) => {
  const re = new RegExp(`^${prefijo}-(\\d+)$`);
  let max = 0;
  (items || []).forEach(i => { const m = re.exec(String(i?.codigo || "")); if (m) max = Math.max(max, Number(m[1])); });
  return Array.from({ length: Math.max(1, n) }, (_, k) => `${prefijo}-${String(max + 1 + k).padStart(4, "0")}`);
};
// Artículos (MAT…CAJ), ubicaciones (UBI) y estantes/racks (EST); el NIVEL de
// un estante agrega -N<n> (EST-0001-N2).
const RE_CODIGO = /^(?:(?:MAT|PER|HER|ADM|TEC|OTR|CAJ|UBI)-\d{3,}|EST-\d{3,}(?:-N\d{1,2})?)$/i;
export const esCodigo = (t) => RE_CODIGO.test(String(t || "").trim());
/** De un QR o de lo que tipeó el lector USB → el código (o null). */
export const codigoDeTexto = (t) => {
  const s = String(t || "").trim();
  const m = /[#?&]inv=([A-Z]{3}-\d{3,}(?:-N\d{1,2})?)/i.exec(s);
  if (m) return m[1].toUpperCase();
  return esCodigo(s) ? s.toUpperCase() : null;
};
/**
 * Un código escaneado → qué es. items: inv-items; guardadas: inv-ubicaciones;
 * ubicaciones: ubicacionesDe(...) (trae el código de cada ubicación).
 */
export const resolverCodigo = (codigo, { items = [], guardadas = [], ubicaciones = [] } = {}) => {
  const c = String(codigo || "").trim().toUpperCase();
  if (!c) return null;
  if (c.startsWith("UBI-")) { const u = ubicaciones.find(x => String(x.codigo || "").toUpperCase() === c); return u ? { tipo: "ubicacion", ubicacionId: u.id } : null; }
  if (c.startsWith("EST-")) {
    const [, base, n] = /^(EST-\d+)(?:-N(\d+))?$/.exec(c) || [];
    const est = (guardadas || []).find(e => e && e.tipo === "estante" && e.activa !== false && String(e.codigo || "").toUpperCase() === base);
    if (!est) return null;
    if (n && Number(n) > num(est.niveles)) return null;
    return n ? { tipo: "nivel", estante: est, nivel: String(Number(n)) } : { tipo: "estante", estante: est };
  }
  const it = (items || []).find(i => i && !i.eliminado && String(i.codigo || "").toUpperCase() === c);
  return it ? { tipo: "item", item: it } : null;
};

// ── Stock ──
export const stockDe = (item) => item?.tipo === "cantidad" ? r2(Object.values(item.stock || {}).reduce((a, v) => a + num(v), 0)) : item?.tipo === "caja" ? num(item.caja?.cantidad) : (item?.tipo === "individual" ? 1 : 0);
export const stockEn = (item, ubicacionId) => item?.tipo === "cantidad" ? num(item.stock?.[ubicacionId]) : item?.tipo === "caja" ? (item.ubicacionId === ubicacionId ? num(item.caja?.cantidad) : 0) : (item?.ubicacionId === ubicacionId ? 1 : 0);
export const ubicacionesConStock = (item) => item?.tipo === "cantidad"
  ? Object.entries(item.stock || {}).filter(([, v]) => num(v) > 0).map(([id, v]) => ({ id, cantidad: num(v) }))
  : (item?.ubicacionId ? [{ id: item.ubicacionId, cantidad: item.tipo === "caja" ? num(item.caja?.cantidad) : 1 }] : []);
// Una caja VACÍA sigue estando en su estante (se ve, se rellena): "estar" ≠ tener stock.
export const estaEn = (item, ubicacionId) => item?.tipo === "caja" || item?.tipo === "individual" ? item.ubicacionId === ubicacionId : stockEn(item, ubicacionId) > 0;

// ── Posición dentro de una ubicación (estante/rack + nivel) ──
// Individuales y cajas: `estanteId` + `nivel` (están en UN lugar). Por
// cantidad: `posiciones { [ubicacionId]: {estanteId, nivel} }` (el stock puede
// estar en varias ubicaciones, cada una con su lugar).
export const posicionDe = (item, ubicacionId) => {
  if (!item) return { estanteId: "", nivel: "" };
  if (item.tipo === "cantidad") { const p = item.posiciones?.[ubicacionId]; return { estanteId: p?.estanteId || "", nivel: p?.nivel ? String(p.nivel) : "" }; }
  return item.ubicacionId === ubicacionId ? { estanteId: item.estanteId || "", nivel: item.nivel ? String(item.nivel) : "" } : { estanteId: "", nivel: "" };
};
export const itemsEnUbicacion = (items, ubicacionId) => (items || []).filter(i => i && !i.eliminado && estaEn(i, ubicacionId));
export const itemsEnEstante = (items, est) => itemsEnUbicacion(items, est?.ubicacionId).filter(i => posicionDe(i, est.ubicacionId).estanteId === est.id);
export const itemsEnNivel = (items, est, nivel) => itemsEnEstante(items, est).filter(i => posicionDe(i, est.ubicacionId).nivel === String(nivel));
/** Lo que está en la ubicación pero en ningún estante vigente. */
export const itemsSinEstante = (items, ubicacionId, estantes = []) => { const ids = new Set((estantes || []).map(e => e.id)); return itemsEnUbicacion(items, ubicacionId).filter(i => !ids.has(posicionDe(i, ubicacionId).estanteId)); };
/** Resumen corto de un conjunto: artículos, cajas, unidades en cajas, herramientas. */
export const resumenDe = (lista) => {
  const l = (lista || []).filter(i => i && !i.eliminado);
  return { articulos: l.length, cajas: l.filter(i => i.tipo === "caja").length, enCajas: resumenCajas(l), herramientas: l.filter(esHerramienta).length, individuales: l.filter(i => i.tipo === "individual").length, porCantidad: l.filter(i => i.tipo === "cantidad").length };
};
export const movimientosDe = (movs, ubicacionId) => (movs || []).filter(m => m && (m.a === ubicacionId || m.de === ubicacionId || m.en === ubicacionId));

// ── Movimientos (historial automático) ──
// Devuelve { item, mov } o { error }. `mov` ya trae antes/después.
export const ACCIONES = {
  crear:   "Creado",
  entrada: "Entrada",
  salida:  "Salida",
  mover:   "Movido",
  ajuste:  "Ajuste de cantidad",
  ubicar:  "Ubicado",
  estado:  "Cambio de estado",
  asignar: "Asignación",
  editar:  "Editado",
  eliminar: "Eliminado",
};
export const aplicarMovimiento = (item, m, { by = "", byName = "", at = new Date().toISOString(), id = "" } = {}) => {
  if (!item) return { error: "No existe el artículo." };
  const base = { id: id || `${at}-${Math.random().toString(36).slice(2, 7)}`, at, by, byName, itemId: item.id, codigo: item.codigo, nombre: item.nombre, accion: m.accion, motivo: String(m.motivo || "").trim() };
  const q = r2(num(m.cantidad));
  if (item.tipo === "cantidad") {
    const stock = { ...(item.stock || {}) };
    if (m.accion === "entrada") {
      if (!(q > 0)) return { error: "La cantidad debe ser mayor que 0." };
      if (!m.a) return { error: "Elegí a qué ubicación entra." };
      const antes = num(stock[m.a]); stock[m.a] = r2(antes + q);
      return { item: { ...item, stock }, mov: { ...base, a: m.a, cantidad: q, antes, despues: stock[m.a] } };
    }
    if (m.accion === "salida") {
      if (!(q > 0)) return { error: "La cantidad debe ser mayor que 0." };
      if (!m.de) return { error: "Elegí de qué ubicación sale." };
      const antes = num(stock[m.de]);
      if (q > antes + 1e-9) return { error: `Solo hay ${antes} en esa ubicación.` };
      stock[m.de] = r2(antes - q); if (stock[m.de] <= 0) delete stock[m.de];
      if (m.a) stock[m.a] = r2(num(stock[m.a]) + q);
      return { item: { ...item, stock }, mov: { ...base, de: m.de, a: m.a || "", cantidad: q, antes, despues: num(stock[m.de]), ...(m.entregadoA ? { entregadoA: m.entregadoA, entregadoNombre: m.entregadoNombre || "" } : {}) } };
    }
    if (m.accion === "ajuste") {
      if (!m.en) return { error: "Elegí la ubicación." };
      const antes = num(stock[m.en]), nuevo = r2(num(m.nuevo));
      if (nuevo < 0) return { error: "La cantidad no puede ser negativa." };
      if (nuevo === antes) return { error: "La cantidad es la misma." };
      stock[m.en] = nuevo; if (nuevo <= 0) delete stock[m.en];
      return { item: { ...item, stock }, mov: { ...base, en: m.en, cantidad: r2(nuevo - antes), antes, despues: nuevo } };
    }
    if (m.accion === "ubicar") {
      if (!m.en) return { error: "Elegí la ubicación." };
      if (!(num(stock[m.en]) > 0)) return { error: "No hay existencias en esa ubicación." };
      const antes = item.posiciones?.[m.en] || {};
      if ((antes.estanteId || "") === (m.estanteId || "") && String(antes.nivel || "") === String(m.nivel || "")) return { error: "Ya está ahí." };
      const posiciones = { ...(item.posiciones || {}) };
      if (m.estanteId) posiciones[m.en] = { estanteId: m.estanteId, nivel: String(m.nivel || "1") }; else delete posiciones[m.en];
      return { item: { ...item, posiciones }, mov: { ...base, en: m.en, deEstante: antes.estanteId || "", deNivel: antes.nivel || "", aEstante: m.estanteId || "", aNivel: m.estanteId ? String(m.nivel || "1") : "" } };
    }
    if (m.accion === "editar") return { item: { ...item, ...m.cambios }, mov: { ...base, cambios: Object.keys(m.cambios || {}) } };
    if (m.accion === "eliminar") return { item: { ...item, eliminado: true, eliminadoAt: at, eliminadoPor: byName || by }, mov: base };
    return { error: "Esa acción no aplica a un artículo por cantidad." };
  }
  // caja: la salida y la entrada van CONTRA ESA CAJA
  if (item.tipo === "caja") {
    const caja = { ...(item.caja || {}) };
    if (m.accion === "salida") {
      if (!(q > 0)) return { error: "¿Cuántas salen?" };
      const antes = num(caja.cantidad);
      if (q > antes + 1e-9) return { error: `En esta caja solo quedan ${antes}.` };
      caja.cantidad = r2(antes - q);
      return { item: { ...item, caja }, mov: { ...base, de: item.ubicacionId || "", a: m.a || "", cantidad: q, antes, despues: caja.cantidad, contenido: caja.contenido || "", ...(m.entregadoA ? { entregadoA: m.entregadoA, entregadoNombre: m.entregadoNombre || "" } : {}) } };
    }
    if (m.accion === "entrada") {
      if (!(q > 0)) return { error: "¿Cuántas entran?" };
      const antes = num(caja.cantidad); caja.cantidad = r2(antes + q);
      if (num(caja.capacidad) < caja.cantidad) caja.capacidad = caja.cantidad;
      return { item: { ...item, caja }, mov: { ...base, a: item.ubicacionId || "", cantidad: q, antes, despues: caja.cantidad, contenido: caja.contenido || "" } };
    }
    if (m.accion === "ajuste") {
      const antes = num(caja.cantidad), nuevo = r2(num(m.nuevo));
      if (nuevo < 0) return { error: "La cantidad no puede ser negativa." };
      if (nuevo === antes) return { error: "La cantidad es la misma." };
      caja.cantidad = nuevo; if (num(caja.capacidad) < nuevo) caja.capacidad = nuevo;
      return { item: { ...item, caja }, mov: { ...base, en: item.ubicacionId || "", cantidad: r2(nuevo - antes), antes, despues: nuevo, contenido: caja.contenido || "" } };
    }
    if (m.accion === "mover") {
      const a = m.a || item.ubicacionId;
      const mismo = a === item.ubicacionId && (m.estanteId ?? item.estanteId ?? "") === (item.estanteId || "") && String(m.nivel ?? item.nivel ?? "") === String(item.nivel || "");
      if (mismo) return { error: "Ya está ahí." };
      const nx = { ...item, ubicacionId: a, estanteId: m.estanteId ?? (a === item.ubicacionId ? item.estanteId : ""), nivel: m.nivel ?? (a === item.ubicacionId ? item.nivel : "") };
      return { item: nx, mov: { ...base, de: item.ubicacionId || "", a, cantidad: num(caja.cantidad), deEstante: item.estanteId || "", deNivel: item.nivel || "", aEstante: nx.estanteId || "", aNivel: nx.nivel || "" } };
    }
    if (m.accion === "editar") return { item: { ...item, ...m.cambios }, mov: { ...base, cambios: Object.keys(m.cambios || {}) } };
    if (m.accion === "eliminar") return { item: { ...item, eliminado: true, eliminadoAt: at, eliminadoPor: byName || by }, mov: base };
    return { error: "Esa acción no aplica a una caja." };
  }
  // individual
  if (m.accion === "mover") {
    if (!m.a) return { error: "Elegí a dónde va." };
    const mismaUbic = m.a === item.ubicacionId;
    const estanteId = m.estanteId ?? (mismaUbic ? item.estanteId || "" : "");
    const nivel = estanteId ? String(m.nivel ?? (mismaUbic ? item.nivel || "1" : "1")) : "";
    if (mismaUbic && estanteId === (item.estanteId || "") && nivel === String(item.nivel || "") && !m.estado) return { error: "Ya está ahí." };
    const nx = { ...item, ubicacionId: m.a, estanteId, nivel };
    if (m.estado) nx.estado = m.estado;
    if (m.estado && m.estado !== "en_operacion") { nx.maquinaId = ""; nx.maquinaNombre = ""; }
    return { item: nx, mov: { ...base, de: item.ubicacionId || "", a: m.a, cantidad: 1, deEstante: item.estanteId || "", deNivel: item.nivel || "", aEstante: estanteId, aNivel: nivel } };
  }
  if (m.accion === "estado") {
    const estados = estadosDe(item);
    if (!estados[m.estado]) return { error: "Estado no válido." };
    if (m.estado === "en_operacion" && !m.maquinaId) return { error: "Elegí en qué máquina está." };
    const nx = { ...item, estado: m.estado, maquinaId: m.estado === "en_operacion" ? m.maquinaId : "", maquinaNombre: m.estado === "en_operacion" ? (m.maquinaNombre || "") : "" };
    return { item: nx, mov: { ...base, estadoDe: item.estado || "", estadoA: m.estado, ...(m.maquinaId && m.estado === "en_operacion" ? { maquinaId: m.maquinaId, maquinaNombre: m.maquinaNombre || "" } : {}) } };
  }
  if (m.accion === "asignar") {
    const nx = { ...item, asignadoA: m.empId || "", asignadoNombre: m.empId ? (m.empNombre || "") : "" };
    return { item: nx, mov: { ...base, asignadoDe: item.asignadoA || "", asignadoDeNombre: item.asignadoNombre || "", asignadoA: nx.asignadoA, asignadoNombre: nx.asignadoNombre } };
  }
  if (m.accion === "editar") return { item: { ...item, ...m.cambios }, mov: { ...base, cambios: Object.keys(m.cambios || {}) } };
  if (m.accion === "eliminar") return { item: { ...item, eliminado: true, eliminadoAt: at, eliminadoPor: byName || by }, mov: base };
  return { error: "Esa acción no aplica a un artículo individual." };
};
/** Texto corto de un movimiento para la lista ("Entrada · 20 Bolsa → Almacén Central"). */
export const textoMovimiento = (m, ubicaciones = []) => {
  const u = (id) => nombreUbicacion(ubicaciones, id);
  const c = m.cantidad != null ? `${num(m.cantidad).toLocaleString("es-HN")} ` : "";
  switch (m.accion) {
    case "crear": return m.a ? `Creado en ${u(m.a)}${m.cantidad > 1 ? ` · ${c}` : ""}` : "Creado";
    case "entrada": return `+${c}→ ${u(m.a)}`;
    case "salida": return `−${c}${m.contenido ? `${m.contenido.toLowerCase()}${num(m.cantidad) === 1 ? "" : "s"} ` : ""}de ${u(m.de)}${m.a ? ` → ${u(m.a)}` : ""}${m.entregadoNombre ? ` → ${m.entregadoNombre}` : ""}`;
    case "mover": return m.aEstante || m.deEstante ? `${u(m.de)}${m.deNivel ? ` (nivel ${m.deNivel})` : ""} → ${u(m.a)}${m.aNivel ? ` (nivel ${m.aNivel})` : ""}` : `${u(m.de)} → ${u(m.a)}`;
    case "ubicar": return `${u(m.en)} · ${m.aEstante ? `a nivel ${m.aNivel}` : "fuera de estante"}`;
    case "ajuste": return `${num(m.antes).toLocaleString("es-HN")} → ${num(m.despues).toLocaleString("es-HN")} en ${u(m.en)}`;
    case "estado": return `${m.estadoDe || "—"} → ${m.estadoA}${m.maquinaNombre ? ` (${m.maquinaNombre})` : ""}`;
    case "asignar": return m.asignadoA ? `Asignado a ${m.asignadoNombre}` : `Devuelto por ${m.asignadoDeNombre || "—"}`;
    case "editar": return `Editado: ${(m.cambios || []).join(", ")}`;
    case "eliminar": return "Eliminado";
    default: return m.accion;
  }
};
export const keyMovimientos = (iso) => `inv-mov-${String(iso || new Date().toISOString()).slice(0, 7)}`;

// ── Permisos por rol (13-oct-2026, decisión de Gerson) ──
//   · Gerson (admin) y la Lic. Carolina (tesoreria): TODO.
//   · Óscar (logistica): todo menos AJUSTAR cantidades a mano (corregir stock);
//     sí da entradas y salidas, mueve, asigna, cambia estado e imprime.
//   · Ana (asistente_compras): igual que Óscar + crea oficinas.
//   · Christian (costos), Arturo (compras_ops), gerencia y visores: solo ver.
//   · Residentes y los demás: sin acceso.
export const permisosDe = (role) => {
  const full = role === "admin" || role === "tesoreria";
  const carga = full || role === "logistica" || role === "asistente_compras";
  const ver = carga || ["costos", "compras_ops", "gerencia", "visor_compras", "almacenista", "almacen_visor"].includes(role);
  return {
    ver, cargar: carga, mover: carga, asignar: carga, estado: carga, imprimir: carga, editar: carga, importar: carga,
    ajustar: full, eliminar: full, ubicaciones: full || role === "asistente_compras", config: full,
  };
};
export const ROLES_INVENTARIO = ["admin", "tesoreria", "logistica", "asistente_compras", "costos", "compras_ops", "gerencia", "visor_compras"];

// ── Resumen del inicio ──
export const resumenInventario = (items) => {
  const vivos = (items || []).filter(i => i && !i.eliminado);
  const her = vivos.filter(esHerramienta);
  const cuenta = (k) => her.filter(h => h.estado === k).length;
  return {
    articulos: vivos.length,
    porCantidad: vivos.filter(i => i.tipo === "cantidad").length,
    individuales: vivos.filter(i => i.tipo === "individual").length,
    herramientas: her.length, disponibles: cuenta("disponible"), enOperacion: cuenta("en_operacion"), requierenTrabajo: cuenta("requiere_trabajo"),
    asignados: vivos.filter(i => i.tipo === "individual" && i.asignadoA).length,
    sinFoto: vivos.filter(i => !i.foto?.fileId).length,
    cajas: vivos.filter(i => i.tipo === "caja").length,
    enCajas: resumenCajas(vivos),
  };
};
/** [{contenido, cajas, unidades, vacias}] — lo que hay en cajitas, por contenido. */
export const resumenCajas = (items, ubicacionId = "") => {
  const acc = new Map();
  (items || []).filter(i => i && !i.eliminado && i.tipo === "caja" && (!ubicacionId || i.ubicacionId === ubicacionId)).forEach(i => {
    const k = String(i.caja?.contenido || "Sin contenido").trim();
    const a = acc.get(k) || { contenido: k, cajas: 0, unidades: 0, vacias: 0 };
    a.cajas++; a.unidades = r2(a.unidades + num(i.caja?.cantidad)); if (num(i.caja?.cantidad) <= 0) a.vacias++;
    acc.set(k, a);
  });
  return [...acc.values()].sort((a, b) => b.unidades - a.unidades);
};

// ── Buscar ──
export const buscarItems = (items, { q = "", ubicacionId = "", categoria = "", estado = "", tipo = "", asignadoA = "" } = {}) => {
  const nq = normalizarNombre(q);
  const cod = esCodigo(q) ? String(q).trim().toUpperCase() : "";
  return (items || []).filter(i => i && !i.eliminado).filter(i => {
    if (ubicacionId && !estaEn(i, ubicacionId)) return false;
    if (categoria && i.categoria !== categoria) return false;
    if (tipo && i.tipo !== tipo) return false;
    if (estado && i.estado !== estado) return false;
    if (asignadoA && i.asignadoA !== asignadoA) return false;
    if (cod) return String(i.codigo || "").toUpperCase() === cod || String(i.codigo || "").toUpperCase().startsWith(cod);
    if (!nq) return true;
    const texto = normalizarNombre(`${i.codigo} ${i.nombre} ${i.marca || ""} ${i.modelo || ""} ${i.serie || ""} ${i.asignadoNombre || ""} ${i.herramienta?.diametro || ""} ${tipoHerramientaLabel(i.herramienta?.tipo)} ${i.caja ? `caja ${i.caja.contenido || ""} ${i.caja.marca || ""} ${tamanoLabel(i.caja.tamano)}` : ""}`);
    return nq.split(" ").every(w => texto.includes(w));
  });
};

// ── Carga desde Excel (CSV o pegado de celdas, separado por tab) ──
export const COLUMNAS_IMPORT = ["nombre", "categoria", "tipo", "cantidad", "unidad", "ubicacion", "estado", "marca", "modelo", "serie", "asignado", "cajas", "estante", "nivel"];
export const plantillaCSV = () => [COLUMNAS_IMPORT.join(","), 'Cemento GU 42.5 kg,Materiales,cantidad,120,Bolsa,Almacén Central,,,,,,,,', 'Monitor 24",Equipo de cómputo,individual,2,,Oficina Operaciones,Bueno,Dell,P2422H,,,,,', 'Broca 1.20 m,Herramientas de perforación,individual,1,,VILLA SAN MIGUEL,Disponible,,,,,,,', 'Pica jumbo,Insumos de perforación,caja,15,,GeoDrill Vault,,Drill Master,,,,6,Estante A,2'].join("\n");
const sepDe = (linea) => { const t = (linea.match(/\t/g) || []).length, pc = (linea.match(/;/g) || []).length, c = (linea.match(/,/g) || []).length; return t >= Math.max(pc, c) && t > 0 ? "\t" : pc > c ? ";" : ","; };
export const parseTabla = (texto) => {
  const lineas = String(texto || "").replace(/\r/g, "").split("\n").filter(l => l.trim());
  if (!lineas.length) return { cabecera: [], filas: [] };
  const sep = sepDe(lineas[0]);
  const partir = (l) => {
    const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      // Comillas SOLO abren al inicio del campo y cierran antes del separador:
      // así 'Monitor 24"' (pulgadas, sin comillas de Excel) no rompe la fila.
      if (ch === '"' && !q && cur === "") q = true;
      else if (ch === '"' && q && l[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"' && q && (i + 1 >= l.length || l[i + 1] === sep)) q = false;
      else if (ch === sep && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim());
  };
  const cab = partir(lineas[0]).map(h => normalizarNombre(h).replace(/\s+/g, "_"));
  return { cabecera: cab, filas: lineas.slice(1).map(partir).map(cols => Object.fromEntries(cab.map((h, i) => [h, cols[i] ?? ""]))) };
};
const catPorTexto = (t) => { const n = normalizarNombre(t); return CATEGORIAS.find(c => normalizarNombre(c.label) === n || normalizarNombre(c.corto) === n || c.prefijo.toLowerCase() === n || c.id === n)?.id || (n.includes("herram") ? "herramientas_perforacion" : n.includes("insumo") || n.includes("perfor") ? "insumos_perforacion" : n.includes("comput") || n.includes("tec") ? "computo" : n.includes("mobil") || n.includes("ofic") || n.includes("adm") ? "mobiliario" : n.includes("mater") ? "materiales" : ""); };
const estadoPorTexto = (t, categoria) => { const n = normalizarNombre(t); const estados = categoria === "herramientas_perforacion" ? ESTADOS_HERRAMIENTA : ESTADOS_EQUIPO; return Object.keys(estados).find(k => normalizarNombre(estados[k].label) === n || k === n) || ""; };
/**
 * filas (de parseTabla) → { listos: [{...item parcial, cantidad, ubicacionId}], errores: [{fila, error}] }.
 * `ubicaciones` para resolver el nombre; `ubicacionDefault` si la columna viene vacía.
 */
export const prepararImportacion = (filas, { ubicaciones = [], ubicacionDefault = "", empleados = [] } = {}) => {
  const listos = [], errores = [];
  const ubiPorNombre = (t) => { const n = normalizarNombre(t); if (!n) return ""; return (ubicaciones.find(u => normalizarNombre(u.nombre) === n) || ubicaciones.find(u => normalizarNombre(u.nombreLargo || "") === n) || ubicaciones.find(u => normalizarNombre(u.nombre).includes(n)))?.id || ""; };
  const empPorNombre = (t) => { const n = normalizarNombre(t); if (!n) return null; return empleados.find(e => normalizarNombre(e.fullName) === n) || empleados.find(e => normalizarNombre(e.fullName).includes(n)) || null; };
  filas.forEach((f, i) => {
    const fila = i + 2;
    const nombre = String(f.nombre || "").trim();
    if (!nombre) { errores.push({ fila, error: "Sin nombre" }); return; }
    const categoria = catPorTexto(f.categoria) || "otros";
    const tipo = /caja/i.test(f.tipo || "") ? "caja" : /indiv/i.test(f.tipo || "") ? "individual" : "cantidad";
    const cantidad = num(f.cantidad) > 0 ? num(f.cantidad) : (tipo === "individual" ? 1 : 0);
    if (tipo === "caja") {
      const ubicacionId = ubiPorNombre(f.ubicacion) || ubicacionDefault;
      if (!ubicacionId) { errores.push({ fila, error: `${nombre}: no encontré la ubicación "${f.ubicacion}"` }); return; }
      if (!(cantidad > 0)) { errores.push({ fila, error: `${nombre}: ¿cuántas trae cada caja?` }); return; }
      listos.push({ nombre, categoria: catPorTexto(f.categoria) || "insumos_perforacion", tipo: "caja", ubicacionId, contenido: nombre, marca: String(f.marca || "").trim(), cantidad, capacidad: cantidad, cajas: num(f.cajas) > 0 ? Math.round(num(f.cajas)) : 1, estanteNombre: String(f.estante || "").trim(), nivel: String(f.nivel || "").trim() });
      return;
    }
    if (tipo === "cantidad" && !(cantidad > 0)) { errores.push({ fila, error: `${nombre}: cantidad inválida` }); return; }
    const ubicacionId = ubiPorNombre(f.ubicacion) || ubicacionDefault;
    if (!ubicacionId) { errores.push({ fila, error: `${nombre}: no encontré la ubicación "${f.ubicacion}"` }); return; }
    const emp = tipo === "individual" ? empPorNombre(f.asignado) : null;
    if (tipo === "individual" && f.asignado && !emp) { errores.push({ fila, error: `${nombre}: no encontré al colaborador "${f.asignado}"` }); return; }
    listos.push({ nombre, categoria, tipo, cantidad, unidad: tipo === "cantidad" ? (UNIDADES.find(u => normalizarNombre(u) === normalizarNombre(f.unidad)) || String(f.unidad || "").trim() || "Unidad") : "", ubicacionId,
      estado: tipo === "individual" ? (estadoPorTexto(f.estado, categoria) || estadoInicial(categoria)) : "", marca: String(f.marca || "").trim(), modelo: String(f.modelo || "").trim(), serie: String(f.serie || "").trim(),
      ...(emp ? { asignadoA: emp.id, asignadoNombre: emp.fullName } : {}) });
  });
  return { listos, errores };
};
