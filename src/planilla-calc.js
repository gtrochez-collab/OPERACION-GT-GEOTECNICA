// ═══════════════════════════════════════════════════════════════════════════
// GeoTeam — PLANILLA (16-oct-2026). Lógica PURA, sin React ni store: Node la
// prueba en tests/planilla-calc.test.mjs. Calca el Excel con el que la Lic.
// Carolina armaba la planilla a mano ("Para revisión 1Q 10.26"):
//   · Salario diario   = mensual / 30
//   · Ordinario        = mensual / 2 en quincena completa (NO diario × días:
//                        la 2Q tiene 16 días y la 1Q de febrero 13); si entró
//                        o salió a mitad de quincena, diario × días en rango
//                        con tope mensual / 2.
//   · Bonificación     = mensual / 2 (siempre, como la columna K/2 de Carolina)
//   · Otros ingresos   = feriado trabajado +2 diarios (triple), domingo
//                        trabajado +1 (doble) / DT2 +2, HORAS EXTRAS de la
//                        quincena ANTERIOR (quincena vencida) y los extras
//                        que se agregan a mano con su concepto.
//   · Deducciones      = NSP (diario por día), llegadas tarde denegadas
//                        (proporcional desde la tolerancia), y en la 2Q las
//                        de ley: IHSS (cuota fija), RAP (Geotecnica,
//                        permanentes; (mensual − techo) × 1.5 %) e ISR (el
//                        contador manda el monto; se recuerda en la ficha).
//                        Cooperativa se descuenta TODAS las quincenas (así va
//                        en la hoja de Carolina). Más los extras a mano.
//   · Honorarios       = 12.5 % de ISR sobre lo que cobran (quincenales);
//                        los mensuales cobran el mes completo en UNA quincena.
// Las fechas son puras (YYYY-MM-DD) — sin new Date(iso) para no correr un día.
// ═══════════════════════════════════════════════════════════════════════════

export const IHSS_CUOTA = 595.16;          // cuota fija del empleado (2026)
export const RAP_TECHO = 11903.13;         // techo exento; arriba de eso 1.5 %
export const RAP_PCT = 0.015;
export const ISR_HONORARIOS = 0.125;
// Incapacidad (30-oct-2026, Gerson): los primeros 3 días de cada incapacidad
// los paga la empresa completos; desde el 4º el IHSS paga el subsidio y la
// empresa solo reconoce el 34 % del salario diario. La racha cuenta días
// SEGUIDOS y puede venir de la quincena anterior (`ctx.incPrevias`).
export const INC_DIAS_EMPRESA = 3;
export const INC_PCT_EMPRESA = 0.34;
export const PLANILLA_VERSION = 3;
export const METODOS_PAGO = [["transferencia", "Transferencia"], ["cheque", "Cheque"], ["ach", "ACH"]];
export const GRUPOS_CT = [["permanent", "Permanentes"], ["temporary", "Temporales"], ["honorarios", "Honorarios"]];

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

// ── Quincenas ──────────────────────────────────────────────────────────────
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const diasDeQuincena = (periodo, quincena) => {
  const [y, m] = String(periodo || "").split("-").map(Number);
  if (!y || !m) return null;
  const ultimo = new Date(y, m, 0).getDate();
  const start = quincena === "1Q" ? 1 : 16;
  const end = quincena === "1Q" ? 15 : ultimo;
  const dias = [];
  for (let d = start; d <= end; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    dias.push({ day: d, fecha: `${periodo}-${String(d).padStart(2, "0")}`, isSun: dow === 0, isSat: dow === 6 });
  }
  return { y, m, start, end, total: end - start + 1, dias, inicio: `${periodo}-${String(start).padStart(2, "0")}`, fin: `${periodo}-${String(end).padStart(2, "0")}` };
};
export const quincenaAnterior = (periodo, quincena) => {
  if (quincena === "2Q") return { periodo, quincena: "1Q" };
  const [y, m] = String(periodo).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return { periodo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, quincena: "2Q" };
};
export const quincenaSiguiente = (periodo, quincena) => {
  if (quincena === "1Q") return { periodo, quincena: "2Q" };
  const [y, m] = String(periodo).split("-").map(Number);
  const d = new Date(y, m, 1);
  return { periodo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, quincena: "1Q" };
};
export const mesLargo = (periodo) => { const [y, m] = String(periodo || "").split("-").map(Number); return m ? `${MESES[m - 1]} ${y}` : String(periodo || ""); };
export const nombreQuincena = (periodo, quincena) => `${quincena === "1Q" ? "Primera" : "Segunda"} quincena · ${mesLargo(periodo).replace(/^\w/, c => c.toUpperCase())}`;
export const rangoQuincena = (periodo, quincena) => { const q = diasDeQuincena(periodo, quincena); return q ? `${q.start} al ${q.end} de ${MESES[q.m - 1]} de ${q.y}` : ""; };
export const etiquetaCorta = (periodo, quincena) => { const [y, m] = String(periodo || "").split("-").map(Number); return m ? `${quincena} ${MESES[m - 1].slice(0, 3)} ${y}` : `${quincena} ${periodo}`; };

