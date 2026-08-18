// =====================================================================
// GEOCLOCK — Marcaje de entrada y salida del personal (ago 2026)
// =====================================================================
// Reloj de marcaje para tablet: el colaborador busca su nombre, firma en
// pantalla y registra ENTRADA o SALIDA. Corre en la tablet de Oscar
// (plantel central) y la de Ana (oficina); Gerson (admin/coordinador)
// supervisa. Reglas de negocio:
//   • Hora oficial: zona America/Tegucigalpa (UTC-6, sin DST) — NUNCA la
//     hora "local" del dispositivo formateada a otra zona.
//   • Tolerancia: TOLERANCIA_MIN (10 min) sobre la hora de entrada del
//     HORARIO del empleado (plantel 7:00–7:10, oficina 8:00–8:10, etc).
//     Después de eso el marcaje queda como LLEGADA TARDE 😞 y pide una
//     explicación que cae al "Reporte de llegadas tardías" de GeoTeam,
//     donde RRHH aprueba (día completo) o deniega (descuento proporcional).
//   • CANDADO: sin distribución de cuadrilla de la quincena actual
//     (hr-cuad, company|periodo|quincena) NO se puede marcar — obliga a
//     RRHH a armar la cuadrilla el día antes de que arranque la quincena.
//   • Los marcajes alimentan la asistencia de la quincena: al abrir la
//     hoja en GeoTeam, cada entrada siembra "1" en la celda del día.
//
// DATA (GeoClock es el ÚNICO escritor de estas keys):
//   gc-marks-<periodo>-<quincena>  → array de marcajes de esa quincena
//   gc-firma-<markId>              → { dataUrl } de la firma (PNG chico)
// Las decisiones de RRHH viven aparte en gc-tardies (escribe GeoTeam).
// Guardado robusto: getCloud → union por id → set → verify (+1 reintento).
// =====================================================================
import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { USERS } from "./users.js";
import Logo from "./Logo.jsx";
import { esFeriadoQuincena } from "./holidays.js";
import { HORARIOS, horarioDe, TOLERANCIA_MIN, gcMarkKey } from "./HRModule.jsx";

const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const CHARCOAL = "#2C2A28";
const CREAM = "#FFFBF5";
const BORDER = "#DBD4C8";
const STONE = "#8B847C";
const GREEN = "#5A8A4F";
const RED = "#C0392B";
const AMBER = "#D4A017";
const COMPANIES = {
  subterra: { name: "Subterra Honduras", color: "#3E6A99" },
  geotecnica: { name: "Geotecnica Soluciones", color: "#2C5F5D" },
};
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Hora/fecha actual en Tegucigalpa, calculada con Intl (independiente de la
// zona horaria configurada en la tablet).
const ahoraTegus = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Tegucigalpa",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = t => parts.find(p => p.type === t)?.value || "00";
  // hour12:false puede devolver "24" a medianoche en algunos motores.
  const h = Number(g("hour")) % 24;
  const m = Number(g("minute")), s = Number(g("second"));
  const fecha = `${g("year")}-${g("month")}-${g("day")}`;
  return {
    fecha,
    h, m, s,
    min: h * 60 + m,
    // Mismo formato que arrivalTimes de GeoTeam: hora SIN cero inicial.
    hora: `${h}:${String(m).padStart(2, "0")}`,
    dow: new Date(Number(g("year")), Number(g("month")) - 1, Number(g("day"))).getDay(),
  };
};
const quincenaDe = (fecha) => ({ periodo: fecha.slice(0, 7), quincena: Number(fecha.slice(8, 10)) <= 15 ? "1Q" : "2Q" });
const fechaLarga = (fecha, dow) => {
  const [y, m, d] = fecha.split("-").map(Number);
  return `${DIAS[dow].charAt(0).toUpperCase()}${DIAS[dow].slice(1)} ${d} de ${MESES[m - 1]} de ${y}`;
};
const hora12 = (h, m, s) => {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { txt: `${h12}:${String(m).padStart(2, "0")}`, seg: String(s).padStart(2, "0"), ampm };
};
// Minutos desde medianoche de un "H:MM" / "HH:MM".
const minDe = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const normaliza = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const iniciales = (nombre) => {
  const p = String(nombre || "?").trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[1][0] : (p[0] || "?").slice(0, 2)).toUpperCase();
};

