// =====================================================================
// GEOCLOCK — lógica PURA (23-oct-2026)
// =====================================================================
// Una tablet puede cubrir VARIAS ubicaciones (la de administración está en
// la pared y ahí marcan oficinas, plantel, taller y almacén). La ubicación
// de cada marcaje se decide por la PERSONA, no por la tablet:
//   1) lo que diga su cuadrilla de la quincena (si la asignación coincide
//      con una de las ubicaciones de la tablet),
//   2) si no, su departamento: los administrativos (Administración,
//      Contabilidad, RRHH) marcan en ADMINISTRACIÓN,
//   3) todos los demás en PLANTEL (o la primera ubicación de la tablet).
// Sin React ni store: se prueba con `npm test`.
// =====================================================================
export const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

export const DEPTOS_ADMIN = ["ADMINISTRACION", "CONTABILIDAD", "RRHH", "RECURSOS HUMANOS"];

/** Ubicaciones que cubre un usuario de tablet (users.js): `ubicaciones` o `ubicacion`. */
export const ubicacionesDeTablet = (user) => {
  const lista = [...(Array.isArray(user?.ubicaciones) ? user.ubicaciones : []), ...(user?.ubicacion ? [user.ubicacion] : [])];
  return [...new Set(lista.filter(Boolean))];
};

/**
 * Ubicación que se estampa en el marcaje.
 * @param tablet  usuario de users.js ({ubicacion, ubicaciones})
 * @param emp     ficha (department)
 * @param asignacion  proyecto (short) de la cuadrilla de esta quincena, o ""
 */
export function ubicacionDeMarcaje(tablet, emp, asignacion = "") {
  const ubs = ubicacionesDeTablet(tablet);
  if (!ubs.length) return "";
  if (ubs.length === 1) return ubs[0];
  const asg = sinAcentos(asignacion);
  const porCuadrilla = asg && ubs.find(u => asg.includes(sinAcentos(u)));
  if (porCuadrilla) return porCuadrilla;
  const admin = ubs.find(u => sinAcentos(u).startsWith("ADMIN"));
  const esAdmin = DEPTOS_ADMIN.includes(sinAcentos(emp?.department));
  if (esAdmin && admin) return admin;
  const plantel = ubs.find(u => sinAcentos(u) === "PLANTEL") || ubs.find(u => u !== admin) || ubs[0];
  return plantel;
}

/** Texto corto para mostrar en la tablet: "Plantel", "Administración". */
export const nombreUbicacion = (u) => { const t = String(u || ""); return t ? t.charAt(0) + t.slice(1).toLowerCase() : ""; };

// ── JORNALES en la tablet (24-nov-2026, Gerson: "que los jornales puedan
// marcar entrada y salida en la tablet; para el plantel por ahora, y a futuro
// todos los proyectos con su tablet") ──
// El jornal no tiene cuadrilla: su sede sale del PROYECTO de su ficha
// (hr-jornaleros). PLAN-TALLER / PLANTEL / PLANTEL-OFICINA marcan en la
// tablet del PLANTEL; un proyecto con tablet propia (ubicacion = su short)
// marca en la suya.
/** Ubicación de la tablet donde marca un jornal de `proyecto`, o "" si esa tablet no lo cubre. */
export function sedeDeJornal(tablet, proyecto) {
  const ubs = ubicacionesDeTablet(tablet);
  let p = sinAcentos(proyecto);
  if (!p || !ubs.length) return "";
  if (p.startsWith("PLAN")) p += " PLANTEL";
  return ubs.find(u => p.includes(sinAcentos(u))) || "";
}
/** Jornales que salen en la lista de la tablet: activos y de un proyecto que ella cubre.
 *  Sin ubicaciones (la compu de RRHH) salen todos los activos. */
export function jornalesDeTablet(tablet, jornaleros = []) {
  const activos = (jornaleros || []).filter(j => j && j.id && j.status !== "inactive" && j.fullName);
  if (!ubicacionesDeTablet(tablet).length) return activos;
  return activos.filter(j => sedeDeJornal(tablet, j.proyecto));
}
