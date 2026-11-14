// ═══════════════════════════════════════════════════════════════════════════
// CONTRATISTAS DE SERVICIOS (El Salvador, 13-nov-2026). Lógica PURA (Node),
// probada en tests/contratistas-calc.test.mjs contra la "Estimación de Pago
// Contratistas de Servicios · Batch Q02 OCT.26" ($2,115.19).
//
// No son empleados (no van en hr-emps5 ni en la planilla): son proveedores de
// servicios con uno o varios CONTRATOS (código SVSERV26-…). Cada contrato
// tiene su tarifa (por día de servicio o por unidad, ej. el perforista) y su
// valor de hora extra (= tarifa diaria ÷ 8, sin recargo). Se les paga por
// QUINCENA: días × tarifa + horas × valor hora (o unidades × tarifa) = "suma
// global", menos 10 % de retención de ISR = líquido a pagar.
//
// Keys (el store les pega @sv solo en El Salvador):
//   hr-contratistas                → [{ id, nombre, dui, telefono, correo,
//        direccion, banco {nombre, cuenta, nota}, fechaNacimiento, genero,
//        activo, contratos: [{ id, codigo, servicio, rol, proyecto, modo
//        "dia"|"unidad", unidad, tarifa, valorHora, activo }] }]
//   hr-contrat-<AAAA-MM>-<1Q|2Q>   → { periodo, quincena, registros:
//        { [contratoId]: { dias {fecha: 0|0.5|1|2}, he {fecha: horas diurnas},
//          heN {fecha: horas nocturnas}, uni {fecha: unidades del día — el
//          perforista: metros lineales de la bitácora}, unidades (total de la
//          quincena SIN detalle por día; solo si no hay `uni`), nota } },
//        updatedAt, updatedBy }
// 14-nov-2026 (Excel de Roberto, Batch Q01 NOV.26 = $2,404.09): la hora extra
// nocturna vale lo MISMO que la diurna (tarifa ÷ 8, sin recargo) pero va en su
// columna; el perforista lleva sus metros por día (23.55 + 26 + 25).
// ═══════════════════════════════════════════════════════════════════════════

export const KEY_CONTRATISTAS = "hr-contratistas";
export const keyAsistContrat = (periodo, quincena) => `hr-contrat-${periodo}-${quincena}`;
export const RETENCION_ISR = 0.10;
export const HORAS_JORNADA = 8;
export const VALORES_DIA = [0, 0.5, 1, 2];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// Redondeo como Excel (mitad hacia arriba en decimal).
export const r2 = (n) => { const x = num(n); return Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-6) / 100; };

/** Días (YYYY-MM-DD) de una quincena: 1Q = 1–15, 2Q = 16–fin de mes. */
export const diasQuincena = (periodo, quincena) => {
  const [y, m] = String(periodo || "").split("-").map(Number);
  if (!y || !m) return [];
  const fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [a, b] = quincena === "1Q" ? [1, 15] : [16, fin];
  return Array.from({ length: b - a + 1 }, (_, i) => `${periodo}-${String(a + i).padStart(2, "0")}`);
};
export const quincenaDeFecha = (iso) => ({ periodo: String(iso).slice(0, 7), quincena: Number(String(iso).slice(8, 10)) <= 15 ? "1Q" : "2Q" });

/** Valor de la hora extra del contrato: el que trae, o la tarifa diaria ÷ 8. */
export const valorHoraDe = (c) => num(c?.valorHora) > 0 ? num(c.valorHora) : (c?.modo === "unidad" ? 0 : num(c?.tarifa) / HORAS_JORNADA);

/** Etiqueta del servicio en la estimación ("SERVICIO DE VIGILANCIA NOCTURNA"). */
export const servicioDe = (c) => String(c?.servicio || c?.rol || "Servicio").trim();

/**
 * Liquidación de UN contrato en la quincena. Arrastra los decimales hasta el
 * final, como el Excel (434.375 → suma 434.38, retención 43.44, líquido 390.94).
 */
export const liquidarContrato = (contrato, registro = {}, { retencion = RETENCION_ISR } = {}) => {
  const r = registro || {};
  const suma = (o) => Object.values(o || {}).reduce((s, v) => s + num(v), 0);
  const dias = suma(r.dias);
  const horasD = suma(r.he), horasN = suma(r.heN), horas = horasD + horasN;
  const porUnidad = contrato?.modo === "unidad";
  const hayUni = Object.keys(r.uni || {}).length > 0;
  const unidades = porUnidad ? (hayUni ? suma(r.uni) : num(r.unidades)) : 0;
  const tarifa = num(contrato?.tarifa), vh = valorHoraDe(contrato);
  const montoBase = porUnidad ? unidades * tarifa : dias * tarifa;
  const montoHeD = horasD * vh, montoHeN = horasN * vh;
  const montoHe = montoHeD + montoHeN;
  const sumaX = montoBase + montoHe;
  const retX = contrato?.sinRetencion ? 0 : sumaX * retencion;
  const liqX = sumaX - retX;
  return {
    dias, horas, horasD, horasN, unidades, tarifa, valorHora: r2(vh),
    montoBase: r2(montoBase), montoHe: r2(montoHe), montoHeD: r2(montoHeD), montoHeN: r2(montoHeN),
    suma: r2(sumaX), retencion: r2(retX), liquido: r2(liqX),
    sumaX, retX, liqX,
    vacio: sumaX <= 0,
  };
};

