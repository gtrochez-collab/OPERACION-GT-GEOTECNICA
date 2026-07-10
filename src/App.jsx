import { useState, useEffect } from "react";
import HRModule from "./HRModule.jsx";
import PurchasesModule from "./PurchasesModule.jsx";
import MachinesModule from "./MachinesModule.jsx";
import LogisticsModule from "./LogisticsModule.jsx";
import GeoDrillVault from "./GeoDrillVault.jsx";
// GeoChat: desactivado temporalmente (jun 2026). El polling y los mensajes
// en localStorage estaban presionando el cache. Cuando lo retomemos, sera
// con Supabase Realtime + bypass de localStorage (ya esta listo).
// import ChatModule, { fetchUnreadSummary, playBeep } from "./ChatModule.jsx";
import { onSyncStateChange } from "./supabase.js";
import Logo from "./Logo.jsx";
import { BRAND, FONT, R, SP } from "./theme.js";
import { USERS, ROLE_LABEL } from "./users.js";

// ── Modulos del sistema ──
// Cada modulo tiene un acento de color distinto (complementarios al naranja de marca).
// NOTA: GeoChat (id "geochat") esta temporalmente desactivado — ver import comentado arriba.
const MODULES = [
  {
    id: "rrhh",
    name: "GeoTeam",
    icon: "👥",
    desc: "Empleados, planilla, asistencia, vacaciones, permisos",
    accent: "#2C5F5D", // verde acero industrial
    accentSoft: "rgba(44,95,93,0.10)",
    roles: ["admin", "asistente", "costos"],
  },
  {
    id: "compras-operaciones",
    name: "GeoShopping",
    icon: "🛒",
    desc: "Solicitudes de compra, pagos y comprobantes de tesoreria",
    accent: "#8B3A3A", // borgona profesional
    accentSoft: "rgba(139,58,58,0.10)",
    roles: ["admin", "tesoreria", "gerencia", "costos", "recepcion", "asistente_compras"],
  },
  {
    id: "maquinas",
    name: "GeoMachinery",
    icon: "⚙️",
    desc: "Solicitudes de pago de repuestos y mantenimiento de maquinaria, por proyecto",
    accent: "#7C3AED",
    accentSoft: "rgba(124,58,237,0.10)",
    roles: ["admin", "coordinador_maquinas", "tesoreria", "gerencia", "costos", "recepcion"],
  },
  {
    id: "almacen",
    name: "Almacen",
    icon: "📦",
    desc: "Inventario, entradas, salidas, requisiciones",
    accent: "#6B4F3A",
    accentSoft: "rgba(107,79,58,0.10)",
    roles: ["admin"],
    soon: true,
  },
  {
    id: "logistica",
    name: "GeoLogistics",
    icon: "🚛",
    desc: "Flota, mantenimientos, rutas y despachos",
    accent: "#2D4A6B",
    accentSoft: "rgba(45,74,107,0.10)",
    roles: ["admin", "logistica", "recepcion"],
  },
  {
    id: "geodrill-vault",
    name: "GeoDrill Vault",
    icon: "🗄️",
    desc: "Inventario de alto valor: picas, portapicas, muelas y herramientas de perforacion",
    accent: "#0F4C75",
    accentSoft: "rgba(15,76,117,0.10)",
    roles: ["admin", "tesoreria", "almacenista", "almacen_visor"],
  },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  const [syncState, setSyncState] = useState({ ok: true, error: null });
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
    return true;
  };

  const logout = () => {
    setUser(null);
    setActiveModule(null);
    sessionStorage.removeItem("gt-session");
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
  // GeoChat desactivado temporalmente — ver comentario al inicio del archivo.
  // if (activeModule === "geochat") return <>{syncBanner}<ChatModule {...moduleProps} /></>;

  // ── Panel de Control ──
  const availableModules = MODULES.filter((m) => m.roles.includes(user.role));

  return (
    <div style={{ minHeight: "100vh", background: BRAND.beige, fontFamily: FONT.body, color: BRAND.charcoal, overflow: "auto" }}>
      {/* Header */}
      <header style={{ background: BRAND.cream, borderBottom: `1px solid ${BRAND.borderSoft}`, padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <Logo size={48} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.charcoal }}>{user.label}</div>
            <div style={{ fontSize: 11, color: BRAND.stone, letterSpacing: 0.5 }}>{ROLE_LABEL[user.role] || user.role}</div>
          </div>
          <div style={{ width: 1, height: 36, background: BRAND.border }} />
          <button
            onClick={logout}
            style={{ background: "transparent", border: `1px solid ${BRAND.border}`, borderRadius: R.sm, color: BRAND.graphite, padding: "9px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT.body, transition: "all .15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.surfaceHover; e.currentTarget.style.color = BRAND.charcoal; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = BRAND.graphite; }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Hero strip */}
      <div style={{ background: `linear-gradient(135deg, ${BRAND.beige} 0%, ${BRAND.parchment} 100%)`, padding: "56px 40px 40px 40px", borderBottom: `1px solid ${BRAND.borderSoft}`, position: "relative", overflow: "hidden" }}>
        {/* Decorative Bauer BG-11 silhouette */}
        <div
          style={{
            position: "absolute",
            right: -40,
            bottom: -20,
            width: 280,
            height: 280,
            opacity: 0.14,
            pointerEvents: "none",
            backgroundImage: `url(${import.meta.env.BASE_URL}machines/bauer-bg11.jpg)`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right bottom",
            filter: "grayscale(1) contrast(1.1) brightness(0.55)",
            mixBlendMode: "multiply",
          }}
        />
        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange, letterSpacing: 3, marginBottom: 12, textTransform: "uppercase" }}>Sistema de Operaciones</div>
          <h1 style={{ fontFamily: FONT.display, fontSize: 36, fontWeight: 800, color: BRAND.charcoal, marginBottom: 8, letterSpacing: -0.5 }}>Panel de Control</h1>
          <p style={{ fontSize: 15, color: BRAND.graphite, maxWidth: 560, lineHeight: 1.55 }}>
            Bienvenido, <strong style={{ color: BRAND.charcoal }}>{user.label.split(" ").slice(-2).join(" ")}</strong>. Seleccioná el módulo con el que vas a trabajar.
          </p>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: BRAND.stone }}>
            <span style={{ width: 28, height: 1, background: BRAND.orange, opacity: 0.6 }} />
            <span style={{ fontWeight: 600, letterSpacing: 0.4, color: BRAND.graphite }}>
              Lic. Gerson Trochez
            </span>
            <span style={{ color: BRAND.ash }}>·</span>
            <span style={{ fontStyle: "italic" }}>Coordinador de Operaciones</span>
          </div>
        </div>
      </div>

      {/* Modulos — con escena cartoon de proyecto de fondo */}
      <div style={{ position: "relative", overflow: "hidden", backgroundColor: BRAND.beige }}>
        {/* Background: ilustracion SVG cartoon flat (piloteadora + personal + terreno).
            Los colores son suaves — no hace falta filtro. Opacity leve para "de fondo". */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.78,
            pointerEvents: "none",
          }}
        >
          <PanelHeroSVG />
        </div>
        {/* Overlay MUY SUTIL solo abajo — mejora legibilidad del bloque final de cards
            y agrega una transicion hacia el footer. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, ${BRAND.beige}40 0%, transparent 20%, transparent 65%, ${BRAND.beige}CC 100%)`,
            pointerEvents: "none",
          }}
        />
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 40px 64px 40px", position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {availableModules.map((m) => (
            <ModuleCard
              key={m.id}
              m={m}
              badge={m.id === "geochat" && chatUnread > 0 ? chatUnread : 0}
              onOpen={() => !m.soon && setActiveModule(m.id)}
            />
          ))}
        </div>
        </main>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${BRAND.borderSoft}`, padding: "24px 40px", color: BRAND.stone, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>© Grupo Geotecnica · Sistema de Operaciones</div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: syncState.ok ? BRAND.green : BRAND.red }} />
            {syncState.ok ? "Sincronizado" : "Sin sincronizar"}
          </span>
          <span>v1.1</span>
        </div>
      </footer>
    </div>
  );
}

// ── Escena cartoon de proyecto (fondo del panel de control) ──
// SVG horizontal wide (viewBox 1200x360). Se estira 100% ancho y se recorta
// verticalmente si hace falta via preserveAspectRatio="xMidYMid slice".
function PanelHeroSVG() {
  return (
    <svg
      viewBox="0 0 1200 360"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="phSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EFE6D3" />
          <stop offset="100%" stopColor="#F6F0E2" />
        </linearGradient>
        <linearGradient id="phGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#B89876" />
          <stop offset="100%" stopColor="#8C6E4D" />
        </linearGradient>
      </defs>

      {/* Cielo */}
      <rect x="0" y="0" width="1200" height="360" fill="url(#phSky)" />

      {/* Nubes suaves */}
      <g fill="#FFFFFF" opacity="0.85">
        <ellipse cx="180" cy="70" rx="46" ry="14" />
        <ellipse cx="210" cy="60" rx="30" ry="12" />
        <ellipse cx="155" cy="62" rx="24" ry="10" />
        <ellipse cx="870" cy="55" rx="52" ry="15" />
        <ellipse cx="905" cy="45" rx="32" ry="13" />
        <ellipse cx="840" cy="48" rx="26" ry="10" />
      </g>

      {/* Linea horizonte sutil */}
      <line x1="0" y1="242" x2="1200" y2="242" stroke="#8C6E4D" strokeWidth="1" opacity="0.35" />

      {/* Suelo/terreno */}
      <path d="M0,244 Q300,238 600,246 T1200,242 L1200,360 L0,360 Z" fill="url(#phGround)" />

      {/* Piedras y rocas en el suelo */}
      <g stroke="#5C4632" strokeWidth="1.5" fill="#7A5C3F">
        <ellipse cx="90" cy="330" rx="14" ry="6" />
        <ellipse cx="112" cy="335" rx="8" ry="4" />
        <ellipse cx="560" cy="345" rx="18" ry="7" />
        <ellipse cx="780" cy="325" rx="10" ry="5" />
        <ellipse cx="1100" cy="340" rx="16" ry="6" />
        <ellipse cx="1140" cy="335" rx="9" ry="4" />
      </g>

      {/* Trabajador C (fondo, silueta pequeña) */}
      <g transform="translate(1030, 218)">
        {/* Casco */}
        <path d="M-8,-4 Q0,-16 8,-4 L8,0 L-8,0 Z" fill="#F5B800" stroke="#B8860B" strokeWidth="1.2" />
        <rect x="-9" y="0" width="18" height="2" fill="#B8860B" />
        {/* Cabeza */}
        <circle cx="0" cy="6" r="6" fill="#E8C9A0" stroke="#8C6E4D" strokeWidth="1" />
        {/* Cuerpo (chaleco naranja) */}
        <rect x="-10" y="12" width="20" height="26" rx="3" fill="#F97316" stroke="#B84A0A" strokeWidth="1.2" />
        <line x1="-10" y1="22" x2="10" y2="22" stroke="#F5F5F5" strokeWidth="1.2" />
        {/* Piernas */}
        <rect x="-9" y="38" width="8" height="22" rx="1.5" fill="#1E3A8A" />
        <rect x="1" y="38" width="8" height="22" rx="1.5" fill="#1E3A8A" />
        {/* Botas */}
        <rect x="-10" y="58" width="10" height="4" rx="1" fill="#1F2937" />
        <rect x="0" y="58" width="10" height="4" rx="1" fill="#1F2937" />
      </g>

      {/* Pilote perforado (visible bajo tierra atrás del mástil) */}
      <rect x="422" y="248" width="26" height="90" rx="2" fill="#6B4E32" stroke="#3F2E1E" strokeWidth="1.5" opacity="0.85" />
      <line x1="422" y1="270" x2="448" y2="270" stroke="#3F2E1E" strokeWidth="0.8" opacity="0.6" />
      <line x1="422" y1="290" x2="448" y2="290" stroke="#3F2E1E" strokeWidth="0.8" opacity="0.6" />
      <line x1="422" y1="310" x2="448" y2="310" stroke="#3F2E1E" strokeWidth="0.8" opacity="0.6" />
      {/* Cráter / tierra removida alrededor del hoyo */}
      <ellipse cx="435" cy="252" rx="42" ry="6" fill="#6B4E32" opacity="0.75" />

      {/* PILOTEADORA — adaptada del cartoon de MachinesModule (scale ~1.0, en x=335,y=-5) */}
      <g transform="translate(335, -5)">
        {/* Orugas */}
        <rect x="18" y="220" width="164" height="26" rx="13" fill="#1E3A8A" />
        <rect x="26" y="226" width="148" height="14" rx="7" fill="#0F172A" />
        <g fill="#1E3A8A">
          <rect x="36" y="228" width="8" height="10" rx="1" />
          <rect x="56" y="228" width="8" height="10" rx="1" />
          <rect x="76" y="228" width="8" height="10" rx="1" />
          <rect x="96" y="228" width="8" height="10" rx="1" />
          <rect x="116" y="228" width="8" height="10" rx="1" />
          <rect x="136" y="228" width="8" height="10" rx="1" />
          <rect x="156" y="228" width="8" height="10" rx="1" />
        </g>
        <circle cx="30" cy="233" r="9" fill="#374151" stroke="#0F172A" strokeWidth="2" />
        <circle cx="170" cy="233" r="9" fill="#374151" stroke="#0F172A" strokeWidth="2" />
        {/* Chasis inferior */}
        <rect x="30" y="200" width="140" height="24" rx="4" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
        {/* Contrapeso trasero */}
        <rect x="18" y="170" width="46" height="38" rx="4" fill="#1E3A8A" stroke="#0F172A" strokeWidth="1.5" />
        <rect x="24" y="178" width="34" height="4" rx="1" fill="#F5B800" />
        {/* Plataforma rotatoria */}
        <rect x="60" y="188" width="110" height="14" rx="3" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
        {/* Cabina */}
        <rect x="118" y="150" width="52" height="42" rx="5" fill="#F5F5F5" stroke="#4B5563" strokeWidth="1.5" />
        <rect x="124" y="156" width="40" height="20" rx="2" fill="#4B5563" />
        <rect x="126" y="158" width="16" height="8" rx="1" fill="#93C5FD" opacity="0.75" />
        <rect x="145" y="158" width="16" height="8" rx="1" fill="#93C5FD" opacity="0.75" />
        {/* Escalera cabina */}
        <line x1="118" y1="192" x2="112" y2="220" stroke="#4B5563" strokeWidth="2" />
        <line x1="115" y1="200" x2="120" y2="200" stroke="#4B5563" strokeWidth="1.5" />
        <line x1="114" y1="208" x2="119" y2="208" stroke="#4B5563" strokeWidth="1.5" />
        {/* Mástil */}
        <rect x="82" y="20" width="26" height="170" rx="3" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
        <g fill="#0F172A">
          <circle cx="95" cy="36" r="4" />
          <circle cx="95" cy="60" r="4" />
          <circle cx="95" cy="84" r="4" />
          <circle cx="95" cy="108" r="4" />
          <circle cx="95" cy="132" r="4" />
          <circle cx="95" cy="156" r="4" />
        </g>
        <line x1="82" y1="50" x2="82" y2="180" stroke="#B8860B" strokeWidth="1" />
        <line x1="108" y1="50" x2="108" y2="180" stroke="#B8860B" strokeWidth="1" />
        {/* Polea */}
        <rect x="76" y="12" width="38" height="14" rx="3" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
        <circle cx="95" cy="19" r="5" fill="#4B5563" stroke="#0F172A" strokeWidth="1.5" />
        <circle cx="95" cy="19" r="2" fill="#F5B800" />
        {/* Cable + Kelly bar */}
        <line x1="95" y1="26" x2="95" y2="90" stroke="#1F2937" strokeWidth="1.5" />
        <rect x="90" y="90" width="10" height="80" rx="1" fill="#6B7280" stroke="#1F2937" strokeWidth="1.5" />
        <line x1="90" y1="110" x2="100" y2="110" stroke="#1F2937" strokeWidth="0.8" />
        <line x1="90" y1="130" x2="100" y2="130" stroke="#1F2937" strokeWidth="0.8" />
        <line x1="90" y1="150" x2="100" y2="150" stroke="#1F2937" strokeWidth="0.8" />
        {/* Broca */}
        <polygon points="88,170 102,170 95,182" fill="#4B5563" stroke="#0F172A" strokeWidth="1.5" />
      </g>

      {/* Poste con señal de precaución (izquierda) */}
      <g transform="translate(80, 200)">
        <rect x="-1.5" y="0" width="3" height="70" fill="#4B5563" />
        <polygon points="0,-30 26,-3 -26,-3" fill="#F5B800" stroke="#0F172A" strokeWidth="2" />
        <text x="0" y="-8" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="18" fontWeight="800" fill="#0F172A">!</text>
      </g>

      {/* Trabajador A (izquierda, con tablet) */}
      <g transform="translate(220, 200)">
        {/* Piernas */}
        <rect x="-12" y="60" width="10" height="34" rx="2" fill="#1E3A8A" stroke="#0F172A" strokeWidth="1.2" />
        <rect x="2" y="60" width="10" height="34" rx="2" fill="#1E3A8A" stroke="#0F172A" strokeWidth="1.2" />
        {/* Botas */}
        <rect x="-14" y="92" width="14" height="6" rx="2" fill="#1F2937" />
        <rect x="0" y="92" width="14" height="6" rx="2" fill="#1F2937" />
        {/* Chaleco naranja */}
        <rect x="-16" y="24" width="32" height="42" rx="4" fill="#F97316" stroke="#B84A0A" strokeWidth="1.5" />
        {/* Bandas reflectivas */}
        <rect x="-16" y="38" width="32" height="3" fill="#F5F5F5" />
        <rect x="-16" y="54" width="32" height="3" fill="#F5F5F5" />
        {/* Camisa (interior azul) */}
        <rect x="-16" y="24" width="32" height="6" fill="#1E3A8A" />
        {/* Brazos */}
        <rect x="-22" y="26" width="8" height="26" rx="3" fill="#F97316" stroke="#B84A0A" strokeWidth="1.2" />
        <rect x="14" y="26" width="8" height="26" rx="3" fill="#F97316" stroke="#B84A0A" strokeWidth="1.2" />
        {/* Manos */}
        <circle cx="-18" cy="56" r="4" fill="#E8C9A0" stroke="#8C6E4D" strokeWidth="1" />
        <circle cx="18" cy="56" r="4" fill="#E8C9A0" stroke="#8C6E4D" strokeWidth="1" />
        {/* Tablet/plano en las manos */}
        <rect x="-20" y="48" width="40" height="14" rx="2" fill="#F5F5F5" stroke="#0F172A" strokeWidth="1.5" />
        <line x1="-16" y1="52" x2="16" y2="52" stroke="#4B5563" strokeWidth="0.8" />
        <line x1="-16" y1="56" x2="10" y2="56" stroke="#4B5563" strokeWidth="0.8" />
        {/* Cabeza */}
        <circle cx="0" cy="12" r="12" fill="#E8C9A0" stroke="#8C6E4D" strokeWidth="1.5" />
        {/* Ojos + boca */}
        <circle cx="-4" cy="12" r="1.4" fill="#0F172A" />
        <circle cx="4" cy="12" r="1.4" fill="#0F172A" />
        <path d="M-3,17 Q0,19 3,17" stroke="#0F172A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* Casco naranja */}
        <path d="M-13,4 Q0,-14 13,4 L13,7 L-13,7 Z" fill="#F97316" stroke="#B84A0A" strokeWidth="1.5" />
        <rect x="-14" y="6" width="28" height="3" rx="1" fill="#B84A0A" />
        <rect x="-4" y="-6" width="8" height="4" rx="1" fill="#F5B800" />
      </g>

      {/* Trabajador B (derecha, con radio) */}
      <g transform="translate(720, 210)">
        {/* Piernas */}
        <rect x="-11" y="56" width="9" height="30" rx="2" fill="#1E3A8A" stroke="#0F172A" strokeWidth="1.2" />
        <rect x="2" y="56" width="9" height="30" rx="2" fill="#1E3A8A" stroke="#0F172A" strokeWidth="1.2" />
        {/* Botas */}
        <rect x="-13" y="84" width="13" height="6" rx="2" fill="#1F2937" />
        <rect x="0" y="84" width="13" height="6" rx="2" fill="#1F2937" />
        {/* Camisa azul */}
        <rect x="-15" y="22" width="30" height="38" rx="4" fill="#2563EB" stroke="#0F172A" strokeWidth="1.5" />
        {/* Detalle bolsillo */}
        <rect x="-10" y="30" width="8" height="8" rx="1" fill="#1E3A8A" stroke="#0F172A" strokeWidth="0.8" />
        {/* Brazo izq (colgando) */}
        <rect x="-21" y="24" width="8" height="24" rx="3" fill="#2563EB" stroke="#0F172A" strokeWidth="1.2" />
        <circle cx="-17" cy="52" r="4" fill="#E8C9A0" stroke="#8C6E4D" strokeWidth="1" />
        {/* Brazo der (sosteniendo radio, doblado hacia arriba) */}
        <rect x="13" y="20" width="8" height="20" rx="3" fill="#2563EB" stroke="#0F172A" strokeWidth="1.2" />
        <circle cx="17" cy="42" r="4" fill="#E8C9A0" stroke="#8C6E4D" strokeWidth="1" />
        {/* Radio walkie-talkie */}
        <rect x="13" y="30" width="10" height="16" rx="1.5" fill="#1F2937" stroke="#0F172A" strokeWidth="1.2" />
        <rect x="15" y="33" width="6" height="4" rx="0.5" fill="#F5B800" />
        <line x1="18" y1="30" x2="18" y2="22" stroke="#0F172A" strokeWidth="1.5" />
        <circle cx="18" cy="21" r="1.5" fill="#F97316" />
        {/* Cabeza */}
        <circle cx="0" cy="10" r="11" fill="#E8C9A0" stroke="#8C6E4D" strokeWidth="1.5" />
        <circle cx="-3.5" cy="10" r="1.3" fill="#0F172A" />
        <circle cx="3.5" cy="10" r="1.3" fill="#0F172A" />
        <path d="M-2,15 Q0,16.5 2,15" stroke="#0F172A" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* Casco amarillo */}
        <path d="M-12,3 Q0,-14 12,3 L12,6 L-12,6 Z" fill="#F5B800" stroke="#B8860B" strokeWidth="1.5" />
        <rect x="-13" y="5" width="26" height="3" rx="1" fill="#B8860B" />
      </g>

      {/* Cono de seguridad (delante-derecha) */}
      <g transform="translate(900, 260)">
        <polygon points="-14,50 14,50 8,0 -8,0" fill="#F97316" stroke="#B84A0A" strokeWidth="1.8" />
        <rect x="-11" y="18" width="22" height="5" fill="#F5F5F5" />
        <rect x="-13" y="32" width="26" height="5" fill="#F5F5F5" />
        <rect x="-18" y="50" width="36" height="6" rx="1.5" fill="#1F2937" />
      </g>

      {/* Cinta de seguridad (barrera amarilla con lineas negras, primer plano derecha) */}
      <g>
        <line x1="960" y1="285" x2="1180" y2="292" stroke="#F5B800" strokeWidth="6" strokeLinecap="round" />
        <line x1="960" y1="285" x2="1180" y2="292" stroke="#0F172A" strokeWidth="5" strokeDasharray="10 12" strokeLinecap="round" />
        {/* Postes */}
        <rect x="955" y="282" width="3" height="42" fill="#4B5563" />
        <rect x="1178" y="289" width="3" height="42" fill="#4B5563" />
      </g>
    </svg>
  );
}

