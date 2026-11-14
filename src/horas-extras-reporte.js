// =====================================================================
// HORAS EXTRAS — Reporte para planilla (PDF jsPDF, se baja directo)
// =====================================================================
// 14-nov-2026 (Gerson: "que las horas extra también vengan bonitas, así como
// la solicitud de pago de jornales; un clic y se descarga el PDF, que no te
// lleve a otra página"). Antes era un reporte HTML que se abría en otra
// pestaña y se convertía a imagen. Ahora es jsPDF con la MISMA familia visual
// que la planilla, contratistas y jornales: franjas de color por sección
// (Colaborador · Horas por banda · A pagar), filas alternadas, totales en
// naranja, caja carbón con el total y cada proyecto con su pastel.
//
// El cálculo NO vive acá: HRModule arma las filas (por proyecto y por
// colaborador) con la misma regla de siempre (hora base = salario ÷ 30 ÷ 8,
// bandas +25/+50/+75 %, domingo ×2) y este módulo solo las dibuja.
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";
import { MONEDA } from "./operacion.js";
import { PDF_TEMA, pdfKpi, pdfPie, pdfElaborado, cargarImagen, LOGO_EMPRESA, latin1, pastelesDe } from "./reporte-estilo.js";

const T = PDF_TEMA;
const nf = (n, d = 2) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const L$ = (n) => `${MONEDA} ${nf(n)}`;
const h1 = (v) => { const x = Number(v) || 0; return x % 1 ? nf(x, 2).replace(/0$/, "") : String(x); };
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

const SEC = {
  col: { t: "Colaborador", head: [241, 240, 237], cell: [255, 255, 255], tinta: [110, 104, 98] },
  he: { t: "Horas extra por banda", head: [252, 239, 208], cell: [254, 249, 236], tinta: [138, 90, 0] },
  tot: { t: "Total", head: [220, 232, 248], cell: [250, 251, 253], tinta: [31, 79, 140] },
  neto: { t: "A pagar", head: [251, 217, 191], cell: [253, 238, 225], tinta: [169, 78, 22] },
};

/**
 * empresa: "geotecnica" | "subterra"
 * nombreEmpresa, quincena ("1Q"), periodo ("2026-10"), pago (texto "1Q 2026-11 (15 del mes)")
 * proyectos = [{ short, nombre, hrs, costo, filas: [fila] }]   (detalle por proyecto)
 * grupos = [{ titulo, filas: [fila] }]                          (resumen por colaborador)
 * fila = { nombre, hb, ajuste, b1, b2, b3, dom, hrs, total }
 */
