// ═══════════════════════════════════════════════════════════════════════════
// ESTILO ÚNICO DE REPORTES (26-oct-2026, Gerson: "todo reporte que exportemos
// del sistema, en PDF o Excel, en estilo Apple, así como hemos hecho todo").
//
// Tres salidas, la MISMA cara:
//   1) Reportes HTML que se abren en una pestaña y se guardan como PDF
//      (`reporteHTML` + `abrirReporte` + piezas r*).
//   2) PDFs hechos con jsPDF (`PDF_TEMA` + `pdfCabecera` / `pdfPie`).
//   3) Excel con exceljs (`libroExcel` + `hojaExcel` + `descargarExcel`):
//      reemplaza a los CSV sin formato.
//
// Reglas de la casa: fondo blanco, texto carbón, UN acento naranja, grises
// cálidos para lo secundario, verde solo para "pagado/positivo" y rojo solo
// para "negativo/vencido". Nada de arcoíris ni emojis. Montos en mono.
// ═══════════════════════════════════════════════════════════════════════════
import { safeDynamicImport } from "./lazyLoad.js";

export const RP = {
  carbon: "#2C2A28", naranja: "#E8762D", naranjaTexto: "#A94E16",
  texto2: "#6E6862", texto3: "#9A948D", linea: "#ECEAE6", lineaFuerte: "#DDDBD7",
  fondo: "#F7F7F5", tinte: "#FDF1E7", verde: "#1F7A4D", rojo: "#B42318",
};
// Para gráficos con varias tajadas/barras: carbón, naranja y grises (nunca arcoíris).
export const PALETA_REPORTE = ["#2C2A28", "#E8762D", "#8A847D", "#F2A36B", "#5B5650", "#C9C4BD", "#B5571C", "#A8A29B"];
export const colorPaleta = (i) => PALETA_REPORTE[i % PALETA_REPORTE.length];

// COLOR POR PROYECTO (29-oct-2026, Gerson: "cada proyecto es un color, solo que
// sean colores pasteles, bonitos"). Cada proyecto de un reporte recibe un tono
// pastel con tres pesos: `bg` (fondos de cabecera y filas), `base` (barras,
// tajadas, puntos de leyenda) y `tinta` (texto sobre el pastel). Sin rojos ni
// rosados: el rojo es del NSP y de lo vencido.
export const PASTEL_PROYECTOS = [
  // 29-oct-2026 (2ª pasada, Gerson: "que por ningún motivo se parezca un
  // color con otro"): un TONO distinto por proyecto (cielo, verde, violeta,
  // turquesa, lima, magenta, café, gris, durazno, amarillo, índigo, oliva),
  // pastel pero con cuerpo. Los que se parecen a las celdas de asistencia
  // (naranja = feriado/domingo, ámbar = incapacidad) van al final.
  { bg: "#D4E6FF", base: "#5E9EEB", tinta: "#1F4F8C" }, // cielo
  { bg: "#CFF0D9", base: "#4DBE77", tinta: "#1F6B3C" }, // verde
  { bg: "#E4D8FF", base: "#9A7AEE", tinta: "#4F3592" }, // violeta
  { bg: "#C9EFEC", base: "#34B5AB", tinta: "#13625C" }, // turquesa
  { bg: "#E5F4C0", base: "#94C42F", tinta: "#4C6B0F" }, // lima
  { bg: "#F6D6F0", base: "#CF6FBE", tinta: "#7C2A6C" }, // magenta
  { bg: "#EBDAC6", base: "#A97B52", tinta: "#5C3D20" }, // café
  { bg: "#DDE2E8", base: "#7E8DA0", tinta: "#38424F" }, // gris
  { bg: "#FFDCC2", base: "#F2924A", tinta: "#8A3F0E" }, // durazno
  { bg: "#FFF0B8", base: "#E9BF2C", tinta: "#6E5600" }, // amarillo
  { bg: "#D6DBFA", base: "#5A6BD8", tinta: "#28348A" }, // índigo
  { bg: "#EAE8C4", base: "#AEA83E", tinta: "#5A5612" }, // oliva
];
export const pastelProyecto = (i) => PASTEL_PROYECTOS[((i % PASTEL_PROYECTOS.length) + PASTEL_PROYECTOS.length) % PASTEL_PROYECTOS.length];
/** {short: pastel} en el orden en que vienen, sin repetir mientras alcancen los tonos. */
export const pastelesDe = (shorts) => { const m = {}; let i = 0; (shorts || []).forEach(s => { if (s != null && !m[s]) m[s] = pastelProyecto(i++); }); return m; };

