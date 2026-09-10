// ═══════════════════════════════════════════════════════════════════════════
// GeoCost — primitivas de UI compartidas (9-sep-2026).
// Viven a NIVEL DE MÓDULO a propósito: un componente definido dentro de otro
// se remonta en cada render del padre y pierde su estado (lección de HE y
// de los forms de GeoSafety). Estilo del rediseño (gt-ui.js): vidrio, poco
// texto, paleta blanco/gris/naranja/carbón + semáforo suave.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";

export const ORANGE = "#E8762D";
export const ORANGE_DARK = "#C75F1F";
export const CHARCOAL = "#2C2A28";

// Semáforo suave (mismos pares que GeoShopping — 3-sep-2026)
export const C_GRIS     = { color: "#6E6862", bg: "rgba(44,42,40,.06)" };
export const C_VERDE    = { color: "#177243", bg: "#DCF3E4" };
export const C_AZUL     = { color: "#1D5FAF", bg: "#DDE9FA" };
export const C_AMARILLO = { color: "#8A5A00", bg: "#FBEFC4" };
export const C_NARANJA  = { color: "#A94E16", bg: "rgba(232,118,45,.14)" };

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

export const prefiereMenosMovimiento = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

// ── Formato ──
const nf2 = (n) => Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = (n) => Number(n || 0).toLocaleString("es-HN", { maximumFractionDigits: 0 });
export const fmtUSD = (n) => `$ ${nf2(n)}`;
export const fmtL = (n) => `L ${nf2(n)}`;
// Versión corta para tarjetas: $ 175,075 (sin decimales)
export const fmtUSD0 = (n) => `$ ${nf0(n)}`;
export const fmtL0 = (n) => `L ${nf0(n)}`;
export const fmtPct = (p) => `${Math.round((Number(p) || 0) * 100)} %`;
// Fechas "YYYY-MM-DD" o ISO → "9 sep 2026". Las fechas PURAS se formatean en
// UTC para que no corran un día: 'YYYY-MM-DD' y también los ISO de medianoche
// UTC (paidAt de GeoShopping/GeoMachinery es `new Date(paymentDate).toISOString()`
// = T00:00:00.000Z; en Honduras salía el día ANTERIOR — revisión adversarial
// 9-sep). validatedAt/createdAt (timestamps reales) siguen en hora local.
export const fmtFecha = (d) => {
  if (!d) return "—";
  const s = String(d);
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const puro = soloDia || /^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?Z$/.test(s);
  const dt = soloDia ? new Date(s + "T00:00:00Z") : new Date(s);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("es-HN", { day: "numeric", month: "short", year: "numeric", timeZone: puro ? "UTC" : undefined });
};
export const fmtFechaHora = (d) => d ? new Date(d).toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── Controles ──
const CTRL = { padding: "10px 12px", border: "1px solid rgba(44,42,40,.12)", borderRadius: 12, fontSize: 14, outline: "none", background: "#F4F4F2", color: CHARCOAL, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const LABEL = { fontSize: 11, fontWeight: 700, color: "#6E6862", letterSpacing: ".02em" };

export const Input = ({ label, hint, style: sx, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
  {label && <label style={LABEL}>{label}{hint && <span style={{ fontWeight: 500, color: "#A39C92", marginLeft: 6 }}>{hint}</span>}</label>}
  <input style={{ ...CTRL, ...sx }} {...p} />
</div>;

export const Textarea = ({ label, style: sx, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
  {label && <label style={LABEL}>{label}</label>}
  <textarea style={{ ...CTRL, resize: "vertical", minHeight: 64, ...sx }} {...p} />
</div>;

// options: ["a","b"] | [{value,label}] | [{group, options:[...]}]
export const Select = ({ label, options = [], emptyLabel = "—", style: sx, ...p }) => {
  const opt = (o) => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    {label && <label style={LABEL}>{label}</label>}
    <select style={{ ...CTRL, ...sx }} {...p}>
      <option value="">{emptyLabel}</option>
      {options.map((o, i) => o && o.group ? <optgroup key={o.group + i} label={o.group}>{(o.options || []).map(opt)}</optgroup> : opt(o))}
    </select>
  </div>;
};

export const Btn = ({ children, onClick, variant = "primary", small, style: sx, disabled, type, title }) => {
  const b = { border: "none", borderRadius: 999, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontSize: small ? 12 : 13.5, padding: small ? "7px 14px" : "10px 20px", opacity: disabled ? 0.5 : 1, fontFamily: "inherit", letterSpacing: 0.1, display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" };
  const v = {
    primary: { ...b, background: ORANGE, color: "#fff", boxShadow: "0 4px 14px rgba(232,118,45,.28)" },
    dark:    { ...b, background: CHARCOAL, color: "#fff" },
    ghost:   { ...b, background: "rgba(44,42,40,.05)", color: "#5C5853", border: "1px solid rgba(44,42,40,.10)" },
    success: { ...b, background: C_VERDE.bg, color: C_VERDE.color, border: "1px solid rgba(23,114,67,.18)" },
    info:    { ...b, background: C_AZUL.bg, color: C_AZUL.color, border: "1px solid rgba(29,95,175,.18)" },
    danger:  { ...b, background: "rgba(192,57,43,.06)", color: "#B03024", border: "1px solid rgba(192,57,43,.25)" },
  };
  return <button type={type || "button"} title={title} style={{ ...(v[variant] || v.primary), ...sx }} onClick={onClick} disabled={disabled}>{children}</button>;
};

export const Chip = ({ children, c = C_GRIS, style: sx, title }) => <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: c.color, background: c.bg, whiteSpace: "nowrap", ...sx }}>{children}</span>;

// `fondoCierra`: si es false, el click en el fondo NO cierra — solo la ✕ / Cancelar.
// Los forms largos (PresupuestoForm, MovilizacionForm) lo apagan: un click fuera
// del panel tiraba las 14 partidas tipeadas sin confirm (revisión adversarial 9-sep).
export const Modal = ({ title, onClose, children, wide, size, fondoCierra = true }) => <div style={{ position: "fixed", inset: 0, background: "rgba(44,42,40,.38)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 12 }} onClick={fondoCierra ? onClose : undefined}>
  <div style={{ background: "#fff", borderRadius: 22, padding: "24px 26px", width: size === "xl" ? "96vw" : wide ? "min(980px, 94vw)" : 600, maxWidth: "98vw", maxHeight: "94vh", overflowY: "auto", boxShadow: "0 24px 70px rgba(44,42,40,.28)", color: CHARCOAL }} onClick={e => e.stopPropagation()}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12 }}>
      <h3 style={{ margin: 0, font: "800 19px/1.2 var(--display)", letterSpacing: "-.01em" }}>{title}</h3>
      <button onClick={onClose} aria-label="Cerrar" style={{ background: "rgba(44,42,40,.05)", border: "none", width: 34, height: 34, borderRadius: "50%", fontSize: 16, cursor: "pointer", color: "#6E6862" }}>✕</button>
    </div>
    {children}
  </div>
</div>;

// Tarjeta de vidrio con padding estándar
export const Vidrio = ({ children, style: sx, className = "", ...p }) => <div className={`gt-vidrio ${className}`.trim()} style={{ padding: 20, ...sx }} {...p}>{children}</div>;

// Etiqueta chiquita mono (encabezados de tarjeta)
export const Label = ({ children, style: sx }) => <div className="gt-label" style={{ color: "var(--text-3)", ...sx }}>{children}</div>;

// Semáforo de una partida/proyecto según % usado (comprometido + ejecutado)
export const semaforoDe = (pct) => pct > 1 ? "sobregiro" : pct >= 0.8 ? "alerta" : "ok";
export const SEMAFORO = {
  ok:        { label: "En rango",   ...C_GRIS },
  alerta:    { label: "80 % +",     ...C_NARANJA },
  sobregiro: { label: "Sobregiro",  color: "#fff", bg: ORANGE_DARK },
};
