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
import { PDF_TEMA, RP, pdfCabecera, pdfPie, pdfKpi } from "./reporte-estilo.js";
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
  { k: "asis", t: "NSP / tarde", w: 17, al: "right", v: (l, i, t) => t.dedAsist ? `-${nf(t.dedAsist)}` : "-", color: ROJO },
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
// Estilo único de reportes: título grande, subtítulo gris, encabezados en gris
// pequeño con línea abajo, filas con línea fina, subtotales en gris claro,
// totales en negrita con línea carbón arriba, Helvetica Neue / Menlo y sin
// cuadrícula. Las celdas, fórmulas, columnas y hojas son las mismas de siempre.
const FMT_L = '"L" #,##0.00;[Red]-"L" #,##0.00;"-"';
const ARGB = (h) => "FF" + h.replace("#", "").toUpperCase();
const FUENTE = "Helvetica Neue", MONO = "Menlo";
/** Arma el libro (sin descargar) — reutilizable desde Node para revisarlo. */
export const construirPlanillaExcel = async ({ empresa, periodo, quincena, lines, meta = {}, ExcelJS, parte = "salarios" }) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GeoCore · Grupo Geotecnica"; wb.created = new Date();
  const res = resumenPlanilla(lines);
  const ley = quincena === "2Q";
  const CARB = ARGB(RP.carbon), GR = ARGB(RP.texto2), GR3 = ARGB(RP.texto3), ROJ = ARGB(RP.rojo);
  const fill = (c) => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
  const FONDO_X = ARGB(RP.fondo);
  const hair = { style: "hair", color: { argb: ARGB(RP.lineaFuerte) } };
  const fina = { style: "thin", color: { argb: ARGB(RP.lineaFuerte) } };
  const fuerte = { style: "medium", color: { argb: CARB } };
  const ft = (o = {}) => ({ name: FUENTE, size: 10, color: { argb: CARB }, ...o });
  const fm = (o = {}) => ({ name: MONO, size: 10, color: { argb: CARB }, ...o });
  const pagoTxt = Object.fromEntries(METODOS_PAGO);
  const cabeceraHoja = (hoja, rango, [tit, sub, periodoTxt, estado]) => {
    hoja.mergeCells(`A1:${rango}1`); hoja.getCell("A1").value = tit; hoja.getCell("A1").font = ft({ size: 16, bold: true }); hoja.getRow(1).height = 24;
    hoja.mergeCells(`A2:${rango}2`); hoja.getCell("A2").value = sub; hoja.getCell("A2").font = ft({ size: 11, color: { argb: GR } });
    hoja.mergeCells(`A3:${rango}3`); hoja.getCell("A3").value = periodoTxt; hoja.getCell("A3").font = ft({ size: 11, bold: true });
    hoja.mergeCells(`A4:${rango}4`); hoja.getCell("A4").value = estado; hoja.getCell("A4").font = ft({ size: 9, color: { argb: GR3 } });
  };
  const filaEncabezado = (row, alturas = 28) => {
    row.eachCell(c => {
      c.value = String(c.value ?? "").toUpperCase();
      c.font = ft({ size: 8.5, bold: true, color: { argb: GR3 } });
      c.alignment = { vertical: "bottom", horizontal: "center", wrapText: true };
      c.border = { bottom: fina };
    });
    row.height = alturas;
  };
  const firmas = (hoja, r, salto = 4) => [["Elaborado por", meta.elaboradoPor || ""], ["Revisado por", ""], ["Autorizado por", ""]].forEach(([lab, nom], i) => {
    const c = 2 + i * salto; hoja.getCell(r, c).value = "_______________________________"; hoja.getCell(r, c).font = ft({ color: { argb: GR3 } }); hoja.getCell(r + 1, c).value = lab; hoja.getCell(r + 1, c).font = ft({ size: 9, bold: true }); if (nom) { hoja.getCell(r + 2, c).value = nom; hoja.getCell(r + 2, c).font = ft({ size: 9, color: { argb: GR } }); }
  });

  // ── PLANILLA DE HORAS EXTRAS (archivo propio) ──
  if (parte === "he") {
    const conHe = lines.filter(l => l.he && l.he.monto > 0);
    const wh = wb.addWorksheet("Horas extras", { views: [{ state: "frozen", ySplit: 6, showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    wh.columns = [["N°", 5], ["Colaborador", 34], ["Cargo", 24], ["Hora base", 12], ["4 a 7 pm (×1.25)", 14], ["7 a 10 pm (×1.5)", 14], ["10 pm a 12 (×1.75)", 15], ["Domingo (×2)", 13], ["Total horas", 11], ["Monto a pagar", 15], ["Método de pago", 15]].map(([header, width]) => ({ header, width }));
    wh.spliceRows(1, 1);
    cabeceraHoja(wh, "H", [
      empresa, "Planilla de horas extras",
      `Se pagan con la ${nombreQuincena(periodo, quincena).toLowerCase()}${meta.heDe ? ` · trabajadas en ${nombreQuincena(meta.heDe.periodo, meta.heDe.quincena).toLowerCase()} (${rangoQuincena(meta.heDe.periodo, meta.heDe.quincena)})` : ""}`,
      `${meta.estado === "publicada" ? "Publicada" : "Borrador"} · generada el ${fechaLarga()}${meta.generadaPor ? ` por ${meta.generadaPor}` : ""}`,
    ]);
    wh.getRow(6).values = wh.columns.map(c => c.header);
    filaEncabezado(wh.getRow(6));
    let hr = 7; const h0 = hr;
    conHe.forEach((l, i) => {
      const b = l.he.bandas || {};
      const row = wh.getRow(hr);
      row.values = [i + 1, l.name, l.pos || "", l.he.horaBase, b.b1?.hrs || 0, b.b2?.hrs || 0, b.b3?.hrs || 0, b.dom?.hrs || 0, l.he.hrs, l.he.monto, pagoTxt[l.metodoPago] || "Transferencia"];
      row.font = ft(); row.getCell(2).font = ft({ bold: true }); row.getCell(1).font = ft({ color: { argb: GR3 } }); row.getCell(3).font = ft({ color: { argb: GR } });
      [4, 10].forEach(c => { row.getCell(c).numFmt = FMT_L; row.getCell(c).font = fm(); }); [5, 6, 7, 8, 9].forEach(c => { row.getCell(c).numFmt = "0.0;;\"-\""; row.getCell(c).font = fm(); });
      row.getCell(10).font = fm({ bold: true });
      row.eachCell({ includeEmpty: true }, c => { c.border = { bottom: hair }; });
      hr++;
    });
    const ht = wh.getRow(hr); ht.values = ["", "TOTAL A PAGAR"];
    [5, 6, 7, 8, 9, 10].forEach(c => { const col = wh.getColumn(c).letter; ht.getCell(c).value = { formula: `SUM(${col}${h0}:${col}${Math.max(h0, hr - 1)})` }; ht.getCell(c).numFmt = c === 10 ? FMT_L : "0.0;;\"-\""; });
    ht.eachCell({ includeEmpty: true }, (c, n) => { c.font = n >= 4 ? fm({ bold: true, size: 10.5 }) : ft({ bold: true, size: 10.5 }); c.border = { top: fuerte }; }); ht.height = 22;
    hr += 3;
    METODOS_PAGO.filter(([k]) => res.hePorMetodo[k]?.n).forEach(([k, lab]) => { const row = wh.getRow(hr); row.getCell(2).value = `${lab} (${res.hePorMetodo[k].n})`; row.getCell(3).value = res.hePorMetodo[k].monto; row.getCell(3).numFmt = FMT_L; row.getCell(2).font = ft(); row.getCell(3).font = fm(); hr++; });
    firmas(wh, hr + 3, 3);
    return wb;
  }

  const ws = wb.addWorksheet("Planilla", { views: [{ state: "frozen", ySplit: 7, showGridLines: false }], pageSetup: { orientation: "landscape", paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const cols = [
    ["N°", 5], ["Colaborador", 34], ["Cargo", 26], ["Tipo", 12], ["Proyecto", 22], ["Días", 7], ["NSP", 6],
    ["Salario mensual", 15], ["Salario diario", 13], ["Ordinario", 14], ["Bonificación", 13], ["Feriados / domingos", 15], ["Otros ingresos", 14], ["Total ingresos", 14],
    ["NSP (L)", 11], ["Llegadas tarde (L)", 12], ["ISR", 12], ["IHSS", 11], ["RAP", 11], ["Cooperativa", 12], ["Otras deducciones", 14], ["Total deducciones", 15], ["Neto a pagar", 16], ["Método de pago", 14], ["Notas", 48],
  ];
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  ws.spliceRows(1, 1); // sin la fila de header automática: la armamos a mano en la fila 6
  cabeceraHoja(ws, "J", [
    empresa, "Planilla de sueldos y salarios",
    `${nombreQuincena(periodo, quincena)} · ${rangoQuincena(periodo, quincena)}`,
    `${meta.estado === "publicada" ? "Publicada" : "Borrador"} · generada el ${fechaLarga()}${meta.generadaPor ? ` por ${meta.generadaPor}` : ""} · las horas extras van en su propia planilla`,
  ]);
  ws.getRow(6).values = cols.map(c => c[0]);
  filaEncabezado(ws.getRow(6), 30);
  const MONEY = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const NUMS = [6, 7];
  const tipoTxt = { permanent: "Permanente", temporary: "Temporal", honorarios: "Honorarios" };
  let r = 7;
  const subtotRows = [];
  GRUPOS_CT.forEach(([ct, label]) => {
    const rows = lines.filter(l => l.ct === ct);
    if (!rows.length) return;
    ws.mergeCells(r, 1, r, cols.length);
    const sc = ws.getCell(r, 1); sc.value = `${label}  ·  ${rows.length} ${rows.length === 1 ? "persona" : "personas"}`; sc.font = ft({ size: 11.5, bold: true }); ws.getRow(r).height = 24; sc.alignment = { vertical: "bottom" }; sc.border = { bottom: fina };
    r++;
    const r0 = r;
    rows.forEach((l, i) => {
      const t = totalesLinea(l);
      const nota = [notaAutomatica(l), l.nota].filter(Boolean).join(" · ");
      const row = ws.getRow(r);
      row.values = [i + 1, l.name, l.pos || "", tipoTxt[l.ct] || l.ct, l.proj || "", Number(diasMostrados(l)) || 0, l.diasNSP || 0,
        l.sb, l.sd, t.ordinario, l.bq || 0, (l.bonoFeriado || 0) + (l.bonoDomingo || 0), t.extrasIng, { formula: `J${r}+K${r}+L${r}+M${r}` },
        l.descuentoNSP || 0, l.descuentoHoras || 0, l.isr || 0, l.ihss || 0, l.rap || 0, l.coop || 0, t.extrasDed, { formula: `SUM(O${r}:U${r})` }, { formula: `J${r}+N${r}-V${r}` }, pagoTxt[l.metodoPago] || "Transferencia", nota];
      row.font = ft();
      row.alignment = { vertical: "middle" };
      row.getCell(1).font = ft({ color: { argb: GR3 } });
      row.getCell(2).font = ft({ bold: true });
      [3, 5, 25].forEach(c => { row.getCell(c).font = ft({ color: { argb: GR } }); });
      NUMS.forEach(c => { row.getCell(c).font = fm(); });
      MONEY.forEach(c => { row.getCell(c).numFmt = FMT_L; row.getCell(c).font = fm(); });
      row.getCell(22).font = fm({ color: { argb: ROJ } });
      row.getCell(23).font = fm({ bold: true });
      row.eachCell({ includeEmpty: true }, c => { c.border = { bottom: hair }; });
      r++;
    });
    const st = ws.getRow(r); st.values = ["", "Subtotal", "", "", "", { formula: `SUM(F${r0}:F${r - 1})` }, { formula: `SUM(G${r0}:G${r - 1})` }];
    MONEY.forEach(c => { const col = ws.getColumn(c).letter; st.getCell(c).value = { formula: `SUM(${col}${r0}:${col}${r - 1})` }; st.getCell(c).numFmt = FMT_L; });
    st.eachCell({ includeEmpty: true }, (c, n) => { c.fill = fill(FONDO_X); c.font = n >= 6 && n <= 23 ? fm({ bold: true }) : ft({ bold: true }); });
    st.height = 18;
    subtotRows.push(r);
    r += 2;
  });
  // Total general
  const tg = ws.getRow(r); tg.values = ["", "TOTAL A PAGAR"];
  MONEY.forEach(c => { const col = ws.getColumn(c).letter; tg.getCell(c).value = { formula: subtotRows.map(x => `${col}${x}`).join("+") }; tg.getCell(c).numFmt = FMT_L; });
  tg.eachCell({ includeEmpty: true }, (c, n) => { c.font = n >= 8 && n <= 23 ? fm({ bold: true, size: 10.5 }) : ft({ bold: true, size: 10.5 }); c.border = { top: fuerte }; });
  tg.height = 22;
  r += 3;
  // Cierre: salarios / HE / total y por método
  const cierre = [["Total a pagar", res.neto], [], ...METODOS_PAGO.filter(([k]) => res.porMetodo[k]?.n).map(([k, lab]) => [`${lab} (${res.porMetodo[k].n})`, res.porMetodo[k].neto])];
  cierre.forEach(([a, b]) => { if (a) { const row = ws.getRow(r); row.getCell(2).value = a; row.getCell(3).value = b; row.getCell(3).numFmt = FMT_L; row.getCell(2).font = ft({ bold: a === "Total a pagar" }); row.getCell(3).font = fm({ bold: true }); if (a === "Total a pagar") { row.getCell(2).border = { top: fuerte }; row.getCell(3).border = { top: fuerte }; } } r++; });
  firmas(ws, r + 2);
  if (!ley) [17, 18, 19].forEach(c => { ws.getColumn(c).hidden = true; });

  // Hoja resumen por proyecto
  const wr = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  wr.columns = [["Concepto", 36], ["Personas", 10], ["Monto", 16]].map(([header, width]) => ({ header, width }));
  wr.spliceRows(1, 1);
  wr.getCell("A1").value = `${empresa} · ${nombreQuincena(periodo, quincena)}`; wr.getCell("A1").font = ft({ size: 14, bold: true }); wr.getRow(1).height = 22;
  let rr2 = 3;
  const seccion = (tit, filas) => {
    [1, 2, 3].forEach(c => { wr.getCell(rr2, c).border = { bottom: fina }; });
    wr.getCell(rr2, 1).value = tit.toUpperCase(); wr.getCell(rr2, 1).font = ft({ size: 8.5, bold: true, color: { argb: GR3 } }); rr2++;
    filas.forEach(([a, n, m]) => { wr.getCell(rr2, 1).value = a; wr.getCell(rr2, 2).value = n; wr.getCell(rr2, 3).value = m; wr.getCell(rr2, 3).numFmt = FMT_L; wr.getCell(rr2, 1).font = ft(); wr.getCell(rr2, 2).font = fm(); wr.getCell(rr2, 3).font = fm(); [1, 2, 3].forEach(c => { wr.getCell(rr2, c).border = { bottom: hair }; }); rr2++; });
    rr2++;
  };
  seccion("Por tipo de contrato", GRUPOS_CT.filter(([k]) => res.porGrupo[k]?.n).map(([k, lab]) => [lab, res.porGrupo[k].n, res.porGrupo[k].neto]));
  seccion("Por método de pago", METODOS_PAGO.filter(([k]) => res.porMetodo[k]?.n).map(([k, lab]) => [lab, res.porMetodo[k].n, res.porMetodo[k].neto]));
  seccion("Por proyecto (neto repartido por días trabajados)", Object.entries(res.porProyecto).sort((a, b) => b[1] - a[1]).map(([p, m]) => [p, "", m]));
  seccion("Total", [["Total salarios", res.personas, res.neto]]);

  return wb;
};

export const exportarPlanillaExcel = async (args) => {
  const mod = await safeDynamicImport(() => import("exceljs/dist/exceljs.min.js"), "excel");
  const ExcelJS = mod.default || mod;
  const wb = await construirPlanillaExcel({ ...args, ExcelJS });
  const { empresa, periodo, quincena } = args;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const nombre = nombreArchivo("xlsx", empresa, periodo, quincena, args.parte);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return nombre;
};
