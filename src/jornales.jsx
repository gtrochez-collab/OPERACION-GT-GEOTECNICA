// =====================================================================
// JORNALES — personal por día (10-nov-2026, pedido de Gerson)
// =====================================================================
// 1) FICHAS: cada jornal tiene su ficha como un empleado (foto, identidad
//    escaneada frente/reverso, teléfono, cargo y CUÁNTO GANA AL DÍA), pero
//    SIN contrato y en su propia lista `hr-jornaleros` — nunca se mezclan con
//    hr-emps5 (ni planilla, ni cuadrillas, ni GeoClock, ni costos MO).
// 2) ASISTENCIA por proyecto y por CORTE (sábado → viernes, 2 semanas), la
//    lleva el ingeniero de campo desde Mi RRHH (y RRHH desde Asistencia):
//    `hr-jornal-<corteId>` = { corte, proyectos: { [short]: {jornaleros,
//    dias {id:{fecha:v}}, he {id:{fecha:h}}, tarifas, encargado,
//    observaciones, updatedAt, updatedBy, asistenciaPor} } }.
//    El INGENIERO solo marca días y horas extra (11-nov, Gerson: "no pueden
//    decidir si contratar a alguien"): fichas, quién trabaja en cada proyecto,
//    pago por día, "depositar a" y la solicitud de pago son de RRHH. La lista
//    de cada proyecto pasa sola al corte siguiente.
//    Se guarda con mezcla a TRES VÍAS (lo que cambié yo sobre lo que hay en
//    la nube, celda por celda) + verificación + segunda lectura, y el
//    borrador vive en localStorage hasta que se guarda (en el campo la señal
//    se cae).
// 3) SOLICITUD DE PAGO por proyecto: PDF apaisado (y Excel) con las
//    identidades en las hojas siguientes.
// La lógica pura vive en jornales-calc.js (con pruebas).
// =====================================================================
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { store } from "./supabase.js";
import { hoyISO } from "./fechas.js";
import { esSV, OPERACION } from "./operacion.js";
import { safeDynamicImport } from "./lazyLoad.js";
import { Modal, Chip, C_GRIS, C_VERDE, C_AMARILLO, C_NARANJA, ORANGE, ORANGE_DARK, CHARCOAL, uid, useIsMobile } from "./geocost-ui.jsx";
import { VisorArchivo } from "./visor-archivo.jsx";
import { abrirReporte } from "./reporte-estilo.js";
import {
  KEY_JORNALEROS, keyCorteJornal, corteDe, corteAnterior, corteSiguiente, diasDelCorte, diaCorto, fechaCorta, fechaLarga,
  nombreCorte, proyectoVacio, ponerCelda, mezclarProyecto, cambiosEntre, liquidarProyecto, validarJornalero, formatoDni,
  tieneIdentidad, valorHora, num, MAX_HE_DIA,
} from "./jornales-calc.js";

export const EMPRESA_JORNALES = esSV ? "subterra" : "geotecnica";
const LUGAR = esSV ? "San Salvador" : "Tegucigalpa, M.D.C.";
/** Quién maneja las fichas y ve todos los proyectos (RRHH). */
export const ROLES_RRHH_JORNAL = ["admin", "tesoreria", "asistente_compras"];
/** Quién lleva la asistencia de jornales desde Mi RRHH. */
export const ROLES_CAMPO_JORNAL = ["residente", ...ROLES_RRHH_JORNAL];
const ROLES_SOLO_VER = ["gerencia", "costos"];

