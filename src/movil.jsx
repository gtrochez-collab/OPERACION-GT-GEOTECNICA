// ── GeoCore en el CELULAR (3-nov-2026, Gerson: "que en el celular sea una app
// móvil, no la página de la computadora achicada; el menú a la izquierda con
// las tres barritas; como la Apple Store") ──────────────────────────────────
// Piezas compartidas por TODOS los módulos cuando la pantalla es de teléfono
// (< 768 px). En la computadora no se usan: cada módulo sigue con su
// encabezado y sus pestañas de siempre.
//   <BarraMovil>   barra superior fija: ☰ · ícono + nombre del módulo · iniciales
//   <MenuMovil>    cajón que entra desde la izquierda: secciones del módulo en
//                  filas grandes, un control extra (ej. Subterra/Geotecnica),
//                  Volver al panel y Cerrar sesión
//   <TituloMovil>  título grande de la sección, estilo iOS ("Products")
// MOVIL_CSS se monta junto con GT_CSS (cada módulo tiene su propio <style>).
import { useEffect } from "react";
import { createPortal } from "react-dom";

export const MOVIL_CSS = `
.gm-barra{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px;height:56px;padding:0 12px;background:rgba(249,249,248,.86);backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);border-bottom:1px solid rgba(44,42,40,.07);flex-shrink:0}
.gm-boton{width:40px;height:40px;border-radius:12px;border:none;background:transparent;display:inline-flex;align-items:center;justify-content:center;color:#2C2A28;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent}
.gm-boton:active{background:rgba(44,42,40,.07)}
.gm-fondo{position:fixed;inset:0;z-index:9000;background:rgba(44,42,40,.32);animation:gmFondo .22s ease both}
.gm-cajon{position:fixed;top:0;bottom:0;left:0;z-index:9001;width:min(86vw,340px);background:#F9F9F8;box-shadow:12px 0 40px rgba(44,42,40,.18);display:flex;flex-direction:column;animation:gmCajon .32s cubic-bezier(.32,.72,0,1) both;padding-bottom:env(safe-area-inset-bottom)}
.gm-fila{display:flex;align-items:center;gap:12px;width:100%;min-height:50px;padding:0 14px;border:none;border-radius:14px;background:transparent;color:#2C2A28;font:600 16px/1.2 var(--sans,Inter,sans-serif);text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}
.gm-fila:active{background:rgba(44,42,40,.06)}
.gm-fila[aria-current="page"]{background:rgba(232,118,45,.12);color:#A94E16;font-weight:800}
.gm-titulo{font:800 30px/1.1 var(--display,'Plus Jakarta Sans',sans-serif);letter-spacing:-.025em;color:#2C2A28;margin:6px 2px 14px}
@keyframes gmFondo{from{opacity:0}}
@keyframes gmCajon{from{transform:translateX(-100%)}}
@media (prefers-reduced-motion: reduce){.gm-fondo,.gm-cajon{animation:none}}
`;

const iniciales = (nombre) => {
  const p = String(nombre || "").replace(/^(lic|ing|arq|dr|dra)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((p[0] || "?")[0] + (p[1] ? p[1][0] : "")).toUpperCase();
};

export const IcoMenu = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>;

// Barra superior. `icono` es un nodo (svg) del módulo; `derecha` reemplaza
// las iniciales si el módulo necesita otra cosa ahí.
export const BarraMovil = ({ titulo, icono, onMenu, usuario, derecha, badge = 0 }) => (
  <div className="gm-barra">
    <button type="button" className="gm-boton" onClick={onMenu} aria-label="Abrir menú" style={{ position: "relative" }}>
      <IcoMenu />
      {badge > 0 && <span style={{ position: "absolute", top: 6, right: 5, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#E8762D", color: "#fff", font: "800 10px/16px var(--sans)", boxSizing: "border-box" }}>{badge}</span>}
    </button>
    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {icono && <span style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(232,118,45,.12)", color: "#C75F1F", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icono}</span>}
      <span style={{ font: "800 17px/1 var(--display)", color: "#2C2A28", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</span>
    </div>
    {derecha !== undefined ? derecha : <span title={usuario} style={{ width: 34, height: 34, margin: 3, borderRadius: "50%", background: "#2C2A28", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 12.5px/1 var(--sans)", flexShrink: 0 }}>{iniciales(usuario)}</span>}
  </div>
);

// Cajón lateral. secciones: [{id, label, badge?}]
export const MenuMovil = ({ abierto, onClose, titulo, icono, subtitulo, secciones = [], activa, onElegir, extra, usuario, rol, onPanel, panelLabel = "Volver al panel", onLogout }) => {
  useEffect(() => {
    if (!abierto) return;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [abierto, onClose]);
  if (!abierto) return null;
  const elegir = (id) => { onElegir?.(id); onClose(); };
  return createPortal(<>
    <div className="gm-fondo" onClick={onClose} aria-hidden />
    <nav className="gm-cajon" aria-label={`Menú de ${titulo}`}>
      <div style={{ padding: "18px 16px 12px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(44,42,40,.07)" }}>
        {icono && <span style={{ width: 42, height: 42, borderRadius: 13, background: "rgba(232,118,45,.12)", color: "#C75F1F", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icono}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 20px/1.1 var(--display)", color: "#2C2A28", letterSpacing: "-.01em" }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 3 }}>{subtitulo}</div>}
        </div>
        <button type="button" className="gm-boton" onClick={onClose} aria-label="Cerrar menú" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(44,42,40,.06)", fontSize: 15, color: "#6E6862" }}>✕</button>
      </div>
      {extra && <div style={{ padding: "12px 16px 4px" }}>{extra}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {secciones.map(s => <button key={s.id} type="button" className="gm-fila" aria-current={s.id === activa ? "page" : undefined} onClick={() => elegir(s.id)}>
          <span style={{ flex: 1 }}>{s.label}</span>
          {s.badge > 0 && <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, background: "#E8762D", color: "#fff", font: "800 12px/22px var(--sans)", textAlign: "center", boxSizing: "border-box" }}>{s.badge}</span>}
          {s.id !== activa && <span style={{ color: "#C9C3BA", fontSize: 18 }}>›</span>}
        </button>)}
      </div>
      <div style={{ padding: "10px 10px 14px", borderTop: "1px solid rgba(44,42,40,.07)", display: "flex", flexDirection: "column", gap: 2 }}>
        {usuario && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 10px" }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#2C2A28", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 12.5px/1 var(--sans)", flexShrink: 0 }}>{iniciales(usuario)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#2C2A28", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{usuario}</div>
            {rol && <div style={{ fontSize: 12, color: "#6E6862" }}>{rol}</div>}
          </div>
        </div>}
        {onPanel && <button type="button" className="gm-fila" onClick={() => { onClose(); onPanel(); }}><span style={{ width: 22, textAlign: "center", color: "#6E6862" }}>←</span>{panelLabel}</button>}
        {onLogout && <button type="button" className="gm-fila" onClick={() => { onClose(); onLogout(); }} style={{ color: "#B03024" }}><span style={{ width: 22, textAlign: "center" }}>⎋</span>Cerrar sesión</button>}
      </div>
    </nav>
  </>, document.body);
};

export const TituloMovil = ({ children, sub }) => <div style={{ margin: "4px 2px 14px" }}>
  <h1 className="gm-titulo" style={{ margin: 0 }}>{children}</h1>
  {sub && <div style={{ fontSize: 13.5, color: "#6E6862", marginTop: 4 }}>{sub}</div>}
</div>;
