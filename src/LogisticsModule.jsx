// =====================================================================
// MODULO DE LOGISTICA — GEOTECNICA / SUBTERRA
// =====================================================================
// Base inicial: control de FLOTA (vehiculos).
// Owner: Oscar (rol "logistica"). Acceso de lectura para admin.
//
// Estructura preparada para crecer:
// - Tab Flota (implementado): CRUD vehiculos con kilometraje, estado,
//   proyecto asignado, motorista, pendientes de reparacion.
// - Tab Rutas/Despachos (placeholder): futuro vinculado a Compras.
// - Tab Mantenimientos (placeholder): programar/registrar.
// - Tab Motoristas (placeholder): registro y disponibilidad.
//
// Storage:
// - lg-vehicles → array de vehiculos
// - cp-projects → compartido con Compras y RRHH (proyectos)
// =====================================================================

import { useState, useEffect } from "react";
import { store } from "./supabase.js";
import { BRAND, FONT, R } from "./theme.js";
import Logo from "./Logo.jsx";

// ── Constantes ──
const TIPOS_VEHICULO = [
  "Pickup",
  "Camion 3.5T",
  "Camion 5T",
  "Camion 8T",
  "Cabezal / Trailer",
  "Volqueta",
  "Bobcat / Equipo",
  "Microbus",
  "Motocicleta",
  "Otro",
];

const ESTADOS_VEHICULO = [
  { value: "operativo", label: "✓ Operativo", color: BRAND.green, bgSoft: BRAND.greenSoft },
  { value: "asignado", label: "🚧 En proyecto", color: BRAND.blue, bgSoft: BRAND.blueSoft },
  { value: "mantenimiento", label: "🔧 En mantenimiento", color: BRAND.yellow, bgSoft: BRAND.yellowSoft },
  { value: "reparacion", label: "🔨 En reparacion", color: BRAND.orange, bgSoft: BRAND.orangeBg },
  { value: "fuera_servicio", label: "✗ Fuera de servicio", color: BRAND.red, bgSoft: BRAND.redSoft },
];
const estadoCfg = (v) => ESTADOS_VEHICULO.find(s => s.value === v) || ESTADOS_VEHICULO[0];

const PROPIETARIOS = ["Subterra Honduras", "Geotecnica Soluciones", "Alquilado", "Otro"];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ── UI HELPERS (nivel modulo) ──
const Btn = ({ children, onClick, variant = "primary", small, style: sx, disabled, type }) => {
  const base = {
    padding: small ? "6px 12px" : "9px 16px",
    border: "none",
    borderRadius: R.sm,
    fontSize: small ? 12 : 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit",
    transition: "all .15s",
    letterSpacing: 0.2,
  };
  const variants = {
    primary: { background: BRAND.orange, color: "#fff" },
    success: { background: BRAND.green, color: "#fff" },
    danger: { background: BRAND.red, color: "#fff" },
    warn: { background: BRAND.yellow, color: "#fff" },
    ghost: { background: BRAND.beige, color: BRAND.charcoal, border: `1px solid ${BRAND.border}` },
    dark: { background: BRAND.charcoal, color: BRAND.beige },
  };
  return (
    <button type={type || "button"} onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...sx }}>
      {children}
    </button>
  );
};

const Input = ({ label, hint, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.graphite }}>{label}</label>}
    <input style={{ padding: "8px 12px", border: `1px solid ${BRAND.border}`, borderRadius: R.sm, fontSize: 14, outline: "none", background: BRAND.cream, fontFamily: "inherit", color: BRAND.charcoal }} {...p} />
    {hint && <span style={{ fontSize: 10, color: BRAND.stone, fontStyle: "italic" }}>{hint}</span>}
  </div>
);

const Textarea = ({ label, hint, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.graphite }}>{label}</label>}
    <textarea style={{ padding: "8px 12px", border: `1px solid ${BRAND.border}`, borderRadius: R.sm, fontSize: 14, outline: "none", background: BRAND.cream, fontFamily: "inherit", color: BRAND.charcoal, resize: "vertical", minHeight: 70 }} {...p} />
    {hint && <span style={{ fontSize: 10, color: BRAND.stone, fontStyle: "italic" }}>{hint}</span>}
  </div>
);