// ── Deducciones de ley ─────────────────────────────────────────────────────
export const calcRAP = (salarioMensual) => Math.max(0, r2((num(salarioMensual) - RAP_TECHO) * RAP_PCT));
export const grupoDe = (company, contractType) => {
  if (contractType === "honorarios") return "D";
  if (company === "subterra") return contractType === "permanent" ? "A" : "B";
  return contractType === "permanent" ? "C" : "B";
};
/** Qué le toca por ley a este colaborador en esta quincena (2Q solamente). */
export const deduccionesLey = (emp, quincena) => {
  const out = { ihss: 0, rap: 0, isr: 0, aplicaLey: quincena === "2Q" };
  if (!out.aplicaLey) return out;
  const ct = emp.contractType;
  if (ct === "permanent" || ct === "temporary") {
    if (!emp.sinIhss) out.ihss = IHSS_CUOTA;
    if (emp.company === "geotecnica" && ct === "permanent" && !emp.sinRap) out.rap = calcRAP(emp.salary);
    out.isr = r2(emp.isrMensual);
  }
  return out;
};

// ── Incapacidad: qué días de la quincena caen dentro de una ────────────────
// Un INC siempre. Un domingo o feriado en "1" (el descanso que la hoja pone
// sola) también, si queda EN MEDIO de la incapacidad: el día anterior está en
// ella y el siguiente día hábil vuelve a ser INC (la incapacidad corre por
// días calendario). Si la quincena termina antes, no se presume.
const diasEnIncapacidad = (emp, q, grid, esFeriado, arrastra = false) => {
  const val = q.dias.map(({ day }) => grid[`${emp.id}-${day}`] || "");
  const descanso = q.dias.map(({ day, isSun }, i) => (isSun || esFeriado(day)) && (val[i] === "1" || val[i] === ""));
  const out = val.map(v => v === "INC");
  for (let i = 0; i < out.length; i++) {
    if (out[i] || !descanso[i]) continue;
    let j = i + 1;
    while (j < out.length && descanso[j]) j++;
    out[i] = j < out.length && val[j] === "INC" && (i === 0 ? arrastra : out[i - 1]);
  }
  return out;
};

/**
 * Cuántos días seguidos de incapacidad trae el colaborador al CIERRE de una
 * quincena (se pasa como `incPrevias` a la siguiente). ctx: { grid, esFeriado }.
 */
export const rachaIncapAlCierre = (emp, periodo, quincena, ctx = {}) => {
  const q = diasDeQuincena(periodo, quincena);
  if (!q || !ctx.grid) return 0;
  const en = diasEnIncapacidad(emp, q, ctx.grid, ctx.esFeriado || (() => false));
  // El último día de la quincena en descanso no se presume (no hay "siguiente"
  // en esta hoja): cuenta si el anterior es incapacidad.
  const val = q.dias.map(({ day }) => ctx.grid[`${emp.id}-${day}`] || "");
  let n = 0;
  for (let i = en.length - 1; i >= 0; i--) {
    const { day, isSun } = q.dias[i];
    const desc = (isSun || (ctx.esFeriado || (() => false))(day)) && (val[i] === "1" || val[i] === "");
    if (en[i] || (desc && n === 0 && i > 0 && en[i - 1])) n++;
    else break;
  }
  return n;
};

// ── Asistencia → números de la quincena ────────────────────────────────────
/**
 * Recorre la hoja de asistencia del colaborador en la quincena.
 * ctx: { grid, arrivalTimes, projOverrides, baseProj, esFeriado(day),
 *        fueraPorBaja(emp, fecha), horaLimite(emp) → horas decimales }
 */
