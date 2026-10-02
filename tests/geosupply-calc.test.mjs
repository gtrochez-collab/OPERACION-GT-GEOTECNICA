// Pruebas de la lógica pura de GeoSupply. Correr con `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  semanaISO, lunesDeSemanaISO, corteDe, etiquetaCorte, llegadaEstimada, hitoDeCorte, estadoHito,
  saldoDePartida, semaforoVariacion, evaluarCotizacion, siguienteFolio, aplicarAccionLinea,
  estadoCabecera, estadoInicialLinea, estadoEfectivoLinea, destinoSugerido, borradorDesdeCotizacion,
  partesHN, puedeCancelar, contarPendientes, configEfectiva, pendienteDeCompra, siguienteCodigoCompra, fueraDeCorte, metricasDashboard,
} from "../src/geosupply-calc.js";

// Honduras es UTC-6 sin horario de verano: 12:00 HN = 18:00Z.
const hn = (ymd, hhmm) => { const [h, m] = hhmm.split(":").map(Number); return new Date(`${ymd}T${String(h + 6).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`).toISOString(); };

test("partesHN convierte a hora de Honduras", () => {
  const p = partesHN(hn("2026-09-29", "11:59"));
  assert.equal(p.ymd, "2026-09-29"); assert.equal(p.hora, "11:59"); assert.equal(p.dow, 2);
  // 10:04 p.m. en Honduras sigue siendo el 22 aunque en UTC ya sea el 23.
  assert.equal(partesHN("2026-09-23T04:04:00Z").ymd, "2026-09-22");
});

test("semana ISO", () => {
  assert.deepEqual(semanaISO("2026-01-01"), { anio: 2026, semana: 1 });     // jueves
  assert.deepEqual(semanaISO("2026-09-28"), { anio: 2026, semana: 40 });    // lunes
  assert.deepEqual(semanaISO("2026-10-04"), { anio: 2026, semana: 40 });    // domingo de la misma
  assert.deepEqual(semanaISO("2026-10-05"), { anio: 2026, semana: 41 });
  assert.deepEqual(semanaISO("2027-01-03"), { anio: 2026, semana: 53 });    // dom 3-ene-2027 → última ISO de 2026
  assert.equal(lunesDeSemanaISO(2026, 40), "2026-09-28");
  assert.equal(lunesDeSemanaISO(2026, 1), "2025-12-29");
});

test("corteDe: antes del martes 12:00 entra a la semana; después, a la siguiente", () => {
  assert.deepEqual(corteDe(hn("2026-09-28", "08:00")), { anio: 2026, semana: 40 });  // lunes
  assert.deepEqual(corteDe(hn("2026-09-29", "11:59")), { anio: 2026, semana: 40 });  // martes 11:59
  assert.deepEqual(corteDe(hn("2026-09-29", "12:00")), { anio: 2026, semana: 41 });  // martes 12:00 en punto ya cerró
  assert.deepEqual(corteDe(hn("2026-09-29", "12:01")), { anio: 2026, semana: 41 });
  assert.deepEqual(corteDe(hn("2026-10-03", "09:00")), { anio: 2026, semana: 41 });  // sábado
  assert.deepEqual(corteDe(hn("2026-09-29", "12:01"), null, { urgente: true }), { anio: 2026, semana: 40 }); // urgente se salta el corte
  // configurable: cierre el miércoles 10:00
  assert.deepEqual(corteDe(hn("2026-09-29", "18:00"), { cortes: { cierreSolicitudes: { dia: 3, hora: "10:00" } } }), { anio: 2026, semana: 40 });
});

test("etiqueta, hitos y llegada estimada del corte", () => {
  const e = etiquetaCorte({ anio: 2026, semana: 40 });
  assert.equal(e.id, "C40-2026"); assert.equal(e.titulo, "Corte 40 · 2026");
  assert.equal(e.lunes, "2026-09-28"); assert.equal(e.viernes, "2026-10-02");
  assert.match(e.sub, /28/); assert.match(e.sub, /2/);
  const h = hitoDeCorte({ anio: 2026, semana: 40 }, "almacenHasta");
  assert.equal(h.ymd, "2026-09-29"); assert.equal(h.hora, "15:00");
  assert.equal(estadoHito(h, hn("2026-09-29", "14:30")).pasado, false);
  assert.equal(estadoHito(h, hn("2026-09-29", "14:30")).faltaMin, 30);
  assert.equal(estadoHito(h, hn("2026-09-29", "15:01")).pasado, true);
  const v = hitoDeCorte({ anio: 2026, semana: 40 }, "aprobacionHasta");
  assert.equal(v.ymd, "2026-10-02"); assert.equal(estadoHito(v, hn("2026-10-01", "12:00")).faltaMin, 1440);
  assert.deepEqual(llegadaEstimada({ anio: 2026, semana: 40 }), { desde: "2026-10-06", hasta: "2026-10-08" });
});

