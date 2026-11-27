// GeoFinance — Liquidación de caja chica (paquete para Contabilidad). jsPDF
// para la portada y las fotos; los PDF adjuntos se unen al final con pdf-lib.
import { safeDynamicImport } from "./lazyLoad.js";
import { PDF_TEMA as T, latin1, pdfCabecera, pdfPie, pdfKpi, pdfElaborado, fmtLps } from "./reporte-estilo.js";
import { TIPOS_CAJA, ESTADOS_CAJA, totalesCaja, gastosVigentes, estadoGasto, textoSemana } from "./geofinance-calc.js";

const fechaC = (ymd) => { if (!ymd) return "—"; const [a, m, d] = String(ymd).slice(0, 10).split("-"); return `${d}/${m}/${a.slice(2)}`; };
const medir = (dataUrl) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = dataUrl; });
const aJpeg = async (dataUrl, max = 1500) => {
  const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = dataUrl; });
  if (!im) return null;
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
};

/** `bajar(ref)` devuelve {dataUrl, type, name} del adjunto. */
export async function pdfLiquidacionCaja({ caja, proyecto, bajar }) {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  const t = totalesCaja(caja), gs = gastosVigentes(caja);
  let y = await pdfCabecera(doc, { titulo: "Liquidación de caja chica", subtitulo: `${caja.folio} · ${TIPOS_CAJA[caja.tipo]?.label || ""} · ${caja.projectCode}`, empresa: "geotecnica", margen: M });

  const col = (W - M * 2) / 3;
  const dato = (lab, val, x, yy) => { doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...T.texto3); doc.text(latin1(lab.toUpperCase()), x, yy); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...T.carbon); doc.text(doc.splitTextToSize(latin1(val || "—"), col - 4)[0], x, yy + 4.6); };
  dato("Solicitó", caja.solicitante?.nombre, M, y); dato("Semana", textoSemana(caja.semana), M + col, y); dato("Estado", ESTADOS_CAJA[caja.estado]?.label, M + col * 2, y);
  y += 11;
  dato("Aprobó", caja.aprobacion ? `${caja.aprobacion.por} · ${fechaC(caja.aprobacion.at)}` : "—", M, y);
  dato("Acreditó", caja.acreditacion ? `${caja.acreditacion.por} · ${fechaC(caja.acreditacion.fecha)}` : "—", M + col, y);
  dato("Liquidó", caja.liquidacion ? `${caja.liquidacion.por} · ${fechaC(caja.liquidacion.at)}` : "—", M + col * 2, y);
  y += 12;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...T.texto2);
  const det = doc.splitTextToSize(latin1(`Para: ${caja.detalle || ""}`), W - M * 2); doc.text(det, M, y); y += det.length * 4.2 + 3;

  const kw = (W - M * 2 - 9) / 4;
  pdfKpi(doc, M, y, kw, 16, "Acreditado", fmtLps(t.acreditado || t.aprobado || t.pedido));
  pdfKpi(doc, M + kw + 3, y, kw, 16, "Gastado", fmtLps(t.gastado), { tono: "naranjaTexto" });
  pdfKpi(doc, M + (kw + 3) * 2, y, kw, 16, t.falta ? "Gastó de más" : "Sobrante", fmtLps(t.falta || t.sobra), { tono: t.falta ? "rojo" : undefined });
  pdfKpi(doc, M + (kw + 3) * 3, y, kw, 16, "Devuelto", fmtLps(caja.liquidacion?.devolucion?.monto || 0), { tono: "verde" });
  y += 22;

  // Tabla de compras
  const esComb = caja.tipo === "combustible";
  const cols = esComb
    ? [["#", 7], ["Fecha", 19], ["Estación", 42], ["Detalle", 40], ["Vehículo", 22], ["Gal.", 14], ["Factura", 20], ["Monto", 24]]
    : [["#", 7], ["Fecha", 19], ["Proveedor", 48], ["Qué se compró", 62], ["Factura", 26], ["Monto", 26]];
  const total = cols.reduce((s, c) => s + c[1], 0), k = (W - M * 2) / total;
  const cab = () => {
    doc.setFillColor(...T.tinte); doc.rect(M, y, W - M * 2, 7, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...T.texto2);
    let x = M; cols.forEach(([n, w], i) => { const fin = i === cols.length - 1; doc.text(latin1(n.toUpperCase()), fin ? x + w * k - 2 : x + 2, y + 4.7, fin ? { align: "right" } : undefined); x += w * k; });
    y += 7;
  };
  cab();
  gs.forEach((g, i) => {
    const celdas = esComb
      ? [String(i + 1), fechaC(g.fecha), g.proveedor, g.descripcion, g.placa || "", g.galones ? String(g.galones) : "", g.numFactura || "", fmtLps(g.monto)]
      : [String(i + 1), fechaC(g.fecha), g.proveedor, g.descripcion, g.numFactura || "", fmtLps(g.monto)];
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    const lineas = celdas.map((c, j) => doc.splitTextToSize(latin1(c || ""), cols[j][1] * k - 3));
    const alto = Math.max(...lineas.map(l => l.length)) * 3.6 + 3.4;
    if (y + alto > H - 22) { doc.addPage(); y = 18; cab(); doc.setFont("helvetica", "normal"); doc.setFontSize(8); }
    if (i % 2) { doc.setFillColor(...T.fondo); doc.rect(M, y, W - M * 2, alto, "F"); }
    doc.setTextColor(...T.carbon);
    let x = M; lineas.forEach((l, j) => { const fin = j === cols.length - 1; doc.text(l, fin ? x + cols[j][1] * k - 2 : x + 2, y + 4.4, fin ? { align: "right" } : undefined); x += cols[j][1] * k; });
    if (estadoGasto(g) !== "validada") { doc.setFontSize(6.5); doc.setTextColor(...T.naranjaTexto); doc.text(latin1(estadoGasto(g) === "observada" ? "observada" : "sin validar"), M + 2, y + alto - 1.2); }
    y += alto;
  });
  if (!gs.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...T.texto3); doc.text("Sin compras registradas.", M + 2, y + 6); y += 10; }
  if (y + 12 > H - 22) { doc.addPage(); y = 18; }
  doc.setFillColor(...T.carbon); doc.roundedRect(M, y + 2, W - M * 2, 9, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(255, 255, 255);
  doc.text(latin1(`Total gastado · ${gs.length} ${gs.length === 1 ? "compra" : "compras"}`), M + 4, y + 8);
  doc.text(latin1(fmtLps(t.gastado)), W - M - 4, y + 8, { align: "right" });
  y += 17;
  if (y + 8 > H - 14) { doc.addPage(); y = 18; }
  pdfElaborado(doc, M, y);

  // Anexos: comprobante de transferencia, devolución y facturas
  const anexos = [
    caja.acreditacion?.comprobante && ["Comprobante de transferencia", caja.acreditacion.comprobante],
    caja.liquidacion?.devolucion?.comprobante && ["Comprobante de devolución del sobrante", caja.liquidacion.devolucion.comprobante],
    ...gs.map((g, i) => g.factura && [`Factura ${i + 1} de ${gs.length} · ${g.proveedor} · ${fmtLps(g.monto)}`, g.factura]),
  ].filter(Boolean);
  const pdfs = [];
  for (const [titulo, ref] of anexos) {
    let f = null;
    try { f = await bajar(ref); } catch { /* sigue */ }
    const tipo = String(f?.type || (String(f?.dataUrl || "").match(/^data:([^;,]+)/) || [])[1] || "");
    if (f?.dataUrl && tipo === "application/pdf") { pdfs.push([titulo, f.dataUrl]); continue; }
    doc.addPage(); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...T.carbon); doc.text(latin1(titulo), M, 16);
    const jpg = f?.dataUrl ? await aJpeg(f.dataUrl) : null, dim = jpg ? await medir(jpg) : null;
    if (!jpg || !dim) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...T.texto3); doc.text("No se pudo cargar el archivo.", M, 26); continue; }
    const mw = W - M * 2, mh = H - 22 - 16, e = Math.min(mw / dim.w, mh / dim.h);
    doc.addImage(jpg, "JPEG", M + (mw - dim.w * e) / 2, 21, dim.w * e, dim.h * e);
  }
  pdfPie(doc, { margen: M });

  const nombre = `Liquidacion_${caja.folio}.pdf`;
  if (!pdfs.length) { doc.save(nombre); return; }
  const { PDFDocument } = await safeDynamicImport(() => import("pdf-lib"), "pdf-lib");
  const final = await PDFDocument.load(doc.output("arraybuffer"));
  for (const [, dataUrl] of pdfs) {
    try {
      const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), ch => ch.charCodeAt(0));
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      (await final.copyPages(src, src.getPageIndices())).forEach(p => final.addPage(p));
    } catch (e) { console.warn("[geofinance] no se pudo unir un PDF adjunto:", e?.message || e); }
  }
  const blob = new Blob([await final.save()], { type: "application/pdf" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
