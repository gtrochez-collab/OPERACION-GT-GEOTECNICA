// =====================================================================
// GEOCLOCK — Reporte de marcajes (entradas y salidas) · PDF jsPDF directo
// =====================================================================
// 18-nov-2026 (Gerson: "saqué el reporte de marcajes de Kenia de noviembre y
// sigue con el formato viejo; que todos vengan con lo nuevo, que de una se
// descarguen, no me lleven a otra pantalla"). Antes era un reporte HTML que se
// abría en otra pestaña. Ahora es jsPDF con la MISMA familia visual que la
// asistencia y las horas extras: portada con 4 cifras, resumen por proyecto
// con su pastel, y una tabla por proyecto con franjas de color (Colaborador ·
// Marcajes · Jornada · Notas), chips de tarde / manual / editada, encabezado
// repetido al pasar de hoja y "Elaborado por" al final (sin líneas de firma).
//
// El cálculo NO vive acá: GeoClockModule arma las filas (primera entrada,
// última salida, almuerzo, estado) con las reglas de siempre y este módulo
// solo las dibuja.
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA, pdfKpi, pdfPie, pdfElaborado, cargarImagen, LOGO_EMPRESA, latin1, pastelesDe } from "./reporte-estilo.js";

const T = PDF_TEMA;
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const fmtH = (h) => {
  if (h == null || !Number.isFinite(h)) return "—";
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh++; mm = 0; }
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
};

const SEC = {
  col: { t: "Colaborador", head: [241, 240, 237], cell: [255, 255, 255], alt: [246, 245, 243], tinta: [110, 104, 98] },
  mar: { t: "Marcajes", head: [220, 232, 248], cell: [250, 251, 253], alt: [243, 246, 251], tinta: [31, 79, 140] },
  jor: { t: "Jornada", head: [213, 239, 221], cell: [243, 250, 245], alt: [236, 246, 239], tinta: [31, 107, 60] },
  not: { t: "Notas", head: [241, 240, 237], cell: [255, 255, 255], alt: [250, 250, 249], tinta: [110, 104, 98] },
};
// Tonos de chip: { fg, bg }
export const TONO_REG = {
  verde: { fg: [23, 114, 67], bg: [220, 243, 228] },
  naranja: { fg: [169, 78, 22], bg: [251, 236, 222] },
  rojo: { fg: [176, 48, 36], bg: [250, 228, 225] },
  gris: { fg: [110, 104, 98], bg: [241, 240, 237] },
};

/**
 * empresa ("geotecnica" | "subterra"), titulo, rango (texto), filtros (texto),
 * persona (nombre si el reporte es de UNA persona), varios (rango de varios días),
 * kpis = { registros, ausentes, horas, tardes }
 * proyectos = [{ short, filas: [fila] }]
 * fila = { fecha, dia ("Lun 03/11"), nombre, empresa (texto chico),
 *   ent: { hora, nota, tarde: { txt, tono } | null } | null, entFalta: { txt, tono } | null,
 *   sal: { hora, nota } | null, salFalta: { txt, tono } | null,
 *   netas (h | null), brutas (h | null), almuerzo (h), estado: { txt, tono }, notas }
 */
