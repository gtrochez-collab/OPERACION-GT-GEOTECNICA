import test from "node:test";
import assert from "node:assert/strict";
import { coberturaMaterial, coberturaProyecto, programacionVigente, siguienteNumero, ponerCantidad, totalSemana, semanasDe, lunesDe, itemDeMaterial } from "../src/suministro-calc.js";
import { aplicarMovimiento, ultimoDiaConteo, conteoAlDia, permisosDe } from "../src/geoinventory-calc.js";

// La programación de Aurea No. 1 (Excel de Neftalí): cemento por día.
const cemento = { "2026-11-23": 200, "2026-11-24": 150, "2026-11-25": 200, "2026-11-26": 200, "2026-11-27": 200, "2026-11-30": 200, "2026-12-01": 200, "2026-12-02": 139 };

test("cobertura: 480 bolsas el martes 24 alcanzan hasta el miércoles (2 días) → rojo", () => {
  const c = coberturaMaterial({ stock: 480, porDia: cemento, hoy: "2026-11-24" });
  // 150 (mar) + 200 (mié) = 350 ≤ 480; + 200 (jue) = 550 > 480 → falta el jueves 26
  assert.equal(c.faltaDesde, "2026-11-26");
  assert.equal(c.alcanzaDias, 2);
  assert.equal(c.semaforo, "rojo");
  // próximos 7 días (24 al 30): 150+200+200+200+200 = 950 → faltan 470 para la semana
  assert.equal(c.programado7, 950);
  assert.equal(c.faltanParaMeta, 470);
});

test("cobertura: con 900 bolsas llega al lunes 30 (6 días) → ámbar; con toda la programación → verde", () => {
  assert.equal(coberturaMaterial({ stock: 900, porDia: cemento, hoy: "2026-11-24" }).semaforo, "ambar");
  const todo = coberturaMaterial({ stock: 1500, porDia: cemento, hoy: "2026-11-24" });
  assert.equal(todo.cubreTodo, true);
  assert.equal(todo.semaforo, "verde");
});

test("cobertura: hoy mismo no alcanza = 0 días; sin programación pendiente = sin_programa", () => {
  assert.equal(coberturaMaterial({ stock: 100, porDia: cemento, hoy: "2026-11-24" }).alcanzaDias, 0);
  assert.equal(coberturaMaterial({ stock: 100, porDia: cemento, hoy: "2026-12-10" }).semaforo, "sin_programa");
});

test("programación: vigente = número más alto no anulado; siguiente número; totales por semana", () => {
  const progs = [{ id: "a", projectCode: "AUREA", numero: 1 }, { id: "b", projectCode: "AUREA", numero: 2, anulada: true }, { id: "c", projectCode: "VSM", numero: 1 }];
  assert.equal(programacionVigente(progs, "AUREA").id, "a");
  assert.equal(siguienteNumero(progs, "AUREA"), 3);
  let dias = {};
  dias = ponerCantidad(dias, "2026-11-23", "cem", 200);
  dias = ponerCantidad(dias, "2026-11-24", "cem", 150);
  dias = ponerCantidad(dias, "2026-11-24", "cem", "");
  assert.deepEqual(dias, { "2026-11-23": { cem: 200 } });
  assert.equal(totalSemana({ dias: { ...dias, "2026-11-25": { cem: 8 } } }, "2026-11-23", "cem"), 208);
  assert.deepEqual(semanasDe({ semanas: ["2026-11-30"], dias }), ["2026-11-23", "2026-11-30"]);
  assert.equal(lunesDe("2026-11-27"), "2026-11-23");
});

test("cobertura del proyecto: une programación + inventario, empareja por nombre y ordena por urgencia", () => {
  const items = [
    { id: "i1", tipo: "cantidad", nombre: "Cemento GU", unidad: "Bolsa", stock: { "proy:VSM": 480 }, conteos: { "proy:VSM": { at: "2026-11-24T22:00:00Z" } } },
    { id: "i2", tipo: "cantidad", nombre: "Aditivo", unidad: "Galón", stock: { "proy:VSM": 5 } },
  ];
  const prog = { materiales: [{ id: "cem", nombre: "cemento gu", unidad: "Bolsa" }, { id: "are", nombre: "Arena", unidad: "m3" }], dias: { "2026-11-24": { cem: 150, are: 16 }, "2026-11-25": { cem: 200 } } };
  assert.equal(itemDeMaterial(items, prog.materiales[0]).id, "i1");
  const r = coberturaProyecto({ short: "VSM", prog, items, hoy: "2026-11-24" });
  assert.deepEqual(r.filas.map(f => [f.nombre, f.semaforo]), [["Arena", "rojo"], ["cemento gu", "ambar"], ["Aditivo", "sin_programa"]]);
  assert.equal(r.peor, "rojo");
  assert.equal(r.ultimoConteo, "2026-11-24T22:00:00Z");
});

test("conteo: registra aunque sea la misma cantidad y guarda la fecha del último conteo", () => {
  const it = { id: "i1", tipo: "cantidad", nombre: "Cemento", stock: { "proy:VSM": 480 } };
  const r = aplicarMovimiento(it, { accion: "conteo", en: "proy:VSM", nuevo: 300 }, { by: "allan.oyuela", byName: "Allan", at: "2026-11-24T22:00:00Z", id: "m1" });
  assert.equal(r.item.stock["proy:VSM"], 300);
  assert.equal(r.mov.cantidad, -180);
  assert.equal(r.item.conteos["proy:VSM"].by, "allan.oyuela");
  const igual = aplicarMovimiento(r.item, { accion: "conteo", en: "proy:VSM", nuevo: 300 }, { at: "2026-11-25T22:00:00Z" });
  assert.ok(!igual.error);
  assert.equal(igual.item.conteos["proy:VSM"].at, "2026-11-25T22:00:00Z");
  assert.ok(aplicarMovimiento(it, { accion: "conteo", en: "proy:VSM", nuevo: "" }).error);
});

test("conteo obligatorio: lunes y jueves", () => {
  assert.equal(ultimoDiaConteo("2026-11-24"), "2026-11-23");   // martes → lunes
  assert.equal(ultimoDiaConteo("2026-11-26"), "2026-11-26");   // jueves
  assert.equal(ultimoDiaConteo("2026-11-29"), "2026-11-26");   // domingo → jueves
  assert.equal(conteoAlDia("2026-11-23", "2026-11-25"), true);
  assert.equal(conteoAlDia("2026-11-23", "2026-11-27"), false);
});

test("permisos: el residente solo lo suyo y sin ajustar; planificación en todos los proyectos", () => {
  const r = permisosDe("residente");
  assert.equal(r.alcance, "propias"); assert.equal(r.soloLoSuyo, true); assert.equal(r.ajustar, false); assert.equal(r.contar, true);
  assert.equal(permisosDe("planificacion").alcance, "proyectos");
  assert.equal(permisosDe("costos").contar, false);
});
