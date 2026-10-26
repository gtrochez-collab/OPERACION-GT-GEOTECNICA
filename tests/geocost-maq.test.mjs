// GeoMachinery (12-oct-2026): líneas escritas a mano, todas a UNA partida.
import { test } from "node:test";
import assert from "node:assert/strict";
import { movimientosCompras } from "../src/geocost-calc.js";

test("líneas manuales de GeoMachinery llegan a GeoCost, una por línea, con su unidad", () => {
  const p = {
    id: "m1", codigo: "MAQ-2026-0099", projectCode: "TORRE ADOBE", status: "validado", amount: 7072.5, provider: "SILCA",
    partidaId: "p-oper",
    lineas: [
      { id: "a", partidaId: "p-oper", nombre: "Aceite hidráulico ISO 68", unidad: "Cubeta", cantidad: 2, monto: 4500, manual: true },
      { id: "b", partidaId: "p-oper", nombre: "Filtro de aceite", unidad: "Unidad", cantidad: 3, monto: 1650, manual: true },
    ],
  };
  const movs = movimientosCompras({ purchases: [p], projectCode: "TORRE ADOBE", tasa: 27, fuente: "maquinas" });
  assert.equal(movs.length, 2);
  assert.equal(movs[0].descripcion, "2 Cubeta × Aceite hidráulico ISO 68");
  assert.equal(movs[1].descripcion, "3 Unidad × Filtro de aceite");
  assert.ok(movs.every(m => m.partidaId === "p-oper" && m.estado === "comprometido" && m.sourceKey === "mq-purchases"));
  // El total (con ISV al final, 7,072.50) se reparte proporcional y cuadra al centavo.
  assert.equal(Math.round((movs[0].montoHNL + movs[1].montoHNL) * 100) / 100, 7072.5);
  assert.equal(movs[0].montoHNL, 5175);
});

import { pesoLanceKg, cantidadDeVarilla, kgPorUnidad, esPartidaVarillaPorPeso, textoVarilla } from "../src/geocost-calc.js";
import { descripcionDeCotizacion } from "../src/geosupply-calc.js";

test("peso de varilla por lance (ASTM A615) y conversión a Ton", () => {
  assert.equal(pesoLanceKg(5, 9), 13.968);
  assert.equal(pesoLanceKg(6, 9), 20.115);
  assert.equal(pesoLanceKg(8, 12), 47.676);
  assert.equal(kgPorUnidad("Ton"), 1000); assert.equal(kgPorUnidad("kg"), 1); assert.equal(kgPorUnidad("Lance"), null);
  // Caso real Villa San Miguel
  assert.equal(cantidadDeVarilla({ n: 5, largo: 9, lances: 1000 }, "Ton"), 13.968);
  const t0416 = cantidadDeVarilla({ n: 6, largo: 9, lances: 430 }, "Ton") + cantidadDeVarilla({ n: 5, largo: 9, lances: 245 }, "Ton") + cantidadDeVarilla({ n: 8, largo: 12, lances: 302 }, "Ton");
  assert.ok(Math.abs(t0416 - 26.4698) < 0.001);
  assert.ok(Math.abs(46.22 - t0416 - 13.968 - 5.782) < 0.001);   // saldo 5.78 Ton
  assert.equal(esPartidaVarillaPorPeso({ nombre: "Acero de construcción en barras, varios diámetros G40 y G60", unidad: "Ton" }), true);
  assert.equal(esPartidaVarillaPorPeso({ nombre: "Varilla No.5 (5/8\"), grado 40; Lance de 9m", unidad: "Lance" }), false);   // Torre Adobe: ya viene por lance
  assert.equal(textoVarilla({ n: 5, largo: 9, lances: 1000 }, 13.968, "Ton"), "1,000 lances × Varilla #5 (5/8\") de 9 m · 13.97 Ton");
});

test("la varilla llega a GeoCost y a la descripción de GeoShopping por lances", () => {
  const p = { id: "x", projectCode: "VSM", status: "validado", amount: 455400, lineas: [{ id: "a", partidaId: "acero", nombre: "Acero", unidad: "Ton", cantidad: 13.968, monto: 455400, varilla: { n: 5, largo: 9, lances: 1000 } }] };
  const [m] = movimientosCompras({ purchases: [p], projectCode: "VSM", tasa: 27 });
  assert.equal(m.descripcion, "1,000 lances × Varilla #5 (5/8\") de 9 m · 13.97 Ton");
  assert.equal(descripcionDeCotizacion([{ cantidad: 13.968, unidad: "Ton", descripcion: "x", varilla: { n: 5, largo: 9, lances: 1000 } }]), "1,000 lances × Varilla #5 (5/8\") de 9 m · 13.97 Ton");
});

test("P.U. real por partida: solo ítems con cantidad en la unidad de la partida", async () => {
  const { precioUnitarioReal } = await import("../src/geocost-calc.js");
  const r = precioUnitarioReal([
    { estado: "ejecutado", cantidadPartida: 40, montoUSD: 220 },
    { estado: "comprometido", cantidadPartida: 10, montoUSD: 50 },
    { estado: "ejecutado", cantidadPartida: 0, montoUSD: 999 },   // sustituto / sin cantidad
  ]);
  assert.equal(r.cantidadComprada, 50);
  assert.equal(r.puRealUSD, 5.4);
  assert.equal(precioUnitarioReal([]).puRealUSD, null);
});

test("P.U. real: una partida que se fabrica con sustitutos no lo calcula", async () => {
  const { precioUnitarioReal } = await import("../src/geocost-calc.js");
  const r = precioUnitarioReal([
    { estado: "ejecutado", cantidadPartida: 480, montoUSD: 4177 },   // cemento cargado sin marcar
    { estado: "ejecutado", cantidadPartida: 0, montoUSD: 1019, sustituto: true },
  ]);
  assert.equal(r.puRealUSD, null);
});

test("P.U. real: el costo escrito a mano (ficha de costo) manda", async () => {
  const { precioUnitarioReal } = await import("../src/geocost-calc.js");
  const r = precioUnitarioReal([{ estado: "ejecutado", cantidadPartida: 0, montoUSD: 1000, sustituto: true }], { puRealManual: 161.9, puRealFuente: "Ficha Fiori" });
  assert.equal(r.puRealUSD, 161.9);
  assert.equal(r.puRealManual, true);
});
