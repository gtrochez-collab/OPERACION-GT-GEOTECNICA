// =====================================================================
// FERIADOS NACIONALES DE HONDURAS
// =====================================================================
// Lista oficial de feriados nacionales reconocidos por el Codigo de
// Trabajo. Usado por el modulo RRHH para:
//   - Marcar celdas en la cuadricula de asistencia
//   - Aplicar pago doble (+2 dias adicionales) cuando alguien trabaja
//     un feriado, segun politica interna de Geotecnica
// =====================================================================

// Feriados FIJOS (mismo dia cada anio)
const FERIADOS_FIJOS = [
  { mes: 1, dia: 1, nombre: "Año Nuevo" },
  { mes: 4, dia: 14, nombre: "Día de las Américas" },
  { mes: 5, dia: 1, nombre: "Día del Trabajo" },
  { mes: 9, dia: 15, nombre: "Día de la Independencia" },
  { mes: 10, dia: 3, nombre: "Día del Soldado (Morazán)" },
  { mes: 10, dia: 12, nombre: "Día de la Raza / Hispanidad" },
  { mes: 10, dia: 21, nombre: "Día de las Fuerzas Armadas" },
  { mes: 12, dia: 25, nombre: "Navidad" },
];

// Calcular Domingo de Pascua (algoritmo de Gauss).
function pascua(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const L = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * L) / 451);
  const month = Math.floor((h + L - 7 * m + 114) / 31);
  const day = ((h + L - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Devuelve un Set de strings "YYYY-MM-DD" con todos los feriados del anio.
export function feriadosDelAnio(year) {
  const set = new Set();
  // Fijos
  FERIADOS_FIJOS.forEach((f) => {
    set.add(toIso(year, f.mes, f.dia));
  });
  // Semana Santa: jueves y viernes (sabado no es feriado oficial pero
  // muchas empresas lo reconocen — por ahora solo jueves/viernes santo).
  const easter = pascua(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  const holyThursday = new Date(easter);
  holyThursday.setDate(easter.getDate() - 3);
  const holySaturday = new Date(easter);
  holySaturday.setDate(easter.getDate() - 1);
  set.add(toIsoDate(holyThursday));
  set.add(toIsoDate(goodFriday));
  set.add(toIsoDate(holySaturday));
  return set;
}

function toIso(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function toIsoDate(d) {
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Verifica si una fecha (year, monthIdx0, day) es feriado.
export function esFeriado(year, monthIdx0, day) {
  const set = feriadosDelAnio(year);
  return set.has(toIso(year, monthIdx0 + 1, day));
}

// Verifica si un dia de una quincena (period "YYYY-MM", dia numerico) es feriado.
export function esFeriadoQuincena(period, day) {
  if (!period) return false;
  const [y, m] = period.split("-").map(Number);
  return esFeriado(y, m - 1, day);
}

// Para tooltip / leyenda.
export function nombreFeriado(year, monthIdx0, day) {
  const fijo = FERIADOS_FIJOS.find((f) => f.mes === monthIdx0 + 1 && f.dia === day);
  if (fijo) return fijo.nombre;
  const easter = pascua(year);
  const target = new Date(year, monthIdx0, day);
  const diff = Math.round((target - easter) / 86400000);
  if (diff === -3) return "Jueves Santo";
  if (diff === -2) return "Viernes Santo";
  if (diff === -1) return "Sábado Santo";
  return "Feriado";
}
