import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diasEntre, sumarMeses, rendimientoCombustible, estadoPreventivo, proximoKmSugerido,
  vencimiento, alertasVehiculo, listaMotoristas, urgenciaDespacho, ultimosMeses, entregasPorMes, parsePendientes,
} from "../src/logistica-calc.js";

test("diasEntre y sumarMeses con fechas puras", () => {
  assert.equal(diasEntre("2026-11-17", "2026-11-20"), 3);
  assert.equal(diasEntre("2026-11-17", "2026-11-10"), -7);
  assert.equal(sumarMeses("2026-11-30", 3), "2027-02-28");
  assert.equal(sumarMeses("2026-01-15", 6), "2026-07-15");
});

test("rendimiento por tanque lleno: las parciales suman galones y lo de antes del primer lleno no cuenta", () => {
  const r = rendimientoCombustible([
    { km: 9000, galones: 5, monto: 500, lleno: false },     // antes del primer lleno: no se mide
    { km: 10000, galones: 12, monto: 1200, lleno: true },   // base
    { km: 10150, galones: 4, monto: 400, lleno: false },    // parcial
    { km: 10300, galones: 6, monto: 600, lleno: true },     // 300 km con 10 gal = 30 km/gal
    { km: 10700, galones: 20, monto: 2000, lleno: true },   // 400 km con 20 gal = 20 km/gal
  ]);
  assert.equal(r.tramos.length, 2);
  assert.equal(r.tramos[0].kmPorGal, 30);
  assert.equal(r.tramos[1].kmPorGal, 20);
  assert.equal(r.km, 700);
  assert.equal(r.galones, 30);
  assert.ok(Math.abs(r.kmPorGal - 700 / 30) < 1e-9);
  assert.ok(Math.abs(r.costoKm - 3000 / 700) < 1e-9);
});

test("rendimiento sin dos llenos no se puede calcular", () => {
  const r = rendimientoCombustible([{ km: 100, galones: 10, monto: 1000, lleno: true }]);
  assert.equal(r.kmPorGal, null);
  assert.equal(r.tramos.length, 0);
});

test("preventivo: vencido, pronto, ok y sin plan", () => {
  const hoy = "2026-11-17";
  assert.equal(estadoPreventivo({ kmActual: 183516, proxMantenimientoKm: 180208 }, hoy).urgencia, "vencido");
  assert.equal(estadoPreventivo({ kmActual: 99000, proxMantenimientoKm: 99500 }, hoy).urgencia, "pronto");
  assert.equal(estadoPreventivo({ kmActual: 90000, proxMantenimientoKm: 95000 }, hoy).urgencia, "ok");
  assert.equal(estadoPreventivo({ kmActual: 90000, proxMantenimientoKm: 95000, proxMantenimientoFecha: "2026-11-10" }, hoy).urgencia, "vencido");
  assert.equal(estadoPreventivo({ kmActual: 0 }, hoy).urgencia, "sin_plan");
  assert.equal(proximoKmSugerido({ mantIntervaloKm: 10000 }, 50000), 60000);
  assert.equal(proximoKmSugerido({}, 50000), 55000);
});

test("vencimientos y alertas del vehículo", () => {
  const hoy = "2026-11-17";
  assert.equal(vencimiento("2026-11-01", hoy).nivel, "vencido");
  assert.equal(vencimiento("2026-12-01", hoy).nivel, "pronto");
  assert.equal(vencimiento("2027-06-01", hoy).nivel, "ok");
  const a = alertasVehiculo({ kmActual: 183516, proxMantenimientoKm: 180208, seguroVence: "2026-11-01", pendientesReparacion: "• Frenos\n\n• Llanta" }, hoy);
  assert.deepEqual(a.map(x => x.tipo), ["mant", "doc", "pend"]);
  assert.equal(a[2].txt, "2 pendientes de reparación");
  assert.equal(parsePendientes("1) Frenos\n- Llanta")[0].clean, "Frenos");
});

test("motoristas: por cargo + agregados, sin inactivos ni quitados", () => {
  const emps = [
    { id: "a", fullName: "Dennis", position: "Motorista", status: "active" },
    { id: "b", fullName: "Ana", position: "Asistente", status: "active" },
    { id: "c", fullName: "Carlos", position: "Operador", status: "active" },
    { id: "d", fullName: "Elvin", position: "Motorista", status: "inactive" },
    { id: "e", fullName: "Junior", position: "Motorista", status: "active" },
  ];
  const l = listaMotoristas(emps, [{ empId: "c", agregado: true }, { empId: "e", quitado: true }]);
  assert.deepEqual(l.map(x => x.emp.id), ["c", "a"]);
});

test("urgencia de despacho y meses", () => {
  const hoy = "2026-11-17";
  assert.equal(urgenciaDespacho({ fechaNecesaria: "2026-11-12" }, hoy).txt, "Atrasado 5 d");
  assert.equal(urgenciaDespacho({ fechaNecesaria: "2026-11-17" }, hoy).nivel, "hoy");
  assert.equal(urgenciaDespacho({ fechaNecesaria: "2026-11-18" }, hoy).nivel, "manana");
  assert.equal(urgenciaDespacho({}, hoy), null);
  assert.deepEqual(ultimosMeses("2026-02-10", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(entregasPorMes([{ estado: "entregado", fechaEjecutada: "2026-11-02" }, { estado: "cerrado", fechaEjecutada: "2026-11-05" }, { estado: "pendiente", fechaEjecutada: "2026-11-05" }]), { "2026-11": 2 });
});
