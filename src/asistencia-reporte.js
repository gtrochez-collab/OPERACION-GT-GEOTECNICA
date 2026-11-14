// =====================================================================
// ASISTENCIA — Reporte de la quincena (PDF jsPDF, se baja directo)
// =====================================================================
// 14-nov-2026 (Gerson: "¿y en la asistencia tenemos este tipo de reportes
// nuevos, de Geotecnica y Subterra?"): el reporte HTML que se abría en otra
// pestaña pasó a jsPDF con la familia visual de jornales, contratistas y horas
// extras: portada con cifras, resumen por proyecto con su pastel, leyenda, una
// tabla por proyecto con cada día pintado como en la hoja (1 · descanso · NSP ·
// INC · V · TF/DT/DT2 · bloqueado, y el color del OTRO proyecto en los "1*"),
// y al final el Resumen para planilla (NSP, incapacidades, vacaciones) con
// firmas.
//
// La lógica NO vive acá: HRModule arma cada celda (texto + colores) con las
// mismas reglas de siempre y este módulo solo dibuja.
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA, pdfKpi, pdfPie, pdfElaborado, cargarImagen, LOGO_EMPRESA, latin1 } from "./reporte-estilo.js";

const T = PDF_TEMA;
const hex = (h) => { if (!h || h === "transparent" || h[0] !== "#") return null; const x = h.length === 4 ? "#" + [...h.slice(1)].map(c => c + c).join("") : h; return [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)); };
const n2 = (v) => { const x = Number(v) || 0; return x % 1 ? x.toFixed(2) : String(x); };

const SEC = {
  col: { t: "Colaborador", head: [241, 240, 237], cell: [255, 255, 255], tinta: [110, 104, 98] },
  asis: { t: "Asistencia de la quincena", head: [220, 232, 248], cell: [250, 251, 253], tinta: [31, 79, 140] },
  tot: { t: "Totales", head: [213, 239, 221], cell: [243, 250, 245], tinta: [31, 107, 60] },
};

/**
 * empresa, nombreEmpresa, quincena, periodo, elaboradoPor
 * dias = [{ day, dow, esp (domingo/feriado), fer (feriado) }]
 * proyectos = [{ short, name, code, pastel {bg, base, tinta}, nsp, inc,
 *   filas: [{ nombre, code, celdas: [{ txt, bg, fg, raya, hora }], dias, dom, fer, nsp, inc }] }]
 * leyenda = [{ cod, txt, bg, fg }]
 * otros = [{ short, pastel }]  (proyectos que aparecen en los "1*")
 * planilla = [{ titulo, color, vacio, filas: [{ nombre, code, proj, dias: [n], total }] }]
 */
