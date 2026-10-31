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
import { totalesLinea, resumenPlanilla, nombreQuincena, rangoQuincena, etiquetaCorta, mesLargo, GRUPOS_CT, METODOS_PAGO, notaAutomatica, diasMostrados, gruposPlanilla } from "./planilla-calc.js";

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
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-"); return m ? `${d} ${MES3[Number(m) - 1]} ${y}` : String(iso || ""); };
const slug = (s) => latin1(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "");
const nombreArchivo = (ext, empresa, periodo, quincena, parte = "salarios") => `${parte === "he" ? "Planilla_Horas_Extras" : "Planilla"}_${slug(empresa)}_${quincena}_${periodo}.${ext}`;

// Columnas de la tabla principal. `ley` agrega ISR/IHSS/RAP (solo en la 2Q).
const columnas = (ley) => [
  { k: "n", t: "N°", w: 7, al: "center", v: (l, i) => String(i + 1) },
  { k: "nombre", t: "Colaborador", w: 56, al: "left" },
  { k: "dias", t: "Días", w: 12, al: "center", v: (l) => diasMostrados(l) },
  { k: "sb", t: "Sal. mensual", w: 20, al: "right", v: (l) => L(l.sb) },
  { k: "ord", sec: "ing", t: "Ordinario", w: 20, al: "right", v: (l, i, t) => L(t.ordinario) },
  { k: "bq", sec: "ing", t: "Bonif.", w: 17, al: "right", v: (l) => L(l.bq) },
  { k: "fd", sec: "ing", t: "Fer. / Dom.", w: 17, al: "right", v: (l) => L((l.bonoFeriado || 0) + (l.bonoDomingo || 0)) },
  { k: "oi", sec: "ing", t: "Otros ing.", w: 17, al: "right", v: (l, i, t) => L(t.extrasIng) },
  { k: "asis", sec: "ded", t: "Asistencia", w: 17, al: "right", v: (l, i, t) => t.dedAsist ? `-${nf(t.dedAsist)}` : "-", color: ROJO },
  ...(ley ? [
    { k: "isr", sec: "ded", t: "ISR", w: 17, al: "right", v: (l) => L(l.isr) },
    { k: "ihss", sec: "ded", t: "IHSS", w: 16, al: "right", v: (l) => L(l.ihss) },
    { k: "rap", sec: "ded", t: "RAP", w: 16, al: "right", v: (l) => L(l.rap) },
  ] : []),
  { k: "coop", sec: "ded", t: "Coop.", w: 16, al: "right", v: (l) => L(l.coop) },
  { k: "od", sec: "ded", t: "Otras ded.", w: 17, al: "right", v: (l, i, t) => L(t.extrasDed) },
  { k: "td", sec: "ded", t: "Total ded.", w: 19, al: "right", v: (l, i, t) => L(t.deducciones), color: ROJO },
  { k: "neto", sec: "neto", t: "Neto", w: 23, al: "right", v: (l, i, t) => Lsiempre(t.neto), bold: true },
  { k: "pago", t: "Pago", w: 15, al: "center", v: (l) => ({ transferencia: "Transf.", cheque: "Cheque", ach: "ACH" }[l.metodoPago || "transferencia"]) },
];

