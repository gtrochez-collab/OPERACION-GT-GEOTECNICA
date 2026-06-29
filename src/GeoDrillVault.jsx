// =====================================================================
// GEODRILL VAULT — Bodega de alto valor (picas, portapicas, muelas, herramientas)
// =====================================================================
// Modulo de inventario para Grupo Geotecnica. Maneja cajas con codigos
// QR escaneables, herramientas de perforacion y movimientos (entradas/salidas).
//
// Storage keys (en Supabase via store):
//   - gdv-items      : cajas (picas, portapicas, muelas, puerta muelas)
//   - gdv-tools      : herramientas (buckets, brocas, rompebolones)
//   - gdv-movements  : historial de movimientos
//   - gdv-min-stock  : stock minimo por categoria
//   - cp-file-<id>   : fotos (reutiliza el storage de archivos existente)
//
// Roles habilitados: admin, tesoreria, almacenista. Todos con CRUD completo.
// =====================================================================

import { useState, useEffect, useRef } from "react";
import QrScanner from "qr-scanner";
import { store } from "./supabase.js";
import Logo from "./Logo.jsx";
import { BRAND, FONT, R } from "./theme.js";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";

// ── Hook responsive ──
// Devuelve true cuando el viewport es < breakpoint px. Solo se usa en este modulo:
// el resto de la app es desktop-only, GeoDrill Vault tambien se opera desde celular
// (almacenista escaneando QRs en la bodega).
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

// ── Paleta del modulo ──
const VAULT_BLUE = "#0F4C75";
const VAULT_BLUE_DARK = "#0B3A5C";
const BEIGE = BRAND.beige;
const CREAM = BRAND.cream;
const DARK_BG = BRAND.darkBg;
const DARK_BORDER = BRAND.darkBorder;
const CHARCOAL = BRAND.charcoal;
const BORDER = BRAND.border;

// ── Constantes de dominio ──
const MARCAS = ["Jeffry Machine", "Drill Master", "Well Equips", "Otro"];
const TIPOS_ITEM = [
  { value: "pica",             label: "Pica",                       initials: "P"  },
  { value: "portapica",        label: "Portapica",                  initials: "PP" },
  { value: "muela_encamisado", label: "Muela de encamisado",        initials: "M"  },
  { value: "puerta_muela",     label: "Puerta muela de encamisado", initials: "PM" },
];
const TAMANOS = ["jumbo", "mediana", "pequena"];
const TIPOS_HERRAMIENTA = ["bucket", "broca", "rompebolon"];
const ESTADOS_HERRAMIENTA = ["operativa", "reparacion", "fuera_servicio"];
const MARCA_INICIALES = {
  "Jeffry Machine": "JM",
  "Drill Master":   "DM",
  "Well Equips":    "WE",
  "Otro":           "OT",
};

// Paleta por marca — colores corporativos aproximados para hacer el placeholder
// reconocible aun sin foto. Los colores se usan en el SVG y en la banda de marca.
const MARCA_PALETTE = {
  "Drill Master":   { primary: "#DC2626", dark: "#7F1D1D", soft: "#FEE2E2", label: "DRILLMASTER" },
  "Jeffry Machine": { primary: "#1E40AF", dark: "#1E3A8A", soft: "#DBEAFE", label: "JEFFRY MACHINE" },
  "Well Equips":    { primary: "#047857", dark: "#064E3B", soft: "#D1FAE5", label: "WELL EQUIPS" },
  "Otro":           { primary: "#475569", dark: "#1E293B", soft: "#F1F5F9", label: "GENERICO" },
};

// SVGs ilustrativos por tipo. Devuelven JSX que escala con el contenedor.
// Diseñados para verse claramente sin perder el caracter industrial.
const TipoSVG = {
  // Pica: forma real de domo/bullet con botones de carburo redondos.
  // No es piochita puntiaguda — es un cuerpo conico redondeado con multiples
  // botones de carburo de tungsteno que rompen la roca.
  pica: ({ color, dark }) => {
    // Helper para dibujar un boton de carburo 3D (3 capas: sombra, color, brillo)
    const Btn = ({ cx, cy, r = 5.5 }) => (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={dark} />
        <circle cx={cx} cy={cy - 0.5} r={r - 2} fill={color} opacity="0.55" />
        <circle cx={cx - r * 0.3} cy={cy - r * 0.4} r={r * 0.3} fill="#fff" opacity="0.55" />
      </g>
    );
    return (
      <svg viewBox="0 0 100 140" style={{ width: "100%", height: "100%", maxHeight: "100%", display: "block" }} preserveAspectRatio="xMidYMid meet">
        {/* Sombra base */}
        <ellipse cx="50" cy="130" rx="32" ry="4" fill="#000" opacity="0.18" />

        {/* Cuerpo bullet/domo — tope redondeado, base ancha */}
        <path
          d="M 22 112
             C 22 75, 28 35, 50 16
             C 72 35, 78 75, 78 112
             Z"
          fill={color}
          stroke={dark}
          strokeWidth="1.5"
        />

        {/* Sombreado del lado derecho (volumen 3D) */}
        <path
          d="M 50 16
             C 72 35, 78 75, 78 112
             L 62 112
             C 66 75, 62 42, 50 22
             Z"
          fill="#000"
          opacity="0.13"
        />

        {/* Highlight izquierdo (brillo metalico) */}
        <path
          d="M 32 95 C 28 65, 34 38, 44 22"
          stroke="#fff"
          strokeWidth="2.5"
          opacity="0.35"
          fill="none"
          strokeLinecap="round"
        />

        {/* Botones de carburo — patron real de pica de perforacion */}
        {/* Apex */}
        <Btn cx={50} cy={32} r={5} />
        {/* Anillo 1 (justo bajo el apex) */}
        <Btn cx={37} cy={48} r={5} />
        <Btn cx={63} cy={48} r={5} />
        {/* Anillo 2 (medio) */}
        <Btn cx={28} cy={68} r={5.5} />
        <Btn cx={50} cy={64} r={5.5} />
        <Btn cx={72} cy={68} r={5.5} />
        {/* Anillo 3 (bajo) */}
        <Btn cx={27} cy={91} r={5.5} />
        <Btn cx={50} cy={88} r={5.5} />
        <Btn cx={73} cy={91} r={5.5} />

        {/* Collar/base con roscas */}
        <rect x="22" y="110" width="56" height="16" rx="2.5" fill={dark} />
        <line x1="24" y1="115" x2="76" y2="115" stroke={color} strokeWidth="0.7" opacity="0.5" />
        <line x1="24" y1="119" x2="76" y2="119" stroke={color} strokeWidth="0.7" opacity="0.5" />
        <line x1="24" y1="123" x2="76" y2="123" stroke={color} strokeWidth="0.7" opacity="0.5" />
      </svg>
    );
  },
  portapica: ({ color, dark }) => (
    <svg viewBox="0 0 100 140" style={{ width: "100%", height: "100%", maxHeight: "100%", display: "block" }} preserveAspectRatio="xMidYMid meet">
      <ellipse cx="50" cy="128" rx="32" ry="4" fill="#000" opacity="0.15" />
      {/* Boca superior (hueco donde entra la pica) */}
      <ellipse cx="50" cy="22" rx="20" ry="6" fill={dark} />
      <ellipse cx="50" cy="22" rx="14" ry="4" fill="#0a0a0a" />
      {/* Cuerpo cilindrico */}
      <path d="M 30 22 L 30 116 Q 50 124 70 116 L 70 22 Z" fill={color} stroke={dark} strokeWidth="1.5" />
      {/* Reflejo lateral */}
      <path d="M 33 26 L 33 114 Q 37 116 38 116 L 38 26 Z" fill="#fff" opacity="0.3" />
      {/* Bandas estructurales */}
      <line x1="30" y1="55" x2="70" y2="55" stroke={dark} strokeWidth="1.5" opacity="0.7" />
      <line x1="30" y1="90" x2="70" y2="90" stroke={dark} strokeWidth="1.5" opacity="0.7" />
      {/* Base */}
      <ellipse cx="50" cy="120" rx="20" ry="5" fill={dark} />
    </svg>
  ),
  muela_encamisado: ({ color, dark }) => (
    <svg viewBox="0 0 100 140" style={{ width: "100%", height: "100%", maxHeight: "100%", display: "block" }} preserveAspectRatio="xMidYMid meet">
      <ellipse cx="50" cy="125" rx="36" ry="4" fill="#000" opacity="0.15" />
      {/* Disco principal */}
      <circle cx="50" cy="70" r="38" fill={color} stroke={dark} strokeWidth="2" />
      {/* Dientes alrededor */}
      {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
        const r = (deg * Math.PI) / 180;
        const x1 = 50 + Math.cos(r) * 38;
        const y1 = 70 + Math.sin(r) * 38;
        const x2 = 50 + Math.cos(r) * 46;
        const y2 = 70 + Math.sin(r) * 46;
        return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke={dark} strokeWidth="4" />;
      })}
      {/* Centro */}
      <circle cx="50" cy="70" r="10" fill={dark} />
      <circle cx="50" cy="70" r="5" fill={color} />
      {/* Reflejo */}
      <ellipse cx="38" cy="55" rx="14" ry="6" fill="#fff" opacity="0.25" />
    </svg>
  ),
  puerta_muela: ({ color, dark }) => (
    <svg viewBox="0 0 100 140" style={{ width: "100%", height: "100%", maxHeight: "100%", display: "block" }} preserveAspectRatio="xMidYMid meet">
      <ellipse cx="50" cy="128" rx="34" ry="4" fill="#000" opacity="0.15" />
      {/* Placa rectangular */}
      <rect x="18" y="22" width="64" height="98" rx="4" fill={color} stroke={dark} strokeWidth="2" />
      {/* Tornillos esquinas */}
      {[[28, 32], [72, 32], [28, 110], [72, 110]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill={dark} />
          <circle cx={x} cy={y} r="2" fill="#fff" opacity="0.6" />
        </g>
      ))}
      {/* Hueco central para muela */}
      <circle cx="50" cy="71" r="22" fill={dark} />
      <circle cx="50" cy="71" r="17" fill={color} opacity="0.4" />
      <circle cx="50" cy="71" r="6" fill={dark} />
      {/* Reflejo */}
      <rect x="22" y="26" width="56" height="3" fill="#fff" opacity="0.35" />
    </svg>
  ),
};

// Placeholder ilustrado para cuando una caja no tiene foto subida.
// Muestra: SVG del tipo + nombre de la marca prominente + colores de marca.
function DefaultIllustration({ caja, height = 80, showBrand = true }) {
  const palette = MARCA_PALETTE[caja.marca] || MARCA_PALETTE["Otro"];
  const Svg = TipoSVG[caja.tipo] || TipoSVG.pica;
  return (
    <div style={{
      position: "relative",
      height,
      borderRadius: 10,
      overflow: "hidden",
      background: `linear-gradient(135deg, ${palette.soft} 0%, #fff 60%, ${palette.soft} 100%)`,
      border: `1px solid ${palette.primary}25`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 6,
    }}>
      <div style={{
        flex: 1,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 0,
      }}>
        <Svg color={palette.primary} dark={palette.dark} />
      </div>
      {showBrand && (
        <div style={{
          width: "100%",
          background: palette.primary,
          color: "#fff",
          textAlign: "center",
          fontSize: Math.max(8, Math.min(11, height / 9)),
          fontWeight: 800,
          letterSpacing: 1.2,
          padding: "3px 4px",
          marginTop: 4,
          borderRadius: 4,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}>
          {palette.label}
        </div>
      )}
    </div>
  );
}

// Leyenda visual que explica que tipo de pieza representa cada ilustracion.
// Persiste estado dismissed en localStorage (key versionada por si en el futuro
// se agregan tipos nuevos y queremos re-mostrar la leyenda a usuarios que ya la cerraron).
function LegendaTipos({ isMobile }) {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("gdv-legend-dismissed-v1") === "true"
  );

  const dismiss = () => {
    localStorage.setItem("gdv-legend-dismissed-v1", "true");
    setDismissed(true);
  };
  const restore = () => {
    localStorage.removeItem("gdv-legend-dismissed-v1");
    setDismissed(false);
  };

  // Tipo neutral "Otro" para que la ilustracion explique el TIPO, no la marca.
  const chips = [
    { tipo: "pica",             label: "Pica",         hint: "domo + carburo" },
    { tipo: "portapica",        label: "Portapica",    hint: "cilindro hueco" },
    { tipo: "muela_encamisado", label: "Muela",        hint: "disco dentado" },
    { tipo: "puerta_muela",     label: "Puerta muela", hint: "placa + tornillos" },
  ];

  // Caja "fake" para alimentar a DefaultIllustration sin marca real.
  const cajaNeutral = (tipo) => ({ tipo, marca: "Otro", tamano: "mediana" });

  if (dismissed) {
    return (
      <button
        onClick={restore}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          fontSize: 12,
          fontWeight: 600,
          color: VAULT_BLUE,
          background: "transparent",
          border: `1px dashed ${BORDER}`,
          borderRadius: 8,
          cursor: "pointer",
          marginBottom: 12,
        }}
        title="Mostrar leyenda de iconos"
      >
        <span style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: VAULT_BLUE,
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
        }}>?</span>
        Ver leyenda de iconos
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Leyenda de tipos de caja"
      style={{
        position: "relative",
        background: CREAM,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: isMobile ? "10px 40px 10px 12px" : "10px 40px 10px 14px",
        marginBottom: 14,
        boxShadow: "0 1px 2px rgba(15,76,117,0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.6,
            color: VAULT_BLUE,
            textTransform: "uppercase",
          }}
        >
          Leyenda de iconos
        </span>
        <span style={{ fontSize: 11, color: CHARCOAL, opacity: 0.7 }}>
          Asi se ve cada tipo de caja
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: isMobile ? 6 : 8,
        }}
      >
        {chips.map((c) => (
          <div
            key={c.tipo}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 10px 4px 4px",
              background: "#fff",
              border: `1px solid ${BORDER}`,
              borderRadius: 999,
              minHeight: 40,
              flex: isMobile ? "1 1 calc(50% - 6px)" : "0 0 auto",
              minWidth: isMobile ? 0 : 140,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: BRAND.beige,
                borderRadius: "50%",
                overflow: "hidden",
              }}
            >
              <DefaultIllustration
                caja={cajaNeutral(c.tipo)}
                height={28}
                showBrand={false}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: CHARCOAL,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {c.label}
              </span>
              <span style={{
                fontSize: isMobile ? 9.5 : 10,
                color: CHARCOAL,
                opacity: 0.6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {c.hint}
              </span>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={dismiss}
        aria-label="Ocultar leyenda"
        title="Ocultar leyenda"
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: isMobile ? 32 : 24,
          height: isMobile ? 32 : 24,
          padding: 0,
          background: "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          color: CHARCOAL,
          fontSize: 16,
          lineHeight: 1,
          opacity: 0.55,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.55)}
      >
        ×
      </button>
    </div>
  );
}

