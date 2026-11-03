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
import { useEffect, useState, createContext, useContext } from "react";
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
/* Barra INFERIOR flotante (3-nov-2026, como la Apple Store): pastilla con
   Inicio + los módulos principales, y el botón redondo aparte abre el menú
   con todos. El contenido deja --gm-inferior libre abajo. */
:root{--gm-inferior:calc(84px + env(safe-area-inset-bottom))}
.gm-inferior{position:fixed;left:0;right:0;bottom:calc(12px + env(safe-area-inset-bottom));z-index:40;display:flex;align-items:center;justify-content:center;gap:10px;padding:0 14px;pointer-events:none}
.gm-pastilla{pointer-events:auto;flex:1;max-width:330px;height:62px;display:flex;align-items:stretch;padding:5px;border-radius:999px;background:rgba(249,249,248,.82);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 0 0 1px rgba(44,42,40,.07),0 12px 34px rgba(44,42,40,.16)}
.gm-tab{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:none;background:transparent;border-radius:999px;color:#6E6862;font:600 10px/1 var(--sans,Inter,sans-serif);cursor:pointer;-webkit-tap-highlight-color:transparent;padding:0 2px;position:relative}
.gm-tab>span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gm-tab[aria-current="page"]{background:rgba(44,42,40,.07);color:#C75F1F;font-weight:800}
.gm-tab:active{transform:scale(.96)}
.gm-redondo{pointer-events:auto;width:62px;height:62px;border-radius:50%;border:none;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;color:#2C2A28;background:rgba(249,249,248,.82);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 0 0 1px rgba(44,42,40,.07),0 12px 34px rgba(44,42,40,.16);cursor:pointer;-webkit-tap-highlight-color:transparent;position:relative}
.gm-redondo:active{transform:scale(.94)}
.gm-puntito{position:absolute;top:7px;right:calc(50% - 16px);min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#E8762D;color:#fff;font:800 10px/16px var(--sans,Inter,sans-serif);text-align:center;box-sizing:border-box}
@media (max-width:767px){.gm-con-barra>*{box-sizing:border-box !important;padding-bottom:var(--gm-inferior) !important}}
@keyframes gmFondo{from{opacity:0}}
@keyframes gmPush{from{transform:translateX(28px);opacity:.0}}
@keyframes gmBrillo{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}
.gm-esq{border-radius:12px;background:#ECEBE8 linear-gradient(90deg,#ECEBE8 0,#F5F4F2 50%,#ECEBE8 100%) no-repeat;background-size:200px 100%;animation:gmBrillo 1.2s ease-in-out infinite}
.gm-grupo{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(44,42,40,.05)}
.gm-item{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:8px 14px;border:none;background:#fff;text-align:left;cursor:pointer;font-family:inherit;color:#2C2A28;-webkit-tap-highlight-color:transparent;position:relative}
.gm-item+.gm-item::before{content:"";position:absolute;top:0;left:62px;right:0;height:1px;background:rgba(44,42,40,.08)}
.gm-item:active{background:#F2F1EF}
.gm-encab{font:700 12px/1 var(--sans,Inter,sans-serif);letter-spacing:.04em;text-transform:uppercase;color:#8A847D;margin:18px 16px 8px}
.gm-scroll-x{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -14px;padding:0 14px}
.gm-scroll-x::-webkit-scrollbar{display:none}
@media (max-width:767px){.gm-tira{flex-wrap:nowrap !important;overflow-x:auto;scrollbar-width:none;padding:8px 4px !important;gap:0 !important}.gm-tira::-webkit-scrollbar{display:none}.gm-tira>*{flex:0 0 auto !important;padding:4px 14px !important}.gm-tira>*+*{border-left:1px solid rgba(44,42,40,.08) !important}}
@media (max-width:767px){.gt-entra-modulo{animation:gmPush .34s cubic-bezier(.32,.72,0,1) both !important}}
@keyframes gmCajon{from{transform:translateX(-100%)}}
@media (prefers-reduced-motion: reduce){.gm-fondo,.gm-cajon,.gt-entra-modulo,.gm-esq{animation:none !important}}
`;

// Los módulos de la app (los pone App.jsx): el menú ☰ de cualquier módulo los
// lista para saltar de uno a otro sin volver al Inicio.
export const AppMovilContext = createContext({ modulos: [], actual: null, abrir: null, inicio: null, usuario: "", rol: "", logout: null });

export const iniciales = (nombre) => {
  const p = String(nombre || "").replace(/^(lic|ing|arq|dr|dra)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  return ((p[0] || "?")[0] + (p[1] ? p[1][0] : "")).toUpperCase();
};

export const IcoMenu = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 7h16M4 12h16M4 17h16" /></svg>;

// Barra superior. `icono` es un nodo (svg) del módulo; `derecha` reemplaza
// las iniciales si el módulo necesita otra cosa ahí.
export const BarraMovil = ({ titulo, icono, iconoLibre = false, onMenu, usuario, derecha, badge = 0 }) => (
  <div className="gm-barra">
    <button type="button" className="gm-boton" onClick={onMenu} aria-label="Abrir menú" style={{ position: "relative" }}>
      <IcoMenu />
      {badge > 0 && <span style={{ position: "absolute", top: 6, right: 5, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "#E8762D", color: "#fff", font: "800 10px/16px var(--sans, Inter, sans-serif)", boxSizing: "border-box" }}>{badge}</span>}
    </button>
    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      {icono && (iconoLibre ? icono : <span style={{ width: 28, height: 28, borderRadius: 9, background: "rgba(232,118,45,.12)", color: "#C75F1F", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icono}</span>)}
      <span style={{ font: "800 17px/1 var(--display, 'Plus Jakarta Sans', 'Manrope', sans-serif)", color: "#2C2A28", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</span>
    </div>
    {derecha !== undefined ? derecha : <span title={usuario} style={{ width: 34, height: 34, margin: 3, borderRadius: "50%", background: "#2C2A28", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 12.5px/1 var(--sans, Inter, sans-serif)", flexShrink: 0 }}>{iniciales(usuario)}</span>}
  </div>
);

// Cajón lateral. secciones: [{id, label, badge?}]
export const MenuMovil = ({ abierto, onClose, titulo, icono, iconoLibre = false, subtitulo, secciones = [], activa, onElegir, extra, usuario, rol, onPanel, panelLabel = "Inicio", onLogout }) => {
  const app = useContext(AppMovilContext);
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
        {icono && (iconoLibre ? icono : <span style={{ width: 42, height: 42, borderRadius: 13, background: "rgba(232,118,45,.12)", color: "#C75F1F", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icono}</span>)}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: "800 20px/1.1 var(--display, 'Plus Jakarta Sans', 'Manrope', sans-serif)", color: "#2C2A28", letterSpacing: "-.01em" }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 12.5, color: "#6E6862", marginTop: 3 }}>{subtitulo}</div>}
        </div>
        <button type="button" className="gm-boton" onClick={onClose} aria-label="Cerrar menú" style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(44,42,40,.06)", fontSize: 15, color: "#6E6862" }}>✕</button>
      </div>
      {extra && <div style={{ padding: "12px 16px 4px" }}>{extra}</div>}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {secciones.map(s => <button key={s.id} type="button" className="gm-fila" aria-current={s.id === activa ? "page" : undefined} onClick={() => elegir(s.id)} style={{ minHeight: 44 }}>
          <span style={{ flex: 1 }}>{s.label}</span>
          {s.badge > 0 && <span style={{ minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, background: "#E8762D", color: "#fff", font: "800 12px/22px var(--sans, Inter, sans-serif)", textAlign: "center", boxSizing: "border-box" }}>{s.badge}</span>}
        </button>)}
        {app.abrir && !app.conBarra && (app.modulos || []).filter(m => m.id !== app.actual).length > 0 && <>
          <div className="gm-encab" style={{ margin: "16px 14px 6px" }}>Otros módulos</div>
          {app.modulos.filter(m => m.id !== app.actual).map(m => <button key={m.id} type="button" className="gm-fila" onClick={() => { onClose(); app.abrir(m.id); }} style={{ minHeight: 44, fontWeight: 600 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(44,42,40,.06)", color: "#6E6862", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{m.icono}</span>
            <span style={{ flex: 1 }}>{m.name}</span>
            {m.badge > 0 && <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 999, background: "#E8762D", color: "#fff", font: "800 11px/20px var(--sans, Inter, sans-serif)", textAlign: "center", boxSizing: "border-box" }}>{m.badge}</span>}
          </button>)}
        </>}
      </div>
      <div style={{ padding: "10px 10px 14px", borderTop: "1px solid rgba(44,42,40,.07)", display: "flex", flexDirection: "column", gap: 2 }}>
        {usuario && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 10px" }}>
          <span style={{ width: 34, height: 34, borderRadius: "50%", background: "#2C2A28", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "800 12.5px/1 var(--sans, Inter, sans-serif)", flexShrink: 0 }}>{iniciales(usuario)}</span>
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

// Pantalla de carga de un módulo. En el celular: la barra de la app ya puesta
// y un esqueleto que brilla (como cargan las apps nativas); en la computadora
// el texto de siempre.
export const PantallaCarga = ({ titulo, icono }) => {
  const [tel] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  if (!tel) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando {titulo}…</div>;
  return <div style={{ minHeight: "100dvh", background: "#F9F9F8" }}>
    <style>{MOVIL_CSS}</style>
    <BarraMovil titulo={titulo} icono={icono} onMenu={() => {}} derecha={<span style={{ width: 40 }} />} />
    <div style={{ padding: "14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="gm-esq" style={{ width: "46%", height: 28 }} />
      <div className="gm-scroll-x" style={{ margin: 0, padding: 0 }}>{[0, 1, 2].map(i => <div key={i} className="gm-esq" style={{ flex: "0 0 38%", height: 64 }} />)}</div>
      {[0, 1, 2, 3, 4].map(i => <div key={i} className="gm-esq" style={{ height: 72, borderRadius: 16 }} />)}
    </div>
  </div>;
};

// Resumen en UNA fila deslizable (en vez de una cuadrícula de 6 cajas que
// ocupaba media pantalla). items: [{v, l, c?, onClick?}]
export const TiraMovil = ({ items }) => <div className="gm-scroll-x" style={{ marginBottom: 12 }}>
  {items.filter(Boolean).map((x, i) => <button key={i} type="button" onClick={x.onClick} disabled={!x.onClick}
    style={{ flex: "0 0 auto", minWidth: 96, textAlign: "left", border: "none", borderRadius: 14, background: "#fff", boxShadow: "0 1px 2px rgba(44,42,40,.05)", padding: "9px 12px", fontFamily: "inherit", cursor: x.onClick ? "pointer" : "default" }}>
    <div style={{ font: "800 17px/1.1 var(--display, 'Plus Jakarta Sans', 'Manrope', sans-serif)", color: x.c || "#2C2A28", whiteSpace: "nowrap" }}>{x.v}</div>
    <div style={{ fontSize: 11.5, color: "#8A847D", marginTop: 3, whiteSpace: "nowrap" }}>{x.l}</div>
  </button>)}
</div>;

// Hoja que sube desde abajo (filtros, cuenta…).
export const HojaMovil = ({ abierta, onClose, titulo, children }) => {
  if (!abierta) return null;
  return createPortal(<>
    <div className="gm-fondo" onClick={onClose} aria-hidden />
    <div role="dialog" aria-label={titulo} style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9001, maxHeight: "86dvh", overflowY: "auto", background: "#F9F9F8", borderRadius: "22px 22px 0 0", padding: "8px 16px calc(18px + env(safe-area-inset-bottom))", boxShadow: "0 -12px 40px rgba(44,42,40,.18)", animation: "gmHoja .3s cubic-bezier(.32,.72,0,1) both" }}>
      <style>{"@keyframes gmHoja{from{transform:translateY(100%)}}"}</style>
      <div style={{ width: 38, height: 5, borderRadius: 3, background: "rgba(44,42,40,.18)", margin: "4px auto 12px" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ font: "800 18px/1.2 var(--display, 'Plus Jakarta Sans', 'Manrope', sans-serif)", color: "#2C2A28" }}>{titulo}</div>
        <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "#C75F1F", font: "700 15px/1 var(--sans, Inter, sans-serif)", cursor: "pointer" }}>Listo</button>
      </div>
      {children}
    </div>
  </>, document.body);
};

// Aviso para instalarla (Safari del iPhone, fuera de la app instalada).
export const esAppInstalada = () => { try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; } };

const IcoCasa = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v10h13V10" /><path d="M10 20v-6h4v6" /></svg>;
const IcoCuadricula = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" /></svg>;

// Barra inferior flotante. Pastilla: Inicio + los 3 primeros módulos del rol
// (si el módulo abierto no está entre ellos, ocupa el último lugar, para que
// siempre se vea dónde estás). Botón redondo: todos los módulos en el cajón.
export const BarraInferior = () => {
  const app = useContext(AppMovilContext);
  const [menu, setMenu] = useState(false);
  const mods = app.modulos || [];
  let pastilla = mods.slice(0, 3);
  if (app.actual && !pastilla.some(m => m.id === app.actual)) { const act = mods.find(m => m.id === app.actual); if (act) pastilla = [...pastilla.slice(0, 2), act]; }
  const pendientesFuera = mods.filter(m => !pastilla.some(p => p.id === m.id)).reduce((a, m) => a + (m.badge || 0), 0);
  return <>
    <nav className="gm-inferior" aria-label="Navegación">
      <div className="gm-pastilla">
        <button type="button" className="gm-tab" aria-current={!app.actual ? "page" : undefined} onClick={() => app.inicio?.()}><IcoCasa /><span>Inicio</span></button>
        {pastilla.map(m => <button key={m.id} type="button" className="gm-tab" aria-current={m.id === app.actual ? "page" : undefined} onClick={() => { if (m.id !== app.actual) app.abrir?.(m.id); }}>
          {m.badge > 0 && <span className="gm-puntito">{m.badge}</span>}
          <span style={{ display: "inline-flex", width: 22, height: 22, alignItems: "center", justifyContent: "center" }}>{m.icono}</span><span>{m.name}</span>
        </button>)}
      </div>
      <button type="button" className="gm-redondo" aria-label="Todos los módulos" onClick={() => setMenu(true)}>
        <IcoCuadricula />
        {pendientesFuera > 0 && <span className="gm-puntito" style={{ right: 10, top: 9 }}>{pendientesFuera}</span>}
      </button>
    </nav>
    <MenuMovil abierto={menu} onClose={() => setMenu(false)} titulo="GeoCore" iconoLibre icono={app.marca || null} subtitulo="Todos los módulos"
      secciones={mods.map(m => ({ id: m.id, label: m.name, badge: m.badge || 0 }))} activa={app.actual} onElegir={(id) => { if (id !== app.actual) app.abrir?.(id); }}
      usuario={app.usuario} rol={app.rol} onPanel={app.actual ? app.inicio : null} panelLabel="Inicio" onLogout={app.logout} />
  </>;
};