// ── Tarjeta de modulo ──
function ModuleCard({ m, onOpen, badge = 0 }) {
  const [hover, setHover] = useState(false);
  const isHero = m.hero && !m.soon;
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => !m.soon && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: BRAND.cream,
        borderRadius: R.lg,
        padding: 28,
        border: `1px solid ${hover ? m.accent : BRAND.borderSoft}`,
        cursor: m.soon ? "default" : "pointer",
        opacity: m.soon ? 0.55 : 1,
        transition: "all .2s ease",
        position: "relative",
        boxShadow: hover ? (isHero ? BRAND.shadowOrange : BRAND.shadow) : BRAND.shadowSm,
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        overflow: "hidden",
      }}
    >
      {/* Banda lateral de color */}
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: m.soon ? BRAND.border : m.accent, opacity: m.soon ? 0.4 : 1 }} />

      {m.soon && (
        <div style={{ position: "absolute", top: 14, right: 14, background: BRAND.beigeDeep, color: BRAND.graphite, fontSize: 9, fontWeight: 700, padding: "4px 10px", borderRadius: R.full, letterSpacing: 1.2, textTransform: "uppercase" }}>
          Próximamente
        </div>
      )}

      {isHero && (
        <div style={{ position: "absolute", top: 14, right: 14, background: BRAND.orange, color: "#fff", fontSize: 9, fontWeight: 700, padding: "4px 10px", borderRadius: R.full, letterSpacing: 1.2, textTransform: "uppercase" }}>
          Destacado
        </div>
      )}

      {badge > 0 && (
        <div style={{
          position: "absolute", top: 14, right: 14,
          background: BRAND.red, color: "#fff",
          fontSize: 11, fontWeight: 800,
          padding: "4px 10px",
          borderRadius: R.full,
          minWidth: 24, textAlign: "center",
          boxShadow: "0 2px 8px rgba(192,57,43,0.4)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}>
          {badge > 99 ? "99+" : badge}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: R.md,
            background: m.soon ? BRAND.beigeDeep : m.accentSoft,
            color: m.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            border: `1px solid ${m.soon ? BRAND.border : m.accent + "30"}`,
            flexShrink: 0,
          }}
        >
          {m.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT.display, fontSize: 18, fontWeight: 700, color: BRAND.charcoal, lineHeight: 1.2 }}>
            {m.name}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13.5, color: BRAND.graphite, lineHeight: 1.55, marginBottom: 16 }}>{m.desc}</div>

      {!m.soon && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: m.accent, fontSize: 12, fontWeight: 600, letterSpacing: 0.3, transition: "transform .2s", transform: hover ? "translateX(4px)" : "translateX(0)" }}>
          Abrir módulo
          <span style={{ fontSize: 14 }}>→</span>
        </div>
      )}
    </div>
  );
}

