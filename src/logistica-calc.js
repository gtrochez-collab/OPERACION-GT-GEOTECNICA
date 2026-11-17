// =====================================================================
// GeoLogistics — lógica PURA (17-nov-2026, rediseño completo)
// =====================================================================
// Sin React ni store: se prueba con `npm test` (tests/logistica-calc.test.mjs).
//
// · Rendimiento de combustible por el método de TANQUE LLENO: entre dos
//   cargas con el tanque lleno, km recorridos ÷ galones cargados desde la
//   anterior (las parciales de en medio suman sus galones). Lo que se cargó
//   antes del primer "lleno" no se puede medir y no cuenta.
// · Mantenimiento preventivo: cuánto falta (km y días) para el próximo y
//   qué tan urgente está.
// · Vencimientos de documentos (seguro, revisión, licencia).
// · Urgencia de un despacho según la fecha en que se necesita en obra.
// =====================================================================

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

/** Días entre dos fechas PURAS "YYYY-MM-DD" (b − a). */
export const diasEntre = (a, b) => {
  if (!a || !b) return null;
  const pa = String(a).slice(0, 10).split("-").map(Number);
  const pb = String(b).slice(0, 10).split("-").map(Number);
  if (pa.length < 3 || pb.length < 3 || pa.some(isNaN) || pb.some(isNaN)) return null;
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
};

