// =====================================================================
// CARNET PARA IMPRIMIR (25-nov-2026, Gerson: "carnets para representación,
// con el diseño que tenemos pero con el logo oficial de la empresa: foto,
// posición, código de empleado, un código de barras con el código,
// departamento, DNI, sexo y ya; que se puedan descargar desde GeoTeam")
// =====================================================================
// Tamaño CR80 vertical (53.98 × 85.6 mm, el de las tarjetas de identidad).
// La tarjeta se dibuja en un <canvas> (las curvas de nivel son las mismas del
// carnet de la pantalla, como Path2D) y se mete en un PDF de ese tamaño, una
// hoja por persona. El código de barras es Code 128 (B), sin librerías.
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";

// ── Code 128 ──
// Anchos (barra, espacio, barra…) de los 107 símbolos; 103-105 = Start A/B/C, 106 = Stop.
export const CODE128 = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 " +
  "221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 " +
  "212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
  "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 " +
  "112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 " +
  "214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112").split(" ");

/** Valores Code 128 B de un texto (Start B + datos + checksum + Stop). */
export const valoresCode128B = (texto) => {
  const datos = [...String(texto || "")].map(ch => {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error(`El código tiene un carácter que no va en el código de barras: "${ch}"`);
    return c - 32;
  });
  const suma = datos.reduce((a, v, i) => a + v * (i + 1), 104);
  return [104, ...datos, suma % 103, 106];
};
/** Anchos de módulo alternando barra/espacio, empezando por barra. */
export const anchosCode128 = (texto) => valoresCode128B(texto).flatMap(v => [...CODE128[v]].map(Number));

// ── Dibujo ──
const MM = 12;                       // px por mm del lienzo (~305 dpi)
const W_MM = 53.98, H_MM = 85.6;
const CARBON = "#2C2A28", NARANJA = "#E8762D", GRIS = "#6E6862", GRIS_CLARO = "#A39C92";
const FUENTE = `"Plus Jakarta Sans", Inter, "Helvetica Neue", Arial, sans-serif`;
const MONO = `"IBM Plex Mono", Menlo, Consolas, monospace`;

const cargarImg = (src) => new Promise((res) => {
  if (!src) return res(null);
  const im = new Image();
  im.onload = () => res(im); im.onerror = () => res(null);
  im.src = src;
});
const redondeado = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
// Curvas (viewBox W×H) cubriendo un rectángulo, como preserveAspectRatio "slice".
const curvas = (ctx, c, x, y, w, h, estilo) => {
  if (!c) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  const s = Math.max(w / c.W, h / c.H);
  ctx.translate(x + (w - c.W * s) / 2, y + (h - c.H * s) / 2); ctx.scale(s, s);
  estilo.forEach(([d, color, ancho]) => { if (!d) return; ctx.strokeStyle = color; ctx.lineWidth = ancho; ctx.lineCap = "round"; ctx.stroke(new Path2D(d)); });
  ctx.restore();
};
const partirLineas = (ctx, texto, ancho, max) => {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean); const out = []; let l = "";
  for (const p of palabras) { const t = l ? `${l} ${p}` : p; if (ctx.measureText(t).width <= ancho || !l) l = t; else { out.push(l); l = p; } }
  if (l) out.push(l);
  if (out.length > max) { const r = out.slice(0, max); r[max - 1] = r[max - 1].replace(/\s*\S*$/, "") + "…"; return r; }
  return out;
};
const iniciales = (n) => String(n || "").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();

/**
 * Dibuja el frente del carnet. p = {nombre, cargo, codigo, departamento,
 * docLabel, doc, sexo, foto (dataUrl), logo (url), empresa}; curvasBanda /
 * curvasCuerpo = {tenues, naranja, W, H} (las del carnet de la pantalla).
 */