const DEFAULT_MIN_STOCK = {
  pica_jumbo: 30, pica_mediana: 30, pica_pequena: 30,
  portapica_jumbo: 30, portapica_mediana: 30, portapica_pequena: 30,
  muela_encamisado: 10, puerta_muela: 10,
};
const TAMANO_REQ_TIPOS = new Set(["pica", "portapica"]);

const PROJECTS = CANONICAL_PROJECTS;

// ── Utils ──
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmt = d => d ? new Date(d).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDT = d => d ? new Date(d).toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtMB = b => b ? (b / 1024 / 1024).toFixed(2) + " MB" : "—";
const fileKey = (fileId) => `cp-file-${fileId}`;

const tipoLabel = (t) => TIPOS_ITEM.find(x => x.value === t)?.label || t;
const tipoInitials = (t) => TIPOS_ITEM.find(x => x.value === t)?.initials || "X";
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const projLabel = s => { const p = PROJECTS.find(x => x.short === s); return p ? `${p.short} — ${p.name}` : (s || "—"); };

const readFileAsDataUrl = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: r.result });
  r.onerror = reject;
  r.readAsDataURL(file);
});

// Calcula el siguiente codigo correlativo para una marca+tipo dado el array de items existente.
// Formato: <MARCA_INICIALES>-<TIPO_INICIAL>-<NNN>
const nextCodigoFor = (marca, tipo, items) => {
  const prefix = `${MARCA_INICIALES[marca] || "OT"}-${tipoInitials(tipo)}-`;
  let maxN = 0;
  for (const it of items || []) {
    if (typeof it.codigo === "string" && it.codigo.startsWith(prefix)) {
      const tail = it.codigo.slice(prefix.length);
      const n = parseInt(tail, 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
  }
  const next = String(maxN + 1).padStart(3, "0");
  return `${prefix}${next}`;
};

// Codigo de subcategoria para min-stock (ej: pica_jumbo, muela_encamisado).
// Para muelas/puertas el tamano no aplica → usar solo el tipo.
const subKey = (tipo, tamano) => {
  if (TAMANO_REQ_TIPOS.has(tipo)) return `${tipo}_${tamano || "mediana"}`;
  return tipo;
};

const subLabel = (key) => {
  if (key.startsWith("pica_") || key.startsWith("portapica_")) {
    const [t, s] = key.split("_");
    return `${tipoLabel(t)} ${cap(s)}`;
  }
  return tipoLabel(key);
};

// Estado visual basado en % de stock de una caja
const cajaEstado = (caja) => {
  const ratio = caja.cantidadOriginal > 0 ? caja.cantidadActual / caja.cantidadOriginal : 0;
  if (caja.cantidadActual <= 0) return { key: "vacio",    label: "Vacia",         color: BRAND.red,    bg: BRAND.redSoft };
  if (caja.cantidadActual <= 3)  return { key: "critico",  label: "Critica",       color: BRAND.red,    bg: BRAND.redSoft };
  if (ratio < 0.34)              return { key: "casivacio",label: "Casi vacia",    color: BRAND.yellow, bg: BRAND.yellowSoft };
  if (ratio < 0.75)              return { key: "parcial",  label: "Parcial",       color: BRAND.blue,   bg: BRAND.blueSoft };
  return { key: "lleno", label: "Llena", color: BRAND.green, bg: BRAND.greenSoft };
};

const estadoHerramienta = (e) => {
  if (e === "operativa")      return { label: "Operativa",     color: BRAND.green,  bg: BRAND.greenSoft };
  if (e === "reparacion")     return { label: "En reparacion", color: BRAND.yellow, bg: BRAND.yellowSoft };
  if (e === "fuera_servicio") return { label: "Fuera de servicio", color: BRAND.red, bg: BRAND.redSoft };
  return { label: e || "—", color: BRAND.stone, bg: "rgba(0,0,0,0.05)" };
};

// QR via servicio publico (mismo patron que se uso en otros modulos similares).
const qrUrl = (data, size = 300) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;

// =====================================================================
// UI PRIMITIVES (locales, sin dependencias entre modulos)
// =====================================================================

const Badge = ({ children, color = BRAND.stone, bg }) => (
  <span style={{
    background: bg || (color + "20"),
    color,
    padding: "3px 10px",
    borderRadius: R.full,
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  }}>{children}</span>
);

const Btn = ({ children, onClick, variant = "primary", small, style: sx, disabled, type }) => {
  const isMobile = useIsMobile();
  // En mobile: padding mas grueso para alcanzar ~40px de touch target en botones no-small.
  // Los botones small (acciones secundarias en cards) conservan tamano para no romper layouts.
  const base = {
    border: "none",
    borderRadius: 8,
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    fontSize: small ? 12 : 14,
    padding: small ? "5px 12px" : (isMobile ? "11px 18px" : "9px 18px"),
    minHeight: small ? "auto" : (isMobile ? 40 : "auto"),
    opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit",
    letterSpacing: 0.2,
    transition: "all .15s",
  };
  const variants = {
    primary: { ...base, background: VAULT_BLUE,    color: "#fff", boxShadow: "0 2px 6px rgba(15,76,117,0.25)" },
    success: { ...base, background: BRAND.green,   color: "#fff" },
    warn:    { ...base, background: BRAND.yellow,  color: "#fff" },
    danger:  { ...base, background: BRAND.red,     color: "#fff" },
    info:    { ...base, background: BRAND.blue,    color: "#fff" },
    ghost:   { ...base, background: "transparent", color: BRAND.graphite, border: `1px solid ${BRAND.border}` },
  };
  return (
    <button type={type || "button"} style={{ ...(variants[variant] || variants.primary), ...sx }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

const Input = ({ label, hint, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.graphite }}>{label}</label>}
    <input style={{
      padding: "8px 12px",
      border: `1px solid ${BRAND.border}`,
      borderRadius: 8,
      fontSize: 14,
      outline: "none",
      background: CREAM,
      fontFamily: "inherit",
    }} {...p} />
    {hint && <span style={{ fontSize: 11, color: BRAND.stone }}>{hint}</span>}
  </div>
);

const Textarea = ({ label, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.graphite }}>{label}</label>}
    <textarea style={{
      padding: "8px 12px",
      border: `1px solid ${BRAND.border}`,
      borderRadius: 8,
      fontSize: 14,
      outline: "none",
      background: CREAM,
      fontFamily: "inherit",
      resize: "vertical",
      minHeight: 70,
    }} {...p} />
  </div>
);

const Select = ({ label, options, emptyLabel = "—", ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.graphite }}>{label}</label>}
    <select style={{
      padding: "8px 12px",
      border: `1px solid ${BRAND.border}`,
      borderRadius: 8,
      fontSize: 14,
      background: CREAM,
      fontFamily: "inherit",
    }} {...p}>
      <option value="">{emptyLabel}</option>
      {(options || []).map(o => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  </div>
);

const Modal = ({ title, onClose, children, wide, size }) => {
  const isMobile = useIsMobile();
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
      display: "flex",
      alignItems: isMobile ? "stretch" : "center",
      justifyContent: isMobile ? "stretch" : "center",
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: "#fff",
        borderRadius: isMobile ? 0 : 16,
        padding: isMobile ? 16 : 28,
        width: isMobile ? "100vw" : (size === "xl" ? "96vw" : wide ? "85vw" : 640),
        maxWidth: isMobile ? "100vw" : "98vw",
        height: isMobile ? "100vh" : "auto",
        maxHeight: isMobile ? "100vh" : "94vh",
        overflowY: "auto",
        boxShadow: BRAND.shadowLg,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 14 : 20, gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: isMobile ? 16 : 18, color: CHARCOAL, lineHeight: 1.3 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: BRAND.stone, padding: 4, lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon, color = VAULT_BLUE, sub }) => {
  const isMobile = useIsMobile();
  return (
    <div style={{
      background: CREAM,
      borderRadius: 14,
      padding: isMobile ? "12px 14px" : "18px 22px",
      border: `1px solid ${BRAND.borderSoft}`,
      flex: 1,
      minWidth: isMobile ? 0 : 170,
      boxShadow: BRAND.shadowSm,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 12 }}>
        <div style={{
          background: color + "18",
          color,
          width: isMobile ? 36 : 44,
          height: isMobile ? 36 : 44,
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isMobile ? 18 : 22,
          flexShrink: 0,
        }}>{icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: CHARCOAL }}>{value}</div>
          <div style={{ fontSize: 12, color: BRAND.graphite }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: BRAND.stone, marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
};

// FileSlot — patron similar al de PurchasesModule (load on-demand via fileId).
const FileSlot = ({ label, file, canUpload, onUpload, onRemove, accent = VAULT_BLUE }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);

  const openFile = async () => {
    if (!file) return;
    let toOpen = file;
    if (!file.dataUrl && file.fileId) {
      setOpening(true);
      try {
        const full = await store.get(fileKey(file.fileId));
        if (!full || !full.dataUrl) {
          alert(`❌ El archivo "${file.name}" no se encuentra en la nube o esta vacio.\n\nReemplazalo subiendolo nuevamente.`);
          setOpening(false);
          return;
        }
        toOpen = { ...full, fileId: file.fileId };
      } catch (err) {
        alert(`Error cargando "${file.name}": ${err?.message || err}`);
        setOpening(false);
        return;
      }
      setOpening(false);
    }
    if (toOpen.type?.startsWith("image/") || toOpen.type === "application/pdf") {
      const w = window.open();
      if (w) {
        w.document.write(`<!DOCTYPE html><html><head><title>${toOpen.name}</title></head><body style='margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh'>` +
          (toOpen.type === "application/pdf"
            ? `<iframe src='${toOpen.dataUrl}' style='width:100vw;height:100vh;border:none'></iframe>`
            : `<img src='${toOpen.dataUrl}' style='max-width:100vw;max-height:100vh'/>`) +
          `</body></html>`);
      }
    } else {
      const a = document.createElement("a");
      a.href = toOpen.dataUrl;
      a.download = toOpen.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      alert(`❌ El archivo pesa ${fmtMB(f.size)}.\n\nLimite maximo: 2 MB.`);
      e.target.value = ""; return;
    }
    setBusy(true);
    try {
      const fd = await readFileAsDataUrl(f);
      await onUpload(fd);
    } catch (err) {
      alert("Error subiendo archivo: " + (err?.message || err));
    }
    setBusy(false);
    e.target.value = "";
  };

  return (
    <div style={{
      border: `1px dashed ${accent}`,
      borderRadius: 12,
      padding: 14,
      background: accent + "08",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      {file ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, wordBreak: "break-all" }}>
              {file.type === "application/pdf" ? "📄" : file.type?.startsWith("image/") ? "🖼️" : "📎"} {file.name}
            </div>
            <div style={{ fontSize: 11, color: BRAND.stone }}>{file.type} · {fmtMB(file.size)}</div>
          </div>
          <Btn small variant="info" onClick={openFile} disabled={opening}>{opening ? "Cargando..." : "Ver / Descargar"}</Btn>
          {canUpload && <Btn small variant="danger" onClick={() => { if (confirm("¿Eliminar este archivo?")) onRemove(); }}>Eliminar</Btn>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: BRAND.stone }}>Sin archivo adjunto</div>
      )}
      {canUpload && (
        <>
          <input ref={ref} type="file" style={{ display: "none" }} accept="image/*,.pdf" onChange={onPick} />
          <Btn small variant="ghost" onClick={() => ref.current?.click()} disabled={busy}>
            {busy ? "Subiendo..." : file ? "Reemplazar archivo" : "+ Subir foto"}
          </Btn>
        </>
      )}
    </div>
  );
};

// =====================================================================
// FILE EXTRACTION (foto por separado, refs en items/tools)
// =====================================================================
// Patron: cada caja/herramienta guarda en su campo `foto` solo una ref
// liviana { fileId, name, type, size }. El dataUrl vive en cp-file-<id>.
// Esto evita que gdv-items crezca exponencialmente con las fotos.

const extractFotos = (arr) => {
  const filesToSave = [];
  const light = (arr || []).map((it) => {
    const f = it.foto;
    if (!f) return it;
    if (f.dataUrl && !f.fileId) {
      const fileId = uid();
      filesToSave.push({ fileId, content: { name: f.name, type: f.type, size: f.size, dataUrl: f.dataUrl } });
      return { ...it, foto: { fileId, name: f.name, type: f.type, size: f.size } };
    }
    if (f.dataUrl && f.fileId) {
      return { ...it, foto: { fileId: f.fileId, name: f.name, type: f.type, size: f.size } };
    }
    return it;
  });
  return { light, filesToSave };
};

// =====================================================================
// FORMS
// =====================================================================

