// ═══════════════════════════════════════════════════════════════════════════
// GeoTeam — Planilla: PDF (jsPDF) y Excel (exceljs), 16-oct-2026.
// Los dos salen con la estética de GeoCore (carbón / naranja / gris, vidrio
// plano) y la MISMA estructura: encabezado de la empresa, resumen, una tabla
// por tipo de contrato (Permanentes · Temporales · Honorarios) con subtotales,
// el cierre (salarios + horas extras = total a pagar, por método de pago) y
// la hoja de HORAS EXTRAS de la quincena vencida. Ambas librerías se cargan
// bajo demanda con safeDynamicImport. Helvetica no sabe de acentos fuera de
// Latin-1 ni de emojis: todo texto del PDF pasa por latin1().
// 26-oct-2026: cabecera, pie, KPIs, tablas y Excel con el estilo único de
// reportes (reporte-estilo.js). Números, columnas y hojas NO cambiaron.
// ═══════════════════════════════════════════════════════════════════════════
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA, RP, pdfCabecera, pdfPie, pdfKpi, cargarImagen, LOGO_EMPRESA } from "./reporte-estilo.js";
import { totalesLinea, resumenPlanilla, nombreQuincena, rangoQuincena, etiquetaCorta, mesLargo, GRUPOS_CT, METODOS_PAGO, notaAutomatica, diasMostrados } from "./planilla-calc.js";

const CARBON = PDF_TEMA.carbon, GRIS = PDF_TEMA.texto2, GRIS_FAINT = PDF_TEMA.texto3, FONDO = PDF_TEMA.fondo;
const TINTE = PDF_TEMA.tinte, NARANJA_TEXTO = PDF_TEMA.naranjaTexto, LINEA = PDF_TEMA.linea, LINEA_FUERTE = PDF_TEMA.lineaFuerte, ROJO = PDF_TEMA.rojo;
// La empresa llega como nombre ("Subterra Honduras"…): el logo de la cabecera sale de ahí.
const empresaKey = (empresa) => /subterra/i.test(String(empresa || "")) ? "subterra" : "geotecnica";

