// =====================================================================
// JORNALES — Solicitud de pago (PDF apaisado + Excel)
// =====================================================================
// Calca la "SOLICITUD DE PAGO M.O PERSONAL LOCAL POR DIA" (el Excel de
// Cataleya): datos de la misión, un renglón por persona con sus 14 días (y las
// horas extra debajo de cada día), días × valor por día + HE × (valor día ÷ 8),
// total a pagar, "favor depositar a…", firmas y — en las hojas siguientes —
// las IDENTIDADES escaneadas de cada uno (Gerson: "en los correos que mando,
// 100 % tienen que venir las identidades").
//
// 14-nov-2026 (Gerson: "tiene que ser bonita, en colores, como el formato de
// contratistas del Salvador, y el Excel igual"): el PDF pasó de HTML a jsPDF
// con la MISMA familia visual que la planilla y la de contratistas — franjas de
// color por sección (Jornal · Asistencia del corte · Días · Horas extra · A
// pagar), cada día pintado como en la hoja de asistencia (1 verde · ½ ámbar ·
// 2 naranja · 0 rojo), filas alternadas, totales en naranja, caja carbón con el
// total y las identidades en tarjetas. El Excel lleva el logo, las mismas
// franjas, los días pintados y fórmulas con su resultado.
// =====================================================================
import { safeDynamicImport } from "./lazyLoad.js";
import { MONEDA, DOC_ID } from "./operacion.js";
import { PDF_TEMA, RP, pdfKpi, pdfPie, cargarImagen, LOGO_EMPRESA, libroExcel, descargarExcel, fechaGenerado } from "./reporte-estilo.js";
import { diaCorto, fechaCorta, fechaLarga, nombreCorteLargo, fechasHeDelCorte } from "./jornales-calc.js";
import { esFeriado } from "./holidays.js";

const T = PDF_TEMA;
const MAPA_L1 = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "×": "x", "→": "->", "✓": "si" };
const latin1 = (s) => String(s ?? "").replace(/[–—‘’“”…×→✓]/g, c => MAPA_L1[c] ?? "").replace(/[^\u0000-ÿ]/g, "");
const nf = (n, d = 2) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const L$ = (n) => `${MONEDA} ${nf(n)}`;
const n1 = (v) => { const x = Number(v) || 0; return x % 1 ? nf(x, 1) : String(x); };
const textoDia = (v) => v === undefined || v === "" || v === null ? "" : Number(v) === 0.5 ? "½" : Number(v) === 1.5 ? "1½" : String(Number(v));
const esDomingoOFeriado = (iso) => { const d = new Date(iso + "T12:00:00Z"); return d.getUTCDay() === 0 || esFeriado(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

// Paleta: la de la planilla (franjas) y la de la hoja de asistencia (días).
const SEC = {
  col: { t: "Jornal", head: [241, 240, 237], cell: [255, 255, 255], tinta: [110, 104, 98] },
  asis: { t: "Asistencia del corte · horas extra debajo del día", head: [220, 232, 248], cell: [250, 251, 253], tinta: [31, 79, 140] },
  dias: { t: "Pago por días", head: [213, 239, 221], cell: [243, 250, 245], tinta: [31, 107, 60] },
  he: { t: "Horas extra", head: [252, 239, 208], cell: [254, 249, 236], tinta: [138, 90, 0] },
  neto: { t: "A pagar", head: [251, 217, 191], cell: [253, 238, 225], tinta: [169, 78, 22] },
};
const CELDA_DIA = {
  1: { bg: [220, 243, 228], fg: [23, 114, 67] }, 2: { bg: [251, 227, 208], fg: [169, 78, 22] },
  0.5: { bg: [251, 239, 196], fg: [138, 90, 0] }, 1.5: { bg: [251, 239, 196], fg: [138, 90, 0] }, 0: { bg: [247, 222, 220], fg: [176, 48, 36] },
};

/** Cualquier imagen (webp, png grande…) → JPEG de hasta 900 px para jsPDF. */
const aJpeg = async (img) => {
  if (!img?.dataUrl) return null;
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = img.dataUrl; });
    const k = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
    return { dataUrl: cv.toDataURL("image/jpeg", 0.82), w: cv.width, h: cv.height };
  } catch { return null; }
};

// ── PDF ─────────────────────────────────────────────────────────────────────
/**
 * proyectos = [{ nombre, short, liq (liquidarProyecto), elaboradoPor, asistenciaPor }]
 * identidades = { [jornalId]: { frente: {dataUrl,w,h}, reverso: {...} } }
 */
