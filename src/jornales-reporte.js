// =====================================================================
// JORNALES — Solicitud de pago (PDF apaisado + Excel) — 10-nov-2026
// =====================================================================
// Calca la "SOLICITUD DE PAGO M.O PERSONAL LOCAL POR DIA" (el Excel de
// Cataleya) con el estilo único de reportes: datos de la misión, un renglón
// por persona con sus 14 días (y las horas extra debajo de cada día), días ×
// valor por día + HE × (valor día ÷ 8), total a pagar, "favor depositar a…",
// firmas y — en las hojas siguientes — las IDENTIDADES escaneadas de cada uno
// (Gerson: "en los correos que mando, 100 % tienen que venir las identidades").
// =====================================================================
import { reporteHTML, rKpis, rSeccion, rTabla, rChip, escHTML, fmtLps, fmtNum, libroExcel, hojaExcel, descargarExcel } from "./reporte-estilo.js";
import { diaCorto, fechaCorta, fechaLarga, nombreCorteLargo, fechasHeDelCorte } from "./jornales-calc.js";

const CSS_JORNAL = `<style>
.jd{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 18px;margin-bottom:18px}
.jd .l{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9A948D}
.jd .v{font-size:11.5px;font-weight:700;margin-top:2px}
table.jt{width:100%;border-collapse:collapse;font-size:9.5px;table-layout:fixed}
.jt th{font-size:7.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9A948D;padding:5px 3px;border-bottom:1px solid #D9D5CF;text-align:center;line-height:1.25}
.jt th.izq{text-align:left}
.jt th.num{text-align:right}
.jt th.dia b{display:block;font-size:10px;color:#2C2A28;letter-spacing:0}
.jt th.fin{background:#F6F5F3}
.jt td{padding:5px 3px;border-bottom:1px solid #ECE9E5;text-align:center;vertical-align:middle}
.jt td.izq{text-align:left}
.jt td.num{text-align:right;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
.jt td.dia{font-family:'IBM Plex Mono',monospace;font-weight:700}
.jt td.dia .cero{color:#C9C4BD;font-weight:500}
.jt td.dia i{display:block;font-style:normal;font-size:8px;font-weight:700;color:#B5571C;margin-top:1px}
.jt td.dia i.sig{color:#A8A29B}
.jt td.fin{background:#FAF9F7}
.jt td .dni{display:block;font-size:8px;color:#9A948D;font-family:'IBM Plex Mono',monospace;margin-top:1px}
.jt tr.total td{border-top:1.5px solid #2C2A28;border-bottom:none;font-weight:800;padding-top:7px}
.jt td.pagar{font-weight:800;color:#2C2A28}
.jobs{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:14px;margin-top:16px}
.jobs .caja{border:1px solid #ECE9E5;border-radius:14px;padding:12px 14px;font-size:10.5px;line-height:1.5}
.jobs .caja .l{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9A948D;margin-bottom:4px}
.jobs .total{background:#2C2A28;color:#fff;border:none;display:flex;flex-direction:column;justify-content:center}
.jobs .total .l{color:rgba(255,255,255,.6)}
.jobs .total .v{font-size:24px;font-weight:800;font-family:'IBM Plex Mono',monospace;color:#F2A36B;letter-spacing:-.02em}
.jid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.jid .rp-caja{padding:10px 12px}
.jid .cab{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}
.jid .cab b{font-size:11.5px}
.jid .cab span{font-size:9.5px;color:#6E6862;font-family:'IBM Plex Mono',monospace}
.jid .fotos{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.jid .marco{height:150px;border-radius:10px;background:#F6F5F3;display:flex;align-items:center;justify-content:center;overflow:hidden}
.jid .marco .falta{font-size:9.5px;color:#B03024;font-weight:700;text-align:center;padding:8px}
.jid .pie{font-size:8px;color:#9A948D;text-align:center;margin-top:3px;letter-spacing:.08em;text-transform:uppercase}
</style>`;

const celdaDia = (v) => v === undefined || v === "" ? "" : Number(v) === 0 ? `<span class="cero">0</span>` : Number(v) === 0.5 ? "½" : Number(v) === 1.5 ? "1½" : escHTML(String(v));
const horas = (h) => fmtNum(h, Number(h) % 1 ? 1 : 0);

/** Imagen dentro de un marco de 150 px sin deformarla (html2canvas no respeta object-fit). */
const imgEnMarco = (img, altoMarco = 150, anchoMarco = 200) => {
  if (!img?.dataUrl) return `<div class="falta">Falta escanear</div>`;
  const s = Math.min(anchoMarco / (img.w || anchoMarco), altoMarco / (img.h || altoMarco));
  return `<img src="${img.dataUrl}" alt="" style="width:${Math.round((img.w || anchoMarco) * s)}px;height:${Math.round((img.h || altoMarco) * s)}px;display:block">`;
};

