// ═══════════════════════════════════════════════════════════════════════════
// Planilla de EL SALVADOR (13-nov-2026, Gerson: "vamos a empezar a hacer la
// planilla de Subterra Salvador desde GeoTeam"). Lógica PURA (Node-safe),
// probada en tests/planilla-sv.test.mjs contra la planilla de la 2Q de
// octubre-2026 que armó la Lic. Diana Calles (Yaquelin 269.25 · Edy 789.52 ·
// Roberto 529.82 = $1,588.60, al centavo).
//
// Reglas (calcadas de su Excel):
//   · Salario de la quincena = mensual / 2 (como Honduras); diario = mensual/30.
//   · Salario COTIZABLE = salario + vacación + horas extras + otros ingresos.
//   · ISSS laboral 3 % con tope de $15 por quincena (salario máx. $1,000/mes).
//   · AFP laboral 7.25 %.
//   · ISR CADA quincena con la tabla quincenal sobre (cotizable − ISSS − AFP).
//   · Patronal (solo informativo, costo de la empresa): AFP 8.75 % e ISSS
//     7.5 % con tope de $75.
//   · Vacación: el 30 % de recargo sobre los días de vacación (Roberto: 15
//     días × $33.33 × 30 % = $150). Los días en sí ya van en el salario.
//   · Horas extras: se pagan en la MISMA quincena (Gerson, 13-nov). Hora =
//     diario / 8; diurna con 100 % de recargo (×2) y nocturna ×2.5 (Código
//     de Trabajo: 100 % + 25 % de nocturnidad).
// ═══════════════════════════════════════════════════════════════════════════

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// Redondeo como Excel (mitad hacia arriba en decimal): 650 × 8.75 % = 56.875 → 56.88.
export const r2 = (n) => { const x = num(n); return Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-6) / 100; };

export const ISSS_PCT = 0.03;
export const ISSS_TOPE_Q = 15;          // $1,000 × 3 % / 2
export const AFP_PCT = 0.0725;
export const PATRONAL_AFP_PCT = 0.0875;
export const PATRONAL_ISSS_PCT = 0.075;
export const PATRONAL_ISSS_TOPE = 75;
export const PRIMA_VACACION = 0.30;
export const HE_DIURNA_MULT = 2;
export const HE_NOCTURNA_MULT = 2.5;
export const HORAS_JORNADA_SV = 8;

// Tabla de retención de ISR QUINCENAL (vigente; la de la Lic. Diana: el
// tramo I llega a $275, así que $269.25 de Yaquelin no paga).
export const ISR_TABLA_QUINCENAL = [
  { desde: 0,       hasta: 275.00,  pct: 0,    sobre: 0,       fija: 0 },
  { desde: 275.00,  hasta: 447.62,  pct: 0.10, sobre: 275.00,  fija: 8.83 },
  { desde: 447.62,  hasta: 1019.05, pct: 0.20, sobre: 447.62,  fija: 30.00 },
  { desde: 1019.05, hasta: Infinity, pct: 0.30, sobre: 1019.05, fija: 144.28 },
];
/** ISR sin redondear (el Excel arrastra los decimales hasta el líquido). */
export const isrQuincenalExacto = (sujeto) => {
  const b = num(sujeto);
  if (b <= 0) return 0;
  const t = ISR_TABLA_QUINCENAL.find(x => b <= x.hasta) || ISR_TABLA_QUINCENAL[ISR_TABLA_QUINCENAL.length - 1];
  return t.pct ? (b - t.sobre) * t.pct + t.fija : 0;
};
export const isrQuincenal = (sujeto) => r2(isrQuincenalExacto(sujeto));

export const valorHoraSV = (salarioMensual) => num(salarioMensual) / 30 / HORAS_JORNADA_SV;
/** Horas extras de la quincena: {diurnas, nocturnas} → montos. */
export const horasExtrasSV = (salarioMensual, diurnas, nocturnas) => {
  const vh = valorHoraSV(salarioMensual);
  const d = num(diurnas), n = num(nocturnas);
  const montoDiurnas = d * vh * HE_DIURNA_MULT, montoNocturnas = n * vh * HE_NOCTURNA_MULT;
  return { diurnas: d, nocturnas: n, valorHora: r2(vh), montoDiurnas: r2(montoDiurnas), montoNocturnas: r2(montoNocturnas), monto: r2(montoDiurnas + montoNocturnas) };
};
/** Recargo de vacación sugerido: 30 % sobre los días de vacación. */
export const primaVacacion = (salarioMensual, diasVacacion) => r2(num(salarioMensual) / 30 * num(diasVacacion) * PRIMA_VACACION);

/**
 * Deducciones de ley sobre el salario cotizable de la quincena. Se calcula
 * SIN redondear en el camino (como el Excel: 650 − 15 − 47.125 = 587.875 →
 * sujeto 587.88) y se redondea cada cifra al mostrarla.
 */
export const deduccionesSV = (cotizable, { sinIsss = false, sinAfp = false, sinIsr = false } = {}) => {
  const c = Math.max(0, num(cotizable));
  const isssX = sinIsss ? 0 : Math.min(c * ISSS_PCT, ISSS_TOPE_Q);
  const afpX = sinAfp ? 0 : c * AFP_PCT;
  const sujetoX = c - isssX - afpX;
  const isrX = sinIsr ? 0 : isrQuincenalExacto(sujetoX);
  return {
    cotizable: r2(c),
    isss: r2(isssX), afp: r2(afpX),
    sujetoIsr: r2(sujetoX), isr: r2(isrX),
    // total y líquido con la misma precisión que el Excel (sin redondeos intermedios)
    total: r2(isssX + afpX + isrX), totalX: isssX + afpX + isrX,
    liquido: r2(sujetoX - isrX), liquidoX: sujetoX - isrX,
    patronal: { afp: r2(c * PATRONAL_AFP_PCT), isss: r2(Math.min(c * PATRONAL_ISSS_PCT, PATRONAL_ISSS_TOPE)) },
  };
};