export const construirJornalesPDF = async ({ proyectos, identidades = {}, empresa = "geotecnica", lugar = "", hoy, jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 12, CW = PW - 2 * M, Y_MAX = PH - 16;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c), fc = (c) => doc.setFillColor(...c), dc = (c) => doc.setDrawColor(...c);
  const t = (s, x, y, o) => doc.text(latin1(s), x, y, o);
  const recortar = (s, w) => { let x = latin1(s); if (doc.getTextWidth(x) <= w) return x; while (x.length > 1 && doc.getTextWidth(x + "...") > w) x = x.slice(0, -1); return x.trimEnd() + "..."; };
  const ctx = { y: M, sub: "" };
  const marca = await cargarImagen("brand/geocore/geocore-180.png");
  const logo = await cargarImagen(LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica);
  const subterra = empresa === "subterra";

  const portada = (titulo, subtitulo, linea3) => {
    if (marca) doc.addImage(marca.dataUrl, "PNG", M, M, 8, 8);
    f(7.5, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M + 11, M + 5.4, { charSpace: 0.5 });
    if (logo) { const h = subterra ? 26 : 14, w = Math.min(70, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", PW - M - w, M - (subterra ? 2 : -1), w, h); }
    let y = M + 22;
    f(18, "bold"); tc(T.carbon); t(titulo, M, y);
    y += 7; f(11, "bold"); tc(T.naranjaTexto); t(subtitulo, M, y);
    if (linea3) { y += 6; f(9); tc(T.texto2); t(linea3, M, y); }
    fc(T.naranja); doc.rect(M, y + 4, 22, 1, "F");
    ctx.y = y + 10;
  };
  const encabezadoCont = () => {
    f(7, "bold"); tc(T.texto3); t("GEOCORE · GRUPO GEOTECNICA", M, M + 3.2, { charSpace: 0.4 });
    f(8.5, "bold"); tc(T.carbon); t(ctx.sub, PW - M, M + 3.2, { align: "right" });
    dc(T.linea); doc.setLineWidth(0.2); doc.line(M, M + 7, PW - M, M + 7);
    ctx.y = M + 12;
  };
  const nuevaHoja = () => { doc.addPage(); encabezadoCont(); };
  const asegurar = (h) => { if (ctx.y + h > Y_MAX) { nuevaHoja(); return true; } return false; };

  // Tabla del personal de UN proyecto.
  const tablaPersonal = (liq) => {
    const { dias, filas, totales } = liq;
    const hayPrevia = filas.some(x => x.hePrevia > 0);
    const cols = [
      { k: "no", t: "No", w: 6, al: "center", sec: "col" },
      { k: "nombre", t: "Nombre · identidad", w: 46, sec: "col" },
      ...(hayPrevia ? [{ k: "prev", t: `HE ${fechaCorta(liq.viernesPrevio).split(" ")[0]}`, w: 8, al: "center", sec: "asis", prev: true }] : []),
      ...dias.map((d, i) => ({ k: d, t: diaCorto(d).slice(0, 3), sub: String(+d.slice(8)), w: 0, al: "center", sec: "asis", dia: d, fin: i === dias.length - 1 })),
      { k: "td", t: "Días", w: 10, al: "right", sec: "dias" },
      { k: "vd", t: "Valor día", w: 15, al: "right", sec: "dias" },
      { k: "tvd", t: "Total días", w: 18, al: "right", sec: "dias" },
      { k: "he", t: "Horas", w: 10, al: "right", sec: "he" },
      { k: "tvh", t: "Total HE", w: 16, al: "right", sec: "he" },
      { k: "tot", t: "Total a pagar", w: 22, al: "right", sec: "neto" },
    ];
    const fijo = cols.reduce((a, c) => a + c.w, 0), nDias = cols.filter(c => !c.w).length;
    const wDia = (CW - fijo) / nDias;
    const xs = []; let x = M; cols.forEach(c => { const w = c.w || wDia; xs.push({ x, w }); x += w; });
    const txt = (i, s, y, { bold = false, color = T.carbon, fs = 7 } = {}) => {
      const { x: cx, w } = xs[i], al = cols[i].al || "left"; f(fs, bold ? "bold" : "normal"); tc(color);
      const r = recortar(s, w - 2);
      if (al === "right") doc.text(r, cx + w - 1.3, y, { align: "right" }); else if (al === "center") doc.text(r, cx + w / 2, y, { align: "center" }); else doc.text(r, cx + 1.5, y);
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
        const rojo = c.dia && esDomingoOFeriado(c.dia);
        const color = rojo ? [169, 78, 22] : SEC[c.sec].tinta;
        if (c.sub) { txt(ci, c.t.toUpperCase(), ctx.y + 3.3, { bold: true, color, fs: 5.2 }); txt(ci, c.sub, ctx.y + 6.8, { bold: true, color: rojo ? color : T.carbon, fs: 7 }); }
        else txt(ci, c.t.toUpperCase(), ctx.y + 5.2, { bold: true, color, fs: 5.6 });
      });
      dc(T.lineaFuerte); doc.setLineWidth(0.25); doc.line(M, ctx.y + 8, PW - M, ctx.y + 8);
      ctx.y += 8;
    };
    encabezado();
    const alto = 9.5;
    filas.forEach((r, ri) => {
      if (asegurar(alto + (ri === filas.length - 1 ? 9 : 0))) encabezado();
      cols.forEach((c, ci) => { const base = SEC[c.sec].cell; fc(ri % 2 ? base.map(v => Math.max(0, v - 5)) : base); doc.rect(xs[ci].x, ctx.y, xs[ci].w, alto, "F"); });
      cols.forEach((c, ci) => {
        const y1 = ctx.y + 4.2, y2 = ctx.y + 7.9;
        if (c.k === "no") txt(ci, String(ri + 1), ctx.y + 6, { color: T.texto3 });
        else if (c.k === "nombre") { txt(ci, r.nombre, y1, { bold: true, fs: 6.9 }); txt(ci, r.dni || "", y2, { color: T.texto3, fs: 5.6 }); }
        else if (c.prev) { if (r.hePrevia) txt(ci, `+${n1(r.hePrevia)}`, ctx.y + 6, { bold: true, color: [169, 78, 22], fs: 6.6 }); }
        else if (c.dia) {
          const v = r.dias?.[c.dia]; const he = Number(r.he?.[c.dia]) || 0;
          const pal = v === undefined || v === "" ? null : CELDA_DIA[Number(v)] || CELDA_DIA[1];
          if (pal) { fc(pal.bg); doc.roundedRect(xs[ci].x + 0.7, ctx.y + 1.2, xs[ci].w - 1.4, he ? 4.6 : 7, 1.2, 1.2, "F"); txt(ci, textoDia(v), ctx.y + (he ? 4.6 : 5.9), { bold: true, color: pal.fg, fs: 7 }); }
          if (he) txt(ci, `+${n1(he)}${c.fin ? " ->" : ""}`, y2, { bold: true, color: c.fin ? T.texto3 : [169, 78, 22], fs: 5.6 });
        }
        else if (c.k === "td") txt(ci, n1(r.totalDias), ctx.y + 6, { bold: true });
        else if (c.k === "vd") txt(ci, L$(r.tarifa), ctx.y + 6);
        else if (c.k === "tvd") txt(ci, L$(r.valorDias), ctx.y + 6, { color: SEC.dias.tinta });
        else if (c.k === "he") txt(ci, r.horasHe ? n1(r.horasHe) : "-", ctx.y + 6);
        else if (c.k === "tvh") txt(ci, r.valorHe ? L$(r.valorHe) : "-", ctx.y + 6, { color: SEC.he.tinta });
        else if (c.k === "tot") txt(ci, L$(r.total), ctx.y + 6, { bold: true, color: T.naranjaTexto, fs: 7.4 });
      });
      dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
      ctx.y += alto;
    });
    // Totales
    cols.forEach((c, ci) => { fc(SEC[c.sec].head); doc.rect(xs[ci].x, ctx.y, xs[ci].w, 8.5, "F"); });
    dc([232, 118, 45]); doc.setLineWidth(0.5); doc.line(M, ctx.y, PW - M, ctx.y);
    txt(1, `Total · ${filas.length} persona${filas.length === 1 ? "" : "s"}`, ctx.y + 5.6, { bold: true, color: T.carbon, fs: 7.6 });
    const iK = (k) => cols.findIndex(c => c.k === k);
    txt(iK("td"), n1(totales.dias), ctx.y + 5.6, { bold: true, fs: 7.6 });
    txt(iK("tvd"), L$(totales.valorDias), ctx.y + 5.6, { bold: true, color: SEC.dias.tinta, fs: 7.6 });
    txt(iK("he"), n1(totales.horasHe), ctx.y + 5.6, { bold: true, fs: 7.6 });
    txt(iK("tvh"), L$(totales.valorHe), ctx.y + 5.6, { bold: true, color: SEC.he.tinta, fs: 7.6 });
    txt(iK("tot"), L$(totales.total), ctx.y + 5.6, { bold: true, color: T.naranjaTexto, fs: 8 });
    ctx.y += 8.5 + 5;
    return { hayPrevia };
  };

  // Datos de la misión (cuadrícula de 4 × 2).
  const datos = (items) => {
    const w = CW / 4;
    items.forEach(([lab, val], i) => {
      const x = M + (i % 4) * w, y = ctx.y + Math.floor(i / 4) * 11;
      f(6.3, "bold"); tc(T.texto3); t(String(lab).toUpperCase(), x, y, { charSpace: 0.3 });
      f(9, "bold"); tc(T.carbon); doc.text(recortar(val || "-", w - 4), x, y + 4.6);
    });
    ctx.y += Math.ceil(items.length / 4) * 11 + 1;
  };

  const bloqueProyecto = (p, primero) => {
    const { liq } = p; const { corte, filas, totales } = liq;
    ctx.sub = `${p.nombre} · Jornales · corte ${nombreCorteLargo(corte)}`;
    if (!primero) doc.addPage();
    portada("Solicitud de pago · Jornales", `${p.nombre} · personal por día`, `Corte ${nombreCorteLargo(corte)} · se paga el ${fechaLarga(corte.pago)}`);
    datos([
      ["Lugar y fecha", `${String(lugar).split(",")[0]}, ${fechaCorta(hoy)} ${String(hoy).slice(0, 4)}`], ["Proyecto asignado", p.nombre],
      ["Período", `${fechaCorta(corte.ini)} al ${fechaCorta(corte.fin)} ${corte.fin.slice(0, 4)}`], ["Fecha de pago", fechaLarga(corte.pago)],
      ["Motivo", "Pago de personal M.O. por día"], ["Depositar a", liq.encargado || "-"],
      ["Asistencia tomada por", p.asistenciaPor || "-"], ["Identidades", `${filas.filter(x => identidades[x.id]?.frente).length} de ${filas.length} adjuntas`],
    ]);
    const kw = (CW - 9) / 4;
    pdfKpi(doc, M, ctx.y, kw, 15, "Personas", String(filas.length));
    pdfKpi(doc, M + (kw + 3), ctx.y, kw, 15, "Días pagados", n1(totales.dias));
    pdfKpi(doc, M + 2 * (kw + 3), ctx.y, kw, 15, "Horas extra", `${n1(totales.horasHe)} h · ${L$(totales.valorHe)}`);
    pdfKpi(doc, M + 3 * (kw + 3), ctx.y, kw, 15, "Total a pagar", L$(totales.total), { tono: "naranjaTexto" });
    ctx.y += 21;
    f(11.5, "bold"); tc(T.carbon); t("Personal", M, ctx.y + 3); f(8); tc(T.texto3); t(`${filas.length} persona${filas.length === 1 ? "" : "s"} · ${nombreCorteLargo(corte)}`, M + 18, ctx.y + 3); ctx.y += 7;
    const { hayPrevia } = tablaPersonal(liq);

    // Observaciones + caja del total
    const notas = [
      hayPrevia ? `La columna HE ${fechaCorta(liq.viernesPrevio)} son las horas extra de la tarde del viernes del corte anterior: se pagan en este.` : "",
      totales.heSiguiente ? `Las horas extra marcadas con -> (tarde del ${fechaCorta(corte.fin)}) se pagan en el próximo corte.` : "",
      "Valor de la hora extra = valor del día ÷ 8.",
    ].filter(Boolean).join(" ");
    asegurar(30);
    const wObs = CW * 0.62, hObs = 24;
    fc(T.fondo); doc.roundedRect(M, ctx.y, wObs, hObs, 3, 3, "F");
    f(6.3, "bold"); tc(T.texto3); t("OBSERVACIONES", M + 5, ctx.y + 5.5, { charSpace: 0.3 });
    f(8.6); tc(T.carbon);
    const obs = doc.splitTextToSize(latin1(liq.encargado ? `Favor depositar a ${liq.encargado}, quien se encargará de gestionar el pago y el cierre.${liq.observaciones ? " " + liq.observaciones : ""}` : `Sin encargado del pago indicado.${liq.observaciones ? " " + liq.observaciones : ""}`), wObs - 10);
    doc.text(obs.slice(0, 2), M + 5, ctx.y + 11);
    f(6.8); tc(T.texto3); doc.text(doc.splitTextToSize(latin1(notas), wObs - 10).slice(0, 2), M + 5, ctx.y + 18.5);
    const xT = M + wObs + 4, wT = CW - wObs - 4;
    fc(T.carbon); doc.roundedRect(xT, ctx.y, wT, hObs, 3, 3, "F");
    f(6.5, "bold"); tc([200, 196, 190]); t(`TOTAL A PAGAR · ${fechaCorta(corte.pago).toUpperCase()}`, xT + 6, ctx.y + 7, { charSpace: 0.3 });
    f(20, "bold"); tc([242, 163, 107]); t(L$(totales.total), xT + 6, ctx.y + 18);
    ctx.y += hObs + 18;

    // Firmas
    asegurar(20);
    const firmas = [["Asistencia", p.asistenciaPor || ""], ["Elaborado por · Recursos Humanos", p.elaboradoPor || ""], ["Autorizado", ""]];
    const fw = (CW - 30) / 3;
    firmas.forEach(([lab, nom], i) => {
      const fx = M + 5 + i * (fw + 10);
      dc(T.carbon); doc.setLineWidth(0.3); doc.line(fx, ctx.y, fx + fw, ctx.y);
      f(8, "bold"); tc(T.carbon); t(lab, fx + fw / 2, ctx.y + 4.5, { align: "center" });
      if (nom) { f(8); tc(T.texto2); t(nom, fx + fw / 2, ctx.y + 9, { align: "center" }); }
    });

    // Identidades: hoja aparte, tarjetas de 2 columnas.
    doc.addPage(); ctx.sub = `${p.nombre} · Identidades del personal`; encabezadoCont();
    f(12, "bold"); tc(T.carbon); t(`Identidades · ${p.nombre}`, M, ctx.y + 3);
    f(8); tc(T.texto3); t(`${filas.filter(x => identidades[x.id]?.frente).length} de ${filas.length} adjuntas`, PW - M, ctx.y + 3, { align: "right" });
    ctx.y += 8;
    const gap = 6, wc = (CW - gap) / 2, hc = 62;
    filas.forEach((r, i) => {
      const col = i % 2;
      if (col === 0 && ctx.y + hc > Y_MAX) { doc.addPage(); encabezadoCont(); }
      const x0 = M + col * (wc + gap), y0 = ctx.y;
      fc(T.fondo); doc.roundedRect(x0, y0, wc, hc - 4, 3, 3, "F");
      f(8.6, "bold"); tc(T.carbon); doc.text(recortar(`${i + 1}. ${r.nombre}`, wc - 50), x0 + 5, y0 + 6.5);
      f(7.5); tc(T.texto2); t(`${DOC_ID} ${r.dni || "-"}`, x0 + wc - 5, y0 + 6.5, { align: "right" });
      const idn = identidades[r.id] || {};
      [["frente", "Frente"], ["reverso", "Reverso"]].forEach(([k, lab], j) => {
        const fx = x0 + 5 + j * ((wc - 15) / 2 + 5), fwid = (wc - 15) / 2, fy = y0 + 10, fh = hc - 22;
        fc([255, 255, 255]); doc.roundedRect(fx, fy, fwid, fh, 2, 2, "F");
        const im = idn[k];
        if (im?.dataUrl) {
          const s = Math.min(fwid / im.w, fh / im.h), w = im.w * s, h = im.h * s;
          try { doc.addImage(im.dataUrl, "JPEG", fx + (fwid - w) / 2, fy + (fh - h) / 2, w, h); } catch { /* imagen dañada */ }
        } else { f(8, "bold"); tc(k === "frente" ? [176, 48, 36] : T.texto3); t(k === "frente" ? "Falta escanear" : "Sin reverso", fx + fwid / 2, fy + fh / 2, { align: "center" }); }
        f(6, "bold"); tc(T.texto3); t(lab.toUpperCase(), fx + fwid / 2, fy + fh + 4, { align: "center", charSpace: 0.3 });
      });
      if (col === 1 || i === filas.length - 1) ctx.y += hc;
    });
  };

  // Varios proyectos: portada con el resumen.
  if (proyectos.length > 1) {
    const corte = proyectos[0].liq.corte;
    ctx.sub = `Jornales · corte ${nombreCorteLargo(corte)}`;
    portada("Solicitud de pago · Jornales", "Todos los proyectos · personal por día", `Corte ${nombreCorteLargo(corte)} · se paga el ${fechaLarga(corte.pago)}`);
    const tot = proyectos.reduce((a, p) => a + p.liq.totales.total, 0);
    const kw = (CW - 6) / 3;
    pdfKpi(doc, M, ctx.y, kw, 15, "Proyectos", String(proyectos.length));
    pdfKpi(doc, M + kw + 3, ctx.y, kw, 15, "Personas", String(proyectos.reduce((a, p) => a + p.liq.filas.length, 0)));
    pdfKpi(doc, M + 2 * (kw + 3), ctx.y, kw, 15, "Total a pagar", L$(tot), { tono: "naranjaTexto" });
    ctx.y += 22;
    const cs = [["Proyecto", 80, "left", "col"], ["Personas", 22, "right", "col"], ["Días", 22, "right", "dias"], ["Horas extra", 26, "right", "he"], ["Depositar a", 60, "left", "col"], ["Total a pagar", 0, "right", "neto"]];
    const fijo = cs.reduce((a, c) => a + c[1], 0); let x = M; const xs = cs.map(c => { const w = c[1] || CW - fijo; const o = { x, w }; x += w; return o; });
    const fila = (vals, y, { head = false, bold = false, tinte = null } = {}) => {
      cs.forEach((c, i) => { fc(head ? SEC[c[3]].head : tinte ? SEC[c[3]].head : SEC[c[3]].cell); doc.rect(xs[i].x, y, xs[i].w, 8, "F"); });
      cs.forEach((c, i) => {
        f(head ? 6 : 8, head || bold || i === 0 ? "bold" : "normal"); tc(head ? SEC[c[3]].tinta : i === 5 ? T.naranjaTexto : T.carbon);
        const v = recortar(head ? String(vals[i]).toUpperCase() : vals[i], xs[i].w - 3);
        if (c[2] === "right") doc.text(v, xs[i].x + xs[i].w - 2, y + 5.3, { align: "right" }); else doc.text(v, xs[i].x + 2, y + 5.3);
      });
    };
    fila(cs.map(c => c[0]), ctx.y, { head: true }); ctx.y += 8;
    proyectos.forEach(p => { fila([p.nombre, String(p.liq.filas.length), n1(p.liq.totales.dias), n1(p.liq.totales.horasHe), p.liq.encargado || "-", L$(p.liq.totales.total)], ctx.y); dc(T.linea); doc.setLineWidth(0.15); doc.line(M, ctx.y + 8, PW - M, ctx.y + 8); ctx.y += 8; });
    dc([232, 118, 45]); doc.setLineWidth(0.5); doc.line(M, ctx.y, PW - M, ctx.y);
    fila(["Total", "", "", "", "", L$(tot)], ctx.y, { bold: true, tinte: true });
  }
  proyectos.forEach((p, i) => bloqueProyecto(p, proyectos.length === 1 && i === 0));
  pdfPie(doc, { margen: M });
  return doc;
};