export const construirRegistrosPDF = async ({ empresa = "geotecnica", titulo = "Reporte de marcajes", rango = "", filtros = "", persona = "", varios = false, kpis, proyectos, jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 10, CW = PW - 2 * M, Y_MAX = PH - 15;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c), fc = (c) => doc.setFillColor(...c), dc = (c) => doc.setDrawColor(...c);
  const t = (s, x, y, o) => doc.text(latin1(s), x, y, o);
  const recortar = (s, w) => { let x = latin1(s); if (doc.getTextWidth(x) <= w) return x; while (x.length > 1 && doc.getTextWidth(x + "...") > w) x = x.slice(0, -1); return x.trimEnd() + "..."; };
  const ctx = { y: M, sub: `Marcajes · ${persona || "GeoClock"} · ${rango}` };
  const marca = await cargarImagen("brand/geocore/geocore-180.png");
  const logo = await cargarImagen(LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica);
  const subterra = empresa === "subterra";
  const pc = pastelesDe(proyectos.map(p => p.short));

  const encabezadoCont = () => {
    f(7, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M, M + 3.2, { charSpace: 0.4 });
    f(8.5, "bold"); tc(T.carbon); t(recortar(ctx.sub, CW * 0.7), PW - M, M + 3.2, { align: "right" });
    dc(T.linea); doc.setLineWidth(0.2); doc.line(M, M + 7, PW - M, M + 7);
    ctx.y = M + 12;
  };
  const nuevaHoja = () => { doc.addPage(); encabezadoCont(); };
  const asegurar = (h) => { if (ctx.y + h > Y_MAX) { nuevaHoja(); return true; } return false; };
  const rotulo = (s) => { f(6.8, "bold"); tc(T.texto3); t(s.toUpperCase(), M, ctx.y + 3, { charSpace: 0.5 }); ctx.y += 6.5; };
  // Chip redondeado; devuelve el ancho.
  const chip = (x, y, txt, tono, tam = 6.2) => {
    const c = TONO_REG[tono] || TONO_REG.gris;
    f(tam, "bold"); const w = doc.getTextWidth(latin1(txt)) + 3.2;
    fc(c.bg); doc.roundedRect(x, y - 3.1, w, 4.3, 1.1, 1.1, "F");
    tc(c.fg); t(txt, x + 1.6, y); return w;
  };

  // ── Portada ──
  if (marca) doc.addImage(marca.dataUrl, "PNG", M, M, 8, 8);
  f(7.5, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M + 11, M + 5.4, { charSpace: 0.5 });
  if (logo) { const h = subterra ? 26 : 14, w = Math.min(70, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", PW - M - w, M - (subterra ? 2 : -1), w, h); }
  let y = M + 22;
  f(18, "bold"); tc(T.carbon); t(titulo, M, y);
  y += 7; f(11, "bold"); tc(T.naranjaTexto); t(persona ? `${persona} · ${rango}` : `Entradas y salidas · ${rango}`, M, y);
  y += 6; f(9); tc(T.texto2); t(recortar(`GeoClock · ${filtros}`, CW - 80), M, y);
  fc(T.naranja); doc.rect(M, y + 4, 22, 1, "F");
  ctx.y = y + 10;
  const kw = (CW - 9) / 4;
  pdfKpi(doc, M, ctx.y, kw, 15, "Registros", String(kpis.registros));
  pdfKpi(doc, M + (kw + 3), ctx.y, kw, 15, "Horas laboradas", fmtH(kpis.horas));
  pdfKpi(doc, M + 2 * (kw + 3), ctx.y, kw, 15, "Llegadas tarde", String(kpis.tardes), kpis.tardes ? { tono: "naranjaTexto" } : {});
  pdfKpi(doc, M + 3 * (kw + 3), ctx.y, kw, 15, "No marcaron", String(kpis.ausentes), kpis.ausentes ? { tono: "rojo" } : {});
  ctx.y += 22;

  // ── Resumen por proyecto ──
  rotulo("Resumen por proyecto");
  {
    const cs = [["Proyecto", 0], ["Personas", 26], ["Registros", 26], ["Horas laboradas", 34], ["Tarde", 22], ["No marcaron", 28]];
    const fijo = cs.reduce((a, c) => a + c[1], 0); let x = M; const xs = cs.map(c => { const w = c[1] || CW - fijo; const o = { x, w }; x += w; return o; });
    const enc = () => {
      fc(SEC.col.head); doc.rect(M, ctx.y, CW, 6.5, "F");
      cs.forEach((c, i) => { f(5.8, "bold"); tc(SEC.col.tinta); if (i === 0) t(c[0].toUpperCase(), xs[i].x + 2, ctx.y + 4.4); else t(c[0].toUpperCase(), xs[i].x + xs[i].w - 3, ctx.y + 4.4, { align: "right" }); });
      ctx.y += 6.5;
    };
    enc();
    proyectos.forEach((p, i) => {
      if (asegurar(7)) enc();
      const c = pc[p.short];
      const reg = p.filas.filter(r => !r.ausente).length, aus = p.filas.length - reg;
      const per = new Set(p.filas.map(r => r.nombre)).size;
      const hrs = p.filas.reduce((a, r) => a + (r.netas || 0), 0);
      const tar = p.filas.filter(r => r.ent && r.ent.tarde).length;
      fc(i % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, 7, "F");
      fc(hex(c.base)); doc.circle(M + 3.5, ctx.y + 3.5, 1.4, "F");
      f(7.8, "bold"); tc(hex(c.tinta)); doc.text(recortar(p.short, xs[0].w - 10), M + 7, ctx.y + 4.7);
      const num = (v, k, col, bold) => { f(7.8, bold ? "bold" : "normal"); tc(col); t(v, xs[k].x + xs[k].w - 3, ctx.y + 4.7, { align: "right" }); };
      num(String(per), 1, T.carbon); num(String(reg), 2, T.carbon); num(fmtH(hrs), 3, T.carbon, true);
      num(String(tar), 4, tar ? [169, 78, 22] : T.texto3, !!tar); num(String(aus), 5, aus ? [176, 48, 36] : T.texto3, !!aus);
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + 7, PW - M, ctx.y + 7);
      ctx.y += 7;
    });
    ctx.y += 7;
  }

  // ── Tabla por proyecto ──
  const anchos = { fecha: varios ? 22 : 0, nom: 64, ent: 40, sal: 30, hrs: 27, est: 30 };
  anchos.not = CW - (anchos.fecha + anchos.nom + anchos.ent + anchos.sal + anchos.hrs + anchos.est);
  const X = {}; { let x = M; ["fecha", "nom", "ent", "sal", "hrs", "est", "not"].forEach(k => { X[k] = x; x += anchos[k]; }); }
  const grupos = [["col", X.fecha, anchos.fecha + anchos.nom], ["mar", X.ent, anchos.ent + anchos.sal], ["jor", X.hrs, anchos.hrs + anchos.est], ["not", X.not, anchos.not]];
  const encabezado = () => {
    grupos.forEach(([k, x0, w]) => { fc(SEC[k].head); doc.rect(x0, ctx.y, w, 4.2, "F"); f(5.4, "bold"); tc(SEC[k].tinta); t(SEC[k].t.toUpperCase(), x0 + w / 2, ctx.y + 3, { align: "center", charSpace: 0.15 }); });
    ctx.y += 4.6;
    const cols = [["fecha", "Fecha", "col"], ["nom", "Colaborador", "col"], ["ent", "Entrada", "mar"], ["sal", "Salida", "mar"], ["hrs", "Horas", "jor"], ["est", "Estado", "jor"], ["not", "Comentario / justificación", "not"]];
    cols.forEach(([k, lab, s]) => { if (!anchos[k]) return; fc(SEC[s].head); doc.rect(X[k], ctx.y, anchos[k], 6, "F"); f(5.8, "bold"); tc(SEC[s].tinta); t(lab.toUpperCase(), X[k] + 2, ctx.y + 4); });
    dc(T.lineaFuerte); doc.setLineWidth(0.25); doc.line(M, ctx.y + 6, PW - M, ctx.y + 6);
    ctx.y += 6;
  };
  const alto = 8.6;
  proyectos.forEach(p => {
    const hTotal = 11 + 10.6 + p.filas.length * alto + 7;
    if (ctx.y + Math.min(hTotal, 11 + 10.6 + 3 * alto) > Y_MAX || (hTotal <= Y_MAX - (M + 12) && ctx.y + hTotal > Y_MAX)) nuevaHoja();
    const c = pc[p.short];
    const hrs = p.filas.reduce((a, r) => a + (r.netas || 0), 0);
    fc(hex(c.bg)); doc.roundedRect(M, ctx.y, CW, 8.5, 2.5, 2.5, "F");
    fc(hex(c.base)); doc.circle(M + 4.5, ctx.y + 4.25, 1.5, "F");
    f(9, "bold"); tc(hex(c.tinta)); doc.text(recortar(p.short, CW * 0.6), M + 8.5, ctx.y + 5.7);
    const nReg = p.filas.filter(r => !r.ausente).length, nAus = p.filas.length - nReg;
    f(7.5, "bold"); t(`${nReg} registro${nReg === 1 ? "" : "s"}${nAus ? ` · ${nAus} sin marcar` : ""} · ${fmtH(hrs)} laboradas`, PW - M - 4, ctx.y + 5.7, { align: "right" });
    ctx.y += 10.5;
    encabezado();
    let banda = 0, fechaPrev = null;
    p.filas.forEach((r, ri) => {
      if (asegurar(alto)) encabezado();
      // Varios días: la franja alterna por DÍA (se lee qué filas son del mismo día).
      if (varios) { if (r.fecha !== fechaPrev) { banda++; fechaPrev = r.fecha; } } else banda = ri;
      const alt = banda % 2 === 0;
      grupos.forEach(([k, x0, w]) => { fc(alt ? SEC[k].alt : SEC[k].cell); doc.rect(x0, ctx.y, w, alto, "F"); });
      const yA = ctx.y + 3.7, yB = ctx.y + 6.9;
      if (varios) { f(7, "bold"); tc(T.carbon); t(r.dia, X.fecha + 2, yA); f(5.4); tc(T.texto3); t(r.fecha.slice(0, 4), X.fecha + 2, yB); }
      f(7.2, "bold"); tc(T.carbon); doc.text(recortar(r.nombre, anchos.nom - 4), X.nom + 2, yA);
      f(5.6); tc(T.texto3); doc.text(recortar(r.empresa || "", anchos.nom - 4), X.nom + 2, yB);
      // Entrada
      if (r.ent) {
        f(8, "bold"); tc(T.carbon); t(r.ent.hora, X.ent + 2, yA);
        if (r.ent.nota) { const w = doc.getTextWidth(latin1(r.ent.hora)); f(5.6); tc(T.texto3); t(r.ent.nota, X.ent + 3.5 + w, yA); }
        if (r.ent.tarde) chip(X.ent + 2, yB + 0.3, r.ent.tarde.txt, r.ent.tarde.tono, 5.4);
      } else if (r.entFalta) chip(X.ent + 2, yA + 1.4, r.entFalta.txt, r.entFalta.tono);
      else { f(7.5); tc([201, 195, 186]); t("—", X.ent + 2, yA + 1.4); }
      // Salida
      if (r.sal) {
        f(8, "bold"); tc(T.carbon); t(r.sal.hora, X.sal + 2, yA);
        if (r.sal.nota) { f(5.6); tc(T.texto3); t(r.sal.nota, X.sal + 2, yB); }
      } else if (r.salFalta) chip(X.sal + 2, yA + 1.4, r.salFalta.txt, r.salFalta.tono);
      else { f(7.5); tc([201, 195, 186]); t("—", X.sal + 2, yA + 1.4); }
      // Horas
      if (r.netas != null) {
        f(8, "bold"); tc([31, 107, 60]); t(fmtH(r.netas), X.hrs + 2, yA);
        f(5.4); tc(T.texto3); t(r.almuerzo ? `${fmtH(r.brutas)} - 1h alm.` : `${fmtH(r.brutas)} brutas`, X.hrs + 2, yB);
      } else { f(7.5); tc([201, 195, 186]); t("—", X.hrs + 2, yA + 1.4); }
      chip(X.est + 2, yA + 1.4, r.estado.txt, r.estado.tono);
      // Notas (hasta 2 renglones)
      if (r.notas) {
        f(5.8); tc(T.texto2);
        const lineas = doc.splitTextToSize(latin1(r.notas), anchos.not - 4);
        const dos = lineas.slice(0, 2); if (lineas.length > 2) dos[1] = recortar(dos[1] + " " + lineas.slice(2).join(" "), anchos.not - 4);
        dos.forEach((l, i) => doc.text(l, X.not + 2, (dos.length === 1 ? yA + 1.4 : yA) + i * 3.2));
      }
      dc(T.linea); doc.setLineWidth(0.12); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
      ctx.y += alto;
    });
    // Total del proyecto
    if (asegurar(7)) encabezado();
    fc([251, 236, 222]); doc.rect(M, ctx.y, CW, 6.5, "F");
    f(7, "bold"); tc([169, 78, 22]); t(`Total ${p.short}`, M + 2, ctx.y + 4.4);
    t(fmtH(hrs), X.hrs + 2, ctx.y + 4.4);
    ctx.y += 13;
  });

  // Nota + Elaborado por (sin líneas de firma)
  asegurar(14);
  f(7); tc(T.texto3); t("Entrada = primera marca del día; salida = la última. Las horas descuentan 1 h de almuerzo cuando la jornada cruza el mediodía (12:00 - 13:00).", M, ctx.y - 2);
  { const yE = ctx.y + 4; if (yE > PH - 15) { nuevaHoja(); pdfElaborado(doc, M, ctx.y + 2); } else pdfElaborado(doc, M, yE); }

  pdfPie(doc, { margen: M });
  return doc;
};

export const pdfRegistros = async (args) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = await construirRegistrosPDF({ ...args, jsPDF });
  const nombre = `${args.persona ? "Marcajes_" + String(args.persona).replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, "_") : "GeoClock_registros"}_${args.desde}_a_${args.hasta}.pdf`;
  doc.save(nombre);
  return nombre;
};
