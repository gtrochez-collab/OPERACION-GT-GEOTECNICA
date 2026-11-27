// ═══════════════════════════════════════════════════════════════════════════
// GeoFinance — cajas chicas (27-nov-2026, pedido de Gerson). Lógica PURA.
// ═══════════════════════════════════════════════════════════════════════════
// El ingeniero pide su caja de la semana (compras varias y combustible son DOS
// cajas distintas) a más tardar el JUEVES; Christian la aprueba; la Lic.
// Carolina la acredita con el comprobante de transferencia. Desde que se pide
// queda abierta la "cajita registradora": el ingeniero va registrando cada
// compra con su factura y Contabilidad las valida sin esperar el paquete de
// cierre. Al liquidar, lo que sobra se devuelve a la empresa.
//
// Key `fn-cajas`: [{id, folio CJ-AAAA-NNNN, tipo varias|combustible,
//   projectCode, semana (lunes YYYY-MM-DD), fueraDeCorte, monto, detalle,
//   solicitante {username, nombre, rol}, estado, aprobacion {por, at, monto,
//   comentario}, rechazo {por, at, motivo}, acreditacion {por, at, fecha,
//   monto, comprobante}, gastos [{id, fecha, proveedor, descripcion,
//   numFactura, monto, factura, vehicleId, placa, galones, km, validacion
//   {estado pendiente|validada|observada, por, at, nota}, por, at, anulado}],
//   liquidacion {por, at, gastado, sobrante, faltante, devolucion {monto,
//   fecha, comprobante}}, cierre {por, at}, audit[], createdAt, updatedAt}]

export const KEY_CAJAS = "fn-cajas";
export const TOLERANCIA = 1;   // L 1 de diferencia no cuenta como sobrante ni faltante

export const TIPOS_CAJA = {
  varias: { id: "varias", label: "Compras varias", corto: "Varias" },
  combustible: { id: "combustible", label: "Combustible", corto: "Combustible" },
};

export const ESTADOS_CAJA = {
  solicitada: { label: "Por aprobar", paso: 0 },
  aprobada: { label: "Aprobada · por acreditar", paso: 1 },
  acreditada: { label: "Acreditada", paso: 2 },
  liquidada: { label: "Liquidada · en revisión", paso: 3 },
  cerrada: { label: "Cerrada", paso: 4 },
  rechazada: { label: "Rechazada", paso: -1 },
  cancelada: { label: "Cancelada", paso: -1 },
};
export const PASOS_CAJA = ["Solicitada", "Aprobada", "Acreditada", "Liquidada", "Cerrada"];

// Quiénes entran al módulo. Piden: residentes, Fernando, Óscar, Christian y
// Gerson. Aprueba SOLO Christian (costos). Acredita la Lic. Carolina. Valida
// facturas Contabilidad. Ven todo: Gerson, el Dr. Flores (admin), la Lic.
// Carolina, Christian y Contabilidad.
export const ROLES_FINANCE = ["admin", "tesoreria", "costos", "contabilidad", "residente", "coordinador_maquinas", "logistica"];
// Gerson (usuario "administrador") puede hacer TODOS los pasos — aprobar,
// acreditar, validar y cerrar — para probar y seguir el flujo completo.
export const SUPER_FINANCE = ["administrador"];
export const esSuperFinance = (username) => SUPER_FINANCE.includes(username);
// El CIERRE de la caja lo da Liliana (Contabilidad). Ariel valida facturas
// pero no cierra. Gerson también puede, para probar.
export const CIERRAN_FINANCE = ["liliana.ramos"];
export const puedeCerrarUsuario = (username) => CIERRAN_FINANCE.includes(username) || esSuperFinance(username);
export const permisosFinance = (rol, username = "") => ({
  pide: ["residente", "coordinador_maquinas", "logistica", "costos", "admin"].includes(rol),
  aprueba: rol === "costos" || rol === "admin",
  acredita: rol === "tesoreria" || esSuperFinance(username),
  valida: rol === "contabilidad" || esSuperFinance(username),
  super: esSuperFinance(username),
  cierra: puedeCerrarUsuario(username),
  veTodo: ["admin", "tesoreria", "costos", "contabilidad"].includes(rol),
});
// Christian aprueba todas menos la suya; la de él la aprueba el administrador.
export const puedeAprobar = (rol, username, caja) => {
  if (!caja || caja.estado !== "solicitada") return false;
  if (esSuperFinance(username)) return true;
  const propia = caja.solicitante?.username === username;
  if (rol === "costos") return !propia;
  if (rol === "admin") return caja.solicitante?.rol === "costos" && !propia;
  return false;
};

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const r2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;