/**
 * Bloque de UN proyecto: datos, cifras, tabla, observaciones y firmas,
 * y en hoja aparte las identidades.
 * p = { nombre, short, liq (liquidarProyecto), elaboradoPor, lugar }
 * identidades = { [jornalId]: { frente: {dataUrl,w,h}, reverso: {...} } }
 */
const bloqueProyecto = (p, identidades, { primero }) => {
  const { liq } = p;
  const { corte, dias, filas, totales } = liq;
  const hayPrevia = filas.some(f => f.hePrevia > 0);
  const columnas = [`<th class="izq" style="width:20px">No</th>`, `<th class="izq" style="width:150px">Nombre</th>`];
  if (hayPrevia) columnas.push(`<th class="dia" style="width:34px">HE<b>${escHTML(fechaCorta(liq.viernesPrevio).split(" ")[0])}</b></th>`);
  dias.forEach((d, i) => columnas.push(`<th class="dia ${i === dias.length - 1 ? "fin" : ""}">${escHTML(diaCorto(d))}<b>${+d.slice(8)}</b></th>`));
  columnas.push(`<th style="width:34px">Días</th>`, `<th class="num" style="width:54px">Valor día</th>`, `<th class="num" style="width:66px">Total días</th>`, `<th style="width:30px">HE</th>`, `<th class="num" style="width:46px">Valor HE</th>`, `<th class="num" style="width:58px">Total HE</th>`, `<th class="num" style="width:76px">Total a pagar</th>`);
  const cuerpo = filas.map((f, i) => {
    const celdas = [`<td class="izq">${i + 1}</td>`, `<td class="izq"><b>${escHTML(f.nombre)}</b>${f.dni ? `<span class="dni">${escHTML(f.dni)}</span>` : ""}</td>`];
    if (hayPrevia) celdas.push(`<td class="dia">${f.hePrevia ? `<i>+${horas(f.hePrevia)}</i>` : ""}</td>`);
    dias.forEach((d, j) => {
      const he = Number(f.he?.[d]) || 0;
      const esFin = j === dias.length - 1;
      celdas.push(`<td class="dia ${esFin ? "fin" : ""}">${celdaDia(f.dias?.[d])}${he ? `<i class="${esFin ? "sig" : ""}">+${horas(he)}${esFin ? "→" : ""}</i>` : ""}</td>`);
    });
    celdas.push(`<td class="num">${fmtNum(f.totalDias, f.totalDias % 1 ? 1 : 0)}</td>`, `<td class="num">${fmtLps(f.tarifa)}</td>`, `<td class="num">${fmtLps(f.valorDias)}</td>`, `<td class="num">${horas(f.horasHe)}</td>`, `<td class="num">${fmtLps(f.valorHora)}</td>`, `<td class="num">${fmtLps(f.valorHe)}</td>`, `<td class="num pagar">${fmtLps(f.total)}</td>`);
    return `<tr>${celdas.join("")}</tr>`;
  }).join("");
  const vacias = 2 + (hayPrevia ? 1 : 0) + dias.length;
  const fila_total = `<tr class="total"><td class="izq" colspan="${vacias}">Total · ${filas.length} persona${filas.length === 1 ? "" : "s"}</td><td class="num">${fmtNum(totales.dias, totales.dias % 1 ? 1 : 0)}</td><td></td><td class="num">${fmtLps(totales.valorDias)}</td><td class="num">${horas(totales.horasHe)}</td><td></td><td class="num">${fmtLps(totales.valorHe)}</td><td class="num pagar">${fmtLps(totales.total)}</td></tr>`;
  const tabla = `<table class="jt"><thead><tr>${columnas.join("")}</tr></thead><tbody>${cuerpo}${fila_total}</tbody></table>`;
  const notas = [
    hayPrevia ? `La columna HE ${escHTML(fechaCorta(liq.viernesPrevio))} son las horas extra de la tarde del viernes del corte anterior: se pagan en este.` : "",
    totales.heSiguiente ? `Las horas extra marcadas con → (tarde del ${escHTML(fechaCorta(corte.fin))}) se pagan en el próximo corte.` : "",
    "Valor de la hora extra = valor del día ÷ 8.",
  ].filter(Boolean);
  const datos = `<div class="jd">
    <div><div class="l">Lugar y fecha</div><div class="v">${escHTML(p.lugar)}, ${escHTML(fechaLarga(p.hoy))}</div></div>
    <div><div class="l">Proyecto asignado</div><div class="v">${escHTML(p.nombre)}</div></div>
    <div><div class="l">Período</div><div class="v">${escHTML(fechaLarga(corte.ini))} al ${escHTML(fechaLarga(corte.fin))}</div></div>
    <div><div class="l">Fecha de pago</div><div class="v">${escHTML(fechaLarga(corte.pago))}</div></div>
    <div><div class="l">Motivo</div><div class="v">Pago de personal M.O. por día</div></div>
    <div><div class="l">Depositar a</div><div class="v">${escHTML(liq.encargado || "—")}</div></div>
    <div><div class="l">Asistencia tomada por</div><div class="v">${escHTML(p.asistenciaPor || "—")}</div></div>
    <div><div class="l">Identidades</div><div class="v">${filas.filter(f => identidades[f.id]?.frente).length} de ${filas.length} adjuntas</div></div>
  </div>`;
  const kpis = rKpis([
    { label: "Personas", valor: String(filas.length) },
    { label: "Días pagados", valor: fmtNum(totales.dias, totales.dias % 1 ? 1 : 0) },
    { label: "Horas extra", valor: horas(totales.horasHe), sub: fmtLps(totales.valorHe) },
    { label: "Total a pagar", valor: fmtLps(totales.total), tono: "naranja" },
  ]);
  const obs = `<div class="jobs">
    <div class="caja"><div class="l">Observaciones</div>${liq.encargado ? `Favor depositar a <b>${escHTML(liq.encargado)}</b>, quien se encargará de gestionar el pago y el cierre.` : "Sin encargado del pago indicado."}${liq.observaciones ? `<div style="margin-top:6px">${escHTML(liq.observaciones)}</div>` : ""}<div style="margin-top:6px;color:#9A948D;font-size:9.5px">${notas.join(" ")}</div></div>
    <div class="caja total"><div class="l">Total a pagar · ${escHTML(fechaCorta(corte.pago))}</div><div class="v">${fmtLps(totales.total)}</div></div>
  </div>`;
  const firmas = `<div class="rp-firmas"><div>Asistencia${p.asistenciaPor ? `<br><b>${escHTML(p.asistenciaPor)}</b>` : ""}</div><div>Elaborado por · Recursos Humanos${p.elaboradoPor ? `<br><b>${escHTML(p.elaboradoPor)}</b>` : ""}</div><div>Autorizado</div></div>`;
  const ids = filas.map((f, i) => {
    const idn = identidades[f.id] || {};
    return `<div class="rp-caja"><div class="cab"><b>${i + 1}. ${escHTML(f.nombre)}</b><span>${escHTML(f.dni || "")}</span></div>
      <div class="fotos"><div><div class="marco">${imgEnMarco(idn.frente)}</div><div class="pie">Frente</div></div><div><div class="marco">${idn.reverso ? imgEnMarco(idn.reverso) : `<span style="font-size:9.5px;color:#9A948D">Sin reverso</span>`}</div><div class="pie">Reverso</div></div></div></div>`;
  }).join("");
  const titulo = primero ? "" : `<div class="rp-salto"></div><div class="rp-titulo" style="font-size:22px">${escHTML(p.nombre)}</div><div class="rp-sub">Corte ${escHTML(nombreCorteLargo(corte))} · se paga el ${escHTML(fechaLarga(corte.pago))}</div><div class="rp-acento"></div>`;
  return `${titulo}${datos}${kpis}${rSeccion("Personal", tabla, `${filas.length} persona${filas.length === 1 ? "" : "s"} · ${escHTML(nombreCorteLargo(corte))}`)}${obs}${firmas}
    <div class="rp-salto"></div>${rSeccion(`Identidades · ${p.nombre}`, filas.length ? `<div class="jid">${ids}</div>` : rChip("Sin personas"), `${filas.filter(f => identidades[f.id]?.frente).length} de ${filas.length}`)}`;
};

