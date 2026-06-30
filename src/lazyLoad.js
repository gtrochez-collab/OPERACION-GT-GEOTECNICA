// =====================================================================
// CARGA DINAMICA DE MODULOS — manejo de "stale chunk" tras deploy
// =====================================================================
// Vite/Rollup genera chunks con hash de contenido (ej: jspdf.es.min-XYZ.js).
// Cuando hacemos un deploy nuevo, el hash cambia. Si un usuario tiene la
// app abierta de antes del deploy, su index.html cacheado referencia el
// hash viejo. Cuando intenta usar el modulo dinamico (jspdf, pdf-lib),
// el browser pide la URL vieja, GitHub Pages devuelve 404, y dispara:
//
//   "Failed to fetch dynamically imported module: .../jspdf.es.min-OLD.js"
//
// La solucion correcta es recargar la pagina para que el navegador baje
// el index.html nuevo (con las referencias correctas). Este helper
// detecta ese error puntual, pide al usuario recargar, y dispara el
// reload si acepta.
//
// Cualquier otro error se re-throw normal para que el caller lo maneje.
// =====================================================================

export const safeDynamicImport = async (loader, label = "modulo") => {
  try {
    return await loader();
  } catch (err) {
    const msg = String(err?.message || err);
    const isStaleChunk =
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("Importing a module script failed") ||
      msg.includes("error loading dynamically imported module");
    if (isStaleChunk) {
      const reload = confirm(
        `⚠️ El sistema se actualizo mientras lo tenias abierto.\n\n` +
        `Hay que recargar la pagina para que funcione la nueva version.\n\n` +
        `IMPORTANTE: si tenes cambios sin guardar (formularios abiertos,\n` +
        `archivos a medio subir, etc.) hace click en CANCELAR y guarda\n` +
        `primero. Si ya guardaste todo, hace OK para recargar.\n\n` +
        `¿Recargar ahora?`
      );
      if (reload) {
        window.location.reload();
      }
      // Marcamos el error para que el caller no muestre otro alert encima
      const wrap = new Error(`Recarga necesaria (${label})`);
      wrap.isStaleChunk = true;
      throw wrap;
    }
    throw err;
  }
};
