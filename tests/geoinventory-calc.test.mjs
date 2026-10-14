import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ubicacionesDe, siguientesCodigos, codigoDeTexto, sugerirExistentes, parecidoNombre,
  aplicarMovimiento, stockDe, stockEn, buscarItems, permisosDe, resumenInventario,
  parseTabla, prepararImportacion, textoMovimiento, keyMovimientos,
} from "../src/geoinventory-calc.js";

test("ubicaciones: fijas + oficinas + una por proyecto, con responsable guardado", () => {
  const u = ubicacionesDe({ guardadas: [{ id: "of:1", tipo: "oficina", nombre: "Oficina Operaciones", responsable: "ana" }, { id: "proy:VILLA SAN MIGUEL", responsable: "ester.cruz" }, { id: "almacen", responsable: "oscarpaz" }],
    proyectos: [{ short: "VILLA SAN MIGUEL", name: "Villa San Miguel" }, { short: "AMICI", name: "Condominios Omoa" }] });
  assert.deepEqual(u.map(x => x.id), ["almacen", "of:1", "vault", "taller", "proy:AMICI", "proy:VILLA SAN MIGUEL"]);
  assert.equal(u[0].responsable, "oscarpaz");
  assert.equal(u.find(x => x.id === "proy:VILLA SAN MIGUEL").responsable, "ester.cruz");
  assert.equal(u.find(x => x.id === "proy:AMICI").nombreLargo, "Condominios Omoa");
});

test("códigos correlativos por prefijo y lectura del QR / lector USB", () => {
  const items = [{ codigo: "MAT-0001" }, { codigo: "MAT-0007" }, { codigo: "HER-0002" }];
  assert.deepEqual(siguientesCodigos(items, "MAT", 2), ["MAT-0008", "MAT-0009"]);
  assert.deepEqual(siguientesCodigos(items, "TEC"), ["TEC-0001"]);
  assert.equal(codigoDeTexto("https://x.github.io/APP/#inv=HER-0002"), "HER-0002");
  assert.equal(codigoDeTexto("mat-0008"), "MAT-0008");
  assert.equal(codigoDeTexto("cemento"), null);
});

test("sugerencias contra duplicados: 'cem' encuentra el cemento que ya existe", () => {
  const items = [{ id: 1, nombre: "Cemento GU 42.5 kg", categoria: "materiales" }, { id: 2, nombre: "Silla plástica", categoria: "mobiliario" }, { id: 3, nombre: "Bolsa de cemento estructural", categoria: "materiales" }];
  assert.deepEqual(sugerirExistentes("cem", items).map(i => i.id), [1, 3]);
  assert.deepEqual(sugerirExistentes("bolsa cemento", items).map(i => i.id), [3, 1]);
  assert.deepEqual(sugerirExistentes("c", items), []);
  assert.ok(parecidoNombre("Cemento", "Cemento GU 42.5 kg") > parecidoNombre("Cemento", "Silla"));
});

test("movimientos por cantidad: entrada, salida con destino, ajuste y validaciones", () => {
  let it = { id: "a", codigo: "MAT-0001", nombre: "Cemento", tipo: "cantidad", stock: { almacen: 10 } };
  let r = aplicarMovimiento(it, { accion: "entrada", a: "almacen", cantidad: 5 }, { by: "oscarpaz", at: "2026-10-13T10:00:00.000Z" });
  assert.equal(r.item.stock.almacen, 15); assert.equal(r.mov.antes, 10); assert.equal(r.mov.despues, 15);
  r = aplicarMovimiento(r.item, { accion: "salida", de: "almacen", a: "proy:AMICI", cantidad: 4 });
  assert.equal(r.item.stock.almacen, 11); assert.equal(r.item.stock["proy:AMICI"], 4); assert.equal(stockDe(r.item), 15);
  assert.equal(aplicarMovimiento(r.item, { accion: "salida", de: "almacen", cantidad: 50 }).error, "Solo hay 11 en esa ubicación.");
  r = aplicarMovimiento(r.item, { accion: "salida", de: "proy:AMICI", cantidad: 4, entregadoA: "e1", entregadoNombre: "Juan" });
  assert.equal(stockEn(r.item, "proy:AMICI"), 0); assert.equal("proy:AMICI" in r.item.stock, false);
  r = aplicarMovimiento(r.item, { accion: "ajuste", en: "almacen", nuevo: 9, motivo: "conteo" });
  assert.equal(r.item.stock.almacen, 9); assert.equal(r.mov.cantidad, -2);
  assert.ok(aplicarMovimiento(r.item, { accion: "mover", a: "taller" }).error);
  assert.equal(textoMovimiento({ accion: "salida", cantidad: 4, de: "almacen", a: "proy:AMICI" }, [{ id: "almacen", nombre: "Almacén Central" }, { id: "proy:AMICI", nombre: "AMICI" }]), "−4 de Almacén Central → AMICI");
  assert.equal(keyMovimientos("2026-10-13T10:00:00.000Z"), "inv-mov-2026-10");
});

