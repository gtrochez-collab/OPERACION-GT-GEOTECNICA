// =====================================================================
// GEOCLOCK — Marcaje de entrada y salida del personal (ago 2026)
// =====================================================================
// Reloj de marcaje para tablet: el colaborador busca su nombre, firma en
// pantalla y registra ENTRADA o SALIDA. Corre en la tablet de Oscar
// (plantel central) y la de Ana (oficina); Gerson (admin/coordinador)
// supervisa. Reglas de negocio:
//   • Hora oficial: zona America/Tegucigalpa (UTC-6, sin DST) — NUNCA la
//     hora "local" del dispositivo formateada a otra zona.
//   • Tolerancia: TOLERANCIA_MIN (15 min) sobre la hora de entrada del
//     HORARIO del empleado (plantel 7:00–7:15, oficina 8:00–8:15, etc).
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
import { useState, useEffect, useRef, useMemo } from "react";
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
// ── Helpers de la vista Registros ──
// Lista de fechas "YYYY-MM-DD" del rango (inclusive), tope 120 días.
const fechasEnRango = (desde, hasta) => {
  const out = [];
  const [y1, m1, d1] = String(desde || "").split("-").map(Number);
  const [y2, m2, d2] = String(hasta || desde || "").split("-").map(Number);
  if (!y1 || !m1 || !d1) return out;
  let cur = new Date(y1, m1 - 1, d1);
  const fin = (y2 && m2 && d2) ? new Date(y2, m2 - 1, d2) : cur;
  let guard = 0;
  while (cur <= fin && guard++ < 120) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
  }
  return out;
};
// Quincenas (periodo|Q) que cubre un rango de fechas — para saber qué keys
// gc-marks-* hay que cargar.
const quincenasDeRango = (desde, hasta) => {
  const seen = new Set();
  const out = [];
  fechasEnRango(desde, hasta).forEach(f => {
    const q = quincenaDe(f);
    const k = `${q.periodo}|${q.quincena}`;
    if (!seen.has(k)) { seen.add(k); out.push(q); }
  });
  return out;
};
// "7h 29m" a partir de horas decimales; null = "—".
const fmtHoras = (h) => {
  if (h == null || !Number.isFinite(h)) return "—";
  let hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh++; mm = 0; }
  return `${hh}h ${String(mm).padStart(2, "0")}m`;
};
// "Lun 18/08" para las filas del reporte.
const fmtDiaCorto = (fecha) => {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  const dia = DIAS[dow] || "";
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1, 3)} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
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
  // Cache de fotos { fileId: dataUrl } — las mismas fotos de la ficha de
  // GeoTeam (cp-file-<id>). Se cargan en segundo plano DESPUÉS del primer
  // paint (patrón de HRModule) para no frenar la lista en la tablet; quedan
  // en memoria todo el día (la key cp-file- no cachea en localStorage).
  const [fotos, setFotos] = useState({});
  // Comentario opcional del marcaje de SALIDA (ej. "salgo del plantel a
  // proyecto La Cañada a terminar la jornada allá") — pedido 18-ago-2026.
  const [comentSalida, setComentSalida] = useState("");
  // ── Vista REGISTROS (reporte de entradas/salidas) ──
  const [regDesde, setRegDesde] = useState(() => ahoraTegus().fecha);
  const [regHasta, setRegHasta] = useState(() => ahoraTegus().fecha);
  const [regPersona, setRegPersona] = useState("");
  const [regProy, setRegProy] = useState("");
  // Marcajes cargados por quincena para el reporte: { "periodo|Q": [...] }.
  const [regMarks, setRegMarks] = useState({});
  const [regLoading, setRegLoading] = useState(false);
  // Quincenas que NO se pudieron leer de la nube (el reporte estaría
  // incompleto): se muestra banner y se advierte antes de exportar.
  const [regErr, setRegErr] = useState([]);
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
      // Kiosk: la vista Registros también vuelve sola al marcaje (si queda
      // abierta, la tablet no muestra el buscador y el polling se congela).
      if (view === "registros" && (userRole === "logistica" || userRole === "asistente_compras" || userRole === "marcaje")) {
        idleTimer.current = setTimeout(() => reset(), 180000);
      }
    };
    arm();
    const onActivity = () => { if (view === "person" || view === "registros") arm(); };
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
  // Fotos de los ACTIVOS en segundo plano, una vez cargada la lista — solo
  // las que falten en el cache (mismo patrón que HRModule). No bloquea el
  // primer paint: la card muestra iniciales y la foto aparece al llegar.
  useEffect(() => {
    const faltan = [];
    const vistos = new Set();
    for (const e of emps) {
      const fid = e.status === "active" ? e.photo?.fileId : null;
      if (fid && !fotos[fid] && !vistos.has(fid)) { vistos.add(fid); faltan.push(fid); }
    }
    if (!faltan.length) return;
    (async () => {
      const results = await Promise.all(faltan.map(async (fid) => {
        try { const f = await store.get(`cp-file-${fid}`); return [fid, f?.dataUrl || null]; }
        catch { return [fid, null]; }
      }));
      setFotos(prev => {
        const next = { ...prev };
        let changed = false;
        for (const [fid, url] of results) if (url && !next[fid]) { next[fid] = url; changed = true; }
        return changed ? next : prev;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emps]);
  // Vista Registros: carga los marcajes de TODAS las quincenas que cubre el
  // rango elegido (lectura directa a nube para ver lo último; si una key
  // falla se queda con lo que hubiera en cache de la sesión).
  useEffect(() => {
    if (view !== "registros") return;
    const qs = quincenasDeRango(regDesde, regHasta).slice(0, 9); // tope ~4.5 meses
    if (!qs.length) return;
    let vivo = true;
    (async () => {
      setRegLoading(true);
      const fallas = [];
      try {
        const entries = await Promise.all(qs.map(async ({ periodo, quincena }) => {
          const k = `${periodo}|${quincena}`;
          try {
            const mk = await store.getCloud(gcMarkKey(periodo, quincena));
            return [k, Array.isArray(mk) ? mk : []];
          } catch {
            // Sin nube: NO mostrar el reporte como si estuviera completo.
            // Para la quincena ACTUAL, caer al estado vivo del reloj (marks).
            fallas.push(`${quincena} ${periodo}`);
            const esActual = periodo === q.periodo && quincena === q.quincena;
            return [k, regMarks[k] || (esActual ? marks : [])];
          }
        }));
        if (vivo) {
          setRegMarks(prev => ({ ...prev, ...Object.fromEntries(entries) }));
          setRegErr(fallas);
        }
      } finally { if (vivo) setRegLoading(false); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, regDesde, regHasta]);
  // ── Cálculo del reporte (memoizado: el reloj re-renderiza cada segundo y
  // sin esto un rango de 120 días × 40 personas se recalcularía por tick) ──
  const regData = useMemo(() => {
    const hoyF = now.fecha;
    const fechas = fechasEnRango(regDesde, regHasta);
    // fechasEnRango tiene tope 120 días: si el rango pedido es más largo,
    // avisar en vez de exportar un reporte incompleto en silencio.
    const truncado = fechas.length > 0 && fechas[fechas.length - 1] < regHasta ? fechas[fechas.length - 1] : null;
    const proyectoDe = (emp, fecha) => {
      const { periodo, quincena } = quincenaDe(fecha);
      const cu = cuads.find(c => c && c.company === emp.company && c.periodo === periodo && c.quincena === quincena);
      return (cu?.assignments || {})[emp.id] || emp.project || "SIN PROYECTO";
    };
    const rowsAll = [];
    fechas.forEach(fecha => {
      const q2 = quincenaDe(fecha);
      const arr = regMarks[`${q2.periodo}|${q2.quincena}`] || [];
      const delDia = arr.filter(mk => mk && mk.fecha === fecha);
      [...new Set(delDia.map(mk => mk.empId))].forEach(eid => {
        // Empleado borrado de hr-emps5: sus horas NO pueden desaparecer del
        // reporte — el mark trae nombre y empresa, se arma una ficha sintética.
        const emp = emps.find(e => e.id === eid)
          || { id: eid, fullName: `${(delDia.find(mk => mk.empId === eid) || {}).empNombre || "(desconocido)"} (baja)`, company: (delDia.find(mk => mk.empId === eid) || {}).company || "", project: "", status: "inactive" };
        if (regPersona && eid !== regPersona) return;
        const entradas = delDia.filter(mk => mk.empId === eid && mk.tipo === "entrada").sort((a, b) => (a.min || 0) - (b.min || 0));
        const salidas = delDia.filter(mk => mk.empId === eid && mk.tipo === "salida").sort((a, b) => (b.min || 0) - (a.min || 0));
        const ent = entradas[0] || null, sal = salidas[0] || null;
        // Guards NaN: min podría faltar en un mark corrupto/editado a mano.
        const eMin = Number.isFinite(ent?.min) ? ent.min : null;
        const sMin = Number.isFinite(sal?.min) ? sal.min : null;
        let brutas = null, almuerzo = 0, netas = null;
        if (eMin != null && sMin != null && sMin > eMin) {
          brutas = (sMin - eMin) / 60;
          almuerzo = (eMin <= 12 * 60 && sMin >= 13 * 60) ? 1 : 0;
          netas = Math.max(0, brutas - almuerzo);
        }
        // Estado HONESTO cuando no hay total: "en curso" SOLO hoy; un día
        // pasado sin salida es "sin salida"; entrada+salida incoherentes
        // (mismo minuto, o turno que cruzó medianoche) = "marcas inválidas".
        const estado = netas != null ? null
          : sal && ent ? "marcas inválidas"
          : sal && !ent ? "—"
          : fecha === hoyF ? "en curso" : "sin salida";
        rowsAll.push({ fecha, emp, proy: proyectoDe(emp, fecha), ent, sal, brutas, almuerzo, netas, estado });
      });
    });
    // El filtro de proyecto activo SIEMPRE está en las opciones (si no, al
    // cambiar el rango el select quedaba "huérfano" en blanco).
    const proyOpciones = [...new Set([...rowsAll.map(r => r.proy), ...(regProy ? [regProy] : [])])].sort();
    const rows = (regProy ? rowsAll.filter(r => r.proy === regProy) : rowsAll)
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.emp.fullName).localeCompare(String(b.emp.fullName)));
    const grupos = {};
    rows.forEach(r => { (grupos[r.proy] = grupos[r.proy] || []).push(r); });
    const totNetas = rows.reduce((s, r) => s + (r.netas || 0), 0);
    const totTardes = rows.filter(r => r.ent && r.ent.tarde).length;
    return { rows, grupos, proyOpciones, totNetas, totTardes, truncado };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regMarks, regDesde, regHasta, regPersona, regProy, emps, cuads, now.fecha]);

  const reset = () => {
    setView("search"); setSel(null); setSearch(""); setExplicacion("");
    setTieneFirma(false); setDoneInfo(null); setTipoAccion("entrada"); setComentSalida("");
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
    setSel(e); setView("person"); setExplicacion(""); setTieneFirma(false); setComentSalida("");
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
      // Prioridad: si la foto del seleccionado aún no llegó del bulk, traerla ya.
      if (!fotos[e.photo.fileId]) {
        try { const f = await store.get(`cp-file-${e.photo.fileId}`); if (f?.dataUrl) setFotos(prev => ({ ...prev, [e.photo.fileId]: f.dataUrl })); } catch { /* sin foto */ }
      }
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
        // Comentario opcional de la SALIDA (ej. "salgo del plantel a proyecto")
        comentario: tipoAccion === "salida" ? comentSalida.trim() : "",
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
  const esKiosk = userRole === "logistica" || userRole === "asistente_compras" || userRole === "marcaje";
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
        {view === "registros"
          ? <button onClick={reset} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: ORANGE, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>⏰ Volver a marcar</button>
          : <button onClick={() => conClave(() => setView("registros"))} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${ORANGE}`, background: "#fff", color: ORANGE_DARK, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>{esKiosk ? "🔒 " : ""}📋 Registros</button>}
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
              {fotos[e.photo?.fileId]
                ? <img src={fotos[e.photo.fileId]} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 44, height: 44, borderRadius: 12, background: co.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{iniciales(e.fullName)}</div>}
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
                  {mk.comentario ? <span title={mk.comentario} style={{ marginLeft: 6, fontWeight: 400, color: "#3E6A99" }}>💬 {mk.comentario.length > 40 ? mk.comentario.slice(0, 40) + "…" : mk.comentario}</span> : null}
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
            {fotos[selEmp.photo?.fileId]
              ? <img src={fotos[selEmp.photo.fileId]} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
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

            {/* Comentario opcional de SALIDA (ej. "salgo del plantel a proyecto") */}
            {tipoAccion === "salida" && <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 16, padding: "14px 16px" }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1E40AF" }}>💬 ¿Algún comentario? <span style={{ fontWeight: 400, fontSize: 12, color: "#3E6A99" }}>(opcional)</span></div>
              <div style={{ fontSize: 12, color: "#3E6A99", margin: "4px 0 8px" }}>Ej: "salgo del plantel a proyecto La Cañada", "cita médica autorizada" — queda en el registro para RRHH.</div>
              <textarea value={comentSalida} onChange={e => setComentSalida(e.target.value)} rows={2}
                placeholder="Escribí tu comentario acá…"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid #BFDBFE", fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
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

      {/* ── REGISTROS: reporte de entradas y salidas ── */}
      {view === "registros" && (() => {
        const hoy = ahoraTegus().fecha;
        const preset = (tipo) => {
          if (tipo === "hoy") { setRegDesde(hoy); setRegHasta(hoy); }
          if (tipo === "semana") {
            const [y, m, d] = hoy.split("-").map(Number);
            const dow = new Date(y, m - 1, d).getDay();
            const lun = new Date(y, m - 1, d - ((dow + 6) % 7)); // lunes de esta semana
            setRegDesde(`${lun.getFullYear()}-${String(lun.getMonth() + 1).padStart(2, "0")}-${String(lun.getDate()).padStart(2, "0")}`);
            setRegHasta(hoy);
          }
          if (tipo === "mes") { setRegDesde(`${hoy.slice(0, 7)}-01`); setRegHasta(hoy); }
        };
        // El cálculo (filas, grupos, totales) vive en regData (useMemo arriba)
        // para no recomputarse con cada tick del reloj.
        const { rows, grupos, proyOpciones, totNetas, totTardes, truncado } = regData;
        const personasOpc = activos.slice().sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
        const nombreCorto = (s) => { const p = String(s || "").split(/\s+/); return p.length > 2 ? `${p[0]} ${p[1]} ${p[2][0]}.` : s; };
        const chip = (txt, on, onClick) => (
          <span key={txt} role="button" onClick={onClick} style={{ padding: "6px 14px", borderRadius: 999, border: `1.5px solid ${on ? ORANGE : BORDER}`, background: on ? ORANGE : "#fff", color: on ? "#fff" : "#5C5853", fontSize: 13, fontWeight: 700, cursor: "pointer", userSelect: "none" }}>{txt}</span>
        );
        const selSt = { padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", minWidth: 160 };
        // ── Exportar CSV (Excel-friendly, con BOM) ──
        const bajarCSV = () => {
          if (!rows.length) return alert("No hay registros en el filtro actual para exportar.");
          if ((regErr.length || truncado) && !confirm("⚠️ El reporte puede estar INCOMPLETO (" + (regErr.length ? `no se pudieron cargar: ${regErr.join(", ")}` : `el rango se cortó en ${truncado}`) + ").\n\n¿Exportar igual?")) return;
          // Anti-inyección de fórmulas: el comentario es texto libre del
          // empleado — si empieza con = + - @ tab, Excel lo evaluaría como
          // fórmula al abrir el CSV. Se neutraliza con un apóstrofe.
          const enc = (s) => {
            const v = String(s ?? "");
            const safe = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
            return `"${safe.replace(/"/g, '""')}"`;
          };
          const head = ["Fecha", "Dia", "Colaborador", "Empresa", "Proyecto", "Entrada", "Min tarde", "Salida", "Comentario salida", "Horas brutas", "Almuerzo (h)", "Horas laboradas"];
          const lines = [head.map(enc).join(",")];
          rows.forEach(r => lines.push([
            r.fecha, fmtDiaCorto(r.fecha), r.emp.fullName, (COMPANIES[r.emp.company] || {}).name || r.emp.company, r.proy,
            r.ent ? r.ent.hora : "", r.ent && r.ent.tarde ? r.ent.minTarde : "",
            r.sal ? r.sal.hora : "", (r.sal && r.sal.comentario) || "",
            r.brutas != null ? r.brutas.toFixed(2) : "", r.brutas != null ? r.almuerzo.toFixed(2) : "",
            r.netas != null ? r.netas.toFixed(2) : "",
          ].map(enc).join(",")));
          const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `GeoClock_registros_${regDesde}_a_${regHasta}.csv`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        };
        // ── Imprimir / PDF (helvetica, sin emojis — convención jsPDF/print) ──
        const imprimirPDF = () => {
          if (!rows.length) return alert("No hay registros en el filtro actual para imprimir.");
          const w = window.open("", "_blank");
          if (!w) return alert("Permití las ventanas emergentes para imprimir.");
          const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
          const filtros = [
            `Rango: ${regDesde} a ${regHasta}`,
            regPersona ? `Colaborador: ${esc((emps.find(e => e.id === regPersona) || {}).fullName || "")}` : "Todos los colaboradores",
            regProy ? `Proyecto: ${esc(regProy)}` : "Todos los proyectos",
          ].join(" &middot; ");
          let cuerpo = "";
          Object.keys(grupos).sort().forEach(proy => {
            const rs = grupos[proy];
            const sub = rs.reduce((s, r) => s + (r.netas || 0), 0);
            cuerpo += `<h3 style='margin:18px 0 6px;color:#C75F1F;font-size:13px'>${esc(proy)} <span style='color:#8B847C;font-weight:400'>&mdash; ${rs.length} registro(s) &middot; ${fmtHoras(sub)} laboradas</span></h3>`;
            cuerpo += "<table><thead><tr><th>Fecha</th><th>Colaborador</th><th>Entrada</th><th>Salida</th><th>Comentario</th><th style='text-align:right'>Brutas</th><th style='text-align:right'>Almuerzo</th><th style='text-align:right'>Laboradas</th></tr></thead><tbody>";
            rs.forEach(r => {
              cuerpo += `<tr><td>${fmtDiaCorto(r.fecha)} ${r.fecha.slice(0, 4)}</td><td>${esc(r.emp.fullName)}</td>` +
                `<td>${r.ent ? esc(r.ent.hora) + (r.ent.tarde ? ` <span style='color:#C0392B;font-weight:bold'>(+${r.ent.minTarde} min)</span>` : "") : "&mdash;"}</td>` +
                `<td>${r.sal ? esc(r.sal.hora) : "&mdash;"}</td><td style='font-size:9px;color:#555'>${esc((r.sal && r.sal.comentario) || "")}</td>` +
                `<td style='text-align:right'>${r.brutas != null ? fmtHoras(r.brutas) : "&mdash;"}</td>` +
                `<td style='text-align:right'>${r.brutas != null ? (r.almuerzo ? "1h 00m" : "&mdash;") : "&mdash;"}</td>` +
                `<td style='text-align:right;font-weight:bold;color:#166534'>${r.netas != null ? fmtHoras(r.netas) : esc(r.estado || "—")}</td></tr>`;
            });
            cuerpo += "</tbody></table>";
          });
          w.document.write(`<!DOCTYPE html><html><head><meta charset='utf-8'><title>GeoClock - Registros</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Helvetica,Arial,sans-serif;padding:28px;color:#2C2A28}table{border-collapse:collapse;width:100%;margin-top:4px}th,td{border:1px solid #DBD4C8;padding:4px 7px;font-size:10px}th{background:#F8F2E6;text-align:left}@media print{.np{display:none}}</style></head><body>` +
            `<div style='display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #E8762D;padding-bottom:8px'><div><h1 style='font-size:18px'>GeoClock &mdash; Reporte de entradas y salidas</h1><div style='font-size:11px;color:#8B847C'>Grupo Geotecnica &middot; ${filtros}</div></div><div style='font-size:10px;color:#8B847C'>Generado: ${hoy}</div></div>` +
            cuerpo +
            `<div style='margin-top:14px;padding:10px 14px;background:#F8F2E6;border-left:4px solid #E8762D;font-size:12px'><b>TOTAL GENERAL:</b> ${rows.length} registro(s) &middot; ${fmtHoras(totNetas)} laboradas &middot; ${totTardes} llegada(s) tarde. <span style='color:#8B847C'>El total descuenta 1h de almuerzo cuando la jornada cruza el mediodia (12:00-13:00).</span></div>` +
            `<br><button class='np' onclick='window.print()' style='padding:10px 24px;font-size:13px;cursor:pointer;background:#E8762D;color:#fff;border:none;border-radius:8px'>Imprimir / Guardar como PDF</button></body></html>`);
          w.document.close();
        };
        return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>📋 Registros de entradas y salidas</div>
            <div style={{ fontSize: 13, color: STONE, marginTop: 2 }}>Marcajes del reloj por día, agrupados por proyecto. El total laborado descuenta 1h de almuerzo cuando la jornada cruza el mediodía (12:00–13:00).</div>
          </div>
          {/* Filtros */}
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {chip("Hoy", regDesde === hoy && regHasta === hoy, () => preset("hoy"))}
              {chip("Esta semana", false, () => preset("semana"))}
              {chip("Este mes", regDesde === `${hoy.slice(0, 7)}-01` && regHasta === hoy, () => preset("mes"))}
              <span style={{ fontSize: 12, color: STONE, marginLeft: 4 }}>o elegí el rango:</span>
              <input type="date" value={regDesde} onChange={e => e.target.value && setRegDesde(e.target.value)} style={selSt} />
              <span style={{ color: STONE }}>→</span>
              <input type="date" value={regHasta} onChange={e => e.target.value && setRegHasta(e.target.value)} style={selSt} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={regPersona} onChange={e => setRegPersona(e.target.value)} style={selSt}>
                <option value="">👥 Todos los colaboradores</option>
                {personasOpc.map(e => <option key={e.id} value={e.id}>{nombreCorto(e.fullName)}</option>)}
              </select>
              <select value={regProy} onChange={e => setRegProy(e.target.value)} style={selSt}>
                <option value="">📍 Todos los proyectos</option>
                {proyOpciones.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <span style={{ flex: 1 }} />
              <span role="button" onClick={bajarCSV} style={{ padding: "9px 16px", borderRadius: 10, border: `1.5px solid ${GREEN}`, background: "#fff", color: "#166534", fontSize: 13, fontWeight: 800, cursor: "pointer", userSelect: "none" }}>⬇ Descargar CSV</span>
              <span role="button" onClick={imprimirPDF} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: ORANGE, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", userSelect: "none" }}>🖨 Imprimir / PDF</span>
            </div>
          </div>
          {/* Resumen del filtro */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Registros", rows.length], ["Horas laboradas", fmtHoras(totNetas)], ["Llegadas tarde", totTardes], ["Proyectos", Object.keys(grupos).length]].map(([l, v]) => (
              <div key={l} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 18px", minWidth: 120 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: STONE }}>{l}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: CHARCOAL }}>{v}</div>
              </div>
            ))}
          </div>
          {regErr.length > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#991B1B" }}>
            ⚠️ No se pudieron cargar los marcajes de: <b>{regErr.join(", ")}</b> — el reporte puede estar INCOMPLETO. Revisá la conexión y volvé a elegir el rango para reintentar.
          </div>}
          {truncado && <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#92400E" }}>
            ⚠️ El rango supera 120 días: se muestra solo hasta el <b>{truncado}</b>. Acortá el rango para ver el resto.
          </div>}
          {regLoading && <div style={{ textAlign: "center", color: STONE, fontSize: 13, padding: 10 }}>⏳ Cargando marcajes…</div>}
          {!regLoading && rows.length === 0 && <div style={{ background: "#fff", border: `1px dashed ${BORDER}`, borderRadius: 16, padding: 30, textAlign: "center", color: STONE, fontSize: 14 }}>
            No hay marcajes en este rango/filtro. Quien no marcó en el reloj no aparece acá.
          </div>}
          {/* Grupos por proyecto */}
          {Object.keys(grupos).sort().map(proy => {
            const rs = grupos[proy];
            const sub = rs.reduce((s, r) => s + (r.netas || 0), 0);
            return <div key={proy} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#F8F2E6", borderLeft: `4px solid ${ORANGE}` }}>
                <span style={{ fontWeight: 900, fontSize: 15 }}>📍 {proy}</span>
                <span style={{ fontSize: 12.5, color: "#5C5853" }}>{rs.length} registro(s) · <b style={{ color: "#166534" }}>{fmtHoras(sub)}</b> laboradas</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead><tr style={{ color: STONE, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    <th style={{ textAlign: "left", padding: "8px 14px" }}>Fecha</th>
                    <th style={{ textAlign: "left", padding: "8px 10px" }}>Colaborador</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Entrada</th>
                    <th style={{ textAlign: "center", padding: "8px 10px" }}>Salida</th>
                    <th style={{ textAlign: "right", padding: "8px 10px" }}>Brutas</th>
                    <th style={{ textAlign: "right", padding: "8px 10px" }}>Almuerzo</th>
                    <th style={{ textAlign: "right", padding: "8px 14px" }}>Laboradas</th>
                  </tr></thead>
                  <tbody>
                    {rs.map((r, i) => <tr key={`${r.emp.id}-${r.fecha}`} style={{ borderTop: "1px solid #F1EBE0", background: i % 2 ? "#FFFDF9" : "#fff" }}>
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap", color: "#5C5853" }}>{fmtDiaCorto(r.fecha)}</td>
                      <td style={{ padding: "9px 10px", fontWeight: 700 }}>{nombreCorto(r.emp.fullName)}</td>
                      <td style={{ padding: "9px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {r.ent ? <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, color: r.ent.tarde ? "#B45309" : "#166534" }}>{r.ent.hora}{r.ent.tarde && <span style={{ fontSize: 10, background: "#FEE2E2", color: "#B91C1C", borderRadius: 5, padding: "1px 5px", marginLeft: 5 }}>+{r.ent.minTarde}m</span>}</span> : <span style={{ color: "#B8B0A4" }}>—</span>}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center" }}>
                        {r.sal ? <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, color: "#3E6A99" }}>{r.sal.hora}</span> : <span style={{ color: "#B8B0A4" }}>—</span>}
                        {r.sal && r.sal.comentario && <div title={r.sal.comentario} style={{ fontSize: 10.5, color: "#3E6A99", maxWidth: 200, margin: "2px auto 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>💬 {r.sal.comentario}</div>}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: "#5C5853", whiteSpace: "nowrap" }}>{r.brutas != null ? fmtHoras(r.brutas) : "—"}</td>
                      <td style={{ padding: "9px 10px", textAlign: "right", color: r.almuerzo ? "#B45309" : "#B8B0A4", whiteSpace: "nowrap" }}>{r.brutas != null ? (r.almuerzo ? "−1h 00m" : "—") : "—"}</td>
                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 900, color: r.netas != null ? "#166534" : r.estado === "en curso" ? "#B45309" : "#B91C1C", whiteSpace: "nowrap" }}>{r.netas != null ? fmtHoras(r.netas) : (r.estado || "—")}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </div>;
          })}
          {rows.length > 0 && <div style={{ background: "#F8F2E6", borderLeft: `4px solid ${ORANGE}`, borderRadius: 12, padding: "12px 16px", fontSize: 13.5 }}>
            <b>TOTAL GENERAL:</b> {rows.length} registro(s) · <b style={{ color: "#166534" }}>{fmtHoras(totNetas)}</b> laboradas · {totTardes} llegada(s) tarde
          </div>}
        </div>;
      })()}
    </div>

    <div style={{ textAlign: "center", padding: "12px 0 18px", fontSize: 11, color: "#B8B0A4", borderTop: `1px solid ${BORDER}`, background: "#fff" }}>
      GeoClock · Grupo Geotecnica — plantel central y oficina · los marcajes alimentan la asistencia de GeoTeam
    </div>
  </div>;
}
