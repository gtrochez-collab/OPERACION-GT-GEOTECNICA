// ─────────────────────────────────────────────────────────────────────────────
// OPERACIONES (9-nov-2026, pedido de Gerson: "me pidieron migrar la operación
// salvadoreña a nuestro sistema; que al entrar pregunte ¿dónde vas a trabajar
// hoy? con un mapa de Centroamérica, y El Salvador con GeoTeam y GeoInventory
// igualitos a Honduras pero vacíos").
//
// Una OPERACIÓN es un país (hn · sv). Toda la data de una operación vive en
// SUS propias filas de app_data: el store le pega el sufijo "@sv" a cada key
// (`hr-emps5@sv`, `inv-items@sv`, `cp-file-abc@sv`…). Honduras NO lleva
// sufijo — sus keys quedan EXACTAMENTE como están, nada se migra. Las keys
// GLOBALES (accesos y tareas personales) nunca llevan sufijo.
//
// La operación se decide AL ARRANCAR la página (sessionStorage `gt-operacion`)
// porque varios módulos arman constantes a nivel de módulo con la lista de
// proyectos, los feriados o las empresas. Cambiar de operación = guardar la
// nueva y RECARGAR (la sesión `gt-session` sobrevive, así que se cae directo
// en la bienvenida). Elegir la misma con la que arrancó no recarga nada.
//
// Pura: sin React ni store, y segura en Node (las pruebas la importan).
// ─────────────────────────────────────────────────────────────────────────────

export const OPERACIONES = [
  {
    id: "hn",
    pais: "Honduras",
    paisId: "340",                  // id Natural Earth (mapa-centroamerica.js)
    empresas: ["geotecnica", "subterra"],
    moneda: "L",
    sedes: [
      { id: "tegucigalpa", nombre: "Tegucigalpa", sub: "Francisco Morazán, Honduras", tipo: "Plantel y oficinas", lon: -87.2068, lat: 14.0818, foto: "brand/login/obra-4.jpg", empresas: ["Geotecnica Soluciones", "Subterra Honduras"] },
    ],
  },
  {
    id: "sv",
    pais: "El Salvador",
    paisId: "222",
    empresas: ["subterra"],
    moneda: "$",
    sedes: [
      { id: "san-salvador", nombre: "San Salvador", sub: "San Salvador, El Salvador", tipo: "Operación", lon: -89.2182, lat: 13.6929, foto: null, empresas: ["Subterra El Salvador"] },
    ],
  },
];
export const OPERACION_DEFAULT = "hn";
const IDS = new Set(OPERACIONES.map(o => o.id));
export const operacionPorId = (id) => OPERACIONES.find(o => o.id === id) || null;

const SS_KEY = "gt-operacion";
const ss = () => { try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; } };
export const leerOperacion = () => { const v = ss()?.getItem(SS_KEY); return IDS.has(v) ? v : null; };
export const guardarOperacion = (id) => { try { if (IDS.has(id)) ss()?.setItem(SS_KEY, id); else ss()?.removeItem(SS_KEY); } catch {} };

/** La operación con la que ARRANCÓ esta página (fija hasta recargar). */
export const OPERACION = leerOperacion() || OPERACION_DEFAULT;
export const esSV = OPERACION === "sv";
export const OPERACION_ACTUAL = operacionPorId(OPERACION) || OPERACIONES[0];

// Keys que NO se separan por operación: los accesos (el login es uno solo) y
// las tareas personales de cada quien.
const esGlobal = (k) => k === "gt-usuarios" || String(k).startsWith("gt-todos-");
const SUFIJO = /@[a-z]{2}$/;
/** Key de `k` en la operación `op` (idempotente: no pega el sufijo dos veces). */
export const keyDe = (k, op = OPERACION) => {
  const s = String(k);
  if (!op || op === OPERACION_DEFAULT || esGlobal(s) || SUFIJO.test(s)) return s;
  return `${s}@${op}`;
};
/** Key de `k` en la operación con la que arrancó la página. */
export const sufijoKey = (k) => keyDe(k, OPERACION);

/** Operaciones a las que puede entrar un usuario (sesión o registro). */
export const operacionesDe = (u) => {
  const ops = Array.isArray(u?.operaciones) ? u.operaciones.filter(x => IDS.has(x)) : [];
  return ops.length ? ops : [OPERACION_DEFAULT];
};
