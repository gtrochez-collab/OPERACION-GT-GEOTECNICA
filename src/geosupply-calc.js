// ═══════════════════════════════════════════════════════════════════════════
// GeoSupply — lógica PURA (2-oct-2026)
// ═══════════════════════════════════════════════════════════════════════════
// Sin React, sin `store`. Solo importa fechas.js (Intl) y los helpers numéricos
// de geocost-calc, así Node puede testear este archivo directo
// (`npm test` → tests/geosupply-calc.test.mjs).
//
// Acá vive todo lo que tiene regla de negocio y se puede equivocar:
//   · el CORTE semanal (semana ISO, cierre del martes 12:00, hitos, llegada
//     estimada) — siempre en hora de Honduras;
//   · el SALDO en cantidad de una partida de la receta;
//   · el SEMÁFORO de precio contra el presupuesto y la validación del total;
//   · los ESTADOS de solicitud / línea / cotización y sus transiciones;
//   · el MAPEO de una cotización aprobada al borrador de GeoShopping.
//
// Modelo (ver CLAUDE.md → GeoSupply):
//   sp-solicitudes[]  {id, folio SUP-AAAA-NNNN, projectCode, residente,
//                      fechaRequeridaObra, corte{anio,semana}, urgente,
//                      justificacionUrgencia, estado, lineas[], audit[]}
//   sp-cotizaciones[] {id, folio CTZ-AAAA-NNNN, requestId, projectCode,
//                      providerId, provider, numeroProveedor, pdfFile,
//                      totalDeclarado, incluyeISV, condicionPago, lineas[],
//                      estado, aprobadoPor, aprobadoAt, comentario,
//                      tasaCambioUsada, purchaseId, audit[]}
//   sp-config         CONFIG_DEFAULT con lo que Gerson edite encima.
import { TZ_HN } from "./fechas.js";
import { num, hnlToUsd } from "./geocost-calc.js";

const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
export { round2 };

// ── Configuración (todo editable desde la pestaña Configuración) ───────────
// `dia`: 1 = lunes … 7 = domingo (ISO). `hora`: "HH:MM" en hora de Honduras.
export const CONFIG_DEFAULT = {
  cortes: {
    cierreSolicitudes: { dia: 2, hora: "12:00" },  // martes 12:00 — después, al corte siguiente
    almacenHasta:      { dia: 2, hora: "15:00" },  // martes 15:00 — lo sin revisar pasa a Por cotizar
    aprobacionHasta:   { dia: 5, hora: "12:00" },  // viernes 12:00 — lo no aprobado queda "fuera de corte"
    llegadaDesde: 2,                               // martes…
    llegadaHasta: 4,                               // …jueves de la semana SIGUIENTE al corte
  },
  semaforo: { verde: 0.03, amarillo: 0.10 },       // ≤3 % verde · ≤10 % amarillo · >10 % rojo
  toleranciaTotalL: 1,                             // la suma de ítems vs el total de la cotización
  isv: 0.15,
  cierrePorProyecto: {},                           // { [projectCode]: "Nombre de quien cierra con conta" }
};

export const configEfectiva = (c) => ({
  ...CONFIG_DEFAULT,
  ...(c || {}),
  cortes: { ...CONFIG_DEFAULT.cortes, ...((c && c.cortes) || {}) },
  semaforo: { ...CONFIG_DEFAULT.semaforo, ...((c && c.semaforo) || {}) },
  cierrePorProyecto: { ...((c && c.cierrePorProyecto) || {}) },
});

export const DIAS_SEMANA = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
export const DIAS_CORTOS = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

// ── Tiempo: SIEMPRE Honduras ────────────────────────────────────────────────
const DOW_EN = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Partes de un instante en hora de Honduras: ymd, hora "HH:MM", min del día, dow ISO. */
export const partesHN = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) return null;
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_HN, hourCycle: "h23", weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const p = {};
  f.formatToParts(d).forEach(x => { if (x.type !== "literal") p[x.type] = x.value; });
  const hh = p.hour === "24" ? "00" : p.hour;   // quirk de algunos ICU con h23
  const min = Number(hh) * 60 + Number(p.minute);
  return { ymd: `${p.year}-${p.month}-${p.day}`, hora: `${hh}:${p.minute}`, min, dow: DOW_EN[p.weekday] || dowDe(`${p.year}-${p.month}-${p.day}`) };
};

