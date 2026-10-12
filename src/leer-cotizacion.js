// ═══════════════════════════════════════════════════════════════════════════
// LECTOR DE COTIZACIONES (12-oct-2026, pedido de Gerson para GeoMachinery)
// ═══════════════════════════════════════════════════════════════════════════
// "Que el sistema detecte la cotización y agregue los campos — hay unas muy
//  largas y es tedioso escribir una por una; que él solo valide y corrija."
//
// Funciona SIN servicios externos: pdf.js (Mozilla) saca el texto del PDF en
// el navegador con su posición, se arman las FILAS (por altura) y CELDAS, y
// las reglas de abajo reconocen:
//   · los ÍTEMS: toda fila que trae cantidad × precio = total (en ese orden,
//     no necesariamente pegados), sin importar el formato del proveedor;
//   · subtotal, ISV y total ("Monto Bruto", "Subtotal", "Impuesto", "ISV",
//     "Monto Neto", "Total a pagar"…);
//   · el N° de cotización, el RTN y el proveedor (contra cp-providers).
// No lee FOTOS ni PDFs escaneados (no traen texto): esos se escriben a mano.
//
// `parsearCotizacion` es PURA (filas → resultado) y se prueba con Node:
// tests/leer-cotizacion.test.mjs. `leerPdf` es la parte del navegador.

import { esPartidaVarillaPorPeso, cantidadDeVarilla, pesoLanceKg, kgPorUnidad, partidasParaModulo, nombreVarilla } from "./geocost-calc.js";

