// =====================================================================
// HUB DE RRHH — pantallas (20-oct-2026, pedido de Gerson)
// =====================================================================
// "Mi RRHH" (portal de cada colaborador: su asistencia según GeoClock y sus
// solicitudes) y la BANDEJA de RRHH (todas las solicitudes, aprobar/denegar).
// Componentes a NIVEL DE MÓDULO (definidos adentro de HRModule se
// remontarían con cada re-render y los inputs perderían el foco).
// La lógica vive en rrhh-solicitudes.js (pura, con pruebas).
// =====================================================================
import { useState, useEffect, useMemo } from "react";
import { store } from "./supabase.js";
import { hoyISO } from "./fechas.js";
import { safeDynamicImport } from "./lazyLoad.js";
import { Modal, Chip, C_GRIS, C_VERDE, C_AZUL, C_AMARILLO, C_NARANJA, ORANGE, ORANGE_DARK, CHARCOAL, uid, useIsMobile } from "./geocost-ui.jsx";
import { VisorArchivo } from "./visor-archivo.jsx";
import {
  TIPOS, TIPOS_PERMISO, ETIQUETA_PERMISO, TIPOS_CONSTANCIA, CATEGORIAS_REPORTE, categoriaReporteLabel, ESTADOS, estaAbierta,
  puedeDecidir, puedeCancelar, puedeDescargarConstancia, esMia, veTodo, esAprobador,
  validarSolicitud, armarSolicitud, detalleSolicitud, fechaLarga, rangoCorto, diasHabiles, diasCalendario,
  diasDeMarcas, resumenAsistencia, quincenasRecientes, nombreQuincenaCorto, vacacionesTomadas, EMPRESAS,
} from "./rrhh-solicitudes.js";