// Pastel por sección (30-oct-2026, Gerson: "colorcitos pasteles en ingresos y
// deducciones, el neto en otro color, que no sea tan blanco"): los mismos tonos
// del Excel — ingresos verde menta, deducciones rosa, neto naranja.
const SEC_PDF = {
  ing: { t: "Ingresos", head: [213, 239, 221], cell: [243, 250, 245], tinta: [31, 107, 60] },
  ded: { t: "Deducciones", head: [249, 222, 219], cell: [253, 245, 244], tinta: [154, 42, 30] },
  neto: { t: "A pagar", head: [251, 217, 191], cell: [253, 238, 225], tinta: [169, 78, 22] },
};

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
  // Pinta el fondo de cada columna con sección (encabezado, fila o totales).
  const pintarSecciones = (y, h, tono) => cols.forEach((c, ci) => {
    const sc = SEC_PDF[c.sec]; if (!sc) return;
    P.fc(sc[tono]); doc.rect(xs[ci].x, y, xs[ci].w, h, "F");
  });
  const filaEncabezado = () => {
    // Banda con el nombre de cada sección arriba de los encabezados.
    Object.entries(SEC_PDF).forEach(([k, sc]) => {
      const ids = cols.map((c, ci) => c.sec === k ? ci : -1).filter(i => i >= 0);
      if (!ids.length) return;
      const x0 = xs[ids[0]].x, x1 = xs[ids[ids.length - 1]].x + xs[ids[ids.length - 1]].w;
      P.fc(sc.head); doc.rect(x0, ctx.y, x1 - x0, 4.2, "F");
      P.f(5.6, "bold"); P.tc(sc.tinta); P.t(sc.t.toUpperCase(), (x0 + x1) / 2, ctx.y + 3, { align: "center" });
    });
    ctx.y += 4.6;
    pintarSecciones(ctx.y, 6.5, "head");
    cols.forEach((c, ci) => celda(ci, c.t.toUpperCase(), ctx.y + 4.4, { al: c.al, bold: true, color: SEC_PDF[c.sec]?.tinta || GRIS_FAINT, fs: 5.8 }));
    P.dc(LINEA_FUERTE); doc.setLineWidth(0.25); doc.line(M, ctx.y + 6.5, PW - M, ctx.y + 6.5);
    ctx.y += 6.5;
  };
  gruposPlanilla(lines).forEach(({ label, rows }) => {
    const g = { neto: Math.round(rows.reduce((a, l) => a + totalesLinea(l).neto, 0) * 100) / 100 };
    // Un grupo que cabe entero en una hoja no se parte (29-oct-2026, Gerson:
    // "que no se corte a la mitad"): si no cabe en lo que queda, arranca en la
    // siguiente. Uno más largo que una hoja sí se parte, repitiendo encabezados.
    const altoGrupo = 7 + 4.6 + 6.5 + 8 + rows.reduce((s, l) => s + 7 + ((l.nota || (l.extras || []).length) ? 3.3 : 0), 0);
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
      pintarSecciones(ctx.y, h, "cell");
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
    pintarSecciones(ctx.y + 0.4, 7, "head");
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
    // Separada por tipo de contrato, cada grupo con su pastel (30-oct-2026,
    // Gerson: "debe venir separado permanente y temporal, con un colorcito").
    const TONO_HE = {
      permanent: { head: [212, 230, 255], cell: [241, 247, 255], tinta: [31, 79, 140] },
      temporary: { head: [228, 216, 255], cell: [247, 243, 255], tinta: [79, 53, 146] },
      hon: { head: [253, 224, 200], cell: [254, 245, 237], tinta: [169, 78, 22] },
    };
    const fondoFila = (y, h, color) => { P.fc(color); doc.rect(M, y, CW, h, "F"); };
    const hsum = { b1: 0, b2: 0, b3: 0, dom: 0, hrs: 0, monto: 0 };
    gruposPlanilla(conHe).forEach(({ k, label, rows }) => {
      const tono = TONO_HE[k] || TONO_HE.hon;
      const gs = { b1: 0, b2: 0, b3: 0, dom: 0, hrs: 0, monto: 0 };
      const alto = 8 + 6.5 + rows.length * 7 + 8;
      asegurar(alto <= Y_MAX - 40 ? alto : 24);
      fondoFila(ctx.y, 7, tono.head);
      P.f(8.5, "bold"); P.tc(tono.tinta); P.t(`${label}  ·  ${rows.length} ${rows.length === 1 ? "persona" : "personas"}`, M + 3, ctx.y + 4.8);
      const subt = rows.reduce((a, l) => a + l.he.monto, 0);
      P.t(`Subtotal ${Lsiempre(subt)}`, PW - M - 3, ctx.y + 4.8, { align: "right" });
      ctx.y += 8;
      hcab();
      rows.forEach((l, i) => {
        if (asegurar(7)) hcab();
        fondoFila(ctx.y, 7, i % 2 ? tono.cell : [255, 255, 255]);
        const b = l.he.bandas || {};
        const y = ctx.y + 4.7;
        hcel(0, String(i + 1), y); hcel(1, l.name, y, { bold: true }); hcel(2, Lsiempre(l.he.horaBase), y);
        ["b1", "b2", "b3", "dom"].forEach((kk, j) => { const h = b[kk]?.hrs || 0; hcel(3 + j, h ? nf(h, 1) : "-", y); gs[kk] += h; });
        hcel(7, nf(l.he.hrs, 1), y, { bold: true }); hcel(8, Lsiempre(l.he.monto), y, { bold: true }); hcel(9, { transferencia: "Transf.", cheque: "Cheque", ach: "ACH" }[l.metodoPago || "transferencia"], y);
        gs.hrs += l.he.hrs; gs.monto += l.he.monto;
        P.dc(LINEA); doc.setLineWidth(0.15); doc.line(M, ctx.y + 7, PW - M, ctx.y + 7);
        ctx.y += 7;
      });
      fondoFila(ctx.y, 7, tono.head);
      const yt = ctx.y + 4.7;
      hcel(1, `Total ${label.toLowerCase()}`, yt, { bold: true, color: tono.tinta });
      ["b1", "b2", "b3", "dom"].forEach((kk, j) => hcel(3 + j, gs[kk] ? nf(gs[kk], 1) : "-", yt, { bold: true, color: tono.tinta }));
      hcel(7, nf(gs.hrs, 1), yt, { bold: true, color: tono.tinta }); hcel(8, Lsiempre(gs.monto), yt, { bold: true, color: tono.tinta });
      Object.keys(hsum).forEach(kk => { hsum[kk] += gs[kk]; });
      ctx.y += 7 + 6;
    });
    if (conHe.length) {
      asegurar(9);
      fondoFila(ctx.y, 8, [251, 217, 191]);
      const yt = ctx.y + 5.3;
      hcel(1, "TOTAL HORAS EXTRAS", yt, { bold: true, color: NARANJA_TEXTO, fs: 7.6 });
      ["b1", "b2", "b3", "dom"].forEach((kk, j) => hcel(3 + j, hsum[kk] ? nf(hsum[kk], 1) : "-", yt, { bold: true, color: NARANJA_TEXTO }));
      hcel(7, nf(hsum.hrs, 1), yt, { bold: true, color: NARANJA_TEXTO }); hcel(8, Lsiempre(hsum.monto), yt, { bold: true, color: NARANJA_TEXTO, fs: 7.6 });
      ctx.y += 8 + 10;
    }
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
      c.font = ft({ size: 8.5, bold: true, color: { argb: NAR_T } });
      c.fill = fill("FFFBD9BF");
      c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      c.border = { right: { style: "thin", color: { argb: BLANCO } } };
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
      cell.fill = fill(c === colNeto ? NAR : "FFFBD9BF");
      cell.font = ft({ bold: true, size: 11, color: { argb: c === colNeto ? BLANCO : NAR_T } });
      cell.border = { top: { style: "medium", color: { argb: NAR } } };
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

  // ── Hoja Planilla: columnas por SECCIÓN, cada una con su pastel (30-oct-2026,
  // Gerson: "ingresos de un color, deducciones de otro, pastel bonitas; que
  // salga cuántos días no se presentó, cuántas horas tarde… a detalle; y no
  // uses negro"). Las fórmulas se arman con las letras de esta lista, así
  // agregar o mover una columna no rompe ninguna suma.
  const SEC = {
    col: { t: "Colaborador", head: "FFEEECE8", cell: null, alt: CEBRA, tinta: "FF5B5650" },
    asis: { t: "Asistencia de la quincena", head: "FFDCE8F8", cell: "FFF5F8FD", alt: "FFEBF1FA", tinta: "FF1F4F8C" },
    ing: { t: "Ingresos", head: "FFD5EFDD", cell: "FFF3FAF5", alt: "FFE7F4EB", tinta: "FF1F6B3C" },
    ded: { t: "Deducciones", head: "FFF9DEDB", cell: "FFFDF5F4", alt: "FFFAEAE8", tinta: "FF9A2A1E" },
    pagar: { t: "A pagar", head: "FFFBD9BF", cell: "FFFDF2E9", alt: "FFFBE8D9", tinta: NAR_T },
  };
  const tipoTxt = { permanent: "Permanente", temporary: "Temporal", honorarios: "Honorarios" };
  const n0 = (x) => Number(x) || 0;
  // fmt: L = lempiras · d = días/veces · h = horas · t = texto
  const COLS = [
    { k: "n", h: "N°", w: 5, sec: "col", v: (l, t, i) => i + 1 },
    { k: "nombre", h: "Colaborador", w: 34, sec: "col", v: (l) => l.name },
    { k: "cargo", h: "Cargo", w: 26, sec: "col", v: (l) => l.pos || "" },
    { k: "tipo", h: "Tipo", w: 12, sec: "col", v: (l) => tipoTxt[l.ct] || l.ct },
    { k: "proy", h: "Proyecto", w: 22, sec: "col", v: (l) => l.proj || "" },
    { k: "sb", h: "Salario mensual", w: 14, sec: "col", fmt: "L", v: (l) => n0(l.sb) },
    { k: "sd", h: "Salario diario", w: 12, sec: "col", fmt: "L", v: (l) => n0(l.sd) },
    { k: "dias", h: "Días pagados", w: 9, sec: "asis", fmt: "d2", v: (l) => Number(diasMostrados(l)) || 0 },
    { k: "nsp", h: "No se presentó (días)", w: 11, sec: "asis", fmt: "d", rojo: true, v: (l) => n0(l.diasNSP) },
    { k: "tardes", h: "Llegadas tarde (veces)", w: 11, sec: "asis", fmt: "d", v: (l) => n0(l.tardes) },
    { k: "htarde", h: "Horas tarde", w: 9, sec: "asis", fmt: "h", v: (l) => n0(l.horasTarde) },
    { k: "inc", h: "Incapacidad (días)", w: 11, sec: "asis", fmt: "d", v: (l) => n0(l.diasIncap) },
    { k: "inc34", h: "Incap. al 34 % (días)", w: 11, sec: "asis", fmt: "d", v: (l) => n0(l.diasIncapIhss) },
    { k: "vac", h: "Vacaciones (días)", w: 10, sec: "asis", fmt: "d", v: (l) => n0(l.diasVac) },
    { k: "fer", h: "Feriados trabajados", w: 10, sec: "asis", fmt: "d", v: (l) => n0(l.ferTrab) },
    { k: "dom", h: "Domingos trabajados", w: 10, sec: "asis", fmt: "d", v: (l) => n0(l.domTrab) + n0(l.domTrabTriple) },
    { k: "ord", h: "Ordinario", w: 14, sec: "ing", fmt: "L", ingreso: true, v: (l, t) => t.ordinario },
    { k: "bq", h: "Bonificación", w: 13, sec: "ing", fmt: "L", ingreso: true, v: (l) => n0(l.bq) },
    { k: "ferL", h: "Feriados / domingos", w: 13, sec: "ing", fmt: "L", ingreso: true, v: (l) => n0(l.bonoFeriado) + n0(l.bonoDomingo) },
    { k: "oi", h: "Otros ingresos", w: 13, sec: "ing", fmt: "L", ingreso: true, v: (l, t) => t.extrasIng },
    { k: "ting", h: "Total ingresos", w: 15, sec: "ing", fmt: "L", total: "ingreso", negrita: true },
    { k: "nspL", h: "No se presentó (L)", w: 12, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.descuentoNSP) },
    { k: "tardeL", h: "Llegadas tarde (L)", w: 12, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.descuentoHoras) },
    { k: "incL", h: "Incapacidad (L)", w: 12, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.descuentoIncap) },
    { k: "isr", h: "ISR", w: 11, sec: "ded", fmt: "L", deduccion: true, ley: true, v: (l) => n0(l.isr) },
    { k: "ihss", h: "IHSS", w: 11, sec: "ded", fmt: "L", deduccion: true, ley: true, v: (l) => n0(l.ihss) },
    { k: "rap", h: "RAP", w: 11, sec: "ded", fmt: "L", deduccion: true, ley: true, v: (l) => n0(l.rap) },
    { k: "coop", h: "Cooperativa", w: 12, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.coop) },
    { k: "od", h: "Otras deducciones", w: 13, sec: "ded", fmt: "L", deduccion: true, v: (l, t) => t.extrasDed },
    { k: "tded", h: "Total deducciones", w: 15, sec: "ded", fmt: "L", total: "deduccion", negrita: true },
    { k: "neto", h: "Neto a pagar", w: 17, sec: "pagar", fmt: "L", total: "neto", negrita: true },
    { k: "metodo", h: "Método de pago", w: 15, sec: "pagar", v: (l) => pagoTxt[l.metodoPago] || "Transferencia" },
    { k: "nota", h: "Notas", w: 48, sec: "pagar", v: (l) => [notaAutomatica(l), l.nota].filter(Boolean).join(" · ") },
  ];
  // Una hoja = columnas + grupos. "Planilla" lleva permanentes y temporales;
  // "Honorarios" va en su PROPIA hoja (así la arma la Lic. Carolina), con los
  // de pago quincenal y los de pago mensual por separado.
  const grupos = gruposPlanilla(lines);
  const linesSal = lines.filter(l => l.ct !== "honorarios"), linesHon = lines.filter(l => l.ct === "honorarios");
  const netoDe = (ls) => Math.round(ls.reduce((a, l) => a + totalesLinea(l).neto, 0) * 100) / 100;
  const armarHoja = (nombreHoja, subtitulo, colsBase, gruposHoja, { cierre = false, ocultarLey = false } = {}) => {
  const COLS = colsBase.map(c => ({ ...c }));
  const linesHoja = gruposHoja.flatMap(g => g.rows);
    COLS.forEach((c, i) => { c.i = i + 1; c.L = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; c.L = String.fromCharCode(65 + m) + c.L; n = Math.floor((n - 1) / 26); } });
  const C = Object.fromEntries(COLS.map(c => [c.k, c]));
  const ULT = COLS.length;
  const FMT = { L: FMT_L, d: '0;-0;"-"', d2: 'General;-General;"-"', h: '0.0;-0.0;"-"' };
  const ws = wb.addWorksheet(nombreHoja, { views: [{ state: "frozen", ySplit: 6, xSplit: 2, showGridLines: false }], pageSetup: { orientation: "landscape", paperSize: 5, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = COLS.map(c => ({ width: c.w }));
  cabeceraHoja(ws, { desde: "C", hasta: C.dias.L, ultima: ULT }, [
    empresa, subtitulo,
    `${nombreQuincena(periodo, quincena)} · ${rangoQuincena(periodo, quincena)}`,
    estadoTxt(cierre ? " · las horas extras van en su propia planilla" : ""),
  ]);
  tile(ws, C.coop.L, C.od.L, "Colaboradores", linesHoja.length);
  tile(ws, C.tded.L, C.neto.L, cierre ? "Total a pagar" : "Total honorarios", netoDe(linesHoja), { naranja: true, fmt: FMT_L });
  // Fila 5: bandas por sección · fila 6: encabezados en el pastel de su sección.
  const blancoFino = { style: "thin", color: { argb: BLANCO } };
  Object.entries(SEC).forEach(([k, s]) => {
    const cs = COLS.filter(c => c.sec === k);
    ws.mergeCells(5, cs[0].i, 5, cs[cs.length - 1].i);
    const c = ws.getCell(5, cs[0].i); c.value = s.t.toUpperCase();
    c.font = ft({ size: 9.5, bold: true, color: { argb: s.tinta } }); c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = fill(k === "pagar" ? NAR : s.head); if (k === "pagar") c.font = ft({ size: 9.5, bold: true, color: { argb: BLANCO } });
    c.border = { left: blancoFino, right: blancoFino };
  });
  ws.getRow(5).height = 21;
  COLS.forEach(c => {
    const s = SEC[c.sec], cell = ws.getCell(6, c.i);
    cell.value = c.h.toUpperCase();
    cell.font = ft({ size: 8.5, bold: true, color: { argb: c.k === "neto" ? BLANCO : s.tinta } });
    cell.fill = fill(c.k === "neto" ? NAR : s.head);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { right: blancoFino, left: blancoFino, bottom: { style: "thin", color: { argb: c.k === "neto" ? NAR : "FFFFFFFF" } } };
  });
  ws.getRow(6).height = 36;
  const valorDe = (cell) => { const v = cell.value; return typeof v === "number" ? v : Number(v?.result) || 0; };
  const sumaCol = (c, a, b) => { let t = 0; for (let i = a; i <= b; i++) t += valorDe(ws.getCell(i, c)); return Math.round(t * 100) / 100; };
  const r2x = (n) => Math.round(n * 100) / 100;
  const ING = COLS.filter(c => c.ingreso), DED = COLS.filter(c => c.deduccion);
  const SUMABLES = COLS.filter(c => c.fmt && c.k !== "sd");
  let r = 7;
  const subtotRows = [];
  gruposHoja.forEach(({ label, rows }) => {
    tituloGrupo(ws, r, `${label}  ·  ${rows.length} ${rows.length === 1 ? "persona" : "personas"}`, ULT);
    r++;
    const r0 = r;
    rows.forEach((l, i) => {
      const t = totalesLinea(l);
      const row = ws.getRow(r);
      COLS.forEach(c => {
        const cell = row.getCell(c.i);
        if (c.total === "ingreso") cell.value = { formula: ING.map(x => `${x.L}${r}`).join("+"), result: r2x(ING.reduce((a, x) => a + x.v(l, t, i), 0)) };
        else if (c.total === "deduccion") cell.value = { formula: `SUM(${DED[0].L}${r}:${DED[DED.length - 1].L}${r})`, result: r2x(DED.reduce((a, x) => a + x.v(l, t, i), 0)) };
        else if (c.total === "neto") cell.value = { formula: `${C.ting.L}${r}-${C.tded.L}${r}`, result: t.neto };
        else cell.value = c.v(l, t, i);
        const s = SEC[c.sec];
        const bg = c.k === "neto" ? (i % 2 ? "FFFBE3CF" : TINTE_X) : (i % 2 ? s.alt : s.cell);
        if (bg) cell.fill = fill(bg);
        if (c.fmt) { cell.numFmt = FMT[c.fmt]; cell.alignment = { vertical: "middle", horizontal: c.fmt === "L" ? "right" : "center" }; }
        else cell.alignment = { vertical: "middle" };
        const v = valorDe(cell);
        cell.font = ft({
          bold: !!c.negrita || c.k === "nombre" || (c.rojo && v > 0),
          size: c.k === "neto" ? 11 : 10.5,
          color: { argb: c.k === "n" ? GR3 : (c.rojo && v > 0) ? ROJ : c.total === "deduccion" ? SEC.ded.tinta : ["cargo", "proy", "nota"].includes(c.k) ? GR : CARB },
        });
        cell.border = { bottom: hair };
      });
      row.height = 19;
      r++;
    });
    const st = ws.getRow(r);
    COLS.forEach(c => {
      const cell = st.getCell(c.i), s = SEC[c.sec];
      if (c.k === "nombre") cell.value = "Subtotal";
      else if (SUMABLES.includes(c)) { cell.value = { formula: `SUM(${c.L}${r0}:${c.L}${r - 1})`, result: sumaCol(c.i, r0, r - 1) }; cell.numFmt = FMT[c.fmt]; cell.alignment = { horizontal: c.fmt === "L" ? "right" : "center" }; }
      cell.fill = fill(c.k === "neto" ? "FFFBD9BF" : (s.head));
      cell.font = ft({ bold: true, color: { argb: c.k === "neto" ? NAR_T : s.tinta } });
      cell.border = { top: { style: "thin", color: { argb: BLANCO } }, bottom: { style: "thin", color: { argb: BLANCO } } };
    });
    st.height = 21;
    subtotRows.push(r);
    r += 2;
  });
  // Total general: pastel naranja de punta a punta y el neto en naranja (sin negro).
  const tg = ws.getRow(r);
  COLS.forEach(c => {
    const cell = tg.getCell(c.i);
    if (c.k === "nombre") cell.value = cierre ? "TOTAL PLANILLA" : "TOTAL HONORARIOS";
    else if (SUMABLES.includes(c)) { cell.value = { formula: subtotRows.map(x => `${c.L}${x}`).join("+") || "0", result: r2x(subtotRows.reduce((a, x) => a + valorDe(ws.getCell(x, c.i)), 0)) }; cell.numFmt = FMT[c.fmt]; cell.alignment = { horizontal: c.fmt === "L" ? "right" : "center", vertical: "middle" }; }
    cell.fill = fill(c.k === "neto" ? NAR : "FFFBD9BF");
    cell.font = ft({ bold: true, size: 11, color: { argb: c.k === "neto" ? BLANCO : NAR_T } });
    cell.border = { top: { style: "medium", color: { argb: NAR } } };
    if (!cell.alignment) cell.alignment = { vertical: "middle" };
  });
  tg.height = 26;
  r += 3;
  // Cierre: salarios + honorarios (hoja aparte) = total a pagar, y por método.
  if (cierre) {
    const ct0 = ws.getCell(r, 2); ct0.value = "CIERRE DE LA QUINCENA"; ct0.font = ft({ size: 8.5, bold: true, color: { argb: GR3 } }); [2, 3].forEach(c => { ws.getCell(r, c).border = { bottom: fina }; }); r++;
    const filaC = (a, b, neg = false) => { const row = ws.getRow(r); row.getCell(2).value = a; row.getCell(3).value = b; row.getCell(3).numFmt = FMT_L; row.getCell(2).font = ft(); row.getCell(3).font = ft({ bold: true }); [2, 3].forEach(c => { row.getCell(c).border = { bottom: hair }; }); r++; };
    filaC(`Planilla de salarios (${linesSal.length})`, netoDe(linesSal));
    if (linesHon.length) filaC(`Honorarios (${linesHon.length}) · ver hoja Honorarios`, netoDe(linesHon));
    r++;
    METODOS_PAGO.filter(([k]) => res.porMetodo[k]?.n).forEach(([k, lab]) => filaC(`${lab} (${res.porMetodo[k].n})`, res.porMetodo[k].neto));
    const tp = ws.getRow(r); tp.getCell(2).value = "Total a pagar"; tp.getCell(3).value = res.neto; tp.getCell(3).numFmt = FMT_L;
    [2, 3].forEach(c => { tp.getCell(c).fill = fill(NAR); tp.getCell(c).font = ft({ bold: true, size: 11.5, color: { argb: BLANCO } }); }); tp.height = 22;
  }
  firmas(ws, r + 5);
  if (ocultarLey) COLS.filter(c => c.ley).forEach(c => { ws.getColumn(c.i).hidden = true; });
  return ws;
  };
  const porK = Object.fromEntries(COLS.map(c => [c.k, c]));
  const colsSal = COLS;
  const colsHon = [
    "n", "nombre",
    { k: "dni", h: "DNI", w: 17, sec: "col", v: (l) => l.dni || "" },
    { k: "fc", h: "Fecha de contratación", w: 13, sec: "col", v: (l) => l.fc ? fechaCorta(l.fc) : "" },
    "cargo", "proy",
    { ...porK.sb, h: "Honorarios mensuales" },
    "dias", "nsp", "tardes", "htarde", "vac", "fer", "dom",
    { ...porK.ord, h: "Honorarios del período" },
    "bq", "ferL", "oi", "ting", "nspL", "tardeL",
    { ...porK.isr, ley: false },
    "coop", "od", "tded", "neto", "metodo", "nota",
  ].map(x => typeof x === "string" ? porK[x] : x);
  armarHoja("Planilla", "Planilla de sueldos y salarios", colsSal, grupos.filter(g => !g.hon), { cierre: true, ocultarLey: !ley });
  if (linesHon.length) armarHoja("Honorarios", "Planilla de honorarios profesionales", colsHon, grupos.filter(g => g.hon));

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
