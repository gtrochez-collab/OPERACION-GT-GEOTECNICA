// Contratistas de servicios (El Salvador): calcado de la "Estimación de Pago
// Contratistas de Servicios · Batch Q02 OCT.26" ($2,115.19).
import { test } from "node:test";
import assert from "node:assert/strict";
import { liquidarContrato, estimacionQuincena, diasQuincena, mezclarAsistencia, ponerDia, ponerHoras, validarContratista, valorHoraDe } from "../src/contratistas-calc.js";

const dias = (n, desde = 16) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`2026-10-${String(desde + i).padStart(2, "0")}`, 1]));
const horas = (n) => ({ "2026-10-20": n });

const domingo = { id: "dom", nombre: "DOMINGO CRUZ DÍAZ", contratos: [{ id: "c2", codigo: "SVSERV26-002", servicio: "Servicio de transporte", modo: "dia", tarifa: 25, valorHora: 3.125 }] };
const martinez = { id: "mar", nombre: "CARLOS ERNESTO MARTINEZ VÁSQUEZ", contratos: [{ id: "c4", codigo: "SVSERV26-004", servicio: "Perforación a rotación con SPT", modo: "unidad", unidad: "metro", tarifa: 950 / 57 }] };
const dolores = { id: "dol", nombre: "DOLORES BALBINO CRUZ", contratos: [{ id: "c6", codigo: "SVSERV26-006", servicio: "Asistencia vial", modo: "dia", tarifa: 22, valorHora: 2.75 }] };
const perez = { id: "per", nombre: "CARLOS ENRIQUE PÉREZ", contratos: [
  { id: "c7", codigo: "SVSERV26-007", servicio: "Vigilancia nocturna", modo: "dia", tarifa: 27.77775, valorHora: 3.47221875 },
  { id: "c10", codigo: "SVSERV26-010", servicio: "Asistencia vial", modo: "dia", tarifa: 22, valorHora: 2.75 },
] };
const asis = { registros: {
  c2: { dias: dias(16), he: horas(11) },
  c4: { unidades: 57 },
  c6: { dias: dias(10), he: horas(11) },
  c7: { dias: dias(12) },
  c10: { dias: dias(16), he: horas(11) },
} };

test("quincena: 16 al 31 de octubre", () => {
  assert.equal(diasQuincena("2026-10", "2Q").length, 16);
  assert.equal(diasQuincena("2026-02", "2Q").length, 13);
  assert.equal(diasQuincena("2026-10", "1Q")[14], "2026-10-15");
});

test("hora extra = tarifa ÷ 8 si no trae valor", () => {
  assert.equal(valorHoraDe({ tarifa: 22 }), 2.75);
  assert.equal(valorHoraDe({ tarifa: 22, valorHora: 3 }), 3);
});

test("cada contrato igual a la estimación", () => {
  const casos = [
    [domingo.contratos[0], asis.registros.c2, 434.38, 43.44, 390.94],
    [martinez.contratos[0], asis.registros.c4, 950.00, 95.00, 855.00],
    [dolores.contratos[0], asis.registros.c6, 250.25, 25.03, 225.23],
    [perez.contratos[0], asis.registros.c7, 333.33, 33.33, 300.00],
    [perez.contratos[1], asis.registros.c10, 382.25, 38.23, 344.03],
  ];
  for (const [c, r, suma, ret, liq] of casos) {
    const l = liquidarContrato(c, r);
    assert.equal(l.suma, suma, c.codigo);
    assert.equal(l.retencion, ret, c.codigo);
    assert.equal(l.liquido, liq, c.codigo);
  }
});

test("total de la estimación: $2,115.19", () => {
  const e = estimacionQuincena([domingo, martinez, dolores, perez], asis);
  assert.equal(e.filas.length, 5);
  assert.equal(e.personas, 4);
  assert.equal(e.liquido, 2115.19);
});

test("sin días ni unidades no sale en la estimación", () => {
  const e = estimacionQuincena([domingo], { registros: {} });
  assert.equal(e.filas.length, 0);
});

test("mezcla a tres vías: dos personas marcan a la vez", () => {
  const base = { registros: {} };
  let yo = ponerDia(base, "c2", "2026-10-16", 1);
  yo = ponerHoras(yo, "c2", "2026-10-16", 2);
  const nube = ponerDia(base, "c6", "2026-10-16", 1);          // otro guardó Dolores
  const m = mezclarAsistencia(base, yo, nube);
  assert.equal(m.registros.c2.dias["2026-10-16"], 1);
  assert.equal(m.registros.c2.he["2026-10-16"], 2);
  assert.equal(m.registros.c6.dias["2026-10-16"], 1);
  // quitar un día que estaba en la base
  const sinDia = ponerDia(m, "c2", "2026-10-16", "");
  const m2 = mezclarAsistencia(m, sinDia, m);
  assert.equal(m2.registros.c2.dias["2026-10-16"], undefined);
});

test("validación", () => {
  assert.match(validarContratista({ nombre: "" }), /nombre/);
  assert.match(validarContratista({ nombre: "X", dui: "123" }), /9 dígitos/);
  assert.match(validarContratista({ nombre: "X", contratos: [{ servicio: "Vigilancia", tarifa: 0 }] }), /tarifa/);
  assert.equal(validarContratista({ nombre: "X", dui: "03938537-2", contratos: [{ servicio: "V", tarifa: 25 }] }), null);
});