test("individuales: mover, estado con máquina obligatoria, asignar", () => {
  const broca = { id: "b", codigo: "HER-0001", nombre: "Broca 1.20 m", tipo: "individual", categoria: "herramientas_perforacion", ubicacionId: "almacen", estado: "disponible" };
  assert.equal(aplicarMovimiento(broca, { accion: "estado", estado: "en_operacion" }).error, "Elegí en qué máquina está.");
  let r = aplicarMovimiento(broca, { accion: "estado", estado: "en_operacion", maquinaId: "m1", maquinaNombre: "BG20H" });
  assert.equal(r.item.maquinaNombre, "BG20H"); assert.equal(r.mov.estadoA, "en_operacion");
  r = aplicarMovimiento(r.item, { accion: "estado", estado: "requiere_trabajo" });
  assert.equal(r.item.maquinaId, "");
  r = aplicarMovimiento(r.item, { accion: "mover", a: "taller" });
  assert.equal(r.item.ubicacionId, "taller"); assert.equal(r.mov.de, "almacen");
  assert.ok(aplicarMovimiento(r.item, { accion: "mover", a: "taller" }).error);
  const monitor = { id: "m", codigo: "TEC-0001", nombre: "Monitor", tipo: "individual", categoria: "computo", ubicacionId: "of:1", estado: "bueno" };
  r = aplicarMovimiento(monitor, { accion: "asignar", empId: "e9", empNombre: "Ana Vasquez" });
  assert.equal(r.item.asignadoNombre, "Ana Vasquez");
  r = aplicarMovimiento(r.item, { accion: "asignar", empId: "" });
  assert.equal(r.item.asignadoA, ""); assert.equal(textoMovimiento(r.mov), "Devuelto por Ana Vasquez");
  assert.ok(aplicarMovimiento(monitor, { accion: "estado", estado: "disponible" }).error);
});

test("buscar y resumen", () => {
  const items = [
    { id: 1, codigo: "MAT-0001", nombre: "Cemento GU", tipo: "cantidad", categoria: "materiales", stock: { almacen: 10 } },
    { id: 2, codigo: "HER-0001", nombre: "Broca 1.20 m", tipo: "individual", categoria: "herramientas_perforacion", ubicacionId: "proy:AMICI", estado: "en_operacion", herramienta: { tipo: "broca", diametro: "1.20 m" } },
    { id: 3, codigo: "TEC-0001", nombre: 'Monitor 24"', tipo: "individual", categoria: "computo", ubicacionId: "of:1", estado: "bueno", asignadoA: "e1", asignadoNombre: "Ana Vasquez" },
    { id: 4, codigo: "TEC-0002", nombre: "Monitor viejo", tipo: "individual", categoria: "computo", ubicacionId: "of:1", estado: "malo", eliminado: true },
  ];
  assert.deepEqual(buscarItems(items, { q: "her-0001" }).map(i => i.id), [2]);
  assert.deepEqual(buscarItems(items, { q: "ana" }).map(i => i.id), [3]);
  assert.deepEqual(buscarItems(items, { ubicacionId: "almacen" }).map(i => i.id), [1]);
  assert.deepEqual(buscarItems(items, { categoria: "computo" }).map(i => i.id), [3]);
  assert.deepEqual(buscarItems(items, { q: "broca", estado: "en_operacion" }).map(i => i.id), [2]);
  const r = resumenInventario(items);
  assert.equal(r.articulos, 3); assert.equal(r.herramientas, 1); assert.equal(r.enOperacion, 1); assert.equal(r.asignados, 1);
});

