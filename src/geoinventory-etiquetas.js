// ═══════════════════════════════════════════════════════════════════════════
// GeoInventory — etiquetas QR imprimibles (13-oct-2026)
// ═══════════════════════════════════════════════════════════════════════════
// PDF tamaño carta, 3 columnas × 8 filas de etiquetas de 2.5 × 1.25 pulgadas
// (calza con hojas adhesivas tipo Avery 5160/8160 y también se recorta a
// mano). Cada etiqueta: QR (enlace a la ficha) · código · nombre corto ·
// ubicación. El QR se genera LOCAL con `qrcode` (sin servicios externos).
import { safeDynamicImport } from "./lazyLoad.js";

export const urlDeFicha = (codigo) => `${window.location.origin}${import.meta.env.BASE_URL}#inv=${encodeURIComponent(codigo)}`;

export const qrDataUrl = async (texto, size = 240) => {
  const QRCode = await safeDynamicImport(() => import("qrcode"), "generador de QR");
  return (QRCode.default || QRCode).toDataURL(texto, { margin: 0, width: size, errorCorrectionLevel: "M", color: { dark: "#2C2A28", light: "#FFFFFF" } });
};

/**
 * items: [{codigo, nombre, ubicacionNombre?}] — genera y descarga el PDF.
 * Devuelve el nombre del archivo.
 */
export const generarEtiquetasPDF = async (items, { titulo = "etiquetas" } = {}) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter" });
  const COLS = 3, ROWS = 8, W = 2.5, H = 1.25, X0 = 0.25, Y0 = 0.5, GX = 0.125, GY = 0;
  const qrs = await Promise.all(items.map(it => qrDataUrl(urlDeFicha(it.codigo), 200)));
  items.forEach((it, i) => {
    const k = i % (COLS * ROWS);
    if (i > 0 && k === 0) doc.addPage();
    const col = k % COLS, row = Math.floor(k / COLS);
    const x = X0 + col * (W + GX), y = Y0 + row * (H + GY);
    doc.setDrawColor(225, 222, 217); doc.setLineWidth(0.005);
    doc.roundedRect(x + 0.03, y + 0.03, W - 0.06, H - 0.06, 0.08, 0.08);
    const q = 1.0;
    doc.addImage(qrs[i], "PNG", x + 0.12, y + (H - q) / 2, q, q);
    const tx = x + 0.12 + q + 0.12, tw = W - q - 0.36;
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(44, 42, 40);
    doc.text(String(it.codigo || ""), tx, y + 0.34);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(60, 58, 55);
    const lineas = doc.splitTextToSize(String(it.nombre || ""), tw).slice(0, 2);
    doc.text(lineas, tx, y + 0.52);
    if (it.ubicacionNombre) { doc.setFontSize(6.5); doc.setTextColor(110, 105, 100); doc.text(doc.splitTextToSize(String(it.ubicacionNombre), tw)[0] || "", tx, y + 0.95); }
    doc.setFontSize(5.5); doc.setTextColor(232, 118, 45); doc.text("GRUPO GEOTECNICA", tx, y + H - 0.12);
  });
  const nombre = `ETIQUETAS-${String(titulo).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40)}.pdf`;
  doc.save(nombre);
  return nombre;
};
