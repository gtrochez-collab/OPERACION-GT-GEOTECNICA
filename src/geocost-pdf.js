// ═══════════════════════════════════════════════════════════════════════════
// GeoCost — PDFs (9-sep-2026): Ficha de proyecto + Reporte de costos.
// jsPDF se carga bajo demanda con safeDynamicImport (maneja el "stale chunk"
// tras un deploy). Helvetica NO soporta emojis ni nada fuera de Latin-1: TODO
// el texto pasa por latin1() antes de tocar el documento. A4 vertical,
// márgenes 16 mm, salto de página cuando y pasa de 270 mm, pie "Pág. N de M".
// Sin React, sin store: recibe los datos ya calculados (pres, resumen de
// resumenPresupuesto, movs de movimientosDeProyecto) y solo dibuja.
// No importa geocost-calc a propósito: queda autocontenido y testeable en
// Node (construirFichaDoc / construirReporteDoc devuelven el doc sin guardar).
// ═══════════════════════════════════════════════════════════════════════════
import { safeDynamicImport } from "./lazyLoad.js";

// ── Paleta (RGB para jsPDF) ──
const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const NARANJA = rgb("#E8762D"), TINTA = rgb("#C75F1F"), CARBON = rgb("#2C2A28");
const GRIS = rgb("#6E6862"), GRIS_CLARO = rgb("#EFEFED"), TINTE = rgb("#FDEBDD");
const VERDE = rgb("#177243"), NARANJA_TEXTO = rgb("#A94E16");
const AMARILLO_BG = rgb("#FBEFC4"), AMARILLO_TX = rgb("#8A5A00");
const BLANCO = [255, 255, 255], LINEA = rgb("#DDDBD7");
const NARANJA_SUAVE = rgb("#F5B48A"); // disponible negativo sobre fondo carbón

// ── Página ──
const PW = 210, PH = 297, M = 16, CW = PW - 2 * M; // 178 mm útiles
const Y_MAX = 270;                                  // pasado esto → addPage
const Y_PIE = PH - 9;

// Espejo mínimo de geocost-calc (si cambia allá, cambiar acá).
const CATEGORIAS = ["Generales", "Materiales", "Personal", "Equipos", "Servicios subcontratados", "Otros"];
export const num = (x) => {
  if (typeof x === "number") return isFinite(x) ? x : 0;
  const n = parseFloat(String(x ?? "").replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
};
const montoPartida = (p) => { const c = num(p?.cantidad), pu = num(p?.pu); return c > 0 && pu > 0 ? Math.round(c * pu * 100) / 100 : num(p?.monto); };

// ── Texto seguro para Helvetica (WinAnsi/Latin-1) ──
const MAPA_L1 = {
  "—": "-", "–": "-", "‒": "-", "−": "-", "…": "...",
  "‘": "'", "’": "'", "‚": "'", "“": '"', "”": '"', "„": '"',
  "•": "·", "→": "->", "←": "<-", "≥": ">=", "≤": "<=", "≠": "!=",
  "²": "2", "³": "3", "\u00A0": " ", "\u2009": " ", "\u202F": " ",
  "€": "EUR", "✓": "v", "✔": "v", "✗": "x", "™": "TM",
};
export const latin1 = (s) => String(s ?? "")
  .normalize("NFC")
  .replace(/[\u0080-\uFFFF]/g, (ch) => {
    if (ch in MAPA_L1) return MAPA_L1[ch];
    const c = ch.charCodeAt(0);
    return c >= 0x00A0 && c <= 0x00FF ? ch : ""; // acentos/ñ/· se quedan; emojis y demás se van
  })
  .replace(/ {2,}/g, " ")
  .trim();

// ── Formato ──
// en-US da "1,234.56" igual que la convención hondureña, sin depender del ICU
// del navegador para es-HN.
const nf = (n, d = 2) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const conSigno = (pref, n, d) => `${n < 0 ? "-" : ""}${pref} ${nf(Math.abs(n), d)}`;
export const fmtUSD = (n) => conSigno("$", Number(n) || 0, 2);
export const fmtL = (n) => conSigno("L", Number(n) || 0, 2);
const fmtCant = (c) => Number.isInteger(c) ? nf(c, 0) : nf(c, 2);
const fmtPct = (p) => `${Math.round((Number(p) || 0) * 100)} %`;

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "YYYY-MM-DD" → fecha pura (UTC). ISO → local, SALVO medianoche UTC exacta
// (así se guarda paidAt): si se formateara local en Honduras correría al día
// anterior (misma lección que el reporte ejecutivo de GeoShopping).
const parseFecha = (d) => {
  if (!d) return null;
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const dt = new Date(s + "T00:00:00Z"); return isNaN(dt) ? null : { dt, utc: true }; }
  const dt = new Date(s);
  return isNaN(dt) ? null : { dt, utc: /T00:00:00(\.0+)?Z$/.test(s) };
};
const partesFecha = (f) => f.utc
  ? { y: f.dt.getUTCFullYear(), m: f.dt.getUTCMonth(), d: f.dt.getUTCDate() }
  : { y: f.dt.getFullYear(), m: f.dt.getMonth(), d: f.dt.getDate() };
const diaUTC = (d) => { const f = parseFecha(d); if (!f) return null; const p = partesFecha(f); return Date.UTC(p.y, p.m, p.d); };