// CajaForm — registrar/editar una caja de inventario.
function CajaForm({ caja, items, onSave, onClose, onDelete, canEdit }) {
  const isMobile = useIsMobile();
  const initial = caja || {
    id: "",
    codigo: "",
    marca: "",
    tipo: "",
    tamano: "",
    cantidadActual: 0,
    cantidadOriginal: 0,
    ubicacion: "",
    foto: null,
    notas: "",
  };
  const [f, setF] = useState(initial);
  // Si el usuario tocó manualmente el codigo, no lo auto-regeneramos.
  const [codigoTouched, setCodigoTouched] = useState(!!caja?.codigo);
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!caja;
  // Columnas responsivas para grids de 2 columnas en desktop.
  const cols2 = isMobile ? "1fr" : "1fr 1fr";

  // Auto-generar codigo cuando cambia marca o tipo (solo si no es edicion y no toco manual).
  useEffect(() => {
    if (isEdit || codigoTouched) return;
    if (f.marca && f.tipo) {
      const next = nextCodigoFor(f.marca, f.tipo, items);
      setF(p => ({ ...p, codigo: next }));
    } else if (f.codigo) {
      setF(p => ({ ...p, codigo: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.marca, f.tipo]);

  const necesitaTamano = TAMANO_REQ_TIPOS.has(f.tipo);

  const save = async () => {
    if (!f.marca || !f.tipo) { alert("Selecciona marca y tipo."); return; }
    if (necesitaTamano && !f.tamano) { alert("Selecciona el tamano (jumbo / mediana / pequena)."); return; }
    const cant = Number(f.cantidadOriginal || 0);
    if (!cant || cant <= 0) { alert("Ingresa una cantidad mayor a 0."); return; }
    if (!f.codigo?.trim()) { alert("El codigo no puede estar vacio."); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const data = {
      ...f,
      id: f.id || uid(),
      codigo: f.codigo.trim(),
      tamano: necesitaTamano ? f.tamano : "",
      cantidadOriginal: cant,
      // En creacion: actual = original. En edicion: respetar lo que tenga (no se edita aqui).
      cantidadActual: isEdit ? Number(f.cantidadActual || 0) : cant,
      createdAt: f.createdAt || now,
      updatedAt: now,
    };
    const ok = await onSave(data);
    setSaving(false);
    if (ok !== false) onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: VAULT_BLUE + "10", border: `1px solid ${VAULT_BLUE}40`, borderRadius: 10, padding: 12, fontSize: 12, color: VAULT_BLUE_DARK }}>
        📦 Cada caja se inventaria individualmente con su propio codigo y QR escaneable.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Select
          label="Marca *"
          value={f.marca}
          options={MARCAS}
          onChange={e => u("marca", e.target.value)}
          emptyLabel="— Elige marca —"
          disabled={!canEdit}
        />
        <Select
          label="Tipo *"
          value={f.tipo}
          options={TIPOS_ITEM.map(t => ({ value: t.value, label: t.label }))}
          onChange={e => u("tipo", e.target.value)}
          emptyLabel="— Elige tipo —"
          disabled={!canEdit}
        />
      </div>

      {necesitaTamano && (
        <Select
          label="Tamano *"
          value={f.tamano}
          options={TAMANOS.map(t => ({ value: t, label: cap(t) }))}
          onChange={e => u("tamano", e.target.value)}
          emptyLabel="— Elige tamano —"
          disabled={!canEdit}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Input
          label={isEdit ? "Cantidad original (referencia)" : "Cantidad inicial en la caja *"}
          type="number"
          min={1}
          value={f.cantidadOriginal}
          onChange={e => u("cantidadOriginal", e.target.value)}
          disabled={isEdit || !canEdit}
          hint={isEdit ? "Cantidad original al ingresar — no editable. Para ajustes usa Movimientos." : "Cuantas unidades trae la caja al ingresar"}
        />
        {isEdit && (
          <Input
            label="Cantidad actual"
            type="number"
            value={f.cantidadActual}
            onChange={e => u("cantidadActual", e.target.value)}
            disabled
            hint="Se ajusta automaticamente con movimientos"
          />
        )}
        <Input
          label="Ubicacion en bodega"
          placeholder="Ej: Estante A-1"
          value={f.ubicacion}
          onChange={e => u("ubicacion", e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <Input
        label="Codigo (auto-generado, editable)"
        value={f.codigo}
        onChange={e => { setCodigoTouched(true); u("codigo", e.target.value); }}
        disabled={!canEdit}
        hint="Formato sugerido: <MARCA>-<TIPO>-<NNN>. Editable si necesitas override."
      />

      <Textarea
        label="Notas"
        placeholder="Observaciones, lote del proveedor, etc."
        value={f.notas}
        onChange={e => u("notas", e.target.value)}
        disabled={!canEdit}
      />

      <FileSlot
        label="Foto de la caja"
        file={f.foto}
        canUpload={canEdit}
        onUpload={(fd) => u("foto", fd)}
        onRemove={() => u("foto", null)}
      />

      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 8,
      }}>
        {isEdit && canEdit && onDelete ? (
          <Btn variant="danger" style={isMobile ? { width: "100%" } : undefined} onClick={() => {
            if (confirm(`¿Eliminar la caja ${f.codigo}? Esta accion no se puede deshacer.`)) onDelete(f.id);
          }}>Eliminar caja</Btn>
        ) : !isMobile ? <span /> : null}
        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column-reverse" : "row",
          gap: 8,
        }}>
          <Btn variant="ghost" style={isMobile ? { width: "100%" } : undefined} onClick={onClose}>Cancelar</Btn>
          {canEdit && <Btn style={isMobile ? { width: "100%" } : undefined} onClick={save} disabled={saving}>{saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear caja"}</Btn>}
        </div>
      </div>
    </div>
  );
}

// HerramientaForm — registrar/editar herramienta (bucket, broca, rompebolon).
function HerramientaForm({ tool, onSave, onClose, onDelete, canEdit }) {
  const isMobile = useIsMobile();
  const cols2 = isMobile ? "1fr" : "1fr 1fr";
  const initial = tool || {
    id: "",
    tipo: "",
    nombre: "",
    diametro: "",
    diametroUnidad: "pulgadas",
    projectCode: "",
    estado: "operativa",
    foto: null,
    notas: "",
  };
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!tool;

  const save = async () => {
    if (!f.tipo) { alert("Selecciona el tipo de herramienta."); return; }
    if (!f.nombre?.trim()) { alert("Ingresa un nombre."); return; }
    setSaving(true);
    const now = new Date().toISOString();
    const data = {
      ...f,
      id: f.id || uid(),
      nombre: f.nombre.trim(),
      diametro: f.diametro === "" ? null : Number(f.diametro),
      createdAt: f.createdAt || now,
      updatedAt: now,
    };
    const ok = await onSave(data);
    setSaving(false);
    if (ok !== false) onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: VAULT_BLUE + "10", border: `1px solid ${VAULT_BLUE}40`, borderRadius: 10, padding: 12, fontSize: 12, color: VAULT_BLUE_DARK }}>
        🔧 Herramientas de perforacion. Las picas/portapicas se sueldan a estas herramientas.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Select
          label="Tipo *"
          value={f.tipo}
          options={TIPOS_HERRAMIENTA.map(t => ({ value: t, label: cap(t) }))}
          onChange={e => u("tipo", e.target.value)}
          emptyLabel="— Elige tipo —"
          disabled={!canEdit}
        />
        <Input
          label="Nombre *"
          placeholder="Ej: Bucket Bauer 24"
          value={f.nombre}
          onChange={e => u("nombre", e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Input
          label="Diametro"
          type="number"
          step="0.01"
          value={f.diametro}
          onChange={e => u("diametro", e.target.value)}
          disabled={!canEdit}
        />
        <Input
          label="Unidad de diametro"
          placeholder="pulgadas / cm / mm"
          value={f.diametroUnidad}
          onChange={e => u("diametroUnidad", e.target.value)}
          disabled={!canEdit}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Select
          label="Proyecto actual (donde esta la herramienta)"
          value={f.projectCode}
          options={PROJECTS.map(p => ({ value: p.short, label: `${p.short} — ${p.name}` }))}
          onChange={e => u("projectCode", e.target.value)}
          emptyLabel="— En bodega —"
          disabled={!canEdit}
        />
        <Select
          label="Estado"
          value={f.estado}
          options={ESTADOS_HERRAMIENTA.map(e => ({ value: e, label: estadoHerramienta(e).label }))}
          onChange={e => u("estado", e.target.value)}
          emptyLabel="— Estado —"
          disabled={!canEdit}
        />
      </div>

      <Textarea
        label="Notas"
        value={f.notas}
        onChange={e => u("notas", e.target.value)}
        disabled={!canEdit}
      />

      <FileSlot
        label="Foto de la herramienta"
        file={f.foto}
        canUpload={canEdit}
        onUpload={(fd) => u("foto", fd)}
        onRemove={() => u("foto", null)}
      />

      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: "space-between",
        gap: 8,
        marginTop: 8,
      }}>
        {isEdit && canEdit && onDelete ? (
          <Btn variant="danger" style={isMobile ? { width: "100%" } : undefined} onClick={() => {
            if (confirm(`¿Eliminar la herramienta ${f.nombre}? Esta accion no se puede deshacer.`)) onDelete(f.id);
          }}>Eliminar herramienta</Btn>
        ) : !isMobile ? <span /> : null}
        <div style={{
          display: "flex",
          flexDirection: isMobile ? "column-reverse" : "row",
          gap: 8,
        }}>
          <Btn variant="ghost" style={isMobile ? { width: "100%" } : undefined} onClick={onClose}>Cancelar</Btn>
          {canEdit && <Btn style={isMobile ? { width: "100%" } : undefined} onClick={save} disabled={saving}>{saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear herramienta"}</Btn>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QRScannerModal — abre la camara del dispositivo y lee codigos QR de las cajas.
// Usa la libreria qr-scanner (basada en Web Workers, soporta camara trasera).
//
// Flujo:
//   1. Click "📷 Escanear con camara" en SalidaForm/EntradaForm.
//   2. Se abre este modal con el video stream de la camara.
//   3. Apuntas la camara al sticker QR pegado en la caja fisica.
//   4. Cuando detecta un QR, llama a onScan(codigo) y cierra el modal.
//   5. El form padre busca la caja por codigo y la autocompleta.
//
// Manejo de errores:
//   - Permiso denegado de camara → mensaje claro.
//   - Sin camara disponible → fallback a entrada manual.
//   - QR no detectado → se mantiene activo hasta que el user cancela.
// ─────────────────────────────────────────────────────────────────────────────
function QRScannerModal({ onScan, onClose }) {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [lastCode, setLastCode] = useState(""); // para feedback visual

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const start = async () => {
      try {
        const hasCamera = await QrScanner.hasCamera();
        if (!hasCamera) {
          if (!cancelled) {
            setError("No se detecto camara en este dispositivo. Usa el campo de codigo manual.");
            setStarting(false);
          }
          return;
        }
        const scanner = new QrScanner(
          video,
          (result) => {
            const code = (result.data || "").trim();
            if (!code) return;
            setLastCode(code);
            // Pequeño feedback haptico si el browser lo soporta
            try { navigator.vibrate?.(80); } catch {}
            onScan(code);
          },
          {
            preferredCamera: "environment", // camara trasera del celular
            highlightScanRegion: true,
            highlightCodeOutline: true,
            maxScansPerSecond: 5,
          }
        );
        scannerRef.current = scanner;
        await scanner.start();
        if (!cancelled) setStarting(false);
      } catch (err) {
        console.error("QRScanner error:", err);
        if (!cancelled) {
          const msg = err?.message || String(err);
          if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
            setError("Permiso de camara denegado. Habilita la camara en la configuracion del navegador y reintenta.");
          } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no camera")) {
            setError("No se encontro camara en este dispositivo.");
          } else {
            setError(`Error iniciando camara: ${msg}`);
          }
          setStarting(false);
        }
      }
    };
    start();

    return () => {
      cancelled = true;
      const sc = scannerRef.current;
      if (sc) {
        try { sc.stop(); } catch {}
        try { sc.destroy(); } catch {}
      }
    };
  }, [onScan]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: 18, maxWidth: 480, width: "100%",
        display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: BRAND.charcoal }}>📷 Escanear codigo QR</div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", fontSize: 22, color: BRAND.stone,
            cursor: "pointer", lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {error ? (
          <div style={{
            background: BRAND.redSoft, border: `1px solid ${BRAND.red}`,
            borderRadius: 10, padding: 14, fontSize: 13, color: "#7F1D1D",
          }}>{error}</div>
        ) : (
          <>
            <div style={{
              background: "#000", borderRadius: 10, overflow: "hidden",
              aspectRatio: "4 / 3", position: "relative",
            }}>
              <video
                ref={videoRef}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                muted
                playsInline
              />
              {starting && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 14, fontWeight: 600,
                  background: "rgba(0,0,0,0.5)",
                }}>Iniciando camara…</div>
              )}
              {lastCode && (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: BRAND.green, color: "#fff",
                  padding: "8px 12px", fontSize: 13, fontWeight: 700, textAlign: "center",
                  fontFamily: "ui-monospace, Menlo, monospace",
                }}>✓ {lastCode}</div>
              )}
            </div>
            <div style={{ fontSize: 12, color: BRAND.graphite, textAlign: "center", lineHeight: 1.4 }}>
              Apunta la camara al sticker QR pegado en la caja.<br />
              <span style={{ color: BRAND.stone }}>El codigo se detecta automaticamente.</span>
            </div>
          </>
        )}

        <button onClick={onClose} style={{
          background: BRAND.beigeDeep, border: `1px solid ${BRAND.border}`,
          borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 700,
          color: BRAND.charcoal, cursor: "pointer", fontFamily: "inherit",
        }}>Cerrar</button>
      </div>
    </div>
  );
}

