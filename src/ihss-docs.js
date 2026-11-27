// SEGURO SOCIAL (IHSS) — los archivos: leer la planilla (pdf.js), devolverla
// con las bajas resaltadas (pdf-lib) y armar el Word de altas desde la
// plantilla public/plantillas/altas-ihss.docx (JSZip). Las librerías se pasan
// por parámetro para que el mismo código corra en el navegador y en Node.
import { parsearPlanillaIHSS, filaAltaIHSS, textoPeriodo, PATRONOS_IHSS } from "./ihss-calc.js";

/** Textos con posición de todas las páginas → planilla parseada. */
export const leerPlanillaIHSS = async (bytes, pdfjs) => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const items = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    tc.items.forEach(i => { if (String(i.str || "").trim()) items.push({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]), pagina: n }); });
  }
  return parsearPlanillaIHSS(items);
};

/**
 * Devuelve el PDF con cada baja marcada como lo hace Gerson: el nombre
 * encerrado (borde rojo, relleno amarillo) y "BAJA 1 DE OCTUBRE DE 2026" en
 * rojo en la columna "Fecha y razón de cambio".
 * marcas: [{pagina, y, alto, xNombre, anchoNombre, texto}] · columnas: {pagina: {x0, x1, xFinNombre}}
 */
export const marcarPlanillaIHSS = async (bytes, { marcas, columnas }, PDFLib) => {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const rojo = rgb(0.90, 0.16, 0.12), amarillo = rgb(1, 0.92, 0.2);
  marcas.forEach(m => {
    const pg = pdf.getPage(m.pagina - 1), col = columnas[m.pagina] || {};
    const alto = Math.max(7.5, (m.alto || 6) + 3), yy = m.y - (alto - (m.alto || 6)) / 2 - 0.6;
    const x = m.xNombre - 2.5, w = Math.min((col.xFinNombre || m.xNombre + 200) - m.xNombre, m.anchoNombre + 14) + 2;
    // Píldora: rectángulo + medias lunas en las puntas.
    const r = alto / 2;
    const ruta = `M ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w - r} ${alto} L ${r} ${alto} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    pg.drawSvgPath(ruta, { x, y: yy + alto, color: amarillo, opacity: 0.45, borderColor: rojo, borderWidth: 0.9, borderOpacity: 1 });
    const x0 = col.x0 ?? m.xNombre + 400, x1 = col.x1 ?? x0 + 180;
    let size = 7.2; const txt = String(m.texto || "").toUpperCase();
    while (size > 4.5 && font.widthOfTextAtSize(txt, size) > x1 - x0 - 4) size -= 0.3;
    pg.drawText(txt, { x: x0 + Math.max(2, (x1 - x0 - font.widthOfTextAtSize(txt, size)) / 2), y: m.y + 0.3, size, font, color: rojo });
  });
  return pdf.save();
};

// ── Word de altas ──
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const RUN = (t) => `<w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
/** Pone un solo texto en la celda (conserva el formato del párrafo). */
const celdaCon = (tc, texto) => tc.replace(/(<w:p(?: [^>]*)?>)(<w:pPr>.*?<\/w:pPr>)?(?:(?!<\/w:p>).)*<\/w:p>/s, (_m, abre, ppr) => `${abre}${ppr || ""}${texto ? RUN(texto) : ""}</w:p>`);
const filaCon = (tr, celdas) => { let i = 0; return tr.replace(/<w:tc>.*?<\/w:tc>/gs, (tc) => { const t = celdas[i++]; return t === undefined ? tc : celdaCon(tc, t); }); };

// Una imagen en línea (JPEG) de `ancho` pulgadas.
const EMU = 914400;
const imagenXml = (rid, n, w, h, ancho) => { const cx = Math.round(ancho * EMU), cy = Math.round(cx * h / w);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${9000 + n}" name="Identidad ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${9000 + n}" name="identidad${n}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`; };

/**
 * altas: [{dni, nombre, puesto, salario, fecha}] · mes "2026-11" · empresa subterra|geotecnica
 * identidades (opcional): [{nombre, dni, imagenes: [{bytes (JPEG), w, h}]}] — UNA hoja por persona: nombre e identidad arriba, frente y reverso lado a lado.
 */
export const docxAltasIHSS = async (plantillaBytes, { altas, mes, empresa, identidades = [] }, JSZip) => {
  const zip = await JSZip.loadAsync(plantillaBytes);
  let xml = await zip.file("word/document.xml").async("string");
  const p = PATRONOS_IHSS[empresa] || PATRONOS_IHSS.subterra;
  const pon = (k, v) => { xml = xml.split(`{{${k}}}`).join(esc(v)); };
  pon("MES", textoPeriodo(mes)); pon("RAZON_SOCIAL", p.razonSocial); pon("NOMBRE_PATRONO", p.nombrePatrono); pon("ACTIVIDAD", p.actividad); pon("DIRECCION", p.direccion);
  const t0 = xml.indexOf("<w:tbl>"), t1 = xml.indexOf("</w:tbl>");
  let tabla = xml.slice(t0, t1);
  const filas = tabla.match(/<w:tr[ >].*?<\/w:tr>/gs) || [];
  const cuerpo = filas.slice(1), molde = cuerpo[cuerpo.length - 1];
  const n = Math.max(cuerpo.length, altas.length);
  const nuevas = Array.from({ length: n }, (_, i) => filaCon(cuerpo[i] || molde, [String(i + 1), ...(altas[i] ? filaAltaIHSS(altas[i]) : ["", "", "", "", ""])]));
  tabla = tabla.slice(0, tabla.indexOf(filas[1])) + nuevas.join("");
  xml = xml.slice(0, t0) + tabla + xml.slice(t1);
  const conFoto = identidades.filter(p => (p.imagenes || []).length);
  if (conFoto.length) {
    let rels = await zip.file("word/_rels/document.xml.rels").async("string"), n = 0, cuerpo = "";
    conFoto.forEach((p, i) => {
      const salto = `<w:r><w:br w:type="page"/></w:r>`;   // UNA hoja por persona
      cuerpo += `<w:p><w:pPr><w:spacing w:before="0" w:after="360"/><w:jc w:val="center"/></w:pPr>${salto}<w:r><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr><w:t xml:space="preserve">${esc(String(p.nombre || "").toUpperCase())}${p.dni ? "  ·  " + esc(p.dni) : ""}</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr>`;
      p.imagenes.forEach((im, j) => {
        n++; const rid = `rIdIdent${n}`;
        zip.file(`word/media/identidad${n}.jpeg`, im.bytes);
        rels = rels.replace("</Relationships>", `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/identidad${n}.jpeg"/></Relationships>`);
        cuerpo += (j ? `<w:r><w:t xml:space="preserve">    </w:t></w:r>` : "") + imagenXml(rid, n, im.w, im.h, 5.2);
      });
      cuerpo += "</w:p>";
    });
    const fin = xml.lastIndexOf("<w:sectPr");
    xml = xml.slice(0, fin) + cuerpo + xml.slice(fin);
    zip.file("word/_rels/document.xml.rels", rels);
  }
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "uint8array", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", compression: "DEFLATE" });
};