export const fmtFechaPDF = (d) => { const f = parseFecha(d); if (!f) return "-"; const p = partesFecha(f); return `${p.d} ${MESES_CORTO[p.m]} ${p.y}`; };
const fmtMesAnio = (dt = new Date()) => `${MESES_LARGO[dt.getMonth()]} ${dt.getFullYear()}`;
const fechaLarga = (dt = new Date()) => `${dt.getDate()} de ${MESES_LARGO[dt.getMonth()].toLowerCase()} de ${dt.getFullYear()}`;
const hoyYMD = (dt = new Date()) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

// Días entre inicio y fin (diferencia de calendario: 9-sep → 14-oct = 35).
export const duracionDias = (ini, fin) => {
  const a = diaUTC(ini), b = diaUTC(fin);
  if (a == null || b == null || b < a) return null;
  return Math.round((b - a) / 864e5);
};

// Eje de 5 meses para la barra de tiempo: del mes ANTERIOR al inicio a 3
// después. ini/fin son fracciones 0..1 del eje (fin inclusive del día).
export const ejeMeses = (ini, fin) => {
  const a = diaUTC(ini);
  if (a == null) return null;
  const b = Math.max(diaUTC(fin) ?? a, a);
  const d0 = new Date(a), y0 = d0.getUTCFullYear(), m0 = d0.getUTCMonth() - 1;
  const T0 = Date.UTC(y0, m0, 1), T5 = Date.UTC(y0, m0 + 5, 1);
  const cruzaAnio = new Date(T0).getUTCFullYear() !== new Date(T5 - 1).getUTCFullYear();
  const labels = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(Date.UTC(y0, m0 + i, 1));
    let l = cap(MESES_CORTO[d.getUTCMonth()]);
    if (cruzaAnio && (i === 0 || d.getUTCMonth() === 0)) l += ` ${String(d.getUTCFullYear()).slice(2)}`;
    labels.push(l);
  }
  const frac = (t) => Math.min(1, Math.max(0, (t - T0) / (T5 - T0)));
  return { labels, ini: frac(a), fin: frac(b + 864e5) };
};

// "BG11B" (tipo maquina) → "Piloteadora BG-11-B"; "T50" → "Perforadora T-50";
// compresor → "Compresor X". Si el nombre ya trae el tipo, se respeta.
export const nombreMaquina = (m) => {
  if (!m) return "";
  const raw = String(m.nombre || m.name || "").trim();
  if (!raw) return "";
  if (/piloteadora|perforadora|compresor/i.test(raw)) return raw;
  const nom = /^[A-Za-z]{1,3}\d{1,3}[A-Za-z]?$/.test(raw)
    ? raw.replace(/([A-Za-z])(\d)/g, "$1-$2").replace(/(\d)([A-Za-z])/g, "$1-$2").toUpperCase()
    : raw;
  const up = raw.toUpperCase();
  if (m.tipo === "compresor") return `Compresor ${nom}`;
  if (up.startsWith("BG")) return `Piloteadora ${nom}`;
  if (up.startsWith("T") || up.startsWith("C-")) return `Perforadora ${nom}`;
  return nom;
};

// Máquinas de la ficha: las de maquinaIds (por nombre bonito) + maquinasTexto,
// sin repetir ("Piloteadora BG-11-B" tipeado vs BG11B resuelto es lo mismo).
const maquinasDeFicha = (ficha, machines) => {
  const ids = new Set(ficha?.maquinaIds || []);
  const lista = (machines || []).filter(m => ids.has(m.id)).map(nombreMaquina).filter(Boolean);
  const norm = (s) => latin1(s).toLowerCase().replace(/[\s\-_]/g, "");
  const extra = String(ficha?.maquinasTexto || "").split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    .filter(t => !lista.some(l => norm(l) === norm(t)));
  return [...lista, ...extra];
};

const slug = (s) => latin1(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "") || "proyecto";

