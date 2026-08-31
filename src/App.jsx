import { useState, useEffect } from "react";
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
import { gcMarkKey, quincenaAnterior } from "./HRModule.jsx";
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

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA VISUAL (31-ago-2026, rediseño pedido por Gerson) — tokens Geotecnica
// sobre la receta "Apple claro": un solo fondo de página, tarjetas que se
// apoyan (no flotan), tipografía display grande con poco texto, y movimiento
// que desacelera sin rebotar. Solo viste login / bienvenida / panel — los
// módulos internos no se tocan (el <style> se desmonta al entrar a uno).
// ⚠ React 19: NUNCA agregarle `precedence` a estos <style> — React los izaría
// al <head> y quedarían montados PARA SIEMPRE, filtrando este CSS a los módulos.
// ═══════════════════════════════════════════════════════════════════════════
const UI_CSS = `
:root{
  --marca:#2C2A28;          /* carbón Geotecnica */
  --marca-2:#E8762D;        /* naranja Geotecnica */
  --naranja-tinta:#C75F1F;  /* acento legible p/ texto grande (el naranja puro es RELLENO) */

  --display:'Plus Jakarta Sans','Manrope',sans-serif;
  --sans:'Inter',sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,monospace;

  --text:#2C2A28;
  --text-2:#5C5853;
  --text-3:#6E6862;
  --text-faint:#A39C92;

  --bg:#F5F1E9;             /* ÚNICO fondo de página (beige gris claro) */
  --surface:#FFFFFF;
  --sunk:#F3EEE5;
  --hairline:rgba(44,42,40,.08);

  --e0:0 1px 2px rgba(44,42,40,.05);
  --e1:0 6px 18px rgba(44,42,40,.09);
  --e2:0 18px 44px rgba(44,42,40,.16);

  --mov-rapido:120ms; --mov-base:200ms; --mov-medio:320ms; --mov-lento:480ms;
  --curva:cubic-bezier(.32,.72,0,1);
  --curva-exp:cubic-bezier(.16,1,.3,1);

  --radio-card:20px; --radio-control:12px; --radio-chip:999px;

  --v-fondo-foto:linear-gradient(165deg,rgba(255,251,245,.97) 0%,rgba(255,251,245,.93) 100%);
  --v-borde:rgba(255,255,255,.85);
  --v-blur:blur(22px) saturate(180%);
  --v-sombra:0 1px 0 rgba(255,255,255,.95) inset,0 0 0 1px rgba(44,42,40,.06),0 1px 2px rgba(44,42,40,.04),0 14px 34px rgba(44,42,40,.12);
}
.gt-ui{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}

/* Manchas de color difusas detrás de todo (la firma del vidrio). Duraciones
   primas (47s/59s) para que el patrón casi nunca se repita igual. */
.gt-brillo{position:fixed;z-index:0;pointer-events:none;border-radius:50%}
.gt-brillo-a{width:min(760px,86vw);height:min(760px,86vw);top:-24%;left:50%;
  background:radial-gradient(circle,rgba(232,118,45,.16) 0%,rgba(232,118,45,.06) 40%,transparent 70%);
  animation:gtPaseoA 47s ease-in-out infinite}
.gt-brillo-b{width:min(660px,80vw);height:min(660px,80vw);bottom:-26%;right:-12%;
  background:radial-gradient(circle,rgba(44,95,93,.13) 0%,rgba(44,95,93,.05) 44%,transparent 72%);
  animation:gtPaseoB 59s ease-in-out infinite}
@keyframes gtPaseoA{0%{transform:translateX(-50%) translateY(0) scale(1)}25%{transform:translateX(-96%) translateY(34vh) scale(.86)}50%{transform:translateX(-38%) translateY(66vh) scale(1.08)}75%{transform:translateX(4%) translateY(28vh) scale(.92)}100%{transform:translateX(-50%) translateY(0) scale(1)}}
@keyframes gtPaseoB{0%{transform:translate(0,0) scale(1)}25%{transform:translate(-46vw,-30vh) scale(1.1)}50%{transform:translate(-72vw,-58vh) scale(.84)}75%{transform:translate(-30vw,-72vh) scale(1.05)}100%{transform:translate(0,0) scale(1)}}

/* Entradas: keyframe solo con "from" + fill backwards (forwards clava hover) */
@keyframes gtSube{from{opacity:0;transform:translateY(18px)}}
@keyframes gtAparece{from{opacity:0}}
@keyframes gtKenBurns{from{transform:scale(1)}to{transform:scale(1.07)}}
.gt-sube{animation:gtSube var(--mov-lento) var(--curva-exp) backwards}
.gt-aparece{animation:gtAparece var(--mov-medio) var(--curva) backwards}

/* Tarjeta base: se apoya, no flota */
.gt-card{background:var(--surface);border:1px solid var(--hairline);border-radius:var(--radio-card);box-shadow:var(--e0);transition:box-shadow var(--mov-base) var(--curva),transform var(--mov-base) var(--curva),border-color var(--mov-base) var(--curva)}
.gt-card-hover:hover{box-shadow:var(--e1);transform:translateY(-2px)}

.gt-label{font:600 10px/1 var(--mono);letter-spacing:.18em;text-transform:uppercase}
.gt-input{width:100%;box-sizing:border-box;padding:13px 16px;border:1px solid var(--hairline);border-radius:var(--radio-control);font:400 15px/1.4 var(--sans);color:var(--text);background:var(--sunk);outline:none;transition:border-color var(--mov-rapido),background var(--mov-rapido),box-shadow var(--mov-rapido)}
.gt-input:focus{border-color:var(--marca-2);background:#fff;box-shadow:0 0 0 3px rgba(232,118,45,.14)}
.gt-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:12px 26px;border:none;border-radius:var(--radio-chip);font:700 15px/1 var(--sans);cursor:pointer;transition:transform var(--mov-rapido) var(--curva),box-shadow var(--mov-base) var(--curva),background var(--mov-rapido)}
.gt-btn:active{transform:scale(.97)}
.gt-btn-primario{background:var(--marca-2);color:#fff;box-shadow:0 4px 14px rgba(232,118,45,.30)}
.gt-btn-primario:hover{background:var(--naranja-tinta);box-shadow:0 6px 18px rgba(232,118,45,.36)}
.gt-btn-primario:disabled{background:var(--text-faint);box-shadow:none;cursor:not-allowed}

@media (prefers-reduced-motion:reduce){
  .gt-brillo,.gt-sube,.gt-aparece{animation:none !important}
  .gt-kenburns{animation:none !important}
}
`;

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
  // chatUnread: desactivado junto con GeoChat (jun 2026).
  const chatUnread = 0;

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
    sessionStorage.setItem("gt-session", JSON.stringify(session));
    try { sessionStorage.removeItem("gt-welcome-done"); } catch {}
    setWelcomeDone(false);
    return true;
  };

  const logout = () => {
    setUser(null);
    setActiveModule(null);
    sessionStorage.removeItem("gt-session");
    try { sessionStorage.removeItem("gt-welcome-done"); } catch {}
  };

  const finishWelcome = () => {
    try { sessionStorage.setItem("gt-welcome-done", "1"); } catch {}
    setWelcomeDone(true);
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
        <WelcomeScreen
          user={user}
          availableModules={availableModules}
          onStart={finishWelcome}
          onOpenModule={(id) => { finishWelcome(); setActiveModule(id); }}
        />
      </>
    );
  }

  // ── Panel de Control ──
  return (
    <div className="gt-ui" style={{ display: "flex", flexDirection: "column" }}>
      <style>{UI_CSS}</style>
      {syncBanner}
      <div className="gt-brillo gt-brillo-a" aria-hidden />
      <div className="gt-brillo gt-brillo-b" aria-hidden />

      {/* Header minimal */}
      <header style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "18px 28px", maxWidth: 1240, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <Logo size={40} />
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{user.label}</div>
            <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{ROLE_LABEL[user.role] || user.role}</div>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            style={{ minWidth: 44, minHeight: 44, borderRadius: "50%", border: "1px solid var(--hairline)", background: "var(--surface)", cursor: "pointer", fontSize: 17, boxShadow: "var(--e0)", transition: "box-shadow var(--mov-base) var(--curva)" }}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "var(--e1)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "var(--e0)")}
          >⏻</button>
        </div>
      </header>

      {/* Título */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1240, width: "100%", margin: "0 auto", padding: "40px 28px 8px", boxSizing: "border-box" }}>
        <div className="gt-label gt-aparece" style={{ color: "var(--text-3)" }}>
          Grupo Geotecnica · Sistema de Operaciones · Honduras
        </div>
        <h1 className="gt-sube" style={{ font: "800 clamp(40px,5vw,64px)/1.05 var(--display)", letterSpacing: "-.025em", color: "var(--text)", margin: "14px 0 0" }}>
          Panel de <span style={{ color: "var(--marca-2)" }}>Control</span>
        </h1>
      </div>

      {/* Módulos */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: 1240, width: "100%", margin: "0 auto", padding: "34px 28px 64px", boxSizing: "border-box", flex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(340px,100%), 1fr))", gap: 18 }}>
          {availableModules.map((m, i) => (
            <PanelCard key={m.id} m={m} index={i} onOpen={() => setActiveModule(m.id)} />
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ position: "relative", zIndex: 1, maxWidth: 1240, width: "100%", margin: "0 auto", padding: "20px 28px 26px", boxSizing: "border-box", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, color: "var(--text-3)", fontSize: 12 }}>
        <div>© Grupo Geotecnica · Sistema de Operaciones</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: syncState.ok ? "#059669" : BRAND.red }} />
          {syncState.ok ? "Sincronizado" : "Sin sincronizar"} · v2.0
        </div>
      </footer>
    </div>
  );
}

