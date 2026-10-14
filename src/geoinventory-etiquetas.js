// ═══════════════════════════════════════════════════════════════════════════
// GeoInventory — etiquetas QR imprimibles (13/14-oct-2026)
// ═══════════════════════════════════════════════════════════════════════════
// · CHICAS: carta, 3 columnas × 8 filas de 2.5 × 1.25" (Avery 5160/8160):
//   QR (enlace a la ficha) · código · nombre corto · ubicación. Para artículos,
//   cajas y NIVELES de un estante.
// · GRANDES: carta, 2 × 2 de 4.25 × 5.5": para pegar afuera de una oficina, en
//   la entrada de una bodega o en un estante/rack.
// Un solo PDF puede llevar las dos (primero las grandes, después las chicas):
// dos descargas seguidas las bloquea el navegador. El QR se genera LOCAL con
// `qrcode` (sin servicios externos).
import { safeDynamicImport } from "./lazyLoad.js";

export const urlDeFicha = (codigo) => `${window.location.origin}${import.meta.env.BASE_URL}#inv=${encodeURIComponent(codigo)}`;

export const qrDataUrl = async (texto, size = 240) => {
  const QRCode = await safeDynamicImport(() => import("qrcode"), "generador de QR");
  return (QRCode.default || QRCode).toDataURL(texto, { margin: 0, width: size, errorCorrectionLevel: "M", color: { dark: "#2C2A28", light: "#FFFFFF" } });
};

const dibujarChicas = (doc, items, qrs, { nuevaHoja = false } = {}) => {
  const COLS = 3, ROWS = 8, W = 2.5, H = 1.25, X0 = 0.25, Y0 = 0.5, GX = 0.125;
  items.forEach((it, i) => {
    const k = i % (COLS * ROWS);
    if ((i > 0 && k === 0) || (i === 0 && nuevaHoja)) doc.addPage();
    const col = k % COLS, row = Math.floor(k / COLS);
    const x = X0 + col * (W + GX), y = Y0 + row * H;
    doc.setDrawColor(225, 222, 217); doc.setLineWidth(0.005);
    doc.roundedRect(x + 0.03, y + 0.03, W - 0.06, H - 0.06, 0.08, 0.08);
    const q = 1.0;
    doc.addImage(qrs[i], "PNG", x + 0.12, y + (H - q) / 2, q, q);
    const tx = x + 0.12 + q + 0.12, tw = W - q - 0.36;
    doc.setFont("helvetica", "bold"); doc.setFontSize(String(it.codigo || "").length > 9 ? 10.5 : 12); doc.setTextColor(44, 42, 40);
    doc.text(String(it.codigo || ""), tx, y + 0.34);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(60, 58, 55);
    doc.text(doc.splitTextToSize(String(it.nombre || ""), tw).slice(0, 2), tx, y + 0.52);
    if (it.ubicacionNombre) { doc.setFontSize(6.5); doc.setTextColor(110, 105, 100); doc.text(doc.splitTextToSize(String(it.ubicacionNombre), tw)[0] || "", tx, y + 0.95); }
    doc.setFontSize(5.5); doc.setTextColor(232, 118, 45); doc.text("GRUPO GEOTECNICA", tx, y + H - 0.12);
  });
};
const dibujarGrandes = (doc, lista, qrs) => {
  const W = 4.25, H = 5.5;
  lista.forEach((it, i) => {
    const k = i % 4;
    if (i > 0 && k === 0) doc.addPage();
    const x = (k % 2) * W, y = Math.floor(k / 2) * H;
    doc.setDrawColor(220, 216, 210); doc.setLineWidth(0.005); doc.setLineDashPattern([0.05, 0.05], 0);
    doc.rect(x + 0.1, y + 0.1, W - 0.2, H - 0.2);
    doc.setLineDashPattern([], 0);
    doc.setFillColor(232, 118, 45); doc.rect(x + 0.1, y + 0.1, W - 0.2, 0.42, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    doc.text("GRUPO GEOTECNICA · GEOINVENTORY", x + W / 2, y + 0.37, { align: "center" });
    doc.setTextColor(44, 42, 40); doc.setFontSize(20);
    const lt = doc.splitTextToSize(String(it.titulo || ""), W - 0.6).slice(0, 2);
    doc.text(lt, x + W / 2, y + 0.95, { align: "center" });
    const yy = y + 0.95 + lt.length * 0.3;
    if (it.subtitulo) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(110, 105, 100); doc.text(doc.splitTextToSize(String(it.subtitulo), W - 0.6).slice(0, 2), x + W / 2, yy + 0.05, { align: "center" }); }
    const q = 2.6;
    doc.addImage(qrs[i], "PNG", x + (W - q) / 2, y + 1.75, q, q);
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(44, 42, 40);
    doc.text(String(it.codigo || ""), x + W / 2, y + 4.72, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(110, 105, 100);
    doc.text(String(it.pie || "Escanealo con la cámara: abre lo que hay aquí"), x + W / 2, y + 5.0, { align: "center" });
  });
};
const nombreArchivo = (pref, titulo) => `${pref}-${String(titulo).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 40)}.pdf`;

/**
 * Un PDF con etiquetas grandes y/o chicas.
 * grandes: [{codigo, titulo, subtitulo?, pie?}] · chicas: [{codigo, nombre, ubicacionNombre?}]
 */
export const generarEtiquetas = async ({ grandes = [], chicas = [] }, { titulo = "etiquetas" } = {}) => {
  if (!grandes.length && !chicas.length) return null;
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = new jsPDF({ unit: "in", format: "letter" });
  const [qG, qC] = await Promise.all([Promise.all(grandes.map(it => qrDataUrl(urlDeFicha(it.codigo), 420))), Promise.all(chicas.map(it => qrDataUrl(urlDeFicha(it.codigo), 200)))]);
  if (grandes.length) dibujarGrandes(doc, grandes, qG);
  if (chicas.length) dibujarChicas(doc, chicas, qC, { nuevaHoja: grandes.length > 0 });
  const nombre = nombreArchivo(grandes.length && !chicas.length ? "QR" : "ETIQUETAS", titulo);
  doc.save(nombre);
  return nombre;
};
/** Compatibilidad: solo chicas. */
export const generarEtiquetasPDF = (items, opts) => generarEtiquetas({ chicas: items }, opts);
export const generarEtiquetasGrandesPDF = (lista, opts) => generarEtiquetas({ grandes: lista }, opts);