test("permisos: Gerson/Carolina todo, Óscar sin ajustar, Ana crea oficinas, Christian solo ve, residente nada", () => {
  assert.ok(permisosDe("admin").ajustar && permisosDe("tesoreria").eliminar);
  const o = permisosDe("logistica"); assert.ok(o.cargar && o.mover && o.imprimir && o.asignar && !o.ajustar && !o.ubicaciones);
  const a = permisosDe("asistente_compras"); assert.ok(a.cargar && a.ubicaciones && !a.ajustar && !a.config);
  const c = permisosDe("costos"); assert.ok(c.ver && !c.cargar);
  assert.ok(!permisosDe("residente").ver);
});

test("importar desde Excel: CSV y pegado con tabs", () => {
  const ubic = ubicacionesDe({ guardadas: [{ id: "of:1", tipo: "oficina", nombre: "Oficina Operaciones" }], proyectos: [{ short: "VILLA SAN MIGUEL" }] });
  const emps = [{ id: "e1", fullName: "Ana Vasquez" }];
  const csv = 'nombre,categoria,tipo,cantidad,unidad,ubicacion,estado,marca,modelo,serie,asignado\n"Cemento GU 42.5 kg",Materiales,cantidad,120,Bolsa,Almacén Central,,,,,\nMonitor 24",Equipo de cómputo,individual,2,,Oficina Operaciones,Bueno,Dell,,,Ana Vasquez\nBroca,Herramientas de perforación,individual,,,villa san miguel,En operación,,,,\nSin ubicación,Otros,cantidad,3,Unidad,Bodega X,,,,,';
  const { filas } = parseTabla(csv);
  assert.equal(filas.length, 4);
  const r = prepararImportacion(filas, { ubicaciones: ubic, empleados: emps });
  assert.equal(r.listos.length, 3); assert.equal(r.errores.length, 1); assert.match(r.errores[0].error, /Bodega X/);
  assert.equal(r.listos[0].unidad, "Bolsa"); assert.equal(r.listos[0].ubicacionId, "almacen");
  assert.equal(r.listos[1].tipo, "individual"); assert.equal(r.listos[1].cantidad, 2); assert.equal(r.listos[1].asignadoA, "e1"); assert.equal(r.listos[1].estado, "bueno");
  assert.equal(r.listos[2].categoria, "herramientas_perforacion"); assert.equal(r.listos[2].estado, "en_operacion"); assert.equal(r.listos[2].ubicacionId, "proy:VILLA SAN MIGUEL");
  const tsv = "nombre\tcategoria\ttipo\tcantidad\tunidad\nPica jumbo\tInsumos\tcantidad\t15\tUnidad";
  const r2 = prepararImportacion(parseTabla(tsv).filas, { ubicaciones: ubic, ubicacionDefault: "almacen" });
  assert.equal(r2.listos[0].categoria, "insumos_perforacion"); assert.equal(r2.listos[0].ubicacionId, "almacen");
});

import { nombreCaja, nivelCaja, estantesDe, textoEstante, resumenCajas, PREFIJO_CAJA, esCaja } from "../src/geoinventory-calc.js";

