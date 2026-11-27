// ═══════════════════════════════════════════════════════════════════════════
// SEGURO SOCIAL (IHSS) — lógica PURA (27-nov-2026, pedido de Gerson)
// ═══════════════════════════════════════════════════════════════════════════
// Cada fin de mes el IHSS manda la planilla pre-elaborada del mes ANTERIOR
// ("Favor detallar los cambios ocurridos en el mes de Octubre") y da hasta el
// 30 para devolverla con:
//   · las BAJAS de ese mes: la persona resaltada en la planilla y, en la
//     columna "Fecha y razón de cambio", "BAJA 26 DE SEPTIEMBRE DE 2026";
//   · las ALTAS del mes en curso (noviembre, si la planilla es de octubre), en
//     el formato Word "Planilla mensual de cotización".
// La verdad sale de GeoTeam: hr-movs (altas y bajas en el momento) y hr-emps5.
// Quien sigue en la planilla y ya salió ANTES del mes (un error de un mes
// atrás) se reporta con el día 1 del mes de la planilla.

export const MESES_IHSS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
export const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
export const normNombre = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
/** 0801199212144 → 0801-1992-12144 */
export const dniConGuiones = (s) => { const d = soloDigitos(s); return d.length === 13 ? `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}` : String(s || "").trim(); };
export const fechaLarga = (ymd) => { const [a, m, d] = String(ymd).slice(0, 10).split("-").map(Number); return `${d} DE ${MESES_IHSS[m - 1]} DE ${a}`; };
export const mesSiguiente = (periodo) => { const [a, m] = periodo.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };
export const finDeMes = (periodo) => { const [a, m] = periodo.split("-").map(Number); return `${periodo}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`; };
export const textoPeriodo = (periodo) => { const [a, m] = String(periodo || "").split("-").map(Number); return m ? `${MESES_IHSS[m - 1]} ${a}` : ""; };

// Qué empresa es por el número patronal o el nombre que trae la planilla.
export const PATRONOS_IHSS = {
  subterra: { patronal: "101-2025-0275-1", razonSocial: "SUBTERRA S.A. de C.V.", nombrePatrono: "SUBTERRA SA", actividad: "CONSTRUCIÓN", direccion: "CALLE LOS ALCALDES, CONTIGUO A RAPIDO CARGO" },
  geotecnica: { patronal: "101-2014-0483-2", razonSocial: "GEO STRUCTURES S.A.", nombrePatrono: "GEOTECNICA SOLUCIONES S.A.", actividad: "COMERCIO AL POR MAYOR", direccion: "BLVD MORAZAN FTE MALL EL DORADO, A LA PAR DE JETSTEREO" },
};
export const empresaDePlanilla = ({ patronal = "", patrono = "" }) => {
  const p = soloDigitos(patronal);
  for (const [k, v] of Object.entries(PATRONOS_IHSS)) if (p && p === soloDigitos(v.patronal)) return k;
  const n = normNombre(patrono);
  return n.includes("SUBTERRA") ? "subterra" : /GEOTECNICA|GEO STRUCTURES|GEOSTRUCTURES/.test(n) ? "geotecnica" : "";
};

// ── Leer la planilla: de los textos con posición del PDF a filas ──
// items: [{str, x, y, w, h, pagina}] (y = base del texto, coordenadas PDF).
const ES_DNI = /^\d{13}$/;
export const parsearPlanillaIHSS = (items) => {
  const todos = (items || []).filter(i => String(i.str || "").trim());
  const texto = todos.map(i => i.str).join(" ");
  const per = texto.match(/\b(0[1-9]|1[0-2])\s*\/\s*(20\d\d)\b/);
  const pat = texto.match(/\b\d{3}-\d{4}-\d{4}-\d\b/);
  const filas = [], columnas = {};
  const paginas = [...new Set(todos.map(i => i.pagina))];
  for (const pg of paginas) {
    const its = todos.filter(i => i.pagina === pg);
    // Columna "FECHA Y RAZÓN DE CAMBIO": entre ese rótulo (o "DÍAS SALARIO" del bloque derecho) y "CÓD."
    const rot = its.find(i => /FECHA Y RAZ[OÓ]N DE CAMBIO/i.test(i.str));
    const cod = its.find(i => /^C[OÓ]D\.?$/i.test(i.str.trim()));
    const nom = its.find(i => /NOMBRE Y APELLIDO/i.test(i.str));
    const dias = its.find(i => /^D[IÍ]AS$/i.test(i.str.trim()) && nom && i.x > nom.x && (!rot || i.x < rot.x - 100));
    if (!rot || !nom) continue;
    const ivm = its.filter(i => /IVM\/SPS/i.test(i.str) && Math.abs(i.y - rot.y) < 4).sort((a, b) => b.x - a.x)[0];
    columnas[pg] = { x0: ivm ? ivm.x + ivm.w + 4 : rot.x - 110, x1: cod ? cod.x - 6 : rot.x + rot.w + 20, xNombre: nom.x, xFinNombre: dias ? dias.x - 4 : nom.x + 190 };
    const dnis = its.filter(i => ES_DNI.test(i.str.trim()) && i.x < nom.x - 20 && i.y < rot.y);
    // La afiliación a veces repite la identidad: por fila cuenta solo la de más a la izquierda.
    dnis.filter(d => !dnis.some(o => o !== d && Math.abs(o.y - d.y) < 2.5 && o.x < d.x)).forEach(d => {
      const enFila = its.filter(i => Math.abs(i.y - d.y) < 2.5);
      const nombre = enFila.filter(i => i.x >= nom.x - 3 && i.x < columnas[pg].xFinNombre && !/^\d/.test(i.str.trim())).sort((a, b) => a.x - b.x).map(i => i.str.trim()).join(" ");
      if (!nombre) return;
      const tn = enFila.filter(i => i.x >= nom.x - 3 && i.x < columnas[pg].xFinNombre);
      filas.push({ identidad: d.str.trim(), nombre, pagina: pg, y: d.y, alto: d.h || 6, xNombre: Math.min(...tn.map(i => i.x)), anchoNombre: Math.max(...tn.map(i => i.x + i.w)) - Math.min(...tn.map(i => i.x)) });
    });
  }
  return { periodo: per ? `${per[2]}-${per[1]}` : "", patronal: pat ? pat[0] : "", patrono: /SUBTERRA/i.test(texto) ? "SUBTERRA" : /GEOTECNICA/i.test(texto) ? "GEOTECNICA" : "", filas: filas.sort((a, b) => a.pagina - b.pagina || b.y - a.y), columnas };
};