test("saldo en cantidad de la partida", () => {
  const partida = { id: "p1", cantidad: 100 };
  const purchases = [
    { status: "pagado", lineas: [{ partidaId: "p1", cantidad: 30 }] },
    { status: "borrador", lineas: [{ partidaId: "p1", cantidad: 99 }] },                  // borrador manual: NO consume
    { status: "borrador", origenSupply: { quoteId: "q" }, lineas: [{ partidaId: "p1", cantidad: 10 }] }, // de GeoSupply: SÍ
    { status: "validado", lineas: [{ partidaId: "otra", cantidad: 500 }] },
  ];
  const solicitudes = [
    { id: "s1", estado: "enviada", lineas: [{ partidaId: "p1", cantidad: 20, estado: "revision_almacen" }, { partidaId: "p1", cantidad: 5, estado: "rechazada" }] },
    { id: "s2", estado: "en_proceso", lineas: [{ partidaId: "p1", cantidad: 15, estado: "comprada", cantidadComprada: 15 }] }, // ya está en purchases
    { id: "s3", estado: "cancelada", lineas: [{ partidaId: "p1", cantidad: 40 }] },
    { id: "s4", estado: "borrador", lineas: [{ partidaId: "p1", cantidad: 40 }] },
  ];
  const r = saldoDePartida({ partida, purchases, solicitudes });
  assert.equal(r.comprada, 40); assert.equal(r.enSolicitudes, 20); assert.equal(r.saldo, 40);
  assert.equal(saldoDePartida({ partida, purchases, solicitudes, excluirSolicitudId: "s1" }).saldo, 60);
  assert.equal(saldoDePartida({ partida: { id: "x", cantidad: 0 } }).sinCantidad, true);
});

test("semáforo de variación", () => {
  assert.equal(semaforoVariacion(-0.2), "verde");     // más barato: verde
  assert.equal(semaforoVariacion(0.03), "verde");
  assert.equal(semaforoVariacion(0.031), "amarillo");
  assert.equal(semaforoVariacion(0.10), "amarillo");
  assert.equal(semaforoVariacion(0.11), "rojo");
  assert.equal(semaforoVariacion(null), "sin_base");
  assert.equal(semaforoVariacion(0.05, { semaforo: { verde: 0.06, amarillo: 0.2 } }), "verde");
});

const partidas = { p1: { id: "p1", nombre: "Tubo PVC 4\"", unidad: "Lance", cantidad: 100, pu: 10, monto: 1000 }, p2: { id: "p2", nombre: "Cemento", unidad: "Bolsa", cantidad: 50, pu: 8, monto: 400 } };
const lineasSol = {
  L1: { id: "L1", partidaId: "p1", descripcion: "Tubo PVC 4\"", unidad: "Lance", cantidad: 10, estado: "por_cotizar", aCotizar: 10 },
  L2: { id: "L2", partidaId: "p2", descripcion: "Cemento", unidad: "Bolsa", cantidad: 20, estado: "por_cotizar", aCotizar: 20 },
  L3: { id: "L3", partidaId: null, fueraPresupuesto: true, descripcion: "Cinta métrica", unidad: "Und", cantidad: 2, estado: "por_cotizar", aCotizar: 2 },
};
const ev = (cot, tasa = 27) => evaluarCotizacion({ cotizacion: cot, tasa, partidaDe: id => partidas[id], lineaSolicitudDe: id => lineasSol[id] });