// ── Semanas y corte (fechas PURAS YYYY-MM-DD) ──
const aUTC = (ymd) => new Date(ymd + "T00:00:00Z");
const deUTC = (d) => d.toISOString().slice(0, 10);
export const sumarDias = (ymd, n) => { const d = aUTC(ymd); d.setUTCDate(d.getUTCDate() + n); return deUTC(d); };
export const lunesDe = (ymd) => { const d = aUTC(ymd); return sumarDias(ymd, -((d.getUTCDay() + 6) % 7)); };
// La primera semana que se pide en el sistema es la del 7 al 12 de diciembre
// de 2026 (se pide el jueves 3). Antes de eso no se ofrece ninguna.
export const PRIMERA_SEMANA = "2026-12-07";
/** La caja que se pide hoy es para la semana COMPLETA que arranca el lunes siguiente. */
export const semanaSugerida = (hoy) => { const s = sumarDias(lunesDe(hoy), 7); return s < PRIMERA_SEMANA ? PRIMERA_SEMANA : s; };
/** Se pide a más tardar el JUEVES anterior al lunes de la semana. */
export const cierreDeSemana = (semana) => sumarDias(semana, -4);
export const fueraDeCorte = (semana, hoy) => hoy > cierreDeSemana(semana);
export const opcionesSemana = (hoy) => { const l = lunesDe(hoy); const o = [l, sumarDias(l, 7), sumarDias(l, 14)].filter(x => x >= PRIMERA_SEMANA); return o.length ? o : [PRIMERA_SEMANA]; };

