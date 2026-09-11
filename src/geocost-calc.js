// =====================================================================
// GeoCost — LÓGICA PURA de la Central de Costos por Proyecto (9-sep-2026)
// =====================================================================
// Sin React, sin `store`. Solo importa projects.js y holidays.js, así Node
// puede correr los tests (scratchpad/test-geocost-calc.mjs) sin Vite.
// Lo consumen: GeoCostModule.jsx, geocost-forms.jsx, geocost-pdf.js y los
// forms de solicitud de GeoShopping/GeoMachinery (partida + sobregiro).
//
// Reglas de negocio ya aprobadas (spec §0): presupuesto en USD, compras en
// L convertidas con UNA tasa global (cc-config.tasa, default 27);
// Comprometido = solicitud `validado`; Ejecutado = `pagado`|`finalizado`;
// Mano de obra = fórmula EXACTA de calcCostoMO de GeoTeam (port fiel abajo).
// =====================================================================
import { PROJECTS, resolveShort } from "./projects.js";
import { esFeriadoQuincena } from "./holidays.js";

export const TASA_DEFAULT = 27;
export const CATEGORIAS = ["Generales", "Materiales", "Personal", "Equipos", "Servicios subcontratados", "Otros"];
export const MODULOS_PARTIDA = {
  compras: "Compras (GeoShopping)",
  maquinas: "Máquinas (GeoMachinery)",
  mo: "Mano de obra (GeoTeam)",
  movilizacion: "Movilización",
  libre: "Libre (compras o máquinas)",
};
export const UNIDADES = ["Global", "Ton", "kg", "m3", "m2", "m", "Galón", "Litro", "Unidad", "Lance 9 m", "Lance 12 m", "Rollo", "Pie-tablar", "Bolsa", "Viaje", "Hora", "Día", "Servicio"];
export const RENGLONES_MOV_DEFAULT = ["Combustible (ida y vuelta)", "Peajes", "Mano de obra conductor", "Imprevistos"];
// Tipo de movilización (11-sep-2026): "propia" = la hacemos nosotros (solicitud
// de fondos con renglones y conductor); "proveedor" = la hace un tercero (UN
// renglón "Servicio de movilización — <proveedor>" y se le paga a él). Los
// registros viejos no traen `tipo`: se leen como propia.
export const TIPOS_MOV = { propia: "De nosotros", proveedor: "Con proveedor" };