test("cajas: salida contra la caja, rellenar, mover de estante, resumen", () => {
  const est = [{ id: "est:a", tipo: "estante", ubicacionId: "vault", nombre: "Estante A", niveles: 4, orden: 1 }, { id: "est:b", tipo: "estante", ubicacionId: "vault", nombre: "Estante B", niveles: 4, orden: 2 }, { id: "of:1", tipo: "oficina", nombre: "Oficina" }];
  assert.deepEqual(estantesDe(est, "vault").map(e => e.nombre), ["Estante A", "Estante B"]);
  let caja = { id: "c1", codigo: "CAJ-0001", tipo: "caja", nombre: "Pica jumbo · Drill Master", categoria: "insumos_perforacion", ubicacionId: "vault", estanteId: "est:a", nivel: 2, caja: { contenido: "Pica", marca: "Drill Master", tamano: "jumbo", cantidad: 15, capacidad: 15 } };
  assert.equal(nombreCaja(caja.caja), "Pica jumbo · Drill Master");
  assert.equal(textoEstante(est, caja), "Estante A · Nivel 2");
  assert.equal(nivelCaja(caja.caja), "llena");
  assert.equal(stockDe(caja), 15); assert.equal(stockEn(caja, "vault"), 15);
  assert.equal(aplicarMovimiento(caja, { accion: "salida", cantidad: 20 }).error, "En esta caja solo quedan 15.");
  let r = aplicarMovimiento(caja, { accion: "salida", cantidad: 5, a: "proy:AMICI", entregadoA: "e1", entregadoNombre: "Juan" }, { by: "administrador" });
  assert.equal(r.item.caja.cantidad, 10); assert.equal(r.mov.contenido, "Pica"); assert.equal(r.mov.a, "proy:AMICI");
  assert.equal(textoMovimiento(r.mov, [{ id: "vault", nombre: "GeoDrill Vault" }, { id: "proy:AMICI", nombre: "AMICI" }]), "−5 picas de GeoDrill Vault → AMICI → Juan");
  assert.equal(nivelCaja(r.item.caja), "parcial");
  r = aplicarMovimiento(r.item, { accion: "salida", cantidad: 10 }); assert.equal(nivelCaja(r.item.caja), "vacia");
  assert.ok(buscarItems([r.item], { ubicacionId: "vault" }).length === 1, "la caja vacía sigue en su estante");
  r = aplicarMovimiento(r.item, { accion: "entrada", cantidad: 15 }); assert.equal(r.item.caja.cantidad, 15);
  assert.equal(aplicarMovimiento(r.item, { accion: "mover", a: "vault", estanteId: "est:a", nivel: 2 }).error, "Ya está ahí.");
  r = aplicarMovimiento(r.item, { accion: "mover", a: "vault", estanteId: "est:b", nivel: 1 }); assert.equal(r.item.estanteId, "est:b"); assert.equal(r.mov.aNivel, 1);
  r = aplicarMovimiento(r.item, { accion: "mover", a: "taller" }); assert.equal(r.item.estanteId, ""); assert.equal(r.item.ubicacionId, "taller");
  assert.deepEqual(siguientesCodigos([caja], PREFIJO_CAJA, 2), ["CAJ-0002", "CAJ-0003"]);
  assert.ok(esCaja(caja) && !esCaja({ tipo: "cantidad" }));
  const res = resumenCajas([caja, { ...caja, id: "c2", caja: { ...caja.caja, cantidad: 0 } }, { ...caja, id: "c3", caja: { contenido: "Portapica", cantidad: 8, capacidad: 10 } }]);
  assert.deepEqual(res.map(x => [x.contenido, x.cajas, x.unidades, x.vacias]), [["Pica", 2, 15, 1], ["Portapica", 1, 8, 0]]);
  assert.deepEqual(buscarItems([caja], { q: "pica drill" }).map(i => i.id), ["c1"]);
  // importar cajas
  const ubic = ubicacionesDe({ proyectos: [] });
  const r2 = prepararImportacion(parseTabla("nombre,categoria,tipo,cantidad,ubicacion,marca,cajas,estante,nivel\nPica jumbo,Insumos,caja,15,GeoDrill Vault,Drill Master,6,Estante A,2").filas, { ubicaciones: ubic });
  assert.equal(r2.listos[0].tipo, "caja"); assert.equal(r2.listos[0].cajas, 6); assert.equal(r2.listos[0].estanteNombre, "Estante A"); assert.equal(r2.listos[0].nivel, "2");
});

import { resolverCodigo, codigoNivel, nivelesDe, posicionDe, itemsEnEstante, itemsEnNivel, itemsSinEstante, resumenDe, movimientosDe, muebleLabel } from "../src/geoinventory-calc.js";