/** Suma meses a una fecha pura (el día se ajusta al último del mes si no existe). */
export const sumarMeses = (iso, meses) => {
  if (!iso || !meses) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const total = (m - 1) + Number(meses);
  const ny = y + Math.floor(total / 12), nm = ((total % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
};

// ── COMBUSTIBLE ────────────────────────────────────────────────────────
/**
 * cargas: [{id, vehicleId, fecha, km, galones, monto, lleno}] de UN vehículo.
 * Devuelve { tramos: [{desde, hasta, fecha, km, galones, monto, kmPorGal, costoKm}],
 *            km, galones, monto, kmPorGal, costoKm, galPor100, ultimo }
 */
export const rendimientoCombustible = (cargas = []) => {
  const lista = cargas
    .filter(c => c && num(c.galones) > 0 && num(c.km) > 0)
    .slice()
    .sort((a, b) => num(a.km) - num(b.km) || String(a.fecha || "").localeCompare(String(b.fecha || "")));
  const tramos = [];
  let baseKm = null, accGal = 0, accMonto = 0;
  for (const c of lista) {
    const lleno = c.lleno !== false;
    if (baseKm === null) {
      if (lleno) { baseKm = num(c.km); accGal = 0; accMonto = 0; }
      continue;                       // antes del primer lleno no se puede medir
    }
    accGal += num(c.galones);
    accMonto += num(c.monto);
    if (lleno) {
      const km = num(c.km) - baseKm;
      if (km > 0 && accGal > 0) {
        tramos.push({
          desde: baseKm, hasta: num(c.km), fecha: c.fecha || "",
          km, galones: accGal, monto: accMonto,
          kmPorGal: km / accGal, costoKm: accMonto > 0 ? accMonto / km : null,
        });
      }
      baseKm = num(c.km); accGal = 0; accMonto = 0;
    }
  }
  const km = tramos.reduce((s, t) => s + t.km, 0);
  const galones = tramos.reduce((s, t) => s + t.galones, 0);
  const monto = tramos.reduce((s, t) => s + t.monto, 0);
  const conMonto = tramos.filter(t => t.monto > 0);
  const kmConMonto = conMonto.reduce((s, t) => s + t.km, 0);
  return {
    tramos, km, galones, monto,
    kmPorGal: galones > 0 ? km / galones : null,
    galPor100: km > 0 ? galones / km * 100 : null,
    costoKm: kmConMonto > 0 ? conMonto.reduce((s, t) => s + t.monto, 0) / kmConMonto : null,
    ultimo: tramos.length ? tramos[tramos.length - 1] : null,
  };
};

/** Gasto de combustible (L) por mes "YYYY-MM" de una lista de cargas. */
export const gastoCombustiblePorMes = (cargas = []) => {
  const m = {};
  cargas.forEach(c => { const k = String(c.fecha || "").slice(0, 7); if (k.length === 7) m[k] = (m[k] || 0) + num(c.monto); });
  return m;
};

// ── MANTENIMIENTO PREVENTIVO ───────────────────────────────────────────
export const INTERVALO_KM_DEFAULT = 5000;

/** El intervalo de servicio del vehículo (km). */
export const intervaloKmDe = (v) => num(v?.mantIntervaloKm) || INTERVALO_KM_DEFAULT;

/**
 * Estado del preventivo de un vehículo.
 * urgencia: "vencido" (se pasó del km o de la fecha) · "pronto" (≤ 15 % del
 * intervalo o ≤ 15 días) · "ok" · "sin_plan" (no tiene próximo cargado).
 * pct = cuánto del intervalo ya se consumió (0..1+), para la barrita.
 */
export const estadoPreventivo = (v, hoy) => {
  const kmActual = num(v?.kmActual);
  const prox = num(v?.proxMantenimientoKm);
  const fecha = v?.proxMantenimientoFecha || "";
  const intervalo = intervaloKmDe(v);
  const kmFalta = prox > 0 && kmActual > 0 ? prox - kmActual : null;
  const diasFalta = fecha ? diasEntre(hoy, fecha) : null;
  if (kmFalta === null && diasFalta === null) return { urgencia: "sin_plan", kmFalta: null, diasFalta: null, pct: null, intervalo };
  let urgencia = "ok";
  if ((kmFalta !== null && kmFalta < 0) || (diasFalta !== null && diasFalta < 0)) urgencia = "vencido";
  else if ((kmFalta !== null && kmFalta <= intervalo * 0.15) || (diasFalta !== null && diasFalta <= 15)) urgencia = "pronto";
  const pct = kmFalta !== null ? Math.max(0, 1 - kmFalta / intervalo) : (diasFalta !== null ? Math.max(0, 1 - diasFalta / 180) : null);
  return { urgencia, kmFalta, diasFalta, pct, intervalo };
};
export const ORDEN_URGENCIA = { vencido: 0, pronto: 1, ok: 2, sin_plan: 3 };

/** Próximo km sugerido después de un servicio preventivo. */
export const proximoKmSugerido = (v, kmAlRealizar) => {
  const base = num(kmAlRealizar) || num(v?.kmActual);
  return base > 0 ? base + intervaloKmDe(v) : null;
};

// ── DOCUMENTOS ─────────────────────────────────────────────────────────
/** {dias, nivel: vencido|pronto|ok} de una fecha de vencimiento; null si no hay. */
export const vencimiento = (fecha, hoy, aviso = 30) => {
  if (!fecha) return null;
  const dias = diasEntre(hoy, fecha);
  if (dias === null) return null;
  return { dias, nivel: dias < 0 ? "vencido" : dias <= aviso ? "pronto" : "ok" };
};

// ── PENDIENTES DE REPARACIÓN (texto, una por línea) ───────────────────
export const parsePendientes = (text) => {
  if (!text || typeof text !== "string") return [];
  return text.split("\n")
    .map((line, idx) => ({ raw: line, idx, trimmed: line.trim() }))
    .filter(x => x.trimmed.length > 0)
    .map((x, visIdx) => ({ ...x, visIdx, clean: x.trimmed.replace(/^[•\-*]+\s*/, "").replace(/^\d+[.)]\s*/, "").trim() }));
};
export const quitarLinea = (text, exactLine) => (text || "").split("\n").filter(l => l !== exactLine).join("\n");

// ── ALERTAS DE UN VEHÍCULO (para el Dashboard y la ficha) ──────────────
export const alertasVehiculo = (v, hoy) => {
  const out = [];
  const p = estadoPreventivo(v, hoy);
  if (p.urgencia === "vencido") out.push({ tipo: "mant", nivel: "vencido", txt: p.kmFalta !== null && p.kmFalta < 0 ? `Servicio atrasado ${Math.abs(Math.round(p.kmFalta)).toLocaleString("es-HN")} km` : `Servicio atrasado ${Math.abs(p.diasFalta)} d` });
  else if (p.urgencia === "pronto") out.push({ tipo: "mant", nivel: "pronto", txt: p.kmFalta !== null && p.kmFalta <= p.intervalo * 0.15 ? `Servicio en ${Math.round(p.kmFalta).toLocaleString("es-HN")} km` : `Servicio en ${p.diasFalta} d` });
  const s = vencimiento(v?.seguroVence, hoy);
  if (s && s.nivel !== "ok") out.push({ tipo: "doc", nivel: s.nivel, txt: s.nivel === "vencido" ? "Seguro vencido" : `Seguro vence en ${s.dias} d` });
  const r = vencimiento(v?.revisionVence, hoy);
  if (r && r.nivel !== "ok") out.push({ tipo: "doc", nivel: r.nivel, txt: r.nivel === "vencido" ? "Revisión vencida" : `Revisión vence en ${r.dias} d` });
  const n = parsePendientes(v?.pendientesReparacion).length;
  if (n) out.push({ tipo: "pend", nivel: "pend", txt: `${n} pendiente${n === 1 ? "" : "s"} de reparación` });
  return out;
};

// ── MOTORISTAS ─────────────────────────────────────────────────────────
export const esMotoristaPorCargo = (e) => /motorista|chofer|conductor/i.test(String(e?.position || ""));

/**
 * Lista de motoristas: los de GeoTeam por cargo (activos) + los agregados a
 * mano en lg-motoristas (alguien que maneja aunque su cargo diga otra cosa).
 * extras: [{empId, agregado, licenciaNumero, licenciaTipo, licenciaVence, quitado}]
 */
export const listaMotoristas = (emps = [], extras = []) => {
  const ex = new Map((extras || []).filter(x => x && x.empId).map(x => [x.empId, x]));
  return (emps || [])
    .filter(e => e && e.status !== "inactive")
    .filter(e => { const x = ex.get(e.id); if (x?.quitado) return false; return esMotoristaPorCargo(e) || x?.agregado; })
    .map(e => ({ emp: e, datos: ex.get(e.id) || null, porCargo: esMotoristaPorCargo(e) }))
    .sort((a, b) => String(a.emp.fullName || "").localeCompare(String(b.emp.fullName || ""), "es"));
};

// ── DESPACHOS ──────────────────────────────────────────────────────────
/** Urgencia por la fecha en que se necesita en obra. */
export const urgenciaDespacho = (d, hoy) => {
  if (!d?.fechaNecesaria) return null;
  const dias = diasEntre(hoy, d.fechaNecesaria);
  if (dias === null) return null;
  return {
    dias,
    nivel: dias < 0 ? "atrasado" : dias === 0 ? "hoy" : dias === 1 ? "manana" : dias <= 3 ? "pronto" : "ok",
    txt: dias < 0 ? `Atrasado ${Math.abs(dias)} d` : dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} d`,
  };
};
export const ESTADOS_ABIERTOS = ["pendiente", "programado", "en_ruta"];
export const vistaDeDespacho = (d) => d.estado === "pendiente" ? "por_hacer"
  : (d.estado === "programado" || d.estado === "en_ruta") ? "en_camino"
    : (d.estado === "entregado" || d.estado === "cerrado") ? "entregados" : "cancelados";

/** Entregas por mes "YYYY-MM" (entregado/cerrado con fechaEjecutada). */
export const entregasPorMes = (despachos = []) => {
  const m = {};
  despachos.forEach(d => {
    if (d.estado !== "entregado" && d.estado !== "cerrado") return;
    const k = String(d.fechaEjecutada || "").slice(0, 7);
    if (k.length === 7) m[k] = (m[k] || 0) + 1;
  });
  return m;
};

/** Los últimos N meses "YYYY-MM" terminando en el mes de `hoy`. */
export const ultimosMeses = (hoy, n = 6) => {
  const [y, m] = String(hoy).slice(0, 7).split("-").map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = (m - 1) - i; const yy = y + Math.floor(t / 12); const mm = ((t % 12) + 12) % 12;
    out.push(`${yy}-${String(mm + 1).padStart(2, "0")}`);
  }
  return out;
};