const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// "L. 1,064.59" · "$24.02" · "1,000" · "648.5086" → número; si no, null.
export const aNumero = (tok) => {
  let s = String(tok || "").trim().replace(/^(?:L\.?|Lps\.?|HNL|\$|USD)\s*/i, "").replace(/\s/g, "").replace(/[}\]*;]+$/, "");
  if (/%$/.test(s)) return null;
  // Coma decimal ("278,26" · "1.234,50"): 1-2 dígitos después de la coma = decimales
  if (/^-?\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^-?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\(?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?$|^-?\(?\d+(?:\.\d+)?\)?$/.test(s)) return null;
  s = s.replace(/[(),]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : null;
};
const esMoneda = (tok) => /^(?:L\.?|Lps\.?|HNL|\$|USD)$/i.test(String(tok || "").trim());

// ── Unidades ──
const UNIDAD_DE = [
  [/^(und|unds|un|u|unid|unidad|unidades|pza|pzas|pz|pieza|piezas|ea|c\/u|cu)$/i, "Unidad"],
  [/^(gal|gals|galon|galones|galón)$/i, "Galón"],
  [/^(lt|lts|litro|litros)$/i, "Litro"],   // "L" solo NO: es Lempiras
  [/^(cub|cubeta|cubetas|balde|baldes)$/i, "Cubeta"],
  [/^(kg|kgs|kilo|kilos)$/i, "kg"],
  [/^(lb|lbs|libra|libras)$/i, "lb"],
  [/^(qq|quintal|quintales)$/i, "Quintal"],
  [/^(ton|tons|tonelada|toneladas|tm)$/i, "Ton"],
  [/^(m|mt|mts|metro|metros|ml)$/i, "m"],
  [/^(m2|mt2|m²)$/i, "m2"],
  [/^(m3|mt3|m³)$/i, "m3"],
  [/^(rollo|rollos|rll)$/i, "Rollo"],
  [/^(caja|cajas|cja|cj)$/i, "Caja"],
  [/^(bolsa|bolsas|saco|sacos)$/i, "Bolsa"],
  [/^(jgo|juego|juegos|kit|kits|set)$/i, "Juego"],
  [/^(par|pares)$/i, "Par"],
  [/^(lance|lances)$/i, "Lance"],
  [/^(global|gbl|glb)$/i, "Global"],
  [/^(servicio|servicios|serv)$/i, "Servicio"],
  [/^(hora|horas|hr|hrs)$/i, "Hora"],
  [/^(dia|dias|día|días)$/i, "Día"],
  [/^(viaje|viajes)$/i, "Viaje"],
  [/^(tubo|tubos)$/i, "Tubo"],
];
export const unidadDe = (tok) => { const t = sinAcentos(String(tok || "").trim().replace(/[.,]$/, "")); const m = UNIDAD_DE.find(([re]) => re.test(t)); return m ? m[1] : null; };
// Pistas dentro de la descripción: "CK-4/CUB", "ACEITE 15W40 GAL"
const unidadEnDescripcion = (desc) => {
  const d = sinAcentos(desc).toUpperCase();
  if (/(^|[\s/\-])(CUB|CUBETA)\b/.test(d)) return "Cubeta";
  if (/(^|[\s/\-])(GAL|GALON)\b/.test(d)) return "Galón";
  if (/(^|[\s/\-])(LT|LTS|LITROS?)\b/.test(d)) return "Litro";
  if (/\bTAMBOR|BARRIL|TONEL\b/.test(d)) return "Tambor";
  return null;
};
// Columnas de inventario que no son parte del nombre
const RUIDO = /^(disponible|nacional|importado|agotado|existencia|stock|en|tienda|bodega|si|no|%|\*+)$/i;

// ── Etiquetas de totales ──
const NUM_TRAS = String.raw`\s*(?:\(\s*\d{1,2}(?:\.\d+)?\s*%\s*\))?\s*:?\s*(?:\|\s*)?(?::\s*)?(?:\|\s*)?(?:L\.?|Lps\.?|\$)?\s*(?:\|\s*)?(?:L\.?|Lps\.?|\$)?\s*([\d,]+(?:\.\d{1,4})?)`;
const RE_SUB = new RegExp(String.raw`(?:sub\s*-?\s*total(?:\s*neto)?|monto\s+bruto|total\s+gravado|importe\s+gravado|total\s+sin\s+isv|valor\s+bruto)` + NUM_TRAS, "i");
const RE_DESC = new RegExp(String.raw`(?:monto\s+)?descuento` + NUM_TRAS, "i");
const RE_ISV = new RegExp(String.raw`(?:monto\s+(?:del?\s+)?impuesto|impuesto(?:\s+sobre\s+ventas)?|imp\.?\s*s\s*\/\s*v|i\.?\s*s\.?\s*v\.?|iva)` + NUM_TRAS, "i");
const RE_TOT = new RegExp(String.raw`(?:total\s+a\s+pagar|monto\s+neto|total\s+general|gran\s+total|total\s+neto|total\s+lps\.?|(?<![a-z])total)` + NUM_TRAS, "i");

/** Arma filas desde los ítems de texto de pdf.js: [{s, x, y}] → [[celdas]] */
export const filasDeItems = (items) => {
  const its = (items || []).filter(it => it && String(it.s || "").trim()).map(it => ({ s: String(it.s).trim(), x: it.x, y: it.y, h: it.h || 8 }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const filas = [];
  for (const it of its) {
    const f = filas.find(l => Math.abs(l.y - it.y) < Math.max(2.5, it.h * 0.35));
    if (f) f.celdas.push(it); else filas.push({ y: it.y, celdas: [it] });
  }
  filas.forEach(f => f.celdas.sort((a, b) => a.x - b.x));
  return filas.sort((a, b) => b.y - a.y);
};

/**
 * filas: [{y, celdas:[{s, x}]}] (de filasDeItems) — o [[string]] para pruebas.
 * providers: cp-providers (para reconocer al proveedor por RTN o nombre).
 * nuestros: nombres de NUESTRAS empresas (para no confundirlas con el proveedor).
 */
export const parsearCotizacion = (filasIn, { providers = [], nuestros = ["geo structure", "geostructure", "geotecnica", "subterra"] } = {}) => {
  const filas = (filasIn || []).map((f, i) => Array.isArray(f) ? { y: -i * 12, celdas: f.map((s, j) => ({ s: String(s), x: j * 50 })) } : f);
  const texto = filas.map(f => f.celdas.map(c => c.s).join(" | ")).join("\n");
  const items = [];
  let ultimo = null, enTotales = false;
  for (const f of filas) {
    const linea = f.celdas.map(c => c.s).join(" | ");
    // Tokens con la celda de donde vienen (para la x de la descripción)
    const toks = [];
    f.celdas.forEach(c => String(c.s).split(/\s+/).filter(Boolean).forEach(t => toks.push({ t, x: c.x })));
    const nums = toks.map((tk, i) => ({ i, v: aNumero(tk.t) })).filter(n => n.v != null);
    const esTotal = RE_SUB.test(linea) || RE_ISV.test(linea) || RE_TOT.test(linea);
    let item = null;
    // Ítem = cantidad (q) × precio (p) que da un número de más a la derecha:
    //   · el total de la línea (lo normal: CEMCOL, ECOMETAL);
    //   · o el subtotal, y después viene descuento → total neto (REASA);
    //   · o el total CON ISV incluido = q × p × 1.15 (Larach).
    if (!esTotal && nums.length >= 3) {
      const tol = (x) => Math.max(0.06, Math.abs(x) * 0.004);
      const last = nums[nums.length - 1];
      busca: for (let kk = nums.length - 1; kk >= 2 && kk >= nums.length - 4; kk--) {
        const S = nums[kk].v;
        if (!(S > 0)) continue;
        for (let jj = kk - 1; jj >= 1 && jj >= kk - 4; jj--) {
          for (let ii = jj - 1; ii >= 0 && ii >= jj - 4; ii--) {
            const q = nums[ii].v, p = nums[jj].v;
            if (!(q > 0) || !(p > 0) || q > 1e6) continue;
            const base = q * p;
            if (Math.abs(base - S) <= tol(S)) {
              let monto = S;
              // ¿descuento después? S − D = último
              if (kk < nums.length - 1 && last.v < S) {
                const entre = nums.slice(kk + 1, nums.length - 1);
                if (entre.some(d => Math.abs(S - d.v - last.v) <= tol(S))) monto = last.v;
              }
              item = { q, p: monto / q, t: monto, iq: nums[ii].i, ip: nums[jj].i, desc: monto < S ? r2(S - monto) : 0 };
              break busca;
            }
            if (kk === nums.length - 1 && Math.abs(base * 1.15 - S) <= Math.max(0.6, S * 0.004)) {
              item = { q, p, t: r2(base), iq: nums[ii].i, ip: nums[jj].i, isvEnLinea: true };
              break busca;
            }
          }
        }
      }
    }
    if (item) {
      // Descripción = lo que está antes de la cantidad (sin el # de fila ni ruido)
      let antes = toks.slice(0, item.iq).map(x => x.t);
      if (antes.length > 1 && /^\d{1,3}\.?$/.test(antes[0])) antes = antes.slice(1);
      // Unidad: palabra pegada a la cantidad (después o antes)
      const despues = toks.slice(item.iq + 1, item.ip).map(x => x.t);
      let unidad = null;
      for (const tk of despues) { if (esMoneda(tk)) continue; const u = unidadDe(tk); if (u) { unidad = u; break; } }
      if (!unidad && antes.length && !esMoneda(antes[antes.length - 1])) { const u = unidadDe(antes[antes.length - 1]); if (u) { unidad = u; antes = antes.slice(0, -1); } }
      // Si después de la cantidad viene texto que no es unidad ni moneda, es descripción (formato "1 | Varilla… | 396.00")
      const extra = despues.filter(tk => !unidadDe(tk) && !esMoneda(tk) && aNumero(tk) == null);
      let nombre = [...antes, ...extra].filter(tk => !esMoneda(tk) && !RUIDO.test(tk)).join(" ").replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
      if (!unidad) unidad = unidadEnDescripcion(nombre) || "Unidad";
      ultimo = { cantidad: item.q, unidad, nombre, precio: r2(item.p * 10000) / 10000, monto: r2(item.t), ...(item.desc ? { descuento: item.desc } : {}), ...(item.isvEnLinea ? { isvEnLinea: true } : {}), _x: toks[0]?.x ?? 0, _y: f.y, _cont: 0 };
      items.push(ultimo);
      enTotales = false;
      continue;
    }
    if (esTotal) { enTotales = true; ultimo = null; continue; }
    // Renglón de continuación de la descripción ("Grado 40, Longitud de 9 metros")
    if (ultimo && !enTotales && ultimo._cont < 2 && nums.filter(n => n.v > 99).length === 0 && !/:/.test(linea) && linea.length <= 90) {
      const x0 = f.celdas[0]?.x ?? 0;
      const cerca = Math.abs((ultimo._y - f.y)) < 26;
      const alineado = f.celdas.length <= 2 && x0 >= ultimo._x - 4;
      if (cerca && alineado) { ultimo.nombre = `${ultimo.nombre} ${f.celdas.map(c => c.s).join(" ")}`.trim(); ultimo._y = f.y; ultimo._cont++; continue; }
    }
    ultimo = null;
  }
  // ── Totales (el ÚLTIMO que aparezca de cada uno) ──
  const ultimoDe = (re) => { let v = null; filas.forEach(f => { const m = re.exec(f.celdas.map(c => c.s).join(" | ")); if (m) { const n = aNumero(m[1]); if (n != null) v = n; } }); return v; };
  const subtotal = ultimoDe(RE_SUB), isv = ultimoDe(RE_ISV), descuento = ultimoDe(RE_DESC);
  let total = null;
  filas.forEach(f => { const ln = f.celdas.map(c => c.s).join(" | "); if (RE_SUB.test(ln)) return; const m = RE_TOT.exec(ln); if (m) { const n = aNumero(m[1]); if (n != null) total = n; } });
  // ── N° de cotización ──
  let numero = "";
  // [ \t] y no \s: el número tiene que estar en la MISMA línea ("COTIZACION\nFecha:"
  // daba "Fecha" — Construsmart). Y tiene que traer al menos un dígito.
  const pats = [
    /N[°ºo]\.?[ \t]*(?:de[ \t]*)?cotizaci[oó]n[ \t]*:?[ \t]*\|?[ \t]*([A-Z0-9][A-Z0-9\-\/]{2,})/i,
    /cotizaci[oó]n[ \t]*\|?[ \t]*(?:N[°ºo]\.?|#|No\.?|Num\.?|n[uú]mero)[ \t]*:?[ \t]*\|?[ \t]*([A-Z0-9][A-Z0-9\-\/]*(?:[ \t]*\|[ \t]*[0-9][0-9\-]{3,})?)/i,
    /\b(COT[-\s]?\d[\w\-\/]*)/i,
    /cotizaci[oó]n[ \t]*:?[ \t]*\|?[ \t]*([A-Z0-9][A-Z0-9\-\/]{3,})/i,
    // "| No.: | S61334" (Construsmart): solo si no apareció nada más claro
    /(?:^|\|)[ \t]*No\.?[ \t]*:[ \t]*\|?[ \t]*([A-Z]{0,3}\d{3,}[\w\-]*)/im,
  ];
  for (const re of pats) { const m = re.exec(texto); if (m && /\d/.test(m[1])) { numero = m[1].replace(/\s*\|\s*/g, " ").trim(); break; } }
  // ── RTN y proveedor ──
  const rtns = [...texto.matchAll(/R\.?\s*T\.?\s*N\.?\s*(?:No\.?|#)?\s*:?\s*\|?\s*([\d][\d\-\s]{12,20}\d)/gi)].map(m => m[1].replace(/\D/g, "")).filter(r => r.length === 14);
  const norm = (t) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const VACIAS = new Set(["s", "a", "de", "c", "v", "sa", "cv", "rl", "srl", "sociedad", "anonima", "capital", "variable", "la", "el", "y", "comercial", "casa", "grupo", "inversiones", "honduras",
    // palabras de giro: solas no identifican a nadie ("Ferretería de Prueba" ≠ "Ferretería AL")
    "ferreteria", "distribuidora", "distribuciones", "comercializadora", "constructora", "materiales", "servicios", "industrial", "industrias", "importadora", "corporacion", "empresa", "agencia", "tienda", "almacen", "deposito", "suministros", "ventas", "equipos"]);
  const tx = " " + norm(texto) + " ";
  const esNuestro = (n) => nuestros.some(x => norm(n).includes(norm(x)));
  let proveedor = null, porRTN = false;
  const digitos = (r) => String(r || "").replace(/\D/g, "");
  for (const r of rtns) { const p = providers.find(pv => digitos(pv.rtn) === r && !esNuestro(pv.name)); if (p) { proveedor = p; porRTN = true; break; } }
  if (!proveedor) {
    let mejor = null;
    providers.forEach(pv => {
      if (!pv?.name || esNuestro(pv.name)) return;
      const toks2 = norm(pv.name).split(" ").filter(w => w.length >= 3 && !VACIAS.has(w));
      if (!toks2.length) return;
      const hits = toks2.filter(w => tx.includes(" " + w + " ") || (w.length >= 6 && tx.includes(w.slice(0, w.length - 1))));
      const score = hits.length / toks2.length + (hits.some(w => w.length >= 5) ? 0.1 : 0);
      if (hits.length && score >= 0.6 && (!mejor || score > mejor.score || (score === mejor.score && toks2.length > mejor.n))) mejor = { pv, score, n: toks2.length };
    });
    proveedor = mejor?.pv || null;
  }
  const suma = r2(items.reduce((a, it) => a + it.monto, 0));
  return {
    items: items.map(({ _x, _y, _cont, ...it }) => it),
    suma, subtotal, isv, descuento, total, numero, rtn: rtns[0] || "",
    proveedor, proveedorPorRTN: porRTN,
    // ¿la suma de los ítems cuadra con lo que dice la cotización?
    cuadraSubtotal: subtotal != null ? Math.abs(subtotal - suma) <= Math.max(1, suma * 0.001) : null,
  };
};

/** Navegador: dataUrl o bytes de un PDF → filas. Usa pdf.js (carga diferida). */
export const leerPdf = async (fuente, importar) => {
  const pdfjs = await importar(() => import("pdfjs-dist"));
  const worker = await importar(() => import("pdfjs-dist/build/pdf.worker.min.mjs?url"));
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let bytes = fuente;
  if (typeof fuente === "string") { const b64 = fuente.split(",")[1] || ""; const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  let filas = [], offset = 0;
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const its = tc.items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5] - offset, h: Math.abs(it.transform[3]) || it.height || 8 }));
    filas = filas.concat(filasDeItems(its));
    offset += 2000;   // las páginas siguientes van "más abajo"
  }
  return filas;
};

// ═══════════════════════════════════════════════════════════════════════════
// EMPAREJAR los renglones de la cotización con lo que se busca
// (12-oct-2026): con los ítems pedidos en GeoSupply o con las partidas de la
// receta en GeoShopping. Parecido de NOMBRE + MEDIDAS (un tubo de 1" nunca va
// con uno de 2") + bonus si la cantidad es la misma.
// ═══════════════════════════════════════════════════════════════════════════
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "para", "con", "y", "x", "en", "tipo", "marca", "color", "un", "una", "por", "a", "c", "u", "cu", "und", "unidad", "unid"]);
const PULG = { "1/4": "1/4in", "3/8": "3/8in", "1/2": "1/2in", "5/8": "5/8in", "3/4": "3/4in", "7/8": "7/8in" };
/** Tokens comparables: minúsculas, sin acentos, medidas normalizadas (2" → 2in, 1/2" → 1/2in, #5 → n5). */
const UNIDAD_CORTA = { metros: "m", metro: "m", mts: "m", mt: "m", m: "m", mm: "mm", cm: "cm", kg: "kg", kgs: "kg", lb: "lb", lbs: "lb", gal: "gal", galon: "gal", galones: "gal", lt: "lt", lts: "lt", litro: "lt", litros: "lt", oz: "oz", yardas: "yd", yarda: "yd", yd: "yd" };
export const tokensDe = (texto) => {
  let t = sinAcentos(texto).toLowerCase()
    .replace(/[”“″]|''/g, '"')
    // Varilla: "#5" · "No.5" · "N° 5" → n5 (antes que las medidas, si no "#5 x 9 m" se leía "5m")
    .replace(/#\s*(\d{1,2})\b/g, " n$1 ").replace(/\bn[°ºo]\.?\s*(\d{1,2})\b/g, " n$1 ")
    // "6x2.35m" → "6m 2.35m" (la unidad del final vale para los dos)
    .replace(/\b(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|mts|mt|m)\b/g, "$1$3 $2$3")
    // "48MMx50MTS" · "4"X6" · "7x0.45x7/8" → se separan las medidas
    .replace(/(\d)\s*(mm|cm|mts|mt|m|"|in)?\s*x\s*(?=\d)/g, "$1$2 ")
    // "6.00" → "6"
    .replace(/(\d+)\.0+(?!\d)/g, "$1")
    // "1-1/4"" → "1y1/4in" (no se confunde con 1" ni con 1/4")
    .replace(/(\d+)[\s-]+(\d\/\d+)\s*(?="|pulg|in\b|plg)/g, "$1y$2")
    .replace(/(\d+(?:y\d\/\d+)?(?:\/\d+)?|\d+\.\d+)\s*(?:"|pulg(?:adas?)?\.?|in\b|plg\.?)/g, "$1in ")
    .replace(/(\d)\s*(metros?|mts|mt|mm|cm|m|kgs?|lbs?|galon(?:es)?|gal|lts?|litros?|oz|yardas?|yd)\b/g, (m0, d, u) => `${d}${UNIDAD_CORTA[u] || u} `)
    // "ADH.P/DUCTO" → "adh p ducto"
    .replace(/([a-z])[./]([a-z])/g, "$1 $2").replace(/([a-z])[./]([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9/.\s]/g, " ");
  const esCodigo = (w) => /^\d{5,}$/.test(w) || /^0\d+$/.test(w) || (/[a-z]{2,}/.test(w) && /\d{3,}/.test(w) && !esMedida(w)) || /^[a-z]\d{3,}$/.test(w);
  return [...new Set(t.split(/\s+/).map(w => w.replace(/^\.+|\.+$/g, "")).filter(w => w && !PALABRAS_VACIAS.has(w) && !esCodigo(w) && (w.length >= 2 || /\d/.test(w))))];
};
const esMedida = (w) => /^\d+(?:y\d+\/\d+)?(?:\/\d+)?(?:\.\d+)?(?:in|mm|cm|m|kg|lb|gal|lt|oz|yd)$/.test(w) || /^n\d{1,2}$/.test(w);
// Clase de medida: pulgadas con pulgadas, # con #, largo con largo…
const claseMedida = (w) => /in$/.test(w) ? "in" : /^n\d/.test(w) ? "n" : /(mm|cm|m)$/.test(w) ? "largo" : /(kg|lb)$/.test(w) ? "peso" : /(gal|lt|oz)$/.test(w) ? "vol" : "otra";
/** 0..1 — qué tanto se parecen dos descripciones. */
export const parecido = (a, b) => {
  const A = tokensDe(a), B = tokensDe(b);
  if (!A.length || !B.length) return 0;
  const setB = new Set(B);
  // prefijos de 5+ letras también cuentan (sanitario ~ sanitaria, potable ~ potables)
  const match = (w) => setB.has(w) || (w.length >= 5 && B.some(v => v.length >= 5 && (v.startsWith(w.slice(0, 5)) || w.startsWith(v.slice(0, 5)))));
  const comunes = A.filter(match).length;
  let s = (2 * comunes) / (A.length + B.length);
  // Medidas: si las dos traen medidas de la MISMA clase (pulgadas, #, largo…)
  // y no comparten ninguna, casi seguro son otra cosa (un tubo de 1" no es uno de 2").
  const mA = A.filter(esMedida), mB = B.filter(esMedida);
  const clases = new Set(mA.map(claseMedida).filter(c => mB.some(w => claseMedida(w) === c)));
  const choca = [...clases].some(c => !mA.some(w => claseMedida(w) === c && setB.has(w)));
  if (choca) s *= 0.25;
  else if (mA.some(w => setB.has(w))) s = Math.min(1, s + 0.1);
  return s;
};

/**
 * items: renglones leídos [{nombre, cantidad, unidad}]; candidatos: [{id, nombre, cantidad?}].
 * unoAUno: cada candidato se usa una sola vez (GeoSupply). En GeoShopping varios
 * renglones pueden ir a la misma partida (tres diámetros de varilla → "Acero").
 * Devuelve { parejas: [{item, cand, score}], sinPareja: [item] } en el orden de la cotización.
 */
export const emparejar = (items, candidatos, { unoAUno = false, minimo = 0.34, ajuste = null } = {}) => {
  const pares = [];
  (items || []).forEach((it, i) => (candidatos || []).forEach(c => {
    let s = parecido(it.nombre, c.nombre);
    if (c.cantidad != null && Number(c.cantidad) > 0 && Math.abs(Number(c.cantidad) - Number(it.cantidad)) < 1e-6) s += 0.08;
    if (ajuste) s = ajuste(it, c, s);
    if (s >= minimo) pares.push({ i, it, c, s });
  }));
  pares.sort((a, b) => b.s - a.s);
  const usadosI = new Set(), usadosC = new Set(), out = new Map();
  pares.forEach(p => {
    if (usadosI.has(p.i) || (unoAUno && usadosC.has(p.c.id))) return;
    usadosI.add(p.i); usadosC.add(p.c.id); out.set(p.i, { item: p.it, cand: p.c, score: Math.round(p.s * 100) / 100 });
  });
  return {
    parejas: (items || []).map((_, i) => out.get(i)).filter(Boolean),
    sinPareja: (items || []).filter((_, i) => !out.has(i)),
  };
};

/** "Varilla corrugada #5 x 9 m" → {n: 5, largo: 9} (lo que se pueda saber). */
export const varillaEnTexto = (texto) => {
  const t = sinAcentos(texto).toLowerCase();
  let n = null;
  const m1 = /#\s*(\d{1,2})\b/.exec(t) || /\bn[°ºo]\.?\s*(\d{1,2})\b/.exec(t) || /\bno\.?\s*(\d{1,2})\b/.exec(t);
  if (m1) n = Number(m1[1]);
  if (!n) { const m2 = /(\d\/\d|1)\s*(?:"|pulg|in\b)/.exec(t); const mapa = { "3/8": 3, "1/2": 4, "5/8": 5, "3/4": 6, "7/8": 7, "1": 8 }; if (m2 && mapa[m2[1]]) n = mapa[m2[1]]; }
  const m3 = /\b(6|9|12)\s*(?:m|mts|metros)\b/.exec(t);
  return { n: n && n >= 2 && n <= 11 ? n : null, largo: m3 ? Number(m3[1]) : null };
};

/**
 * MEMORIA (12-oct-2026, "que aprenda a leerlas"): cómo escribió el proveedor
 * cada cosa y a qué ítem de la receta se cargó, sacado de las compras YA
 * guardadas. Fuentes:
 *   · `l.cot` — el texto del renglón de la cotización (se guarda desde que
 *     existe el lector: cada solicitud confirmada enseña);
 *   · `l.sustituto.nombre` — "Gravín 3/8" se cargó a "Concreto premezclado…".
 * Se recuerda por NOMBRE de partida (no por id) para que sirva en otros
 * proyectos con la misma receta del PM.
 */
export const memoriaDeCompras = (purchases) => {
  const out = [];
  (purchases || []).forEach(p => {
    if (!p || p.status === "rechazado") return;
    (Array.isArray(p.lineas) ? p.lineas : []).forEach(l => {
      if (!l?.partidaId || !l.nombre) return;
      const texto = String(l.cot || l.sustituto?.nombre || "").trim();
      if (!texto) return;
      out.push({ texto, partida: l.nombre, ...(l.sustituto ? { sustituto: l.sustituto } : {}), proveedor: p.provider || "", at: p.createdAt || "" });
    });
  });
  return out;
};
const normNombre = (t) => tokensDe(t).join(" ");
/** El recuerdo más parecido a un renglón (null si no hay uno casi igual). */
export const recordar = (nombre, memoria, minimo = 0.8) => {
  let mejor = null;
  (memoria || []).forEach(m => { const sc = parecido(nombre, m.texto); if (sc >= minimo && (!mejor || sc > mejor.sc || (sc === mejor.sc && m.at > mejor.m.at))) mejor = { m, sc }; });
  return mejor?.m || null;
};
const mismoNombre = (a, b) => { const x = normNombre(a), y = normNombre(b); return !!x && (x === y || parecido(a, b) >= 0.9); };

const r4 = (x) => Math.round((Number(x) + Number.EPSILON) * 10000) / 10000;
const esVarillaTexto = (t) => /varilla|hierro|corrugad/i.test(sinAcentos(t));

/**
 * Cómo se pasa de los montos de los renglones (sin ISV) al TOTAL de la
 * cotización. `factor` multiplica cada monto:
 *   · "isv"          total = suma × 1.15 (lo normal)
 *   · "exenta"       total = suma (no cobra ISV: arena, grava…)
 *   · "proporcional" otra relación razonable (descuento global, mezcla de
 *                    exentos y gravados): se reparte parejo para que cuadre
 *   · "no_cuadra"    la cotización dice otra cosa (falta un renglón o se leyó
 *                    mal): se usa 1.15 y el total de la cotización, y se avisa
 *   · "sin_total"    no se encontró el total: suma × 1.15
 */
export const ajusteAlTotal = (r) => {
  const suma = r2(r?.suma || 0), total = r?.total;
  if (!(suma > 0)) return { factor: 1.15, total: null, modo: "sin_total", suma };
  const tol = Math.max(1, suma * 0.002);
  if (total != null && total > 0) {
    if (Math.abs(total - suma * 1.15) <= tol) return { factor: 1.15, total, modo: "isv", suma };
    if (Math.abs(total - suma) <= tol) return { factor: 1, total, modo: "exenta", suma };
    const ratio = total / suma;
    if (ratio >= 0.85 && ratio <= 1.2) return { factor: ratio, total, modo: "proporcional", suma };
    return { factor: 1.15, total, modo: "no_cuadra", suma, calculado: r2(suma * 1.15) };
  }
  return { factor: 1.15, total: r2(suma * 1.15), modo: "sin_total", suma };
};

/** Una línea de la cotización de GeoSupply a partir de un renglón leído y lo pedido (`c` = {sol, l, pendiente}). */
export const lineaSupplyDe = (item, c, factor = 1.15, score = null) => {
  const { sol, l, pendiente } = c;
  const montoIsv = item.monto * factor;
  const leido = { nombre: item.nombre, cantidad: item.cantidad, unidad: item.unidad, monto: item.monto, score };
  const base = { requestLineId: l.id, requestId: sol.id, justificacion: "", descripcion: l.descripcion, unidad: l.unidad, leido };
  if (l.varilla) {
    const kgL = pesoLanceKg(l.varilla.n, l.varilla.largo), kgU = kgPorUnidad(item.unidad);
    const lances = kgU && kgL ? Math.round((item.cantidad * kgU) / kgL) : item.cantidad;
    const cantidad = cantidadDeVarilla({ ...l.varilla, lances }, l.unidad);
    const puLance = lances > 0 ? r4(montoIsv / lances) : "";
    return { ...base, cantidad, parcial: cantidad < pendiente - 0.0001, lances, puLance, puLps: cantidad > 0 && puLance ? (puLance * lances) / cantidad : "" };
  }
  const cantidad = item.cantidad;
  return { ...base, cantidad, parcial: cantidad < pendiente - 0.0001, puLps: cantidad > 0 ? r4(montoIsv / cantidad) : "" };
};

/**
 * GEOSUPPLY — Ana cotiza: los renglones de la cotización contra lo que está
 * POR COTIZAR en el proyecto (`candidatas` = [{sol, l, pendiente}] del form).
 * Devuelve las líneas con el shape de CotizacionFormImpl, P.U. CON ISV (así se
 * comparan en GeoSupply) y cuadradas al total.
 */
export const lineasSupplyDesdeLectura = (r, candidatas, { memoria = [] } = {}) => {
  const aj = ajusteAlTotal(r);
  const recuerdos = new Map((r?.items || []).map(it => [it, recordar(it.nombre, memoria)]));
  const cands = (candidatas || []).map(c => ({ id: c.l.id, nombre: c.l.varilla ? `${nombreVarilla(c.l.varilla)} ${c.l.descripcion || ""}` : (c.l.descripcion || ""), cantidad: c.l.varilla ? null : c.pendiente, c }));
  const ajuste = (it, cd, s) => {
    const rec = recuerdos.get(it);
    if (rec && mismoNombre(rec.partida, cd.c.l.descripcion)) s = Math.max(s, 0.92);   // ya se confirmó antes
    const vr = cd.c.l.varilla; if (!vr) return s;
    const vt = varillaEnTexto(it.nombre);
    if (vt.n && vt.n !== Number(vr.n)) return s * 0.2;           // otra varilla
    if (vt.largo && vr.largo && vt.largo !== Number(vr.largo)) return s * 0.6;
    return vt.n === Number(vr.n) && esVarillaTexto(it.nombre) ? Math.max(s, 0.75) : s;
  };
  const { parejas, sinPareja } = emparejar(r?.items || [], cands, { unoAUno: true, ajuste });
  const lineas = parejas.map(({ item, cand, score }) => lineaSupplyDe(item, cand.c, aj.factor, score));
  return { lineas, sinPareja, ajuste: aj };
};

let _n = 0;
const idLinea = () => "l" + Date.now().toString(36) + (++_n).toString(36) + Math.random().toString(36).slice(2, 5);
/**
 * GEOSHOPPING — Finanzas carga la solicitud: cada renglón de la cotización se
 * busca en la RECETA del presupuesto (partidas comprables del módulo). Lo que
 * se encuentra queda elegido; lo que no, queda SIN ítem para que lo elijan a
 * mano (o lo quiten) — el form no deja guardar hasta resolverlo.
 * Con varias SOLUCIONES (Muro anclado · Pantalla de pilotes…) se busca en la
 * que más renglones reconoce. Montos SIN ISV, tal cual la cotización: el
 * total de la solicitud (con ISV) se reparte proporcional como siempre.
 * Devuelve líneas con el shape de LineasPresupuesto + `leido` (lo que dice el
 * PDF, solo para mostrar: lineasParaGuardar no lo guarda).
 */
export const lineasPresupuestoDesdeLectura = (r, pres, { modulo = "compras", nuevoId = idLinea, memoria = [] } = {}) => {
  const recuerdos = new Map((r?.items || []).map(it => [it, recordar(it.nombre, memoria)]));
  const partidas = partidasParaModulo(pres, modulo);
  const solDe = (p) => String(p?.solucion || "").trim();
  const sols = [...new Set(partidas.map(solDe).filter(Boolean))];
  const ajuste = (it, c, s) => {
    const rec = recuerdos.get(it);
    if (rec && mismoNombre(rec.partida, c.p.nombre)) s = Math.max(s, 0.92);   // ya se confirmó antes
    // Mismo ítem en dos soluciones: gana el que TIENE plata (el de $0 es
    // "material del cliente" — Aurea 2da Etapa, electromalla).
    if (!(Number(c.p.monto) > 0) && !(Number(c.p.cantidad) * Number(c.p.pu) > 0)) s *= 0.9;
    if (!esPartidaVarillaPorPeso(c.p)) return s;
    // Partida "Acero de refuerzo" en Ton: cualquier varilla de la cotización va ahí
    return esVarillaTexto(it.nombre) ? Math.max(s, 0.7) : s;
  };
  const correr = (ps) => emparejar(r?.items || [], ps.map(p => ({ id: p.id, nombre: p.nombre, p })), { ajuste });
  let mejor = null, solucion = "";
  if (sols.length > 1) {
    sols.forEach(sl => {
      const res = correr(partidas.filter(p => solDe(p) === sl));
      const pts = res.parejas.reduce((a, x) => a + x.score, 0);
      if (!mejor || pts > mejor.pts) { mejor = { ...res, pts }; solucion = sl; }
    });
  } else mejor = correr(partidas);
  const porItem = new Map(mejor.parejas.map(x => [x.item, x]));
  const lineas = (r?.items || []).map(it => {
    const m = porItem.get(it), p = m?.cand.p;
    const leido = { nombre: it.nombre, cantidad: it.cantidad, unidad: it.unidad, monto: it.monto, score: m?.score ?? 0 };
    const base = { id: nuevoId(), monto: String(r2(it.monto)), leido };
    // Sin ítem: categoría y solución quedan libres (siguen a las pills de arriba)
    // y lo que dice la cotización queda listo por si es "otro material".
    if (!p) return { ...base, partidaId: "", cantidad: String(it.cantidad), realNombre: it.nombre, realUnidad: it.unidad, ...(solucion ? { solucion } : {}) };
    const ln = { ...base, partidaId: p.id, categoria: p.categoria || "Otros", ...(solDe(p) ? { solucion: solDe(p) } : {}) };
    // Si la memoria dice que esto se compró como SUSTITUTO de esa partida, igual
    const rec = recuerdos.get(it);
    if (rec?.sustituto && mismoNombre(rec.partida, p.nombre)) return { ...ln, cantidad: String(it.cantidad), real: true, realNombre: rec.sustituto.nombre || it.nombre, realUnidad: rec.sustituto.unidad || it.unidad, realMotivo: rec.sustituto.motivo || "", leido: { ...leido, recordado: true } };
    if (rec) ln.leido = { ...leido, recordado: true };
    if (esPartidaVarillaPorPeso(p)) {
      const kgU = kgPorUnidad(it.unidad), kgP = kgPorUnidad(p.unidad);
      if (kgU && kgP) return { ...ln, cantidad: String(r4((it.cantidad * kgU) / kgP)) };   // la cotización ya viene en peso
      const vt = varillaEnTexto(it.nombre);
      const largo = vt.largo || 9;
      return { ...ln, varN: vt.n ? String(vt.n) : "", varLargo: String(largo), varLances: String(it.cantidad), cantidad: vt.n ? String(cantidadDeVarilla({ n: vt.n, largo, lances: it.cantidad }, p.unidad)) : "" };
    }
    return { ...ln, cantidad: String(it.cantidad) };
  });
  return { lineas, solucion: sols.length > 1 ? solucion : "", nEmparejadas: mejor.parejas.length, sinPareja: mejor.sinPareja, ajuste: ajusteAlTotal(r) };
};

/**
 * Presupuesto con varias soluciones: mueve las líneas a la partida del MISMO
 * nombre (y categoría) en otra solución. Las que no existen allá quedan sin ítem.
 */
export const cambiarSolucionLineas = (lineas, pres, solucion, { modulo = "compras" } = {}) => {
  const partidas = partidasParaModulo(pres, modulo);
  const byId = new Map((pres?.partidas || []).map(p => [p.id, p]));
  const enSol = partidas.filter(p => String(p.solucion || "").trim() === solucion);
  return (lineas || []).map(l => {
    const p = byId.get(l.partidaId);
    if (!p) return { ...l, solucion };
    const igual = enSol.find(x => (x.categoria || "") === (p.categoria || "") && normNombre(x.nombre) === normNombre(p.nombre)) || enSol.find(x => mismoNombre(x.nombre, p.nombre));
    return igual ? { ...l, partidaId: igual.id, solucion, categoria: igual.categoria || l.categoria } : { ...l, partidaId: "", solucion, realNombre: l.realNombre || l.leido?.nombre || "", realUnidad: l.realUnidad || l.leido?.unidad || "" };
  });
};
