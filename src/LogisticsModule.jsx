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
import { generateFichaPDF, restoreFiles } from "./PurchasesModule.jsx";

// Helper interno: dado un purchase (con projectCode), buscar el proyecto y
// la empresa para llamar a generateFichaPDF correctamente. Usado por los
// cards "De compra" del Kanban para descargar la misma ficha que en Compras.
//
// IMPORTANTE: los archivos (cotizacion + comprobante de transferencia) viven
// en rows separadas del store (cp-file-<fileId>) para no exceder el limite
// de tamaño de Supabase. Las purchases que cargamos en LogisticsModule estan
// "light" (solo refs por fileId). Antes de generar el PDF tenemos que hidratar
// esos archivos llamando a restoreFiles, sino la ficha sale sin cotizacion ni
// comprobante.
const COMPANIES_MAP = {
  subterra: { name: "Subterra Honduras" },
  geotecnica: { name: "Geotecnica Soluciones" },
};
const descargarFichaCompra = async (purchase, allProjects) => {
  const proj = allProjects.find(p => p.short === purchase.projectCode) || null;
  const companyName = COMPANIES_MAP[purchase.company]?.name || "";
  // Hidratar quoteFile / receiptFile / fichaFile cargando los dataUrl desde sus
  // rows separadas en el store. Funciona sobre un array y devuelve un array nuevo.
  const [hydrated] = await restoreFiles([purchase]);
  await generateFichaPDF(hydrated || purchase, proj, companyName);
};

// ── Constantes ──
const TIPOS_VEHICULO = [
  "Pickup / Camioneta",
  "Camion / Cabezal",
  "Motocicleta",
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
    type: "Pickup / Camioneta",
    brand: "",
    model: "",
    year: "",
    color: "",
    owner: "Subterra Honduras",
    kmActual: "",
    estado: "operativo",
    projectCode: "",
    motorista: "",
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

// ── Helpers de parseo de pendientes desde el textarea de cada vehiculo ──
// Cada linea no vacia del textarea pendientesReparacion se trata como un pendiente
// separado. Quitamos los bullets/numeros del inicio para mostrarlos limpios.
const parsePendientes = (text) => {
  if (!text || typeof text !== "string") return [];
  return text.split("\n")
    .map((line, raw_idx) => ({ raw: line, idx: raw_idx, trimmed: line.trim() }))
    .filter(x => x.trimmed.length > 0)
    .map((x, visIdx) => ({
      ...x,
      visIdx,
      clean: x.trimmed.replace(/^[•\-\*]+\s*/, "").replace(/^\d+[.\)]\s*/, "").trim(),
    }));
};

// Remueve una linea especifica del textarea por su texto exacto
const removeLine = (text, exactLine) => {
  if (!text) return "";
  return text.split("\n").filter(l => l !== exactLine).join("\n");
};

// ── TIPOS DE MANTENIMIENTO ──
const TIPOS_MANTENIMIENTO = [
  { value: "preventivo", label: "🛡 Preventivo", color: BRAND.green },
  { value: "correctivo", label: "🔧 Correctivo", color: BRAND.yellow },
  { value: "emergencia", label: "🚨 Emergencia", color: BRAND.red },
];
const tipoMantCfg = (v) => TIPOS_MANTENIMIENTO.find(t => t.value === v) || TIPOS_MANTENIMIENTO[1];

