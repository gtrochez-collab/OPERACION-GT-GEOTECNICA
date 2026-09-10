// ═══════════════════════════════════════════════════════════════════════════
// Visor de archivos DENTRO de la app (10-sep-2026, caso Arturo).
//
// Antes cada "Ver" hacía `await store.get("cp-file-…")` (1-5 s para un PDF de
// 1-2 MB) y DESPUÉS `window.open()`. Los navegadores bloquean un popup que no
// ocurre en el mismo tick del click (Safari e iPad siempre; Chrome cuando la
// activación del gesto ya venció) y el `if (w) {…}` se tragaba el fallo:
// Arturo tocaba "Ver / Descargar", esperaba, y no pasaba nada. Encima se
// escribía un `<iframe src="data:…">` de 1-2 MB en la ventana nueva, que en
// Safari/iOS sale en blanco.
//
// Acá el archivo se muestra en un overlay propio (portal a <body>) a partir de
// un blob URL. "Abrir en pestaña" y "Descargar" corren SÍNCRONOS dentro del
// click, así que ningún navegador los bloquea.
//
// Uso: `const [visor, setVisor] = useState(null)` en quien abre el archivo y
// `{visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}`.
// `archivo = { name, type, size, dataUrl }` (el shape de cp-file-* / cc-file-*).
// ⚠ Colgar el estado de un componente que NO se remonte con cada render del
// módulo (DetailView de GeoShopping vive DENTRO del componente principal y se
// remonta en cada refresh — ahí el estado va en el módulo, no en el FileSlot).
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

// data:<mime>;base64,<b64> → blob URL. Sin fetch: base64 → bytes → Blob con
// el MIME del propio dataUrl (si no trae, octet-stream). Tira si el base64
// está corrupto — el visor lo atrapa y muestra el fallback.
export const dataUrlABlobUrl = (dataUrl) => {
  const s = String(dataUrl || "");
  const coma = s.indexOf(",");
  if (!s.startsWith("data:") || coma < 0) throw new Error("dataUrl inválido");
  const meta = s.slice(0, coma);
  const cuerpo = s.slice(coma + 1);
  const type = (meta.match(/^data:([^;,]+)/) || [])[1] || "application/octet-stream";
  let bytes;
  if (/;base64/i.test(meta)) {
    const bin = atob(cuerpo.replace(/\s/g, ""));
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    // data URL sin base64 (texto percent-encoded) — FileReader nunca lo
    // produce, pero no cuesta nada soportarlo.
    bytes = new TextEncoder().encode(decodeURIComponent(cuerpo));
  }
  return URL.createObjectURL(new Blob([bytes], { type }));
};

const fmtTam = (b) => {
  const n = Number(b) || 0;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return n ? `${n} B` : "";
};
const tipoLabel = (type) => {
  const t = String(type || "");
  if (t === "application/pdf") return "PDF";
  if (t.startsWith("image/")) return "Imagen " + t.slice(6).toUpperCase().replace("JPEG", "JPG");
  return t || "Archivo";
};

// CSS propio del overlay (va en el portal, así no depende de GT_CSS: los
// módulos viejos no lo montan). Sin `precedence` — React 19 lo izaría al
// <head> para siempre. z-index 10000: el Modal de GeoLogistics y el banner de
// sync de App están en 9999 — con 3000 el visor quedaba DEBAJO de ambos.
const VISOR_CSS = `
.va-raiz{position:fixed;inset:0;z-index:10000;background:rgba(20,18,16,.94);display:flex;flex-direction:column;font-family:inherit;color:#F4F2EE;-webkit-font-smoothing:antialiased}
.va-barra{flex:0 0 auto;min-height:56px;display:flex;align-items:center;gap:12px;padding:8px 14px 8px 18px;box-sizing:border-box;border-bottom:1px solid rgba(255,255,255,.08)}
.va-meta{flex:1;min-width:0}
.va-nombre{font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff}
.va-sub{font-size:11.5px;color:rgba(255,255,255,.62);margin-top:2px;font-variant-numeric:tabular-nums}
.va-acciones{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.va-pill{appearance:none;border:0;border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:13px;font-weight:700;padding:8px 14px;line-height:1.2;cursor:pointer;text-decoration:none;white-space:nowrap;transition:background .15s}
.va-pill:hover{background:rgba(255,255,255,.2)}
.va-pill:focus-visible,.va-x:focus-visible{outline:2px solid #E8762D;outline-offset:2px}
.va-x{appearance:none;border:0;border-radius:999px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;transition:background .15s;flex:0 0 auto}
.va-x:hover{background:rgba(255,255,255,.2)}
.va-cuerpo{flex:1;min-height:0;display:flex;flex-direction:column;align-items:stretch}
.va-cuerpo.va-centro{align-items:center;justify-content:center;padding:16px;box-sizing:border-box}
.va-pdf{flex:1;min-height:0;width:100%;border:0;background:#fff;display:block}
.va-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.va-pista{flex:0 0 auto;text-align:center;font-size:11.5px;color:rgba(255,255,255,.55);padding:8px 14px}
.va-vacio{display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;font-size:14px;color:rgba(255,255,255,.8)}
@media (max-width:560px){.va-barra{flex-wrap:wrap}.va-meta{flex-basis:100%;order:2}.va-acciones{flex:1;justify-content:flex-end}}
`;

