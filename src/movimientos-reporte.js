// =====================================================================
// ALTAS Y BAJAS — Reporte de movimientos (PDF jsPDF, se baja directo)
// =====================================================================
// 14-nov-2026 (Gerson: "¿y el reporte de altas y bajas viene como los nuevos
// formatos?"): el reporte HTML que se abría en otra pestaña pasó a jsPDF con la
// familia visual de jornales, horas extras y asistencia: portada con cifras,
// resumen por grupo, la tabla de ALTAS con su franja verde y la de BAJAS con su
// franja roja ("Último día del colaborador en la empresa" = hasta ahí se le
// paga), y firmas. HRModule pasa los movimientos ya filtrados.
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";
import { MONEDA } from "./operacion.js";
import { PDF_TEMA, pdfKpi, pdfPie, pdfElaborado, cargarImagen, LOGO_EMPRESA, latin1 } from "./reporte-estilo.js";

const T = PDF_TEMA;
const nf = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VERDE = { head: [213, 239, 221], cell: [243, 250, 245], tinta: [31, 107, 60] };
const ROJO = { head: [247, 222, 220], cell: [253, 245, 244], tinta: [176, 48, 36] };
const GRIS = { head: [241, 240, 237], cell: [255, 255, 255], tinta: [110, 104, 98] };
const AZUL = { head: [220, 232, 248], cell: [250, 251, 253], tinta: [31, 79, 140] };
const NARANJA = { head: [251, 217, 191], cell: [253, 238, 225], tinta: [169, 78, 22] };

/**
 * empresa, nombreEmpresa, periodoTexto, verSalario, elaboradoPor
 * altas / bajas = [{ nombre, dni, posicion, fecha (texto), q, grupo, contrato, duracion, salario, bonif (bonificación mensual), motivo, notas }]
 * grupos = [{ g, desc, altas, bajas }]
 */
