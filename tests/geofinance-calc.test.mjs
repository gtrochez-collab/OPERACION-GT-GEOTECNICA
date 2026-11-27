import { test } from "node:test";
import assert from "node:assert/strict";
import {
  semanaSugerida, cierreDeSemana, fueraDeCorte, lunesDe, textoSemana, totalesCaja, siguienteFolio,
  validarSolicitud, validarGasto, opcionesSemana, totalItems, puedeAprobar, puedeRegistrarGasto, puedeEditarGasto, puedeCerrar, pendientesFinance, permisosFinance,
} from "../src/geofinance-calc.js";

test("semana y corte: se pide a más tardar el jueves para el lunes siguiente", () => {
  assert.equal(lunesDe("2026-11-27"), "2026-11-23");            // viernes 27 → lunes 23
  assert.equal(semanaSugerida("2026-11-27"), "2026-12-07");      // arranque: la primera semana es la del 7 dic
  assert.equal(semanaSugerida("2026-12-03"), "2026-12-07");      // jueves 3 → lunes 7
  assert.equal(semanaSugerida("2026-12-10"), "2026-12-14");
  assert.deepEqual(opcionesSemana("2026-11-27"), ["2026-12-07"]);
  assert.deepEqual(opcionesSemana("2026-12-03"), ["2026-12-07", "2026-12-14"]);
  assert.equal(cierreDeSemana("2026-11-30"), "2026-11-26");
  assert.equal(fueraDeCorte("2026-11-30", "2026-11-26"), false); // el jueves todavía entra
  assert.equal(fueraDeCorte("2026-11-30", "2026-11-27"), true);  // el viernes ya no
  assert.equal(textoSemana("2026-11-30"), "Semana del 30 nov al 5 dic");
});

test("totales: se mide contra lo acreditado, si no lo aprobado, si no lo pedido", () => {
  const c = { monto: 5000, gastos: [{ monto: 1200.5 }, { monto: 800, validacion: { estado: "validada" } }, { monto: 999, anulado: true }, { monto: 300, validacion: { estado: "observada" } }] };
  let t = totalesCaja(c);
  assert.equal(t.gastado, 2300.5); assert.equal(t.base, 5000); assert.equal(t.queda, 2699.5);
  assert.deepEqual([t.nGastos, t.porValidar, t.validados, t.observados], [3, 1, 1, 1]);
  t = totalesCaja({ ...c, aprobacion: { monto: 4000 }, acreditacion: { monto: 2000 } });
  assert.equal(t.base, 2000); assert.equal(t.falta, 300.5); assert.equal(t.sobra, 0);
  t = totalesCaja({ monto: 1000, acreditacion: { monto: 1000 }, gastos: [{ monto: 999.5 }] });
  assert.equal(t.sobra, 0); assert.equal(t.falta, 0);            // L 0.50 no es sobrante
});

test("folio correlativo por año", () => {
  assert.equal(siguienteFolio([], 2026), "CJ-2026-0001");
  assert.equal(siguienteFolio([{ folio: "CJ-2026-0007" }, { folio: "CJ-2025-0090" }], 2026), "CJ-2026-0008");
});

test("solicitud: campos y sin duplicar la misma caja de la semana", () => {
  const f = { tipo: "combustible", projectCode: "PLAN-TALLER", semana: "2026-11-30", items: [{ equipoNombre: "HDA5248 · MACK", monto: 4000 }, { equipoNombre: "BG20H", monto: 2000 }] };
  assert.deepEqual(validarSolicitud(f, [], "oscarpaz"), []);
  assert.equal(totalItems(f.items), 6000);
  assert.equal(validarSolicitud({ ...f, items: [] }, [], "oscarpaz").length, 1);                                    // no se pide "en bulto"
  assert.equal(validarSolicitud({ ...f, items: [...f.items, { equipoNombre: "BG11A", monto: 0 }] }, [], "oscarpaz").length, 1);
  assert.equal(validarSolicitud({ ...f, tipo: "varias", items: [{ rubro: "Otro", monto: 500 }] }, [], "oscarpaz").length, 1);
  assert.deepEqual(validarSolicitud({ ...f, tipo: "varias", items: [{ rubro: "Otro", monto: 500, nota: "Candados" }, { rubro: "", monto: "" }] }, [], "oscarpaz"), []);
  const ya = [{ id: "a", estado: "aprobada", tipo: "combustible", projectCode: "PLAN-TALLER", semana: "2026-11-30", solicitante: { username: "oscarpaz" } }];
  assert.equal(validarSolicitud(f, ya, "oscarpaz").length, 1);
  assert.deepEqual(validarSolicitud({ ...f, tipo: "varias" }, ya, "oscarpaz"), []);   // la de varias es OTRA caja
  assert.deepEqual(validarSolicitud(f, [{ ...ya[0], estado: "rechazada" }], "oscarpaz"), []);
});