// ── FORM DE MANTENIMIENTO (nivel de modulo) ──
function MaintenanceFormImpl({ vehicle, vehicles, prefilledDescription, prefilledRawLine, setModal, saveMaintenance }) {
  const [f, setF] = useState({
    vehicleId: vehicle?.id || "",
    type: "correctivo",
    fecha: new Date().toISOString().slice(0, 10),
    kmAlRealizar: vehicle?.kmActual || "",
    description: prefilledDescription || "",
    workshop: "",
    cost: "",
    proxKm: "",
    proxFecha: "",
    notas: "",
    rawLineToRemove: prefilledRawLine || null, // si vino de un pendiente, lo borramos al guardar
  });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const selectedVehicle = vehicles.find(x => x.id === f.vehicleId);
  const tipoCfg = tipoMantCfg(f.type);

  // Sugerencia automatica: si seleccionan vehiculo y no hay km, llenar con el actual
  const onVehicleChange = (id) => {
    const v = vehicles.find(x => x.id === id);
    setF(p => ({ ...p, vehicleId: id, kmAlRealizar: v?.kmActual || p.kmAlRealizar }));
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Vehiculo */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.orange, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🚛 Vehiculo</div>
      <Select
        label="Vehiculo *"
        options={vehicles.map(v => ({ value: v.id, label: `${v.plate} — ${v.brand || ""} ${v.model || ""}` }))}
        value={f.vehicleId}
        onChange={e => onVehicleChange(e.target.value)}
        emptyLabel="— Seleccionar —"
      />
    </div>

    {/* Tipo + fecha + km */}
    <div style={{ background: tipoCfg.color + "15", border: `1px solid ${tipoCfg.color}40`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: tipoCfg.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📋 Detalle</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Select label="Tipo *" options={TIPOS_MANTENIMIENTO} value={f.type} onChange={e => u("type", e.target.value)} emptyLabel="—" />
        <Input label="Fecha realizada *" type="date" value={f.fecha} onChange={e => u("fecha", e.target.value)} />
        <Input label="Km al realizar" type="number" value={f.kmAlRealizar} onChange={e => u("kmAlRealizar", e.target.value)} hint={selectedVehicle ? `Actual: ${(selectedVehicle.kmActual || 0).toLocaleString("es-HN")} km` : ""} />
      </div>
    </div>

    {/* Descripcion */}
    <Textarea label="Que se le hizo *" value={f.description} onChange={e => u("description", e.target.value)} placeholder={"Detalle del mantenimiento. Ej:\n• Cambio de pastillas de freno\n• Cambio de aceite y filtros"} />

    {/* Costos */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>💰 Costo y taller</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input label="Taller / Mecanico" value={f.workshop} onChange={e => u("workshop", e.target.value)} placeholder="Ej: Taller propio, Mecanico Roberto" />
        <Input label="Costo (L)" type="number" step="0.01" value={f.cost} onChange={e => u("cost", e.target.value)} placeholder="0.00" />
      </div>
    </div>

    {/* Programar el siguiente */}
    <div style={{ background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}40`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.yellow, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔧 Programar el proximo mantenimiento (opcional)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
        <Input label="Proximo a los (km)" type="number" value={f.proxKm} onChange={e => u("proxKm", e.target.value)} hint="Ej: 5000 km despues del actual" />
        <Input label="O en fecha" type="date" value={f.proxFecha} onChange={e => u("proxFecha", e.target.value)} />
        <Btn small variant="ghost" onClick={() => {
          // Quick add 5000 km al km del vehiculo
          const baseKm = Number(f.kmAlRealizar) || selectedVehicle?.kmActual || 0;
          u("proxKm", baseKm + 5000);
        }}>+ 5,000 km</Btn>
      </div>
      <div style={{ fontSize: 11, color: BRAND.stone, fontStyle: "italic", marginTop: 6 }}>Esto actualiza los campos "Proximo mantenimiento" del vehiculo automaticamente.</div>
    </div>

    {/* Notas */}
    <Textarea label="Notas" value={f.notas} onChange={e => u("notas", e.target.value)} placeholder="Observaciones, garantia, repuestos cambiados, etc." />

    {/* Aviso de pendiente que se va a borrar */}
    {f.rawLineToRemove && <div style={{ background: BRAND.greenSoft, border: `1px solid ${BRAND.green}40`, borderRadius: R.sm, padding: "8px 12px", fontSize: 12, color: BRAND.green }}>
      ✓ Al guardar, este pendiente se va a quitar del vehiculo: <b>{f.rawLineToRemove.trim()}</b>
    </div>}

    {/* Botones */}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${BRAND.borderSoft}` }}>
      <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
      <Btn variant="success" onClick={async () => {
        if (!f.vehicleId) return alert("Selecciona un vehiculo");
        if (!f.description.trim()) return alert("Describe que se le hizo al vehiculo");
        if (!f.fecha) return alert("Indica la fecha en que se realizo");
        const rec = {
          id: uid(),
          vehicleId: f.vehicleId,
          type: f.type,
          fecha: f.fecha,
          kmAlRealizar: Number(f.kmAlRealizar) || 0,
          description: f.description.trim(),
          workshop: f.workshop.trim(),
          cost: Number(f.cost) || 0,
          proxKm: Number(f.proxKm) || null,
          proxFecha: f.proxFecha || null,
          notas: f.notas.trim(),
          createdAt: new Date().toISOString(),
        };
        const ok = await saveMaintenance(rec, f.rawLineToRemove);
        if (ok) setModal(null);
      }}>💾 Registrar mantenimiento</Btn>
    </div>
  </div>;
}

// =====================================================================
// DESPACHOS / RUTAS — constantes + form
// =====================================================================

const TIPOS_DESPACHO = [
  { value: "material_compra", label: "🛒 Material de compra", color: BRAND.blue, defaultOrigen: "", defaultDestino: "Proyecto" },
  { value: "material_plantel_proyecto", label: "📦 Material: Plantel → Proyecto", color: BRAND.orange, defaultOrigen: "Plantel", defaultDestino: "Proyecto" },
  { value: "material_proyecto_plantel", label: "📦 Material: Proyecto → Plantel", color: BRAND.purple, defaultOrigen: "Proyecto", defaultDestino: "Plantel" },
  { value: "material_proyecto_proyecto", label: "📦 Material: Proyecto → Proyecto", color: BRAND.yellow, defaultOrigen: "", defaultDestino: "" },
  { value: "personal", label: "👥 Personal", color: BRAND.green, defaultOrigen: "", defaultDestino: "" },
  { value: "equipo_maquinaria", label: "🏗️ Equipo / Maquinaria", color: BRAND.red, defaultOrigen: "", defaultDestino: "" },
  { value: "otro", label: "🚛 Otro", color: BRAND.stone, defaultOrigen: "", defaultDestino: "" },
];
const tipoDespCfg = (v) => TIPOS_DESPACHO.find(t => t.value === v) || TIPOS_DESPACHO[6];

const ESTADOS_DESPACHO = [
  { value: "pendiente", label: "📌 Por hacer", color: BRAND.orange, bgSoft: BRAND.orangeBg },
  { value: "programado", label: "📅 Programado", color: BRAND.blue, bgSoft: BRAND.blueSoft },
  { value: "en_ruta", label: "🚛 En ruta", color: BRAND.yellow, bgSoft: BRAND.yellowSoft },
  { value: "entregado", label: "✓ Entregado", color: BRAND.green, bgSoft: BRAND.greenSoft },
  { value: "cerrado", label: "🔒 Cerrado", color: BRAND.stone, bgSoft: BRAND.beigeDeep },
  { value: "cancelado", label: "✗ Cancelado", color: BRAND.red, bgSoft: BRAND.redSoft },
];
const estadoDespCfg = (v) => ESTADOS_DESPACHO.find(s => s.value === v) || ESTADOS_DESPACHO[0];

// ── FORM DE DESPACHO (nivel de modulo) ──
function DespachoFormImpl({ despacho, vehicles, allProjects, sourcePurchase, presetProjectCode, setModal, saveDespacho }) {
  const [f, setF] = useState(despacho || (() => {
    const initialTipo = sourcePurchase ? "material_compra" : "material_plantel_proyecto";
    const initialProj = sourcePurchase?.projectCode || presetProjectCode || "";
    const projObj = allProjects.find(p => p.short === initialProj);
    const tipoCfg = TIPOS_DESPACHO.find(t => t.value === initialTipo);
    return {
      source: sourcePurchase ? "compra" : "manual",
      sourcePurchaseId: sourcePurchase?.id || null,
      tipo: initialTipo,
      descripcion: sourcePurchase?.description || "",
      origen: sourcePurchase?.provider || tipoCfg?.defaultOrigen || "",
      destino: projObj ? `Proyecto ${projObj.short}` : (tipoCfg?.defaultDestino || ""),
      projectCode: initialProj,
      vehicleId: "",
      motorista: "",
      fechaNecesaria: "",  // deadline en proyecto (cuando se necesita ahi)
      fechaProgramada: "",
      estado: "pendiente",
      notas: "",
    };
  }));
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const tipoCfg = tipoDespCfg(f.tipo);
  const isEdit = !!despacho;

  // Cuando cambia el tipo, sugerir origen/destino segun preset
  const onTipoChange = (nuevoTipo) => {
    const cfg = TIPOS_DESPACHO.find(t => t.value === nuevoTipo);
    setF(p => ({
      ...p,
      tipo: nuevoTipo,
      // Solo pisamos si el origen/destino actuales estan vacios o coinciden con un preset
      origen: (!p.origen || TIPOS_DESPACHO.some(t => t.defaultOrigen === p.origen)) ? (cfg?.defaultOrigen || p.origen) : p.origen,
      destino: (!p.destino || TIPOS_DESPACHO.some(t => t.defaultDestino === p.destino)) ? (cfg?.defaultDestino || p.destino) : p.destino,
    }));
  };

  const selectedVehicle = vehicles.find(v => v.id === f.vehicleId);

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    {/* Banner si viene de Compras */}
    {sourcePurchase && !isEdit && <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}40`, borderRadius: R.md, padding: 12, fontSize: 12, color: BRAND.blue }}>
      🛒 Despacho generado desde la compra: <b>{sourcePurchase.provider}</b> — {sourcePurchase.description}
    </div>}

    {/* Tipo */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: tipoCfg.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📋 Tipo de movimiento</div>
      <Select label="Tipo *" options={TIPOS_DESPACHO} value={f.tipo} onChange={e => onTipoChange(e.target.value)} emptyLabel="—" />
    </div>

    {/* Que se mueve + proyecto */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.orange, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📦 Que se mueve y a qué proyecto</div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Textarea label="Descripcion *" value={f.descripcion} onChange={e => u("descripcion", e.target.value)} placeholder={"Ej:\n• 50 sacos de cemento\n• 4 obreros para movilizar a obra Apolo\n• Pilotadora Bauer + accesorios"} />
        <Select label="Proyecto vinculado" options={allProjects.map(p => ({ value: p.short, label: `${p.short} — ${p.name}` }))} value={f.projectCode} onChange={e => u("projectCode", e.target.value)} emptyLabel="— Sin proyecto —" />
      </div>
    </div>

    {/* Origen → Destino */}
    <div style={{ background: tipoCfg.color + "12", border: `1px solid ${tipoCfg.color}30`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: tipoCfg.color, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📍 Ruta</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 12, alignItems: "end" }}>
        <Input label="Origen *" value={f.origen} onChange={e => u("origen", e.target.value)} placeholder="De donde sale" />
        <div style={{ paddingBottom: 8, fontSize: 22, color: tipoCfg.color }}>→</div>
        <Input label="Destino *" value={f.destino} onChange={e => u("destino", e.target.value)} placeholder="A donde va" />
      </div>
    </div>

    {/* Deadline en proyecto */}
    <div style={{ background: BRAND.redSoft, border: `2px solid ${BRAND.red}40`, borderRadius: R.md, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.red, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📅 Deadline — cuando se necesita en proyecto</div>
      <Input
        label="Fecha que se necesita en proyecto"
        type="date"
        value={f.fechaNecesaria}
        onChange={e => u("fechaNecesaria", e.target.value)}
        hint="Esta fecha sirve para que logistica priorize: las mas urgentes salen primero en el kanban"
      />
    </div>

    {/* Vehiculo + motorista + fecha programada */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.blue, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🚛 Asignacion (cuando se va a hacer)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Select
          label="Vehiculo asignado"
          options={vehicles.filter(v => v.estado !== "fuera_servicio").map(v => ({ value: v.id, label: `${v.plate} — ${v.brand || ""} ${v.model || ""}` }))}
          value={f.vehicleId}
          onChange={e => u("vehicleId", e.target.value)}
          emptyLabel="— Sin asignar —"
        />
        <Input label="Motorista" value={f.motorista} onChange={e => u("motorista", e.target.value)} placeholder={selectedVehicle?.motorista || "Nombre del motorista"} />
        <Input label="Fecha programada (cuando sale el vehiculo)" type="date" value={f.fechaProgramada} onChange={e => u("fechaProgramada", e.target.value)} />
      </div>
    </div>

    {/* Estado (solo en edit) */}
    {isEdit && <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: BRAND.charcoal, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🚦 Estado actual</div>
      <Select label="Estado" options={ESTADOS_DESPACHO} value={f.estado} onChange={e => u("estado", e.target.value)} emptyLabel="—" />
    </div>}

    {/* Notas */}
    <Textarea label="Notas / Instrucciones" value={f.notas} onChange={e => u("notas", e.target.value)} placeholder="Cualquier detalle: hora, contacto en sitio, cuidados, etc." />

    {/* Botones */}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8, paddingTop: 12, borderTop: `1px solid ${BRAND.borderSoft}` }}>
      <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
      <Btn variant="success" onClick={async () => {
        if (!f.tipo || !f.descripcion.trim() || !f.origen.trim() || !f.destino.trim()) {
          return alert("Tipo, descripcion, origen y destino son obligatorios.");
        }
        const rec = {
          ...f,
          id: f.id || uid(),
          descripcion: f.descripcion.trim(),
          origen: f.origen.trim(),
          destino: f.destino.trim(),
          motorista: f.motorista.trim(),
          notas: f.notas.trim(),
          fechaNecesaria: f.fechaNecesaria || "",
          // Si tiene vehiculo + fecha programada, pasar de pendiente a programado automaticamente
          estado: f.estado === "pendiente" && f.vehicleId && f.fechaProgramada ? "programado" : f.estado,
          updatedAt: new Date().toISOString(),
          createdAt: f.createdAt || new Date().toISOString(),
        };
        const ok = await saveDespacho(rec, isEdit);
        if (ok) setModal(null);
      }}>{isEdit ? "💾 Guardar cambios" : "+ Crear despacho"}</Btn>
    </div>
  </div>;
}

// ── MINI-FORM PARA PROGRAMAR UN DESPACHO (date picker + vehiculo opcional) ──
// Sirve para 2 fuentes:
// 1) source.kind === "compra" — crea un despacho nuevo desde una compra, programado
// 2) source.kind === "despacho" — toma un despacho pendiente y lo programa con fecha
function ProgramDespachoForm({ source, vehicles, setModal, saveDespacho, quickCreateFromCompra }) {
  // Default: mañana
  const mañana = new Date();
  mañana.setDate(mañana.getDate() + 1);
  const defaultDate = mañana.toISOString().slice(0, 10);

  const [fecha, setFecha] = useState(defaultDate);
  const [vehicleId, setVehicleId] = useState(source?.kind === "despacho" ? (source.despacho.vehicleId || "") : "");
  const [motorista, setMotorista] = useState(source?.kind === "despacho" ? (source.despacho.motorista || "") : "");

  const titulo = source?.kind === "compra"
    ? `Compra: ${source.purchase.provider} → ${source.purchase.projectCode || "Proyecto"}`
    : `Despacho: ${source.despacho.descripcion?.slice(0, 60)}`;

  const selectedVeh = vehicles.find(v => v.id === vehicleId);

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ background: BRAND.blueSoft, border: `1px solid ${BRAND.blue}40`, borderRadius: R.md, padding: 12, fontSize: 12, color: BRAND.blue }}>
      {titulo}
    </div>

    <Input
      label="Fecha programada *"
      type="date"
      value={fecha}
      onChange={e => setFecha(e.target.value)}
      hint="Default: mañana. Cambia si va para otro dia."
    />

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Select
        label="Vehiculo (opcional)"
        options={vehicles.filter(v => v.estado !== "fuera_servicio").map(v => ({ value: v.id, label: `${v.plate} — ${v.brand || ""} ${v.model || ""}` }))}
        value={vehicleId}
        onChange={e => setVehicleId(e.target.value)}
        emptyLabel="— Asignar despues —"
      />
      <Input
        label="Motorista (opcional)"
        value={motorista}
        onChange={e => setMotorista(e.target.value)}
        placeholder={selectedVeh?.motorista || "Nombre del motorista"}
      />
    </div>

    <div style={{ background: BRAND.parchment, borderRadius: R.sm, padding: "8px 12px", fontSize: 11, color: BRAND.stone, fontStyle: "italic" }}>
      💡 Vehiculo y motorista son opcionales — podes asignarlos despues desde la tab "Programados".
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: `1px solid ${BRAND.borderSoft}` }}>
      <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
      <Btn variant="success" onClick={async () => {
        if (!fecha) return alert("La fecha es obligatoria");
        if (source.kind === "compra") {
          // Crear despacho nuevo desde la compra, estado=programado
          // con vehiculo y motorista en una sola operacion (extras)
          await quickCreateFromCompra(source.purchase, "programado", fecha, "", { vehicleId, motorista });
        } else {
          // Despacho existente → actualizar con fecha + vehiculo + motorista, estado=programado
          const d = source.despacho;
          const updated = {
            ...d,
            fechaProgramada: fecha,
            vehicleId: vehicleId || d.vehicleId,
            motorista: motorista || d.motorista,
            estado: "programado",
            updatedAt: new Date().toISOString(),
          };
          await saveDespacho(updated, true);
        }
        setModal(null);
      }}>📅 Programar</Btn>
    </div>
  </div>;
}

// =====================================================================
// MODULO PRINCIPAL
// =====================================================================
export default function LogisticsModule({ userRole, userName, onBack, onLogout }) {
  const isAdmin = userRole === "admin";
  const isLogistica = userRole === "logistica";
  const isRecepcion = userRole === "recepcion";
  const canEdit = isAdmin || isLogistica || isRecepcion;

  const [vehicles, setVehicles] = useState([]);
  const [maintenances, setMaintenances] = useState([]);
  const [despachos, setDespachos] = useState([]);
  const [purchases, setPurchases] = useState([]); // shared con Compras
  const [customProjects, setCustomProjects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  const [sb, setSb] = useState(true);
  const [sec, setSec] = useState("flota");
  const [filter, setFilter] = useState({ estado: "", projectCode: "", type: "", q: "" });
  const [mantSubSec, setMantSubSec] = useState("pendientes"); // pendientes | programados | historial
  const [mantFilter, setMantFilter] = useState({ vehicleId: "", type: "", from: "", to: "" });
  const [despSubSec, setDespSubSec] = useState("por_hacer"); // por_hacer | programados | historial
  const [despFilter, setDespFilter] = useState({ projectCode: "", tipo: "", vehicleId: "", q: "" });
  const [expandedHistKanban, setExpandedHistKanban] = useState({}); // { projectKey: true } para mostrar entregados de esa col
  const [expandedProgKanban, setExpandedProgKanban] = useState({}); // { projectKey: true } para mostrar programados/en ruta de esa col

  // ── Carga inicial ──
  useEffect(() => {
    (async () => {
      const [v, m, d, p, cps] = await Promise.all([
        store.get("lg-vehicles"),
        store.get("lg-maintenances"),
        store.get("lg-despachos"),
        store.get("cp-purchases"),
        store.get("cp-projects"),
      ]);
      if (Array.isArray(v)) setVehicles(v);
      if (Array.isArray(m)) setMaintenances(m);
      if (Array.isArray(d)) setDespachos(d);
      if (Array.isArray(p)) setPurchases(p);
      if (Array.isArray(cps)) setCustomProjects(cps);
      setLoaded(true);
    })();
  }, []);

  // Auto-refresh al volver a la pestaña — si Ana envio una orden mientras
  // Oscar tenia la app abierta en otra tab, al volver Oscar ve el cambio sin
  // recargar manualmente. Mucho mas barato que polling.
  useEffect(() => {
    const refreshFromCloud = async () => {
      try {
        const [d, p] = await Promise.all([
          store.get("lg-despachos"),
          store.get("cp-purchases"),
        ]);
        if (Array.isArray(d)) setDespachos(d);
        if (Array.isArray(p)) setPurchases(p);
      } catch (e) {
        console.warn("Auto-refresh fallo:", e?.message || e);
      }
    };
    const onFocus = () => refreshFromCloud();
    const onVisChange = () => { if (document.visibilityState === "visible") refreshFromCloud(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisChange);
    };
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

  // Registra un mantenimiento y actualiza el vehiculo correspondiente:
  // - Actualiza kmActual del vehiculo al maximo entre actual y kmAlRealizar.
  // - Actualiza proxMantenimientoKm/Fecha si se programo un siguiente.
  // - Si vino de un pendiente especifico (rawLineToRemove), lo quita del textarea.
  const saveMaintenance = async (rec, rawLineToRemove) => {
    const vehicle = vehicles.find(v => v.id === rec.vehicleId);
    if (!vehicle) {
      alert("No se encontro el vehiculo. Refresca la pagina e intenta de nuevo.");
      return false;
    }

    // 1) Guardar el mantenimiento
    const nextMaintenances = [...maintenances, rec];
    setMaintenances(nextMaintenances);
    await store.set("lg-maintenances", nextMaintenances);

    // 2) Actualizar el vehiculo
    const nuevoKm = Math.max(Number(vehicle.kmActual) || 0, Number(rec.kmAlRealizar) || 0);
    let pendientesActualizados = vehicle.pendientesReparacion || "";
    if (rawLineToRemove) {
      pendientesActualizados = removeLine(pendientesActualizados, rawLineToRemove);
    }
    const vehiculoActualizado = {
      ...vehicle,
      kmActual: nuevoKm,
      pendientesReparacion: pendientesActualizados,
      // Solo sobreescribir si se programo uno nuevo
      proxMantenimientoKm: rec.proxKm != null ? rec.proxKm : vehicle.proxMantenimientoKm,
      proxMantenimientoFecha: rec.proxFecha || vehicle.proxMantenimientoFecha,
      updatedAt: new Date().toISOString(),
    };
    const nextVehicles = vehicles.map(v => v.id === vehicle.id ? vehiculoActualizado : v);
    setVehicles(nextVehicles);
    await store.set("lg-vehicles", nextVehicles);

    return true;
  };

  const deleteMaintenance = async (id) => {
    const next = maintenances.filter(m => m.id !== id);
    setMaintenances(next);
    await store.set("lg-maintenances", next);
  };

  // ── Despachos ──
  // HELPER de save robusto con merge contra cloud (evita race conditions entre
  // Oscar/Jorge/Ana editando al mismo tiempo desde Macs distintas).
  //
  // mutator: funcion (cloudArr) => newArr — recibe el array MAS RECIENTE del cloud
  // mergeado con cambios locales pendientes, y devuelve el array final a guardar.
  //
  // Aplica:
  //   1) PRE-FETCH cloud
  //   2) Detecta deleted-by-local (en previousLocal pero no en next local)
  //   3) Merge: cloud + localOnly (sin los deleted), luego pasa al mutator
  //   4) Save lg-despachos
  //   5) Verifica re-fetch
  const saveDespachosWithMerge = async (mutator, opts = {}) => {
    const label = opts.label || "saveDespachosWithMerge";
    const tStart = Date.now();
    console.group(`[${label}] ${new Date().toISOString()}`);
    try {
      const cloudPrevio = await store.get("lg-despachos");
      const cloudArr = Array.isArray(cloudPrevio) ? cloudPrevio : [];
      console.log("☁️ Cloud:", cloudArr.length, "| Local previo:", despachos.length);

      // Detectar lo que se borro intencionalmente respecto al state previo
      // (para que el merge no lo resucite). Solo aplica cuando opts.deletedIds
      // viene del caller — para deletes explicitos.
      const deletedIds = new Set(opts.deletedIds || []);
      // Base = cloud (autoritativo) + cualquier local-only que NO este borrado
      const cloudIds = new Set(cloudArr.map(d => d.id));
      const localOnly = despachos.filter(d => !cloudIds.has(d.id) && !deletedIds.has(d.id));
      // Filtrar del cloud los IDs borrados intencionalmente
      const cloudVigente = cloudArr.filter(d => !deletedIds.has(d.id));
      const baseMerged = [...cloudVigente, ...localOnly];

      // Aplicar mutacion del caller
      const next = mutator(baseMerged);
      console.log("🔀 Merged + mutado:", next.length, "despachos");

      setDespachos(next);
      const ok = await store.set("lg-despachos", next);
      console.log("☁️ Save →", ok ? "OK" : "FAIL");

      let verifiedOk = ok;
      if (ok) {
        try {
          const verify = await store.get("lg-despachos");
          const verifyArr = Array.isArray(verify) ? verify : [];
          if (verifyArr.length !== next.length) {
            console.warn(`⚠️ Verify length mismatch: enviado ${next.length}, cloud devolvio ${verifyArr.length}`);
          }
        } catch (e) {
          console.warn("⚠️ Verify fallo:", e?.message || e);
        }
      }
      console.log(`⏱ ${label} en ${Date.now() - tStart}ms`);
      return ok && verifiedOk;
    } finally {
      console.groupEnd();
    }
  };

  const saveDespacho = async (rec, isEdit) => {
    // Upsert por id (replace si existe, append si no) — el flag isEdit es solo informativo.
    const ok = await saveDespachosWithMerge((base) => {
      const existe = base.find(d => d.id === rec.id);
      return existe ? base.map(d => d.id === rec.id ? rec : d) : [...base, rec];
    }, { label: `saveDespacho ${isEdit ? "edit" : "new"} ${rec.id}` });
    if (!ok) alert("⚠️ Despacho guardado localmente pero no se sincronizo a la nube. Cuando recuperes conexion, volve a guardar.");
    return true;
  };

  const updateDespachoEstado = async (id, nuevoEstado) => {
    await saveDespachosWithMerge((base) => base.map(d => d.id === id ? {
      ...d,
      estado: nuevoEstado,
      fechaEjecutada: (nuevoEstado === "entregado" || nuevoEstado === "cerrado") ? (d.fechaEjecutada || new Date().toISOString().slice(0, 10)) : d.fechaEjecutada,
      updatedAt: new Date().toISOString(),
    } : d), { label: `updateEstado ${id}->${nuevoEstado}` });
  };

  const deleteDespacho = async (id) => {
    await saveDespachosWithMerge((base) => base.filter(d => d.id !== id), {
      label: `deleteDespacho ${id}`,
      deletedIds: [id],
    });
  };

  // Quick action: crear un despacho desde una compra con un estado especifico
  // (ej: "entregado" para marcar como ya hecho sin pasar por el form completo)
  // Opciones adicionales: vehicleId, motorista, fechaNecesaria (utiles al programar)
  const quickCreateFromCompra = async (purchase, estado, fechaProg = "", fechaEjec = "", extras = {}) => {
    const proj = allProjects.find(p => p.short === purchase.projectCode);
    const rec = {
      id: uid(),
      source: "compra",
      sourcePurchaseId: purchase.id,
      tipo: "material_compra",
      descripcion: purchase.description || "",
      origen: purchase.provider || "",
      destino: proj ? `Proyecto ${proj.short}` : (purchase.projectCode || "Proyecto"),
      projectCode: purchase.projectCode || "",
      vehicleId: extras.vehicleId || "",
      motorista: extras.motorista || "",
      fechaNecesaria: extras.fechaNecesaria || "",
      fechaProgramada: fechaProg || "",
      fechaEjecutada: fechaEjec || (estado === "entregado" || estado === "cerrado" ? new Date().toISOString().slice(0, 10) : ""),
      estado,
      notas: extras.notas || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveDespachosWithMerge((base) => [...base, rec], { label: `quickCreateFromCompra ${rec.id}` });
    return rec;
  };

  // Actualizar un campo puntual de un despacho (ej: fechaNecesaria inline desde el card)
  const updateDespachoField = async (id, field, value) => {
    await saveDespachosWithMerge((base) => base.map(d => d.id === id ? { ...d, [field]: value, updatedAt: new Date().toISOString() } : d), {
      label: `updateField ${id}.${field}`,
    });
  };

  // Set fechaNecesaria en una compra (sin despacho aun) — crea un despacho hidden
  // con estado=pendiente para que la deadline persista. La compra ya no aparece en
  // la lista de comprasPendientes (porque ya tiene sourcePurchaseId), y el despacho
  // aparece en su lugar como card pendiente con la fechaNecesaria visible.
  const setFechaNecesariaCompra = async (purchase, fechaNecesaria) => {
    if (!fechaNecesaria) return;
    await quickCreateFromCompra(purchase, "pendiente", "", "", { fechaNecesaria });
  };

  // ── Subir Ficha Firmada (Jorge desde Logistica) ──────────────────────────
  // Jorge sube el PDF/imagen de la ficha firmada por el residente en obra.
  // Esto:
  //   1) Sube el archivo a cp-file-<uuid> (mismo formato que Compras)
  //   2) Actualiza la compra original: delivery.fichaFile + deliveryStatus = "ficha_adjunta"
  //   3) Guarda cp-purchases para que Ana vea la ficha firmada en su sub-seccion
  //      "Listas para cierre contable"
  // Limite duro: 2 MB (mismo que en Compras).
  const fileKeyCompra = (fileId) => `cp-file-${fileId}`;
  const uploadFichaFirmada = async (despacho, fileObj) => {
    if (!despacho?.sourcePurchaseId) {
      alert("Este despacho no esta vinculado a una compra. No se puede adjuntar ficha de recibido.");
      return false;
    }
    if (!fileObj) return false;
    if (fileObj.size > 2 * 1024 * 1024) {
      alert(`❌ El archivo pesa ${(fileObj.size / 1024 / 1024).toFixed(2)} MB.\n\nLimite maximo: 2 MB.\n\nPara reducir:\n• PDFs: https://smallpdf.com/compress-pdf\n• Fotos: exportar como JPG menor calidad`);
      return false;
    }

    try {
      // 1) Leer archivo como dataUrl
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(fileObj);
      });

      // 2) Generar fileId y subir a row separada
      const fileId = uid();
      const content = { name: fileObj.name, type: fileObj.type, size: fileObj.size, dataUrl };
      const okFile = await store.set(fileKeyCompra(fileId), content);
      if (!okFile) {
        alert("⚠️ No se pudo subir el archivo a la nube. Verifica tu conexion.");
        return false;
      }

      // 3) Pre-fetch de cp-purchases para no pisar cambios concurrentes
      const cloudPurchases = await store.get("cp-purchases");
      const arr = Array.isArray(cloudPurchases) ? cloudPurchases : purchases;
      const idx = arr.findIndex(p => p.id === despacho.sourcePurchaseId);
      if (idx === -1) {
        alert("⚠️ No se encontro la compra original. Puede haber sido borrada.");
        return false;
      }

      // 4) Actualizar la compra: delivery.fichaFile + deliveryStatus = ficha_adjunta
      const orig = arr[idx];
      const updated = {
        ...orig,
        deliveryStatus: "ficha_adjunta",
        delivery: {
          ...(orig.delivery || {}),
          fichaFile: { fileId, name: fileObj.name, type: fileObj.type, size: fileObj.size },
          fichaScanned: true,
          fichaUploadedAt: new Date().toISOString(),
          uploadedByLogistica: true,
        },
        audit: [
          ...(orig.audit || []),
          {
            ts: new Date().toISOString(),
            action: "ficha_uploaded_from_logistics",
            note: `Ficha firmada subida desde Logistica: ${fileObj.name}`,
          },
        ],
      };
      const nextPurchases = [...arr];
      nextPurchases[idx] = updated;

      // 5) Save cp-purchases
      const okSave = await store.set("cp-purchases", nextPurchases);
      if (!okSave) {
        alert("⚠️ El archivo se subio pero no se pudo enlazar a la compra. Reintenta.");
        return false;
      }

      // 6) Actualizar state local para reflejar el cambio inmediato
      setPurchases(nextPurchases);

      // 7) Marcar el despacho como "ficha_adjunta_subida" — con merge robusto
      // para no pisar updates concurrentes de Oscar/Jorge desde otra Mac.
      await saveDespachosWithMerge((base) => base.map(d => d.id === despacho.id ? {
        ...d,
        fichaRecibidoFileId: fileId,
        fichaRecibidoUploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } : d), { label: `uploadFichaFirmada-flag ${despacho.id}` });

      return true;
    } catch (err) {
      console.error("uploadFichaFirmada error:", err);
      alert("Error subiendo la ficha: " + (err?.message || err));
      return false;
    }
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
    { id: "mantenimientos", label: "Mantenimientos", icon: "🔧" },
    { id: "rutas", label: "Rutas / Despachos", icon: "🛣️" },
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

  // ── RENDER MANTENIMIENTOS ──
  const renderMantenimientos = () => {
    // 1) PENDIENTES: agregar todos los pendientes de todos los vehiculos en una sola lista
    const pendientesGlobal = [];
    vehicles.forEach(v => {
      const items = parsePendientes(v.pendientesReparacion);
      items.forEach(p => pendientesGlobal.push({ vehicle: v, pendiente: p }));
    });

    // 2) PROGRAMADOS / VENCIDOS: vehiculos con proxMantenimiento por km o fecha
    const programados = vehicles
      .map(v => {
        const kmFalta = (v.proxMantenimientoKm && v.kmActual) ? (v.proxMantenimientoKm - v.kmActual) : null;
        const diasFalta = v.proxMantenimientoFecha ? diasParaFecha(v.proxMantenimientoFecha) : null;
        // Hay algo programado si tiene km o fecha
        if (kmFalta === null && diasFalta === null) return null;
        // Calcular urgencia: el peor de los dos
        let urgencia = "ok";
        if (kmFalta !== null) {
          if (kmFalta < 0) urgencia = "vencido";
          else if (kmFalta < 500) urgencia = "critico";
          else if (kmFalta < 2000) urgencia = "advertencia";
        }
        if (diasFalta !== null) {
          if (diasFalta < 0) urgencia = "vencido";
          else if (diasFalta < 7 && urgencia === "ok") urgencia = "critico";
          else if (diasFalta < 30 && urgencia === "ok") urgencia = "advertencia";
        }
        return { vehicle: v, kmFalta, diasFalta, urgencia };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const order = { vencido: 0, critico: 1, advertencia: 2, ok: 3 };
        return order[a.urgencia] - order[b.urgencia];
      });

    // 3) HISTORIAL: con filtros
    let historial = [...maintenances];
    if (mantFilter.vehicleId) historial = historial.filter(m => m.vehicleId === mantFilter.vehicleId);
    if (mantFilter.type) historial = historial.filter(m => m.type === mantFilter.type);
    if (mantFilter.from) historial = historial.filter(m => m.fecha >= mantFilter.from);
    if (mantFilter.to) historial = historial.filter(m => m.fecha <= mantFilter.to);
    historial.sort((a, b) => b.fecha.localeCompare(a.fecha));

    // Stats
    const ahora = new Date(); ahora.setHours(0, 0, 0, 0);
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const costoMes = maintenances
      .filter(m => new Date(m.fecha + "T00:00") >= inicioMes)
      .reduce((s, m) => s + (Number(m.cost) || 0), 0);
    const costoTotal = maintenances.reduce((s, m) => s + (Number(m.cost) || 0), 0);
    const vencidos = programados.filter(p => p.urgencia === "vencido").length;
    const criticos = programados.filter(p => p.urgencia === "critico").length;

    return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard icon="🔨" label="Pendientes" value={pendientesGlobal.length} color={pendientesGlobal.length > 0 ? BRAND.orange : BRAND.stone} />
        <StatCard icon="❌" label="Mant. vencidos" value={vencidos} color={vencidos > 0 ? BRAND.red : BRAND.stone} />
        <StatCard icon="🔥" label="Mant. criticos" value={criticos} color={criticos > 0 ? BRAND.orange : BRAND.stone} />
        <StatCard icon="📜" label="Total historial" value={maintenances.length} color={BRAND.blue} />
        <StatCard icon="💰" label="Costo este mes" value={"L " + costoMes.toLocaleString("es-HN", { minimumFractionDigits: 2 })} color={BRAND.green} />
        <StatCard icon="📊" label="Costo total" value={"L " + costoTotal.toLocaleString("es-HN", { minimumFractionDigits: 2 })} color={BRAND.charcoal} />
      </div>

      {/* Sub-tabs + boton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, background: BRAND.parchment, padding: 4, borderRadius: R.md, border: `1px solid ${BRAND.borderSoft}` }}>
          {[
            { id: "pendientes", label: `🔨 Pendientes (${pendientesGlobal.length})` },
            { id: "programados", label: `🔧 Programados (${programados.length})` },
            { id: "historial", label: `📜 Historial (${maintenances.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setMantSubSec(t.id)}
              style={{
                background: mantSubSec === t.id ? BRAND.orange : "transparent",
                color: mantSubSec === t.id ? "#fff" : BRAND.graphite,
                border: "none",
                padding: "6px 14px",
                borderRadius: R.sm,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >{t.label}</button>
          ))}
        </div>
        {canEdit && <Btn variant="primary" onClick={() => setModal({ t: "maint-new" })}>+ Registrar mantenimiento</Btn>}
      </div>

      {/* PENDIENTES */}
      {mantSubSec === "pendientes" && (
        pendientesGlobal.length === 0
          ? <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 40, textAlign: "center", color: BRAND.stone }}>
              {vehicles.length === 0
                ? "Aun no hay vehiculos cargados. Anda a la pestaña Flota para empezar."
                : "✓ No hay pendientes de reparacion registrados en ningun vehiculo. Agregalos desde la ficha de cada vehiculo en la pestaña Flota."}
            </div>
          : <div style={{ background: BRAND.cream, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: BRAND.beigeDeep, borderBottom: `1px solid ${BRAND.border}` }}>
                    <th style={th}>Vehiculo</th>
                    <th style={th}>Pendiente</th>
                    <th style={th}>Estado vehiculo</th>
                    {canEdit && <th style={th}>Accion</th>}
                  </tr></thead>
                  <tbody>
                    {pendientesGlobal.map((item, i) => {
                      const v = item.vehicle;
                      const ec = estadoCfg(v.estado);
                      return <tr key={`${v.id}-${i}`} style={{ borderBottom: `1px solid ${BRAND.borderSoft}` }}>
                        <td style={{ ...td, fontFamily: FONT.mono, fontWeight: 800, color: BRAND.charcoal }}>
                          {v.plate}
                          <div style={{ fontFamily: FONT.body, fontSize: 11, color: BRAND.stone, fontWeight: 400 }}>{v.brand} {v.model}</div>
                        </td>
                        <td style={{ ...td, color: BRAND.ink }}>{item.pendiente.clean}</td>
                        <td style={td}><Badge color={ec.color} bg={ec.bgSoft}>{ec.label}</Badge></td>
                        {canEdit && <td style={{ ...td, textAlign: "right" }}>
                          <Btn small variant="success" onClick={() => setModal({ t: "maint-new", vehicleId: v.id, prefilledDesc: item.pendiente.clean, rawLine: item.pendiente.raw })}>✓ Marcar hecho</Btn>
                        </td>}
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
      )}

      {/* PROGRAMADOS */}
      {mantSubSec === "programados" && (
        programados.length === 0
          ? <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 40, textAlign: "center", color: BRAND.stone }}>
              Aun no hay mantenimientos programados. Desde la ficha de cada vehiculo podes definir cuando toca el proximo (por km o fecha).
            </div>
          : <div style={{ background: BRAND.cream, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: BRAND.beigeDeep, borderBottom: `1px solid ${BRAND.border}` }}>
                    <th style={th}>Vehiculo</th>
                    <th style={th}>Km actual</th>
                    <th style={th}>Prox. mant. (km)</th>
                    <th style={th}>Faltan km</th>
                    <th style={th}>Prox. mant. (fecha)</th>
                    <th style={th}>Faltan dias</th>
                    <th style={th}>Urgencia</th>
                    {canEdit && <th style={th}>Accion</th>}
                  </tr></thead>
                  <tbody>
                    {programados.map(item => {
                      const v = item.vehicle;
                      const colorByUrg = { vencido: BRAND.red, critico: BRAND.red, advertencia: BRAND.yellow, ok: BRAND.green };
                      const labelByUrg = { vencido: "❌ VENCIDO", critico: "🔥 CRITICO", advertencia: "⏰ Pronto", ok: "✓ OK" };
                      const c = colorByUrg[item.urgencia];
                      return <tr key={v.id} style={{ borderBottom: `1px solid ${BRAND.borderSoft}`, background: item.urgencia === "vencido" ? BRAND.redSoft : item.urgencia === "critico" ? BRAND.orangeBg : "transparent" }}>
                        <td style={{ ...td, fontFamily: FONT.mono, fontWeight: 800 }}>
                          {v.plate}
                          <div style={{ fontFamily: FONT.body, fontSize: 11, color: BRAND.stone, fontWeight: 400 }}>{v.brand} {v.model}</div>
                        </td>
                        <td style={{ ...td, textAlign: "right", fontFamily: FONT.mono }}>{(v.kmActual || 0).toLocaleString("es-HN")}</td>
                        <td style={{ ...td, textAlign: "right", fontFamily: FONT.mono }}>{v.proxMantenimientoKm ? Number(v.proxMantenimientoKm).toLocaleString("es-HN") : "—"}</td>
                        <td style={{ ...td, textAlign: "right", color: c, fontWeight: 700 }}>{item.kmFalta !== null ? (item.kmFalta < 0 ? `Atrasado ${Math.abs(item.kmFalta).toLocaleString("es-HN")}` : item.kmFalta.toLocaleString("es-HN")) : "—"}</td>
                        <td style={td}>{v.proxMantenimientoFecha ? fmtFecha(v.proxMantenimientoFecha) : "—"}</td>
                        <td style={{ ...td, color: c, fontWeight: 700 }}>{item.diasFalta !== null ? (item.diasFalta < 0 ? `Vencido ${Math.abs(item.diasFalta)}d` : `${item.diasFalta}d`) : "—"}</td>
                        <td style={td}><Badge color={c}>{labelByUrg[item.urgencia]}</Badge></td>
                        {canEdit && <td style={{ ...td, textAlign: "right" }}>
                          <Btn small variant="success" onClick={() => setModal({ t: "maint-new", vehicleId: v.id })}>✓ Realizar</Btn>
                        </td>}
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
      )}

      {/* HISTORIAL */}
      {mantSubSec === "historial" && <>
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", padding: 12, background: BRAND.parchment, borderRadius: R.md }}>
          <Select label="Vehiculo" options={vehicles.map(v => ({ value: v.id, label: v.plate }))} value={mantFilter.vehicleId} onChange={e => setMantFilter(s => ({ ...s, vehicleId: e.target.value }))} emptyLabel="Todos" />
          <Select label="Tipo" options={TIPOS_MANTENIMIENTO} value={mantFilter.type} onChange={e => setMantFilter(s => ({ ...s, type: e.target.value }))} emptyLabel="Todos" />
          <Input label="Desde" type="date" value={mantFilter.from} onChange={e => setMantFilter(s => ({ ...s, from: e.target.value }))} />
          <Input label="Hasta" type="date" value={mantFilter.to} onChange={e => setMantFilter(s => ({ ...s, to: e.target.value }))} />
          {(mantFilter.vehicleId || mantFilter.type || mantFilter.from || mantFilter.to) && <Btn small variant="ghost" onClick={() => setMantFilter({ vehicleId: "", type: "", from: "", to: "" })}>Limpiar</Btn>}
        </div>

        {historial.length === 0
          ? <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 40, textAlign: "center", color: BRAND.stone }}>
              {maintenances.length === 0
                ? "Aun no hay mantenimientos registrados. Cuando registres uno desde Pendientes o Programados, va a aparecer aqui."
                : "No hay mantenimientos que cumplan los filtros."}
            </div>
          : <div style={{ background: BRAND.cream, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: BRAND.beigeDeep, borderBottom: `1px solid ${BRAND.border}` }}>
                    <th style={th}>Fecha</th>
                    <th style={th}>Vehiculo</th>
                    <th style={th}>Tipo</th>
                    <th style={th}>Descripcion</th>
                    <th style={th}>Km</th>
                    <th style={th}>Taller</th>
                    <th style={th}>Costo</th>
                    {canEdit && <th style={th}>Accion</th>}
                  </tr></thead>
                  <tbody>
                    {historial.map(m => {
                      const v = vehicles.find(x => x.id === m.vehicleId);
                      const t = tipoMantCfg(m.type);
                      return <tr key={m.id} style={{ borderBottom: `1px solid ${BRAND.borderSoft}` }}>
                        <td style={td}>{fmtFecha(m.fecha)}</td>
                        <td style={{ ...td, fontFamily: FONT.mono, fontWeight: 700 }}>{v?.plate || "—"}</td>
                        <td style={td}><Badge color={t.color}>{t.label}</Badge></td>
                        <td style={{ ...td, maxWidth: 360 }}>{m.description}</td>
                        <td style={{ ...td, textAlign: "right", fontFamily: FONT.mono }}>{(m.kmAlRealizar || 0).toLocaleString("es-HN")}</td>
                        <td style={td}>{m.workshop || "—"}</td>
                        <td style={{ ...td, textAlign: "right", color: BRAND.green, fontWeight: 700 }}>{m.cost > 0 ? "L " + Number(m.cost).toLocaleString("es-HN", { minimumFractionDigits: 2 }) : "—"}</td>
                        {canEdit && <td style={{ ...td, textAlign: "right" }}>
                          <Btn small variant="ghost" onClick={() => { if (confirm("¿Eliminar este registro de mantenimiento?")) deleteMaintenance(m.id); }}>🗑</Btn>
                        </td>}
                      </tr>;
                    })}
                  </tbody>
                  {historial.length > 0 && <tfoot>
                    <tr style={{ background: BRAND.beigeDeep, fontWeight: 700 }}>
                      <td colSpan={6} style={{ ...td, textAlign: "right" }}>Total filtrado:</td>
                      <td style={{ ...td, textAlign: "right", color: BRAND.green }}>L {historial.reduce((s, m) => s + (Number(m.cost) || 0), 0).toLocaleString("es-HN", { minimumFractionDigits: 2 })}</td>
                      {canEdit && <td></td>}
                    </tr>
                  </tfoot>}
                </table>
              </div>
            </div>}
      </>}
    </div>;
  };

  // ── RENDER RUTAS / DESPACHOS ──
  const renderRutas = () => {
    // CAMBIO jun-2026: Logistica ya NO muestra automaticamente las compras pagadas.
    // Ahora Ana Vasquez (asistente de compras) coordina con el proveedor y CREA la
    // orden de recogida desde el modulo de Compras. La orden cae aca como un
    // despacho normal con sourcePurchaseId. Esto evita que Oscar reciba ordenes
    // sin coordinar y sin saber cuando puede ir a retirar.
    const comprasPendientes = []; // ya no se muestran auto — Ana las libera manualmente

    // Filtrar despachos
    let despFiltered = despachos.filter(d => {
      if (despFilter.projectCode && d.projectCode !== despFilter.projectCode) return false;
      if (despFilter.tipo && d.tipo !== despFilter.tipo) return false;
      if (despFilter.vehicleId && d.vehicleId !== despFilter.vehicleId) return false;
      if (despFilter.q) {
        const q = despFilter.q.toLowerCase();
        const hay = [d.descripcion, d.origen, d.destino, d.motorista, d.notas].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Agrupar despachos por sub-tab
    const enPorHacer = despFiltered.filter(d => d.estado === "pendiente");
    const enProgramados = despFiltered.filter(d => d.estado === "programado" || d.estado === "en_ruta");
    const enHistorial = despFiltered.filter(d => d.estado === "entregado" || d.estado === "cerrado" || d.estado === "cancelado");

    // Stats
    const totalPorHacer = despachos.filter(d => d.estado === "pendiente").length + comprasPendientes.length;
    const totalProgramados = despachos.filter(d => d.estado === "programado").length;
    const totalEnRuta = despachos.filter(d => d.estado === "en_ruta").length;
    const hoy = new Date().toISOString().slice(0, 10);
    const entregadosHoy = despachos.filter(d => d.estado === "entregado" && d.fechaEjecutada === hoy).length;

    // Despacho row (tabla compartida entre sub-tabs)
    const renderDespachoRow = (d) => {
      const v = vehicles.find(x => x.id === d.vehicleId);
      const proj = allProjects.find(p => p.short === d.projectCode);
      const tCfg = tipoDespCfg(d.tipo);
      const eCfg = estadoDespCfg(d.estado);
      return <tr key={d.id} onClick={() => setModal({ t: "desp-edit", d })} style={{ borderBottom: `1px solid ${BRAND.borderSoft}`, cursor: "pointer", background: d.source === "compra" ? BRAND.blueSoft + "40" : "transparent" }}>
        <td style={td}><Badge color={tCfg.color}>{tCfg.label}</Badge></td>
        <td style={{ ...td, maxWidth: 280 }}>
          <div style={{ fontSize: 13, color: BRAND.ink }}>{d.descripcion}</div>
          {d.source === "compra" && <div style={{ fontSize: 10, color: BRAND.blue, fontStyle: "italic", marginTop: 2 }}>🛒 Desde Compras</div>}
        </td>
        <td style={td}><b>{d.origen}</b> → <b>{d.destino}</b></td>
        <td style={td}>{proj ? <Badge color={BRAND.blue}>{proj.short}</Badge> : <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}</td>
        <td style={td}>{v ? <div><div style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 12 }}>{v.plate}</div><div style={{ fontSize: 10, color: BRAND.stone }}>{d.motorista || "—"}</div></div> : <span style={{ color: BRAND.stone, fontSize: 11 }}>Sin asignar</span>}</td>
        <td style={td}>{d.fechaProgramada ? fmtFecha(d.fechaProgramada) : <span style={{ color: BRAND.stone, fontSize: 11 }}>—</span>}</td>
        <td style={td}><Badge color={eCfg.color} bg={eCfg.bgSoft}>{eCfg.label}</Badge></td>
        {canEdit && <td style={{ ...td, textAlign: "right" }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            {/* Quick estado transitions */}
            {d.estado === "pendiente" && d.vehicleId && d.fechaProgramada && <Btn small variant="primary" onClick={() => updateDespachoEstado(d.id, "programado")}>📅 Programar</Btn>}
            {d.estado === "programado" && <Btn small variant="warn" onClick={() => updateDespachoEstado(d.id, "en_ruta")}>🚛 En ruta</Btn>}
            {d.estado === "en_ruta" && <Btn small variant="success" onClick={() => updateDespachoEstado(d.id, "entregado")}>✓ Entregado</Btn>}
            {d.estado === "entregado" && <Btn small variant="dark" onClick={() => updateDespachoEstado(d.id, "cerrado")}>🔒 Cerrar</Btn>}
            <Btn small variant="ghost" onClick={() => setModal({ t: "desp-edit", d })}>✏️</Btn>
          </div>
        </td>}
      </tr>;
    };

    const tableHeaders = <thead><tr style={{ background: BRAND.beigeDeep, borderBottom: `1px solid ${BRAND.border}` }}>
      <th style={th}>Tipo</th>
      <th style={th}>Descripcion</th>
      <th style={th}>Ruta</th>
      <th style={th}>Proyecto</th>
      <th style={th}>Vehiculo / Motorista</th>
      <th style={th}>Fecha prog.</th>
      <th style={th}>Estado</th>
      {canEdit && <th style={th}>Acciones</th>}
    </tr></thead>;

    return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatCard icon="📌" label="Por hacer" value={totalPorHacer} color={totalPorHacer > 0 ? BRAND.orange : BRAND.stone} />
        <StatCard icon="📅" label="Programados" value={totalProgramados} color={BRAND.blue} />
        <StatCard icon="🚛" label="En ruta" value={totalEnRuta} color={BRAND.yellow} />
        <StatCard icon="✓" label="Entregados hoy" value={entregadosHoy} color={BRAND.green} />
      </div>

      {/* Sub-tabs + boton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, background: BRAND.parchment, padding: 4, borderRadius: R.md, border: `1px solid ${BRAND.borderSoft}` }}>
          {[
            { id: "por_hacer", label: `📌 Por hacer (${enPorHacer.length})` },
            { id: "programados", label: `🚛 Programados / En ruta (${enProgramados.length})` },
            { id: "historial", label: `📜 Historial (${enHistorial.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setDespSubSec(t.id)}
              style={{
                background: despSubSec === t.id ? BRAND.orange : "transparent",
                color: despSubSec === t.id ? "#fff" : BRAND.graphite,
                border: "none",
                padding: "6px 14px",
                borderRadius: R.sm,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >{t.label}</button>
          ))}
        </div>
        {canEdit && <Btn variant="primary" onClick={() => setModal({ t: "desp-new" })}>+ Nuevo movimiento</Btn>}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", padding: 12, background: BRAND.parchment, borderRadius: R.md }}>
        <Input label="Buscar" value={despFilter.q} onChange={e => setDespFilter(s => ({ ...s, q: e.target.value }))} placeholder="descripcion, origen, destino..." />
        <Select label="Proyecto" options={allProjects.map(p => ({ value: p.short, label: p.short }))} value={despFilter.projectCode} onChange={e => setDespFilter(s => ({ ...s, projectCode: e.target.value }))} emptyLabel="Todos" />
        <Select label="Tipo" options={TIPOS_DESPACHO} value={despFilter.tipo} onChange={e => setDespFilter(s => ({ ...s, tipo: e.target.value }))} emptyLabel="Todos" />
        <Select label="Vehiculo" options={vehicles.map(v => ({ value: v.id, label: v.plate }))} value={despFilter.vehicleId} onChange={e => setDespFilter(s => ({ ...s, vehicleId: e.target.value }))} emptyLabel="Todos" />
        {(despFilter.q || despFilter.projectCode || despFilter.tipo || despFilter.vehicleId) && <Btn small variant="ghost" onClick={() => setDespFilter({ projectCode: "", tipo: "", vehicleId: "", q: "" })}>Limpiar</Btn>}
      </div>

      {/* KANBAN por proyecto — Por hacer */}
      {despSubSec === "por_hacer" && (() => {
        // Aplicar filtros tambien a las compras pendientes (q + projectCode)
        const comprasFiltered = comprasPendientes.filter(p => {
          if (despFilter.projectCode && p.projectCode !== despFilter.projectCode) return false;
          if (despFilter.q) {
            const q = despFilter.q.toLowerCase();
            const hay = [p.provider, p.description].filter(Boolean).join(" ").toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });

        // Agrupar todo por proyecto: pendientes (compras + despachos) +
        // programados/en ruta + entregados historicos. Todo dentro de la misma
        // columna del kanban con secciones colapsables.
        const grupos = {};
        const ensure = (key) => { if (!grupos[key]) grupos[key] = { compras: [], despachos: [], programados: [], entregados: [] }; };
        comprasFiltered.forEach(p => {
          const key = p.projectCode || "__sin__";
          ensure(key);
          grupos[key].compras.push(p);
        });
        enPorHacer.forEach(d => {
          const key = d.projectCode || "__sin__";
          ensure(key);
          grupos[key].despachos.push(d);
        });
        // Programados / En ruta por proyecto — en la misma columna, no en otra tab.
        // Pedido por el usuario: que vea todo el flujo del proyecto en un solo vistazo.
        enProgramados.forEach(d => {
          const key = d.projectCode || "__sin__";
          ensure(key);
          grupos[key].programados.push(d);
        });
        // Entregados historicos por proyecto (los que ya se entregaron, para visibilidad
        // del historial de cada proyecto sin tener que ir a la tab "Historial").
        enHistorial.forEach(d => {
          if (d.estado !== "entregado" && d.estado !== "cerrado") return; // cancelados no
          const key = d.projectCode || "__sin__";
          ensure(key);
          grupos[key].entregados.push(d);
        });

        // Si hay un filtro de proyecto activo, mostrar solo ese (y "Sin proyecto" si tambien matchea)
        // Si no, mostrar TODOS los proyectos con items + un boton para agregar columna vacia
        let projKeysFiltered = Object.keys(grupos);
        // Si NO hay filtro de proyecto, ademas mostrar todos los proyectos activos aunque no tengan items
        // (asi siempre tiene una columna para empezar una orden nueva en cualquier proyecto)
        if (!despFilter.projectCode) {
          allProjects.forEach(p => {
            ensure(p.short); // <— usar ensure() para incluir entregados:[] (sin esto crashea)
            if (!projKeysFiltered.includes(p.short)) projKeysFiltered.push(p.short);
          });
        }

        // Ordenar: proyectos con items pendientes primero, despues los vacios, "Sin proyecto" al final
        const projKeys = projKeysFiltered.sort((a, b) => {
          if (a === "__sin__") return 1;
          if (b === "__sin__") return -1;
          const aHas = (grupos[a]?.compras.length || 0) + (grupos[a]?.despachos.length || 0);
          const bHas = (grupos[b]?.compras.length || 0) + (grupos[b]?.despachos.length || 0);
          if (aHas !== bHas) return bHas - aHas;
          return a.localeCompare(b);
        });
        // Si una columna no tiene pendientes pero SI tiene entregados, igual la mostramos
        // (para que se vea el historial del proyecto). Ya estaba incluida arriba via allProjects.

        if (projKeys.length === 0) {
          return <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 40, textAlign: "center", color: BRAND.stone }}>
            No hay proyectos. Agrega proyectos desde el modulo de Compras → Proyectos.
          </div>;
        }

        // Estilo de boton chip para quick actions en cards
        const chipBtn = (bg, color) => ({
          background: bg,
          color,
          border: "none",
          padding: "4px 8px",
          borderRadius: R.sm,
          fontSize: 10,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        });

        // Card de COMPRA esperando transporte
        const renderCardCompra = (p) => (
          <div
            key={`c-${p.id}`}
            onClick={() => canEdit && setModal({ t: "desp-new", sourcePurchase: p })}
            style={{
              background: BRAND.cream,
              border: `1px solid ${BRAND.blue}40`,
              borderLeft: `3px solid ${BRAND.blue}`,
              borderRadius: R.sm,
              padding: "10px 12px",
              cursor: canEdit ? "pointer" : "default",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => canEdit && (e.currentTarget.style.boxShadow = BRAND.shadowSm)}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Badge color={BRAND.blue}>🛒 De compra</Badge>
              <span style={{ fontSize: 9, color: BRAND.stone, fontWeight: 700 }}>{p.status === "finalizado" ? "✓ Pagado" : "💰 Pagado"}</span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.charcoal, marginTop: 4 }}>{p.provider}</div>
            <div style={{ fontSize: 11, color: BRAND.graphite, marginTop: 2, lineHeight: 1.4 }}>{p.description}</div>

            {/* Deadline en proyecto — editable inline. Crea un despacho hidden al asignar fecha */}
            {canEdit && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${BRAND.borderSoft}` }}>
              <label style={{ fontSize: 9, color: BRAND.red, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>📅 Necesaria en proyecto</label>
              <input
                type="date"
                value=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  await setFechaNecesariaCompra(p, e.target.value);
                }}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "5px 8px",
                  border: `1px solid ${BRAND.red}50`,
                  borderRadius: R.sm,
                  fontSize: 11,
                  fontFamily: "inherit",
                  background: BRAND.cream,
                  color: BRAND.charcoal,
                }}
              />
            </div>}

            {/* Boton de descarga de ficha — para llevar al proveedor con el comprobante de transferencia */}
            <div onClick={e => e.stopPropagation()} style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${BRAND.borderSoft}` }}>
              <button
                onClick={async () => {
                  try {
                    await descargarFichaCompra(p, allProjects);
                  } catch (err) {
                    if (!err?.isStaleChunk) alert("No se pudo generar la ficha: " + (err?.message || err));
                  }
                }}
                style={{
                  width: "100%",
                  background: BRAND.charcoal,
                  color: BRAND.beige,
                  border: "none",
                  padding: "8px 10px",
                  borderRadius: R.sm,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  letterSpacing: 0.3,
                }}
                title="Descarga la Ficha de Entrega con cotizacion + comprobante de transferencia para llevar al proveedor"
              >📄 Descargar Ficha de Entrega</button>
              <div style={{ fontSize: 9, color: BRAND.stone, fontStyle: "italic", marginTop: 4, textAlign: "center", lineHeight: 1.3 }}>
                Incluye la cotizacion + comprobante de transferencia para retirar con el proveedor
              </div>
            </div>

            {canEdit && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8 }}>
              <label style={{ fontSize: 9, color: BRAND.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Cambiar estado</label>
              <select
                value="pendiente"
                onChange={async (e) => {
                  const val = e.target.value;
                  if (val === "programado") {
                    setModal({ t: "desp-program", source: { kind: "compra", purchase: p } });
                  } else if (val === "entregado") {
                    if (!confirm(`Marcar como YA ENTREGADO la compra de ${p.provider}?`)) return;
                    await quickCreateFromCompra(p, "entregado", "", new Date().toISOString().slice(0, 10));
                  }
                  // si vuelven a "pendiente" no se hace nada (ya esta pendiente)
                }}
                style={{
                  width: "100%",
                  marginTop: 4,
                  padding: "6px 10px",
                  border: `1px solid ${BRAND.borderHard}`,
                  borderRadius: R.sm,
                  fontSize: 12,
                  fontWeight: 700,
                  background: BRAND.cream,
                  color: BRAND.charcoal,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <option value="pendiente">📌 Pendiente</option>
                <option value="programado">📅 Programar...</option>
                <option value="entregado">✓ Marcar entregado</option>
              </select>
            </div>}
          </div>
        );

        // Card de DESPACHO pendiente
        const renderCardDespacho = (d) => {
          const tCfg = tipoDespCfg(d.tipo);
          const v = vehicles.find(x => x.id === d.vehicleId);
          // Si el despacho vino de una compra, buscar el purchase original
          // para poder descargar la Ficha de Entrega (cotizacion + comprobante).
          const sourcePurchase = d.sourcePurchaseId ? purchases.find(p => p.id === d.sourcePurchaseId) : null;
          return (
            <div
              key={`d-${d.id}`}
              onClick={() => canEdit && setModal({ t: "desp-edit", d })}
              style={{
                background: BRAND.cream,
                border: `1px solid ${tCfg.color}40`,
                borderLeft: `3px solid ${tCfg.color}`,
                borderRadius: R.sm,
                padding: "10px 12px",
                cursor: canEdit ? "pointer" : "default",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => canEdit && (e.currentTarget.style.boxShadow = BRAND.shadowSm)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Badge color={tCfg.color}>{tCfg.label}</Badge>
                {d.fechaProgramada && <span style={{ fontSize: 9, color: BRAND.stone, fontWeight: 700 }}>🚛 {fmtFecha(d.fechaProgramada)}</span>}
              </div>
              {d.fechaNecesaria && (() => {
                const dias = diasParaFecha(d.fechaNecesaria);
                const cBg = dias < 0 ? BRAND.red : dias <= 1 ? BRAND.red : dias <= 3 ? BRAND.orange : dias <= 7 ? BRAND.yellow : BRAND.green;
                const txt = dias < 0 ? `ATRASADO ${Math.abs(dias)}d` : dias === 0 ? "HOY" : dias === 1 ? "MAÑANA" : `en ${dias}d`;
                return <div style={{ background: cBg + "20", border: `1px solid ${cBg}50`, borderRadius: R.sm, padding: "3px 8px", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: cBg, fontWeight: 800 }}>📅 Necesaria: {fmtFecha(d.fechaNecesaria)}</span>
                  <span style={{ fontSize: 9, color: cBg, fontWeight: 800 }}>{txt}</span>
                </div>;
              })()}
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.charcoal, marginTop: 4, lineHeight: 1.3 }}>{d.descripcion}</div>
              <div style={{ fontSize: 10, color: BRAND.stone, marginTop: 4 }}>
                <b>{d.origen}</b> → <b>{d.destino}</b>
              </div>
              {(v || d.motorista) && <div style={{ fontSize: 10, color: BRAND.graphite, marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${BRAND.borderSoft}` }}>
                🚛 {v?.plate || "Sin vehiculo"} · {d.motorista || "Sin motorista"}
              </div>}

              {/* Ficha de Entrega — disponible para CUALQUIER despacho que vino de una compra
                  (pendiente o programado), no solo cards "🛒 De compra" sin despacho. */}
              {sourcePurchase && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${BRAND.borderSoft}` }}>
                <button
                  onClick={async () => {
                    try {
                      await descargarFichaCompra(sourcePurchase, allProjects);
                    } catch (err) {
                      alert("No se pudo generar la ficha: " + (err?.message || err));
                    }
                  }}
                  style={{
                    width: "100%",
                    background: BRAND.charcoal,
                    color: BRAND.beige,
                    border: "none",
                    padding: "7px 10px",
                    borderRadius: R.sm,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: 0.3,
                  }}
                  title={`Ficha de Entrega original — ${sourcePurchase.provider}`}
                >📄 Descargar Ficha de Entrega</button>
              </div>}

              {/* Fecha necesaria — editable inline. Para que vos pongas el deadline o lo cambies. */}
              {canEdit && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${BRAND.borderSoft}` }}>
                <label style={{ fontSize: 9, color: BRAND.red, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>📅 Necesaria en proyecto</label>
                <input
                  type="date"
                  value={d.fechaNecesaria || ""}
                  onChange={(e) => updateDespachoField(d.id, "fechaNecesaria", e.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "5px 8px",
                    border: `1px solid ${d.fechaNecesaria ? BRAND.red : BRAND.borderHard}`,
                    borderRadius: R.sm,
                    fontSize: 11,
                    fontFamily: "inherit",
                    background: d.fechaNecesaria ? BRAND.redSoft : BRAND.cream,
                    color: BRAND.charcoal,
                  }}
                />
              </div>}

              {canEdit && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${BRAND.borderSoft}` }}>
                <label style={{ fontSize: 9, color: BRAND.stone, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Cambiar estado</label>
                <select
                  // en_ruta lo mostramos como "programado" en el dropdown (estados unificados a pedido del usuario).
                  value={d.estado === "en_ruta" ? "programado" : d.estado}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val === d.estado) return;
                    if (val === "programado") {
                      // Si ya estaba en programado/en_ruta y se eligio "Programar" otra vez, no hacer nada
                      if (d.estado === "programado" || d.estado === "en_ruta") return;
                      setModal({ t: "desp-program", source: { kind: "despacho", despacho: d } });
                    } else if (val === "entregado") {
                      if (!confirm("¿Marcar este movimiento como YA ENTREGADO?")) return;
                      await updateDespachoEstado(d.id, "entregado");
                    } else if (val === "cancelado") {
                      if (!confirm("¿Cancelar este movimiento?")) return;
                      await updateDespachoEstado(d.id, "cancelado");
                    } else {
                      await updateDespachoEstado(d.id, val);
                    }
                  }}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "6px 10px",
                    border: `1px solid ${BRAND.borderHard}`,
                    borderRadius: R.sm,
                    fontSize: 12,
                    fontWeight: 700,
                    background: BRAND.cream,
                    color: BRAND.charcoal,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="pendiente">📌 Pendiente</option>
                  <option value="programado">📅 Programar / En ruta</option>
                  <option value="entregado">✓ Marcar entregado</option>
                  <option value="cancelado">✗ Cancelar</option>
                </select>
              </div>}
            </div>
          );
        };

        // Card de DESPACHO entregado/cerrado — MISMA estructura que pendiente pero
        // con strikethrough en texto + fondo verde soft + ficha descargable si viene de compra.
        const renderCardEntregado = (d) => {
          const tCfg = tipoDespCfg(d.tipo);
          const v = vehicles.find(x => x.id === d.vehicleId);
          const sourcePurchase = d.sourcePurchaseId ? purchases.find(p => p.id === d.sourcePurchaseId) : null;
          const strikeStyle = { textDecoration: "line-through", textDecorationColor: BRAND.green, textDecorationThickness: "2px" };
          return (
            <div
              key={`e-${d.id}`}
              onClick={() => canEdit && setModal({ t: "desp-edit", d })}
              style={{
                background: BRAND.greenSoft,
                border: `1px solid ${BRAND.green}50`,
                borderLeft: `3px solid ${BRAND.green}`,
                borderRadius: R.sm,
                padding: "10px 12px",
                cursor: canEdit ? "pointer" : "default",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => canEdit && (e.currentTarget.style.boxShadow = BRAND.shadowSm)}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Badge color={BRAND.green}>✓ {d.estado === "cerrado" ? "Cerrado" : "Entregado"}</Badge>
                {d.fechaEjecutada && <span style={{ fontSize: 9, color: BRAND.green, fontWeight: 700 }}>📅 {fmtFecha(d.fechaEjecutada)}</span>}
              </div>
              {sourcePurchase && <div style={{ fontSize: 10, color: BRAND.blue, marginBottom: 4 }}>🛒 De compra · {sourcePurchase.provider}</div>}
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.charcoal, marginTop: 4, lineHeight: 1.3, ...strikeStyle }}>{d.descripcion}</div>
              <div style={{ fontSize: 10, color: BRAND.stone, marginTop: 4, ...strikeStyle }}>
                <b>{d.origen}</b> → <b>{d.destino}</b>
              </div>
              {(v || d.motorista) && <div style={{ fontSize: 10, color: BRAND.graphite, marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${BRAND.green}30` }}>
                🚛 {v?.plate || "Sin vehiculo"} · {d.motorista || "Sin motorista"}
              </div>}

              {/* Boton descargar ficha si viene de compra — aun en entregados es util tener acceso */}
              {sourcePurchase && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${BRAND.green}30` }}>
                <button
                  onClick={async () => {
                    try {
                      await descargarFichaCompra(sourcePurchase, allProjects);
                    } catch (err) {
                      alert("No se pudo generar la ficha: " + (err?.message || err));
                    }
                  }}
                  style={{
                    width: "100%",
                    background: BRAND.charcoal,
                    color: BRAND.beige,
                    border: "none",
                    padding: "6px 10px",
                    borderRadius: R.sm,
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                  title="Re-descargar la Ficha de Entrega en blanco (para reimprimir si la perdio el motorista)"
                >🖨 Imprimir Ficha en Blanco</button>
              </div>}

              {/* SUBIR FICHA FIRMADA (Jorge) — solo si viene de compra y aun no se subio */}
              {sourcePurchase && !sourcePurchase.delivery?.fichaFile && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${BRAND.orange}50` }}>
                <label style={{ display: "block", fontSize: 9, color: BRAND.orange, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                  📎 Subir ficha firmada
                </label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  id={`ficha-firmada-${d.id}`}
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    e.target.value = "";
                    const ok = await uploadFichaFirmada(d, f);
                    if (ok) {
                      alert("✓ Ficha firmada subida y enlazada a la compra.\nAna ya puede verla en su sub-seccion 'Listas para cierre contable'.");
                    }
                  }}
                />
                <label
                  htmlFor={`ficha-firmada-${d.id}`}
                  style={{
                    display: "block",
                    width: "100%",
                    background: BRAND.orange,
                    color: "#fff",
                    border: "none",
                    padding: "8px 10px",
                    borderRadius: R.sm,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "center",
                    boxSizing: "border-box",
                  }}
                  title="Sube el PDF/foto de la ficha que el residente firmo en obra"
                >📎 Subir ficha firmada</label>
                <div style={{ fontSize: 9, color: BRAND.stone, marginTop: 4, fontStyle: "italic" }}>
                  Al subir, se enlaza automaticamente a la compra y Ana podra cerrar contable.
                </div>
              </div>}

              {/* FICHA YA SUBIDA — mostrar estado verde + boton ver */}
              {sourcePurchase?.delivery?.fichaFile && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${BRAND.green}50`, background: BRAND.greenSoft, borderRadius: R.sm, padding: 8 }}>
                <div style={{ fontSize: 10, color: BRAND.green, fontWeight: 800, marginBottom: 4 }}>
                  ✓ Ficha firmada adjunta
                </div>
                <div style={{ fontSize: 10, color: BRAND.graphite, marginBottom: 6, wordBreak: "break-word" }}>
                  {sourcePurchase.delivery.fichaFile.name}
                </div>
                <button
                  onClick={async () => {
                    // Cargar el archivo y abrirlo en nueva pestaña
                    try {
                      const ref = sourcePurchase.delivery.fichaFile;
                      const full = await store.get(`cp-file-${ref.fileId}`);
                      if (!full?.dataUrl) {
                        alert("No se pudo cargar el archivo desde la nube.");
                        return;
                      }
                      const w = window.open();
                      if (w) {
                        w.document.write(
                          full.type === "application/pdf"
                            ? `<iframe src='${full.dataUrl}' style='width:100vw;height:100vh;border:none'></iframe>`
                            : `<img src='${full.dataUrl}' style='max-width:100vw;max-height:100vh'/>`
                        );
                      }
                    } catch (err) {
                      alert("Error abriendo ficha: " + (err?.message || err));
                    }
                  }}
                  style={{
                    width: "100%",
                    background: BRAND.green,
                    color: "#fff",
                    border: "none",
                    padding: "6px 10px",
                    borderRadius: R.sm,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >👁 Ver ficha firmada</button>
              </div>}

              {/* Dropdown para revertir si fue un error marcar entregado */}
              {canEdit && <div onClick={e => e.stopPropagation()} style={{ marginTop: 8, paddingTop: 6, borderTop: `1px dashed ${BRAND.green}30` }}>
                <label style={{ fontSize: 9, color: BRAND.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Cambiar estado</label>
                <select
                  value={d.estado}
                  onChange={async (e) => {
                    const val = e.target.value;
                    if (val === d.estado) return;
                    if (val === "pendiente" || val === "programado") {
                      if (!confirm("¿Revertir a " + (val === "pendiente" ? "pendiente" : "programado") + "?")) return;
                    }
                    await updateDespachoEstado(d.id, val);
                  }}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "5px 8px",
                    border: `1px solid ${BRAND.green}50`,
                    borderRadius: R.sm,
                    fontSize: 11,
                    fontWeight: 700,
                    background: BRAND.cream,
                    color: BRAND.charcoal,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="entregado">✓ Entregado</option>
                  <option value="cerrado">🔒 Cerrado</option>
                  <option value="pendiente">📌 Revertir a pendiente</option>
                  <option value="programado">📅 Revertir a programado</option>
                </select>
              </div>}
            </div>
          );
        };

        return <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "4px 4px 12px 4px" }}>
          {projKeys.map(key => {
            const raw = grupos[key] || {};
            const items = {
              compras: raw.compras || [],
              despachos: raw.despachos || [],
              programados: raw.programados || [],
              entregados: raw.entregados || [],
            };
            const proj = allProjects.find(p => p.short === key);
            const total = items.compras.length + items.despachos.length;
            const totalProg = items.programados.length;
            const totalHist = items.entregados.length;
            const progExpanded = expandedProgKanban[key] !== false; // default expandido (queremos que se vea)
            const isEmpty = total === 0;
            const isExpanded = expandedHistKanban[key] === true;
            const headerColor = key === "__sin__" ? BRAND.stone : BRAND.blue;
            return (
              <div key={key} style={{
                minWidth: 280,
                maxWidth: 320,
                flex: "0 0 auto",
                background: isEmpty ? BRAND.beigeLight : BRAND.parchment,
                borderRadius: R.md,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                border: `1px solid ${BRAND.borderSoft}`,
                opacity: isEmpty && totalProg === 0 && totalHist === 0 ? 0.7 : 1,
              }}>
                <div style={{ borderBottom: `2px solid ${headerColor}`, paddingBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: BRAND.charcoal, fontFamily: FONT.mono, letterSpacing: 0.5 }}>
                      {key === "__sin__" ? "SIN PROYECTO" : key}
                    </div>
                    <Badge color={total > 0 ? BRAND.orange : BRAND.stone}>{total}</Badge>
                  </div>
                  {proj && <div style={{ fontSize: 10, color: BRAND.stone, marginTop: 3, lineHeight: 1.3 }}>{proj.name}</div>}
                  {canEdit && <Btn small variant={total > 0 ? "primary" : "ghost"} onClick={() => setModal({ t: "desp-new", presetProjectCode: key === "__sin__" ? "" : key })} style={{ marginTop: 8, width: "100%", padding: "6px 10px" }}>
                    + Nueva orden
                  </Btn>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 560, overflowY: "auto" }}>
                  {/* Cards mezcladas y ordenadas: las con fechaNecesaria mas urgente arriba.
                      Compras sin despacho (sin fechaNecesaria) van al final. */}
                  {(() => {
                    const mezclado = [
                      ...items.compras.map(p => ({ kind: "compra", data: p, sortKey: "9999-12-30" })), // sin fecha → al final
                      ...items.despachos.map(d => ({ kind: "despacho", data: d, sortKey: d.fechaNecesaria || d.fechaProgramada || "9999-12-31" })),
                    ];
                    mezclado.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
                    return mezclado.map(item =>
                      item.kind === "compra" ? renderCardCompra(item.data) : renderCardDespacho(item.data)
                    );
                  })()}
                  {isEmpty && totalProg === 0 && totalHist === 0 && <div style={{ fontSize: 11, color: BRAND.stone, fontStyle: "italic", textAlign: "center", padding: "20px 4px" }}>
                    Sin movimientos pendientes
                  </div>}

                  {/* Seccion colapsable de Programados / En ruta — entre pendientes y entregados */}
                  {totalProg > 0 && <>
                    <button
                      onClick={() => setExpandedProgKanban(s => ({ ...s, [key]: !(s[key] !== false) }))}
                      style={{
                        marginTop: total > 0 ? 12 : 0,
                        padding: "8px 10px",
                        background: BRAND.blueSoft,
                        border: `1px solid ${BRAND.blue}40`,
                        borderRadius: R.sm,
                        color: BRAND.blue,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>📅 Programados / En ruta ({totalProg})</span>
                      <span style={{ fontSize: 10 }}>{progExpanded ? "▾ ocultar" : "▸ mostrar"}</span>
                    </button>
                    {progExpanded && <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                      {items.programados
                        .sort((a, b) => (a.fechaProgramada || "9999").localeCompare(b.fechaProgramada || "9999"))
                        .map(renderCardDespacho)}
                    </div>}
                  </>}

                  {/* Seccion colapsable de Entregados (historial del proyecto) */}
                  {totalHist > 0 && <>
                    <button
                      onClick={() => setExpandedHistKanban(s => ({ ...s, [key]: !s[key] }))}
                      style={{
                        marginTop: total > 0 ? 12 : 0,
                        padding: "8px 10px",
                        background: BRAND.greenSoft,
                        border: `1px solid ${BRAND.green}40`,
                        borderRadius: R.sm,
                        color: BRAND.green,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>📜 Entregados ({totalHist})</span>
                      <span style={{ fontSize: 10 }}>{isExpanded ? "▾ ocultar" : "▸ mostrar"}</span>
                    </button>
                    {isExpanded && <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 4 }}>
                      {items.entregados
                        .sort((a, b) => (b.fechaEjecutada || b.updatedAt || "").localeCompare(a.fechaEjecutada || a.updatedAt || ""))
                        .map(renderCardEntregado)}
                    </div>}
                  </>}
                </div>
              </div>
            );
          })}
        </div>;
      })()}

      {despSubSec === "programados" && (
        enProgramados.length === 0
          ? <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 40, textAlign: "center", color: BRAND.stone }}>
              No hay despachos programados ni en ruta que cumplan los filtros.
            </div>
          : <div style={{ background: BRAND.cream, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  {tableHeaders}
                  <tbody>{enProgramados.sort((a, b) => (a.fechaProgramada || "9999").localeCompare(b.fechaProgramada || "9999")).map(renderDespachoRow)}</tbody>
                </table>
              </div>
            </div>
      )}

      {despSubSec === "historial" && (
        enHistorial.length === 0
          ? <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 40, textAlign: "center", color: BRAND.stone }}>
              {despachos.length === 0
                ? "Aun no hay despachos en historial. Cuando se entreguen o cierren los despachos, van a aparecer aqui."
                : "No hay registros en el historial que cumplan los filtros."}
            </div>
          : <div style={{ background: BRAND.cream, border: `1px solid ${BRAND.borderSoft}`, borderRadius: R.lg, overflow: "hidden", boxShadow: BRAND.shadowSm }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  {tableHeaders}
                  <tbody>{enHistorial.sort((a, b) => (b.fechaEjecutada || b.updatedAt || "").localeCompare(a.fechaEjecutada || a.updatedAt || "")).map(renderDespachoRow)}</tbody>
                </table>
              </div>
            </div>
      )}
    </div>;
  };

  // ── RENDER PLACEHOLDER ──
  const renderPlaceholder = (label, desc) => <div style={{ background: BRAND.parchment, border: `1px dashed ${BRAND.border}`, borderRadius: R.lg, padding: 60, textAlign: "center" }}>
    <div style={{ fontSize: 48, marginBottom: 14 }}>🚧</div>
    <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.charcoal, marginBottom: 6 }}>{label} — proximamente</div>
    <div style={{ fontSize: 13, color: BRAND.stone, maxWidth: 500, margin: "0 auto" }}>{desc}</div>
  </div>;

  const renderSec = () => {
    if (sec === "flota") return renderFlota();
    if (sec === "mantenimientos") return renderMantenimientos();
    if (sec === "rutas") return renderRutas();
    if (sec === "motoristas") return renderPlaceholder("Motoristas", "Registro del personal de manejo con disponibilidad, licencia y vehiculos asignados.");
    return null;
  };

  // ── MODAL SWITCH ──
  const renderModal = () => {
    if (!modal) return null;
    if (modal.t === "new") return <Modal title="Nuevo vehiculo" onClose={() => setModal(null)} wide><VehicleFormImpl allProjects={allProjects} setModal={setModal} saveVehicle={saveVehicle} /></Modal>;
    if (modal.t === "edit") return <Modal title={`Editar vehiculo — ${modal.d.plate}`} onClose={() => setModal(null)} wide><VehicleFormImpl vehicle={modal.d} allProjects={allProjects} setModal={setModal} saveVehicle={saveVehicle} /></Modal>;
    if (modal.t === "detail") return <Modal title={`Vehiculo — ${modal.d.plate}`} onClose={() => setModal(null)} wide><VehicleDetailImpl vehicle={modal.d} allProjects={allProjects} setModal={setModal} deleteVehicle={deleteVehicle} /></Modal>;
    if (modal.t === "maint-new") {
      const v = modal.vehicleId ? vehicles.find(x => x.id === modal.vehicleId) : null;
      return <Modal title="Registrar mantenimiento" onClose={() => setModal(null)} wide>
        <MaintenanceFormImpl
          vehicle={v}
          vehicles={vehicles}
          prefilledDescription={modal.prefilledDesc || ""}
          prefilledRawLine={modal.rawLine || null}
          setModal={setModal}
          saveMaintenance={saveMaintenance}
        />
      </Modal>;
    }
    if (modal.t === "desp-new") return <Modal title="Nuevo movimiento / despacho" onClose={() => setModal(null)} wide>
      <DespachoFormImpl
        vehicles={vehicles}
        allProjects={allProjects}
        sourcePurchase={modal.sourcePurchase || null}
        presetProjectCode={modal.presetProjectCode || null}
        setModal={setModal}
        saveDespacho={saveDespacho}
      />
    </Modal>;
    if (modal.t === "desp-edit") return <Modal title={`Editar despacho — ${modal.d.descripcion?.slice(0, 50) || ""}`} onClose={() => setModal(null)} wide>
      <DespachoFormImpl
        despacho={modal.d}
        vehicles={vehicles}
        allProjects={allProjects}
        setModal={setModal}
        saveDespacho={saveDespacho}
      />
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${BRAND.borderSoft}`, textAlign: "right" }}>
        {canEdit && <Btn small variant="danger" onClick={() => { if (confirm("¿Eliminar este despacho?")) { deleteDespacho(modal.d.id); setModal(null); } }}>🗑 Eliminar despacho</Btn>}
      </div>
    </Modal>;
    if (modal.t === "desp-program") return <Modal title="📅 Programar despacho" onClose={() => setModal(null)}>
      <ProgramDespachoForm
        source={modal.source}
        vehicles={vehicles}
        setModal={setModal}
        saveDespacho={saveDespacho}
        quickCreateFromCompra={quickCreateFromCompra}
      />
    </Modal>;
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