export const asistenciaDe = (emp, periodo, quincena, ctx = {}) => {
  const q = diasDeQuincena(periodo, quincena);
  const grid = ctx.grid || {}, at = ctx.arrivalTimes || {}, ovr = ctx.projOverrides || {};
  const esFeriado = ctx.esFeriado || (() => false);
  const fueraPorBaja = ctx.fueraPorBaja || ((e, f) => e.status === "inactive" && !!e.endDate && f > e.endDate);
  const horaLimite = ctx.horaLimite || (() => 7.25);
  const out = { totalDays: q ? q.total : 0, diasEfectivos: 0, diasFueraRango: 0, presentes: 0, presentesEfectivo: 0, nsp: 0, inc: 0, incIhss: 0, vac: 0, dt: 0, dt2: 0, tf: 0, tardes: 0, horasTarde: 0, descuentoHorasFraccion: 0, projDays: {}, conDatos: false };
  if (!q) return out;
  const enIncap = diasEnIncapacidad(emp, q, grid, esFeriado, num(ctx.incPrevias) > 0);
  let racha = num(ctx.incPrevias);
  q.dias.forEach(({ day, fecha, isSun }, i) => {
    if (emp.startDate && fecha < emp.startDate) { out.diasFueraRango++; racha = 0; return; }
    if (fueraPorBaja(emp, fecha)) { out.diasFueraRango++; racha = 0; return; }
    out.diasEfectivos++;
    const k = `${emp.id}-${day}`;
    const v = grid[k] || "";
    if (v) out.conDatos = true;
    const feriado = esFeriado(day);
    if (enIncap[i]) { racha++; if (racha > INC_DIAS_EMPRESA) out.incIhss++; } else racha = 0;
    if (v === "1" || v === "TF" || v === "DT" || v === "DT2" || v === "INC" || v === "V") {
      out.presentes++;
      if (v === "TF") out.tf++;
      if (v === "DT") out.dt++;
      if (v === "DT2") out.dt2++;
      if (v === "INC") out.inc++;
      if (v === "V") out.vac++;
      const proj = ovr[k] || ctx.baseProj || "";
      if (proj) out.projDays[proj] = (out.projDays[proj] || 0) + 1;
      let frac = 1;
      if (v !== "INC" && v !== "V" && at[k]) {
        const [h, mm] = String(at[k]).split(":").map(Number);
        const horasTarde = Math.min(8, Math.max(0, h + (mm || 0) / 60 - horaLimite(emp)));
        if (horasTarde > 0) { out.tardes++; out.horasTarde += horasTarde; }
        frac = Math.max(0, (8 - horasTarde) / 8);
        out.descuentoHorasFraccion += horasTarde / 8;
      }
      out.presentesEfectivo += frac;
    } else if (v === "0") {
      if (!isSun && !feriado) out.nsp++;
    }
  });
  out.presentesEfectivo = r2(out.presentesEfectivo);
  out.horasTarde = r2(out.horasTarde);
  return out;
};

// ── Horas extras de la quincena ANTERIOR (pago quincena vencida) ───────────
export const HE_BANDAS = [
  { k: "b1", label: "4 a 7 pm", mult: 1.25 },
  { k: "b2", label: "7 a 10 pm", mult: 1.5 },
  { k: "b3", label: "10 pm a 12", mult: 1.75 },
];
const heNum = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
/** heSheet = registro de hr-he {periodo, quincena, hours:{"<empId>-<day>":{b1,b2,b3}}}; horaBase = salario/30/8 (con el ajuste de HE si lo tiene). */
export const horasExtrasDe = (heSheet, empId, horaBase) => {
  if (!heSheet) return null;
  const q = diasDeQuincena(heSheet.periodo, heSheet.quincena);
  if (!q) return null;
  const hb = num(horaBase);
  const bandas = { b1: { hrs: 0, monto: 0 }, b2: { hrs: 0, monto: 0 }, b3: { hrs: 0, monto: 0 }, dom: { hrs: 0, monto: 0 } };
  let hrs = 0, monto = 0;
  q.dias.forEach(({ day, isSun }) => {
    const c = (heSheet.hours || {})[`${empId}-${day}`];
    if (!c) return;
    HE_BANDAS.forEach(b => {
      const h = heNum(c[b.k]);
      if (h <= 0) return;
      const m = h * (isSun ? 2 : b.mult) * hb;
      const slot = isSun ? bandas.dom : bandas[b.k];
      slot.hrs += h; slot.monto += m;
      hrs += h; monto += m;
    });
  });
  if (hrs <= 0) return null;
  Object.values(bandas).forEach(b => { b.hrs = r2(b.hrs); b.monto = r2(b.monto); });
  return { periodo: heSheet.periodo, quincena: heSheet.quincena, hrs: r2(hrs), monto: r2(monto), horaBase: r2(hb), bandas };
};

