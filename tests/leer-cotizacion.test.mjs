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
