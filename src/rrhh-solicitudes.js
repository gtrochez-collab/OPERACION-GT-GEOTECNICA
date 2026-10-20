// =====================================================================
// HUB DE RRHH — lógica PURA (20-oct-2026, pedido de Gerson)
// =====================================================================
// Todos los usuarios del sistema entran a GeoTeam. Quien no es de RRHH ve
// su PORTAL ("Mi RRHH"): su asistencia según GeoClock y las solicitudes
// (vacaciones, permisos, constancias y reportes de problemas), para sí
// mismo o EN NOMBRE de otra persona (el residente por su cuadrilla, Ana por
// el que le tocó la puerta). RRHH las ve TODAS en "Solicitudes" y las
// aprueba o deniega.
//
// Key `hr-solicitudes` (una lista; la bandeja). Al APROBAR:
//   vacaciones → registro en hr-vacs (+ "V" en la asistencia)
//   permiso    → un registro por día en hr-lvs (+ "1"/"0" en la asistencia)
//   constancia → registro en hr-cons y el texto queda en la solicitud
//                (el que la pidió la baja en PDF desde su portal)
//   reporte    → no aprueba: se responde y se marca "resuelto"
// hr-vacs / hr-lvs / hr-cons siguen siendo la fuente de verdad (la
// asistencia, la ficha y la planilla los leen igual que antes).
//
// Sin React ni store: se prueba con `npm test` (tests/rrhh-solicitudes.test.mjs).
// =====================================================================
import { feriadosDelAnio } from "./holidays.js";

export const KEY_SOLICITUDES = "hr-solicitudes";
export const KEY_VINCULOS = "gt-vinculos";   // { username: empId } — usuario ↔ ficha

export const TIPOS = {
  vacaciones: { label: "Vacaciones", corto: "Vacaciones" },
  permiso:    { label: "Permiso", corto: "Permiso" },
  constancia: { label: "Constancia", corto: "Constancia" },
  reporte:    { label: "Reporte de un problema", corto: "Reporte" },
};
export const TIPOS_PERMISO = ["Personal", "Medico", "Duelo", "Maternidad", "Paternidad", "Sin goce de sueldo", "Otro"];
export const ETIQUETA_PERMISO = { Medico: "Médico", "Sin goce de sueldo": "Sin goce de sueldo" };
// "trabajo" = la constancia de siempre (con salario y deducciones de ley);
// "laboral" = la misma sin el párrafo del salario.
export const TIPOS_CONSTANCIA = { trabajo: "De trabajo (con salario)", laboral: "Laboral (sin salario)" };
export const CATEGORIAS_REPORTE = [
  ["pago", "Pago o planilla"],
  ["asistencia", "Asistencia o marcaje"],
  ["equipo", "Equipo, EPP o herramienta"],
  ["seguridad", "Seguridad en el trabajo"],
  ["convivencia", "Trato o convivencia"],
  ["otro", "Otro"],
];
export const categoriaReporteLabel = (k) => (CATEGORIAS_REPORTE.find(c => c[0] === k) || [])[1] || "Otro";

// Estados de la bandeja. Un reporte no se "aprueba": se revisa y se resuelve.
export const ESTADOS = {
  pendiente:   { label: "Pendiente", tono: "naranja" },
  en_revision: { label: "En revisión", tono: "azul" },
  aprobada:    { label: "Aprobada", tono: "verde" },
  resuelta:    { label: "Resuelto", tono: "verde" },
  denegada:    { label: "Denegada", tono: "rojo" },
  cancelada:   { label: "Cancelada", tono: "gris" },
};
export const ABIERTAS = ["pendiente", "en_revision"];
export const estaAbierta = (s) => ABIERTAS.includes(s?.estado);

// ── Quién hace qué ──
// Deciden: Gerson (admin), la Lic. Carolina (tesorería) y Ana. Nadie decide
// lo que ÉL MISMO cargó (así lo que Ana mete por la gente de campo le llega a
// Gerson). Una constancia de INGRESOS lleva el salario: solo admin/tesorería.
export const ROLES_APROBADORES = ["admin", "tesoreria", "asistente_compras"];
export const ROLES_VEN_TODO = ["admin", "tesoreria", "asistente_compras", "gerencia", "costos"];
export const esAprobador = (rol) => ROLES_APROBADORES.includes(rol);
export const veTodo = (rol) => ROLES_VEN_TODO.includes(rol);