const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.07)" };
const TONO = { gris: C_GRIS, verde: C_VERDE, azul: C_AZUL, amarillo: C_AMARILLO, naranja: C_NARANJA, rojo: C_ROJO };
const LBL = { fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" };
const CTRL = { minHeight: 42, padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.85)", fontSize: 14, fontFamily: "inherit", color: CHARCOAL, width: "100%", boxSizing: "border-box", outline: "none" };
const fmtH = (h) => h == null ? "—" : `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")} h`;
const hace = (iso, hoy) => { if (!iso) return ""; const d = Math.round((new Date(hoy + "T12:00:00") - new Date(String(iso).slice(0, 10) + "T12:00:00")) / 86400000); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} d`; };
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const diaSemana = (iso) => { const [y, m, d] = iso.split("-").map(Number); return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };

// ── Iconos de línea (monocromos, como el resto del sistema) ──
const Ico = ({ d, size = 20, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
export const ICO = {
  asistencia: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  vacaciones: <><path d="M3 20h18" /><path d="M5 20c0-4 3-7 7-7s7 3 7 7" /><path d="M12 13V5" /><path d="M12 5c-3 0-5 1.5-6 3 2-.5 4 0 6 1.5 2-1.5 4-2 6-1.5-1-1.5-3-3-6-3z" /></>,
  permiso: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /><path d="M9.5 15.5l1.8 1.8 3.5-3.8" /></>,
  constancia: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 16.5h5" /></>,
  reporte: <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4.5" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>,
  bandeja: <><path d="M3.5 13.5V18a2 2 0 002 2h13a2 2 0 002-2v-4.5" /><path d="M3.5 13.5h4.5l1.5 2.5h5l1.5-2.5h4.5" /><path d="M6 13.5L8 5h8l2 8.5" /></>,
  persona: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.7-3.6 3.2-5.6 7-5.6s6.3 2 7 5.6" /></>,
  adjunto: <><path d="M16.5 7.5l-7 7a2.1 2.1 0 003 3l7.5-7.5a4 4 0 00-5.7-5.7L6.5 12.1" /></>,
  flecha: <path d="M9 6l6 6-6 6" />,
  atras: <path d="M15 6l-6 6 6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
};
const TIPO_ICO = { vacaciones: ICO.vacaciones, permiso: ICO.permiso, constancia: ICO.constancia, reporte: ICO.reporte };

const chipEstado = (s) => { const e = ESTADOS[s?.estado] || ESTADOS.pendiente; return <Chip c={TONO[e.tono]}>{e.label}</Chip>; };
const Avatar = ({ nombre, dataUrl, size = 40, radius = 12 }) => {
  const ini = String(nombre || "?").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: "hidden", background: dataUrl ? "#EEE" : "rgba(44,42,40,.07)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6E6862", font: `800 ${Math.round(size * 0.36)}px/1 var(--display)` }}>
    {dataUrl ? <img src={dataUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : ini}
  </div>;
};
const btn = (label, onClick, { c = CHARCOAL, lleno = false, chico = false, disabled = false, key, title } = {}) => <button key={key} type="button" title={title} onClick={onClick} disabled={disabled}
  style={{ minHeight: chico ? 36 : 44, padding: chico ? "7px 13px" : "10px 18px", borderRadius: 12, border: lleno ? "1px solid transparent" : `1px solid ${c === CHARCOAL ? "rgba(44,42,40,.14)" : c + "55"}`, background: lleno ? c : "rgba(255,255,255,.75)", color: lleno ? "#fff" : c, font: `700 ${chico ? 12.5 : 13.5}px/1 var(--sans)`, cursor: disabled ? "default" : "pointer", opacity: disabled ? .5 : 1, whiteSpace: "nowrap" }}>{label}</button>;
const pill = (label, on, onClick, { key, c = ORANGE_DARK } = {}) => <button key={key} type="button" onClick={onClick} aria-pressed={on}
  style={{ padding: "7px 13px", borderRadius: 999, border: on ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: on ? c : "rgba(255,255,255,.7)", color: on ? "#fff" : CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>;

// ── Adjuntos: foto (comprimida) o PDF (≤ 2 MB), a cp-file-<id> ──
const comprimirImagen = (file, MAX = 1200) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error("No se pudo leer la foto"));
  fr.onload = () => { const img = new Image(); img.onerror = () => reject(new Error("No se pudo decodificar la foto")); img.onload = () => { try { const sc = Math.min(1, MAX / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height); resolve(c.toDataURL("image/jpeg", 0.8)); } catch (e) { reject(e); } }; img.src = fr.result; };
  fr.readAsDataURL(file);
});
const leerDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
export async function subirAdjunto(file) {
  if (!file) return null;
  const esImg = /^image\//.test(file.type);
  if (!esImg && file.type !== "application/pdf") throw new Error("Solo fotos o PDF.");
  if (!esImg && file.size > 2 * 1024 * 1024) throw new Error("El PDF pesa más de 2 MB.");
  const dataUrl = esImg ? await comprimirImagen(file) : await leerDataUrl(file);
  const fileId = uid();
  const rec = { name: file.name || (esImg ? "foto.jpg" : "archivo.pdf"), type: esImg ? "image/jpeg" : "application/pdf", size: dataUrl.length, dataUrl };
  const ok = await store.set(`cp-file-${fileId}`, rec);
  if (!ok) throw new Error("No se pudo subir el archivo a la nube.");
  return { fileId, name: rec.name, type: rec.type, size: rec.size };
}
const bajarAdjunto = async (a) => { try { const f = await store.getCloud(`cp-file-${a.fileId}`); return f?.dataUrl ? { name: a.name, type: a.type || f.type, dataUrl: f.dataUrl } : null; } catch { return null; } };

// ── Constancia en PDF (carta): logo de la empresa, título, párrafos con
// negritas, tabla de deducciones, cierre y firma — como la que Gerson firma.
const cargarImagen = async (url) => {
  try { const resp = await fetch(url); if (!resp.ok) return null; const blob = await resp.blob(); const dataUrl = await leerDataUrl(blob); const dims = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = dataUrl; }); return { dataUrl, ...dims }; } catch { return null; }
};
// Escribe runs [texto, negrita] con salto de línea por palabra (mezcla de
// fuentes en el mismo renglón, cosa que jsPDF no hace solo).
const escribirRuns = (doc, runs, x, y, maxW, lh) => {
  let cx = x;
  const palabras = [];
  runs.forEach(([t, b]) => String(t).split(/(\s+)/).forEach(w => { if (w) palabras.push([w, !!b]); }));
  palabras.forEach(([w, b]) => {
    doc.setFont("helvetica", b ? "bold" : "normal");
    const ww = doc.getTextWidth(w);
    if (/^\s+$/.test(w)) { if (cx > x) cx += ww; return; }
    if (cx + ww > x + maxW && cx > x) { cx = x; y += lh; }
    doc.text(w, cx, y); cx += ww;
  });
  return y + lh;
};
const l1 = (t) => String(t ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
export async function constanciaPDF(sol) {
  const d0 = sol.resultado?.doc; if (!d0) return alert("Esta constancia no tiene contenido.");
  const d = { ...d0, titulo: l1(d0.titulo), parrafos: d0.parrafos.map(p => p.map(([t, b]) => [l1(t), b])), cierre: d0.cierre.map(([t, b]) => [l1(t), b]), tabla: d0.tabla ? d0.tabla.map(t => ({ ...t, label: l1(t.label), monto: l1(t.monto) })) : null, firma: d0.firma.map(l1) };
  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = 215.9, M = 25, maxW = W - 2 * M, LH = 6.4;
  let y = 20;
  const logo = await cargarImagen(`${import.meta.env.BASE_URL}${d.logo || EMPRESAS[d.empresa]?.logo || "brand/logo-color.png"}`);
  if (logo) { const h = 22; doc.addImage(logo.dataUrl, "PNG", M, y, (logo.w / logo.h) * h, h); y += h + 16; }
  else { doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(232, 118, 45); doc.text(EMPRESAS[d.empresa]?.nombre?.toUpperCase() || "", M, y + 8); y += 26; }
  doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(d.titulo, W / 2, y, { align: "center" }); y += 14;
  doc.setFontSize(11.5);
  d.parrafos.forEach(p => { y = escribirRuns(doc, p, M, y, maxW, LH) + 4; });
  if (d.tabla) {
    const tw = 90, c1 = 56, x0 = (W - tw) / 2, rh = 7.4;
    y += 1;
    d.tabla.forEach((t, i) => {
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(.25);
      doc.rect(x0, y - 5.2, c1, rh); doc.rect(x0 + c1, y - 5.2, tw - c1, rh);
      doc.setFont("helvetica", t.negrita ? "bold" : "normal");
      doc.text(t.label, x0 + 3, y); doc.text(t.monto, x0 + tw - 3, y, { align: "right" });
      y += rh;
    });
    y += 8;
  }
  y = escribirRuns(doc, d.cierre, M, y, maxW, LH);
  y = Math.max(y + 26, 200);
  doc.setDrawColor(0); doc.setLineWidth(.3); doc.line(W / 2 - 40, y, W / 2 + 40, y); y += 5.5;
  d.firma.forEach((l, i) => { doc.setFont("helvetica", i === 0 ? "bold" : "normal"); doc.text(l, W / 2, y, { align: "center" }); y += 5.5; });
  doc.setFontSize(8); doc.setTextColor(150, 144, 136); doc.setFont("helvetica", "normal");
  doc.text(`${sol.folio || ""} · emitida en GeoCore`, W / 2, 268, { align: "center" });
  doc.save(`Constancia_${d.titulo === "CONSTANCIA DE TRABAJO" && sol.tipoConstancia === "laboral" ? "Laboral" : "Trabajo"}_${String(sol.empNombre || "").replace(/[^A-Za-z0-9]+/g, "_")}.pdf`);
}
// Vista previa en pantalla, igual al PDF.
export const ConstanciaVista = ({ doc }) => {
  if (!doc) return null;
  const P = ({ runs }) => <p style={{ margin: "0 0 10px", lineHeight: 1.65, textAlign: "justify" }}>{runs.map((r, i) => r[1] ? <b key={i}>{r[0]}</b> : <span key={i}>{r[0]}</span>)}</p>;
  return <div style={{ padding: "22px 26px", borderRadius: 14, background: "#fff", border: "1px solid rgba(44,42,40,.1)", fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 13, color: "#1a1a1a" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}><img src={`${import.meta.env.BASE_URL}${doc.logo}`} alt="" onError={e => { e.currentTarget.style.display = "none"; }} style={{ height: 44 }} /><span style={{ fontFamily: "var(--display)", fontWeight: 800, color: ORANGE, fontSize: 15 }}>{EMPRESAS[doc.empresa]?.nombre}</span></div>
    <div style={{ textAlign: "center", fontWeight: 800, fontSize: 14, marginBottom: 14 }}>{doc.titulo}</div>
    {doc.parrafos.map((p, i) => <P key={i} runs={p} />)}
    {doc.tabla && <table style={{ margin: "6px auto 14px", borderCollapse: "collapse", fontSize: 12.5 }}><tbody>{doc.tabla.map((t, i) => <tr key={i}><td style={{ border: "1px solid #999", padding: "4px 12px", fontWeight: t.negrita ? 700 : 400 }}>{t.label}</td><td style={{ border: "1px solid #999", padding: "4px 12px", textAlign: "right", fontWeight: t.negrita ? 700 : 400 }}>{t.monto}</td></tr>)}</tbody></table>}
    <P runs={doc.cierre} />
    <div style={{ textAlign: "center", marginTop: 34 }}><div style={{ width: 220, borderTop: "1px solid #222", margin: "0 auto 5px" }} />{doc.firma.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>{l}</div>)}</div>
  </div>;
};

// ═══════════════════════════════════════════════════════════════════════════
// FORM — nueva solicitud (para mí o en nombre de otra persona)
// ═══════════════════════════════════════════════════════════════════════════
export function SolicitudFormImpl({ tipoInicial = "vacaciones", emps, yo, user, vacs, fotoDe, onGuardar, onClose, puedeIngresos = true }) {
  const isMobile = useIsMobile();
  const [f, setF] = useState({ tipo: tipoInicial, paraMi: !!yo, empId: yo?.id || "", desde: "", hasta: "", fecha: "", hastaP: "", tipoPermiso: "Personal", porHoras: "", motivo: "", tipoConstancia: puedeIngresos ? "trabajo" : "laboral", dirigidaA: "", categoria: "pago", descripcion: "", confidencial: false, nota: "", adjuntos: [] });
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const activos = useMemo(() => (emps || []).filter(e => e.status !== "inactive").sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es")), [emps]);
  const emp = activos.find(e => e.id === f.empId) || (emps || []).find(e => e.id === f.empId) || null;
  const lista = q.trim().length >= 2 ? activos.filter(e => `${e.fullName} ${e.position || ""}`.toLowerCase().includes(q.toLowerCase())).slice(0, 7) : [];
  const dHab = f.tipo === "vacaciones" && f.desde && f.hasta ? diasHabiles(f.desde, f.hasta).length : 0;
  const dCal = f.tipo === "vacaciones" && f.desde && f.hasta ? diasCalendario(f.desde, f.hasta) : 0;
  const hoy = hoyISO();
  const tomadas = emp ? vacacionesTomadas(vacs, emp.id, hoy.slice(0, 4)) : null;
  const agregarAdjunto = async (file) => { if (!file) return; setSubiendo(true); try { const a = await subirAdjunto(file); setF(p => ({ ...p, adjuntos: [...p.adjuntos, a] })); } catch (e) { alert(e?.message || e); } finally { setSubiendo(false); } };
  const guardar = async () => {
    const s = { ...f, hasta: f.tipo === "permiso" ? f.hastaP : f.hasta };
    const err = validarSolicitud(s, { vacs });
    if (err) return alert(err);
    setBusy(true);
    try { const ok = await onGuardar(armarSolicitud({ ...s, enNombreDe: !f.paraMi }, { emp, solicitante: { username: user.username, nombre: user.nombre }, ahora: new Date().toISOString() })); if (ok) onClose(); }
    finally { setBusy(false); }
  };
  const caja = (titulo, children) => <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 16, background: "rgba(44,42,40,.035)" }}><div style={LBL}>{titulo}</div>{children}</div>;
  const dateIn = (k, v) => <input type="date" value={f[k]} onChange={e => u(k, e.target.value)} style={CTRL} />;
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 6 }}>
      {Object.entries(TIPOS).map(([k, t]) => { const on = f.tipo === k; return <button key={k} type="button" onClick={() => u("tipo", k)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 8px", borderRadius: 14, border: on ? "1px solid transparent" : "1px solid rgba(44,42,40,.1)", background: on ? ORANGE_DARK : "rgba(255,255,255,.7)", color: on ? "#fff" : CHARCOAL, cursor: "pointer", font: "700 12.5px/1.2 var(--sans)", textAlign: "center" }}><Ico d={TIPO_ICO[k]} size={22} />{t.corto}</button>; })}
    </div>
    {caja("Para quién", <>
      {yo && <div style={{ display: "flex", gap: 6 }}>{pill("Para mí", f.paraMi, () => setF(p => ({ ...p, paraMi: true, empId: yo.id })))}{pill("Para otra persona", !f.paraMi, () => setF(p => ({ ...p, paraMi: false, empId: "" })))}</div>}
      {(!yo || !f.paraMi) && (emp
        ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar nombre={emp.fullName} dataUrl={fotoDe?.(emp)} size={36} radius={10} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14 }}>{emp.fullName}</div><div style={{ fontSize: 12, color: "#6E6862" }}>{emp.position || ""}{emp.company ? ` · ${emp.company === "subterra" ? "Subterra" : "Geotecnica"}` : ""}</div></div>{btn("Cambiar", () => u("empId", ""), { chico: true })}</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar colaborador por nombre…" style={CTRL} />
          {lista.map(e => <button key={e.id} type="button" onClick={() => { u("empId", e.id); setQ(""); }} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(44,42,40,.08)", background: "rgba(255,255,255,.8)", cursor: "pointer", fontFamily: "inherit", minHeight: 46 }}><Avatar nombre={e.fullName} dataUrl={fotoDe?.(e)} size={30} radius={9} /><div><div style={{ fontWeight: 700, fontSize: 13.5, color: CHARCOAL }}>{e.fullName}</div><div style={{ fontSize: 11.5, color: "#6E6862" }}>{e.position || ""} · {e.company === "subterra" ? "Subterra" : "Geotecnica"}</div></div></button>)}
          {q.trim().length >= 2 && !lista.length && <div style={{ fontSize: 12, color: "#6E6862" }}>Nadie con ese nombre.</div>}
        </div>)}
      {yo && f.paraMi && <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar nombre={yo.fullName} dataUrl={fotoDe?.(yo)} size={36} radius={10} /><div><div style={{ fontWeight: 700, fontSize: 14 }}>{yo.fullName}</div><div style={{ fontSize: 12, color: "#6E6862" }}>{yo.position || ""}</div></div></div>}
      {!f.paraMi && emp && <div style={{ fontSize: 11.5, color: "#6E6862" }}>Queda registrado que la pediste vos en nombre de {emp.fullName.split(" ")[0]}.</div>}
    </>)}
    {f.tipo === "vacaciones" && caja("Fechas", <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><div style={{ ...LBL, marginBottom: 4 }}>Desde</div>{dateIn("desde")}</div><div><div style={{ ...LBL, marginBottom: 4 }}>Hasta</div>{dateIn("hasta")}</div></div>
      {dCal > 0 && <div style={{ fontSize: 13, color: CHARCOAL }}><b>{dCal} día{dCal === 1 ? "" : "s"}</b> de calendario{dHab !== dCal ? ` · ${dHab} hábiles` : ""}{tomadas?.diasAnio ? <span style={{ color: "#6E6862" }}> · ya tomó {tomadas.diasAnio} este año</span> : null}</div>}
    </>)}
    {f.tipo === "permiso" && caja("El permiso", <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{TIPOS_PERMISO.map(t => pill(ETIQUETA_PERMISO[t] || t, f.tipoPermiso === t, () => u("tipoPermiso", t), { key: t }))}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><div><div style={{ ...LBL, marginBottom: 4 }}>Día</div>{dateIn("fecha")}</div><div><div style={{ ...LBL, marginBottom: 4 }}>Hasta (si son varios días)</div>{dateIn("hastaP")}</div></div>
      <input value={f.porHoras} onChange={e => u("porHoras", e.target.value)} placeholder="Horas, si no es el día completo · ej. de 8 a 11" style={CTRL} />
      <textarea value={f.motivo} onChange={e => u("motivo", e.target.value)} placeholder="Motivo" style={{ ...CTRL, minHeight: 64, resize: "vertical" }} />
      {f.tipoPermiso === "Sin goce de sueldo" && <div style={{ fontSize: 11.5, color: "#A94E16" }}>Sin goce: el día no se paga.</div>}
    </>)}
    {f.tipo === "constancia" && caja("La constancia", <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{puedeIngresos && pill("De trabajo (con salario)", f.tipoConstancia === "trabajo", () => u("tipoConstancia", "trabajo"))}{pill("Laboral (sin salario)", f.tipoConstancia === "laboral", () => u("tipoConstancia", "laboral"))}</div>
      <input value={f.dirigidaA} onChange={e => u("dirigidaA", e.target.value)} placeholder="A quién va dirigida (opcional) · ej. Banco Atlántida" style={CTRL} />
      <input value={f.motivo} onChange={e => u("motivo", e.target.value)} placeholder="Para qué la necesitás (opcional)" style={CTRL} />
      <div style={{ fontSize: 11.5, color: "#6E6862" }}>Cuando RRHH la apruebe, la descargás en PDF desde Mis solicitudes.</div>
    </>)}
    {f.tipo === "reporte" && caja("El problema", <>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{CATEGORIAS_REPORTE.map(([k, l]) => pill(l, f.categoria === k, () => u("categoria", k), { key: k }))}</div>
      <textarea value={f.descripcion} onChange={e => u("descripcion", e.target.value)} placeholder="Contá qué pasó, cuándo y dónde." style={{ ...CTRL, minHeight: 96, resize: "vertical" }} />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={f.confidencial} onChange={e => u("confidencial", e.target.checked)} /> Confidencial: solo lo ve Gerson y la Lic. Carolina</label>
    </>)}
    {caja("Adjuntos y nota", <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 12, border: `1px dashed ${ORANGE}`, color: "var(--naranja-tinta)", font: "700 12.5px/1 var(--sans)", cursor: subiendo ? "wait" : "pointer", background: "rgba(232,118,45,.06)" }}><Ico d={ICO.adjunto} size={16} /> {subiendo ? "Subiendo…" : "Foto o PDF"}<input type="file" accept="image/*,application/pdf" disabled={subiendo} style={{ display: "none" }} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; agregarAdjunto(file); }} /></label>
        {f.adjuntos.map(a => <Chip key={a.fileId} c={C_AZUL}>{a.name} <span role="button" onClick={() => u("adjuntos", f.adjuntos.filter(x => x.fileId !== a.fileId))} style={{ cursor: "pointer", marginLeft: 4 }}>✕</span></Chip>)}
      </div>
      <input value={f.nota} onChange={e => u("nota", e.target.value)} placeholder="Algo más que RRHH deba saber (opcional)" style={CTRL} />
    </>)}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>{btn("Cancelar", onClose)}{btn(busy ? "Enviando…" : "Enviar solicitud", guardar, { c: ORANGE_DARK, lleno: true, disabled: busy || subiendo })}</div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// DETALLE de una solicitud + decisión
// ═══════════════════════════════════════════════════════════════════════════
export function SolicitudDetalleImpl({ sol, user, emps, fotoDe, onDecidir, onCancelar, onClose, hoy, vistaPrevia }) {
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState("");   // "" | "denegar" | "responder"
  const [busy, setBusy] = useState(false);
  const [visor, setVisor] = useState(null);
  const emp = (emps || []).find(e => e.id === sol.empId);
  const dec = puedeDecidir(sol, user);
  const abierta = estaAbierta(sol);
  const fila = (l, v) => v ? <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "7px 0", borderBottom: "1px solid rgba(44,42,40,.06)" }}><span style={{ fontSize: 12.5, color: "#6E6862", flexShrink: 0 }}>{l}</span><span style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, textAlign: "right", whiteSpace: "pre-wrap" }}>{v}</span></div> : null;
  const act = async (accion, extra) => { setBusy(true); try { const ok = await onDecidir(sol, accion, { motivo: motivo.trim(), ...extra }); if (ok) onClose(); } finally { setBusy(false); } };
  const verAdjunto = async (a) => { const d = await bajarAdjunto(a); if (!d) return alert("No se pudo abrir el adjunto."); setVisor(d); };
  const verTextoConst = puedeDescargarConstancia(sol, user);
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Avatar nombre={sol.empNombre} dataUrl={emp ? fotoDe?.(emp) : null} size={48} radius={14} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>{sol.empNombre}</div>
        <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 2 }}>{sol.cargo || ""}{sol.company ? ` · ${sol.company === "subterra" ? "Subterra" : "Geotecnica"}` : ""}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>{chipEstado(sol)}<span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#6E6862" }}>{sol.folio}</span></div>
    </div>
    <div style={{ padding: "4px 14px", borderRadius: 14, background: "rgba(44,42,40,.035)" }}>
      {fila("Qué", `${TIPOS[sol.tipo]?.label || sol.tipo} · ${detalleSolicitud(sol)}`)}
      {sol.tipo === "vacaciones" && fila("Días", `${sol.dias} de calendario · ${sol.diasHabiles} hábiles`)}
      {sol.tipo === "permiso" && fila("Motivo", sol.motivo)}
      {sol.tipo === "constancia" && fila("Para", sol.motivo)}
      {sol.tipo === "reporte" && fila("Qué pasó", sol.descripcion)}
      {sol.tipo === "reporte" && sol.confidencial && fila("Confidencial", "Sí")}
      {fila("Nota", sol.nota)}
      {fila("La pidió", `${sol.solicitadoPor?.nombre || "—"}${sol.enNombreDe ? " (en nombre del colaborador)" : ""} · ${fechaLarga(String(sol.createdAt || "").slice(0, 10))}`)}
      {sol.decision?.por && fila(sol.estado === "denegada" ? "Denegó" : sol.estado === "resuelta" ? "Resolvió" : "Aprobó", `${sol.decision.por} · ${fechaLarga(String(sol.decision.at || "").slice(0, 10))}`)}
      {sol.decision?.motivo && fila(sol.estado === "denegada" ? "Motivo" : "Respuesta", sol.decision.motivo)}
    </div>
    {sol.adjuntos?.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{sol.adjuntos.map(a => <button key={a.fileId} type="button" onClick={() => verAdjunto(a)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, border: "1px solid rgba(29,95,175,.3)", background: "#DDE9FA", color: "#1D5FAF", font: "700 12px/1 var(--sans)", cursor: "pointer" }}><Ico d={ICO.adjunto} size={14} /> {a.name}</button>)}</div>}
    {sol.tipo === "constancia" && sol.estado === "aprobada" && (verTextoConst
      ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><ConstanciaVista doc={sol.resultado?.doc} /><div style={{ display: "flex", justifyContent: "flex-end" }}>{btn("Descargar PDF", () => constanciaPDF(sol), { c: ORANGE_DARK, lleno: true })}</div></div>
      : <div style={{ fontSize: 12.5, color: "#6E6862" }}>La constancia de trabajo lleva el salario: la descarga la persona desde su Mi RRHH.</div>)}
    {sol.historial?.length > 1 && <details><summary style={{ fontSize: 12, color: "#6E6862", cursor: "pointer" }}>Historial ({sol.historial.length})</summary><div style={{ fontSize: 12, color: "#6E6862", marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>{sol.historial.map((h, i) => <div key={i}>{fechaLarga(String(h.at || "").slice(0, 10))} · {h.accion} · {h.por}{h.nota ? ` — ${h.nota}` : ""}</div>)}</div></details>}

    {abierta && dec.ok && <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 14, borderRadius: 16, background: "rgba(232,118,45,.06)" }}>
      {sol.tipo === "constancia" && emp && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div style={{ fontSize: 12.5, color: "#6E6862" }}>Así va a salir, con los datos de la ficha de hoy{sol.tipoConstancia === "trabajo" ? " (incluye el salario)" : ""}:</div>{vistaPrevia && <ConstanciaVista doc={vistaPrevia} />}</div>}
      {sol.tipo === "vacaciones" && <div style={{ fontSize: 12.5, color: "#6E6862" }}>Al aprobar se registra en Vacaciones y se marcan los días "V" en la asistencia.</div>}
      {sol.tipo === "permiso" && <div style={{ fontSize: 12.5, color: "#6E6862" }}>Al aprobar se registra en Permisos y se marca el día en la asistencia{sol.tipoPermiso === "Sin goce de sueldo" ? " como 0 (sin goce)" : ""}.</div>}
      {modo && <textarea autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} placeholder={modo === "denegar" ? "Motivo (se le muestra a la persona)" : "Respuesta para la persona"} style={{ ...CTRL, minHeight: 70, resize: "vertical" }} />}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {sol.tipo === "reporte"
          ? <>
            {sol.estado === "pendiente" && modo !== "responder" && btn("Tomar en revisión", () => act("revision"), { c: "#1D5FAF", disabled: busy })}
            {modo === "responder" ? btn(busy ? "Guardando…" : "Responder y marcar resuelto", () => motivo.trim() ? act("resolver") : alert("Escribí la respuesta."), { c: "#177243", lleno: true, disabled: busy }) : btn("Responder y resolver", () => setModo("responder"), { c: "#177243", lleno: true })}
          </>
          : modo === "denegar"
            ? <>{btn("Volver", () => setModo(""))}{btn(busy ? "Guardando…" : "Confirmar denegación", () => motivo.trim() ? act("denegar") : alert("Escribí el motivo."), { c: "#B03024", lleno: true, disabled: busy })}</>
            : <>{btn("Denegar", () => setModo("denegar"), { c: "#B03024" })}{btn(busy ? "Aprobando…" : "Aprobar", () => act("aprobar"), { c: "#177243", lleno: true, disabled: busy })}</>}
      </div>
    </div>}
    {abierta && !dec.ok && esAprobador(user.rol) && <div style={{ fontSize: 12.5, color: "#6E6862" }}>{dec.motivo}</div>}
    {puedeCancelar(sol, user) && <div style={{ display: "flex", justifyContent: "flex-end" }}>{btn("Cancelar mi solicitud", async () => { if (!confirm("¿Cancelar esta solicitud?")) return; setBusy(true); try { if (await onCancelar(sol)) onClose(); } finally { setBusy(false); } }, { c: "#B03024", chico: true, disabled: busy })}</div>}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Fila de una solicitud (lista)
// ═══════════════════════════════════════════════════════════════════════════
const FilaSolicitud = ({ s, emps, fotoDe, onClick, hoy, mostrarPersona = true }) => {
  const emp = (emps || []).find(e => e.id === s.empId);
  const cerrada = !estaAbierta(s);
  return <div className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === "Enter") onClick(); }}
    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", opacity: cerrada ? .82 : 1 }}>
    <div style={{ width: 38, height: 38, borderRadius: 11, background: cerrada ? "rgba(44,42,40,.06)" : "rgba(232,118,45,.12)", color: cerrada ? "#6E6862" : "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={TIPO_ICO[s.tipo]} size={19} /></div>
    {mostrarPersona && <Avatar nombre={s.empNombre} dataUrl={emp ? fotoDe?.(emp) : null} size={34} radius={10} />}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}><span style={{ font: "700 14px/1.2 var(--sans)", color: CHARCOAL }}>{mostrarPersona ? s.empNombre : TIPOS[s.tipo]?.label}</span><span style={{ fontSize: 12.5, color: "#6E6862" }}>{mostrarPersona ? `${TIPOS[s.tipo]?.corto} · ` : ""}{detalleSolicitud(s)}</span></div>
      <div style={{ fontSize: 11.5, color: "#A39C92", marginTop: 2 }}>{s.enNombreDe ? `la pidió ${s.solicitadoPor?.nombre}` : "la pidió la persona"} · {hace(s.createdAt, hoy)}{s.adjuntos?.length ? ` · ${s.adjuntos.length} adjunto${s.adjuntos.length > 1 ? "s" : ""}` : ""}</div>
    </div>
    {chipEstado(s)}
    <Ico d={ICO.flecha} size={16} color="#A39C92" />
  </div>;
};

// ═══════════════════════════════════════════════════════════════════════════
// MI ASISTENCIA (GeoClock) — una fila por día
// ═══════════════════════════════════════════════════════════════════════════
function MiAsistencia({ emp, gcTardies, hoy, leerMarcas, noMarca }) {
  const qs = useMemo(() => quincenasRecientes(hoy, 4), [hoy]);
  const [qi, setQi] = useState(0);
  const [marks, setMarks] = useState({});
  const [cargando, setCargando] = useState(false);
  const q = qs[qi];
  const k = `${q.periodo}|${q.quincena}`;
  useEffect(() => { let vivo = true; if (marks[k]) return; setCargando(true); leerMarcas(q.periodo, q.quincena).then(arr => { if (vivo) setMarks(p => ({ ...p, [k]: Array.isArray(arr) ? arr : [] })); }).finally(() => { if (vivo) setCargando(false); }); return () => { vivo = false; }; }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const dias = useMemo(() => diasDeMarcas(marks[k] || [], emp.id, { decisiones: gcTardies, hoy }), [marks, k, emp.id, gcTardies, hoy]);
  const r = resumenAsistencia(dias);
  const tile = (v, l, c = CHARCOAL) => <div className="gt-vidrio" style={{ padding: "12px 14px" }}><div style={{ font: "800 24px/1 var(--display)", color: c, letterSpacing: "-.02em" }}>{v}</div><div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 5 }}>{l}</div></div>;
  const chipTarde = (d) => d.tardeEstado === "aprobada" ? <Chip c={C_VERDE}>Tarde {d.minTarde} min · aprobada</Chip> : d.tardeEstado === "denegada" ? <Chip c={C_ROJO}>Tarde {d.minTarde} min · se descuenta</Chip> : <Chip c={C_AMARILLO}>Tarde {d.minTarde} min · por decidir</Chip>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{qs.map((x, i) => pill(nombreQuincenaCorto(x), qi === i, () => setQi(i), { key: i }))}</div>
    {noMarca && <div style={{ fontSize: 12.5, color: "#6E6862" }}>Tu ficha dice que no marcás en la tablet: tu asistencia la lleva RRHH en la hoja de la quincena.</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
      {tile(r.dias, "días con marcaje")}{tile(fmtH(r.horas).replace(" h", ""), "horas laboradas")}{tile(r.tardes, "llegadas tarde", r.tardes ? "#A94E16" : CHARCOAL)}{tile(r.sinSalida, "sin marcar salida", r.sinSalida ? "#A94E16" : CHARCOAL)}
    </div>
    {cargando && !marks[k] ? <div style={{ fontSize: 12.5, color: "#6E6862" }}>Leyendo los marcajes…</div>
      : !dias.length ? <div className="gt-vidrio" style={{ padding: 24, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Sin marcajes en esta quincena.</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {dias.map(d => <div key={d.fecha} className="gt-vidrio" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", flexWrap: "wrap" }}>
          <div style={{ width: 54, flexShrink: 0 }}><div style={{ font: "800 15px/1 var(--display)", color: CHARCOAL }}>{d.fecha.slice(8)}</div><div style={{ fontSize: 11, color: "#6E6862", marginTop: 3 }}>{diaSemana(d.fecha)}</div></div>
          <div style={{ display: "flex", gap: 16, flex: 1, minWidth: 180 }}>
            <div><div style={LBL}>Entrada</div><div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: d.tarde ? "#A94E16" : CHARCOAL }}>{d.entrada || "—"}</div></div>
            <div><div style={LBL}>Salida</div><div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: d.sinSalida ? "#A94E16" : CHARCOAL }}>{d.salida || (d.sinSalida ? "no marcó" : "—")}</div></div>
            <div><div style={LBL}>Horas</div><div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700 }}>{d.horas == null ? "—" : fmtH(d.horas).replace(" h", "")}</div></div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{d.tarde && chipTarde(d)}{d.manual && <Chip c={C_AZUL}>Manual</Chip>}{d.ubicacion && <span style={{ fontSize: 11.5, color: "#A39C92" }}>{d.ubicacion}</span>}</div>
          {d.explicacion && <div style={{ width: "100%", fontSize: 12, color: "#6E6862" }}>“{d.explicacion}”</div>}
        </div>)}
      </div>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// MI RRHH — portal del colaborador
// ═══════════════════════════════════════════════════════════════════════════
// props: user {username, nombre, rol, empId}, yo (ficha vinculada o null),
// emps, vacs, solicitudes, fotoDe(emp), gcTardies, leerMarcas, onNueva(tipo),
// onAbrir(sol), onVincular(empId), elegirFicha (cuando no se encontró)
export function PortalRRHH({ user, yo, emps, vacs, lvs, solicitudes, fotoDe, gcTardies, leerMarcas, onNueva, onAbrir, onVincular, vinculoEstado }) {
  const isMobile = useIsMobile();
  const hoy = hoyISO();
  const [vista, setVista] = useState("inicio");   // inicio | asistencia
  const [q, setQ] = useState("");
  const [eligiendo, setEligiendo] = useState(false);
  const mias = useMemo(() => (solicitudes || []).filter(s => esMia(s, { username: user.username, empId: yo?.id })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), [solicitudes, user.username, yo?.id]);
  const abiertas = mias.filter(estaAbierta);
  const tomadas = yo ? vacacionesTomadas(vacs, yo.id, hoy.slice(0, 4)) : null;
  const proxima = yo ? (vacs || []).filter(v => v.employeeId === yo.id && v.status === "approved" && v.startDate >= hoy).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] : null;
  const permisosAnio = yo ? (lvs || []).filter(l => l.employeeId === yo.id && String(l.date || "").startsWith(hoy.slice(0, 4))).length : 0;
  const tarjeta = (ico, titulo, sub, onClick, { grande = false } = {}) => <div className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} onClick={onClick} onKeyDown={e => { if (e.key === "Enter") onClick(); }}
    style={{ padding: grande ? "18px 18px" : "16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", minHeight: 86 }}>
    <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ico} size={24} /></div>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL }}>{titulo}</div><div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 4 }}>{sub}</div></div>
    <Ico d={ICO.flecha} size={18} color="#A39C92" />
  </div>;
  const activos = (emps || []).filter(e => e.status !== "inactive").sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es"));
  const cand = q.trim().length >= 2 ? activos.filter(e => e.fullName.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  if (vista === "asistencia" && yo) return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><button type="button" className="gt-circulo" onClick={() => setVista("inicio")} aria-label="Atrás" style={{ width: 34, height: 34, fontSize: 15 }}>←</button><div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>Mi asistencia</div><span style={{ fontSize: 12.5, color: "#6E6862" }}>según tus marcajes en GeoClock</span></div>
    <MiAsistencia emp={yo} gcTardies={gcTardies} hoy={hoy} leerMarcas={leerMarcas} noMarca={!!yo.noMarca} />
  </div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div className="gt-vidrio" style={{ padding: isMobile ? 14 : 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      {yo ? <>
        <Avatar nombre={yo.fullName} dataUrl={fotoDe?.(yo)} size={56} radius={16} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ font: "800 19px/1.15 var(--display)", color: CHARCOAL, letterSpacing: "-.01em" }}>{yo.fullName}</div>
          <div style={{ fontSize: 13, color: "#6E6862", marginTop: 3 }}>{yo.position || "—"} · {yo.company === "subterra" ? "Subterra Honduras" : "Geotecnica Soluciones"}{yo.startDate ? ` · desde ${fechaLarga(yo.startDate)}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {abiertas.length > 0 && <Chip c={C_NARANJA}>{abiertas.length} solicitud{abiertas.length > 1 ? "es" : ""} en trámite</Chip>}
          {proxima && <Chip c={C_VERDE}>Vacaciones {rangoCorto(proxima.startDate, proxima.endDate)}</Chip>}
        </div>
      </> : <div style={{ flex: 1 }}>
        <div style={{ font: "800 17px/1.2 var(--display)", color: CHARCOAL }}>Hola, {user.nombre}</div>
        <div style={{ fontSize: 13, color: "#6E6862", marginTop: 4 }}>{vinculoEstado === "ambiguo" ? "Hay más de una ficha con tu nombre. Elegí la tuya para ver tu asistencia y pedir por vos." : "No encontramos tu ficha de colaborador. Elegila para ver tu asistencia y pedir por vos; igual podés pedir en nombre de otra persona."}</div>
        {!eligiendo ? <div style={{ marginTop: 10 }}>{btn("Elegir mi ficha", () => setEligiendo(true), { c: ORANGE_DARK, lleno: true, chico: true })}</div>
          : <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tu nombre…" style={CTRL} />
            {cand.map(e => <button key={e.id} type="button" onClick={async () => { if (!confirm(`¿Tu ficha es la de ${e.fullName}?`)) return; if (await onVincular(e.id)) { setEligiendo(false); setQ(""); } }} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 10px", borderRadius: 12, border: "1px solid rgba(44,42,40,.08)", background: "rgba(255,255,255,.8)", cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}><Avatar nombre={e.fullName} dataUrl={fotoDe?.(e)} size={30} radius={9} /><div><div style={{ fontWeight: 700, fontSize: 13.5, color: CHARCOAL }}>{e.fullName}</div><div style={{ fontSize: 11.5, color: "#6E6862" }}>{e.position || ""} · {e.company === "subterra" ? "Subterra" : "Geotecnica"}</div></div></button>)}
          </div>}
      </div>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
      {yo && tarjeta(ICO.asistencia, "Mi asistencia", "Entradas, salidas y horas según GeoClock", () => setVista("asistencia"))}
      {tarjeta(ICO.vacaciones, "Vacaciones", yo ? `${tomadas?.diasAnio || 0} días tomados este año${proxima ? ` · próximas ${rangoCorto(proxima.startDate, proxima.endDate)}` : ""}` : "Pedir vacaciones", () => onNueva("vacaciones"))}
      {tarjeta(ICO.permiso, "Permisos", yo && permisosAnio ? `${permisosAnio} este año · pedir uno nuevo` : "Pedir un permiso por un día o varios", () => onNueva("permiso"))}
      {tarjeta(ICO.constancia, "Constancias", "Laboral o de ingresos, en PDF", () => onNueva("constancia"))}
      {tarjeta(ICO.reporte, "Reportar un problema", "Pago, asistencia, equipo, seguridad…", () => onNueva("reporte"))}
    </div>
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "6px 2px 10px" }}><span style={{ font: "800 16px/1 var(--display)", color: CHARCOAL }}>Mis solicitudes</span><span style={{ font: "600 13px/1 var(--sans)", color: "#A39C92" }}>{mias.length}</span></div>
      {mias.length === 0 ? <div className="gt-vidrio" style={{ padding: 26, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Todavía no has pedido nada. Tocá una de las cajitas de arriba.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{mias.slice(0, 30).map(s => <FilaSolicitud key={s.id} s={s} emps={emps} fotoDe={fotoDe} hoy={hoy} onClick={() => onAbrir(s)} mostrarPersona={!yo || s.empId !== yo.id} />)}</div>}
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// BANDEJA de RRHH — todas las solicitudes
// ═══════════════════════════════════════════════════════════════════════════
export function BandejaRRHH({ user, emps, solicitudes, fotoDe, onAbrir, onNueva, co }) {
  const isMobile = useIsMobile();
  const hoy = hoyISO();
  const [estado, setEstado] = useState("abiertas");   // abiertas | decididas | todas
  const [tipo, setTipo] = useState("");
  const [q, setQ] = useState("");
  const visibles = useMemo(() => (solicitudes || []).filter(s => !(s.tipo === "reporte" && s.confidencial) || ["admin", "tesoreria"].includes(user.rol)), [solicitudes, user.rol]);
  const base = visibles.filter(s => !co || !s.company || s.company === co);
  const lista = base.filter(s => (estado === "abiertas" ? estaAbierta(s) : estado === "decididas" ? !estaAbierta(s) : true) && (!tipo || s.tipo === tipo) && (!q.trim() || `${s.empNombre} ${s.folio} ${s.solicitadoPor?.nombre} ${detalleSolicitud(s)}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (estaAbierta(a) === estaAbierta(b) ? String(b.createdAt).localeCompare(String(a.createdAt)) : estaAbierta(a) ? -1 : 1));
  const abiertas = base.filter(estaAbierta);
  const n = (t) => abiertas.filter(s => s.tipo === t).length;
  const tile = (t, l, ico) => { const on = tipo === t; return <div key={t} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} aria-pressed={on} onClick={() => setTipo(on ? "" : t)} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", boxShadow: on ? `inset 0 0 0 2px ${ORANGE}` : undefined }}>
    <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ico} size={19} /></div>
    <div><div style={{ font: "800 22px/1 var(--display)", color: n(t) ? "#A94E16" : CHARCOAL }}>{n(t)}</div><div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 3 }}>{l}</div></div></div>; };
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(0,1fr))", gap: 8 }}>
      <div className="gt-vidrio" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 36, height: 36, borderRadius: 11, background: CHARCOAL, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Ico d={ICO.bandeja} size={19} /></div><div><div style={{ font: "800 22px/1 var(--display)", color: CHARCOAL }}>{abiertas.length}</div><div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 3 }}>por decidir</div></div></div>
      {tile("vacaciones", "vacaciones", ICO.vacaciones)}{tile("permiso", "permisos", ICO.permiso)}{tile("constancia", "constancias", ICO.constancia)}{tile("reporte", "reportes", ICO.reporte)}
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 6 }}>{pill("Por decidir", estado === "abiertas", () => setEstado("abiertas"))}{pill("Decididas", estado === "decididas", () => setEstado("decididas"))}{pill("Todas", estado === "todas", () => setEstado("todas"))}</div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o folio…" style={{ ...CTRL, width: isMobile ? "100%" : 260, minHeight: 36, padding: "6px 12px" }} />
      {tipo && btn("Limpiar", () => setTipo(""), { chico: true })}
      <div style={{ flex: 1 }} />
      {btn("+ Nueva solicitud", () => onNueva("vacaciones"), { c: ORANGE_DARK, lleno: true, chico: true })}
    </div>
    {lista.length === 0 ? <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#6E6862" }}>{estado === "abiertas" ? "Nada por decidir. 🙌" : "Sin solicitudes."}</div>
      : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{lista.slice(0, 120).map(s => <FilaSolicitud key={s.id} s={s} emps={emps} fotoDe={fotoDe} hoy={hoy} onClick={() => onAbrir(s)} />)}</div>}
  </div>;
}

// Modal de vidrio compartido (encima del fieldset de solo lectura).
export const ModalHub = ({ title, onClose, children, wide }) => <Modal title={title} onClose={onClose} wide={wide}>{children}</Modal>;