/** HTML completo. proyectos = [{nombre, short, liq, elaboradoPor}] */
export const reporteJornalesHTML = ({ proyectos, identidades, empresa, lugar, hoy }) => {
  const corte = proyectos[0].liq.corte;
  const uno = proyectos.length === 1;
  const titulo = uno ? `Solicitud de pago · Jornales · ${proyectos[0].nombre}` : "Solicitud de pago · Jornales";
  const sub = `Personal por día · corte ${nombreCorteLargo(corte)} · se paga el ${fechaLarga(corte.pago)}`;
  let cuerpo = CSS_JORNAL;
  if (!uno) {
    const tot = proyectos.reduce((t, p) => t + p.liq.totales.total, 0);
    cuerpo += rKpis([{ label: "Proyectos", valor: String(proyectos.length) }, { label: "Personas", valor: String(proyectos.reduce((t, p) => t + p.liq.filas.length, 0)) }, { label: "Total a pagar", valor: fmtLps(tot), tono: "naranja" }]);
    cuerpo += rSeccion("Resumen por proyecto", rTabla({ columnas: [{ t: "Proyecto" }, { t: "Personas", num: true }, { t: "Días", num: true }, { t: "Horas extra", num: true }, { t: "Depositar a" }, { t: "Total a pagar", num: true }], filas: proyectos.map(p => [`<b>${escHTML(p.nombre)}</b>`, p.liq.filas.length, fmtNum(p.liq.totales.dias, 1), horas(p.liq.totales.horasHe), escHTML(p.liq.encargado || "—"), fmtLps(p.liq.totales.total)]), total: ["Total", "", "", "", "", fmtLps(tot)] }));
  }
  proyectos.forEach((p, i) => { cuerpo += bloqueProyecto({ ...p, lugar, hoy }, identidades, { primero: uno && i === 0 }); });
  return reporteHTML({ titulo, subtitulo: sub, empresa, cuerpo });
};