/** Grupos de la planilla para tablas y hojas: permanentes, temporales y los
 *  honorarios partidos en QUINCENAL y MENSUAL (así los separa la Lic. Carolina). */
export const gruposPlanilla = (lines) => [
  { k: "permanent", label: "Permanentes", f: (l) => l.ct === "permanent" },
  { k: "temporary", label: "Temporales", f: (l) => l.ct === "temporary" },
  { k: "hon_q", label: "Honorarios · pago quincenal", hon: true, f: (l) => l.ct === "honorarios" && l.honorariosPago !== "mensual" },
  { k: "hon_m", label: "Honorarios · pago mensual", hon: true, f: (l) => l.ct === "honorarios" && l.honorariosPago === "mensual" },
].map(g => ({ ...g, rows: (lines || []).filter(g.f) })).filter(g => g.rows.length);

/** Suma la asistencia de las dos quincenas (honorarios mensuales: el mes completo). */
export const sumarAsistencias = (a, b) => {
  const out = { ...b, projDays: { ...(a.projDays || {}) } };
  ["totalDays", "diasEfectivos", "diasFueraRango", "presentes", "presentesEfectivo", "nsp", "inc", "incIhss", "vac", "dt", "dt2", "tf", "tardes", "horasTarde", "descuentoHorasFraccion"]
    .forEach(k => { out[k] = r2(num(a[k]) + num(b[k])); });
  Object.entries(b.projDays || {}).forEach(([p, d]) => { out.projDays[p] = (out.projDays[p] || 0) + d; });
  out.conDatos = !!(a.conDatos || b.conDatos);
  out.mesCompleto = true;
  return out;
};

// ── Línea de planilla ──────────────────────────────────────────────────────
/** ¿Entra este colaborador en la planilla de la quincena? */
export const esHonorarioMensual = (emp) => emp?.contractType === "honorarios" && emp?.honorariosPago === "mensual";
/** Quincena en que se les paga a los honorarios MENSUALES (30-oct-2026, Gerson:
 *  "se les paga mensual; tiene que recopilar los días de la primera quincena
 *  también") = la 2Q, con el mes completo. */
export const quincenaHonorarioMensual = (emp) => emp?.honorariosQuincena || "2Q";
export const entraEnPlanilla = (emp, periodo, quincena) => {
  let q = diasDeQuincena(periodo, quincena);
  if (!q) return false;
  if (esHonorarioMensual(emp)) {
    if (quincenaHonorarioMensual(emp) !== quincena) return false;
    // El pago mensual mira el MES entero: quien salió el 11 igual cobra sus 11 días.
    const q1 = diasDeQuincena(periodo, "1Q"), q2 = diasDeQuincena(periodo, "2Q");
    q = { ...q, inicio: q1.inicio, fin: q2.fin };
  }
  if (!emp.startDate) return emp.status === "active";
  if (emp.startDate > q.fin) return false;
  if (emp.status === "inactive" && emp.endDate && emp.endDate < q.inicio) return false;
  if (emp.status !== "active" && !emp.endDate) return false;
  return true;
};

/**
 * Arma la línea v3. he = horasExtrasDe(...) | null; bonosExtra = monto
 * MENSUAL de bonificaciones extra activas (módulo Bonificaciones).
 */