test("evaluarCotizacion: cuadra, semáforo por línea y errores", () => {
  // P.U. presupuesto $10 = L 270. Cotizan L 275 (1.9 % → verde) y L 320 el cemento ($8 = L 216 → 48 % rojo).
  const base = { provider: "Ferretería X", pdfFile: { fileId: "f" }, totalDeclarado: 2750 + 6400, lineas: [
    { requestLineId: "L1", cantidad: 10, puLps: 275 },
    { requestLineId: "L2", cantidad: 20, puLps: 320, justificacion: "Único proveedor con stock esta semana" },
  ] };
  const r = ev(base);
  assert.equal(r.cuadra, true); assert.equal(r.ok, true, r.errores.join(" | "));
  assert.equal(r.lineas[0].semaforo, "verde"); assert.equal(r.lineas[1].semaforo, "rojo"); assert.equal(r.peor, "rojo");
  assert.equal(r.todasVerdes, false);
  // rojo sin justificación → bloquea
  const sinJust = ev({ ...base, lineas: [base.lineas[0], { ...base.lineas[1], justificacion: "" }] });
  assert.ok(sinJust.errores.some(e => /rojo/.test(e)));
  // total que no cuadra → bloquea con la ayuda del ISV
  const noCuadra = ev({ ...base, totalDeclarado: 9000 });
  assert.equal(noCuadra.cuadra, false); assert.ok(noCuadra.errores.some(e => /1\.15/.test(e)));
  // tolerancia ±L1
  assert.equal(ev({ ...base, totalDeclarado: 9150.99 }).cuadra, true);
  assert.equal(ev({ ...base, totalDeclarado: 9151.01 }).cuadra, false);
  // sin PDF → bloquea
  assert.ok(ev({ ...base, pdfFile: null }).errores.some(e => /PDF/.test(e)));
  // cotizar menos de lo pendiente exige "parcial"; más, nunca
  assert.ok(ev({ ...base, totalDeclarado: 275 * 4 + 6400, lineas: [{ requestLineId: "L1", cantidad: 4, puLps: 275 }, base.lineas[1]] }).errores.some(e => /parcial/.test(e)));
  assert.equal(ev({ ...base, totalDeclarado: 275 * 4 + 6400, lineas: [{ requestLineId: "L1", cantidad: 4, puLps: 275, parcial: true }, base.lineas[1]] }).ok, true);
  assert.ok(ev({ ...base, lineas: [{ requestLineId: "L1", cantidad: 11, puLps: 275 }, base.lineas[1]] }).errores.some(e => /solo hay 10/.test(e)));
  // fuera de presupuesto: sin base de comparación, no bloquea
  const fp = ev({ provider: "X", pdfFile: { fileId: "f" }, totalDeclarado: 300, lineas: [{ requestLineId: "L3", cantidad: 2, puLps: 150 }] });
  assert.equal(fp.lineas[0].semaforo, "sin_base"); assert.equal(fp.ok, true); assert.equal(fp.todasVerdes, true);
});

test("folios por año", () => {
  assert.equal(siguienteFolio([], "SUP", 2026), "SUP-2026-0001");
  assert.equal(siguienteFolio([{ folio: "SUP-2026-0007" }, { folio: "SUP-2025-0100" }, { folio: "CTZ-2026-0050" }], "SUP", 2026), "SUP-2026-0008");
  assert.equal(siguienteFolio([{ folio: "CTZ-2026-0050" }], "CTZ", 2026), "CTZ-2026-0051");
});

