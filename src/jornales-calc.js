// =====================================================================
// JORNALES — personal por día (10-nov-2026, pedido de Gerson)
// =====================================================================
// Lógica PURA (sin React ni store) — probada en tests/jornales-calc.test.mjs.
//
// Cómo se les paga (Gerson): al día, por CORTES de 2 semanas que van de
// SÁBADO a VIERNES. El corte es el viernes EN LA MAÑANA y se paga el LUNES
// siguiente. Ej.: corte del sáb 31-oct al vie 13-nov → se paga el lun 16-nov.
// Los DÍAS del viernes del corte entran en ese corte; las HORAS EXTRA de ese
// viernes (en la tarde, después del corte) pasan al corte SIGUIENTE. Así, las
// HE que paga un corte son las del viernes anterior a su inicio hasta el
// jueves antes de su cierre.
// Hora extra = pago por día ÷ 8 (el salario ÷ 30 ÷ 8), sin recargos.
// =====================================================================

export const KEY_JORNALEROS = "hr-jornaleros";
export const keyCorteJornal = (corteId) => `hr-jornal-${corteId}`;
// Un sábado de inicio de corte conocido (el Excel de Cataleya: 17-oct → 30-oct).
export const ANCLA_CORTE = "2026-10-17";
export const DIAS_CORTE = 14;
export const HORAS_JORNADA = 8;
// Valores de un día: 0 no vino · ½ medio día · 1 día · 2 doble (jornada doble).
export const VALORES_DIA = [0, 0.5, 1, 2];
export const MAX_HE_DIA = 16;

const DIA_MS = 86400000;
const aUTC = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const deUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const sumarDias = (iso, n) => deUTC(aUTC(iso) + n * DIA_MS);
export const diaSemana = (iso) => new Date(aUTC(iso)).getUTCDay(); // 0 dom … 6 sáb
const DIAS_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const diaCorto = (iso) => DIAS_CORTO[diaSemana(iso)];
export const fechaCorta = (iso) => `${+iso.slice(8, 10)} ${MESES[+iso.slice(5, 7) - 1]}`;
export const fechaLarga = (iso) => `${DIAS_LARGO[diaSemana(iso)]} ${+iso.slice(8, 10)} de ${MESES_LARGO[+iso.slice(5, 7) - 1]} de ${iso.slice(0, 4)}`;

/** El corte que contiene la fecha (YYYY-MM-DD). id = fecha del sábado de inicio. */
export const corteDe = (fecha) => {
  const k = Math.floor((aUTC(fecha) - aUTC(ANCLA_CORTE)) / (DIAS_CORTE * DIA_MS));
  const ini = sumarDias(ANCLA_CORTE, k * DIAS_CORTE);
  return { id: ini, ini, fin: sumarDias(ini, DIAS_CORTE - 1), pago: sumarDias(ini, DIAS_CORTE + 2) };
};
export const corteAnterior = (c) => corteDe(sumarDias(c.ini, -1));
export const corteSiguiente = (c) => corteDe(sumarDias(c.fin, 1));
export const diasDelCorte = (c) => Array.from({ length: DIAS_CORTE }, (_, i) => sumarDias(c.ini, i));
/** Fechas cuyas HE paga el corte: del viernes anterior al jueves antes del cierre. */
export const fechasHeDelCorte = (c) => Array.from({ length: DIAS_CORTE }, (_, i) => sumarDias(c.ini, i - 1));
export const nombreCorte = (c) => `${fechaCorta(c.ini)} – ${fechaCorta(c.fin)}`;
export const nombreCorteLargo = (c) => `del ${fechaCorta(c.ini)} al ${fechaCorta(c.fin)} ${c.fin.slice(0, 4)}`;

export const valorHora = (tarifa) => (Number(tarifa) || 0) / HORAS_JORNADA;
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Proyecto vacío dentro de un corte. */
export const proyectoVacio = () => ({ jornaleros: [], dias: {}, he: {}, tarifas: {}, encargado: "", observaciones: "" });
const norm = (p) => ({ ...proyectoVacio(), ...(p || {}), dias: { ...((p || {}).dias || {}) }, he: { ...((p || {}).he || {}) }, tarifas: { ...((p || {}).tarifas || {}) }, jornaleros: [...((p || {}).jornaleros || [])] });

/** Pone (o borra con "" / null) un valor en un mapa {id: {fecha: v}}. */
export const ponerCelda = (mapa, id, fecha, v) => {
  const m = { ...(mapa || {}) };
  const fila = { ...(m[id] || {}) };
  if (v === "" || v == null) delete fila[fecha]; else fila[fecha] = v;
  if (Object.keys(fila).length) m[id] = fila; else delete m[id];
  return m;
};

/**
 * Mezcla a tres vías de UN proyecto: lo que cambié yo (local respecto de base)
 * se aplica sobre lo que hay en la nube; lo que no toqué queda como lo dejó el
 * otro. Celda por celda (días y HE), jornal por jornal (lista y tarifas).
 */
