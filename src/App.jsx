import { useState, useEffect, useLayoutEffect, useRef } from "react";
import HRModule from "./HRModule.jsx";
import PurchasesModule from "./PurchasesModule.jsx";
import MachinesModule from "./MachinesModule.jsx";
import LogisticsModule from "./LogisticsModule.jsx";
import GeoDrillVault from "./GeoDrillVault.jsx";
import SafetyModule from "./SafetyModule.jsx";
import GeoClockModule from "./GeoClockModule.jsx";
// GeoChat: desactivado temporalmente (jun 2026). El polling y los mensajes
// en localStorage estaban presionando el cache. Cuando lo retomemos, sera
// con Supabase Realtime + bypass de localStorage (ya esta listo).
// import ChatModule, { fetchUnreadSummary, playBeep } from "./ChatModule.jsx";
import { store, onSyncStateChange } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import Logo from "./Logo.jsx";
import { BRAND, FONT } from "./theme.js";
import { USERS, ROLE_LABEL } from "./users.js";

// ── Modulos del sistema ──
// Cada modulo tiene un acento de color distinto (complementarios al naranja de marca).
// NOTA: GeoChat (id "geochat") esta temporalmente desactivado — ver import comentado arriba.
const MODULES = [
  {
    id: "rrhh",
    name: "GeoTeam",
    icon: "👥",
    desc: "El equipo, la asistencia y la planilla.",
    accent: "#2C5F5D",
    // Ana (asistente_compras) entra con acceso ACOTADO (ago 2026): empleados
    // sin salarios, contratos, vacaciones, permisos, asistencia, HE y
    // constancias — sin planilla, movimientos ni costos. El recorte fino de
    // pestañas vive en HRModule (isAnaRH).
    // Lic. Carolina (tesoreria): acceso COMPLETO igual que Gerson (18-ago).
    // Oscar (logistica): SOLO el aprobador de Llegadas tardías — responsable
    // de las tardanzas marcadas desde su tablet de plantel/almacén.
    roles: ["admin", "tesoreria", "asistente", "costos", "recepcion", "asistente_compras", "logistica"],
  },
  {
    id: "compras-operaciones",
    name: "GeoShopping",
    icon: "🛒",
    desc: "Compras, pagos y cierre contable.",
    accent: "#8B3A3A",
    roles: ["admin", "tesoreria", "gerencia", "costos", "recepcion", "asistente_compras", "visor_compras", "compras_ops"],
  },
  {
    id: "maquinas",
    name: "GeoMachinery",
    icon: "⚙️",
    desc: "Repuestos y mantenimiento, por máquina.",
    accent: "#7C3AED",
    roles: ["admin", "coordinador_maquinas", "tesoreria", "gerencia", "costos", "recepcion", "visor_compras", "compras_ops"],
  },
  {
    id: "geosafety",
    name: "GeoSafety",
    icon: "🦺",
    desc: "EPP: catálogo, dotación e inventario.",
    accent: "#B45309",
    // Acceso restringido (ago 2026, pedido de Gerson): admin (Gerson y Daniel)
    // = todo; tesoreria (Carolina), costos (Christian) y logistica (Oscar)
    // entran como INGENIEROS RESIDENTES — solo catalogo, carrito y enviar
    // requisicion. Todos los demas roles quedaron fuera del modulo.
    roles: ["admin", "tesoreria", "costos", "logistica"],
  },
  {
    id: "logistica",
    name: "GeoLogistics",
    icon: "🚛",
    desc: "Flota, rutas y despachos.",
    accent: "#2D4A6B",
    roles: ["admin", "logistica", "recepcion"],
  },
  {
    id: "geoclock",
    name: "GeoClock",
    icon: "⏰",
    desc: "Entradas y salidas del personal, con firma.",
    accent: "#C75F1F",
    // Tablets de marcaje (ago 2026): Oscar (logistica) en el plantel central,
    // Ana (asistente_compras) en oficina y el usuario dedicado "marcaje"
    // (tablet de administración — SOLO ve este módulo). Gerson supervisa.
    // Lic. Carolina (tesoreria) entra para corregir marcajes manuales.
    roles: ["admin", "coordinador", "tesoreria", "asistente_compras", "logistica", "marcaje"],
  },
  {
    id: "geodrill-vault",
    name: "GeoDrill Vault",
    icon: "🗄️",
    desc: "Picas, portapicas y herramienta de perforación.",
    accent: "#0F4C75",
    roles: ["admin", "tesoreria", "almacenista", "almacen_visor"],
  },
];

// El sistema visual (tokens + clases gt-*) vive en gt-ui.js — es COMPARTIDO
// con los módulos rediseñados (GeoShopping). Acá se monta en login/
// bienvenida/panel y se desmonta al entrar a un módulo.
const UI_CSS = GT_CSS;