// ── Números ──────────────────────────────────────────────────────────
// Todo lo tipeado por el usuario o guardado como string (amount de
// cp-purchases es STRING) pasa por acá. Acepta "22960", "1,234.5",
// "L 851,733.68", "1234,5" (coma decimal si no hay punto), números.
export const num = (x) => {
  if (x == null || x === "") return 0;
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  let s = String(x).trim().replace(/[^0-9.,-]/g, "");
  if (!s) return 0;
  if (s.includes(".")) s = s.replace(/,/g, "");           // "1,234.5" → coma = miles
  else if (s.includes(",")) {
    // solo comas: "1,234" / "46,221" = miles; "1234,5" = decimal
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
export const hnlToUsd = (hnl, tasa) => { const t = num(tasa); return t > 0 ? num(hnl) / t : 0; };
export const usdToHnl = (usd, tasa) => num(usd) * num(tasa);

// ── Partidas / presupuesto ───────────────────────────────────────────
// monto = cantidad × pu (2 dec) cuando ambos son > 0; si no, el monto
// tipeado a mano (partidas "Global" sin desglose).
export const montoPartida = (p) => {
  if (!p) return 0;
  const c = num(p.cantidad), pu = num(p.pu);
  return c > 0 && pu > 0 ? round2(c * pu) : round2(num(p.monto));
};
export const totalPresupuesto = (pres) => round2((pres?.partidas || []).reduce((s, p) => s + montoPartida(p), 0));
// Partidas que puede elegir cada módulo: compras → {compras, libre};
// maquinas → {maquinas, libre}; movilizacion → {movilizacion, libre};
// mo → SOLO mo. Sin módulo → todas.
export const partidasParaModulo = (pres, modulo) => {
  const ps = pres?.partidas || [];
  if (!modulo) return ps;
  if (modulo === "mo") return ps.filter(p => p.modulo === "mo");
  return ps.filter(p => p.modulo === modulo || p.modulo === "libre");
};
export const partidaMO = (pres) => (pres?.partidas || []).find(p => p.modulo === "mo") || null;
// Para <Select options> con optgroup: agrupadas por CATEGORIAS en orden
// (una categoría desconocida va al final, en orden de aparición).
const ordenCategorias = (partidas) => {
  const vistas = [...new Set(partidas.map(p => p.categoria || "Otros"))];
  return [...CATEGORIAS.filter(c => vistas.includes(c)), ...vistas.filter(c => !CATEGORIAS.includes(c))];
};
export const opcionesPartidas = (pres, modulo) => {
  const ps = partidasParaModulo(pres, modulo);
  return ordenCategorias(ps).map(cat => ({
    group: cat,
    options: ps.filter(p => (p.categoria || "Otros") === cat).map(p => ({ value: p.id, label: p.nombre || "(sin nombre)" })),
  })).filter(g => g.options.length);
};

// ── Proyectos ────────────────────────────────────────────────────────
// Misma lógica que getAllProjects de PurchasesModule (y hrProjects de
// GeoTeam): base + custom (custom gana), hidden/deleted ocultan.
export const proyectosUnificados = (customProjects) => {
  const custom = Array.isArray(customProjects) ? customProjects : [];
  const baseShorts = new Set(PROJECTS.map(p => p.short));
  const out = [];
  PROJECTS.forEach(p => {
    const extra = custom.find(cp => cp.short === p.short);
    if (extra?.hidden || extra?.deleted) return;
    out.push({ ...p, ...(extra || {}), isCustom: false });
  });
  custom.forEach(cp => {
    if (!cp?.short || baseShorts.has(cp.short) || cp.hidden || cp.deleted) return;
    out.push({ ...cp, isCustom: true });
  });
  return out;
};
export const nombreProyecto = (short, customProjects) => {
  if (!short) return "";
  const s = String(short).trim();
  const lista = proyectosUnificados(customProjects);
  const p = lista.find(x => x.short === s) || lista.find(x => x.id === s) || lista.find(x => (x.aliases || []).includes(s));
  return p?.name || s;
};
// Igual que resolveShortHR: si el short existe como proyecto REAL no se
// remapea por alias legacy (caso PLANTEL); solo los desconocidos se resuelven.
export const resolveProyecto = (short, customProjects) => {
  if (!short) return short;
  const s = String(short).trim();
  if (proyectosUnificados(customProjects).some(p => p.short === s)) return s;
  return resolveShort(s);
};
export const mismoProyecto = (a, b, customProjects) => {
  if (a == null || b == null) return false;
  const sa = String(a).trim(), sb = String(b).trim();
  return sa === sb || resolveProyecto(sa, customProjects) === resolveProyecto(sb, customProjects);
};

// ── Estados de costo de una compra ───────────────────────────────────
export const estadoCompraCosto = (p) => {
  const s = p?.status;
  if (s === "validado") return "comprometido";
  if (s === "pagado" || s === "finalizado") return "ejecutado";
  return null; // borrador, undefined, otros
};
export const fechaCompraCosto = (p) => p?.paidAt || p?.paymentDate || p?.validatedAt || p?.createdAt || "";

// =====================================================================
// ESPEJO de HRModule.jsx (L90-140) — si cambia allá, cambiar acá.
// Se duplica a propósito para que este archivo quede 100 % puro (importar
// HRModule.jsx arrastra React y el store, y Node no puede correr el test).
// =====================================================================
const HORARIOS = {
  plantel:  { label: "Campo (7:00 – 16:00)",    entrada: "7:00", salida: "16:00" },
  oficina:  { label: "Oficina (8:00 – 17:00)",  entrada: "8:00", salida: "17:00" },
  especial: { label: "Especial (9:00 – 18:00)", entrada: "9:00", salida: "18:00" },
};
const TOLERANCIA_MIN = 15;
const horarioDe = (e) => {
  if (e?.horario === "custom" && e?.horarioEntrada) {
    return { label: `Personalizado (${e.horarioEntrada} – ${e.horarioSalida || "?"})`, entrada: e.horarioEntrada, salida: e.horarioSalida || "" };
  }
  return HORARIOS[e?.horario] || HORARIOS.plantel;
};
const horaEntradaH = (e) => {
  const [h, mm] = String(horarioDe(e).entrada).split(":").map(Number);
  return (Number.isFinite(h) ? h : 7) + (Number.isFinite(mm) ? mm : 0) / 60;
};
// Fin de la tolerancia en horas decimales (8:00 + 15 min = 8.25): el
// descuento proporcional de un "1" con hora de entrada corre desde acá.
export const horaLimiteH = (e) => horaEntradaH(e) + TOLERANCIA_MIN / 60;
// Hoy en Honduras (UTC-6 sin DST) como YYYY-MM-DD — nunca toISOString().
export const hoyTegus = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

// =====================================================================
// MANO DE OBRA — PORT FIEL de calcCostoMO (HRModule.jsx L3571-3660) +
// HE_BANDAS / heSalarioBase / heDiasQ (L2825-2850). Misma fórmula que ve
// Gerson en Costos MO de GeoTeam; si difiere de allá, está MAL acá.
// =====================================================================
// Bandas fijas (jornada 7am-4pm): b1 4-7pm +25 %, b2 7-10pm +50 %,
// b3 10pm-12am +75 %; DOMINGO todas ×2. Hora base = salario ÷ 30 ÷ 8
// (SIN bonificación). Pago quincena vencida: HE de 1Q se pagan en 2Q,
// HE de 2Q el 15 del mes siguiente (1Q).
const HE_BANDAS = [
  { k: "b1", mult: 1.25 },
  { k: "b2", mult: 1.50 },
  { k: "b3", mult: 1.75 },
];
// heNum de GeoTeam: coma decimal (NO es num(): "2,5" h = 2.5 h).
const heNum = (x) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const heMult = (isSun, band) => isSun ? 2 : band.mult;
// El ajuste especial (hr-he-salbase) GANA sobre el salario real.
const heSalarioBase = (e, heSalBase) => {
  const ov = heSalBase?.[e.id];
  return (ov != null && ov !== "" && !isNaN(Number(ov)) && Number(ov) > 0) ? Number(ov) : (Number(e.salary) || 0);
};
const heHoraBase = (e, heSalBase) => heSalarioBase(e, heSalBase) / 30 / 8;
const diasDeQuincena = (periodo, quincena) => {
  const [y, m] = String(periodo || "").split("-").map(Number);
  if (!y || !m) return [];
  const start = quincena === "1Q" ? 1 : 16;
  const end = quincena === "1Q" ? 15 : new Date(y, m, 0).getDate();
  const out = [];
  for (let d = start; d <= end; d++) {
    const dt = new Date(y, m - 1, d);
    out.push({ day: d, isSun: dt.getDay() === 0, isHoliday: esFeriadoQuincena(periodo, d) });
  }
  return out;
};
const heDiasQ = diasDeQuincena;
// Quincena ANTERIOR (la que se PAGA en la hoja actual): 2Q → 1Q mismo mes;
// 1Q → 2Q del mes anterior.
export const quincenaAnteriorDe = (periodo, quincena) => {
  if (quincena === "2Q") return { periodo, quincena: "1Q" };
  const [y, m] = String(periodo || "").split("-").map(Number);
  const pd = new Date(y, m - 2, 1);
  return { periodo: `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, "0")}`, quincena: "2Q" };
};
const ultimoDiaQuincena = (periodo, quincena) => {
  const [y, m] = String(periodo || "").split("-").map(Number);
  if (!y || !m) return "";
  const end = quincena === "1Q" ? 15 : new Date(y, m, 0).getDate();
  return `${periodo}-${String(end).padStart(2, "0")}`;
};
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const EMPRESA_NOMBRE = { geotecnica: "Geotecnica Soluciones", subterra: "Subterra Honduras" };

// Valores por día (idénticos a la grid de asistencia de GeoTeam):
//   Día regular: "1" = 1 (con arrivalTimes → proporcional desde que vence la
//                tolerancia, TOPE 8h), "INC"/"V" = 1, "0"/vacío/"DT"... = 0.
//   Domingo/feriado: "DT" = 2, "DT2"/"TF" = 3, cualquier otro valor = 1
//                (descanso pagado por ley), vacío = 0.
// Costo diario = (salario + bonificación) / 30. Días fuera del rango de
// alta/baja NO se pagan aunque tengan valor guardado (caso Norman).
// emps: se filtran a sheet.company adentro (GeoTeam itera `ce`, TODOS los
// de la empresa sin mirar status — el guard de endDate hace el corte).
export const calcCostoMOPuro = ({ sheet, emps, hes, heSalBase, resolveProj }) => {
  const vacio = { rows: [], total: 0, totalDias: 0, totalHeHrs: 0, totalHeCosto: 0, personas: 0, hayHe: false };
  if (!sheet) return vacio;
  const rp = typeof resolveProj === "function" ? resolveProj : (s) => resolveProyecto(s, []);
  const grid = sheet.grid || {};
  const ovr = sheet.projOverrides || {};
  const at = sheet.arrivalTimes || {};
  const assignments = sheet.assignments || {};
  const [y, m] = String(sheet.periodo || "").split("-").map(Number);
  if (!y || !m) return vacio;
  const dias = diasDeQuincena(sheet.periodo, sheet.quincena);
  const empList = (emps || []).filter(e => e && (!sheet.company || e.company === sheet.company));
  const porProyecto = {};
  const personasSet = new Set();
  empList.forEach(e => {
    const sd = ((Number(e.salary) || 0) + (Number(e.bonificacion) || 0)) / 30;
    const base = rp(assignments[e.id]);
    dias.forEach(d => {
      const dStr = `${sheet.periodo}-${String(d.day).padStart(2, "0")}`;
      if (e.startDate && dStr < e.startDate) return;
      if (e.status === "inactive" && e.endDate && dStr > e.endDate) return;
      const k = `${e.id}-${d.day}`;
      const v = grid[k] || "";
      let val = 0;
      if (d.isSun || d.isHoliday) {
        if (v === "DT") val = 2;
        else if (v === "DT2" || v === "TF") val = 3;
        else if (v) val = 1; // "1", "0", "INC", "V" — pagado por ley
      } else {
        if (v === "1") {
          val = 1;
          if (at[k]) {
            // hora de entrada marcada → proporcional desde horaLimiteH
            // (`|| 0` en los minutos: "8" sin ":MM" daba NaN y se colaba)
            const [h, mm] = String(at[k]).split(":").map(Number);
            val = Math.max(0, (8 - Math.max(0, (h || 0) + (mm || 0) / 60 - horaLimiteH(e))) / 8);
          }
        } else if (v === "INC" || v === "V") val = 1;
      }
      if (val <= 0) return;
      const proj = ovr[k] ? rp(ovr[k]) : base;
      if (!proj) return;
      if (!porProyecto[proj]) porProyecto[proj] = { diasPag: 0, costo: 0, heHrs: 0, heCosto: 0, emps: new Set() };
      const P = porProyecto[proj];
      P.diasPag += val;
      P.costo += val * sd;
      P.emps.add(e.id);
      personasSet.add(e.id);
    });
  });
  // HORAS EXTRAS pagadas en ESTA quincena = las trabajadas la ANTERIOR
  // (quincena vencida): el proyecto desembolsa acá, se cargan acá.
  const prevQ = quincenaAnteriorDe(sheet.periodo, sheet.quincena);
  const heSheet = (hes || []).find(h => h && h.company === sheet.company && h.periodo === prevQ.periodo && h.quincena === prevQ.quincena);
  let totalHeHrs = 0, totalHeCosto = 0;
  if (heSheet) {
    const heDias = heDiasQ(heSheet.periodo, heSheet.quincena);
    const sunSet = new Set(heDias.filter(d => d.isSun).map(d => d.day));
    const heAssign = heSheet.assignments || {};
    const heOvr = heSheet.projOverrides || {};
    const hh = heSheet.hours || {};
    empList.forEach(e => {
      const hb = heHoraBase(e, heSalBase);
      const base = rp(heAssign[e.id]);
      heDias.forEach(d => {
        const key = `${e.id}-${d.day}`;
        const c = hh[key];
        if (!c) return;
        // atribución POR DÍA: el override del grid de HE manda
        const proj = heOvr[key] ? rp(heOvr[key]) : base;
        if (!proj) return;
        let hrs = 0, costoHe = 0;
        HE_BANDAS.forEach(b => {
          const h = heNum(c[b.k]);
          if (h <= 0) return;
          hrs += h;
          costoHe += h * heMult(sunSet.has(d.day), b) * hb;
        });
        if (hrs <= 0) return;
        if (!porProyecto[proj]) porProyecto[proj] = { diasPag: 0, costo: 0, heHrs: 0, heCosto: 0, emps: new Set() };
        const P = porProyecto[proj];
        P.emps.add(e.id);
        personasSet.add(e.id);
        P.heHrs += hrs;
        P.heCosto += costoHe;
        totalHeHrs += hrs;
        totalHeCosto += costoHe;
      });
    });
  }
  const rows = Object.entries(porProyecto).map(([short, v]) => ({
    short,
    diasPag: v.diasPag,
    costo: v.costo,            // asistencia (días pagados × costo diario)
    heHrs: v.heHrs,
    heCosto: v.heCosto,        // horas extras de la quincena anterior
    total: v.costo + v.heCosto,
    personas: v.emps.size,
  })).sort((a, b) => b.total - a.total);
  return {
    rows,
    total: rows.reduce((s, r) => s + r.total, 0),
    totalDias: rows.reduce((s, r) => s + r.diasPag, 0),
    totalHeHrs,
    totalHeCosto,
    personas: personasSet.size,
    hayHe: !!heSheet,
    prevQ,
  };
};

// =====================================================================
// MOVIMIENTOS NORMALIZADOS
// { id, fuente: "compras"|"maquinas"|"mo"|"movilizacion", ref, fecha,
//   descripcion, detalle, partidaId|null, estado: "comprometido"|"ejecutado",
//   montoHNL, montoUSD, enCurso, origen, sourceKey }
// =====================================================================
export const movimientosCompras = ({ purchases, projectCode, tasa, fuente = "compras", machines = [], customProjects = [] }) => {
  if (!projectCode) return [];
  const maq = (id) => (machines || []).find(x => x && x.id === id);
  return (purchases || []).filter(p => p && mismoProyecto(p.projectCode, projectCode, customProjects)).map(p => {
    const estado = estadoCompraCosto(p);
    const montoHNL = num(p.amount);
    if (!estado || montoHNL <= 0) return null;
    const mq = fuente === "maquinas" && p.machineId ? maq(p.machineId) : null;
    return {
      id: p.id,
      fuente,
      ref: p.codigo || p.id,
      fecha: fechaCompraCosto(p),
      descripcion: p.description || "",
      detalle: [p.provider, mq?.nombre].filter(Boolean).join(" · "),
      partidaId: p.partidaId || null,
      estado,
      montoHNL,
      montoUSD: hnlToUsd(montoHNL, tasa),
      enCurso: false,
      origen: p,
      sourceKey: fuente === "maquinas" ? "mq-purchases" : "cp-purchases",
    };
  }).filter(Boolean);
};

// Un movimiento por hoja de asistencia (ambas empresas) cuyo costo para el
// proyecto sea > 0. Siempre "ejecutado"; la quincena que aún no cerró va
// con enCurso:true (el módulo la pinta "en curso"). partidaId queda null:
// resumenPresupuesto la manda a partidaMO(pres).
export const movimientosMO = ({ atts, hes, emps, heSalBase, projectCode, tasa, hoy, customProjects = [] }) => {
  if (!projectCode) return [];
  const hoyStr = hoy || hoyTegus();
  const rp = (s) => resolveProyecto(s, customProjects);
  // UNA hoja por company|periodo|quincena (gana la de lastSaved más reciente):
  // si hr-atts2 trae hojas duplicadas de una misma quincena (dos usuarios
  // creándola a la vez, o una vieja que quedó), sin esto la MO se sumaba dos
  // veces. Espejo de statsDeMes (HRModule); si cambia allá, cambiar acá.
  const porClave = {};
  (atts || []).forEach(a => {
    if (!a?.periodo || !a?.quincena) return;
    const k = `${a.company}|${a.periodo}|${a.quincena}`;
    const cur = porClave[k];
    if (!cur || String(a.lastSaved || a.date || "") > String(cur.lastSaved || cur.date || "")) porClave[k] = a;
  });
  const out = [];
  Object.values(porClave).forEach(sheet => {
    const r = calcCostoMOPuro({ sheet, emps, hes, heSalBase, resolveProj: rp });
    const filas = r.rows.filter(row => mismoProyecto(row.short, projectCode, customProjects));
    const montoHNL = filas.reduce((s, x) => s + x.total, 0);
    if (montoHNL <= 0) return;
    const [y, m] = String(sheet.periodo).split("-").map(Number);
    const fecha = ultimoDiaQuincena(sheet.periodo, sheet.quincena);
    const personas = filas.reduce((s, x) => s + x.personas, 0);
    const dias = filas.reduce((s, x) => s + x.diasPag, 0);
    const heHrs = filas.reduce((s, x) => s + x.heHrs, 0);
    const detalle = [
      `${personas} ${personas === 1 ? "persona" : "personas"}`,
      `${round2(dias)} ${dias === 1 ? "día" : "días"}`,
      heHrs > 0 ? `${round2(heHrs)} h extra` : null,
    ].filter(Boolean).join(" · ");
    out.push({
      id: "mo-" + sheet.id,
      fuente: "mo",
      ref: `${sheet.quincena} ${MESES_LARGO[m - 1] || ""} ${y}`.trim(),
      fecha,
      descripcion: `Mano de obra · ${EMPRESA_NOMBRE[sheet.company] || sheet.company || ""}`.trim(),
      detalle,
      partidaId: null,
      estado: "ejecutado",
      montoHNL,
      montoUSD: hnlToUsd(montoHNL, tasa),
      enCurso: hoyStr <= fecha,
      origen: sheet,
      sourceKey: null,
      mo: { filas, prevQ: r.prevQ, hayHe: r.hayHe },
    });
  });
  return out;
};

// Con proveedor externo (m.tipo === "proveedor") el detalle es "Proveedor: X"
// (no hay conductor); el monto sale igual de total/renglones.
export const movimientosMovilizaciones = ({ movilizaciones, projectCode, tasa, customProjects = [] }) => {
  if (!projectCode) return [];
  return (movilizaciones || []).filter(m => m && m.estado !== "cancelada" && mismoProyecto(m.projectCode, projectCode, customProjects)).map(m => {
    const estado = m.estado === "acreditada" ? "ejecutado" : (m.estado === "solicitada" || m.estado === "recibida") ? "comprometido" : null;
    const sumaRenglones = (m.renglones || []).reduce((s, r) => s + num(r?.monto), 0);
    const montoHNL = num(m.total) || sumaRenglones;
    if (!estado || montoHNL <= 0) return null;
    return {
      id: m.id,
      fuente: "movilizacion",
      ref: m.codigo || m.id,
      fecha: m.fecha || m.createdAt || "",
      descripcion: `${m.origen || "?"} → ${m.destino || "?"}` + (m.descripcion ? " · " + m.descripcion : ""),
      detalle: m.tipo === "proveedor" ? `Proveedor: ${String(m.proveedor || "").trim() || "?"}` : [m.conductor, m.carga].filter(Boolean).join(" · "),
      partidaId: m.partidaId || null,
      estado,
      montoHNL,
      montoUSD: hnlToUsd(montoHNL, tasa),
      enCurso: false,
      origen: m,
      sourceKey: null,
    };
  }).filter(Boolean);
};

// Todo lo del proyecto, ordenado por fecha desc (ISO y YYYY-MM-DD comparan
// bien como string porque ambos arrancan con la fecha).
export const movimientosDeProyecto = ({ pres, cpPurchases, mqPurchases, movilizaciones, atts, hes, emps, heSalBase, machines, tasa, hoy, customProjects = [] }) => {
  const projectCode = pres?.projectCode;
  if (!projectCode) return [];
  const movs = [
    ...movimientosCompras({ purchases: cpPurchases, projectCode, tasa, fuente: "compras", customProjects }),
    ...movimientosCompras({ purchases: mqPurchases, projectCode, tasa, fuente: "maquinas", machines, customProjects }),
    ...movimientosMO({ atts, hes, emps, heSalBase, projectCode, tasa, hoy, customProjects }),
    ...movimientosMovilizaciones({ movilizaciones, projectCode, tasa, customProjects }),
  ];
  return movs.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
};

// =====================================================================
// RESUMEN presupuesto vs. real
// =====================================================================
// Misma regla que semaforoDe de geocost-ui (no se exporta para no chocar
// con ese nombre); el caso presupuesto 0 con gasto > 0 también es sobregiro.
const semaforoCosto = (pct, usadoUSD = 0, presupuestoUSD = 1) =>
  (presupuestoUSD <= 0 && usadoUSD > 0) || pct > 1 ? "sobregiro" : pct >= 0.8 ? "alerta" : "ok";
const sumar = (movs) => {
  let comprometidoUSD = 0, ejecutadoUSD = 0;
  movs.forEach(mv => { if (mv.estado === "comprometido") comprometidoUSD += mv.montoUSD; else if (mv.estado === "ejecutado") ejecutadoUSD += mv.montoUSD; });
  return { comprometidoUSD, ejecutadoUSD, usadoUSD: comprometidoUSD + ejecutadoUSD };
};
const conPct = (presupuestoUSD, t) => {
  const pct = presupuestoUSD > 0 ? t.usadoUSD / presupuestoUSD : 0;
  return { presupuestoUSD, ...t, disponibleUSD: presupuestoUSD - t.usadoUSD, pct, semaforo: semaforoCosto(pct, t.usadoUSD, presupuestoUSD) };
};
const mesDe = (fecha) => String(fecha || "").slice(0, 7);
const restarMeses = (yyyyMm, n) => {
  const [y, m] = yyyyMm.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Regla de asignación: mov.partidaId válido → esa partida; fuente "mo" sin
// partidaId → partidaMO(pres) si existe; si no → sinClasificar. Los totales
// del proyecto INCLUYEN lo sin clasificar (se gastó igual).
// `hoy` (opcional, YYYY-MM-DD) ancla la ventana de porMes — para tests.
export const resumenPresupuesto = (pres, movs, hoy) => {
  const partidasBase = pres?.partidas || [];
  const idx = new Map(partidasBase.map(p => [p.id, p]));
  const pMO = partidaMO(pres);
  const porPartida = new Map(partidasBase.map(p => [p.id, []]));
  const sinClas = [];
  const asignados = [];
  (movs || []).forEach(mv => {
    if (!mv || !mv.estado) return;
    let pid = mv.partidaId && idx.has(mv.partidaId) ? mv.partidaId : null;
    if (!pid && mv.fuente === "mo" && pMO) pid = pMO.id;
    const m2 = { ...mv, partidaId: pid, partidaNombre: pid ? (idx.get(pid).nombre || "") : null };
    asignados.push(m2);
    if (pid) porPartida.get(pid).push(m2); else sinClas.push(m2);
  });
  const partidas = partidasBase.map(p => {
    const pm = porPartida.get(p.id) || [];
    return { ...p, montoUSD: montoPartida(p), ...conPct(montoPartida(p), sumar(pm)), movs: pm };
  });
  const categorias = ordenCategorias(partidasBase).map(cat => {
    const ps = partidas.filter(p => (p.categoria || "Otros") === cat);
    const presupuestoUSD = round2(ps.reduce((s, p) => s + p.montoUSD, 0));
    return { categoria: cat, ...conPct(presupuestoUSD, sumar(ps.flatMap(p => p.movs))), partidas: ps };
  });
  const presupuestoUSD = totalPresupuesto(pres);
  const sinClasificar = { ...sumar(sinClas), movs: sinClas };
  // últimos 6 meses (ancla: hoy en Honduras) por fecha del movimiento
  const ancla = mesDe(hoy || hoyTegus());
  const meses = [5, 4, 3, 2, 1, 0].map(n => restarMeses(ancla, n));
  const porMes = meses.map(mes => {
    const t = sumar(asignados.filter(mv => mesDe(mv.fecha) === mes));
    return { mes, ejecutadoUSD: t.ejecutadoUSD, comprometidoUSD: t.comprometidoUSD };
  });
  return {
    ...conPct(presupuestoUSD, sumar(asignados)),
    categorias,
    partidas,
    sinClasificar,
    porMes,
    movs: asignados, // con partidaId/partidaNombre ya resueltos (MO incluida)
  };
};

// Atajo para los forms de GeoShopping/GeoMachinery (aviso de sobregiro).
export const disponibleDePartida = ({ pres, partidaId, movs }) => {
  const r = resumenPresupuesto(pres, movs);
  const p = r.partidas.find(x => x.id === partidaId);
  if (!p) return { presupuestoUSD: 0, usadoUSD: 0, disponibleUSD: 0, comprometidoUSD: 0, ejecutadoUSD: 0, pct: 0 };
  return { presupuestoUSD: p.montoUSD, usadoUSD: p.usadoUSD, disponibleUSD: p.disponibleUSD, comprometidoUSD: p.comprometidoUSD, ejecutadoUSD: p.ejecutadoUSD, pct: p.pct };
};

// Cartera: agrega los proyectos ACTIVOS. `resumenes` puede venir como el
// array del módulo [{ pres, movs, resumen }], como array de resúmenes
// alineado por índice, o como mapa { [projectCode|id]: resumen }.
export const resumenCartera = (presupuestos, resumenes) => {
  const lista = Array.isArray(presupuestos) ? presupuestos : [];
  const resumenDe = (pres, i) => {
    if (Array.isArray(resumenes)) {
      const w = resumenes.find(r => r && r.pres && (r.pres.id === pres.id || r.pres.projectCode === pres.projectCode));
      if (w) return w.resumen || null;
      const r = resumenes[i];
      return r ? (r.resumen || r) : null;
    }
    if (resumenes && typeof resumenes === "object") return resumenes[pres.projectCode] || resumenes[pres.id] || null;
    return null;
  };
  let presupuestoUSD = 0, comprometidoUSD = 0, ejecutadoUSD = 0, proyectos = 0, enAlerta = 0, enSobregiro = 0;
  lista.forEach((pres, i) => {
    if (!pres || pres.estado === "cerrado") return;
    proyectos++;
    const r = resumenDe(pres, i);
    presupuestoUSD += r ? num(r.presupuestoUSD) : totalPresupuesto(pres);
    comprometidoUSD += num(r?.comprometidoUSD);
    ejecutadoUSD += num(r?.ejecutadoUSD);
    if (r?.semaforo === "alerta") enAlerta++;
    if (r?.semaforo === "sobregiro") enSobregiro++;
  });
  const usadoUSD = comprometidoUSD + ejecutadoUSD;
  const pct = presupuestoUSD > 0 ? usadoUSD / presupuestoUSD : 0;
  return { proyectos, presupuestoUSD, comprometidoUSD, ejecutadoUSD, usadoUSD, disponibleUSD: presupuestoUSD - usadoUSD, pct, semaforo: semaforoCosto(pct, usadoUSD, presupuestoUSD), enAlerta, enSobregiro };
};

// Correlativo por año: MOV-2026-0001 (mismo criterio que MAT-/MAQ-).
export const siguienteCodigoMov = (lista, anio = new Date().getFullYear()) => {
  const re = /^MOV-(\d{4})-(\d+)$/;
  let max = 0;
  (lista || []).forEach(m => {
    const mt = re.exec(String(m?.codigo || "").trim());
    if (mt && Number(mt[1]) === Number(anio)) max = Math.max(max, Number(mt[2]) || 0);
  });
  return `MOV-${anio}-${String(max + 1).padStart(4, "0")}`;
};

// =====================================================================
// PLANTILLA VILLA SAN MIGUEL — para el botón "Precargar" del form (NO se
// escribe sola). Total 175,075.32 USD (test obligatorio). Los ids fijos
// "vsm-*" se reemplazan con uid() al precargar.
// =====================================================================
const vsm = (id, categoria, nombre, unidad, cantidad, pu, modulo) => ({ id, categoria, nombre, unidad, cantidad, pu, monto: round2(cantidad * pu), modulo, nota: "" });
export const PLANTILLA_VILLA_SAN_MIGUEL = {
  projectCode: "VILLA SAN MIGUEL",
  ficha: {
    codigo: "HF-12-4-19 (2026)",
    cliente: "Sociedad de Arrendamiento Directo",
    solucion: "Cimentación",
    fechaInicio: "2026-09-09",
    fechaFin: "2026-10-14",
    pm: "",
    maquinaIds: [],                       // el form agrega la BG11B por nombre
    maquinasTexto: "Piloteadora BG-11-B",
    materiales: [
      { id: "vsm-m1", descripcion: "Concreto premezclado autocompactante (Concremix), f'c 4,000 psi, agregado 3/8\", con bomba", cantidad: 322, unidad: "m³" },
      { id: "vsm-m2", descripcion: "Varilla corrugada #6, grado 60", cantidad: 430, unidad: "lances 9 m" },
      { id: "vsm-m3", descripcion: "Varilla corrugada #5, grado 40", cantidad: 245, unidad: "lances 9 m" },
      { id: "vsm-m4", descripcion: "Varilla corrugada #8, grado 60", cantidad: 302, unidad: "lances 12 m" },
      { id: "vsm-m5", descripcion: "Alambre de amarre cal. 16", cantidad: 20, unidad: "rollos 100 lb" },
      { id: "vsm-m6", descripcion: "Madera rústica para construcción", cantidad: 20, unidad: "pie-tablar" },
    ],
    notas: "",
  },
  partidas: [
    vsm("vsm-01", "Generales", "Movilización", "Global", 1, 3260.00, "movilizacion"),
    vsm("vsm-02", "Materiales", "Acero de construcción en barras, varios diámetros G40 y G60", "Ton", 46.22, 1050.00, "compras"),
    vsm("vsm-03", "Materiales", "Concreto premezclado autocompactante f'c 4,000 psi, agregado 3/8\", con bomba", "m3", 322, 226.04, "compras"),
    vsm("vsm-04", "Materiales", "Materiales varios", "Global", 1, 1000.00, "compras"),
    vsm("vsm-05", "Personal", "Partida general para mano de obra", "Global", 1, 7902.18, "mo"),
    vsm("vsm-06", "Equipos", "Costos de operación (mantenimiento / reparaciones, sin combustible)", "Global", 1, 13476.05, "maquinas"),
    vsm("vsm-07", "Equipos", "Combustible para la maquinaria", "Galón", 654.7, 5.24, "compras"),
    vsm("vsm-08", "Equipos", "Combustible vehículos", "Galón", 225, 5.24, "compras"),
    vsm("vsm-09", "Servicios subcontratados", "Subcontrato armado de acero", "kg", 46221, 0.30, "compras"),
    vsm("vsm-10", "Servicios subcontratados", "Seguros / Fianzas", "Global", 1, 1047.37, "libre"),
    vsm("vsm-11", "Otros", "Herramienta menor", "Global", 1, 474.13, "libre"),
    vsm("vsm-12", "Otros", "Imprevistos", "Global", 1, 6284.19, "libre"),
    vsm("vsm-13", "Otros", "Control de calidad", "Global", 1, 1047.37, "libre"),
    vsm("vsm-14", "Otros", "Atención empleados: bodega / letrina / EPP / etc.", "Global", 1, 792.22, "libre"),
  ],
};
