import { useState, useEffect } from "react";
import HRModule from "./HRModule.jsx";
import PurchasesModule from "./PurchasesModule.jsx";
import OperationsModule from "./OperationsModule.jsx";
import { onSyncStateChange } from "./supabase.js";
import Logo from "./Logo.jsx";
import { BRAND, FONT, R, SP } from "./theme.js";

// ── Credenciales y roles ──
const USERS = [
  { username: "administrador", password: "1234geo", role: "admin", label: "Administrador" },
  { username: "asistente", password: "asistente1234", role: "asistente", label: "Asistente" },
  { username: "carolina", password: "carolina1234", role: "tesoreria", label: "Lic. Carolina Flores-Hernandez" },
  { username: "gerencia", password: "gerencia1234", role: "gerencia", label: "Gerencia" },
  { username: "gerson", password: "gerson1234", role: "coordinador", label: "Lic. Gerson Trochez" },
  { username: "christian", password: "christian1234", role: "costos", label: "Lic. Christian Gallo" },
];

const ROLE_LABEL = {
  admin: "Administrador",
  asistente: "Asistente",
  tesoreria: "Tesoreria",
  gerencia: "Gerencia (solo lectura)",
  coordinador: "Coordinador de Operaciones",
  costos: "Costos (solo lectura)",
};

// ── Modulos del sistema ──
// Cada modulo tiene un acento de color distinto (complementarios al naranja de marca).
const MODULES = [
  {
    id: "rrhh",
    name: "Recursos Humanos",
    icon: "👥",
    desc: "Empleados, planilla, asistencia, vacaciones, permisos",
    accent: "#2C5F5D", // verde acero industrial
    accentSoft: "rgba(44,95,93,0.10)",
    roles: ["admin", "asistente", "costos"],
  },
  {
    id: "compras-operaciones",
    name: "Compras-Operaciones",
    icon: "🧾",
    desc: "Solicitudes validadas, pagos y comprobantes de tesoreria",
    accent: "#8B3A3A", // borgona profesional
    accentSoft: "rgba(139,58,58,0.10)",
    roles: ["admin", "tesoreria", "gerencia", "costos"],
  },
  {
    id: "operations-cc",
    name: "Operations Command Center",
    icon: "🎯",
    desc: "Cuartel general operativo · proyectos, recursos, capacidad y Mi día",
    accent: BRAND.orange,
    accentSoft: BRAND.orangeBg,
    roles: ["admin", "coordinador", "gerencia", "costos"],
    hero: true,
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
    name: "Logistica",
    icon: "🚛",
    desc: "Transporte, rutas, despachos, vehiculos",
    accent: "#2D4A6B",
    accentSoft: "rgba(45,74,107,0.10)",
    roles: ["admin"],
    soon: true,
  },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [activeModule, setActiveModule] = useState(null);
  const [syncState, setSyncState] = useState({ ok: true, error: null });

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
  if (activeModule === "operations-cc") return <>{syncBanner}<OperationsModule {...moduleProps} /></>;

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
      <div style={{ background: `linear-gradient(135deg, ${BRAND.beige} 0%, ${BRAND.parchment} 100%)`, padding: "56px 40px 32px 40px", borderBottom: `1px solid ${BRAND.borderSoft}`, position: "relative", overflow: "hidden" }}>
        {/* Decorative G watermark */}
        <div style={{ position: "absolute", right: -80, top: -40, opacity: 0.06, pointerEvents: "none" }}>
          <Logo size={420} showText={false} color="orange" />
        </div>
        <div style={{ maxWidth: 1200, margin: "0 auto", position: "relative" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange, letterSpacing: 3, marginBottom: 12, textTransform: "uppercase" }}>Sistema de Operaciones</div>
          <h1 style={{ fontFamily: FONT.display, fontSize: 36, fontWeight: 800, color: BRAND.charcoal, marginBottom: 8, letterSpacing: -0.5 }}>Panel de Control</h1>
          <p style={{ fontSize: 15, color: BRAND.graphite, maxWidth: 560, lineHeight: 1.55 }}>
            Bienvenido, <strong style={{ color: BRAND.charcoal }}>{user.label.split(" ").slice(-2).join(" ")}</strong>. Seleccioná el módulo con el que vas a trabajar.
          </p>
        </div>
      </div>

      {/* Modulos */}
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 40px 64px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
          {availableModules.map((m) => (
            <ModuleCard key={m.id} m={m} onOpen={() => !m.soon && setActiveModule(m.id)} />
          ))}
        </div>
      </main>

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

// ── Tarjeta de modulo ──
function ModuleCard({ m, onOpen }) {
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
        {/* Decorative giant G watermark */}
        <div style={{ position: "absolute", right: -120, bottom: -80, opacity: 0.10, pointerEvents: "none" }}>
          <Logo size={620} showText={false} color="orange" />
        </div>

        {/* Top — logo */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <Logo size={64} />
        </div>

        {/* Center — tagline */}
        <div style={{ position: "relative", zIndex: 1, maxWidth: 440 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange, letterSpacing: 3, marginBottom: 18, textTransform: "uppercase" }}>
            Sistema de Operaciones
          </div>
          <h1
            style={{
              fontFamily: FONT.display,
              fontSize: 44,
              fontWeight: 800,
              color: BRAND.charcoal,
              lineHeight: 1.1,
              letterSpacing: -1,
              marginBottom: 18,
            }}
          >
            Pilotamos lo que <span style={{ color: BRAND.orange }}>sostiene</span>.
          </h1>
          <p style={{ fontSize: 16, color: BRAND.graphite, lineHeight: 1.6, fontWeight: 400 }}>
            Plataforma operativa unificada para la gestión de proyectos, recursos humanos, compras y capacidad de Geotecnica Soluciones.
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