export const horaAMin = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Aritmética sobre fechas PURAS "YYYY-MM-DD" — en UTC a propósito (medianoche
// UTC no cruza de día al sumar/restar, hora local de Honduras sí).
const aUTC = (ymd) => { const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const deUTC = (dt) => dt.toISOString().slice(0, 10);
export const ymdSumar = (ymd, n) => { const dt = aUTC(ymd); dt.setUTCDate(dt.getUTCDate() + Number(n || 0)); return deUTC(dt); };
/** Día ISO (1 lunes … 7 domingo) de una fecha pura. */
export const dowDe = (ymd) => { const g = aUTC(ymd).getUTCDay(); return g === 0 ? 7 : g; };
export const lunesDe = (ymd) => ymdSumar(ymd, 1 - dowDe(ymd));

/** Semana ISO 8601 de una fecha pura. */
export const semanaISO = (ymd) => {
  const dt = aUTC(ymd);
  const dow = dowDe(ymd);
  dt.setUTCDate(dt.getUTCDate() + 4 - dow);        // al jueves de esa semana
  const anio = dt.getUTCFullYear();
  const ene1 = new Date(Date.UTC(anio, 0, 1));
  const semana = Math.ceil(((dt - ene1) / 86400000 + 1) / 7);
  return { anio, semana };
};
/** Lunes de una semana ISO (el 4 de enero siempre cae en la semana 1). */
export const lunesDeSemanaISO = (anio, semana) => ymdSumar(lunesDe(`${anio}-01-04`), (Number(semana) - 1) * 7);

export const fmtDiaCorto = (ymd) => {
  if (!ymd) return "";
  const dt = aUTC(ymd);
  const s = dt.toLocaleDateString("es-HN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  return s.replace(/\.(\s|$)/g, "$1").replace(",", "");
};
export const fmtDiaLargo = (ymd) => {
  if (!ymd) return "";
  const dt = aUTC(ymd);
  const s = dt.toLocaleDateString("es-HN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ── Corte semanal ──────────────────────────────────────────────────────────
/** La etiqueta con la que se nombra un corte: "Corte 40 · 2026 — lun 28 sep – vie 2 oct". */
export const etiquetaCorte = (corte) => {
  if (!corte || !corte.anio || !corte.semana) return { id: "", titulo: "Sin corte", sub: "", lunes: "", viernes: "", domingo: "" };
  const lunes = lunesDeSemanaISO(corte.anio, corte.semana);
  const viernes = ymdSumar(lunes, 4);
  const domingo = ymdSumar(lunes, 6);
  return {
    id: `C${String(corte.semana).padStart(2, "0")}-${corte.anio}`,
    titulo: `Corte ${corte.semana} · ${corte.anio}`,
    sub: `${fmtDiaCorto(lunes)} – ${fmtDiaCorto(viernes)}`,
    lunes, viernes, domingo,
  };
};
export const mismoCorte = (a, b) => !!a && !!b && a.anio === b.anio && a.semana === b.semana;
export const corteSiguiente = (corte) => semanaISO(ymdSumar(lunesDeSemanaISO(corte.anio, corte.semana), 7));
export const corteAnterior = (corte) => semanaISO(ymdSumar(lunesDeSemanaISO(corte.anio, corte.semana), -7));

/**
 * El corte al que entra una solicitud según CUÁNDO se envía (hora Honduras).
 * Antes del cierre (martes 12:00 por defecto) → la semana en curso; después
 * → la semana siguiente. Una URGENTE se salta el corte: queda en el actual.
 */
export const corteDe = (envioISO, cfg, { urgente = false } = {}) => {
  const c = configEfectiva(cfg);
  const p = partesHN(envioISO || new Date());
  if (!p) return null;
  const actual = semanaISO(p.ymd);
  if (urgente) return actual;
  const cierre = c.cortes.cierreSolicitudes;
  const antes = p.dow < cierre.dia || (p.dow === cierre.dia && p.min < horaAMin(cierre.hora));
  return antes ? actual : semanaISO(ymdSumar(p.ymd, 7));
};

/** El corte "de hoy" para las bandejas: en qué semana estamos trabajando. */
export const corteActual = (ahora = new Date()) => semanaISO(partesHN(ahora).ymd);

/** Un hito del corte ("cierreSolicitudes" | "almacenHasta" | "aprobacionHasta") como {ymd, hora, min}. */
export const hitoDeCorte = (corte, nombre, cfg) => {
  const c = configEfectiva(cfg);
  const h = c.cortes[nombre];
  if (!corte || !h) return null;
  const lunes = lunesDeSemanaISO(corte.anio, corte.semana);
  return { ymd: ymdSumar(lunes, (Number(h.dia) || 1) - 1), hora: h.hora, min: horaAMin(h.hora), nombre };
};

/** ¿Ya pasó el hito? y cuánto falta (en minutos, negativo si ya pasó). */
export const estadoHito = (hito, ahora = new Date()) => {
  if (!hito) return { pasado: false, faltaMin: null };
  const p = partesHN(ahora);
  const diasDif = Math.round((aUTC(hito.ymd) - aUTC(p.ymd)) / 86400000);
  const faltaMin = diasDif * 1440 + (hito.min - p.min);
  // En el minuto exacto del hito ya se considera PASADO (igual que el cierre
  // del martes: a las 12:00 en punto la solicitud ya entra al corte siguiente).
  return { pasado: faltaMin <= 0, faltaMin };
};

/** "en 2 d 3 h" · "en 45 min" · "hace 1 h" — para las cuentas regresivas. */
export const fmtFalta = (faltaMin) => {
  if (faltaMin == null) return "";
  const abs = Math.abs(faltaMin);
  const d = Math.floor(abs / 1440), h = Math.floor((abs % 1440) / 60), m = abs % 60;
  const txt = d > 0 ? `${d} d ${h} h` : h > 0 ? `${h} h ${m} min` : `${m} min`;
  return faltaMin < 0 ? `hace ${txt}` : `en ${txt}`;
};

/** Entre qué días llega el material de un corte (martes a jueves de la semana siguiente). */
export const llegadaEstimada = (corte, cfg) => {
  const c = configEfectiva(cfg);
  if (!corte) return null;
  const lunesSig = ymdSumar(lunesDeSemanaISO(corte.anio, corte.semana), 7);
  return { desde: ymdSumar(lunesSig, (Number(c.cortes.llegadaDesde) || 2) - 1), hasta: ymdSumar(lunesSig, (Number(c.cortes.llegadaHasta) || 4) - 1) };
};

/** ¿Se envió ANTES del cierre de su corte? (cumplimiento; una urgente enviada el miércoles cuenta como fuera). */
export const enviadaEnCorte = (sol, cfg) => {
  if (!sol?.fechaEnvio || !sol?.corte) return null;
  const h = hitoDeCorte(sol.corte, "cierreSolicitudes", cfg);
  return !estadoHito(h, sol.fechaEnvio).pasado;
};

// ── Estados ────────────────────────────────────────────────────────────────
export const ESTADOS_SOLICITUD = {
  borrador:    { label: "Borrador",     tono: "gris" },
  enviada:     { label: "Enviada",      tono: "azul" },
  en_proceso:  { label: "En proceso",   tono: "naranja" },
  completada:  { label: "Completada",   tono: "verde" },
  cancelada:   { label: "Cancelada",    tono: "gris" },
};

// Una línea nace en `pendiente_coord` (si trae alerta) o en `revision_almacen`.
export const ESTADOS_LINEA = {
  pendiente_coord:    { label: "Pendiente del Coordinador", corto: "Por aprobar",  tono: "naranja", paso: 1 },
  revision_almacen:   { label: "Revisión de almacén",       corto: "Almacén",      tono: "azul",    paso: 2 },
  despachada_almacen: { label: "Despachada desde almacén",  corto: "De almacén",   tono: "verde",   paso: 6 },
  por_cotizar:        { label: "Por cotizar",               corto: "Compras",      tono: "azul",    paso: 3 },
  cotizada:           { label: "Cotizada — en revisión",    corto: "Cotizada",     tono: "naranja", paso: 4 },
  comprada:           { label: "Aprobada — en compra",      corto: "En compra",    tono: "verde",   paso: 5 },
  rechazada:          { label: "Rechazada",                 corto: "Rechazada",    tono: "rojo",    paso: 0 },
};
export const LINEA_TERMINAL = ["despachada_almacen", "comprada", "rechazada"];

export const ESTADOS_COTIZACION = {
  borrador:  { label: "Borrador",            tono: "gris" },
  enviada:   { label: "Por aprobar",         tono: "naranja" },
  devuelta:  { label: "Devuelta a Compras",  tono: "amarillo" },
  aprobada:  { label: "Aprobada",            tono: "verde" },
  rechazada: { label: "Rechazada",           tono: "rojo" },
};

export const ALERTAS = {
  fuera_presupuesto: "Fuera de presupuesto",
  excede_saldo: "Excede el saldo",
  urgente: "Urgente",
  sin_cantidad: "Partida sin cantidad",
};

/** Qué alertas trae una línea (las que la mandan al Coordinador). */
export const alertasDeLinea = (l, sol) => {
  const a = [];
  if (l?.fueraPresupuesto) a.push("fuera_presupuesto");
  if (l?.excedeSaldo) a.push("excede_saldo");
  if (sol?.urgente) a.push("urgente");
  return a;
};
export const lineaConAlerta = (l, sol) => alertasDeLinea(l, sol).length > 0;

/** Estado con el que nace una línea al ENVIAR la solicitud. */
export const estadoInicialLinea = (l, sol) => (lineaConAlerta(l, sol) ? "pendiente_coord" : "revision_almacen");

/** Cantidad que todavía hay que comprar de una línea (lo que no despachó almacén ni se aprobó ya en cotización). */
export const pendienteDeCompra = (l) => {
  if (!l) return 0;
  const aComprar = l.aCotizar != null ? num(l.aCotizar) : Math.max(0, num(l.cantidad) - num(l.despachadoAlmacen));
  return round2(Math.max(0, aComprar - num(l.cantidadComprada)));
};

/**
 * Estado EFECTIVO de una línea: igual al guardado, salvo la regla del martes
 * 15:00 — una línea en revisión de almacén cuyo corte ya pasó esa hora se
 * TRATA como "por cotizar · sin revisión de almacén" (no hay servidor que la
 * mueva; el estado se escribe cuando Compras actúa).
 */
export const estadoEfectivoLinea = (l, sol, cfg, ahora = new Date()) => {
  if (!l) return { estado: "", sinRevisionAlmacen: false };
  if (l.estado === "revision_almacen" && sol?.corte) {
    const h = hitoDeCorte(sol.corte, "almacenHasta", cfg);
    if (estadoHito(h, ahora).pasado) return { estado: "por_cotizar", sinRevisionAlmacen: true };
  }
  return { estado: l.estado, sinRevisionAlmacen: !!l.sinRevisionAlmacen };
};

/** Estado de la cabecera a partir de sus líneas. Borrador y cancelada mandan. */
export const estadoCabecera = (sol) => {
  if (!sol) return "borrador";
  if (sol.estado === "borrador" || sol.estado === "cancelada") return sol.estado;
  const ls = sol.lineas || [];
  if (!ls.length) return "enviada";
  if (ls.every(l => LINEA_TERMINAL.includes(l.estado))) return "completada";
  const iniciales = ["pendiente_coord", "revision_almacen"];
  if (ls.some(l => !iniciales.includes(l.estado))) return "en_proceso";
  return "enviada";
};

/** La solicitud se puede cancelar solo por el residente y antes de que almacén toque algo. */
export const puedeCancelar = (sol) => {
  if (!sol) return false;
  if (sol.estado === "borrador") return true;
  if (sol.estado !== "enviada") return false;
  return (sol.lineas || []).every(l => ["pendiente_coord", "revision_almacen", "rechazada"].includes(l.estado));
};

// Transiciones de línea. Devuelve { ok, linea, error }. Acá NO se escribe
// bitácora: el módulo agrega la entrada de audit con quién y cuándo.
const DESDE = {
  aprobar_coord:   ["pendiente_coord"],
  rechazar:        ["pendiente_coord", "revision_almacen", "por_cotizar", "cotizada"],
  almacen_hay:     ["revision_almacen"],
  almacen_parcial: ["revision_almacen"],
  almacen_no_hay:  ["revision_almacen"],
  cotizar:         ["por_cotizar"],
  quitar_cotizacion: ["cotizada"],
  aprobar_cot:     ["cotizada"],
  devolver_cot:    ["cotizada"],
};
export const aplicarAccionLinea = (l, accion, payload = {}) => {
  const desde = DESDE[accion];
  if (!desde) return { ok: false, error: `Acción desconocida: ${accion}` };
  if (!desde.includes(l?.estado)) return { ok: false, error: `No se puede "${accion}" desde "${l?.estado}"` };
  const cant = num(l.cantidad);
  switch (accion) {
    case "aprobar_coord":
      return { ok: true, linea: { ...l, estado: "revision_almacen", aprobadaCoord: true } };
    case "rechazar": {
      const motivo = String(payload.motivo || "").trim();
      if (motivo.length < 3) return { ok: false, error: "El motivo del rechazo es obligatorio." };
      return { ok: true, linea: { ...l, estado: "rechazada", motivoRechazo: motivo } };
    }
    case "almacen_hay":
      return { ok: true, linea: { ...l, estado: "despachada_almacen", despachadoAlmacen: cant, aCotizar: 0 } };
    case "almacen_parcial": {
      const d = num(payload.despachado);
      if (!(d > 0) || d >= cant) return { ok: false, error: `Lo despachado debe ser mayor que 0 y menor que ${cant}.` };
      return { ok: true, linea: { ...l, estado: "por_cotizar", despachadoAlmacen: round2(d), aCotizar: round2(cant - d) } };
    }
    case "almacen_no_hay":
      return { ok: true, linea: { ...l, estado: "por_cotizar", despachadoAlmacen: 0, aCotizar: cant, sinRevisionAlmacen: !!payload.sinRevision } };
    case "cotizar":
      return { ok: true, linea: { ...l, estado: "cotizada", quoteIds: [...new Set([...(l.quoteIds || []), payload.quoteId].filter(Boolean))] } };
    case "quitar_cotizacion": {
      const quoteIds = (l.quoteIds || []).filter(q => q !== payload.quoteId);
      return { ok: true, linea: { ...l, estado: quoteIds.length ? "cotizada" : "por_cotizar", quoteIds } };
    }
    case "aprobar_cot": {
      const q = num(payload.cantidad);
      const pend = pendienteDeCompra(l);
      if (!(q > 0) || q > pend + 0.0001) return { ok: false, error: `La cantidad aprobada (${q}) supera lo pendiente (${pend}).` };
      const comprada = round2(num(l.cantidadComprada) + q);
      const quoteIds = (l.quoteIds || []).filter(x => x !== payload.quoteId);
      const quedaPendiente = round2(pend - q) > 0.0001;
      return { ok: true, linea: { ...l, cantidadComprada: comprada, quoteIds, estado: quedaPendiente ? (quoteIds.length ? "cotizada" : "por_cotizar") : "comprada" } };
    }
    case "devolver_cot": {
      const quoteIds = (l.quoteIds || []).filter(x => x !== payload.quoteId);
      return { ok: true, linea: { ...l, quoteIds, estado: quoteIds.length ? "cotizada" : "por_cotizar" } };
    }
    default:
      return { ok: false, error: "Acción no implementada" };
  }
};

// ── Saldo en cantidad de una partida de la receta ──────────────────────────
// saldo = presupuestada − comprada (ítems de cp-purchases que consumen) −
//         en solicitudes activas (lo que aún no llegó a ser compra).
export const compraConsumeReceta = (p) => !!p && (p.status === "validado" || p.status === "pagado" || p.status === "finalizado" || (p.status === "borrador" && !!p.origenSupply));
export const solicitudActiva = (s) => !!s && s.estado !== "borrador" && s.estado !== "cancelada";

export const saldoDePartida = ({ partida, purchases = [], solicitudes = [], excluirSolicitudId = null }) => {
  if (!partida) return null;
  const presupuestada = num(partida.cantidad);
  let comprada = 0;
  (purchases || []).forEach(p => {
    if (!compraConsumeReceta(p)) return;
    (p.lineas || []).forEach(l => { if (l && l.partidaId === partida.id) comprada += num(l.cantidad); });
  });
  let enSolicitudes = 0;
  (solicitudes || []).forEach(s => {
    if (!solicitudActiva(s) || s.id === excluirSolicitudId) return;
    (s.lineas || []).forEach(l => {
      if (!l || l.partidaId !== partida.id || l.estado === "rechazada") return;
      // Lo ya aprobado en cotización vive en cp-purchases (arriba): se resta.
      enSolicitudes += Math.max(0, num(l.cantidad) - num(l.cantidadComprada));
    });
  });
  return {
    presupuestada, comprada: round2(comprada), enSolicitudes: round2(enSolicitudes),
    saldo: round2(presupuestada - comprada - enSolicitudes),
    sinCantidad: presupuestada <= 0,
  };
};

/** Partidas de la receta que un residente puede pedir: compras + libre (no MO, no movilización). */
export const partidasPedibles = (pres) => (pres?.partidas || []).filter(p => p && (p.modulo === "compras" || p.modulo === "libre" || !p.modulo) && (p.nombre || "").trim());

// ── Semáforo de precio ─────────────────────────────────────────────────────
export const puPresupuestoUSD = (partida) => {
  if (!partida) return 0;
  const pu = num(partida.pu);
  if (pu > 0) return pu;
  const c = num(partida.cantidad), m = num(partida.monto);
  return c > 0 && m > 0 ? round2(m / c) : 0;
};
export const semaforoVariacion = (pct, cfg) => {
  const c = configEfectiva(cfg);
  if (pct == null || !isFinite(pct)) return "sin_base";
  if (pct <= c.semaforo.verde) return "verde";
  if (pct <= c.semaforo.amarillo) return "amarillo";
  return "rojo";
};
const PESO_SEM = { sin_base: 0, verde: 1, amarillo: 2, rojo: 3 };
export const peorSemaforo = (lista) => lista.reduce((peor, s) => (PESO_SEM[s] > PESO_SEM[peor] ? s : peor), "verde");

export const MSG_ISV = "Si la cotización trae el ISV solo al final, multiplicá cada precio unitario por 1.15.";

/**
 * Evalúa una cotización completa: por línea (subtotal, P.U. en USD, variación
 * contra el P.U. del presupuesto, semáforo) y en conjunto (suma vs total,
 * errores que impiden enviarla a aprobación).
 *   partidaDe(partidaId) → partida de la receta
 *   lineaSolicitudDe(requestLineId) → la línea de la solicitud que cubre
 */
export const evaluarCotizacion = ({ cotizacion, tasa, cfg, partidaDe = () => null, lineaSolicitudDe = () => null }) => {
  const c = configEfectiva(cfg);
  const t = num(tasa) || 27;
  const errores = [];
  const ls = (cotizacion?.lineas || []).map(l => {
    const sol = lineaSolicitudDe(l.requestLineId);
    const partida = sol ? partidaDe(sol.partidaId) : null;
    const cantidad = num(l.cantidad), pu = num(l.puLps);
    const subtotal = round2(cantidad * pu);
    const puUSD = hnlToUsd(pu, t);
    const puPres = puPresupuestoUSD(partida);
    const variacionPct = puPres > 0 ? (puUSD - puPres) / puPres : null;
    const semaforo = sol?.fueraPresupuesto ? "sin_base" : semaforoVariacion(variacionPct, c);
    const pend = sol ? pendienteDeCompra(sol) : null;
    return { ...l, cantidad, puLps: pu, subtotal, puUSD: round2(puUSD * 100) / 100, puPresupuestoUSD: puPres, variacionPct, semaforo, pendiente: pend, descripcion: l.descripcion || sol?.descripcion || "", unidad: l.unidad || sol?.unidad || "" };
  });
  if (!String(cotizacion?.provider || "").trim()) errores.push("Elegí el proveedor.");
  if (!ls.length) errores.push("La cotización no tiene ítems.");
  if (!cotizacion?.pdfFile) errores.push("Adjuntá el PDF de la cotización.");
  const total = num(cotizacion?.totalDeclarado);
  if (!(total > 0)) errores.push("Ingresá el total de la cotización (con ISV).");
  ls.forEach((l, i) => {
    const n = l.descripcion || `ítem ${i + 1}`;
    if (!(l.cantidad > 0)) errores.push(`${n}: la cantidad debe ser mayor que 0.`);
    if (!(l.puLps > 0)) errores.push(`${n}: falta el precio unitario.`);
    if (l.pendiente != null) {
      if (l.cantidad > l.pendiente + 0.0001) errores.push(`${n}: cotizás ${l.cantidad} pero solo hay ${l.pendiente} por comprar.`);
      else if (l.cantidad < l.pendiente - 0.0001 && !l.parcial) errores.push(`${n}: cotizás menos de lo pendiente (${l.pendiente}). Marcala como parcial.`);
    }
    if (l.semaforo === "rojo" && String(l.justificacion || "").trim().length < 5) errores.push(`${n}: está en rojo — justificá la variación de precio.`);
  });
  const suma = round2(ls.reduce((s, l) => s + l.subtotal, 0));
  const diferencia = round2(suma - total);
  const cuadra = total > 0 && Math.abs(diferencia) <= num(c.toleranciaTotalL);
  if (total > 0 && ls.length && !cuadra) errores.push(`La suma de los ítems (L ${suma.toLocaleString("es-HN", { minimumFractionDigits: 2 })}) no cuadra con el total (L ${total.toLocaleString("es-HN", { minimumFractionDigits: 2 })}). ${MSG_ISV}`);
  const peor = peorSemaforo(ls.map(l => l.semaforo));
  return { lineas: ls, suma, total, diferencia, cuadra, errores, ok: errores.length === 0, peor, todasVerdes: ls.length > 0 && ls.every(l => l.semaforo === "verde" || l.semaforo === "sin_base") };
};

// ── Folios ─────────────────────────────────────────────────────────────────
export const siguienteFolio = (lista, prefijo, anio = new Date().getFullYear()) => {
  const re = new RegExp(`^${prefijo}-(\\d{4})-(\\d+)$`);
  let max = 0;
  (lista || []).forEach(x => {
    const m = re.exec(String(x?.folio || ""));
    if (m && Number(m[1]) === Number(anio)) max = Math.max(max, Number(m[2]));
  });
  return `${prefijo}-${anio}-${String(max + 1).padStart(4, "0")}`;
};

// ── Mapeo al borrador de GeoShopping ───────────────────────────────────────
/**
 * "Va a" sugerido para Finanzas: crédito → Cuentas por pagar; urgente o fecha
 * requerida en obra el lunes/martes próximo (o antes) → Prioridades; si no, Normal.
 */
export const destinoSugerido = ({ condicionPago, fechaRequeridaObra, urgente, hoy }) => {
  if (condicionPago === "credito") return "cxp";
  if (urgente) return "prioridad";
  if (fechaRequeridaObra && hoy) {
    const lunesProx = ymdSumar(lunesDe(hoy), 7);
    const martesProx = ymdSumar(lunesProx, 1);
    if (fechaRequeridaObra <= martesProx) return "prioridad";
  }
  return "normal";
};

/** La descripción que lee Tesorería: un renglón por ítem, tal cual la cotización. */
export const descripcionDeCotizacion = (lineasEval) => (lineasEval || [])
  .map(l => `${num(l.cantidad).toLocaleString("es-HN")}${l.unidad ? " " + l.unidad : ""} × ${l.descripcion}`.trim())
  .join("\n");

/**
 * Arma el registro de cp-purchases a partir de una cotización APROBADA.
 * Usa el MISMO shape del form "Nueva solicitud de compra" de GeoShopping
 * (status "borrador" + marca `origenSupply`): todo lo que hoy excluye
 * borradores lo sigue excluyendo, y GeoCost lo cuenta como comprometido por
 * la marca. Devuelve { purchase, avisos }.
 */
export const borradorDesdeCotizacion = ({ cotizacion, evaluacion, solicitud, proveedor, proyecto, aprobadoPor, tasa, cfg, hoy, ahoraISO, id, codigo }) => {
  const c = configEfectiva(cfg);
  const avisos = [];
  const cuenta = (proveedor?.bankAccounts || [])[0] || null;
  if (!cuenta || !cuenta.number) avisos.push("Proveedor sin datos bancarios en el maestro");
  const condicionPago = cotizacion.condicionPago || proveedor?.condicionPagoDefault || "contado";
  const fechaPagoRequerida = solicitud?.fechaRequeridaObra ? ymdSumar(solicitud.fechaRequeridaObra, -2) : "";
  const destinoPago = destinoSugerido({ condicionPago, fechaRequeridaObra: solicitud?.fechaRequeridaObra, urgente: !!solicitud?.urgente, hoy });
  const lineasEval = (evaluacion?.lineas || []);
  const lineas = lineasEval.map(l => ({
    id: l.requestLineId || l.id,
    partidaId: l.partidaId || null,
    categoria: l.categoria || "",
    nombre: l.nombrePartida || l.descripcion || "",
    unidad: l.unidadPartida || l.unidad || "",
    cantidad: num(l.cantidad),
    monto: l.subtotal,
    ...(l.solucion ? { solucion: l.solucion } : {}),
    ...(l.fueraPresupuesto ? { fueraPresupuesto: true } : {}),
  }));
  // La partida "principal" (la de más plata) para lo que aún lee una sola.
  const principal = lineas.filter(l => l.partidaId).sort((a, b) => b.monto - a.monto)[0] || null;
  const purchase = {
    id,
    codigo,
    company: proyecto?.company || "geotecnica",
    projectCode: solicitud?.projectCode || cotizacion.projectCode,
    provider: cotizacion.provider || proveedor?.name || "",
    providerRTN: proveedor?.rtn || "",
    quoteNumber: cotizacion.numeroProveedor || "",
    quoteFile: cotizacion.pdfFile || null,
    amount: num(cotizacion.totalDeclarado),
    description: descripcionDeCotizacion(lineasEval),
    detalleExtra: "",
    tipoCompra: cotizacion.tipoCompra || "material",
    condicionPago,
    tipoCredito: condicionPago === "credito" ? (cotizacion.tipoCredito || "unico") : "",
    fechaPagoRequerida,
    destinoPago,
    opsResponsible: aprobadoPor || "",
    cierreResponsable: c.cierrePorProyecto[solicitud?.projectCode] || "",
    partidaId: principal?.partidaId || "",
    sobregiroJustificacion: "",
    lineas,
    opsNotes: `Desde GeoSupply · ${solicitud?.folio || ""} · ${cotizacion.folio || ""}`.trim(),
    bacAccount: cuenta?.number || "",
    providerBank: cuenta?.bank || "",
    providerAccountType: cuenta?.type || "",
    providerAccountHolder: cuenta?.holder || "",
    receiptFile: null,
    status: "borrador",
    treasuryStatus: null,
    createdAt: ahoraISO,
    audit: [{ action: "created", by: aprobadoPor || "GeoSupply", at: ahoraISO, note: `Creado desde GeoSupply (${solicitud?.folio || "?"} · ${cotizacion.folio || "?"}) al aprobar la cotización` }],
    origenSupply: {
      requestId: solicitud?.id || cotizacion.requestId,
      quoteId: cotizacion.id,
      folioSolicitud: solicitud?.folio || "",
      folioCotizacion: cotizacion.folio || "",
      residente: solicitud?.residente || "",
      urgente: !!solicitud?.urgente,
      corte: solicitud?.corte || null,
      aprobadoPor: aprobadoPor || "",
      aprobadoAt: ahoraISO,
      tasaCambioUsada: num(tasa) || 27,
      avisos,
    },
  };
  return { purchase, avisos };
};

/** Siguiente código de GeoShopping (MAT-AAAA-NNNN) sobre la lista de cp-purchases — espejo de `siguienteCodigo`. */
export const siguienteCodigoCompra = (lista, anio = new Date().getFullYear(), prefijo = "MAT") => {
  const re = new RegExp(`^${prefijo}-${anio}-(\\d+)$`);
  let max = 0;
  (lista || []).forEach(p => { const m = re.exec(String(p?.codigo || "")); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return `${prefijo}-${anio}-${String(max + 1).padStart(4, "0")}`;
};

/** ¿La solicitud quedó FUERA del corte? = su viernes 12:00 pasó y aún tiene líneas sin resolver. */
export const fueraDeCorte = (sol, cfg, ahora = new Date()) => {
  if (!sol?.corte || !solicitudActiva(sol)) return false;
  const h = hitoDeCorte(sol.corte, "aprobacionHasta", cfg);
  if (!estadoHito(h, ahora).pasado) return false;
  return (sol.lineas || []).some(l => !LINEA_TERMINAL.includes(l.estado));
};

/** Días (con decimales) entre dos timestamps ISO; null si falta alguno. */
export const diasEntre = (a, b) => {
  if (!a || !b) return null;
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  if (isNaN(ta) || isNaN(tb)) return null;
  return Math.max(0, (tb - ta) / 86400000);
};
const prom = (xs) => { const v = xs.filter(x => x != null && isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

/**
 * Métricas del dashboard. `purchases` (cp-purchases) y `despachos`
 * (lg-despachos) son opcionales: con ellos se mide hasta Tesorería/pago/entrega.
 * Filtros: { projectCode, corteId, desde, hasta } (desde/hasta sobre fechaEnvio, YMD HN).
 */
export const metricasDashboard = ({ solicitudes = [], cotizaciones = [], purchases = [], despachos = [], cfg, ahora = new Date(), filtros = {} }) => {
  const c = configEfectiva(cfg);
  const enRango = (s) => {
    if (filtros.projectCode && s.projectCode !== filtros.projectCode) return false;
    if (filtros.corteId && (!s.corte || etiquetaCorte(s.corte).id !== filtros.corteId)) return false;
    const d = s.fechaEnvio ? partesHN(s.fechaEnvio)?.ymd : "";
    if (filtros.desde && (!d || d < filtros.desde)) return false;
    if (filtros.hasta && (!d || d > filtros.hasta)) return false;
    return true;
  };
  const sols = solicitudes.filter(s => s.estado !== "borrador" && enRango(s));
  const idsSol = new Set(sols.map(s => s.id));
  const cots = cotizaciones.filter(q => idsSol.has(q.requestId));
  const porEstado = {};
  sols.forEach(s => { const e = estadoCabecera(s); porEstado[e] = (porEstado[e] || 0) + 1; });
  const agrupar = (key) => {
    const m = {};
    sols.forEach(s => {
      const k = key(s) || "—";
      m[k] = m[k] || { total: 0, urgentes: 0, enCorte: 0, conCorte: 0, lineas: 0, rechazadas: 0 };
      m[k].total++; if (s.urgente) m[k].urgentes++;
      const ec = enviadaEnCorte(s, c); if (ec != null) { m[k].conCorte++; if (ec) m[k].enCorte++; }
      (s.lineas || []).forEach(l => { m[k].lineas++; if (l.estado === "rechazada") m[k].rechazadas++; });
    });
    return Object.entries(m).map(([k, v]) => ({ k, ...v, pctUrgentes: v.total ? v.urgentes / v.total : 0, pctEnCorte: v.conCorte ? v.enCorte / v.conCorte : null })).sort((a, b) => b.total - a.total);
  };
  const porProyecto = agrupar(s => s.projectCode);
  const porResidente = agrupar(s => s.residente);
  // Tiempos por etapa (días). Hitos: envío → decisión de almacén (audit de la
  // línea) → cotización enviada → aprobación → envío a Tesorería (validatedAt)
  // → pago (paidAt) → entrega (despacho entregado).
  const audAt = (aud, pred) => { const a = (aud || []).find(pred); return a?.at || null; };
  const tAlmacen = [], tCotizacion = [], tAprobacion = [], tTesoreria = [], tPago = [], tEntrega = [], leadAprob = [];
  sols.forEach(s => {
    const env = s.fechaEnvio;
    const alm = audAt(s.audit, a => /^almacen_/.test(a?.action || ""));
    if (env && alm) tAlmacen.push(diasEntre(env, alm));
    cots.filter(q => q.requestId === s.id).forEach(q => {
      const qEnv = audAt(q.audit, a => a?.action === "enviada") || q.enviadaAt;
      const base = alm || env;
      if (base && qEnv) tCotizacion.push(diasEntre(base, qEnv));
      if (qEnv && q.aprobadoAt) tAprobacion.push(diasEntre(qEnv, q.aprobadoAt));
      if (env && q.aprobadoAt) leadAprob.push(diasEntre(env, q.aprobadoAt));
      const pu = purchases.find(p => p.id === q.purchaseId || p.origenSupply?.quoteId === q.id);
      if (pu) {
        if (q.aprobadoAt && pu.validatedAt) tTesoreria.push(diasEntre(q.aprobadoAt, pu.validatedAt));
        const pagoAt = audAt(pu.audit, a => a?.action === "paid") || pu.paidAt;
        if (pu.validatedAt && pagoAt) tPago.push(diasEntre(pu.validatedAt, pagoAt));
        const d = despachos.filter(x => x.sourcePurchaseId === pu.id && x.estado !== "cancelado" && (x.estado === "entregado" || x.estado === "cerrado"))[0];
        const entregaAt = d?.entregadoAt || d?.fechaEntrega || d?.updatedAt || null;
        if (pagoAt && entregaAt) tEntrega.push(diasEntre(pagoAt, entregaAt));
      }
    });
  });
  // Semáforo de precio: de las evaluaciones guardadas al aprobar.
  const semaforo = { verde: 0, amarillo: 0, rojo: 0, sin_base: 0 };
  const variacionPorProyecto = {};
  cots.filter(q => q.estado === "aprobada").forEach(q => {
    (q.evaluacion?.lineas || []).forEach(l => {
      semaforo[l.semaforo] = (semaforo[l.semaforo] || 0) + 1;
      if (l.variacionPct != null && isFinite(l.variacionPct)) { (variacionPorProyecto[q.projectCode] = variacionPorProyecto[q.projectCode] || []).push(l.variacionPct); }
    });
  });
  const totalSem = semaforo.verde + semaforo.amarillo + semaforo.rojo;
  const urgentes = sols.filter(s => s.urgente).length;
  const conCorte = sols.filter(s => enviadaEnCorte(s, c) != null);
  const enCorte = conCorte.filter(s => enviadaEnCorte(s, c)).length;
  return {
    total: sols.length, urgentes, pctUrgentes: sols.length ? urgentes / sols.length : 0,
    enCorte, conCorte: conCorte.length, pctEnCorte: conCorte.length ? enCorte / conCorte.length : null,
    porEstado, porProyecto, porResidente,
    tiempos: { almacen: prom(tAlmacen), cotizacion: prom(tCotizacion), aprobacion: prom(tAprobacion), tesoreria: prom(tTesoreria), pago: prom(tPago), entrega: prom(tEntrega), leadAprobacion: prom(leadAprob) },
    semaforo: { ...semaforo, total: totalSem, pctVerde: totalSem ? semaforo.verde / totalSem : null, pctAmarillo: totalSem ? semaforo.amarillo / totalSem : null, pctRojo: totalSem ? semaforo.rojo / totalSem : null },
    variacionPorProyecto: Object.entries(variacionPorProyecto).map(([k, v]) => ({ k, promedio: prom(v), n: v.length })).sort((a, b) => (b.promedio || 0) - (a.promedio || 0)),
    fueraDeCorte: sols.filter(s => fueraDeCorte(s, c, ahora)).flatMap(s => (s.lineas || []).filter(l => !LINEA_TERMINAL.includes(l.estado)).map(l => ({ sol: s, linea: l }))),
    cotizaciones: { total: cots.length, aprobadas: cots.filter(q => q.estado === "aprobada").length, devueltas: cots.filter(q => (q.audit || []).some(a => a?.action === "devuelta")).length, rechazadas: cots.filter(q => q.estado === "rechazada").length },
  };
};

// ── Pendientes por rol (contadores del Panel y del menú) ───────────────────
export const contarPendientes = ({ solicitudes = [], cotizaciones = [], rol, username, proyectos = [], cfg, ahora = new Date() }) => {
  const activas = solicitudes.filter(solicitudActiva);
  const lineas = activas.flatMap(s => (s.lineas || []).map(l => ({ l, s, ef: estadoEfectivoLinea(l, s, cfg, ahora) })));
  const n = {
    alertas: lineas.filter(x => x.ef.estado === "pendiente_coord").length,
    almacen: lineas.filter(x => x.ef.estado === "revision_almacen").length,
    porCotizar: lineas.filter(x => x.ef.estado === "por_cotizar").length,
    cotizacionesPorAprobar: cotizaciones.filter(q => q.estado === "enviada").length,
    devueltas: cotizaciones.filter(q => q.estado === "devuelta").length,
    misAbiertas: solicitudes.filter(s => s.residente === username && s.estado !== "completada" && s.estado !== "cancelada").length,
  };
  switch (rol) {
    case "admin":             return n.alertas + n.cotizacionesPorAprobar;
    case "logistica":         return n.almacen;
    case "asistente_compras": return n.porCotizar + n.devueltas;
    case "residente":         return n.misAbiertas;
    default:                  return 0;
  }
};
