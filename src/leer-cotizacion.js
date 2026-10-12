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
const RUIDO = /^(disponible|nacional|importado|agotado|existencia|stock|en|tienda|bodega|si|no)$/i;

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
  const pats = [
    /N[°ºo]\.?\s*(?:de\s*)?cotizaci[oó]n\s*:?\s*\|?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i,
    /cotizaci[oó]n\s*\|?\s*(?:N[°ºo]\.?|#|No\.?|Num\.?|n[uú]mero)\s*:?\s*\|?\s*([A-Z0-9][A-Z0-9\-\/]*(?:\s*\|\s*[0-9][0-9\-]{3,})?)/i,
    /\b(COT[-\s]?\d[\w\-\/]*)/i,
    /cotizaci[oó]n\s*:?\s*\|?\s*([A-Z0-9][A-Z0-9\-\/]{3,})/i,
  ];
  for (const re of pats) { const m = re.exec(texto); if (m) { numero = m[1].replace(/\s*\|\s*/g, " ").trim(); break; } }
  // ── RTN y proveedor ──
  const rtns = [...texto.matchAll(/R\.?\s*T\.?\s*N\.?\s*(?:No\.?|#)?\s*:?\s*\|?\s*([\d][\d\-\s]{12,20}\d)/gi)].map(m => m[1].replace(/\D/g, "")).filter(r => r.length === 14);
  const norm = (t) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const VACIAS = new Set(["s", "a", "de", "c", "v", "sa", "cv", "rl", "srl", "sociedad", "anonima", "capital", "variable", "la", "el", "y", "comercial", "casa", "grupo", "inversiones", "honduras"]);
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