export const construirAsistenciaPDF = async ({ empresa = "geotecnica", nombreEmpresa = "", quincena, periodo, elaboradoPor = "", dias, proyectos, leyenda = [], otros = [], planilla = [], jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 10, CW = PW - 2 * M, Y_MAX = PH - 15;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c), fc = (c) => doc.setFillColor(...c), dc = (c) => doc.setDrawColor(...c);
  const t = (s, x, y, o) => doc.text(latin1(s), x, y, o);
  const recortar = (s, w) => { let x = latin1(s); if (doc.getTextWidth(x) <= w) return x; while (x.length > 1 && doc.getTextWidth(x + "...") > w) x = x.slice(0, -1); return x.trimEnd() + "..."; };
  const ctx = { y: M, sub: `Asistencia · ${nombreEmpresa} · ${quincena} ${periodo}` };
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
  const chip = (x, y, cod, bg, fg) => { f(6.6, "bold"); const w = Math.max(5.5, doc.getTextWidth(latin1(cod)) + 3); if (bg) { fc(bg); doc.roundedRect(x, y - 3.4, w, 4.6, 1, 1, "F"); } else { dc(T.linea); doc.setLineWidth(0.2); doc.roundedRect(x, y - 3.4, w, 4.6, 1, 1, "S"); } tc(fg || T.carbon); t(cod, x + w / 2, y, { align: "center" }); return w; };

  // ── Portada ──
  const totPersonas = proyectos.reduce((a, p) => a + p.filas.length, 0);
  const totNSP = proyectos.reduce((a, p) => a + p.nsp, 0), totINC = proyectos.reduce((a, p) => a + p.inc, 0);
  if (marca) doc.addImage(marca.dataUrl, "PNG", M, M, 8, 8);
  f(7.5, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M + 11, M + 5.4, { charSpace: 0.5 });
  if (logo) { const h = subterra ? 26 : 14, w = Math.min(70, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", PW - M - w, M - (subterra ? 2 : -1), w, h); }
  let y = M + 22;
  f(18, "bold"); tc(T.carbon); t("Reporte de asistencia", M, y);
  y += 7; f(11, "bold"); tc(T.naranjaTexto); t(`${nombreEmpresa} · quincena ${quincena} ${periodo}`, M, y);
  y += 6; f(9); tc(T.texto2); t(`${dias.length} días · del ${dias[0]?.day} al ${dias[dias.length - 1]?.day}`, M, y);
  fc(T.naranja); doc.rect(M, y + 4, 22, 1, "F");
  ctx.y = y + 10;
  const kw = (CW - 9) / 4;
  pdfKpi(doc, M, ctx.y, kw, 15, "Personas asignadas", String(totPersonas));
  pdfKpi(doc, M + (kw + 3), ctx.y, kw, 15, "Proyectos", String(proyectos.length));
  pdfKpi(doc, M + 2 * (kw + 3), ctx.y, kw, 15, "Inasistencias (NSP)", String(totNSP), totNSP ? { tono: "rojo" } : {});
  pdfKpi(doc, M + 3 * (kw + 3), ctx.y, kw, 15, "Incapacidades", String(totINC), totINC ? { tono: "naranjaTexto" } : {});
  ctx.y += 22;

  // Resumen por proyecto
  rotulo("Resumen por proyecto");
  {
    const cs = [["Proyecto", 0], ["Personas", 30], ["NSP", 26], ["INC", 26]];
    const fijo = cs.reduce((a, c) => a + c[1], 0); let x = M; const xs = cs.map(c => { const w = c[1] || CW - fijo; const o = { x, w }; x += w; return o; });
    fc(SEC.col.head); doc.rect(M, ctx.y, CW, 6.5, "F");
    cs.forEach((c, i) => { f(5.8, "bold"); tc(SEC.col.tinta); if (i === 0) t(c[0].toUpperCase(), xs[i].x + 2, ctx.y + 4.4); else t(c[0].toUpperCase(), xs[i].x + xs[i].w - 3, ctx.y + 4.4, { align: "right" }); });
    ctx.y += 6.5;
    proyectos.forEach((p, i) => {
      asegurar(7);
      fc(i % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, 7, "F");
      fc(hex(p.pastel.base)); doc.circle(M + 3.5, ctx.y + 3.5, 1.4, "F");
      f(7.8, "bold"); tc(hex(p.pastel.tinta)); const sP = recortar(p.short, xs[0].w * 0.6); doc.text(sP, M + 7, ctx.y + 4.7);
      const wS = doc.getTextWidth(sP); if (p.name && p.name !== p.short) { f(7); tc(T.texto3); doc.text(recortar(p.name, xs[0].w - wS - 14), M + 9 + wS, ctx.y + 4.7); }
      f(7.8); tc(T.carbon); t(String(p.filas.length), xs[1].x + xs[1].w - 3, ctx.y + 4.7, { align: "right" });
      f(7.8, p.nsp ? "bold" : "normal"); tc(p.nsp ? [176, 48, 36] : T.texto3); t(String(p.nsp), xs[2].x + xs[2].w - 3, ctx.y + 4.7, { align: "right" });
      f(7.8, p.inc ? "bold" : "normal"); tc(p.inc ? [138, 90, 0] : T.texto3); t(String(p.inc), xs[3].x + xs[3].w - 3, ctx.y + 4.7, { align: "right" });
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + 7, PW - M, ctx.y + 7);
      ctx.y += 7;
    });
    ctx.y += 6;
  }
  // Leyenda
  asegurar(18);
  fc(T.fondo); doc.roundedRect(M, ctx.y, CW, otros.length ? 15 : 9, 2.5, 2.5, "F");
  { let x = M + 4; const yy = ctx.y + 5.8;
    leyenda.forEach(l => { const w = chip(x, yy, l.cod, hex(l.bg), hex(l.fg)); f(6.6); tc(T.texto2); t(l.txt, x + w + 1.5, yy); x += w + 3 + doc.getTextWidth(latin1(l.txt)) + 5; });
    if (otros.length) { let x2 = M + 4; const y2 = ctx.y + 11.8; f(6.6, "bold"); tc(T.texto2); t("* = ese día trabajó en otro proyecto:", x2, y2); x2 += doc.getTextWidth(latin1("* = ese día trabajó en otro proyecto:")) + 3;
      otros.forEach(o => { if (x2 > PW - M - 30) return; const w = chip(x2, y2, o.short, hex(o.pastel.bg), hex(o.pastel.tinta)); x2 += w + 2.5; }); }
  }
  ctx.y += (otros.length ? 15 : 9) + 6;

  // ── Tabla por proyecto ──
  const wNom = 52, wTot = 11, nT = 5;
  const wDia = (CW - wNom - wTot * nT) / dias.length;
  const xsDia = dias.map((_, i) => M + wNom + i * wDia), xTot = M + wNom + dias.length * wDia;
  const TOTS = [["Días", "dias", [23, 114, 67]], ["Dom", "dom", [169, 78, 22]], ["Fer", "fer", [169, 78, 22]], ["NSP", "nsp", [176, 48, 36]], ["INC", "inc", [138, 90, 0]]];
  const encabezado = () => {
    [["col", M, wNom], ["asis", M + wNom, dias.length * wDia], ["tot", xTot, wTot * nT]].forEach(([k, x0, w]) => {
      fc(SEC[k].head); doc.rect(x0, ctx.y, w, 4.2, "F"); f(5.4, "bold"); tc(SEC[k].tinta); t(SEC[k].t.toUpperCase(), x0 + w / 2, ctx.y + 3, { align: "center", charSpace: 0.15 });
    });
    ctx.y += 4.6;
    fc(SEC.col.head); doc.rect(M, ctx.y, wNom, 7.5, "F"); f(5.8, "bold"); tc(SEC.col.tinta); t("COLABORADOR", M + 2, ctx.y + 4.8);
    dias.forEach((d, i) => { fc(d.esp ? [251, 236, 222] : SEC.asis.head); doc.rect(xsDia[i], ctx.y, wDia, 7.5, "F");
      f(5, "bold"); tc(d.esp ? [169, 78, 22] : SEC.asis.tinta); t(d.fer ? "F" : d.dow, xsDia[i] + wDia / 2, ctx.y + 3, { align: "center" });
      f(6.6, "bold"); tc(d.esp ? [169, 78, 22] : T.carbon); t(String(d.day), xsDia[i] + wDia / 2, ctx.y + 6.4, { align: "center" }); });
    TOTS.forEach(([lab], i) => { fc(SEC.tot.head); doc.rect(xTot + i * wTot, ctx.y, wTot, 7.5, "F"); f(5.6, "bold"); tc(SEC.tot.tinta); t(lab.toUpperCase(), xTot + i * wTot + wTot / 2, ctx.y + 4.8, { align: "center" }); });
    dc(T.lineaFuerte); doc.setLineWidth(0.25); doc.line(M, ctx.y + 7.5, PW - M, ctx.y + 7.5);
    ctx.y += 7.5;
  };
  const alto = 7.4;
  proyectos.forEach((p) => {
    const hTotal = 11 + 12.1 + p.filas.length * alto;
    if (ctx.y + Math.min(hTotal, 11 + 12.1 + 3 * alto) > Y_MAX || (hTotal <= Y_MAX - (M + 12) && ctx.y + hTotal > Y_MAX)) nuevaHoja();
    const c = p.pastel;
    fc(hex(c.bg)); doc.roundedRect(M, ctx.y, CW, 8.5, 2.5, 2.5, "F");
    fc(hex(c.base)); doc.circle(M + 4.5, ctx.y + 4.25, 1.5, "F");
    f(9, "bold"); tc(hex(c.tinta)); const s = recortar(p.short, CW * 0.4); doc.text(s, M + 8.5, ctx.y + 5.7);
    if (p.name && p.name !== p.short) { const ws = doc.getTextWidth(s); f(7.5); doc.text(recortar(`· ${p.name}`, CW - ws - 70), M + 10 + ws, ctx.y + 5.7); }
    f(7.5, "bold"); t(`${p.code ? p.code + " · " : ""}${p.filas.length} persona${p.filas.length === 1 ? "" : "s"}`, PW - M - 4, ctx.y + 5.7, { align: "right" });
    ctx.y += 10.5;
    encabezado();
    p.filas.forEach((r, ri) => {
      if (asegurar(alto)) encabezado();
      fc(ri % 2 ? [246, 245, 243] : [255, 255, 255]); doc.rect(M, ctx.y, wNom, alto, "F");
      f(6.7, "bold"); tc(T.carbon); doc.text(recortar(r.nombre, wNom - 3), M + 1.8, ctx.y + 3.4);
      f(5.2); tc(T.texto3); doc.text(latin1(r.code || ""), M + 1.8, ctx.y + 6.2);
      r.celdas.forEach((cel, i) => {
        const x0 = xsDia[i];
        fc(ri % 2 ? [246, 248, 252] : SEC.asis.cell); doc.rect(x0, ctx.y, wDia, alto, "F");
        const bg = hex(cel.bg), fg = hex(cel.fg) || T.carbon;
        if (bg) { fc(bg); doc.roundedRect(x0 + 0.5, ctx.y + 0.8, wDia - 1, alto - 1.6, 1, 1, "F"); }
        if (cel.raya) { fc(hex(cel.raya)); doc.rect(x0 + 0.9, ctx.y + alto - 1.6, wDia - 1.8, 0.7, "F"); }
        f(cel.txt === "·" ? 7 : 6.4, "bold"); tc(cel.txt === "·" ? [205, 200, 194] : fg); t(cel.txt, x0 + wDia / 2, ctx.y + (cel.hora ? 3.5 : 4.6), { align: "center" });
        if (cel.hora) { f(4.4, "bold"); tc([169, 78, 22]); t(cel.hora, x0 + wDia / 2, ctx.y + 6.1, { align: "center" }); }
      });
      TOTS.forEach(([, k, col], i) => {
        fc(ri % 2 ? [236, 246, 239] : SEC.tot.cell); doc.rect(xTot + i * wTot, ctx.y, wTot, alto, "F");
        const v = r[k]; if (v || k === "dias") { f(7, "bold"); tc(col); t(n2(v), xTot + i * wTot + wTot / 2, ctx.y + 4.7, { align: "center" }); }
      });
      dc(T.linea); doc.setLineWidth(0.12); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
      ctx.y += alto;
    });
    ctx.y += 7;
  });

  // ── Resumen para planilla ──
  nuevaHoja();
  f(15, "bold"); tc(T.carbon); t("Resumen para planilla", M, ctx.y + 4);
  f(8.5); tc(T.texto2); t(`${nombreEmpresa} · ${quincena} ${periodo} · deducciones y días especiales`, M, ctx.y + 9.5);
  fc(T.naranja); doc.rect(M, ctx.y + 12, 22, 1, "F");
  ctx.y += 19;
  planilla.forEach(sec => {
    // La sección entera pasa a la hoja siguiente si cabe en una (no se parte).
    const hSec = 6 + (sec.filas.length ? 6.2 + sec.filas.length * 6.8 : 14) + 8;
    asegurar(hSec <= Y_MAX - (M + 12) ? hSec : 24);
    const col = hex(sec.color) || T.carbon;
    f(10.5, "bold"); tc(T.carbon); t(sec.titulo, M, ctx.y + 3);
    if (sec.filas.length) { f(7.5); tc(T.texto3); t(`${sec.filas.length} colaborador${sec.filas.length === 1 ? "" : "es"} · ${sec.filas.reduce((a, r) => a + r.total, 0)} días`, PW - M, ctx.y + 3, { align: "right" }); }
    ctx.y += 6;
    if (!sec.filas.length) { fc(T.fondo); doc.roundedRect(M, ctx.y, CW, 8, 2, 2, "F"); f(7.8); tc(T.texto2); t(sec.vacio, M + 4, ctx.y + 5.2); ctx.y += 14; return; }
    const cs = [["Colaborador", 80], ["Proyecto", 60], ["Días (del mes)", 0], ["Total", 22]];
    const fijo = cs.reduce((a, c) => a + c[1], 0); let x = M; const xs = cs.map(c => { const w = c[1] || CW - fijo; const o = { x, w }; x += w; return o; });
    const encab = () => {
      fc(SEC.col.head); doc.rect(M, ctx.y, CW, 6.2, "F");
      cs.forEach((c, i) => { f(5.8, "bold"); tc(SEC.col.tinta); if (i === 3) t(c[0].toUpperCase(), xs[i].x + xs[i].w - 3, ctx.y + 4.2, { align: "right" }); else t(c[0].toUpperCase(), xs[i].x + 2, ctx.y + 4.2); });
      ctx.y += 6.2;
    };
    encab();
    sec.filas.forEach((r, i) => {
      if (asegurar(6.8)) encab();
      fc(i % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, 6.8, "F");
      f(7.6, "bold"); tc(T.carbon); doc.text(recortar(r.nombre, xs[0].w - 4), xs[0].x + 2, ctx.y + 4.5);
      f(7); tc(T.texto2); doc.text(recortar(r.proj, xs[1].w - 4), xs[1].x + 2, ctx.y + 4.5);
      f(7); tc(T.carbon); doc.text(recortar(r.dias.join(", "), xs[2].w - 4), xs[2].x + 2, ctx.y + 4.5);
      f(8, "bold"); tc(col); t(String(r.total), xs[3].x + xs[3].w - 3, ctx.y + 4.5, { align: "right" });
      dc(T.linea); doc.setLineWidth(0.12); doc.line(M, ctx.y + 6.8, PW - M, ctx.y + 6.8);
      ctx.y += 6.8;
    });
    ctx.y += 8;
  });
  // Elaborado por (sin líneas de firma)
  { const yE = ctx.y - 3; if (yE > PH - 15) { nuevaHoja(); pdfElaborado(doc, M, ctx.y + 2); ctx.y += 8; } else { pdfElaborado(doc, M, yE); ctx.y = yE + 6; } }

  pdfPie(doc, { margen: M });
  return doc;
};

export const pdfAsistencia = async (args) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = await construirAsistenciaPDF({ ...args, jsPDF });
  const nombre = `Asistencia_${String(args.nombreEmpresa || args.empresa).replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, "_")}_${args.quincena}_${args.periodo}.pdf`;
  doc.save(nombre);
  return nombre;
};