// ── Versículo del día (rota por día del año; RVR1960, cortos) ──
const VERSICULOS = [
  { ref: "Job 22:28", txt: "Determinarás asimismo una cosa, y te será firme, y sobre tus caminos resplandecerá luz." },
  { ref: "Colosenses 3:23", txt: "Y todo lo que hagáis, hacedlo de corazón, como para el Señor y no para los hombres." },
  { ref: "Proverbios 16:3", txt: "Encomienda a Jehová tus obras, y tus pensamientos serán afirmados." },
  { ref: "Salmos 90:17", txt: "Sea la luz de Jehová nuestro Dios sobre nosotros, y la obra de nuestras manos confirma sobre nosotros." },
  { ref: "Josué 1:9", txt: "Esfuérzate y sé valiente; no temas ni desmayes, porque Jehová tu Dios estará contigo dondequiera que vayas." },
  { ref: "Filipenses 4:13", txt: "Todo lo puedo en Cristo que me fortalece." },
  { ref: "Proverbios 22:29", txt: "¿Has visto hombre solícito en su trabajo? Delante de los reyes estará." },
  { ref: "Salmos 127:1", txt: "Si Jehová no edificare la casa, en vano trabajan los que la edifican." },
  { ref: "Eclesiastés 9:10", txt: "Todo lo que te viniere a la mano para hacer, hazlo según tus fuerzas." },
  { ref: "Isaías 41:10", txt: "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo." },
  { ref: "Mateo 6:33", txt: "Buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas." },
  { ref: "Proverbios 3:5-6", txt: "Fíate de Jehová de todo tu corazón... reconócelo en todos tus caminos, y él enderezará tus veredas." },
  { ref: "Salmos 118:24", txt: "Este es el día que hizo Jehová; nos gozaremos y alegraremos en él." },
  { ref: "Gálatas 6:9", txt: "No nos cansemos, pues, de hacer bien; porque a su tiempo segaremos, si no desmayamos." },
  { ref: "1 Corintios 15:58", txt: "Estad firmes y constantes, creciendo en la obra del Señor siempre, sabiendo que vuestro trabajo en el Señor no es en vano." },
  { ref: "Salmos 37:5", txt: "Encomienda a Jehová tu camino, y confía en él; y él hará." },
  { ref: "Proverbios 21:5", txt: "Los pensamientos del diligente ciertamente tienden a la abundancia." },
  { ref: "Nehemías 8:10", txt: "El gozo de Jehová es vuestra fuerza." },
  { ref: "Santiago 1:5", txt: "Si alguno de vosotros tiene falta de sabiduría, pídala a Dios, el cual da a todos abundantemente." },
  { ref: "Salmos 121:1-2", txt: "Alzaré mis ojos a los montes... mi socorro viene de Jehová, que hizo los cielos y la tierra." },
  { ref: "2 Timoteo 1:7", txt: "Porque no nos ha dado Dios espíritu de cobardía, sino de poder, de amor y de dominio propio." },
];
const versiculoDeHoy = () => {
  const d = new Date();
  const dia = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return VERSICULOS[dia % VERSICULOS.length];
};

// ── Frase del día bajo el saludo (neutra en género a propósito) ──
const FRASES = [
  "Hoy toca dar tu mejor versión.",
  "Hagamos que hoy cuente.",
  "Paso firme, obra segura.",
  "Los detalles hacen la excelencia.",
  "Un buen día para avanzar.",
  "La constancia construye más que la fuerza.",
  "Cada día suma al proyecto.",
  "Lo que se mide, mejora.",
  "Primero la seguridad, siempre.",
  "La obra avanza cuando el equipo avanza.",
];
const fraseDeHoy = () => {
  const d = new Date();
  const dia = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return FRASES[dia % FRASES.length];
};