test("gasto: la factura es obligatoria", () => {
  const g = { fecha: "2026-12-01", proveedor: "Ferretería", descripcion: "Brocas", monto: 350, factura: { fileId: "x" } };
  assert.deepEqual(validarGasto(g), []);
  assert.equal(validarGasto({ ...g, factura: null }).length, 1);
});

test("aprobar: solo Christian; la de él la aprueba el administrador", () => {
  const c = { estado: "solicitada", solicitante: { username: "allan", rol: "residente" } };
  assert.equal(puedeAprobar("costos", "christian", c), true);
  assert.equal(puedeAprobar("admin", "raul.flores", c), false);
  assert.equal(puedeAprobar("admin", "administrador", c), true);   // Gerson puede hacer todos los pasos para probar
  assert.deepEqual([permisosFinance("admin", "administrador").acredita, permisosFinance("admin", "administrador").valida, permisosFinance("admin", "raul.flores").acredita], [true, true, false]);
  assert.equal(puedeAprobar("tesoreria", "carolina", c), false);
  const suya = { estado: "solicitada", solicitante: { username: "christian", rol: "costos" } };
  assert.equal(puedeAprobar("costos", "christian", suya), false);
  assert.equal(puedeAprobar("admin", "administrador", suya), true);
  assert.equal(puedeAprobar("costos", "christian", { ...c, estado: "aprobada" }), false);
});

test("la cajita se abre desde que se pide; lo validado ya no se toca; se cierra con todo validado", () => {
  assert.equal(puedeRegistrarGasto({ estado: "solicitada" }), true);
  assert.equal(puedeRegistrarGasto({ estado: "liquidada" }), false);
  const obs = { validacion: { estado: "observada" } }, val = { validacion: { estado: "validada" } };
  assert.equal(puedeEditarGasto({ estado: "liquidada" }, obs), true);    // lo observado se corrige aun liquidada
  assert.equal(puedeEditarGasto({ estado: "liquidada" }, {}), false);
  assert.equal(puedeEditarGasto({ estado: "acreditada" }, val), false);
  assert.equal(puedeCerrar({ estado: "liquidada", gastos: [val, obs] }), false);
  assert.equal(puedeCerrar({ estado: "liquidada", gastos: [val] }), true);
  assert.equal(puedeCerrar({ estado: "acreditada", gastos: [val] }), false);
});

test("pendientes por rol y permisos", () => {
  const cajas = [
    { estado: "solicitada", solicitante: { username: "allan", rol: "residente" } },
    { estado: "aprobada", solicitante: { username: "allan" }, gastos: [{ monto: 1 }, { monto: 2, validacion: { estado: "observada" } }] },
    { estado: "liquidada", solicitante: { username: "oscarpaz" }, gastos: [{ monto: 1, validacion: { estado: "validada" } }] },
  ];
  assert.equal(pendientesFinance({ cajas, rol: "costos", username: "christian" }).total, 1);
  assert.equal(pendientesFinance({ cajas, rol: "tesoreria", username: "carolina" }).total, 1);
  const conta = pendientesFinance({ cajas, rol: "contabilidad", username: "liliana" });
  assert.deepEqual([conta.facturas, conta.cerrar], [1, 1]);
  assert.equal(pendientesFinance({ cajas, rol: "residente", username: "allan" }).observados, 1);
  assert.equal(permisosFinance("gerencia").veTodo, false);
  assert.equal(permisosFinance("contabilidad").pide, false);
});