export function puedeDecidir(sol, { rol, username } = {}) {
  if (!sol || !esAprobador(rol)) return { ok: false, motivo: "Solo RRHH decide las solicitudes." };
  if (!estaAbierta(sol)) return { ok: false, motivo: "Ya se decidió." };
  if (sol.solicitadoPor?.username && sol.solicitadoPor.username === username) return { ok: false, motivo: "La cargaste vos: la decide otra persona de RRHH." };
  if (sol.tipo === "constancia" && sol.tipoConstancia === "trabajo" && rol === "asistente_compras") return { ok: false, motivo: "La constancia de trabajo lleva el salario: la emite Gerson o la Lic. Carolina." };
  return { ok: true };
}

// ¿Esta solicitud es "mía"? (la pedí yo o es para mí)
export const esMia = (sol, { username, empId } = {}) =>
  !!sol && ((username && sol.solicitadoPor?.username === username) || (empId && sol.empId === empId));

export const puedeVer = (sol, user = {}) => veTodo(user.rol) || esMia(sol, user);

// El que la pidió la puede cancelar mientras nadie la decida.
export const puedeCancelar = (sol, { username } = {}) =>
  !!sol && sol.estado === "pendiente" && sol.solicitadoPor?.username === username;

// La constancia de ingresos se descarga SOLO por la persona (o RRHH con
// permiso de ver salarios): quien la pidió en nombre de otro no ve el salario.
export function puedeDescargarConstancia(sol, { rol, empId } = {}) {
  if (!sol || sol.tipo !== "constancia" || sol.estado !== "aprobada" || !sol.resultado?.doc) return false;
  if (sol.tipoConstancia === "trabajo") return rol === "admin" || rol === "tesoreria" || (empId && sol.empId === empId);
  return veTodo(rol) || (empId && sol.empId === empId) || true;
}

// ── Usuario ↔ ficha de GeoTeam ──
// 1) el vínculo guardado (gt-vinculos, lo pone RRHH), 2) el empId de la
// sesión (accesos creados desde GeoTeam), 3) el NOMBRE: todas las palabras
// del nombre del usuario (sin "Lic.", "Ing.", "Dr.") están en el nombre
// completo de UNA sola ficha activa. Si coinciden varias, no se adivina.
const TITULOS = new Set(["lic", "ing", "dr", "dra", "arq", "abg", "msc", "sr", "sra"]);
export const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
const palabras = (s) => normalizar(s).split(" ").filter(w => w && !TITULOS.has(w));

export function vincularEmpleado({ username, label, empId } = {}, emps = [], vinculos = {}) {
  const lista = (emps || []).filter(e => e && e.id);
  const porId = (id) => lista.find(e => e.id === id) || null;
  if (username && vinculos?.[username]) { const e = porId(vinculos[username]); if (e) return { emp: e, como: "vinculo" }; }
  if (empId) { const e = porId(empId); if (e) return { emp: e, como: "sesion" }; }
  const ws = palabras(label);
  if (ws.length < 2) return { emp: null, como: "sin_match" };
  // nombre EXACTO (sin títulos ni acentos) gana sobre el "contiene"
  const exacto = lista.filter(e => palabras(e.fullName).join(" ") === ws.join(" "));
  if (exacto.length === 1) return { emp: exacto[0], como: "nombre" };
  const cands = lista.filter(e => { const p = new Set(palabras(e.fullName)); return ws.every(w => p.has(w)); });
  const activos = cands.filter(e => e.status !== "inactive");
  const unico = activos.length === 1 ? activos[0] : (!activos.length && cands.length === 1 ? cands[0] : null);
  if (unico) return { emp: unico, como: "nombre" };
  return { emp: null, como: cands.length > 1 ? "ambiguo" : "sin_match", candidatos: cands.map(e => e.id) };
}