// ¿El usuario pidió menos movimiento? (los heroes se saltan por completo)
const prefiereMenosMovimiento = () =>
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Saludo por hora de Honduras + nombre de pila (sin "Lic./Ing.").
const horaTegus = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Tegucigalpa", hour: "numeric", hour12: false }).format(new Date()));
const saludoDe = () => { const h = horaTegus(); return h < 12 ? "Buenos días" : h < 18 ? "Buenas tardes" : "Buenas noches"; };
const nombreDePila = (label) => String(label || "").replace(/^(Lic\.|Ing\.|Sr\.|Sra\.|Dr\.)\s+/i, "").split(" ")[0] || "";
const fechaLargaTegus = () => {
  const t = new Intl.DateTimeFormat("es-HN", { timeZone: "America/Tegucigalpa", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  const [syncState, setSyncState] = useState({ ok: true, error: null });
  // Bienvenida (31-ago-2026): se muestra UNA vez por sesión, tras el login.
  // Restaurar la sesión con la pestaña (F5) no la repite.
  const [welcomeDone, setWelcomeDone] = useState(() => {
    try { return sessionStorage.getItem("gt-welcome-done") === "1"; } catch { return true; }
  });
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("gt-session");
      if (s) setUser(JSON.parse(s));
    } catch {}
  }, []);

  useEffect(() => onSyncStateChange((s) => setSyncState(s)), []);

  const login = (username, password) => {
    const found = USERS.find((u) => u.username === username && u.password === password);
    if (!found) return false;
    const session = { username: found.username, role: found.role, label: found.label };
    setUser(session);
    setWelcomeDone(false);
    // Con storage bloqueado (Safari sin cookies) el accessor LANZA: si el
    // setItem quedara fuera del try, setWelcomeDone nunca corría y la
    // bienvenida no se mostraba jamás en ese navegador.
    try {
      sessionStorage.setItem("gt-session", JSON.stringify(session));
      sessionStorage.removeItem("gt-welcome-done");
      sessionStorage.removeItem("gt-panel-hero-done");
    } catch {}
    return true;
  };

  const logout = () => {
    setUser(null);
    setActiveModule(null);
    try {
      sessionStorage.removeItem("gt-session");
      sessionStorage.removeItem("gt-welcome-done");
      sessionStorage.removeItem("gt-panel-hero-done");
    } catch {}
  };

  const finishWelcome = () => {
    try { sessionStorage.setItem("gt-welcome-done", "1"); } catch {}
    setWelcomeDone(true);
  };

  // Flecha "back" del panel: vuelve a la bienvenida del día (pedido 31-ago).
  const volverBienvenida = () => {
    try { sessionStorage.removeItem("gt-welcome-done"); } catch {}
    setWelcomeDone(false);
  };

  if (!user) return <LoginScreen onLogin={login} />;

  const syncBanner = !syncState.ok && syncState.error ? (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: BRAND.red, color: "#fff", padding: "10px 18px", fontSize: 13, fontWeight: 600, zIndex: 9999, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, boxShadow: "0 2px 10px rgba(0,0,0,.2)", fontFamily: FONT.body }}>
      <span>⚠️ No se sincronizó a la nube ({syncState.error.key}). Los datos están en este navegador pero NO en Supabase.</span>
      <button onClick={() => setSyncState((s) => ({ ...s, ok: true }))} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Ocultar</button>
    </div>
  ) : null;

  // ── Modulo activo ──
  const moduleProps = { userRole: user.role, userName: user.label, onBack: () => setActiveModule(null), onLogout: logout };
  if (activeModule === "rrhh") return <>{syncBanner}<HRModule {...moduleProps} /></>;
  if (activeModule === "compras-operaciones") return <>{syncBanner}<PurchasesModule {...moduleProps} /></>;
  if (activeModule === "maquinas") return <>{syncBanner}<MachinesModule {...moduleProps} /></>;
  if (activeModule === "logistica") return <>{syncBanner}<LogisticsModule {...moduleProps} /></>;
  if (activeModule === "geodrill-vault") return <>{syncBanner}<GeoDrillVault {...moduleProps} /></>;
  if (activeModule === "geosafety") return <>{syncBanner}<SafetyModule {...moduleProps} /></>;
  if (activeModule === "geoclock") return <>{syncBanner}<GeoClockModule {...moduleProps} /></>;
  // GeoChat desactivado temporalmente — ver comentario al inicio del archivo.

  const availableModules = MODULES.filter((m) => m.roles.includes(user.role));

  // ── Bienvenida del día (todos menos la tablet kiosco de marcaje) ──
  if (!welcomeDone && user.role !== "marcaje") {
    return (
      <>
        <style>{UI_CSS}</style>
        {syncBanner}
        <WelcomeScreen user={user} onStart={finishWelcome} onLogout={logout} />
      </>
    );
  }

  // ── Panel de Control ──
  return (
    <>
      {syncBanner}
      <PanelControl
        user={user}
        availableModules={availableModules}
        syncOk={syncState.ok}
        onOpen={(id) => setActiveModule(id)}
        onLogout={logout}
        onVolverBienvenida={volverBienvenida}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PANEL DE CONTROL (v2, 31-ago-2026): el título nace en grande al centro y
// viaja a su lugar (una vez por login, `gt-panel-hero-done`), header estilo
// IST — volver a la bienvenida + tuerquita de cuenta + logo — y tarjetas de
// módulo en vidrio con iconos monocromos que se pintan naranja al hover.
// ═══════════════════════════════════════════════════════════════════════════
// Título que nace en GRANDE al centro de la pantalla y VIAJA a su lugar real
// (FLIP invertido: se renderiza siempre en su posición final y, mientras dura
// el hero, un transform medido lo centra y lo agranda; al asentar, el
// transform vuelve a none con transición y el bloque aterriza suave).
// textAlign nunca cambia — animar textAlign/padding hacía SALTAR el texto.
function TituloHero({ esHero, escala = 1.4, altura = 0.4, children }) {
  const ref = useRef(null);
  const [tf, setTf] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !esHero) return;
    // Medir ANTES del primer paint (y con el scroll ya arriba): el rect es
    // la posición final porque tf aún es null.
    window.scrollTo(0, 0);
    const r = el.getBoundingClientRect();
    // Tope: que el bloque ESCALADO siempre quepa a lo ancho (en tablet/celu
    // el 1.4-1.5 lo sacaba de pantalla por la izquierda).
    const s = Math.max(1, Math.min(escala, (window.innerWidth - 48) / r.width));
    const dx = window.innerWidth / 2 - (r.left + (r.width * s) / 2);
    const dy = window.innerHeight * altura - (r.top + (r.height * s) / 2);
    setTf(`translate(${Math.round(dx)}px, ${Math.round(dy)}px) scale(${s})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      style={{
        width: "fit-content",
        transformOrigin: "top left",
        transform: esHero && tf ? tf : "none",
        transition: "transform 750ms var(--curva)",
        willChange: esHero ? "transform" : "auto",
      }}
    >{children}</div>
  );
}

function PanelControl({ user, availableModules, syncOk, onOpen, onLogout, onVolverBienvenida }) {
  const [fase, setFase] = useState(() => {
    if (prefiereMenosMovimiento()) {
      try { sessionStorage.setItem("gt-panel-hero-done", "1"); } catch {}
      return "lista";
    }
    try { return sessionStorage.getItem("gt-panel-hero-done") === "1" ? "lista" : "hero"; } catch { return "lista"; }
  });
  useEffect(() => {
    // El botón "Empezar el día" queda al FONDO de la bienvenida en pantallas
    // chicas: sin esto el panel abre scrolleado abajo y el hero no se ve.
    window.scrollTo(0, 0);
    // La flag se estampa al ARRANCAR el hero (no al terminar): si el usuario
    // se va a mitad (flecha, F5), no se le repite al volver.
    if (fase === "hero") { try { sessionStorage.setItem("gt-panel-hero-done", "1"); } catch {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (fase !== "hero") return;
    const t = setTimeout(() => setFase("lista"), 1500);
    return () => clearTimeout(t);
  }, [fase]);
  const esHero = fase === "hero";

  return (
    <div className="gt-ui" style={{ display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", height: esHero ? "100dvh" : undefined }}>
      <style>{UI_CSS}</style>
      <div className="gt-brillo gt-brillo-a" aria-hidden />
      <div className="gt-brillo gt-brillo-b" aria-hidden />

      {/* Header estilo IST: [← bienvenida] [tuerquita] [logo] · usuario a la derecha.
          A todo el ancho (SIN maxWidth): Gerson lo quiere pegado a la esquina. */}
      <header style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "18px 24px", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {user.role !== "marcaje" && (
            <button className="gt-circulo" onClick={onVolverBienvenida} title="Volver a la bienvenida" aria-label="Volver a la bienvenida"><IconoFlecha /></button>
          )}
          <MenuUsuario user={user} onLogout={onLogout} />
          <span style={{ marginLeft: 6, display: "inline-flex" }}><Logo size={40} /></span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{user.label}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{ROLE_LABEL[user.role] || user.role}</div>
        </div>
      </header>

      {/* Título: nace centrado XL y VIAJA a su lugar (TituloHero mide y anima) */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1240, width: "100%", margin: "0 auto", boxSizing: "border-box", padding: "40px 28px 8px" }}>
        <TituloHero esHero={esHero} escala={1.4}>
          <div className="gt-label gt-aparece" style={{ color: "var(--text-3)" }}>
            Grupo Geotecnica · Sistema de Operaciones · Honduras
          </div>
          <h1 className="gt-sube" style={{ font: "800 clamp(40px,5vw,64px)/1.05 var(--display)", letterSpacing: "-.025em", color: "var(--text)", margin: "14px 0 0" }}>
            Panel de <span style={{ color: "var(--marca-2)" }}>Control</span>
          </h1>
        </TituloHero>
      </div>

      {/* Módulos — entran escalonados cuando el título llega a su lugar.
          visibility+inert (no opacity en el padre): un padre con opacity <1
          apaga el backdrop-filter del vidrio, y opacity 0 dejaba las
          tarjetas alcanzables con Tab+Enter. */}
      <main inert={esHero || undefined} style={{ position: "relative", zIndex: 1, maxWidth: 1240, width: "100%", margin: "0 auto", padding: "34px 28px 64px", boxSizing: "border-box", flex: 1, visibility: esHero ? "hidden" : "visible" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px,100%), 1fr))", gap: 18 }}>
          {availableModules.map((m, i) => (
            <PanelCard key={m.id} m={m} index={i} animar={!esHero} onOpen={() => onOpen(m.id)} />
          ))}
        </div>
      </main>

      {/* Footer */}
      {!esHero && (
        <footer className="gt-aparece" style={{ position: "relative", zIndex: 1, maxWidth: 1240, width: "100%", margin: "0 auto", padding: "20px 28px 26px", boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, color: "var(--text-3)", fontSize: 12 }}>
          <div>© Grupo Geotecnica · Sistema de Operaciones</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: syncOk ? "#059669" : BRAND.red }} />
            {syncOk ? "Sincronizado" : "Sin sincronizar"} · v2.0
          </div>
        </footer>
      )}
    </div>
  );
}

// ── Tuerquita del header: menú de cuenta con la opción de cerrar sesión ──
function MenuUsuario({ user, onLogout }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button className="gt-circulo" onClick={() => setAbierto((o) => !o)} title="Cuenta" aria-label="Opciones de la cuenta" aria-expanded={abierto}>
        <IconoTuerca />
      </button>
      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} aria-hidden style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div className="gt-card gt-aparece" style={{ position: "absolute", top: 52, left: 0, zIndex: 31, minWidth: 240, padding: 18, boxShadow: "var(--e2)" }}>
            <div style={{ font: "700 15px/1.3 var(--display)", color: "var(--text)" }}>{user.label}</div>
            <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 5 }}>{ROLE_LABEL[user.role] || user.role}</div>
            <button
              onClick={onLogout}
              style={{ marginTop: 16, width: "100%", minHeight: 42, padding: "10px 14px", borderRadius: "var(--radio-control)", border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 13.5px/1 var(--sans)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            ><IconoPower /> Cerrar sesión</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Iconos SVG de línea (estilo IST): todos monocromos, currentColor ──
const IconoFlecha = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
);
const IconoPower = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></svg>
);
const IconoTuerca = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
// Icono por módulo (línea, 26px). Fallback: el emoji viejo de MODULES —
// así un módulo nuevo sin icono dibujado no queda con la cajita vacía.
function IconoModulo({ id, fallback }) {
  const trazos = {
    rrhh: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    "compras-operaciones": <><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></>,
    maquinas: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
    geosafety: <><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z" /><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /><path d="M4 15v-3a6 6 0 0 1 6-6" /><path d="M14 6a6 6 0 0 1 6 6v3" /></>,
    logistica: <><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="17" cy="18" r="2" /><circle cx="7" cy="18" r="2" /></>,
    geoclock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
    "geodrill-vault": <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>,
  }[id];
  if (!trazos) return <span style={{ fontSize: 25 }} aria-hidden>{fallback}</span>;
  return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{trazos}</svg>;
}

// ── Tarjeta de módulo (estética IST): vidrio, icono de LÍNEA monocromo —
// todas la misma cajita gris; el hover pinta cajita + dibujo de naranja. ──
function PanelCard({ m, onOpen, index = 0, animar = true }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`gt-vidrio gt-vidrio-hover${animar ? " gt-sube" : ""}`}
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ padding: "26px 26px 24px", cursor: "pointer", animationDelay: `${90 + index * 60}ms`, outline: "none" }}
    >
      <div
        style={{
          width: 54, height: 54, borderRadius: 16,
          background: hover ? "rgba(232,118,45,.14)" : "rgba(44,42,40,.06)",
          color: hover ? "var(--marca-2)" : "var(--text-3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          marginBottom: 20,
          transition: "transform var(--mov-base) var(--curva), background var(--mov-base) var(--curva), color var(--mov-base) var(--curva)",
          transform: hover ? "scale(1.06)" : "scale(1)",
        }}
      ><IconoModulo id={m.id} fallback={m.icon} /></div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {/* Título en el MISMO gris que el icono (pedido 31-ago: simetría);
            el hover pinta título+icono+flecha de naranja a la vez. */}
        <div style={{ font: "800 24px/1.2 var(--display)", letterSpacing: "-.015em", color: hover ? "var(--marca-2)" : "var(--text-3)", transition: "color var(--mov-base) var(--curva)" }}>{m.name}</div>
        <span aria-hidden style={{ fontSize: 20, color: hover ? "var(--marca-2)" : "var(--text-faint)", transition: "transform var(--mov-base) var(--curva), color var(--mov-base)", transform: hover ? "translateX(4px)" : "translateX(0)" }}>→</span>
      </div>
      <div style={{ font: "400 14px/1.5 var(--sans)", color: "var(--text-2)", marginTop: 6 }}>{m.desc}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BIENVENIDA DEL DÍA (31-ago-2026) — saludo grande que transiciona a su lugar
// y tres tarjetas escalonadas: TO-DOS (personales, persistidos por usuario),
// BANDEJA (pendientes reales del sistema según el rol) y VERSÍCULO DEL DÍA.
// ═══════════════════════════════════════════════════════════════════════════
function WelcomeScreen({ user, onStart, onLogout }) {
  // fase "hero" (saludo centrado XL, que se disfrute) → fase "día" (arriba + tarjetas)
  const [fase, setFase] = useState(() => (prefiereMenosMovimiento() ? "dia" : "hero"));
  useEffect(() => {
    window.scrollTo(0, 0); // por si se vuelve desde el panel scrolleado
    if (fase !== "hero") return;
    const t = setTimeout(() => setFase("dia"), 2600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nombre = nombreDePila(user.label);
  const saludo = saludoDe();
  const verso = versiculoDeHoy();
  const frase = fraseDeHoy();

  // ── TO-DOS personales (key propia por usuario — no toca ninguna data) ──
  const todosKey = `gt-todos-${user.username}`;
  const [todos, setTodos] = useState(null);   // null = cargando
  const [nuevo, setNuevo] = useState("");
  useEffect(() => {
    let vivo = true;
    (async () => {
      try { const t = await store.get(todosKey); if (vivo) setTodos(Array.isArray(t) ? t : []); }
      catch { if (vivo) setTodos([]); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const guardarTodos = (next) => {
    setTodos(next);
    // Lista personal: best-effort — si la nube falla, el banner global avisa.
    store.set(todosKey, next);
  };
  const addTodo = () => {
    // Con la lista aún cargando, un set pisaría lo guardado en la nube.
    if (todos === null) return;
    const t = nuevo.trim();
    if (!t) return;
    guardarTodos([...todos, { id: Math.random().toString(36).slice(2, 10), txt: t, done: false, at: new Date().toISOString() }]);
    setNuevo("");
  };

  // BANDEJA (31-ago-2026): va a estar amarrada al mail de cada usuario —
  // por pedido de Gerson queda EN BLANCO hasta que exista ese amarre.
  // (La versión con contadores de cp-purchases/gc-marks vivió unas horas;
  // si se retoma: leer SOLO con store.getCloud, nunca store.get.)

  const esHero = fase === "hero";
  const cardTitulo = (txt) => (
    <div className="gt-label" style={{ color: "var(--text-3)", marginBottom: 16 }}>{txt}</div>
  );

  return (
    <div className="gt-ui" style={{ position: "relative", overflow: "hidden", height: esHero ? "100dvh" : undefined }}>
      <div className="gt-brillo gt-brillo-a" aria-hidden />
      <div className="gt-brillo gt-brillo-b" aria-hidden />

      {/* Header: tuerquita de cuenta + logo a la izquierda, Saltar a la derecha */}
      <div style={{ position: "relative", zIndex: 3, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "18px 24px" }}>
        <div className="gt-aparece" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MenuUsuario user={user} onLogout={onLogout} />
          <span style={{ marginLeft: 6, display: "inline-flex" }}><Logo size={40} /></span>
        </div>
        <button
          onClick={onStart}
          style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", font: "500 13px/1 var(--sans)", padding: 10, minHeight: 44 }}
        >Saltar →</button>
      </div>

      {/* El saludo: nace centrado XL y VIAJA a su lugar (TituloHero mide y anima) */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1240, margin: "0 auto", boxSizing: "border-box", padding: "40px 28px 0" }}>
        <TituloHero esHero={esHero} escala={1.5} altura={0.42}>
          <div className="gt-label gt-aparece" style={{ color: "var(--text-3)", marginBottom: 14, animationDelay: "120ms" }}>
            {fechaLargaTegus()}
          </div>
          <h1 className="gt-sube" style={{ font: "800 clamp(40px,5vw,64px)/1.05 var(--display)", letterSpacing: "-.025em", color: "var(--text)", margin: 0 }}>
            {saludo},<br />
            <span style={{ color: "var(--marca-2)" }}>{nombre}</span>.
          </h1>
          <div className="gt-sube" style={{ font: "500 15px/1.5 var(--sans)", color: "var(--text-2)", marginTop: 10, animationDelay: "420ms" }}>
            {frase}
          </div>
        </TituloHero>
      </div>

      {/* Tarjetas — entran escalonadas cuando el saludo llega a su lugar.
          visibility+inert (no opacity en el padre): un padre con opacity <1
          apaga el backdrop-filter del vidrio, y opacity 0 dejaba checkboxes
          y botones alcanzables con Tab. El fade lo hace cada tarjeta. */}
      <div
        inert={esHero || undefined}
        style={{
          position: "relative", zIndex: 1,
          maxWidth: 1240, margin: "0 auto", boxSizing: "border-box",
          padding: "34px 28px 60px",
          visibility: esHero ? "hidden" : "visible",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px,100%), 1fr))", gap: 18 }}>
          {/* TO-DOS */}
          <div className={`gt-vidrio${!esHero ? " gt-sube" : ""}`} style={{ padding: 24, display: "flex", flexDirection: "column", minHeight: 300 }}>
            {cardTitulo("To-dos")}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minHeight: 0, overflowY: "auto" }}>
              {todos === null
                ? <div style={{ color: "var(--text-3)", fontSize: 14 }}>Cargando…</div>
                : todos.length === 0
                  ? <div style={{ color: "var(--text-2)", fontSize: 15 }}>Nada pendiente — día redondo.</div>
                  : todos.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 36 }}>
                      <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}>
                        <input type="checkbox" checked={!!t.done} onChange={() => guardarTodos(todos.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} style={{ width: 18, height: 18, cursor: "pointer", accentColor: "var(--marca-2)", flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 14.5, color: t.done ? "var(--text-faint)" : "var(--text)", textDecoration: t.done ? "line-through" : "none", wordBreak: "break-word" }}>{t.txt}</span>
                      </label>
                      <button onClick={() => guardarTodos(todos.filter((x) => x.id !== t.id))} title="Quitar" aria-label={`Quitar "${t.txt}"`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: 17, minWidth: 32, minHeight: 32, padding: 0 }}>×</button>
                    </div>
                  ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <input
                className="gt-input"
                style={{ fontSize: 14 }}
                placeholder={todos === null ? "Cargando tus pendientes…" : "Agregar pendiente…"}
                value={nuevo}
                disabled={todos === null}
                onChange={(e) => setNuevo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addTodo(); }}
              />
              <button onClick={addTodo} disabled={todos === null} title="Agregar" style={{ minWidth: 44, minHeight: 44, borderRadius: "var(--radio-control)", border: "1px solid var(--hairline)", background: "var(--surface)", cursor: todos === null ? "wait" : "pointer", fontSize: 19, color: todos === null ? "var(--text-faint)" : "var(--naranja-tinta)", fontWeight: 700 }}>+</button>
            </div>
          </div>

          {/* BANDEJA — en blanco a propósito (se va a amarrar al mail de cada uno) */}
          <div className={`gt-vidrio${!esHero ? " gt-sube" : ""}`} style={{ padding: 24, minHeight: 300, display: "flex", flexDirection: "column", animationDelay: "90ms" }}>
            {cardTitulo("Bandeja")}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              <div style={{ font: "600 15px/1.4 var(--sans)", color: "var(--text-2)", marginTop: 4 }}>Tu bandeja personal viene en camino.</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-3)" }}>Pronto vas a recibir aquí tus avisos y pendientes.</div>
            </div>
          </div>

          {/* VERSÍCULO DEL DÍA */}
          <div className={`gt-vidrio${!esHero ? " gt-sube" : ""}`} style={{ padding: 24, minHeight: 300, display: "flex", flexDirection: "column", animationDelay: "180ms" }}>
            {cardTitulo("Versículo del día")}
            <div style={{ flex: 1 }}>
              <p style={{ font: "600 19px/1.55 var(--display)", letterSpacing: "-.01em", color: "var(--text)", margin: 0 }}>
                “{verso.txt}”
              </p>
            </div>
            <div className="gt-label" style={{ color: "var(--naranja-tinta)", marginTop: 16 }}>{verso.ref}</div>
          </div>
        </div>

        <button className={`gt-btn gt-btn-primario${!esHero ? " gt-sube" : ""}`} onClick={onStart} style={{ marginTop: 30, animationDelay: "270ms" }}>
          Empezar el día <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN (31-ago-2026) — foto de obra real a pantalla completa (rota con
// crossfade + Ken Burns sutil), branding grande a la izquierda y tarjeta de
// acceso a la derecha. Credenciales y flujo: EXACTAMENTE los de siempre.
// ═══════════════════════════════════════════════════════════════════════════
// Solo las 2 fotos que aprobó Gerson (31-ago), regeneradas desde los
// originales en alta resolución (antes eran 1200×1600 y el cover las
// estiraba pixeladas). `pos` = encuadre para pantallas horizontales:
// son fotos verticales y el corte decide qué banda se ve.
const FOTOS_LOGIN = [
  { f: "obra-1.jpg", pos: "center 30%" },   // piladora Geotecnica con montañas
  { f: "obra-2.jpg", pos: "center 62%" },   // perforadora en el río, entre rocas
];

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [foto, setFoto] = useState(0);
  const base = import.meta.env.BASE_URL;
  const reduceMotion = prefiereMenosMovimiento();

  // Rotación automática. Depende de `foto` a propósito: un click en un punto
  // reinicia el conteo de 9 s (si no, podía saltar de foto al segundo del
  // click). Las 5 fotos se descargan solas: sus divs ya están en el DOM.
  useEffect(() => {
    if (reduceMotion) return;
    const t = setTimeout(() => setFoto((f) => (f + 1) % FOTOS_LOGIN.length), 9000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foto]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setTimeout(() => {
      const ok = onLogin(username, password);
      if (!ok) setError("Usuario o clave incorrecta");
      setLoading(false);
    }, 350);
  };

  const verso = versiculoDeHoy();

  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", fontFamily: "var(--sans)", background: "#1C1A18" }}>
      <style>{UI_CSS}</style>

      {/* Fotos de obra — crossfade; la activa lleva Ken Burns lento */}
      {FOTOS_LOGIN.map((p, i) => (
        <div
          key={p.f}
          aria-hidden
          className={i === foto && !reduceMotion ? "gt-kenburns" : undefined}
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${base}brand/login/${p.f})`,
            backgroundSize: "cover", backgroundPosition: p.pos,
            opacity: i === foto ? 1 : 0,
            transition: "opacity 1600ms var(--curva), transform 1600ms var(--curva)",
            animation: i === foto && !reduceMotion ? "gtKenBurns 11s linear forwards" : "none",
            willChange: i === foto ? "opacity, transform" : "auto",
          }}
        />
      ))}
      {/* Velo carbón: legibilidad del texto sobre cualquier foto */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(28,26,24,.82) 0%, rgba(28,26,24,.55) 46%, rgba(28,26,24,.30) 100%)" }} />

      {/* Contenido */}
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "clamp(20px,3.5vw,44px)" }}>
        {/* Logo */}
        <div className="gt-aparece" style={{ filter: "brightness(0) invert(1)", opacity: 0.96, width: "fit-content" }}>
          <Logo size={46} />
        </div>

        {/* Centro: tagline izquierda + tarjeta derecha */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40, flexWrap: "wrap", padding: "28px 0" }}>
          <div style={{ maxWidth: 620, minWidth: "min(100%, 320px)" }}>
            <div className="gt-label gt-sube" style={{ color: "#FFDFC2", marginBottom: 20, animationDelay: "120ms", textShadow: "0 1px 10px rgba(0,0,0,.5)" }}>
              Sistema de Gestión de Operaciones
            </div>
            <h1 className="gt-sube" style={{ font: "800 clamp(40px,5vw,68px)/1.08 var(--display)", letterSpacing: "-.022em", color: "#FFFDF9", margin: 0, animationDelay: "200ms", textShadow: "0 2px 24px rgba(0,0,0,.35)" }}>
              Ingeniería que sostiene. <span style={{ color: "var(--marca-2)" }}>Proyectos que avanzan.</span>
            </h1>
          </div>

          {/* Tarjeta de acceso — fondo alto (NO cristal puro: hay foto detrás) */}
          <form
            onSubmit={handleSubmit}
            className="gt-sube"
            style={{
              width: "min(400px, 100%)", boxSizing: "border-box",
              background: "var(--v-fondo-foto)",
              border: "1px solid var(--v-borde)",
              borderRadius: 24, padding: "34px 32px",
              boxShadow: "var(--v-sombra)",
              WebkitBackdropFilter: "var(--v-blur)", backdropFilter: "var(--v-blur)",
              animationDelay: "320ms",
            }}
          >
            <h2 style={{ font: "800 32px/1.12 var(--display)", letterSpacing: "-.02em", color: "var(--text)", margin: 0 }}>Bienvenido</h2>
            <p style={{ font: "400 14px/1.5 var(--sans)", color: "var(--text-2)", margin: "8px 0 26px" }}>Ingresá para continuar.</p>

            <label style={{ display: "block", marginBottom: 16 }}>
              <span className="gt-label" style={{ color: "var(--text-3)", display: "block", marginBottom: 8 }}>Usuario</span>
              <input className="gt-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ej. administrador" autoFocus autoComplete="username" />
            </label>
            <label style={{ display: "block", marginBottom: 20 }}>
              <span className="gt-label" style={{ color: "var(--text-3)", display: "block", marginBottom: 8 }}>Clave</span>
              <input className="gt-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </label>

            {error && (
              <div style={{ background: "rgba(192,57,43,.10)", border: "1px solid rgba(192,57,43,.30)", borderRadius: "var(--radio-control)", padding: "10px 14px", color: "#B03024", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button type="submit" className="gt-btn gt-btn-primario" disabled={loading || !username || !password} style={{ width: "100%" }}>
              {loading ? "Verificando…" : <>Ingresar <span aria-hidden>→</span></>}
            </button>

            <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "var(--text-3)" }}>
              ¿Olvidaste tu clave? Contactá al administrador.
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--hairline)", textAlign: "center" }}>
              <div className="gt-label" style={{ color: "var(--naranja-tinta)", marginBottom: 10 }}>{verso.ref}</div>
              <p style={{ font: "italic 400 13px/1.7 var(--sans)", color: "var(--text-2)", margin: 0 }}>“{verso.txt}”</p>
            </div>
          </form>
        </div>

        {/* Pie: ubicación + puntos del slideshow */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div className="gt-label" style={{ color: "rgba(255,253,249,.75)" }}>
            Tegucigalpa · San Pedro Sula — Honduras
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            {FOTOS_LOGIN.map((p, i) => (
              <button
                key={p.f}
                onClick={() => setFoto(i)}
                aria-label={`Foto ${i + 1}`}
                style={{ height: 34, padding: "0 6px", display: "flex", alignItems: "center", background: "transparent", border: "none", cursor: "pointer" }}
              >
                <span aria-hidden style={{
                  width: i === foto ? 26 : 9, height: 9, borderRadius: 999,
                  background: i === foto ? "var(--marca-2)" : "rgba(255,253,249,.45)",
                  transition: "width var(--mov-medio) var(--curva), background var(--mov-rapido)",
                }} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
