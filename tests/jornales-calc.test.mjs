import { test } from "node:test";
import assert from "node:assert/strict";
import { corteDe, corteAnterior, corteSiguiente, diasDelCorte, fechasHeDelCorte, liquidarProyecto, mezclarProyecto, validarJornalero, formatoDni, ponerCelda, cambiosEntre } from "../src/jornales-calc.js";

test("cortes de sábado a viernes, se pagan el lunes", () => {
  const c = corteDe("2026-11-10");
  assert.deepEqual(c, { id: "2026-10-31", ini: "2026-10-31", fin: "2026-11-13", pago: "2026-11-16" });
  assert.equal(corteDe("2026-10-31").id, "2026-10-31");
  assert.equal(corteDe("2026-10-30").id, "2026-10-17");
  assert.equal(corteDe("2026-10-30").pago, "2026-11-02");
  assert.equal(corteAnterior(c).id, "2026-10-17");
  assert.equal(corteSiguiente(c).id, "2026-11-14");
  assert.equal(corteDe("2027-01-01").ini, "2026-12-26");
  assert.equal(diasDelCorte(c).length, 14);
  assert.equal(fechasHeDelCorte(c)[0], "2026-10-30");
  assert.equal(fechasHeDelCorte(c)[13], "2026-11-12");
});

test("liquidación: días × tarifa + HE a tarifa/8, HE del viernes pasan al siguiente", () => {
  const c = corteDe("2026-11-01");
  const jornaleros = [{ id: "a", fullName: "Cristian Lopez", dni: "0801", salarioDia: 600 }, { id: "b", fullName: "Randy Lopez", salarioDia: 600 }];
  const proy = { jornaleros: ["a"], dias: { a: { "2026-10-31": 1, "2026-11-02": 1, "2026-11-03": 0.5, "2026-11-13": 1 } }, he: { a: { "2026-11-02": 2, "2026-11-13": 3 } } };
  const previo = { jornaleros: ["a", "b"], he: { a: { "2026-10-30": 4 }, b: { "2026-10-30": 2, "2026-10-29": 5 } }, tarifas: { b: 650 } };
  const r = liquidarProyecto({ corte: c, proy, proyPrevio: previo, jornaleros });
  const a = r.filas.find(f => f.id === "a");
  assert.equal(a.totalDias, 3.5);
  assert.equal(a.horasHe, 6);            // 2 de este corte + 4 del viernes 30
  assert.equal(a.heSiguiente, 3);        // las del vie 13 se van al próximo
  assert.equal(a.total, 3.5 * 600 + 6 * 75);
  const b = r.filas.find(f => f.id === "b");
  assert.ok(b.soloHePrevia);
  assert.equal(b.tarifa, 650);
  assert.equal(b.horasHe, 2);            // solo el viernes; el jueves 29 ya se pagó
  assert.equal(b.total, 2 * 650 / 8);
  assert.equal(r.totales.total, a.total + b.total);
});

test("mezcla a tres vías: lo mío sobre lo del otro", () => {
  const base = { jornaleros: ["a", "b"], dias: { a: { d1: 1 }, b: { d1: 1 } }, he: {}, encargado: "" };
  const local = { jornaleros: ["a", "b", "c"], dias: { a: { d1: 0 }, b: { d1: 1 }, c: { d1: 1 } }, he: { a: { d1: 2 } }, encargado: "David" };
  const nube = { jornaleros: ["a", "b", "d"], dias: { a: { d1: 1 }, b: { d1: 1, d2: 1 }, d: { d1: 1 } }, he: {}, encargado: "" };
  const m = mezclarProyecto(base, local, nube);
  assert.deepEqual(m.jornaleros, ["a", "b", "d", "c"]);
  assert.equal(m.dias.a.d1, 0);
  assert.equal(m.dias.b.d2, 1);
  assert.equal(m.dias.d.d1, 1);
  assert.equal(m.he.a.d1, 2);
  assert.equal(m.encargado, "David");
  const quita = mezclarProyecto(base, { ...base, jornaleros: ["a"], dias: { a: { d1: 1 } } }, nube);
  assert.deepEqual(quita.jornaleros, ["a", "d"]);
  assert.equal(quita.dias.b, undefined);
  assert.ok(cambiosEntre(base, local));
  assert.ok(!cambiosEntre(base, { ...base }));
  assert.deepEqual(ponerCelda({ a: { x: 1 } }, "a", "x", ""), {});
});

test("ficha del jornal", () => {
  assert.equal(formatoDni("0801200714765"), "0801-2007-14765");
  assert.match(validarJornalero({ fullName: "X", dni: "0801", salarioDia: 600 }), /13 dígitos/);
  assert.match(validarJornalero({ fullName: "X", dni: "0801200714765", salarioDia: 0 }), /al día/);
  assert.match(validarJornalero({ id: "2", fullName: "X", dni: "0801-2007-14765", salarioDia: 600 }, [{ id: "1", fullName: "Randy", dni: "0801200714765" }]), /Randy/);
  assert.equal(validarJornalero({ fullName: "X", dni: "0801200714765", salarioDia: 600 }), null);
});

test("proyecto nuevo en el corte: la lista que pasó del corte anterior no se pierde al guardar", () => {
  const base = { jornaleros: ["a", "b"], tarifas: { a: 600 } };
  const local = { ...base, dias: { a: { d1: 1 } } };
  const m = mezclarProyecto(base, local, null);
  assert.deepEqual(m.jornaleros, ["a", "b"]);
  assert.equal(m.dias.a.d1, 1);
  assert.equal(m.tarifas.a, 600);
});