// ── Pad de firma (canvas táctil) ──────────────────────────────────────
// A NIVEL DE MÓDULO (convención del proyecto: los forms definidos dentro
// del componente se remontan con cualquier re-render y pierden el trazo).
// `padRef.current` expone { clear, toDataURL, hasInk } al padre.
const SignaturePad = ({ padRef, onInk }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const inkRef = useRef(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // Fallbacks: en algunos montajes el efecto corre antes del layout y
    // clientWidth viene 0 — un canvas de 0px hace no-op el trazo y revienta
    // el export (drawImage con width 0). Con el fallback SIEMPRE hay lienzo.
    const w = canvas.clientWidth || canvas.offsetWidth || 640;
    const h = canvas.clientHeight || canvas.offsetHeight || 170;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = CHARCOAL;
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const pos = (ev) => {
      const r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    };
    const down = (ev) => { ev.preventDefault(); drawing.current = true; const p = pos(ev); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (ev) => {
      if (!drawing.current) return;
      ev.preventDefault();
      const p = pos(ev);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (!inkRef.current) { inkRef.current = true; onInk && onInk(true); }
    };
    const up = () => { drawing.current = false; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    if (padRef) padRef.current = {
      clear: () => { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); inkRef.current = false; onInk && onInk(false); },
      hasInk: () => inkRef.current,
      toDataURL: () => {
        // Reescala a 320px de ancho para que la firma pese poco (~4-8 KB).
        // Lee el tamaño REAL actual del canvas (no el del closure) y protege
        // contra dimensiones 0 para que el export nunca reviente.
        const srcW = canvas.width || 1, srcH = canvas.height || 1;
        const out = document.createElement("canvas");
        out.width = 320;
        out.height = Math.max(1, Math.round(320 * (srcH / srcW)));
        const octx = out.getContext("2d");
        octx.fillStyle = "#fff";
        octx.fillRect(0, 0, out.width, out.height);
        octx.drawImage(canvas, 0, 0, out.width, out.height);
        // JPEG comprimido: una firma PNG salía ~180 KB (antialiasing) y dos
        // marcajes diarios de 40 personas llenan el localStorage de la
        // tablet en días. JPEG q0.8 sobre fondo blanco queda en ~5-15 KB.
        return out.toDataURL("image/jpeg", 0.8);
      },
    };
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <canvas ref={canvasRef} style={{ width: "100%", height: 170, background: "#fff", border: `2px dashed ${BORDER}`, borderRadius: 14, touchAction: "none", cursor: "crosshair", display: "block" }} />;
};

// ── Módulo ────────────────────────────────────────────────────────────
export default function GeoClockModule({ userRole = "admin", userName, onBack, onLogout }) {
  const [emps, setEmps] = useState([]);
  const [cuads, setCuads] = useState([]);
  const [marks, setMarks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [now, setNow] = useState(ahoraTegus());
  const [view, setView] = useState("search"); // search | person | done
  const [sel, setSel] = useState(null);
  const [search, setSearch] = useState("");
  const [tipoAccion, setTipoAccion] = useState("entrada");
  const [explicacion, setExplicacion] = useState("");
  const [tieneFirma, setTieneFirma] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doneInfo, setDoneInfo] = useState(null);
  const [selPhoto, setSelPhoto] = useState(null);
  const [verHoy, setVerHoy] = useState(false);
  const padRef = useRef(null);
  const idleTimer = useRef(null);

  // Reloj en vivo (1 tick por segundo, zona Tegucigalpa)
  useEffect(() => {
    const t = setInterval(() => setNow(ahoraTegus()), 1000);
    return () => clearInterval(t);
  }, []);

  const q = quincenaDe(now.fecha);
  const marksKey = gcMarkKey(q.periodo, q.quincena);

  const loadAll = async () => {
    try {
      const [e, cq, mk] = await Promise.all([
        store.get("hr-emps5"),
        store.get("hr-cuad"),
        store.get(marksKey),
      ]);
      if (Array.isArray(e)) setEmps(e);
      if (Array.isArray(cq)) setCuads(cq);
      setMarks(Array.isArray(mk) ? mk : []);
      setLoadErr(!Array.isArray(e) || e.length === 0);
    } catch {
      setLoadErr(true);
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [marksKey]);
  // Refresco al volver el foco a la pestaña (la tablet queda abierta todo el día)
  useEffect(() => {
    const onFocus = () => loadAll();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey]);

  // Kiosk: si alguien deja la pantalla de persona abierta, vuelve sola.
  // El timer se REINICIA con cualquier actividad (tocar, firmar, escribir) —
  // sin esto, a alguien firmando despacio se le borraba todo a los 120s.
  useEffect(() => {
    const arm = () => {
      clearTimeout(idleTimer.current);
      if (view === "person") idleTimer.current = setTimeout(() => reset(), 120000);
      if (view === "done") idleTimer.current = setTimeout(() => reset(), 7000);
    };
    arm();
    const onActivity = () => { if (view === "person") arm(); };
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      clearTimeout(idleTimer.current);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sel?.id]);
  // La tablet kiosk nunca pierde el foco (queda abierta todo el día), así que
  // el listener de focus no alcanza: polling suave cada 3 min refresca
  // cuadrillas (candado) y marcajes hechos en la OTRA tablet.
  useEffect(() => {
    const t = setInterval(() => { if (view === "search") loadAll(); }, 180000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, marksKey]);

  const reset = () => {
    setView("search"); setSel(null); setSearch(""); setExplicacion("");
    setTieneFirma(false); setDoneInfo(null); setSelPhoto(null); setTipoAccion("entrada");
  };

  const activos = emps.filter(e => e.status === "active");
  const resultados = (search.trim().length >= 1
    ? activos.filter(e => normaliza(e.fullName).includes(normaliza(search)))
    : activos
  ).slice().sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));

  const marksHoy = marks.filter(mk => mk && mk.fecha === now.fecha);
  const marksDe = (empId) => marksHoy.filter(mk => mk.empId === empId);
  const entradaDe = (empId) => marksDe(empId).find(mk => mk.tipo === "entrada") || null;
  const salidaDe = (empId) => marksDe(empId).find(mk => mk.tipo === "salida") || null;

  // Candado de cuadrilla: sin distribución de la quincena ACTUAL para la
  // empresa del colaborador, no hay marcaje.
  const cuadrillaOk = (emp) => cuads.some(c => c && c.company === emp.company && c.periodo === q.periodo && c.quincena === q.quincena);

  const selEmp = sel ? emps.find(e => e.id === sel.id) || sel : null;
  const horario = selEmp ? horarioDe(selEmp) : HORARIOS.plantel;
  const entradaMin = selEmp ? minDe(horario.entrada) : minDe("7:00");
  const minTarde = Math.max(0, now.min - entradaMin);
  // Domingos y feriados NO tienen "llegada tarde": son días pagados por ley
  // (trabajarlos es DT/TF, decidido por RRHH) — el reloj solo deja constancia.
  const esDomFer = now.dow === 0 || esFeriadoQuincena(q.periodo, Number(now.fecha.slice(8, 10)));
  const esTarde = tipoAccion === "entrada" && !esDomFer && now.min > entradaMin + TOLERANCIA_MIN;

  const seleccionar = async (e) => {
    setSel(e); setView("person"); setExplicacion(""); setTieneFirma(false); setSelPhoto(null);
    setTipoAccion(entradaDe(e.id) ? "salida" : "entrada");
    // Si el candado está cerrado según el estado local, re-chequear con la
    // NUBE antes de bloquear: RRHH pudo haber creado la cuadrilla hace un
    // rato y la tablet kiosk (que nunca pierde el foco) no se enteró.
    if (!cuadrillaOk(e)) {
      try {
        const cqFresh = await store.getCloud("hr-cuad");
        if (Array.isArray(cqFresh)) setCuads(cqFresh);
      } catch { /* sin nube: se queda con lo local */ }
    }
    if (e.photo?.fileId) {
      try { const f = await store.get(`cp-file-${e.photo.fileId}`); if (f?.dataUrl) setSelPhoto(f.dataUrl); } catch { /* sin foto */ }
    }
  };

  // ── Guardado robusto del marcaje ──
  const unionById = (a, b) => {
    const by = {};
    [...(a || []), ...(b || [])].forEach(x => { if (x && x.id) by[x.id] = x; });
    return Object.values(by);
  };
  const registrar = async () => {
    if (saving || !selEmp) return;
    if (!padRef.current?.hasInk()) return alert("✍️ Falta tu firma — firmá en el recuadro para registrar.");
    if (esTarde && !explicacion.trim()) return alert("😞 Llegaste tarde: contanos brevemente por qué. Tu explicación va a RRHH para que decidan si se otorga el permiso.");
    if (!cuadrillaOk(selEmp)) return alert("🔒 No hay distribución de cuadrilla para esta quincena. Avisale a RRHH.");
    if (tipoAccion === "entrada" && entradaDe(selEmp.id)) return alert(`Ya registraste tu ENTRADA hoy a las ${entradaDe(selEmp.id).hora}.`);
    if (tipoAccion === "salida" && salidaDe(selEmp.id)) return alert(`Ya registraste tu SALIDA hoy a las ${salidaDe(selEmp.id).hora}.`);
    setSaving(true);
    try {
      const t = ahoraTegus(); // re-lee la hora al confirmar (no la del render)
      const tDomFer = t.dow === 0 || esFeriadoQuincena(t.fecha.slice(0, 7), Number(t.fecha.slice(8, 10)));
      const tarde = tipoAccion === "entrada" && !tDomFer && t.min > entradaMin + TOLERANCIA_MIN;
      // Borde de la tolerancia: si entre el render y el click se cruzó el
      // límite (7:10:59 → 7:11), la validación del render dejó pasar una
      // tardanza SIN explicación. Se re-valida con la hora fresca.
      if (tarde && !explicacion.trim()) {
        setNow(t); // re-render: aparece el panel ámbar con el textarea
        alert("😞 Justo se pasó la tolerancia — contanos brevemente por qué llegás tarde y volvé a tocar Registrar.");
        return;
      }
      // La key se calcula desde la hora RELEÍDA al confirmar (no la del
      // render): si el marcaje cae justo al cruzar de quincena/medianoche,
      // el mark va a la quincena de SU fecha (evita marks huérfanos).
      const kq = quincenaDe(t.fecha);
      const keyAtSave = gcMarkKey(kq.periodo, kq.quincena);
      // 1) Leer la NUBE primero (aborta acá si no hay señal — así tampoco se
      //    sube una firma huérfana) y re-chequear duplicados contra ELLA:
      //    el estado local de una tablet kiosk puede estar viejo y no saber
      //    que la OTRA tablet ya registró a esta persona.
      let cloudArr;
      try { const c = await store.getCloud(keyAtSave); cloudArr = Array.isArray(c) ? c : []; }
      catch { alert("⚠️ No hay conexión con la nube — el marcaje NO se registró. Avisale al encargado y volvé a intentar."); return; }
      const dup = cloudArr.find(x => x && x.empId === selEmp.id && x.fecha === t.fecha && x.tipo === tipoAccion);
      if (dup) {
        if (keyAtSave === marksKey) setMarks(cloudArr);
        alert(`Ya registraste tu ${tipoAccion.toUpperCase()} hoy a las ${dup.hora}${dup.registradoPor ? ` (tablet de ${dup.registradoPor})` : ""}. No hace falta marcar de nuevo.`);
        return;
      }
      const id = uid();
      const nowIso = new Date().toISOString();
      // 2) Firma (si falla, no queda un marcaje sin firma)
      const firmaOk = await store.set(`gc-firma-${id}`, {
        dataUrl: padRef.current.toDataURL(),
        empId: selEmp.id, fecha: t.fecha, tipo: tipoAccion, createdAt: nowIso,
      });
      if (!firmaOk) { alert("⚠️ No se pudo guardar la firma en la nube. Revisá la señal y volvé a intentar — NO se registró nada."); return; }
      // 3) Marcaje: SOLO nube + el mark nuevo. El estado local de React NO
      //    entra al merge — si un admin borró un marcaje desde la nube, la
      //    union con `marks` viejo lo resucitaría.
      const mark = {
        id,
        empId: selEmp.id,
        empNombre: selEmp.fullName,
        company: selEmp.company,
        fecha: t.fecha,
        hora: t.hora,
        min: t.min,
        tipo: tipoAccion,
        tarde,
        minTarde: tarde ? t.min - entradaMin : 0,
        horarioEntrada: horario.entrada,
        explicacion: tarde ? explicacion.trim() : "",
        firmaId: id,
        registradoPor: userName || "GeoClock",
        ts: nowIso,
        createdAt: nowIso,
      };
      let next = [...unionById(cloudArr, [mark])];
      let ok = await store.set(keyAtSave, next);
      // VERIFY (+1 reintento): el marcaje debe estar en la nube. Cubre la
      // carrera de dos tablets escribiendo con segundos de diferencia.
      let verified = false;
      for (let intento = 0; intento < 2 && ok; intento++) {
        try {
          const back = await store.getCloud(keyAtSave);
          if (Array.isArray(back) && back.some(x => x && x.id === id)) { verified = true; if (keyAtSave === marksKey) setMarks(back); break; }
          // No está: alguien escribió encima — re-merge y reintentar una vez.
          next = [...unionById(Array.isArray(back) ? back : [], next)];
          if (!next.some(x => x.id === id)) next.push(mark);
          ok = await store.set(keyAtSave, next);
        } catch { break; }
      }
      if (!ok || !verified) {
        alert("⚠️ El marcaje NO se pudo verificar en la nube. Volvé a intentarlo — si sigue fallando, avisale a RRHH.");
        return;
      }
      setDoneInfo({ tipo: tipoAccion, hora: t.hora, tarde, minTarde: mark.minTarde, nombre: selEmp.fullName.split(" ").slice(0, 2).join(" ") });
      setView("done");
    } finally {
      setSaving(false);
    }
  };

  // ── UI ──
  // MODO KIOSCO: en las tablets de Oscar (logistica) y Ana (asistente_compras)
  // los botones de salida piden la contraseña del encargado — sin esto,
  // cualquier colaborador podía tocar "← Módulos" y navegar GeoLogistics/
  // GeoSafety/GeoTeam con la sesión del encargado. Admin/coordinador salen libre.
  const esKiosk = userRole === "logistica" || userRole === "asistente_compras";
  const conClave = (accion) => {
    if (!esKiosk) return accion();
    const pass = prompt("🔒 Modo kiosco — contraseña del encargado para salir:");
    if (pass === null || pass === "") return;
    const okPass = USERS.some(u => u.label === userName && u.password === pass);
    if (!okPass) return alert("Contraseña incorrecta.");
    accion();
  };
  const reloj = hora12(now.h, now.m, now.s);
  const btnBig = (bg, disabled) => ({
    padding: "16px 26px", borderRadius: 16, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "#D8D2C8" : bg, color: "#fff", fontSize: 18, fontWeight: 800,
    boxShadow: disabled ? "none" : "0 6px 18px rgba(44,42,40,0.18)", letterSpacing: 0.3, minHeight: 58,
  });

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Inter', sans-serif", color: STONE, background: CREAM }}>Cargando GeoClock…</div>;

  return <div style={{ minHeight: "100vh", background: CREAM, fontFamily: '"Inter", "SF Pro Display", -apple-system, sans-serif', color: CHARCOAL, display: "flex", flexDirection: "column" }}>
    {/* HEADER: logo + reloj vivo */}
    <div style={{ background: "#fff", borderBottom: `1px solid ${BORDER}`, padding: "14px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Logo size={40} />
        <div>
          <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: 0.2 }}>Geo<span style={{ color: ORANGE }}>Clock</span></div>
          <div style={{ fontSize: 11, color: STONE }}>Marcaje de entrada y salida · {userName ? `Tablet de ${userName}` : "Grupo Geotecnica"}</div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontWeight: 800, fontSize: 34, lineHeight: 1, color: CHARCOAL }}>
          {reloj.txt}<span style={{ fontSize: 18, color: ORANGE }}>:{reloj.seg}</span> <span style={{ fontSize: 16, color: STONE }}>{reloj.ampm}</span>
        </div>
        <div style={{ fontSize: 12, color: STONE, marginTop: 2 }}>{fechaLarga(now.fecha, now.dow)} · 🇭🇳 Tegucigalpa (UTC−6) · {q.quincena} {q.periodo}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => conClave(onBack)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: STONE, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{esKiosk ? "🔒 " : ""}← Módulos</button>
        <button onClick={() => conClave(onLogout)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: STONE, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{esKiosk ? "🔒 " : ""}Salir</button>
      </div>
    </div>

    <div style={{ flex: 1, maxWidth: 860, width: "100%", margin: "0 auto", padding: "22px 18px 40px", boxSizing: "border-box" }}>
      {loadErr && <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#991B1B", marginBottom: 14 }}>
        ⚠️ No se pudo cargar la lista de personal desde la nube. Revisá la conexión y tocá <b onClick={loadAll} style={{ cursor: "pointer", textDecoration: "underline" }}>reintentar</b>.
      </div>}

      {/* ── BÚSQUEDA ── */}
      {view === "search" && <div>
        <div style={{ textAlign: "center", margin: "6px 0 18px" }}>
          <div style={{ fontSize: 26, fontWeight: 900 }}>👋 ¡Hola! Marcá tu asistencia</div>
          <div style={{ fontSize: 14, color: STONE, marginTop: 4 }}>Buscá tu nombre, firmá y registrá tu entrada o salida.</div>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Escribí tu nombre…"
          autoFocus
          style={{ width: "100%", boxSizing: "border-box", padding: "16px 20px", fontSize: 19, borderRadius: 16, border: `2px solid ${search ? ORANGE : BORDER}`, outline: "none", background: "#fff", boxShadow: "0 2px 10px rgba(44,42,40,0.05)" }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginTop: 16 }}>
          {resultados.map(e => {
            const ent = entradaDe(e.id), sal = salidaDe(e.id);
            const co = COMPANIES[e.company] || { name: e.company, color: STONE };
            return <button key={e.id} onClick={() => seleccionar(e)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: `1px solid ${BORDER}`, background: "#fff", cursor: "pointer", textAlign: "left", minHeight: 64, boxShadow: "0 1px 4px rgba(44,42,40,0.05)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: co.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{iniciales(e.fullName)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.fullName}</div>
                <div style={{ fontSize: 11, color: STONE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.position || co.name}</div>
                <div style={{ fontSize: 10.5, marginTop: 2 }}>
                  {ent ? <span style={{ color: ent.tarde ? "#B45309" : GREEN, fontWeight: 700 }}>✓ entrada {ent.hora}{ent.tarde ? " (tarde)" : ""}</span> : <span style={{ color: "#B8B0A4" }}>sin marcar hoy</span>}
                  {sal && <span style={{ color: STONE, fontWeight: 700 }}> · salida {sal.hora}</span>}
                </div>
              </div>
            </button>;
          })}
          {resultados.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", color: STONE, fontSize: 14, padding: 30 }}>No encontramos a nadie con "{search}" — probá con otro nombre.</div>}
        </div>
        {/* Marcajes de hoy (para el encargado) */}
        <div style={{ marginTop: 22, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "12px 16px" }}>
          <div onClick={() => setVerHoy(v => !v)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span style={{ fontWeight: 800, fontSize: 13 }}>📋 Marcajes de hoy ({marksHoy.length})</span>
            <span style={{ color: STONE, fontSize: 12 }}>{verHoy ? "ocultar ▲" : "ver ▼"}</span>
          </div>
          {verHoy && <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
            {marksHoy.slice().sort((a, b) => (b.min || 0) - (a.min || 0)).map(mk => (
              <div key={mk.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "6px 10px", background: CREAM, borderRadius: 8 }}>
                <span style={{ fontWeight: 700 }}>{mk.empNombre}</span>
                <span style={{ color: mk.tipo === "entrada" ? (mk.tarde ? "#B45309" : GREEN) : "#3E6A99", fontWeight: 700 }}>
                  {mk.tipo === "entrada" ? (mk.tarde ? `⏰ entrada ${mk.hora} (+${mk.minTarde} min)` : `✓ entrada ${mk.hora}`) : `↩ salida ${mk.hora}`}
                </span>
              </div>
            ))}
            {marksHoy.length === 0 && <div style={{ fontSize: 12, color: STONE, fontStyle: "italic" }}>Nadie ha marcado todavía.</div>}
          </div>}
        </div>
      </div>}

      {/* ── PERSONA: marcar ── */}
      {view === "person" && selEmp && (() => {
        const ent = entradaDe(selEmp.id), sal = salidaDe(selEmp.id);
        const co = COMPANIES[selEmp.company] || { name: selEmp.company, color: STONE };
        const gate = cuadrillaOk(selEmp);
        const yaMarcoTodo = ent && sal;
        const puedeEntrada = !ent;
        const puedeSalida = !sal;
        return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button onClick={reset} style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: STONE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>← No soy yo / buscar otro</button>
          {/* Tarjeta de identidad */}
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 10px rgba(44,42,40,0.06)" }}>
            {selPhoto
              ? <img src={selPhoto} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
              : <div style={{ width: 72, height: 72, borderRadius: 16, background: co.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 24 }}>{iniciales(selEmp.fullName)}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 20 }}>{selEmp.fullName}</div>
              <div style={{ fontSize: 13, color: STONE }}>{selEmp.position || "—"} · {co.name}</div>
              <div style={{ fontSize: 12, color: "#3E6A99", fontWeight: 700, marginTop: 3 }}>🕒 Tu horario: {horario.entrada} – {horario.salida || "?"} <span style={{ color: STONE, fontWeight: 400 }}>(tolerancia hasta {(() => { const t = entradaMin + TOLERANCIA_MIN; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; })()})</span></div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12, color: STONE }}>
              {ent ? <div style={{ color: ent.tarde ? "#B45309" : GREEN, fontWeight: 800 }}>✓ Entrada {ent.hora}</div> : <div>Entrada pendiente</div>}
              {sal ? <div style={{ color: "#3E6A99", fontWeight: 800 }}>↩ Salida {sal.hora}</div> : <div>Salida pendiente</div>}
            </div>
          </div>

          {/* CANDADO de cuadrilla */}
          {!gate && <div style={{ background: "#FEE2E2", border: "2px solid #FCA5A5", borderRadius: 16, padding: "18px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>🔒</div>
            <div style={{ fontWeight: 900, fontSize: 17, color: "#991B1B" }}>Todavía no se puede marcar esta quincena</div>
            <div style={{ fontSize: 13.5, color: "#7F1D1D", marginTop: 6, lineHeight: 1.5 }}>
              No hay <b>distribución de cuadrilla {q.quincena} {q.periodo}</b> para {co.name}.<br />
              Avisale a RRHH que la genere en <b>GeoTeam → Asistencia</b> — debe estar lista el día antes de iniciar la quincena.
            </div>
          </div>}

          {gate && yaMarcoTodo && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 16, padding: "18px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>✅</div>
            <div style={{ fontWeight: 900, fontSize: 17, color: "#166534" }}>¡Ya marcaste entrada y salida hoy!</div>
            <div style={{ fontSize: 13, color: "#15803D", marginTop: 4 }}>Entrada {ent.hora} · Salida {sal.hora}. Buen trabajo, {selEmp.fullName.split(" ")[0]}. 💪</div>
          </div>}

          {gate && !yaMarcoTodo && <>
            {/* Selector entrada/salida */}
            <div style={{ display: "flex", gap: 10 }}>
              <button disabled={!puedeEntrada} onClick={() => setTipoAccion("entrada")}
                style={{ flex: 1, padding: "14px 10px", borderRadius: 14, cursor: puedeEntrada ? "pointer" : "not-allowed", fontSize: 16, fontWeight: 800, border: `2px solid ${tipoAccion === "entrada" && puedeEntrada ? GREEN : BORDER}`, background: tipoAccion === "entrada" && puedeEntrada ? "#F0FDF4" : "#fff", color: puedeEntrada ? "#166534" : "#B8B0A4" }}>
                🌅 ENTRADA {ent ? `(ya marcada ${ent.hora})` : ""}
              </button>
              <button disabled={!puedeSalida} onClick={() => setTipoAccion("salida")}
                style={{ flex: 1, padding: "14px 10px", borderRadius: 14, cursor: puedeSalida ? "pointer" : "not-allowed", fontSize: 16, fontWeight: 800, border: `2px solid ${tipoAccion === "salida" && puedeSalida ? "#3E6A99" : BORDER}`, background: tipoAccion === "salida" && puedeSalida ? "#EFF6FF" : "#fff", color: puedeSalida ? "#1E40AF" : "#B8B0A4" }}>
                🌇 SALIDA {sal ? `(ya marcada ${sal.hora})` : ""}
              </button>
            </div>

            {/* Aviso de tarde + explicación */}
            {esTarde && <div style={{ background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ fontWeight: 900, fontSize: 18, color: "#92400E" }}>Llegaste tarde 😞 <span style={{ fontSize: 14 }}>(+{minTarde} min después de las {horario.entrada})</span></div>
              <div style={{ fontSize: 12.5, color: "#78350F", margin: "6px 0 8px" }}>Contanos por qué — tu explicación va al <b>Reporte de llegadas tardías</b> de RRHH, donde deciden si se otorga el permiso o se aplica el descuento proporcional.</div>
              <textarea value={explicacion} onChange={e => setExplicacion(e.target.value)} rows={2}
                placeholder="Ej: se accidentó el bus, cita médica, tráfico en la salida al sur…"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #FCD34D", fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
            </div>}
            {tipoAccion === "entrada" && !esTarde && <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 12, padding: "10px 14px", fontSize: 13.5, color: "#166534", fontWeight: 700 }}>
              🎉 Vas a tiempo — son las {now.hora} y tu tolerancia va hasta {(() => { const t = entradaMin + TOLERANCIA_MIN; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; })()}.
            </div>}

            {/* Firma */}
            <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 14 }}>✍️ Firmá aquí para confirmar</span>
                <button onClick={() => padRef.current?.clear()} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff", color: STONE, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Borrar firma</button>
              </div>
              <SignaturePad padRef={padRef} onInk={setTieneFirma} />
            </div>

            <button onClick={registrar} disabled={saving || !tieneFirma || (esTarde && !explicacion.trim())}
              style={btnBig(tipoAccion === "entrada" ? (esTarde ? "#B45309" : GREEN) : "#3E6A99", saving || !tieneFirma || (esTarde && !explicacion.trim()))}>
              {saving ? "⏳ Registrando…" : `Registrar ${tipoAccion.toUpperCase()} — ${now.hora}`}
            </button>
            {!tieneFirma && <div style={{ textAlign: "center", fontSize: 12, color: STONE }}>La firma es obligatoria para registrar.</div>}
          </>}
        </div>;
      })()}

      {/* ── CONFIRMACIÓN ── */}
      {view === "done" && doneInfo && <div style={{ textAlign: "center", padding: "40px 10px" }}>
        <div style={{ width: 110, height: 110, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 54, background: doneInfo.tarde ? "#FEF3C7" : "#F0FDF4", border: `4px solid ${doneInfo.tarde ? AMBER : GREEN}` }}>
          {doneInfo.tarde ? "😞" : "✅"}
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, marginTop: 16 }}>
          {doneInfo.tipo === "entrada" ? "Entrada registrada" : "Salida registrada"} — {doneInfo.hora}
        </div>
        <div style={{ fontSize: 15, color: STONE, marginTop: 6 }}>
          {doneInfo.tarde
            ? <>Llegaste <b style={{ color: "#B45309" }}>{doneInfo.minTarde} min tarde</b>. Tu explicación fue enviada a RRHH — ellos deciden si se otorga el permiso. 🤞</>
            : <>¡{doneInfo.tipo === "entrada" ? "Buen día" : "Buen descanso"}, {doneInfo.nombre}! 💪</>}
        </div>
        <button onClick={reset} style={{ ...btnBig(ORANGE, false), marginTop: 22, padding: "13px 34px" }}>Listo</button>
      </div>}
    </div>

    <div style={{ textAlign: "center", padding: "12px 0 18px", fontSize: 11, color: "#B8B0A4", borderTop: `1px solid ${BORDER}`, background: "#fff" }}>
      GeoClock · Grupo Geotecnica — plantel central y oficina · los marcajes alimentan la asistencia de GeoTeam
    </div>
  </div>;
}