const Select = ({ label, options, emptyLabel = "—", ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.graphite }}>{label}</label>}
    <select style={{ padding: "8px 12px", border: `1px solid ${BRAND.border}`, borderRadius: R.sm, fontSize: 14, background: BRAND.cream, fontFamily: "inherit", color: BRAND.charcoal }} {...p}>
      <option value="">{emptyLabel}</option>
      {options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}
    </select>
  </div>
);

const Badge = ({ children, color = BRAND.charcoal, bg }) => (
  <span style={{ background: bg || (color + "20"), color, padding: "3px 9px", borderRadius: R.full, fontSize: 11, fontWeight: 700, display: "inline-block", letterSpacing: 0.3 }}>{children}</span>
);

const StatCard = ({ icon, label, value, color = BRAND.orange }) => (
  <div style={{ background: BRAND.cream, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.lg, padding: "14px 18px", minWidth: 150, flex: 1, boxShadow: BRAND.shadowSm }}>
    <div style={{ fontSize: 22 }}>{icon}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
    <div style={{ fontSize: 11, color: BRAND.stone, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
  </div>
);

const Modal = ({ title, children, onClose, wide }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(31,27,23,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: BRAND.cream, borderRadius: R.lg, padding: 28, maxWidth: wide ? 900 : 560, width: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: BRAND.shadowLg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, paddingBottom: 12, borderBottom: `1px solid ${BRAND.borderSoft}` }}>
        <h3 style={{ margin: 0, fontFamily: FONT.display, fontSize: 17, color: BRAND.charcoal }}>{title}</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: BRAND.stone }}>×</button>
      </div>
      {children}
    </div>
  </div>
);