export const armarLinea = ({ emp, periodo, quincena, asistencia, he = null, bonosExtra = 0, recordado = {} }) => {
  const a = asistencia;
  const sb = num(emp.salary), bn = num(emp.bonificacion) + num(bonosExtra);
  // El diario se usa SIN redondear en las multiplicaciones (como =J/30 en
  // Excel: 35,000/30 × 6 = 7,000.00, no 7,000.02); `sd` guardado va a 2 dec.
  const sdx = sb / 30, sd = r2(sdx);
  const esHon = emp.contractType === "honorarios";
  const mensual = esHon && emp.honorariosPago === "mensual";
  const completa = a.diasFueraRango === 0;
  // Ordinario: mensual/2 en quincena completa; honorarios mensuales el mes.
  let ordinario = mensual ? sb : sb / 2;
  // Entró o salió a mitad: diario × días en rango, con tope (la quincena o, si
  // cobra mensual, el mes — Gustavo salió el 11-oct: cobra 11 días).
  if (!completa) ordinario = Math.min(mensual ? sb : sb / 2, sdx * a.diasEfectivos);
  ordinario = r2(ordinario);
  const descuentoNSP = r2(a.nsp * sdx);
  const descuentoHoras = r2(a.descuentoHorasFraccion * sdx);
  const descuentoIncap = r2((a.incIhss || 0) * (1 - INC_PCT_EMPRESA) * sdx);
  const bonoDomingo = r2((a.dt + a.dt2 * 2) * sdx);
  const bonoFeriado = r2(a.tf * 2 * sdx);
  const bq = r2(mensual ? bn : bn / 2);
  const ley = deduccionesLey(emp, quincena);
  let isr = ley.isr;
  if (esHon && (emp.honorariosPago || "quincenal") === "quincenal" && !emp.sinIsr) isr = r2((ordinario + bq) * ISR_HONORARIOS);
  return {
    id: `${emp.id}-${periodo}-${quincena}`,
    eid: emp.id, name: emp.fullName, pos: emp.position || "", dni: emp.dni || "", fc: emp.startDate || "",
    ct: emp.contractType, company: emp.company, grupo: grupoDe(emp.company, emp.contractType),
    proj: asistencia.baseProj || "", projDays: a.projDays,
    metodoPago: emp.metodoPago || recordado.metodoPago || "transferencia",
    honorariosPago: esHon ? (emp.honorariosPago || "quincenal") : undefined,
    sb, bn, sd,
    totalDays: a.totalDays, diasEfectivos: a.diasEfectivos, diasFueraRango: a.diasFueraRango,
    diasPresente: a.presentes, diasPresenteEfectivo: a.presentesEfectivo,
    diasNSP: a.nsp, diasIncap: a.inc, diasIncapIhss: a.incIhss || 0, diasVac: a.vac, domTrab: a.dt, domTrabTriple: a.dt2, ferTrab: a.tf,
    tardes: a.tardes, horasTarde: a.horasTarde, sinAsistencia: !a.conDatos,
    ordinario, descuentoNSP, descuentoHoras, descuentoIncap,
    bq, bonoDomingo, bonoFeriado,
    he,
    extras: [],
    aplicaLey: ley.aplicaLey, isr, ihss: ley.ihss, rap: ley.rap,
    coop: r2(emp.cooperativa),
    nota: "",
    payrollVersion: PLANILLA_VERSION,
  };
};

/** Totales de una línea (v3 o vieja v2). */
export const totalesLinea = (l) => {
  const v3 = (l.payrollVersion || 0) >= 3 || l.ordinario != null;
  const extras = Array.isArray(l.extras) ? l.extras : [];
  const extrasIng = r2(extras.filter(x => x.tipo === "ingreso").reduce((s, x) => s + num(x.monto), 0));
  const extrasDed = r2(extras.filter(x => x.tipo === "deduccion").reduce((s, x) => s + num(x.monto), 0));
  const ordinario = v3 ? num(l.ordinario) : num(l.so) + num(l.descuentoNSP) + num(l.descuentoHoras) + num(l.descuentoIncap);
  const heMonto = num(l.he?.monto);
  const o1 = v3 ? extrasIng : num(l.o1) + num(l.o2);
  const otros = v3 ? extrasDed : num(l.otros) + num(l.aus) + num(l.amdc);
  // Las HORAS EXTRAS van en su PROPIA planilla (20-oct-2026, Gerson: "que la
  // planilla de horas extras sea por aparte, no en la misma"): el neto de la
  // planilla de salarios NO las incluye; `heMonto` se reporta aparte.
  const ingresos = r2(num(l.bq) + num(l.bonoDomingo) + num(l.bonoFeriado) + o1);
  const dedLey = r2(num(l.isr) + num(l.ihss) + num(l.rap) + num(l.coop));
  const dedAsist = r2(num(l.descuentoNSP) + num(l.descuentoHoras) + num(l.descuentoIncap));
  const deducciones = r2(dedLey + otros + dedAsist);
  const neto = r2(ordinario + ingresos - deducciones);
  return { ordinario, extrasIng: o1, extrasDed: otros, heMonto, ingresos, dedLey, dedAsist, deducciones, neto, bruto: r2(ordinario + ingresos), salarioSinHe: neto, totalConHe: r2(neto + heMonto) };
};

/** Línea lista para guardar: suma los campos "clásicos" (o1, otros, so, tDed, tOtros, neto) para lo que aún los lee. */
export const lineaParaGuardar = (l) => {
  const t = totalesLinea(l);
  return { ...l, o1: t.extrasIng, o2: 0, otros: t.extrasDed, so: r2(t.ordinario - t.dedAsist), tOtros: t.ingresos, tDed: r2(t.dedLey + t.extrasDed), neto: t.neto, payrollVersion: PLANILLA_VERSION };
};