export function VisorArchivo({ archivo, onClose }) {
  const name = archivo?.name || "archivo";
  const dataUrl = archivo?.dataUrl;
  // Si la ref no trae `type`, se toma el MIME del propio dataUrl.
  const type = String(archivo?.type || (String(dataUrl || "").match(/^data:([^;,]+)/) || [])[1] || "");
  const esPdf = type === "application/pdf";
  const esImg = type.startsWith("image/");

  // Blob URL una sola vez por archivo. Si el base64 viene corrupto → null y
  // se muestra el fallback (nunca se rompe el módulo por un adjunto malo).
  const blobUrl = useMemo(() => { try { return dataUrl ? dataUrlABlobUrl(dataUrl) : null; } catch { return null; } }, [dataUrl]);
  // Revocar al cerrar, con RETRASO: si el usuario recién tocó "Abrir en
  // pestaña", la pestaña nueva todavía puede estar cargando ese blob.
  useEffect(() => {
    if (!blobUrl) return;
    return () => { setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch { /* ya revocado */ } }, 60000); };
  }, [blobUrl]);

  // Esc cierra + el fondo no scrollea mientras está abierto. onClose va por
  // ref para que el efecto no se rearme con cada render del padre (siempre
  // le pasan una arrow nueva).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cerrarRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current?.(); } };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco al ✕: si el foco se quedara en el botón "Ver" de atrás (o se lo
    // llevara el iframe del PDF), Esc no llegaría al window. Al cerrar, vuelve
    // a donde estaba.
    const anterior = document.activeElement;
    cerrarRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (anterior && typeof anterior.focus === "function" && document.contains(anterior)) anterior.focus();
    };
  }, []);

  // SÍNCRONO dentro del click → no lo bloquea ningún navegador.
  const abrirPestana = () => { if (blobUrl) window.open(blobUrl, "_blank", "noopener"); };
  const hrefDescarga = blobUrl || dataUrl || null;

  const acciones = <>
    {blobUrl && <button type="button" className="va-pill" onClick={abrirPestana}>Abrir en pestaña</button>}
    {hrefDescarga && <a className="va-pill" href={hrefDescarga} download={name}>Descargar</a>}
  </>;

  // ⚠ Los eventos de React burbujean por el ÁRBOL DE REACT aunque el portal
  // viva en <body>: sin el stopPropagation de la raíz, un click acá llegaría
  // al backdrop del <Modal> de abajo (onClick={onClose}) y lo cerraría.
  return createPortal(
    <div className="va-raiz" role="dialog" aria-modal="true" aria-label={name} onClick={e => e.stopPropagation()}>
      <style>{VISOR_CSS}</style>
      <div className="va-barra">
        <div className="va-meta">
          <div className="va-nombre" title={name}>{name}</div>
          <div className="va-sub">{tipoLabel(type)}{fmtTam(archivo?.size) ? ` · ${fmtTam(archivo?.size)}` : ""}</div>
        </div>
        <div className="va-acciones">
          {acciones}
          <button ref={cerrarRef} type="button" className="va-x" aria-label="Cerrar" title="Cerrar (Esc)" onClick={() => onClose?.()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg>
          </button>
        </div>
      </div>
      {blobUrl && esPdf
        ? <div className="va-cuerpo">
            <iframe className="va-pdf" src={blobUrl} title={name} />
            {/* iOS solo pinta la primera página dentro de un iframe */}
            <div className="va-pista">Si no se ve completo, usá Abrir en pestaña o Descargar</div>
          </div>
        : blobUrl && esImg
          ? <div className="va-cuerpo va-centro" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
              <img className="va-img" src={blobUrl} alt={name} />
            </div>
          : <div className="va-cuerpo va-centro" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
              <div className="va-vacio">
                <div>{blobUrl || hrefDescarga ? "Este archivo no se puede previsualizar" : "No se pudo leer el archivo"}</div>
                <div className="va-acciones">{acciones}</div>
              </div>
            </div>}
    </div>,
    document.body,
  );
}
