import { useState, useEffect } from "react";
import HRModule from "./HRModule.jsx";
import PurchasesModule from "./PurchasesModule.jsx";

// ── Credenciales y roles ──
const USERS = [
  { username: "administrador", password: "1234geo", role: "admin", label: "Administrador" },
  { username: "asistente", password: "asistente1234", role: "asistente", label: "Asistente" },
  { username: "carolina", password: "carolina1234", role: "tesoreria", label: "Lic. Carolina Flores-Hernandez" },
  { username: "gerencia", password: "gerencia1234", role: "gerencia", label: "Gerencia" },
];

const ROLE_LABEL = { admin: "Administrador", asistente: "Asistente", tesoreria: "Tesoreria", gerencia: "Gerencia (solo lectura)" };

// ── Modulos del sistema ──
const MODULES = [
  { id: "rrhh", name: "Recursos Humanos", icon: "👥", desc: "Empleados, planilla, asistencia, vacaciones, permisos", color: "#0F4C75", roles: ["admin", "asistente"] },
  { id: "compras-operaciones", name: "Compras-Operaciones", icon: "🧾", desc: "Solicitudes validadas, pagos y comprobantes de tesoreria", color: "#BE185D", roles: ["admin", "tesoreria", "gerencia"] },
  { id: "almacen", name: "Almacen", icon: "📦", desc: "Inventario, entradas, salidas, requisiciones", color: "#7C3AED", roles: ["admin"], soon: true },
  { id: "logistica", name: "Logistica", icon: "🚛", desc: "Transporte, rutas, despachos, vehiculos", color: "#D97706", roles: ["admin"], soon: true },
  { id: "operaciones", name: "Operaciones", icon: "⚙️", desc: "Proyectos, avances, reportes de campo", color: "#059669", roles: ["admin"], soon: true },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [activeModule, setActiveModule] = useState(null);

  // Restaurar sesion
  useEffect(() => {
    try {
      const s = sessionStorage.getItem("gt-session");
      if (s) setUser(JSON.parse(s));
    } catch {}
  }, []);

  const login = (username, password) => {
    const found = USERS.find(u => u.username === username && u.password === password);
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

  // ── Pantalla 1: Login ──
  if (!user) return <LoginScreen onLogin={login} />;

  // ── Pantalla 3: Modulo activo ──
  if (activeModule === "rrhh") {
    return <HRModule userRole={user.role} userName={user.label} onBack={() => setActiveModule(null)} onLogout={logout} />;
  }
  if (activeModule === "compras-operaciones") {
    return <PurchasesModule userRole={user.role} userName={user.label} onBack={() => setActiveModule(null)} onLogout={logout} />;
  }

  // ── Pantalla 2: Panel de modulos ──
  const availableModules = MODULES.filter(m => m.roles.includes(user.role));

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Segoe UI', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#0F172A", color: "#fff", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>GRUPO GEOTECNICA</div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>Sistema de Operaciones</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{user.label}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{ROLE_LABEL[user.role] || user.role}</div>
          </div>
          <button onClick={logout} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, color: "#fff", padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Cerrar sesion
          </button>
        </div>
      </div>

      {/* Panel de modulos */}
      <div style={{ maxWidth: 900, margin: "60px auto", padding: "0 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#1E293B", marginBottom: 8 }}>Panel de Control</h1>
        <p style={{ fontSize: 15, color: "#64748b", marginBottom: 36 }}>Seleccione un modulo para continuar</p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260, 1fr))", gap: 20 }}>
          {availableModules.map(m => (
            <div
              key={m.id}
              onClick={() => !m.soon && setActiveModule(m.id)}
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: 28,
                border: "1px solid #E2E8F0",
                cursor: m.soon ? "default" : "pointer",
                opacity: m.soon ? 0.55 : 1,
                transition: "transform .15s, box-shadow .15s",
                position: "relative",
              }}
              onMouseEnter={e => { if (!m.soon) { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,.1)"; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
            >
              {m.soon && (
                <div style={{ position: "absolute", top: 14, right: 14, background: "#FEF3C7", color: "#92400E", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
                  PROXIMAMENTE
                </div>
              )}
              <div style={{ width: 56, height: 56, borderRadius: 14, background: m.color + "15", color: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, marginBottom: 16 }}>
                {m.icon}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", marginBottom: 6 }}>{m.name}</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8", fontSize: 12 }}>
        Grupo Geotecnica — Sistema de Operaciones v1.0
      </div>
    </div>
  );
}

// ── Login Screen ──
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Pequeno delay para UX
    setTimeout(() => {
      const ok = onLogin(username, password);
      if (!ok) setError("Usuario o clave incorrecta");
      setLoading(false);
    }, 400);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0F172A 0%, #1E3A5F 50%, #0F172A 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', -apple-system, sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: 40, width: 400, maxWidth: "90vw", boxShadow: "0 24px 64px rgba(0,0,0,.3)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg, #0F4C75, #3282B8)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#fff", fontSize: 28, fontWeight: 900 }}>
            GT
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1E293B" }}>GRUPO GEOTECNICA</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Sistema de Operaciones</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>Usuario</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Ingrese su usuario"
                autoFocus
                style={{ width: "100%", padding: "12px 16px", border: "1px solid #CBD5E1", borderRadius: 10, fontSize: 15, outline: "none", background: "#F8FAFC", boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>Clave</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Ingrese su clave"
                style={{ width: "100%", padding: "12px 16px", border: "1px solid #CBD5E1", borderRadius: 10, fontSize: 15, outline: "none", background: "#F8FAFC", boxSizing: "border-box" }}
              />
            </div>

            {error && (
              <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", color: "#991B1B", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              style={{
                width: "100%",
                padding: "13px 0",
                background: loading ? "#94A3B8" : "#0F4C75",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "wait" : "pointer",
                marginTop: 8,
              }}
            >
              {loading ? "Verificando..." : "Ingresar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
