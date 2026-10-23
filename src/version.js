// =====================================================================
// AVISO DE VERSIÓN NUEVA (23-oct-2026)
// =====================================================================
// GitHub Pages sirve index.html con `cache-control: max-age=600`: después de
// publicar, el navegador puede seguir mostrando la versión vieja hasta 10
// minutos (Gerson: "no me salen los cambios"). Cada 2 min y al volver a la
// pestaña se lee index.html SIN caché y se compara el bundle que trae con el
// que está corriendo. Si cambió: en la tablet kiosco (rol marcaje) se recarga
// sola; en los demás sale una pastilla "Hay una versión nueva · Actualizar".
// =====================================================================
const bundleActual = () => {
  const s = [...document.querySelectorAll('script[type="module"][src]')].find(x => /assets\/index-[^/]+\.js/.test(x.src));
  return s ? s.src.match(/assets\/index-[^/]+\.js/)[0] : null;
};
const esKiosco = () => { try { return JSON.parse(sessionStorage.getItem("gt-session") || "null")?.role === "marcaje"; } catch { return false; } };
let avisado = false;
const mostrarAviso = () => {
  if (avisado || document.getElementById("gt-version-nueva")) return;
  avisado = true;
  const b = document.createElement("button");
  b.id = "gt-version-nueva";
  b.type = "button";
  b.textContent = "Hay una versión nueva del sistema · Actualizar";
  b.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:10001;padding:12px 22px;border-radius:999px;border:none;background:#C75F1F;color:#fff;font:700 13.5px/1 'Inter',system-ui,sans-serif;box-shadow:0 10px 30px rgba(44,42,40,.28);cursor:pointer";
  b.onclick = () => location.reload();
  document.body.appendChild(b);
};
async function revisar() {
  const actual = bundleActual();
  if (!actual || document.visibilityState !== "visible") return;   // en dev no hay bundle
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const nuevo = ((await r.text()).match(/assets\/index-[^"']+\.js/) || [])[0];
    if (!nuevo || nuevo === actual) return;
    const enUso = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (esKiosco() && !enUso) location.reload();
    else mostrarAviso();
  } catch { /* sin red: se reintenta en la próxima vuelta */ }
}
export function vigilarVersion() {
  setInterval(revisar, 120000);
  document.addEventListener("visibilitychange", revisar);
  window.addEventListener("focus", revisar);
  setTimeout(revisar, 15000);
}
