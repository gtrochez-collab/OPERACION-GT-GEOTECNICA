import test from "node:test";
import assert from "node:assert/strict";
import { ubicacionDeMarcaje, ubicacionesDeTablet, nombreUbicacion } from "../src/geoclock-calc.js";

const tabletAdmin = { username: "marcaje", ubicacion: "ADMINISTRACIÓN", ubicaciones: ["ADMINISTRACIÓN", "PLANTEL"] };
const tabletOscar = { username: "oscarpaz", ubicacion: "PLANTEL" };

test("ubicaciones de la tablet: une ubicacion + ubicaciones sin repetir", () => {
  assert.deepEqual(ubicacionesDeTablet(tabletAdmin), ["ADMINISTRACIÓN", "PLANTEL"]);
  assert.deepEqual(ubicacionesDeTablet(tabletOscar), ["PLANTEL"]);
  assert.deepEqual(ubicacionesDeTablet({}), []);
});

test("tablet de una sola ubicación: siempre esa", () => {
  assert.equal(ubicacionDeMarcaje(tabletOscar, { department: "Administracion" }, "ADMINISTRACIÓN - GEOTECNICA"), "PLANTEL");
});

test("tablet de administración cubre plantel: la cuadrilla manda", () => {
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Campo" }, "PLAN-TALLER"), "PLANTEL");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Campo" }, "PLANTEL"), "PLANTEL");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Campo" }, "ADMINISTRACIÓN - GEOTECNICA"), "ADMINISTRACIÓN");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Campo" }, "administracion"), "ADMINISTRACIÓN");
});

test("sin cuadrilla que coincida: administrativos → ADMINISTRACIÓN, el resto → PLANTEL", () => {
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Administracion" }, "VILLA SAN MIGUEL"), "ADMINISTRACIÓN");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Contabilidad" }, ""), "ADMINISTRACIÓN");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "RRHH" }), "ADMINISTRACIÓN");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Mecanica" }, "VILLA SAN MIGUEL"), "PLANTEL");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, { department: "Ingenieria" }, ""), "PLANTEL");
  assert.equal(ubicacionDeMarcaje(tabletAdmin, {}, ""), "PLANTEL");
});

test("nombre corto", () => {
  assert.equal(nombreUbicacion("ADMINISTRACIÓN"), "Administración");
  assert.equal(nombreUbicacion("PLANTEL"), "Plantel");
});
