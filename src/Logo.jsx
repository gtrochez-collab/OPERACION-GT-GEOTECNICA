// =====================================================================
// LOGO GEOTECNICA SOLUCIONES
// =====================================================================
// SVG inline que aproxima el logo corporativo (G con franjas horizontales).
// Estilo: G estriada en naranja + texto "GEOTECNICA / SOLUCIONES" gris.
// Para reemplazar con el logo oficial, dejar un PNG/SVG en
//   public/brand/geotecnica-logo.png
// y cambiar este componente para que use <img>.
// =====================================================================
import { BRAND, FONT } from "./theme.js";

export default function Logo({ size = 56, color = "orange", showText = true, layout = "horizontal" }) {
  const stripeColor = color === "white" ? "#FFFFFF" : color === "gray" ? BRAND.charcoal : BRAND.orange;
  const textColor = color === "white" ? "#FFFFFF" : BRAND.charcoal;
  const subColor = color === "white" ? "rgba(255,255,255,0.7)" : BRAND.stone;

  const isVertical = layout === "vertical";

  return (
    <div
      style={{
        display: "flex",
        alignItems: isVertical ? "center" : "center",
        flexDirection: isVertical ? "column" : "row",
        gap: isVertical ? 12 : Math.round(size * 0.28),
      }}
    >
      <GLogoMark size={size} color={stripeColor} />
      {showText && (
        <div style={{ textAlign: isVertical ? "center" : "left", lineHeight: 1 }}>
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: Math.round(size * 0.36),
              fontWeight: 800,
              color: textColor,
              letterSpacing: 1.2,
              lineHeight: 1,
            }}
          >
            GEOTECNICA
          </div>
          <div
            style={{
              fontFamily: FONT.display,
              fontSize: Math.round(size * 0.22),
              fontWeight: 500,
              color: subColor,
              letterSpacing: Math.max(2, Math.round(size * 0.06)),
              marginTop: Math.round(size * 0.08),
            }}
          >
            SOLUCIONES
          </div>
        </div>
      )}
    </div>
  );
}

// G estriada — version SVG inline
function GLogoMark({ size, color }) {
  const id = "stripes-" + color.replace("#", "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Geotecnica">
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width="100" height="7">
          <rect x="0" y="0" width="100" height="3.2" fill={color} />
        </pattern>
      </defs>
      <text
        x="50"
        y="82"
        fontSize="118"
        fontFamily='"Manrope", "Inter", "Arial Black", sans-serif'
        fontWeight="900"
        fill={`url(#${id})`}
        textAnchor="middle"
        letterSpacing="-4"
      >
        G
      </text>
    </svg>
  );
}