// ── FORM DE VEHICULO (nivel de modulo para evitar remount/typing-lock) ──
function VehicleFormImpl({ vehicle, allProjects, setModal, saveVehicle }) {
  const [f, setF] = useState(vehicle || {
    plate: "",
    type: "Pickup",
    brand: "",
    model: "",
    year: "",
    color: "",
    owner: "Subterra Honduras",
    kmActual: "",
    estado: "operativo",
    projectCode: "",
    motorista: "",
    fechaIngreso: "",
    proxMantenimientoKm: "",
    proxMantenimientoFecha: "",
    pendientesReparacion: "",
    seguro: "",
    seguroVence: "",
    revisionVence: "",
    notas: "",
  });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!vehicle;
  const estCfg = estadoCfg(f.estado);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* IDENTIFICACION */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.orange, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🪪 Identificacion</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Placa *" value={f.plate} onChange={e => u("plate", e.target.value.toUpperCase())} placeholder="Ej: PCV-1234" />
        <Select label="Tipo de vehiculo *" options={TIPOS_VEHICULO} value={f.type} onChange={e => u("type", e.target.value)} />
        <Select label="Propietario" options={PROPIETARIOS} value={f.owner} onChange={e => u("owner", e.target.value)} />
        <Input label="Marca" value={f.brand} onChange={e => u("brand", e.target.value)} placeholder="Ej: Toyota" />
        <Input label="Modelo" value={f.model} onChange={e => u("model", e.target.value)} placeholder="Ej: Hilux" />
        <Input label="Año" type="number" value={f.year} onChange={e => u("year", e.target.value)} placeholder="Ej: 2020" />
        <Input label="Color" value={f.color} onChange={e => u("color", e.target.value)} placeholder="Ej: Blanco" />
        <Input label="Kilometraje actual" type="number" value={f.kmActual} onChange={e => u("kmActual", e.target.value)} placeholder="Km" />
        <Input label="Fecha de ingreso a la flota" type="date" value={f.fechaIngreso} onChange={e => u("fechaIngreso", e.target.value)} />
      </div>
    </div>

    {/* ESTADO + ASIGNACION */}
    <div style={{ background: estCfg.bgSoft, border: `1px solid ${estCfg.color}40`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: estCfg.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📍 Estado y asignacion actual</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Select label="Estado actual *" options={ESTADOS_VEHICULO} value={f.estado} onChange={e => u("estado", e.target.value)} emptyLabel="—" />
        <Select label="Proyecto asignado" options={allProjects.map(p => ({ value: p.short, label: p.short + (p.name ? ` — ${p.name}` : "") }))} value={f.projectCode} onChange={e => u("projectCode", e.target.value)} emptyLabel="— Sin asignar —" />
        <Input label="Motorista asignado" value={f.motorista} onChange={e => u("motorista", e.target.value)} placeholder="Nombre del motorista" />
      </div>
    </div>

    {/* MANTENIMIENTO */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.yellow, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔧 Programacion de mantenimiento</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Proximo mantenimiento (km)" type="number" value={f.proxMantenimientoKm} onChange={e => u("proxMantenimientoKm", e.target.value)} hint="A que kilometraje toca el siguiente servicio" />
        <Input label="Proximo mantenimiento (fecha)" type="date" value={f.proxMantenimientoFecha} onChange={e => u("proxMantenimientoFecha", e.target.value)} hint="O cuando toca por fecha" />
      </div>
    </div>

    {/* PENDIENTES DE REPARACION */}
    <div style={{ background: BRAND.orangeBg, border: `1px solid ${BRAND.orange}50`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.orangeDark, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔨 Pendientes de reparacion</div>
      <Textarea
        value={f.pendientesReparacion}
        onChange={e => u("pendientesReparacion", e.target.value)}
        placeholder={"Listar todo lo que el vehiculo necesita. Ej:\n• Cambiar pastillas de freno delanteras\n• Reparar aire acondicionado\n• Cambio de aceite (atrasado)\n• Llanta delantera derecha — fuga"}
        hint="Esta lista alimenta el panel de mantenimientos pendientes"
      />
    </div>

    {/* DOCUMENTOS */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📄 Documentos y vencimientos</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Input label="Compañia de seguro" value={f.seguro} onChange={e => u("seguro", e.target.value)} placeholder="Ej: Mapfre" />
        <Input label="Vencimiento seguro" type="date" value={f.seguroVence} onChange={e => u("seguroVence", e.target.value)} />
        <Input label="Vencimiento revision" type="date" value={f.revisionVence} onChange={e => u("revisionVence", e.target.value)} />
      </div>
    </div>

    {/* NOTAS */}
    <Textarea label="Notas generales" value={f.notas} onChange={e => u("notas", e.target.value)} placeholder="Cualquier observacion adicional" />

    {/* BOTONES */}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${BRAND.borderSoft}` }}>
      <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
      <Btn variant="success" onClick={async () => {
        if (!f.plate || !f.type) return alert("Placa y tipo de vehiculo son obligatorios");
        const rec = {
          ...f,
          plate: f.plate.toUpperCase().trim(),
          id: f.id || uid(),
          kmActual: Number(f.kmActual) || 0,
          year: Number(f.year) || null,
          proxMantenimientoKm: Number(f.proxMantenimientoKm) || null,
          updatedAt: new Date().toISOString(),
          createdAt: f.createdAt || new Date().toISOString(),
        };
        const ok = await saveVehicle(rec, isEdit);
        if (ok) setModal(null);
      }}>{isEdit ? "💾 Guardar cambios" : "+ Agregar vehiculo"}</Btn>
    </div>
  </div>;
}

// ── DETAIL VIEW ──
function VehicleDetailImpl({ vehicle, allProjects, setModal, deleteVehicle }) {
  const v = vehicle;
  const estCfg = estadoCfg(v.estado);
  const proj = allProjects.find(p => p.short === v.projectCode);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diasParaFecha = (iso) => {
    if (!iso) return null;
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return Math.ceil((d - today) / 86400000);
  };
  const fmtFecha = (iso) => iso ? new Date(iso + "T00:00").toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  const alertaCajita = (titulo, fecha) => {
    const d = diasParaFecha(fecha);
    if (d === null) return null;
    let color = BRAND.green, txt = `${d}d restantes`;
    if (d < 0) { color = BRAND.red; txt = `Vencido hace ${Math.abs(d)}d`; }
    else if (d <= 15) { color = BRAND.red; txt = `Vence en ${d}d`; }
    else if (d <= 45) { color = BRAND.yellow; txt = `Vence en ${d}d`; }
    return <div style={{ background: color + "15", border: `1px solid ${color}40`, borderRadius: R.sm, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
      <span style={{ color: BRAND.graphite, fontWeight: 600 }}>{titulo}</span>
      <span style={{ color, fontWeight: 700 }}>{fmtFecha(fecha)} · {txt}</span>
    </div>;
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    {/* HEADER */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", paddingBottom: 12, borderBottom: `1px solid ${BRAND.borderSoft}` }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontFamily: FONT.mono, fontSize: 20, fontWeight: 800, color: BRAND.charcoal, background: BRAND.parchment, padding: "4px 12px", borderRadius: R.sm, letterSpacing: 1 }}>{v.plate}</span>
          <Badge color={estCfg.color}>{estCfg.label}</Badge>
        </div>
        <div style={{ fontSize: 14, color: BRAND.graphite }}>{v.brand} {v.model} {v.year && `· ${v.year}`} {v.color && `· ${v.color}`}</div>
        <div style={{ fontSize: 12, color: BRAND.stone, marginTop: 2 }}>{v.type} · {v.owner}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: BRAND.orange, fontFamily: FONT.mono }}>{(v.kmActual || 0).toLocaleString("es-HN")}</div>
        <div style={{ fontSize: 10, color: BRAND.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>kilometros</div>
      </div>
    </div>

    {/* ASIGNACION */}
    <div style={{ background: estCfg.bgSoft, border: `1px solid ${estCfg.color}40`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: estCfg.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📍 Asignacion actual</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
        <div><span style={{ color: BRAND.stone }}>Proyecto:</span> <b>{proj ? `${proj.short} — ${proj.name}` : "Sin asignar"}</b></div>
        <div><span style={{ color: BRAND.stone }}>Motorista:</span> <b>{v.motorista || "Sin asignar"}</b></div>
      </div>
    </div>

    {/* PENDIENTES DE REPARACION */}
    {v.pendientesReparacion && <div style={{ background: BRAND.orangeBg, border: `1px solid ${BRAND.orange}50`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.orangeDark, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔨 Pendientes de reparacion</div>
      <pre style={{ margin: 0, fontFamily: "inherit", whiteSpace: "pre-wrap", fontSize: 13, color: BRAND.ink, lineHeight: 1.6 }}>{v.pendientesReparacion}</pre>
    </div>}

    {/* MANTENIMIENTO */}
    {(v.proxMantenimientoKm || v.proxMantenimientoFecha) && <div style={{ background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}40`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.yellow, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔧 Proximo mantenimiento</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
        {v.proxMantenimientoKm && <div>
          <span style={{ color: BRAND.stone }}>Por kilometraje:</span> <b>{Number(v.proxMantenimientoKm).toLocaleString("es-HN")} km</b>
          {v.kmActual && <span style={{ marginLeft: 8, color: (v.proxMantenimientoKm - v.kmActual) < 500 ? BRAND.red : (v.proxMantenimientoKm - v.kmActual) < 2000 ? BRAND.yellow : BRAND.green, fontWeight: 700 }}>
            (faltan {Math.max(0, v.proxMantenimientoKm - v.kmActual).toLocaleString("es-HN")} km)
          </span>}
        </div>}
        {v.proxMantenimientoFecha && <div>
          <span style={{ color: BRAND.stone }}>Por fecha:</span> <b>{fmtFecha(v.proxMantenimientoFecha)}</b>
          {diasParaFecha(v.proxMantenimientoFecha) !== null && <span style={{ marginLeft: 8, color: diasParaFecha(v.proxMantenimientoFecha) < 0 ? BRAND.red : diasParaFecha(v.proxMantenimientoFecha) < 15 ? BRAND.yellow : BRAND.green, fontWeight: 700 }}>
            ({diasParaFecha(v.proxMantenimientoFecha) < 0 ? "vencido" : `${diasParaFecha(v.proxMantenimientoFecha)}d`})
          </span>}
        </div>}
      </div>
    </div>}

    {/* DOCUMENTOS */}
    {(v.seguro || v.seguroVence || v.revisionVence) && <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📄 Documentos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {v.seguro && <div style={{ fontSize: 13 }}><span style={{ color: BRAND.stone }}>Seguro:</span> <b>{v.seguro}</b></div>}
        {alertaCajita("Seguro vence", v.seguroVence)}
        {alertaCajita("Revision vehicular vence", v.revisionVence)}
      </div>
    </div>}

    {/* NOTAS */}
    {v.notas && <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.stone, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>📝 Notas</div>
      <div style={{ fontSize: 13, color: BRAND.graphite, padding: "8px 12px", background: BRAND.parchment, borderRadius: R.sm, lineHeight: 1.5 }}>{v.notas}</div>
    </div>}

    {/* TIMESTAMPS */}
    <div style={{ fontSize: 11, color: BRAND.stone, paddingTop: 8, borderTop: `1px solid ${BRAND.borderSoft}` }}>
      {v.createdAt && <span>Creado: {new Date(v.createdAt).toLocaleString("es-HN")}</span>}
      {v.updatedAt && <span style={{ marginLeft: 14 }}>Modificado: {new Date(v.updatedAt).toLocaleString("es-HN")}</span>}
    </div>

    {/* ACCIONES */}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${BRAND.borderSoft}` }}>
      <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
      <Btn variant="danger" onClick={() => { if (confirm(`¿Eliminar el vehiculo ${v.plate}? Esta accion no se puede deshacer.`)) { deleteVehicle(v.id); setModal(null); } }}>🗑 Eliminar</Btn>
      <Btn variant="primary" onClick={() => setModal({ t: "edit", d: v })}>✏️ Editar</Btn>
    </div>
  </div>;
}

// =====================================================================
// MODULO PRINCIPAL
// =====================================================================
export default function LogisticsModule({ userRole, userName, onBack, onLogout }) {
  const isAdmin = userRole === "admin";
  const isLogistica = userRole === "logistica";
  const canEdit = isAdmin || isLogistica;

  const [vehicles, setVehicles] = useState([]);
  const [customProjects, setCustomProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [sb, setSb] = useState(true);
  const [sec, setSec] = useState("flota");
  const [filter, setFilter] = useState({ estado: "", projectCode: "", type: "", q: "" });

  // ── Carga inicial ──
  useEffect(() => {
    (async () => {
      const [v, cps] = await Promise.all([store.get("lg-vehicles"), store.get("cp-projects")]);
      if (Array.isArray(v)) setVehicles(v);
      if (Array.isArray(cps)) setCustomProjects(cps);
      setLoaded(true);
    })();
  }, []);

  // ── Helpers ──
  const allProjects = customProjects.filter(p => !p.hidden && !p.deleted);

  const saveVehicle = async (rec, isEdit) => {
    // Validar duplicado de placa (solo si es nuevo o si cambio la placa)
    const exists = vehicles.find(x => x.plate === rec.plate && x.id !== rec.id);
    if (exists) {
      alert(`Ya existe un vehiculo con placa "${rec.plate}". Usa una placa distinta.`);
      return false;
    }
    const next = isEdit
      ? vehicles.map(x => x.id === rec.id ? rec : x)
      : [...vehicles, rec];
    setVehicles(next);
    const ok = await store.set("lg-vehicles", next);
    if (!ok) {
      alert("⚠️ Vehiculo guardado en este dispositivo pero NO se sincronizo a la nube. Cuando recuperes conexion, volve a guardar.");
    }
    return true; // siempre cerramos el modal — quedo en local minimo
  };

  const deleteVehicle = async (id) => {
    const next = vehicles.filter(v => v.id !== id);
    setVehicles(next);
    await store.set("lg-vehicles", next);
  };

  // ── Filtros ──
  const filtered = vehicles.filter(v => {
    if (filter.estado && v.estado !== filter.estado) return false;
    if (filter.projectCode && v.projectCode !== filter.projectCode) return false;
    if (filter.type && v.type !== filter.type) return false;
    if (filter.q) {
      const q = filter.q.toLowerCase();
      const hay = [v.plate, v.brand, v.model, v.motorista, v.notas].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // ── Stats ──
  const stats = {
    total: vehicles.length,
    operativos: vehicles.filter(v => v.estado === "operativo").length,
    asignados: vehicles.filter(v => v.estado === "asignado").length,
    mantenimiento: vehicles.filter(v => v.estado === "mantenimiento").length,
    reparacion: vehicles.filter(v => v.estado === "reparacion").length,
    fueraServicio: vehicles.filter(v => v.estado === "fuera_servicio").length,
    pendientes: vehicles.filter(v => v.pendientesReparacion && v.pendientesReparacion.trim().length > 0).length,
  };

  const fmtFecha = (iso) => iso ? new Date(iso + "T00:00").toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diasParaFecha = (iso) => {
    if (!iso) return null;
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    return Math.ceil((d - today) / 86400000);
  };

  // ── NAV ──
  const nav = [
    { id: "flota", label: "Flota", icon: "🚛" },
    { id: "mantenimientos", label: "Mantenimientos", icon: "🔧", soon: true },
    { id: "rutas", label: "Rutas / Despachos", icon: "🛣️", soon: true },
    { id: "motoristas", label: "Motoristas", icon: "👤", soon: true },
  ];

  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: FONT.body, color: BRAND.graphite }}>Cargando Logistica...</div>;

  // ── RENDER FLOTA ──
  const renderFlota = () => <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    {/* Stats */}
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <StatCard icon="🚛" label="Total" value={stats.total} color={BRAND.charcoal} />
      <StatCard icon="✓" label="Operativos" value={stats.operativos} color={BRAND.green} />
      <StatCard icon="🚧" label="En proyecto" value={stats.asignados} color={BRAND.blue} />
      <StatCard icon="🔧" label="Mantenimiento" value={stats.mantenimiento} color={BRAND.yellow} />
      <StatCard icon="🔨" label="Reparacion" value={stats.reparacion} color={BRAND.orange} />
      <StatCard icon="✗" label="Fuera servicio" value={stats.fueraServicio} color={BRAND.red} />
    </div>

    {/* Alertas */}
    {stats.pendientes > 0 && <div style={{ background: BRAND.orangeBg, border: `1px solid ${BRAND.orange}50`, borderLeft: `4px solid ${BRAND.orange}`, borderRadius: R.md, padding: 14, fontSize: 13, color: BRAND.orangeDark }}>
      🔨 Hay <b>{stats.pendientes} vehiculo(s)</b> con pendientes de reparacion registrados. Click en cualquier fila para ver el detalle.
    </div>}

    {/* Filtros + accion */}
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
        <Input label="Buscar" value={filter.q} onChange={e => setFilter(s => ({ ...s, q: e.target.value }))} placeholder="placa, marca, motorista..." />
        <Select label="Estado" options={ESTADOS_VEHICULO} value={filter.estado} onChange={e => setFilter(s => ({ ...s, estado: e.target.value }))} emptyLabel="Todos" />
        <Select label="Proyecto" options={allProjects.map(p => ({ value: p.short, label: p.short }))} value={filter.projectCode} onChange={e => setFilter(s => ({ ...s, projectCode: e.target.value }))} emptyLabel="Todos" />
        <Select label="Tipo" options={TIPOS_VEHICULO} value={filter.type} onChange={e => setFilter(s => ({ ...s, type: e.target.value }))} emptyLabel="Todos" />
        {(filter.estado || filter.projectCode || filter.type || filter.q) && <Btn small variant="ghost" onClick={() => setFilter({ estado: "", projectCode: "", type: "", q: "" })}>Limpiar</Btn>}
      </div>
      {canEdit && <Btn variant="primary" onClick={() => setModal({ t: "new" })}>+ Nuevo vehiculo</Btn>}
    </div>

    {/* Tabla */}
    {filtered.length === 0
      ? <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 40, textAlign: "center", color: BRAND.stone }}>
          {vehicles.length === 0
            ? "Aun no hay vehiculos registrados. Click en + Nuevo vehiculo para empezar a cargar la flota."
            : "No hay vehiculos que cumplan los filtros."}
        </div>
      : <div style={{ background: BRAND.cream, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ background: BRAND.beigeDeep, borderBottom: `1px solid ${BRAND.border}` }}>
                <th style={th}>Placa</th>
                <th style={th}>Tipo</th>
                <th style={th}>Marca / Modelo</th>
                <th style={th}>Km</th>
                <th style={th}>Estado</th>
                <th style={th}>Proyecto</th>
                <th style={th}>Motorista</th>
                <th style={th}>Prox. Mant.</th>
                <th style={th}>Seguro</th>
                <th style={th}>Pendientes</th>
                {canEdit && <th style={th}>Acciones</th>}
              </tr></thead>
              <tbody>
                {filtered.sort((a, b) => (a.plate || "").localeCompare(b.plate || "")).map(v => {
                  const ec = estadoCfg(v.estado);
                  const proj = allProjects.find(p => p.short === v.projectCode);
                  const dSeg = diasParaFecha(v.seguroVence);
                  const kmFalta = v.proxMantenimientoKm && v.kmActual ? (v.proxMantenimientoKm - v.kmActual) : null;
                  const tienePend = v.pendientesReparacion && v.pendientesReparacion.trim().length > 0;
                  return <tr key={v.id} onClick={() => setModal({ t: "detail", d: v })} style={{ borderBottom: `1px solid ${BRAND.borderSoft}`, cursor: "pointer" }}>
                    <td style={{ ...td, fontFamily: FONT.mono, fontWeight: 800, color: BRAND.charcoal }}>{v.plate}</td>
                    <td style={{ ...td, fontSize: 11, color: BRAND.graphite }}>{v.type}</td>
                    <td style={td}>{v.brand} {v.model} {v.year && <span style={{ color: BRAND.stone }}>· {v.year}</span>}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: FONT.mono }}>{(v.kmActual || 0).toLocaleString("es-HN")}</td>
                    <td style={td}><Badge color={ec.color} bg={ec.bgSoft}>{ec.label}</Badge></td>
                    <td style={td}>{proj ? <Badge color={BRAND.blue}>{proj.short}</Badge> : <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}</td>
                    <td style={td}>{v.motorista || <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}</td>
                    <td style={td}>
                      {v.proxMantenimientoKm && kmFalta !== null && <div style={{ fontSize: 11, color: kmFalta < 500 ? BRAND.red : kmFalta < 2000 ? BRAND.yellow : BRAND.green, fontWeight: 600 }}>
                        {kmFalta < 0 ? `Atrasado ${Math.abs(kmFalta).toLocaleString("es-HN")} km` : `${kmFalta.toLocaleString("es-HN")} km`}
                      </div>}
                      {v.proxMantenimientoFecha && <div style={{ fontSize: 10, color: BRAND.stone }}>{fmtFecha(v.proxMantenimientoFecha)}</div>}
                      {!v.proxMantenimientoKm && !v.proxMantenimientoFecha && <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}
                    </td>
                    <td style={td}>
                      {v.seguroVence ? <span style={{ color: dSeg < 0 ? BRAND.red : dSeg < 30 ? BRAND.yellow : BRAND.green, fontSize: 11, fontWeight: 600 }}>
                        {dSeg < 0 ? `Vencido ${Math.abs(dSeg)}d` : `${dSeg}d`}
                      </span> : <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}
                    </td>
                    <td style={td}>{tienePend ? <Badge color={BRAND.orange}>🔨 SI</Badge> : <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}</td>
                    {canEdit && <td style={{ ...td, textAlign: "right" }} onClick={e => e.stopPropagation()}>
                      <Btn small variant="ghost" onClick={() => setModal({ t: "edit", d: v })}>✏️</Btn>
                    </td>}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>}
  </div>;

  // ── RENDER PLACEHOLDER ──
  const renderPlaceholder = (label, desc) => <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 60, textAlign: "center" }}>
    <div style={{ fontSize: 48, marginBottom: 14 }}>🚧</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.charcoal, marginBottom: 6 }}>{label} — proximamente</div>
    <div style={{ fontSize: 13, color: BRAND.stone, maxWidth: 500, margin: "0 auto" }}>{desc}</div>
  </div>;

  const renderSec = () => {
    if (sec === "flota") return renderFlota();
    if (sec === "mantenimientos") return renderPlaceholder("Mantenimientos", "Programacion y registro de mantenimientos preventivos/correctivos. Se va a alimentar de los vehiculos con pendientes y de los proximos mantenimientos programados que cargues en cada ficha.");
    if (sec === "rutas") return renderPlaceholder("Rutas y Despachos", "Coordinacion de viajes vinculados a las compras aprobadas por Operaciones. Cuando se apruebe una solicitud en Compras, se va a poder generar aqui un despacho asignando vehiculo + motorista + ruta.");
    if (sec === "motoristas") return renderPlaceholder("Motoristas", "Registro del personal de manejo con disponibilidad, licencia y vehiculos asignados.");
    return null;
  };

  // ── MODAL SWITCH ──
  const renderModal = () => {
    if (!modal) return null;
    if (modal.t === "new") return <Modal title="Nuevo vehiculo" onClose={() => setModal(null)} wide><VehicleFormImpl allProjects={allProjects} setModal={setModal} saveVehicle={saveVehicle} /></Modal>;
    if (modal.t === "edit") return <Modal title={`Editar vehiculo — ${modal.d.plate}`} onClose={() => setModal(null)} wide><VehicleFormImpl vehicle={modal.d} allProjects={allProjects} setModal={setModal} saveVehicle={saveVehicle} /></Modal>;
    if (modal.t === "detail") return <Modal title={`Vehiculo — ${modal.d.plate}`} onClose={() => setModal(null)} wide><VehicleDetailImpl vehicle={modal.d} allProjects={allProjects} setModal={setModal} deleteVehicle={deleteVehicle} /></Modal>;
    return null;
  };

  // ── LAYOUT ──
  return <div style={{ display: "flex", height: "100vh", fontFamily: FONT.body, background: BRAND.beige, color: BRAND.charcoal }}>
    {/* Sidebar */}
    <div style={{ width: sb ? 240 : 60, background: BRAND.darkBg, color: BRAND.darkText, transition: "width .2s", overflow: "hidden", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: sb ? "20px 16px" : "20px 12px", borderBottom: `1px solid ${BRAND.darkBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setSb(!sb)} style={{ background: "none", border: "none", color: BRAND.darkTextMuted, fontSize: 20, cursor: "pointer", flexShrink: 0 }}>☰</button>
        {sb && <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Logo size={28} showText={false} />
          <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: BRAND.darkText, marginTop: 4 }}>GEOTECNICA</div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: BRAND.darkTextMuted, fontWeight: 600 }}>LOGISTICA · FLOTA</div>
        </div>}
      </div>
      <div style={{ flex: 1, padding: "16px 0", overflowY: "auto" }}>
        {nav.map(n => (
          <button
            key={n.id}
            onClick={() => !n.soon && setSec(n.id)}
            disabled={n.soon}
            style={{
              width: "100%",
              background: sec === n.id ? BRAND.orange : "transparent",
              border: "none",
              color: n.soon ? BRAND.darkTextMuted : (sec === n.id ? "#fff" : BRAND.darkText),
              padding: sb ? "12px 20px" : "12px 16px",
              textAlign: "left",
              cursor: n.soon ? "not-allowed" : "pointer",
              fontSize: 13,
              fontFamily: "inherit",
              fontWeight: sec === n.id ? 700 : 500,
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: n.soon ? 0.45 : 1,
              borderLeft: sec === n.id ? `3px solid #fff` : `3px solid transparent`,
            }}
          >
            <span style={{ fontSize: 16 }}>{n.icon}</span>
            {sb && <span>{n.label}{n.soon && <span style={{ marginLeft: 6, fontSize: 9, color: BRAND.darkTextMuted, fontStyle: "italic" }}>(pronto)</span>}</span>}
          </button>
        ))}
      </div>
      <div style={{ padding: 14, borderTop: `1px solid ${BRAND.darkBorder}` }}>
        {sb && <div style={{ fontSize: 11, color: BRAND.darkTextMuted, marginBottom: 8 }}>{userName || userRole}</div>}
        <button onClick={onBack} style={{ width: "100%", background: BRAND.darkSurface, color: BRAND.darkText, border: `1px solid ${BRAND.darkBorder}`, borderRadius: R.sm, padding: "8px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 6 }}>
          {sb ? "← Volver al panel" : "←"}
        </button>
        <button onClick={onLogout} style={{ width: "100%", background: BRAND.red, color: "#fff", border: "none", borderRadius: R.sm, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {sb ? "Cerrar sesion" : "✕"}
        </button>
      </div>
    </div>

    {/* Main */}
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "20px 28px", background: BRAND.cream, borderBottom: `1px solid ${BRAND.borderSoft}` }}>
        <h1 style={{ margin: 0, fontFamily: FONT.display, fontSize: 24, fontWeight: 800, color: BRAND.charcoal }}>Logistica</h1>
        <div style={{ fontSize: 13, color: BRAND.orange, fontWeight: 600, marginTop: 2 }}>Control de flota y operaciones de transporte</div>
      </div>
      <div style={{ flex: 1, padding: 28, overflow: "auto" }}>
        {renderSec()}
      </div>
    </div>

    {renderModal()}
  </div>;
}

// Estilos de tabla
const th = { padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.5 };
const td = { padding: "10px 12px", color: BRAND.ink };