// ── Fechas (strings YYYY-MM-DD; nunca new Date("YYYY-MM-DD"), es UTC) ──
const partes = (d) => String(d || "").split("-").map(Number);
export const fechaValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
export function rangoFechas(desde, hasta) {
  if (!fechaValida(desde)) return [];
  const fin = fechaValida(hasta) ? hasta : desde;
  if (fin < desde) return [];
  const [y, m, d] = partes(desde);
  const out = [];
  const cur = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 400; i++) {
    const iso = cur.toISOString().slice(0, 10);
    if (iso > fin) break;
    out.push(iso);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
export const esDomingo = (iso) => { const [y, m, d] = partes(iso); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0; };
const cacheFeriados = {};
export const esFeriadoISO = (iso) => { const y = partes(iso)[0]; if (!cacheFeriados[y]) cacheFeriados[y] = feriadosDelAnio(y); return cacheFeriados[y].has(iso); };
// Días hábiles: lunes a sábado que no son feriado (el sábado se trabaja).
export const diasHabiles = (desde, hasta) => rangoFechas(desde, hasta).filter(d => !esDomingo(d) && !esFeriadoISO(d));
// Días de calendario (como los cuenta hr-vacs desde siempre).
export const diasCalendario = (desde, hasta) => rangoFechas(desde, hasta).length;

// ── Folio correlativo por año: RH-2026-0001 ──
export function siguienteFolio(lista = [], anio) {
  const pre = `RH-${anio}-`;
  const max = (lista || []).reduce((mx, s) => { const m = String(s?.folio || "").startsWith(pre) ? Number(String(s.folio).slice(pre.length)) : 0; return Number.isFinite(m) && m > mx ? m : mx; }, 0);
  return `${pre}${String(max + 1).padStart(4, "0")}`;
}

// ── Validación de una solicitud antes de guardarla ──
export function validarSolicitud(s, { vacs = [] } = {}) {
  if (!s || !TIPOS[s.tipo]) return "Elegí qué querés solicitar.";
  if (!s.empId) return "¿Para quién es? Elegí a la persona.";
  if (s.tipo === "vacaciones") {
    if (!fechaValida(s.desde) || !fechaValida(s.hasta)) return "Poné desde cuándo y hasta cuándo.";
    if (s.hasta < s.desde) return "La fecha final es antes de la inicial.";
    if (diasCalendario(s.desde, s.hasta) > 60) return "Son más de 60 días: revisá las fechas.";
    if (!diasHabiles(s.desde, s.hasta).length) return "Esas fechas son solo domingos o feriados.";
    const cruce = (vacs || []).find(v => v.employeeId === s.empId && v.status !== "rejected" && v.startDate <= s.hasta && v.endDate >= s.desde);
    if (cruce) return `Ya tiene vacaciones del ${cruce.startDate} al ${cruce.endDate} que se cruzan con estas fechas.`;
  }
  if (s.tipo === "permiso") {
    if (!fechaValida(s.fecha)) return "¿Qué día es el permiso?";
    if (s.hasta && (!fechaValida(s.hasta) || s.hasta < s.fecha)) return "La fecha final del permiso es antes de la inicial.";
    if (s.hasta && diasCalendario(s.fecha, s.hasta) > 31) return "Un permiso de más de 31 días: revisá las fechas.";
    if (!TIPOS_PERMISO.includes(s.tipoPermiso)) return "Elegí el tipo de permiso.";
    if (String(s.motivo || "").trim().length < 3) return "Contá brevemente el motivo.";
  }
  if (s.tipo === "constancia") {
    if (!TIPOS_CONSTANCIA[s.tipoConstancia]) return "Elegí el tipo de constancia.";
  }
  if (s.tipo === "reporte") {
    if (!CATEGORIAS_REPORTE.some(c => c[0] === s.categoria)) return "Elegí de qué se trata.";
    if (String(s.descripcion || "").trim().length < 10) return "Contá qué pasó (al menos una línea).";
  }
  return null;
}

// Arma el registro nuevo (sin id/folio: los pone quien guarda contra la nube).
export function armarSolicitud(form, { emp, solicitante, ahora }) {
  const base = {
    tipo: form.tipo, empId: emp.id, empNombre: emp.fullName, company: emp.company || "",
    cargo: emp.position || "",
    solicitadoPor: { username: solicitante.username, nombre: solicitante.nombre },
    enNombreDe: !!form.enNombreDe,
    estado: "pendiente", createdAt: ahora, updatedAt: ahora,
    nota: String(form.nota || "").trim(),
    adjuntos: Array.isArray(form.adjuntos) ? form.adjuntos : [],
    historial: [{ accion: "creada", por: solicitante.nombre, at: ahora }],
  };
  if (form.tipo === "vacaciones") return { ...base, desde: form.desde, hasta: form.hasta, dias: diasCalendario(form.desde, form.hasta), diasHabiles: diasHabiles(form.desde, form.hasta).length };
  if (form.tipo === "permiso") { const hasta = form.hasta && form.hasta !== form.fecha ? form.hasta : ""; return { ...base, fecha: form.fecha, hasta, tipoPermiso: form.tipoPermiso, porHoras: String(form.porHoras || "").trim(), motivo: String(form.motivo || "").trim(), dias: hasta ? diasHabiles(form.fecha, hasta).length : 1 }; }
  if (form.tipo === "constancia") return { ...base, tipoConstancia: form.tipoConstancia, dirigidaA: String(form.dirigidaA || "").trim(), motivo: String(form.motivo || "").trim() };
  return { ...base, categoria: form.categoria, descripcion: String(form.descripcion || "").trim(), confidencial: !!form.confidencial };
}

// Resumen de una línea para listas: "Vacaciones · 2 al 6 nov · 5 días"
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const fechaCorta = (iso) => { if (!fechaValida(iso)) return ""; const [, m, d] = partes(iso); return `${d} ${MESES[m - 1]}`; };
export const fechaLarga = (iso) => { if (!fechaValida(iso)) return ""; const [y, m, d] = partes(iso); return `${d} ${MESES[m - 1]} ${y}`; };
export const rangoCorto = (a, b) => (!b || a === b) ? fechaCorta(a) : `${fechaCorta(a)} al ${fechaCorta(b)}`;
export function detalleSolicitud(s) {
  if (!s) return "";
  if (s.tipo === "vacaciones") return `${rangoCorto(s.desde, s.hasta)} · ${s.dias} día${s.dias === 1 ? "" : "s"}${s.diasHabiles != null && s.diasHabiles !== s.dias ? ` (${s.diasHabiles} hábiles)` : ""}`;
  if (s.tipo === "permiso") return `${rangoCorto(s.fecha, s.hasta)} · ${ETIQUETA_PERMISO[s.tipoPermiso] || s.tipoPermiso}${s.porHoras ? ` · ${s.porHoras}` : ""}`;
  if (s.tipo === "constancia") return `${TIPOS_CONSTANCIA[s.tipoConstancia] || ""}${s.dirigidaA ? ` · para ${s.dirigidaA}` : ""}`;
  return categoriaReporteLabel(s.categoria);
}

// ── Constancias: calcadas de la que Gerson firma a mano (20-oct-2026) ──
// Empresa según la ficha; logo y razón social por empresa; fechas y salario
// en letras; tabla de deducciones de ley (IHSS, y RAP en Geotecnica
// permanentes) con el neto; firma "Lic. Gerson Trochez · Coordinador de
// Operaciones · <empresa>". Se devuelve un DOC estructurado (párrafos con
// runs en negrita + tabla) para pintarlo igual en pantalla y en el PDF.
export const EMPRESAS = {
  subterra:   { nombre: "Subterra Honduras", legal: "SUBTERRA, S.A.", logo: "brand/subterra.png" },
  geotecnica: { nombre: "Geotecnica Soluciones", legal: "GEOSTRUCTURES, S.A. DE C.V.", logo: "brand/geotecnica.png" },
};
export const IHSS_CUOTA = 595.16;
export const RAP_TECHO = 11903.13, RAP_PCT = 0.015;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const UNIDADES = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
const menosDeMil = (n, apocope = true) => {
  if (n === 0) return "";
  if (n === 100) return "cien";
  const c = Math.floor(n / 100), r = n % 100;
  let t = "";
  if (r < 30) t = (r === 1 && !apocope) ? "uno" : (r === 21 && !apocope) ? "veintiuno" : UNIDADES[r];
  else { const d = Math.floor(r / 10), u = r % 10; t = DECENAS[d] + (u ? ` y ${u === 1 && !apocope ? "uno" : UNIDADES[u]}` : ""); }
  return [CENTENAS[c], t].filter(Boolean).join(" ");
};
/** 25000 → "veinticinco mil". apocope: "un/veintiún" (antes de sustantivo) vs "uno". */
export function numeroALetras(n, { apocope = true } = {}) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "cero";
  if (n >= 1e9) return String(n);
  const mill = Math.floor(n / 1e6), mil = Math.floor((n % 1e6) / 1000), resto = n % 1000;
  const partes = [];
  if (mill) partes.push(mill === 1 ? "un millón" : `${menosDeMil(mill)} millones`);
  if (mil) partes.push(mil === 1 ? "mil" : `${menosDeMil(mil)} mil`);
  if (resto) partes.push(menosDeMil(resto, apocope));
  return partes.join(" ");
}
/** 25000 → "VEINTICINCO MIL LEMPIRAS EXACTOS (L. 25,000.00)". */
export function lempirasEnLetras(monto) {
  const n = r2(monto), ent = Math.floor(n), cent = Math.round((n - ent) * 100);
  const letras = numeroALetras(ent, { apocope: false }).toUpperCase();
  const cents = cent ? `CON ${String(cent).padStart(2, "0")}/100` : "EXACTOS";
  return `${letras} LEMPIRA${ent === 1 ? "" : "S"} ${cents} (L. ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** "2025-07-02" → "dos (02) de julio de dos mil veinticinco (2025)" */
export const fechaEnLetras = (iso) => { const [y, m, d] = partes(iso); return `${numeroALetras(d)} (${String(d).padStart(2, "0")}) de ${MESES_L[m - 1]} de ${numeroALetras(y)} (${y})`; };
/** "2026-10-07" → "siete (07) días del mes de octubre del año dos mil veintiséis (2026)" */
export const fechaCierreEnLetras = (iso) => { const [y, m, d] = partes(iso); return `${numeroALetras(d)} (${String(d).padStart(2, "0")}) día${d === 1 ? "" : "s"} del mes de ${MESES_L[m - 1]} del año ${numeroALetras(y)} (${y})`; };
const L = (n) => `L. ${r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MODALIDAD = { permanent: "contrato por tiempo indefinido", temporary: "contrato por tiempo determinado (por obra)", honorarios: "contrato por servicios profesionales (honorarios)" };

/** Deducciones de ley mensuales que se muestran en la constancia. */
export function deduccionesConstancia(emp) {
  const filas = [];
  const ct = emp.contractType;
  if ((ct === "permanent" || ct === "temporary") && !emp.sinIhss) filas.push({ k: "ihss", label: "(−) IHSS", monto: IHSS_CUOTA });
  if (emp.company === "geotecnica" && ct === "permanent" && !emp.sinRap) { const rap = r2(Math.max(0, (Number(emp.salary) || 0) - RAP_TECHO) * RAP_PCT); if (rap > 0) filas.push({ k: "rap", label: "(−) RAP", monto: rap }); }
  return filas;
}

// Un párrafo es una lista de runs [texto, negrita?]. tabla = [{label, monto, negrita?}].
export function constanciaDoc(emp, { tipo = "trabajo", hoy }) {
  const emp2 = EMPRESAS[emp.company] || EMPRESAS.geotecnica;
  const nombre = String(emp.fullName || "").toUpperCase();
  const articulo = emp.sexo === "femenino" ? "la señora" : emp.sexo === "masculino" ? "el señor" : "";
  const identificado = emp.sexo === "femenino" ? "identificada" : "identificado";
  const conSalario = tipo === "trabajo";
  const ded = conSalario ? deduccionesConstancia(emp) : [];
  const salario = Number(emp.salary) || 0;
  const neto = r2(salario - ded.reduce((t, d) => t + d.monto, 0));
  const p1 = [["Por la presente se "], ["HACE CONSTAR", true], [` que ${articulo ? articulo + " " : ""}`], [nombre, true], [`, ${identificado} con el número de identidad `], [emp.dni || "—", true], [", labora para la empresa "], [emp2.legal, true], [" desde el "], [fechaEnLetras(emp.startDate || hoy), true], [", permaneciendo activo a la fecha."]];
  const p2 = [["Actualmente ocupa el cargo de "], [emp.position || "—", true], [`, bajo la modalidad de ${MODALIDAD[emp.contractType] || "contrato por tiempo indefinido"}`]];
  if (conSalario) {
    p2.push([", devengando un salario mensual de "], [lempirasEnLetras(salario), true]);
    if (ded.length) p2.push([`. A su salario se le aplica${ded.length === 1 ? " únicamente" : "n"} la${ded.length === 1 ? "" : "s"} deducci${ded.length === 1 ? "ón" : "ones"} de ley correspondiente${ded.length === 1 ? "" : "s"} al ${ded.map(d => d.k === "ihss" ? "Instituto Hondureño de Seguridad Social (IHSS)" : "Régimen de Aportaciones Privadas (RAP)").join(" y al ")}, conforme al siguiente detalle:`]);
    else p2.push(["."]);
  } else p2.push(["."]);
  const tabla = conSalario && ded.length ? [{ label: "Salario mensual", monto: L(salario) }, ...ded.map(d => ({ label: d.label, monto: L(d.monto) })), { label: "Salario neto mensual", monto: L(neto), negrita: true }] : null;
  const cierre = [["Se extiende la presente constancia en la ciudad de Tegucigalpa, M.D.C., a los "], [fechaCierreEnLetras(hoy), true], [", para los fines que el interesado estime convenientes."]];
  return { empresa: emp.company || "geotecnica", logo: emp2.logo, titulo: "CONSTANCIA DE TRABAJO", parrafos: [p1, p2], tabla, cierre, firma: ["Lic. Gerson Trochez", "Coordinador de Operaciones", emp2.legal] };
}
const runsATexto = (runs) => runs.map(r => r[0]).join("");
/** Texto plano del doc (para hr-cons y búsquedas). */
export function textoConstancia(emp, opts) {
  const d = constanciaDoc(emp, opts);
  return [d.titulo, ...d.parrafos.map(runsATexto), ...(d.tabla ? d.tabla.map(t => `${t.label}: ${t.monto}`) : []), runsATexto(d.cierre), d.firma.join("\n")].join("\n\n");
}

// Registros que nacen al aprobar (los usa HRModule para hr-vacs / hr-lvs).
export const vacacionDeSolicitud = (s, { id, aprobadoPor, at }) => ({
  id, employeeId: s.empId, startDate: s.desde, endDate: s.hasta, days: s.dias, status: "approved",
  notes: [s.nota, `Solicitud ${s.folio || ""} de ${s.solicitadoPor?.nombre || ""}`.trim()].filter(Boolean).join(" · "),
  origenSolicitud: s.id, aprobadoPor, aprobadoAt: at,
});
// Un permiso de varios días = un registro por día hábil (hr-lvs es por día).
export function permisosDeSolicitud(s, { idDe, aprobadoPor, at }) {
  const dias = s.hasta ? diasHabiles(s.fecha, s.hasta) : [s.fecha];
  return dias.map((d, i) => ({
    id: idDe(i), employeeId: s.empId, date: d, type: s.tipoPermiso, status: "approved",
    reason: [s.motivo, s.porHoras ? `(${s.porHoras})` : ""].filter(Boolean).join(" "),
    origenSolicitud: s.id, aprobadoPor, aprobadoAt: at,
  }));
}

// ── Mi asistencia según GeoClock ──
// marks: todos los marcajes de las quincenas leídas. Una fila por día con
// la PRIMERA entrada y la ÚLTIMA salida (misma regla que Registros), horas
// netas con el almuerzo de 1 h si la jornada cruza el mediodía, y el atraso
// calculado desde la tolerancia.
export function minTardeDesde(horaStr, horarioEntradaStr, tolerancia = 15) {
  const [h, m] = String(horaStr || "").split(":").map(Number);
  const [eh, em] = String(horarioEntradaStr || "7:00").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(eh)) return 0;
  return Math.max(0, (h * 60 + (m || 0)) - (eh * 60 + (em || 0) + tolerancia));
}
const aMin = (hora) => { const [h, m] = String(hora || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
export function diasDeMarcas(marks = [], empId, { decisiones = [], hoy } = {}) {
  const mios = (marks || []).filter(mk => mk && mk.empId === empId && fechaValida(mk.fecha));
  const porDia = {};
  mios.forEach(mk => { (porDia[mk.fecha] = porDia[mk.fecha] || []).push(mk); });
  const decisionDe = (id) => (decisiones || []).find(d => d.markId === id) || null;
  return Object.keys(porDia).sort((a, b) => b.localeCompare(a)).map(fecha => {
    const arr = porDia[fecha];
    const minDe = (mk) => Number.isFinite(mk.min) ? mk.min : aMin(mk.hora);
    const ent = arr.filter(m => m.tipo === "entrada").sort((a, b) => minDe(a) - minDe(b))[0] || null;
    const sal = arr.filter(m => m.tipo === "salida").sort((a, b) => minDe(b) - minDe(a))[0] || null;
    const e = ent ? minDe(ent) : null, s = sal ? minDe(sal) : null;
    let horas = null;
    if (e != null && s != null && s > e) horas = Math.max(0, (s - e) / 60 - ((e <= 720 && s >= 780) ? 1 : 0));
    const minTarde = ent && ent.tarde ? minTardeDesde(ent.hora, ent.horarioEntrada) : 0;
    const dec = ent && ent.tarde ? decisionDe(ent.id) : null;
    return {
      fecha, entrada: ent?.hora || "", salida: sal?.hora || "", horas,
      tarde: minTarde > 0, minTarde,
      tardeEstado: minTarde > 0 ? (dec?.estado === "aprobada" ? "aprobada" : dec?.estado === "denegada" ? "denegada" : "pendiente") : "",
      explicacion: ent?.explicacion || "", comentario: sal?.comentario || "",
      manual: !!(ent?.manual || sal?.manual), ubicacion: ent?.ubicacion || sal?.ubicacion || "",
      sinSalida: !!ent && !sal && !!hoy && fecha < hoy,
    };
  });
}
export function resumenAsistencia(dias = []) {
  const conEntrada = dias.filter(d => d.entrada);
  const horas = dias.reduce((t, d) => t + (d.horas || 0), 0);
  return {
    dias: conEntrada.length,
    tardes: dias.filter(d => d.tarde).length,
    tardesPendientes: dias.filter(d => d.tardeEstado === "pendiente").length,
    minTarde: dias.reduce((t, d) => t + (d.minTarde || 0), 0),
    horas: Math.round(horas * 10) / 10,
    sinSalida: dias.filter(d => d.sinSalida).length,
  };
}

// Quincenas a leer: la actual y las n−1 anteriores, de la más nueva a la más vieja.
export function quincenasRecientes(hoy, n = 4) {
  const [y, m, d] = partes(hoy);
  let per = `${y}-${String(m).padStart(2, "0")}`, q = d <= 15 ? "1Q" : "2Q";
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ periodo: per, quincena: q });
    if (q === "2Q") q = "1Q";
    else { const [yy, mm] = per.split("-").map(Number); const dt = new Date(Date.UTC(yy, mm - 2, 1)); per = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`; q = "2Q"; }
  }
  return out;
}
export const nombreQuincenaCorto = ({ periodo, quincena }) => {
  const [y, m] = String(periodo).split("-").map(Number);
  return `${quincena === "1Q" ? "1ª" : "2ª"} quincena de ${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][m - 1]} ${y}`;
};

// Vacaciones ya tomadas por la persona (para la ficha y el portal).
export function vacacionesTomadas(vacs = [], empId, anio) {
  const lista = (vacs || []).filter(v => v && v.employeeId === empId && v.status === "approved")
    .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const delAnio = anio ? lista.filter(v => String(v.startDate || "").startsWith(String(anio))) : lista;
  return { lista, delAnio, diasAnio: delAnio.reduce((t, v) => t + (Number(v.days) || 0), 0) };
}