export const pdfJornales = async (args) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const ids = {};
  await Promise.all(Object.entries(args.identidades || {}).map(async ([id, v]) => { ids[id] = { frente: await aJpeg(v?.frente), reverso: await aJpeg(v?.reverso) }; }));
  const doc = await construirJornalesPDF({ ...args, identidades: ids, jsPDF });
  const c = args.proyectos[0].liq.corte;
  const nombre = `Solicitud_pago_jornales_${args.proyectos.length === 1 ? String(args.proyectos[0].short || args.proyectos[0].nombre).replace(/[^\wÁÉÍÓÚÑáéíóúñ-]+/g, "_") : "todos"}_${c.ini}_al_${c.fin}.pdf`;
  doc.save(nombre);
  return nombre;
};

// ── EXCEL ───────────────────────────────────────────────────────────────────
const ARGB = (rgb) => "FF" + rgb.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const HEX = (h) => "FF" + h.replace("#", "").toUpperCase();
/** Excel: una hoja por proyecto (+ Resumen si hay varios), con el logo, las franjas y los días pintados. */
export const excelJornales = async ({ proyectos, empresa = "geotecnica" }) => {
  const wb = await libroExcel();
  wb.calcProperties = { fullCalcOnLoad: true };
  const FUENTE = "Calibri";
  const ft = (o = {}) => ({ name: FUENTE, size: 10.5, color: { argb: HEX(RP.carbon) }, ...o });
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const FMT = `"${MONEDA} "#,##0.00;[Red]-"${MONEDA} "#,##0.00;"-"`;
  const logo = await cargarImagen(LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica).catch(() => null);
  const imgId = logo?.dataUrl ? wb.addImage({ base64: logo.dataUrl.slice(logo.dataUrl.indexOf(",") + 1), extension: "png" }) : null;
  const usados = new Set();
  const nombreHoja = (s) => { let h = String(s || "Proyecto").replace(/[\\/?*[\]:]/g, "-").slice(0, 28) || "Proyecto"; while (usados.has(h)) h += "·"; usados.add(h); return h; };
  const cabecera = (ws, ultima, [tit, sub, sub2]) => {
    [[1, 26], [2, 19], [3, 17], [4, 8]].forEach(([r, h]) => { ws.getRow(r).height = h; });
    [[tit, ft({ size: 17, bold: true })], [sub, ft({ size: 12, bold: true, color: { argb: HEX(RP.naranjaTexto) } })], [sub2, ft({ size: 10, color: { argb: HEX(RP.texto2) } })]].forEach(([v, fo], i) => {
      ws.mergeCells(i + 1, 3, i + 1, Math.min(ultima, 18)); const c = ws.getCell(i + 1, 3); c.value = v; c.font = fo; c.alignment = { vertical: "middle" };
    });
    for (let col = 1; col <= ultima; col++) ws.getCell(4, col).border = { bottom: { style: "medium", color: { argb: HEX(RP.naranja) } } };
    if (imgId != null) { const alto = empresa === "subterra" ? 70 : 40; ws.addImage(imgId, { tl: { col: 0.15, row: 0.2 }, ext: { width: Math.min(170, alto * (logo.w || 1) / (logo.h || 1)), height: alto }, editAs: "oneCell" }); }
  };

  if (proyectos.length > 1) {
    const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 6 }, { width: 6 }, { width: 34 }, { width: 11 }, { width: 11 }, { width: 13 }, { width: 28 }, { width: 17 }];
    const c = proyectos[0].liq.corte;
    cabecera(ws, 8, ["Solicitud de pago · Jornales", "Todos los proyectos · personal por día", `Corte ${nombreCorteLargo(c)} · se paga el ${fechaLarga(c.pago)} · generado el ${fechaGenerado()}`]);
    const hdr = ws.getRow(6); ["", "", "Proyecto", "Personas", "Días", "Horas extra", "Depositar a", "Total a pagar"].forEach((v, i) => { const cell = hdr.getCell(i + 1); cell.value = v.toUpperCase(); if (i >= 2) { cell.font = ft({ size: 8.5, bold: true, color: { argb: i === 7 ? ARGB(SEC.neto.tinta) : ARGB(SEC.col.tinta) } }); cell.fill = fill(i === 7 ? ARGB(SEC.neto.head) : ARGB(SEC.col.head)); cell.alignment = { horizontal: i >= 3 && i !== 6 ? "right" : "left", vertical: "middle" }; } });
    hdr.height = 22;
    let r = 7;
    proyectos.forEach((p, i) => {
      const row = ws.getRow(r); row.values = ["", "", p.nombre, p.liq.filas.length, p.liq.totales.dias, p.liq.totales.horasHe, p.liq.encargado || "", p.liq.totales.total];
      row.font = ft(); row.getCell(3).font = ft({ bold: true }); row.getCell(8).numFmt = FMT; row.getCell(8).font = ft({ bold: true, color: { argb: HEX(RP.naranjaTexto) } }); row.getCell(8).fill = fill(ARGB(SEC.neto.cell));
      if (i % 2) for (let col = 3; col <= 7; col++) row.getCell(col).fill = fill("FFFBFAF8");
      row.height = 19; r++;
    });
    const tt = ws.getRow(r); tt.getCell(3).value = "TOTAL"; tt.getCell(8).value = { formula: `SUM(H7:H${r - 1})`, result: proyectos.reduce((a, p) => a + p.liq.totales.total, 0) };
    for (let col = 3; col <= 8; col++) { const cell = tt.getCell(col); cell.font = ft({ bold: true, size: 11, color: { argb: col === 8 ? HEX(RP.naranjaTexto) : HEX(RP.carbon) } }); cell.fill = fill(col === 8 ? ARGB(SEC.neto.head) : ARGB(SEC.col.head)); cell.border = { top: { style: "medium", color: { argb: HEX(RP.naranja) } } }; }
    tt.getCell(8).numFmt = FMT; tt.height = 22;
  }

  proyectos.forEach(p => {
    const { liq } = p; const { dias, filas, totales, corte } = liq;
    const fechasHe = fechasHeDelCorte(corte);
    const ws = wb.addWorksheet(nombreHoja(p.short || p.nombre), { views: [{ state: "frozen", xSplit: 3, ySplit: 7, showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    // Columnas: No · Nombre · Identidad · días · HE por fecha · Total días · Valor día · Total días $ · Horas · Valor HE · Total HE · Total a pagar
    const cols = [
      { k: "no", h: "No", w: 5, sec: "col" }, { k: "nombre", h: "Nombre", w: 30, sec: "col" }, { k: "dni", h: "Identidad", w: 16, sec: "col" },
      ...dias.map(d => ({ k: "d" + d, h: `${diaCorto(d)} ${+d.slice(8)}`, w: 6.5, sec: "asis", dia: d })),
      ...fechasHe.map(d => ({ k: "h" + d, h: `HE ${diaCorto(d)} ${+d.slice(8)}`, w: 7, sec: "he", heDia: d })),
      { k: "td", h: "Total días", w: 9, sec: "dias", fmt: "0.0#" }, { k: "vd", h: "Valor por día", w: 12, sec: "dias", fmt: FMT }, { k: "tvd", h: "Total días", w: 13, sec: "dias", fmt: FMT },
      { k: "he", h: "Horas extra", w: 9, sec: "he", fmt: "0.0#" }, { k: "vh", h: "Valor HE", w: 10, sec: "he", fmt: FMT }, { k: "tvh", h: "Total HE", w: 12, sec: "he", fmt: FMT },
      { k: "tot", h: "Total a pagar", w: 15, sec: "neto", fmt: FMT },
    ];
    ws.columns = cols.map(c => ({ width: c.w }));
    const U = cols.length, idx = (k) => cols.findIndex(c => c.k === k) + 1, letra = (k) => ws.getColumn(idx(k)).letter;
    cabecera(ws, U, [`Solicitud de pago · Jornales · ${p.nombre}`, `Corte ${nombreCorteLargo(corte)} · se paga el ${fechaLarga(corte.pago)}`, `${liq.encargado ? `Depositar a ${liq.encargado} · ` : ""}${p.asistenciaPor ? `asistencia de ${p.asistenciaPor} · ` : ""}generado el ${fechaGenerado()} · GeoCore`]);
    // Franjas de sección (fila 6) y encabezados (fila 7)
    const secTit = { col: "JORNAL", asis: "ASISTENCIA DEL CORTE", he: "HORAS EXTRA (POR FECHA Y TOTAL)", dias: "PAGO POR DÍAS", neto: "A PAGAR" };
    let i0 = 1;
    while (i0 <= U) {
      // Cada tramo contiguo de la misma sección es una franja (las HE por fecha y las HE totales quedan separadas por "Pago por días").
      const s = cols[i0 - 1].sec; let i1 = i0; while (i1 < U && cols[i1].sec === s) i1++;
      if (i1 > i0) ws.mergeCells(6, i0, 6, i1);
      const c = ws.getCell(6, i0); c.value = secTit[s]; c.font = ft({ size: 8.5, bold: true, color: { argb: ARGB(SEC[s].tinta) } }); c.alignment = { horizontal: "center", vertical: "middle" };
      for (let k = i0; k <= i1; k++) ws.getCell(6, k).fill = fill(ARGB(SEC[s].head));
      i0 = i1 + 1;
    }
    ws.getRow(6).height = 18;
    const hr = ws.getRow(7);
    cols.forEach((c, i) => {
      const cell = hr.getCell(i + 1); cell.value = c.h.toUpperCase();
      const rojo = (c.dia && esDomingoOFeriado(c.dia)) || (c.heDia && esDomingoOFeriado(c.heDia));
      cell.font = ft({ size: 8, bold: true, color: { argb: rojo ? HEX(RP.naranjaTexto) : ARGB(SEC[c.sec].tinta) } });
      cell.fill = fill(ARGB(SEC[c.sec].head)); cell.alignment = { horizontal: i < 3 ? "left" : "center", vertical: "middle", wrapText: true };
      cell.border = { right: { style: "thin", color: { argb: "FFFFFFFF" } }, bottom: { style: "thin", color: { argb: HEX(RP.lineaFuerte) } } };
    });
    hr.height = 30;
    let r = 8; const r0 = r;
    filas.forEach((x, fi) => {
      const row = ws.getRow(r);
      const set = (k, v, o = {}) => { const cell = row.getCell(idx(k)); cell.value = v; if (o.fmt) cell.numFmt = o.fmt; cell.font = ft(o.font || {}); cell.alignment = { horizontal: o.al || "center", vertical: "middle" }; if (o.fill) cell.fill = fill(o.fill); return cell; };
      set("no", fi + 1, { font: { color: { argb: HEX(RP.texto3) } } });
      set("nombre", x.nombre, { al: "left", font: { bold: true } });
      set("dni", x.dni || "", { al: "left", font: { color: { argb: HEX(RP.texto2) } } });
      dias.forEach(d => {
        const v = x.dias?.[d];
        if (v === undefined || v === "") { set("d" + d, null, { fill: fi % 2 ? "FFF5F7FA" : ARGB(SEC.asis.cell) }); return; }
        const pal = CELDA_DIA[Number(v)] || CELDA_DIA[1];
        set("d" + d, Number(v), { fmt: "0.#", font: { bold: true, color: { argb: ARGB(pal.fg) } }, fill: ARGB(pal.bg) });
      });
      fechasHe.forEach(d => {
        const h = d === liq.viernesPrevio ? x.hePrevia : Number(x.he?.[d]) || 0;
        set("h" + d, h || null, { fmt: "0.#", font: { bold: !!h, color: { argb: ARGB(SEC.he.tinta) } }, fill: h ? ARGB(SEC.he.head) : (fi % 2 ? "FFFBF6EA" : ARGB(SEC.he.cell)) });
      });
      const dl = (k) => `${letra(k)}${r}`;
      const primD = letra("d" + dias[0]), ultD = letra("d" + dias[dias.length - 1]);
      const primH = letra("h" + fechasHe[0]), ultH = letra("h" + fechasHe[fechasHe.length - 1]);
      const tintD = fi % 2 ? "FFE9F5ED" : ARGB(SEC.dias.cell), tintH = fi % 2 ? "FFFAF2DF" : ARGB(SEC.he.cell);
      set("td", { formula: `SUM(${primD}${r}:${ultD}${r})`, result: x.totalDias }, { fmt: "0.0#", al: "right", font: { bold: true }, fill: tintD });
      set("vd", x.tarifa, { fmt: FMT, al: "right", fill: tintD });
      set("tvd", { formula: `ROUND(${dl("td")}*${dl("vd")},2)`, result: x.valorDias }, { fmt: FMT, al: "right", font: { color: { argb: ARGB(SEC.dias.tinta) } }, fill: tintD });
      set("he", { formula: `SUM(${primH}${r}:${ultH}${r})`, result: x.horasHe }, { fmt: "0.0#", al: "right", fill: tintH });
      set("vh", { formula: `${dl("vd")}/8`, result: x.valorHora }, { fmt: FMT, al: "right", fill: tintH });
      set("tvh", { formula: `ROUND(${dl("he")}*${dl("vh")},2)`, result: x.valorHe }, { fmt: FMT, al: "right", font: { color: { argb: ARGB(SEC.he.tinta) } }, fill: tintH });
      set("tot", { formula: `${dl("tvd")}+${dl("tvh")}`, result: x.total }, { fmt: FMT, al: "right", font: { bold: true, color: { argb: HEX(RP.naranjaTexto) } }, fill: fi % 2 ? "FFFBE3D0" : ARGB(SEC.neto.cell) });
      for (let col = 1; col <= U; col++) { const cell = row.getCell(col); cell.border = { ...(cell.border || {}), bottom: { style: "hair", color: { argb: HEX(RP.lineaFuerte) } }, right: { style: "thin", color: { argb: "FFFFFFFF" } } }; if (fi % 2 && col <= 3) cell.fill = fill("FFFBFAF8"); }
      row.height = 20; r++;
    });
    const tt = ws.getRow(r);
    tt.getCell(2).value = `TOTAL · ${filas.length} persona${filas.length === 1 ? "" : "s"}`;
    const sumar = (k, res) => { const cell = tt.getCell(idx(k)); cell.value = { formula: `SUM(${letra(k)}${r0}:${letra(k)}${Math.max(r0, r - 1)})`, result: res }; };
    sumar("td", totales.dias); sumar("tvd", totales.valorDias); sumar("he", totales.horasHe); sumar("tvh", totales.valorHe); sumar("tot", totales.total);
    cols.forEach((c, i) => {
      const cell = tt.getCell(i + 1);
      cell.fill = fill(ARGB(SEC[c.sec].head));
      cell.font = ft({ bold: true, size: 11, color: { argb: c.k === "tot" ? HEX(RP.naranjaTexto) : ARGB(SEC[c.sec].tinta) } });
      cell.border = { top: { style: "medium", color: { argb: HEX(RP.naranja) } } };
      cell.alignment = { horizontal: i < 3 ? "left" : "right", vertical: "middle" };
      if (["tvd", "tvh", "tot"].includes(c.k)) cell.numFmt = FMT; else if (["td", "he"].includes(c.k)) cell.numFmt = "0.0#";
    });
    tt.height = 24;
    // Observaciones y firmas
    r += 2;
    const obs = ws.getCell(r, 2);
    obs.value = liq.encargado ? `Favor depositar a ${liq.encargado}, quien se encargará de gestionar el pago y el cierre.${liq.observaciones ? " " + liq.observaciones : ""}` : `Sin encargado del pago indicado.${liq.observaciones ? " " + liq.observaciones : ""}`;
    obs.font = ft({ bold: true });
    const nota = ws.getCell(r + 1, 2); nota.value = "Valor de la hora extra = valor del día ÷ 8. Las horas extra del viernes del corte (tarde) se pagan en el corte siguiente."; nota.font = ft({ size: 9, color: { argb: HEX(RP.texto2) } });
    r += 5;
    [["Asistencia", p.asistenciaPor || ""], ["Elaborado por · Recursos Humanos", p.elaboradoPor || ""], ["Autorizado", ""]].forEach(([lab, nom], k) => {
      const c0 = 2 + k * 7; const cell = ws.getCell(r, c0);
      cell.border = { bottom: { style: "thin", color: { argb: HEX(RP.carbon) } } };
      ws.getCell(r + 1, c0).value = lab; ws.getCell(r + 1, c0).font = ft({ size: 9.5, bold: true });
      if (nom) { ws.getCell(r + 2, c0).value = nom; ws.getCell(r + 2, c0).font = ft({ size: 9, color: { argb: HEX(RP.texto2) } }); }
    });
  });
  const c = proyectos[0].liq.corte;
  await descargarExcel(wb, `Jornales_${proyectos.length === 1 ? String(proyectos[0].short || proyectos[0].nombre).replace(/\s+/g, "_") : "todos"}_${c.ini}_al_${c.fin}.xlsx`);
};
