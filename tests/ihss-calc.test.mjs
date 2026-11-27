import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearPlanillaIHSS, cruzarPlanilla, altasDelMes, filaAltaIHSS, empresaDePlanilla, mesSiguiente, dniConGuiones, fechaLarga } from "../src/ihss-calc.js";

// Una planilla mínima con las posiciones como las da el PDF del IHSS.
const fila = (y, dni, nombre, afil = "") => [{ str: dni, x: 40, y, w: 60, h: 6, pagina: 1 }, ...(afil ? [{ str: afil, x: 115, y, w: 60, h: 6, pagina: 1 }] : []), { str: nombre, x: 197, y, w: 150, h: 6, pagina: 1 }, { str: "30", x: 407, y, w: 8, h: 6, pagina: 1 }, { str: "11,903.13", x: 430, y, w: 30, h: 6, pagina: 1 }];
const items = [
  { str: "101-2025-0275-1", x: 40, y: 500, w: 60, h: 6, pagina: 1 }, { str: "SUBTERRA S A", x: 140, y: 500, w: 60, h: 6, pagina: 1 }, { str: "10 / 2026", x: 750, y: 500, w: 30, h: 6, pagina: 1 },
  { str: "IDENTIDAD", x: 40, y: 450, w: 40, h: 6, pagina: 1 }, { str: "NOMBRE Y APELLIDO", x: 197, y: 450, w: 80, h: 6, pagina: 1 }, { str: "DÍAS", x: 407, y: 450, w: 15, h: 6, pagina: 1 },
  { str: "IVM/SPS", x: 726, y: 450, w: 30, h: 6, pagina: 1 }, { str: "FECHA Y RAZÓN DE CAMBIO", x: 832, y: 450, w: 100, h: 6, pagina: 1 }, { str: "CÓD.", x: 960, y: 450, w: 15, h: 6, pagina: 1 },
  ...fila(440, "0801200011274", "ANA ESTHER VASQUEZ MUNGUIA"),
  ...fila(430, "0801199212144", "BENAVIDES CASTILLO LUIS FERNANDO", "0801199212144"),   // la afiliación repite la identidad
  ...fila(420, "0801196400775", "BENAVIDES GARCIA RICARDO DAVID", "180640314"),
  ...fila(410, "0801200099999", "PEREZ LOPEZ JUAN"),
];

test("lee la planilla: período, patronal, empresa y una fila por persona", () => {
  const pl = parsearPlanillaIHSS(items);
  assert.equal(pl.periodo, "2026-10"); assert.equal(pl.patronal, "101-2025-0275-1");
  assert.equal(empresaDePlanilla(pl), "subterra");
  assert.deepEqual(pl.filas.map(f => f.nombre), ["ANA ESTHER VASQUEZ MUNGUIA", "BENAVIDES CASTILLO LUIS FERNANDO", "BENAVIDES GARCIA RICARDO DAVID", "PEREZ LOPEZ JUAN"]);
  assert.ok(pl.columnas[1].x0 > 750 && pl.columnas[1].x1 < 960);
});

test("cruce: baja atrasada va con el día 1, paso a permanente no es baja, sin ficha se avisa", () => {
  const pl = parsearPlanillaIHSS(items);
  const emps = [
    { id: "a", fullName: "Ana Esther Vasquez Munguia", dni: "0801-2000-11274", company: "subterra", status: "active" },
    { id: "r", fullName: "Ricardo David Benavides García", dni: "0801-1964-00775", company: "subterra", status: "active" },
  ];
  const movs = [
    { tipo: "baja", date: "2026-09-28", fullName: "Luis Fernando Benavides Castillo", dni: "0801-1992-12144", company: "subterra" },   // su ficha ya no existe
    { tipo: "baja", date: "2026-08-01", fullName: "Ricardo David Benavides García", dni: "0801-1964-00775", company: "subterra" },      // pasó a permanente: sigue activo
  ];
  const cr = cruzarPlanilla({ filas: pl.filas, periodo: pl.periodo, empresa: "subterra", emps, movs });
  assert.deepEqual(cr.map(x => x.estado), ["activa", "baja", "activa", "sin_ficha"]);
  assert.equal(cr[1].texto, "BAJA 1 DE OCTUBRE DE 2026"); assert.equal(cr[1].atrasada, true);
  const enMes = cruzarPlanilla({ filas: pl.filas, periodo: pl.periodo, empresa: "subterra", emps, movs: [{ ...movs[0], date: "2026-10-26" }] });
  assert.equal(enMes[1].texto, "BAJA 26 DE OCTUBRE DE 2026");
  const despues = cruzarPlanilla({ filas: pl.filas, periodo: pl.periodo, empresa: "subterra", emps, movs: [{ ...movs[0], date: "2026-11-03" }] });
  assert.equal(despues[1].estado, "baja_despues");
});

test("altas del mes en curso y la fila del Word", () => {
  assert.equal(mesSiguiente("2026-10"), "2026-11"); assert.equal(mesSiguiente("2026-12"), "2027-01");
  const emps = [
    { id: "1", fullName: "Josue Lopez Flores", dni: "0712199100171", company: "subterra", position: "Operador Planta de Inyeccion", salary: 16000, startDate: "2026-11-02", contractType: "temporary" },
    { id: "2", fullName: "Otro De Geotecnica", dni: "0801199000001", company: "geotecnica", salary: 1, startDate: "2026-11-05" },
    { id: "3", fullName: "Consultor Externo", dni: "0801199000002", company: "subterra", salary: 1, startDate: "2026-11-05", contractType: "honorarios" },
  ];
  const movs = [{ tipo: "alta", date: "2026-11-02", employeeId: "1", dni: "0712199100171", company: "subterra", contractType: "temporary", motivo: "Contratacion nueva" },
    { tipo: "alta", date: "2026-11-01", employeeId: "9", fullName: "Ya Estaba", dni: "0801199000003", company: "subterra", contractType: "permanent", motivo: "Conversion temporal a permanente" }];
  const a = altasDelMes({ mes: "2026-11", empresa: "subterra", emps, movs });
  assert.equal(a.length, 1);
  assert.deepEqual(filaAltaIHSS(a[0]), ["0712-1991-00171", "JOSUE LOPEZ FLORES", "OPERADOR PLANTA DE INYECCION", "L. 16,000.00", "INGRESO EL 2 DE NOVIEMBRE DE 2026"]);
  assert.equal(dniConGuiones("0801-2008-21812"), "0801-2008-21812"); assert.equal(fechaLarga("2026-09-26"), "26 DE SEPTIEMBRE DE 2026");
});
