// =====================================================================
// SUMINISTRO A OBRA — PDF "Programación de entregas y cobertura"
// (24-nov-2026, Gerson: "si se pudiera imprimir un reporte de esto, en PDF
// bonito, con el logo y la tablita bonita, como los otros reportes")
// =====================================================================
// jsPDF carta apaisada, se baja directo. Por proyecto: su franja pastel,
// la programación por semana con cada día pintado según con qué se cubre (verde
// obra · azul almacén · rojo falta) y, al lado, lo que quedaría en almacén —
// igual que en pantalla, compacto para que quepa en una hoja. Termina con
// "Elaborado por" (sin líneas de firma).
// El cálculo NO vive acá: llega en `filas` (coberturaProyecto de suministro-calc).
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA, pdfCabecera, pdfPie, pdfElaborado, latin1, pastelesDe } from "./reporte-estilo.js";
import { semanasDe, diasDeSemana, cantidadDia, totalSemana, totalMaterial, diaCorto, fechaCorta } from "./suministro-calc.js";

const T = PDF_TEMA;
const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const nf = (n) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const dTxt = (iso) => iso ? `${diaCorto(iso)} ${fechaCorta(iso)}` : "-";
const COB = {
  obra: { bg: [220, 242, 233], tinta: [4, 120, 87], txt: "Lo cubre la obra" },
  almacen: { bg: [222, 232, 245], tinta: [31, 79, 140], txt: "Lo cubre el almacén" },
  falta: { bg: [248, 222, 219], tinta: [176, 48, 36], txt: "No alcanza" },
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

  ctx.y = await pdfCabecera(doc, {
    titulo: "Programación de entregas y cobertura",
    subtitulo: uno ? `${uno.short}${uno.nombre ? ` · ${uno.nombre}` : ""} · Programación No. ${uno.prog.numero}` : `${proyectos.length} proyectos con programación`,
    margen: M, y: M,
  });
  f(8.5); tc(T.texto2);
  t(`Calculado el ${dTxt(hoy)}. Al lado de cada día: lo que quedaría en almacén (o lo que falta).`, M, ctx.y - 2);
  ctx.y += 3;

  const leyenda = () => {
    let x = M; f(7);
    Object.values(COB).forEach(c => { fc(c.bg); doc.roundedRect(x, ctx.y - 2.6, 4, 3.2, 0.8, 0.8, "F"); tc(T.texto2); t(c.txt, x + 5.5, ctx.y); x += doc.getTextWidth(latin1(c.txt)) + 12; });
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
    ctx.y += 13;

    // ── Programación por semana ──
    leyenda();
    const mats = P.prog.materiales || [];
    const porMat = Object.fromEntries((P.filas || []).filter(x => x.matId).map(x => [x.matId, x]));
    semanasDe(P.prog).forEach((lunes, si) => {
      const dias = diasDeSemana(lunes);
      const alto = 9.5, hTabla = 6 + 6.5 + mats.length * alto;
      asegurar(Math.min(hTabla, Y_MAX - M - 12));
      f(9, "bold"); tc(T.carbon); t(`Semana ${si + 1}`, M, ctx.y + 3); const ws = doc.getTextWidth(latin1(`Semana ${si + 1}`));
      f(7.8); tc(T.texto3); t(`${fechaCorta(lunes)} - ${fechaCorta(dias[5])}`, M + ws + 3, ctx.y + 3);
      ctx.y += 5;
      const wMat = 66, wTot = 22, wDia = (CW - wMat - wTot) / 6;
      fc([241, 240, 237]); doc.rect(M, ctx.y, CW, 6.5, "F");
      f(6, "bold"); tc([110, 104, 98]); t("MATERIAL", M + 2, ctx.y + 4.3);
      dias.forEach((d, i) => { tc(d === hoy ? T.naranjaTexto : [110, 104, 98]); t(`${diaCorto(d).toUpperCase()} ${+d.slice(8)}`, M + wMat + i * wDia + wDia / 2, ctx.y + 4.3, { align: "center" }); });
      tc([110, 104, 98]); t("TOTAL", PW - M - 2, ctx.y + 4.3, { align: "right" });
      ctx.y += 6.5;
      mats.forEach((m, ri) => {
        asegurar(alto);
        const F = porMat[m.id];
        fc(ri % 2 ? [250, 250, 249] : [255, 255, 255]); doc.rect(M, ctx.y, CW, alto, "F");
        f(7.6, "bold"); tc(T.carbon); const nm = recortar(m.nombre, wMat - 20); doc.text(nm, M + 2, ctx.y + 4); const wNm = doc.getTextWidth(nm);
        f(6.6); tc(T.texto3); t(m.unidad || "", M + 2 + wNm + 1.8, ctx.y + 4);
        f(6.2); tc(T.texto3);
        t(F?.enInventario ? `En obra ${nf(F.stock)} · en almacén ${nf(F.almacen?.total)}` : "no está en GeoInventory", M + 2, ctx.y + 7.6);
        dias.forEach((d, i) => {
          const q = cantidadDia(P.prog, d, m.id); const x0 = M + wMat + i * wDia;
          if (!q) return;
          const e = F?.dias?.[d]; const cc = e ? COB[e.estado] : null;
          const wC = wDia * 0.52, xc = x0 + 2;
          if (cc) { fc(cc.bg); doc.roundedRect(xc, ctx.y + 1.6, wC, alto - 3.2, 1.2, 1.2, "F"); }
          f(7.8, "bold"); tc(cc ? cc.tinta : d < hoy ? [176, 170, 162] : T.carbon);
          t(nf(q), xc + wC / 2, ctx.y + 5.9, { align: "center" });
          if (e) {
            const falta = e.estado === "falta"; const xr = xc + wC + 1.8;
            f(5.4); tc(falta ? COB.falta.tinta : T.texto3); t(falta ? "faltan" : "almacén", xr, ctx.y + 4.1);
            f(7.2, "bold"); tc(falta ? COB.falta.tinta : COB.almacen.tinta); t(nf(falta ? e.falta : e.almQueda), xr, ctx.y + 7.2);
          }
        });
        f(7.8, "bold"); tc(T.carbon); t(nf(totalSemana(P.prog, lunes, m.id)), PW - M - 2, ctx.y + 5.9, { align: "right" });
        dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
        ctx.y += alto;
      });
      ctx.y += 4;
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
