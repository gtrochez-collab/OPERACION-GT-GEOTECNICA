// =====================================================================
// SUMINISTRO A OBRA — PDF "Programación de entregas y cobertura"
// (24-nov-2026, Gerson: "si se pudiera imprimir un reporte de esto, en PDF
// bonito, con el logo y la tablita bonita, como los otros reportes")
// =====================================================================
// jsPDF carta apaisada, se baja directo. Por proyecto: su franja pastel,
// el cuadro "¿Hasta cuándo estamos cubiertos?" (obra · almacén · falta) y la
// programación por semana con cada día pintado según con qué se cubre (verde
// obra · azul almacén · rojo falta), igual que en pantalla. Termina con
// "Elaborado por" (sin líneas de firma).
// El cálculo NO vive acá: llega en `filas` (coberturaProyecto de suministro-calc).
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA, pdfCabecera, pdfPie, pdfElaborado, latin1, pastelesDe } from "./reporte-estilo.js";
import { semanasDe, diasDeSemana, cantidadDia, totalSemana, totalMaterial, diaCorto, fechaCorta, resumenDias } from "./suministro-calc.js";

const T = PDF_TEMA;
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const nf = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const dTxt = (iso) => iso ? `${diaCorto(iso)} ${fechaCorta(iso)}` : "-";
const COB = {
  obra: { bg: [220, 242, 233], tinta: [4, 120, 87], txt: "Lo cubre lo que hay en obra" },
  almacen: { bg: [222, 232, 245], tinta: [31, 79, 140], txt: "Lo cubre el almacén (hay que mandarlo)" },
  falta: { bg: [248, 222, 219], tinta: [176, 48, 36], txt: "No alcanza (hay que comprar)" },
};

