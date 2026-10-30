// Lector de cotizaciones (12-oct-2026): filas tal cual las saca pdf.js de
// cotizaciones REALES del sistema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearCotizacion, aNumero, unidadDe } from "../src/leer-cotizacion.js";

const provs = [
  { id: "p1", name: "Casa comercial mathes S.A. de C.V. / CEMCOL", rtn: "08019995104551" },
  { id: "p2", name: "ECOMETAL", rtn: "" },
  { id: "p3", name: "REASA", rtn: "" },
  { id: "p4", name: "GEO STRUCTURES S.A. DE C.V.", rtn: "08019011396599" },   // nosotros: nunca es el proveedor
];

test("números y unidades", () => {
  assert.equal(aNumero("L. 1,064.59"), 1064.59);
  assert.equal(aNumero("1,064.59"), 1064.59); assert.equal(aNumero("$24.02"), 24.02); assert.equal(aNumero("4,528.32}"), 4528.32);
  assert.equal(aNumero("278,26"), 278.26); assert.equal(aNumero("1,000"), 1000); assert.equal(aNumero("15%"), null);
  assert.equal(unidadDe("L."), null); assert.equal(unidadDe("UNID"), "Unidad"); assert.equal(unidadDe("lances"), "Lance"); assert.equal(unidadDe("GAL"), "Galón");
});

test("CEMCOL: 15 líneas, ISV aparte, proveedor por RTN, N° de cotización", () => {
  const filas = [
    ["COTIZACION", "#", "002", "001535367"],
    ["Emitir cheque a nombre de: CASA COMERCIAL MATHEWS S.A. DE C.V.", "RTN: 08019995104551", "TEL.:", "(504)-230-2069"],
    ["0145013", "GEO STRUCTURES S.A. DE C.V.", "VENCE:", "7/10/2026"],
    ["MR", "NUMERO DE PARTE", "DESCRIPCION", "EN TIENDA", "CANTIDAD", "PRECIO", "TOTAL"],
    ["CA", "3223155", "ELEMENT", "Disponible", "1", "L.", "906.55", "L.", "906.55"],
    ["CA", "5153975", "CK-4/CUB", "Disponible", "1", "L.", "4,292.10", "L.", "4,292.10"],
    ["CA", "5153973", "CK-4/GAL", "Disponible", "2", "L.", "480.28", "L.", "960.56"],
    ["Monto Bruto", ":", "L.", "6,159.21"],
    ["Monto Impuesto", ":", "L.", "923.88"],
    ["Monto Neto", ":", "L.", "7,083.09"],
  ];
  const r = parsearCotizacion(filas, { providers: provs });
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.items[0], { cantidad: 1, unidad: "Unidad", nombre: "CA 3223155 ELEMENT", precio: 906.55, monto: 906.55 });
  assert.equal(r.items[1].unidad, "Cubeta"); assert.equal(r.items[2].unidad, "Galón"); assert.equal(r.items[2].cantidad, 2);
  assert.equal(r.suma, 6159.21); assert.equal(r.subtotal, 6159.21); assert.equal(r.isv, 923.88); assert.equal(r.total, 7083.09); assert.equal(r.cuadraSubtotal, true);
  assert.equal(r.numero, "002 001535367"); assert.equal(r.proveedor.id, "p1"); assert.equal(r.proveedorPorRTN, true);
});

test("REASA: descuento por línea → se toma el total neto", () => {
  const r = parsearCotizacion([
    ["Cotización No", "1417051"],
    ["ARTICULO", "DESCRIPCIÓN", "CANT.", "PRECIO", "SUB TOTAL", "DESC", "TOTAL LINEA"],
    ["VL-08-0001", "Aceite Valvoline ATF, MaxLife Dexron/Mercon, Galon", "5", "L 1,003.68", "5,018.40", "250.90", "L 4,767.48"],
    ["5,018.40", "250.90", "L 4,767.48"],
    ["Sub-Total", "L 4,767.48"], ["Imp. S / V", "L 715.12"], ["Total", "L 5,482.60"],
  ], { providers: provs });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].monto, 4767.48); assert.equal(r.items[0].descuento, 250.92);
  assert.equal(r.subtotal, 4767.48); assert.equal(r.isv, 715.12); assert.equal(r.total, 5482.6); assert.equal(r.numero, "1417051");
});

