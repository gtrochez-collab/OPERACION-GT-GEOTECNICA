import test from "node:test";
import assert from "node:assert/strict";
import { ubicacionDeMarcaje, ubicacionesDeTablet, nombreUbicacion, sedeDeJornal, jornalesDeTablet } from "../src/geoclock-calc.js";

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

test("jornales: el plantel (PLAN-TALLER) marca en la tablet del plantel", () => {
  assert.equal(sedeDeJornal(tabletOscar, "PLAN-TALLER"), "PLANTEL");
  assert.equal(sedeDeJornal(tabletAdmin, "PLAN-TALLER"), "PLANTEL");
  assert.equal(sedeDeJornal(tabletAdmin, "PLANTEL-OFICINA"), "PLANTEL");
  assert.equal(sedeDeJornal(tabletOscar, "TORRE ADOBE"), "");
  assert.equal(sedeDeJornal({ ubicacion: "TORRE ADOBE" }, "TORRE ADOBE"), "TORRE ADOBE");
  assert.equal(sedeDeJornal(tabletOscar, ""), "");
});

test("jornales de la tablet: activos de un proyecto que ella cubre; sin ubicaciones, todos", () => {
  const js = [
    { id: "a", fullName: "A", proyecto: "PLAN-TALLER", status: "active" },
    { id: "b", fullName: "B", proyecto: "PLAN-TALLER", status: "inactive" },
    { id: "c", fullName: "C", proyecto: "CATALEYA- RETENCIONES MIXTAS", status: "active" },
  ];
  assert.deepEqual(jornalesDeTablet(tabletOscar, js).map(j => j.id), ["a"]);
  assert.deepEqual(jornalesDeTablet({}, js).map(j => j.id), ["a", "c"]);
});