// ── Tarjeta de módulo (estética IST: icono en cajita, título grande, flecha) ──
function PanelCard({ m, onOpen, index = 0 }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="gt-card gt-card-hover gt-sube"
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{ padding: "26px 26px 24px", cursor: "pointer", animationDelay: `${90 + index * 60}ms`, outline: "none", borderColor: hover ? m.accent + "55" : undefined }}
    >
      <div
        style={{
          width: 54, height: 54, borderRadius: 16,
          background: m.accent + "14", color: m.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 25, marginBottom: 20,
          transition: "transform var(--mov-base) var(--curva)",
          transform: hover ? "scale(1.06)" : "scale(1)",
        }}
      >{m.icon}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ font: "800 24px/1.2 var(--display)", letterSpacing: "-.015em", color: "var(--text)" }}>{m.name}</div>
        <span aria-hidden style={{ fontSize: 20, color: hover ? m.accent : "var(--text-faint)", transition: "transform var(--mov-base) var(--curva), color var(--mov-base)", transform: hover ? "translateX(4px)" : "translateX(0)" }}>→</span>
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
function WelcomeScreen({ user, availableModules, onStart, onOpenModule }) {
  // fase "hero" (saludo centrado XL) → fase "día" (saludo arriba + tarjetas)
  const [fase, setFase] = useState("hero");
  useEffect(() => {
    const t = setTimeout(() => setFase("dia"), 1700);
    return () => clearTimeout(t);
  }, []);

  const nombre = nombreDePila(user.label);
  const saludo = saludoDe();
  const verso = versiculoDeHoy();
  const puedeAbrir = (id) => availableModules.some((m) => m.id === id);

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

  // ── BANDEJA: pendientes reales del sistema, según el rol ──
  // SOLO getCloud: store.get puede disparar un re-sync de ESCRITURA en
  // background si el cache local es más nuevo que la nube, y esta pantalla
  // decorativa jamás debe escribir cp-purchases. getCloud lee directo
  // (null si la key no existe, throw si la nube no responde).
  const [inbox, setInbox] = useState(null);   // null = cargando, "error" = nube caída
  useEffect(() => {
    let vivo = true;
    (async () => {
      const items = [];
      try {
        const rolesCompras = ["admin", "tesoreria", "gerencia", "costos", "recepcion", "asistente_compras", "visor_compras", "compras_ops"];
        if (rolesCompras.includes(user.role)) {
          const cp = await store.getCloud("cp-purchases");
          const arr = Array.isArray(cp) ? cp : [];
          const cerradaConta = (p) => !!(p?.conta?.fileId || p?.conta?.facturaFile?.fileId || p?.conta?.legacy);
          const porPagar = arr.filter((p) => p && p.status === "validado").length;
          // Mismo filtro de responsabilidad que el tablero "Por cerrar
          // contable": no-supervisores cuentan las suyas + las sin asignar.
          const esSuperConta = ["admin", "gerencia", "visor_compras"].includes(user.role);
          const porCerrar = arr.filter((p) => p && (p.status === "pagado" || p.status === "finalizado") && !cerradaConta(p) && (p.deliveryStatus === "ficha_adjunta" || p.deliveryStatus === "cerrado") && (esSuperConta || !p.cierreResponsable || p.cierreResponsable === user.label)).length;
          if (porPagar) items.push({ icon: "💰", txt: `${porPagar} solicitud${porPagar !== 1 ? "es" : ""} esperando pago`, mod: "compras-operaciones" });
          if (porCerrar) items.push({ icon: "🧾", txt: `${porCerrar} compra${porCerrar !== 1 ? "s" : ""} lista${porCerrar !== 1 ? "s" : ""} para cerrar con conta`, mod: "compras-operaciones" });
        }
        // Solo roles que abren GeoTeam Y ven la pestaña de tardanzas
        // ("coordinador" no entra a rrhh — sería una fila muerta).
        const rolesTardies = ["admin", "tesoreria", "asistente_compras", "logistica"];
        if (rolesTardies.includes(user.role)) {
          const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tegucigalpa", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
          const [y, m, d] = hoy.split("-");
          const q = Number(d) <= 15 ? "1Q" : "2Q";
          // Quincena actual + anterior (igual que HRModule): a inicios de
          // quincena el backlog pendiente vive en la anterior.
          const ant = quincenaAnterior(`${y}-${m}`, q);
          const [mk1, mk2, tds] = await Promise.all([
            store.getCloud(gcMarkKey(`${y}-${m}`, q)),
            store.getCloud(gcMarkKey(ant.periodo, ant.quincena)),
            store.getCloud("gc-tardies"),
          ]);
          const marks = [...(Array.isArray(mk1) ? mk1 : []), ...(Array.isArray(mk2) ? mk2 : [])];
          const dec = new Set((Array.isArray(tds) ? tds : []).filter((t) => t && (t.estado === "aprobada" || t.estado === "denegada")).map((t) => t.markId));
          // Misma regla que responsableDe de HRModule: Oscar decide las de su
          // tablet, Ana las de oficina; admin/tesoreria (supers) ven todas.
          const mia = (mk) => {
            if (user.role === "admin" || user.role === "tesoreria") return true;
            const por = String(mk.registradoPor || "");
            if (user.role === "logistica") return por === "Oscar Paz";
            return por === "Ana Vasquez" || por === "Marcaje de Asistencia";
          };
          const pend = marks.filter((mk) => mk && mk.tipo === "entrada" && mk.tarde && !dec.has(mk.id) && mia(mk)).length;
          if (pend) items.push({ icon: "🕒", txt: `${pend} llegada${pend !== 1 ? "s" : ""} tarde por decidir`, mod: "rrhh" });
        }
        if (vivo) setInbox(items);
      } catch {
        // La nube no respondió: decirlo — jamás afirmar "todo al día".
        if (vivo) setInbox("error");
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esHero = fase === "hero";
  const cardTitulo = (txt) => (
    <div className="gt-label" style={{ color: "var(--text-3)", marginBottom: 16 }}>{txt}</div>
  );

  return (
    <div className="gt-ui" style={{ position: "relative", overflow: "hidden" }}>
      <div className="gt-brillo gt-brillo-a" aria-hidden />
      <div className="gt-brillo gt-brillo-b" aria-hidden />

      {/* Saltar (arriba a la derecha, discreto) */}
      <button
        onClick={onStart}
        style={{ position: "absolute", top: 18, right: 24, zIndex: 3, background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", font: "500 13px/1 var(--sans)", padding: 10, minHeight: 44 }}
      >Saltar →</button>

      {/* El saludo: nace centrado XL y viaja a su lugar (misma caja, dos layouts;
          la transición la hace el contenedor con flex + transition de padding) */}
      <div
        style={{
          position: "relative", zIndex: 1,
          maxWidth: 1240, margin: "0 auto", boxSizing: "border-box",
          padding: esHero ? "36vh 28px 0" : "72px 28px 0",
          transition: "padding var(--mov-lento) var(--curva)",
          textAlign: esHero ? "center" : "left",
        }}
      >
        <div className="gt-label gt-aparece" style={{ color: "var(--text-3)", marginBottom: 14, animationDelay: "120ms" }}>
          {fechaLargaTegus()}
        </div>
        <h1
          className="gt-sube"
          style={{
            font: `800 ${esHero ? "clamp(56px,8vw,96px)" : "clamp(40px,5vw,64px)"}/1.05 var(--display)`,
            letterSpacing: "-.025em", color: "var(--text)", margin: 0,
            transition: "font-size var(--mov-lento) var(--curva)",
          }}
        >
          {saludo},<br />
          <span style={{ color: "var(--marca-2)" }}>{nombre}</span>.
        </h1>
      </div>

      {/* Tarjetas — entran escalonadas cuando el saludo llega a su lugar */}
      <div
        style={{
          position: "relative", zIndex: 1,
          maxWidth: 1240, margin: "0 auto", boxSizing: "border-box",
          padding: "34px 28px 60px",
          opacity: esHero ? 0 : 1,
          transform: esHero ? "translateY(26px)" : "translateY(0)",
          transition: "opacity var(--mov-lento) var(--curva-exp), transform var(--mov-lento) var(--curva-exp)",
          pointerEvents: esHero ? "none" : "auto",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px,100%), 1fr))", gap: 18 }}>
          {/* TO-DOS */}
          <div className="gt-card" style={{ padding: 24, background: "linear-gradient(165deg,#FFFDF8 0%,#FFF7EC 100%)", display: "flex", flexDirection: "column", minHeight: 300 }}>
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

          {/* BANDEJA */}
          <div className="gt-card" style={{ padding: 24, minHeight: 300, display: "flex", flexDirection: "column" }}>
            {cardTitulo("Bandeja")}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              {inbox === null
                ? <div style={{ color: "var(--text-3)", fontSize: 14 }}>Revisando el sistema…</div>
                : inbox === "error"
                  ? <div style={{ color: "var(--text-2)", fontSize: 14.5 }}>⚠️ No se pudo revisar el sistema (sin conexión con la nube). Los pendientes se ven dentro de cada módulo.</div>
                  : inbox.length === 0
                  ? <div style={{ color: "var(--text-2)", fontSize: 15 }}>✓ Sin pendientes del sistema. Todo al día.</div>
                  : inbox.map((it, i) => {
                    const clickeable = puedeAbrir(it.mod);
                    return (
                      <div
                        key={i}
                        onClick={() => clickeable && onOpenModule(it.mod)}
                        role={clickeable ? "button" : undefined}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 10px", borderRadius: 12, cursor: clickeable ? "pointer" : "default", transition: "background var(--mov-rapido)", borderBottom: i < inbox.length - 1 ? "1px solid var(--hairline)" : "none" }}
                        onMouseEnter={(e) => { if (clickeable) e.currentTarget.style.background = "var(--sunk)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <span style={{ fontSize: 17 }}>{it.icon}</span>
                        <span style={{ flex: 1, fontSize: 14.5, color: "var(--text)", fontWeight: 600 }}>{it.txt}</span>
                        {clickeable && <span aria-hidden style={{ color: "var(--text-faint)", fontSize: 15 }}>→</span>}
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* VERSÍCULO DEL DÍA */}
          <div className="gt-card" style={{ padding: 24, minHeight: 300, display: "flex", flexDirection: "column", background: "linear-gradient(165deg,#FFFFFF 0%,#F6F8FB 100%)" }}>
            {cardTitulo("Versículo del día")}
            <div style={{ flex: 1 }}>
              <p style={{ font: "600 19px/1.55 var(--display)", letterSpacing: "-.01em", color: "var(--text)", margin: 0 }}>
                “{verso.txt}”
              </p>
            </div>
            <div className="gt-label" style={{ color: "var(--naranja-tinta)", marginTop: 16 }}>{verso.ref}</div>
          </div>
        </div>

        <button className="gt-btn gt-btn-primario" onClick={onStart} style={{ marginTop: 30 }}>
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
const FOTOS_LOGIN = ["obra-1.jpg", "obra-2.jpg", "obra-3.jpg", "obra-4.jpg", "obra-5.jpg"];

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [foto, setFoto] = useState(0);
  const base = import.meta.env.BASE_URL;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
      {FOTOS_LOGIN.map((f, i) => (
        <div
          key={f}
          aria-hidden
          className={i === foto && !reduceMotion ? "gt-kenburns" : undefined}
          style={{
            position: "absolute", inset: 0,
            backgroundImage: `url(${base}brand/login/${f})`,
            backgroundSize: "cover", backgroundPosition: "center 40%",
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
            {FOTOS_LOGIN.map((f, i) => (
              <button
                key={f}
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