test("Larach: total por línea CON ISV y coma decimal → monto sin ISV", () => {
  const r = parsearCotizacion([
    ["COTIZACION", "No.:S04CO136954", "Tel.:2290-7600"],
    ["CODIGO", "DESCRIPCION", "CANTIDAD", "UNIDAD", "PRECIO", "DSCTO", "I.S.V", "TOTAL"],
    ["1", "01010871", "CINTA METRICA 30-088 8M/26' MAGNETIC STANLEY", "1,00", "UNID", "278,26", "0,00", "41,74", "320,00"],
    ["2", "02170172", "DISCO DW8427 ABRASIVO CORTE METAL DEWALT", "7.00", "UNID", "53.04", "0.00", "55.70", "427.00"],
    ["Comentario:", "SUB-TOTAL :", "649,54"],
  ], { providers: provs });
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].nombre, "01010871 CINTA METRICA 30-088 8M/26' MAGNETIC STANLEY");
  assert.equal(r.items[0].monto, 278.26); assert.equal(r.items[0].isvEnLinea, true); assert.equal(r.items[1].monto, 371.28); assert.equal(r.items[1].cantidad, 7);
  assert.equal(r.numero, "S04CO136954");
});

test("ECOMETAL: descripción después del # de fila y renglón de continuación", () => {
  const r = parsearCotizacion([
    ["N° Cotización: COT-2026-8836"],
    ["ITEM", "DESCRIPCIÓN", "CANT.", "PRECIO UNIT.", "SUBTOTAL (L)"],
    ["1", "Varilla de Acero N° 5 (5/8\")", "1,000", "396.00", "396,000.00"],
    ["Grado 40, Longitud de 9 metros"],
    ["Subtotal Neto:", "L 396,000.00"], ["ISV (15%):", "L 59,400.00"], ["Total a Pagar:", "L 455,400.00"],
  ], { providers: provs });
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].nombre, "Varilla de Acero N° 5 (5/8\") Grado 40, Longitud de 9 metros");
  assert.equal(r.items[0].cantidad, 1000); assert.equal(r.items[0].monto, 396000);
  assert.equal(r.isv, 59400); assert.equal(r.total, 455400); assert.equal(r.numero, "COT-2026-8836");
  assert.equal(r.proveedor, null);   // el nombre ECOMETAL no aparece en estas filas de prueba
});

import { emparejar, parecido, varillaEnTexto, tokensDe } from "../src/leer-cotizacion.js";

test("emparejar: renglones de la cotización con lo pedido / la receta", () => {
  assert.deepEqual(tokensDe('Tubo PVC de 1", potable'), ["tubo", "pvc", "1in", "potable"]);
  assert.ok(parecido('TUBO PVC 1" POTABLE SDR-26', 'Tubo PVC de 1", potable') > 0.6);
  assert.ok(parecido('TUBO PVC 2" POTABLE', 'Tubo PVC de 1", potable') < 0.34);          // otra medida
  const pedidos = [{ id: "a", nombre: 'Tubo PVC de 1", potable', cantidad: 5 }, { id: "b", nombre: 'Tapón PVC de 2", sanitario', cantidad: 10 }];
  const items = [
    { nombre: 'TAPON PVC 2" SANITARIO', cantidad: 10 },
    { nombre: "PEGAMENTO PVC 1/4 GAL", cantidad: 1 },
    { nombre: 'TUBO PVC 1 PULG POTABLE 6M', cantidad: 5 },
  ];
  const r = emparejar(items, pedidos, { unoAUno: true });
  assert.equal(r.parejas.length, 2);
  assert.equal(r.parejas[0].cand.id, "b"); assert.equal(r.parejas[1].cand.id, "a");
  assert.equal(r.sinPareja.length, 1); assert.equal(r.sinPareja[0].nombre, "PEGAMENTO PVC 1/4 GAL");
  // Receta de Torre Adobe: la varilla #5 va con su partida, no con la #4
  const receta = [{ id: "v4", nombre: 'Varilla No.4 (1/2"), grado 40; Lance de 9m' }, { id: "v5", nombre: 'Varilla No.5 (5/8"), grado 40; Lance de 9m' }];
  const r2 = emparejar([{ nombre: "Varilla corrugada #5 x 9 m, Grado 40", cantidad: 245 }], receta);
  assert.equal(r2.parejas[0].cand.id, "v5");
  assert.deepEqual(varillaEnTexto("Varilla corrugada #8 x 12 m, Grado 60"), { n: 8, largo: 12 });
  assert.deepEqual(varillaEnTexto('Varilla de Acero N° 5 (5/8") Grado 40, Longitud de 9 metros'), { n: 5, largo: 9 });
});