/** Excel: una hoja por proyecto, con días y horas extra por fecha (como el de Cataleya). */
export const excelJornales = async ({ proyectos }) => {
  const wb = await libroExcel();
  const usados = new Set();
  proyectos.forEach(p => {
    const { liq } = p;
    let hoja = String(p.short || p.nombre).replace(/[\\/?*[\]:]/g, "-").slice(0, 28) || "Proyecto";
    while (usados.has(hoja)) hoja += "·";
    usados.add(hoja);
    const fechasHe = fechasHeDelCorte(liq.corte);
    const columnas = [
      { key: "no", t: "No", ancho: 5, formato: "num" }, { key: "nombre", t: "Nombre", ancho: 30, formato: "texto" }, { key: "dni", t: "Identidad", ancho: 17, formato: "texto" },
      ...liq.dias.map(d => ({ key: "d" + d, t: `${diaCorto(d)} ${+d.slice(8)}`, ancho: 7, formato: "num2" })),
      ...fechasHe.map(d => ({ key: "h" + d, t: `HE ${diaCorto(d)} ${+d.slice(8)}`, ancho: 8, formato: "num2" })),
      { key: "td", t: "Total días", ancho: 10, formato: "num2" }, { key: "vd", t: "Valor por día", ancho: 13, formato: "lps" }, { key: "tvd", t: "Total días L", ancho: 14, formato: "lps" },
      { key: "he", t: "Horas extra", ancho: 10, formato: "num2" }, { key: "vh", t: "Valor HE", ancho: 11, formato: "lps" }, { key: "tvh", t: "Total HE", ancho: 13, formato: "lps" }, { key: "tot", t: "Total a pagar", ancho: 15, formato: "lps" },
    ];
    const filas = liq.filas.map((f, i) => {
      const o = { no: i + 1, nombre: f.nombre, dni: f.dni, td: f.totalDias, vd: f.tarifa, tvd: f.valorDias, he: f.horasHe, vh: f.valorHora, tvh: f.valorHe, tot: f.total };
      liq.dias.forEach(d => { if (f.dias?.[d] !== undefined) o["d" + d] = Number(f.dias[d]); });
      fechasHe.forEach(d => { const h = d === liq.viernesPrevio ? f.hePrevia : Number(f.he?.[d]) || 0; if (h) o["h" + d] = h; });
      return o;
    });
    hojaExcel(wb, { nombre: hoja, titulo: `Solicitud de pago · Jornales · ${p.nombre}`, subtitulo: `Corte ${nombreCorteLargo(liq.corte)} · se paga el ${fechaLarga(liq.corte.pago)}${liq.encargado ? ` · depositar a ${liq.encargado}` : ""}`, columnas, filas, total: { nombre: "Total", td: liq.totales.dias, tvd: liq.totales.valorDias, he: liq.totales.horasHe, tvh: liq.totales.valorHe, tot: liq.totales.total } });
  });
  const c = proyectos[0].liq.corte;
  await descargarExcel(wb, `Jornales_${proyectos.length === 1 ? proyectos[0].nombre.replace(/\s+/g, "_") : "todos"}_${c.ini}_al_${c.fin}.xlsx`);
};
