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