export const dibujarCarnet = async (p, { curvasBanda, curvasCuerpo } = {}) => {
  const cv = document.createElement("canvas");
  cv.width = Math.round(W_MM * MM); cv.height = Math.round(H_MM * MM);
  const ctx = cv.getContext("2d");
  const k = (mm) => mm * MM;
  const W = cv.width, H = cv.height;
  try { await document.fonts?.ready; } catch { /* sin fuentes cargadas: usa las del sistema */ }
  // Fondo + curvas naranja tenue
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
  curvas(ctx, curvasCuerpo, 0, 0, W, H, [[curvasCuerpo?.tenues, "rgba(232,118,45,.13)", .6], [curvasCuerpo?.naranja, "rgba(232,118,45,.30)", .9]]);
  // Banda carbón con curvas
  const bandaH = k(25);
  const g = ctx.createLinearGradient(0, 0, W, bandaH); g.addColorStop(0, "#2C2A28"); g.addColorStop(1, "#3A3633");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, bandaH);
  curvas(ctx, curvasBanda, 0, 0, W, bandaH, [[curvasBanda?.tenues, "rgba(232,118,45,.32)", .7], [curvasBanda?.naranja, "rgba(232,118,45,.9)", 1]]);
  // Logo oficial en una placa blanca, arriba al centro
  const logo = await cargarImg(p.logo);
  if (logo) {
    const lh = k(7.2), lw = Math.min(k(36), lh * (logo.width / logo.height));
    const pw = lw + k(4.4), ph = lh + k(2.6), px = (W - pw) / 2, py = k(2.6);
    ctx.fillStyle = "rgba(255,255,255,.96)"; redondeado(ctx, px, py, pw, ph, ph / 2); ctx.fill();
    ctx.drawImage(logo, (W - lw) / 2, py + k(1.3), lw, lh);
  } else {
    ctx.fillStyle = "#FFFFFF"; ctx.font = `700 ${k(3)}px ${MONO}`; ctx.textAlign = "center"; ctx.fillText(String(p.empresa || "").toUpperCase(), W / 2, k(8));
  }
  // Foto
  const fs = k(27), fx = (W - fs) / 2, fy = k(13.5);
  ctx.save(); ctx.shadowColor = "rgba(44,42,40,.22)"; ctx.shadowBlur = k(2.2); ctx.shadowOffsetY = k(.8);
  ctx.fillStyle = "#FFFFFF"; redondeado(ctx, fx - k(1), fy - k(1), fs + k(2), fs + k(2), k(6.4)); ctx.fill(); ctx.restore();
  const foto = await cargarImg(p.foto);
  ctx.save(); redondeado(ctx, fx, fy, fs, fs, k(5.6)); ctx.clip();
  if (foto) {
    const s = Math.max(fs / foto.width, fs / foto.height), iw = foto.width * s, ih = foto.height * s;
    ctx.drawImage(foto, fx + (fs - iw) / 2, fy + (fs - ih) / 2, iw, ih);
  } else {
    ctx.fillStyle = "#EFEDEA"; ctx.fillRect(fx, fy, fs, fs);
    ctx.fillStyle = GRIS_CLARO; ctx.font = `800 ${k(9)}px ${FUENTE}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(iniciales(p.nombre), W / 2, fy + fs / 2);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  // Nombre y cargo (el resto se acomoda debajo, según cuántos renglones use el nombre)
  ctx.textAlign = "center"; ctx.fillStyle = CARBON;
  ctx.font = `800 ${k(4.1)}px ${FUENTE}`;
  let y = k(46);
  const lineas = partirLineas(ctx, p.nombre || "—", W - k(8), 2);
  lineas.forEach((l, i) => { ctx.fillText(l, W / 2, y); if (i < lineas.length - 1) y += k(4.5); });
  y += k(4);
  ctx.fillStyle = GRIS; ctx.font = `500 ${k(3)}px ${FUENTE}`;
  let cargo = partirLineas(ctx, p.cargo || "", W - k(8), 2);
  if (cargo.length > 1) { ctx.font = `500 ${k(2.7)}px ${FUENTE}`; cargo = partirLineas(ctx, p.cargo || "", W - k(8), 2); }
  cargo.forEach((l, i) => { ctx.fillText(l, W / 2, y); if (i < cargo.length - 1) y += k(3.3); });
  // Datos: código · DNI / sexo · departamento (columna derecha más ancha para el DNI)
  const sep = Math.max(y + k(2.6), k(53));
  ctx.strokeStyle = "rgba(44,42,40,.09)"; ctx.lineWidth = k(.25); ctx.beginPath(); ctx.moveTo(k(5), sep); ctx.lineTo(W - k(5), sep); ctx.stroke();
  const xIzq = k(5), xDer = k(23.5);
  const celda = (x, yy, ancho, et, val, mono) => {
    ctx.textAlign = "left"; ctx.fillStyle = GRIS_CLARO; ctx.font = `700 ${k(1.85)}px ${FUENTE}`;
    ctx.fillText(et.toUpperCase(), x, yy);
    ctx.fillStyle = mono ? "#A94E16" : CARBON; ctx.font = mono ? `700 ${k(2.9)}px ${MONO}` : `700 ${k(2.75)}px ${FUENTE}`;
    let v = String(val || "—");
    while (ctx.measureText(v).width > ancho && v.length > 2) v = v.slice(0, -2) + "…";
    ctx.fillText(v, x, yy + k(3.5));
  };
  const r1 = sep + k(3.2), r2 = r1 + k(7.3);
  celda(xIzq, r1, xDer - xIzq - k(1.5), "Código", p.codigo, true);
  celda(xDer, r1, W - xDer - k(4), p.docLabel || "DNI", p.doc, false);
  celda(xIzq, r2, xDer - xIzq - k(1.5), "Sexo", p.sexo);
  celda(xDer, r2, W - xDer - k(4), "Departamento", p.departamento);
  // Código de barras
  if (p.codigo) {
    const anchos = anchosCode128(p.codigo);
    const modulos = anchos.reduce((a, b) => a + b, 0);
    const bw = W - k(12), mod = bw / modulos, bx = k(6), by = Math.max(k(73.4), r2 + k(5.6)), bh = Math.min(k(6.6), k(81.3) - by);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(bx - k(2), by - k(1), bw + k(4), bh + k(4.6));
    ctx.fillStyle = CARBON; let x = bx;
    anchos.forEach((a, i) => { if (i % 2 === 0) ctx.fillRect(Math.round(x), by, Math.max(1, Math.round(a * mod)), bh); x += a * mod; });
    ctx.textAlign = "center"; ctx.font = `600 ${k(2.3)}px ${MONO}`; ctx.fillStyle = GRIS;
    ctx.fillText(p.codigo.split("").join(" "), W / 2, by + bh + k(2.7));
  }
  // Filo naranja abajo
  ctx.fillStyle = NARANJA; ctx.fillRect(0, H - k(1.4), W, k(1.4));
  return cv;
};

/** Baja un PDF con un carnet por hoja (CR80 vertical). */
export const descargarCarnets = async (personas, opciones = {}) => {
  if (!personas?.length) throw new Error("No hay a quién hacerle carnet.");
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = new jsPDF({ unit: "mm", format: [W_MM, H_MM], orientation: "portrait" });
  for (let i = 0; i < personas.length; i++) {
    const cv = await dibujarCarnet(personas[i], opciones);
    if (i > 0) doc.addPage([W_MM, H_MM], "portrait");
    doc.addImage(cv.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, W_MM, H_MM);
  }
  const limpio = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const nombre = personas.length === 1 ? `Carnet_${limpio(personas[0].nombre)}.pdf` : `Carnets_${limpio(opciones.titulo || "GeoTeam")}_${personas.length}.pdf`;
  doc.save(nombre);
  return nombre;
};