/** Filas de la estimación (una por contrato con algo que pagar) + totales. */
export const estimacionQuincena = (contratistas = [], asistencia = {}) => {
  const regs = asistencia?.registros || {};
  const filas = [];
  (contratistas || []).forEach(p => {
    (p.contratos || []).forEach(c => {
      const l = liquidarContrato(c, regs[c.id]);
      if (l.vacio) return;
      filas.push({ persona: p, contrato: c, ...l });
    });
  });
  const t = filas.reduce((a, f) => ({ sumaX: a.sumaX + f.sumaX, retX: a.retX + f.retX, liqX: a.liqX + f.liqX }), { sumaX: 0, retX: 0, liqX: 0 });
  return { filas, suma: r2(t.sumaX), retencion: r2(t.retX), liquido: r2(t.liqX), personas: new Set(filas.map(f => f.persona.id)).size };
};

/** Poner/quitar el valor de un día o las horas de un contrato (inmutable). */
export const ponerDia = (asis, contratoId, fecha, v) => {
  const regs = { ...(asis?.registros || {}) };
  const r = { ...(regs[contratoId] || {}) };
  const dias = { ...(r.dias || {}) };
  if (v === "" || v == null) delete dias[fecha]; else dias[fecha] = num(v);
  regs[contratoId] = { ...r, dias };
  return { ...(asis || {}), registros: regs };
};
// campo: "he" (horas extra diurnas) | "heN" (nocturnas) | "uni" (unidades del día).
export const ponerPorDia = (asis, contratoId, campo, fecha, n) => {
  const regs = { ...(asis?.registros || {}) };
  const r = { ...(regs[contratoId] || {}) };
  const m = { ...(r[campo] || {}) };
  if (!num(n)) delete m[fecha]; else m[fecha] = num(n);
  regs[contratoId] = { ...r, [campo]: m };
  return { ...(asis || {}), registros: regs };
};
export const ponerHoras = (asis, contratoId, fecha, h) => ponerPorDia(asis, contratoId, "he", fecha, h);
export const ponerCampo = (asis, contratoId, campo, valor) => {
  const regs = { ...(asis?.registros || {}) };
  regs[contratoId] = { ...(regs[contratoId] || {}), [campo]: valor };
  return { ...(asis || {}), registros: regs };
};

/**
 * Mezcla a tres vías por celda (lo que YO cambié sobre la nube fresca): así
 * dos personas pueden marcar a la vez sin pisarse.
 */
export const mezclarAsistencia = (base, local, nube) => {
  const out = JSON.parse(JSON.stringify(nube || { registros: {} }));
  out.registros = out.registros || {};
  const B = base?.registros || {}, Lr = local?.registros || {};
  const ids = new Set([...Object.keys(B), ...Object.keys(Lr)]);
  ids.forEach(id => {
    const b = B[id] || {}, l = Lr[id] || {};
    const o = out.registros[id] = { ...(out.registros[id] || {}) };
    ["dias", "he", "heN", "uni"].forEach(k => {
      const bk = b[k] || {}, lk = l[k] || {};
      const ok = o[k] = { ...(o[k] || {}) };
      new Set([...Object.keys(bk), ...Object.keys(lk)]).forEach(f => {
        if (bk[f] === lk[f]) return;                  // no lo toqué
        if (lk[f] == null) delete ok[f]; else ok[f] = lk[f];
      });
    });
    ["unidades", "nota"].forEach(k => { if (b[k] !== l[k]) { if (l[k] == null) delete o[k]; else o[k] = l[k]; } });
  });
  return out;
};

export const formatoDui = (v) => { const d = String(v || "").replace(/\D/g, "").slice(0, 9); return d.length > 8 ? `${d.slice(0, 8)}-${d.slice(8)}` : d; };
export const validarContratista = (p, todos = []) => {
  if (!String(p?.nombre || "").trim()) return "Falta el nombre.";
  const dui = String(p?.dui || "").replace(/\D/g, "");
  if (dui && dui.length !== 9) return "El DUI lleva 9 dígitos (ej. 03938537-2).";
  if (dui && (todos || []).some(x => x.id !== p.id && String(x.dui || "").replace(/\D/g, "") === dui)) return "Ya hay un contratista con ese DUI.";
  for (const c of p?.contratos || []) {
    if (!String(c.servicio || "").trim()) return "Cada contrato necesita el servicio.";
    if (!(num(c.tarifa) > 0)) return `El contrato ${c.codigo || c.servicio} necesita su tarifa.`;
  }
  return null;
};