const C_ROJO = { color: "#B03024", bg: "rgba(192,57,43,.07)" };
const fmtL = (n) => "L " + (Number(n) || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtL0 = (n) => "L " + (Number(n) || 0).toLocaleString("es-HN", { maximumFractionDigits: 0 });
const fmtN = (n) => { const v = Number(n) || 0; return v % 1 ? v.toLocaleString("es-HN", { maximumFractionDigits: 1 }) : String(v); };
const LBL = { fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" };
const CTRL = { minHeight: 42, padding: "9px 12px", borderRadius: 12, border: "1px solid rgba(44,42,40,.12)", background: "rgba(255,255,255,.85)", fontSize: 14, fontFamily: "inherit", color: CHARCOAL, width: "100%", boxSizing: "border-box", outline: "none" };
const Ico = ({ d, size = 20, color = "currentColor" }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
const I = {
  casco: <><path d="M2.5 17.5h19" /><path d="M4.5 17.5V15a7.5 7.5 0 0115 0v2.5" /><path d="M10 8V5.2h4V8" /><path d="M8.2 9.2l.8 4.3M15.8 9.2l-.8 4.3" /></>,
  contrato: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h5M9.5 16.5h5" /></>,
  flecha: <path d="M9 6l6 6-6 6" />,
  id: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.8 15.6c.5-1.3 1.5-2 2.7-2s2.2.7 2.7 2" /><path d="M14 10h4M14 13h3" /></>,
  camara: <><path d="M4 8h3l1.6-2.2h6.8L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.4" /></>,
};
const btn = (label, onClick, { c = CHARCOAL, lleno = false, chico = false, disabled = false, key, title, style } = {}) => <button key={key} type="button" title={title} onClick={onClick} disabled={disabled}
  style={{ minHeight: chico ? 36 : 44, padding: chico ? "7px 13px" : "10px 18px", borderRadius: 12, border: lleno ? "1px solid transparent" : `1px solid ${c === CHARCOAL ? "rgba(44,42,40,.14)" : c + "55"}`, background: lleno ? c : "rgba(255,255,255,.75)", color: lleno ? "#fff" : c, font: `700 ${chico ? 12.5 : 13.5}px/1 var(--sans)`, cursor: disabled ? "default" : "pointer", opacity: disabled ? .5 : 1, whiteSpace: "nowrap", ...style }}>{label}</button>;
const pill = (label, on, onClick, { key } = {}) => <button key={key} type="button" onClick={onClick} aria-pressed={on}
  style={{ padding: "7px 13px", borderRadius: 999, border: on ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: on ? ORANGE_DARK : "rgba(255,255,255,.7)", color: on ? "#fff" : CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>;
const tile = (v, l, c = CHARCOAL) => <div className="gt-vidrio" style={{ padding: "12px 14px", minWidth: 0 }}><div style={{ font: "800 22px/1 var(--display)", color: c, letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div><div style={{ fontSize: 11.5, color: "#6E6862", marginTop: 5 }}>{l}</div></div>;
const aviso = (txt, c = C_AMARILLO) => <div style={{ background: c.bg, color: c.color, borderRadius: 14, padding: "10px 14px", fontSize: 12.5, lineHeight: 1.45 }}>{txt}</div>;

// ── Fotos (cp-file-<id>): cache en memoria y carga perezosa ──────────────
const cacheFotos = new Map();
const pidiendo = new Map();
const bajarFoto = (fileId) => {
  if (!fileId) return Promise.resolve(null);
  if (cacheFotos.has(fileId)) return Promise.resolve(cacheFotos.get(fileId));
  if (!pidiendo.has(fileId)) pidiendo.set(fileId, store.getCloud(`cp-file-${fileId}`).then(f => { const d = f?.dataUrl || null; cacheFotos.set(fileId, d); return d; }).catch(() => null).finally(() => pidiendo.delete(fileId)));
  return pidiendo.get(fileId);
};
function useFoto(fileId) {
  const [d, setD] = useState(() => cacheFotos.get(fileId) || null);
  useEffect(() => { let vivo = true; if (!fileId) { setD(null); return; } bajarFoto(fileId).then(x => { if (vivo) setD(x); }); return () => { vivo = false; }; }, [fileId]);
  return d;
}
const Avatar = ({ nombre, fileId, size = 40, radius = 12 }) => {
  const foto = useFoto(fileId);
  const ini = String(nombre || "?").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, overflow: "hidden", background: foto ? "#EEE" : "rgba(44,42,40,.07)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6E6862", font: `800 ${Math.round(size * 0.36)}px/1 var(--display)` }}>
    {foto ? <img src={foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : ini}
  </div>;
};
const leerDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
const cargarImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("No se pudo leer la imagen")); im.src = src; });
const aJpeg = (fuente, w, h, MAX, calidad) => { const sc = Math.min(1, MAX / Math.max(w, h)); const c = document.createElement("canvas"); c.width = Math.round(w * sc); c.height = Math.round(h * sc); const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(fuente, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", calidad); };
/** Un PDF escaneado → su primera hoja como imagen (para pegarla en el reporte). */
async function pdfAImagen(file) {
  const pdfjs = await safeDynamicImport(() => import("pdfjs-dist"), "lector de PDF");
  const worker = await safeDynamicImport(() => import("pdfjs-dist/build/pdf.worker.min.mjs?url"), "lector de PDF");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pag = await doc.getPage(1);
  const vp = pag.getViewport({ scale: 2 });
  const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
  await pag.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  return aJpeg(c, c.width, c.height, 1600, 0.82);
}
/** Sube una foto (o un PDF escaneado, convertido a imagen) a cp-file-<id>. */
async function subirImagen(file, MAX) {
  let dataUrl;
  if (file.type === "application/pdf") dataUrl = await pdfAImagen(file);
  else if (/^image\//.test(file.type)) { const im = await cargarImg(await leerDataUrl(file)); dataUrl = aJpeg(im, im.naturalWidth, im.naturalHeight, MAX, 0.82); }
  else throw new Error("Solo fotos o PDF.");
  const fileId = uid();
  const rec = { name: (file.name || "foto").replace(/\.pdf$/i, ".jpg"), type: "image/jpeg", size: dataUrl.length, dataUrl };
  if (!(await store.set(`cp-file-${fileId}`, rec))) throw new Error("No se pudo subir a la nube. Revisá la señal y probá otra vez.");
  cacheFotos.set(fileId, dataUrl);
  return { fileId, name: rec.name, size: rec.size };
}

// ── Fichas: hook compartido (lee y guarda hr-jornaleros SOLO con getCloud) ──
export function useJornaleros() {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const cargar = useCallback(async () => {
    try { const c = await store.getCloud(KEY_JORNALEROS); setLista(Array.isArray(c) ? c : []); setError(""); }
    catch (e) { setError("No se pudo leer la lista de jornales de la nube. Revisá la conexión y tocá ↻."); setLista(l => l || []); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  const guardar = useCallback(async (rec) => {
    let nube;
    try { nube = await store.getCloud(KEY_JORNALEROS); } catch { alert("No hay conexión con la nube: no se guardó. Probá otra vez."); return false; }
    const arr = Array.isArray(nube) ? nube : [];
    const next = arr.some(x => x.id === rec.id) ? arr.map(x => x.id === rec.id ? rec : x) : [...arr, rec];
    if (!(await store.set(KEY_JORNALEROS, next))) { alert("No se pudo guardar en la nube. Probá otra vez."); return false; }
    try {
      const v = await store.getCloud(KEY_JORNALEROS);
      if (!Array.isArray(v) || !v.some(x => x.id === rec.id && x.updatedAt === rec.updatedAt)) { alert("Se guardó, pero no pude confirmarlo en la nube. Tocá ↻ para revisar."); setLista(Array.isArray(v) ? v : next); return false; }
      setLista(v);
    } catch { setLista(next); }
    return true;
  }, []);
  return { lista, error, cargar, guardar };
}

// ── Ficha del jornal: formulario ─────────────────────────────────────────
function CampoFoto({ titulo, sub, valor, onCambio, MAX, accept = "image/*", capture, alto = 110 }) {
  const [subiendo, setSubiendo] = useState(false);
  const foto = useFoto(valor?.fileId);
  const ref = useRef(null);
  return <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
    <span style={LBL}>{titulo}</span>
    <button type="button" onClick={() => ref.current?.click()} disabled={subiendo}
      style={{ height: alto, borderRadius: 14, border: foto ? "1px solid rgba(44,42,40,.1)" : "1.5px dashed rgba(44,42,40,.22)", background: foto ? "#F4F2EF" : "rgba(255,255,255,.6)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 0, color: "#8A847D", fontFamily: "inherit" }}>
      {subiendo ? <span style={{ fontSize: 12.5 }}>Subiendo…</span> : foto ? <img src={foto} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
        : <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12 }}><Ico d={I.camara} size={22} />{sub}</span>}
    </button>
    {foto && !subiendo && <button type="button" onClick={() => ref.current?.click()} style={{ border: "none", background: "none", color: ORANGE_DARK, font: "700 12px/1 var(--sans)", cursor: "pointer", padding: 2, alignSelf: "flex-start" }}>Cambiar</button>}
    <input ref={ref} type="file" accept={accept} capture={capture} style={{ display: "none" }} onChange={async (e) => {
      const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
      setSubiendo(true);
      try { onCambio(await subirImagen(f, MAX)); } catch (err) { alert(err?.message || String(err)); } finally { setSubiendo(false); }
    }} />
  </div>;
}

export function JornalFormImpl({ inicial, todos, puedeTarifa, user, onGuardar, onClose }) {
  const nuevo = !inicial;
  const sugerida = useMemo(() => { const c = {}; (todos || []).forEach(j => { if (j.salarioDia) c[j.salarioDia] = (c[j.salarioDia] || 0) + 1; }); return Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]) || ""; }, [todos]);
  const [f, setF] = useState(() => inicial ? { ...inicial } : { fullName: "", dni: "", phone: "", position: "Ayudante", salarioDia: sugerida, notas: "", status: "active" });
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const tarifaBloqueada = !nuevo && !puedeTarifa;
  const isMobile = useIsMobile();
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "120px minmax(0,1fr)", gap: 14 }}>
      <CampoFoto titulo="Foto" sub="Tomar foto" valor={f.photo} onCambio={(v) => u("photo", v)} MAX={600} capture="user" alto={isMobile ? 120 : 140} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, alignContent: "start" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}><span style={LBL}>Nombre completo *</span><input value={f.fullName} onChange={e => u("fullName", e.target.value)} placeholder="Como aparece en la identidad" style={CTRL} /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Identidad *</span><input value={f.dni} inputMode="numeric" onChange={e => u("dni", formatoDni(e.target.value))} placeholder="0801-1990-12345" style={{ ...CTRL, fontFamily: "var(--mono)" }} /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Teléfono</span><input value={f.phone || ""} inputMode="tel" onChange={e => u("phone", e.target.value)} placeholder="9999-9999" style={CTRL} /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Cargo</span><input value={f.position || ""} onChange={e => u("position", e.target.value)} list="jornal-cargos" style={CTRL} />
          <datalist id="jornal-cargos">{["Ayudante", "Ayudante de concreto", "Albañil", "Armador", "Carpintero", "Soldador", "Operador", "Vigilante"].map(x => <option key={x} value={x} />)}</datalist></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Pago por día (L) *</span><input value={f.salarioDia} inputMode="decimal" disabled={tarifaBloqueada} onChange={e => u("salarioDia", e.target.value.replace(/[^\d.]/g, ""))} style={{ ...CTRL, fontFamily: "var(--mono)", opacity: tarifaBloqueada ? .6 : 1 }} />
          <span style={{ fontSize: 11.5, color: "#8A847D" }}>{num(f.salarioDia) > 0 ? `Hora extra: ${fmtL(valorHora(f.salarioDia))} (el día ÷ 8)` : "La hora extra sale del día ÷ 8"}{tarifaBloqueada ? " · lo cambia RRHH" : ""}</span></label>
      </div>
    </div>
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}><span style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>Identidad escaneada</span><span style={{ fontSize: 12, color: "#8A847D" }}>va en cada solicitud de pago · foto o PDF</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <CampoFoto titulo="Frente *" sub="Foto o PDF" valor={f.dniFrente} onCambio={(v) => u("dniFrente", v)} MAX={1400} accept="image/*,application/pdf" capture="environment" />
        <CampoFoto titulo="Reverso" sub="Foto o PDF" valor={f.dniReverso} onCambio={(v) => u("dniReverso", v)} MAX={1400} accept="image/*,application/pdf" capture="environment" />
      </div>
    </div>
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Notas</span><textarea value={f.notas || ""} onChange={e => u("notas", e.target.value)} rows={2} style={{ ...CTRL, resize: "vertical" }} /></label>
    {!nuevo && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={LBL}>Estado</span>{pill("Activo", f.status !== "inactive", () => u("status", "active"))}{pill("Ya no trabaja con nosotros", f.status === "inactive", () => u("status", "inactive"))}</div>}
    {!tieneIdentidad(f) && aviso("Sin la identidad escaneada se puede guardar, pero la solicitud de pago va a salir con «Falta escanear».")}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
      {btn("Cancelar", onClose, { disabled: saving })}
      {btn(saving ? "Guardando…" : nuevo ? "Crear jornal" : "Guardar", async () => {
        const rec = { ...f, fullName: String(f.fullName || "").trim().replace(/\s+/g, " "), salarioDia: num(f.salarioDia) };
        const err = validarJornalero(rec, todos); if (err) return alert(err);
        setSaving(true);
        try {
          const at = new Date().toISOString();
          const ok = await onGuardar({ ...rec, id: rec.id || uid(), company: rec.company || EMPRESA_JORNALES, status: rec.status || "active", updatedAt: at, updatedBy: user.nombre, ...(nuevo ? { createdAt: at, createdBy: user.nombre } : {}) });
          if (ok) onClose();
        } finally { setSaving(false); }
      }, { c: ORANGE_DARK, lleno: true, disabled: saving })}
    </div>
  </div>;
}

function JornalDetalle({ j, puedeEditar, onEditar, onClose }) {
  const frente = useFoto(j.dniFrente?.fileId), reverso = useFoto(j.dniReverso?.fileId);
  const [visor, setVisor] = useState(null);
  const fila = (l, v) => v ? <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "8px 0", borderBottom: "1px solid rgba(44,42,40,.06)" }}><span style={{ fontSize: 12.5, color: "#6E6862" }}>{l}</span><span style={{ font: "600 13px/1.3 var(--sans)", color: CHARCOAL, textAlign: "right" }}>{v}</span></div> : null;
  const marco = (img, t) => <button type="button" onClick={() => img && setVisor({ name: `${t} ${j.fullName}.jpg`, type: "image/jpeg", dataUrl: img })} style={{ height: 130, borderRadius: 12, background: "#F4F2EF", border: "1px solid rgba(44,42,40,.07)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: img ? "zoom-in" : "default", padding: 0 }}>
    {img ? <img src={img} alt={t} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 12, color: t === "Frente" ? "#B03024" : "#A39C92", fontWeight: 700 }}>{t === "Frente" ? "Falta escanear" : "Sin reverso"}</span>}
  </button>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Avatar nombre={j.fullName} fileId={j.photo?.fileId} size={72} radius={20} />
      <div style={{ minWidth: 0 }}>
        <div style={{ font: "800 19px/1.2 var(--display)", color: CHARCOAL }}>{j.fullName}</div>
        <div style={{ fontSize: 13, color: "#6E6862", marginTop: 3 }}>{j.position || "Jornal"} · <span style={{ fontFamily: "var(--mono)" }}>{j.dni}</span></div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{j.status === "inactive" ? <Chip c={C_GRIS}>Ya no trabaja</Chip> : <Chip c={C_VERDE}>Activo</Chip>}{tieneIdentidad(j) ? <Chip c={C_VERDE}>Identidad escaneada</Chip> : <Chip c={C_AMARILLO}>Falta identidad</Chip>}</div>
      </div>
    </div>
    <div>
      {fila("Pago por día", fmtL(j.salarioDia))}
      {fila("Hora extra", `${fmtL(valorHora(j.salarioDia))} (el día ÷ 8)`)}
      {fila("Teléfono", j.phone)}
      {fila("Notas", j.notas)}
      {fila("Registrado por", j.createdBy ? `${j.createdBy}${j.createdAt ? ` · ${fechaCorta(j.createdAt.slice(0, 10))}` : ""}` : null)}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{marco(frente, "Frente")}{marco(reverso, "Reverso")}</div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>{btn("Cerrar", onClose)}{puedeEditar && btn("Editar ficha", onEditar, { c: ORANGE_DARK, lleno: true })}</div>
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}

// ── GeoTeam → Empleados → pill "Jornales" ───────────────────────────────
function TarjetaJornal({ j, onClick, i }) {
  const foto = useFoto(j.photo?.fileId);
  return <div role="button" tabIndex={0} className="gt-vidrio gt-vidrio-hover gt-sube" onClick={onClick} onKeyDown={e => { if (e.key === "Enter") onClick(); }}
    style={{ height: 250, borderRadius: 22, cursor: "pointer", overflow: "hidden", display: "flex", flexDirection: "column", opacity: j.status === "inactive" ? .62 : 1, animationDelay: `${Math.min(i, 12) * 25}ms` }}>
    <div style={{ height: 62, flexShrink: 0, background: "linear-gradient(135deg,#2C2A28 0%,#3A3633 100%)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <span style={{ font: "700 9px/1 var(--mono)", letterSpacing: ".16em", color: "rgba(255,255,255,.85)", textTransform: "uppercase", marginTop: 4 }}>Jornal</span>
      <span style={{ font: "700 10px/1 var(--mono)", padding: "4px 8px", borderRadius: 999, background: "rgba(232,118,45,.9)", color: "#fff" }}>{fmtL0(j.salarioDia)} / día</span>
    </div>
    <div style={{ display: "flex", justifyContent: "center", marginTop: -34 }}>
      <div style={{ padding: 3, borderRadius: 22, background: "rgba(255,255,255,.95)", boxShadow: "0 6px 18px rgba(44,42,40,.18)" }}>
        <div style={{ width: 80, height: 80, borderRadius: 19, overflow: "hidden", background: "rgba(44,42,40,.07)", display: "flex", alignItems: "center", justifyContent: "center", font: "800 26px/1 var(--display)", color: "#8A847D" }}>{foto ? <img src={foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : String(j.fullName || "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}</div>
      </div>
    </div>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "10px 14px 12px", gap: 3 }}>
      <div style={{ font: "800 14.5px/1.22 var(--display)", color: CHARCOAL }}>{j.fullName}</div>
      <div style={{ fontSize: 12, color: "#6E6862" }}>{j.position || "Jornal"}</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", paddingTop: 9, borderTop: "1px solid rgba(44,42,40,.07)", gap: 6 }}>
        <span style={{ font: "600 10.5px/1 var(--mono)", color: "#8A847D" }}>{j.dni}</span>
        {tieneIdentidad(j) ? <span style={{ font: "700 10.5px/1 var(--sans)", color: "#177243" }}>ID ✓</span> : <span style={{ font: "700 10.5px/1 var(--sans)", color: "#8A5A00" }}>Falta ID</span>}
      </div>
    </div>
  </div>;
}

export function FichasJornales({ q = "", rol, user }) {
  const isMobile = useIsMobile();
  const { lista, error, cargar, guardar } = useJornaleros();
  const [filtro, setFiltro] = useState("activos");
  const [modal, setModal] = useState(null); // {t:"ver"|"editar"|"nuevo", j}
  const puedeEditar = ROLES_RRHH_JORNAL.includes(rol);
  if (!lista) return <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Cargando jornales…</div>;
  const qq = q.trim().toLowerCase();
  const base = lista.filter(j => !qq || [j.fullName, j.dni, j.position, j.phone].filter(Boolean).join(" ").toLowerCase().includes(qq));
  const activos = base.filter(j => j.status !== "inactive");
  const sinId = activos.filter(j => !tieneIdentidad(j));
  const vista = (filtro === "activos" ? activos : filtro === "sinid" ? sinId : base.filter(j => j.status === "inactive")).slice().sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es"));
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {error && aviso(error, C_ROJO)}
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {pill(`Activos ${activos.length}`, filtro === "activos", () => setFiltro("activos"))}
      {(sinId.length > 0 || filtro === "sinid") && pill(`Falta identidad ${sinId.length}`, filtro === "sinid", () => setFiltro("sinid"))}
      {pill(`Ya no trabajan ${base.length - activos.length}`, filtro === "inactivos", () => setFiltro("inactivos"))}
      <span style={{ fontSize: 12.5, color: "#8A847D" }}>Personal por día · sin contrato · lo paga {EMPRESA_JORNALES === "subterra" ? "Subterra" : "Geotecnica"}</span>
      <div style={{ flex: 1 }} />
      <span role="button" title="Volver a leer de la nube" aria-label="Actualizar" className="gt-circulo" onClick={cargar} style={{ width: 38, height: 38, fontSize: 15 }}>↻</span>
      {puedeEditar && btn("+ Nuevo jornal", () => setModal({ t: "nuevo" }), { c: ORANGE_DARK, lleno: true, chico: true })}
    </div>
    {vista.length === 0 ? <div className="gt-vidrio" style={{ padding: 36, textAlign: "center", fontSize: 13.5, color: "#6E6862" }}>{lista.length === 0 ? "Todavía no hay jornales registrados. Los ingenieros también los pueden agregar desde Mi RRHH → Asistencia de campo." : "Nadie coincide."}</div>
      : <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 158 : 210}px, 1fr))`, gap: isMobile ? 10 : 16 }}>{vista.map((j, i) => <TarjetaJornal key={j.id} j={j} i={i} onClick={() => setModal({ t: "ver", j })} />)}</div>}
    {modal?.t === "ver" && <Modal title="Ficha del jornal" onClose={() => setModal(null)}><JornalDetalle j={lista.find(x => x.id === modal.j.id) || modal.j} puedeEditar={puedeEditar} onEditar={() => setModal({ t: "editar", j: lista.find(x => x.id === modal.j.id) || modal.j })} onClose={() => setModal(null)} /></Modal>}
    {(modal?.t === "editar" || modal?.t === "nuevo") && <Modal title={modal.t === "nuevo" ? "Nuevo jornal" : "Editar jornal"} wide onClose={() => setModal(null)} fondoCierra={false}>
      <JornalFormImpl inicial={modal.j || null} todos={lista} puedeTarifa={puedeEditar} user={user} onGuardar={guardar} onClose={() => setModal(null)} /></Modal>}
  </div>;
}

// ── Mi RRHH → Asistencia de campo ───────────────────────────────────────
export function AsistenciaCampo({ user, rol, proyectos, onVolver }) {
  const [sub, setSub] = useState("");
  const isMobile = useIsMobile();
  if (sub === "jornales") return <AsistenciaJornales user={user} rol={rol} proyectos={proyectos} onVolver={() => setSub("")} />;
  const caja = (ico, titulo, texto, onClick, apagada) => <div className={`gt-vidrio ${apagada ? "" : "gt-vidrio-hover"}`} role={apagada ? undefined : "button"} tabIndex={apagada ? -1 : 0} onClick={apagada ? undefined : onClick} onKeyDown={e => { if (!apagada && e.key === "Enter") onClick(); }}
    style={{ padding: isMobile ? 18 : "26px 28px", display: "flex", flexDirection: "column", gap: 16, cursor: apagada ? "default" : "pointer", opacity: apagada ? .62 : 1, minHeight: isMobile ? 0 : 220, borderRadius: 22 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ width: 56, height: 56, borderRadius: 18, background: apagada ? "rgba(44,42,40,.06)" : "rgba(232,118,45,.12)", color: apagada ? "#8A847D" : "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center" }}><Ico d={ico} size={28} /></div>
      {apagada ? <Chip c={C_GRIS}>Por ahora la lleva Ana</Chip> : <Ico d={I.flecha} size={20} color="#A39C92" />}
    </div>
    <div><div style={{ font: "800 22px/1.15 var(--display)", color: CHARCOAL }}>{titulo}</div><div style={{ fontSize: 13.5, color: "#6E6862", marginTop: 6, lineHeight: 1.45 }}>{texto}</div></div>
  </div>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><button type="button" className="gt-circulo" onClick={onVolver} aria-label="Atrás" style={{ width: 34, height: 34, fontSize: 15 }}>←</button><div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>Asistencia de campo</div></div>
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
      {caja(I.casco, "Jornales", "Personal por día. Marcás quién vino cada día y sus horas extra; el sistema calcula el pago del corte.", () => setSub("jornales"))}
      {caja(I.contrato, "Por contrato", "Permanentes y temporales. Por ahora su asistencia la sigue llevando Ana desde GeoTeam.", null, true)}
    </div>
  </div>;
}

// ── Editor de un día (celda) ─────────────────────────────────────────────
const OPCIONES_DIA = [[0, "No vino"], [0.5, "½ día"], [1, "Día"], [2, "Doble"]];
const OPCIONES_DIA_CORTO = [[0, "No vino"], [0.5, "½"], [1, "Día"], [2, "Doble"]];
function ControlDia({ valor, onValor, he, onHe, disabled, compacto, heNota }) {
  const v = valor === undefined || valor === "" ? null : Number(valor);
  const h = num(he);
  return <div style={{ display: "flex", alignItems: "center", gap: compacto ? 6 : 10, flexWrap: "wrap" }}>
    <div style={{ display: "inline-flex", background: "rgba(44,42,40,.06)", borderRadius: 12, padding: 3, gap: 2 }}>
      {(compacto ? OPCIONES_DIA_CORTO : OPCIONES_DIA).map(([x, l]) => { const on = v === x; return <button key={x} type="button" disabled={disabled} onClick={() => onValor(on ? "" : x)} aria-pressed={on}
        style={{ minWidth: compacto ? 30 : 58, minHeight: 36, padding: compacto ? "0 7px" : "0 8px", borderRadius: 10, border: "none", cursor: disabled ? "default" : "pointer", font: "700 12.5px/1 var(--sans)",
          background: on ? (x === 0 ? "#B03024" : x === 0.5 ? "#8A5A00" : "#fff") : "transparent", color: on ? (x === 0 || x === 0.5 ? "#fff" : CHARCOAL) : "#6E6862", boxShadow: on && x >= 1 ? "0 1px 4px rgba(44,42,40,.15)" : "none" }}>{l}</button>; })}
    </div>
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={heNota || "Horas extra"}>
      <span style={{ font: "700 11px/1 var(--sans)", color: "#8A847D", marginRight: 2 }}>HE</span>
      <button type="button" disabled={disabled || h <= 0} onClick={() => onHe(h - 1 <= 0 ? "" : h - 1)} style={{ width: compacto ? 30 : 34, height: 34, borderRadius: 10, border: "1px solid rgba(44,42,40,.12)", background: "#fff", cursor: "pointer", fontSize: 16, color: CHARCOAL }}>−</button>
      <input value={h || ""} inputMode="decimal" disabled={disabled} placeholder="0" onChange={e => { const n = e.target.value.replace(/[^\d.]/g, ""); onHe(n === "" ? "" : Math.min(MAX_HE_DIA, Number(n) || 0)); }}
        style={{ width: compacto ? 36 : 42, height: 34, borderRadius: 10, border: "1px solid rgba(44,42,40,.12)", textAlign: "center", font: "700 14px/1 var(--mono)", color: h ? "#B5571C" : CHARCOAL, background: "#fff", boxSizing: "border-box" }} />
      <button type="button" disabled={disabled || h >= MAX_HE_DIA} onClick={() => onHe(h + 1)} style={{ width: compacto ? 30 : 34, height: 34, borderRadius: 10, border: "1px solid rgba(44,42,40,.12)", background: "#fff", cursor: "pointer", fontSize: 16, color: CHARCOAL }}>+</button>
    </div>
  </div>;
}

// ── Guardado del proyecto en el corte (mezcla a tres vías) ───────────────
const espera = (ms) => new Promise(r => setTimeout(r, ms));
async function guardarProyecto({ corteId, short, base, local, user, esRRHH }) {
  const key = keyCorteJornal(corteId);
  for (let intento = 0; intento < 3; intento++) {
    let nube;
    try { nube = await store.getCloud(key); } catch { return { ok: false, msg: "No hay conexión con la nube. Tus cambios quedan guardados en este equipo; probá otra vez cuando haya señal." }; }
    const doc = nube && typeof nube === "object" ? nube : { corte: corteId, proyectos: {} };
    const nubeP = doc.proyectos?.[short] || null;
    const mezcla = mezclarProyecto(base, local, nubeP);
    const at = new Date().toISOString();
    const rec = { ...mezcla, updatedAt: at, updatedBy: user.nombre, asistenciaPor: nubeP?.asistenciaPor || (esRRHH ? "" : user.nombre) };
    const next = { ...doc, corte: corteId, proyectos: { ...(doc.proyectos || {}), [short]: rec } };
    if (!(await store.set(key, next))) return { ok: false, msg: "No se pudo guardar en la nube. Tus cambios quedan en este equipo; probá otra vez." };
    // ¿Lo mío está en la nube? (o porque es mi versión, o porque otro guardó encima ya con mis cambios)
    const loMioEsta = (d) => { const p = d?.proyectos?.[short]; return p?.updatedAt === at || (!!p && !cambiosEntre(mezclarProyecto(base, local, p), p)); };
    let v;
    try { v = await store.getCloud(key); } catch { return { ok: true, doc: next, sinConfirmar: true }; }
    if (!loMioEsta(v)) continue; // alguien guardó encima: lo mío se vuelve a aplicar sobre lo nuevo
    // Segunda lectura: un guardado que leyó ANTES que el mío pero escribió después se detecta acá.
    await espera(1200);
    try { const v2 = await store.getCloud(key); if (!loMioEsta(v2)) continue; return { ok: true, doc: v2 }; } catch { return { ok: true, doc: v }; }
  }
  return { ok: false, msg: "Otra persona estaba guardando este proyecto al mismo tiempo. Tus cambios siguen acá: tocá Guardar otra vez." };
}

// ── Pantalla principal: asistencia de jornales por proyecto y corte ─────
const draftKey = (corteId, short) => `gt-jornal-draft-${OPERACION}-${corteId}-${short}`;
const leerDraft = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v && v.local ? v : null; } catch { return null; } };
const ponerDraft = (k, v) => { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch { /* sin storage */ } };

export function AsistenciaJornales({ user, rol, proyectos = [], onVolver }) {
  const isMobile = useIsMobile();
  const hoy = hoyISO();
  const esRRHH = ROLES_RRHH_JORNAL.includes(rol);
  const soloVer = ROLES_SOLO_VER.includes(rol);
  const { lista: jornaleros, guardar: guardarJornal, cargar: recargarJornales } = useJornaleros();
  const [corte, setCorte] = useState(() => corteDe(hoy));
  const prefKey = `gt-jornal-proy-${user.username}`;
  const [short, setShortRaw] = useState(() => { try { return localStorage.getItem(prefKey) || ""; } catch { return ""; } });
  const setShort = (s) => { setShortRaw(s); try { localStorage.setItem(prefKey, s); } catch { /* */ } };
  const [vista, setVista] = useState(() => esRRHH && !isMobile ? "resumen" : "dia");
  const [docs, setDocs] = useState({ corte: null, previo: null, error: "", cargando: true });
  const [base, setBase] = useState(proyectoVacio());
  const [local, setLocalRaw] = useState(proyectoVacio());
  const [recuperado, setRecuperado] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [modal, setModal] = useState(null); // {t:"agregar"} | {t:"nuevo"} | {t:"celda", id, fecha}
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState(null);
  const tiraRef = useRef(null);
  // El día elegido (hoy, al entrar) siempre a la vista en la tira de días.
  useEffect(() => { const t = tiraRef.current; const el = t?.querySelector(`[data-dia="${fecha}"]`); if (t && el) t.scrollLeft = el.offsetLeft - t.offsetLeft - t.clientWidth / 2 + el.clientWidth / 2; }, [fecha, vista, short, docs.cargando]);

  const corteHoy = corteDe(hoy);
  const editable = !soloVer && (esRRHH || corte.id >= corteAnterior(corteHoy).id) && corte.id <= corteHoy.id;
  const proyOrden = useMemo(() => proyectos.filter(p => p.short && p.active !== false && !p.archived).slice().sort((a, b) => String(a.name || a.short).localeCompare(String(b.name || b.short), "es", { sensitivity: "base", numeric: true })), [proyectos]);
  const nombreDe = (s) => { const p = proyectos.find(x => x.short === s); return p?.name && p.name !== s ? `${p.short} · ${p.name}` : s; };

  const cargarCorte = useCallback(async (c) => {
    setDocs(d => ({ ...d, cargando: true, error: "" }));
    try {
      const [a, b] = await Promise.all([store.getCloud(keyCorteJornal(c.id)), store.getCloud(keyCorteJornal(corteAnterior(c).id))]);
      setDocs({ corte: a || { corte: c.id, proyectos: {} }, previo: b || { proyectos: {} }, error: "", cargando: false });
    } catch { setDocs({ corte: null, previo: null, error: "No se pudo leer la nube. Revisá la señal y tocá ↻.", cargando: false }); }
  }, []);
  useEffect(() => { cargarCorte(corte); setFecha(hoy >= corte.ini && hoy <= corte.fin ? hoy : corte.ini); }, [corte.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar de proyecto o llegar la nube: base = nube; si hay borrador sin guardar, se recupera.
  useEffect(() => {
    if (!docs.corte || !short) return;
    // Proyecto que nadie ha guardado en este corte: arranca con la lista del corte
    // anterior (RRHH decide quién trabaja; no hay que volver a armarla cada 2 semanas).
    const prev = docs.previo?.proyectos?.[short];
    const nube = docs.corte.proyectos?.[short] || (prev?.jornaleros?.length ? (() => {
      const ids = prev.jornaleros.filter(id => (jornaleros || []).find(j => j.id === id)?.status !== "inactive");
      return { ...proyectoVacio(), jornaleros: ids, tarifas: Object.fromEntries(ids.filter(id => prev.tarifas?.[id] != null).map(id => [id, prev.tarifas[id]])) };
    })() : proyectoVacio());
    const dr = leerDraft(draftKey(corte.id, short));
    if (dr && cambiosEntre(dr.base, dr.local)) { setBase(dr.base); setLocalRaw(dr.local); setRecuperado(true); }
    else { setBase(nube); setLocalRaw(nube); setRecuperado(false); ponerDraft(draftKey(corte.id, short), null); }
  }, [docs.corte, docs.previo, short, corte.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sucio = cambiosEntre(base, local);
  const setLocal = (fn) => setLocalRaw(prev => { const nx = typeof fn === "function" ? fn(prev) : fn; ponerDraft(draftKey(corte.id, short), { base, local: nx, at: new Date().toISOString() }); return nx; });
  const salir = (fn) => { if (sucio && !confirm("Tenés cambios sin guardar en este proyecto. Quedan guardados en este equipo, pero todavía no en la nube. ¿Salir igual?")) return; fn(); };

  const ficha = (id) => (jornaleros || []).find(j => j.id === id);
  const previoP = docs.previo?.proyectos?.[short] || null;
  const liq = useMemo(() => liquidarProyecto({ corte, proy: local, proyPrevio: previoP, jornaleros: jornaleros || [] }), [corte, local, previoP, jornaleros]);
  const dias = diasDelCorte(corte);

  const guardar = async () => {
    if (!sucio || guardando) return;
    setGuardando(true); setMsg(null);
    try {
      const r = await guardarProyecto({ corteId: corte.id, short, base, local, user, esRRHH });
      if (!r.ok) { setMsg({ c: C_ROJO, t: r.msg }); return; }
      const p = r.doc?.proyectos?.[short] || local;
      ponerDraft(draftKey(corte.id, short), null);
      setDocs(d => ({ ...d, corte: r.doc }));
      setBase(p); setLocalRaw(p); setRecuperado(false);
      setMsg({ c: C_VERDE, t: r.sinConfirmar ? "Guardado (no pude confirmarlo: revisá con ↻ cuando haya señal)." : "Guardado." });
      setTimeout(() => setMsg(m => m?.c === C_VERDE ? null : m), 2500);
    } finally { setGuardando(false); }
  };

  const agregar = (ids, nuevas = {}) => setLocal(p => { const n = { ...p, jornaleros: [...p.jornaleros], tarifas: { ...(p.tarifas || {}) } }; ids.forEach(id => { if (!n.jornaleros.includes(id)) { n.jornaleros.push(id); const f = nuevas[id] || ficha(id); if (f && n.tarifas[id] == null) n.tarifas[id] = num(f.salarioDia); } }); return n; });
  const quitar = (id) => {
    const tiene = Object.keys(local.dias?.[id] || {}).length || Object.keys(local.he?.[id] || {}).length;
    if (!confirm(`¿Quitar a ${ficha(id)?.fullName || "esta persona"} de ${short} en este corte?${tiene ? "\n\nSe borran los días y horas que tenía marcados en este corte." : ""}`)) return;
    setLocal(p => { const n = { ...p, jornaleros: p.jornaleros.filter(x => x !== id), dias: { ...p.dias }, he: { ...p.he }, tarifas: { ...(p.tarifas || {}) } }; delete n.dias[id]; delete n.he[id]; delete n.tarifas[id]; return n; });
  };
  const ponerDia = (id, f, v) => setLocal(p => ({ ...p, dias: ponerCelda(p.dias, id, f, v) }));
  const ponerHe = (id, f, v) => setLocal(p => ({ ...p, he: ponerCelda(p.he, id, f, v === 0 ? "" : v) }));
  const todosVinieron = (f) => setLocal(p => { let d = p.dias; p.jornaleros.forEach(id => { if (d?.[id]?.[f] === undefined) d = ponerCelda(d, id, f, 1); }); return { ...p, dias: d }; });

  // ── Exportar ──
  const identidadesDe = async (filas) => {
    const out = {};
    const dims = async (d) => { if (!d) return null; try { const im = await cargarImg(d); return { dataUrl: d, w: im.naturalWidth, h: im.naturalHeight }; } catch { return null; } };
    await Promise.all(filas.map(async f => { const j = f.ficha; if (!j) return; out[f.id] = { frente: await dims(await bajarFoto(j.dniFrente?.fileId)), reverso: await dims(await bajarFoto(j.dniReverso?.fileId)) }; }));
    return out;
  };
  const exportar = async (lista, tipo) => {
    const faltan = lista.flatMap(p => p.liq.filas.filter(f => !tieneIdentidad(f.ficha)).map(f => f.nombre));
    if (tipo === "pdf" && faltan.length && !confirm(`Falta la identidad escaneada de:\n\n${faltan.join("\n")}\n\nEn el PDF van a salir con «Falta escanear». ¿Generarlo igual?`)) return;
    if (tipo === "excel") { const { excelJornales } = await safeDynamicImport(() => import("./jornales-reporte.js"), "reporte"); await excelJornales({ proyectos: lista }); return; }
    const w = window.open("", "_blank");
    if (!w) { alert("Permití las ventanas emergentes para generar el PDF."); return; }
    w.document.write(`<p style="font:600 15px -apple-system,sans-serif;color:#6E6862;padding:48px">Preparando la solicitud de pago y las identidades…</p>`);
    try {
      const { reporteJornalesHTML } = await safeDynamicImport(() => import("./jornales-reporte.js"), "reporte");
      const ids = await identidadesDe(lista.flatMap(p => p.liq.filas));
      abrirReporte(w, reporteJornalesHTML({ proyectos: lista, identidades: ids, empresa: EMPRESA_JORNALES, lugar: LUGAR, hoy }));
    } catch (e) { w.close(); alert("No se pudo armar el reporte: " + (e?.message || e)); }
  };
  const paqueteDe = (s, proy, liqx) => ({ short: s, nombre: nombreDe(s), liq: liqx, elaboradoPor: user.nombre, asistenciaPor: proy?.asistenciaPor || "" });

  // ── Encabezado: corte + proyecto ──
  const cabecera = <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button type="button" className="gt-circulo" onClick={() => salir(onVolver)} aria-label="Atrás" style={{ width: 34, height: 34, fontSize: 15 }}>←</button>
      <div style={{ font: "800 18px/1.2 var(--display)", color: CHARCOAL }}>Jornales</div>
      <span style={{ fontSize: 12.5, color: "#6E6862" }}>personal por día · se paga cada 2 semanas</span>
      <div style={{ flex: 1 }} />
      <span role="button" title="Volver a leer de la nube" aria-label="Actualizar" className="gt-circulo" onClick={() => salir(() => { cargarCorte(corte); recargarJornales(); })} style={{ width: 36, height: 36, fontSize: 15 }}>↻</span>
    </div>
    <div className="gt-vidrio" style={{ padding: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flex: isMobile ? "1 1 100%" : "0 0 auto" }}>
        <button type="button" className="gt-circulo" aria-label="Corte anterior" onClick={() => salir(() => setCorte(corteAnterior(corte)))} style={{ width: 34, height: 34 }}>‹</button>
        <div style={{ textAlign: "center", minWidth: 170, flex: 1 }}>
          <div style={{ font: "800 14.5px/1.2 var(--display)", color: CHARCOAL }}>Corte {nombreCorte(corte)}</div>
          <div style={{ fontSize: 11.5, color: corte.id === corteHoy.id ? "var(--naranja-tinta)" : "#8A847D", marginTop: 2 }}>{corte.id === corteHoy.id ? "corte actual · " : ""}se paga el {diaCorto(corte.pago)} {fechaCorta(corte.pago)}</div>
        </div>
        <button type="button" className="gt-circulo" aria-label="Corte siguiente" disabled={corte.id >= corteHoy.id} onClick={() => salir(() => setCorte(corteSiguiente(corte)))} style={{ width: 34, height: 34, opacity: corte.id >= corteHoy.id ? .35 : 1 }}>›</button>
      </div>
      {vista !== "resumen" && <select value={short} onChange={e => salir(() => setShort(e.target.value))} style={{ ...CTRL, flex: "1 1 220px", width: "auto", minWidth: 0 }}>
        <option value="">Elegí el proyecto…</option>
        {(() => {
          // Arriba los proyectos que ya tienen jornales asignados (en este corte o en el anterior).
          const n = (s2) => docs.corte?.proyectos?.[s2]?.jornaleros?.length || docs.previo?.proyectos?.[s2]?.jornaleros?.length || 0;
          const op = (p) => <option key={p.short} value={p.short}>{nombreDe(p.short)}{n(p.short) ? ` · ${n(p.short)}` : ""}</option>;
          const con = proyOrden.filter(p => n(p.short)), sin = proyOrden.filter(p => !n(p.short));
          return con.length ? <><optgroup label="Con jornales">{con.map(op)}</optgroup><optgroup label="Otros proyectos">{sin.map(op)}</optgroup></> : sin.map(op);
        })()}
      </select>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {esRRHH && pill("Todos los proyectos", vista === "resumen", () => salir(() => setVista("resumen")))}
        {pill("Por día", vista === "dia", () => setVista("dia"))}
        {pill("Corte completo", vista === "corte", () => setVista("corte"))}
      </div>
    </div>
    {docs.error && aviso(docs.error, C_ROJO)}
    {!editable && !soloVer && corte.id < corteHoy.id && aviso(esRRHH ? "Este corte ya cerró." : "Este corte ya cerró: lo podés ver, pero solo RRHH lo corrige.", C_GRIS)}
    {soloVer && aviso("Solo lectura.", C_GRIS)}
  </div>;

  if (!jornaleros || docs.cargando) return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{cabecera}<div className="gt-vidrio" style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Cargando…</div></div>;

  // ── Vista: todos los proyectos del corte (RRHH) ──
  if (vista === "resumen") {
    const shorts = new Set(Object.keys(docs.corte?.proyectos || {}));
    const vierPrevio = diasDelCorte(corteAnterior(corte))[13];
    Object.entries(docs.previo?.proyectos || {}).forEach(([s, p]) => { if (Object.values(p.he || {}).some(m => num(m?.[vierPrevio]) > 0)) shorts.add(s); });
    const filas = [...shorts].map(s => { const proy = docs.corte?.proyectos?.[s]; const l = liquidarProyecto({ corte, proy, proyPrevio: docs.previo?.proyectos?.[s], jornaleros }); return { s, proy, l }; }).filter(x => x.l.filas.length).sort((a, b) => b.l.totales.total - a.l.totales.total);
    const tot = filas.reduce((t, x) => ({ p: t.p + x.l.filas.length, d: t.d + x.l.totales.dias, total: t.total + x.l.totales.total, faltan: t.faltan + x.l.filas.filter(f => !tieneIdentidad(f.ficha)).length }), { p: 0, d: 0, total: 0, faltan: 0 });
    return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {cabecera}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0,1fr))", gap: 8 }}>{tile(filas.length, "proyectos con jornales")}{tile(tot.p, "personas")}{tile(fmtN(tot.d), "días")}{tile(fmtL0(tot.total), `a pagar el ${fechaCorta(corte.pago)}`, "#A94E16")}</div>
      {tot.faltan > 0 && aviso(`Faltan ${tot.faltan} identidad${tot.faltan === 1 ? "" : "es"} por escanear. Se suben en GeoTeam → Empleados → Jornales.`)}
      {filas.length === 0 ? <div className="gt-vidrio" style={{ padding: 30, textAlign: "center", fontSize: 13, color: "#6E6862" }}>Ningún proyecto tiene jornales en este corte todavía. Los ingenieros los cargan desde Mi RRHH → Asistencia de campo.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filas.map(({ s, proy, l }) => { const faltan = l.filas.filter(f => !tieneIdentidad(f.ficha)).length; const conDatos = diasDelCorte(corte).filter(d => l.filas.some(f => f.dias?.[d] !== undefined)).length; return <div key={s} className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px", minWidth: 0, cursor: "pointer" }} onClick={() => { setShort(s); setVista(isMobile ? "dia" : "corte"); }}>
              <div style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL }}>{nombreDe(s)}</div>
              <div style={{ fontSize: 12, color: "#6E6862", marginTop: 3 }}>{l.filas.length} persona{l.filas.length === 1 ? "" : "s"} · {fmtN(l.totales.dias)} días · {fmtN(l.totales.horasHe)} h extra · {conDatos} de 14 días con asistencia{proy?.updatedBy ? ` · ${proy.updatedBy}` : ""}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>{l.encargado ? <Chip c={C_GRIS}>Depositar a {l.encargado}</Chip> : <Chip c={C_AMARILLO}>Sin encargado del pago</Chip>}{faltan > 0 && <Chip c={C_AMARILLO}>Faltan {faltan} ID</Chip>}</div>
            </div>
            <div style={{ font: "800 18px/1 var(--mono)", color: CHARCOAL }}>{fmtL(l.totales.total)}</div>
            <div style={{ display: "flex", gap: 6 }}>{btn("Excel", () => exportar([paqueteDe(s, proy, l)], "excel"), { chico: true })}{btn("PDF", () => exportar([paqueteDe(s, proy, l)], "pdf"), { c: ORANGE_DARK, lleno: true, chico: true })}</div>
          </div>; })}
          {filas.length > 1 && <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>{btn("Excel de todos", () => exportar(filas.map(x => paqueteDe(x.s, x.proy, x.l)), "excel"), { chico: true })}{btn("PDF de todos los proyectos", () => exportar(filas.map(x => paqueteDe(x.s, x.proy, x.l)), "pdf"), { c: ORANGE_DARK, lleno: true, chico: true })}</div>}
        </div>}
    </div>;
  }

  if (!short) return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{cabecera}<div className="gt-vidrio" style={{ padding: 30, textAlign: "center", fontSize: 13.5, color: "#6E6862" }}>Elegí el proyecto para llevar la asistencia de sus jornales.</div></div>;

  const roster = local.jornaleros || [];
  const viernesFin = corte.fin;
  const faltanId = liq.filas.filter(f => !tieneIdentidad(f.ficha));

  // Lista del proyecto vacía: agregar o copiar la del corte anterior.
  const rosterPrevio = (previoP?.jornaleros || []).filter(id => { const f = ficha(id); return f && f.status !== "inactive"; });
  const barraLista = <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
    <span style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL }}>{roster.length} jornal{roster.length === 1 ? "" : "es"}</span>
    <span style={{ fontSize: 12.5, color: "#8A847D" }}>en {short}</span>
    <div style={{ flex: 1 }} />
    {editable && esRRHH && roster.length === 0 && rosterPrevio.length > 0 && btn(`Copiar los ${rosterPrevio.length} del corte anterior`, () => agregar(rosterPrevio), { chico: true })}
    {editable && esRRHH && btn("+ Agregar jornal", () => setModal({ t: "agregar" }), { c: ORANGE_DARK, chico: true })}
  </div>;

  // ── Vista por día ──
  const vistaDia = () => {
    const esFin = fecha === viernesFin;
    return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div ref={tiraRef} className="gm-scroll-x" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {dias.map(d => { const on = d === fecha; const con = roster.some(id => local.dias?.[id]?.[d] !== undefined); return <button key={d} data-dia={d} type="button" onClick={() => setFecha(d)} aria-pressed={on}
          style={{ flexShrink: 0, width: 52, padding: "8px 0", borderRadius: 14, border: d === hoy && !on ? `1.5px solid ${ORANGE}` : "1px solid rgba(44,42,40,.1)", background: on ? CHARCOAL : "rgba(255,255,255,.75)", color: on ? "#fff" : CHARCOAL, cursor: "pointer", fontFamily: "inherit", opacity: d > hoy ? .55 : 1 }}>
          <div style={{ font: "700 10.5px/1 var(--sans)", opacity: .75, textTransform: "uppercase" }}>{diaCorto(d)}</div>
          <div style={{ font: "800 17px/1.15 var(--display)", marginTop: 3 }}>{+d.slice(8)}</div>
          <div style={{ width: 5, height: 5, borderRadius: "50%", margin: "4px auto 0", background: con ? (on ? "#F2A36B" : "#3E8E5A") : "transparent" }} />
        </button>; })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>{(t => t.charAt(0).toUpperCase() + t.slice(1))(fechaLarga(fecha).replace(/ de \d{4}$/, ""))}</span>
        <div style={{ flex: 1 }} />
        {editable && roster.length > 0 && btn("Todos vinieron", () => todosVinieron(fecha), { chico: true })}
      </div>
      {esFin && aviso(`Hoy es el día del corte (en la mañana): el día se paga en este corte, pero las horas extra de la tarde pasan al corte siguiente.`, C_NARANJA)}
      {roster.length === 0 ? <div className="gt-vidrio" style={{ padding: 26, textAlign: "center", fontSize: 13, color: "#6E6862" }}>{esRRHH ? `Agregá a los jornales que trabajan en ${short}.` : `RRHH todavía no asignó jornales a ${short}. Pedile a Ana que los agregue.`}</div>
        : <div className={isMobile ? "gm-grupo" : ""} style={isMobile ? {} : { display: "flex", flexDirection: "column", gap: 6 }}>
          {roster.map(id => { const f = ficha(id); return <div key={id} className={isMobile ? "" : "gt-vidrio"} style={{ padding: isMobile ? "12px 14px" : "10px 14px", display: "flex", alignItems: isMobile ? "stretch" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 14, borderBottom: isMobile ? "1px solid rgba(44,42,40,.07)" : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
              <Avatar nombre={f?.fullName} fileId={f?.photo?.fileId} size={38} radius={11} />
              <div style={{ minWidth: 0, flex: 1 }}><div style={{ font: "700 14px/1.2 var(--sans)", color: CHARCOAL, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f?.fullName || "(ficha borrada)"}</div><div style={{ fontSize: 11.5, color: "#8A847D", marginTop: 2 }}>{esRRHH ? `${fmtL0(local.tarifas?.[id] ?? f?.salarioDia)} / día${!tieneIdentidad(f) ? " · falta ID" : ""}` : (f?.position || "Jornal")}</div></div>
            </div>
            <ControlDia compacto={isMobile} disabled={!editable} valor={local.dias?.[id]?.[fecha]} onValor={(v) => ponerDia(id, fecha, v)} he={local.he?.[id]?.[fecha]} onHe={(v) => ponerHe(id, fecha, v)} heNota={esFin ? "Se pagan en el próximo corte" : undefined} />
          </div>; })}
        </div>}
    </div>;
  };

  // ── Vista del corte completo (cuadrícula) ──
  const vistaCorte = () => {
    const hayPrevia = liq.filas.some(f => f.hePrevia > 0);
    const th = { padding: "7px 4px", font: "700 10px/1.2 var(--sans)", color: "#8A847D", textTransform: "uppercase", letterSpacing: ".04em", borderBottom: "1px solid rgba(44,42,40,.12)", textAlign: "center", whiteSpace: "nowrap", background: "rgba(255,255,255,.92)" };
    const td = { padding: "6px 3px", borderBottom: "1px solid rgba(44,42,40,.06)", textAlign: "center" };
    const celda = (id, d) => { const v = local.dias?.[id]?.[d]; const h = num(local.he?.[id]?.[d]); const vacia = v === undefined; return <button type="button" disabled={!editable} onClick={() => setModal({ t: "celda", id, fecha: d })}
      style={{ width: "100%", minWidth: 34, minHeight: 38, borderRadius: 9, border: "none", cursor: editable ? "pointer" : "default", fontFamily: "var(--mono)", background: vacia ? "rgba(44,42,40,.035)" : Number(v) === 0 ? "rgba(192,57,43,.09)" : Number(v) === 0.5 ? "#FBEFC4" : "#E3F2E8", color: Number(v) === 0 ? "#B03024" : CHARCOAL, padding: "2px 0" }}>
      <div style={{ font: "800 13px/1 var(--mono)" }}>{vacia ? "" : Number(v) === 0.5 ? "½" : v}</div>
      {h > 0 && <div style={{ font: "700 9.5px/1 var(--mono)", color: d === viernesFin ? "#A39C92" : "#B5571C", marginTop: 3 }}>+{fmtN(h)}{d === viernesFin ? "→" : ""}</div>}
    </button>; };
    return <div className="gt-vidrio" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 900 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: "left", position: "sticky", left: 0, zIndex: 2, minWidth: 170, paddingLeft: 14 }}>Jornal</th>
            {hayPrevia && <th style={th} title="Horas extra del viernes del corte anterior (en la tarde)">HE {+liq.viernesPrevio.slice(8)}</th>}
            {dias.map(d => <th key={d} style={{ ...th, color: d === hoy ? ORANGE_DARK : th.color }}>{diaCorto(d)}<div style={{ font: "800 13px/1.2 var(--display)", color: d === hoy ? ORANGE_DARK : CHARCOAL, textTransform: "none" }}>{+d.slice(8)}</div>{editable && roster.length > 0 && <button type="button" title="Todos vinieron" onClick={() => todosVinieron(d)} style={{ marginTop: 3, border: "none", background: "rgba(62,142,90,.12)", color: "#177243", borderRadius: 6, font: "700 9px/1 var(--sans)", padding: "3px 5px", cursor: "pointer" }}>todos</button>}</th>)}
            <th style={th}>Días</th><th style={th}>HE</th>{esRRHH && <th style={{ ...th, textAlign: "right", paddingRight: 14 }}>Total</th>}
          </tr></thead>
          <tbody>
            {liq.filas.map(f => <tr key={f.id}>
              <td style={{ ...td, textAlign: "left", position: "sticky", left: 0, background: "rgba(252,251,250,.97)", zIndex: 1, paddingLeft: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar nombre={f.nombre} fileId={f.ficha?.photo?.fileId} size={28} radius={8} />
                  <div style={{ minWidth: 0 }}><div style={{ font: "700 12.5px/1.2 var(--sans)", color: CHARCOAL, maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.nombre}</div>
                    <div style={{ fontSize: 10.5, color: "#8A847D" }}>{esRRHH && editable && !f.soloHePrevia ? <button type="button" onClick={() => { const n = prompt(`Pago por día de ${f.nombre} en este corte (L):`, String(f.tarifa)); if (n == null) return; const v = Number(String(n).replace(/[^\d.]/g, "")); if (!(v > 0)) return alert("Monto no válido."); setLocal(p => ({ ...p, tarifas: { ...(p.tarifas || {}), [f.id]: v } })); }} style={{ border: "none", background: "none", padding: 0, color: "#8A847D", textDecoration: "underline dotted", cursor: "pointer", font: "inherit" }}>{fmtL0(f.tarifa)}/día</button> : (f.ficha?.position || "Jornal")}{f.soloHePrevia ? " · solo HE del corte anterior" : ""}
                      {editable && esRRHH && !f.soloHePrevia && <button type="button" onClick={() => quitar(f.id)} style={{ border: "none", background: "none", color: "#B03024", font: "700 10.5px/1 var(--sans)", cursor: "pointer", marginLeft: 6, padding: 0 }}>quitar</button>}</div></div>
                </div>
              </td>
              {hayPrevia && <td style={{ ...td, font: "700 11px/1 var(--mono)", color: "#B5571C" }}>{f.hePrevia ? `+${fmtN(f.hePrevia)}` : ""}</td>}
              {dias.map(d => <td key={d} style={td}>{f.soloHePrevia ? null : celda(f.id, d)}</td>)}
              <td style={{ ...td, font: "700 12.5px/1 var(--mono)" }}>{fmtN(f.totalDias)}</td>
              <td style={{ ...td, font: "700 12.5px/1 var(--mono)", color: f.horasHe ? "#B5571C" : "#A39C92" }}>{fmtN(f.horasHe)}</td>
              {esRRHH && <td style={{ ...td, textAlign: "right", paddingRight: 14, font: "800 12.5px/1 var(--mono)", color: CHARCOAL, whiteSpace: "nowrap" }}>{fmtL(f.total)}</td>}
            </tr>)}
            {liq.filas.length === 0 && <tr><td colSpan={dias.length + 5} style={{ padding: 26, textAlign: "center", fontSize: 13, color: "#6E6862" }}>{esRRHH ? `Agregá a los jornales que trabajan en ${short}.` : `RRHH todavía no asignó jornales a ${short}. Pedile a Ana que los agregue.`}</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "8px 14px", fontSize: 11.5, color: "#8A847D", borderTop: "1px solid rgba(44,42,40,.06)" }}>Tocá un día para marcarlo. Verde = día · ámbar = medio día · rojo = no vino · <span style={{ color: "#B5571C", fontWeight: 700 }}>+2</span> = horas extra · las del viernes {+viernesFin.slice(8)} (→) se pagan en el próximo corte.</div>
    </div>;
  };

  // ── Datos de la solicitud + totales + exportar ──
  const pie = <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.3fr) minmax(0,1fr)", gap: 12 }}>
    <div className="gt-vidrio" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ font: "800 14px/1.2 var(--display)", color: CHARCOAL }}>Datos de la solicitud de pago</div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Depositar a (quien gestiona el pago y el cierre)</span>
        <input value={local.encargado || ""} disabled={!editable} onChange={e => setLocal(p => ({ ...p, encargado: e.target.value }))} list="jornal-encargados" placeholder="Ej. David Hernández" style={CTRL} />
        <datalist id="jornal-encargados">{roster.map(id => ficha(id)).filter(Boolean).map(f => <option key={f.id} value={f.fullName} />)}</datalist></label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}><span style={LBL}>Observaciones</span><textarea value={local.observaciones || ""} disabled={!editable} rows={2} onChange={e => setLocal(p => ({ ...p, observaciones: e.target.value }))} style={{ ...CTRL, resize: "vertical" }} /></label>
    </div>
    <div className="gt-vidrio" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div><div style={LBL}>Días pagados</div><div style={{ font: "800 20px/1.2 var(--display)", color: CHARCOAL }}>{fmtN(liq.totales.dias)}</div></div>
        <div><div style={LBL}>Horas extra</div><div style={{ font: "800 20px/1.2 var(--display)", color: CHARCOAL }}>{fmtN(liq.totales.horasHe)}{liq.totales.heSiguiente ? <span style={{ fontSize: 11.5, color: "#8A847D", fontWeight: 600 }}> · {fmtN(liq.totales.heSiguiente)} al próximo</span> : null}</div></div>
      </div>
      <div style={{ borderTop: "1px solid rgba(44,42,40,.08)", paddingTop: 8 }}><div style={LBL}>Total a pagar el {diaCorto(corte.pago)} {fechaCorta(corte.pago)}</div><div style={{ font: "800 26px/1.15 var(--mono)", color: "#A94E16", letterSpacing: "-.02em" }}>{fmtL(liq.totales.total)}</div></div>
      {faltanId.length > 0 && <div style={{ fontSize: 12, color: "#8A5A00" }}>Falta la identidad de {faltanId.map(f => f.nombre.split(" ").slice(0, 2).join(" ")).join(", ")}.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{btn("Excel", () => exportar([paqueteDe(short, docs.corte?.proyectos?.[short], liq)], "excel"), { chico: true, disabled: !liq.filas.length })}{btn("PDF de solicitud de pago", () => exportar([paqueteDe(short, { ...(docs.corte?.proyectos?.[short] || {}), elaboradoPor: docs.corte?.proyectos?.[short]?.elaboradoPor || (!esRRHH ? user.nombre : "") }, liq)], "pdf"), { c: ORANGE_DARK, lleno: true, chico: true, disabled: !liq.filas.length })}</div>
      {sucio && <div style={{ fontSize: 11.5, color: "#8A847D" }}>El reporte sale con lo que ves, aunque no lo hayas guardado.</div>}
    </div>
  </div>;

  const celdaModal = modal?.t === "celda" ? (() => { const f = ficha(modal.id); return <Modal title={`${f?.fullName || ""} · ${diaCorto(modal.fecha)} ${fechaCorta(modal.fecha)}`} onClose={() => setModal(null)}>
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ControlDia valor={local.dias?.[modal.id]?.[modal.fecha]} onValor={(v) => ponerDia(modal.id, modal.fecha, v)} he={local.he?.[modal.id]?.[modal.fecha]} onHe={(v) => ponerHe(modal.id, modal.fecha, v)} />
      {modal.fecha === viernesFin && <div style={{ fontSize: 12, color: "#8A847D" }}>Las horas extra de este viernes (después del corte) se pagan en el corte siguiente.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>{btn("Listo", () => setModal(null), { c: ORANGE_DARK, lleno: true })}</div>
    </div>
  </Modal>; })() : null;

  return <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: sucio ? 80 : 0 }}>
    {cabecera}
    {recuperado && sucio && aviso("Recuperé cambios que hiciste en este equipo y no se habían guardado en la nube. Revisalos y tocá Guardar.", C_NARANJA)}
    {barraLista}
    {vista === "corte" ? vistaCorte() : vistaDia()}
    {roster.length > 0 && (esRRHH ? pie : <div className="gt-vidrio" style={{ padding: "12px 16px", display: "flex", gap: 22, flexWrap: "wrap", alignItems: "baseline" }}>
      <div><div style={LBL}>Días marcados en el corte</div><div style={{ font: "800 20px/1.2 var(--display)", color: CHARCOAL }}>{fmtN(liq.totales.dias)}</div></div>
      <div><div style={LBL}>Horas extra</div><div style={{ font: "800 20px/1.2 var(--display)", color: CHARCOAL }}>{fmtN(liq.totales.horasHe)}</div></div>
      <div style={{ fontSize: 12, color: "#8A847D", flex: "1 1 220px" }}>RRHH arma la solicitud de pago con lo que marqués.</div>
    </div>)}
    {msg && aviso(msg.t, msg.c)}
    {(sucio || guardando) && editable && <div style={{ position: "sticky", bottom: isMobile ? "calc(var(--gm-inferior, 0px) + 10px)" : 12, zIndex: 20, display: "flex", justifyContent: "center" }}>
      <div className="gt-vidrio" style={{ padding: "8px 8px 8px 16px", display: "flex", alignItems: "center", gap: 12, borderRadius: 999, boxShadow: "0 10px 30px rgba(44,42,40,.18)", background: "rgba(255,255,255,.96)" }}>
        <span style={{ fontSize: 12.5, color: "#6E6862" }}>Cambios sin guardar</span>
        {btn(guardando ? "Guardando…" : "Guardar asistencia", guardar, { c: ORANGE_DARK, lleno: true, chico: true, disabled: guardando, style: { borderRadius: 999 } })}
      </div>
    </div>}
    {modal?.t === "agregar" && <Modal title={`Agregar jornales a ${short}`} onClose={() => setModal(null)}>
      <AgregarJornales jornaleros={jornaleros} enLista={roster} otrosProyectos={docs.corte?.proyectos || {}} short={short} onAgregar={(ids) => { agregar(ids); setModal(null); }} onNuevo={() => setModal({ t: "nuevo" })} />
    </Modal>}
    {modal?.t === "nuevo" && <Modal title="Nuevo jornal" wide onClose={() => setModal(null)} fondoCierra={false}>
      <JornalFormImpl inicial={null} todos={jornaleros} puedeTarifa user={user} onGuardar={async (rec) => { const ok = await guardarJornal(rec); if (ok) agregar([rec.id], { [rec.id]: rec }); return ok; }} onClose={() => setModal(null)} />
    </Modal>}
    {celdaModal}
  </div>;
}

function AgregarJornales({ jornaleros, enLista, otrosProyectos, short, onAgregar, onNuevo }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState([]);
  const dondeEsta = (id) => Object.entries(otrosProyectos).filter(([s, p]) => s !== short && (p.jornaleros || []).includes(id)).map(([s]) => s);
  const qq = q.trim().toLowerCase();
  const cand = jornaleros.filter(j => j.status !== "inactive" && !enLista.includes(j.id) && (!qq || [j.fullName, j.dni].join(" ").toLowerCase().includes(qq))).sort((a, b) => String(a.fullName).localeCompare(String(b.fullName), "es"));
  return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <div style={{ display: "flex", gap: 8 }}><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o identidad" style={CTRL} />{btn("+ Nuevo", onNuevo, { c: ORANGE_DARK, chico: true })}</div>
    <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
      {cand.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "#6E6862" }}>{jornaleros.length === 0 ? "Todavía no hay jornales registrados. Tocá «+ Nuevo» para crear la ficha." : "Nadie más coincide. Si es alguien nuevo, tocá «+ Nuevo»."}</div>}
      {cand.map(j => { const on = sel.includes(j.id); const otros = dondeEsta(j.id); return <button key={j.id} type="button" onClick={() => setSel(s => on ? s.filter(x => x !== j.id) : [...s, j.id])}
        style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 10px", borderRadius: 12, border: on ? `1.5px solid ${ORANGE}` : "1px solid rgba(44,42,40,.08)", background: on ? "rgba(232,118,45,.07)" : "rgba(255,255,255,.8)", cursor: "pointer", fontFamily: "inherit", minHeight: 50 }}>
        <Avatar nombre={j.fullName} fileId={j.photo?.fileId} size={34} radius={10} />
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13.5, color: CHARCOAL }}>{j.fullName}</div><div style={{ fontSize: 11.5, color: "#6E6862" }}>{j.position || "Jornal"} · {fmtL0(j.salarioDia)}/día{otros.length ? ` · también en ${otros.join(", ")}` : ""}</div></div>
        <span style={{ width: 22, height: 22, borderRadius: 7, border: on ? "none" : "1.5px solid rgba(44,42,40,.2)", background: on ? ORANGE : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>{on ? "✓" : ""}</span>
      </button>; })}
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end" }}>{btn(sel.length ? `Agregar ${sel.length}` : "Agregar", () => onAgregar(sel), { c: ORANGE_DARK, lleno: true, disabled: !sel.length })}</div>
  </div>;
}
