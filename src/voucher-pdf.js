// ═══════════════════════════════════════════════════════════════════════════
// GeoTeam — VOUCHERS / comprobantes de pago (9-nov-2026, pedido de Gerson).
// Uno por colaborador y por página (carta vertical), con el estilo único de
// reportes de GeoCore (reporte-estilo.js): blanco, carbón, UN naranja,
// grises. Los conceptos salen de conceptosVoucher (planilla-calc.js, PURA y
// probada) así el comprobante cuadra al centavo con la planilla. El de
// Gerson Trochez NUNCA se genera (lineasVoucher lo saca).
// ═══════════════════════════════════════════════════════════════════════════
import { MONEDA, DOC_ID } from "./operacion.js";
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA, pdfPie, pdfKpi, cargarImagen, LOGO_EMPRESA, latin1 } from "./reporte-estilo.js";
import { conceptosVoucher, lineasVoucher, modalidadDe, mesLargo, rangoQuincena, etiquetaCorta } from "./planilla-calc.js";
import { EMPRESAS } from "./rrhh-solicitudes.js";

const T = PDF_TEMA;
const nf = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const Ls = (n) => `${Number(n) < 0 ? "-" : ""}${MONEDA} ${nf(Math.abs(Number(n) || 0))}`;
const METODO = { transferencia: "Transferencia", cheque: "Cheque", ach: "ACH" };
const slug = (s) => latin1(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "");
const iniciales = (n) => String(n || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
const capital = (s) => String(s || "").replace(/^\w/, c => c.toUpperCase());

const paginaVoucher = async (doc, l, { empresa, periodo, quincena, borrador }) => {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const M = 18, CW = W - 2 * M;
  const emp = EMPRESAS[empresa] || EMPRESAS.geotecnica;
  const v = conceptosVoucher(l);

  // ── Cabecera: logo de la empresa · etiqueta a la derecha ──
  const logo = await cargarImagen(LOGO_EMPRESA[empresa] || LOGO_EMPRESA.geotecnica);
  if (logo) { const h = empresa === "subterra" ? 17 : 10, w = Math.min(48, h * logo.w / logo.h); doc.addImage(logo.dataUrl, "PNG", M, 13, w, h); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...T.texto3);
  doc.text("COMPROBANTE DE PAGO", W - M, 17, { align: "right", charSpace: 0.5 });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...T.texto2);
  doc.text(latin1(etiquetaCorta(periodo, quincena).toUpperCase()), W - M, 22, { align: "right" });

  let y = 44;
  doc.setFont("helvetica", "bold"); doc.setFontSize(21); doc.setTextColor(...T.carbon);
  doc.text("Comprobante de pago", M, y);
  if (borrador) {
    const tw = doc.getTextWidth("Comprobante de pago");
    doc.setFillColor(...T.tinte); doc.roundedRect(M + tw + 4, y - 5.2, 22, 6.4, 3.2, 3.2, "F");
    doc.setFontSize(7); doc.setTextColor(...T.naranjaTexto); doc.text("BORRADOR", M + tw + 15, y - 0.9, { align: "center", charSpace: 0.3 });
  }
  y += 6.5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...T.texto2);
  doc.text(latin1(`${emp.legal}  ·  Planilla ${quincena} ${mesLargo(periodo)}  ·  ${rangoQuincena(periodo, quincena)}`), M, y);
  y += 5;
  doc.setFillColor(...T.naranja); doc.roundedRect(M, y, 12, 0.9, 0.45, 0.45, "F");
  y += 8;

  // ── Tarjeta del colaborador ──
  const hCard = 36;
  doc.setFillColor(...T.fondo); doc.roundedRect(M, y, CW, hCard, 4, 4, "F");
  doc.setFillColor(255, 255, 255); doc.circle(M + 12, y + 11, 6.5, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...T.texto2);
  doc.text(latin1(iniciales(l.name)), M + 12, y + 12.4, { align: "center" });
  doc.setFontSize(13.5); doc.setTextColor(...T.carbon);
  doc.text(latin1(String(l.name || "").toUpperCase()), M + 22, y + 10);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...T.texto2);
  doc.text(latin1(l.pos || "Sin cargo"), M + 22, y + 15.2);
  const campos = [[DOC_ID, l.dni || "—"], ["Modalidad", modalidadDe(l)], [l.ct === "honorarios" ? "Honorarios mensuales" : "Salario mensual", Ls(l.sb)], ["Salario diario", Ls(l.sd)]];
  const cw = (CW - 16) / 4;
  campos.forEach(([lab, val], i) => {
    const x = M + 8 + i * cw;
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...T.texto3);
    doc.text(latin1(lab.toUpperCase()), x, y + 25, { charSpace: 0.3 });
    doc.setFontSize(10.5); doc.setTextColor(...T.carbon);
    doc.text(latin1(val), x, y + 30.5);
  });
  y += hCard + 6;

  // ── Cifras ──
  const kw = (CW - 9) / 4, kh = 17;
  pdfKpi(doc, M, y, kw, kh, "Días pagados", `${v.diasPagados} de ${v.diasPeriodo || v.diasPagados}`);
  pdfKpi(doc, M + (kw + 3), y, kw, kh, "Ingresos", Ls(v.totalIngresos));
  pdfKpi(doc, M + 2 * (kw + 3), y, kw, kh, "Deducciones", Ls(v.totalDeducciones));
  pdfKpi(doc, M + 3 * (kw + 3), y, kw, kh, "Salario a pagar", Ls(v.neto), { tono: "naranjaTexto" });
  y += kh + 9;

  // ── Tablas de conceptos: Ingresos y Deducciones lado a lado, HE abajo ──
  const tabla = (x0, w, y0, titulo, filas, totalLabel, total, { conHoras = false, vacio = "" } = {}) => {
    let yy = y0;
    const xr = x0 + w;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...T.carbon);
    doc.text(latin1(titulo), x0, yy, { maxWidth: w - 30 });
    doc.setFontSize(6.5); doc.setTextColor(...T.texto3);
    if (conHoras) doc.text("HORAS", xr - 42, yy, { align: "right", charSpace: 0.3 });
    doc.text("MONTO", xr, yy, { align: "right", charSpace: 0.3 });
    yy += 3;
    doc.setDrawColor(...T.lineaFuerte); doc.setLineWidth(0.3); doc.line(x0, yy, xr, yy);
    const rows = filas.length ? filas : [{ concepto: vacio, monto: 0, vacio: true }];
    rows.forEach(r => {
      yy += 5.8;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.2); doc.setTextColor(...(r.vacio ? T.texto3 : T.texto2));
      const ancho = w - (conHoras ? 62 : 30);
      const txt = doc.splitTextToSize(latin1(r.concepto), ancho)[0];
      doc.text(txt, x0, yy);
      if (conHoras) { doc.setTextColor(...T.texto2); doc.text(String(r.hrs), xr - 42, yy, { align: "right" }); }
      doc.setTextColor(...(r.vacio ? T.texto3 : T.carbon));
      doc.text(Ls(r.monto), xr, yy, { align: "right" });
      yy += 2.4;
      doc.setDrawColor(...T.linea); doc.setLineWidth(0.15); doc.line(x0, yy, xr, yy);
    });
    yy += 6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.6); doc.setTextColor(...T.carbon);
    doc.text(latin1(totalLabel), x0, yy);
    doc.text(Ls(total), xr, yy, { align: "right" });
    return yy;
  };
  const colW = (CW - 10) / 2;
  const yI = tabla(M, colW, y, "Ingresos", v.ingresos, "Total ingresos", v.totalIngresos);
  const yD = tabla(M + colW + 10, colW, y, "Deducciones", v.deducciones, "Total deducciones", v.totalDeducciones, { vacio: "Sin deducciones en esta quincena" });
  y = Math.max(yI, yD) + 11;
  // El Salvador: la bonificación va en su planilla aparte (servicios profesionales eventuales).
  if (v.eventual) y = tabla(M, CW, y, "Servicios profesionales eventuales · planilla aparte", [{ concepto: "Bonificación de la quincena", monto: v.eventual.monto }, { concepto: "(-) Retención ISR 10 %", monto: -v.eventual.isr }], "Líquido a pagar", v.eventual.liquido) + 11;
  if (v.he.length) y = tabla(M, CW, y, `Horas extras · trabajadas en ${etiquetaCorta(l.he.periodo, l.he.quincena)} · hora base ${Ls(l.he.horaBase)}`, v.he, "Total horas extras", v.heMonto, { conHoras: true }) + 11;

  // ── Totales a pagar: SALARIO y HORAS EXTRAS por separado (Gerson, 9-nov:
  // "se pagan en dos transacciones distintas") ──
  const metodo = METODO[l.metodoPago] || "Transferencia";
  const hTot = 22, conHe = v.he.length > 0 || !!v.eventual;
  const cajaTotal = (x, w, titulo, sub, monto, destacada) => {
    doc.setFillColor(...(destacada ? T.tinte : T.fondo)); doc.roundedRect(x, y - 4, w, hTot, 4, 4, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); doc.setTextColor(...(destacada ? T.naranjaTexto : T.texto3));
    doc.text(latin1(titulo), x + 7, y + 3.5, { charSpace: 0.4 });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.setTextColor(...T.texto2);
    doc.text(latin1(sub), x + 7, y + 10.5, { maxWidth: w - 60 });
    doc.setFont("helvetica", "bold"); doc.setFontSize(conHe ? 16 : 20); doc.setTextColor(...(destacada ? T.naranjaTexto : T.carbon));
    doc.text(Ls(monto), x + w - 7, y + 10.5, { align: "right" });
  };
  if (conHe) {
    const w2 = (CW - 6) / 2;
    cajaTotal(M, w2, "TOTAL A PAGAR · SALARIO", `Transacción 1 · ${metodo}`, v.neto, true);
    if (v.eventual) cajaTotal(M + w2 + 6, w2, "TOTAL A PAGAR · SERVICIOS EVENTUALES", `Transacción 2 · ${metodo}`, v.eventual.liquido, true);
    else cajaTotal(M + w2 + 6, w2, "TOTAL A PAGAR · HORAS EXTRAS", `Transacción 2 · ${metodo}`, v.heMonto, true);
  } else {
    cajaTotal(M, CW, "TOTAL A PAGAR · SALARIO", `Salario de la quincena · ${metodo}`, v.neto, true);
  }

  // ── Firmas (al pie de la hoja) ──
  const yF = Math.min(Math.max(y + hTot + 20, H - 44), H - 26);
  const fw = 70;
  [[M + 6, "Recursos Humanos", emp.legal], [W - M - 6 - fw, "Recibí conforme", `${l.name || ""}${l.dni ? `  ·  DNI ${l.dni}` : ""}`]].forEach(([x, a, b]) => {
    doc.setDrawColor(...T.lineaFuerte); doc.setLineWidth(0.3); doc.line(x, yF, x + fw, yF);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...T.carbon);
    doc.text(latin1(a), x + fw / 2, yF + 5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); doc.setTextColor(...T.texto2);
    doc.text(latin1(b), x + fw / 2, yF + 9.5, { align: "center", maxWidth: fw + 10 });
  });
};

/**
 * Genera y descarga los comprobantes. lines = las líneas de la planilla
 * (todas o una); empresa = "subterra" | "geotecnica". Devuelve cuántos salieron.
 */
export const descargarVouchers = async ({ empresa, periodo, quincena, lines, borrador = false }) => {
  const filas = lineasVoucher(lines);
  if (!filas.length) return 0;
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
  for (let i = 0; i < filas.length; i++) {
    if (i) doc.addPage();
    await paginaVoucher(doc, filas[i], { empresa, periodo, quincena, borrador });
  }
  pdfPie(doc, { margen: 18 });
  const emp = (EMPRESAS[empresa] || EMPRESAS.geotecnica).nombre;
  const nombre = filas.length === 1
    ? `Voucher_${slug(filas[0].name)}_${quincena}_${periodo}.pdf`
    : `Vouchers_${slug(emp)}_${quincena}_${periodo}.pdf`;
  doc.save(nombre);
  return filas.length;
};