/** Resumen de toda la planilla. */
export const resumenPlanilla = (lines) => {
  const out = { personas: lines.length, ordinario: 0, ingresos: 0, deducciones: 0, he: 0, heHrs: 0, hePersonas: 0, neto: 0, salarios: 0, nsp: 0, porGrupo: {}, porMetodo: {}, hePorMetodo: {}, porProyecto: {} };
  GRUPOS_CT.forEach(([k, label]) => { out.porGrupo[k] = { label, n: 0, neto: 0 }; });
  METODOS_PAGO.forEach(([k, label]) => { out.porMetodo[k] = { label, n: 0, neto: 0 }; });
  lines.forEach(l => {
    const t = totalesLinea(l);
    out.ordinario += t.ordinario; out.ingresos += t.ingresos; out.deducciones += t.deducciones;
    out.he += t.heMonto; out.heHrs += num(l.he?.hrs); out.neto += t.neto; out.salarios += t.neto; out.nsp += num(l.diasNSP);
    if (t.heMonto > 0) {
      out.hePersonas++;
      const hk = l.metodoPago || "transferencia";
      const hm = out.hePorMetodo[hk] || (out.hePorMetodo[hk] = { n: 0, monto: 0 });
      hm.n++; hm.monto += t.heMonto;
    }
    const g = out.porGrupo[l.ct] || (out.porGrupo[l.ct] = { label: l.ct, n: 0, neto: 0 });
    g.n++; g.neto += t.neto;
    const mk = l.metodoPago || "transferencia";
    const m = out.porMetodo[mk] || (out.porMetodo[mk] = { label: mk, n: 0, neto: 0 });
    m.n++; m.neto += t.neto;
    const pd = l.projDays || {};
    const dias = Object.values(pd).reduce((s, d) => s + d, 0);
    if (dias > 0) Object.entries(pd).forEach(([p, d]) => { out.porProyecto[p] = r2((out.porProyecto[p] || 0) + t.neto * d / dias); });
    else if (l.proj) out.porProyecto[l.proj] = r2((out.porProyecto[l.proj] || 0) + t.neto);
  });
  ["ordinario", "ingresos", "deducciones", "he", "heHrs", "neto", "salarios"].forEach(k => { out[k] = r2(out[k]); });
  out.totalGeneral = r2(out.neto + out.he);
  Object.values(out.hePorMetodo).forEach(g => { g.monto = r2(g.monto); });
  Object.values(out.porGrupo).forEach(g => { g.neto = r2(g.neto); });
  Object.values(out.porMetodo).forEach(g => { g.neto = r2(g.neto); });
  return out;
};

/** Concepto automático de la nota (lo que Carolina escribía en "NOTAS"). */
export const notaAutomatica = (l) => {
  const p = [];
  if (l.ferTrab) p.push(`Feriado trabajado ×${l.ferTrab}`);
  if (l.domTrab) p.push(`Domingo trabajado ×${l.domTrab}`);
  if (l.domTrabTriple) p.push(`Domingo triple ×${l.domTrabTriple}`);
  if (l.diasNSP) p.push(`NSP ×${l.diasNSP}`);
  if (l.diasIncapIhss) p.push(`Incapacidad ×${l.diasIncap} (${l.diasIncapIhss} al 34 %, IHSS)`);
  if (l.tardes) p.push(`Llegadas tarde ×${l.tardes}`);
  (l.extras || []).forEach(x => p.push(`${x.tipo === "ingreso" ? "+" : "−"} ${x.concepto || "Extra"}`));
  return p.join(" · ");
};

/** Días que se muestran en la planilla: los presentes (proporcionales si hubo
 *  llegadas tarde); sin hoja de asistencia, los días en rango (se paga completo). */
export const diasMostrados = (l) => {
  if (l.sinAsistencia) return String(l.diasEfectivos ?? l.totalDays ?? "");
  const ef = l.diasPresenteEfectivo, pr = l.diasPresente ?? 0;
  return ef != null && ef !== pr ? ef.toFixed(2) : String(pr);
};
export const fmtL = (n) => `L ${(num(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Líneas que tienen horas extras (la planilla de horas extras va aparte). */
export const lineasConHe = (lines) => (lines || []).filter(l => num(l.he?.monto) > 0);
