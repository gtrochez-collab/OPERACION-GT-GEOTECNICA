// Planilla de El Salvador: calcada de la 2Q de octubre-2026 de la Lic. Diana Calles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isrQuincenal, deduccionesSV, horasExtrasSV, primaVacacion } from "../src/planilla-sv.js";
import { armarLinea, conLeySV, totalesLinea, resumenPlanilla, lineaParaGuardar } from "../src/planilla-calc.js";

const asis = (o = {}) => ({ totalDays: 16, diasEfectivos: 16, diasFueraRango: 0, presentes: 0, presentesEfectivo: 0, nsp: 0, inc: 0, vac: 0, dt: 0, dt2: 0, tf: 0, tardes: 0, horasTarde: 0, descuentoHorasFraccion: 0, projDays: {}, conDatos: false, ...o });
const linea = (salary, ct, extra = {}, a = {}) => conLeySV({ ...armarLinea({ emp: { id: "x" + salary, fullName: "X", salary, contractType: ct, company: "subterra", status: "active" }, periodo: "2026-10", quincena: "2Q", asistencia: asis(a), pais: "sv" }), ...extra });

test("tabla de ISR quincenal", () => {
  assert.equal(isrQuincenal(269.25), 0);
  assert.equal(isrQuincenal(275), 0);
  assert.equal(isrQuincenal(300), 11.33);          // (300−275)·10 % + 8.83
  assert.equal(isrQuincenal(912.5), 122.98);
  assert.equal(isrQuincenal(587.875), 58.05);
  assert.equal(isrQuincenal(1500), 288.57);        // (1500−1019.05)·30 % + 144.28
});

test("ISSS con tope de $15 por quincena", () => {
  assert.equal(deduccionesSV(300).isss, 9);
  assert.equal(deduccionesSV(1000).isss, 15);
  assert.equal(deduccionesSV(650).isss, 15);
});

test("2Q oct-2026 igual a la planilla de la Lic. Diana", () => {
  const yaq = linea(600, "temporary");
  const edy = linea(2000, "permanent");
  const rob = linea(1000, "permanent", { vacacion: 150 });
  const exp = [
    [yaq, { cotizable: 300, isss: 9, afp: 21.75, sujetoIsr: 269.25, isr: 0, pAfp: 26.25, pIsss: 22.5, neto: 269.25 }],
    [edy, { cotizable: 1000, isss: 15, afp: 72.5, sujetoIsr: 912.5, isr: 122.98, pAfp: 87.5, pIsss: 75, neto: 789.52 }],
    [rob, { cotizable: 650, isss: 15, afp: 47.13, sujetoIsr: 587.88, isr: 58.05, pAfp: 56.88, pIsss: 48.75, neto: 529.82 }],
  ];
  for (const [l, e] of exp) {
    assert.equal(l.cotizable, e.cotizable); assert.equal(l.isss, e.isss); assert.equal(l.afp, e.afp);
    assert.equal(l.sujetoIsr, e.sujetoIsr); assert.equal(l.isr, e.isr);
    assert.equal(l.patronal.afp, e.pAfp); assert.equal(l.patronal.isss, e.pIsss);
    assert.equal(totalesLinea(l).neto, e.neto);
  }
  const res = resumenPlanilla([yaq, edy, rob].map(lineaParaGuardar));
  assert.equal(res.neto, 1588.6);
  assert.equal(res.he, 0);
  assert.equal(res.deducciones, 361.4);
  assert.equal(res.porMetodo.transferencia.neto, 1588.6);
});

test("vacación: 30 % de recargo sobre los días", () => {
  assert.equal(primaVacacion(1000, 15), 150);
  const l = linea(1000, "permanent", {}, { vac: 15 });
  assert.equal(l.vacacion, 150);
});

test("horas extras de la misma quincena: diurna ×2, nocturna ×2.5", () => {
  const h = horasExtrasSV(600, 4, 2);               // hora = 600/30/8 = 2.50
  assert.equal(h.valorHora, 2.5);
  assert.equal(h.montoDiurnas, 20);
  assert.equal(h.montoNocturnas, 12.5);
  const l = linea(600, "temporary", { heSV: { diurnas: 4, nocturnas: 2 } });
  assert.equal(l.cotizable, 332.5);                 // entran al cotizable
  assert.equal(totalesLinea(l).heMonto, 0);         // no van a una planilla aparte
  assert.equal(totalesLinea(l).heIncluido, 32.5);
});

test("Honduras no cambia", () => {
  const l = armarLinea({ emp: { id: "h", fullName: "H", salary: 20000, contractType: "permanent", company: "geotecnica", status: "active" }, periodo: "2026-10", quincena: "2Q", asistencia: asis(), pais: "hn" });
  assert.equal(l.pais, undefined);
  assert.equal(l.ihss, 595.16);
});
