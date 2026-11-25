import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE128, valoresCode128B, anchosCode128 } from "../src/carnet-pdf.js";

test("Code 128: tabla completa y cada símbolo mide 11 módulos (Stop 13)", () => {
  assert.equal(CODE128.length, 107);
  CODE128.forEach((p, i) => assert.equal([...p].reduce((a, b) => a + Number(b), 0), i === 106 ? 13 : 11, `símbolo ${i}`));
});

test("Code 128 B: checksum del ejemplo PJJ123C y del código de un empleado", () => {
  const v = valoresCode128B("PJJ123C");
  assert.equal(v[0], 104); assert.equal(v[v.length - 2], 55); assert.equal(v[v.length - 1], 106);
  const a = anchosCode128("GP00980");
  assert.equal(a.reduce((x, y) => x + y, 0), 11 * (7 + 2) + 13);
  assert.throws(() => valoresCode128B("Ñ"));
});