test("transiciones de línea", () => {
  const l0 = { id: "L", cantidad: 10, estado: "revision_almacen" };
  assert.equal(aplicarAccionLinea(l0, "aprobar_coord").ok, false);                 // no está pendiente del coord
  const parcial = aplicarAccionLinea(l0, "almacen_parcial", { despachado: 4 });
  assert.equal(parcial.ok, true); assert.equal(parcial.linea.estado, "por_cotizar"); assert.equal(parcial.linea.aCotizar, 6);
  assert.equal(aplicarAccionLinea(l0, "almacen_parcial", { despachado: 10 }).ok, false);
  const hay = aplicarAccionLinea(l0, "almacen_hay"); assert.equal(hay.linea.estado, "despachada_almacen"); assert.equal(hay.linea.despachadoAlmacen, 10);
  assert.equal(aplicarAccionLinea(l0, "rechazar", { motivo: "" }).ok, false);
  // cotizar → aprobar parcial → sigue por cotizar → aprobar el resto → comprada
  const cot = aplicarAccionLinea(parcial.linea, "cotizar", { quoteId: "q1" }).linea;
  assert.equal(cot.estado, "cotizada"); assert.deepEqual(cot.quoteIds, ["q1"]);
  assert.equal(pendienteDeCompra(cot), 6);
  const ap1 = aplicarAccionLinea(cot, "aprobar_cot", { quoteId: "q1", cantidad: 4 }).linea;
  assert.equal(ap1.estado, "por_cotizar"); assert.equal(ap1.cantidadComprada, 4); assert.equal(pendienteDeCompra(ap1), 2);
  const cot2 = aplicarAccionLinea(ap1, "cotizar", { quoteId: "q2" }).linea;
  assert.equal(aplicarAccionLinea(cot2, "aprobar_cot", { quoteId: "q2", cantidad: 3 }).ok, false);   // más de lo pendiente
  const ap2 = aplicarAccionLinea(cot2, "aprobar_cot", { quoteId: "q2", cantidad: 2 }).linea;
  assert.equal(ap2.estado, "comprada"); assert.equal(ap2.cantidadComprada, 6);
  // devolver una cotización regresa la línea a por cotizar
  assert.equal(aplicarAccionLinea(cot, "devolver_cot", { quoteId: "q1" }).linea.estado, "por_cotizar");
});

test("estado inicial, efectivo y de cabecera", () => {
  const sol = { estado: "enviada", urgente: false, corte: { anio: 2026, semana: 40 }, lineas: [] };
  assert.equal(estadoInicialLinea({ fueraPresupuesto: true }, sol), "pendiente_coord");
  assert.equal(estadoInicialLinea({ excedeSaldo: true }, sol), "pendiente_coord");
  assert.equal(estadoInicialLinea({}, { ...sol, urgente: true }), "pendiente_coord");
  assert.equal(estadoInicialLinea({}, sol), "revision_almacen");
  // martes 15:00 pasado → se trata como por cotizar sin revisión de almacén
  const l = { estado: "revision_almacen" };
  assert.deepEqual(estadoEfectivoLinea(l, sol, null, hn("2026-09-29", "14:59")), { estado: "revision_almacen", sinRevisionAlmacen: false });
  assert.deepEqual(estadoEfectivoLinea(l, sol, null, hn("2026-09-29", "15:00")), { estado: "por_cotizar", sinRevisionAlmacen: true });
  assert.equal(estadoCabecera({ estado: "enviada", lineas: [{ estado: "pendiente_coord" }, { estado: "revision_almacen" }] }), "enviada");
  assert.equal(estadoCabecera({ estado: "enviada", lineas: [{ estado: "por_cotizar" }, { estado: "revision_almacen" }] }), "en_proceso");
  assert.equal(estadoCabecera({ estado: "enviada", lineas: [{ estado: "comprada" }, { estado: "rechazada" }, { estado: "despachada_almacen" }] }), "completada");
  assert.equal(estadoCabecera({ estado: "cancelada", lineas: [{ estado: "comprada" }] }), "cancelada");
  assert.equal(puedeCancelar({ estado: "enviada", lineas: [{ estado: "revision_almacen" }] }), true);
  assert.equal(puedeCancelar({ estado: "enviada", lineas: [{ estado: "por_cotizar" }] }), false);
});

test("destino sugerido", () => {
  assert.equal(destinoSugerido({ condicionPago: "credito" }), "cxp");
  assert.equal(destinoSugerido({ condicionPago: "contado", urgente: true }), "prioridad");
  // hoy jueves 1-oct: lunes/martes próximos = 5 y 6 de octubre
  assert.equal(destinoSugerido({ condicionPago: "contado", fechaRequeridaObra: "2026-10-06", hoy: "2026-10-01" }), "prioridad");
  assert.equal(destinoSugerido({ condicionPago: "contado", fechaRequeridaObra: "2026-10-02", hoy: "2026-10-01" }), "prioridad");
  assert.equal(destinoSugerido({ condicionPago: "contado", fechaRequeridaObra: "2026-10-07", hoy: "2026-10-01" }), "normal");
});

