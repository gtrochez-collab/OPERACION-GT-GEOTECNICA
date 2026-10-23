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
//     Después de eso el marcaje queda como LLEGADA TARDE y pide una
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
import { HORARIOS, horarioDe, TOLERANCIA_MIN, gcMarkKey, minTardeDe } from "./HRModule.jsx";
import { GT_CSS } from "./gt-ui.js";
import { ubicacionDeMarcaje, ubicacionesDeTablet, nombreUbicacion } from "./geoclock-calc.js";

// Rediseño GeoCore (23-oct-2026): vidrio, paleta carbón/naranja/gris, sin
// emojis. La tablet toma una FOTO automática al registrar (anti "marcar por
// otro") y la ubicación del marcaje la decide la persona (geoclock-calc.js).
const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const CHARCOAL = "#2C2A28";
const CREAM = "#F9F9F8";
const BORDER = "rgba(44,42,40,.1)";
const STONE = "#6E6862";
const GREEN = "#177243";
const RED = "#B03024";
const AMBER = "#A94E16";
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
// ── UBICACIONES DE TABLET (21-ago-2026) ─────────────────────────────────
// Cada tablet de marcaje "es" una sede: la de administración marca en
// ADMINISTRACIÓN, la de Oscar en PLANTEL, y a futuro las de los ingenieros
// en su proyecto (se define en users.js con el campo `ubicacion`). GeoClock
// estampa la ubicación en cada marcaje, y Registros usa la lista de sedes
// con tablet para mostrar como NO MARCÓ a los asignados que no marcaron.
const sinAcentos = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const UBICACIONES_TABLET = [...new Set(USERS.flatMap(u => ubicacionesDeTablet(u)))];
const tabletDe = (label) => USERS.find(u => u.label === label) || null;
// ¿El proyecto asignado (short) pertenece a una sede con tablet?
const proyectoConTablet = (short) => {
  const p = sinAcentos(short);
  if (!p || p === "SIN PROYECTO") return false;
  return UBICACIONES_TABLET.some(u => p.includes(sinAcentos(u)));
};
// Ubicación de la tablet del usuario logueado (por su label en users.js).
const ubicacionDeUsuario = (label) => (USERS.find(u => u.label === label) || {}).ubicacion || "";

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