export const construirHorasExtrasPDF = async ({ empresa = "geotecnica", nombreEmpresa = "", quincena, periodo, pago, proyectos, grupos, hayAjuste, elaboradoPor = "", jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 12, CW = PW - 2 * M, Y_MAX = PH - 16;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c), fc = (c) => doc.setFillColor(...c), dc = (c) => doc.setDrawColor(...c);
  const t = (s, x, y, o) => doc.text(latin1(s), x, y, o);
  const recortar = (s, w) => { let x = latin1(s); if (doc.getTextWidth(x) <= w) return x; while (x.length > 1 && doc.getTextWidth(x + "...") > w) x = x.slice(0, -1); return x.trimEnd() + "..."; };
  const ctx = { y: M, sub: `Horas extras · ${nombreEmpresa} · ${quincena} ${periodo}` };
  const marca = await cargarImagen("brand/geocore/geocore-180.png");
  const logo = await cargarImagen(LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica);
  const subterra = empresa === "subterra";
  const pc = pastelesDe(proyectos.map(p => p.short));
  const granH = proyectos.reduce((a, p) => a + p.hrs, 0), granL = proyectos.reduce((a, p) => a + p.costo, 0);
  const nColab = new Set(grupos.flatMap(g => g.filas.map(r => r.nombre))).size;

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
  f(18, "bold"); tc(T.carbon); t("Planilla de horas extras", M, y);
  y += 7; f(11, "bold"); tc(T.naranjaTexto); t(`${nombreEmpresa} · quincena trabajada ${quincena} ${periodo}`, M, y);
  y += 6; f(9); tc(T.texto2); t(`Se paga en la planilla ${pago}`, M, y);
  fc(T.naranja); doc.rect(M, y + 4, 22, 1, "F");
  ctx.y = y + 10;
  const kw = (CW - 9) / 4;
  pdfKpi(doc, M, ctx.y, kw, 15, "Total a pagar", L$(granL), { tono: "naranjaTexto" });
  pdfKpi(doc, M + (kw + 3), ctx.y, kw, 15, "Horas extra", `${h1(granH)} h`);
  pdfKpi(doc, M + 2 * (kw + 3), ctx.y, kw, 15, "Colaboradores", String(nColab));
  pdfKpi(doc, M + 3 * (kw + 3), ctx.y, kw, 15, "Proyectos", String(proyectos.length));
  ctx.y += 22;

  // ── Por proyecto (resumen con barras del pastel de cada uno) ──
  if (proyectos.length > 1) {
    rotulo("Por proyecto");
    const max = Math.max(...proyectos.map(p => p.costo), 1);
    const cs = [["Proyecto", 0], ["Colaboradores", 26], ["Horas", 22], ["Total", 32], ["", 60]];
    const fijo = cs.reduce((a, c) => a + c[1], 0); let x = M; const xs = cs.map(c => { const w = c[1] || CW - fijo; const o = { x, w }; x += w; return o; });
    fc(SEC.col.head); doc.rect(M, ctx.y, CW, 6.5, "F");
    cs.forEach((c, i) => { if (!c[0]) return; f(5.8, "bold"); tc(SEC.col.tinta); if (i === 0) t(c[0].toUpperCase(), xs[i].x + 2, ctx.y + 4.4); else t(c[0].toUpperCase(), xs[i].x + xs[i].w - 2, ctx.y + 4.4, { align: "right" }); });
    ctx.y += 6.5;
    proyectos.forEach((p, i) => {
      asegurar(7.5);
      const c = pc[p.short]; fc(i % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, 7.5, "F");
      fc(hex(c.base)); doc.circle(M + 3.5, ctx.y + 3.75, 1.4, "F");
      f(7.8, "bold"); tc(hex(c.tinta)); const sP = recortar(p.short, xs[0].w - 10); doc.text(sP, M + 7, ctx.y + 5);
      const wS = doc.getTextWidth(sP);
      if (p.nombre && xs[0].w - wS - 14 > 20) { f(7); tc(T.texto3); doc.text(recortar(p.nombre, xs[0].w - wS - 14), M + 9 + wS, ctx.y + 5); }
      f(7.8); tc(T.carbon); t(String(p.filas.length), xs[1].x + xs[1].w - 2, ctx.y + 5, { align: "right" }); t(h1(p.hrs), xs[2].x + xs[2].w - 2, ctx.y + 5, { align: "right" });
      f(7.8, "bold"); tc(T.naranjaTexto); t(L$(p.costo), xs[3].x + xs[3].w - 2, ctx.y + 5, { align: "right" });
      fc([238, 236, 232]); doc.roundedRect(xs[4].x + 4, ctx.y + 2.5, xs[4].w - 6, 2.6, 1.3, 1.3, "F");
      fc(hex(c.base)); doc.roundedRect(xs[4].x + 4, ctx.y + 2.5, Math.max(2.6, (xs[4].w - 6) * p.costo / max), 2.6, 1.3, 1.3, "F");
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + 7.5, PW - M, ctx.y + 7.5);
      ctx.y += 7.5;
    });
    ctx.y += 7;
  }

  // Caja del total + cómo se calcula (en la hoja 1)
  // Caja del total + firmas
  asegurar(30);
  const wN = CW * 0.62, hN = 24;
  fc(T.fondo); doc.roundedRect(M, ctx.y, wN, hN, 3, 3, "F");
  f(6.3, "bold"); tc(T.texto3); t("CÓMO SE CALCULA", M + 5, ctx.y + 5.5, { charSpace: 0.3 });
  f(7.4); tc(T.carbon);
  const nota = `Hora base = salario ÷ 30 ÷ 8 (sin bonificación). 4-7 pm ×1.25 · 7-10 pm ×1.50 · 10 pm-12 am ×1.75 · domingo ×2 en todas las bandas. Sábado: la jornada termina a las 11 am y la banda de +25 % corre de 11 am a 7 pm. Quincena vencida: estas horas de la ${quincena} ${periodo} se pagan en la planilla ${pago}.${hayAjuste ? " * Hora extra pactada sobre un salario base especial (arreglo)." : ""}`;
  doc.text(doc.splitTextToSize(latin1(nota), wN - 10).slice(0, 4), M + 5, ctx.y + 10.5);
  const xT = M + wN + 4, wT = CW - wN - 4;
  fc(T.carbon); doc.roundedRect(xT, ctx.y, wT, hN, 3, 3, "F");
  f(6.5, "bold"); tc([200, 196, 190]); t(`TOTAL HORAS EXTRAS · ${h1(granH)} H`, xT + 6, ctx.y + 7, { charSpace: 0.3 });
  f(20, "bold"); tc([242, 163, 107]); t(L$(granL), xT + 6, ctx.y + 18);
  ctx.y += hN + 8;

  // ── Tabla de colaboradores (la misma para el resumen y el detalle) ──
  const cols = [
    { k: "no", t: "No", w: 8, al: "center", sec: "col" },
    { k: "nombre", t: "Colaborador", w: 0, sec: "col" },
    { k: "hb", t: "Hora base", w: 24, al: "right", sec: "col" },
    { k: "b1", t: "+25 %", sub: "4-7 pm · sáb 11-7", w: 26, al: "center", sec: "he" },
    { k: "b2", t: "+50 %", sub: "7-10 pm", w: 26, al: "center", sec: "he" },
    { k: "b3", t: "+75 %", sub: "10 pm-12 am", w: 26, al: "center", sec: "he" },
    { k: "dom", t: "x2", sub: "domingo", w: 26, al: "center", sec: "he" },
    { k: "hrs", t: "Horas", w: 20, al: "right", sec: "tot" },
    { k: "total", t: "A pagar", w: 34, al: "right", sec: "neto" },
  ];
  const fijo = cols.reduce((a, c) => a + c.w, 0);
  const xs = []; { let x = M; cols.forEach(c => { const w = c.w || CW - fijo; xs.push({ x, w }); x += w; }); }
  const txt = (i, s, yy, { bold = false, color = T.carbon, fs = 7.6 } = {}) => {
    const { x: cx, w } = xs[i], al = cols[i].al || "left"; f(fs, bold ? "bold" : "normal"); tc(color);
    const r = recortar(s, w - 2.5);
    if (al === "right") doc.text(r, cx + w - 2, yy, { align: "right" }); else if (al === "center") doc.text(r, cx + w / 2, yy, { align: "center" }); else doc.text(r, cx + 2, yy);
  };
  const encabezado = () => {
    Object.entries(SEC).forEach(([k, sc]) => {
      const ids = cols.map((c, ci) => c.sec === k ? ci : -1).filter(i => i >= 0); if (!ids.length) return;
      const x0 = xs[ids[0]].x, x1 = xs[ids[ids.length - 1]].x + xs[ids[ids.length - 1]].w;
      fc(sc.head); doc.rect(x0, ctx.y, x1 - x0, 4.4, "F");
      f(5.6, "bold"); tc(sc.tinta); doc.text(recortar(sc.t.toUpperCase(), x1 - x0 - 2), (x0 + x1) / 2, ctx.y + 3.1, { align: "center", charSpace: 0.15 });
    });
    ctx.y += 4.8;
    cols.forEach((c, ci) => { fc(SEC[c.sec].head); doc.rect(xs[ci].x, ctx.y, xs[ci].w, 8, "F"); });
    cols.forEach((c, ci) => {
      if (c.sub) { txt(ci, c.t.toUpperCase(), ctx.y + 3.4, { bold: true, color: SEC[c.sec].tinta, fs: 6.2 }); txt(ci, c.sub, ctx.y + 6.8, { color: SEC[c.sec].tinta, fs: 5.4 }); }
      else txt(ci, c.t.toUpperCase(), ctx.y + 5.2, { bold: true, color: SEC[c.sec].tinta, fs: 6 });
    });
    dc(T.lineaFuerte); doc.setLineWidth(0.25); doc.line(M, ctx.y + 8, PW - M, ctx.y + 8);
    ctx.y += 8;
  };
  const tabla = (filas, etiquetaTotal, hrs, total) => {
    encabezado();
    const alto = 6.6;
    filas.forEach((r, ri) => {
      if (asegurar(alto + (ri === filas.length - 1 ? 8 : 0))) encabezado();
      cols.forEach((c, ci) => { const base = SEC[c.sec].cell; fc(ri % 2 ? base.map(v => Math.max(0, v - 5)) : base); doc.rect(xs[ci].x, ctx.y, xs[ci].w, alto, "F"); });
      const yy = ctx.y + 4.5;
      cols.forEach((c, ci) => {
        if (c.k === "no") txt(ci, String(ri + 1), yy, { color: T.texto3, fs: 7 });
        else if (c.k === "nombre") txt(ci, r.nombre, yy, { bold: true });
        else if (c.k === "hb") txt(ci, `${L$(r.hb)}${r.ajuste ? " *" : ""}`, yy, { color: r.ajuste ? T.naranjaTexto : T.texto2 });
        else if (["b1", "b2", "b3", "dom"].includes(c.k)) {
          const v = Number(r[c.k]) || 0;
          if (v) { const w = xs[ci].w; fc(c.k === "dom" ? [251, 227, 208] : [251, 239, 196]); doc.roundedRect(xs[ci].x + w / 2 - 7, ctx.y + 1.3, 14, alto - 2.6, 1.2, 1.2, "F"); txt(ci, h1(v), yy, { bold: true, color: c.k === "dom" ? [169, 78, 22] : [138, 90, 0] }); }
          else txt(ci, "-", yy, { color: [200, 196, 190] });
        }
        else if (c.k === "hrs") txt(ci, h1(r.hrs), yy, { bold: true, color: SEC.tot.tinta });
        else if (c.k === "total") txt(ci, L$(r.total), yy, { bold: true, color: T.naranjaTexto, fs: 8 });
      });
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
      ctx.y += alto;
    });
    cols.forEach((c, ci) => { fc(SEC[c.sec].head); doc.rect(xs[ci].x, ctx.y, xs[ci].w, 8, "F"); });
    dc([232, 118, 45]); doc.setLineWidth(0.5); doc.line(M, ctx.y, PW - M, ctx.y);
    txt(1, etiquetaTotal, ctx.y + 5.3, { bold: true, fs: 7.8 });
    txt(cols.findIndex(c => c.k === "hrs"), h1(hrs), ctx.y + 5.3, { bold: true, color: SEC.tot.tinta, fs: 7.8 });
    txt(cols.findIndex(c => c.k === "total"), L$(total), ctx.y + 5.3, { bold: true, color: T.naranjaTexto, fs: 8.4 });
    ctx.y += 8 + 7;
  };

  // ── Resumen general por colaborador · para planilla (hoja nueva) ──
  nuevaHoja();
  grupos.forEach((g, gi) => {
    const hrs = g.filas.reduce((a, r) => a + r.hrs, 0), tot = g.filas.reduce((a, r) => a + r.total, 0);
    if (gi > 0) asegurar(40);
    if (gi === 0) rotulo("Resumen general por colaborador · para planilla");
    f(11, "bold"); tc(T.carbon); t(g.titulo, M, ctx.y + 3);
    f(8); tc(T.texto3); t(`${g.filas.length} colaborador${g.filas.length === 1 ? "" : "es"} · ${h1(hrs)} h · ${L$(tot)}`, PW - M, ctx.y + 3, { align: "right" });
    ctx.y += 6.5;
    tabla(g.filas, `Subtotal ${g.titulo.toLowerCase()}`, hrs, tot);
  });

  // Elaborado por al pie del resumen (sin líneas de firma)
  { const yE = ctx.y - 3; if (yE > PH - 15) { nuevaHoja(); pdfElaborado(doc, M, ctx.y + 2); ctx.y += 8; } else { pdfElaborado(doc, M, yE); ctx.y = yE + 6; } }


  // ── Detalle por proyecto · para costos ── (en la misma hoja de las firmas si cabe)
  if (ctx.y + 60 > Y_MAX) nuevaHoja(); else ctx.y += 14;
  rotulo("Detalle por proyecto · para costos por proyecto");
  proyectos.forEach(p => {
    asegurar(36);
    const c = pc[p.short];
    fc(hex(c.bg)); doc.roundedRect(M, ctx.y, CW, 9, 2.5, 2.5, "F");
    fc(hex(c.base)); doc.circle(M + 4.5, ctx.y + 4.5, 1.5, "F");
    f(9, "bold"); tc(hex(c.tinta)); const s = recortar(p.short, CW * 0.4); doc.text(s, M + 8.5, ctx.y + 6);
    if (p.nombre) { const ws = doc.getTextWidth(s); f(7.5); doc.text(recortar(`· ${p.nombre}`, CW - ws - 70), M + 10 + ws, ctx.y + 6); }
    f(8, "bold"); t(`${h1(p.hrs)} h · ${L$(p.costo)}`, PW - M - 4, ctx.y + 6, { align: "right" });
    ctx.y += 11;
    tabla(p.filas, `Subtotal ${p.short}`, p.hrs, p.costo);
  });

  pdfPie(doc, { margen: M });
  return doc;
};

export const pdfHorasExtras = async (args) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = await construirHorasExtrasPDF({ ...args, jsPDF });
  const nombre = `Horas_extras_${String(args.nombreEmpresa || args.empresa).replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, "_")}_${args.quincena}_${args.periodo}.pdf`;
  doc.save(nombre);
  return nombre;
};
