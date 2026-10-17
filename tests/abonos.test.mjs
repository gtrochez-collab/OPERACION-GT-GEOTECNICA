import { test } from "node:test";
import assert from "node:assert/strict";
import {
  abonosVigentes, tieneAbonos, totalAbonado, saldoDe, pagoCompletoPorAbonos,
  esAbonoParcial, porPagarDe, validarAbono, estadoTrasAbonos, unirAbonos,
  nubeTraeAbonosNuevos, cierreServicioAlPagar,
} from "../src/abonos.js";

const AHORA = "2026-10-17T15:00:00.000Z";
const comp = (id) => ({ fileId: id, name: `${id}.pdf`, type: "application/pdf", size: 1000 });
const abono = (id, monto, fecha, extra = {}) => ({ id, monto, fecha, metodo: "Transferencia BAC", comprobante: comp(id), registradoAt: `${fecha}T12:00:00.000Z`, ...extra });
// El caso real: MAT-2026-0416 de ECOMETAL, L 851,733.68 con dos abonos de 500 mil en total.
const ecometal = (abonos = [], extra = {}) => ({ id: "p1", codigo: "MAT-2026-0416", amount: 851733.68, status: "validado", treasuryStatus: "recibida", abonos, ...extra });

test("sin abonos: todo se debe y nada cambia de significado", () => {
  const p = ecometal();
  assert.equal(tieneAbonos(p), false);
  assert.equal(totalAbonado(p), 0);
  assert.equal(porPagarDe(p), 851733.68);
  assert.equal(esAbonoParcial(p), false);
  assert.equal(pagoCompletoPorAbonos(p), false);
});

test("dos abonos de 250 mil: abonado 500 mil, faltan 351,733.68", () => {
  const p = ecometal([abono("a2", 250000, "2026-09-30"), abono("a1", 250000, "2026-09-20")]);
  assert.equal(totalAbonado(p), 500000);
  assert.equal(saldoDe(p), 351733.68);
  assert.equal(porPagarDe(p), 351733.68);
  assert.equal(esAbonoParcial(p), true);
  assert.deepEqual(abonosVigentes(p).map((a) => a.id), ["a1", "a2"], "ordenados por fecha");
});

test("un abono anulado no cuenta", () => {
  const p = ecometal([abono("a1", 500000, "2026-09-20"), abono("a2", 100000, "2026-09-25", { anulado: true })]);
  assert.equal(totalAbonado(p), 500000);
  assert.equal(abonosVigentes(p).length, 1);
});

test("validar: monto, fecha y comprobante obligatorios; no pasarse de lo que falta", () => {
  const p = ecometal([abono("a1", 500000, "2026-09-20")]);
  assert.match(validarAbono(p, { monto: 0, fecha: "2026-10-17", comprobante: comp("x") }), /cuánto/);
  assert.match(validarAbono(p, { monto: 10, fecha: "", comprobante: comp("x") }), /fecha/);
  assert.match(validarAbono(p, { monto: 10, fecha: "2026-10-17", comprobante: null }), /comprobante/);
  assert.match(validarAbono(p, { monto: 400000, fecha: "2026-10-17", comprobante: comp("x") }), /mayor a lo que falta/);
  assert.equal(validarAbono(p, { monto: 351733.68, fecha: "2026-10-17", comprobante: comp("x") }), null);
  // Tolerancia de L 1 por redondeo de la transferencia
  assert.equal(validarAbono(p, { monto: 351734.5, fecha: "2026-10-17", comprobante: comp("x") }), null);
});

test("parcial: queda en Tesorería sin datos de pago (aunque antes figurara pagada)", () => {
  const antes = ecometal([abono("a1", 500000, "2026-09-20")], { status: "finalizado", treasuryStatus: "pagada", paidAt: "2026-09-20T00:00:00.000Z", paymentDate: "2026-09-20", paymentMethod: "Transferencia BAC", receiptFile: comp("viejo"), finalizedAt: "2026-09-20T18:00:00.000Z" });
  const { rec, completo } = estadoTrasAbonos(antes, AHORA);
  assert.equal(completo, false);
  assert.equal(rec.status, "validado");
  assert.equal(rec.treasuryStatus, "recibida");
  assert.equal(rec.paidAt, null);
  assert.equal(rec.paymentDate, "");
  assert.equal(rec.receiptFile, null);
  assert.equal(rec.finalizedAt, null);
  assert.equal(rec.abonos.length, 1, "los abonos se conservan");
});

test("completo: finaliza con fecha, método y comprobante del último abono", () => {
  const p = ecometal([abono("a1", 500000, "2026-09-20"), abono("a3", 351733.68, "2026-10-17", { metodo: "Cheque" })]);
  const { rec, completo, recienCompletada } = estadoTrasAbonos(p, AHORA);
  assert.equal(completo, true);
  assert.equal(recienCompletada, true);
  assert.equal(rec.status, "finalizado");
  assert.equal(rec.treasuryStatus, "pagada");
  assert.equal(rec.paymentDate, "2026-10-17");
  assert.equal(rec.paidAt, "2026-10-17T00:00:00.000Z");
  assert.equal(rec.paymentMethod, "Cheque");
  assert.equal(rec.receiptFile.fileId, "a3");
  assert.equal(rec.finalizedAt, AHORA);
  assert.equal(rec.deliveryStatus, "pendiente_entrega");
});

test("completo con un servicio de proveedor: se cierra sin ficha, como el pago normal", () => {
  const p = ecometal([abono("a1", 851733.68, "2026-10-17")], { tipoCompra: "servicio" });
  const { rec, esServicio } = estadoTrasAbonos(p, AHORA);
  assert.equal(esServicio, true);
  assert.equal(rec.deliveryStatus, "cerrado");
  assert.equal(rec.delivery.cerradaSinFicha, true);
  // Si la entrega ya avanzó, no se toca
  const enCurso = cierreServicioAlPagar({ tipoCompra: "servicio", deliveryStatus: "entrega_proveedor", delivery: { x: 1 } }, AHORA);
  assert.equal(enCurso.esServicio, false);
  assert.equal(enCurso.deliveryStatus, "entrega_proveedor");
});

test("anular el último abono de una completada la regresa a Tesorería", () => {
  const p = ecometal([abono("a1", 500000, "2026-09-20"), abono("a3", 351733.68, "2026-10-17", { anulado: true })], { status: "finalizado", treasuryStatus: "pagada", finalizedAt: "2026-10-17T15:00:00.000Z" });
  const { rec, completo } = estadoTrasAbonos(p, AHORA);
  assert.equal(completo, false);
  assert.equal(rec.status, "validado");
  assert.equal(saldoDe(rec), 351733.68);
});

test("unir abonos: no se pierde el de la otra pantalla y la anulación es pegajosa", () => {
  const locales = [abono("a1", 250000, "2026-09-20"), abono("a3", 100000, "2026-10-17")];
  const nube = [abono("a1", 250000, "2026-09-20", { anulado: true, anuladoPor: "Lic. Carolina" }), abono("a2", 250000, "2026-09-30")];
  const u = unirAbonos(locales, nube);
  assert.deepEqual(u.map((a) => a.id), ["a1", "a2", "a3"]);
  assert.equal(u.find((a) => a.id === "a1").anulado, true);
  assert.equal(u.find((a) => a.id === "a1").anuladoPor, "Lic. Carolina");
  assert.equal(nubeTraeAbonosNuevos({ abonos: locales }, { abonos: nube }), true);
  assert.equal(nubeTraeAbonosNuevos({ abonos: u }, { abonos: nube }), false);
  assert.equal(nubeTraeAbonosNuevos({}, {}), false);
});