// ── Cámara de la tablet (23-oct-2026) ──────────────────────────────────
// Vista previa de la cámara frontal mientras la persona marca; al confirmar
// se captura un cuadro (JPEG ~320 px, 10-25 KB) que se guarda en
// gc-foto-<markId>. Si no hay cámara o no dan permiso, el marcaje sigue
// (queda `sinFoto`) — la foto es evidencia, no candado.
const CamaraMarcaje = ({ camRef, onEstado }) => {
  const videoRef = useRef(null);
  const [estado, setEstado] = useState("pidiendo");   // pidiendo | lista | sin
  useEffect(() => {
    let stream = null, vivo = true;
    const arrancar = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setEstado("sin"); onEstado && onEstado(false); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!vivo) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        setEstado("lista"); onEstado && onEstado(true);
      } catch { setEstado("sin"); onEstado && onEstado(false); }
    };
    arrancar();
    if (camRef) camRef.current = {
      capturar: () => {
        const v = videoRef.current;
        if (!v || !v.videoWidth || estado === "sin") return null;
        try {
          const W = 320, H = Math.round(W * (v.videoHeight / v.videoWidth));
          const c = document.createElement("canvas"); c.width = W; c.height = H;
          const ctx = c.getContext("2d");
          // Espejo: así la foto queda como la ve la persona en la pantalla.
          ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0, W, H);
          return c.toDataURL("image/jpeg", 0.7);
        } catch { return null; }
      },
    };
    return () => { vivo = false; if (stream) stream.getTracks().forEach(t => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderRadius: 16, overflow: "hidden", background: "#2C2A28" }}>
    <video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", display: estado === "sin" ? "none" : "block" }} />
    {estado !== "lista" && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "rgba(255,255,255,.85)", fontSize: 13, fontWeight: 700, padding: 12, textAlign: "center" }}>
      {estado === "pidiendo" ? "Encendiendo la cámara…" : "Sin cámara: el marcaje queda sin foto"}
    </div>}
    {estado === "lista" && <div style={{ position: "absolute", left: 10, bottom: 8, padding: "4px 10px", borderRadius: 999, background: "rgba(0,0,0,.45)", color: "#fff", fontSize: 11.5, fontWeight: 700 }}>Mirá a la cámara: se toma la foto al registrar</div>}
  </div>;
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
  return <canvas ref={canvasRef} style={{ width: "100%", height: 170, background: "#fff", border: "1.5px dashed rgba(44,42,40,.25)", borderRadius: 14, touchAction: "none", cursor: "crosshair", display: "block" }} />;
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
  // Corrección MANUAL de marcajes olvidados (18-ago, caso de Ariel): Ana,
  // Gerson y la Lic. Carolina pueden colocar la entrada/salida que el
  // colaborador no marcó, con justificación OBLIGATORIA e historial.
  // corr = { empId, fecha, tipo, hora, justif } | null (modal cerrado).
  const [corr, setCorr] = useState(null);
  const [corrSaving, setCorrSaving] = useState(false);
  // Decisiones de RRHH sobre llegadas tarde (gc-tardies). GeoClock SOLO LEE
  // esta key (el único escritor es HRModule): sirve para pintar en Registros
  // si la tardanza fue aprobada (verde) o denegada (rojo).
  const [regTardies, setRegTardies] = useState([]);
  // Marcaje abierto en el modal de detalle/edición (con su historial).
  const [det, setDet] = useState(null);
  const [detSaving, setDetSaving] = useState(false);
  const [verHoy, setVerHoy] = useState(false);
  const padRef = useRef(null);
  const camRef = useRef(null);
  const [camOk, setCamOk] = useState(null);     // null = sin pedir · true · false
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
        // Decisiones de RRHH (aprobada/denegada) para colorear las tardanzas.
        let tds = [];
        try { const t = await store.getCloud("gc-tardies"); tds = Array.isArray(t) ? t : []; }
        catch { tds = []; }
        if (vivo) {
          setRegMarks(prev => ({ ...prev, ...Object.fromEntries(entries) }));
          setRegTardies(tds);
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
        // Día CERRADO = ya pasó (el reloj solo marca el día en curso, tope
        // 11:59 PM). En un día cerrado: sin salida = "NO MARCÓ"; sin entrada
        // = "NO MARCÓ" (la regla de negocio: sin entrada al cierre de la
        // jornada se entiende como NO SE PRESENTÓ — el NSP va en GeoTeam).
        const cerrado = fecha < hoyF;
        const estado = netas != null ? null
          : sal && ent ? "marcas inválidas"
          : !sal && ent ? (fecha === hoyF ? "en curso" : "—") : "—";
        rowsAll.push({ fecha, emp, proy: proyectoDe(emp, fecha), ent, sal, brutas, almuerzo, netas, estado, cerrado });
      });
      // ── AUSENTES DE LAS SEDES CON TABLET (21-ago-2026, caso José Miguel) ──
      // Antes el reporte solo listaba a quienes marcaron: el que no vino era
      // invisible y no había cómo ponerle marcaje manual desde acá. Ahora, en
      // días CERRADOS donde la tablet SÍ operó (hubo entradas), los activos
      // asignados por cuadrilla a una sede con tablet (PLANTEL,
      // ADMINISTRACIÓN, y los proyectos que se sumen en users.js) que no
      // tienen ningún marcaje aparecen con NO MARCÓ en entrada y salida —
      // listos para el ➕ de marcaje manual, o para confirmar el NSP en la
      // hoja de GeoTeam. Si nadie marcó ese día (tablet apagada), no se
      // inventa nada.
      const cerradoDia = fecha < hoyF;
      if (cerradoDia && delDia.some(mk => mk && mk.tipo === "entrada")) {
        const marcaron = new Set(delDia.map(mk => mk.empId));
        emps.forEach(e => {
          if (e.status !== "active" || marcaron.has(e.id)) return;
          if (e.noMarca) return;   // no requiere marcaje: no es un ausente
          if (regPersona && e.id !== regPersona) return;
          const proy = proyectoDe(e, fecha);
          if (!proyectoConTablet(proy)) return;
          rowsAll.push({ fecha, emp: e, proy, ent: null, sal: null, brutas: null, almuerzo: 0, netas: null, estado: "—", cerrado: true, ausente: true });
        });
      }
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

  // Los que no requieren marcaje (jefaturas) no salen en el reloj: no tienen
  // por qué marcar y solo estorbaban en la búsqueda.
  const activos = emps.filter(e => e.status === "active" && !e.noMarca);
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
  // Proyecto asignado en la cuadrilla de esta quincena (para la ubicación del marcaje).
  const asignacionDe = (emp) => { const c = cuads.find(x => x && x.company === emp.company && x.periodo === q.periodo && x.quincena === q.quincena); return (c?.assignments || {})[emp.id] || ""; };
  const ubicacionDe = (emp) => ubicacionDeMarcaje(tabletDe(userName), emp, asignacionDe(emp));

  const selEmp = sel ? emps.find(e => e.id === sel.id) || sel : null;
  const horario = selEmp ? horarioDe(selEmp) : HORARIOS.plantel;
  const entradaMin = selEmp ? minDe(horario.entrada) : minDe("7:00");
  // Atraso EFECTIVO: se cuenta desde que vence la tolerancia, no desde la
  // hora de entrada (fix 19-ago-2026). Horario 8:00 + 15 min de gracia →
  // quien marca 8:20 llegó 5 min tarde, y eso es lo que se le descuenta.
  const minTarde = Math.max(0, now.min - (entradaMin + TOLERANCIA_MIN));
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
    if (!padRef.current?.hasInk()) return alert("Falta tu firma — firmá en el recuadro para registrar.");
    if (esTarde && !explicacion.trim()) return alert("Llegaste tarde: contanos brevemente por qué. Tu explicación va a RRHH para que decidan si se otorga el permiso.");
    if (!cuadrillaOk(selEmp)) return alert("No hay distribución de cuadrilla para esta quincena. Avisale a RRHH.");
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
        alert("Justo se pasó la tolerancia — contanos brevemente por qué llegás tarde y volvé a tocar Registrar.");
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
      catch { alert("No hay conexión con la nube — el marcaje NO se registró. Avisale al encargado y volvé a intentar."); return; }
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
      if (!firmaOk) { alert("No se pudo guardar la firma en la nube. Revisá la señal y volvé a intentar — NO se registró nada."); return; }
      // 2b) Foto automática de la tablet (evidencia de que marcó la persona).
      const fotoData = camRef.current?.capturar?.() || null;
      if (fotoData) {
        const fotoOk = await store.set(`gc-foto-${id}`, { dataUrl: fotoData, empId: selEmp.id, fecha: t.fecha, tipo: tipoAccion, createdAt: nowIso });
        if (!fotoOk) { alert("No se pudo guardar la foto en la nube. Revisá la señal y volvé a intentar — NO se registró nada."); return; }
      }
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
        minTarde: tarde ? Math.max(0, t.min - (entradaMin + TOLERANCIA_MIN)) : 0,
        horarioEntrada: horario.entrada,
        explicacion: tarde ? explicacion.trim() : "",
        // Comentario opcional de la SALIDA (ej. "salgo del plantel a proyecto")
        comentario: tipoAccion === "salida" ? comentSalida.trim() : "",
        firmaId: id,
        fotoId: fotoData ? id : null,
        sinFoto: !fotoData,
        registradoPor: userName || "GeoClock",
        // La ubicación la decide la PERSONA (cuadrilla o departamento), no
        // la tablet: la de la pared cubre administración y plantel.
        ubicacion: ubicacionDeMarcaje(tabletDe(userName), selEmp, asignacionDe(selEmp)),
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
        alert("El marcaje NO se pudo verificar en la nube. Volvé a intentarlo — si sigue fallando, avisale a RRHH.");
        return;
      }
      setDoneInfo({ tipo: tipoAccion, hora: t.hora, tarde, minTarde: mark.minTarde, nombre: selEmp.fullName.split(" ").slice(0, 2).join(" ") });
      setView("done");
    } finally {
      setSaving(false);
    }
  };

  // ── Corrección MANUAL de marcajes (18-ago-2026, caso de Ariel) ──
  // Solo Ana (asistente_compras), Gerson (admin/coordinador) y la Lic.
  // Carolina (tesoreria). Coloca la ENTRADA o SALIDA que el colaborador no
  // marcó, con justificación OBLIGATORIA; el mark queda manual:true con
  // historial (quién, cuándo, por qué, y que el colaborador NO marcó).
  const puedeCorregir = userRole === "admin" || userRole === "coordinador" || userRole === "tesoreria" || userRole === "asistente_compras";
  const guardarMarcaManual = async () => {
    if (corrSaving || !corr) return;
    const emp = emps.find(e => e.id === corr.empId);
    if (!emp) return alert("Elegí al colaborador.");
    const hoyF = ahoraTegus().fecha;
    if (!corr.fecha || corr.fecha > hoyF) return alert("La fecha no puede ser futura.");
    const [hh, mm] = String(corr.hora || "").split(":").map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return alert("Poné la hora (ej. 16:00).");
    if (String(corr.justif || "").trim().length < 3) return alert("La justificación es OBLIGATORIA — queda en el historial del marcaje.");
    setCorrSaving(true);
    try {
      const q2 = quincenaDe(corr.fecha);
      const key = gcMarkKey(q2.periodo, q2.quincena);
      let cloudArr;
      try { const c = await store.getCloud(key); cloudArr = Array.isArray(c) ? c : []; }
      catch { alert("No hay conexión con la nube — no se guardó nada. Reintentá."); return; }
      const dup = cloudArr.find(x => x && x.empId === corr.empId && x.fecha === corr.fecha && x.tipo === corr.tipo);
      if (dup) { alert(`Ya existe una ${corr.tipo.toUpperCase()} de ${emp.fullName} ese día (${dup.hora}${dup.manual ? ", manual" : ""}). Quitala primero si está mal.`); return; }
      const nowIso = new Date().toISOString();
      const id = uid();
      const hora = `${hh}:${String(mm).padStart(2, "0")}`;
      const mark = {
        id, empId: emp.id, empNombre: emp.fullName, company: emp.company,
        fecha: corr.fecha, hora, min: hh * 60 + mm, tipo: corr.tipo,
        // Manual NUNCA genera tardanza: es una corrección administrativa con
        // justificación de RRHH, no un marcaje del colaborador.
        tarde: false, minTarde: 0, horarioEntrada: horarioDe(emp).entrada,
        explicacion: "", comentario: "",
        manual: true, justificacion: String(corr.justif).trim(), editadoPor: userName || "RRHH",
        historial: [{ accion: `${corr.tipo} colocada MANUALMENTE (el colaborador no marcó)`, por: userName || "RRHH", justificacion: String(corr.justif).trim(), fecha: hoyF, at: nowIso }],
        firmaId: null, registradoPor: userName || "RRHH", ts: nowIso, createdAt: nowIso,
      };
      let next = [...unionById(cloudArr, [mark])];
      const ok = await store.set(key, next);
      let verified = false;
      try { const back = await store.getCloud(key); if (Array.isArray(back) && back.some(x => x && x.id === id)) { verified = true; next = back; } } catch { verified = false; }
      if (!ok || !verified) { alert("No se pudo VERIFICAR el guardado en la nube — reintentá."); return; }
      setRegMarks(prev => ({ ...prev, [`${q2.periodo}|${q2.quincena}`]: next }));
      if (key === marksKey) setMarks(next);
      setCorr(null);
      alert(`${corr.tipo === "entrada" ? "ENTRADA" : "SALIDA"} manual guardada para ${emp.fullName} — ${corr.fecha} a las ${hora}. Quedó en el historial con tu justificación.`);
    } finally { setCorrSaving(false); }
  };
  const borrarMarcaManual = async (mk) => {
    if (!puedeCorregir || !mk.manual) return;
    if (!confirm(`¿Quitar la ${mk.tipo.toUpperCase()} MANUAL de ${mk.empNombre} (${mk.fecha} · ${mk.hora})?\n\nJustificación original: "${mk.justificacion || "—"}"\n\nPodés volver a colocarla con la hora correcta (queda nuevo historial).`)) return;
    const q2 = quincenaDe(mk.fecha);
    const key = gcMarkKey(q2.periodo, q2.quincena);
    let cloudArr;
    try { const c = await store.getCloud(key); cloudArr = Array.isArray(c) ? c : []; }
    catch { return alert("Sin conexión con la nube — no se quitó nada."); }
    const next = cloudArr.filter(x => x && x.id !== mk.id);
    const ok = await store.set(key, next);
    let verified = false;
    try { const back = await store.getCloud(key); verified = Array.isArray(back) && !back.some(x => x && x.id === mk.id); } catch { verified = false; }
    if (!ok || !verified) return alert("No se pudo verificar — reintentá.");
    setRegMarks(prev => ({ ...prev, [`${q2.periodo}|${q2.quincena}`]: next }));
    if (key === marksKey) setMarks(next);
    setDet(null);
  };

  // ── Tardanzas: decisión de RRHH y minutos EFECTIVOS ──
  // La decisión vive en gc-tardies (la escribe GeoTeam). Un registro en
  // estado "pendiente" (o sin registro) sigue sin decidir.
  const decisionDe = (mk) => {
    if (!mk || !mk.tarde) return null;
    const t = (regTardies || []).find(x => x && x.markId === mk.id);
    return t && (t.estado === "aprobada" || t.estado === "denegada") ? t : null;
  };
  // Minutos tarde recalculados desde la hora marcada y el horario del propio
  // marcaje: los guardados antes del 19-ago-2026 traen la cuenta vieja (desde
  // la hora de entrada en vez de desde el fin de la tolerancia).
  const minTardeMk = (mk) => {
    if (!mk || !mk.tarde) return 0;
    const emp = emps.find(e => e.id === mk.empId);
    return minTardeDe(mk.hora, mk.horarioEntrada || horarioDe(emp).entrada);
  };
  // Estado visual de una entrada tarde: verde si RRHH la aprobó (justificada,
  // día completo), rojo si la denegó (se descuenta), ámbar si está pendiente.
  const estiloTarde = (mk) => {
    const dec = decisionDe(mk);
    if (!dec) return { bg: "#FEF3C7", fg: "#92400E", txt: "pendiente", hora: "#B45309" };
    if (dec.estado === "aprobada") return { bg: "#DCFCE7", fg: "#166534", txt: "justificada", hora: "#166534" };
    return { bg: "#FEE2E2", fg: "#B91C1C", txt: "se descuenta", hora: "#B91C1C" };
  };

  // Abre el detalle de un marcaje (lo ven TODOS los roles; editar solo
  // quienes pueden corregir). Trae la firma bajo demanda si tiene.
  const abrirDetalle = (mk) => {
    if (!mk) return;
    setDet({ mk, hora: mk.hora || "", comentario: mk.comentario || "", justif: "", firma: undefined, foto: mk.fotoId ? undefined : null });
    if (mk.fotoId) {
      (async () => {
        try { const f = await store.get(`gc-foto-${mk.fotoId}`); setDet(d => (d && d.mk.id === mk.id ? { ...d, foto: f?.dataUrl || null } : d)); }
        catch { setDet(d => (d && d.mk.id === mk.id ? { ...d, foto: null } : d)); }
      })();
    }
    if (mk.firmaId) {
      (async () => {
        try { const f = await store.get(`gc-firma-${mk.firmaId}`); setDet(d => (d && d.mk.id === mk.id ? { ...d, firma: f?.dataUrl || null } : d)); }
        catch { setDet(d => (d && d.mk.id === mk.id ? { ...d, firma: null } : d)); }
      })();
    }
  };

  // ── Editar un marcaje existente (hora / comentario) con historial ──
  // Cualquier cambio queda registrado en mk.historial: quién, cuándo, qué
  // cambió y por qué. Al mover la hora de una ENTRADA se recalcula si sigue
  // siendo tarde y cuántos minutos, con el horario del colaborador.
  const guardarEdicion = async () => {
    if (!det || !puedeCorregir) return;
    const mk = det.mk;
    const nuevaHora = String(det.hora || "").trim();
    const justif = String(det.justif || "").trim();
    if (!/^\d{1,2}:\d{2}$/.test(nuevaHora)) return alert("Poné una hora válida (formato 24 h, ej. 7:05 o 16:30).");
    const [nh, nm] = nuevaHora.split(":").map(Number);
    if (!(nh >= 0 && nh <= 23 && nm >= 0 && nm <= 59)) return alert("Hora fuera de rango.");
    const nuevoComent = mk.tipo === "salida" ? String(det.comentario || "").trim() : (mk.comentario || "");
    const cambioHora = nuevaHora !== mk.hora;
    const cambioComent = nuevoComent !== (mk.comentario || "");
    if (!cambioHora && !cambioComent) return alert("No cambiaste nada.");
    if (justif.length < 3) return alert("Escribí la justificación del cambio (queda en el historial).");
    setDetSaving(true);
    try {
      const q2 = quincenaDe(mk.fecha);
      const key = gcMarkKey(q2.periodo, q2.quincena);
      let cloudArr;
      try { const c = await store.getCloud(key); cloudArr = Array.isArray(c) ? c : []; }
      catch { setDetSaving(false); return alert("Sin conexión con la nube — no se guardó nada. Reintentá."); }
      const actual = cloudArr.find(x => x && x.id === mk.id);
      if (!actual) { setDetSaving(false); return alert("Ese marcaje ya no existe en la nube (alguien lo borró). Cerrá y volvé a abrir Registros."); }
      const emp = emps.find(e => e.id === mk.empId);
      const horarioEnt = actual.horarioEntrada || horarioDe(emp).entrada;
      const esDomFer = (() => {
        const d = new Date(`${mk.fecha}T12:00:00`);
        return d.getDay() === 0 || esFeriadoQuincena(mk.fecha.slice(0, 7), Number(mk.fecha.slice(8, 10)));
      })();
      const minNuevo = nh * 60 + nm;
      // Una marca MANUAL nunca genera tardanza (la colocó RRHH, no el reloj).
      const tardeNuevo = actual.tipo === "entrada" && !actual.manual && !esDomFer
        && minNuevo > (minDe(horarioEnt) + TOLERANCIA_MIN);
      const acciones = [];
      if (cambioHora) acciones.push(`hora ${actual.tipo} corregida: ${actual.hora} → ${nuevaHora}`);
      if (cambioComent) acciones.push(`comentario de salida ${actual.comentario ? "modificado" : "agregado"}`);
      const entrada = {
        accion: acciones.join(" · "), por: userName, justificacion: justif,
        fecha: ahoraTegus().fecha, at: new Date().toISOString(),
        antes: { hora: actual.hora, comentario: actual.comentario || "" },
      };
      const editado = {
        ...actual, hora: nuevaHora, min: minNuevo, comentario: nuevoComent,
        tarde: tardeNuevo, minTarde: tardeNuevo ? minTardeDe(nuevaHora, horarioEnt) : 0,
        editadoPor: userName, editadoAt: entrada.at,
        historial: [...(Array.isArray(actual.historial) ? actual.historial : []), entrada],
      };
      const next = cloudArr.map(x => (x && x.id === mk.id ? editado : x));
      const ok = await store.set(key, next);
      let verified = false;
      try {
        const back = await store.getCloud(key);
        verified = Array.isArray(back) && back.some(x => x && x.id === mk.id && x.hora === nuevaHora);
        if (verified) { setRegMarks(prev => ({ ...prev, [`${q2.periodo}|${q2.quincena}`]: back })); if (key === marksKey) setMarks(back); }
      } catch { verified = false; }
      if (!ok || !verified) { setDetSaving(false); return alert("No se pudo VERIFICAR el cambio en la nube — reintentá."); }
      const avisoTarde = mk.tarde && !tardeNuevo ? "\n\nOJO: con la hora nueva ya NO es llegada tarde. Si tenía decisión de RRHH, revisá la pestaña Llegadas tardías de GeoTeam."
        : (!mk.tarde && tardeNuevo ? "\n\nOJO: con la hora nueva SÍ es llegada tarde — cae en Llegadas tardías de GeoTeam para decidirla." : "");
      setDet(null);
      alert(`Marcaje actualizado. El cambio quedó en el historial.${avisoTarde}`);
    } finally { setDetSaving(false); }
  };

  // ── UI ──
  // MODO KIOSCO: en las tablets de Oscar (logistica) y Ana (asistente_compras)
  // los botones de salida piden la contraseña del encargado — sin esto,
  // cualquier colaborador podía tocar "← Módulos" y navegar GeoLogistics/
  // GeoSafety/GeoTeam con la sesión del encargado. Admin/coordinador salen libre.
  const esKiosk = userRole === "logistica" || userRole === "asistente_compras" || userRole === "marcaje";
  const conClave = (accion) => {
    if (!esKiosk) return accion();
    const pass = prompt("Modo kiosco — contraseña del encargado para salir:");
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

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "inherit", color: STONE, background: CREAM, fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoClock…</div>;

  const ubicsTablet = ubicacionesDeTablet(tabletDe(userName));
  const pill = (label, onClick, { lleno = false, c = CHARCOAL } = {}) => <button type="button" onClick={onClick} style={{ minHeight: 36, padding: "7px 14px", borderRadius: 999, border: lleno ? "1px solid transparent" : "1px solid rgba(44,42,40,.14)", background: lleno ? c : "rgba(255,255,255,.75)", color: lleno ? "#fff" : c, font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>;
  return <div className="gt-root gt-entra-modulo" style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "var(--sans)", color: CHARCOAL, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
    <style>{GT_CSS}</style>
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />
    {/* HEADER: logo + reloj vivo */}
    <div style={{ position: "relative", zIndex: 2, borderBottom: "1px solid rgba(44,42,40,.08)", padding: "12px 22px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Logo size={36} />
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg></div>
        <div>
          <div style={{ font: "800 16px/1 var(--display)", color: CHARCOAL }}>GeoClock</div>
          <div style={{ fontSize: 11.5, color: STONE, marginTop: 3 }}>{ubicsTablet.length ? ubicsTablet.map(nombreUbicacion).join(" · ") : (userName || "Grupo Geotecnica")}</div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 34, lineHeight: 1, color: CHARCOAL, letterSpacing: "-.02em" }}>
          {reloj.txt}<span style={{ fontSize: 18, color: ORANGE }}>:{reloj.seg}</span> <span style={{ fontSize: 15, color: STONE, fontWeight: 600 }}>{reloj.ampm}</span>
        </div>
        <div style={{ fontSize: 12, color: STONE, marginTop: 3 }}>{fechaLarga(now.fecha, now.dow)} · {q.quincena} {q.periodo}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {view === "registros" ? pill("Volver al reloj", reset, { lleno: true, c: ORANGE_DARK }) : pill("Registros", () => conClave(() => setView("registros")))}
        {pill("Módulos", () => conClave(onBack))}
        {pill("Salir", () => conClave(onLogout))}
      </div>
    </div>

    <div style={{ position: "relative", zIndex: 1, flex: 1, maxWidth: 900, width: "100%", margin: "0 auto", padding: "22px 18px 40px", boxSizing: "border-box" }}>
      {loadErr && <div className="gt-vidrio" style={{ padding: "12px 16px", fontSize: 13, color: RED, marginBottom: 14 }}>
        No se pudo cargar la lista de personal desde la nube. Revisá la conexión y tocá <b onClick={loadAll} style={{ cursor: "pointer", textDecoration: "underline" }}>reintentar</b>.
      </div>}

      {/* ── BÚSQUEDA ── */}
      {view === "search" && <div>
        <div style={{ textAlign: "center", margin: "4px 0 18px" }}>
          <div style={{ font: "800 28px/1.15 var(--display)", color: CHARCOAL, letterSpacing: "-.02em" }}>Marcá tu asistencia</div>
          <div style={{ fontSize: 14, color: STONE, marginTop: 6 }}>Buscá tu nombre, mirá a la cámara y registrá tu entrada o salida.</div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Escribí tu nombre…" autoFocus
          style={{ width: "100%", boxSizing: "border-box", padding: "16px 20px", fontSize: 19, borderRadius: 18, border: `1.5px solid ${search ? ORANGE : "rgba(44,42,40,.12)"}`, outline: "none", background: "rgba(255,255,255,.85)", fontFamily: "inherit", color: CHARCOAL, boxShadow: "0 1px 2px rgba(44,42,40,.04)" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginTop: 16 }}>
          {resultados.map(e => {
            const ent = entradaDe(e.id), sal = salidaDe(e.id);
            const co = COMPANIES[e.company] || { name: e.company, color: STONE };
            return <button key={e.id} type="button" className="gt-vidrio gt-vidrio-hover" onClick={() => seleccionar(e)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left", fontFamily: "inherit", minHeight: 72 }}>
              {fotos[e.photo?.fileId]
                ? <img src={fotos[e.photo.fileId]} alt="" style={{ width: 46, height: 46, borderRadius: 13, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 46, height: 46, borderRadius: 13, background: "rgba(44,42,40,.07)", color: STONE, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{iniciales(e.fullName)}</div>}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: CHARCOAL, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.fullName}</div>
                <div style={{ fontSize: 11.5, color: STONE, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.position || co.name}</div>
                <div style={{ fontSize: 11, marginTop: 3, fontWeight: 700 }}>
                  {ent ? <span style={{ color: ent.tarde ? AMBER : GREEN }}>Entrada {ent.hora}{ent.tarde ? " · tarde" : ""}</span> : <span style={{ color: "#B5AFA6", fontWeight: 600 }}>Sin marcar hoy</span>}
                  {sal && <span style={{ color: STONE }}> · Salida {sal.hora}</span>}
                </div>
              </div>
            </button>;
          })}
          {resultados.length === 0 && <div className="gt-vidrio" style={{ gridColumn: "1/-1", textAlign: "center", color: STONE, fontSize: 14, padding: 30 }}>No encontramos a nadie con "{search}". Probá con otro nombre o avisale al encargado.</div>}
        </div>
        {/* Marcajes de hoy (para el encargado) */}
        <div className="gt-vidrio" style={{ marginTop: 22, padding: "12px 16px" }}>
          <div onClick={() => setVerHoy(v => !v)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: CHARCOAL }}>Marcajes de hoy <span style={{ color: "#A39C92", fontWeight: 600 }}>{marksHoy.length}</span></span>
            <span style={{ color: STONE, fontSize: 12 }}>{verHoy ? "ocultar" : "ver"}</span>
          </div>
          {verHoy && <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
            {marksHoy.slice().sort((a, b) => (b.min || 0) - (a.min || 0)).map(mk => (
              <div key={mk.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "6px 10px", background: "rgba(44,42,40,.035)", borderRadius: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{mk.empNombre}{mk.ubicacion ? <span style={{ color: "#A39C92", fontWeight: 600 }}> · {nombreUbicacion(mk.ubicacion)}</span> : null}</span>
                <span style={{ color: mk.tipo === "entrada" ? (mk.tarde ? AMBER : GREEN) : "#1D5FAF", fontWeight: 700 }}>
                  {mk.tipo === "entrada" ? (mk.tarde ? `Entrada ${mk.hora} · +${mk.minTarde} min` : `Entrada ${mk.hora}`) : `Salida ${mk.hora}`}
                  {mk.comentario ? <span title={mk.comentario} style={{ marginLeft: 6, fontWeight: 400, color: STONE }}>{mk.comentario.length > 40 ? mk.comentario.slice(0, 40) + "…" : mk.comentario}</span> : null}
                </span>
              </div>
            ))}
            {marksHoy.length === 0 && <div style={{ fontSize: 12, color: STONE }}>Nadie ha marcado todavía.</div>}
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
        const ubic = ubicacionDe(selEmp);
        const limite = (() => { const t = entradaMin + TOLERANCIA_MIN; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; })();
        const bloqueado = saving || !tieneFirma || (esTarde && !explicacion.trim());
        const segBtn = (label, on, enabled, onClick) => <button type="button" disabled={!enabled} onClick={onClick}
          style={{ flex: 1, minHeight: 56, padding: "12px 10px", borderRadius: 16, cursor: enabled ? "pointer" : "not-allowed", font: "800 16px/1.2 var(--display)", border: on ? "1px solid transparent" : "1px solid rgba(44,42,40,.12)", background: on ? CHARCOAL : "rgba(255,255,255,.75)", color: on ? "#fff" : enabled ? CHARCOAL : "#B5AFA6", fontFamily: "inherit" }}>{label}</button>;
        return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <button type="button" onClick={reset} style={{ alignSelf: "flex-start", minHeight: 38, padding: "8px 16px", borderRadius: 999, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "700 13px/1 var(--sans)", cursor: "pointer" }}>← No soy yo</button>
          <div className="gt-vidrio" style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {fotos[selEmp.photo?.fileId]
              ? <img src={fotos[selEmp.photo.fileId]} alt="" style={{ width: 76, height: 76, borderRadius: 20, objectFit: "cover" }} />
              : <div style={{ width: 76, height: 76, borderRadius: 20, background: "rgba(44,42,40,.07)", color: STONE, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 24 }}>{iniciales(selEmp.fullName)}</div>}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ font: "800 21px/1.15 var(--display)", color: CHARCOAL, letterSpacing: "-.01em" }}>{selEmp.fullName}</div>
              <div style={{ fontSize: 13, color: STONE, marginTop: 4 }}>{selEmp.position || "—"} · {co.name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(44,42,40,.06)", color: STONE, fontSize: 11.5, fontWeight: 700 }}>Horario {horario.entrada} – {horario.salida || "?"} · tolerancia hasta {limite}</span>
                {ubic && <span style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(232,118,45,.14)", color: "#A94E16", fontSize: 11.5, fontWeight: 700 }}>Marcás en {nombreUbicacion(ubic)}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
              {ent ? <span style={{ color: ent.tarde ? AMBER : GREEN, fontWeight: 800 }}>Entrada {ent.hora}</span> : <span style={{ color: "#A39C92" }}>Entrada pendiente</span>}
              {sal ? <span style={{ color: "#1D5FAF", fontWeight: 800 }}>Salida {sal.hora}</span> : <span style={{ color: "#A39C92" }}>Salida pendiente</span>}
            </div>
          </div>

          {!gate && <div className="gt-vidrio" style={{ padding: "18px 20px", textAlign: "center", boxShadow: "inset 3px 0 0 #B03024" }}>
            <div style={{ font: "800 17px/1.2 var(--display)", color: RED }}>Todavía no se puede marcar esta quincena</div>
            <div style={{ fontSize: 13.5, color: STONE, marginTop: 6, lineHeight: 1.5 }}>No hay cuadrilla {q.quincena} {q.periodo} para {co.name}. Avisale a RRHH que la arme en GeoTeam → Asistencia.</div>
          </div>}

          {gate && yaMarcoTodo && <div className="gt-vidrio" style={{ padding: "22px 20px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", margin: "0 auto 10px", background: "#DCF3E4", color: GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
            <div style={{ font: "800 17px/1.2 var(--display)", color: CHARCOAL }}>Ya marcaste entrada y salida hoy</div>
            <div style={{ fontSize: 13, color: STONE, marginTop: 4 }}>Entrada {ent.hora} · Salida {sal.hora}. Buen trabajo, {selEmp.fullName.split(" ")[0]}.</div>
          </div>}

          {gate && !yaMarcoTodo && <>
            <div style={{ display: "flex", gap: 10 }}>
              {segBtn(ent ? `Entrada · ${ent.hora}` : "Entrada", tipoAccion === "entrada", puedeEntrada, () => setTipoAccion("entrada"))}
              {segBtn(sal ? `Salida · ${sal.hora}` : "Salida", tipoAccion === "salida", puedeSalida, () => setTipoAccion("salida"))}
            </div>

            {esTarde && <div className="gt-vidrio" style={{ padding: "14px 16px", boxShadow: "inset 3px 0 0 #E8762D" }}>
              <div style={{ font: "800 16px/1.2 var(--display)", color: CHARCOAL }}>Llegaste tarde <span style={{ color: AMBER, fontSize: 14 }}>+{minTarde} min después de tu tolerancia ({limite})</span></div>
              <div style={{ fontSize: 12.5, color: STONE, margin: "6px 0 8px" }}>Contanos por qué. Tu explicación va a RRHH, que decide si se paga el día completo o se descuenta lo que llegaste tarde.</div>
              <textarea value={explicacion} onChange={e => setExplicacion(e.target.value)} rows={2} placeholder="Ej: se accidentó el bus, cita médica, tráfico en la salida al sur…"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(44,42,40,.14)", fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", background: "rgba(255,255,255,.85)" }} />
            </div>}
            {tipoAccion === "entrada" && !esTarde && <div style={{ fontSize: 13, color: GREEN, fontWeight: 700, padding: "0 4px" }}>Vas a tiempo: son las {now.hora} y tu tolerancia va hasta las {limite}.</div>}

            {tipoAccion === "salida" && <div className="gt-vidrio" style={{ padding: "12px 16px" }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: CHARCOAL }}>¿Algún comentario? <span style={{ fontWeight: 500, fontSize: 12, color: STONE }}>(opcional) · ej. "salgo del plantel a proyecto"</span></div>
              <textarea value={comentSalida} onChange={e => setComentSalida(e.target.value)} rows={2} placeholder="Escribí tu comentario acá…"
                style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(44,42,40,.14)", fontSize: 14, fontFamily: "inherit", resize: "vertical", outline: "none", background: "rgba(255,255,255,.85)" }} />
            </div>}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)", gap: 12 }}>
              <div className="gt-vidrio" style={{ padding: 12 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: CHARCOAL, marginBottom: 8 }}>Tu foto</div>
                <CamaraMarcaje camRef={camRef} onEstado={setCamOk} />
              </div>
              <div className="gt-vidrio" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: CHARCOAL }}>Firmá para confirmar</span>
                  <button type="button" onClick={() => padRef.current?.clear()} style={{ padding: "5px 12px", borderRadius: 999, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.75)", color: STONE, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Borrar</button>
                </div>
                <SignaturePad padRef={padRef} onInk={setTieneFirma} />
              </div>
            </div>

            <button type="button" onClick={registrar} disabled={bloqueado}
              style={{ minHeight: 60, padding: "16px 26px", borderRadius: 18, border: "none", cursor: bloqueado ? "not-allowed" : "pointer", background: bloqueado ? "rgba(44,42,40,.18)" : ORANGE_DARK, color: "#fff", font: "800 18px/1 var(--display)", boxShadow: bloqueado ? "none" : "0 8px 22px rgba(199,95,31,.28)", fontFamily: "inherit" }}>
              {saving ? "Registrando…" : `Registrar ${tipoAccion} · ${now.hora}`}
            </button>
            {!tieneFirma && <div style={{ textAlign: "center", fontSize: 12, color: STONE }}>La firma es obligatoria para registrar.</div>}
          </>}
        </div>;
      })()}

      {/* ── CONFIRMACIÓN ── */}
      {view === "done" && doneInfo && <div style={{ textAlign: "center", padding: "40px 10px" }}>
        <div style={{ width: 110, height: 110, borderRadius: "50%", margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center", background: doneInfo.tarde ? "rgba(232,118,45,.16)" : "#DCF3E4", color: doneInfo.tarde ? AMBER : GREEN }}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">{doneInfo.tarde ? <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> : <path d="M5 12.5l4.5 4.5L19 7.5" />}</svg>
        </div>
        <div style={{ font: "800 26px/1.15 var(--display)", color: CHARCOAL, marginTop: 16, letterSpacing: "-.02em" }}>
          {doneInfo.tipo === "entrada" ? "Entrada registrada" : "Salida registrada"} · {doneInfo.hora}
        </div>
        <div style={{ fontSize: 15, color: STONE, marginTop: 8, maxWidth: 520, margin: "8px auto 0" }}>
          {doneInfo.tarde
            ? <>Llegaste <b style={{ color: AMBER }}>{doneInfo.minTarde} min tarde</b>. Tu explicación quedó en el reporte de RRHH.</>
            : <>{doneInfo.tipo === "entrada" ? "Buen día" : "Buen descanso"}, {doneInfo.nombre}.</>}
        </div>
        <button type="button" onClick={reset} style={{ marginTop: 22, minHeight: 50, padding: "13px 34px", borderRadius: 16, border: "none", background: ORANGE_DARK, color: "#fff", font: "800 15px/1 var(--display)", cursor: "pointer", fontFamily: "inherit" }}>Listo</button>
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
          <span key={txt} role="button" onClick={onClick} style={{ padding: "7px 14px", borderRadius: 999, border: `1px solid ${on ? "transparent" : "rgba(44,42,40,.14)"}`, background: on ? ORANGE_DARK : "rgba(255,255,255,.75)", color: on ? "#fff" : CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer", userSelect: "none" }}>{txt}</span>
        );
        const selSt = { padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", minWidth: 160 };
        // ── Exportar CSV (Excel-friendly, con BOM) ──
        const bajarCSV = () => {
          if (!rows.length) return alert("No hay registros en el filtro actual para exportar.");
          if ((regErr.length || truncado) && !confirm("El reporte puede estar INCOMPLETO (" + (regErr.length ? `no se pudieron cargar: ${regErr.join(", ")}` : `el rango se cortó en ${truncado}`) + ").\n\n¿Exportar igual?")) return;
          // Anti-inyección de fórmulas: el comentario es texto libre del
          // empleado — si empieza con = + - @ tab, Excel lo evaluaría como
          // fórmula al abrir el CSV. Se neutraliza con un apóstrofe.
          const enc = (s) => {
            const v = String(s ?? "");
            const safe = /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
            return `"${safe.replace(/"/g, '""')}"`;
          };
          const head = ["Fecha", "Dia", "Colaborador", "Empresa", "Proyecto", "Entrada", "Min tarde", "Estado tardanza", "Salida", "Comentario salida", "Manual / Justificacion", "Horas brutas", "Almuerzo (h)", "Horas laboradas"];
          const lines = [head.map(enc).join(",")];
          rows.forEach(r => lines.push([
            r.fecha, fmtDiaCorto(r.fecha), r.emp.fullName, (COMPANIES[r.emp.company] || {}).name || r.emp.company, r.proy,
            r.ent ? r.ent.hora : (r.cerrado ? "NO MARCO" : ""), r.ent && r.ent.tarde ? minTardeMk(r.ent) : "",
            r.ent && r.ent.tarde ? (decisionDe(r.ent) ? (decisionDe(r.ent).estado === "aprobada" ? "Justificada (aprobada)" : "Se descuenta (denegada)") : "Pendiente de decision") : "",
            r.sal ? r.sal.hora : (r.cerrado ? "NO MARCO" : ""), (r.sal && r.sal.comentario) || "",
            [r.ent && r.ent.manual ? `ENTRADA manual por ${r.ent.editadoPor}: ${r.ent.justificacion || ""}` : "", r.sal && r.sal.manual ? `SALIDA manual por ${r.sal.editadoPor}: ${r.sal.justificacion || ""}` : ""].filter(Boolean).join(" | "),
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
              const noMarco = "<span style='color:#C0392B;font-weight:bold'>NO MARCO</span>";
              const justifs = [r.ent && r.ent.manual ? `Entrada manual por ${r.ent.editadoPor}: ${r.ent.justificacion || ""}` : "", r.sal && r.sal.manual ? `Salida manual por ${r.sal.editadoPor}: ${r.sal.justificacion || ""}` : "", (r.sal && r.sal.comentario) || ""].filter(Boolean).join(" | ");
              cuerpo += `<tr><td>${fmtDiaCorto(r.fecha)} ${r.fecha.slice(0, 4)}</td><td>${esc(r.emp.fullName)}</td>` +
                `<td>${r.ent ? esc(r.ent.hora) + (r.ent.manual ? " <b>(manual)</b>" : "") + (r.ent.tarde ? (() => { const d = decisionDe(r.ent); const c = d ? (d.estado === "aprobada" ? "#166534" : "#B91C1C") : "#92400E"; const t = d ? (d.estado === "aprobada" ? "justificada" : "se descuenta") : "pendiente"; return ` <span style='color:${c};font-weight:bold'>(+${minTardeMk(r.ent)} min ${t})</span>`; })() : "") : (r.cerrado ? noMarco : "&mdash;")}</td>` +
                `<td>${r.sal ? esc(r.sal.hora) + (r.sal.manual ? " <b>(manual)</b>" : "") : (r.cerrado ? noMarco : "&mdash;")}</td><td style='font-size:9px;color:#555'>${esc(justifs)}</td>` +
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
            <div style={{ font: "800 22px/1.15 var(--display)", color: CHARCOAL, letterSpacing: "-.02em" }}>Registros de entradas y salidas</div>
            <div style={{ fontSize: 13, color: STONE, marginTop: 2 }}>Marcajes del reloj por día, agrupados por proyecto. El total laborado descuenta 1h de almuerzo cuando la jornada cruza el mediodía (12:00–13:00). El día cierra a las 11:59 PM: lo no marcado queda como <b style={{ color: "#B91C1C" }}>NO MARCÓ</b> (sin entrada = no se presentó; el NSP se maneja en la asistencia de GeoTeam){puedeCorregir ? " — vos podés colocar la hora faltante con justificación (queda en el historial)" : ""}.</div>
            {/* Leyenda de colores: qué significa cada chip de la tabla */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8, fontSize: 11 }}>
              <span style={{ color: STONE, fontWeight: 700, letterSpacing: 0.4 }}>Cómo leer:</span>
              <span style={{ background: "#DCFCE7", color: "#166534", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>+Xm justificada</span>
              <span style={{ color: STONE }}>tarde APROBADA por RRHH — día completo, sin descuento</span>
              <span style={{ background: "#FEE2E2", color: "#B91C1C", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>+Xm se descuenta</span>
              <span style={{ color: STONE }}>DENEGADA — descuento proporcional</span>
              <span style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>+Xm pendiente</span>
              <span style={{ color: STONE }}>sin decidir en GeoTeam</span>
              <span style={{ background: "#EDE9FE", color: "#6D28D9", borderRadius: 6, padding: "2px 8px", fontWeight: 800 }}>MANUAL</span>
              <span style={{ background: "#E0E7FF", color: "#3730A3", borderRadius: 6, padding: "2px 8px", fontWeight: 800 }}>✎</span>
              <span style={{ color: STONE }}>con cambios — tocá la hora para ver el historial</span>
            </div>
            <div style={{ fontSize: 11, color: STONE, marginTop: 4 }}>
              Los minutos tarde se cuentan desde que <b>vence la tolerancia</b> ({TOLERANCIA_MIN} min): con horario 8:00, marcar 8:20 son <b>5 minutos</b> tarde.
            </div>
          </div>
          {/* Filtros */}
          <div className="gt-vidrio" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
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
                <option value="">Todos los colaboradores</option>
                {personasOpc.map(e => <option key={e.id} value={e.id}>{nombreCorto(e.fullName)}</option>)}
              </select>
              <select value={regProy} onChange={e => setRegProy(e.target.value)} style={selSt}>
                <option value="">Todos los proyectos</option>
                {proyOpciones.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <span style={{ flex: 1 }} />
              {puedeCorregir && <span role="button" onClick={() => setCorr({ empId: "", fecha: ahoraTegus().fecha, tipo: "entrada", hora: "", justif: "" })} style={{ minHeight: 36, padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>Marcaje manual</span>}
              <span role="button" onClick={bajarCSV} style={{ minHeight: 36, padding: "7px 14px", borderRadius: 999, border: "1px solid rgba(44,42,40,.14)", background: "rgba(255,255,255,.75)", color: CHARCOAL, font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>Descargar CSV</span>
              <span role="button" onClick={imprimirPDF} style={{ minHeight: 36, padding: "7px 14px", borderRadius: 999, border: "1px solid transparent", background: ORANGE_DARK, color: "#fff", font: "700 12.5px/1 var(--sans)", cursor: "pointer", whiteSpace: "nowrap" }}>Imprimir / PDF</span>
            </div>
          </div>
          {/* Resumen del filtro */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[["Registros", rows.length], ["Horas laboradas", fmtHoras(totNetas)], ["Llegadas tarde", totTardes], ["Proyectos", Object.keys(grupos).length]].map(([l, v]) => (
              <div key={l} className="gt-vidrio" style={{ padding: "10px 18px", minWidth: 120 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: STONE }}>{l}</div>
                <div style={{ font: "800 22px/1 var(--display)", color: CHARCOAL, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
          {regErr.length > 0 && <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#991B1B" }}>
            No se pudieron cargar los marcajes de: <b>{regErr.join(", ")}</b> — el reporte puede estar INCOMPLETO. Revisá la conexión y volvé a elegir el rango para reintentar.
          </div>}
          {truncado && <div style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#92400E" }}>
            El rango supera 120 días: se muestra solo hasta el <b>{truncado}</b>. Acortá el rango para ver el resto.
          </div>}
          {regLoading && <div style={{ textAlign: "center", color: STONE, fontSize: 13, padding: 10 }}>Cargando marcajes…</div>}
          {!regLoading && rows.length === 0 && <div style={{ background: "#fff", border: `1px dashed ${BORDER}`, borderRadius: 16, padding: 30, textAlign: "center", color: STONE, fontSize: 14 }}>
            No hay marcajes en este rango/filtro. Quien no marcó en el reloj no aparece acá.
          </div>}
          {/* Grupos por proyecto */}
          {Object.keys(grupos).sort().map(proy => {
            const rs = grupos[proy];
            const sub = rs.reduce((s, r) => s + (r.netas || 0), 0);
            return <div key={proy} className="gt-vidrio" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid rgba(44,42,40,.07)" }}>
                <span style={{ font: "800 15px/1.2 var(--display)", color: CHARCOAL }}>{proy}</span>
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
                    {rs.map((r, i) => <tr key={`${r.emp.id}-${r.fecha}`} style={{ borderTop: "1px solid rgba(44,42,40,.06)", background: i % 2 ? "rgba(44,42,40,.02)" : "transparent" }}>
                      <td style={{ padding: "9px 14px", whiteSpace: "nowrap", color: "#5C5853" }}>{fmtDiaCorto(r.fecha)}</td>
                      <td style={{ padding: "9px 10px", fontWeight: 700 }}>{nombreCorto(r.emp.fullName)}</td>
                      <td style={{ padding: "9px 10px", textAlign: "center", whiteSpace: "nowrap" }}>
                        {r.ent ? (() => { const st = r.ent.tarde ? estiloTarde(r.ent) : null; return (
                          <span role="button" title="Ver detalle e historial de este marcaje" onClick={() => abrirDetalle(r.ent)} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, color: st ? st.hora : "#166534", cursor: "pointer", borderBottom: "1px dotted #C9C1B4" }}>
                          {r.ent.hora}
                          {st && <span title={`Llegó ${minTardeMk(r.ent)} min después de su tolerancia — ${st.txt}`} style={{ fontSize: 10, background: st.bg, color: st.fg, borderRadius: 5, padding: "1px 5px", marginLeft: 5, fontWeight: 800 }}>+{minTardeMk(r.ent)}m</span>}
                          {r.ent.manual && <span title={`MANUAL — colocada por ${r.ent.editadoPor}. Justificación: ${r.ent.justificacion || "—"}`} style={{ fontSize: 9, background: "#EDE9FE", color: "#6D28D9", borderRadius: 5, padding: "1px 5px", marginLeft: 5, fontWeight: 800 }}>MANUAL</span>}
                          {(r.ent.historial || []).length > 0 && !r.ent.manual && <span title="Este marcaje tiene cambios registrados" style={{ fontSize: 9, background: "#E0E7FF", color: "#3730A3", borderRadius: 5, padding: "1px 5px", marginLeft: 4, fontWeight: 800 }}>✎</span>}
                        </span>); })() : r.cerrado
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#B91C1C", background: "#FEE2E2", borderRadius: 5, padding: "2px 7px" }} title="Día cerrado sin entrada: se entiende como NO SE PRESENTÓ (el NSP se marca en la asistencia de GeoTeam)">NO MARCÓ</span>
                              {puedeCorregir && <span role="button" title="Colocar la entrada manualmente (con justificación)" onClick={() => setCorr({ empId: r.emp.id, fecha: r.fecha, tipo: "entrada", hora: "", justif: "" })} style={{ cursor: "pointer", fontSize: 13, color: ORANGE_DARK, fontWeight: 900 }}>➕</span>}
                            </span>
                          : <span style={{ color: "#B8B0A4" }}>—</span>}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center" }}>
                        {r.sal ? <span role="button" title="Ver detalle e historial de este marcaje" onClick={() => abrirDetalle(r.sal)} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, color: "#3E6A99", cursor: "pointer", borderBottom: "1px dotted #C9C1B4" }}>
                          {r.sal.hora}
                          {r.sal.manual && <span title={`MANUAL — colocada por ${r.sal.editadoPor}. Justificación: ${r.sal.justificacion || "—"}`} style={{ fontSize: 9, background: "#EDE9FE", color: "#6D28D9", borderRadius: 5, padding: "1px 5px", marginLeft: 5, fontWeight: 800 }}>MANUAL</span>}
                          {(r.sal.historial || []).length > 0 && !r.sal.manual && <span title="Este marcaje tiene cambios registrados" style={{ fontSize: 9, background: "#E0E7FF", color: "#3730A3", borderRadius: 5, padding: "1px 5px", marginLeft: 4, fontWeight: 800 }}>✎</span>}
                        </span> : r.cerrado
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#B91C1C", background: "#FEE2E2", borderRadius: 5, padding: "2px 7px" }} title="El colaborador no marcó su salida ese día (el día cierra 11:59 PM)">NO MARCÓ</span>
                              {puedeCorregir && <span role="button" title="Colocar la salida manualmente (con justificación)" onClick={() => setCorr({ empId: r.emp.id, fecha: r.fecha, tipo: "salida", hora: "", justif: "" })} style={{ cursor: "pointer", fontSize: 13, color: ORANGE_DARK, fontWeight: 900 }}>➕</span>}
                            </span>
                          : <span style={{ color: "#B8B0A4" }}>—</span>}
                        {r.sal && r.sal.comentario && <div title={r.sal.comentario} style={{ fontSize: 10.5, color: "#3E6A99", maxWidth: 200, margin: "2px auto 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sal.comentario}</div>}
                        {r.sal && r.sal.manual && r.sal.justificacion && <div title={r.sal.justificacion} style={{ fontSize: 10, color: "#6D28D9", maxWidth: 200, margin: "2px auto 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sal.justificacion}</div>}
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
          {rows.length > 0 && <div className="gt-vidrio" style={{ padding: "12px 16px", fontSize: 13.5 }}>
            <b>TOTAL GENERAL:</b> {rows.length} registro(s) · <b style={{ color: "#166534" }}>{fmtHoras(totNetas)}</b> laboradas · {totTardes} llegada(s) tarde
          </div>}
          {/* ── Modal de MARCAJE MANUAL (justificación obligatoria) ── */}
          {corr && <div style={{ position: "fixed", inset: 0, background: "rgba(44,42,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => !corrSaving && setCorr(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: "20px 22px", width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 20px 60px rgba(44,42,40,0.3)" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 17 }}>Marcaje manual</div>
                <div style={{ fontSize: 12, color: STONE, marginTop: 2 }}>Para cuando el colaborador NO marcó. Queda en el historial: quién lo colocó, cuándo y por qué.</div>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#5C5853" }}>Colaborador
                <select value={corr.empId} onChange={e => setCorr(c => ({ ...c, empId: e.target.value }))} style={{ width: "100%", marginTop: 4, padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                  <option value="">— Elegí —</option>
                  {activos.slice().sort((a, b) => String(a.fullName).localeCompare(String(b.fullName))).map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#5C5853", flex: 1 }}>Fecha
                  <input type="date" max={ahoraTegus().fecha} value={corr.fecha} onChange={e => setCorr(c => ({ ...c, fecha: e.target.value }))} style={{ width: "100%", marginTop: 4, padding: "8px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#5C5853" }}>Tipo
                  <select value={corr.tipo} onChange={e => setCorr(c => ({ ...c, tipo: e.target.value }))} style={{ display: "block", marginTop: 4, padding: "8px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                    <option value="entrada">Entrada</option>
                    <option value="salida">Salida</option>
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#5C5853" }}>Hora
                  <input type="time" value={corr.hora} onChange={e => setCorr(c => ({ ...c, hora: e.target.value }))} style={{ display: "block", marginTop: 4, padding: "8px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
                </label>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#5C5853" }}>Justificación (obligatoria)
                <textarea rows={2} value={corr.justif} onChange={e => setCorr(c => ({ ...c, justif: e.target.value }))}
                  placeholder='Ej: "Salió a las 4 pero se le olvidó marcar — confirmado con Oscar"'
                  style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: "9px 12px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13.5, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button disabled={corrSaving} onClick={() => setCorr(null)} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: STONE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                <button disabled={corrSaving} onClick={guardarMarcaManual} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: corrSaving ? "#D8D2C8" : "#6D28D9", color: "#fff", fontSize: 13, fontWeight: 800, cursor: corrSaving ? "wait" : "pointer" }}>{corrSaving ? "Guardando…" : "Guardar marcaje manual"}</button>
              </div>
            </div>
          </div>}

          {/* ── DETALLE DE UN MARCAJE: datos, firma, historial y edición ── */}
          {det && (() => {
            const mk = det.mk;
            const emp = emps.find(e => e.id === mk.empId);
            const dec = decisionDe(mk);
            const st = mk.tarde ? estiloTarde(mk) : null;
            const hist = Array.isArray(mk.historial) ? mk.historial : [];
            const lbl = { fontSize: 11, fontWeight: 800, color: STONE, letterSpacing: 0.5, textTransform: "uppercase" };
            const dato = (k, v) => <div><div style={lbl}>{k}</div><div style={{ fontSize: 13.5, fontWeight: 700, color: CHARCOAL, marginTop: 1 }}>{v}</div></div>;
            return <div style={{ position: "fixed", inset: 0, background: "rgba(44,42,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={() => !detSaving && setDet(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 22, width: 560, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,.25)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: CHARCOAL }}>{mk.tipo === "entrada" ? "Entrada" : "Salida"} · {mk.empNombre}</div>
                    <div style={{ fontSize: 12, color: STONE, marginTop: 2 }}>{fmtDiaCorto(mk.fecha)} de {mk.fecha.slice(0, 4)} · {(COMPANIES[mk.company] || {}).name || mk.company}</div>
                  </div>
                  <button onClick={() => !detSaving && setDet(null)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: STONE }}>✕</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginTop: 14, background: CREAM, borderRadius: 12, padding: "12px 14px" }}>
                  {dato("Hora marcada", mk.hora)}
                  {dato("Horario", `${mk.horarioEntrada || horarioDe(emp).entrada} (tolerancia ${TOLERANCIA_MIN} min)`)}
                  {mk.tipo === "entrada" && dato("Puntualidad", mk.tarde
                    ? <span style={{ color: st.hora }}>{minTardeMk(mk)} min tarde · {st.txt}</span>
                    : <span style={{ color: "#166534" }}>A tiempo ✓</span>)}
                  {dato("Registrado en", mk.registradoPor || "—")}
                </div>

                {mk.tarde && <div style={{ marginTop: 12, background: st.bg, border: `1px solid ${st.fg}33`, borderRadius: 12, padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: st.fg }}>
                    {dec ? (dec.estado === "aprobada" ? "✓ Tardanza APROBADA por RRHH — el día se paga completo" : "✕ Tardanza DENEGADA — se aplica descuento proporcional") : "Tardanza PENDIENTE de decisión en GeoTeam"}
                  </div>
                  {mk.explicacion && <div style={{ fontSize: 12.5, color: CHARCOAL, marginTop: 4, fontStyle: "italic" }}>"{mk.explicacion}"</div>}
                  <div style={{ fontSize: 11, color: st.fg, marginTop: 4 }}>Llegó {minTardeMk(mk)} min después de su tolerancia (marcó {mk.hora}, límite {(() => { const t = minDe(mk.horarioEntrada || horarioDe(emp).entrada) + TOLERANCIA_MIN; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; })()}).</div>
                </div>}

                {mk.manual && <div style={{ marginTop: 12, background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 12, padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6D28D9" }}>Marcaje colocado MANUALMENTE por {mk.editadoPor || "—"}</div>
                  <div style={{ fontSize: 12.5, color: CHARCOAL, marginTop: 3 }}>{mk.justificacion || "—"}</div>
                </div>}

                {mk.comentario && !det.editando && <div style={{ marginTop: 12, fontSize: 12.5, color: "#3E6A99" }}>{mk.comentario}</div>}

                {mk.fotoId && <div style={{ marginTop: 12 }}>
                  <div style={lbl}>Foto al marcar</div>
                  {det.foto === undefined ? <div style={{ fontSize: 12, color: STONE }}>Cargando…</div>
                    : det.foto ? <img src={det.foto} alt="foto del marcaje" style={{ maxWidth: 240, borderRadius: 14, border: `1px solid ${BORDER}`, marginTop: 4, display: "block" }} />
                      : <div style={{ fontSize: 12, color: STONE }}>No se pudo cargar la foto.</div>}
                </div>}
                {mk.firmaId && <div style={{ marginTop: 12 }}>
                  <div style={lbl}>Firma</div>
                  {det.firma === undefined ? <div style={{ fontSize: 12, color: STONE }}>Cargando…</div>
                    : det.firma ? <img src={det.firma} alt="firma" style={{ maxWidth: 240, border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", marginTop: 4 }} />
                      : <div style={{ fontSize: 12, color: STONE }}>No se pudo cargar la firma.</div>}
                </div>}

                {/* HISTORIAL de cambios del marcaje */}
                <div style={{ marginTop: 16 }}>
                  <div style={lbl}>Historial de cambios</div>
                  {hist.length === 0
                    ? <div style={{ fontSize: 12.5, color: STONE, marginTop: 4 }}>Sin cambios — el marcaje está tal como se registró en el reloj.</div>
                    : <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                        {hist.map((h, i) => <div key={i} style={{ background: "#F8FAFC", borderLeft: "3px solid #94A3B8", borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: CHARCOAL }}>{h.accion}</div>
                          {h.justificacion && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>Motivo: {h.justificacion}</div>}
                          <div style={{ fontSize: 11, color: STONE, marginTop: 2 }}>{h.por} · {h.fecha ? fmtDiaCorto(h.fecha) : ""} {h.at ? new Date(h.at).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit", timeZone: "America/Tegucigalpa" }) : ""}</div>
                        </div>)}
                      </div>}
                </div>

                {/* EDICIÓN (solo autorizados) */}
                {puedeCorregir && <div style={{ marginTop: 16, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>
                  {!det.editando
                    ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => setDet(d => ({ ...d, editando: true }))} style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#6D28D9", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>✏️ Corregir este marcaje</button>
                        {mk.manual && <button onClick={() => borrarMarcaManual(mk)} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🗑 Quitar marca manual</button>}
                      </div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ flex: "1 1 140px" }}>
                            <div style={lbl}>Hora corregida</div>
                            <input type="time" value={(() => { const [h, m] = String(det.hora || "0:00").split(":"); return `${String(h).padStart(2, "0")}:${m || "00"}`; })()}
                              onChange={e => { const v = e.target.value; if (!v) return; const [h, m] = v.split(":"); setDet(d => ({ ...d, hora: `${Number(h)}:${m}` })); }}
                              style={{ ...selSt, width: "100%", marginTop: 3 }} />
                          </div>
                          {mk.tipo === "salida" && <div style={{ flex: "2 1 200px" }}>
                            <div style={lbl}>Comentario de la salida</div>
                            <input value={det.comentario} onChange={e => setDet(d => ({ ...d, comentario: e.target.value }))} placeholder="ej. salió a proyecto" style={{ ...selSt, width: "100%", marginTop: 3 }} />
                          </div>}
                        </div>
                        <div>
                          <div style={lbl}>Justificación del cambio (obligatoria)</div>
                          <textarea value={det.justif} onChange={e => setDet(d => ({ ...d, justif: e.target.value }))} rows={2}
                            placeholder="ej. el colaborador marcó tarde por fila en el reloj; hora real confirmada con el residente"
                            style={{ width: "100%", marginTop: 3, padding: "8px 10px", borderRadius: 10, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button disabled={detSaving} onClick={() => setDet(d => ({ ...d, editando: false, hora: mk.hora, comentario: mk.comentario || "", justif: "" }))} style={{ padding: "9px 16px", borderRadius: 10, border: `1px solid ${BORDER}`, background: "#fff", color: STONE, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                          <button disabled={detSaving} onClick={guardarEdicion} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: detSaving ? "#D8D2C8" : "#6D28D9", color: "#fff", fontSize: 13, fontWeight: 800, cursor: detSaving ? "wait" : "pointer" }}>{detSaving ? "Guardando…" : "Guardar cambio"}</button>
                        </div>
                      </div>}
                </div>}
              </div>
            </div>;
          })()}
        </div>;
      })()}
    </div>

    <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "12px 0 18px", fontSize: 11, color: "#A39C92" }}>
      GeoClock · Grupo Geotecnica · los marcajes alimentan la asistencia de GeoTeam
    </div>
  </div>;
}