test("borrador desde cotización aprobada: mismo shape de GeoShopping", () => {
  const cot = { id: "q1", folio: "CTZ-2026-0001", requestId: "s1", projectCode: "ZZ-PRUEBA", provider: "Ferretería X", numeroProveedor: "COT-77", pdfFile: { fileId: "f1" }, totalDeclarado: 9150, condicionPago: "contado", lineas: [{ requestLineId: "L1", cantidad: 10, puLps: 275 }, { requestLineId: "L2", cantidad: 20, puLps: 320, justificacion: "Único con stock" }] };
  const evalu = ev(cot);
  evalu.lineas = evalu.lineas.map(l => ({ ...l, partidaId: lineasSol[l.requestLineId].partidaId, nombrePartida: partidas[lineasSol[l.requestLineId].partidaId].nombre, unidadPartida: partidas[lineasSol[l.requestLineId].partidaId].unidad, categoria: "Materiales" }));
  const sol = { id: "s1", folio: "SUP-2026-0001", projectCode: "ZZ-PRUEBA", residente: "ing.prueba", fechaRequeridaObra: "2026-10-12", urgente: false, corte: { anio: 2026, semana: 40 } };
  const { purchase, avisos } = borradorDesdeCotizacion({ cotizacion: cot, evaluacion: evalu, solicitud: sol, proveedor: { name: "Ferretería X", rtn: "0801", bankAccounts: [] }, proyecto: { short: "ZZ-PRUEBA", company: "subterra" }, aprobadoPor: "Lic. Gerson Trochez", tasa: 27, cfg: { cierrePorProyecto: { "ZZ-PRUEBA": "Ana Vasquez" } }, hoy: "2026-10-02", ahoraISO: "2026-10-02T16:00:00.000Z", id: "pid", codigo: "MAT-2026-0600" });
  assert.deepEqual(avisos, ["Proveedor sin datos bancarios en el maestro"]);
  assert.equal(purchase.status, "borrador"); assert.equal(purchase.treasuryStatus, null);
  assert.equal(purchase.company, "subterra"); assert.equal(purchase.amount, 9150); assert.equal(purchase.quoteNumber, "COT-77");
  assert.equal(purchase.fechaPagoRequerida, "2026-10-10");          // obra − 2 días
  assert.equal(purchase.destinoPago, "normal");
  assert.equal(purchase.cierreResponsable, "Ana Vasquez");
  assert.equal(purchase.opsResponsible, "Lic. Gerson Trochez");
  assert.equal(purchase.lineas.length, 2); assert.equal(purchase.lineas[1].monto, 6400); assert.equal(purchase.partidaId, "p2"); // la de más plata
  assert.equal(purchase.description, "10 Lance × Tubo PVC 4\"\n20 Bolsa × Cemento");
  assert.equal(purchase.origenSupply.quoteId, "q1"); assert.equal(purchase.origenSupply.tasaCambioUsada, 27);
  assert.equal(purchase.audit[0].action, "created");
  // con cuenta bancaria: sin aviso y datos cargados
  const con = borradorDesdeCotizacion({ cotizacion: cot, evaluacion: evalu, solicitud: sol, proveedor: { name: "Ferretería X", bankAccounts: [{ bank: "BAC", type: "Ahorro", holder: "Ferretería X", number: "123" }] }, proyecto: {}, aprobadoPor: "G", tasa: 27, hoy: "2026-10-02", ahoraISO: "x", id: "i", codigo: "c" });
  assert.deepEqual(con.avisos, []); assert.equal(con.purchase.bacAccount, "123"); assert.equal(con.purchase.providerBank, "BAC");
});

test("contadores por rol", () => {
  const cfg = configEfectiva(null);
  const sols = [
    { id: "a", estado: "enviada", residente: "res1", corte: { anio: 2026, semana: 40 }, lineas: [{ estado: "pendiente_coord" }, { estado: "revision_almacen" }] },
    { id: "b", estado: "en_proceso", residente: "res2", corte: { anio: 2026, semana: 40 }, lineas: [{ estado: "por_cotizar" }] },
    { id: "c", estado: "completada", residente: "res1", lineas: [{ estado: "comprada" }] },
  ];
  const cots = [{ estado: "enviada" }, { estado: "devuelta" }];
  const ahora = hn("2026-09-29", "10:00");
  assert.equal(contarPendientes({ solicitudes: sols, cotizaciones: cots, rol: "admin", cfg, ahora }), 2);
  assert.equal(contarPendientes({ solicitudes: sols, cotizaciones: cots, rol: "logistica", cfg, ahora }), 1);
  assert.equal(contarPendientes({ solicitudes: sols, cotizaciones: cots, rol: "asistente_compras", cfg, ahora }), 2);
  assert.equal(contarPendientes({ solicitudes: sols, cotizaciones: cots, rol: "residente", username: "res1", cfg, ahora }), 1);
  // pasado el martes 15:00 la de almacén pasa a Compras
  assert.equal(contarPendientes({ solicitudes: sols, cotizaciones: cots, rol: "asistente_compras", cfg, ahora: hn("2026-09-29", "15:30") }), 3);
});