// SalidaForm — registrar una salida (despacho a obra).
function SalidaForm({ items, tools, preselectedCaja, userName, onSave, onClose, machines }) {
  const isMobile = useIsMobile();
  const cols2 = isMobile ? "1fr" : "1fr 1fr";
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    fecha: today,
    itemId: preselectedCaja?.id || "",
    cantidad: 1,
    projectCode: "",
    maquinaId: "",
    herramientaId: "",
    solicitadoPor: "",
    notas: "",
    scan: "",
  });
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  const selectedCaja = items.find(i => i.id === f.itemId);
  const maxCantidad = selectedCaja ? selectedCaja.cantidadActual : 0;

  // Buscar caja por codigo (escanear o pegar). Devuelve la caja encontrada o null.
  const buscarPorCodigoFn = (code) => {
    const c = (code || "").trim();
    if (!c) return null;
    const match = items.find(i => (i.codigo || "").toLowerCase() === c.toLowerCase());
    if (match) {
      u("itemId", match.id);
      u("scan", "");
      return match;
    }
    return null;
  };
  const buscarPorCodigo = () => {
    const code = f.scan.trim();
    if (!code) return;
    const match = buscarPorCodigoFn(code);
    if (!match) alert(`No se encontro ninguna caja con codigo "${code}".`);
  };

  // Callback desde el QRScannerModal cuando detecta un codigo.
  const onQRScanned = (code) => {
    setShowScanner(false);
    const match = buscarPorCodigoFn(code);
    if (!match) {
      alert(`Escaneaste "${code}" pero no hay ninguna caja con ese codigo registrada.`);
    }
  };

  const save = async () => {
    if (!f.itemId) { alert("Selecciona la caja a despachar."); return; }
    const cant = Number(f.cantidad || 0);
    if (!cant || cant <= 0) { alert("Ingresa una cantidad mayor a 0."); return; }
    if (cant > maxCantidad) { alert(`No puedes despachar mas de ${maxCantidad} unidades (cantidad actual de la caja).`); return; }
    if (!f.projectCode) { alert("Selecciona el proyecto destino."); return; }
    setSaving(true);
    const ok = await onSave({
      id: uid(),
      fecha: f.fecha,
      tipo: "salida",
      itemId: f.itemId,
      cantidad: cant,
      projectCode: f.projectCode,
      maquinaId: f.maquinaId || "",
      herramientaId: f.herramientaId || "",
      solicitadoPor: f.solicitadoPor || userName || "",
      notas: f.notas || "",
      createdAt: new Date().toISOString(),
    });
    setSaving(false);
    if (ok !== false) onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {showScanner && (
        <QRScannerModal onScan={onQRScanned} onClose={() => setShowScanner(false)} />
      )}

      <div style={{ background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}`, borderRadius: 10, padding: 12, fontSize: 12, color: "#8B6A0B" }}>
        📤 Registra la salida de unidades de una caja. La cantidad se restara automaticamente del inventario.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Input
          label="Fecha *"
          type="date"
          value={f.fecha}
          onChange={e => u("fecha", e.target.value)}
        />
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: BRAND.graphite, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Codigo de caja
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ flex: 1, minWidth: 0, padding: isMobile ? "11px 12px" : "9px 12px", border: `1px solid ${BRAND.border}`, borderRadius: 8, fontSize: 14, fontFamily: "inherit", background: "#fff", color: BRAND.charcoal, outline: "none" }}
              placeholder="Ej: JM-P-001"
              value={f.scan}
              onChange={e => u("scan", e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); buscarPorCodigo(); } }}
            />
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              style={{
                background: BRAND.charcoal, color: "#fff",
                border: "none", borderRadius: 8,
                padding: isMobile ? "11px 12px" : "9px 14px",
                fontSize: isMobile ? 16 : 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                whiteSpace: "nowrap", display: "flex", alignItems: "center", justifyContent: "center",
                gap: isMobile ? 0 : 6,
                minWidth: isMobile ? 48 : "auto",
                flexShrink: 0,
              }}
              title="Escanear QR con la camara"
              aria-label="Escanear QR con la camara"
            >📷{!isMobile && " Camara"}</button>
          </div>
          <div style={{ fontSize: 10.5, color: BRAND.stone, marginTop: 4 }}>
            Escanea el QR pegado en la caja o pega el codigo manualmente.
          </div>
        </div>
      </div>

      <Select
        label="Caja * (selecciona o usa escanear arriba)"
        value={f.itemId}
        options={items
          .filter(i => i.cantidadActual > 0)
          .map(i => ({
            value: i.id,
            label: `${i.codigo} · ${tipoLabel(i.tipo)}${i.tamano ? ` ${cap(i.tamano)}` : ""} · ${i.marca} · disponibles: ${i.cantidadActual}`,
          }))}
        onChange={e => u("itemId", e.target.value)}
        emptyLabel="— Elige caja —"
      />
      {selectedCaja && (
        <div style={{ fontSize: 12, color: BRAND.graphite, padding: "8px 12px", background: BRAND.beigeLight, borderRadius: 8 }}>
          Caja seleccionada: <strong>{selectedCaja.codigo}</strong> · {tipoLabel(selectedCaja.tipo)}{selectedCaja.tamano ? ` ${cap(selectedCaja.tamano)}` : ""} · {selectedCaja.marca} · Disponibles: <strong>{selectedCaja.cantidadActual}</strong>
        </div>
      )}

      <Input
        label="Cantidad a despachar *"
        type="number"
        min={1}
        max={maxCantidad || undefined}
        value={f.cantidad}
        onChange={e => u("cantidad", e.target.value)}
        hint={selectedCaja ? `Maximo: ${maxCantidad}` : "Selecciona una caja primero"}
      />

      <Select
        label="Proyecto destino *"
        value={f.projectCode}
        options={PROJECTS.map(p => ({ value: p.short, label: `${p.short} — ${p.name}` }))}
        onChange={e => u("projectCode", e.target.value)}
        emptyLabel="— Elige proyecto —"
      />

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Select
          label="Maquina destino (opcional)"
          value={f.maquinaId}
          options={(machines || []).map(m => ({ value: m.id, label: m.nombre || m.id }))}
          onChange={e => u("maquinaId", e.target.value)}
          emptyLabel="— Sin maquina —"
        />
        <Select
          label="Herramienta destino (opcional)"
          value={f.herramientaId}
          options={(tools || []).map(t => ({ value: t.id, label: `${cap(t.tipo)} · ${t.nombre}` }))}
          onChange={e => u("herramientaId", e.target.value)}
          emptyLabel="— Sin herramienta —"
        />
      </div>

      <Input
        label="Solicitado por"
        placeholder="Ej: Residente Juan via WhatsApp"
        value={f.solicitadoPor}
        onChange={e => u("solicitadoPor", e.target.value)}
      />

      <Textarea
        label="Notas"
        value={f.notas}
        onChange={e => u("notas", e.target.value)}
      />

      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column-reverse" : "row",
        justifyContent: "flex-end",
        gap: 8,
        marginTop: 8,
      }}>
        <Btn variant="ghost" style={isMobile ? { width: "100%" } : undefined} onClick={onClose}>Cancelar</Btn>
        <Btn variant="warn" style={isMobile ? { width: "100%" } : undefined} onClick={save} disabled={saving}>{saving ? "Guardando..." : "Registrar salida"}</Btn>
      </div>
    </div>
  );
}

// EntradaForm — registrar recarga de una caja existente.
function EntradaForm({ items, userName, onSave, onClose }) {
  const isMobile = useIsMobile();
  const cols2 = isMobile ? "1fr" : "1fr 1fr";
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    fecha: today,
    itemId: "",
    cantidad: 1,
    solicitadoPor: userName || "",
    notas: "",
  });
  const [saving, setSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  const selected = items.find(i => i.id === f.itemId);

  // Callback del QR scanner: busca la caja y autoselecciona
  const onQRScanned = (code) => {
    setShowScanner(false);
    const match = items.find(i => (i.codigo || "").toLowerCase() === (code || "").trim().toLowerCase());
    if (match) {
      u("itemId", match.id);
    } else {
      alert(`Escaneaste "${code}" pero no hay ninguna caja con ese codigo registrada.`);
    }
  };

  const save = async () => {
    if (!f.itemId) { alert("Selecciona la caja a recargar."); return; }
    const cant = Number(f.cantidad || 0);
    if (!cant || cant <= 0) { alert("Ingresa una cantidad mayor a 0."); return; }
    setSaving(true);
    const ok = await onSave({
      id: uid(),
      fecha: f.fecha,
      tipo: "entrada",
      itemId: f.itemId,
      cantidad: cant,
      projectCode: "",
      maquinaId: "",
      herramientaId: "",
      solicitadoPor: f.solicitadoPor || userName || "",
      notas: f.notas || "",
      createdAt: new Date().toISOString(),
    });
    setSaving(false);
    if (ok !== false) onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {showScanner && (
        <QRScannerModal onScan={onQRScanned} onClose={() => setShowScanner(false)} />
      )}

      <div style={{ background: BRAND.greenSoft, border: `1px solid ${BRAND.green}`, borderRadius: 10, padding: 12, fontSize: 12, color: "#3D5F35" }}>
        📥 Registra una recarga (entrada) sumando unidades a una caja existente. Para una caja nueva, usa "+ Registrar nueva caja" desde Inventario.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: cols2, gap: 14 }}>
        <Input label="Fecha *" type="date" value={f.fecha} onChange={e => u("fecha", e.target.value)} />
        <Input label="Cantidad a agregar *" type="number" min={1} value={f.cantidad} onChange={e => u("cantidad", e.target.value)} />
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "end", gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.3 }}>
            Caja * (elige del listado o escanea su QR)
          </div>
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            style={{
              background: BRAND.charcoal, color: "#fff", border: "none",
              borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >📷 Escanear QR</button>
        </div>
        <Select
          label=""
          value={f.itemId}
          options={items.map(i => ({
            value: i.id,
            label: `${i.codigo} · ${tipoLabel(i.tipo)}${i.tamano ? ` ${cap(i.tamano)}` : ""} · ${i.marca} · actual: ${i.cantidadActual}/${i.cantidadOriginal}`,
          }))}
          onChange={e => u("itemId", e.target.value)}
          emptyLabel="— Elige caja —"
        />
      </div>
      {selected && (
        <div style={{ fontSize: 12, color: BRAND.graphite, padding: "8px 12px", background: BRAND.beigeLight, borderRadius: 8 }}>
          Caja: <strong>{selected.codigo}</strong> · Actual: <strong>{selected.cantidadActual}</strong> · Despues del ingreso: <strong>{selected.cantidadActual + Number(f.cantidad || 0)}</strong>
        </div>
      )}

      <Input label="Solicitado / recibido por" value={f.solicitadoPor} onChange={e => u("solicitadoPor", e.target.value)} />
      <Textarea label="Notas" value={f.notas} onChange={e => u("notas", e.target.value)} />

      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column-reverse" : "row",
        justifyContent: "flex-end",
        gap: 8,
        marginTop: 8,
      }}>
        <Btn variant="ghost" style={isMobile ? { width: "100%" } : undefined} onClick={onClose}>Cancelar</Btn>
        <Btn variant="success" style={isMobile ? { width: "100%" } : undefined} onClick={save} disabled={saving}>{saving ? "Guardando..." : "Registrar entrada"}</Btn>
      </div>
    </div>
  );
}

// =====================================================================
// DETAIL VIEW (modal completo de una caja)
// =====================================================================
function CajaDetail({ caja, onClose, onEdit, onDespachar, onDelete, onDuplicate, canEdit }) {
  const isMobile = useIsMobile();
  // Hidratar foto on-demand (load on-demand pattern)
  const [foto, setFoto] = useState(caja.foto);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (caja.foto?.fileId && !caja.foto.dataUrl) {
        try {
          const full = await store.get(fileKey(caja.foto.fileId));
          if (!cancelled && full?.dataUrl) {
            setFoto({ ...full, fileId: caja.foto.fileId });
          }
        } catch (e) {
          console.warn("[GeoDrillVault] No se pudo cargar la foto:", e?.message || e);
        }
      } else {
        setFoto(caja.foto);
      }
    })();
    return () => { cancelled = true; };
  }, [caja.foto?.fileId, caja.foto?.dataUrl]);

  const estado = cajaEstado(caja);
  const ratio = caja.cantidadOriginal > 0 ? caja.cantidadActual / caja.cantidadOriginal : 0;

  const printLabel = () => {
    // Genera una ventana imprimible con la etiqueta
    const qr = qrUrl(caja.codigo, 300);
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    const tipoLbl = tipoLabel(caja.tipo) + (caja.tamano ? ` · ${cap(caja.tamano)}` : "");
    w.document.write(`<!DOCTYPE html><html><head><title>Etiqueta ${caja.codigo}</title>
      <style>
        @page { size: A6 portrait; margin: 8mm; }
        body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 16px; color: #1a1a1a; }
        .header { display:flex; align-items:center; gap:8px; border-bottom: 2px solid #0F4C75; padding-bottom: 8px; margin-bottom: 12px; }
        .brand { font-weight: 800; font-size: 13px; color: #0F4C75; letter-spacing: 1px; }
        .codigo { font-size: 28px; font-weight: 800; text-align: center; margin: 8px 0 12px; letter-spacing: 1px; color: #0F4C75; font-family: 'Courier New', monospace; }
        .qr { display:flex; justify-content:center; margin: 10px 0; }
        .qr img { width: 180px; height: 180px; }
        .data { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px; }
        .data .lbl { color: #6B7280; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
        .data .val { font-weight: 700; }
        .cant { text-align:center; margin: 10px 0; padding: 8px; background: #F3F4F6; border-radius: 6px; font-size: 16px; font-weight: 700; color: #0F4C75; }
        .btn { display: block; margin: 16px auto; padding: 10px 20px; background: #0F4C75; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
        @media print { .btn { display: none; } }
      </style></head>
      <body>
        <div class="header">
          <div class="brand">GEOTECNICA · GEODRILL VAULT</div>
        </div>
        <div class="codigo">${caja.codigo}</div>
        <div class="qr"><img src="${qr}" alt="QR ${caja.codigo}"/></div>
        <div class="cant">${caja.cantidadOriginal} unidades</div>
        <div class="data">
          <div><div class="lbl">Marca</div><div class="val">${caja.marca || "—"}</div></div>
          <div><div class="lbl">Tipo</div><div class="val">${tipoLbl}</div></div>
          <div><div class="lbl">Ubicacion</div><div class="val">${caja.ubicacion || "—"}</div></div>
          <div><div class="lbl">Ingresada</div><div class="val">${fmt(caja.createdAt)}</div></div>
        </div>
        <button class="btn" onclick="window.print()">🖨 Imprimir etiqueta</button>
      </body></html>`);
    w.document.close();
  };

  return (
    <Modal title={`📦 ${caja.codigo}`} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 24 }}>
        {/* Columna izquierda: foto + QR */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            background: BRAND.beigeLight,
            borderRadius: 12,
            border: `1px solid ${BRAND.borderSoft}`,
            minHeight: 220,
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
            padding: foto?.dataUrl ? 0 : 12,
          }}>
            {foto?.dataUrl ? (
              <img src={foto.dataUrl} alt={caja.codigo} style={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain" }} />
            ) : (
              <div style={{ width: "100%", maxWidth: 260, height: 240 }}>
                <DefaultIllustration caja={caja} height={240} showBrand={true} />
              </div>
            )}
          </div>
          <div style={{
            background: "#fff",
            borderRadius: 12,
            border: `1px solid ${BRAND.borderSoft}`,
            padding: 16,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 1 }}>
              Codigo QR para escaneo
            </div>
            <img src={qrUrl(caja.codigo, 200)} alt={`QR ${caja.codigo}`} style={{ width: 180, height: 180 }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: VAULT_BLUE, letterSpacing: 1, fontFamily: "monospace" }}>
              {caja.codigo}
            </div>
          </div>
        </div>

        {/* Columna derecha: datos */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Badge color={estado.color} bg={estado.bg}>{estado.label}</Badge>
            <Badge color={VAULT_BLUE}>{caja.marca || "—"}</Badge>
            <Badge color={BRAND.graphite}>{tipoLabel(caja.tipo)}{caja.tamano ? ` · ${cap(caja.tamano)}` : ""}</Badge>
          </div>

          <div style={{
            background: BRAND.beigeLight,
            borderRadius: 12,
            padding: 16,
            border: `1px solid ${BRAND.borderSoft}`,
          }}>
            <div style={{ fontSize: 11, color: BRAND.graphite, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.4 }}>Cantidad</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: VAULT_BLUE, marginTop: 4 }}>
              {caja.cantidadActual} <span style={{ fontSize: 16, color: BRAND.stone, fontWeight: 500 }}>/ {caja.cantidadOriginal}</span>
            </div>
            <div style={{ marginTop: 8, height: 8, background: BRAND.borderSoft, borderRadius: 4, overflow: "hidden" }}>
              <div style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%`, height: "100%", background: estado.color }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr", gap: 12 }}>
            <DataRow label="Ubicacion" value={caja.ubicacion || "—"} />
            <DataRow label="Ingresada" value={fmt(caja.createdAt)} />
            <DataRow label="Actualizada" value={fmtDT(caja.updatedAt)} />
            <DataRow label="ID interno" value={caja.id.slice(0, 12) + "…"} mono />
          </div>

          {caja.notas && (
            <div style={{ background: CREAM, border: `1px solid ${BRAND.borderSoft}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, color: BRAND.graphite, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Notas</div>
              <div style={{ fontSize: 13, color: CHARCOAL, whiteSpace: "pre-wrap" }}>{caja.notas}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <Btn variant="ghost" onClick={printLabel}>🖨 Imprimir etiqueta</Btn>
            {canEdit && <Btn onClick={onEdit}>✏️ Editar</Btn>}
            {canEdit && onDuplicate && (
              <Btn variant="info" onClick={async () => {
                const raw = prompt(
                  `Duplicar caja ${caja.codigo}\n\n` +
                  `¿Cuantas copias adicionales queres crear?\n` +
                  `(Cada copia tendra su propio codigo correlativo, ej: ${caja.codigo.replace(/\d+$/, "")}XXX)`,
                  "1"
                );
                if (raw === null) return; // cancelo
                const n = parseInt((raw || "").trim(), 10);
                if (!n || n <= 0) { alert("Numero invalido. Ingresa un entero positivo."); return; }
                if (n > 200) { alert("Maximo 200 copias por operacion."); return; }
                const res = await onDuplicate(caja, n);
                if (res?.ok !== false && res?.codigos?.length) {
                  const first = res.codigos[0], last = res.codigos[res.codigos.length - 1];
                  alert(`✓ Se crearon ${res.codigos.length} cajas adicionales.\n\n${first} a ${last}\n\nCada una con ${caja.cantidadOriginal} unidades.`);
                  onClose();
                }
              }}>📋 Duplicar</Btn>
            )}
            {canEdit && caja.cantidadActual > 0 && <Btn variant="warn" onClick={onDespachar}>📤 Despachar</Btn>}
            {canEdit && onDelete && (
              <Btn variant="danger" onClick={() => {
                if (confirm(`¿Eliminar la caja ${caja.codigo}?`)) onDelete(caja.id);
              }}>Eliminar</Btn>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const DataRow = ({ label, value, mono }) => (
  <div>
    <div style={{ fontSize: 11, color: BRAND.graphite, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.3 }}>{label}</div>
    <div style={{ fontSize: 13, color: CHARCOAL, fontWeight: 600, fontFamily: mono ? "monospace" : "inherit", marginTop: 2 }}>{value}</div>
  </div>
);

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function GeoDrillVault({ userRole, userName, onBack, onLogout }) {
  const canEdit = userRole === "admin" || userRole === "tesoreria" || userRole === "almacenista";
  const isMobile = useIsMobile();

  // ── Estado ──
  // sb = sidebar colapsado/expandido en desktop (estilo Notion).
  // sbOpen = sidebar visible como drawer en mobile (overlay).
  const [sb, setSb] = useState(true);
  const [sbOpen, setSbOpen] = useState(false);
  const [sec, setSec] = useState("resumen");
  const [items, setItems] = useState([]);          // gdv-items (cajas)
  const [tools, setTools] = useState([]);          // gdv-tools (herramientas)
  const [movements, setMovements] = useState([]);  // gdv-movements
  const [minStock, setMinStock] = useState(DEFAULT_MIN_STOCK);
  const [machines, setMachines] = useState([]);    // mq-machines (read-only ref)
  const [loaded, setLoaded] = useState(false);

  // Modal state
  const [modal, setModal] = useState(null);
  // Filtros
  const [invFilter, setInvFilter] = useState({ tipo: "", marca: "", tamano: "", ubicacion: "", q: "" });
  // Navegacion jerarquica por ubicacion. Array de partes ya entradas.
  // Ej: [] = raiz, ["Estante A"] = dentro de Estante A, ["Estante A", "Nivel 2"] = mas profundo.
  const [invPath, setInvPath] = useState([]);
  const [toolFilter, setToolFilter] = useState({ tipo: "", estado: "", projectCode: "" });
  const [movFilter, setMovFilter] = useState({ tipo: "", projectCode: "", from: "", to: "" });

  // ── Carga inicial ──
  useEffect(() => {
    (async () => {
      const [i, t, m, ms, mq] = await Promise.all([
        store.get("gdv-items"),
        store.get("gdv-tools"),
        store.get("gdv-movements"),
        store.get("gdv-min-stock"),
        store.get("mq-machines"),
      ]);
      if (Array.isArray(i)) setItems(i);
      if (Array.isArray(t)) setTools(t);
      if (Array.isArray(m)) setMovements(m);
      if (ms && typeof ms === "object") setMinStock({ ...DEFAULT_MIN_STOCK, ...ms });
      if (Array.isArray(mq)) setMachines(mq);
      setLoaded(true);
    })();
  }, []);

  // ── Auto-refresh on focus ──
  useEffect(() => {
    const refresh = async () => {
      try {
        const [i, t, m, mq] = await Promise.all([
          store.get("gdv-items"),
          store.get("gdv-tools"),
          store.get("gdv-movements"),
          store.get("mq-machines"),
        ]);
        if (Array.isArray(i)) setItems(i);
        if (Array.isArray(t)) setTools(t);
        if (Array.isArray(m)) setMovements(m);
        if (Array.isArray(mq)) setMachines(mq);
      } catch (e) {
        console.warn("[GeoDrillVault] refresh fallo:", e?.message || e);
      }
    };
    const onFocus = () => refresh();
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // ── Save robusto (patron sP de PurchasesModule) ──
  // Guarda con pre-fetch + merge + verify para evitar race conditions
  // entre los 3 usuarios (admin, tesoreria, almacenista) que pueden estar
  // editando en simultaneo.
  const saveItems = async (next) => {
    setItems(next);
    try {
      // Pre-fetch cloud para detectar items que otros usuarios agregaron
      const cloudPrev = await store.get("gdv-items");
      const cloudArr = Array.isArray(cloudPrev) ? cloudPrev : [];
      const prevIds = new Set(items.map(x => x.id));
      const ourIds = new Set(next.map(x => x.id));
      // Detectar borrados intencionales
      const deleted = new Set();
      prevIds.forEach(id => { if (!ourIds.has(id)) deleted.add(id); });
      // Merge: lo nuestro + extras de cloud que no borramos
      const cloudExtras = cloudArr.filter(x => !ourIds.has(x.id) && !deleted.has(x.id));
      const merged = [...next, ...cloudExtras];
      if (cloudExtras.length > 0) setItems(merged);

      // Extraer fotos
      const { light, filesToSave } = extractFotos(merged);
      // Subir fotos serial
      for (const f of filesToSave) {
        const ok = await store.set(fileKey(f.fileId), f.content);
        if (!ok) {
          alert(`No se pudo subir la foto "${f.content?.name}". Reintenta.`);
          return false;
        }
      }
      // Guardar items light
      const ok = await store.set("gdv-items", light);
      if (!ok) {
        alert("No se pudo sincronizar el inventario a la nube. Los datos quedan en este navegador.");
        return false;
      }
      // Verificar
      const verify = await store.get("gdv-items");
      if (!Array.isArray(verify) || verify.length !== light.length) {
        console.warn("[GeoDrillVault] Verificacion post-save: count mismatch", light.length, "vs", verify?.length);
      }
      return true;
    } catch (e) {
      console.error("[GeoDrillVault] saveItems error:", e);
      alert("Error al guardar: " + (e?.message || e));
      return false;
    }
  };

  const saveTools = async (next) => {
    setTools(next);
    try {
      const cloudPrev = await store.get("gdv-tools");
      const cloudArr = Array.isArray(cloudPrev) ? cloudPrev : [];
      const prevIds = new Set(tools.map(x => x.id));
      const ourIds = new Set(next.map(x => x.id));
      const deleted = new Set();
      prevIds.forEach(id => { if (!ourIds.has(id)) deleted.add(id); });
      const cloudExtras = cloudArr.filter(x => !ourIds.has(x.id) && !deleted.has(x.id));
      const merged = [...next, ...cloudExtras];
      if (cloudExtras.length > 0) setTools(merged);

      const { light, filesToSave } = extractFotos(merged);
      for (const f of filesToSave) {
        const ok = await store.set(fileKey(f.fileId), f.content);
        if (!ok) { alert(`No se pudo subir la foto "${f.content?.name}".`); return false; }
      }
      const ok = await store.set("gdv-tools", light);
      if (!ok) { alert("No se pudo sincronizar herramientas."); return false; }
      return true;
    } catch (e) {
      console.error("[GeoDrillVault] saveTools error:", e);
      alert("Error al guardar herramienta: " + (e?.message || e));
      return false;
    }
  };

  const saveMovements = async (next) => {
    setMovements(next);
    try {
      const cloudPrev = await store.get("gdv-movements");
      const cloudArr = Array.isArray(cloudPrev) ? cloudPrev : [];
      const ourIds = new Set(next.map(x => x.id));
      const cloudExtras = cloudArr.filter(x => !ourIds.has(x.id));
      const merged = [...next, ...cloudExtras];
      if (cloudExtras.length > 0) setMovements(merged);
      const ok = await store.set("gdv-movements", merged);
      if (!ok) { alert("No se pudo sincronizar movimientos."); return false; }
      return true;
    } catch (e) {
      console.error("[GeoDrillVault] saveMovements error:", e);
      return false;
    }
  };

  const saveMinStock = async (next) => {
    setMinStock(next);
    await store.set("gdv-min-stock", next);
  };

  // ── CRUD helpers ──
  const upsertItem = async (data) => {
    const exists = items.find(i => i.id === data.id);
    const next = exists ? items.map(i => i.id === data.id ? data : i) : [...items, data];
    return await saveItems(next);
  };
  const deleteItem = async (id) => {
    return await saveItems(items.filter(i => i.id !== id));
  };
  // Duplica una caja N veces. Genera codigos secuenciales (DM-P-002, DM-P-003,
  // etc) continuando desde el ultimo codigo registrado para esa marca+tipo.
  // Cada copia es independiente (su propio id, codigo, fechas). Comparten
  // marca, tipo, tamano, cantidad original, ubicacion, notas y foto (la foto
  // se comparte por referencia al mismo fileId — no se re-sube).
  // Devuelve la lista de codigos creados.
  const duplicateItem = async (caja, copies) => {
    const n = Math.floor(Number(copies));
    if (!caja || !n || n <= 0) return { ok: false, codigos: [] };
    const now = new Date().toISOString();
    const created = [];
    // Generar todos los codigos antes de guardar — cada nuevo codigo depende
    // de los que ya generamos para que no se repita el correlativo.
    const accumulator = [...items];
    for (let k = 0; k < n; k++) {
      const codigo = nextCodigoFor(caja.marca, caja.tipo, accumulator);
      const copia = {
        ...caja,
        id: uid(),
        codigo,
        // Stock fresco: la copia arranca llena con la misma capacidad
        cantidadActual: caja.cantidadOriginal,
        cantidadOriginal: caja.cantidadOriginal,
        createdAt: now,
        updatedAt: now,
      };
      accumulator.push(copia);
      created.push(copia);
    }
    const ok = await saveItems(accumulator);
    return { ok, codigos: created.map(c => c.codigo) };
  };
  const upsertTool = async (data) => {
    const exists = tools.find(t => t.id === data.id);
    const next = exists ? tools.map(t => t.id === data.id ? data : t) : [...tools, data];
    return await saveTools(next);
  };
  const deleteTool = async (id) => {
    return await saveTools(tools.filter(t => t.id !== id));
  };

  // ── Registrar movimiento (entrada o salida) ──
  // Crea el movimiento Y ajusta la cantidadActual de la caja en el mismo flow.
  const registrarMovimiento = async (mov) => {
    const caja = items.find(i => i.id === mov.itemId);
    if (!caja) { alert("La caja seleccionada ya no existe."); return false; }
    const delta = mov.tipo === "salida" ? -Number(mov.cantidad) : Number(mov.cantidad);
    const nuevaCantidad = caja.cantidadActual + delta;
    if (mov.tipo === "salida" && nuevaCantidad < 0) {
      alert(`No se puede despachar ${mov.cantidad} unidades. Solo quedan ${caja.cantidadActual} en la caja ${caja.codigo}.`);
      return false;
    }
    const cajaActualizada = { ...caja, cantidadActual: nuevaCantidad, updatedAt: new Date().toISOString() };
    const itemsOk = await saveItems(items.map(i => i.id === caja.id ? cajaActualizada : i));
    if (!itemsOk) return false;
    const movOk = await saveMovements([mov, ...movements]);
    if (!movOk) return false;
    return true;
  };

  // ── Eliminar movimiento (hard delete) ──
  // Para movimientos creados por error. Borra el registro y revierte el stock
  // (a menos que el movimiento ya estuviera marcado como revertido — en ese
  // caso el stock ya fue ajustado y no se vuelve a tocar).
  const eliminarMovimiento = async (mov) => {
    if (!confirm(`¿Eliminar este movimiento? (${mov.tipo} de ${mov.cantidad} unidades el ${fmt(mov.fecha)}). Esta accion es permanente — para mantener registro usa Revertir.`)) return;
    const caja = items.find(i => i.id === mov.itemId);
    if (caja && !mov.reverted) {
      const delta = mov.tipo === "salida" ? +Number(mov.cantidad) : -Number(mov.cantidad);
      const nuevaCantidad = Math.max(0, Math.min(caja.cantidadOriginal, caja.cantidadActual + delta));
      const ok = await saveItems(items.map(i => i.id === caja.id ? { ...i, cantidadActual: nuevaCantidad, updatedAt: new Date().toISOString() } : i));
      if (!ok) return;
    }
    await saveMovements(movements.filter(m => m.id !== mov.id));
  };

  // ── Revertir movimiento (soft) ──
  // El movimiento existio pero se cancela. Se mantiene en la lista marcado
  // como revertido (con fecha, autor y motivo). El stock revierte.
  const revertirMovimiento = async (mov) => {
    if (mov.reverted) { alert("Este movimiento ya fue revertido."); return; }
    const motivo = prompt(`Motivo de la reversion (${mov.tipo} de ${mov.cantidad} unidades el ${fmt(mov.fecha)}):\n\nEjemplo: "Despacho cancelado por residente", "Picas regresaron sin uso", "Error de cantidad"`);
    if (motivo === null) return;
    if (!motivo.trim()) { alert("Debes ingresar un motivo para la reversion."); return; }
    const caja = items.find(i => i.id === mov.itemId);
    if (caja) {
      const delta = mov.tipo === "salida" ? +Number(mov.cantidad) : -Number(mov.cantidad);
      const nuevaCantidad = Math.max(0, Math.min(caja.cantidadOriginal, caja.cantidadActual + delta));
      const ok = await saveItems(items.map(i => i.id === caja.id ? { ...i, cantidadActual: nuevaCantidad, updatedAt: new Date().toISOString() } : i));
      if (!ok) return;
    }
    const updated = {
      ...mov,
      reverted: true,
      revertedAt: new Date().toISOString(),
      revertedBy: userName || userRole || "usuario",
      revertReason: motivo.trim(),
    };
    await saveMovements(movements.map(m => m.id === mov.id ? updated : m));
  };

  // ── Stats / Resumen ──
  const totals = (() => {
    const counts = {};
    let totalUnidadesPorTipo = { pica: 0, portapica: 0, muela_encamisado: 0, puerta_muela: 0 };
    let totalUnidadesPorSub = {};
    for (const i of items) {
      const k = subKey(i.tipo, i.tamano);
      totalUnidadesPorSub[k] = (totalUnidadesPorSub[k] || 0) + (i.cantidadActual || 0);
      totalUnidadesPorTipo[i.tipo] = (totalUnidadesPorTipo[i.tipo] || 0) + (i.cantidadActual || 0);
      counts[i.tipo] = (counts[i.tipo] || 0) + 1;
    }
    return { counts, totalUnidadesPorTipo, totalUnidadesPorSub };
  })();

  // Alertas de stock minimo: subcategorias por debajo del minimo configurado.
  const alertasStock = (() => {
    const subKeys = Object.keys(minStock);
    const alerts = [];
    for (const k of subKeys) {
      const actual = totals.totalUnidadesPorSub[k] || 0;
      const min = minStock[k];
      if (actual < min) {
        alerts.push({ key: k, actual, min, deficit: min - actual });
      }
    }
    return alerts;
  })();

  // Cajas con stock critico (3 o menos unidades)
  const cajasCriticas = items.filter(i => i.cantidadActual > 0 && i.cantidadActual <= 3);
  const cajasVacias = items.filter(i => i.cantidadActual <= 0);

  // Filtrado de inventario
  const filteredItems = items.filter(i => {
    if (invFilter.tipo && i.tipo !== invFilter.tipo) return false;
    if (invFilter.marca && i.marca !== invFilter.marca) return false;
    if (invFilter.tamano && i.tamano !== invFilter.tamano) return false;
    if (invFilter.ubicacion && !(i.ubicacion || "").toLowerCase().includes(invFilter.ubicacion.toLowerCase())) return false;
    if (invFilter.q && !(i.codigo || "").toLowerCase().includes(invFilter.q.toLowerCase())) return false;
    return true;
  });

  const filteredTools = tools.filter(t => {
    if (toolFilter.tipo && t.tipo !== toolFilter.tipo) return false;
    if (toolFilter.estado && t.estado !== toolFilter.estado) return false;
    if (toolFilter.projectCode && t.projectCode !== toolFilter.projectCode) return false;
    return true;
  });

  const filteredMovements = movements.filter(m => {
    if (movFilter.tipo && m.tipo !== movFilter.tipo) return false;
    if (movFilter.projectCode && m.projectCode !== movFilter.projectCode) return false;
    if (movFilter.from && m.fecha < movFilter.from) return false;
    if (movFilter.to && m.fecha > movFilter.to) return false;
    return true;
  }).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));

  // ── Renderers de cada seccion ──
  const renderResumen = () => {
    const recent = [...movements].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 10);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 18 : 24 }}>
        {isMobile ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatCard icon="⛏️" label="Picas (unidades)" value={totals.totalUnidadesPorTipo.pica || 0} color={VAULT_BLUE} sub={`${totals.counts.pica || 0} cajas`} />
            <StatCard icon="🔩" label="Portapicas (unidades)" value={totals.totalUnidadesPorTipo.portapica || 0} color={BRAND.blue} sub={`${totals.counts.portapica || 0} cajas`} />
            <StatCard icon="⚙️" label="Muelas encamisado" value={totals.totalUnidadesPorTipo.muela_encamisado || 0} color={BRAND.purple} sub={`${totals.counts.muela_encamisado || 0} cajas`} />
            <StatCard icon="🚪" label="Puerta muelas" value={totals.totalUnidadesPorTipo.puerta_muela || 0} color={BRAND.orange} sub={`${totals.counts.puerta_muela || 0} cajas`} />
            <div style={{ gridColumn: "1 / -1" }}>
              <StatCard icon="🔧" label="Herramientas" value={tools.length} color={BRAND.green} sub={`${tools.filter(t => t.estado === "operativa").length} operativas`} />
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <StatCard icon="⛏️" label="Picas (unidades)" value={totals.totalUnidadesPorTipo.pica || 0} color={VAULT_BLUE} sub={`${totals.counts.pica || 0} cajas`} />
            <StatCard icon="🔩" label="Portapicas (unidades)" value={totals.totalUnidadesPorTipo.portapica || 0} color={BRAND.blue} sub={`${totals.counts.portapica || 0} cajas`} />
            <StatCard icon="⚙️" label="Muelas encamisado" value={totals.totalUnidadesPorTipo.muela_encamisado || 0} color={BRAND.purple} sub={`${totals.counts.muela_encamisado || 0} cajas`} />
            <StatCard icon="🚪" label="Puerta muelas" value={totals.totalUnidadesPorTipo.puerta_muela || 0} color={BRAND.orange} sub={`${totals.counts.puerta_muela || 0} cajas`} />
            <StatCard icon="🔧" label="Herramientas" value={tools.length} color={BRAND.green} sub={`${tools.filter(t => t.estado === "operativa").length} operativas`} />
          </div>
        )}

        {/* Alertas de stock minimo */}
        {alertasStock.length > 0 && (
          <div style={{ background: BRAND.redSoft, border: `1px solid ${BRAND.red}`, borderRadius: 14, padding: isMobile ? 14 : 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.red, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
              ⚠️ Stock por debajo del minimo ({alertasStock.length} subcategoria{alertasStock.length === 1 ? "" : "s"})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {alertasStock.map(a => (
                <div key={a.key} style={{ background: "#fff", borderRadius: 10, padding: 12, border: `1px solid ${BRAND.red}40` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: CHARCOAL }}>{subLabel(a.key)}</div>
                  <div style={{ fontSize: 12, color: BRAND.graphite, marginTop: 4 }}>
                    Actual: <strong style={{ color: BRAND.red }}>{a.actual}</strong> · Minimo: <strong>{a.min}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.red, marginTop: 2 }}>Faltan {a.deficit} unidades para llegar al minimo</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cajas con stock critico */}
        {cajasCriticas.length > 0 && (
          <div style={{ background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}`, borderRadius: 14, padding: isMobile ? 14 : 18 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#8B6A0B", marginBottom: 10 }}>
              🟡 Cajas con stock critico ({cajasCriticas.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {cajasCriticas.map(c => (
                <button key={c.id} onClick={() => setModal({ type: "caja-detail", data: c })}
                  style={{ background: "#fff", border: `1px solid ${BRAND.yellow}40`, borderRadius: 10, padding: 12, textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: VAULT_BLUE, fontFamily: "monospace" }}>{c.codigo}</div>
                  <div style={{ fontSize: 12, color: BRAND.graphite, marginTop: 2 }}>{tipoLabel(c.tipo)}{c.tamano ? ` · ${cap(c.tamano)}` : ""}</div>
                  <div style={{ fontSize: 11, color: BRAND.red, marginTop: 4 }}>Quedan {c.cantidadActual} de {c.cantidadOriginal}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Movimientos recientes */}
        <div style={{ background: CREAM, border: `1px solid ${BRAND.borderSoft}`, borderRadius: 14, padding: isMobile ? 14 : 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>📋 Movimientos recientes</div>
            <Btn small variant="ghost" onClick={() => setSec("movimientos")}>Ver todos →</Btn>
          </div>
          {recent.length === 0 ? (
            <div style={{ color: BRAND.stone, fontSize: 13, textAlign: "center", padding: 20 }}>Aun no hay movimientos registrados.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recent.map(m => {
                const caja = items.find(i => i.id === m.itemId);
                const isRev = !!m.reverted;
                return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#fff", borderRadius: 8, border: `1px solid ${BRAND.borderSoft}`, opacity: isRev ? 0.65 : 1 }} title={isRev ? `Revertido por ${m.revertedBy || "—"} el ${fmt(m.revertedAt)}\n${m.revertReason || ""}` : undefined}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: m.tipo === "salida" ? BRAND.yellowSoft : BRAND.greenSoft, color: m.tipo === "salida" ? BRAND.yellow : BRAND.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                      {m.tipo === "salida" ? "📤" : "📥"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: CHARCOAL, textDecoration: isRev ? "line-through" : "none", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <span>{m.tipo === "salida" ? "Salida" : "Entrada"} · {m.cantidad} u · {caja?.codigo || "(caja eliminada)"}</span>
                        {isRev && <Badge color={BRAND.red} bg={BRAND.redSoft}>REVERTIDO</Badge>}
                      </div>
                      <div style={{ fontSize: 11, color: BRAND.stone }}>
                        {fmt(m.fecha)}{m.projectCode ? ` · ${projLabel(m.projectCode)}` : ""}{m.solicitadoPor ? ` · ${m.solicitadoPor}` : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderInventario = () => {
    const ubicacionesUnicas = [...new Set(items.map(i => i.ubicacion).filter(Boolean))];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Leyenda visual de tipos — explica que representa cada ilustracion. */}
        <LegendaTipos isMobile={isMobile} />

        {/* Toolbar */}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Input label="" placeholder="Buscar codigo (ej: JM-P-001)" value={invFilter.q} onChange={e => setInvFilter(s => ({ ...s, q: e.target.value }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Select label="Tipo" value={invFilter.tipo} options={TIPOS_ITEM.map(t => ({ value: t.value, label: t.label }))} onChange={e => setInvFilter(s => ({ ...s, tipo: e.target.value }))} emptyLabel="Todos" />
              <Select label="Marca" value={invFilter.marca} options={MARCAS} onChange={e => setInvFilter(s => ({ ...s, marca: e.target.value }))} emptyLabel="Todas" />
              <Select label="Tamano" value={invFilter.tamano} options={TAMANOS.map(t => ({ value: t, label: cap(t) }))} onChange={e => setInvFilter(s => ({ ...s, tamano: e.target.value }))} emptyLabel="Todos" />
              <Input label="Ubicacion" placeholder="Ej: A-1" value={invFilter.ubicacion} onChange={e => setInvFilter(s => ({ ...s, ubicacion: e.target.value }))} />
            </div>
            {canEdit && <Btn style={{ width: "100%" }} onClick={() => setModal({ type: "caja-new" })}>+ Registrar nueva caja</Btn>}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 160 }}>
                <Select label="Tipo" value={invFilter.tipo} options={TIPOS_ITEM.map(t => ({ value: t.value, label: t.label }))} onChange={e => setInvFilter(s => ({ ...s, tipo: e.target.value }))} emptyLabel="Todos" />
              </div>
              <div style={{ minWidth: 160 }}>
                <Select label="Marca" value={invFilter.marca} options={MARCAS} onChange={e => setInvFilter(s => ({ ...s, marca: e.target.value }))} emptyLabel="Todas" />
              </div>
              <div style={{ minWidth: 140 }}>
                <Select label="Tamano" value={invFilter.tamano} options={TAMANOS.map(t => ({ value: t, label: cap(t) }))} onChange={e => setInvFilter(s => ({ ...s, tamano: e.target.value }))} emptyLabel="Todos" />
              </div>
              <div style={{ minWidth: 160 }}>
                <Input label="Ubicacion" placeholder="Ej: A-1" value={invFilter.ubicacion} onChange={e => setInvFilter(s => ({ ...s, ubicacion: e.target.value }))} />
              </div>
              <div style={{ minWidth: 180 }}>
                <Input label="Buscar codigo" placeholder="Ej: JM-P-001" value={invFilter.q} onChange={e => setInvFilter(s => ({ ...s, q: e.target.value }))} />
              </div>
            </div>
            {canEdit && <Btn onClick={() => setModal({ type: "caja-new" })}>+ Registrar nueva caja</Btn>}
          </div>
        )}

        {/* Navegacion jerarquica por ubicacion (carpetas).
            Si hay filtros activos (codigo, tipo, marca, tamano, ubicacion-texto)
            mostramos resultados PLANOS sin carpetas — el filtro pisa la navegacion. */}
        {(() => {
          const parseUbic = (u) => (u || "Sin ubicacion").split(",").map(s => s.trim()).filter(Boolean);
          const hasActiveFilter = !!(invFilter.q || invFilter.tipo || invFilter.marca || invFilter.tamano || invFilter.ubicacion);
          // Items que viven en o debajo del path actual (parts comienzan con el path)
          const itemsAtOrBelowPath = filteredItems.filter(item => {
            const parts = parseUbic(item.ubicacion);
            if (parts.length < invPath.length) return false;
            return invPath.every((p, i) => (parts[i] || "").toLowerCase() === p.toLowerCase());
          });
          // Si hay filtro activo o el path llego al fondo (no quedan mas sub-partes), mostrar PLANO
          const nextPartsCount = new Map(); // nombre → cantidad de items
          itemsAtOrBelowPath.forEach(item => {
            const parts = parseUbic(item.ubicacion);
            if (parts.length > invPath.length) {
              const next = parts[invPath.length];
              nextPartsCount.set(next, (nextPartsCount.get(next) || 0) + 1);
            }
          });
          const nextParts = [...nextPartsCount.keys()].sort();
          const showFolders = !hasActiveFilter && nextParts.length > 0;
          // Items que estan EXACTAMENTE en este nivel (no mas profundo)
          const itemsAtThisLevel = itemsAtOrBelowPath.filter(item => {
            const parts = parseUbic(item.ubicacion);
            return parts.length === invPath.length;
          });
          const cardsToShow = hasActiveFilter ? filteredItems : (showFolders ? itemsAtThisLevel : itemsAtOrBelowPath);

          return (
            <>
              {/* Breadcrumbs */}
              {!hasActiveFilter && (
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: BRAND.graphite }}>
                  <button
                    onClick={() => setInvPath([])}
                    style={{
                      background: invPath.length === 0 ? VAULT_BLUE : "transparent",
                      color: invPath.length === 0 ? "#fff" : VAULT_BLUE,
                      border: `1px solid ${VAULT_BLUE}`,
                      borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >🏠 Todas</button>
                  {invPath.map((part, idx) => (
                    <span key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: BRAND.stone }}>›</span>
                      <button
                        onClick={() => setInvPath(invPath.slice(0, idx + 1))}
                        style={{
                          background: idx === invPath.length - 1 ? VAULT_BLUE : "transparent",
                          color: idx === invPath.length - 1 ? "#fff" : VAULT_BLUE,
                          border: `1px solid ${VAULT_BLUE}`,
                          borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700,
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >{part}</button>
                    </span>
                  ))}
                  {invPath.length > 0 && (
                    <button
                      onClick={() => setInvPath(invPath.slice(0, -1))}
                      style={{
                        background: "transparent", color: BRAND.stone, border: "none",
                        cursor: "pointer", fontSize: 12, marginLeft: 6,
                      }}
                    >← Subir</button>
                  )}
                </div>
              )}

              {hasActiveFilter && (
                <div style={{
                  background: BRAND.yellowSoft, border: `1px solid ${BRAND.yellow}`,
                  borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#8B6A0B",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                }}>
                  <span>🔍 Filtros activos — mostrando resultados de TODA la bodega ({filteredItems.length} cajas).</span>
                  <button
                    onClick={() => setInvFilter({ tipo: "", marca: "", tamano: "", ubicacion: "", q: "" })}
                    style={{ background: "transparent", border: `1px solid ${BRAND.yellow}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#8B6A0B", cursor: "pointer", fontFamily: "inherit" }}
                  >Limpiar filtros</button>
                </div>
              )}

              {/* Carpetas (sub-niveles) */}
              {showFolders && nextParts.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.stone, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    📁 Carpetas en {invPath.length === 0 ? "raiz" : `"${invPath[invPath.length - 1]}"`}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                    {nextParts.map(part => {
                      const count = nextPartsCount.get(part);
                      return (
                        <button
                          key={part}
                          onClick={() => setInvPath([...invPath, part])}
                          style={{
                            background: "#fff",
                            border: `1px solid ${BRAND.borderSoft}`,
                            borderLeft: `4px solid ${VAULT_BLUE}`,
                            borderRadius: 12, padding: 16,
                            textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 12,
                            transition: "transform .1s, box-shadow .15s",
                            boxShadow: BRAND.shadowSm,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = BRAND.shadow; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = BRAND.shadowSm; }}
                        >
                          <div style={{ fontSize: 32 }}>📁</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>{part}</div>
                            <div style={{ fontSize: 11, color: BRAND.stone, marginTop: 2 }}>{count} {count === 1 ? "caja" : "cajas"}</div>
                          </div>
                          <div style={{ fontSize: 16, color: VAULT_BLUE }}>›</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grid de cajas */}
              {cardsToShow.length === 0 && nextParts.length === 0 ? (
                <div style={{ background: CREAM, borderRadius: 14, padding: 40, textAlign: "center", color: BRAND.stone, border: `1px solid ${BRAND.borderSoft}` }}>
                  {items.length === 0
                    ? "Aun no hay cajas registradas. Comienza con + Registrar nueva caja."
                    : hasActiveFilter
                      ? "No hay cajas que coincidan con los filtros."
                      : invPath.length === 0
                        ? "No hay cajas en la raiz."
                        : `No hay cajas directamente en "${invPath[invPath.length - 1]}".`}
                </div>
              ) : cardsToShow.length > 0 && (
                <div>
                  {showFolders && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.stone, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 }}>
                      📦 Cajas {invPath.length === 0 ? "en la raiz" : `directamente en "${invPath[invPath.length - 1]}"`}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                    {cardsToShow.map(c => <CajaCard key={c.id} caja={c} onClick={() => setModal({ type: "caja-detail", data: c })} />)}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    );
  };

  const renderHerramientas = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Select label="Tipo" value={toolFilter.tipo} options={TIPOS_HERRAMIENTA.map(t => ({ value: t, label: cap(t) }))} onChange={e => setToolFilter(s => ({ ...s, tipo: e.target.value }))} emptyLabel="Todos" />
            <Select label="Estado" value={toolFilter.estado} options={ESTADOS_HERRAMIENTA.map(e => ({ value: e, label: estadoHerramienta(e).label }))} onChange={e => setToolFilter(s => ({ ...s, estado: e.target.value }))} emptyLabel="Todos" />
          </div>
          <Select label="Proyecto" value={toolFilter.projectCode} options={PROJECTS.map(p => ({ value: p.short, label: p.short }))} onChange={e => setToolFilter(s => ({ ...s, projectCode: e.target.value }))} emptyLabel="Todos" />
          {canEdit && <Btn style={{ width: "100%" }} onClick={() => setModal({ type: "tool-new" })}>+ Registrar herramienta</Btn>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 160 }}>
              <Select label="Tipo" value={toolFilter.tipo} options={TIPOS_HERRAMIENTA.map(t => ({ value: t, label: cap(t) }))} onChange={e => setToolFilter(s => ({ ...s, tipo: e.target.value }))} emptyLabel="Todos" />
            </div>
            <div style={{ minWidth: 160 }}>
              <Select label="Estado" value={toolFilter.estado} options={ESTADOS_HERRAMIENTA.map(e => ({ value: e, label: estadoHerramienta(e).label }))} onChange={e => setToolFilter(s => ({ ...s, estado: e.target.value }))} emptyLabel="Todos" />
            </div>
            <div style={{ minWidth: 200 }}>
              <Select label="Proyecto" value={toolFilter.projectCode} options={PROJECTS.map(p => ({ value: p.short, label: p.short }))} onChange={e => setToolFilter(s => ({ ...s, projectCode: e.target.value }))} emptyLabel="Todos" />
            </div>
          </div>
          {canEdit && <Btn onClick={() => setModal({ type: "tool-new" })}>+ Registrar herramienta</Btn>}
        </div>
      )}

      {filteredTools.length === 0 ? (
        <div style={{ background: CREAM, borderRadius: 14, padding: 40, textAlign: "center", color: BRAND.stone, border: `1px solid ${BRAND.borderSoft}` }}>
          {tools.length === 0
            ? "Aun no hay herramientas registradas. Comienza con + Registrar herramienta."
            : "No hay herramientas que coincidan con los filtros."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {filteredTools.map(t => <ToolCard key={t.id} tool={t} onClick={() => setModal({ type: "tool-edit", data: t })} />)}
        </div>
      )}
    </div>
  );

  const renderMovimientos = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Select label="Tipo" value={movFilter.tipo} options={[{ value: "entrada", label: "Entrada" }, { value: "salida", label: "Salida" }]} onChange={e => setMovFilter(s => ({ ...s, tipo: e.target.value }))} emptyLabel="Ambos" />
            <Select label="Proyecto" value={movFilter.projectCode} options={PROJECTS.map(p => ({ value: p.short, label: p.short }))} onChange={e => setMovFilter(s => ({ ...s, projectCode: e.target.value }))} emptyLabel="Todos" />
            <Input label="Desde" type="date" value={movFilter.from} onChange={e => setMovFilter(s => ({ ...s, from: e.target.value }))} />
            <Input label="Hasta" type="date" value={movFilter.to} onChange={e => setMovFilter(s => ({ ...s, to: e.target.value }))} />
          </div>
          {canEdit && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Btn variant="warn" style={{ width: "100%" }} onClick={() => setModal({ type: "salida-new" })}>📤 Registrar salida</Btn>
              <Btn variant="success" style={{ width: "100%" }} onClick={() => setModal({ type: "entrada-new" })}>📥 Registrar entrada</Btn>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 140 }}>
              <Select label="Tipo" value={movFilter.tipo} options={[{ value: "entrada", label: "Entrada" }, { value: "salida", label: "Salida" }]} onChange={e => setMovFilter(s => ({ ...s, tipo: e.target.value }))} emptyLabel="Ambos" />
            </div>
            <div style={{ minWidth: 200 }}>
              <Select label="Proyecto" value={movFilter.projectCode} options={PROJECTS.map(p => ({ value: p.short, label: p.short }))} onChange={e => setMovFilter(s => ({ ...s, projectCode: e.target.value }))} emptyLabel="Todos" />
            </div>
            <div style={{ minWidth: 140 }}>
              <Input label="Desde" type="date" value={movFilter.from} onChange={e => setMovFilter(s => ({ ...s, from: e.target.value }))} />
            </div>
            <div style={{ minWidth: 140 }}>
              <Input label="Hasta" type="date" value={movFilter.to} onChange={e => setMovFilter(s => ({ ...s, to: e.target.value }))} />
            </div>
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="success" onClick={() => setModal({ type: "entrada-new" })}>📥 Registrar entrada</Btn>
              <Btn variant="warn" onClick={() => setModal({ type: "salida-new" })}>📤 Registrar salida</Btn>
            </div>
          )}
        </div>
      )}

      {filteredMovements.length === 0 ? (
        <div style={{ background: CREAM, borderRadius: 14, padding: 40, textAlign: "center", color: BRAND.stone, border: `1px solid ${BRAND.borderSoft}` }}>
          {movements.length === 0
            ? "Aun no hay movimientos. Registra una entrada o salida arriba."
            : "No hay movimientos que coincidan con los filtros."}
        </div>
      ) : (
        <div style={{ background: CREAM, borderRadius: 12, border: `1px solid ${BRAND.borderSoft}`, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: isMobile ? 800 : "auto" }}>
            <thead>
              <tr style={{ background: BRAND.beigeLight, textAlign: "left" }}>
                <th style={th}>Fecha</th>
                <th style={th}>Tipo</th>
                <th style={th}>Caja</th>
                <th style={th}>Cantidad</th>
                <th style={th}>Proyecto</th>
                <th style={th}>Maquina</th>
                <th style={th}>Herramienta</th>
                <th style={th}>Solicitado por</th>
                <th style={th}>Notas</th>
                {canEdit && <th style={th}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filteredMovements.map(m => {
                const caja = items.find(i => i.id === m.itemId);
                const tool = tools.find(t => t.id === m.herramientaId);
                const maq = machines.find(mm => mm.id === m.maquinaId);
                const isRev = !!m.reverted;
                const rowStyle = {
                  borderTop: `1px solid ${BRAND.borderSoft}`,
                  ...(isRev ? { opacity: 0.65 } : {}),
                };
                const strike = isRev ? { textDecoration: "line-through" } : {};
                const notasText = isRev
                  ? (m.notas ? `[REVERTIDO] ${m.revertReason || ""} · ${m.notas}` : `[REVERTIDO] ${m.revertReason || ""}`)
                  : (m.notas || "");
                const revTooltip = isRev
                  ? `Revertido por ${m.revertedBy || "—"} el ${fmt(m.revertedAt)}\n${m.revertReason || ""}`
                  : undefined;
                return (
                  <tr key={m.id} style={rowStyle} title={revTooltip}>
                    <td style={{ ...td, ...strike }}>{fmt(m.fecha)}</td>
                    <td style={td}>
                      <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        {m.tipo === "salida"
                          ? <Badge color={BRAND.yellow} bg={BRAND.yellowSoft}>📤 Salida</Badge>
                          : <Badge color={BRAND.green} bg={BRAND.greenSoft}>📥 Entrada</Badge>}
                        {isRev && <Badge color={BRAND.red} bg={BRAND.redSoft}>REVERTIDO</Badge>}
                      </span>
                    </td>
                    <td style={td}>
                      {caja
                        ? <span style={{ fontFamily: "monospace", color: VAULT_BLUE, fontWeight: 600, ...strike }}>{caja.codigo}</span>
                        : <span style={{ color: BRAND.stone }}>—</span>}
                    </td>
                    <td style={{ ...td, fontWeight: 600, ...strike }}>{m.cantidad}</td>
                    <td style={{ ...td, ...strike }}>{m.projectCode ? projLabel(m.projectCode) : "—"}</td>
                    <td style={{ ...td, ...strike }}>{maq?.nombre || "—"}</td>
                    <td style={{ ...td, ...strike }}>{tool ? `${cap(tool.tipo)} · ${tool.nombre}` : "—"}</td>
                    <td style={{ ...td, ...strike }}>{m.solicitadoPor || "—"}</td>
                    <td style={{ ...td, maxWidth: 200, whiteSpace: isMobile ? "nowrap" : "pre-wrap", overflow: isMobile ? "hidden" : "visible", textOverflow: isMobile ? "ellipsis" : "clip", color: isRev ? BRAND.red : BRAND.graphite, fontWeight: isRev ? 600 : 400 }}>{notasText}</td>
                    {canEdit && (
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          {!isRev && (
                            <button
                              type="button"
                              onClick={() => revertirMovimiento(m)}
                              title="Revertir movimiento (mantiene el registro)"
                              style={{
                                padding: "4px 8px", fontSize: 11, fontWeight: 600,
                                background: BRAND.yellowSoft, color: BRAND.yellow,
                                border: `1px solid ${BRAND.yellow}`, borderRadius: 6, cursor: "pointer",
                              }}
                            >↩ Revertir</button>
                          )}
                          <button
                            type="button"
                            onClick={() => eliminarMovimiento(m)}
                            title="Eliminar movimiento (permanente, sin rastro)"
                            style={{
                              padding: "4px 8px", fontSize: 11, fontWeight: 600,
                              background: BRAND.redSoft, color: BRAND.red,
                              border: `1px solid ${BRAND.red}`, borderRadius: 6, cursor: "pointer",
                            }}
                          >🗑 Eliminar</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderConfig = () => {
    const keys = Object.keys({ ...DEFAULT_MIN_STOCK, ...minStock });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ background: VAULT_BLUE + "10", border: `1px solid ${VAULT_BLUE}40`, borderRadius: 10, padding: 14, fontSize: 13, color: VAULT_BLUE_DARK }}>
          ⚙️ Configura el stock minimo de cada subcategoria. Cuando el inventario total de una subcategoria caiga por debajo de este valor, el modulo mostrara una alerta roja en el Resumen.
        </div>

        <div style={{ background: CREAM, borderRadius: 14, padding: isMobile ? 16 : 22, border: `1px solid ${BRAND.borderSoft}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL, marginBottom: 14 }}>Stock minimo por subcategoria</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {keys.map(k => (
              <div key={k}>
                <Input
                  label={subLabel(k)}
                  type="number"
                  min={0}
                  value={minStock[k] ?? 0}
                  onChange={e => saveMinStock({ ...minStock, [k]: Number(e.target.value || 0) })}
                  disabled={!canEdit}
                  hint={`Actual: ${totals.totalUnidadesPorSub[k] || 0} u`}
                />
              </div>
            ))}
          </div>
          {canEdit && (
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => {
                if (confirm("¿Restablecer a los valores por defecto? (30 picas/portapicas, 10 muelas/puertas)")) {
                  saveMinStock(DEFAULT_MIN_STOCK);
                }
              }}>Restablecer defaults</Btn>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Render del modal activo ──
  const renderModal = () => {
    if (!modal) return null;
    const close = () => setModal(null);
    if (modal.type === "caja-new") {
      return <Modal title="Registrar nueva caja" onClose={close} wide>
        <CajaForm items={items} onClose={close} canEdit={canEdit}
          onSave={async (data) => upsertItem(data)} />
      </Modal>;
    }
    if (modal.type === "caja-edit") {
      return <Modal title={`Editar caja — ${modal.data.codigo}`} onClose={close} wide>
        <CajaForm caja={modal.data} items={items} onClose={close} canEdit={canEdit}
          onSave={async (data) => upsertItem(data)}
          onDelete={async (id) => { const ok = await deleteItem(id); if (ok !== false) close(); }} />
      </Modal>;
    }
    if (modal.type === "caja-detail") {
      return <CajaDetail
        caja={items.find(i => i.id === modal.data.id) || modal.data}
        onClose={close}
        onEdit={() => setModal({ type: "caja-edit", data: modal.data })}
        onDespachar={() => setModal({ type: "salida-new", preselected: modal.data })}
        onDelete={async (id) => { const ok = await deleteItem(id); if (ok !== false) close(); }}
        onDuplicate={duplicateItem}
        canEdit={canEdit}
      />;
    }
    if (modal.type === "tool-new") {
      return <Modal title="Registrar herramienta" onClose={close} wide>
        <HerramientaForm onClose={close} canEdit={canEdit}
          onSave={async (data) => upsertTool(data)} />
      </Modal>;
    }
    if (modal.type === "tool-edit") {
      return <Modal title={`Editar herramienta — ${modal.data.nombre}`} onClose={close} wide>
        <HerramientaForm tool={modal.data} onClose={close} canEdit={canEdit}
          onSave={async (data) => upsertTool(data)}
          onDelete={async (id) => { const ok = await deleteTool(id); if (ok !== false) close(); }} />
      </Modal>;
    }
    if (modal.type === "salida-new") {
      return <Modal title="Registrar salida (despacho)" onClose={close} wide>
        <SalidaForm
          items={items}
          tools={tools}
          machines={machines}
          preselectedCaja={modal.preselected}
          userName={userName}
          onClose={close}
          onSave={async (mov) => registrarMovimiento(mov)}
        />
      </Modal>;
    }
    if (modal.type === "entrada-new") {
      return <Modal title="Registrar entrada (recarga)" onClose={close} wide>
        <EntradaForm
          items={items}
          userName={userName}
          onClose={close}
          onSave={async (mov) => registrarMovimiento(mov)}
        />
      </Modal>;
    }
    return null;
  };

  // En mobile: tabs cierran el drawer despues de cambiar de seccion.
  const goTo = (id) => {
    setSec(id);
    if (isMobile) setSbOpen(false);
  };

  // ── LAYOUT principal ──
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: FONT.body, background: BEIGE, color: CHARCOAL, position: "relative", overflow: "hidden" }}>
      {/* Backdrop solo en mobile cuando el drawer esta abierto */}
      {isMobile && sbOpen && (
        <div
          onClick={() => setSbOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            zIndex: 90,
          }}
        />
      )}

      {/* Sidebar oscuro — drawer en mobile, fijo a la izquierda en desktop */}
      <div style={{
        width: isMobile ? 260 : (sb ? 240 : 60),
        background: DARK_BG,
        color: BRAND.darkText,
        transition: isMobile ? "transform .25s ease" : "width .2s",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        ...(isMobile ? {
          position: "fixed",
          top: 0, bottom: 0, left: 0,
          transform: sbOpen ? "translateX(0)" : "translateX(-100%)",
          zIndex: 100,
          boxShadow: sbOpen ? "0 0 30px rgba(0,0,0,0.5)" : "none",
        } : {}),
      }}>
        <div style={{
          padding: sb ? "20px 16px" : "20px 12px",
          borderBottom: `1px solid ${DARK_BORDER}`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <button onClick={() => isMobile ? setSbOpen(false) : setSb(!sb)} style={{
            background: "none", border: "none", color: BRAND.darkTextMuted,
            fontSize: 20, cursor: "pointer", flexShrink: 0,
          }}>{isMobile ? "✕" : "☰"}</button>
          {(sb || isMobile) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Logo size={28} showText={false} />
              <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: 1.5, color: BRAND.darkText, marginTop: 4 }}>
                GEODRILL VAULT
              </div>
              <div style={{ fontSize: 9, letterSpacing: 2, color: BRAND.darkTextMuted, fontWeight: 600 }}>
                BODEGA DE ALTO VALOR
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "8px 0", flex: 1, marginTop: 8 }}>
          {[
            { id: "resumen",      icon: "📊", label: "Resumen" },
            { id: "inventario",   icon: "📦", label: "Inventario" },
            { id: "herramientas", icon: "🔧", label: "Herramientas" },
            { id: "movimientos",  icon: "📋", label: "Movimientos" },
            { id: "config",       icon: "⚙️", label: "Configuracion" },
          ].map(n => (
            <button key={n.id} onClick={() => goTo(n.id)} style={{
              display: "flex", alignItems: "center", gap: 12, width: "100%",
              padding: (sb || isMobile) ? "11px 20px" : "11px 18px",
              minHeight: isMobile ? 44 : "auto",
              background: sec === n.id ? "rgba(15,76,117,0.30)" : "transparent",
              border: "none",
              color: sec === n.id ? "#fff" : BRAND.darkTextMuted,
              cursor: "pointer",
              fontSize: 14, textAlign: "left",
              borderLeft: sec === n.id ? `3px solid ${VAULT_BLUE}` : "3px solid transparent",
              fontFamily: "inherit",
              fontWeight: sec === n.id ? 600 : 500,
              transition: "all .15s",
            }}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>{(sb || isMobile) && <span>{n.label}</span>}
            </button>
          ))}
        </div>

        {(sb || isMobile) && (
          <div style={{ padding: 12, borderTop: `1px solid ${DARK_BORDER}`, display: "flex", flexDirection: "column", gap: 6 }}>
            {onBack && (
              <button onClick={onBack} style={{
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${DARK_BORDER}`,
                borderRadius: 8,
                color: BRAND.darkTextMuted,
                padding: isMobile ? "11px 12px" : "9px 12px",
                cursor: "pointer",
                fontSize: 12, fontWeight: 600, textAlign: "left", fontFamily: "inherit",
              }}>← Volver al panel</button>
            )}
            {onLogout && (
              <button onClick={onLogout} style={{
                background: "rgba(192,57,43,0.15)",
                border: "1px solid rgba(192,57,43,0.4)",
                borderRadius: 8,
                color: "#F0AAA0",
                padding: isMobile ? "11px 12px" : "9px 12px",
                cursor: "pointer",
                fontSize: 12, fontWeight: 600, textAlign: "left", fontFamily: "inherit",
              }}>Cerrar sesion</button>
            )}
            <div style={{ fontSize: 11, color: "#7A7268", marginTop: 4, fontWeight: 500, lineHeight: 1.4 }}>
              {userName || "Usuario"}<br />
              <span style={{ color: VAULT_BLUE === "#0F4C75" ? "#5BA8E0" : VAULT_BLUE, fontWeight: 600 }}>
                {userRole === "admin" ? "Administrador"
                  : userRole === "tesoreria" ? "Tesoreria"
                  : userRole === "almacenista" ? "Encargado de Almacen"
                  : userRole}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", width: isMobile ? "100%" : "auto" }}>
        <div style={{
          padding: isMobile ? "12px 16px" : "22px 32px",
          borderBottom: `1px solid ${BORDER}`,
          background: CREAM,
          display: "flex",
          justifyContent: "space-between",
          alignItems: isMobile ? "stretch" : "center",
          flexDirection: isMobile ? "column" : "row",
          flexWrap: isMobile ? "nowrap" : "wrap",
          gap: isMobile ? 10 : 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {isMobile && (
              <button onClick={() => setSbOpen(true)} aria-label="Abrir menu" style={{
                background: VAULT_BLUE, color: "#fff",
                border: "none", borderRadius: 8,
                width: 40, height: 40,
                fontSize: 20, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, fontFamily: "inherit",
              }}>☰</button>
            )}
            <div style={{ minWidth: 0 }}>
              <h2 style={{
                margin: 0,
                fontSize: isMobile ? 18 : 22,
                fontWeight: 800, color: CHARCOAL,
                letterSpacing: -0.3,
                lineHeight: 1.2,
              }}>
                {sec === "resumen" ? (isMobile ? "Resumen" : "Resumen — GeoDrill Vault")
                  : sec === "inventario" ? "Inventario de cajas"
                  : sec === "herramientas" ? (isMobile ? "Herramientas" : "Herramientas de perforacion")
                  : sec === "movimientos" ? (isMobile ? "Movimientos" : "Movimientos (entradas y salidas)")
                  : "Configuracion"}
              </h2>
              {!isMobile && (
                <span style={{ fontSize: 13, color: VAULT_BLUE, fontWeight: 600, letterSpacing: 0.3 }}>
                  Bodega de alto valor · Grupo Geotecnica
                </span>
              )}
            </div>
          </div>
          <div style={{
            display: "flex",
            gap: 8,
            ...(isMobile ? {
              overflowX: "auto",
              flexWrap: "nowrap",
              WebkitOverflowScrolling: "touch",
              paddingBottom: 2,
            } : {}),
          }}>
            <Badge color={VAULT_BLUE}>{items.length} caja{items.length === 1 ? "" : "s"}</Badge>
            <Badge color={BRAND.green}>{tools.length} herramienta{tools.length === 1 ? "" : "s"}</Badge>
            <Badge color={BRAND.graphite}>{movements.length} movimiento{movements.length === 1 ? "" : "s"}</Badge>
          </div>
        </div>
        <div style={{ padding: isMobile ? 16 : 28 }}>
          {!loaded ? (
            <div style={{ textAlign: "center", padding: 40, color: BRAND.stone }}>Cargando inventario…</div>
          ) : (
            sec === "resumen"       ? renderResumen() :
            sec === "inventario"    ? renderInventario() :
            sec === "herramientas"  ? renderHerramientas() :
            sec === "movimientos"   ? renderMovimientos() :
            sec === "config"        ? renderConfig() :
            null
          )}
        </div>

        {/* Footer del modulo — autoria */}
        <div style={{
          borderTop: `1px solid ${BRAND.borderSoft}`,
          padding: isMobile ? "12px 16px" : "16px 32px",
          marginTop: 12,
          textAlign: "center",
          background: BRAND.cream,
        }}>
          <div style={{ fontSize: 11, color: BRAND.stone, letterSpacing: 0.5 }}>
            🗄️ <b style={{ color: VAULT_BLUE }}>GeoDrill Vault</b> · Modulo de inventario de alto valor
          </div>
          <div style={{ fontSize: 10.5, color: BRAND.ash, marginTop: 4, letterSpacing: 0.3 }}>
            Creado por <span style={{ color: BRAND.graphite, fontWeight: 600 }}>Lic. Gerson Trochez</span> &amp; <span style={{ color: BRAND.graphite, fontWeight: 600 }}>Ronald Arias</span>
          </div>
        </div>
      </div>

      {renderModal()}
    </div>
  );
}

// ── Estilos compartidos ──
const th = { padding: "10px 12px", fontSize: 12, fontWeight: 700, color: BRAND.graphite, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" };
const td = { padding: "10px 12px", color: CHARCOAL, verticalAlign: "top" };

// =====================================================================
// CARDS auxiliares (declaradas fuera del componente para no recrearlas en cada render)
// =====================================================================
function CajaCard({ caja, onClick }) {
  const estado = cajaEstado(caja);
  const ratio = caja.cantidadOriginal > 0 ? caja.cantidadActual / caja.cantidadOriginal : 0;
  return (
    <button onClick={onClick} style={{
      background: CREAM,
      border: `1px solid ${BRAND.borderSoft}`,
      borderRadius: 14,
      padding: 14,
      textAlign: "left",
      cursor: "pointer",
      fontFamily: "inherit",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      boxShadow: BRAND.shadowSm,
      transition: "transform .1s, box-shadow .15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = BRAND.shadow; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = BRAND.shadowSm; }}
    >
      <DefaultIllustration caja={caja} height={110} showBrand={true} />
      <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 800, color: VAULT_BLUE, letterSpacing: 0.5 }}>
        {caja.codigo}
      </div>
      <div style={{ fontSize: 12, color: BRAND.graphite }}>
        {caja.marca} · {tipoLabel(caja.tipo)}{caja.tamano ? ` · ${cap(caja.tamano)}` : ""}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: estado.color }}>
          {caja.cantidadActual}<span style={{ fontSize: 12, color: BRAND.stone, fontWeight: 500 }}>/{caja.cantidadOriginal}</span>
        </div>
        <Badge color={estado.color} bg={estado.bg}>{estado.label}</Badge>
      </div>
      <div style={{ height: 6, background: BRAND.borderSoft, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%`, height: "100%", background: estado.color }} />
      </div>
      {caja.ubicacion && <div style={{ fontSize: 11, color: BRAND.stone }}>📍 {caja.ubicacion}</div>}
    </button>
  );
}

function ToolCard({ tool, onClick }) {
  const est = estadoHerramienta(tool.estado);
  const icon = tool.tipo === "bucket" ? "🪣" : tool.tipo === "broca" ? "🔩" : tool.tipo === "rompebolon" ? "🪨" : "🔧";
  return (
    <button onClick={onClick} style={{
      background: CREAM,
      border: `1px solid ${BRAND.borderSoft}`,
      borderRadius: 14,
      padding: 14,
      textAlign: "left",
      cursor: "pointer",
      fontFamily: "inherit",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      boxShadow: BRAND.shadowSm,
      transition: "transform .1s, box-shadow .15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = BRAND.shadow; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = BRAND.shadowSm; }}
    >
      <div style={{
        background: BRAND.beigeLight,
        borderRadius: 10,
        height: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 36,
        color: BRAND.ash,
      }}>{icon}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Badge color={VAULT_BLUE}>{cap(tool.tipo)}</Badge>
        <Badge color={est.color} bg={est.bg}>{est.label}</Badge>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: CHARCOAL }}>{tool.nombre}</div>
      {tool.diametro != null && tool.diametro !== "" && (
        <div style={{ fontSize: 12, color: BRAND.graphite }}>⌀ {tool.diametro} {tool.diametroUnidad || ""}</div>
      )}
      <div style={{ fontSize: 11, color: BRAND.stone }}>
        {tool.projectCode ? `📍 ${projLabel(tool.projectCode)}` : "🏠 En bodega"}
      </div>
    </button>
  );
}
