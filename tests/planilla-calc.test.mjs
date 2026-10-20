import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diasDeQuincena, quincenaAnterior, quincenaSiguiente, nombreQuincena, rangoQuincena,
  calcRAP, deduccionesLey, asistenciaDe, horasExtrasDe, armarLinea, totalesLinea,
  lineaParaGuardar, resumenPlanilla, entraEnPlanilla, IHSS_CUOTA, notaAutomatica,
} from "../src/planilla-calc.js";

const emp = (over = {}) => ({ id: "e1", fullName: "Edgar Joel Izcano Paz", company: "geotecnica", contractType: "permanent", salary: 30000, bonificacion: 5000, status: "active", startDate: "2025-01-01", ...over });
const feriadosOct = (d) => [8, 9, 10].includes(d);
const grid = (empId, dias) => Object.fromEntries(Object.entries(dias).map(([d, v]) => [`${empId}-${d}`, v]));

test("quincenas: días, anterior, siguiente y nombres", () => {
  const q = diasDeQuincena("2026-10", "2Q");
  assert.equal(q.start, 16); assert.equal(q.end, 31); assert.equal(q.total, 16);
  assert.equal(diasDeQuincena("2026-02", "2Q").total, 13);
  assert.deepEqual(quincenaAnterior("2026-10", "1Q"), { periodo: "2026-09", quincena: "2Q" });
  assert.deepEqual(quincenaAnterior("2026-10", "2Q"), { periodo: "2026-10", quincena: "1Q" });
  assert.deepEqual(quincenaSiguiente("2026-12", "2Q"), { periodo: "2027-01", quincena: "1Q" });
  assert.equal(nombreQuincena("2026-10", "1Q"), "Primera quincena · Octubre 2026");
  assert.equal(rangoQuincena("2026-10", "1Q"), "1 al 15 de octubre de 2026");
});

test("RAP e IHSS como en la hoja de Carolina (2Q); nada en 1Q", () => {
  assert.equal(calcRAP(23500), 173.95);          // (23500 − 11903.13) × 1.5 %
  assert.equal(calcRAP(11000), 0);
  const d2 = deduccionesLey(emp({ isrMensual: 2917.93 }), "2Q");
  assert.equal(d2.ihss, IHSS_CUOTA); assert.equal(d2.rap, 271.45); assert.equal(d2.isr, 2917.93);
  const d1 = deduccionesLey(emp({ isrMensual: 2917.93 }), "1Q");
  assert.deepEqual([d1.ihss, d1.rap, d1.isr], [0, 0, 0]);
  // Subterra permanente: IHSS sí, RAP no (grupo A)
  const ds = deduccionesLey(emp({ company: "subterra" }), "2Q");
  assert.equal(ds.ihss, IHSS_CUOTA); assert.equal(ds.rap, 0);
  // Exento marcado en la ficha
  assert.equal(deduccionesLey(emp({ sinRap: true }), "2Q").rap, 0);
});

test("ordinario = mensual/2 aunque la 2Q tenga 16 días; feriados y domingos como Carolina", () => {
  const e = emp();
  // 1Q octubre: feriado morazánico 8, 9 y 10 trabajados (TF) y domingo 4 trabajado (DT)
  const dias = {}; for (let d = 1; d <= 15; d++) dias[d] = "1";
  dias[8] = "TF"; dias[9] = "TF"; dias[10] = "TF"; dias[4] = "DT";
  const a = asistenciaDe(e, "2026-10", "1Q", { grid: grid("e1", dias), esFeriado: feriadosOct });
  assert.equal(a.presentes, 15); assert.equal(a.tf, 3); assert.equal(a.dt, 1); assert.equal(a.nsp, 0);
  const l = armarLinea({ emp: e, periodo: "2026-10", quincena: "1Q", asistencia: a });
  assert.equal(l.sd, 1000);
  assert.equal(l.ordinario, 15000);                 // =J/2
  assert.equal(l.bonoFeriado, 6000);                // =6*L (3 feriados × 2 diarios)
  assert.equal(l.bonoDomingo, 1000);                // =1*L
  assert.equal(l.bq, 2500);                         // =K/2
  const t = totalesLinea(l);
  assert.equal(t.neto, 15000 + 2500 + 6000 + 1000); // 1Q: sin deducciones de ley
  // 2Q completa de 16 días: sigue siendo mensual/2
  const dias2 = {}; for (let d = 16; d <= 31; d++) dias2[d] = "1";
  const a2 = asistenciaDe(e, "2026-10", "2Q", { grid: grid("e1", dias2) });
  const l2 = armarLinea({ emp: emp({ isrMensual: 2917.93 }), periodo: "2026-10", quincena: "2Q", asistencia: a2 });
  assert.equal(l2.ordinario, 15000);
  assert.equal(l2.aplicaLey, true); assert.equal(l2.ihss, 595.16); assert.equal(l2.rap, 271.45); assert.equal(l2.isr, 2917.93);
  assert.equal(totalesLinea(l2).neto, 15000 + 2500 - 595.16 - 271.45 - 2917.93);
});