export const construirMovimientosPDF = async ({ empresa = "geotecnica", nombreEmpresa = "", periodoTexto = "", verSalario = true, elaboradoPor = "", altas = [], bajas = [], grupos = [], jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 12, CW = PW - 2 * M, Y_MAX = PH - 16;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c), fc = (c) => doc.setFillColor(...c), dc = (c) => doc.setDrawColor(...c);
  const t = (s, x, y, o) => doc.text(latin1(s), x, y, o);
  const recortar = (s, w) => { let x = latin1(s); if (doc.getTextWidth(x) <= w) return x; while (x.length > 1 && doc.getTextWidth(x + "...") > w) x = x.slice(0, -1); return x.trimEnd() + "..."; };
  const ctx = { y: M, sub: `Altas y bajas · ${nombreEmpresa} · ${periodoTexto}` };
  const marca = await cargarImagen("brand/geocore/geocore-180.png");
  const logo = await cargarImagen(LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica);
  const subterra = empresa === "subterra";
  const encabezadoCont = () => {
    f(7, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M, M + 3.2, { charSpace: 0.4 });
    f(8.5, "bold"); tc(T.carbon); t(ctx.sub, PW - M, M + 3.2, { align: "right" });
    dc(T.linea); doc.setLineWidth(0.2); doc.line(M, M + 7, PW - M, M + 7);
    ctx.y = M + 12;
  };
  const nuevaHoja = () => { doc.addPage(); encabezadoCont(); };
  const asegurar = (h) => { if (ctx.y + h > Y_MAX) { nuevaHoja(); return true; } return false; };
  const rotulo = (s) => { f(6.8, "bold"); tc(T.texto3); t(s.toUpperCase(), M, ctx.y + 3, { charSpace: 0.5 }); ctx.y += 6.5; };

  // ── Portada ──
  if (marca) doc.addImage(marca.dataUrl, "PNG", M, M, 8, 8);
  f(7.5, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M + 11, M + 5.4, { charSpace: 0.5 });
  if (logo) { const h = subterra ? 26 : 14, w = Math.min(70, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", PW - M - w, M - (subterra ? 2 : -1), w, h); }
  let y = M + 22;
  f(18, "bold"); tc(T.carbon); t("Altas y bajas", M, y);
  y += 7; f(11, "bold"); tc(T.naranjaTexto); t(`${nombreEmpresa} · ${periodoTexto}`, M, y);
  y += 6; f(9); tc(T.texto2); t("Movimientos de personal: ingresos y salidas de la empresa", M, y);
  fc(T.naranja); doc.rect(M, y + 4, 22, 1, "F");
  ctx.y = y + 10;
  const neto = altas.length - bajas.length;
  const kw = (CW - 6) / 3;
  pdfKpi(doc, M, ctx.y, kw, 15, "Altas", String(altas.length), altas.length ? { tono: "verde" } : {});
  pdfKpi(doc, M + kw + 3, ctx.y, kw, 15, "Bajas", String(bajas.length), bajas.length ? { tono: "rojo" } : {});
  pdfKpi(doc, M + 2 * (kw + 3), ctx.y, kw, 15, "Neto", `${neto >= 0 ? "+" : ""}${neto}`);
  ctx.y += 22;

  // Resumen por grupo
  rotulo("Resumen por grupo");
  {
    const cs = [["Grupo", 18, "c"], ["Descripción", 0, "l"], ["Altas", 26, "r"], ["Bajas", 26, "r"], ["Neto", 26, "r"]];
    const fijo = cs.reduce((a, c) => a + c[1], 0); let x = M; const xs = cs.map(c => { const w = c[1] || CW - fijo; const o = { x, w }; x += w; return o; });
    fc(GRIS.head); doc.rect(M, ctx.y, CW, 6.5, "F");
    cs.forEach((c, i) => { f(5.8, "bold"); tc(GRIS.tinta); const s = c[0].toUpperCase(); if (c[2] === "r") t(s, xs[i].x + xs[i].w - 3, ctx.y + 4.4, { align: "right" }); else if (c[2] === "c") t(s, xs[i].x + xs[i].w / 2, ctx.y + 4.4, { align: "center" }); else t(s, xs[i].x + 2, ctx.y + 4.4); });
    ctx.y += 6.5;
    grupos.forEach((g, i) => {
      fc(i % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, 7, "F");
      fc(T.carbon); doc.roundedRect(xs[0].x + xs[0].w / 2 - 3.5, ctx.y + 1.4, 7, 4.2, 1, 1, "F"); f(7, "bold"); tc([255, 255, 255]); t(g.g, xs[0].x + xs[0].w / 2, ctx.y + 4.5, { align: "center" });
      f(7.6); tc(T.carbon); doc.text(recortar(g.desc, xs[1].w - 4), xs[1].x + 2, ctx.y + 4.6);
      const n = g.altas - g.bajas;
      f(7.8, "bold"); tc(g.altas ? VERDE.tinta : T.texto3); t(String(g.altas), xs[2].x + xs[2].w - 3, ctx.y + 4.6, { align: "right" });
      tc(g.bajas ? ROJO.tinta : T.texto3); t(String(g.bajas), xs[3].x + xs[3].w - 3, ctx.y + 4.6, { align: "right" });
      tc(T.carbon); t(`${n >= 0 ? "+" : ""}${n}`, xs[4].x + xs[4].w - 3, ctx.y + 4.6, { align: "right" });
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + 7, PW - M, ctx.y + 7);
      ctx.y += 7;
    });
    ctx.y += 8;
  }

  // ── Tabla de movimientos (altas o bajas) ──
  const tablaMov = (lista, esAlta) => {
    const MOV = esAlta ? VERDE : ROJO;
    const cols = [
      { k: "no", t: "No", w: 7, al: "c", sec: "col" },
      { k: "nombre", t: "Colaborador · DNI", w: 56, sec: "col" },
      { k: "posicion", t: "Posición", w: 32, sec: "col" },
      { k: "fecha", t: esAlta ? "Día 1" : "Último día", w: 24, al: "c", sec: "mov" },
      { k: "q", t: "Q", w: 8, al: "c", sec: "mov" },
      { k: "grupo", t: "Grupo", w: 11, al: "c", sec: "mov" },
      { k: "contrato", t: "Contrato", w: 17, sec: "mov" },
      ...(esAlta ? [{ k: "duracion", t: "Duración del contrato", w: 30, al: "c", sec: "mov" }] : []),
      ...(verSalario ? [{ k: "salario", t: "Salario", w: 24, al: "r", sec: "pago" }] : []),
      { k: "motivo", t: "Motivo · notas", w: 0, sec: "nota" },
    ];
    const SEC = { col: { ...GRIS, t: "Colaborador" }, mov: { ...MOV, t: esAlta ? "Ingreso" : "Salida" }, pago: { ...NARANJA, t: "Pago" }, nota: { ...AZUL, t: "Detalle" } };
    const fijo = cols.reduce((a, c) => a + c.w, 0);
    const xs = []; { let x = M; cols.forEach(c => { const w = c.w || CW - fijo; xs.push({ x, w }); x += w; }); }
    const txt = (i, s, yy, { bold = false, color = T.carbon, fs = 7.4 } = {}) => {
      const { x: cx, w } = xs[i], al = cols[i].al || "l"; f(fs, bold ? "bold" : "normal"); tc(color);
      const r = recortar(s, w - 3);
      if (al === "r") doc.text(r, cx + w - 2, yy, { align: "right" }); else if (al === "c") doc.text(r, cx + w / 2, yy, { align: "center" }); else doc.text(r, cx + 2, yy);
    };
    const encabezado = () => {
      Object.entries(SEC).forEach(([k, sc]) => {
        const ids = cols.map((c, ci) => c.sec === k ? ci : -1).filter(i => i >= 0); if (!ids.length) return;
        const x0 = xs[ids[0]].x, x1 = xs[ids[ids.length - 1]].x + xs[ids[ids.length - 1]].w;
        fc(sc.head); doc.rect(x0, ctx.y, x1 - x0, 4.4, "F");
        f(5.6, "bold"); tc(sc.tinta); doc.text(recortar(sc.t.toUpperCase(), x1 - x0 - 2), (x0 + x1) / 2, ctx.y + 3.1, { align: "center", charSpace: 0.15 });
      });
      ctx.y += 4.8;
      cols.forEach((c, ci) => { fc(SEC[c.sec].head); doc.rect(xs[ci].x, ctx.y, xs[ci].w, 7, "F"); txt(ci, c.t.toUpperCase(), ctx.y + 4.6, { bold: true, color: SEC[c.sec].tinta, fs: 5.6 }); });
      dc(T.lineaFuerte); doc.setLineWidth(0.25); doc.line(M, ctx.y + 7, PW - M, ctx.y + 7);
      ctx.y += 7;
    };
    encabezado();
    const alto = 9.2;
    lista.forEach((r, ri) => {
      if (asegurar(alto)) encabezado();
      cols.forEach((c, ci) => { const b = SEC[c.sec].cell; fc(ri % 2 ? b.map(v => Math.max(0, v - 5)) : b); doc.rect(xs[ci].x, ctx.y, xs[ci].w, alto, "F"); });
      const y1 = ctx.y + 4, y2 = ctx.y + 7.5, ym = ctx.y + 5.7;
      cols.forEach((c, ci) => {
        if (c.k === "no") txt(ci, String(ri + 1), ym, { color: T.texto3, fs: 7 });
        else if (c.k === "nombre") { txt(ci, r.nombre, y1, { bold: true }); txt(ci, r.dni || "", y2, { color: T.texto3, fs: 6 }); }
        else if (c.k === "posicion") txt(ci, r.posicion || "-", ym, { color: T.texto2, fs: 7 });
        else if (c.k === "fecha") txt(ci, r.fecha || "-", ym, { bold: true, color: MOV.tinta, fs: 7.8 });
        else if (c.k === "q") txt(ci, r.q || "", ym, { color: T.texto2 });
        else if (c.k === "grupo") { const w = xs[ci].w; fc(T.carbon); doc.roundedRect(xs[ci].x + w / 2 - 3.5, ctx.y + 3, 7, 4.2, 1, 1, "F"); txt(ci, r.grupo || "", ctx.y + 6.1, { bold: true, color: [255, 255, 255], fs: 6.8 }); }
        else if (c.k === "contrato") txt(ci, r.contrato || "", ym, { fs: 7 });
        else if (c.k === "duracion") txt(ci, r.duracion || "-", ym, { bold: r.duracion && r.duracion !== "-", color: r.duracion && r.duracion !== "-" ? T.naranjaTexto : T.texto3, fs: 7 });
        else if (c.k === "salario") { txt(ci, `${MONEDA} ${nf(r.salario)}`, r.bonif ? y1 : ym, { bold: true, color: NARANJA.tinta }); if (r.bonif) txt(ci, `+ ${MONEDA} ${nf(r.bonif)} bonif.`, y2, { color: T.texto2, fs: 6.2 }); }
        else if (c.k === "motivo") { txt(ci, r.motivo || "-", r.notas ? y1 : ym, { bold: true, fs: 7 }); if (r.notas) txt(ci, r.notas, y2, { color: T.texto3, fs: 6.2 }); }
      });
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
      ctx.y += alto;
    });
    cols.forEach((c, ci) => { fc(SEC[c.sec].head); doc.rect(xs[ci].x, ctx.y, xs[ci].w, 7.5, "F"); });
    dc(esAlta ? [77, 190, 119] : [176, 48, 36]); doc.setLineWidth(0.5); doc.line(M, ctx.y, PW - M, ctx.y);
    txt(1, `Total · ${lista.length} ${esAlta ? "alta" : "baja"}${lista.length === 1 ? "" : "s"}`, ctx.y + 5, { bold: true, color: MOV.tinta, fs: 7.8 });
    const totB = lista.reduce((a, r) => a + (Number(r.bonif) || 0), 0);
    if (verSalario) { const iS = cols.findIndex(c => c.k === "salario"); txt(iS, `${MONEDA} ${nf(lista.reduce((a, r) => a + (Number(r.salario) || 0), 0))}`, ctx.y + (totB ? 3.6 : 5), { bold: true, color: NARANJA.tinta, fs: 7.8 }); if (totB) txt(iS, `+ ${MONEDA} ${nf(totB)} bonif.`, ctx.y + 6.6, { color: T.texto2, fs: 6 }); }
    ctx.y += 7.5 + 9;
  };
  const titulo = (s, n, col) => { asegurar(34); f(11.5, "bold"); tc(col); t(s, M, ctx.y + 3); const w = doc.getTextWidth(latin1(s)); f(8); tc(T.texto3); t(`${n} movimiento${n === 1 ? "" : "s"}`, M + w + 3, ctx.y + 3); ctx.y += 7; };
  if (altas.length) { titulo("Altas", altas.length, VERDE.tinta); tablaMov(altas, true); }
  if (bajas.length) { titulo("Bajas", bajas.length, ROJO.tinta); tablaMov(bajas, false); }
  if (!altas.length && !bajas.length) { fc(T.fondo); doc.roundedRect(M, ctx.y, CW, 10, 2, 2, "F"); f(8.5); tc(T.texto2); t("Sin altas ni bajas en este período.", M + 4, ctx.y + 6.4); ctx.y += 16; }
  if (bajas.length) { f(6.8); tc(T.texto3); t("Bajas: \"Último día del colaborador en la empresa\" = hasta ese día (inclusive) se le paga; la asistencia se bloquea desde el día siguiente.", M, ctx.y); ctx.y += 6; }

  // Elaborado por (sin líneas de firma)
  { const yE = ctx.y - 3; if (yE > PH - 15) { nuevaHoja(); pdfElaborado(doc, M, ctx.y + 2); ctx.y += 8; } else { pdfElaborado(doc, M, yE); ctx.y = yE + 6; } }
  pdfPie(doc, { margen: M });
  return doc;
};

export const pdfMovimientos = async (args) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = await construirMovimientosPDF({ ...args, jsPDF });
  const nombre = `Altas_y_bajas_${String(args.nombreEmpresa || args.empresa).replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, "_")}_${String(args.archivo || "todos").replace(/[^\w-]+/g, "_")}.pdf`;
  doc.save(nombre);
  return nombre;
};
