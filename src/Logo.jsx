// =====================================================================
// LOGO GEOTECNICA SOLUCIONES
// =====================================================================
// Usa los archivos oficiales en public/brand/
//   - logo-color.png  (logo a color para fondos claros)
//   - logo-gris.png   (logo en gris/charcoal para uso monocromatico)
// =====================================================================

import { esSV } from "./operacion.js";

const BASE = import.meta.env.BASE_URL || "/";

// Logo de la EMPRESA según la operación (9-nov-2026, pedido de Gerson: "cuando
// entrás a El Salvador, arriba a la izquierda que diga Subterra"). En Honduras
// es Geotecnica Soluciones (los archivos oficiales de abajo); en El Salvador la
// única empresa es Subterra, así que se arma el lockup horizontal con la marca
// redonda de `brand/subterra.png` (el archivo oficial es vertical: la marca
// ocupa el 70 % de arriba y el texto va abajo, ilegible a 40 px de alto).
function LogoSubterra({ size, showText }) {
  const marca = (
    <div style={{ width: size, height: size, overflow: "hidden", position: "relative", flexShrink: 0 }} aria-label="Subterra">
      <img src={`${BASE}brand/subterra.png`} alt="" style={{ position: "absolute", top: 0, left: -size * 0.212, height: size * 1.414, width: "auto", display: "block" }} />
    </div>
  );
  if (!showText) return marca;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.22 }} role="img" aria-label="Subterra · A Geotecnica Group Company">
      {marca}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: size * 0.06, lineHeight: 1 }}>
        <span style={{ font: `700 ${size * 0.38}px/1 var(--sans, Inter, sans-serif)`, letterSpacing: ".2em", color: "#6B6B70", whiteSpace: "nowrap" }}>SUBTERRA</span>
        <span style={{ font: `italic 500 ${size * 0.19}px/1 var(--sans, Inter, sans-serif)`, color: "#E8762D", whiteSpace: "nowrap" }}>A Geotecnica Group Company</span>
      </div>
    </div>
  );
}

export default function Logo({ size = 56, color = "color", showText = true }) {
  if (esSV) return <LogoSubterra size={size} showText={showText} />;
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