const MAPA_L1 = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "·": "·", "×": "x", "→": "->", "✓": "si", "€": "EUR" };
export const latin1 = (s) => String(s ?? "").replace(/[–—‘’“”…×→✓€]/g, c => MAPA_L1[c] ?? "").replace(/[^\u0000-ÿ]/g, "");
const nf = (n, d = 2) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const L = (n) => (Number(n) || 0) === 0 ? "-" : `${n < 0 ? "-" : ""}${nf(Math.abs(n))}`;
const Lsiempre = (n) => `L ${nf(n)}`;
const fechaLarga = (d = new Date()) => `${d.getDate()} de ${mesLargo(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`).split(" ")[0]} de ${d.getFullYear()}`;
const slug = (s) => latin1(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "");
const nombreArchivo = (ext, empresa, periodo, quincena, parte = "salarios") => `${parte === "he" ? "Planilla_Horas_Extras" : "Planilla"}_${slug(empresa)}_${quincena}_${periodo}.${ext}`;

// Columnas de la tabla principal. `ley` agrega ISR/IHSS/RAP (solo en la 2Q).
const columnas = (ley) => [
  { k: "n", t: "N°", w: 7, al: "center", v: (l, i) => String(i + 1) },
  { k: "nombre", t: "Colaborador", w: 56, al: "left" },
  { k: "dias", t: "Días", w: 12, al: "center", v: (l) => diasMostrados(l) },
  { k: "sb", t: "Sal. mensual", w: 20, al: "right", v: (l) => L(l.sb) },
  { k: "ord", t: "Ordinario", w: 20, al: "right", v: (l, i, t) => L(t.ordinario) },
  { k: "bq", t: "Bonif.", w: 17, al: "right", v: (l) => L(l.bq) },
  { k: "fd", t: "Fer. / Dom.", w: 17, al: "right", v: (l) => L((l.bonoFeriado || 0) + (l.bonoDomingo || 0)) },
  { k: "oi", t: "Otros ing.", w: 17, al: "right", v: (l, i, t) => L(t.extrasIng) },
  { k: "asis", t: "NSP/tarde/inc.", w: 17, al: "right", v: (l, i, t) => t.dedAsist ? `-${nf(t.dedAsist)}` : "-", color: ROJO },
  ...(ley ? [
    { k: "isr", t: "ISR", w: 17, al: "right", v: (l) => L(l.isr) },
    { k: "ihss", t: "IHSS", w: 16, al: "right", v: (l) => L(l.ihss) },
    { k: "rap", t: "RAP", w: 16, al: "right", v: (l) => L(l.rap) },
  ] : []),
  { k: "coop", t: "Coop.", w: 16, al: "right", v: (l) => L(l.coop) },
  { k: "od", t: "Otras ded.", w: 17, al: "right", v: (l, i, t) => L(t.extrasDed) },
  { k: "td", t: "Total ded.", w: 19, al: "right", v: (l, i, t) => L(t.deducciones), color: ROJO },
  { k: "neto", t: "Neto", w: 23, al: "right", v: (l, i, t) => Lsiempre(t.neto), bold: true },
  { k: "pago", t: "Pago", w: 15, al: "center", v: (l) => ({ transferencia: "Transf.", cheque: "Cheque", ach: "ACH" }[l.metodoPago || "transferencia"]) },
];

/** Construye el jsPDF (sin guardar) — así se puede revisar en Node/replicar. */
export const construirPlanillaPDF = async ({ empresa, periodo, quincena, lines, meta = {}, jsPDF, parte = "salarios" }) => {
  const esHe = parte === "he";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "legal" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 10, CW = PW - 2 * M, Y_MAX = PH - 16;
  const P = {
    tc: (c) => doc.setTextColor(...c), fc: (c) => doc.setFillColor(...c), dc: (c) => doc.setDrawColor(...c),
    f: (n, s = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", s); },
    t: (s, x, y, o) => doc.text(latin1(s), x, y, o), ancho: (s) => doc.getTextWidth(latin1(s)),
  };
  const rr = (x, y, w, h, r, st = "F") => doc.roundedRect(x, y, Math.max(0.1, w), Math.max(0.1, h), r, r, st);
  const recortar = (s, w) => { let t = latin1(s); if (P.ancho(t) <= w) return t; while (t.length > 1 && P.ancho(t + "...") > w) t = t.slice(0, -1); return t.trimEnd() + "..."; };
  const res = resumenPlanilla(lines);
  const ley = quincena === "2Q";
  const ctx = { y: 0 };
  const titulo = esHe ? "Planilla de horas extras" : "Planilla de sueldos y salarios";
  const sub = `${nombreQuincena(periodo, quincena)} · ${rangoQuincena(periodo, quincena)}`;

  const estadoTxt = `${meta.estado === "publicada" ? "Publicada" : "Borrador"}${meta.generadaPor ? ` · generada por ${meta.generadaPor}` : ""}`;
  // Páginas 2+: cabecera compacta (marca a la izquierda, empresa y planilla a la derecha).
  const encabezado = () => {
    const y = M;
    P.f(7, "bold"); P.tc(GRIS_FAINT); doc.text(latin1("GEOCORE · GRUPO GEOTECNICA"), M, y + 3.2, { charSpace: 0.4 });
    P.f(8.5, "bold"); P.tc(CARBON); P.t(`${empresa} · ${titulo} · ${sub}`, PW - M, y + 3.2, { align: "right" });
    P.dc(LINEA); doc.setLineWidth(0.2); doc.line(M, y + 7, PW - M, y + 7);
    ctx.y = y + 12;
  };
  const nuevaPagina = () => { doc.addPage(); encabezado(); };
  const asegurar = (h) => { if (ctx.y + h > Y_MAX) { nuevaPagina(); return true; } return false; };

  // ── Página 1: cabecera de la casa + tiles de resumen ──
  ctx.y = await pdfCabecera(doc, { titulo, subtitulo: `${empresa} · ${sub} · ${estadoTxt}`, empresa: empresaKey(empresa), margen: M, y: M + 2 });
  const conHe = lines.filter(l => l.he && l.he.monto > 0);
  const tiles = esHe ? [
    ["Colaboradores", String(conHe.length)],
    ["Horas", nf(res.heHrs, 1)],
    ["Trabajadas en", meta.heDe ? etiquetaCorta(meta.heDe.periodo, meta.heDe.quincena) : "-"],
    ["Total a pagar", Lsiempre(res.he), "naranjaTexto"],
  ] : [
    ["Colaboradores", String(res.personas)],
    ["Salarios ordinarios", Lsiempre(res.ordinario)],
    ["Ingresos", Lsiempre(res.ingresos)],
    ["Deducciones", Lsiempre(res.deducciones), "rojo"],
    ["Total a pagar", Lsiempre(res.neto), "naranjaTexto"],
  ];
  const tw = (CW - (tiles.length - 1) * 4) / tiles.length;
  tiles.forEach(([lab, val, tono], i) => pdfKpi(doc, M + i * (tw + 4), ctx.y, tw, 17, lab, val, { tono }));
  ctx.y += 17 + 7;
  P.f(7.5); P.tc(GRIS);
  const linea2 = [];
  if (esHe) linea2.push(meta.heDe ? `Horas trabajadas en ${nombreQuincena(meta.heDe.periodo, meta.heDe.quincena).toLowerCase()} (${rangoQuincena(meta.heDe.periodo, meta.heDe.quincena)}), pagadas con la quincena vencida` : "Sin hoja de horas extras de la quincena anterior");
  else {
    linea2.push(ley ? "Segunda quincena: aplican IHSS, RAP e ISR" : "Primera quincena: sin deducciones de ley (van en la 2Q)");
    if (res.nsp) linea2.push(`${res.nsp} NSP`);
    if (res.he) linea2.push(`Las horas extras (${Lsiempre(res.he)}) van en su propia planilla`);
  }
  P.t(linea2.join("   ·   "), M, ctx.y);
  ctx.y += 6;

  // ── Tablas por grupo (planilla de salarios) ──
  const cols = columnas(ley);
  const bw = (CW - 8) / 3;
  const caja = (x, tit, filas, destacar) => {
    const h = 10 + filas.length * 6.2 + (destacar ? 2 : 0);
    P.fc(destacar ? TINTE : FONDO); rr(x, ctx.y, bw, h, 3);
    P.f(6.5, "bold"); P.tc(destacar ? NARANJA_TEXTO : GRIS_FAINT); doc.text(latin1(tit.toUpperCase()), x + 4, ctx.y + 5.5, { charSpace: 0.3 });
    filas.forEach(([a, b, big], i) => {
      const y = ctx.y + 11.5 + i * 6.2;
      P.f(big ? 9 : 7.5, big ? "bold" : "normal"); P.tc(CARBON);
      P.t(a, x + 4, y); P.f(big ? 10 : 7.5, "bold"); P.tc(big && destacar ? NARANJA_TEXTO : CARBON); P.t(b, x + bw - 4, y, { align: "right" });
    });
    return h;
  };
  if (!esHe) {
  const escala = CW / cols.reduce((s, c) => s + c.w, 0);
  const xs = []; let acc = M; cols.forEach(c => { xs.push({ x: acc, w: c.w * escala }); acc += c.w * escala; });
  const celda = (ci, texto, y, { al, bold, color, fs = 6.8 }) => {
    const { x, w } = xs[ci];
    P.f(fs, bold ? "bold" : "normal"); P.tc(color || CARBON);
    const tx = al === "right" ? x + w - 1.5 : al === "center" ? x + w / 2 : x + 1.5;
    P.t(recortar(texto, w - 3), tx, y, { align: al === "left" ? undefined : al });
  };
  const filaEncabezado = () => {
    cols.forEach((c, ci) => celda(ci, c.t.toUpperCase(), ctx.y + 4.4, { al: c.al, bold: true, color: GRIS_FAINT, fs: 5.8 }));
    P.dc(LINEA_FUERTE); doc.setLineWidth(0.25); doc.line(M, ctx.y + 6.5, PW - M, ctx.y + 6.5);
    ctx.y += 6.5;
  };
  GRUPOS_CT.forEach(([ct, label]) => {
    const rows = lines.filter(l => l.ct === ct);
    if (!rows.length) return;
    const g = res.porGrupo[ct];
    // Un grupo que cabe entero en una hoja no se parte (29-oct-2026, Gerson:
    // "que no se corte a la mitad"): si no cabe en lo que queda, arranca en la
    // siguiente. Uno más largo que una hoja sí se parte, repitiendo encabezados.
    const altoGrupo = 7 + 6.5 + 8 + rows.reduce((s, l) => s + 7 + ((l.nota || (l.extras || []).length) ? 3.3 : 0), 0);
    asegurar(altoGrupo <= Y_MAX - 40 ? altoGrupo : 24);
    P.f(9.5, "bold"); P.tc(CARBON); P.t(label, M, ctx.y + 4);
    const wLabel = P.ancho(label);
    P.f(7.5); P.tc(GRIS); P.t(`${rows.length} ${rows.length === 1 ? "persona" : "personas"}`, M + wLabel + 3, ctx.y + 4);
    P.f(8, "bold"); P.tc(CARBON); P.t(`Subtotal ${Lsiempre(g.neto)}`, PW - M, ctx.y + 4, { align: "right" });
    ctx.y += 7;
    filaEncabezado();
    rows.forEach((l, i) => {
      const t = totalesLinea(l);
      const nota = [l.nota, ...(l.extras || []).map(x => `${x.tipo === "ingreso" ? "+" : "-"}${nf(x.monto)} ${x.concepto || ""}`)].filter(Boolean).join(" · ");
      const h = 7 + (nota ? 3.3 : 0);
      // La última fila viaja junto con la de totales (nunca un "Totales" solo arriba de una página).
      if (asegurar(h + (i === rows.length - 1 ? 8 : 0))) filaEncabezado();
      const yt = ctx.y + 4.6;
      cols.forEach((c, ci) => {
        if (c.k === "nombre") {
          celda(ci, l.name, yt - 1.2, { al: "left", bold: true, fs: 7 });
          const { x, w } = xs[ci];
          P.f(5.6); P.tc(GRIS_FAINT); P.t(recortar(l.pos || "", w - 3), x + 1.5, yt + 1.6);
          return;
        }
        celda(ci, c.v(l, i, t), yt, { al: c.al, bold: !!c.bold, color: c.color });
      });
      if (nota) { P.f(5.8); P.tc(GRIS); P.t(recortar(nota, CW - xs[1].x + M - 4), xs[1].x + 1.5, ctx.y + 9.2); }
      P.dc(LINEA); doc.setLineWidth(0.15); doc.line(M, ctx.y + h, PW - M, ctx.y + h);
      ctx.y += h;
    });
    // Totales del grupo
    const sum = (f) => rows.reduce((s, l) => s + f(l, totalesLinea(l)), 0);
    asegurar(8);
    P.dc(CARBON); doc.setLineWidth(0.4); doc.line(M, ctx.y + 0.2, PW - M, ctx.y + 0.2);
    const tot = {
      n: "", nombre: "Totales", dias: "", sb: L(sum(l => l.sb)), ord: L(sum((l, t) => t.ordinario)), bq: L(sum(l => l.bq)), fd: L(sum(l => (l.bonoFeriado || 0) + (l.bonoDomingo || 0))),
      oi: L(sum((l, t) => t.extrasIng)), asis: (() => { const v = sum((l, t) => t.dedAsist); return v ? `-${nf(v)}` : "-"; })(),
      isr: L(sum(l => l.isr)), ihss: L(sum(l => l.ihss)), rap: L(sum(l => l.rap)), coop: L(sum(l => l.coop)), od: L(sum((l, t) => t.extrasDed)),
      td: L(sum((l, t) => t.deducciones)), neto: Lsiempre(g.neto), pago: "",
    };
    cols.forEach((c, ci) => celda(ci, tot[c.k] ?? "", ctx.y + 4.7, { al: c.al, bold: true, color: c.k === "asis" || c.k === "td" ? ROJO : CARBON, fs: 7 }));
    ctx.y += 7 + 8;
  });

  // ── Cierre ──
  asegurar(46);
  const hs = [
    caja(M, "Por tipo de contrato", GRUPOS_CT.filter(([k]) => res.porGrupo[k]?.n).map(([k, lab]) => [`${lab} (${res.porGrupo[k].n})`, Lsiempre(res.porGrupo[k].neto)])),
    caja(M + bw + 4, "Por método de pago", METODOS_PAGO.filter(([k]) => res.porMetodo[k]?.n).map(([k, lab]) => [`${lab} (${res.porMetodo[k].n})`, Lsiempre(res.porMetodo[k].neto)])),
    caja(M + 2 * (bw + 4), "Total a pagar", [["Colaboradores", String(res.personas)], ["Total salarios", Lsiempre(res.neto), true]], true),
  ];
  ctx.y += Math.max(...hs) + 12;
  }

  // ── Hoja de horas extras ──
  if (esHe) {
    const hc = [
      { t: "N°", w: 8, al: "center" }, { t: "Colaborador", w: 70, al: "left" }, { t: "Hora base", w: 22, al: "right" },
      { t: "4 a 7 pm (x1.25)", w: 26, al: "right" }, { t: "7 a 10 pm (x1.5)", w: 26, al: "right" }, { t: "10 pm a 12 (x1.75)", w: 28, al: "right" }, { t: "Domingo (x2)", w: 24, al: "right" },
      { t: "Total horas", w: 22, al: "right" }, { t: "Monto", w: 28, al: "right" }, { t: "Pago", w: 16, al: "center" },
    ];
    const he = CW / hc.reduce((s, c) => s + c.w, 0);
    const hx = []; let a2 = M; hc.forEach(c => { hx.push({ x: a2, w: c.w * he }); a2 += c.w * he; });
    const hcel = (ci, texto, y, o = {}) => { const { x, w } = hx[ci]; P.f(o.fs || 7.2, o.bold ? "bold" : "normal"); P.tc(o.color || CARBON); const al = hc[ci].al; P.t(recortar(texto, w - 3), al === "right" ? x + w - 1.5 : al === "center" ? x + w / 2 : x + 1.5, y, { align: al === "left" ? undefined : al }); };
    const hcab = () => { hc.forEach((c, ci) => hcel(ci, c.t.toUpperCase(), ctx.y + 4.4, { bold: true, color: GRIS_FAINT, fs: 6 })); P.dc(LINEA_FUERTE); doc.setLineWidth(0.25); doc.line(M, ctx.y + 6.5, PW - M, ctx.y + 6.5); ctx.y += 6.5; };
    hcab();
    const hsum = { b1: 0, b2: 0, b3: 0, dom: 0, hrs: 0, monto: 0 };
    conHe.forEach((l, i) => {
      if (asegurar(7)) hcab();
      const b = l.he.bandas || {};
      const y = ctx.y + 4.7;
      hcel(0, String(i + 1), y); hcel(1, l.name, y, { bold: true }); hcel(2, Lsiempre(l.he.horaBase), y);
      ["b1", "b2", "b3", "dom"].forEach((k, j) => { const h = b[k]?.hrs || 0; hcel(3 + j, h ? nf(h, 1) : "-", y); hsum[k] += h; });
      hcel(7, nf(l.he.hrs, 1), y, { bold: true }); hcel(8, Lsiempre(l.he.monto), y, { bold: true }); hcel(9, { transferencia: "Transf.", cheque: "Cheque", ach: "ACH" }[l.metodoPago || "transferencia"], y);
      hsum.hrs += l.he.hrs; hsum.monto += l.he.monto;
      P.dc(LINEA); doc.setLineWidth(0.15); doc.line(M, ctx.y + 7, PW - M, ctx.y + 7);
      ctx.y += 7;
    });
    P.dc(CARBON); doc.setLineWidth(0.4); doc.line(M, ctx.y + 0.2, PW - M, ctx.y + 0.2);
    hcel(1, "Totales", ctx.y + 4.7, { bold: true });
    ["b1", "b2", "b3", "dom"].forEach((k, j) => hcel(3 + j, hsum[k] ? nf(hsum[k], 1) : "-", ctx.y + 4.7, { bold: true }));
    hcel(7, nf(hsum.hrs, 1), ctx.y + 4.7, { bold: true }); hcel(8, Lsiempre(hsum.monto), ctx.y + 4.7, { bold: true });
    ctx.y += 7 + 10;
    if (!conHe.length) { P.f(9); P.tc(GRIS); P.t("No hay horas extras para pagar en esta quincena.", M, ctx.y); ctx.y += 8; }
    asegurar(40);
    const hm = METODOS_PAGO.filter(([k]) => res.hePorMetodo[k]?.n).map(([k, lab]) => [`${lab} (${res.hePorMetodo[k].n})`, Lsiempre(res.hePorMetodo[k].monto)]);
    const h1 = caja(M, "Por método de pago", hm.length ? hm : [["-", "-"]]);
    const h2 = caja(M + 2 * (bw + 4), "Total a pagar", [["Colaboradores", String(conHe.length)], ["Total horas extras", Lsiempre(res.he), true]], true);
    ctx.y += Math.max(h1, h2) + 12;
  }

  // ── Firmas ──
  asegurar(22);
  const fw = (CW - 40) / 3;
  [["Elaborado por", meta.elaboradoPor || ""], ["Revisado por", ""], ["Autorizado por", ""]].forEach(([lab, nom], i) => {
    const x = M + 20 + i * fw;
    P.dc(CARBON); doc.setLineWidth(0.3); doc.line(x + 10, ctx.y + 10, x + fw - 30, ctx.y + 10);
    P.f(7, "bold"); P.tc(CARBON); P.t(lab, x + (fw - 20) / 2, ctx.y + 14.5, { align: "center" });
    if (nom) { P.f(7); P.tc(GRIS); P.t(nom, x + (fw - 20) / 2, ctx.y + 18.5, { align: "center" }); }
  });

  // ── Pie de la casa en todas las páginas ──
  pdfPie(doc, { margen: M });
  return doc;
};

export const exportarPlanillaPDF = async (args) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = await construirPlanillaPDF({ ...args, jsPDF });
  const nombre = nombreArchivo("pdf", args.empresa, args.periodo, args.quincena, args.parte);
  doc.save(nombre);
  return nombre;
};

// ── Excel ──────────────────────────────────────────────────────────────────
// 30-oct-2026 (Gerson: "viene toda blanca, fea; usemos los logos, naranja,
// bonita"): cabecera con el LOGO de la empresa y franja naranja, tiles de
// "Colaboradores" y "Total a pagar", bandas Datos · Ingresos · Deducciones ·
// A pagar sobre el encabezado carbón, filas alternadas, el neto resaltado en
// naranja clarito y el total en carbón con el neto en naranja. Letra Calibri
// (Helvetica Neue y Menlo no existen en Windows y Excel las cambiaba por
// Arial / Courier). Las celdas, fórmulas, columnas y hojas son las mismas.
const FMT_L = '"L" #,##0.00;[Red]-"L" #,##0.00;"-"';
const ARGB = (h) => "FF" + h.replace("#", "").toUpperCase();
const FUENTE = "Calibri";
/**
 * Arma el libro (sin descargar) — reutilizable desde Node para revisarlo.
 * logo = {dataUrl, w, h} de la empresa (opcional: sin él la cabecera sale igual, sin imagen).
 */
export const construirPlanillaExcel = async ({ empresa, periodo, quincena, lines, meta = {}, ExcelJS, parte = "salarios", logo = null }) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GeoCore · Grupo Geotecnica"; wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const res = resumenPlanilla(lines);
  const ley = quincena === "2Q";
  const CARB = ARGB(RP.carbon), GR = ARGB(RP.texto2), GR3 = ARGB(RP.texto3), ROJ = ARGB(RP.rojo);
  const NAR = ARGB(RP.naranja), NAR_T = ARGB(RP.naranjaTexto), TINTE_X = ARGB(RP.tinte), BLANCO = "FFFFFFFF";
  const FONDO_X = ARGB(RP.fondo), CEBRA = "FFFBFAF8", TINTE_SUAVE = "FFFEF7F1";
  const fill = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
  const hair = { style: "hair", color: { argb: ARGB(RP.lineaFuerte) } };
  const fina = { style: "thin", color: { argb: ARGB(RP.lineaFuerte) } };
  const naranjaGruesa = { style: "medium", color: { argb: NAR } };
  const ft = (o = {}) => ({ name: FUENTE, size: 10.5, color: { argb: CARB }, ...o });
  const fm = ft;
  const pagoTxt = Object.fromEntries(METODOS_PAGO);
  const imgId = logo?.dataUrl ? wb.addImage({ base64: logo.dataUrl.slice(logo.dataUrl.indexOf(",") + 1), extension: "png" }) : null;

  // Cabecera: logo (columnas A–B) · empresa grande · qué planilla en naranja ·
  // periodo · estado; franja naranja abajo de punta a punta (fila 4).
  const cabeceraHoja = (hoja, { desde, hasta, ultima }, [tit, sub, periodoTxt, estado]) => {
    [[1, 30], [2, 19], [3, 18], [4, 17]].forEach(([r, h]) => { hoja.getRow(r).height = h; });
    const lineas = [[tit, ft({ size: 18, bold: true })], [sub, ft({ size: 12, bold: true, color: { argb: NAR_T } })], [periodoTxt, ft({ size: 10.5, color: { argb: CARB } })], [estado, ft({ size: 9, color: { argb: GR3 } })]];
    lineas.forEach(([v, f], i) => {
      hoja.mergeCells(`${desde}${i + 1}:${hasta}${i + 1}`);
      const c = hoja.getCell(`${desde}${i + 1}`); c.value = v; c.font = f; c.alignment = { vertical: "middle" };
    });
    for (let col = 1; col <= ultima; col++) hoja.getCell(4, col).border = { bottom: naranjaGruesa };
    if (imgId != null) {
      const alto = empresaKey(empresa) === "subterra" ? 82 : 58;
      const ancho = Math.min(230, alto * (logo.w || 1) / (logo.h || 1));
      hoja.addImage(imgId, { tl: { col: 0.25, row: 0.25 }, ext: { width: ancho, height: alto }, editAs: "oneCell" });
    }
  };
  // Tile arriba a la derecha: rótulo chico (fila 1) y cifra grande (filas 2–3).
  const tile = (hoja, c1, c2, rotulo, valor, { naranja = false, fmt = null } = {}) => {
    hoja.mergeCells(`${c1}1:${c2}1`); hoja.mergeCells(`${c1}2:${c2}3`);
    const a = hoja.getCell(`${c1}1`), b = hoja.getCell(`${c1}2`);
    a.value = rotulo.toUpperCase(); b.value = valor;
    a.font = ft({ size: 8.5, bold: true, color: { argb: naranja ? BLANCO : GR3 } });
    b.font = ft({ size: 17, bold: true, color: { argb: naranja ? BLANCO : CARB } });
    a.alignment = { horizontal: "center", vertical: "bottom" }; b.alignment = { horizontal: "center", vertical: "middle" };
    if (fmt) b.numFmt = fmt;
    [a, b].forEach(c => { c.fill = fill(naranja ? NAR : FONDO_X); });
  };
  const filaEncabezado = (row, alturas = 30) => {
    row.eachCell(c => {
      c.value = String(c.value ?? "").toUpperCase();
      c.font = ft({ size: 8.5, bold: true, color: { argb: BLANCO } });
      c.fill = fill(CARB);
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = { right: { style: "thin", color: { argb: "FF45423F" } } };
    });
    row.height = alturas;
  };
  // Título de grupo (Permanentes · Temporales · Honorarios): tinte naranja con filo a la izquierda.
  const tituloGrupo = (hoja, r, texto, ultima) => {
    hoja.mergeCells(r, 1, r, ultima);
    const sc = hoja.getCell(r, 1); sc.value = texto;
    sc.font = ft({ size: 11.5, bold: true, color: { argb: NAR_T } });
    sc.fill = fill(TINTE_X); sc.alignment = { vertical: "middle", indent: 1 };
    sc.border = { left: { style: "thick", color: { argb: NAR } }, bottom: naranjaGruesa };
    hoja.getRow(r).height = 24;
  };
  const pintarFila = (row, i, ultima) => {
    for (let c = 1; c <= ultima; c++) { const cell = row.getCell(c); cell.border = { bottom: hair }; if (i % 2 === 1) cell.fill = fill(CEBRA); }
    row.height = 19;
  };
  const filaTotal = (row, ultima, colNeto, alto = 24) => {
    for (let c = 1; c <= ultima; c++) {
      const cell = row.getCell(c);
      cell.fill = fill(c === colNeto ? NAR : CARB);
      cell.font = ft({ bold: true, size: 11, color: { argb: BLANCO } });
      cell.alignment = { vertical: "middle", horizontal: c >= 3 ? undefined : "left" };
    }
    row.height = alto;
  };
  const firmas = (hoja, r, salto = 4) => [["Elaborado por", meta.elaboradoPor || ""], ["Revisado por", ""], ["Autorizado por", ""]].forEach(([lab, nom], i) => {
    const c = 2 + i * salto;
    hoja.getCell(r, c).border = { bottom: { style: "thin", color: { argb: CARB } } };
    hoja.getCell(r + 1, c).value = lab; hoja.getCell(r + 1, c).font = ft({ size: 9.5, bold: true });
    if (nom) { hoja.getCell(r + 2, c).value = nom; hoja.getCell(r + 2, c).font = ft({ size: 9, color: { argb: GR } }); }
  });
  const estadoTxt = (extra = "") => `${meta.estado === "publicada" ? "Publicada" : "Borrador"} · generada el ${fechaLarga()}${meta.generadaPor ? ` por ${meta.generadaPor}` : ""}${extra} · GeoCore`;

  // ── PLANILLA DE HORAS EXTRAS (archivo propio) ──
  if (parte === "he") {
    const conHe = lines.filter(l => l.he && l.he.monto > 0);
    const wh = wb.addWorksheet("Horas extras", { views: [{ state: "frozen", ySplit: 6, showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    wh.columns = [["N°", 5], ["Colaborador", 34], ["Cargo", 24], ["Hora base", 12], ["4 a 7 pm (×1.25)", 14], ["7 a 10 pm (×1.5)", 14], ["10 pm a 12 (×1.75)", 15], ["Domingo (×2)", 13], ["Total horas", 12], ["Monto a pagar", 16], ["Método de pago", 16]].map(([header, width]) => ({ header, width }));
    wh.spliceRows(1, 1);
    const UH = 11;
    cabeceraHoja(wh, { desde: "C", hasta: "G", ultima: UH }, [
      empresa, "Planilla de horas extras",
      `Se pagan con la ${nombreQuincena(periodo, quincena).toLowerCase()}${meta.heDe ? ` · trabajadas en ${nombreQuincena(meta.heDe.periodo, meta.heDe.quincena).toLowerCase()} (${rangoQuincena(meta.heDe.periodo, meta.heDe.quincena)})` : ""}`,
      estadoTxt(),
    ]);
    tile(wh, "H", "I", "Colaboradores", conHe.length);
    tile(wh, "J", "K", "Total a pagar", res.he, { naranja: true, fmt: FMT_L });
    wh.getRow(6).values = wh.columns.map(c => c.header);
    filaEncabezado(wh.getRow(6));
    let hr = 7; const h0 = hr;
    conHe.forEach((l, i) => {
      const b = l.he.bandas || {};
      const row = wh.getRow(hr);
      row.values = [i + 1, l.name, l.pos || "", l.he.horaBase, b.b1?.hrs || 0, b.b2?.hrs || 0, b.b3?.hrs || 0, b.dom?.hrs || 0, l.he.hrs, l.he.monto, pagoTxt[l.metodoPago] || "Transferencia"];
      pintarFila(row, i, UH);
      row.font = ft(); row.alignment = { vertical: "middle" };
      row.getCell(2).font = ft({ bold: true }); row.getCell(1).font = ft({ color: { argb: GR3 } }); row.getCell(3).font = ft({ color: { argb: GR } });
      [4, 10].forEach(c => { row.getCell(c).numFmt = FMT_L; }); [5, 6, 7, 8, 9].forEach(c => { row.getCell(c).numFmt = "0.0;;\"-\""; row.getCell(c).alignment = { horizontal: "center", vertical: "middle" }; });
      row.getCell(10).font = ft({ bold: true }); row.getCell(10).fill = fill(TINTE_X);
      hr++;
    });
    const ht = wh.getRow(hr); ht.values = ["", "TOTAL A PAGAR"];
    [5, 6, 7, 8, 9, 10].forEach(c => { const col = wh.getColumn(c).letter; ht.getCell(c).value = { formula: `SUM(${col}${h0}:${col}${Math.max(h0, hr - 1)})`, result: Math.round(conHe.reduce((a, l) => a + (c === 10 ? l.he.monto : c === 9 ? l.he.hrs : (l.he.bandas?.[["b1", "b2", "b3", "dom"][c - 5]]?.hrs || 0)), 0) * 100) / 100 }; ht.getCell(c).numFmt = c === 10 ? FMT_L : "0.0;;\"-\""; });
    filaTotal(ht, UH, 10);
    hr += 3;
    const mt = wh.getCell(hr, 2); mt.value = "POR MÉTODO DE PAGO"; mt.font = ft({ size: 8.5, bold: true, color: { argb: GR3 } }); wh.getCell(hr, 2).border = wh.getCell(hr, 3).border = { bottom: fina }; hr++;
    METODOS_PAGO.filter(([k]) => res.hePorMetodo[k]?.n).forEach(([k, lab]) => { const row = wh.getRow(hr); row.getCell(2).value = `${lab} (${res.hePorMetodo[k].n})`; row.getCell(3).value = res.hePorMetodo[k].monto; row.getCell(3).numFmt = FMT_L; row.getCell(2).font = ft(); row.getCell(3).font = ft({ bold: true }); [2, 3].forEach(c => { row.getCell(c).border = { bottom: hair }; }); hr++; });
    firmas(wh, hr + 4, 3);
    return wb;
  }

  const ws = wb.addWorksheet("Planilla", { views: [{ state: "frozen", ySplit: 6, xSplit: 2, showGridLines: false }], pageSetup: { orientation: "landscape", paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const cols = [
    ["N°", 5], ["Colaborador", 34], ["Cargo", 26], ["Tipo", 12], ["Proyecto", 22], ["Días", 7], ["NSP", 6],
    ["Salario mensual", 15], ["Salario diario", 13], ["Ordinario", 14], ["Bonificación", 13], ["Feriados / domingos", 15], ["Otros ingresos", 14], ["Total ingresos", 15],
    ["NSP (L)", 11], ["Llegadas tarde (L)", 12], ["Incapacidad (L)", 12], ["ISR", 12], ["IHSS", 11], ["RAP", 11], ["Cooperativa", 12], ["Otras deducciones", 14], ["Total deducciones", 15], ["Neto a pagar", 17], ["Método de pago", 15], ["Notas", 48],
  ];
  const ULT = cols.length;
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  ws.spliceRows(1, 1); // sin la fila de header automática: la armamos a mano en la fila 6
  cabeceraHoja(ws, { desde: "C", hasta: "Q", ultima: ULT }, [
    empresa, "Planilla de sueldos y salarios",
    `${nombreQuincena(periodo, quincena)} · ${rangoQuincena(periodo, quincena)}`,
    estadoTxt(" · las horas extras van en su propia planilla"),
  ]);
  tile(ws, "U", "V", "Colaboradores", res.personas);
  tile(ws, "W", "X", "Total a pagar", res.neto, { naranja: true, fmt: FMT_L });
  // Bandas sobre el encabezado (fila 5).
  [[1, 7, "Colaborador", null, GR3], [8, 14, "Ingresos", TINTE_X, NAR_T], [15, 23, "Deducciones", FONDO_X, GR], [24, 26, "A pagar", NAR, BLANCO]].forEach(([a, b, t, bg, tc]) => {
    ws.mergeCells(5, a, 5, b);
    const c = ws.getCell(5, a); c.value = t.toUpperCase();
    c.font = ft({ size: 9, bold: true, color: { argb: tc } }); c.alignment = { horizontal: "center", vertical: "middle" };
    if (bg) c.fill = fill(bg);
  });
  ws.getRow(5).height = 20;
  ws.getRow(6).values = cols.map(c => c[0]);
  filaEncabezado(ws.getRow(6), 32);
  ws.getCell(6, 24).fill = fill(NAR);
  const MONEY = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const NUMS = [6, 7];
  const tipoTxt = { permanent: "Permanente", temporary: "Temporal", honorarios: "Honorarios" };
  let r = 7;
  const subtotRows = [];
  // Resultado ya calculado de cada fórmula: Excel recalcula al abrir, pero los
  // visores (Quick Look, WhatsApp, el celular) muestran solo lo guardado.
  const valorDe = (cell) => { const v = cell.value; return typeof v === "number" ? v : Number(v?.result) || 0; };
  const sumaCol = (c, a, b) => { let t = 0; for (let i = a; i <= b; i++) t += valorDe(ws.getCell(i, c)); return Math.round(t * 100) / 100; };
  GRUPOS_CT.forEach(([ct, label]) => {
    const rows = lines.filter(l => l.ct === ct);
    if (!rows.length) return;
    tituloGrupo(ws, r, `${label}  ·  ${rows.length} ${rows.length === 1 ? "persona" : "personas"}`, ULT);
    r++;
    const r0 = r;
    rows.forEach((l, i) => {
      const t = totalesLinea(l);
      const nota = [notaAutomatica(l), l.nota].filter(Boolean).join(" · ");
      const row = ws.getRow(r);
      row.values = [i + 1, l.name, l.pos || "", tipoTxt[l.ct] || l.ct, l.proj || "", Number(diasMostrados(l)) || 0, l.diasNSP || 0,
        l.sb, l.sd, t.ordinario, l.bq || 0, (l.bonoFeriado || 0) + (l.bonoDomingo || 0), t.extrasIng, { formula: `J${r}+K${r}+L${r}+M${r}`, result: Math.round((t.ordinario + (l.bq || 0) + (l.bonoFeriado || 0) + (l.bonoDomingo || 0) + t.extrasIng) * 100) / 100 },
        l.descuentoNSP || 0, l.descuentoHoras || 0, l.descuentoIncap || 0, l.isr || 0, l.ihss || 0, l.rap || 0, l.coop || 0, t.extrasDed, { formula: `SUM(O${r}:V${r})`, result: t.deducciones }, { formula: `J${r}+N${r}-W${r}`, result: t.neto }, pagoTxt[l.metodoPago] || "Transferencia", nota];
      pintarFila(row, i, ULT);
      row.font = ft();
      row.alignment = { vertical: "middle" };
      row.getCell(1).font = ft({ color: { argb: GR3 } }); row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(2).font = ft({ bold: true });
      [3, 5, 26].forEach(c => { row.getCell(c).font = ft({ color: { argb: GR } }); });
      NUMS.forEach(c => { row.getCell(c).alignment = { horizontal: "center", vertical: "middle" }; });
      MONEY.forEach(c => { row.getCell(c).numFmt = FMT_L; });
      row.getCell(14).font = ft({ bold: true });
      row.getCell(23).font = ft({ bold: true, color: { argb: ROJ } });
      row.getCell(24).font = ft({ bold: true, size: 11 }); row.getCell(24).fill = fill(TINTE_X);
      if (l.diasNSP) row.getCell(7).font = ft({ bold: true, color: { argb: ROJ } });
      r++;
    });
    const st = ws.getRow(r); st.values = ["", "Subtotal"];
    [...NUMS, ...MONEY].forEach(c => { const col = ws.getColumn(c).letter; st.getCell(c).value = { formula: `SUM(${col}${r0}:${col}${r - 1})`, result: sumaCol(c, r0, r - 1) }; if (MONEY.includes(c)) st.getCell(c).numFmt = FMT_L; });
    for (let c = 1; c <= ULT; c++) { const cell = st.getCell(c); cell.fill = fill(c === 24 ? TINTE_X : FONDO_X); cell.font = ft({ bold: true }); cell.border = { top: fina, bottom: fina }; }
    [6, 7].forEach(c => { st.getCell(c).alignment = { horizontal: "center" }; });
    st.height = 21;
    subtotRows.push(r);
    r += 2;
  });
  // Total general
  const tg = ws.getRow(r); tg.values = ["", "TOTAL A PAGAR"];
  MONEY.forEach(c => { const col = ws.getColumn(c).letter; tg.getCell(c).value = { formula: subtotRows.map(x => `${col}${x}`).join("+") || "0", result: Math.round(subtotRows.reduce((a, x) => a + valorDe(ws.getCell(x, c)), 0) * 100) / 100 }; tg.getCell(c).numFmt = FMT_L; });
  filaTotal(tg, ULT, 24, 26);
  r += 3;
  // Cierre por método de pago
  const ct0 = ws.getCell(r, 2); ct0.value = "CIERRE POR MÉTODO DE PAGO"; ct0.font = ft({ size: 8.5, bold: true, color: { argb: GR3 } }); [2, 3].forEach(c => { ws.getCell(r, c).border = { bottom: fina }; }); r++;
  METODOS_PAGO.filter(([k]) => res.porMetodo[k]?.n).forEach(([k, lab]) => {
    const row = ws.getRow(r); row.getCell(2).value = `${lab} (${res.porMetodo[k].n})`; row.getCell(3).value = res.porMetodo[k].neto; row.getCell(3).numFmt = FMT_L;
    row.getCell(2).font = ft(); row.getCell(3).font = ft({ bold: true }); [2, 3].forEach(c => { row.getCell(c).border = { bottom: hair }; }); r++;
  });
  const tp = ws.getRow(r); tp.getCell(2).value = "Total a pagar"; tp.getCell(3).value = res.neto; tp.getCell(3).numFmt = FMT_L;
  [2, 3].forEach(c => { tp.getCell(c).fill = fill(NAR); tp.getCell(c).font = ft({ bold: true, size: 11.5, color: { argb: BLANCO } }); }); tp.height = 22;
  firmas(ws, r + 5);
  if (!ley) [18, 19, 20].forEach(c => { ws.getColumn(c).hidden = true; });

  // Hoja resumen por proyecto
  const wr = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  wr.columns = [["", 3], ["", 18], ["Concepto", 40], ["Personas", 11], ["Monto", 18]].map(([header, width]) => ({ header, width }));
  wr.spliceRows(1, 1);
  cabeceraHoja(wr, { desde: "C", hasta: "E", ultima: 5 }, [empresa, "Resumen de la planilla", `${nombreQuincena(periodo, quincena)} · ${rangoQuincena(periodo, quincena)}`, estadoTxt()]);
  let rr2 = 7;
  const seccion = (tit, filas, destacar = false) => {
    wr.mergeCells(rr2, 3, rr2, 5);
    const h = wr.getCell(rr2, 3); h.value = tit.toUpperCase(); h.font = ft({ size: 9, bold: true, color: { argb: NAR_T } }); h.fill = fill(TINTE_X); h.alignment = { indent: 1, vertical: "middle" };
    h.border = { left: { style: "thick", color: { argb: NAR } } }; wr.getRow(rr2).height = 21; rr2++;
    filas.forEach(([a, n, m], i) => {
      wr.getCell(rr2, 3).value = a; wr.getCell(rr2, 4).value = n; wr.getCell(rr2, 5).value = m; wr.getCell(rr2, 5).numFmt = FMT_L;
      [3, 4, 5].forEach(c => { const cell = wr.getCell(rr2, c); cell.font = ft({ bold: destacar || c === 5 }); cell.border = { bottom: hair }; if (destacar) { cell.fill = fill(NAR); cell.font = ft({ bold: true, color: { argb: BLANCO }, size: 11.5 }); } else if (i % 2 === 1) cell.fill = fill(CEBRA); });
      wr.getCell(rr2, 4).alignment = { horizontal: "center" };
      wr.getRow(rr2).height = destacar ? 24 : 19;
      rr2++;
    });
    rr2++;
  };
  seccion("Por tipo de contrato", GRUPOS_CT.filter(([k]) => res.porGrupo[k]?.n).map(([k, lab]) => [lab, res.porGrupo[k].n, res.porGrupo[k].neto]));
  seccion("Por método de pago", METODOS_PAGO.filter(([k]) => res.porMetodo[k]?.n).map(([k, lab]) => [lab, res.porMetodo[k].n, res.porMetodo[k].neto]));
  seccion("Por proyecto (neto repartido por días trabajados)", Object.entries(res.porProyecto).sort((a, b) => b[1] - a[1]).map(([p, m]) => [p, "", m]));
  seccion("Total", [["Total salarios", res.personas, res.neto]], true);

  return wb;
};

// El PNG original del logo pesa medio mega: se reduce a 240 px de alto.
const achicarLogo = async (logo, alto = 240) => {
  if (!logo?.dataUrl || !(logo.h > alto) || typeof document === "undefined") return logo;
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = logo.dataUrl; });
    const w = Math.round(alto * logo.w / logo.h);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = alto;
    cv.getContext("2d").drawImage(im, 0, 0, w, alto);
    return { dataUrl: cv.toDataURL("image/png"), w, h: alto };
  } catch { return logo; }
};
export const exportarPlanillaExcel = async (args) => {
  const mod = await safeDynamicImport(() => import("exceljs/dist/exceljs.min.js"), "excel");
  const ExcelJS = mod.default || mod;
  const logo = await achicarLogo(await cargarImagen(LOGO_EMPRESA[empresaKey(args.empresa)]).catch(() => null));
  const wb = await construirPlanillaExcel({ ...args, ExcelJS, logo });
  const { empresa, periodo, quincena } = args;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const nombre = nombreArchivo("xlsx", empresa, periodo, quincena, args.parte);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return nombre;
};
