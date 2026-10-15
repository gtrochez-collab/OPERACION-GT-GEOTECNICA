// =====================================================================
// LOGO GEOTECNICA SOLUCIONES
// =====================================================================
// Usa los archivos oficiales en public/brand/
//   - logo-color.png  (logo a color para fondos claros)
//   - logo-gris.png   (logo en gris/charcoal para uso monocromatico)
// =====================================================================

const BASE = import.meta.env.BASE_URL || "/";

export default function Logo({ size = 56, color = "color", showText = true }) {
  const src = color === "gris" || color === "gray" ? `${BASE}brand/logo-gris.png` : `${BASE}brand/logo-color.png`;
  // El logo oficial ya incluye el texto "GEOTECNICA / SOLUCIONES" al lado
  // de la G estriada. Si solo se pide la marca G (showText=false), recortamos
  // visualmente con object-fit / clip-path simulando solo la G.
  if (!showText) {
    // Renderiza solo la G (recortando el texto a la derecha) usando object-position
    return (
      <div
        style={{
          width: size,
          height: size,
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Geotecnica"
      >
        <img
          src={src}
          alt=""
          style={{
            // El logo oficial es 1462x540 aprox. La G ocupa los primeros ~520px.
            // Mostramos solo la G (recortamos a la izquierda).
            height: size,
            width: "auto",
            objectFit: "contain",
            objectPosition: "left center",
            // Recortar para mostrar solo la G:
            clipPath: "inset(0 65% 0 0)",
            transform: "translateX(0)",
          }}
        />
      </div>
    );
  }

  // Logo completo (G + texto)
  // Mantengo proporcion 1462x540 ~ 2.7:1, asi que ancho = size * 2.7
  return (
    <img
      src={src}
      alt="Geotecnica Soluciones"
      style={{
        height: size,
        width: "auto",
        display: "block",
      }}
    />
  );
}

// Marca del SISTEMA (GeoCore, 15-oct-2026): curvas de nivel naranja sobre
// carbón — las mismas del login. El logo de Geotecnica sigue siendo `Logo`.
export function GeoCoreMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden style={{ flexShrink: 0, display: "block" }}>
      <rect width="56" height="56" rx="14" fill="#2C2A28" />
      <path d="M10 24c6-8 12-8 18-3s12 5 18-3" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10 34c6-8 12-8 18-3s12 5 18-3" fill="none" stroke="#E8762D" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="28" cy="31" r="3.6" fill="#E8762D" />
    </svg>
  );
}

// Sello "GeoCore" (marca + nombre) para login y panel.
export function GeoCoreSello({ size = 30, fontSize = 17 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <GeoCoreMark size={size} />
      <span style={{ font: `800 ${fontSize}px/1 var(--display, "Plus Jakarta Sans", sans-serif)`, letterSpacing: "-.02em", color: "#2C2A28" }}>
        Geo<span style={{ color: "#E8762D" }}>Core</span>
      </span>
    </span>
  );
}