import { ajusteAlTotal, lineasSupplyDesdeLectura, lineasPresupuestoDesdeLectura } from "../src/leer-cotizacion.js";

test("ajusteAlTotal: ISV, exenta, proporcional y no cuadra", () => {
  assert.deepEqual(ajusteAlTotal({ suma: 1000, total: 1150 }), { factor: 1.15, total: 1150, modo: "isv", suma: 1000 });
  assert.equal(ajusteAlTotal({ suma: 1000, total: 1000 }).modo, "exenta");
  const p = ajusteAlTotal({ suma: 1000, total: 1100 }); assert.equal(p.modo, "proporcional"); assert.ok(Math.abs(p.factor - 1.1) < 1e-9);
  assert.equal(ajusteAlTotal({ suma: 1000, total: 2000 }).modo, "no_cuadra");
  assert.deepEqual(ajusteAlTotal({ suma: 1000, total: null }), { factor: 1.15, total: 1150, modo: "sin_total", suma: 1000 });
});

test("GeoSupply: la cotización llena las líneas de Ana, con ISV y cuadrada al total", () => {
  const sol = { id: "S1", projectCode: "P" };
  const candidatas = [
    { sol, l: { id: "a", descripcion: 'Tubo PVC de 1", potable', unidad: "Lance", cantidad: 10 }, pendiente: 10 },
    { sol, l: { id: "b", descripcion: 'Tapón PVC de 2", sanitario', unidad: "Unidad", cantidad: 10 }, pendiente: 10 },
    { sol, l: { id: "v", descripcion: "Acero de refuerzo", unidad: "Ton", varilla: { n: 5, largo: 9, lances: 100 } }, pendiente: 1.3968 },
  ];
  const r = { suma: 2300, total: 2645, items: [
    { nombre: 'TUBO PVC 1" POTABLE SDR-26', cantidad: 6, unidad: "Unidad", monto: 600 },
    { nombre: 'TAPON PVC 2" SANITARIO', cantidad: 10, unidad: "Unidad", monto: 100 },
    { nombre: "VARILLA CORRUGADA #5 X 9 M GRADO 40", cantidad: 100, unidad: "Unidad", monto: 1500 },
    { nombre: "PEGAMENTO PVC 1/4 GAL", cantidad: 1, unidad: "Galón", monto: 100 },
  ] };
  const res = lineasSupplyDesdeLectura(r, candidatas);
  assert.equal(res.ajuste.modo, "isv");
  assert.equal(res.lineas.length, 3);
  const a = res.lineas.find(x => x.requestLineId === "a");
  assert.equal(a.cantidad, 6); assert.equal(a.parcial, true); assert.equal(a.puLps, 115);   // 100 × 1.15
  const v = res.lineas.find(x => x.requestLineId === "v");
  assert.equal(v.lances, 100); assert.equal(v.puLance, 17.25); assert.equal(v.parcial, false);
  assert.ok(Math.abs(v.cantidad - 1.3968) < 1e-4);
  assert.equal(res.sinPareja.length, 1); assert.equal(res.sinPareja[0].nombre, "PEGAMENTO PVC 1/4 GAL");
});