// ── Logo (public/brand/logo-color.png); si no carga → texto de marca ──
const cargarLogo = async (hMM) => {
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}brand/logo-color.png`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    const dims = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = dataUrl; });
    return { dataUrl, h: hMM, w: (dims.w / dims.h) * hMM };
  } catch { return null; }
};

// ── Pluma: atajos sobre el doc (todo texto sanitizado) ──
const pluma = (doc) => ({
  doc,
  tc: (c) => doc.setTextColor(...c),
  fc: (c) => doc.setFillColor(...c),
  dc: (c) => doc.setDrawColor(...c),
  lw: (n) => doc.setLineWidth(n),
  f: (n, s = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", s); },
  t: (s, x, y, o) => doc.text(latin1(s), x, y, o),
  ancho: (s) => doc.getTextWidth(latin1(s)),
  lineas: (s, w) => doc.splitTextToSize(latin1(s), w),
});
// Achica la fuente hasta que el texto quepa en w (mínimo min pt).
const encoger = (P, s, w, min = 6) => { let size = P.doc.getFontSize(); while (size > min && P.ancho(s) > w) { size -= 0.5; P.doc.setFontSize(size); } };
// Recorta con "..." para que quepa en w (con la fuente actual).
const recortar = (P, s, w) => { let t = latin1(s); if (P.ancho(t) <= w) return t; while (t.length > 1 && P.ancho(t + "...") > w) t = t.slice(0, -1); return t.replace(/\s+$/, "") + "..."; };
const rr = (P, x, y, w, h, r, style = "F") => { const rad = Math.max(0, Math.min(r, w / 2, h / 2)); P.doc.roundedRect(x, y, Math.max(0.1, w), Math.max(0.1, h), rad, rad, style); };

// Header de cada página: logo a la izquierda, título/sub a la derecha, línea.
const encabezado = (ctx) => {
  const { doc, P, cab } = ctx;
  const y = M;
  if (ctx.logo) { try { doc.addImage(ctx.logo.dataUrl, "PNG", M, y, ctx.logo.w, ctx.logo.h); } catch { ctx.logo = null; } }
  if (!ctx.logo) { P.f(10, "bold"); P.tc(NARANJA); P.t("GEOTECNICA SOLUCIONES", M, y + 7.5); }
  P.f(11, "bold"); P.tc(CARBON); P.t(cab.titulo, PW - M, y + 5, { align: "right" });
  P.f(9); P.tc(GRIS); P.t(cab.sub, PW - M, y + 10, { align: "right" });
  P.dc(LINEA); P.lw(0.3); doc.line(M, y + 15, PW - M, y + 15);
  return y + 23;
};
const nuevaPagina = (ctx) => { ctx.doc.addPage(); ctx.y = encabezado(ctx); };
const asegurar = (ctx, h) => { if (ctx.y + h > Y_MAX) { nuevaPagina(ctx); return true; } return false; };

// Pie en TODAS las páginas: texto a la izquierda + "Pág. N de M".
const pies = (ctx, izq) => {
  const { doc, P } = ctx, n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    P.f(8); P.tc(GRIS);
    P.t(izq, M, Y_PIE);
    P.t(`Pág. ${i} de ${n}`, PW - M, Y_PIE, { align: "right" });
  }
};

// Chip redondeado; devuelve su ancho/alto.
const chip = (ctx, texto, x, y, { fill, color, fs = 8.5, bold = true }) => {
  const { P } = ctx;
  P.f(fs, bold ? "bold" : "normal");
  const w = P.ancho(texto) + 6, h = fs * 0.45 + 3;
  P.fc(fill); rr(P, x, y, w, h, h / 2);
  P.tc(color); P.t(texto, x + 3, y + h / 2 + fs * 0.125);
  return { w, h };
};

// Párrafo con salto de página entre líneas.
const parrafo = (ctx, texto, x, w, { fs = 9.5, color = CARBON, bold = false } = {}) => {
  const { P } = ctx, lh = fs * 0.45;
  P.f(fs, bold ? "bold" : "normal");
  const ls = P.lineas(texto, w);
  ls.forEach(l => { asegurar(ctx, lh); P.f(fs, bold ? "bold" : "normal"); P.tc(color); P.t(l, x, ctx.y + lh * 0.75); ctx.y += lh; });
};

const prepararDoc = async (cab) => {
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const logo = await cargarLogo(12);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const ctx = { doc, P: pluma(doc), logo, cab, y: 0 };
  ctx.y = encabezado(ctx);
  return ctx;
};

// ═══════════════════════════════════════════════════════════════════════════
// FICHA DE PROYECTO
// ═══════════════════════════════════════════════════════════════════════════
const dibujarFicha = (ctx, { pres, proyecto, machines }) => {
  const { doc, P } = ctx;
  const ficha = pres?.ficha || {};
  const nombre = proyecto?.name || pres?.projectCode || "Proyecto";
  const codigo = ficha.codigo || proyecto?.code || "";
  const cliente = ficha.cliente || proyecto?.client || "";

  // Solución (chip naranja tenue)
  if (ficha.solucion) {
    P.f(8); P.tc(GRIS); P.t("Solución", M, ctx.y);
    ctx.y += 2.5;
    const c = chip(ctx, ficha.solucion, M, ctx.y, { fill: TINTE, color: NARANJA_TEXTO, fs: 9 });
    ctx.y += c.h + 7;
  }

  // Título + cliente
  P.f(24, "bold"); P.tc(CARBON);
  const tl = P.lineas(nombre, CW);
  tl.forEach((l, i) => P.t(l, M, ctx.y + 7 + i * 10));
  ctx.y += 7 + tl.length * 10 + 3;
  P.f(8); P.tc(GRIS); P.t("Cliente", M, ctx.y);
  ctx.y += 5.5;
  P.f(12, "bold"); P.tc(CARBON); P.t(cliente || "-", M, ctx.y);
  ctx.y += 11;

  // 4 datos
  const dur = duracionDias(ficha.fechaInicio, ficha.fechaFin);
  const datos = [
    ["Código", codigo || "-"],
    ["Inicio", fmtFechaPDF(ficha.fechaInicio)],
    ["Fin", fmtFechaPDF(ficha.fechaFin)],
    ["Duración", dur == null ? "-" : `${dur} día${dur === 1 ? "" : "s"}`],
  ];
  const cw4 = CW / 4;
  datos.forEach(([l, v], i) => {
    const x = M + i * cw4;
    P.f(8); P.tc(GRIS); P.t(l, x, ctx.y);
    P.f(11, "bold"); P.tc(CARBON); encoger(P, v, cw4 - 4, 8); P.t(v, x, ctx.y + 5.5);
  });
  ctx.y += 15;

  // Barra de tiempo (5 meses)
  const eje = ejeMeses(ficha.fechaInicio, ficha.fechaFin);
  if (eje) {
    const seg = CW / 5;
    P.f(8); P.tc(GRIS);
    eje.labels.forEach((l, i) => P.t(l, M + i * seg + seg / 2, ctx.y, { align: "center" }));
    ctx.y += 3;
    P.fc(GRIS_CLARO); rr(P, M, ctx.y, CW, 5, 2.5);
    // Divisores de mes solo sobre la pista gris: el segmento naranja va encima
    // y queda continuo (con los divisores encima parecían dos tramos).
    P.dc(BLANCO); P.lw(0.5);
    for (let i = 1; i < 5; i++) doc.line(M + i * seg, ctx.y, M + i * seg, ctx.y + 5);
    const x1 = M + eje.ini * CW, x2 = Math.min(M + CW, Math.max(x1 + 3, M + eje.fin * CW));
    P.fc(NARANJA); rr(P, x1, ctx.y, x2 - x1, 5, 2.5);
    ctx.y += 14;
  }

  // Dos columnas: maquinaria (izq, caja tinte) · materiales (der, tabla)
  const LW = 68, GAP = 8, RX = M + LW + GAP, RW = CW - LW - GAP;
  const maqs = maquinasDeFicha(ficha, machines);
  const filasMaq = maqs.length ? maqs : ["Sin maquinaria asignada"];
  P.f(10, "bold");
  const maqLineas = filasMaq.map(t => P.lineas(t, LW - 15));
  const boxH = 14 + maqLineas.reduce((s, ls) => s + ls.length * 4.6 + 2, 0);
  asegurar(ctx, Math.min(boxH, 40) + 8);
  const y0 = ctx.y, pag0 = doc.getNumberOfPages();
  P.fc(TINTE); rr(P, M, y0, LW, boxH, 4);
  P.f(8.5, "bold"); P.tc(NARANJA_TEXTO); P.t("Maquinaria asignada", M + 6, y0 + 7);
  let yi = y0 + 14.5;
  maqLineas.forEach(ls => {
    if (maqs.length) { P.fc(NARANJA); doc.circle(M + 7.6, yi - 1.3, 1.1, "F"); }
    P.f(10, maqs.length ? "bold" : "normal"); P.tc(maqs.length ? CARBON : GRIS);
    ls.forEach((l, j) => P.t(l, M + 11, yi + j * 4.6));
    yi += ls.length * 4.6 + 2;
  });
  const finIzq = y0 + boxH;

  // Materiales recurrentes
  const CANT_R = RX + RW - 24, UNI_X = RX + RW - 21, DESC_W = RW - 40;
  const cabMat = (yTop) => {
    P.f(8.5, "bold"); P.tc(CARBON); P.t("Materiales recurrentes", RX, yTop + 7);
    P.f(7.5); P.tc(GRIS);
    P.t("Descripción", RX, yTop + 13.5);
    P.t("Cantidad", CANT_R, yTop + 13.5, { align: "right" });
    P.t("Unidad", UNI_X, yTop + 13.5);
    P.dc(CARBON); P.lw(0.35); doc.line(RX, yTop + 15.5, RX + RW, yTop + 15.5);
    return yTop + 17.5;
  };
  let yd = cabMat(y0);
  const mats = Array.isArray(ficha.materiales) ? ficha.materiales.filter(m => m && (m.descripcion || m.cantidad)) : [];
  if (!mats.length) { P.f(9); P.tc(GRIS); P.t("Sin materiales registrados", RX, yd + 4); yd += 8; }
  mats.forEach(m => {
    P.f(9);
    const ls = P.lineas(m.descripcion || "-", DESC_W);
    const h = ls.length * 4.2 + 3.2;
    if (yd + h > Y_MAX) { nuevaPagina(ctx); yd = cabMat(ctx.y - 6); }
    P.f(9); P.tc(CARBON); ls.forEach((l, j) => P.t(l, RX, yd + 4 + j * 4.2));
    const c = num(m.cantidad);
    P.f(9.5, "bold"); P.tc(CARBON); P.t(c > 0 ? fmtCant(c) : (m.cantidad ? String(m.cantidad) : "-"), CANT_R, yd + 4, { align: "right" });
    P.f(9); P.tc(GRIS); P.t(recortar(P, m.unidad || "-", 21), UNI_X, yd + 4);
    yd += h;
    P.dc(LINEA); P.lw(0.2); doc.line(RX, yd, RX + RW, yd);
  });
  ctx.y = (doc.getNumberOfPages() === pag0 ? Math.max(finIzq, yd) : yd) + 12;

  // Notas
  if (String(ficha.notas || "").trim()) {
    asegurar(ctx, 18);
    P.f(9, "bold"); P.tc(CARBON); P.t("Notas", M, ctx.y);
    P.dc(NARANJA); P.lw(0.8); doc.line(M, ctx.y + 1.8, M + 12, ctx.y + 1.8);
    ctx.y += 6.5;
    parrafo(ctx, ficha.notas, M, CW, { fs: 9.5, color: CARBON });
  }
};

export const construirFichaDoc = async ({ pres, proyecto, machines, tasa }) => {
  const ctx = await prepararDoc({ titulo: "Ficha de proyecto", sub: `Compras recurrentes · ${fmtMesAnio()}` });
  dibujarFicha(ctx, { pres, proyecto, machines, tasa });
  pies(ctx, `Generado por GeoCost · ${fechaLarga()}`);
  const base = pres?.ficha?.codigo || pres?.projectCode || proyecto?.short || "proyecto";
  return { doc: ctx.doc, nombre: `FICHA-${slug(base)}.pdf` };
};

export const fichaProyectoPDF = async (args) => {
  const { doc, nombre } = await construirFichaDoc(args || {});
  doc.save(nombre);
};

// ═══════════════════════════════════════════════════════════════════════════
// REPORTE DE COSTOS
// ═══════════════════════════════════════════════════════════════════════════
const FUENTES = { compras: "Compras", maquinas: "Máquinas", mo: "Mano de obra", movilizacion: "Movilización" };
const semaforoDe = (pct) => pct > 1 ? "sobregiro" : pct >= 0.8 ? "alerta" : "ok";
const SEMAFORO_PDF = {
  ok:        { label: "En rango",  fill: GRIS_CLARO, color: GRIS },
  alerta:    { label: "80 % +",    fill: TINTE,      color: NARANJA_TEXTO },
  sobregiro: { label: "Sobregiro", fill: TINTA,      color: BLANCO },
};

// Completa lo que falte del resumen (si viene incompleto o sin movimientos,
// la tabla igual sale con presupuesto y ceros).
const numsDe = (o, presupuesto) => {
  const comprometidoUSD = num(o.comprometidoUSD), ejecutadoUSD = num(o.ejecutadoUSD);
  const usadoUSD = o.usadoUSD != null ? num(o.usadoUSD) : comprometidoUSD + ejecutadoUSD;
  const disponibleUSD = o.disponibleUSD != null ? num(o.disponibleUSD) : presupuesto - usadoUSD;
  const pct = o.pct != null ? num(o.pct) : (presupuesto > 0 ? usadoUSD / presupuesto : 0);
  return { comprometidoUSD, ejecutadoUSD, usadoUSD, disponibleUSD, pct, semaforo: o.semaforo || semaforoDe(pct) };
};
const normalizarResumen = (pres, resumen) => {
  const partidas = Array.isArray(pres?.partidas) ? pres.partidas : [];
  const R = resumen && typeof resumen === "object" ? resumen : {};
  let cats = Array.isArray(R.categorias) && R.categorias.length ? R.categorias : null;
  if (!cats) {
    const orden = [...CATEGORIAS, ...partidas.map(p => p.categoria).filter(c => c && !CATEGORIAS.includes(c))];
    cats = orden.map(categoria => ({ categoria, partidas: partidas.filter(p => (p.categoria || "Otros") === categoria) })).filter(c => c.partidas.length);
  }
  const categorias = cats.map(c => {
    const ps = (c.partidas || []).map(p => { const montoUSD = p.montoUSD != null ? num(p.montoUSD) : montoPartida(p); return { ...p, montoUSD, ...numsDe(p, montoUSD) }; });
    const presupuestoUSD = c.presupuestoUSD != null ? num(c.presupuestoUSD) : ps.reduce((s, p) => s + p.montoUSD, 0);
    const base = c.comprometidoUSD != null ? c : { comprometidoUSD: ps.reduce((s, p) => s + p.comprometidoUSD, 0), ejecutadoUSD: ps.reduce((s, p) => s + p.ejecutadoUSD, 0) };
    return { categoria: c.categoria, presupuestoUSD, ...numsDe(base, presupuestoUSD), partidas: ps };
  });
  const presupuestoUSD = R.presupuestoUSD != null ? num(R.presupuestoUSD) : categorias.reduce((s, c) => s + c.presupuestoUSD, 0);
  const sinClasificar = { comprometidoUSD: 0, ejecutadoUSD: 0, usadoUSD: 0, movs: [], ...(R.sinClasificar || {}) };
  sinClasificar.usadoUSD = sinClasificar.usadoUSD || num(sinClasificar.comprometidoUSD) + num(sinClasificar.ejecutadoUSD);
  return { presupuestoUSD, ...numsDe(R, presupuestoUSD), categorias, sinClasificar };
};

const dibujarPortada = (ctx, { pres, proyecto, R, tasa, machines }) => {
  const { doc, P } = ctx;
  const ficha = pres?.ficha || {};
  const nombre = proyecto?.name || pres?.projectCode || "Proyecto";
  const codigo = ficha.codigo || proyecto?.code || "";
  const cliente = ficha.cliente || proyecto?.client || "";

  // Título
  P.f(24, "bold"); P.tc(CARBON);
  const tl = P.lineas(nombre, CW);
  tl.forEach((l, i) => P.t(l, M, ctx.y + 7 + i * 10));
  ctx.y += 7 + tl.length * 10 + 4;
  const sub = [codigo, cliente].filter(Boolean).join("  ·  ");
  if (sub) { P.f(10); P.tc(GRIS); P.t(sub, M, ctx.y); ctx.y += 5.5; }
  P.f(9); P.tc(GRIS);
  P.t(`Generado el ${fechaLarga()}  ·  Tasa: L ${nf(tasa)} / $`, M, ctx.y);
  ctx.y += 5;
  const maqs = maquinasDeFicha(ficha, machines);
  if (maqs.length) { P.t(recortar(P, `Maquinaria: ${maqs.join(", ")}`, CW), M, ctx.y); ctx.y += 5; }
  ctx.y += 5;

  // 4 KPI
  const kw = (CW - 12) / 4, kh = 22;
  [["Presupuesto", R.presupuestoUSD], ["Comprometido", R.comprometidoUSD], ["Ejecutado", R.ejecutadoUSD], ["Disponible", R.disponibleUSD]].forEach(([l, v], i) => {
    const x = M + i * (kw + 4);
    P.fc(GRIS_CLARO); rr(P, x, ctx.y, kw, kh, 3.5);
    P.f(7.5, "bold"); P.tc(GRIS); P.t(l.toUpperCase(), x + 4, ctx.y + 6);
    P.f(13, "bold"); P.tc(l === "Disponible" && v < 0 ? TINTA : l === "Ejecutado" ? VERDE : CARBON);
    const s = fmtUSD(v); encoger(P, s, kw - 8, 8); P.t(s, x + 4, ctx.y + 13.5);
    P.f(8); P.tc(GRIS); P.t(fmtL(v * tasa), x + 4, ctx.y + 18.5);
  });
  ctx.y += kh + 9;

  // Barra grande de % usado
  const bw = CW - 48, bh = 8;
  const pr = R.presupuestoUSD;
  const fe = pr > 0 ? Math.min(1, Math.max(0, R.ejecutadoUSD / pr)) : 0;
  const fu = pr > 0 ? Math.min(1, Math.max(0, R.usadoUSD / pr)) : 0;
  P.fc(GRIS_CLARO); rr(P, M, ctx.y, bw, bh, 4);
  if (fu > 0) { P.fc(NARANJA); rr(P, M, ctx.y, Math.max(bw * fu, 4), bh, 4); }
  if (fe > 0) { P.fc(CARBON); rr(P, M, ctx.y, Math.max(bw * fe, 4), bh, 4); }
  const sem = SEMAFORO_PDF[R.semaforo] || SEMAFORO_PDF.ok;
  P.f(14, "bold"); P.tc(sem === SEMAFORO_PDF.sobregiro ? TINTA : CARBON);
  const pctTxt = fmtPct(R.pct);
  P.t(pctTxt, M + bw + 5, ctx.y + 6.4);
  chip(ctx, sem.label, M + bw + 5 + P.ancho(pctTxt) + 3, ctx.y + 0.7, { fill: sem.fill, color: sem.color, fs: 8 });
  ctx.y += bh + 6;
  let lx = M;
  [[CARBON, "Ejecutado"], [NARANJA, "Comprometido"], [GRIS_CLARO, "Disponible"]].forEach(([c, l]) => {
    P.fc(c); rr(P, lx, ctx.y - 2.4, 3, 3, 0.8);
    P.f(8); P.tc(GRIS); P.t(l, lx + 4.5, ctx.y);
    lx += 4.5 + P.ancho(l) + 7;
  });
  ctx.y += 10;
};

const tablaPartidas = (ctx, R) => {
  const { doc, P } = ctx;
  const DEF = [["Partida", 46, "left"], ["Unidad", 13, "left"], ["Cant.", 13, "right"], ["P.U.", 15, "right"],
    ["Presupuesto", 19, "right"], ["Comprometido", 19, "right"], ["Ejecutado", 19, "right"], ["Disponible", 19, "right"], ["%", 11, "right"]];
  const esc = CW / DEF.reduce((s, c) => s + c[1], 0);
  const cols = []; let x = M;
  DEF.forEach(([t, w, a]) => { cols.push({ t, x, w: w * esc, a }); x += w * esc; });
  const celda = (i, s, yb, { fs = 7.5, bold = false, color = CARBON } = {}) => {
    const c = cols[i];
    P.f(fs, bold ? "bold" : "normal"); P.tc(color); encoger(P, s, c.w - 2.4, 5.5);
    if (c.a === "right") P.t(s, c.x + c.w - 1.2, yb, { align: "right" }); else P.t(s, c.x + 1.2, yb);
  };
  const montos = (o, yb, opts) => {
    celda(4, nf(o.presupuestoUSD), yb, opts);
    celda(5, nf(o.comprometidoUSD), yb, opts);
    celda(6, nf(o.ejecutadoUSD), yb, { ...opts, color: opts.color === BLANCO ? BLANCO : VERDE });
    celda(7, nf(o.disponibleUSD), yb, { ...opts, bold: true, color: o.disponibleUSD < 0 ? (opts.color === BLANCO ? NARANJA_SUAVE : TINTA) : opts.color });
    const sem = o.semaforo || semaforoDe(o.pct);
    celda(8, `${Math.round((o.pct || 0) * 100)}%`, yb, { ...opts, color: opts.color === BLANCO ? BLANCO : sem === "sobregiro" ? TINTA : sem === "alerta" ? NARANJA_TEXTO : GRIS });
  };
  const cabecera = () => {
    cols.forEach((c, i) => celda(i, c.t, ctx.y + 4.8, { fs: 7, bold: true, color: GRIS }));
    P.dc(CARBON); P.lw(0.4); doc.line(M, ctx.y + 7, M + CW, ctx.y + 7);
    ctx.y += 8.5;
  };
  const salto = (h) => { if (ctx.y + h > Y_MAX) { nuevaPagina(ctx); cabecera(); } };

  asegurar(ctx, 40);
  P.f(12, "bold"); P.tc(CARBON); P.t("Presupuesto por partida", M, ctx.y + 4);
  P.f(8); P.tc(GRIS); P.t("Montos en USD", M + CW, ctx.y + 4, { align: "right" });
  ctx.y += 9;
  cabecera();

  R.categorias.forEach(cat => {
    salto(16);
    P.f(9, "bold"); P.tc(CARBON); P.t(cat.categoria, M + 1.2, ctx.y + 5.4);
    ctx.y += 7.5;
    cat.partidas.forEach(p => {
      P.f(7.5);
      const ls = P.lineas(p.nombre || "-", cols[0].w - 2.4).slice(0, 3);
      const h = Math.max(6.6, ls.length * 3.4 + 3.2);
      salto(h);
      const yb = ctx.y + 4.5;
      P.f(7.5); P.tc(CARBON); ls.forEach((l, j) => P.t(l, cols[0].x + 1.2, yb + j * 3.4));
      const c = num(p.cantidad), pu = num(p.pu), calc = c > 0 && pu > 0;
      celda(1, p.unidad || "-", yb, { color: GRIS });
      celda(2, calc ? fmtCant(c) : "-", yb, { color: GRIS });
      celda(3, calc ? nf(pu) : "-", yb, { color: GRIS });
      montos({ ...p, presupuestoUSD: p.montoUSD }, yb, { color: CARBON });
      ctx.y += h;
      P.dc(LINEA); P.lw(0.2); doc.line(M, ctx.y, M + CW, ctx.y);
    });
    const h = 7; salto(h);
    P.fc(GRIS_CLARO); doc.rect(M, ctx.y, CW, h, "F");
    const yb = ctx.y + 4.8;
    celda(0, `Subtotal ${cat.categoria}`, yb, { bold: true });
    montos(cat, yb, { bold: true, color: CARBON });
    ctx.y += h + 1.5;
  });

  // Por clasificar (compras/máquinas sin partida)
  const sc = R.sinClasificar;
  if (sc && (sc.usadoUSD > 0 || (sc.movs || []).length)) {
    const h = 7; salto(h);
    P.fc(AMARILLO_BG); doc.rect(M, ctx.y, CW, h, "F");
    const yb = ctx.y + 4.8;
    celda(0, `Por clasificar${sc.movs?.length ? ` (${sc.movs.length})` : ""}`, yb, { bold: true, color: AMARILLO_TX });
    celda(4, "-", yb, { color: AMARILLO_TX });
    celda(5, nf(sc.comprometidoUSD), yb, { bold: true, color: AMARILLO_TX });
    celda(6, nf(sc.ejecutadoUSD), yb, { bold: true, color: AMARILLO_TX });
    celda(7, "-", yb, { color: AMARILLO_TX });
    celda(8, "-", yb, { color: AMARILLO_TX });
    ctx.y += h + 1.5;
  }

  // TOTAL
  const h = 9; salto(h);
  P.fc(CARBON); rr(P, M, ctx.y, CW, h, 2);
  const yb = ctx.y + 5.9;
  celda(0, "TOTAL", yb, { fs: 8.5, bold: true, color: BLANCO });
  montos(R, yb, { fs: 8, bold: true, color: BLANCO });
  ctx.y += h + 4;
};

const paginaMovimientos = (ctx, { pres, movs, tasa }) => {
  const { doc, P } = ctx;
  const partidas = Array.isArray(pres?.partidas) ? pres.partidas : [];
  const nombrePartida = new Map(partidas.map(p => [p.id, p.nombre]));
  const partidaMO = partidas.find(p => p.modulo === "mo");
  const lista = [...(Array.isArray(movs) ? movs : [])].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));

  nuevaPagina(ctx);
  P.f(12, "bold"); P.tc(CARBON); P.t("Movimientos", M, ctx.y + 4);
  P.f(8); P.tc(GRIS);
  P.t(lista.length ? `${lista.length} movimiento${lista.length === 1 ? "" : "s"} · del más reciente al más antiguo` : "Sin movimientos", M + CW, ctx.y + 4, { align: "right" });
  ctx.y += 9;
  if (!lista.length) return;

  const DEF = [["Fecha", 17, "left"], ["Fuente", 18, "left"], ["Ref", 23, "left"], ["Descripción", 40, "left"],
    ["Partida", 26, "left"], ["Estado", 18, "left"], ["L", 19, "right"], ["$", 17, "right"]];
  const esc = CW / DEF.reduce((s, c) => s + c[1], 0);
  const cols = []; let x = M;
  DEF.forEach(([t, w, a]) => { cols.push({ t, x, w: w * esc, a }); x += w * esc; });
  // ajuste: "corte" recorta con "..." (textos largos); "encoger" achica la
  // fuente (tokens cortos: fecha, fuente, ref, estado). Los NÚMEROS (columnas
  // a la derecha) SIEMPRE se encogen: recortar un monto perdería dígitos.
  const celda = (i, s, yb, { fs = 7, bold = false, color = CARBON, ajuste = "corte" } = {}) => {
    const c = cols[i], wu = c.w - 2.4;
    P.f(fs, bold ? "bold" : "normal"); P.tc(color);
    let txt = latin1(s);
    if (c.a === "right" || ajuste === "encoger") encoger(P, txt, wu, 5);
    else if (ajuste === "corte") txt = recortar(P, txt, wu);
    if (c.a === "right") P.t(txt, c.x + c.w - 1.2, yb, { align: "right" }); else P.t(txt, c.x + 1.2, yb);
  };
  const cabecera = () => {
    cols.forEach((c, i) => celda(i, c.t, ctx.y + 4.8, { fs: 7, bold: true, color: GRIS, ajuste: "encoger" }));
    P.dc(CARBON); P.lw(0.4); doc.line(M, ctx.y + 7, M + CW, ctx.y + 7);
    ctx.y += 8.5;
  };
  const salto = (h) => { if (ctx.y + h > Y_MAX) { nuevaPagina(ctx); cabecera(); } };
  cabecera();

  let totL = 0, totUSD = 0;
  lista.forEach(m => {
    const hnl = num(m.montoHNL), usd = m.montoUSD != null ? num(m.montoUSD) : (tasa > 0 ? hnl / tasa : 0);
    totL += hnl; totUSD += usd;
    P.f(7);
    const desc = String(m.descripcion || "-");
    const ls = P.lineas(desc.length > 60 ? desc.slice(0, 60).trimEnd() + "..." : desc, cols[3].w - 2.4).slice(0, 2);
    const det = String(m.detalle || "").trim();
    const h = 2.8 + ls.length * 3.2 + (det ? 3 : 0) + 1.2;
    salto(h);
    const yb = ctx.y + 4.4;
    celda(0, fmtFechaPDF(m.fecha), yb, { color: GRIS, ajuste: "encoger" });
    celda(1, FUENTES[m.fuente] || m.fuente || "-", yb, { ajuste: "encoger" });
    celda(2, m.ref || "-", yb, { bold: true, ajuste: "encoger" });
    P.f(7); P.tc(CARBON); ls.forEach((l, j) => P.t(l, cols[3].x + 1.2, yb + j * 3.2));
    if (det) { P.f(6.5); P.tc(GRIS); P.t(recortar(P, det, cols[3].w - 2.4), cols[3].x + 1.2, yb + ls.length * 3.2); }
    const nomP = (m.partidaId && nombrePartida.get(m.partidaId)) || (m.fuente === "mo" && partidaMO?.nombre) || null;
    celda(4, nomP || "Por clasificar", yb, { color: nomP ? CARBON : AMARILLO_TX, bold: !nomP });
    const ejecutado = m.estado === "ejecutado";
    celda(5, ejecutado ? (m.enCurso ? "En curso" : "Ejecutado") : "Comprometido", yb, { color: ejecutado ? (m.enCurso ? AMARILLO_TX : VERDE) : GRIS, ajuste: "encoger" });
    celda(6, nf(hnl), yb);
    celda(7, nf(usd), yb, { bold: true });
    ctx.y += h;
    P.dc(LINEA); P.lw(0.2); doc.line(M, ctx.y, M + CW, ctx.y);
  });

  const h = 8; salto(h);
  P.fc(GRIS_CLARO); doc.rect(M, ctx.y, CW, h, "F");
  const yb = ctx.y + 5.3;
  celda(0, `Total · ${lista.length} movimiento${lista.length === 1 ? "" : "s"}`, yb, { fs: 7.5, bold: true, ajuste: "no" });
  celda(6, nf(totL), yb, { fs: 7.5, bold: true });
  celda(7, nf(totUSD), yb, { fs: 7.5, bold: true });
  ctx.y += h + 2;
};

export const construirReporteDoc = async ({ pres, proyecto, resumen, movs, tasa, userName, machines }) => {
  const T = num(tasa) > 0 ? num(tasa) : 27;
  const R = normalizarResumen(pres, resumen);
  const short = pres?.projectCode || proyecto?.short || "proyecto";
  const ctx = await prepararDoc({ titulo: "Reporte de costos", sub: `Central de costos · ${fmtMesAnio()}` });
  dibujarPortada(ctx, { pres, proyecto, R, tasa: T, machines });
  tablaPartidas(ctx, R);
  paginaMovimientos(ctx, { pres, movs, tasa: T });

  // Nota fija al pie de la portada (la tabla puede seguir en la pág. 2).
  const { doc, P } = ctx;
  doc.setPage(1);
  P.f(8); P.tc(GRIS);
  P.lineas("Comprometido = aprobado sin pagar · Ejecutado = pagado. Mano de obra según asistencia de GeoTeam.", CW)
    .forEach((l, i) => P.t(l, M, PH - 21 + i * 3.6));

  pies(ctx, `Generado por GeoCost · ${fechaLarga()}${userName ? ` · ${userName}` : ""}`);
  return { doc, nombre: `COSTOS-${slug(short)}-${hoyYMD()}.pdf` };
};

export const reporteCostosPDF = async (args) => {
  const { doc, nombre } = await construirReporteDoc(args || {});
  doc.save(nombre);
};