// ── Cruce con GeoTeam ──
const mismaPersona = (fila, p) => {
  const d = soloDigitos(p.dni);
  if (d.length === 13 && d === fila.identidad) return true;
  const a = new Set(normNombre(fila.nombre).split(" ")), b = normNombre(p.fullName || p.nombre).split(" ").filter(x => x.length > 1);
  return b.length >= 2 && b.every(x => a.has(x));
};
/**
 * Por cada fila de la planilla: sigue activa, es BAJA (con su texto) o no está
 * en GeoTeam. Baja = no hay ficha activa de esa persona en la empresa y hay un
 * movimiento de baja (o ficha inactiva) con último día hasta el fin del mes.
 * Una baja por paso a permanente no cuenta: la ficha sigue activa.
 */
export const cruzarPlanilla = ({ filas = [], periodo, empresa, emps = [], movs = [] }) => {
  const fin = finDeMes(periodo), ini = `${periodo}-01`;
  const deEmp = (x) => !empresa || !x.company || x.company === empresa;
  return filas.map(f => {
    const fichas = emps.filter(e => deEmp(e) && mismaPersona(f, e));
    const activa = fichas.find(e => e.status !== "inactive");
    const bajasMov = movs.filter(m => m.tipo === "baja" && deEmp(m) && mismaPersona(f, m)).map(m => m.date).filter(Boolean);
    const bajasFicha = fichas.filter(e => e.status === "inactive" && e.endDate).map(e => e.endDate);
    const ultima = [...bajasMov, ...bajasFicha].sort().pop() || "";
    if (activa) {
      // Ficha activa que arrancó DESPUÉS de una baja = reingreso; si no, sigue normal.
      return { ...f, estado: "activa", empId: activa.id, nombreGeoTeam: activa.fullName };
    }
    if (ultima && ultima <= fin) {
      const fecha = ultima < ini ? ini : ultima;
      return { ...f, estado: "baja", ultimoDia: ultima, fechaReporte: fecha, atrasada: ultima < ini, texto: `BAJA ${fechaLarga(fecha)}`, nombreGeoTeam: fichas[0]?.fullName || movs.find(m => mismaPersona(f, m))?.fullName || "" };
    }
    if (ultima) return { ...f, estado: "baja_despues", ultimoDia: ultima, texto: `BAJA ${fechaLarga(ultima)}` };   // salió después del mes: va en la planilla siguiente
    return { ...f, estado: "sin_ficha" };
  });
};

/** Altas del mes en curso (el que sigue al de la planilla), de GeoTeam. Los de honorarios no van al IHSS. */
export const altasDelMes = ({ mes, empresa, emps = [], movs = [] }) => {
  const out = new Map();
  const poner = (k, v) => { if (!out.has(k)) out.set(k, v); };
  movs.filter(m => m.tipo === "alta" && m.company === empresa && String(m.date || "").startsWith(mes) && m.contractType !== "honorarios" && !/permanen/i.test(m.motivo || "")).forEach(m => {
    const e = emps.find(x => x.id === m.employeeId) || {};
    poner(soloDigitos(m.dni || e.dni) || m.employeeId, { empId: m.employeeId, nombre: e.fullName || m.fullName, dni: e.dni || m.dni, puesto: e.position || m.position, salario: Number(e.salary || m.salary) || 0, fecha: m.date });
  });
  emps.filter(e => e.company === empresa && String(e.startDate || "").startsWith(mes) && e.contractType !== "honorarios" && e.contractType !== "honorarios_profesionales").forEach(e =>
    poner(soloDigitos(e.dni) || e.id, { empId: e.id, nombre: e.fullName, dni: e.dni, puesto: e.position, salario: Number(e.salary) || 0, fecha: e.startDate }));
  return [...out.values()].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.nombre).localeCompare(String(b.nombre), "es"));
};
const lps = (n) => `L. ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Las 5 celdas de una fila del Word de altas. */
export const filaAltaIHSS = (a) => [dniConGuiones(a.dni), String(a.nombre || "").trim().toUpperCase(), String(a.puesto || "").trim().toUpperCase(), lps(a.salario), `INGRESO EL ${fechaLarga(a.fecha)}`];
