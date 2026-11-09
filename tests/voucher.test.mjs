import { test } from "node:test";
import assert from "node:assert/strict";
import { conceptosVoucher, sinVoucher, lineasVoucher, modalidadDe } from "../src/planilla-calc.js";

const base = { id: "x", name: "Ariel Jesus Zambrano", ct: "permanent", totalDays: 15, diasFueraRango: 0, diasEfectivos: 15, diasPresente: 15, ordinario: 11750, bq: 0, bonoDomingo: 0, bonoFeriado: 0, descuentoNSP: 0, descuentoHoras: 0, descuentoIncap: 0, isr: 0, ihss: 0, rap: 0, coop: 0, extras: [], payrollVersion: 3 };

test("comprobante simple: solo el ordinario y sin deducciones", () => {
  const v = conceptosVoucher(base);
  assert.deepEqual(v.ingresos, [{ concepto: "Salario ordinario quincenal (15 días)", monto: 11750 }]);
  assert.equal(v.deducciones.length, 0);
  assert.equal(v.neto, 11750);
  assert.equal(modalidadDe(base), "Permanente");
  assert.equal(v.diasPagados, 15);
  assert.equal(conceptosVoucher({ ...base, totalDays: 16, diasNSP: 1, descuentoNSP: 500 }).diasPagados, 15);
});

test("2Q con ley, NSP, extras y horas extras aparte", () => {
  const l = { ...base, bq: 1000, diasNSP: 1, descuentoNSP: 783.33, ihss: 595.16, rap: 173.45, extras: [{ tipo: "deduccion", concepto: "Préstamo", monto: 500 }, { tipo: "ingreso", concepto: "Bono", monto: 200 }],
    he: { monto: 300, hrs: 3, bandas: { b1: { hrs: 2, monto: 180 }, b2: { hrs: 0, monto: 0 }, b3: { hrs: 0, monto: 0 }, dom: { hrs: 1, monto: 120 } } } };
  const v = conceptosVoucher(l);
  assert.deepEqual(v.ingresos.map(r => r.concepto), ["Salario ordinario quincenal (15 días)", "Bonificación", "Bono"]);
  assert.deepEqual(v.deducciones.map(r => r.concepto), ["No se presentó (1 día)", "Seguro social (IHSS)", "Régimen de aportaciones privadas (RAP)", "Préstamo"]);
  assert.equal(v.totalIngresos, 12950);
  assert.equal(v.neto, 12950 - 783.33 - 595.16 - 173.45 - 500);
  assert.equal(v.he.length, 2);
  assert.equal(v.heMonto, 300);
});

test("nunca se genera el de Gerson Trochez", () => {
  assert.equal(sinVoucher({ name: "Gerson Josué Trochez" }), true);
  assert.equal(sinVoucher({ name: "GERSON TRÓCHEZ" }), true);
  assert.equal(sinVoucher({ name: "Gerson Pérez" }), false);
  assert.equal(lineasVoucher([{ name: "Gerson Trochez" }, { name: "Ana" }]).length, 1);
});