test("GeoShopping: los renglones se buscan en la receta del presupuesto", () => {
  const pres = { partidas: [
    { id: "t1", categoria: "Materiales", nombre: 'Tubo PVC de 2", sanitario', unidad: "Lance", modulo: "compras" },
    { id: "t4", categoria: "Materiales", nombre: 'Tubo PVC de 4", sanitario', unidad: "Lance", modulo: "compras" },
    { id: "ac", categoria: "Materiales", nombre: "Acero de refuerzo grado 40", unidad: "Ton", modulo: "compras" },
    { id: "mo", categoria: "Personal", nombre: "Mano de obra", unidad: "Global", modulo: "mo" },
  ] };
  const r = { suma: 3000, total: 3450, items: [
    { nombre: 'TUBO PVC 2" SDR-41 6M', cantidad: 5, unidad: "Unidad", monto: 500 },
    { nombre: "Varilla corrugada #5 x 9 m", cantidad: 100, unidad: "Unidad", monto: 2000 },
    { nombre: "Cinta teflón", cantidad: 10, unidad: "Rollo", monto: 500 },
  ] };
  let k = 0;
  const res = lineasPresupuestoDesdeLectura(r, pres, { nuevoId: () => "x" + (++k) });
  assert.equal(res.nEmparejadas, 2);
  const [tubo, varilla, cinta] = res.lineas;
  assert.equal(tubo.partidaId, "t1"); assert.equal(tubo.cantidad, "5"); assert.equal(tubo.monto, "500");
  assert.equal(varilla.partidaId, "ac"); assert.equal(varilla.varN, "5"); assert.equal(varilla.varLances, "100");
  assert.equal(varilla.cantidad, "1.3968");
  assert.equal(cinta.partidaId, ""); assert.equal(cinta.realNombre, "Cinta teflón"); assert.equal(cinta.categoria, undefined);
  assert.equal(res.ajuste.total, 3450);
  // Varias soluciones: elige la que reconoce más
  const pres2 = { partidas: [
    { id: "m1", solucion: "Muro anclado", categoria: "Materiales", nombre: "Cemento gris tipo GU", unidad: "Bolsa", modulo: "compras" },
    { id: "p1", solucion: "Pantalla de pilotes", categoria: "Materiales", nombre: "Cemento gris tipo GU", unidad: "Bolsa", modulo: "compras" },
    { id: "p2", solucion: "Pantalla de pilotes", categoria: "Materiales", nombre: "Bentonita sódica", unidad: "Saco", modulo: "compras" },
  ] };
  const res2 = lineasPresupuestoDesdeLectura({ suma: 2, total: 2.3, items: [{ nombre: "CEMENTO GU 42.5KG", cantidad: 1, unidad: "Bolsa", monto: 1 }, { nombre: "BENTONITA SODICA 50KG", cantidad: 1, unidad: "Saco", monto: 1 }] }, pres2);
  assert.equal(res2.solucion, "Pantalla de pilotes");
  assert.deepEqual(res2.lineas.map(l => l.partidaId), ["p1", "p2"]);
});

// PRESENTACIÓN (30-oct-2026, FANASA): "POLIDUCTO DE 3/4" X 100 YDS" son rollos
// de 100 yardas — 8 rollos pedidos en Yarda son 800 yardas a L 3.95 (con ISV).
test("FANASA: rollos de 100 yardas se convierten a la unidad de lo pedido", async () => {
  const { lineaSupplyDe, lineasPresupuestoDesdeLectura, ajusteAlTotal, presentacionEn } = await import("../src/leer-cotizacion.js");
  const r = parsearCotizacion([
    ["Cantidad", "Codigo", "Código Artículo/Descripción", "Precio", "Monto Total"],
    ["8.00", "19072", "POLIDUCTO DE 3/4\" X 100 YDS", "L", "343.48", "L", "L2,747.83"],
    ["Sub Total: L", "2,747.83"], ["ISV 15%: L", "412.17"], ["Total a Pagar: L", "3,160.00"],
  ]);
  assert.equal(r.items[0].nombre, "POLIDUCTO DE 3/4\" X 100 YDS");   // el 100 ya no se pierde
  assert.equal(r.items[0].cantidad, 8);
  assert.deepEqual(r.items[0].presentacion, { n: 100, unidad: "Yarda", texto: "X 100 YDS" });
  const aj = ajusteAlTotal(r);
  const l = lineaSupplyDe(r.items[0], { sol: { id: "s" }, l: { id: "l", unidad: "Yarda", descripcion: "Poliducto negro de 3/4\"" }, pendiente: 800 }, aj.factor);
  assert.equal(l.cantidad, 800); assert.equal(l.puLps, 3.95); assert.equal(l.parcial, false);
  // Pedido en Rollo: no se convierte
  const l2 = lineaSupplyDe(r.items[0], { sol: { id: "s" }, l: { id: "l", unidad: "Rollo", descripcion: "x" }, pendiente: 8 }, aj.factor);
  assert.equal(l2.cantidad, 8);
  // GeoShopping: partida en Yarda
  const pres = { partidas: [{ id: "p1", categoria: "Materiales", nombre: "Poliducto negro de 3/4\"", unidad: "Yarda", cantidad: 1000, pu: 0.27, modulo: "compras" }] };
  const res = lineasPresupuestoDesdeLectura(r, pres);
  assert.equal(res.lineas[0].partidaId, "p1"); assert.equal(res.lineas[0].cantidad, "800");
  // Medidas que NO son presentación
  assert.equal(presentacionEn("LAMINA 4 X 8 PIES"), null);
  assert.equal(presentacionEn("FLEJE 3/4 X 100 PIES").n, 100);
});
