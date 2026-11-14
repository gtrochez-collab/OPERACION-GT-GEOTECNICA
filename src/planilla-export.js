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
import { MONEDA, DOC_ID } from "./operacion.js";
import { eventualSV } from "./planilla-sv.js";
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA, RP, pdfPie, pdfKpi, cargarImagen, LOGO_EMPRESA } from "./reporte-estilo.js";
import { totalesLinea, resumenPlanilla, nombreQuincena, rangoQuincena, etiquetaCorta, mesLargo, GRUPOS_CT, METODOS_PAGO, notaAutomatica, diasMostrados, gruposPlanilla } from "./planilla-calc.js";

const CARBON = PDF_TEMA.carbon, GRIS = PDF_TEMA.texto2, GRIS_FAINT = PDF_TEMA.texto3, FONDO = PDF_TEMA.fondo;
const TINTE = PDF_TEMA.tinte, NARANJA_TEXTO = PDF_TEMA.naranjaTexto, LINEA = PDF_TEMA.linea, LINEA_FUERTE = PDF_TEMA.lineaFuerte, ROJO = PDF_TEMA.rojo;
// La empresa llega como nombre ("Subterra Honduras"…): el logo de la cabecera sale de ahí.
const empresaKey = (empresa) => /subterra/i.test(String(empresa || "")) ? "subterra" : "geotecnica";