test("NSP descuenta el diario; domingo/feriado con 0 no descuenta; llegada tarde denegada proporcional", () => {
  const e = emp({ salary: 24000 });
  const dias = {}; for (let d = 1; d <= 15; d++) dias[d] = "1";
  dias[2] = "0"; dias[4] = "0" /* domingo */; dias[8] = "0" /* feriado */;
  const at = { "e1-5": "8:00" }; // horario campo 7:00 + 15 min → 45 min tarde
  const a = asistenciaDe(e, "2026-10", "1Q", { grid: grid("e1", dias), arrivalTimes: at, esFeriado: feriadosOct, horaLimite: () => 7.25 });
  assert.equal(a.nsp, 1); assert.equal(a.tardes, 1); assert.equal(a.horasTarde, 0.75);
  const l = armarLinea({ emp: e, periodo: "2026-10", quincena: "1Q", asistencia: a });
  assert.equal(l.descuentoNSP, 800);
  assert.equal(l.descuentoHoras, 75);            // 0.75/8 × 800
  assert.equal(totalesLinea(l).neto, 12000 + 2500 - 800 - 75); // + bonificación/2
});

test("alta a mitad de quincena: diario × días en rango, con tope mensual/2", () => {
  const e = emp({ salary: 30000, bonificacion: 0, startDate: "2026-10-10" });
  const a = asistenciaDe(e, "2026-10", "1Q", { grid: {} });
  assert.equal(a.diasFueraRango, 9); assert.equal(a.diasEfectivos, 6);
  const l = armarLinea({ emp: e, periodo: "2026-10", quincena: "1Q", asistencia: a });
  assert.equal(l.ordinario, 6000);
  assert.equal(l.sinAsistencia, true);
});

test("horas extras de la quincena vencida: bandas, domingo ×2 y monto", () => {
  const he = { periodo: "2026-09", quincena: "2Q", hours: { "e1-17": { b1: "2", b2: "1" }, "e1-20": { b1: "3" } /* domingo 20-sep */, "e2-18": { b1: "1" } } };
  const hb = 30000 / 30 / 8; // 125
  const r = horasExtrasDe(he, "e1", hb);
  assert.equal(r.hrs, 6);
  assert.equal(r.bandas.b1.hrs, 2); assert.equal(r.bandas.b2.hrs, 1); assert.equal(r.bandas.dom.hrs, 3);
  assert.equal(r.monto, 2 * 1.25 * 125 + 1 * 1.5 * 125 + 3 * 2 * 125);
  assert.equal(horasExtrasDe(he, "e9", hb), null);
  const l = armarLinea({ emp: emp(), periodo: "2026-10", quincena: "1Q", asistencia: asistenciaDe(emp(), "2026-10", "1Q", {}), he: r });
  const t = totalesLinea(l);
  assert.equal(t.heMonto, r.monto);
  // Planilla de horas extras APARTE: el neto de salarios no las incluye
  assert.equal(t.neto, 15000 + 2500);
  assert.equal(t.totalConHe, 15000 + 2500 + r.monto);
  const res = resumenPlanilla([l]);
  assert.equal(res.neto, 17500); assert.equal(res.he, r.monto); assert.equal(res.hePersonas, 1);
  assert.equal(res.totalGeneral, 17500 + r.monto);
  assert.doesNotMatch(notaAutomatica(l), /HE/);
});