// ── Desglose: la caja no se pide "en bulto", cada renglón dice en qué se va a usar ──
// Varias: rubro + monto. Combustible: vehículo o máquina + monto.
export const RUBROS_VARIAS = ["Ferretería y herramienta menor", "Materiales menores", "Repuestos y mantenimiento menor", "Alimentación y agua", "Transporte, fletes y encomiendas", "Peajes y parqueo", "Papelería, copias e impresiones", "Servicios (soldadura, torno, llantera)", "Limpieza y aseo", "Imprevistos", "Otro"];
export const conceptoItem = (it) => String(it?.equipoNombre || it?.rubro || "").trim();
export const itemsValidos = (items) => (items || []).filter(it => conceptoItem(it) && num(it.monto) > 0);
export const totalItems = (items) => r2(itemsValidos(items).reduce((s, it) => s + num(it.monto), 0));
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dm = (ymd) => { const d = aUTC(ymd); return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`; };
export const textoSemana = (semana) => semana ? `Semana del ${dm(semana)} al ${dm(sumarDias(semana, 5))}` : "Sin semana";

// ── Totales ──
export const gastosVigentes = (c) => (c?.gastos || []).filter(g => g && !g.anulado);
export const estadoGasto = (g) => g?.validacion?.estado || "pendiente";
export const totalesCaja = (c) => {
  const gs = gastosVigentes(c);
  const gastado = r2(gs.reduce((s, g) => s + num(g.monto), 0));
  const pedido = r2(c?.monto);
  const aprobado = c?.aprobacion ? r2(c.aprobacion.monto) : 0;
  const acreditado = c?.acreditacion ? r2(c.acreditacion.monto) : 0;
  // Contra qué se mide lo gastado: lo acreditado; si aún no llega, lo aprobado; si no, lo pedido.
  const base = acreditado || aprobado || pedido;
  const dif = r2(base - gastado);
  return {
    pedido, aprobado, acreditado, base, gastado,
    queda: dif > 0 ? dif : 0,
    sobra: dif > TOLERANCIA ? dif : 0,
    falta: dif < -TOLERANCIA ? r2(-dif) : 0,
    nGastos: gs.length,
    porValidar: gs.filter(g => estadoGasto(g) === "pendiente").length,
    observados: gs.filter(g => estadoGasto(g) === "observada").length,
    validados: gs.filter(g => estadoGasto(g) === "validada").length,
    galones: r2(gs.reduce((s, g) => s + num(g.galones), 0)),
  };
};

export const siguienteFolio = (lista, anio) => {
  const pref = `CJ-${anio}-`;
  const max = (lista || []).reduce((m, c) => { const f = String(c?.folio || ""); return f.startsWith(pref) ? Math.max(m, parseInt(f.slice(pref.length), 10) || 0) : m; }, 0);
  return pref + String(max + 1).padStart(4, "0");
};

const VIVAS = new Set(["solicitada", "aprobada", "acreditada", "liquidada", "cerrada"]);
export const validarSolicitud = (f, cajas = [], username = "", editandoId = null) => {
  const e = [];
  if (!TIPOS_CAJA[f?.tipo]) e.push("Elegí si es de compras varias o de combustible.");
  if (!String(f?.projectCode || "").trim()) e.push("Elegí el proyecto.");
  if (!f?.semana) e.push("Elegí la semana.");
  const comb = f?.tipo === "combustible", its = f?.items || [];
  if (!itemsValidos(its).length) e.push(comb ? "Agregá al menos un vehículo o máquina con su monto." : "Agregá al menos un rubro con su monto.");
  else if (its.some(it => (conceptoItem(it) || num(it.monto) > 0 || String(it.nota || "").trim()) && !(conceptoItem(it) && num(it.monto) > 0))) e.push(comb ? "Cada renglón lleva el vehículo o máquina y su monto." : "Cada renglón lleva el rubro y su monto.");
  else if (its.some(it => it.rubro === "Otro" && String(it.nota || "").trim().length < 3)) e.push("En el rubro Otro escribí qué es.");
  if (!e.length && cajas.some(c => c.id !== editandoId && VIVAS.has(c.estado) && c.solicitante?.username === username && c.projectCode === f.projectCode && c.tipo === f.tipo && c.semana === f.semana))
    e.push(`Ya pediste una caja de ${TIPOS_CAJA[f.tipo].label.toLowerCase()} para ese proyecto en esa semana.`);
  return e;
};

export const validarGasto = (g) => {
  const e = [];
  if (!g?.fecha) e.push("Poné la fecha de la compra.");
  if (!String(g?.proveedor || "").trim()) e.push("Poné dónde se compró.");
  if (String(g?.descripcion || "").trim().length < 3) e.push("Escribí qué se compró.");
  if (!(num(g?.monto) > 0)) e.push("Poné el monto de la factura.");
  if (!g?.factura?.fileId) e.push("Falta la foto o el PDF de la factura.");
  return e;
};

/** La cajita registradora está abierta desde que se pide hasta que se liquida. */
export const puedeRegistrarGasto = (c) => ["solicitada", "aprobada", "acreditada"].includes(c?.estado);
/** Un gasto se corrige mientras Contabilidad no lo haya validado y la caja no esté cerrada. */
export const puedeEditarGasto = (c, g) => !!c && !["cerrada", "rechazada", "cancelada"].includes(c.estado) && !g?.anulado && estadoGasto(g) !== "validada"
  && (puedeRegistrarGasto(c) || estadoGasto(g) === "observada");
export const puedeLiquidar = (c) => c?.estado === "acreditada";
export const puedeCerrar = (c) => { if (c?.estado !== "liquidada") return false; const t = totalesCaja(c); return t.porValidar === 0 && t.observados === 0; };
export const puedeCancelar = (c) => c?.estado === "solicitada" && gastosVigentes(c).length === 0;

/** Lo que cada quien tiene por atender (circulito del panel y de las pestañas). */
export const pendientesFinance = ({ cajas = [], rol, username }) => {
  const mias = cajas.filter(c => c.solicitante?.username === username);
  const r = {
    aprobar: cajas.filter(c => puedeAprobar(rol, username, c)).length,
    acreditar: rol === "tesoreria" ? cajas.filter(c => c.estado === "aprobada").length : 0,
    facturas: rol === "contabilidad" ? cajas.filter(c => VIVAS.has(c.estado) && c.estado !== "cerrada").reduce((s, c) => s + totalesCaja(c).porValidar, 0) : 0,
    cerrar: puedeCerrarUsuario(username) ? cajas.filter(puedeCerrar).length : 0,
    observados: mias.filter(c => c.estado !== "cerrada" && VIVAS.has(c.estado)).reduce((s, c) => s + totalesCaja(c).observados, 0),
  };
  r.total = r.aprobar + r.acreditar + r.facturas + r.cerrar + r.observados;
  return r;
};

// ── POR CERRAR: toda caja ya acreditada que no está cerrada, y de quién depende ──
export const finDeSemana = (semana) => sumarDias(semana, 5);   // sábado
export const estaPorCerrar = (c) => c?.estado === "acreditada" || c?.estado === "liquidada";
/** paso: liquidar | corregir (del ingeniero) · validar | cerrar (de Contabilidad). dias = días desde que terminó su semana. */
export const pendienteDeCierre = (c, hoy) => {
  if (!estaPorCerrar(c)) return null;
  const t = totalesCaja(c);
  const paso = c.estado === "acreditada" ? "liquidar" : t.observados ? "corregir" : t.porValidar ? "validar" : "cerrar";
  const fin = finDeSemana(c.semana);
  const dias = hoy > fin ? Math.round((Date.parse(hoy + "T00:00:00Z") - Date.parse(fin + "T00:00:00Z")) / 86400000) : 0;
  return { paso, de: paso === "liquidar" || paso === "corregir" ? "ingeniero" : "contabilidad", dias, atrasada: dias > 0 };
};
export const TEXTO_PASO = { liquidar: "Falta liquidar", corregir: "Tiene facturas por corregir", validar: "Contabilidad valida facturas", cerrar: "Lista para cerrar" };
/** Qué cajas no ha cerrado cada persona (las más atrasadas primero). */
export const porCerrarPorPersona = (cajas = [], hoy) => {
  const m = new Map();
  cajas.filter(estaPorCerrar).forEach(c => {
    const k = c.solicitante?.username || "?";
    if (!m.has(k)) m.set(k, { username: k, nombre: c.solicitante?.nombre || k, cajas: [], monto: 0, atrasadas: 0, suyas: 0, maxDias: 0 });
    const g = m.get(k), p = pendienteDeCierre(c, hoy);
    g.cajas.push({ caja: c, ...p }); g.monto = r2(g.monto + totalesCaja(c).base);
    if (p.atrasada) g.atrasadas++; if (p.de === "ingeniero") g.suyas++; g.maxDias = Math.max(g.maxDias, p.dias);
  });
  return [...m.values()].map(g => ({ ...g, cajas: g.cajas.sort((a, b) => b.dias - a.dias || String(a.caja.semana).localeCompare(String(b.caja.semana))) }))
    .sort((a, b) => b.maxDias - a.maxDias || b.cajas.length - a.cajas.length || a.nombre.localeCompare(b.nombre, "es"));
};

export const entradaAudit = (accion, por, extra = {}) => ({ accion, por, at: new Date().toISOString(), ...extra });