test("código MAT siguiente y fuera de corte", () => {
  assert.equal(siguienteCodigoCompra([{ codigo: "MAT-2026-0512" }, { codigo: "MAQ-2026-0900" }, { codigo: "MAT-2025-0999" }], 2026), "MAT-2026-0513");
  assert.equal(siguienteCodigoCompra([], 2026), "MAT-2026-0001");
  const sol = { estado: "en_proceso", corte: { anio: 2026, semana: 40 }, lineas: [{ estado: "por_cotizar" }] };
  assert.equal(fueraDeCorte(sol, null, hn("2026-10-02", "11:59")), false);
  assert.equal(fueraDeCorte(sol, null, hn("2026-10-02", "12:00")), true);
  assert.equal(fueraDeCorte({ ...sol, lineas: [{ estado: "comprada" }] }, null, hn("2026-10-02", "13:00")), false);
});

test("métricas del dashboard", () => {
  const sols = [
    { id: "a", estado: "en_proceso", projectCode: "P1", residente: "r1", urgente: false, corte: { anio: 2026, semana: 40 }, fechaEnvio: hn("2026-09-28", "09:00"), lineas: [{ estado: "comprada" }, { estado: "rechazada" }], audit: [{ action: "almacen_no_hay", at: hn("2026-09-29", "09:00") }] },
    { id: "b", estado: "enviada", projectCode: "P1", residente: "r2", urgente: true, corte: { anio: 2026, semana: 40 }, fechaEnvio: hn("2026-09-30", "09:00"), lineas: [{ estado: "pendiente_coord" }], audit: [] },   // enviada después del cierre → fuera del corte que le tocaba
    { id: "c", estado: "borrador", projectCode: "P2", residente: "r1", lineas: [] },
  ];
  const cots = [{ id: "q", requestId: "a", projectCode: "P1", estado: "aprobada", purchaseId: "pu", aprobadoAt: hn("2026-10-01", "10:00"), audit: [{ action: "enviada", at: hn("2026-09-30", "10:00") }], evaluacion: { lineas: [{ semaforo: "verde", variacionPct: 0.01 }, { semaforo: "rojo", variacionPct: 0.2 }] } }];
  const pur = [{ id: "pu", validatedAt: hn("2026-10-02", "10:00"), paidAt: "2026-10-05", audit: [{ action: "paid", at: hn("2026-10-05", "10:00") }] }];
  const m = metricasDashboard({ solicitudes: sols, cotizaciones: cots, purchases: pur, ahora: hn("2026-10-05", "12:00") });
  assert.equal(m.total, 2); assert.equal(m.urgentes, 1); assert.equal(m.pctUrgentes, 0.5);
  assert.equal(m.enCorte, 1); assert.equal(m.conCorte, 2);
  assert.equal(m.porProyecto[0].k, "P1"); assert.equal(m.porProyecto[0].total, 2);
  assert.ok(Math.abs(m.tiempos.almacen - 1) < 0.01); assert.ok(Math.abs(m.tiempos.aprobacion - 1) < 0.01); assert.ok(Math.abs(m.tiempos.tesoreria - 1) < 0.01); assert.ok(Math.abs(m.tiempos.pago - 3) < 0.01);
  assert.equal(m.semaforo.verde, 1); assert.equal(m.semaforo.rojo, 1); assert.equal(m.semaforo.pctRojo, 0.5);
  assert.equal(m.fueraDeCorte.length, 1);      // la línea pendiente_coord de "b", pasado el viernes
  assert.equal(metricasDashboard({ solicitudes: sols, cotizaciones: cots, filtros: { projectCode: "P2" } }).total, 0);
  assert.equal(metricasDashboard({ solicitudes: sols, cotizaciones: cots, filtros: { corteId: "C40-2026" } }).total, 2);
});