export const escHTML = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const fmtLps = (n) => "L " + (Number(n) || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtNum = (n, d = 0) => (Number(n) || 0).toLocaleString("es-HN", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fechaGenerado = () => new Date().toLocaleString("es-HN", { timeZone: "America/Tegucigalpa", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });

const LOGO_EMPRESA = { geotecnica: "brand/logo-color.png", subterra: "brand/subterra.png" };

// ── 1) REPORTES HTML ────────────────────────────────────────────────────────
export const REPORTE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${RP.carbon};background:#fff;padding:34px 38px 54px;font-size:11px;line-height:1.45}
.mono,.num{font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.num{text-align:right;white-space:nowrap}
.rp-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}
.rp-marca{display:flex;align-items:center;gap:9px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${RP.texto3}}
.rp-marca img{width:22px;height:22px;border-radius:6px}
.rp-empresa{height:30px;object-fit:contain}
.rp-empresa.subterra{height:62px}
.rp-titulo{font-size:27px;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.rp-sub{font-size:12.5px;color:${RP.texto2};margin-top:6px}
.rp-acento{width:44px;height:3px;border-radius:3px;background:${RP.naranja};margin:16px 0 22px}
.rp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:24px}
.rp-kpi{background:${RP.fondo};border-radius:14px;padding:13px 15px}
.rp-kpi .l{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${RP.texto3}}
.rp-kpi .v{font-size:19px;font-weight:800;letter-spacing:-.02em;margin-top:5px}
.rp-kpi .s{font-size:9.5px;color:${RP.texto3};margin-top:2px}
.rp-sec{margin:0 0 22px}
.rp-sec-t{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid ${RP.lineaFuerte};padding-bottom:7px;margin-bottom:8px}
.rp-sec-t h2{font-size:13.5px;font-weight:800;letter-spacing:-.01em}
.rp-sec-t .x{font-size:10.5px;color:${RP.texto2}}
.rp-caja{border:1px solid ${RP.linea};border-radius:16px;padding:16px 18px}
.rp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px}
table.rp-t{width:100%;border-collapse:collapse}
.rp-t th{font-size:8.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${RP.texto3};text-align:left;padding:7px 8px;border-bottom:1px solid ${RP.lineaFuerte}}
.rp-t td{padding:7px 8px;border-bottom:1px solid ${RP.linea};vertical-align:top}
.rp-t th.num,.rp-t td.num{text-align:right}
.rp-t tr.total td{border-top:1.5px solid ${RP.carbon};border-bottom:none;font-weight:800;padding-top:9px}
.rp-t tr.sub td{background:${RP.fondo};font-weight:700}
.rp-t td.suave{color:${RP.texto2}}
.rp-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:8.5px;font-weight:700;background:${RP.fondo};color:${RP.texto2};white-space:nowrap}
.rp-chip.naranja{background:${RP.tinte};color:${RP.naranjaTexto}}
.rp-chip.verde{background:#E7F3EC;color:${RP.verde}}
.rp-chip.rojo{background:#FBEAE8;color:${RP.rojo}}
.rp-chip.carbon{background:${RP.carbon};color:#fff}
.rp-barra{height:8px;border-radius:99px;background:${RP.fondo};overflow:hidden;display:flex}
.rp-barra i{display:block;height:100%}
.rp-ley{display:flex;align-items:center;gap:8px;font-size:10.5px;margin-bottom:6px}
.rp-ley b{flex:1;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rp-ley .p{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.rp-nota{font-size:10px;color:${RP.texto3};margin-top:6px}
.rp-pie{margin-top:30px;padding-top:10px;border-top:1px solid ${RP.linea};display:flex;justify-content:space-between;font-size:9px;color:${RP.texto3}}
.rp-firmas{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:48px}
.rp-firmas div{border-top:1px solid ${RP.carbon};padding-top:6px;font-size:10px;text-align:center;color:${RP.texto2}}
.np{position:fixed;top:14px;right:14px;display:flex;gap:8px;z-index:5}
.np button{font:700 12px 'Plus Jakarta Sans',sans-serif;padding:9px 16px;border-radius:999px;border:none;cursor:pointer;background:${RP.carbon};color:#fff}
.np button.g{background:${RP.fondo};color:${RP.carbon}}
thead{display:table-header-group}
tr,.rp-kpi,.rp-kpis,.rp-caja,.rp-grid2,.rp-ley{page-break-inside:avoid;break-inside:avoid}
.rp-sec{page-break-inside:avoid;break-inside:avoid}
.rp-sec-t,.rp-titulo,.rp-sub{page-break-after:avoid;break-after:avoid}
.rp-salto{page-break-before:always;break-before:page}
.rp-sec.proy{border-radius:14px;overflow:hidden;border:1px solid var(--pc-bg);padding:0 0 4px}
.rp-sec.proy .rp-sec-t{background:var(--pc-bg);border-bottom:none;padding:9px 14px;margin-bottom:4px}
.rp-sec.proy .rp-sec-t h2{color:var(--pc-tinta);display:flex;align-items:center;gap:8px}
.rp-sec.proy .rp-sec-t h2:before{content:"";width:9px;height:9px;border-radius:3px;background:var(--pc-base);flex-shrink:0}
.rp-sec.proy .rp-sec-t .x{color:var(--pc-tinta)}
.rp-sec.proy > :not(.rp-sec-t){margin-left:8px;margin-right:8px}
.rp-sec.proy .rp-t tr.total td{border-top-color:var(--pc-base)}
.rp-pp{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:700;white-space:nowrap}
@media print{.np{display:none}body{padding:0}}
`;

/**
 * Documento HTML completo de un reporte.
 * @param titulo     "Costo de Mano de Obra"
 * @param subtitulo  "Octubre 2026 · Subterra"
 * @param empresa    "geotecnica" | "subterra" | null (null = Grupo Geotecnica)
 * @param cuerpo     HTML (usar las piezas r*)
 * @param horizontal hoja apaisada — DEFAULT desde el 29-oct-2026. La hoja se
 *                   pide con MEDIDAS (11in 8.5in), no con "letter landscape":
 *                   con la palabra "landscape", Chrome en Windows guardaba un
 *                   PDF vertical con el contenido girado y al abrirlo salía de
 *                   lado. (Gerson:
 *                   "los reportes tienen que ser horizontales"; ningún
 *                   proyecto se parte entre páginas: `.rp-sec` no se corta)
 */
export const reporteHTML = ({ titulo, subtitulo = "", empresa = null, cuerpo = "", horizontal = true, base = import.meta.env.BASE_URL }) => {
  const logoEmp = `${base}${LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica}`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escHTML(titulo)}${subtitulo ? " — " + escHTML(subtitulo) : ""} · GeoCore</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet">
<style>@page{size:${horizontal ? "11in 8.5in" : "8.5in 11in"};margin:14mm 13mm}${REPORTE_CSS}</style></head><body data-hoja="${horizontal ? "h" : "v"}">
<div class="np"><button class="g" onclick="window.close()">Cerrar</button><button class="g" onclick="window.print()">Imprimir</button><button id="rp-descargar" onclick="window.__descargarPDF ? window.__descargarPDF() : window.print()">Descargar PDF</button></div>
<div class="rp-top"><div class="rp-marca"><img src="${base}brand/geocore/geocore-180.png" alt="">GeoCore · Grupo Geotecnica</div><img class="rp-empresa ${empresa === "subterra" ? "subterra" : ""}" src="${logoEmp}" alt=""></div>
<div class="rp-titulo">${escHTML(titulo)}</div>${subtitulo ? `<div class="rp-sub">${escHTML(subtitulo)}</div>` : ""}<div class="rp-acento"></div>
${cuerpo}
<div class="rp-pie"><span>GeoCore · Grupo Geotecnica</span><span>Generado el ${escHTML(fechaGenerado())}</span></div>
</body></html>`;
};

/**
 * Escribe el reporte en una pestaña YA abierta (window.open síncrono en el
 * click) y BAJA EL PDF solo.
 *
 * 30-oct-2026 (Gerson: "cada reporte que bajo viene así", de lado): el PDF ya
 * NO sale del diálogo de imprimir. Con una impresora o "Microsoft Print to PDF"
 * en vertical, Windows metía la hoja horizontal girada dentro de una vertical,
 * y ni el @page con medidas ni el aviso lo evitaban. Ahora `descargarReportePDF`
 * dibuja la página con html2canvas y arma el PDF con jsPDF en la hoja correcta:
 * sale derecho en cualquier computadora. "Imprimir" queda como botón aparte.
 */
export const abrirReporte = (w, html, { imprimir = true } = {}) => {
  if (!w) { alert("Permití las ventanas emergentes para generar el reporte."); return false; }
  w.document.open(); w.document.write(html); w.document.close();
  w.__descargarPDF = () => descargarReportePDF(w);
  if (imprimir) {
    const lanzar = () => setTimeout(() => { try { w.__descargarPDF(); } catch {} }, 350);
    try { (w.document.fonts?.ready || Promise.resolve()).then(() => { if (w.document.readyState === "complete") lanzar(); else w.addEventListener("load", lanzar, { once: true }); }); } catch { lanzar(); }
  }
  return true;
};

const MM_HOJA = { h: { w: 279.4, h: 215.9 }, v: { w: 215.9, h: 279.4 } };
const MARGEN_MM = { x: 13, y: 14 };
const nombreArchivo = (t) => (String(t || "Reporte").replace(/\s*·\s*GeoCore\s*$/, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Reporte") + ".pdf";

/**
 * Dónde cortar cada hoja: en el borde de una sección, de una fila de tabla o de
 * un bloque, nunca a media fila. Una sección o bloque que cabe en una hoja pasa
 * ENTERO a la siguiente (la misma regla que `break-inside: avoid` al imprimir);
 * uno más largo que una hoja se corta entre filas.
 */
export const cortesDePagina = ({ alto, altoHoja, candidatos, bloques = [], saltos = [], tablas = [] }) => {
  const cand = [...new Set(candidatos.map(Math.round))].filter(y => y > 0 && y < alto).sort((a, b) => a - b);
  const enteros = bloques.filter(b => b.fin - b.ini <= altoHoja);
  const forzados = [...new Set(saltos.map(Math.round))].filter(y => y > 0 && y < alto).sort((a, b) => a - b);
  const paginas = [];
  let ini = 0;
  while (ini < alto - 1) {
    // Si la hoja arranca a media tabla, lleva arriba el encabezado de esa tabla.
    const tabla = tablas.find(t => ini > t.ini + 1 && ini < t.fin - 1) || null;
    const util = altoHoja - (tabla ? tabla.cab : 0);
    const tope = ini + util;
    const salto = forzados.find(y => y > ini + 1);
    if (salto != null && salto <= tope) { paginas.push({ ini, fin: salto, tabla }); ini = salto; continue; }
    if (tope >= alto) { paginas.push({ ini, fin: alto, tabla }); break; }
    const posibles = cand.filter(y => y > ini + 1 && y <= tope);
    const limpio = [...posibles].reverse().find(y => !enteros.some(b => y > b.ini + 1 && y < b.fin - 1));
    const corte = limpio ?? posibles[posibles.length - 1] ?? tope;
    paginas.push({ ini, fin: corte, tabla }); ini = corte;
  }
  return paginas;
};

/** Arma y baja el PDF del reporte abierto en `w` (sin el diálogo de imprimir). */
export const descargarReportePDF = async (w) => {
  const d = w.document, body = d.body;
  if (w.__generandoPDF) return;
  w.__generandoPDF = true;
  const boton = d.getElementById("rp-descargar");
  const textoBoton = boton?.textContent;
  if (boton) { boton.textContent = "Generando PDF…"; boton.disabled = true; }
  const hoja = MM_HOJA[body.dataset.hoja === "v" ? "v" : "h"];
  const anchoMm = hoja.w - 2 * MARGEN_MM.x, altoMm = hoja.h - 2 * MARGEN_MM.y;
  const anchoPx = Math.round(anchoMm / 25.4 * 96);
  const pxPorMm = anchoPx / anchoMm;
  const estiloPrevio = body.getAttribute("style") || "";
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      safeDynamicImport(() => import("html2canvas"), "html2canvas"),
      safeDynamicImport(() => import("jspdf"), "jspdf"),
    ]);
    try { await d.fonts?.ready; } catch {}
    await Promise.all([...d.images].map(im => im.complete ? null : new Promise(r => { im.onload = im.onerror = r; })));
    // La página toma el ancho EXACTO del área imprimible (sin padding ni botones).
    body.setAttribute("style", `${estiloPrevio};width:${anchoPx}px;padding:0;margin:0`);
    const np = d.querySelector(".np"); if (np) np.style.display = "none";
    w.scrollTo(0, 0);
    await new Promise(r => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));
    const base = body.getBoundingClientRect().top;
    const y = (el) => el.getBoundingClientRect().top - base;
    const yFin = (el) => el.getBoundingClientRect().bottom - base;
    const alto = Math.ceil(body.scrollHeight);
    const candidatos = [], bloques = [], saltos = [];
    [...body.children].forEach(el => { if (el.classList.contains("np")) return; candidatos.push(y(el), yFin(el)); });
    body.querySelectorAll(".rp-sec, .rp-kpis, .rp-caja, .rp-grid2, .rp-firmas, .rp-ley, tr").forEach(el => {
      candidatos.push(y(el), yFin(el));
      if (!el.matches("tr")) bloques.push({ ini: y(el), fin: yFin(el) });
    });
    body.querySelectorAll(".rp-sec-t").forEach(el => bloques.push({ ini: y(el), fin: yFin(el.nextElementSibling || el) }));
    body.querySelectorAll(".rp-salto").forEach(el => saltos.push(y(el)));
    const tablas = [...body.querySelectorAll("table")].map(t => { const th = t.tHead; return th ? { ini: yFin(th), fin: yFin(t), cab: Math.ceil(th.getBoundingClientRect().height), y: y(th) } : null; }).filter(Boolean);
    const paginas = cortesDePagina({ alto, altoHoja: Math.floor(altoMm * pxPorMm), candidatos, bloques, saltos, tablas });
    const opciones = { scale: 2.4, backgroundColor: "#ffffff", useCORS: true, logging: false, x: 0, width: anchoPx, windowWidth: anchoPx, scrollX: 0, scrollY: 0, ignoreElements: (el) => el.classList?.contains("np") };
    const cabeceras = new Map();
    const pdf = new jsPDF({ orientation: body.dataset.hoja === "v" ? "portrait" : "landscape", unit: "mm", format: "letter" });
    for (let i = 0; i < paginas.length; i++) {
      const { ini, fin, tabla } = paginas[i];
      if (boton) boton.textContent = `Generando PDF… ${i + 1}/${paginas.length}`;
      if (i > 0) pdf.addPage();
      let yMm = MARGEN_MM.y;
      if (tabla) {
        if (!cabeceras.has(tabla)) cabeceras.set(tabla, (await html2canvas(body, { ...opciones, y: tabla.y, height: tabla.cab })).toDataURL("image/jpeg", 0.92));
        pdf.addImage(cabeceras.get(tabla), "JPEG", MARGEN_MM.x, yMm, anchoMm, tabla.cab / pxPorMm, undefined, "FAST");
        yMm += tabla.cab / pxPorMm;
      }
      const canvas = await html2canvas(body, { ...opciones, y: ini, height: fin - ini });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", MARGEN_MM.x, yMm, anchoMm, (fin - ini) / pxPorMm, undefined, "FAST");
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); pdf.setTextColor(154, 148, 141);
      pdf.text(`${i + 1} / ${paginas.length}`, hoja.w - MARGEN_MM.x, hoja.h - 6, { align: "right" });
    }
    pdf.save(nombreArchivo(d.title));
  } catch (e) {
    console.error(e);
    if (w.confirm("No pude generar el PDF directo. ¿Abrir el diálogo de imprimir para guardarlo de ahí?")) w.print();
  } finally {
    body.setAttribute("style", estiloPrevio);
    const np = d.querySelector(".np"); if (np) np.style.display = "";
    if (boton) { boton.textContent = textoBoton; boton.disabled = false; }
    w.__generandoPDF = false;
  }
};

// Piezas (devuelven strings HTML)
/** items: [{label, valor, sub?, tono?: "naranja"|"verde"|"rojo"}] */
export const rKpis = (items) => `<div class="rp-kpis">${items.filter(Boolean).map(k => `<div class="rp-kpi"><div class="l">${escHTML(k.label)}</div><div class="v ${k.mono === false ? "" : "mono"}" style="${k.tono ? `color:${RP[k.tono] || k.tono}` : ""}">${k.valorHTML ?? escHTML(k.valor)}</div>${k.sub ? `<div class="s">${escHTML(k.sub)}</div>` : ""}</div>`).join("")}</div>`;
export const rSeccion = (titulo, html, extra = "") => `<div class="rp-sec"><div class="rp-sec-t"><h2>${escHTML(titulo)}</h2>${extra ? `<span class="x">${extra}</span>` : ""}</div>${html}</div>`;
/** Sección de UN proyecto con su pastel (cabecera tintada). `pc` = pastelProyecto(i). */
export const rSeccionProyecto = (pc, titulo, html, extra = "") => `<div class="rp-sec proy" style="--pc-bg:${pc.bg};--pc-base:${pc.base};--pc-tinta:${pc.tinta}"><div class="rp-sec-t"><h2>${escHTML(titulo)}</h2>${extra ? `<span class="x">${extra}</span>` : ""}</div>${html}</div>`;
/** Pastilla con el pastel del proyecto (para tablas de resumen y leyendas). */
export const rProyecto = (pc, texto) => `<span class="rp-pp" style="background:${pc.bg};color:${pc.tinta}"><span style="width:7px;height:7px;border-radius:2px;background:${pc.base}"></span>${escHTML(texto)}</span>`;
export const rChip = (texto, tono = "") => `<span class="rp-chip ${tono}">${escHTML(texto)}</span>`;
/**
 * Tabla. columnas: [{t, num?, ancho?}] · filas: [[celdas HTML]] · total: [celdas] (opcional)
 * Las celdas son HTML (escapar con escHTML antes). Una fila puede ser {celdas, clase}.
 */
export const rTabla = ({ columnas, filas, total = null }) => `<table class="rp-t"><thead><tr>${columnas.map(c => `<th class="${c.num ? "num" : ""}" style="${c.ancho ? `width:${c.ancho}` : ""}">${escHTML(c.t)}</th>`).join("")}</tr></thead><tbody>
${filas.map(f => { const celdas = Array.isArray(f) ? f : f.celdas; const clase = Array.isArray(f) ? "" : (f.clase || ""); return `<tr class="${clase}">${celdas.map((x, i) => `<td class="${columnas[i]?.num ? "num" : ""}">${x ?? ""}</td>`).join("")}</tr>`; }).join("")}
${total ? `<tr class="total">${total.map((x, i) => `<td class="${columnas[i]?.num ? "num" : ""}">${x ?? ""}</td>`).join("")}</tr>` : ""}</tbody></table>`;
/** Barra apilada: segs [{valor, color}] sobre `maximo`. */
export const rBarra = (segs, maximo) => `<div class="rp-barra">${segs.filter(s => s.valor > 0).map(s => `<i style="width:${Math.max(0.5, (s.valor / (maximo || 1)) * 100).toFixed(1)}%;background:${s.color}"></i>`).join("")}</div>`;
/** Dona SVG + leyenda. segs [{label, valor, color}] */
export const rDona = (segs, { tam = 170, centro = "", centroSub = "" } = {}) => {
  const total = segs.reduce((s, x) => s + (Number(x.valor) || 0), 0);
  const R = tam * 0.36, C = 2 * Math.PI * R, c = tam / 2;
  let acum = 0;
  const arcos = segs.map(sg => { const f = total > 0 ? sg.valor / total : 0; const el = `<circle r="${R}" cx="${c}" cy="${c}" fill="none" stroke="${sg.color}" stroke-width="${tam * 0.16}" stroke-dasharray="${(f * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acum * C).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`; acum += f; return el; }).join("");
  const svg = `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}"><circle r="${R}" cx="${c}" cy="${c}" fill="none" stroke="${RP.fondo}" stroke-width="${tam * 0.16}"/>${arcos}${centro ? `<text x="${c}" y="${c - 2}" text-anchor="middle" font-family="IBM Plex Mono" font-weight="700" font-size="${tam * 0.085}" fill="${RP.carbon}">${escHTML(centro)}</text>` : ""}${centroSub ? `<text x="${c}" y="${c + tam * 0.09}" text-anchor="middle" font-family="Plus Jakarta Sans" font-size="${tam * 0.055}" fill="${RP.texto3}">${escHTML(centroSub)}</text>` : ""}</svg>`;
  const ley = segs.map(sg => `<div class="rp-ley"><span class="p" style="background:${sg.color}"></span><b>${escHTML(sg.label)}</b><span class="mono" style="color:${RP.texto3}">${total > 0 ? ((sg.valor / total) * 100).toFixed(1) : "0"}%</span>${sg.valorTxt != null ? `<span class="mono" style="min-width:90px;text-align:right;font-weight:700">${escHTML(sg.valorTxt)}</span>` : ""}</div>`).join("");
  return `<div style="display:flex;align-items:center;gap:22px">${svg}<div style="flex:1;min-width:0">${ley}</div></div>`;
};

// ── 2) jsPDF ────────────────────────────────────────────────────────────────
const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export const PDF_TEMA = {
  carbon: rgb(RP.carbon), naranja: rgb(RP.naranja), naranjaTexto: rgb(RP.naranjaTexto), texto2: rgb(RP.texto2), texto3: rgb(RP.texto3),
  linea: rgb(RP.linea), lineaFuerte: rgb(RP.lineaFuerte), fondo: rgb(RP.fondo), tinte: rgb(RP.tinte), verde: rgb(RP.verde), rojo: rgb(RP.rojo), blanco: [255, 255, 255],
};
const MAPA_L1 = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "×": "x", "→": "->", "✓": "si", "−": "-" };
/** Helvetica de jsPDF solo trae Latin-1: todo texto pasa por acá. */
export const latin1 = (s) => String(s ?? "").replace(/[–—‘’“”…×→✓−]/g, c => MAPA_L1[c] ?? "").replace(/[^\u0000-ÿ]/g, "");
const imgCache = {};
export const cargarImagen = async (ruta) => {
  if (imgCache[ruta]) return imgCache[ruta];
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}${ruta}`);
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    const dims = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 1, h: 1 }); im.src = dataUrl; });
    return (imgCache[ruta] = { dataUrl, ...dims });
  } catch { return null; }
};
/**
 * Cabecera estándar de una página jsPDF (unidad mm). Devuelve la Y donde
 * sigue el contenido. Dibuja: marca GeoCore arriba a la izquierda, logo de la
 * empresa a la derecha, título grande, subtítulo gris y el acento naranja.
 */
export const pdfCabecera = async (doc, { titulo, subtitulo = "", empresa = null, margen = 14, y = 14 } = {}) => {
  const W = doc.internal.pageSize.getWidth();
  const T = PDF_TEMA;
  const marca = await cargarImagen("brand/geocore/geocore-180.png");
  if (marca) doc.addImage(marca.dataUrl, "PNG", margen, y - 1, 6, 6);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...T.texto3);
  doc.text(latin1("GEOCORE · GRUPO GEOTECNICA"), margen + (marca ? 8 : 0), y + 3.2, { charSpace: 0.4 });
  const logo = await cargarImagen(LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica);
  if (logo) { const h = empresa === "subterra" ? 16 : 9, w = Math.min(42, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", W - margen - w, y - 3.5, w, h); }
  let yy = y + 16;
  doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(...T.carbon);
  doc.text(latin1(titulo), margen, yy);
  if (subtitulo) { yy += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...T.texto2); doc.text(latin1(subtitulo), margen, yy); }
  yy += 5;
  doc.setFillColor(...T.naranja); doc.roundedRect(margen, yy, 12, 0.9, 0.45, 0.45, "F");
  return yy + 8;
};
/** Pie en TODAS las páginas: marca a la izquierda, "Generado el … · página N de M" a la derecha. */
export const pdfPie = (doc, { margen = 14 } = {}) => {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_TEMA.linea); doc.setLineWidth(0.2); doc.line(margen, H - 11, W - margen, H - 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...PDF_TEMA.texto3);
    doc.text("GeoCore · Grupo Geotecnica", margen, H - 7);
    doc.text(latin1(`Generado el ${fechaGenerado()}  ·  página ${i} de ${n}`), W - margen, H - 7, { align: "right" });
  }
};
/** Tile tipo KPI (fondo gris claro redondeado). */
export const pdfKpi = (doc, x, y, w, h, label, valor, { tono } = {}) => {
  const T = PDF_TEMA;
  doc.setFillColor(...T.fondo); doc.roundedRect(x, y, w, h, 3, 3, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...T.texto3);
  doc.text(latin1(String(label).toUpperCase()), x + 4, y + 5.5, { charSpace: 0.3 });
  doc.setFontSize(12.5); doc.setTextColor(...(tono ? T[tono] : T.carbon));
  doc.text(latin1(valor), x + 4, y + h - 4.5);
};

// ── 3) EXCEL (exceljs) ──────────────────────────────────────────────────────
const ARGB = (h) => "FF" + h.replace("#", "").toUpperCase();
export const libroExcel = async () => {
  const mod = await safeDynamicImport(() => import("exceljs/dist/exceljs.min.js"), "excel");
  const ExcelJS = mod.default || mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "GeoCore · Grupo Geotecnica"; wb.created = new Date();
  return wb;
};
/**
 * Hoja con el estilo de la casa: título grande, subtítulo gris, encabezados
 * en gris pequeño con línea abajo, filas con línea fina, totales en negrita
 * con línea carbón arriba, columnas congeladas y anchos fijos.
 * columnas: [{t, key, ancho, formato: "lps"|"num"|"num2"|"pct"|"fecha"|"texto"}]
 * filas: [{[key]: valor, _sub?: true}] · total: {[key]: valor} | null
 */
export const hojaExcel = (wb, { nombre, titulo, subtitulo = "", columnas, filas, total = null }) => {
  const ws = wb.addWorksheet(String(nombre || "Reporte").slice(0, 31), { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  const FUENTE = "Helvetica Neue";
  ws.columns = columnas.map(c => ({ key: c.key, width: c.ancho || 16 }));
  ws.getCell(1, 1).value = titulo; ws.getCell(1, 1).font = { name: FUENTE, size: 16, bold: true, color: { argb: ARGB(RP.carbon) } };
  ws.getRow(1).height = 24;
  ws.getCell(2, 1).value = [subtitulo, `GeoCore · Grupo Geotecnica · generado el ${fechaGenerado()}`].filter(Boolean).join("  ·  ");
  ws.getCell(2, 1).font = { name: FUENTE, size: 10, color: { argb: ARGB(RP.texto2) } };
  const enc = ws.getRow(4);
  columnas.forEach((c, i) => {
    const cell = enc.getCell(i + 1);
    cell.value = String(c.t).toUpperCase();
    cell.font = { name: FUENTE, size: 8.5, bold: true, color: { argb: ARGB(RP.texto3) } };
    cell.alignment = { horizontal: ["lps", "num", "num2", "pct"].includes(c.formato) ? "right" : "left", vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: ARGB(RP.lineaFuerte) } } };
  });
  enc.height = 20;
  const FMT = { lps: '"L "#,##0.00', num: "#,##0", num2: "#,##0.00", pct: "0.0%", fecha: "dd-mmm-yyyy" };
  const pintar = (row, esTotal, esSub) => {
    columnas.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.font = { name: c.formato && c.formato !== "texto" && c.formato !== "fecha" ? "Menlo" : FUENTE, size: 10, bold: esTotal || esSub, color: { argb: ARGB(RP.carbon) } };
      if (FMT[c.formato]) cell.numFmt = FMT[c.formato];
      cell.alignment = { vertical: "top", wrapText: c.formato === "texto" || !c.formato, horizontal: ["lps", "num", "num2", "pct"].includes(c.formato) ? "right" : "left" };
      cell.border = esTotal ? { top: { style: "medium", color: { argb: ARGB(RP.carbon) } } } : { bottom: { style: "hair", color: { argb: ARGB(RP.lineaFuerte) } } };
      if (esSub) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB(RP.fondo) } };
    });
  };
  filas.forEach(f => { const row = ws.addRow(columnas.map(c => f[c.key] ?? null)); pintar(row, false, !!f._sub); });
  if (total) { const row = ws.addRow(columnas.map(c => total[c.key] ?? null)); pintar(row, true, false); }
  return ws;
};
export const descargarExcel = async (wb, nombreArchivo) => {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nombreArchivo.endsWith(".xlsx") ? nombreArchivo : nombreArchivo + ".xlsx";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