const MAPA_L1 = { "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", "·": "·", "×": "x", "→": "->", "✓": "si", "€": "EUR" };
export const latin1 = (s) => String(s ?? "").replace(/[–—‘’“”…×→✓€]/g, c => MAPA_L1[c] ?? "").replace(/[^\u0000-ÿ]/g, "");
const nf = (n, d = 2) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const L = (n) => (Number(n) || 0) === 0 ? "-" : `${n < 0 ? "-" : ""}${nf(Math.abs(n))}`;
const Lsiempre = (n) => `${MONEDA} ${nf(n)}`;
const fechaLarga = (d = new Date()) => `${d.getDate()} de ${mesLargo(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`).split(" ")[0]} de ${d.getFullYear()}`;
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split("-"); return m ? `${d} ${MES3[Number(m) - 1]} ${y}` : String(iso || ""); };
const slug = (s) => latin1(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "");
const nombreArchivo = (ext, empresa, periodo, quincena, parte = "salarios") => `${parte === "he" ? "Planilla_Horas_Extras" : parte === "eventual" ? "Planilla_Servicios_Eventuales" : "Planilla"}_${slug(empresa)}_${quincena}_${periodo}.${ext}`;

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

// El Salvador (13-nov-2026): calca la planilla de la Lic. Diana Calles —
// horas extras y vacación en la misma planilla, salario cotizable, aporte
// patronal (informativo), monto sujeto a ISR y ISR · ISSS · AFP.
const columnasSV = () => [
  { k: "n", t: "N°", w: 6, al: "center", v: (l, i) => String(i + 1) },
  { k: "nombre", t: "Colaborador", w: 50, al: "left" },
  { k: "dias", t: "Días", w: 10, al: "center", v: (l) => diasMostrados(l) },
  { k: "sb", t: "Sal. mensual", w: 18, al: "right", v: (l) => L(l.sb) },
  { k: "ord", sec: "ing", t: "Salario", w: 18, al: "right", v: (l, i, t) => L(t.ordinario) },
  { k: "he", sec: "ing", t: "Horas extras", w: 18, al: "right", v: (l) => { const h = (l.heSV?.diurnas || 0) + (l.heSV?.nocturnas || 0); return h ? `${nf(h, 1)} h · ${nf(l.heSV.monto)}` : "-"; } },
  { k: "vac", sec: "ing", t: "Vacación", w: 15, al: "right", v: (l) => L(l.vacacion) },
  { k: "oi", sec: "ing", t: "Otros ing.", w: 15, al: "right", v: (l, i, t) => L(t.extrasIng + (l.bq || 0) + (l.bonoFeriado || 0) + (l.bonoDomingo || 0)) },
  { k: "asis", sec: "ded", t: "Asistencia", w: 15, al: "right", v: (l, i, t) => t.dedAsist ? `-${nf(t.dedAsist)}` : "-", color: ROJO },
  { k: "cot", sec: "pat", t: "Sal. cotizable", w: 18, al: "right", v: (l) => L(l.cotizable) },
  { k: "pafp", sec: "pat", t: "AFP patronal", w: 15, al: "right", v: (l) => L(l.patronal?.afp) },
  { k: "pisss", sec: "pat", t: "ISSS patronal", w: 15, al: "right", v: (l) => L(l.patronal?.isss) },
  { k: "suj", sec: "pat", t: "Sujeto a ISR", w: 17, al: "right", v: (l) => L(l.sujetoIsr) },
  { k: "isr", sec: "ded2", t: "ISR", w: 15, al: "right", v: (l) => L(l.isr) },
  { k: "isss", sec: "ded2", t: "ISSS", w: 14, al: "right", v: (l) => L(l.isss) },
  { k: "afp", sec: "ded2", t: "AFP", w: 14, al: "right", v: (l) => L(l.afp) },
  { k: "od", sec: "ded2", t: "Otras ded.", w: 15, al: "right", v: (l, i, t) => L(t.extrasDed + (l.coop || 0)) },
  { k: "td", sec: "ded2", t: "Total desc.", w: 17, al: "right", v: (l, i, t) => L(t.deducciones), color: ROJO },
  { k: "neto", sec: "neto", t: "Líquido", w: 21, al: "right", v: (l, i, t) => Lsiempre(t.neto), bold: true },
  { k: "pago", t: "Pago", w: 13, al: "center", v: (l) => ({ transferencia: "Transf.", cheque: "Cheque", ach: "ACH" }[l.metodoPago || "transferencia"]) },
];

// Pastel por sección (30-oct-2026, Gerson: "colorcitos pasteles en ingresos y
// deducciones, el neto en otro color, que no sea tan blanco"): los mismos tonos
// del Excel — ingresos verde menta, deducciones rosa, neto naranja.
// Bajas (30-oct-2026, Gerson: "que las bajas tengan un highlight en los
// reportes"): fila en ámbar clarito con un filo y "BAJA · último día …".
const BAJA_FONDO = [255, 241, 204], BAJA_TINTA = [146, 94, 0];
const SEC_PDF = {
  ing: { t: "Ingresos", head: [213, 239, 221], cell: [243, 250, 245], tinta: [31, 107, 60] },
  ded: { t: "Deducciones", head: [249, 222, 219], cell: [253, 245, 244], tinta: [154, 42, 30] },
  pat: { t: "Seguridad social (informativo)", head: [220, 232, 248], cell: [245, 248, 253], tinta: [31, 79, 140] },
  ded2: { t: "Descuentos de ley", head: [249, 222, 219], cell: [253, 245, 244], tinta: [154, 42, 30] },
  neto: { t: "A pagar", head: [251, 217, 191], cell: [253, 238, 225], tinta: [169, 78, 22] },
};

/** Construye el jsPDF (sin guardar) — así se puede revisar en Node/replicar. */
// ── El Salvador: planilla de SERVICIOS PROFESIONALES EVENTUALES (13-nov-2026)
// La bonificación de Edy y Roberto se paga APARTE (Roberto Guerra): calcada de
// la hoja de la Lic. Diana — N°, nombre, puesto, DUI, NIT, salario, ISR 10 %,
// total descuentos y líquido a pagar; "Elaborado por" y "Autorizado".
// El Salvador: desde 2021 el NIT de una persona ES su DUI ("homologado"): si la
// ficha dice "Homologado con DUI", se muestra el número de DUI.
const nitDe = (l) => /homolog/i.test(String(l?.nit || "")) ? (l.dni || l.nit) : (l?.nit || "");
export const filasEventual = (lines) => (lines || []).filter(l => Number(l.eventual) > 0).map(l => ({ l, ...eventualSV(l.eventual) }));
const tituloEventual = (periodo, quincena) => `Planilla correspondiente a servicios profesionales eventuales · ${nombreQuincena(periodo, quincena).replace(" · ", " del mes de ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}`;
const construirEventualPDF = async ({ empresa, periodo, quincena, lines, meta = {}, jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), M = 14, CW = PW - 2 * M;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c);
  const filas = filasEventual(lines);
  const tot = filas.reduce((a, r) => ({ monto: a.monto + r.monto, isr: a.isr + r.isrX, liq: a.liq + r.liquidoX }), { monto: 0, isr: 0, liq: 0 });
  const marca = await cargarImagen("brand/geocore/geocore-180.png");
  if (marca) doc.addImage(marca.dataUrl, "PNG", M, M, 8, 8);
  f(7.5, "bold"); tc(GRIS_FAINT); doc.text(latin1("GEOCORE · GRUPO GEOTECNICA"), M + 11, M + 5.4, { charSpace: 0.5 });
  const ek = empresaKey(empresa);
  const logo = await achicarLogo(await cargarImagen(LOGO_EMPRESA[ek] || LOGO_EMPRESA.geotecnica).catch(() => null), 360);
  if (logo) { const h = ek === "subterra" ? 30 : 18, w = Math.min(90, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", PW - M - w, M - 2, w, h); }
  let y = M + 24;
  f(16, "bold"); tc(CARBON); doc.text(latin1(meta.razonSocial || "SUBTERRA, S.A. DE C.V."), M, y);
  y += 7; f(11, "bold"); tc(NARANJA_TEXTO);
  const tl = doc.splitTextToSize(latin1(tituloEventual(periodo, quincena)), CW - 70);
  doc.text(tl, M, y); y += 5 * (tl.length - 1) + 6; f(9); tc(GRIS); doc.text(latin1(`${rangoQuincena(periodo, quincena)} · ${meta.estado === "publicada" ? "Publicada" : "Borrador"}${meta.generadaPor ? ` · generada por ${meta.generadaPor}` : ""}`), M, y);
  y += 8;
  const kw = (CW - 9) / 4;
  pdfKpi(doc, M, y, kw, 16, "Personas", String(filas.length));
  pdfKpi(doc, M + (kw + 3), y, kw, 16, "Salario", Lsiempre(tot.monto));
  pdfKpi(doc, M + 2 * (kw + 3), y, kw, 16, "ISR 10 %", Lsiempre(tot.isr));
  pdfKpi(doc, M + 3 * (kw + 3), y, kw, 16, "Líquido a pagar", Lsiempre(tot.liq), { tono: "naranjaTexto" });
  y += 26;
  // Tabla
  const cols = [["#", 8, "c"], ["Nombre", 56, "l"], ["Puesto", 36, "l"], [`${DOC_ID}/Residencia`, 26, "l"], ["NIT", 30, "l"], ["Salario", 24, "r"], ["ISR 10 %", 20, "r"], ["Total", 24, "r"], ["Líquido a pagar", 0, "r"]];
  const fijo = cols.reduce((a, c) => a + c[1], 0); cols[cols.length - 1][1] = CW - fijo;
  const xs = []; let x = M; cols.forEach(c => { xs.push(x); x += c[1]; });
  const celda = (txt, i, yy, st = "normal", color = CARBON) => {
    const [, w, al] = cols[i]; f(8.6, st); tc(color);
    const t = latin1(txt);
    if (al === "r") doc.text(t, xs[i] + w - 2, yy, { align: "right" }); else if (al === "c") doc.text(t, xs[i] + w / 2, yy, { align: "center" }); else doc.text(doc.splitTextToSize(t, w - 3)[0], xs[i] + 2, yy);
  };
  doc.setFillColor(...TINTE); doc.rect(M, y, CW, 9, "F");
  doc.setFillColor(...FONDO); doc.rect(xs[6], y - 6, cols[6][1] + cols[7][1], 6, "F");
  f(6.8, "bold"); tc(GRIS); doc.text("DESCUENTOS", xs[6] + (cols[6][1] + cols[7][1]) / 2, y - 2, { align: "center", charSpace: 0.4 });
  cols.forEach(([lab], i) => { f(7, "bold"); tc(NARANJA_TEXTO); const [, w, al] = cols[i]; const t = latin1(lab.toUpperCase()); if (al === "r") doc.text(t, xs[i] + w - 2, y + 5.8, { align: "right" }); else if (al === "c") doc.text(t, xs[i] + w / 2, y + 5.8, { align: "center" }); else doc.text(t, xs[i] + 2, y + 5.8); });
  y += 9;
  filas.forEach((r, i) => {
    if (i % 2 === 1) { doc.setFillColor(251, 250, 248); doc.rect(M, y, CW, 8, "F"); }
    const yy = y + 5.4;
    celda(String(i + 1), 0, yy, "normal", GRIS_FAINT);
    celda(String(r.l.name || "").toUpperCase(), 1, yy, "bold");
    celda(r.l.pos || "", 2, yy, "normal", GRIS);
    celda(r.l.dni || "", 3, yy); celda(nitDe(r.l), 4, yy);
    celda(Lsiempre(r.monto), 5, yy); celda(Lsiempre(r.isr), 6, yy); celda(Lsiempre(r.isr), 7, yy);
    celda(Lsiempre(r.liquido), 8, yy, "bold");
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.15); doc.line(M, y + 8, M + CW, y + 8);
    y += 8;
  });
  doc.setFillColor(...TINTE); doc.rect(M, y, CW, 9, "F");
  doc.setDrawColor(232, 118, 45); doc.setLineWidth(0.5); doc.line(M, y, M + CW, y);
  celda("TOTAL", 1, y + 6, "bold", NARANJA_TEXTO);
  celda(Lsiempre(tot.monto), 5, y + 6, "bold"); celda(Lsiempre(tot.isr), 6, y + 6, "bold"); celda(Lsiempre(tot.isr), 7, y + 6, "bold");
  celda(Lsiempre(tot.liq), 8, y + 6, "bold", NARANJA_TEXTO);
  y += 18;
  f(8.5); tc(GRIS); doc.text(latin1("Se paga aparte de la planilla de sueldos y salarios. Solo retención de ISR 10 % (sin ISSS ni AFP)."), M, y);
  // Firmas
  const yF = Math.max(y + 26, 175);
  [["Elaborado por", meta.elaboradoPor || ""], ["Autorizado", ""]].forEach(([lab, nom], i) => {
    const fx = M + 10 + i * 120;
    doc.setDrawColor(...CARBON); doc.setLineWidth(0.3); doc.line(fx, yF, fx + 80, yF);
    f(8.5, "bold"); tc(CARBON); doc.text(latin1(lab), fx, yF + 5);
    if (nom) { f(8.5); tc(GRIS); doc.text(latin1(nom), fx, yF + 10); }
  });
  pdfPie(doc, { margen: M });
  return doc;
};

export const construirPlanillaPDF = async ({ empresa, periodo, quincena, lines, meta = {}, jsPDF, parte = "salarios" }) => {
  if (parte === "eventual") return construirEventualPDF({ empresa, periodo, quincena, lines, meta, jsPDF });
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
  const sv = lines.some(l => l.pais === "sv");
  const ley = sv || quincena === "2Q";
  const ctx = { y: 0 };
  const titulo = esHe ? "Planilla de horas extras" : "Planilla de sueldos y salarios";
  // Horas extras (31-oct-2026, Gerson): el reporte se titula con la quincena
  // TRABAJADA (heDe) y aclara en qué quincena se PAGAN — quincena vencida.
  const qTrab = esHe && meta.heDe ? meta.heDe : { periodo, quincena };
  const pagadasCon = `pagadas con la ${nombreQuincena(periodo, quincena).replace(" · ", " de ").toLowerCase()}`;
  const sub = esHe && meta.heDe
    ? `Trabajadas ${rangoQuincena(qTrab.periodo, qTrab.quincena)} · ${pagadasCon}`
    : `${nombreQuincena(periodo, quincena)} · ${rangoQuincena(periodo, quincena)}`;

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

  // ── Página 1: PORTADA (30-oct-2026, Gerson: "que la primera página sea una
  // portada bonita, aprovechando la hoja: logo de la empresa más grande, las
  // cajitas más grandes"). Las tablas arrancan en la página 2.
  const conHe = lines.filter(l => l.he && l.he.monto > 0);
  {
    const ek = empresaKey(empresa);
    const marca = await cargarImagen("brand/geocore/geocore-180.png");
    if (marca) doc.addImage(marca.dataUrl, "PNG", M + 4, M + 4, 9, 9);
    P.f(8.5, "bold"); P.tc(GRIS_FAINT); doc.text(latin1("GEOCORE · GRUPO GEOTECNICA"), M + 16, M + 10, { charSpace: 0.6 });
    const logo = await cargarImagen(LOGO_EMPRESA[ek] || LOGO_EMPRESA.geotecnica);
    if (logo) { const h = ek === "subterra" ? 44 : 24, w = Math.min(110, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", PW - M - 4 - w, M + 2, w, h); }
    let y = M + 62;
    P.f(11, "bold"); P.tc(NARANJA_TEXTO); doc.text(latin1(`${esHe ? "HORAS EXTRAS" : "PLANILLA"} · ${esHe && meta.heDe ? "TRABAJADAS EN LA " : ""}${nombreQuincena(qTrab.periodo, qTrab.quincena).split(" · ")[0].toUpperCase()}`), M + 4, y - 14, { charSpace: 0.8 });
    P.f(34, "bold"); P.tc(CARBON); P.t(titulo, M + 4, y);
    y += 11; P.f(15); P.tc(GRIS); P.t(`${empresa}  ·  ${mesLargo(qTrab.periodo).replace(/^\w/, c => c.toUpperCase())}  ·  ${rangoQuincena(qTrab.periodo, qTrab.quincena)}`, M + 4, y);
    if (esHe && meta.heDe) { y += 7; P.f(12, "bold"); P.tc(NARANJA_TEXTO); P.t(pagadasCon.replace(/^\w/, c => c.toUpperCase()), M + 4, y); }
    y += 7; P.f(10); P.tc(GRIS_FAINT); P.t(`${meta.estado === "publicada" ? "Publicada" : "Borrador"}${meta.generadaPor ? ` · generada por ${meta.generadaPor}` : ""} · ${fechaLarga()}`, M + 4, y);
    y += 6; P.fc(PDF_TEMA.naranja); rr(M + 4, y, 22, 1.4, 0.7);
    // Cajitas grandes
    y += 12;
    const tiles = esHe ? [
      ["Colaboradores", String(conHe.length)],
      ["Horas extras", nf(res.heHrs, 1)],
      ["Trabajadas en", meta.heDe ? etiquetaCorta(meta.heDe.periodo, meta.heDe.quincena) : "-"],
      ["Total a pagar", Lsiempre(res.he), true],
    ] : [
      ["Colaboradores", String(res.personas)],
      ["Salarios ordinarios", Lsiempre(res.ordinario)],
      ["Ingresos", Lsiempre(res.ingresos)],
      ["Deducciones", Lsiempre(res.deducciones), false, ROJO],
      ["Total a pagar", Lsiempre(res.neto), true],
    ];
    const gap = 6, tw = (CW - 8 - (tiles.length - 1) * gap) / tiles.length, th = 36;
    tiles.forEach(([lab, val, dest, col], i) => {
      const x = M + 4 + i * (tw + gap);
      P.fc(dest ? TINTE : FONDO); rr(x, y, tw, th, 4);
      P.f(8.5, "bold"); P.tc(dest ? NARANJA_TEXTO : GRIS_FAINT); doc.text(latin1(lab.toUpperCase()), x + 7, y + 10, { charSpace: 0.5 });
      P.f(val.length > 13 ? 20 : 24, "bold"); P.tc(dest ? NARANJA_TEXTO : (col || CARBON)); P.t(val, x + 7, y + th - 9);
    });
    y += th + 10;
    // Resumen en tres cajas: por tipo de contrato · por método de pago · total
    const bw3 = (CW - 8 - 2 * gap) / 3;
    const cajaP = (x, tit, filas, dest) => {
      const h = 14 + filas.length * 8;
      P.fc(dest ? TINTE : FONDO); rr(x, y, bw3, h, 4);
      P.f(8, "bold"); P.tc(dest ? NARANJA_TEXTO : GRIS_FAINT); doc.text(latin1(tit.toUpperCase()), x + 7, y + 9, { charSpace: 0.5 });
      filas.forEach(([a1, b1, big], i) => {
        const yy = y + 17 + i * 8;
        P.f(big ? 11 : 10, big ? "bold" : "normal"); P.tc(CARBON); P.t(a1, x + 7, yy);
        P.f(big ? 12 : 10, "bold"); P.tc(big && dest ? NARANJA_TEXTO : CARBON); P.t(b1, x + bw3 - 7, yy, { align: "right" });
      });
      return h;
    };
    const grupos = gruposPlanilla(esHe ? conHe : lines);
    const sumaG = (rows) => rows.reduce((a2, l) => a2 + (esHe ? l.he.monto : (totalesLinea(l).netoX ?? totalesLinea(l).neto)), 0);
    const porMet = METODOS_PAGO.filter(([k]) => (esHe ? res.hePorMetodo : res.porMetodo)[k]?.n).map(([k, lab]) => { const g = (esHe ? res.hePorMetodo : res.porMetodo)[k]; return [`${lab} (${g.n})`, Lsiempre(esHe ? g.monto : g.neto)]; });
    cajaP(M + 4, "Por tipo de contrato", grupos.map(g => [`${g.label} (${g.rows.length})`, Lsiempre(sumaG(g.rows))]));
    cajaP(M + 4 + bw3 + gap, "Por método de pago", porMet.length ? porMet : [["-", "-"]]);
    cajaP(M + 4 + 2 * (bw3 + gap), "Total a pagar", [["Colaboradores", String(esHe ? conHe.length : res.personas)], [esHe ? "Total horas extras" : "Total salarios", Lsiempre(esHe ? res.he : res.neto), true]], true);
    // Nota al pie de la portada
    const linea2 = [];
    if (esHe) linea2.push(meta.heDe ? `Horas trabajadas en la ${nombreQuincena(meta.heDe.periodo, meta.heDe.quincena).toLowerCase()} (${rangoQuincena(meta.heDe.periodo, meta.heDe.quincena)}), pagadas con la quincena vencida` : "Sin hoja de horas extras de la quincena anterior");
    else {
      linea2.push(sv ? "ISSS, AFP e ISR de la quincena · horas extras y vacación incluidas" : ley ? "Segunda quincena: aplican IHSS, RAP e ISR" : "Primera quincena: sin deducciones de ley (van en la 2Q)");
      if (res.nsp) linea2.push(`${res.nsp} días de NSP`);
      if (res.he) linea2.push(`Las horas extras (${Lsiempre(res.he)}) van en su propia planilla`);
    }
    P.f(9); P.tc(GRIS); P.t(linea2.join("   ·   "), M + 4, Y_MAX - 4);
    nuevaPagina();
  }

  // ── Tablas por grupo (planilla de salarios) ──
  const cols = sv ? columnasSV() : columnas(ley);
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
    const g = { neto: Math.round(rows.reduce((a, l) => { const t = totalesLinea(l); return a + (t.netoX ?? t.neto); }, 0) * 100 + 1e-6) / 100 };
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
      if (l.baja) { P.fc(BAJA_FONDO); doc.rect(M, ctx.y, CW, h, "F"); P.fc(BAJA_TINTA); doc.rect(M, ctx.y, 0.9, h, "F"); }
      else pintarSecciones(ctx.y, h, "cell");
      const yt = ctx.y + 4.6;
      cols.forEach((c, ci) => {
        if (c.k === "nombre") {
          celda(ci, l.name, yt - 1.2, { al: "left", bold: true, fs: 7 });
          const { x, w } = xs[ci];
          if (l.baja) { P.f(5.6, "bold"); P.tc(BAJA_TINTA); P.t(recortar(`BAJA · último día ${fechaCorta(l.baja)}`, w - 3), x + 1.5, yt + 1.6); }
          else { P.f(5.6); P.tc(GRIS_FAINT); P.t(recortar(l.pos || "", w - 3), x + 1.5, yt + 1.6); }
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
      he: L(sum(l => l.heSV?.monto || 0)), vac: L(sum(l => l.vacacion || 0)), cot: L(sum(l => l.cotizable || 0)),
      pafp: L(sum(l => l.patronal?.afp || 0)), pisss: L(sum(l => l.patronal?.isss || 0)), suj: L(sum(l => l.sujetoIsr || 0)),
      isss: L(sum(l => l.isss || 0)), afp: L(sum(l => l.afp || 0)),
      ...(sv ? {
        oi: L(sum((l, t) => t.extrasIng + (l.bq || 0) + (l.bonoFeriado || 0) + (l.bonoDomingo || 0))), od: L(sum((l, t) => t.extrasDed + (l.coop || 0))),
        // Como el Excel de la Lic. Diana: los totales suman los valores SIN redondear.
        isr: L(Math.round(sum((l, t) => t.sv?.isrX ?? l.isr) * 100 + 1e-6) / 100), suj: L(Math.round(sum((l, t) => t.sv?.sujetoX ?? l.sujetoIsr ?? 0) * 100 + 1e-6) / 100),
        td: L(Math.round(sum((l, t) => t.deduccionesX ?? t.deducciones) * 100 + 1e-6) / 100),
      } : {}),
    };
    pintarSecciones(ctx.y + 0.4, 7, "head");
    cols.forEach((c, ci) => celda(ci, tot[c.k] ?? "", ctx.y + 4.7, { al: c.al, bold: true, color: c.k === "asis" || c.k === "td" ? ROJO : CARBON, fs: 7 }));
    if (sv) { ctx.y += 7; P.f(6.5); P.tc(GRIS); P.t(`Aporte patronal (lo paga la empresa, no se descuenta): AFP ${Lsiempre(sum(l => l.patronal?.afp || 0))} · ISSS ${Lsiempre(sum(l => l.patronal?.isss || 0))}`, M, ctx.y + 4); }
    ctx.y += 7 + 8;
  });

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
        fondoFila(ctx.y, 7, l.baja ? BAJA_FONDO : i % 2 ? tono.cell : [255, 255, 255]);
        if (l.baja) { P.fc(BAJA_TINTA); doc.rect(M, ctx.y, 0.9, 7, "F"); }
        const b = l.he.bandas || {};
        const y = ctx.y + 4.7;
        hcel(0, String(i + 1), y); hcel(1, l.baja ? `${l.name}  ·  BAJA ${fechaCorta(l.baja)}` : l.name, y, { bold: true, color: l.baja ? BAJA_TINTA : CARBON }); hcel(2, Lsiempre(l.he.horaBase), y);
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

// ── El Salvador: ESTIMACIÓN DE PAGO DE CONTRATISTAS en jsPDF (14-nov-2026) ──
// Gerson: "muy gris, muy aburrida; que se vea bonita como la de los fijos y las
// bonificaciones". Misma familia visual que la planilla: cabecera con el logo de
// Subterra, cifras arriba, franjas de color por sección (Servicio · Horas extra ·
// Descuentos · A pagar), filas alternadas, totales en naranja y el Resumen para
// pagos (banco y cuenta) en su propia tabla. Recibe las filas ya calculadas
// (filasReporte de contratistas.jsx): acá solo se dibuja.
const SEC_CT = {
  col: { t: "Contratista", head: [241, 240, 237], cell: [255, 255, 255], tinta: [110, 104, 98] },
  serv: { t: "Servicio de la quincena", head: [220, 232, 248], cell: [245, 248, 253], tinta: [31, 79, 140] },
  he: { t: "Horas extra", head: [213, 239, 221], cell: [243, 250, 245], tinta: [31, 107, 60] },
  glob: { t: "Suma global", head: [233, 231, 227], cell: [247, 246, 244], tinta: [60, 56, 52] },
  ded: { t: "Retención", head: [249, 222, 219], cell: [253, 245, 244], tinta: [154, 42, 30] },
  neto: { t: "A pagar", head: [251, 217, 191], cell: [253, 238, 225], tinta: [169, 78, 22] },
  pago: { t: "Datos de pago", head: [220, 232, 248], cell: [245, 248, 253], tinta: [31, 79, 140] },
};
// "SE-30-3-10 ESTUDIO SKY PARK" → nombre arriba y el código abajo (no se corta).
const partirProyecto = (s) => { const m = String(s || "").match(/^([A-Z]{2,4}-[\d-]+)\s+(.*)$/); return m ? { nombre: m[2], codigo: m[1] } : { nombre: String(s || "-"), codigo: "" }; };
export const construirContratistasPDF = async ({ periodo, quincena, filas, totales, meta = {}, jsPDF }) => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), M = 12, CW = PW - 2 * M, Y_MAX = PH - 18;
  const f = (n, st = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", st); };
  const tc = (c) => doc.setTextColor(...c), fc = (c) => doc.setFillColor(...c);
  const recortar = (s, w) => { let t = latin1(s); if (doc.getTextWidth(t) <= w) return t; while (t.length > 1 && doc.getTextWidth(t + "...") > w) t = t.slice(0, -1); return t.trimEnd() + "..."; };
  const $ = (n) => Lsiempre(n);
  const n2 = (v) => { const x = Number(v) || 0; return x % 1 ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(x); };
  const rango = rangoQuincena(periodo, quincena);
  const titulo = `Planilla de proveedores de servicios · ${nombreQuincena(periodo, quincena).replace(" · ", " del mes de ").toLowerCase().replace(/^\w/, c => c.toUpperCase())}`;
  const ctx = { y: M };

  // Cabecera de la PRIMERA hoja: marca, logo grande de Subterra, razón social y título.
  const marca = await cargarImagen("brand/geocore/geocore-180.png");
  if (marca) doc.addImage(marca.dataUrl, "PNG", M, M, 8, 8);
  f(7.5, "bold"); tc(GRIS_FAINT); doc.text(latin1("GEOCORE · GRUPO GEOTECNICA"), M + 11, M + 5.4, { charSpace: 0.5 });
  const logo = await achicarLogo(await cargarImagen(LOGO_EMPRESA.subterra).catch(() => null), 360);
  if (logo) { const h = 28, w = Math.min(90, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", PW - M - w, M - 2, w, h); }
  let y = M + 23;
  f(16, "bold"); tc(CARBON); doc.text(latin1(meta.razonSocial || "SUBTERRA, S.A. DE C.V."), M, y);
  y += 7; f(11, "bold"); tc(NARANJA_TEXTO);
  const tl = doc.splitTextToSize(latin1(titulo), CW - 75); doc.text(tl, M, y); y += 5 * (tl.length - 1) + 6;
  f(9); tc(GRIS); doc.text(latin1(`${rango} · retención de ISR aplicable 10 %${meta.estado ? ` · ${meta.estado}` : ""}`), M, y);
  y += 7;
  const kw = (CW - 12) / 5;
  pdfKpi(doc, M, y, kw, 16, "Contratos", String(totales.contratos));
  pdfKpi(doc, M + (kw + 3), y, kw, 16, "Personas", String(totales.personas));
  pdfKpi(doc, M + 2 * (kw + 3), y, kw, 16, "Suma global", $(totales.suma));
  pdfKpi(doc, M + 3 * (kw + 3), y, kw, 16, "Retención ISR 10 %", $(totales.retencion), { tono: "rojo" });
  pdfKpi(doc, M + 4 * (kw + 3), y, kw, 16, "Líquido a pagar", $(totales.liquido), { tono: "naranjaTexto" });
  ctx.y = y + 24;

  const encabezadoCont = () => {
    f(7, "bold"); tc(GRIS_FAINT); doc.text(latin1("GEOCORE · GRUPO GEOTECNICA"), M, M + 3.2, { charSpace: 0.4 });
    f(8.5, "bold"); tc(CARBON); doc.text(latin1(`Subterra El Salvador · Proveedores de servicios · ${nombreQuincena(periodo, quincena)}`), PW - M, M + 3.2, { align: "right" });
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.2); doc.line(M, M + 7, PW - M, M + 7);
    ctx.y = M + 12;
  };
  const asegurar = (h) => { if (ctx.y + h > Y_MAX) { doc.addPage(); encabezadoCont(); return true; } return false; };

  // Tabla genérica con franjas por sección.
  const tabla = ({ titulo: tt, cols, filasT, total, alto = 10 }) => {
    const fijo = cols.reduce((a, c) => a + (c.w || 0), 0); const libre = cols.filter(c => !c.w).length;
    const xs = []; let x = M; cols.forEach(c => { const w = c.w || (CW - fijo) / libre; xs.push({ x, w }); x += w; });
    const celda = (i, txt, yy, { bold = false, color = CARBON, fs = 7.2 } = {}) => {
      const { x: cx, w } = xs[i], al = cols[i].al || "left"; f(fs, bold ? "bold" : "normal"); tc(color);
      const t = recortar(txt, w - 3);
      if (al === "right") doc.text(t, cx + w - 1.5, yy, { align: "right" }); else if (al === "center") doc.text(t, cx + w / 2, yy, { align: "center" }); else doc.text(t, cx + 1.5, yy);
    };
    const encabezado = () => {
      Object.entries(SEC_CT).forEach(([k, sc]) => {
        const ids = cols.map((c, ci) => c.sec === k ? ci : -1).filter(i => i >= 0); if (!ids.length) return;
        const x0 = xs[ids[0]].x, x1 = xs[ids[ids.length - 1]].x + xs[ids[ids.length - 1]].w;
        fc(sc.head); doc.rect(x0, ctx.y, x1 - x0, 4.4, "F");
        f(5.8, "bold"); tc(sc.tinta); doc.text(latin1(sc.t.toUpperCase()), (x0 + x1) / 2, ctx.y + 3.1, { align: "center", charSpace: 0.2 });
      });
      ctx.y += 4.8;
      cols.forEach((c, ci) => { const sc = SEC_CT[c.sec]; if (sc) { fc(sc.head); doc.rect(xs[ci].x, ctx.y, xs[ci].w, 7, "F"); } });
      cols.forEach((c, ci) => celda(ci, c.t.toUpperCase(), ctx.y + 4.6, { bold: true, color: SEC_CT[c.sec]?.tinta || GRIS_FAINT, fs: 5.9 }));
      doc.setDrawColor(...LINEA_FUERTE); doc.setLineWidth(0.25); doc.line(M, ctx.y + 7, PW - M, ctx.y + 7);
      ctx.y += 7;
    };
    asegurar(20 + alto * Math.min(3, filasT.length));
    f(11.5, "bold"); tc(CARBON); doc.text(latin1(tt), M, ctx.y + 4); ctx.y += 8;
    encabezado();
    filasT.forEach((r, ri) => {
      if (asegurar(alto + (ri === filasT.length - 1 && total ? 9 : 0))) encabezado();
      cols.forEach((c, ci) => { const sc = SEC_CT[c.sec]; if (sc && sc.cell) { fc(ri % 2 ? sc.cell.map(v => Math.max(0, v - 4)) : sc.cell); doc.rect(xs[ci].x, ctx.y, xs[ci].w, alto, "F"); } });
      cols.forEach((c, ci) => {
        const v = r[ci] || {}; const l1 = v.a ?? v, l2 = v.b;
        celda(ci, String(l1 ?? ""), ctx.y + (l2 ? 4.2 : 5.9), { bold: !!c.bold, color: c.color || CARBON, fs: c.fs || 7.2 });
        if (l2) celda(ci, String(l2), ctx.y + 8, { color: GRIS_FAINT, fs: 5.8 });
      });
      doc.setDrawColor(...LINEA); doc.setLineWidth(0.15); doc.line(M, ctx.y + alto, PW - M, ctx.y + alto);
      ctx.y += alto;
    });
    if (total) {
      cols.forEach((c, ci) => { const sc = SEC_CT[c.sec]; if (sc) { fc(sc.head); doc.rect(xs[ci].x, ctx.y, xs[ci].w, 8, "F"); } });
      doc.setDrawColor(232, 118, 45); doc.setLineWidth(0.5); doc.line(M, ctx.y, PW - M, ctx.y);
      cols.forEach((c, ci) => celda(ci, total[ci] ?? "", ctx.y + 5.4, { bold: true, color: ci === cols.length - 1 ? NARANJA_TEXTO : (SEC_CT[c.sec]?.tinta || CARBON), fs: 7.6 }));
      ctx.y += 8;
    }
    ctx.y += 9;
  };

  // 1) Proveedores de servicios (el detalle, como la hoja de Roberto)
  tabla({
    titulo: "Proveedores de servicios",
    cols: [
      { t: "#", w: 6, al: "center", sec: "col", color: GRIS_FAINT },
      { t: "Contratista", w: 51, sec: "col", bold: true, fs: 6.9 },
      { t: "Proyecto / UG", w: 30, sec: "col" },
      { t: "Entregado", w: 19, al: "right", sec: "serv" },
      { t: "Tarifa", w: 16, al: "right", sec: "serv" },
      { t: "Subtotal", w: 20, al: "right", sec: "serv" },
      { t: "Diurnas", w: 13, al: "right", sec: "he", fs: 7 },
      { t: "Noct.", w: 11, al: "right", sec: "he", fs: 7 },
      { t: "Valor h.", w: 14, al: "right", sec: "he", fs: 7 },
      { t: "Monto", w: 15, al: "right", sec: "he" },
      { t: "Suma global", w: 20, al: "right", sec: "glob", bold: true },
      { t: "ISR 10 %", w: 16, al: "right", sec: "ded", color: [154, 42, 30] },
      { t: "Líquido a pagar", al: "right", sec: "neto", bold: true, color: NARANJA_TEXTO },
    ],
    filasT: filas.map((r, i) => [
      String(i + 1),
      { a: r.nombre, b: `${r.codigo}${r.dui ? ` · ${DOC_ID} ${r.dui}` : ""}` },
      (() => { const pp = partirProyecto(r.proyecto); return { a: pp.nombre, b: [pp.codigo, r.rol].filter(Boolean).join(" · ") }; })(),
      { a: `${n2(r.entregado)} ${r.unidadEntregado === "días" ? "días" : "ML"}`, b: r.unidadEntregado === "días" ? "" : r.unidadEntregado },
      { a: $(r.tarifa), b: r.unidadEntregado === "días" ? "por día" : `por ${String(r.unidadEntregado).split(" ")[0]}` },
      $(r.sumaDias),
      r.heD ? `${n2(r.heD)} h` : "-", r.heN ? `${n2(r.heN)} h` : "-",
      r.precioHe ? `${MONEDA} ${(Number(r.precioHe) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}` : "-",
      r.sumaHeD + r.sumaHeN ? $(r.sumaHeD + r.sumaHeN) : "-",
      $(r.suma), $(r.retencion), $(r.liquido),
    ]),
    total: ["", "SUMAS", "", "", "", $(filas.reduce((a, r) => a + r.sumaDias, 0)), "", "", "", $(filas.reduce((a, r) => a + r.sumaHeD + r.sumaHeN, 0)), $(totales.suma), $(totales.retencion), $(totales.liquido)],
  });

  // 2) Resumen para pagos (banco y cuenta de cada uno)
  tabla({
    titulo: "Resumen para pagos",
    cols: [
      { t: "Nombre completo", w: 56, sec: "col", bold: true },
      { t: DOC_ID, w: 21, sec: "col" },
      { t: "Servicio eventual", w: 58, sec: "col" },
      { t: "Suma global", w: 21, al: "right", sec: "glob" },
      { t: "Retención ISR", w: 20, al: "right", sec: "ded", color: [154, 42, 30] },
      { t: "Líquido a pagar", w: 23, al: "right", sec: "neto", bold: true, color: NARANJA_TEXTO },
      { t: "Banco", w: 24, sec: "pago" },
      { t: "Cuenta", sec: "pago" },
    ],
    filasT: filas.map(r => [
      { a: r.nombre, b: r.correo || r.telefono || "" },
      r.dui, { a: r.servicio, b: r.telefono ? `Tel. ${r.telefono}` : "" },
      $(r.suma), $(r.retencion), $(r.liquido),
      r.banco || "-", { a: String(r.cuenta || "-").replace(/\s*\(.*\)$/, ""), b: (String(r.cuenta || "").match(/\((.*)\)$/) || [])[1] || "" },
    ]),
    total: ["TOTAL A PAGAR", "", "", $(totales.suma), $(totales.retencion), $(totales.liquido), "", ""],
  });

  // Firmas
  if (ctx.y + 26 > Y_MAX) { doc.addPage(); encabezadoCont(); }
  const yF = Math.max(ctx.y + 16, Math.min(Y_MAX - 10, ctx.y + 20));
  [["Elaborado por", meta.elaboradoPor || ""], ["Aprobado por", ""]].forEach(([lab, nom], i) => {
    const fx = M + 20 + i * 130;
    doc.setDrawColor(...CARBON); doc.setLineWidth(0.3); doc.line(fx, yF, fx + 80, yF);
    f(8.5, "bold"); tc(CARBON); doc.text(latin1(lab), fx, yF + 5);
    if (nom) { f(8.5); tc(GRIS); doc.text(latin1(nom), fx, yF + 10); }
  });
  pdfPie(doc, { margen: M });
  return doc;
};
export const exportarContratistasPDF = async (args) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = await construirContratistasPDF({ ...args, jsPDF });
  const nombre = `Planilla_Contratistas_Subterra_${args.quincena}_${args.periodo}.pdf`;
  doc.save(nombre);
  return nombre;
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
const FMT_L = `"${MONEDA}" #,##0.00;[Red]-"${MONEDA}" #,##0.00;"-"`;
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

  // ── SERVICIOS PROFESIONALES EVENTUALES (El Salvador, archivo propio) ──
  if (parte === "eventual") {
    const filas = filasEventual(lines);
    const we = wb.addWorksheet("Servicios eventuales", { views: [{ state: "frozen", ySplit: 6, showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    we.columns = [["N°", 5], ["Nombre", 36], ["Puesto", 26], [`${DOC_ID}/Residencia`, 15], ["NIT", 20], ["Salario", 14], ["ISR 10 %", 13], ["Total descuentos", 15], ["Líquido a pagar", 16], ["Método de pago", 16]].map(([header, width]) => ({ header, width }));
    we.spliceRows(1, 1);
    const UE = 10;
    cabeceraHoja(we, { desde: "C", hasta: "F", ultima: UE }, [
      meta.razonSocial || "SUBTERRA, S.A. DE C.V.", tituloEventual(periodo, quincena), rangoQuincena(periodo, quincena), estadoTxt(),
    ]);
    tile(we, "G", "H", "Personas", filas.length);
    tile(we, "I", "J", "Líquido a pagar", Math.round(filas.reduce((a, r) => a + r.liquidoX, 0) * 100) / 100, { naranja: true, fmt: FMT_L });
    we.getRow(6).values = we.columns.map(c => c.header);
    filaEncabezado(we.getRow(6));
    let r = 7; const r0 = r;
    filas.forEach((f0, i) => {
      const row = we.getRow(r);
      row.values = [i + 1, String(f0.l.name || "").toUpperCase(), f0.l.pos || "", f0.l.dni || "", nitDe(f0.l), f0.monto,
        { formula: `ROUND(F${r}*10%,2)`, result: f0.isr }, { formula: `G${r}`, result: f0.isr }, { formula: `F${r}-H${r}`, result: f0.liquido }, pagoTxt[f0.l.metodoPago] || "Transferencia"];
      pintarFila(row, i, UE);
      row.font = ft(); row.alignment = { vertical: "middle" };
      row.getCell(2).font = ft({ bold: true }); row.getCell(1).font = ft({ color: { argb: GR3 } }); row.getCell(3).font = ft({ color: { argb: GR } });
      [6, 7, 8, 9].forEach(c => { row.getCell(c).numFmt = FMT_L; });
      row.getCell(9).font = ft({ bold: true }); row.getCell(9).fill = fill(TINTE_X);
      r++;
    });
    const tt = we.getRow(r); tt.values = ["", "TOTAL"];
    [6, 7, 8, 9].forEach(c => { const col = we.getColumn(c).letter; tt.getCell(c).value = { formula: `SUM(${col}${r0}:${col}${Math.max(r0, r - 1)})`, result: Math.round(filas.reduce((a, x) => a + (c === 6 ? x.monto : c === 9 ? x.liquido : x.isr), 0) * 100) / 100 }; tt.getCell(c).numFmt = FMT_L; });
    filaTotal(tt, UE, 9);
    r += 2;
    const nota = we.getCell(r, 2); nota.value = "Se paga aparte de la planilla de sueldos y salarios. Solo retención de ISR 10 % (sin ISSS ni AFP)."; nota.font = ft({ size: 9.5, color: { argb: GR } });
    [["Elaborado por", meta.elaboradoPor || ""], ["Autorizado", ""]].forEach(([lab, nom], i) => {
      const c = 2 + i * 4, rf = r + 5;
      we.getCell(rf, c).border = { bottom: { style: "thin", color: { argb: CARB } } };
      we.getCell(rf + 1, c).value = lab; we.getCell(rf + 1, c).font = ft({ size: 9.5, bold: true });
      if (nom) { we.getCell(rf + 2, c).value = nom; we.getCell(rf + 2, c).font = ft({ size: 9, color: { argb: GR } }); }
    });
    return wb;
  }

  // ── PLANILLA DE HORAS EXTRAS (archivo propio) ──
  if (parte === "he") {
    const conHe = lines.filter(l => l.he && l.he.monto > 0);
    const wh = wb.addWorksheet("Horas extras", { views: [{ state: "frozen", ySplit: 6, showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    wh.columns = [["N°", 5], ["Colaborador", 34], ["Cargo", 24], ["Hora base", 12], ["4 a 7 pm (×1.25)", 14], ["7 a 10 pm (×1.5)", 14], ["10 pm a 12 (×1.75)", 15], ["Domingo (×2)", 13], ["Total horas", 12], ["Monto a pagar", 16], ["Método de pago", 16]].map(([header, width]) => ({ header, width }));
    wh.spliceRows(1, 1);
    const UH = 11;
    cabeceraHoja(wh, { desde: "C", hasta: "G", ultima: UH }, [
      empresa, meta.heDe ? `Horas extras trabajadas en la ${nombreQuincena(meta.heDe.periodo, meta.heDe.quincena).replace(" · ", " de ").toLowerCase()}` : "Planilla de horas extras",
      meta.heDe ? `Trabajadas ${rangoQuincena(meta.heDe.periodo, meta.heDe.quincena)} · pagadas con la ${nombreQuincena(periodo, quincena).replace(" · ", " de ").toLowerCase()}` : `Se pagan con la ${nombreQuincena(periodo, quincena).toLowerCase()}`,
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
      row.values = [i + 1, l.baja ? `${l.name}  ·  BAJA ${fechaCorta(l.baja)}` : l.name, l.pos || "", l.he.horaBase, b.b1?.hrs || 0, b.b2?.hrs || 0, b.b3?.hrs || 0, b.dom?.hrs || 0, l.he.hrs, l.he.monto, pagoTxt[l.metodoPago] || "Transferencia"];
      pintarFila(row, i, UH);
      row.font = ft(); row.alignment = { vertical: "middle" };
      row.getCell(2).font = ft({ bold: true }); row.getCell(1).font = ft({ color: { argb: GR3 } }); row.getCell(3).font = ft({ color: { argb: GR } });
      [4, 10].forEach(c => { row.getCell(c).numFmt = FMT_L; }); [5, 6, 7, 8, 9].forEach(c => { row.getCell(c).numFmt = "0.0;;\"-\""; row.getCell(c).alignment = { horizontal: "center", vertical: "middle" }; });
      row.getCell(10).font = ft({ bold: true }); row.getCell(10).fill = fill(TINTE_X);
      if (l.baja) { for (let c = 1; c <= UH; c++) row.getCell(c).fill = fill("FFFFF1CC"); row.getCell(2).font = ft({ bold: true, color: { argb: "FF925E00" } }); }
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
    pat: { t: "Seguridad social (informativo)", head: "FFDCE8F8", cell: "FFF5F8FD", alt: "FFEBF1FA", tinta: "FF1F4F8C" },
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
    { k: "nspL", h: `No se presentó (${MONEDA})`, w: 12, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.descuentoNSP) },
    { k: "tardeL", h: `Llegadas tarde (${MONEDA})`, w: 12, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.descuentoHoras) },
    { k: "incL", h: `Incapacidad (${MONEDA})`, w: 12, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.descuentoIncap) },
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
    estadoTxt(cierre && !sv ? " · las horas extras van en su propia planilla" : ""),
  ]);
  tile(ws, C.coop.L, C.od.L, "Colaboradores", linesHoja.length);
  tile(ws, C.tded.L, C.neto.L, cierre ? "Total a pagar" : "Total honorarios", netoDe(linesHoja), { naranja: true, fmt: FMT_L });
  // Fila 5: bandas por sección · fila 6: encabezados en el pastel de su sección.
  const blancoFino = { style: "thin", color: { argb: BLANCO } };
  Object.entries(SEC).forEach(([k, s]) => {
    const cs = COLS.filter(c => c.sec === k);
    if (!cs.length) return;
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
        const bg = l.baja ? (c.k === "neto" ? "FFFBE3CF" : "FFFFF1CC") : c.k === "neto" ? (i % 2 ? "FFFBE3CF" : TINTE_X) : (i % 2 ? s.alt : s.cell);
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
        if (l.baja && c.k === "nombre") { cell.value = `${l.name}  ·  BAJA ${fechaCorta(l.baja)}`; cell.font = ft({ bold: true, color: { argb: "FF925E00" } }); }
        if (l.baja && c.k === "n") cell.border = { bottom: hair, left: { style: "thick", color: { argb: "FFE0A800" } } };
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
  const sv = lines.some(l => l.pais === "sv");
  // El Salvador (13-nov-2026): las columnas de la planilla de la Lic. Diana.
  const colsSV = [
    "n", "nombre",
    { k: "dni", h: "DUI", w: 13, sec: "col", v: (l) => l.dni || "" },
    "cargo",
    { k: "afpN", h: "AFP", w: 10, sec: "col", v: (l) => l.afpNombre || "" },
    { k: "isssN", h: "No. ISSS", w: 12, sec: "col", v: (l) => l.isssNum || "" },
    { k: "nup", h: "No. AFP (NUP)", w: 15, sec: "col", v: (l) => l.nup || "" },
    "sb", "sd",
    "dias", "nsp", "vac",
    { k: "heD", h: "Horas extras diurnas", w: 10, sec: "asis", fmt: "h", v: (l) => n0(l.heSV?.diurnas) },
    { k: "heN", h: "Horas extras nocturnas", w: 10, sec: "asis", fmt: "h", v: (l) => n0(l.heSV?.nocturnas) },
    { ...porK.ord, h: "Salario" },
    { k: "heL", h: "Monto horas", w: 12, sec: "ing", fmt: "L", ingreso: true, v: (l) => n0(l.heSV?.monto) },
    { k: "vacL", h: "Vacación", w: 12, sec: "ing", fmt: "L", ingreso: true, v: (l) => n0(l.vacacion) },
    "bq", "ferL", "oi", { ...porK.ting, h: "Total devengado" },
    { k: "cot", h: "Salario cotizable", w: 14, sec: "pat", fmt: "L", v: (l) => n0(l.cotizable) },
    { k: "pafp", h: "AFP patronal (8.75 %)", w: 13, sec: "pat", fmt: "L", v: (l) => n0(l.patronal?.afp) },
    { k: "pisss", h: "ISSS patronal (7.5 %)", w: 13, sec: "pat", fmt: "L", v: (l) => n0(l.patronal?.isss) },
    { k: "suj", h: "Monto sujeto a ISR", w: 14, sec: "pat", fmt: "L", v: (l) => n0(totalesLinea(l).sv?.sujetoX ?? l.sujetoIsr) },
    "nspL", "tardeL",
    { k: "isssL", h: "ISSS (3 %)", w: 11, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.isss) },
    { k: "afpL", h: "AFP (7.25 %)", w: 11, sec: "ded", fmt: "L", deduccion: true, v: (l) => n0(l.afp) },
    { ...porK.isr, ley: false, v: (l) => n0(totalesLinea(l).sv?.isrX ?? l.isr) },
    "coop", "od", { ...porK.tded, h: "Total descuentos" },
    { ...porK.neto, h: "Líquido a pagar" }, "metodo", "nota",
  ].map(x => typeof x === "string" ? porK[x] : x);
  const colsSal = sv ? colsSV : COLS;
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
  armarHoja("Planilla", "Planilla de sueldos y salarios", colsSal, grupos.filter(g => !g.hon), { cierre: true, ocultarLey: !ley && !sv });
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