export function mezclarProyecto(base, local, nube) {
  const B = norm(base), L = norm(local), N = norm(nube);
  const out = norm(N);
  // Lista: lo de la nube + lo que yo agregué − lo que yo quité (orden de la nube).
  const agregados = L.jornaleros.filter(id => !B.jornaleros.includes(id));
  const quitados = new Set(B.jornaleros.filter(id => !L.jornaleros.includes(id)));
  out.jornaleros = [...N.jornaleros.filter(id => !quitados.has(id)), ...agregados.filter(id => !N.jornaleros.includes(id))];
  for (const campo of ["dias", "he"]) {
    const ids = new Set([...Object.keys(B[campo]), ...Object.keys(L[campo])]);
    let m = out[campo];
    ids.forEach(id => {
      const fechas = new Set([...Object.keys(B[campo][id] || {}), ...Object.keys(L[campo][id] || {})]);
      fechas.forEach(f => {
        const vb = B[campo][id]?.[f], vl = L[campo][id]?.[f];
        if (vb !== vl) m = ponerCelda(m, id, f, vl);
      });
    });
    out[campo] = m;
  }
  const idsT = new Set([...Object.keys(B.tarifas), ...Object.keys(L.tarifas)]);
  idsT.forEach(id => { if (B.tarifas[id] !== L.tarifas[id]) { if (L.tarifas[id] == null) delete out.tarifas[id]; else out.tarifas[id] = L.tarifas[id]; } });
  for (const k of ["encargado", "observaciones"]) if ((B[k] || "") !== (L[k] || "")) out[k] = L[k] || "";
  // Quien yo saqué del proyecto se va con sus días y horas (si no, quedarían huérfanos).
  quitados.forEach(id => { if (!out.jornaleros.includes(id)) { delete out.dias[id]; delete out.he[id]; delete out.tarifas[id]; } });
  return out;
}

/** ¿Hay diferencias entre dos versiones de un proyecto? */
export const cambiosEntre = (a, b) => JSON.stringify(ordenar(norm(a))) !== JSON.stringify(ordenar(norm(b)));
const ordenar = (p) => {
  const om = (m) => Object.fromEntries(Object.keys(m).sort().map(k => [k, typeof m[k] === "object" && m[k] ? Object.fromEntries(Object.keys(m[k]).sort().map(f => [f, m[k][f]])) : m[k]]));
  return { jornaleros: p.jornaleros, dias: om(p.dias), he: om(p.he), tarifas: om(p.tarifas), encargado: p.encargado || "", observaciones: p.observaciones || "" };
};

/**
 * Liquidación de UN proyecto en UN corte.
 * @param corte      corteDe(...)
 * @param proy       datos del proyecto en este corte
 * @param proyPrevio datos del mismo proyecto en el corte anterior (para las HE del viernes)
 * @param jornaleros fichas (hr-jornaleros)
 */
export function liquidarProyecto({ corte, proy, proyPrevio = null, jornaleros = [] }) {
  const P = norm(proy), A = norm(proyPrevio);
  const viernesPrevio = sumarDias(corte.ini, -1);
  const dias = diasDelCorte(corte);
  const fechasHe = new Set(fechasHeDelCorte(corte));
  const ficha = (id) => jornaleros.find(j => j.id === id) || null;
  const conHePrevia = Object.keys(A.he).filter(id => num(A.he[id]?.[viernesPrevio]) > 0);
  const ids = [...P.jornaleros, ...conHePrevia.filter(id => !P.jornaleros.includes(id))];
  const filas = ids.map(id => {
    const f = ficha(id);
    const tarifa = num(P.tarifas[id] ?? A.tarifas[id] ?? f?.salarioDia);
    const totalDias = dias.reduce((t, d) => t + num(P.dias[id]?.[d]), 0);
    const hePrevia = num(A.he[id]?.[viernesPrevio]);
    const heCorte = Object.entries(P.he[id] || {}).filter(([d]) => fechasHe.has(d)).reduce((t, [, h]) => t + num(h), 0);
    const heSiguiente = num(P.he[id]?.[corte.fin]);
    const horasHe = heCorte + hePrevia;
    const vh = valorHora(tarifa);
    const valorDias = r2(totalDias * tarifa);
    const valorHe = r2(horasHe * vh);
    return {
      id, nombre: f?.fullName || "(ficha borrada)", dni: f?.dni || "", ficha: f, tarifa, valorHora: vh,
      dias: P.dias[id] || {}, he: P.he[id] || {}, hePrevia, heSiguiente,
      totalDias, valorDias, horasHe, valorHe, total: r2(valorDias + valorHe),
      soloHePrevia: !P.jornaleros.includes(id),
    };
  });
  const totales = filas.reduce((t, x) => ({ dias: t.dias + x.totalDias, horasHe: t.horasHe + x.horasHe, valorDias: r2(t.valorDias + x.valorDias), valorHe: r2(t.valorHe + x.valorHe), total: r2(t.total + x.total), heSiguiente: t.heSiguiente + x.heSiguiente }), { dias: 0, horasHe: 0, valorDias: 0, valorHe: 0, total: 0, heSiguiente: 0 });
  return { corte, viernesPrevio, dias, filas, totales, encargado: P.encargado || "", observaciones: P.observaciones || "" };
}

/** Un día del corte con al menos un valor cargado. */
export const diasConAsistencia = (proy) => { const s = new Set(); Object.values(norm(proy).dias).forEach(m => Object.keys(m).forEach(d => s.add(d))); return s; };

/** Validación de la ficha del jornal. */
export function validarJornalero(j, todos = []) {
  if (!String(j.fullName || "").trim()) return "Escribí el nombre completo.";
  const dni = String(j.dni || "").replace(/\D/g, "");
  if (dni.length !== 13) return "La identidad lleva 13 dígitos (0801-1990-12345).";
  if (!(num(j.salarioDia) > 0)) return "Poné cuánto gana al día.";
  const dup = todos.find(x => x.id !== j.id && String(x.dni || "").replace(/\D/g, "") === dni);
  if (dup) return `Ya existe un jornal con esa identidad: ${dup.fullName}.`;
  return null;
}
export const formatoDni = (v) => { const d = String(v || "").replace(/\D/g, "").slice(0, 13); return d.length > 8 ? `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d; };
export const tieneIdentidad = (j) => !!(j?.dniFrente?.fileId);