test("honorarios: quincenal con 12.5 % de ISR; mensual cobra el mes en su quincena y no entra en la otra", () => {
  const q = emp({ id: "h1", contractType: "honorarios", salary: 23500, bonificacion: 0 });
  const lq = armarLinea({ emp: q, periodo: "2026-10", quincena: "1Q", asistencia: asistenciaDe(q, "2026-10", "1Q", {}) });
  assert.equal(lq.ordinario, 11750); assert.equal(lq.isr, 1468.75); assert.equal(lq.ihss, 0);
  assert.equal(totalesLinea(lq).neto, 11750 - 1468.75);
  const m = emp({ id: "h2", contractType: "honorarios", salary: 66650, bonificacion: 0, honorariosPago: "mensual" });
  assert.equal(entraEnPlanilla(m, "2026-10", "1Q"), true);
  assert.equal(entraEnPlanilla(m, "2026-10", "2Q"), false);
  const lm = armarLinea({ emp: m, periodo: "2026-10", quincena: "1Q", asistencia: asistenciaDe(m, "2026-10", "1Q", {}) });
  assert.equal(lm.ordinario, 66650); assert.equal(lm.isr, 0);
});

test("quién entra: bajas antes de la quincena no, bajas a mitad sí, altas futuras no", () => {
  assert.equal(entraEnPlanilla(emp({ status: "inactive", endDate: "2026-09-30" }), "2026-10", "1Q"), false);
  assert.equal(entraEnPlanilla(emp({ status: "inactive", endDate: "2026-10-05" }), "2026-10", "1Q"), true);
  assert.equal(entraEnPlanilla(emp({ startDate: "2026-10-20" }), "2026-10", "1Q"), false);
  assert.equal(entraEnPlanilla(emp({ startDate: "" , status: "active" }), "2026-10", "1Q"), true);
});

test("extras con concepto, cooperativa todas las quincenas y resumen por grupo / método de pago", () => {
  const e = emp({ cooperativa: 1356, metodoPago: "ach" });
  const l = armarLinea({ emp: e, periodo: "2026-10", quincena: "1Q", asistencia: asistenciaDe(e, "2026-10", "1Q", {}) });
  assert.equal(l.coop, 1356);
  l.extras = [{ id: "x1", tipo: "ingreso", concepto: "Bono foráneo", monto: 2500 }, { id: "x2", tipo: "deduccion", concepto: "Préstamo c3/8", monto: 1500 }];
  const t = totalesLinea(l);
  assert.equal(t.extrasIng, 2500); assert.equal(t.extrasDed, 1500);
  assert.equal(t.neto, 15000 + 2500 + 2500 - 1356 - 1500);
  const g = lineaParaGuardar(l);
  assert.equal(g.o1, 2500); assert.equal(g.otros, 1500); assert.equal(g.neto, t.neto); assert.equal(g.so, 15000);
  const h = emp({ id: "h1", contractType: "honorarios", salary: 20000, bonificacion: 0 });
  const lh = armarLinea({ emp: h, periodo: "2026-10", quincena: "1Q", asistencia: asistenciaDe(h, "2026-10", "1Q", {}) });
  const r = resumenPlanilla([l, lh]);
  assert.equal(r.personas, 2);
  assert.equal(r.porGrupo.permanent.n, 1); assert.equal(r.porGrupo.honorarios.n, 1);
  assert.equal(r.porMetodo.ach.neto, t.neto); assert.equal(r.porMetodo.transferencia.n, 1);
  assert.equal(r.neto, t.neto + totalesLinea(lh).neto);
  assert.equal(r.salarios, r.neto); assert.equal(r.he, 0);
});

test("líneas viejas (v2) siguen sumando igual", () => {
  const v2 = { so: 14200, descuentoNSP: 800, bq: 2500, o1: 0, bonoDomingo: 0, bonoFeriado: 0, isr: 0, ihss: 595.16, rap: 0, coop: 0, otros: 100, payrollVersion: 2 };
  const t = totalesLinea(v2);
  assert.equal(t.ordinario, 15000);
  assert.equal(t.neto, 14200 + 2500 - 595.16 - 100);
});