// ── Login Screen — Split layout ──
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div style={{ minHeight: "100vh", display: "flex", fontFamily: FONT.body, background: BRAND.beige, color: BRAND.charcoal }}>
      {/* Lado izquierdo — branding */}
      <div
        style={{
          flex: 1.1,
          background: `linear-gradient(160deg, ${BRAND.beigeLight} 0%, ${BRAND.parchment} 50%, ${BRAND.beigeDeep} 100%)`,
          padding: "60px 64px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          borderRight: `1px solid ${BRAND.borderSoft}`,
        }}
      >
        {/* Bauer BG-11 silhouette — pieza visual industrial */}
        <div
          style={{
            position: "absolute",
            right: -60,
            bottom: -40,
            width: 540,
            height: 720,
            opacity: 0.18,
            pointerEvents: "none",
            backgroundImage: `url(${import.meta.env.BASE_URL}machines/bauer-bg11.jpg)`,
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right bottom",
            filter: "grayscale(1) contrast(1.15) brightness(0.5)",
            mixBlendMode: "multiply",
          }}
        />

        {/* Top — logo */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <Logo size={64} />
        </div>

        {/* Center — tagline */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 460 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange, letterSpacing: 3, marginBottom: 18, textTransform: "uppercase" }}>
            Sistema interno de operaciones
          </div>
          <h1
            style={{
              fontFamily: FONT.display,
              fontSize: 36,
              fontWeight: 800,
              color: BRAND.charcoal,
              lineHeight: 1.15,
              letterSpacing: -0.6,
              marginBottom: 20,
            }}
          >
            Plataforma de operaciones de <span style={{ color: BRAND.orange }}>Geotecnica Soluciones</span>.
          </h1>
          <p style={{ fontSize: 15.5, color: BRAND.graphite, lineHeight: 1.65, fontWeight: 400, marginBottom: 14 }}>
            Sostiene los proyectos con la cadena de suministro, los recursos humanos y las compras de la empresa.
          </p>
          <p style={{ fontSize: 16, color: BRAND.charcoal, lineHeight: 1.5, fontWeight: 700, fontFamily: FONT.display, letterSpacing: -0.2 }}>
            Hacemos que los proyectos sean ejecutables.
          </p>
        </div>

        {/* Bottom — info bar */}
        <div style={{ position: "relative", zIndex: 1, display: "flex", gap: 32, color: BRAND.stone, fontSize: 12, fontWeight: 500, letterSpacing: 0.5 }}>
          <div>
            <div style={{ color: BRAND.orange, fontWeight: 700, fontSize: 18, fontFamily: FONT.display }}>9+</div>
            <div style={{ marginTop: 2 }}>Proyectos activos</div>
          </div>
          <div>
            <div style={{ color: BRAND.orange, fontWeight: 700, fontSize: 18, fontFamily: FONT.display }}>3</div>
            <div style={{ marginTop: 2 }}>Módulos operativos</div>
          </div>
          <div>
            <div style={{ color: BRAND.orange, fontWeight: 700, fontSize: 18, fontFamily: FONT.display }}>HN</div>
            <div style={{ marginTop: 2 }}>Honduras</div>
          </div>
        </div>
      </div>

      {/* Lado derecho — formulario */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px", background: BRAND.cream }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: FONT.display, fontSize: 28, fontWeight: 800, color: BRAND.charcoal, letterSpacing: -0.3, marginBottom: 8 }}>
              Bienvenido
            </h2>
            <p style={{ fontSize: 14, color: BRAND.graphite, lineHeight: 1.5 }}>
              Ingresá con tus credenciales para continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Field label="Usuario">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ej. administrador"
                  autoFocus
                  autoComplete="username"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = BRAND.orange)}
                  onBlur={(e) => (e.target.style.borderColor = BRAND.border)}
                />
              </Field>

              <Field label="Clave">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = BRAND.orange)}
                  onBlur={(e) => (e.target.style.borderColor = BRAND.border)}
                />
              </Field>

              {error && (
                <div style={{ background: BRAND.redSoft, border: `1px solid ${BRAND.red}40`, borderRadius: R.sm, padding: "10px 14px", color: BRAND.red, fontSize: 13, fontWeight: 600 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username || !password}
                style={{
                  width: "100%",
                  padding: "14px 0",
                  background: !username || !password || loading ? BRAND.ash : BRAND.orange,
                  color: "#fff",
                  border: "none",
                  borderRadius: R.sm,
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                  cursor: loading ? "wait" : !username || !password ? "not-allowed" : "pointer",
                  marginTop: 8,
                  fontFamily: FONT.body,
                  transition: "all .15s",
                  boxShadow: !username || !password || loading ? "none" : "0 4px 12px rgba(232,118,45,0.25)",
                }}
                onMouseEnter={(e) => { if (!loading && username && password) e.currentTarget.style.background = BRAND.orangeDark; }}
                onMouseLeave={(e) => { if (!loading && username && password) e.currentTarget.style.background = BRAND.orange; }}
              >
                {loading ? "Verificando…" : "Ingresar →"}
              </button>
            </div>
          </form>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${BRAND.borderSoft}`, fontSize: 11, color: BRAND.stone, lineHeight: 1.6, textAlign: "center" }}>
            ¿Olvidaste tu clave? Contactá al administrador del sistema.
          </div>

          {/* Versículo · firma espiritual de la plataforma */}
          <div style={{ marginTop: 28, paddingTop: 22, borderTop: `1px solid ${BRAND.borderSoft}`, textAlign: "center" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND.orange, letterSpacing: 3.5, textTransform: "uppercase", marginBottom: 12 }}>
              Job 22:28
            </div>
            <p style={{ fontFamily: FONT.display, fontSize: 13.5, color: BRAND.graphite, lineHeight: 1.75, fontStyle: "italic", fontWeight: 400 }}>
              "
              <span style={{ background: BRAND.orangeSoft, padding: "2px 6px", borderRadius: 3, fontWeight: 700, color: BRAND.charcoal, fontStyle: "normal", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
                You will succeed
              </span>
              {" in whatever you choose to do, and light will shine on "}
              <span style={{ background: BRAND.orangeSoft, padding: "2px 6px", borderRadius: 3, fontWeight: 700, color: BRAND.charcoal, fontStyle: "normal", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
                the road ahead of you
              </span>
              ."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: BRAND.graphite, display: "block", marginBottom: 7, letterSpacing: 1, textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "13px 16px",
  border: `1px solid ${BRAND.border}`,
  borderRadius: R.sm,
  fontSize: 15,
  outline: "none",
  background: BRAND.beigeLight,
  color: BRAND.charcoal,
  boxSizing: "border-box",
  fontFamily: FONT.body,
  transition: "border-color .15s",
};
