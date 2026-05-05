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
