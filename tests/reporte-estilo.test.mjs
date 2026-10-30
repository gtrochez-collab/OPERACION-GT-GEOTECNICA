import { test } from "node:test";
import assert from "node:assert/strict";
import { cortesDePagina } from "../src/reporte-estilo.js";

test("cortesDePagina: una sección que cabe en una hoja pasa entera a la siguiente", () => {
  const p = cortesDePagina({ alto: 1300, altoHoja: 700, candidatos: [150, 220, 246, 754, 776, 1284], bloques: [{ ini: 246, fin: 754 }, { ini: 776, fin: 1284 }] });
  assert.deepEqual(p.map(x => [x.ini, x.fin]), [[0, 246], [246, 776], [776, 1300]]);
});

test("cortesDePagina: una tabla más larga que la hoja se corta entre filas y repite el encabezado", () => {
  const filas = Array.from({ length: 60 }, (_, i) => 100 + i * 20); // filas de 20 px desde y=100
  const p = cortesDePagina({ alto: 1300, altoHoja: 500, candidatos: filas, bloques: [{ ini: 70, fin: 1300 }], tablas: [{ ini: 100, fin: 1300, cab: 30, y: 70 }] });
  assert.equal(p[0].tabla, null);
  assert.equal(p[0].fin, 500);
  assert.ok(p[1].tabla, "la segunda hoja lleva el encabezado");
  assert.ok(p[1].fin - p[1].ini <= 470, "y deja lugar para él");
  assert.equal(p.at(-1).fin, 1300);
  p.slice(0, -1).forEach(x => assert.ok(filas.includes(x.fin), "nunca a media fila"));
});

test("cortesDePagina: respeta los saltos forzados", () => {
  const p = cortesDePagina({ alto: 900, altoHoja: 700, candidatos: [300, 600], saltos: [300] });
  assert.equal(p[0].fin, 300);
});