export const construirSuministroPDF = async ({ proyectos, hoy, jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 12, CW = PW - 2 * M, Y_MAX = PH - 16;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c), fc = (c) => doc.setFillColor(...c), dc = (c) => doc.setDrawColor(...c);
  const t = (s, x, y, o) => doc.text(latin1(s), x, y, o);
  const recortar = (s, w) => { let x = latin1(s); if (doc.getTextWidth(x) <= w) return x; while (x.length > 1 && doc.getTextWidth(x + "...") > w) x = x.slice(0, -1); return x.trimEnd() + "..."; };
  const pc = pastelesDe(proyectos.map(p => p.short));
  const uno = proyectos.length === 1 ? proyectos[0] : null;
  const ctx = { y: M, sub: uno ? `${uno.short} · Programación No. ${uno.prog.numero}` : "Programación de entregas y cobertura" };
  const encabezadoCont = () => {
    f(7, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M, M + 3.2, { charSpace: 0.4 });
    f(8.5, "bold"); tc(T.carbon); t(ctx.sub, PW - M, M + 3.2, { align: "right" });
    dc(T.linea); doc.setLineWidth(0.2); doc.line(M, M + 7, PW - M, M + 7);
    ctx.y = M + 12;
  };
  const nuevaHoja = () => { doc.addPage(); encabezadoCont(); };
  const asegurar = (h) => { if (ctx.y + h > Y_MAX) { nuevaHoja(); return true; } return false; };
  const rotulo = (s) => { f(6.8, "bold"); tc(T.texto3); t(s.toUpperCase(), M, ctx.y + 3, { charSpace: 0.5 }); ctx.y += 6.5; };

  ctx.y = await pdfCabecera(doc, {
    titulo: "Programación de entregas y cobertura",
    subtitulo: uno ? `${uno.short}${uno.nombre ? ` · ${uno.nombre}` : ""} · Programación No. ${uno.prog.numero}` : `${proyectos.length} proyectos con programación`,
    margen: M, y: M,
  });
  f(8.5); tc(T.texto2);
  t(`Calculado el ${dTxt(hoy)} con lo que hay en obra (lo cuenta el residente en GeoInventory) y en almacén. Lo comprometido para otro proyecto no cuenta.`, M, ctx.y - 2);
  ctx.y += 4;

  const leyenda = () => {
    let x = M; f(7);
    Object.values(COB).forEach(c => { fc(c.bg); doc.roundedRect(x, ctx.y - 2.6, 4, 3.2, 0.8, 0.8, "F"); tc(T.texto2); t(c.txt, x + 5.5, ctx.y); x += doc.getTextWidth(latin1(c.txt)) + 12; });
    tc(T.texto3); t("Días anteriores a hoy en gris.", x, ctx.y);
    ctx.y += 5;
  };

  proyectos.forEach((P, pi) => {
    const c = pc[P.short];
    if (pi > 0) nuevaHoja();
    // Franja del proyecto
    fc(hex(c.bg)); doc.roundedRect(M, ctx.y, CW, 10, 2.5, 2.5, "F");
    fc(hex(c.base)); doc.circle(M + 4.5, ctx.y + 5, 1.6, "F");
    f(10, "bold"); tc(hex(c.tinta)); const s = recortar(P.short, CW * 0.45); doc.text(s, M + 8.5, ctx.y + 6.6);
    if (P.nombre) { const ws = doc.getTextWidth(s); f(7.8); doc.text(recortar(`· ${P.nombre}`, CW * 0.5 - ws), M + 10 + ws, ctx.y + 6.6); }
    f(7.8, "bold"); t(`Programación No. ${P.prog.numero}${P.prog.updatedBy ? ` · ${P.prog.updatedBy}` : ""}`, PW - M - 4, ctx.y + 6.6, { align: "right" });
    ctx.y += 14;

    // ── ¿Hasta cuándo estamos cubiertos? ──
    rotulo("¿Hasta cuándo estamos cubiertos?");
    const cols = [
      ["Material", 0, "l"], ["En obra", 20, "r"], ["En almacén", 22, "r"], ["Programado", 22, "r"],
      ["La obra cubre", 30, "l"], ["Con almacén", 30, "l"], ["Falta desde", 26, "l"], ["Por conseguir", 26, "r"], ["Mandar del almacén", 30, "r"],
    ];
    const fijo = cols.reduce((a, x) => a + x[1], 0); let xx = M; const xs = cols.map(x => { const w = x[1] || CW - fijo; const o = { x: xx, w }; xx += w; return o; });
    const cel = (i, v, yy, { bold = false, color = T.carbon, fs = 7.6 } = {}) => { const { x, w } = xs[i]; f(fs, bold ? "bold" : "normal"); tc(color); const r = recortar(v, w - 2.5); if (cols[i][2] === "r") doc.text(r, x + w - 2, yy, { align: "right" }); else doc.text(r, x + 2, yy); };
    const cab = () => { fc([241, 240, 237]); doc.rect(M, ctx.y, CW, 6.5, "F"); cols.forEach((x, i) => cel(i, x[0].toUpperCase(), ctx.y + 4.3, { bold: true, color: [110, 104, 98], fs: 5.9 })); ctx.y += 6.5; };
    cab();
    const filas = (P.filas || []).filter(x => x.matId);
    filas.forEach((F, ri) => {
      const r = resumenDias(F.dias, F.porDia);
      const conReceta = F.receta && !F.receta.sinCantidad;
      const alto = conReceta ? 10.5 : 7.5;
      if (asegurar(alto)) cab();
      fc(ri % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, alto, "F");
      const yy = ctx.y + 4.9;
      cel(0, `${F.nombre} (${F.unidad})`, yy, { bold: true });
      if (conReceta) {
        const R = F.receta;
        const txt = !R.misma ? `Receta: ${R.partida.nombre} · ${nf(R.presupuestada)} ${R.partida.unidad} (otra unidad)` : `Receta: ${nf(R.presupuestada)} · comprado ${nf(R.comprada)} · quedan ${nf(R.saldo)} ${R.partida.unidad}${R.pasa > 0 ? ` · la programación pide ${nf(R.pasa)} de más` : ""}`;
        cel(0, txt, yy + 3.6, { fs: 6.2, color: R.pasa > 0 ? COB.falta.tinta : T.texto3 });
      }
      if (!F.enInventario) { cel(1, "-", yy, { color: T.texto3 }); cel(4, "No está en GeoInventory", yy, { color: T.texto3, fs: 7 }); }
      else {
        cel(1, nf(F.stock), yy, { bold: true });
        cel(2, nf(F.almacen?.total), yy, { bold: true, color: COB.almacen.tinta });
        cel(3, nf(Object.entries(F.porDia || {}).filter(([d]) => d >= hoy).reduce((a, [, n]) => a + (Number(n) || 0), 0)), yy);
        if (!r.hayProgramacion) cel(4, "Sin cantidades desde hoy", yy, { color: T.texto3, fs: 7 });
        else {
          cel(4, r.obraHasta ? (F.obra?.cubreTodo ? "Toda" : `hasta ${dTxt(r.obraHasta)}`) : "ni el primer día", yy, { bold: true, color: r.obraHasta ? COB.obra.tinta : COB.falta.tinta });
          cel(5, F.cubreTodo ? "Toda la programación" : r.totalHasta ? `hasta ${dTxt(r.totalHasta)}` : "ni el primer día", yy, { bold: true, color: F.cubreTodo ? COB.obra.tinta : r.totalHasta ? COB.almacen.tinta : COB.falta.tinta });
          cel(6, r.faltaDesde ? dTxt(r.faltaDesde) : "-", yy, { bold: !!r.faltaDesde, color: r.faltaDesde ? COB.falta.tinta : T.texto3 });
          cel(7, r.faltaTotal ? nf(r.faltaTotal) : "-", yy, { bold: true, color: r.faltaTotal ? COB.falta.tinta : T.texto3 });
          cel(8, r.mandar ? nf(r.mandar) : "-", yy, { bold: true, color: r.mandar ? COB.almacen.tinta : T.texto3 });
        }
      }
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
      ctx.y += alto;
    });
    ctx.y += 6;

    // ── Programación por semana ──
    asegurar(30);
    rotulo("Programación por día");
    leyenda();
    const mats = P.prog.materiales || [];
    const porMat = Object.fromEntries((P.filas || []).filter(x => x.matId).map(x => [x.matId, x]));
    semanasDe(P.prog).forEach((lunes, si) => {
      const dias = diasDeSemana(lunes);
      const alto = 7.2, hTabla = 7 + 6.5 + mats.length * alto;
      asegurar(Math.min(hTabla, Y_MAX - M - 12));
      f(9, "bold"); tc(T.carbon); t(`Semana ${si + 1}`, M, ctx.y + 3); const ws = doc.getTextWidth(latin1(`Semana ${si + 1}`));
      f(7.8); tc(T.texto3); t(`${fechaCorta(lunes)} - ${fechaCorta(dias[5])}`, M + ws + 3, ctx.y + 3);
      ctx.y += 6;
      const wMat = 70, wTot = 26, wDia = (CW - wMat - wTot) / 6;
      fc([241, 240, 237]); doc.rect(M, ctx.y, CW, 6.5, "F");
      f(6, "bold"); tc([110, 104, 98]); t("MATERIAL", M + 2, ctx.y + 4.3);
      dias.forEach((d, i) => { tc(d === hoy ? T.naranjaTexto : [110, 104, 98]); t(`${diaCorto(d).toUpperCase()} ${+d.slice(8)}`, M + wMat + i * wDia + wDia / 2, ctx.y + 4.3, { align: "center" }); });
      tc([110, 104, 98]); t("TOTAL SEMANA", PW - M - 2, ctx.y + 4.3, { align: "right" });
      ctx.y += 6.5;
      mats.forEach((m, ri) => {
        if (asegurar(alto)) { /* sigue en la hoja nueva */ }
        fc(ri % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, alto, "F");
        f(7.6, "bold"); tc(T.carbon); doc.text(recortar(`${m.nombre}`, wMat - 18), M + 2, ctx.y + 4.7);
        f(6.8); tc(T.texto3); t(m.unidad || "", M + wMat - 2, ctx.y + 4.7, { align: "right" });
        dias.forEach((d, i) => {
          const q = cantidadDia(P.prog, d, m.id); const x0 = M + wMat + i * wDia;
          if (!q) return;
          const e = porMat[m.id]?.dias?.[d]; const cc = e ? COB[e.estado] : null;
          if (cc) { fc(cc.bg); doc.roundedRect(x0 + 2, ctx.y + 0.9, wDia - 4, alto - 1.8, 1.2, 1.2, "F"); }
          f(7.8, "bold"); tc(cc ? cc.tinta : d < hoy ? [176, 170, 162] : T.carbon);
          const txt = e?.estado === "falta" && e.falta < q ? `${nf(q)}  (faltan ${nf(e.falta)})` : nf(q);
          t(txt, x0 + wDia / 2, ctx.y + 4.8, { align: "center" });
        });
        f(7.8, "bold"); tc(T.carbon); t(nf(totalSemana(P.prog, lunes, m.id)), PW - M - 2, ctx.y + 4.8, { align: "right" });
        dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
        ctx.y += alto;
      });
      ctx.y += 5;
    });
    // Total programado
    asegurar(12);
    fc(T.fondo); doc.roundedRect(M, ctx.y, CW, 9, 2.5, 2.5, "F");
    f(6.5, "bold"); tc(T.texto3); t("TOTAL PROGRAMADO", M + 4, ctx.y + 5.8, { charSpace: 0.3 });
    let xt = M + 36; f(8);
    mats.forEach(m => { const s1 = `${nf(totalMaterial(P.prog, m.id))} `; const s2 = `${m.unidad} ${m.nombre}`; if (xt > PW - M - 30) return; doc.setFont("helvetica", "bold"); tc(T.carbon); t(s1, xt, ctx.y + 5.8); const w1 = doc.getTextWidth(latin1(s1)); doc.setFont("helvetica", "normal"); tc(T.texto2); t(s2, xt + w1, ctx.y + 5.8); xt += w1 + doc.getTextWidth(latin1(s2)) + 8; });
    ctx.y += 13;
    if (P.prog.nota) {
      const lineas = doc.splitTextToSize(latin1(`Nota: ${P.prog.nota}`), CW);
      asegurar(lineas.length * 4 + 4); f(8); tc(T.texto2); doc.text(lineas, M, ctx.y + 2); ctx.y += lineas.length * 4 + 4;
    }
  });

  if (ctx.y + 8 > Y_MAX) nuevaHoja();
  pdfElaborado(doc, M, ctx.y + 2);
  pdfPie(doc, { margen: M });
  return doc;
};

export const pdfSuministro = async ({ proyectos, hoy }) => {
  if (!proyectos?.length) throw new Error("No hay programación para el reporte.");
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = await construirSuministroPDF({ proyectos, hoy, jsPDF });
  const base = proyectos.length === 1 ? `Programacion_${proyectos[0].short}_No${proyectos[0].prog.numero}` : "Programacion_y_cobertura";
  const nombre = `${base.replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, "_")}_${hoy}.pdf`;
  doc.save(nombre);
  return nombre;
};