test("ubicaciones/estantes/niveles con código y QR; posición de cualquier artículo", () => {
  const guardadas = [
    { id: "vault", codigo: "UBI-0002" },
    { id: "of:1", tipo: "oficina", nombre: "Oficina Operaciones", codigo: "UBI-0001" },
    { id: "est:a", tipo: "estante", ubicacionId: "vault", nombre: "Estante A", mueble: "estante", niveles: 4, codigo: "EST-0001", activa: true },
    { id: "est:r", tipo: "estante", ubicacionId: "almacen", nombre: "Rack 1", mueble: "rack", niveles: 3, codigo: "EST-0002", activa: true },
  ];
  const ubicaciones = ubicacionesDe({ guardadas, proyectos: [{ short: "AMICI" }] });
  assert.equal(ubicaciones.find(u => u.id === "vault").codigo, "UBI-0002");
  assert.equal(ubicaciones.find(u => u.id === "of:1").codigo, "UBI-0001");
  assert.equal(codigoNivel(guardadas[2], 2), "EST-0001-N2");
  assert.deepEqual(nivelesDe(guardadas[3]), ["1", "2", "3"]);
  assert.equal(muebleLabel(guardadas[3]), "Rack");
  assert.equal(codigoDeTexto("https://x/APP/#inv=EST-0001-N2"), "EST-0001-N2");
  assert.equal(codigoDeTexto("ubi-0001"), "UBI-0001");
  const items = [
    { id: "c1", codigo: "CAJ-0001", tipo: "caja", ubicacionId: "vault", estanteId: "est:a", nivel: "2", caja: { contenido: "Pica", cantidad: 15, capacidad: 15 } },
    { id: "c2", codigo: "CAJ-0002", tipo: "caja", ubicacionId: "vault", estanteId: "", nivel: "", caja: { contenido: "Pica", cantidad: 0, capacidad: 15 } },
    { id: "m1", codigo: "MAT-0001", tipo: "cantidad", stock: { almacen: 50, "proy:AMICI": 10 }, posiciones: { almacen: { estanteId: "est:r", nivel: "3" } } },
    { id: "t1", codigo: "TEC-0001", tipo: "individual", ubicacionId: "almacen", estanteId: "est:r", nivel: "1" },
  ];
  assert.deepEqual(resolverCodigo("UBI-0002", { items, guardadas, ubicaciones }), { tipo: "ubicacion", ubicacionId: "vault" });
  assert.equal(resolverCodigo("EST-0001", { items, guardadas, ubicaciones }).tipo, "estante");
  const rn = resolverCodigo("EST-0001-N2", { items, guardadas, ubicaciones }); assert.equal(rn.tipo, "nivel"); assert.equal(rn.nivel, "2");
  assert.equal(resolverCodigo("EST-0001-N9", { items, guardadas, ubicaciones }), null);
  assert.equal(resolverCodigo("CAJ-0001", { items, guardadas, ubicaciones }).item.id, "c1");
  assert.deepEqual(posicionDe(items[2], "almacen"), { estanteId: "est:r", nivel: "3" });
  assert.deepEqual(posicionDe(items[2], "proy:AMICI"), { estanteId: "", nivel: "" });
  assert.deepEqual(itemsEnEstante(items, guardadas[3]).map(i => i.id), ["m1", "t1"]);
  assert.deepEqual(itemsEnNivel(items, guardadas[3], 1).map(i => i.id), ["t1"]);
  assert.deepEqual(itemsEnNivel(items, guardadas[2], 2).map(i => i.id), ["c1"]);
  assert.deepEqual(itemsSinEstante(items, "vault", [guardadas[2]]).map(i => i.id), ["c2"]);
  const r = resumenDe(itemsEnEstante(items, guardadas[2])); assert.equal(r.cajas, 1); assert.equal(r.enCajas[0].unidades, 15);
  // ubicar un artículo por cantidad en un nivel; mover un individual de nivel
  let x = aplicarMovimiento(items[2], { accion: "ubicar", en: "proy:AMICI", estanteId: "est:z", nivel: "1" });
  assert.deepEqual(x.item.posiciones["proy:AMICI"], { estanteId: "est:z", nivel: "1" });
  assert.equal(aplicarMovimiento(items[2], { accion: "ubicar", en: "taller", estanteId: "est:z" }).error, "No hay existencias en esa ubicación.");
  x = aplicarMovimiento(items[3], { accion: "mover", a: "almacen", estanteId: "est:r", nivel: "2" });
  assert.equal(x.item.nivel, "2"); assert.equal(x.mov.aNivel, "2");
  assert.equal(aplicarMovimiento(items[3], { accion: "mover", a: "almacen", estanteId: "est:r", nivel: "1" }).error, "Ya está ahí.");
  x = aplicarMovimiento(items[3], { accion: "mover", a: "of:1" }); assert.equal(x.item.estanteId, ""); assert.equal(x.item.nivel, "");
  assert.deepEqual(movimientosDe([{ a: "vault" }, { de: "almacen" }, { en: "vault" }, { a: "x" }], "vault").length, 2);
});

test("alcance: Óscar solo manipula lo suyo; los demás roles de carga, todo", () => {
  assert.equal(permisosDe("logistica").alcance, "propias");
  assert.equal(permisosDe("asistente_compras").alcance, "todo");
  assert.equal(permisosDe("admin").alcance, "todo");
  assert.equal(permisosDe("tesoreria").alcance, "todo");
});
