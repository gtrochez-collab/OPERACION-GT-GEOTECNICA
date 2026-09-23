import { useState, useEffect, useRef } from "react";
import { store } from "./supabase.js";
import { GT_CSS } from "./gt-ui.js";
import { PROJECTS as CANONICAL_PROJECTS } from "./projects.js";
import { safeDynamicImport } from "./lazyLoad.js";
import { USERS } from "./users.js";
// GeoCost (9-sep-2026): partida del presupuesto y sobregiro en la solicitud.
// Lógica pura (sin store) — acá solo se LEE cc-presupuestos/cc-config.
import { opcionesPartidas, disponibleDePartida, movimientosDeProyecto, hnlToUsd, num, TASA_DEFAULT } from "./geocost-calc.js";
import { fmtUSD } from "./geocost-ui.jsx";
// Visor de archivos en la app (10-sep-2026): las fichas se abrían con window.open
// DESPUÉS del await y el navegador bloqueaba el popup (caso Arturo).
import { VisorArchivo } from "./visor-archivo.jsx";
import { hoyISO } from "./fechas.js";

// Marca Geotecnica
const ORANGE = "#E8762D";
const ORANGE_DARK = "#C75F1F";
const BEIGE = "#F5F0E8";
const CREAM = "#FFFBF5";
const CHARCOAL = "#2C2A28";
const BORDER = "#DBD4C8";
const STONE = "#7A7268";

// ── Hook responsive ──
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth < breakpoint : false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);
  return isMobile;
}

// ── Constantes ──
const COMPANIES = {
  geotecnica: { name: "Geotecnica Soluciones", color: ORANGE, accent: ORANGE_DARK },
  subterra:   { name: "Subterra Honduras",     color: "#2C5F5D", accent: "#1F4644" },
};
// Lista canonica unificada con RRHH y Operations CC (src/projects.js).
const PROJECTS = CANONICAL_PROJECTS;
const UNITS = ["Unidad", "Bolsa", "Caja", "Rollo", "Galon", "Litro", "Kg", "Quintal", "Metro", "m2", "m3", "Par", "Set", "Servicio", "Global", "Viaje", "Hora"];
const PAYMENT_METHODS = ["Transferencia BAC", "Transferencia Banco Atlantida", "Transferencia Ficohsa", "Cheque", "Efectivo", "Tarjeta corporativa", "Otro"];

// Estados del proceso de Operaciones
// Semáforo de estados (3-sep-2026, pedido de Gerson: "juguemos más con los
// colores, está muy gris triste"): GRIS = pendiente de pago · VERDE clarito =
// pagado (todo verdecito una vez pagada) · AZUL = recibida por Tesorería ·
// AMARILLO = pagado pero falta la ficha. Tonos suaves, aesthetic.
const C_GRIS     = { color: "#6E6862", bg: "rgba(44,42,40,.06)" };
const C_VERDE    = { color: "#177243", bg: "#DCF3E4" };   // 5.1:1 sobre su fondo (AA)
const C_VERDE_2  = { color: "#146A3F", bg: "#C7EBD5" };
const C_AZUL     = { color: "#1D5FAF", bg: "#DDE9FA" };
const C_AMARILLO = { color: "#8A5A00", bg: "#FBEFC4" };
// 18-sep-2026 — dos avisos nuevos, ambos con la paleta de siempre:
//   ROJO clarito  = VENCIDA (más de 2 semanas sin pago) — es un HECHO.
//   NARANJA clarito = URGENTE (lo marca el equipo de finanzas) — es una DECISIÓN.
// Si una solicitud es las dos, gana el rojo en el fondo (la alarma manda) y
// se muestran los dos chips.
const C_ROJO     = { color: "#B03024", bg: "rgba(192,57,43,.07)", borde: "rgba(192,57,43,.22)" };
const C_ULTRA    = { color: "#A94E16", bg: "rgba(232,118,45,.10)", borde: "rgba(232,118,45,.30)" };
// Naranja para chips chiquitos (token --naranja-texto-chico: el naranja puro
// no llega a contraste AA en texto ≤12px).
const C_NARANJA_CHIP = { color: "#A94E16", bg: "rgba(232,118,45,.14)" };

// ── VENCIDA: más de 2 semanas sin pago (18-sep-2026, pedido de Gerson) ──
// El reloj corre desde la FECHA DE CARGA (`createdAt`) — la misma columna que
// la tabla muestra al lado, así los días siempre cuadran con lo que se ve.
//
// ⚠ NO se usa `validatedAt`: ese campo se REESCRIBE cada vez que alguien le da
// "Aprobar y enviar a Tesorería" (por ejemplo al editar la solicitud para
// corregir algo), así que re-aprobar le reiniciaba el reloj y escondía el
// atraso. Lo cazó Gerson el 18-sep: la MAT-2026-0385 (Ebenezer) se cargó el
// 2-sep igual que sus vecinas, pero se volvió a aprobar el 9-sep y era la
// única de esa fecha que NO salía vencida.
//
// Se comparan solo FECHAS (sin horas): los timestamps mezclan medianoche UTC
// con hora local de Honduras y cruzaban el umbral un día antes.
const DIAS_VENCIDA = 14;
const diasDesdeYMDLocal = (iso) => {
  const ymd = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const ms = Date.parse(new Date().toLocaleDateString("en-CA") + "T00:00:00Z") - Date.parse(ymd + "T00:00:00Z");
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86400000)) : null;
};
const esPagadaP = (p) => p?.status === "pagado" || p?.status === "finalizado";
// "2026-09-25" → "25 sep". Se parte el string a mano: `new Date("2026-09-25")`
// es medianoche UTC y en Honduras (UTC-6) imprimiría el día anterior.
const fmtCorta = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return "";
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("es-HN", { day: "numeric", month: "short" });
};
const fmtLarga = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ""));
  if (!m) return "Sin fecha";
  const t = new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const diasEsperandoPago = (p) => diasDesdeYMDLocal(p?.createdAt);
const estaVencida = (p) => {
  if (!p || esPagadaP(p)) return false;
  const d = diasEsperandoPago(p);
  return d != null && d > DIAS_VENCIDA;
};
const STATUSES = {
  borrador:   { label: "Borrador",                        ...C_GRIS,    order: 1, desc: "Operaciones aun no aprueba" },
  validado:   { label: "Aprobado por Coord. Operaciones", ...C_GRIS,    order: 2, desc: "Aprobado por Operaciones, en gestion de Tesoreria" },
  pagado:     { label: "Pagado (sin comprobante)",        ...C_VERDE,   order: 3, desc: "Pago realizado, falta cargar comprobante" },
  finalizado: { label: "Finalizado",                      ...C_VERDE_2, order: 4, desc: "Pago con comprobante cargado" },
};

// Estados que maneja Tesoreria (paralelos al estado de Operaciones)
const TREASURY_STATUSES = {
  pendiente: { label: "Pendiente Lic. Carolina", ...C_GRIS },
  recibida:  { label: "Recibida",                ...C_AZUL },
  pagada:    { label: "Pagada",                  ...C_VERDE },
};

// Estados de Recepcion de Materiales (logistica, post-pago)
const DELIVERY_STATUSES = {
  pendiente_entrega: { label: "Pendiente de entrega",      ...C_AMARILLO, icon: "📦" },
  // SOLO DISPLAY (3-sep, pedido de Gerson: "si está pagada y falta la ficha,
  // que diga pendiente de ficha"): la tabla de Solicitudes lo muestra cuando
  // el despacho ya fue ENTREGADO y la ficha no ha llegado (misma regla que la
  // etapa falta_ficha de Supply Chain). No es un deliveryStatus guardado.
  pendiente_ficha:   { label: "Pendiente de ficha",        ...C_AMARILLO, icon: "📋" },
  // entrega_proveedor: el PROVEEDOR la lleva directo a proyecto (no pasa por
  // logistica). Ana registra dia y hora de llegada; despues se sube la ficha
  // firmada o se cierra sin ficha. Agregado ago 2026 a pedido de Gerson.
  entrega_proveedor: { label: "La entrega el proveedor",    ...C_AMARILLO, icon: "🏪" },
  recibido:          { label: "Materiales recibidos",       ...C_AMARILLO, icon: "✅" },
  ficha_adjunta:     { label: "Ficha de recibido adjunta",  ...C_VERDE,    icon: "📋" },
  cerrado:           { label: "Compra cerrada",             ...C_VERDE_2,  icon: "🔒" },
};

// ── Utils ──
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── File externalization (workaround del limite de tamaño de Supabase) ──
//
// Supabase tiene un limite practico de payload (~8MB en plan Pro, 1MB en
// free). Los archivos adjuntos (cotizaciones, recibos, fichas) embebidos
// como dataUrl base64 dentro de cada solicitud hacen que el array
// "cp-purchases" crezca muy rapido — en abril 2026 llego a 11.5MB y
// dejo de poder guardarse, bloqueando completamente el modulo.
//
// Solucion: cada archivo se guarda en su propia row de Supabase con key
// `cp-file-{fileId}`. En "cp-purchases" solo queda una referencia liviana
// con nombre, tamaño, tipo y fileId. En memoria reconstituimos los
// dataUrl al cargar, asi el resto del codigo (visor, PDF generator,
// descargas) sigue funcionando sin cambios.
//
// Compatibilidad: si la data vieja tiene dataUrl directo (sin fileId),
// la primera vez que se guarde se extraera automaticamente.
const FILE_FIELD_PATHS = [
  ["quoteFile"],
  ["receiptFile"],
  ["delivery", "fichaFile"],
];
const fileKey = (fileId) => `cp-file-${fileId}`;

// ── CÓDIGO DE SOLICITUD (19-ago-2026, pedido de Gerson) ──────────────────
// Correlativo profesional por TIPO y AÑO: MAT-2026-0001 (materiales de
// GeoShopping) vs MAQ-2026-0001 (repuestos de GeoMachinery), así conta
// distingue de un vistazo de qué módulo viene la solicitud. El número es
// GLOBAL del año (no por proyecto) para que no haya colisiones cuando dos
// proyectos comparten prefijo (RETENCIÓN-AUREA vs RETENCIÓN-CC EL CAMINO);
// el proyecto se muestra SIEMPRE junto al código en la UI y en los PDF.
const PREFIJO_CODIGO = "MAT";
// Siguiente correlativo mirando los códigos ya asignados del mismo año.
const siguienteCodigo = (lista, anio) => {
  const yy = anio || new Date().getFullYear();
  const re = new RegExp(`^${PREFIJO_CODIGO}-${yy}-(\\d+)$`);
  let max = 0;
  (lista || []).forEach(p => {
    const m = re.exec(String(p?.codigo || ""));
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  });
  return `${PREFIJO_CODIGO}-${yy}-${String(max + 1).padStart(4, "0")}`;
};


const getAtPath = (obj, path) => path.reduce((cur, k) => cur?.[k], obj);
const setAtPath = (obj, path, value) => {
  // Devuelve una nueva copia del objeto con el path actualizado (immutable).
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  return { ...obj, [head]: setAtPath(obj?.[head] || {}, rest, value) };
};

// Extrae los archivos pesados de un array de purchases. Devuelve la version
// "light" (sin dataUrl) y la lista de archivos a guardar por separado.
//
// IMPORTANTE: solo sube archivos NUEVOS — los que tienen dataUrl pero NO tienen
// fileId todavia. Los archivos que ya tienen fileId fueron subidos en alguna
// sesion previa (o re-hidratados via restoreFiles) y NO necesitan re-subirse.
// Esto evita que cada save tarde decenas de segundos re-subiendo decenas de PDFs.
// El campo dataUrl en light siempre se strippea para mantener la nube liviana.
const extractFiles = (purchases) => {
  const filesToSave = [];
  const light = purchases.map((p) => {
    let cleaned = p;
    for (const path of FILE_FIELD_PATHS) {
      const file = getAtPath(cleaned, path);
      if (!file) continue;
      const hasDataUrl = !!file.dataUrl;
      const hasFileId = !!file.fileId;

      if (hasDataUrl && !hasFileId) {
        // Archivo NUEVO (fresh upload): subir y reemplazar con ref.
        const fileId = uid();
        filesToSave.push({ fileId, content: { name: file.name, type: file.type, size: file.size, dataUrl: file.dataUrl } });
        cleaned = setAtPath(cleaned, path, { fileId, name: file.name, type: file.type, size: file.size });
      } else if (hasDataUrl && hasFileId) {
        // Archivo YA subido pero hidratado en memoria — solo strippeamos dataUrl para light.
        // NO re-subimos (ya esta en cloud bajo fileId).
        cleaned = setAtPath(cleaned, path, { fileId: file.fileId, name: file.name, type: file.type, size: file.size });
      }
      // Si no tiene dataUrl, ya es un ref puro — no tocar.
    }
    return cleaned;
  });
  return { light, filesToSave };
};

// Toma purchases con refs y carga los archivos correspondientes en memoria.
// Devuelve los purchases con dataUrl reconstituido.
// EXPORTADA para que otros modulos (Logistica) puedan hidratar archivos antes
// de generar fichas / pdfs que requieran los archivos completos.
export const restoreFiles = async (lightPurchases) => {
  // Recolectar todos los fileIds que necesitan ser cargados (los que tienen
  // fileId pero no tienen dataUrl ya cargado).
  const ids = new Set();
  for (const p of lightPurchases) {
    for (const path of FILE_FIELD_PATHS) {
      const f = getAtPath(p, path);
      if (f?.fileId && !f.dataUrl) ids.add(f.fileId);
    }
  }
  if (ids.size === 0) return lightPurchases;
  const fileMap = {};
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const f = await store.get(fileKey(id));
        if (f) fileMap[id] = f;
      } catch {}
    })
  );
  return lightPurchases.map((p) => {
    let restored = p;
    for (const path of FILE_FIELD_PATHS) {
      const ref = getAtPath(restored, path);
      if (!ref?.fileId || ref.dataUrl) continue;
      const full = fileMap[ref.fileId];
      if (full) {
        restored = setAtPath(restored, path, { ...full, fileId: ref.fileId });
      }
    }
    return restored;
  });
};
const fmt = d => d ? new Date(d).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDT = d => d ? new Date(d).toLocaleString("es-HN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtL = n => (n != null && n !== "") ? `L ${Number(n).toLocaleString("es-HN", { minimumFractionDigits: 2 })}` : "L 0.00";
const fmtMB = b => b ? (b / 1024 / 1024).toFixed(2) + " MB" : "—";
const projLabel = s => { const p = PROJECTS.find(x => x.short === s); return p ? `${p.short} — ${p.name}` : s; };

const readFileAsDataUrl = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: r.result });
  r.onerror = reject;
  r.readAsDataURL(file);
});

// ── UI primitives ──
const Badge = ({ children, color = "#64748b" }) => <span style={{ background: color + "18", color, padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;

const Btn = ({ children, onClick, variant = "primary", small, style: sx, disabled, type, title }) => {
  const b = { border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: small ? 12 : 14, padding: small ? "5px 12px" : "9px 20px", opacity: disabled ? 0.5 : 1, fontFamily: "inherit", letterSpacing: 0.2 };
  const v = {
    primary: { ...b, background: ORANGE, color: "#fff", boxShadow: "0 2px 6px rgba(232,118,45,0.20)" },
    success: { ...b, background: "#5A8A4F", color: "#fff" },
    info: { ...b, background: "#2C5F5D", color: "#fff" },
    warn: { ...b, background: "#D4A017", color: "#fff" },
    danger: { ...b, background: "#C0392B", color: "#fff" },
    ghost: { ...b, background: "transparent", color: "#5C5853", border: "1px solid #DBD4C8" },
  };
  return <button type={type || "button"} title={title} style={{ ...(v[variant] || v.primary), ...sx }} onClick={onClick} disabled={disabled}>{children}</button>;
};

const Input = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<input style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC" }} {...p} /></div>;

const Textarea = ({ label, ...p }) => <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<textarea style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC", fontFamily: "inherit", resize: "vertical", minHeight: 70 }} {...p} /></div>;

// Acepta strings, {value,label} y — desde GeoCost (9-sep-2026) — grupos
// {group, options} que salen como <optgroup> (partidas por categoría).
const Select = ({ label, options, emptyLabel = "—", ...p }) => {
  const opt = o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>;
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label && <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{label}</label>}<select style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }} {...p}><option value="">{emptyLabel}</option>{(options || []).map((o, i) => o && typeof o === "object" && o.group ? <optgroup key={o.group + i} label={o.group}>{(o.options || []).map(opt)}</optgroup> : opt(o))}</select></div>;
};

const Modal = ({ title, onClose, children, wide, size }) => <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
  <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: size === "xl" ? "96vw" : wide ? "85vw" : 620, maxWidth: "98vw", maxHeight: "94vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.25)" }} onClick={e => e.stopPropagation()}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
      <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94A3B8" }}>✕</button>
    </div>
    {children}
  </div>
</div>;

const StatCard = ({ label, value, icon, color = "#BE185D" }) => <div style={{ background: "#fff", borderRadius: 14, padding: "18px 22px", border: "1px solid #E2E8F0", flex: 1, minWidth: 170 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <div style={{ background: color + "15", color, width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
    <div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
    </div>
  </div>
</div>;

// File preview widget
// `verArchivo` (opcional): delega el visor al padre. Los FileSlot del DetailView
// se REMONTAN con cada refresh del módulo (DetailView vive dentro del componente
// principal) y un visor local se cerraría solo al volver de "Abrir en pestaña".
const FileSlot = ({ label, file, canUpload, onUpload, onRemove, accent = "#2563EB", verArchivo }) => {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);
  const [visor, setVisor] = useState(null);

  // Abre un archivo, hidratandolo desde cloud si solo tiene fileId (sin dataUrl).
  // Ahora que la carga inicial NO hidrata archivos en bulk (para evitar saturar
  // Supabase), cada click "Ver/Descargar" tiene que cargar el archivo on-demand.
  const openFile = async () => {
    if (!file) return;
    let fileToOpen = file;
    if (!file.dataUrl && file.fileId) {
      console.group(`[FileSlot] Cargar archivo on-demand`);
      console.log("fileId:", file.fileId);
      console.log("name:", file.name, "| size:", file.size, "| type:", file.type);
      setOpening(true);
      const tStart = Date.now();
      try {
        const full = await store.get(`cp-file-${file.fileId}`);
        const tEnd = Date.now();
        console.log(`store.get tardo ${tEnd - tStart}ms`);
        if (!full) {
          // El archivo NO existe en la nube. Causa probable: el upload original
          // fallo (Supabase timeout, sesion expirada, etc) y solo quedo la ref
          // huerfana en cp-purchases.
          console.error("Archivo no encontrado en cp-file-" + file.fileId);
          alert(`❌ El archivo "${file.name}" no se encuentra en la nube.\n\nProbablemente el upload original fallo. Reemplazalo subiendo el archivo de nuevo desde 'Reemplazar archivo'.`);
          setOpening(false);
          console.groupEnd();
          return;
        }
        if (!full.dataUrl) {
          console.error("Cloud devolvio el archivo pero sin dataUrl:", full);
          alert(`❌ El archivo "${file.name}" esta corrupto en la nube (sin contenido).\n\nReemplazalo subiendo el archivo de nuevo desde 'Reemplazar archivo'.`);
          setOpening(false);
          console.groupEnd();
          return;
        }
        console.log("✓ Cargado OK, abriendo...");
        fileToOpen = { ...full, fileId: file.fileId };
      } catch (err) {
        console.error("Excepcion cargando archivo:", err);
        const msg = err?.message || String(err);
        if (msg.includes("Timeout")) {
          alert(`⏱ El archivo "${file.name}" tardo mas de 30 segundos en cargar.\n\nPuede ser que Supabase este lento. Reintenta en unos segundos.`);
        } else {
          alert(`Error cargando "${file.name}": ${msg}\n\nAbri la consola del navegador (Cmd+Option+I) para mas detalles.`);
        }
        setOpening(false);
        console.groupEnd();
        return;
      }
      setOpening(false);
      console.groupEnd();
    }
    if (fileToOpen.type?.startsWith("image/") || fileToOpen.type === "application/pdf") {
      // Visor DENTRO de la app (10-sep-2026). Antes: window.open() DESPUÉS del
      // await → popup bloqueado en Safari/iPad (y en Chrome si el gesto venció)
      // y el `if (w)` se tragaba el fallo: "toco Ver y no pasa nada" (Arturo).
      if (verArchivo) verArchivo(fileToOpen); else setVisor(fileToOpen);
    } else {
      // Descarga para Excel/Word/etc — el <a download> no es popup, no lo bloquean
      const a = document.createElement("a");
      a.href = fileToOpen.dataUrl;
      a.download = fileToOpen.name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  };

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // Limite duro: 2 MB. Archivos mas grandes fallan la sincronizacion con Supabase.
    if (f.size > 2 * 1024 * 1024) {
      alert(`❌ El archivo pesa ${fmtMB(f.size)}.\n\nLimite maximo: 2 MB.\n\nPara reducir el tamaño:\n• PDFs: usar Adobe "Reducir tamaño" o https://smallpdf.com/compress-pdf\n• Imagenes: exportar como JPG de menor calidad\n• Excel: guardar como CSV si es posible\n\nArchivos mas grandes no se guardan correctamente en la nube.`);
      e.target.value = ""; return;
    }
    if (f.size > 1 * 1024 * 1024) {
      if (!confirm(`⚠️ El archivo pesa ${fmtMB(f.size)}. Mas de 1 MB puede ralentizar la app.\n\n¿Subir de todas formas?`)) {
        e.target.value = ""; return;
      }
    }
    setBusy(true);
    try {
      const fd = await readFileAsDataUrl(f);
      // AWAIT onUpload — si es async (uploads que persisten a cloud), el
      // spinner "Subiendo..." se mantiene hasta que la persistencia confirme.
      // Antes esto era fire-and-forget y el spinner se quitaba antes del save real.
      await onUpload(fd);
    } catch (err) {
      alert("Error al leer/subir el archivo: " + (err?.message || err));
    }
    setBusy(false);
    e.target.value = "";
  };

  return <div style={{ border: `1px dashed ${accent}`, borderRadius: 12, padding: 14, background: accent + "08", display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ fontSize: 12, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
    {file ? <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 150 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", wordBreak: "break-all" }}>
          {file.type === "application/pdf" ? "📄" : file.type?.startsWith("image/") ? "🖼️" : "📎"} {file.name}
        </div>
        <div style={{ fontSize: 11, color: "#64748b" }}>{file.type} · {fmtMB(file.size)}</div>
      </div>
      <Btn small variant="info" onClick={openFile} disabled={opening}>{opening ? "Cargando..." : "Ver / Descargar"}</Btn>
      {canUpload && <Btn small variant="danger" onClick={() => { if (confirm("¿Eliminar este archivo?")) onRemove(); }}>Eliminar</Btn>}
    </div> : <div style={{ fontSize: 12, color: "#94A3B8" }}>Sin archivo adjunto</div>}
    {canUpload && <>
      <input ref={ref} type="file" style={{ display: "none" }} accept=".pdf,image/*,.xls,.xlsx,.doc,.docx" onChange={onPick} />
      <Btn small variant="ghost" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? "Subiendo..." : file ? "Reemplazar archivo" : "+ Subir archivo"}
      </Btn>
    </>}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
};

// Status badge (estado de Operaciones)
const StatusBadge = ({ status }) => {
  const s = STATUSES[status] || STATUSES.borrador;
  return <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{s.label}</span>;
};

// Treasury badge (estado paralelo que maneja Tesoreria)
const TreasuryBadge = ({ status }) => {
  if (!status) return null;
  const s = TREASURY_STATUSES[status];
  if (!s) return null;
  return <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${s.color}30` }}>{s.label}</span>;
};

// Delivery badge (estado de recepcion de materiales)
const DeliveryBadge = ({ status }) => {
  if (!status) return null;
  const s = DELIVERY_STATUSES[status];
  if (!s) return null;
  return <span style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", border: `1px solid ${s.color}30` }}>{s.label}</span>;
};

// Deriva el treasuryStatus para registros legacy que no lo tengan
const deriveTreasury = (p) => {
  if (p.treasuryStatus) return p.treasuryStatus;
  if (p.status === "pagado" || p.status === "finalizado") return "pagada";
  if (p.status === "validado") return "pendiente";
  return null;
};

// Deriva el deliveryStatus para registros legacy que no lo tengan
const deriveDelivery = (p) => {
  if (p.deliveryStatus) return p.deliveryStatus;
  if (p.status === "pagado" || p.status === "finalizado") return "pendiente_entrega";
  return null;
};

// ── Ficha de Recibido — PDF horizontal (A4 landscape), simple, para campo ──
// EXPORTADA para que otros modulos (Logistica) puedan generar la misma ficha
// y los motoristas/recepcion la lleven al proveedor al ir a recoger.
export const generateFichaPDF = async (purchaseLight, projectObj, companyName) => {
  // Asegurar que tenemos los archivos hidratados (dataUrl). Si el caller pasa
  // un purchase light (refs por fileId, sin dataUrl), los cargamos aqui antes
  // de generar el PDF — sino los embeds salen vacios.
  // Esto permite que el caller no tenga que preocuparse de pre-hidratar.
  const needsHydration = (purchaseLight.quoteFile?.fileId && !purchaseLight.quoteFile?.dataUrl) ||
                         (purchaseLight.receiptFile?.fileId && !purchaseLight.receiptFile?.dataUrl);
  const [purchase] = needsHydration ? await restoreFiles([purchaseLight]) : [purchaseLight];

  const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Logo real de la empresa (public/brand/logo-color.png). Si por cualquier
  // razon no carga (offline, ruta), se cae al monograma "GT" naranja.
  let logoImg = null;
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}brand/logo-color.png`);
    if (resp.ok) {
      const blob = await resp.blob();
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
      const dims = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = dataUrl; });
      const hMM = 14;
      logoImg = { dataUrl, h: hMM, w: (dims.w / dims.h) * hMM };
    }
  } catch { /* fallback al monograma */ }
  const PW = 297, PH = 210, M = 14, CW = PW - 2 * M; // util: 269mm ancho

  const today = new Date().toLocaleDateString("es-HN", { day: "2-digit", month: "long", year: "numeric" });
  const projFull = projectObj ? `${projectObj.short} — ${projectObj.name}` : (purchase.projectCode || "—");
  const fileName = `Ficha-Recibido-${purchase.projectCode}-${(purchase.provider || "").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
  const hasQuotePDF = purchase.quoteFile?.dataUrl && purchase.quoteFile.type === "application/pdf";
  const hasQuoteImg = purchase.quoteFile?.dataUrl && purchase.quoteFile.type?.startsWith("image/");
  const hasReceiptPDF = purchase.receiptFile?.dataUrl && purchase.receiptFile.type === "application/pdf";
  const hasReceiptImg = purchase.receiptFile?.dataUrl && purchase.receiptFile.type?.startsWith("image/");
  const hasAnyPDFAttachment = hasQuotePDF || hasReceiptPDF;

  // Paleta de MARCA — mismo look del modulo: naranja Geotecnica + carbon +
  // beige calido (antes era azul marino generico).
  const B  = [232, 118, 45],  BL = [255, 251, 245];   // naranja #E8762D / beige #FFFBF5
  const G  = [5, 150, 105],   GL = [220, 252, 231];   // verde (montos)
  const GR = [122, 114, 104], GL2 = [248, 250, 252];  // stone calido #7A7268
  const DK = [44, 42, 40],   BD = [219, 212, 200];    // carbon #2C2A28 / borde beige #DBD4C8
  const W  = [255, 255, 255], BK = [26, 26, 26];

  const tc = c => doc.setTextColor(...c);
  const fc = c => doc.setFillColor(...c);
  const dc = c => doc.setDrawColor(...c);
  const lw = n => doc.setLineWidth(n);
  const f  = (n, s = "normal") => { doc.setFontSize(n); doc.setFont("helvetica", s); };
  const ln = (x1, y1, x2, y2) => doc.line(x1, y1, x2, y2);
  const rc = (x, y, w, h, s = "S") => doc.rect(x, y, w, h, s);

  // Etiqueta de campo (gris pequeño)
  const lbl = (t, x, y) => { f(7, "bold"); tc(GR); doc.text(t.toUpperCase(), x, y); };
  // Valor relleno (bold oscuro)
  const val = (v, x, y, mw) => {
    f(9.5, "bold"); tc(DK);
    if (mw) { doc.text(doc.splitTextToSize(String(v || "—"), mw)[0], x, y); }
    else     { doc.text(String(v || "—"), x, y); }
  };
  // Linea en blanco para firma
  const blk = (x, y, w) => { dc(BK); lw(0.4); ln(x, y, x + w, y); };
  // Casilla de verificacion
  const cbx = (x, y) => { dc(BK); lw(0.35); rc(x, y, 3.8, 3.8, "S"); };

  // ════════════════════════════════════════════════════════
  // 1. HEADER  (y: 14 → 38)
  // ════════════════════════════════════════════════════════
  let y = M;

  // Logo real de la empresa; monograma naranja como respaldo
  let tx = M + 14;
  if (logoImg) {
    try {
      doc.addImage(logoImg.dataUrl, "PNG", M, y + 1, logoImg.w, logoImg.h);
      tx = M + logoImg.w + 6;
    } catch { logoImg = null; }
  }
  if (!logoImg) {
    fc(B); rc(M, y, 11, 22, "F");
    f(11, "bold"); tc(W); doc.text("GT", M + 2, y + 13);
  }
  f(14, "bold"); tc(B); doc.text("ACTA DE ENTREGA Y RECEPCION DE MATERIALES", tx, y + 8);
  f(9, "normal"); tc(GR); doc.text(`Grupo Geotecnica · ${companyName || "Geotecnica Soluciones"}`, tx, y + 15);

  f(9, "normal"); tc(GR);
  doc.text("Folio N°: _______________", PW - M, y + 7, { align: "right" });
  doc.text(`Generada: ${today}`, PW - M, y + 14, { align: "right" });
  if (hasQuotePDF || hasQuoteImg || hasReceiptPDF || hasReceiptImg) {
    f(7.5, "italic"); tc(B);
    const partes = [];
    if (hasQuotePDF || hasQuoteImg) partes.push("Cotizacion");
    if (hasReceiptPDF || hasReceiptImg) partes.push("Transferencia");
    doc.text(`* ${partes.join(" + ")} incluida${partes.length > 1 ? "s" : ""} en pag. 2+`, PW - M, y + 20, { align: "right" });
  }

  y += 25; dc(B); lw(1.1); ln(M, y, PW - M, y); y += 4;

  // ════════════════════════════════════════════════════════
  // 2. REFERENCIA DE LA COMPRA — pre-llenado  (y: 43 → 79)
  // ════════════════════════════════════════════════════════
  const refY = y, refH = 35;
  fc(BL); rc(M, y, CW, refH, "F");
  fc(B);  rc(M, y, 3, refH, "F");
  f(7.5, "bold"); tc(B); doc.text("REFERENCIA DE LA COMPRA", M + 5, y + 5);

  // Columna izquierda (120mm): 3 filas de datos
  const Lx = M + 5, Lw = 115, halfL = (Lw - 4) / 2;
  const r1 = y + 10, r2 = y + 19, r3 = y + 28;

  lbl("Proyecto", Lx, r1); lbl("N° Cotizacion", Lx + halfL + 4, r1);
  val(projFull, Lx, r1 + 4, halfL); val(purchase.quoteNumber || "—", Lx + halfL + 4, r1 + 4, halfL);

  lbl("Proveedor", Lx, r2); lbl("Aprobado por Operaciones", Lx + halfL + 4, r2);
  val(purchase.provider || "—", Lx, r2 + 4, halfL); val(purchase.opsResponsible || "—", Lx + halfL + 4, r2 + 4, halfL);

  lbl("Metodo de pago", Lx, r3); lbl("Fecha de pago", Lx + halfL + 4, r3);
  val(purchase.paymentMethod || "—", Lx, r3 + 4, halfL); val(fmt(purchase.paymentDate), Lx + halfL + 4, r3 + 4, halfL);

  // Divisor vertical suave
  dc(B); lw(0.15); ln(M + 121, refY + 7, M + 121, refY + refH - 3);

  // Columna derecha: Descripcion + Monto
  const Rx = M + 126, Rw = CW - 126 - 3;
  lbl("Descripcion de materiales / servicio", Rx, r1);
  f(9.5, "bold"); tc(DK);
  doc.text(doc.splitTextToSize(purchase.description || "—", Rw).slice(0, 2), Rx, r1 + 4);

  lbl("Monto total pagado", Rx, r3);
  f(15, "bold"); tc(G); doc.text(fmtL(purchase.amount), Rx, r3 + 5);

  y = refY + refH + 4;

  // ════════════════════════════════════════════════════════
  // 3. AVISO AL MOTORISTA — la ficha es UNA sola pagina (acta completa):
  //    referencia de la compra + detalle a cotejar + firmas. Pedido del
  //    usuario 23-jul-2026: sin paginas repetidas ni filas de relleno.
  //    (Texto plano: la helvetica de jsPDF no soporta emojis.)
  // ════════════════════════════════════════════════════════
  fc([254, 243, 199]); dc([217, 119, 6]); lw(0.4); rc(M, y, CW, 13, "FD");
  f(8.5, "bold"); tc([146, 64, 14]);
  doc.text("ATENCION MOTORISTA: cotejar UNA POR UNA las cantidades entregadas contra el detalle de abajo ANTES de solicitar la firma.", M + 4, y + 5.5);
  doc.text("El Ingeniero/Residente firma que recibe EXACTAMENTE lo descrito en la cotizacion pagada con esta solicitud.", M + 4, y + 10.5);
  let ay = y + 17;

  // ── Tabla de cantidades ──
  const xN = M, xCant = M + 8, xDesc = M + 30, xOk = M + 195, xObs = M + 221;
  const wDesc = xOk - xDesc - 4, wObs = PW - M - xObs;
  const rowH = 8;
  const firmasTop = PH - M - 52;
  const tableBottom = firmasTop - 4;

  // Header de la tabla — solo se dibuja cuando hay items estructurados
  // (sin items, el detalle va en un recuadro y el header sobraria).
  const drawTableHeader = () => {
    fc(B); rc(M, ay, CW, 7, "F");
    f(7.5, "bold"); tc(W);
    doc.text("#", xN + 2, ay + 4.8);
    doc.text("CANT.", xCant + 2, ay + 4.8);
    doc.text("DESCRIPCION DEL MATERIAL / SERVICIO", xDesc, ay + 4.8);
    doc.text("ENTREGADO", xOk, ay + 4.8);
    doc.text("OBSERVACION", xObs, ay + 4.8);
    ay += 7;
  };

  const drawRow = (num, cant, descTxt) => {
    if (ay + rowH > tableBottom) return false;
    dc(BD); lw(0.2); rc(M, ay, CW, rowH, "S");
    ln(xCant - 1, ay, xCant - 1, ay + rowH);
    ln(xDesc - 2, ay, xDesc - 2, ay + rowH);
    ln(xOk - 2, ay, xOk - 2, ay + rowH);
    ln(xObs - 2, ay, xObs - 2, ay + rowH);
    f(8.5, "normal"); tc(DK);
    doc.text(String(num), xN + 2, ay + 5.3);
    if (cant) { f(9, "bold"); doc.text(String(cant).slice(0, 12), xCant + 2, ay + 5.3); }
    else blk(xCant + 2, ay + 5.5, 16);
    f(8.5, "normal"); tc(DK);
    if (descTxt) doc.text(doc.splitTextToSize(descTxt, wDesc)[0] || "", xDesc, ay + 5.3);
    else { dc(BD); lw(0.25); ln(xDesc, ay + 5.5, xDesc + wDesc - 4, ay + 5.5); }
    cbx(xOk + 7, ay + 2);
    dc(BD); lw(0.25); ln(xObs, ay + 5.5, xObs + wObs - 4, ay + 5.5);
    ay += rowH;
    return true;
  };

  const itemsArr = Array.isArray(purchase.items)
    ? purchase.items.filter(it => it && ((it.description || it.desc || it.name || "").trim() || it.qty || it.cantidad))
    : [];
  let rowNum = 1;
  if (itemsArr.length > 0) {
    drawTableHeader();
    let dibujados = 0;
    for (const it of itemsArr) {
      const qty = it.qty ?? it.cantidad ?? it.cant ?? "";
      const unit = it.unit ?? it.unidad ?? "";
      const cant = [qty, unit].filter(Boolean).join(" ");
      const desc = it.description || it.desc || it.name || "";
      if (!drawRow(rowNum, cant, desc)) break;
      rowNum++; dibujados++;
    }
    if (dibujados < itemsArr.length) {
      f(7.5, "italic"); tc(GR);
      doc.text(`(+${itemsArr.length - dibujados} item(s) mas — cotejar contra la cotizacion anexa)`, M + 2, ay + 4);
      ay += 6;
    }
  } else {
    // Sin items estructurados: el detalle pagado va en un recuadro amplio —
    // eso es lo que el motorista coteja y el ingeniero firma. Sin filas de
    // relleno (se sentian repetitivas).
    f(7.5, "bold"); tc(B); doc.text("DETALLE SEGUN COTIZACION PAGADA (cotejar contra esto):", M + 2, ay + 4);
    ay += 6;
    fc(BL); dc(BD); lw(0.25);
    // Clamp por espacio: la descripcion nunca se come el recuadro de
    // observaciones (~20mm reservados) ni desborda sobre las firmas.
    const maxLines = Math.max(2, Math.floor((tableBottom - ay - 24 - 4) / 4.5));
    const descLines = doc.splitTextToSize(purchase.description || "—", CW - 8).slice(0, Math.min(10, maxLines));
    const descBoxH = 4 + descLines.length * 4.5;
    rc(M, ay, CW, descBoxH, "FD");
    f(9, "bold"); tc(DK); doc.text(descLines, M + 4, ay + 5);
    ay += descBoxH + 3;
  }

  // ── Observaciones de la entrega (faltantes / parciales / diferencias) ──
  // Espacio para anotar a mano, p.ej. "fui por 20 varillas y el proveedor
  // solo tenia 10" — llena el espacio libre hasta las firmas.
  if (tableBottom - ay > 10) {
    f(7.5, "bold"); tc(B);
    doc.text("OBSERVACIONES DE LA ENTREGA (faltantes, entregas parciales, diferencias):", M + 2, ay + 4);
    ay += 6;
    const obsH = tableBottom - ay;
    dc(BD); lw(0.3); rc(M, ay, CW, obsH, "S");
    dc(BD); lw(0.2);
    for (let ly = ay + 8; ly < ay + obsH - 2; ly += 8) ln(M + 4, ly, PW - M - 4, ly);
    ay += obsH;
  }

  // ── Firmas grandes ──
  const sigW2 = (CW - 10) / 2;
  // Ingeniero / Residente RECIBE (azul)
  fc(BL); dc(DK); lw(0.5); rc(M, firmasTop, sigW2, 48, "FD");
  f(9.5, "bold"); tc(DK); doc.text("INGENIERO / RESIDENTE — RECIBE", M + sigW2 / 2, firmasTop + 6.5, { align: "center" });
  let sl = firmasTop + 14;
  lbl("Nombre completo", M + 5, sl); blk(M + 5, sl + 4.5, sigW2 - 10); sl += 10;
  lbl("Cargo", M + 5, sl); blk(M + 5, sl + 4.5, (sigW2 - 14) / 2);
  lbl("DNI", M + 5 + (sigW2 - 14) / 2 + 6, sl); blk(M + 5 + (sigW2 - 14) / 2 + 6, sl + 4.5, (sigW2 - 14) / 2); sl += 10;
  lbl("Firma", M + 5, sl); blk(M + 5, sl + 4.5, sigW2 - 10); sl += 9;
  f(6.5, "italic"); tc(GR);
  doc.text("Al firmar certifico que RECIBI las cantidades exactas arriba detalladas, completas y en buen estado.", M + 5, sl + 3, { maxWidth: sigW2 - 10 });

  // Motorista ENTREGA (naranja)
  const mx = M + sigW2 + 10;
  fc([253, 240, 230]); dc(B); lw(0.5); rc(mx, firmasTop, sigW2, 48, "FD");
  f(9.5, "bold"); tc(B); doc.text("MOTORISTA — ENTREGA", mx + sigW2 / 2, firmasTop + 6.5, { align: "center" });
  sl = firmasTop + 14;
  lbl("Nombre completo", mx + 5, sl); blk(mx + 5, sl + 4.5, sigW2 - 10); sl += 10;
  lbl("Placa vehiculo", mx + 5, sl); blk(mx + 5, sl + 4.5, (sigW2 - 14) / 2);
  lbl("Fecha / Hora", mx + 5 + (sigW2 - 14) / 2 + 6, sl); blk(mx + 5 + (sigW2 - 14) / 2 + 6, sl + 4.5, (sigW2 - 14) / 2); sl += 10;
  lbl("Firma", mx + 5, sl); blk(mx + 5, sl + 4.5, sigW2 - 10); sl += 9;
  f(6.5, "italic"); tc(GR);
  doc.text("Confirmo que coteje y ENTREGUE las cantidades exactas al Ingeniero/Residente indicado.", mx + 5, sl + 3, { maxWidth: sigW2 - 10 });

  // Footer pag. 2
  dc(BD); lw(0.25); ln(M, PH - M + 2, PW - M, PH - M + 2);
  f(7, "normal"); tc([148, 163, 184]);
  doc.text(`Grupo Geotecnica · Acta de Entrega y Recepcion · ${today} · Proy: ${purchase.projectCode} · ${purchase.provider} · ID: ${purchase.id}`, PW / 2, PH - M + 6, { align: "center" });

  // ════════════════════════════════════════════════════════
  // PAG. 2+: Adjuntos en orden — Cotizacion + Transferencia de pago
  // ════════════════════════════════════════════════════════
  // Lista ordenada de anexos a incluir. Cada item tiene titulo, subtitulo y archivo.
  const anexos = [];
  if (purchase.quoteFile?.dataUrl) {
    anexos.push({
      titulo: "COTIZACION DE REFERENCIA",
      subtitulo: `${purchase.provider || "—"} · N° ${purchase.quoteNumber || "—"} · ${projFull}`,
      file: purchase.quoteFile,
    });
  }
  if (purchase.receiptFile?.dataUrl) {
    anexos.push({
      titulo: "COMPROBANTE DE TRANSFERENCIA / PAGO",
      subtitulo: `${purchase.provider || "—"} · ${fmtL(purchase.amount)} · ${fmt(purchase.paymentDate)} · ${purchase.paymentMethod || "—"}`,
      file: purchase.receiptFile,
    });
  }

  // Si no hay nada que adjuntar, guardar y salir
  if (anexos.length === 0) {
    doc.save(fileName);
    return;
  }

  // Agregar imagenes (JPG/PNG) como paginas nuevas con jsPDF — antes del merge PDF
  const imgAnexos = anexos.filter(a => a.file.type?.startsWith("image/"));
  const pdfAnexos = anexos.filter(a => a.file.type === "application/pdf");

  imgAnexos.forEach(({ titulo, subtitulo, file }) => {
    doc.addPage();
    f(11, "bold"); tc(B); doc.text(titulo, PW / 2, 14, { align: "center" });
    f(8.5, "normal"); tc(GR); doc.text(subtitulo, PW / 2, 20, { align: "center" });
    dc(B); lw(0.5); ln(M, 23, PW - M, 23);
    try {
      doc.addImage(file.dataUrl, file.type.includes("png") ? "PNG" : "JPEG", M, 26, CW, PH - 36);
    } catch {
      f(10, "normal"); tc(GR); doc.text("(imagen no incrustable)", PW / 2, PH / 2, { align: "center" });
    }
  });

  // Si no hay PDFs que mergear → guardar directo
  if (pdfAnexos.length === 0) {
    doc.save(fileName);
    return;
  }

  // Hay PDFs externos → mergear con pdf-lib
  const fichaBytes = doc.output("arraybuffer");
  const { PDFDocument } = await safeDynamicImport(() => import("pdf-lib"), "pdf-lib");
  const pdfOut = await PDFDocument.load(fichaBytes);

  for (const { titulo, file } of pdfAnexos) {
    try {
      // dataUrl → Uint8Array
      const base64 = file.dataUrl.split(",")[1];
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      const pdfIn = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const indices = pdfIn.getPageIndices();
      const pages = await pdfOut.copyPages(pdfIn, indices);
      pages.forEach(p => pdfOut.addPage(p));
    } catch (e) {
      console.warn(`pdf-lib: no se pudo incrustar "${titulo}" —`, e);
    }
  }

  const merged = await pdfOut.save();
  const blob = new Blob([merged], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ── ProjectFormImpl: nivel de modulo para estabilidad de identidad ──
// IMPORTANTE: vive aqui (fuera de PurchasesModule) para que React no lo desmonte
// en cada render del padre. Recibe sus dependencias como props.
function ProjectFormImpl({ project, onSaved, allProjects, upsertProjectMeta, renameProjectAlias, setModal }) {
  const [f, setF] = useState(project || { short: "", name: "", code: "" });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!project;
  const aliasCambio = isEdit && f.short !== project.short;
  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 12, fontSize: 12, color: "#1E40AF" }}>
      💡 El <b>codigo contable</b> es opcional. Podes dejarlo vacio ahora y agregarlo luego cuando lo tengas.
    </div>
    {aliasCambio && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 10, padding: 12, fontSize: 12, color: "#92400E" }}>
      ⚠️ Vas a cambiar el alias de <b>"{project.short}"</b> a <b>"{f.short}"</b>. Al guardar, todas las solicitudes existentes que usaban el alias viejo se van a actualizar automaticamente al nuevo. Vas a tener que confirmar.
    </div>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Input label="Alias / Identificador corto *" value={f.short} onChange={e => u("short", e.target.value.toUpperCase())} placeholder="Ej: ICON" />
      <Input label="Codigo contable (opcional)" value={f.code} onChange={e => u("code", e.target.value)} placeholder="Ej: HF-12-4-17-2026" />
      <div style={{ gridColumn: "1/-1" }}>
        <Input label="Nombre completo del proyecto *" value={f.name} onChange={e => u("name", e.target.value)} placeholder="Ej: Cimentacion Torre ICON" />
      </div>
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
      <Btn variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
      <Btn variant="success" onClick={async () => {
        const cleanShort = (f.short || "").trim().toUpperCase();
        const cleanName = (f.name || "").trim();
        if (!cleanShort || !cleanName) return alert("Alias y nombre son obligatorios");
        if (!isEdit) {
          // CREAR nuevo proyecto
          if (allProjects.some(p => p.short === cleanShort)) return alert("Ya existe un proyecto con ese alias. Usa otro.");
          const ok = await upsertProjectMeta(cleanShort, { short: cleanShort, name: cleanName, code: f.code });
          if (!ok) {
            // La sync a la nube fallo tras reintentos. NO cerramos el modal para
            // que el usuario pueda reintentar sin re-tipear. El proyecto quedo en
            // este navegador pero avisamos que podria perderse.
            alert(`⚠️ El proyecto "${cleanShort}" se guardo en este navegador pero NO se pudo sincronizar a la nube.\n\nRevisa tu conexion a internet y volve a tocar "Crear proyecto". Si cerras sesion o abris en otro dispositivo antes de sincronizar, se puede perder.`);
            return;
          }
          if (onSaved) onSaved(cleanShort);
          setModal(null);
          alert(`Proyecto "${cleanShort}" creado y sincronizado. Ya podes usarlo al crear solicitudes.`);
          return;
        }
        // EDITAR existente
        if (cleanShort !== project.short) {
          // Renombre con cascade
          const ok = await renameProjectAlias(project.short, cleanShort, { name: cleanName, code: f.code });
          if (ok) {
            if (onSaved) onSaved(cleanShort);
            setModal(null);
          }
        } else {
          // Solo cambios de nombre/codigo
          const ok = await upsertProjectMeta(cleanShort, { short: cleanShort, name: cleanName, code: f.code });
          if (!ok) {
            alert("⚠️ Los cambios se ven en pantalla pero NO se sincronizaron a la nube. Revisa tu conexion y volve a guardar.");
            return;
          }
          if (onSaved) onSaved(cleanShort);
          setModal(null);
          alert("Proyecto actualizado");
        }
      }}>{isEdit ? (aliasCambio ? "Renombrar y actualizar solicitudes" : "Guardar cambios") : "Crear proyecto"}</Btn>
    </div>
  </div>;
}

// ── PurchaseFormImpl: nivel de modulo ──
// Mismo razonamiento que ProjectFormImpl: vive aqui para que React mantenga la
// identidad del componente estable entre renders del padre. Recibe deps por props.
// ── CorreccionFormImpl (18-sep-2026, pedido de Gerson) ───────────────────
// Corregir el PROYECTO o la PARTIDA de una compra YA PAGADA. Solo Gerson
// (admin) y Christian (costos) — "por si acaso Arturo se equivoca".
//
// ⚠ A propósito NO se reusa PurchaseFormImpl: sus dos botones fuerzan
// `status: "borrador"` / `"validado"` y resetean `treasuryStatus`, así que
// editar con él una compra pagada le borraría a Carolina el pago, la fecha y
// el comprobante. Este form hace un PARCHE de tres campos y no toca nada más.
function CorreccionFormImpl({ purchase, setModal, allProjects, presupuestos, tasa, calcDisponible, updatePurchase, addAudit, userName }) {
  const [projectCode, setProjectCode] = useState(purchase.projectCode || "");
  const [partidaId, setPartidaId] = useState(purchase.partidaId || "");
  const [motivo, setMotivo] = useState("");
  const [justif, setJustif] = useState(purchase.sobregiroJustificacion || "");
  const [saving, setSaving] = useState(false);

  const pres = (presupuestos || []).find(x => x.projectCode === projectCode && x.estado !== "cerrado");
  const partidaSel = pres ? (pres.partidas || []).find(x => x.id === partidaId) : null;
  const opciones = pres ? opcionesPartidas(pres, "compras") : [];
  const opcionesSel = (() => {
    const enOps = opciones.some(g => (g.options || []).some(o => o.value === partidaId));
    return !enOps && partidaSel ? [...opciones, { group: "Actual", options: [{ value: partidaSel.id, label: partidaSel.nombre || "(sin nombre)" }] }] : opciones;
  })();
  const sinElegibles = !!pres && opciones.length === 0 && !partidaSel;
  const tasaN = num(tasa) || TASA_DEFAULT;
  const disp = partidaSel && calcDisponible ? calcDisponible(projectCode, partidaId, purchase.id) : null;
  const montoUSD = hnlToUsd(num(purchase.amount), tasaN);
  const sobregiro = disp && montoUSD > disp.disponibleUSD ? montoUSD - disp.disponibleUSD : 0;

  const cambioProyecto = projectCode !== (purchase.projectCode || "");
  const cambioPartida = (partidaId || "") !== (purchase.partidaId || "");
  const hayCambio = cambioProyecto || cambioPartida;

  const nombrePartida = (id, presu) => {
    const pp = presu ? (presu.partidas || []).find(x => x.id === id) : null;
    return pp ? (pp.nombre || "(sin nombre)") : (id ? "(partida de otro presupuesto)" : "Por clasificar");
  };
  const presOriginal = (presupuestos || []).find(x => x.projectCode === purchase.projectCode);

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ background: C_AMARILLO.bg, border: `1px solid ${C_AMARILLO.color}55`, borderRadius: 12, padding: "12px 15px", fontSize: 12.5, color: C_AMARILLO.color, lineHeight: 1.55 }}>
      Esta compra <b>ya está pagada</b>. Acá solo se corrige a qué <b>proyecto</b> y <b>partida</b> se le carga el gasto —
      el pago, la fecha, el comprobante y el estado quedan intactos. Queda registrado en la bitácora.
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Proveedor</div><div style={{ fontWeight: 700 }}>{purchase.provider}</div></div>
      <div><div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Monto</div><div style={{ fontWeight: 800, color: "#059669" }}>{fmtL(purchase.amount)}</div></div>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Proyecto</label>
      <select value={projectCode} onChange={e => { const v = e.target.value; setProjectCode(v); if (v !== purchase.projectCode) setPartidaId(""); else setPartidaId(purchase.partidaId || ""); }}
        style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }}>
        <option value="">—</option>
        {(allProjects || []).map(p => <option key={p.short} value={p.short}>{p.short} — {p.name}</option>)}
      </select>
    </div>

    {pres && sinElegibles && <div style={{ fontSize: 12, color: "#6E6862", fontStyle: "italic" }}>
      El presupuesto no tiene partida para compras — quedará por clasificar en GeoCost
    </div>}
    {pres && !sinElegibles && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Select label="Partida del presupuesto *" emptyLabel="— Elegí la partida —" options={opcionesSel} value={partidaSel ? partidaId : ""} onChange={e => setPartidaId(e.target.value)} />
      {disp && <div style={{ fontSize: 12, fontWeight: 600, color: disp.disponibleUSD >= 0 ? C_VERDE.color : C_AMARILLO.color }}>
        Disponible: {fmtUSD(disp.disponibleUSD)} · {fmtL(disp.disponibleUSD * tasaN)}
      </div>}
      {sobregiro > 0 && <div style={{ background: C_ULTRA.bg, border: `1px solid ${C_ULTRA.borde}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C_ULTRA.color }}>Sobrepasa la partida en {fmtUSD(sobregiro)}</div>
        <Textarea label="Justificación del sobregiro *" value={justif} onChange={e => setJustif(e.target.value)} placeholder="Por qué se carga igual a esta partida" />
      </div>}
    </div>}
    {!pres && projectCode && <div style={{ fontSize: 12, color: "#6E6862", fontStyle: "italic" }}>
      Ese proyecto no tiene presupuesto en GeoCost — la compra no lleva partida.
    </div>}

    <Textarea label="Motivo de la corrección *" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: la compra era para Villa San Miguel, no para Plantel" />

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid #E2E8F0", paddingTop: 14 }}>
      <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancelar</Btn>
      <Btn variant="success" disabled={saving || !hayCambio} onClick={async () => {
        if (!projectCode) return alert("Elegí el proyecto.");
        if (pres && !sinElegibles && !partidaSel) return alert("Elegí la partida del presupuesto.");
        if (sobregiro > 0 && String(justif || "").trim().length < 5) return alert("Sobrepasa la partida: escribí la justificación del sobregiro (mínimo 5 caracteres).");
        if (String(motivo || "").trim().length < 5) return alert("Escribí el motivo de la corrección (mínimo 5 caracteres).");
        setSaving(true);
        try {
          const antesProy = purchase.projectCode || "—";
          const antesPart = nombrePartida(purchase.partidaId, presOriginal);
          const ahoraPart = sinElegibles || !pres ? "Por clasificar" : nombrePartida(partidaId, pres);
          // PARCHE: se copia la compra tal cual y solo se pisan 3 campos.
          const rec = {
            ...purchase,
            projectCode,
            partidaId: (!pres || sinElegibles) ? "" : (partidaId || ""),
            sobregiroJustificacion: pres && sobregiro > 0 ? String(justif || "").trim() : "",
          };
          // Mismo tipo de audit que usa GeoCost al reclasificar: así `sP` lo
          // RESCATA si otra pestaña guarda encima con una foto vieja.
          const saved = addAudit(rec, "partida_reclasificada",
            `Corrección post-pago por ${userName || "—"}: ${antesProy} → ${projectCode} · ${antesPart} → ${ahoraPart}. Motivo: ${String(motivo).trim()}`);
          const ok = await updatePurchase(saved);
          if (ok !== false) setModal(null);
        } finally { setSaving(false); }
      }}>{saving ? "Guardando…" : "Guardar corrección"}</Btn>
    </div>
  </div>;
}

// ── CxpAddModal: nivel de módulo (si se define adentro se remonta en cada
// render y pierde lo tildado). Programar pagos: se eligen solicitudes, se les
// pone la fecha y —cuando la solicitud es PLAN DE PAGOS— cuánto se abona.
//
// `candidatas` viene con `yaProgramado` y `resta` ya calculados por el módulo:
// una solicitud a plan de pagos sigue apareciendo mientras le falte por
// programar, así el 2º y 3er abono se agregan desde el mismo lugar.
function CxpAddModal({ candidatas, ccColor, onClose, onAdd }) {
  const [sel, setSel] = useState({});       // { [purchaseId]: montoTexto }
  const [q, setQ] = useState("");
  const [fecha, setFecha] = useState("");
  const [soloCredito, setSoloCredito] = useState(false);
  const [saving, setSaving] = useState(false);
  const txt = q.trim().toLowerCase();
  const lista = (candidatas || [])
    .filter(p => !soloCredito || p.condicionPago === "credito")
    .filter(p => !txt
      || String(p.codigo || "").toLowerCase().includes(txt)
      || String(p.provider || "").toLowerCase().includes(txt)
      || String(p.projectCode || "").toLowerCase().includes(txt)
      || String(p.description || "").toLowerCase().includes(txt));
  // Las de crédito primero (son las que hay que calendarizar sí o sí) y dentro
  // de cada grupo, la que más lleva esperando.
  const ordenadas = lista.slice().sort((a, b) =>
    (b.condicionPago === "credito") - (a.condicionPago === "credito")
    || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

  const esPlan = (p) => p.condicionPago === "credito" && p.tipoCredito === "plan";
  const toggle = (p) => setSel(s => {
    if (p.id in s) { const { [p.id]: _, ...resto } = s; return resto; }
    // Al tildarla se propone lo que falta; en plan de pagos se puede cambiar.
    return { ...s, [p.id]: String(p.resta ?? p.amount ?? "") };
  });
  const setMonto = (id, v) => setSel(s => ({ ...s, [id]: v }));

  const ids = Object.keys(sel);
  const totalSel = ids.reduce((s, id) => s + (Number(sel[id]) || 0), 0);
  const nCredito = (candidatas || []).filter(p => p.condicionPago === "credito").length;
  // Ningún abono puede pasarse de lo que falta ni ser 0.
  const invalidas = ordenadas.filter(p => (p.id in sel) && (!(Number(sel[p.id]) > 0) || Number(sel[p.id]) > (p.resta ?? p.amount ?? 0) + 0.005));

  return <Modal title="Programar pagos" onClose={saving ? () => {} : onClose} wide>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Fecha en que hay que pagar *</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 13px", border: `1px solid ${fecha ? "rgba(232,118,45,.45)" : "var(--hairline, #CBD5E1)"}`, borderRadius: 10, fontSize: 13.5, fontFamily: "inherit", outline: "none", background: "var(--surface, #F8FAFC)", colorScheme: "light" }} />
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código, proveedor, proyecto…"
          style={{ flex: "1 1 220px", minWidth: 0, padding: "9px 13px", border: "1px solid var(--hairline, #CBD5E1)", borderRadius: 10, fontSize: 13.5, fontFamily: "inherit", outline: "none", background: "var(--surface, #F8FAFC)" }} />
      </div>
      {nCredito > 0 && <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text-2, #475569)", cursor: "pointer" }}>
        <input type="checkbox" checked={soloCredito} onChange={e => setSoloCredito(e.target.checked)} style={{ accentColor: ORANGE_DARK, cursor: "pointer" }} />
        Ver solo las de crédito ({nCredito})
      </label>}

      <div style={{ maxHeight: "46vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {ordenadas.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--text-3, #94A3B8)", fontSize: 13 }}>
          {(candidatas || []).length === 0 ? "No hay solicitudes pendientes de programar." : "Nada coincide con el filtro."}
        </div>}
        {ordenadas.map(p => {
          const activo = p.id in sel;
          const plan = esPlan(p);
          const malMonto = activo && (!(Number(sel[p.id]) > 0) || Number(sel[p.id]) > (p.resta ?? p.amount ?? 0) + 0.005);
          return <div key={p.id} style={{
            display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", alignItems: "center", gap: 12,
            padding: "10px 13px", borderRadius: 12,
            border: `1px solid ${malMonto ? "rgba(192,57,43,.45)" : activo ? "rgba(232,118,45,.45)" : "var(--hairline, #E2E8F0)"}`,
            background: malMonto ? C_ROJO.bg : activo ? "rgba(232,118,45,.08)" : "var(--surface, #fff)",
          }}>
            <input type="checkbox" checked={activo} onChange={() => toggle(p)} aria-label={`Programar ${p.codigo || p.provider}`}
              style={{ width: 16, height: 16, accentColor: ORANGE_DARK, cursor: "pointer" }} />
            <div style={{ minWidth: 0, cursor: "pointer" }} onClick={() => toggle(p)}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: "var(--text-3, #6E6862)" }}>{p.codigo || "—"}</span>
                <Badge color={ccColor}>{p.projectCode}</Badge>
                {p.condicionPago === "credito" && <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: C_AZUL.color, background: C_AZUL.bg }}>
                  {plan ? "Plan de pagos" : "Crédito"}
                </span>}
              </div>
              <div style={{ font: "700 13px/1.3 var(--sans)", color: "var(--text, #2C2A28)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.provider}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3, #6E6862)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
              {p.yaProgramado > 0 && <div style={{ fontSize: 10.5, color: C_AZUL.color, fontWeight: 700, marginTop: 3 }}>
                Ya programado {fmtL(p.yaProgramado)} de {fmtL(p.amount)} — falta {fmtL(p.resta)}
              </div>}
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap", minWidth: 128 }}>
              {activo && plan ? <>
                <label style={{ fontSize: 9.5, fontWeight: 800, color: "var(--text-3, #6E6862)", textTransform: "uppercase", letterSpacing: ".04em", display: "block", marginBottom: 3 }}>Abono</label>
                <input type="number" step="0.01" min="0" value={sel[p.id]} onChange={e => setMonto(p.id, e.target.value)}
                  aria-label={`Monto a abonar de ${p.codigo || p.provider}`}
                  style={{ width: 120, boxSizing: "border-box", padding: "6px 9px", textAlign: "right", border: `1px solid ${malMonto ? "rgba(192,57,43,.45)" : "var(--hairline, #CBD5E1)"}`, borderRadius: 9, fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none", background: "#fff" }} />
                <div style={{ fontSize: 9.5, color: malMonto ? C_ROJO.color : "var(--text-3, #6E6862)", marginTop: 3 }}>
                  {malMonto ? `máximo ${fmtL(p.resta)}` : `de ${fmtL(p.resta)}`}
                </div>
              </> : <>
                <div style={{ font: "800 14px/1.2 var(--display)", color: "var(--text, #2C2A28)" }}>{fmtL(p.resta ?? p.amount)}</div>
                {plan && <div style={{ fontSize: 9.5, color: "var(--text-3, #6E6862)", marginTop: 3 }}>tildala para abonar</div>}
              </>}
            </div>
          </div>;
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--hairline, #E2E8F0)", paddingTop: 12 }}>
        <span style={{ fontSize: 12.5, color: invalidas.length ? C_ROJO.color : "var(--text-3, #6E6862)" }}>
          {invalidas.length ? "Revisá los montos marcados en rojo"
            : ids.length ? <>{ids.length} pago{ids.length === 1 ? "" : "s"} · <b style={{ color: "var(--text, #2C2A28)" }}>{fmtL(totalSel)}</b>{fecha ? <> · el <b>{fmtCorta(fecha)}</b></> : ""}</>
              : "Ninguna seleccionada"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" disabled={!ids.length || !fecha || !!invalidas.length || saving}
            title={!fecha ? "Elegí primero la fecha de pago" : ""}
            onClick={async () => { setSaving(true); try { await onAdd(ids.map(id => ({ purchaseId: id, monto: Number(sel[id]) || 0 })), fecha); } finally { setSaving(false); } }}>
            {saving ? "Programando…" : `Programar ${ids.length || ""}`.trim()}
          </Btn>
        </div>
      </div>
    </div>
  </Modal>;
}

// ── PrioridadAddModal: nivel de módulo (mismo motivo que los otros forms —
// definido adentro se remontaría en cada render y perdería lo tildado).
// Elegir qué solicitudes entran a la cola de pago de Tesorería.
function PrioridadAddModal({ candidatas, ccColor, onClose, onAdd }) {
  const [sel, setSel] = useState([]);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const txt = q.trim().toLowerCase();
  const lista = (candidatas || []).filter(p => !txt
    || String(p.codigo || "").toLowerCase().includes(txt)
    || String(p.provider || "").toLowerCase().includes(txt)
    || String(p.projectCode || "").toLowerCase().includes(txt)
    || String(p.description || "").toLowerCase().includes(txt));
  // Las que más esperan, primero: es el orden en que uno las va a priorizar.
  const ordenadas = lista.slice().sort((a, b) => String(a.validatedAt || a.createdAt || "").localeCompare(String(b.validatedAt || b.createdAt || "")));
  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const totalSel = (candidatas || []).filter(p => sel.includes(p.id)).reduce((s, p) => s + (Number(p.amount) || 0), 0);

  return <Modal title="Agregar a la cola de pago" onClose={saving ? () => {} : onClose} wide>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por código, proveedor, proyecto…" autoFocus
        style={{ padding: "9px 13px", border: "1px solid var(--hairline, #CBD5E1)", borderRadius: 10, fontSize: 13.5, fontFamily: "inherit", outline: "none", background: "var(--surface, #F8FAFC)" }} />
      <div style={{ maxHeight: "52vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {ordenadas.length === 0 && <div style={{ padding: 30, textAlign: "center", color: "var(--text-3, #94A3B8)", fontSize: 13 }}>
          {(candidatas || []).length === 0 ? "No hay solicitudes pendientes de pago fuera de la cola." : "Nada coincide con la búsqueda."}
        </div>}
        {ordenadas.map(p => {
          const activo = sel.includes(p.id);
          const venc = estaVencida(p);
          const dias = diasEsperandoPago(p);
          return <label key={p.id} style={{
            display: "grid", gridTemplateColumns: "22px minmax(0,1fr) auto", alignItems: "center", gap: 12,
            padding: "10px 13px", borderRadius: 12, cursor: "pointer",
            border: `1px solid ${activo ? "rgba(232,118,45,.45)" : venc ? C_ROJO.borde : "var(--hairline, #E2E8F0)"}`,
            background: activo ? "rgba(232,118,45,.08)" : venc ? C_ROJO.bg : "var(--surface, #fff)",
          }}>
            <input type="checkbox" checked={activo} onChange={() => toggle(p.id)} style={{ width: 16, height: 16, accentColor: ORANGE_DARK, cursor: "pointer" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: "var(--text-3, #6E6862)" }}>{p.codigo || "—"}</span>
                <Badge color={ccColor}>{p.projectCode}</Badge>
                {venc && <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: C_ROJO.color, background: C_ROJO.bg }}>Vencida</span>}
              </div>
              <div style={{ font: "700 13px/1.3 var(--sans)", color: "var(--text, #2C2A28)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.provider}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3, #6E6862)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <div style={{ font: "800 14px/1.2 var(--display)", color: "var(--text, #2C2A28)" }}>{fmtL(p.amount)}</div>
              <div style={{ fontSize: 10.5, marginTop: 2, color: venc ? C_ROJO.color : "var(--text-3, #6E6862)", fontWeight: venc ? 800 : 500 }}>{dias != null ? `${dias} días` : "—"}</div>
            </div>
          </label>;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--hairline, #E2E8F0)", paddingTop: 12 }}>
        <span style={{ fontSize: 12.5, color: "var(--text-3, #6E6862)" }}>
          {sel.length ? <>{sel.length} seleccionada{sel.length === 1 ? "" : "s"} · <b style={{ color: "var(--text, #2C2A28)" }}>{fmtL(totalSel)}</b></> : "Ninguna seleccionada"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Btn>
          <Btn variant="primary" disabled={!sel.length || saving} onClick={async () => { setSaving(true); try { await onAdd(sel); } finally { setSaving(false); } }}>
            {saving ? "Agregando…" : `Agregar ${sel.length || ""}`.trim()}
          </Btn>
        </div>
      </div>
    </div>
  </Modal>;
}

function PurchaseFormImpl({ purchase, co, userName, setModal, getProject, allProjects, purchases, providers, addAudit, saveOrAlert, upsertProvider, presupuestos, tasa, calcDisponible }) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState(purchase || {
    company: co, projectCode: "", provider: "", description: "",
    amount: "", quoteNumber: "", opsResponsible: userName || "",
    cierreResponsable: "", detalleMateriales: "",
    // Condición de pago (21-sep-2026): "contado" | "credito". Las de crédito
    // las calendariza Christian en "Cuentas por pagar"; `tipoCredito` dice si
    // es un solo pago o un plan de abonos (ahí se programa cada uno).
    condicionPago: "contado", tipoCredito: "unico",
    // GeoCost (9-sep-2026): de qué partida del presupuesto baja la compra.
    // Solo se exige si el proyecto tiene presupuesto en cc-presupuestos.
    partidaId: "", sobregiroJustificacion: "",
    opsNotes: "", bacAccount: "", providerBank: "", providerAccountType: "", providerAccountHolder: "", providerRTN: "", quoteFile: null, receiptFile: null,
    // Ficha de proveedor NUEVO (20-ago-2026): si el proveedor no existe en la
    // base, se puede completar su ficha acá mismo y queda guardado en
    // cp-providers — que es COMPARTIDA por GeoShopping y GeoMachinery.
    provNuevo: false, provTelefono: "", provContacto: "", provEmail: "", provNotas: "",
    status: "borrador", createdAt: new Date().toISOString(), audit: [],
    paymentMethod: "Transferencia BAC", paymentReference: "", paymentDate: "", treasuryNotes: "",
  });
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const linkedProject = getProject(f.projectCode);

  // ── GeoCost: partida + sobregiro (9-sep-2026) ──
  // Solo aplica si el proyecto elegido tiene presupuesto ACTIVO; si no, el
  // form es idéntico al de siempre. `partidaSel` exige que la partida exista
  // en ese presupuesto (un id viejo de otro proyecto no cuenta como elegida).
  const presConPartidas = (presupuestos || []).find(p => p.projectCode === f.projectCode && p.estado !== "cerrado");
  const partidaSel = presConPartidas ? (presConPartidas.partidas || []).find(x => x.id === f.partidaId) : null;
  // Partidas ELEGIBLES para compras: módulo "compras" + "libre". Si el
  // presupuesto no trae ninguna (ej. uno armado solo con MO + movilización) la
  // partida NO se exige y la compra cae a "Por clasificar" en GeoCost — antes el
  // form quedaba bloqueado con un Select vacío (revisión adversarial, #5).
  // Si la compra ya trae una partida de otro módulo (reclasificada desde
  // GeoCost), se conserva como grupo "Actual" para no perderla al editar ni
  // dejar el select controlado en blanco (#18) — espejo de GeoMachinery.
  const opcionesCC = presConPartidas ? opcionesPartidas(presConPartidas, "compras") : [];
  const opcionesSelectCC = (() => {
    const enOps = opcionesCC.some(g => (g.options || []).some(o => o.value === f.partidaId));
    return !enOps && partidaSel ? [...opcionesCC, { group: "Actual", options: [{ value: partidaSel.id, label: partidaSel.nombre || "(sin nombre)" }] }] : opcionesCC;
  })();
  const sinElegiblesCC = !!presConPartidas && opcionesCC.length === 0 && !partidaSel;
  const tasaCC = num(tasa) || TASA_DEFAULT;
  // Al editar, la propia compra se excluye del usado (si no se contaría dos veces).
  const dispCC = partidaSel && calcDisponible ? calcDisponible(f.projectCode, f.partidaId, purchase?.id) : null;
  const montoUSD = hnlToUsd(num(f.amount), tasaCC);
  const sobregiroCC = dispCC && num(f.amount) > 0 && montoUSD > dispCC.disponibleUSD ? montoUSD - dispCC.disponibleUSD : 0;
  // Validación compartida por "Guardar borrador" y "Aprobar": null = OK.
  const errorPartidaCC = () => {
    if (!presConPartidas || sinElegiblesCC) return null;
    if (!partidaSel) return "Elegí la partida del presupuesto de la que baja esta compra";
    if (sobregiroCC > 0 && String(f.sobregiroJustificacion || "").trim().length < 5) return "Sobrepasa la partida: escribí la justificación del sobregiro (mínimo 5 caracteres)";
    return null;
  };
  // Campos GeoCost que van en el `rec` de AMBOS botones. La justificación
  // vive en `f` y el Textarea solo se muestra con sobregiro: si el monto se
  // corrige y ya no sobrepasa (o el proyecto cambia a uno sin presupuesto), el
  // texto viejo NO debe viajar con la compra (#20). Sin partida elegible se
  // guarda "" para que GeoCost la muestre en "Por clasificar" (#5).
  const camposCC = () => ({
    partidaId: sinElegiblesCC ? "" : (f.partidaId || ""),
    sobregiroJustificacion: presConPartidas && sobregiroCC > 0 ? String(f.sobregiroJustificacion || "").trim() : "",
  });

  // Registra el proveedor de la solicitud en cp-providers (base COMPARTIDA por
  // los dos módulos). Si ya existe, solo completa los huecos — nunca pisa lo
  // que alguien ya cargó a mano. Best effort: si falla, la solicitud igual se
  // guarda (el auto-import de la próxima carga lo recupera).
  const registrarProveedorSiNuevo = async (rec) => {
    try {
      if (!upsertProvider) return;
      const nombre = String(rec.provider || "").trim();
      if (!nombre) return;
      const existente = (providers || []).find(pv => String(pv.name || "").trim().toLowerCase() === nombre.toLowerCase());
      const cuenta = { bank: rec.providerBank || "", type: rec.providerAccountType || "", number: rec.bacAccount || "", holder: rec.providerAccountHolder || nombre };
      const tieneCuenta = !!(cuenta.bank || cuenta.number || cuenta.type);
      if (existente) {
        // Completar solo lo que falte (RTN, cuenta, teléfono, contacto).
        const parche = {};
        if (!existente.rtn && rec.providerRTN) parche.rtn = rec.providerRTN;
        if (tieneCuenta && !(existente.bankAccounts || []).some(b => (b.number || "") === cuenta.number && cuenta.number)) {
          parche.bankAccounts = [...(existente.bankAccounts || []), cuenta];
        }
        if (rec.provNuevo) {
          if (!existente.contactName && rec.provContacto) parche.contactName = rec.provContacto;
          if (!existente.contactEmail && rec.provEmail) parche.contactEmail = rec.provEmail;
          if (rec.provTelefono && !(existente.phones || []).includes(rec.provTelefono)) parche.phones = [...(existente.phones || []).filter(Boolean), rec.provTelefono];
        }
        if (Object.keys(parche).length) await upsertProvider({ ...existente, ...parche, autoImported: false });
        return;
      }
      await upsertProvider({
        id: uid(), name: nombre,
        rtn: rec.providerRTN || "",
        phones: rec.provTelefono ? [rec.provTelefono] : [],
        bankAccounts: tieneCuenta ? [cuenta] : [],
        contactName: rec.provContacto || "",
        contactEmail: rec.provEmail || "",
        notes: rec.provNotas || (rec.provNuevo ? "" : "Creado desde una solicitud de compra — completar datos."),
        autoImported: !rec.provNuevo,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    } catch (e) { console.warn("No se pudo registrar el proveedor:", e?.message || e); }
  };


  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Select label="Empresa" options={[{ value: "subterra", label: "Subterra Honduras" }, { value: "geotecnica", label: "Geotecnica Soluciones" }]} value={f.company} onChange={e => u("company", e.target.value)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "flex", justifyContent: "space-between" }}>
          <span>Proyecto</span>
          <button type="button" onClick={() => setModal({ t: "new-project", returnTo: purchase ? { t: "edit", d: purchase } : { t: "new" } })} style={{ background: "none", border: "none", color: "#BE185D", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ Nuevo proyecto</button>
        </label>
        <select style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }} value={f.projectCode} onChange={e => {
          // Cambiar de proyecto suelta la partida (es de OTRO presupuesto).
          const v = e.target.value;
          setF(p => ({ ...p, projectCode: v, partidaId: p.projectCode === v ? p.partidaId : "" }));
        }}>
          <option value="">—</option>
          {allProjects.map(p => <option key={p.short} value={p.short}>{p.short} — {p.name}{p.isCustom ? " (nuevo)" : ""}{p.code ? "" : " · sin codigo"}</option>)}
        </select>
      </div>
      {/* GeoCost (9-sep-2026): partida del presupuesto — SOLO si el proyecto
          tiene presupuesto activo. Disponible en vivo; si la compra (en USD a
          la tasa vigente) lo sobrepasa, no bloquea pero exige justificación. */}
      {presConPartidas && sinElegiblesCC && <div style={{ gridColumn: "1/-1", fontSize: 12, color: "#6E6862", fontStyle: "italic" }}>
        El presupuesto no tiene partida para compras — quedará por clasificar en GeoCost
      </div>}
      {presConPartidas && !sinElegiblesCC && <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 8 }}>
        <Select label="Partida del presupuesto *" emptyLabel="— Elegí la partida —" options={opcionesSelectCC} value={partidaSel ? f.partidaId : ""} onChange={e => u("partidaId", e.target.value)} />
        {dispCC && <div style={{ fontSize: 12, fontWeight: 600, color: dispCC.disponibleUSD >= 0 ? C_VERDE.color : C_AMARILLO.color }}>
          Disponible: {fmtUSD(dispCC.disponibleUSD)} · {fmtL(dispCC.disponibleUSD * tasaCC)}
        </div>}
        {sobregiroCC > 0 && <div style={{ background: "rgba(232,118,45,.10)", border: "1px solid rgba(232,118,45,.35)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#A94E16" }}>Sobrepasa la partida en {fmtUSD(sobregiroCC)}</div>
          <Textarea label="Justificación del sobregiro *" value={f.sobregiroJustificacion || ""} onChange={e => u("sobregiroJustificacion", e.target.value)} placeholder="Por qué se aprueba igual" />
        </div>}
      </div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Proveedor</span>
          {(providers || []).length > 0 && <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>{(providers || []).length} conocidos</span>}
        </label>
        <input
          list="providers-datalist"
          style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, outline: "none", background: "#F8FAFC" }}
          value={f.provider}
          onChange={e => u("provider", e.target.value)}
          onBlur={e => {
            // Auto-fill al terminar de escribir/elegir. Se dispara tanto cuando
            // el user tipea a mano como cuando elige del datalist. onChange no
            // siempre captura el valor final del datalist en Safari/Firefox.
            const newName = (e.target.value || "").trim();
            if (!newName) return;
            const match = (providers || []).find(p => (p.name || "").trim().toLowerCase() === newName.toLowerCase());
            if (!match) {
              console.log("[Autofill proveedor] Sin match para:", newName, "— providers cargados:", (providers || []).length);
              return;
            }
            console.log("[Autofill proveedor] Match:", match.name, "| cuentas:", match.bankAccounts?.length || 0, "| RTN:", match.rtn || "—");
            // PISAMOS SIEMPRE (sin los guards de "if empty") — asi cambiar de proveedor
            // reemplaza los datos del anterior. El usuario puede editar despues si
            // necesita ajustar.
            const bac = (match.bankAccounts || []).find(b => /bac/i.test(b.bank || "")) || (match.bankAccounts || [])[0];
            if (bac) {
              if (bac.number) u("bacAccount", bac.number);
              if (bac.bank) u("providerBank", bac.bank);
              if (bac.type) u("providerAccountType", bac.type);
              if (bac.holder) u("providerAccountHolder", bac.holder);
            }
            if (match.rtn) u("providerRTN", match.rtn);
          }}
          placeholder="Escribe o elige de la lista"
        />
        <datalist id="providers-datalist">
          {(providers || []).map(p => <option key={p.id} value={p.name} />)}
        </datalist>
      </div>
      <Input label="N° de Cotizacion" value={f.quoteNumber} onChange={e => u("quoteNumber", e.target.value)} placeholder="Ej: COT-2026-0123" />
      <Input label="Monto total (Lempiras)" type="number" step="0.01" value={f.amount} onChange={e => u("amount", e.target.value)} placeholder="0.00" />
      {/* CONTADO o CRÉDITO (21-sep-2026, pedido de Gerson): las compras
          grandes muchas veces vienen a crédito, y esas las CALENDARIZA
          Christian en la pestaña "Cuentas por pagar". Acá solo se marca la
          condición; la fecha acordada es una sugerencia para esa pestaña.
          Las solicitudes viejas sin el campo se tratan como contado. */}
      <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Condición de pago</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[{ k: "contado", t: "Contado", d: "Se paga de una, entra a la cola normal de Tesorería" },
            { k: "credito", t: "Crédito", d: "El proveedor nos dio plazo — se calendariza en Cuentas por pagar" }].map(o => {
            const activo = (f.condicionPago || "contado") === o.k;
            return <button key={o.k} type="button" title={o.d}
              onClick={() => u("condicionPago", o.k)}
              style={{ padding: "8px 18px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 800,
                border: activo ? "1px solid transparent" : "1px solid #CBD5E1",
                background: activo ? ORANGE_DARK : "#F8FAFC", color: activo ? "#fff" : "#475569" }}>{o.t}</button>;
          })}
        </div>
        {(f.condicionPago || "contado") === "credito" && <div style={{ background: C_AZUL.bg, border: `1px solid rgba(29,95,175,.22)`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, color: C_AZUL.color, fontWeight: 700 }}>¿Cómo se paga el crédito?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[{ k: "unico", t: "Un solo pago", d: "Se paga completa en la fecha que se programe" },
              { k: "plan", t: "Plan de pagos", d: "Se abona por partes — en Cuentas por pagar se programa cada abono" }].map(o => {
              const activo = (f.tipoCredito || "unico") === o.k;
              return <button key={o.k} type="button" title={o.d}
                onClick={() => u("tipoCredito", o.k)}
                style={{ padding: "7px 16px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
                  border: activo ? "1px solid transparent" : "1px solid rgba(29,95,175,.30)",
                  background: activo ? C_AZUL.color : "#fff", color: activo ? "#fff" : C_AZUL.color }}>{o.t}</button>;
            })}
          </div>
          <div style={{ fontSize: 11.5, color: C_AZUL.color, lineHeight: 1.5, opacity: .9 }}>
            {(f.tipoCredito || "unico") === "plan"
              ? <>Al aprobarla va a aparecer en <b>Cuentas por pagar</b> para programar cada abono con su fecha y su monto.</>
              : <>Al aprobarla va a aparecer en <b>Cuentas por pagar</b> para ponerle la fecha de pago.</>}
          </div>
        </div>}
      </div>
      <Input label="Responsable de Operaciones" value={f.opsResponsible} onChange={e => u("opsResponsible", e.target.value)} placeholder="Quien valida por Operaciones" />
      {/* Dropdown de usuarios (20-ago-2026): el responsable de cierre ahora
          filtra el tablero "Por cerrar contable" — cada quien ve las suyas —
          así que tiene que ser un usuario del sistema, no texto libre. Si la
          solicitud vieja traía un nombre escrito a mano, se conserva como
          opción para no perderlo. */}
      <Select label="Responsable de cierre contable" emptyLabel="— Sin asignar —"
        options={[...new Set([...USERS.map(u2 => u2.label), ...(f.cierreResponsable ? [f.cierreResponsable] : [])])].sort()}
        value={f.cierreResponsable || ""} onChange={e => u("cierreResponsable", e.target.value)} />
      {/* CAMPO ÚNICO (20-ago-2026): antes había "Descripción de la compra" y
          además "Detalle de materiales" — lo mismo escrito dos veces. Ahora
          este es el único, y alimenta `description` (que es lo que ven la
          tabla, las cards, la ficha de entrega, los despachos y los
          reportes). `detalleMateriales` queda solo en las solicitudes viejas
          que ya lo tenían. */}
      <div style={{ gridColumn: "1/-1" }}>
        <Textarea label="Qué se está comprando (tal cual la cotización) *" value={f.description} onChange={e => u("description", e.target.value)} placeholder={"Un renglón por ítem, como viene en la cotización:\n2 × Sacos de cemento 42.5 kg\n10 × Varilla 3/8 grado 60"} />
      </div>

      {/* FICHA DEL PROVEEDOR (20-ago-2026, pedido de Gerson) ─────────────────
          Si el nombre escrito no está en la base, se avisa y con un check se
          expanden los campos para dejar la ficha completa. Al guardar la
          solicitud el proveedor queda registrado en cp-providers, que es la
          MISMA base de GeoShopping y GeoMachinery: no hay que volver a
          crearlo en el otro módulo. */}
      {(() => {
        const nombre = String(f.provider || "").trim();
        const yaExiste = !!nombre && (providers || []).some(pv => String(pv.name || "").trim().toLowerCase() === nombre.toLowerCase());
        const esNuevo = !!nombre && !yaExiste;
        return <div style={{ gridColumn: "1/-1", background: esNuevo ? "#F0FDF4" : "#F8FAFC", border: `1px solid ${esNuevo ? "#86EFAC" : "#E2E8F0"}`, borderRadius: 10, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: esNuevo ? "#065F46" : "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {esNuevo ? "🆕 Proveedor nuevo — no está en la base" : "💳 Datos bancarios del proveedor (opcional)"}
            </div>
            {esNuevo && <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, color: "#065F46", cursor: "pointer", background: "#fff", border: "1px solid #86EFAC", borderRadius: 8, padding: "5px 10px" }}>
              <input type="checkbox" checked={!!f.provNuevo} onChange={e => u("provNuevo", e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#059669" }} />
              Guardar su ficha completa
            </label>}
          </div>
          {esNuevo && !f.provNuevo && <div style={{ fontSize: 11.5, color: "#047857", marginBottom: 10 }}>
            “{nombre}” se va a agregar a la lista de proveedores igual, pero sin datos. Marcá la casilla para completar su ficha (teléfono, contacto, cuenta) y dejarla lista para Tesorería.
          </div>}
          {esNuevo && f.provNuevo && <div style={{ fontSize: 11.5, color: "#065F46", marginBottom: 10, fontWeight: 600 }}>
            Al guardar la solicitud, <b>{nombre}</b> queda registrado en la base de proveedores — disponible en GeoShopping y en GeoMachinery.
          </div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Banco" value={f.providerBank || ""} onChange={e => u("providerBank", e.target.value)} placeholder="Ej: BAC, Banpais, Atlantida" />
            <Input label="Tipo de cuenta" value={f.providerAccountType || ""} onChange={e => u("providerAccountType", e.target.value)} placeholder="Ahorro / Cheques" />
            <Input label="Titular de la cuenta" value={f.providerAccountHolder || ""} onChange={e => u("providerAccountHolder", e.target.value)} placeholder="Nombre del titular" />
            <Input label="RTN" value={f.providerRTN || ""} onChange={e => u("providerRTN", e.target.value)} placeholder="0801-1990-12345" />
            <div style={{ gridColumn: "1/-1" }}>
              <Input label="Numero de cuenta" value={f.bacAccount} onChange={e => u("bacAccount", e.target.value)} placeholder="Ej: 10-251-000123" />
            </div>
            {esNuevo && f.provNuevo && <>
              <Input label="Teléfono" value={f.provTelefono || ""} onChange={e => u("provTelefono", e.target.value)} placeholder="+504 9999-9999" />
              <Input label="Persona de contacto" value={f.provContacto || ""} onChange={e => u("provContacto", e.target.value)} placeholder="Nombre de quien atiende" />
              <Input label="Correo" value={f.provEmail || ""} onChange={e => u("provEmail", e.target.value)} placeholder="ventas@proveedor.hn" />
              <Input label="Nota interna" value={f.provNotas || ""} onChange={e => u("provNotas", e.target.value)} placeholder="Horarios, condiciones, quién lo atiende…" />
            </>}
          </div>
        </div>;
      })()}

      <div style={{ gridColumn: "1/-1" }}>
        <Textarea label="Notas de Operaciones para Tesoreria" value={f.opsNotes} onChange={e => u("opsNotes", e.target.value)} placeholder="Urgencia, condiciones de pago, referencias al proyecto, etc." />
      </div>
    </div>

    {linkedProject && !linkedProject.costsRequestFile && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 10, padding: 12, fontSize: 12, color: "#92400E" }}>
      ⚠️ El proyecto <b>{linkedProject.short}</b> aun no tiene cargada la solicitud original validada por Costos. Podes subirla en la pestaña <b>Proyectos</b>.
    </div>}
    {linkedProject && linkedProject.costsRequestFile && <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 12, fontSize: 12, color: "#065F46" }}>
      ✓ Proyecto <b>{linkedProject.short}</b> ya tiene solicitud validada por Costos adjunta: <b>{linkedProject.costsRequestFile.name}</b>
    </div>}

    <FileSlot
      label="Cotizacion aprobada del proveedor"
      file={f.quoteFile}
      canUpload
      accent="#2563EB"
      onUpload={fd => u("quoteFile", fd)}
      onRemove={() => u("quoteFile", null)}
    />

    <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 12, fontSize: 12, color: "#64748b" }}>
      💡 Al <b>Aprobar</b> la solicitud pasa a Tesoreria con estado <b>Pendiente Lic. Carolina</b>. Antes de aprobar podes guardar como <b>Borrador</b> y completar luego.
    </div>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
      <div style={{ fontSize: 12, color: "#64748b" }}>
        {purchase ? `Creada: ${fmtDT(purchase.createdAt)}` : "Nueva solicitud"}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {saving && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, fontSize: 12, color: "#92400E", fontWeight: 700 }}>
          <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #F59E0B", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Guardando — NO cierres ni refresques
        </div>}
        <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancelar</Btn>
        <Btn variant="warn" disabled={saving} onClick={async () => {
          if (!f.projectCode || !f.provider || !f.description || !f.amount) return alert("Complete proyecto, proveedor, descripcion y monto");
          { const eCC = errorPartidaCC(); if (eCC) return alert(eCC); }   // GeoCost: partida + sobregiro
          setSaving(true);
          try {
            const rec = { ...f, ...camposCC(), id: f.id || uid(), codigo: f.codigo || siguienteCodigo(purchases), status: "borrador", treasuryStatus: null };
            await registrarProveedorSiNuevo(rec);
            const saved = purchase ? addAudit(rec, "edited", "Guardado como borrador") : addAudit(rec, "created", "Creado como borrador");
            const next = purchase
              ? purchases.map(p => p.id === saved.id ? saved : p)
              : [...purchases, saved];
            const ok = await saveOrAlert(next);
            if (ok) setModal(null);
          } finally {
            setSaving(false);
          }
        }}>{saving ? "..." : "💾 Guardar borrador"}</Btn>
        <Btn variant="success" disabled={saving} onClick={async () => {
          if (!f.projectCode || !f.provider || !f.description || !f.amount || !f.quoteNumber || !f.opsResponsible) return alert("Para aprobar: complete proyecto, proveedor, descripcion, monto, N° cotizacion y responsable");
          { const eCC = errorPartidaCC(); if (eCC) return alert(eCC); }   // GeoCost: partida + sobregiro
          if (!f.quoteFile) { if (!confirm("No hay cotizacion adjunta. ¿Aprobar de todas formas?")) return; }
          setSaving(true);
          try {
            const rec = { ...f, ...camposCC(), id: f.id || uid(), codigo: f.codigo || siguienteCodigo(purchases), status: "validado", treasuryStatus: "pendiente", validatedAt: new Date().toISOString() };
            await registrarProveedorSiNuevo(rec);
            const saved = addAudit(rec, "approved", `Aprobado por Coord. Operaciones (${f.opsResponsible})`);
            const next = purchase
              ? purchases.map(p => p.id === saved.id ? saved : p)
              : [...purchases, saved];
            const ok = await saveOrAlert(next);
            if (ok) {
              setModal(null);
              alert("✓ Solicitud aprobada. Paso a Tesoreria como 'Pendiente Lic. Carolina'.");
            }
          } finally {
            setSaving(false);
          }
        }}>{saving ? "..." : "✓ Aprobar y enviar a Tesoreria"}</Btn>
      </div>
    </div>
  </div>;
}

// ── PaymentFormImpl: nivel de modulo (mismo motivo que los anteriores) ──
function PaymentFormImpl({ purchase, setModal, addAudit, updatePurchase }) {
  const [f, setF] = useState({
    paymentMethod: purchase.paymentMethod || "Transferencia BAC",
    paymentDate: purchase.paymentDate || hoyISO(),
    treasuryNotes: purchase.treasuryNotes || "",
    receiptFile: purchase.receiptFile || null,
  });
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, color: "#92400E", fontWeight: 700, marginBottom: 4 }}>DETALLE DE LA SOLICITUD</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
        <div><b>Proveedor:</b> {purchase.provider}</div>
        <div><b>Proyecto:</b> {projLabel(purchase.projectCode)}</div>
        <div><b>Descripcion:</b> {purchase.description}</div>
        <div><b>Monto:</b> <span style={{ color: "#059669", fontWeight: 700, fontSize: 15 }}>{fmtL(purchase.amount)}</span></div>
        <div><b>N° Cotizacion:</b> {purchase.quoteNumber || "—"}</div>
        <div><b>Aprobado por:</b> {purchase.opsResponsible || "—"}</div>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Select label="Metodo de pago" options={PAYMENT_METHODS} value={f.paymentMethod} onChange={e => u("paymentMethod", e.target.value)} />
      <Input label="Fecha del pago" type="date" value={f.paymentDate} onChange={e => u("paymentDate", e.target.value)} />
    </div>

    <FileSlot
      label="🧾 Adjuntar transferencia (foto, PDF o Excel)"
      file={f.receiptFile}
      canUpload
      accent="#059669"
      onUpload={fd => u("receiptFile", fd)}
      onRemove={() => u("receiptFile", null)}
    />

    <Textarea label="Notas de Tesoreria" value={f.treasuryNotes} onChange={e => u("treasuryNotes", e.target.value)} placeholder="Observaciones, descuentos aplicados, retenciones, etc." />

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
      <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancelar</Btn>
      <Btn variant="success" disabled={saving} onClick={async () => {
        if (!f.paymentMethod || !f.paymentDate) return alert("Seleccione metodo y fecha de pago");
        const hasReceipt = !!f.receiptFile;
        console.group(`[PaymentForm] Registrar pago ${purchase.id}`);
        console.log("Method:", f.paymentMethod, "| Date:", f.paymentDate, "| hasReceipt:", hasReceipt);
        if (hasReceipt) console.log("Receipt file:", f.receiptFile?.name, "size:", f.receiptFile?.size, "type:", f.receiptFile?.type);
        setSaving(true);
        try {
          const rec = {
            ...purchase, ...f,
            status: hasReceipt ? "finalizado" : "pagado",
            treasuryStatus: "pagada",
            deliveryStatus: purchase.deliveryStatus || "pendiente_entrega",
            delivery: purchase.delivery || {},
            paidAt: new Date(f.paymentDate).toISOString(),
            finalizedAt: hasReceipt ? new Date().toISOString() : purchase.finalizedAt || null,
          };
          const note = hasReceipt
            ? `Pago ${f.paymentMethod} registrado con comprobante — FINALIZADA`
            : `Pago ${f.paymentMethod} registrado sin comprobante`;
          const saved = addAudit(rec, "paid", note);
          console.log("Llamando updatePurchase...");
          const ok = await updatePurchase(saved);
          console.log("updatePurchase devolvio:", ok);
          if (!ok) {
            alert("⚠️ El pago NO se sincronizo a la nube.\n\nAbri la consola del navegador (Cmd+Option+I) y revisa que dice. Reintenta el guardado o avisame que pasa.");
            return;
          }
          setModal({ t: "detail", d: saved });
          setTimeout(() => alert(hasReceipt
            ? "✓ Pago registrado y comprobante adjuntado. Solicitud FINALIZADA."
            : "✓ Pago registrado. Podes adjuntar el comprobante mas tarde desde el detalle."
          ), 100);
        } catch (err) {
          console.error("Error en Registrar pago:", err);
          alert(`❌ Error registrando pago: ${err?.message || err}\n\nMira la consola del navegador para detalles.`);
        } finally {
          setSaving(false);
          console.groupEnd();
        }
      }}>{saving ? "💾 Guardando..." : "💰 Registrar pago"}</Btn>
    </div>
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────
// ProviderFormImpl: form de proveedor (CRUD)
// ─────────────────────────────────────────────────────────────────────────
function ProviderFormImpl({ provider, setModal, upsertProvider, deleteProvider, subirConstanciaProveedor }) {
  const [f, setF] = useState(provider || {
    id: "",
    name: "",
    rtn: "",
    phones: [""],
    bankAccounts: [{ bank: "", type: "", number: "", holder: "" }],
    contactName: "",
    contactEmail: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const u = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isEdit = !!provider;
  const [visor, setVisor] = useState(null); // constancia de pagos a cuenta (visor en la app)

  const setPhone = (idx, v) => setF(p => ({ ...p, phones: p.phones.map((x, i) => i === idx ? v : x) }));
  const addPhone = () => setF(p => ({ ...p, phones: [...(p.phones || []), ""] }));
  const removePhone = (idx) => setF(p => ({ ...p, phones: p.phones.filter((_, i) => i !== idx) }));

  const setBank = (idx, k, v) => setF(p => ({ ...p, bankAccounts: p.bankAccounts.map((b, i) => i === idx ? { ...b, [k]: v } : b) }));
  const addBank = () => setF(p => ({ ...p, bankAccounts: [...(p.bankAccounts || []), { bank: "", type: "", number: "", holder: "" }] }));
  const removeBank = (idx) => setF(p => ({ ...p, bankAccounts: p.bankAccounts.filter((_, i) => i !== idx) }));

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 12, fontSize: 12, color: "#1E40AF" }}>
      💡 Esta info se usa para que el equipo (Ana) coordine retiros con el proveedor y para que al crear una nueva solicitud se rellenen automaticamente los datos bancarios.
    </div>

    {/* Datos generales */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Input label="Nombre del proveedor *" value={f.name} onChange={e => u("name", e.target.value)} placeholder="Razon social o nombre comercial" />
      <Input label="RTN" value={f.rtn || ""} onChange={e => u("rtn", e.target.value)} placeholder="0801-1990-12345" />
      <Input label="Persona de contacto" value={f.contactName} onChange={e => u("contactName", e.target.value)} placeholder="Ej: Ing. Juan Perez" />
      <Input label="Email" value={f.contactEmail} onChange={e => u("contactEmail", e.target.value)} placeholder="contacto@proveedor.com" />
    </div>

    {/* Telefonos */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>📞 Telefonos</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(f.phones || []).map((ph, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <input style={{ flex: 1, padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 14, background: "#F8FAFC" }} value={ph} onChange={e => setPhone(i, e.target.value)} placeholder={`Telefono ${i + 1}`} />
            {(f.phones.length > 1) && <Btn small variant="danger" onClick={() => removePhone(i)}>×</Btn>}
          </div>
        ))}
        <Btn small variant="ghost" onClick={addPhone}>+ Agregar telefono</Btn>
      </div>
    </div>

    {/* Cuentas bancarias — 4 campos por cuenta (Banco, Tipo, Titular, Numero) */}
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🏦 Cuentas bancarias</div>
      <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 8, fontStyle: "italic" }}>
        Estos datos se cargan automaticamente al crear una nueva solicitud con este proveedor.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(f.bankAccounts || []).map((b, i) => (
          <div key={i} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Cuenta {i + 1}{i === 0 ? " (principal)" : ""}
              </div>
              {(f.bankAccounts.length > 1) && <Btn small variant="danger" onClick={() => removeBank(i)}>× Eliminar</Btn>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Banco" value={b.bank} onChange={e => setBank(i, "bank", e.target.value)} placeholder="Ej: BAC, Ficohsa, Atlantida" />
              <Input label="Tipo de cuenta" value={b.type} onChange={e => setBank(i, "type", e.target.value)} placeholder="Ahorro / Cheques" />
              <Input label="Titular de la cuenta" value={b.holder} onChange={e => setBank(i, "holder", e.target.value)} placeholder="Nombre del titular" />
              <Input label="Numero de cuenta" value={b.number} onChange={e => setBank(i, "number", e.target.value)} placeholder="Ej: 10-251-000123" />
            </div>
          </div>
        ))}
        <Btn small variant="ghost" onClick={addBank}>+ Agregar otra cuenta bancaria</Btn>
      </div>
    </div>

    {/* CONSTANCIA DE PAGOS A CUENTA (19-ago-2026, pedido de Gerson):
        Contabilidad la exige en cada paquete de cierre. Se sube UNA VEZ por
        proveedor y el sistema la adjunta sola a todos sus paquetes — así Ana
        y Fernando dejan de buscarla en sus archivos cada vez. */}
    <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#065F46", marginBottom: 4 }}>🏦 Constancia de pagos a cuenta (PDF)</div>
      <div style={{ fontSize: 11.5, color: "#047857", marginBottom: 8 }}>
        Se adjunta AUTOMÁTICAMENTE al paquete de cierre contable de todas las compras de este proveedor. Subila una sola vez.
      </div>
      {f.constanciaFile?.fileId
        ? <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#065F46" }}>✓ {f.constanciaFile.name}</span>
            <Btn small variant="ghost" onClick={async () => {
              try { const full = await store.get(fileKey(f.constanciaFile.fileId)); if (!full?.dataUrl) return alert("No se pudo cargar."); setVisor({ ...full, name: full.name || f.constanciaFile.name }); } catch (e) { alert("Error: " + e.message); }
            }}>👁 Ver</Btn>
            <Btn small variant="danger" onClick={() => { if (confirm("¿Quitar la constancia de este proveedor?\n\nDejará de adjuntarse a los paquetes de cierre.")) u("constanciaFile", null); }}>× Quitar</Btn>
          </div>
        : <div>
            <input type="file" accept=".pdf,image/*" id="prov-constancia" style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return; e.target.value = "";
                const ref = await subirConstanciaProveedor(file);
                if (ref) u("constanciaFile", ref);
              }} />
            <label htmlFor="prov-constancia" style={{ display: "inline-block", background: "#059669", color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>📎 Subir constancia (PDF)</label>
          </div>}
    </div>

    <Textarea label="Notas internas" value={f.notes} onChange={e => u("notes", e.target.value)} placeholder="Cualquier observacion: horarios, persona de planta, condiciones especiales..." />

    {/* Botones */}
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 12, borderTop: "1px solid #E2E8F0", alignItems: "center" }}>
      <div>
        {isEdit && deleteProvider && <Btn small variant="danger" onClick={async () => {
          if (!confirm(`¿Eliminar proveedor "${f.name}"? Esta accion no se puede deshacer.`)) return;
          await deleteProvider(f.id);
          setModal(null);
        }}>🗑 Eliminar proveedor</Btn>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={() => setModal(null)} disabled={saving}>Cancelar</Btn>
        <Btn variant="success" disabled={saving} onClick={async () => {
          if (!f.name?.trim()) return alert("El nombre del proveedor es obligatorio");
          setSaving(true);
          try {
            // Limpiar phones y bankAccounts vacios
            const cleanPhones = (f.phones || []).map(s => s.trim()).filter(Boolean);
            const cleanBanks = (f.bankAccounts || []).filter(b => b.bank?.trim() || b.number?.trim());
            await upsertProvider({ ...f, name: f.name.trim(), phones: cleanPhones, bankAccounts: cleanBanks, autoImported: false });
            setModal(null);
          } finally {
            setSaving(false);
          }
        }}>{saving ? "..." : (isEdit ? "💾 Guardar" : "+ Crear proveedor")}</Btn>
      </div>
    </div>
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────
// SendPickupFormImpl: form para enviar una compra a Logistica como orden
// de recogida. Ana lo usa despues de hablar con el proveedor.
// ─────────────────────────────────────────────────────────────────────────
// ── ENTREGA DIRECTA DEL PROVEEDOR ──
// Muchas compras NO hay que ir a traerlas: el proveedor las lleva al proyecto.
// Ana registra el dia y la HORA en que llegan (unico punto del flujo con hora)
// y la compra deja de aparecer como "por coordinar" — queda esperando la
// llegada, y ahi se sube la ficha firmada o se cierra sin ficha.
function EntregaDirectaFormImpl({ purchase, provider, setModal, marcarEntregaDirecta }) {
  // Si ya estaba marcada (boton "Cambiar fecha/hora"), el form se hidrata con
  // lo guardado — si no, arranca en mañana 09:00. Sin esto, reprogramar
  // borraba el contacto y las notas que Ana ya habia escrito.
  const yaMarcada = purchase.delivery?.arrivalAt ? new Date(purchase.delivery.arrivalAt) : null;
  const mañana = new Date();
  mañana.setHours(0, 0, 0, 0);
  mañana.setDate(mañana.getDate() + 1);
  const local = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
  const [fecha, setFecha] = useState(local(yaMarcada || mañana).slice(0, 10));
  const [hora, setHora] = useState(yaMarcada ? local(yaMarcada).slice(11, 16) : "09:00");
  const [contacto, setContacto] = useState(purchase.delivery?.arrivalContacto || provider?.contactName || "");
  const [notas, setNotas] = useState(purchase.delivery?.arrivalNotas || "");
  const [sending, setSending] = useState(false);

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ background: "#CCFBF1", border: "1px solid #5EEAD4", borderRadius: 10, padding: 12, fontSize: 12, color: "#134E4A" }}>
      <b>Compra:</b> {purchase.provider} — {purchase.description}<br />
      <b>Proyecto destino:</b> {purchase.projectCode || "—"}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 12 }}>
      <Input
        label="Fecha de llegada al proyecto *"
        type="date"
        value={fecha}
        onChange={e => setFecha(e.target.value)}
        title="El dia que el proveedor dijo que la lleva"
      />
      <Input
        label="Hora *"
        type="time"
        value={hora}
        onChange={e => setHora(e.target.value)}
      />
    </div>

    <Input
      label="Quien confirma del lado del proveedor"
      value={contacto}
      onChange={e => setContacto(e.target.value)}
      placeholder="Ej: Ing. Juan Perez"
    />

    <Textarea
      label="Notas (opcional)"
      value={notas}
      onChange={e => setNotas(e.target.value)}
      placeholder={"Ej:\n• Entregan en porton principal\n• Preguntar por el residente\n• Traen la factura fisica"}
    />

    <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 12, fontSize: 12, color: "#065F46" }}>
      ✓ Esta compra <b>no se manda a Logistica</b> — la trae el proveedor. Queda en “Entrega del proveedor” con su dia y hora; cuando llegue, subis la ficha firmada o la cerras sin ficha.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
      <Btn variant="ghost" onClick={() => setModal(null)} disabled={sending}>Cancelar</Btn>
      <Btn variant="success" disabled={sending} onClick={async () => {
        if (!fecha) return alert("La fecha de llegada es obligatoria");
        if (!hora) return alert("La hora de llegada es obligatoria");
        setSending(true);
        const ok = await marcarEntregaDirecta(purchase, { fecha, hora, contacto: contacto.trim(), notas: notas.trim() });
        setSending(false);
        if (ok) setModal(null);
      }}>{sending ? "Guardando…" : "🏪 Confirmar entrega del proveedor"}</Btn>
    </div>
  </div>;
}

function SendPickupFormImpl({ purchase, provider, setModal, enviarAOrdenRecogida }) {
  const mañana = new Date();
  mañana.setDate(mañana.getDate() + 1);
  const defaultDate = mañana.toISOString().slice(0, 10);

  const [fechaConfirmada, setFechaConfirmada] = useState(defaultDate);
  const [contactoProveedor, setContactoProveedor] = useState(provider?.contactName || "");
  const [telefono, setTelefono] = useState(provider?.phones?.[0] || "");
  const [notas, setNotas] = useState("");
  const [sending, setSending] = useState(false);

  return <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
    <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 10, padding: 12, fontSize: 12, color: "#78350F" }}>
      <b>Compra:</b> {purchase.provider} — {purchase.description}<br />
      <b>Proyecto destino:</b> {purchase.projectCode}
    </div>

    <Input
      label="Fecha confirmada de retiro *"
      type="date"
      value={fechaConfirmada}
      onChange={e => setFechaConfirmada(e.target.value)}
      hint="Cuando el proveedor te dijo que puedes ir a retirar"
    />

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Input
        label="Persona de contacto en proveedor"
        value={contactoProveedor}
        onChange={e => setContactoProveedor(e.target.value)}
        placeholder="Ej: Ing. Juan Perez"
      />
      <Input
        label="Telefono del contacto"
        value={telefono}
        onChange={e => setTelefono(e.target.value)}
        placeholder="Ej: +504 9999-9999"
      />
    </div>

    <Textarea
      label="Notas / instrucciones para el motorista"
      value={notas}
      onChange={e => setNotas(e.target.value)}
      placeholder={"Ej:\n• Direccion exacta del proveedor\n• Cargar por puerta lateral\n• Llevar transporte cerrado\n• Pedir facturas A y B"}
    />

    <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 10, padding: 12, fontSize: 12, color: "#065F46" }}>
      ✓ Al enviar, esta orden cae automaticamente en el modulo de Logistica. Oscar/Jorge le asignan vehiculo + motorista y la marcan en ruta cuando salgan.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
      <Btn variant="ghost" onClick={() => setModal(null)} disabled={sending}>Cancelar</Btn>
      <Btn variant="success" disabled={sending} onClick={async () => {
        if (!fechaConfirmada) return alert("La fecha confirmada es obligatoria");
        setSending(true);
        try {
          const { ok } = await enviarAOrdenRecogida(purchase, {
            fechaConfirmada,
            contactoProveedor: contactoProveedor.trim(),
            notas: [
              contactoProveedor.trim() ? `Contacto: ${contactoProveedor.trim()}` : "",
              telefono.trim() ? `Telefono: ${telefono.trim()}` : "",
              notas.trim(),
            ].filter(Boolean).join("\n"),
          });
          if (ok) {
            setModal(null);
            alert("✓ Orden de recogida enviada a Logistica. Aparece automaticamente en el Kanban de Oscar/Jorge.");
          } else {
            alert("⚠️ Se guardo localmente pero hubo un problema sincronizando con la nube. Reintenta si es necesario.");
            setModal(null);
          }
        } finally {
          setSending(false);
        }
      }}>{sending ? "Enviando..." : "🚛 Enviar a Logistica"}</Btn>
    </div>
  </div>;
}

// ── MODULO ──
export default function PurchasesModule({ userRole, userName, userKey, onBack, onLogout }) {
  const isAdmin = userRole === "admin";
  const isTesoreria = userRole === "tesoreria";
  const isGerencia = userRole === "gerencia";
  // compras_ops (Arturo Trochez, ago 2026) → MISMOS permisos que Christian
  // DENTRO de GeoShopping. Se maneja como isCostos aqui para no duplicar
  // reglas; en GeoMachinery sigue siendo solo lectura y NO tiene GeoTeam.
  const isCostos = userRole === "costos" || userRole === "compras_ops";
  const isRecepcion = userRole === "recepcion";
  const isAsistenteCompras = userRole === "asistente_compras";
  const isVisorCompras = userRole === "visor_compras";   // solo lectura, acceso completo a Compras

  // Permisos (segregacion de funciones):
  // admin → Operaciones: crea, edita borradores, valida, envia a Tesoreria, edita proyectos.
  //         NO puede pagar ni cambiar estado a pagado/finalizado.
  // costos (Lic. Christian Gallo) → MISMOS permisos que admin en Compras (puede crear
  //         solicitudes y editar proyectos). Cambio solicitado 22-may-2026.
  // tesoreria (Lic. Carolina) → UNICA que registra pago, sube comprobante,
  //         y cambia estado a pagado/finalizado.
  // gerencia → solo lectura.
  // recepcion (Jorge Castellanos) → SOLO subir/editar fichas de recibido de compras
  //         ya pagadas. No puede crear solicitudes, ni proyectos, ni registrar pagos.
  // asistente_compras (Ana Vasquez) → SOLO la vista "Por coordinar" (kanban de compras
  //         pagadas) + Proveedores (CRUD). NO crea solicitudes, NO aprueba, NO paga.
  //         Su funcion: coordinar con proveedores la fecha de retiro y enviar la orden
  //         a Logistica cuando este confirmada. Cambio solicitado jun-2026.
  const canCreate = isAdmin || isCostos;                                          // crear/editar/validar solicitudes + editar proyectos
  const canPay = isTesoreria;                                                     // SOLO Carolina registra pago y cambia estado financiero
  const canViewOnly = isGerencia || isVisorCompras;                               // gerencia y visor de compras (Arturo) son read-only
  const canEditDelivery = isAdmin || isCostos || isRecepcion;                     // subir/editar fichas de recibido
  const canManageProviders = isAdmin || isCostos || isAsistenteCompras || isRecepcion;  // CRUD de proveedores (Ana primaria, Jorge tambien para no quedar trabados)
  const canSendToLogistics = isAdmin || isCostos || isAsistenteCompras;           // crear orden de recogida desde compra pagada
  // CORREGIR UNA COMPRA YA PAGADA (18-sep-2026, pedido de Gerson: "solo a mi y
  // a Christian, por si acaso Arturo se equivoca en el proyecto o en la
  // partida presupuestaria"). OJO: `isCostos` incluye a Arturo (compras_ops),
  // por eso acá se compara el rol CRUDO. Solo toca proyecto + partida: el
  // estado, el pago y el comprobante de Carolina quedan intactos.
  const canCorregirPagada = isAdmin || userRole === "costos";
  // LISTA DE PRIORIDADES: la arma Finanzas (Gerson, Christian, Arturo) y la
  // lee/reordena también Carolina — es su cola de pago. Gerencia y el visor
  // de compras solo miran.
  const canEditPri = isAdmin || isCostos || isTesoreria;

  const [co, setCo] = useState("geotecnica");
  // ── GUARDIA ANTI-PISADA DEL AUTO-REFRESH (20-ago-2026) ──────────────────
  // El bug de "se confirma pero la tarjeta sigue ahí / se va a la segunda":
  // los diálogos nativos (confirm/prompt/alert) le quitan el foco a la
  // ventana; al cerrarse se dispara el evento `focus`, que corre el
  // auto-refresh EN PARALELO con el guardado. Ese refresh lee la nube de
  // ANTES del save y pisa el estado local con la foto vieja — el dato sí se
  // guardó, pero la pantalla mostraba lo anterior. Regla: toda mutación
  // local estampa `lastLocalMutAtRef`; el refresh se salta si hubo una
  // mutación hace menos de 8 s (para cuando el save termina, ya pasó).
  const lastLocalMutAtRef = useRef(0);
  const [purchases, _setPurchasesRaw] = useState([]);
  const setPurchases = (v) => { lastLocalMutAtRef.current = Date.now(); _setPurchasesRaw(v); };
  const [customProjects, setCustomProjects] = useState([]);
  const [providers, setProviders] = useState([]);
  const [despachos, _setDespachosRaw] = useState([]); // shared con LogisticsModule — para saber si una compra ya tiene orden de recogida
  const setDespachos = (v) => { lastLocalMutAtRef.current = Date.now(); _setDespachosRaw(v); };
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState(null);
  // Visor de archivos en la app (10-sep-2026): UN estado a nivel de módulo para
  // lo que abren Proyectos, Cerradas y los FileSlot del DetailView (que se
  // remonta con cada refresh — un visor local ahí se cerraría solo).
  const [visor, setVisor] = useState(null);
  // ── LISTA DE PRIORIDADES (18-sep-2026, pedido de Gerson) ────────────────
  // Reemplaza el Excel gigante que Finanzas le armaba a mano a Tesorería cada
  // semana. Vive en su PROPIA key (`cp-prioridades`) y NO dentro de las
  // solicitudes: así reordenar no reescribe las 438 filas de cp-purchases ni
  // compite con los pagos de Carolina (mismo criterio de ownership que
  // gc-marks / gc-tardies en GeoClock).
  // Shape: [{ id: <purchaseId>, urgente: bool, addedBy, createdAt }] — el ORDEN
  // DEL ARRAY es la prioridad (índice 0 = se paga primero).
  // ⚠ El campo se llama `createdAt` a propósito: es el único nombre que mira el
  // re-sync de supabase.js para RESCATAR filas que otro usuario agregó cuando
  // el cache local quedó más nuevo que la nube. Con `addedAt` esas entradas se
  // habrían perdido en silencio (mismo agujero que borraba solicitudes de
  // Fernando en GeoMachinery).
  const [prioridades, _setPrioridadesRaw] = useState([]);
  const prioridadesRef = useRef([]);
  const setPrioridades = (v) => { prioridadesRef.current = v; _setPrioridadesRaw(v); };
  const [priSaving, setPriSaving] = useState(false);
  const [priModal, setPriModal] = useState(null);   // { t: "add" }
  const [priDrag, setPriDrag] = useState(null);     // índice que se está arrastrando
  // ── CUENTAS POR PAGAR (21-sep-2026, pedido de Gerson) ───────────────────
  // Christian le CALENDARIZA los pagos a Tesorería: las compras grandes que el
  // proveedor nos da a crédito, y las que simplemente pueden esperar y no
  // entran en Prioridades. Key propia `cp-cxp` (mismo criterio de ownership
  // que cp-prioridades: reordenar/reprogramar no reescribe cp-purchases).
  // Shape: [{ id: <purchaseId>, fecha: "YYYY-MM-DD", nota, addedBy, createdAt }].
  // Acá el orden lo manda la FECHA, no el array — es un calendario, no una cola.
  const [cxp, _setCxpRaw] = useState([]);
  const cxpRef = useRef([]);
  const setCxp = (v) => { cxpRef.current = v; _setCxpRaw(v); };
  const [cxpSaving, setCxpSaving] = useState(false);
  const [cxpModal, setCxpModal] = useState(null);   // { t: "add", soloCredito? }
  const [cxpFiltro, setCxpFiltro] = useState("todas");  // todas|vencidas|semana|mes|despues
  // Calendario de Pago (23-sep-2026, pedido de Gerson: "que al entrar ya te
  // cargue las del día de hoy"): arranca en el mes Y EL DÍA de hoy, con las
  // solicitudes de ese día ya abiertas a la derecha — no hace falta tocar
  // nada. `hoyISO()` (no `new Date()` a secas): es la fecha de HONDURAS, el
  // mismo bug de las 6pm que ya corregimos en el resto del sistema.
  const [calMes, setCalMes] = useState(() => hoyISO().slice(0, 7));
  const [calDia, setCalDia] = useState(() => hoyISO());
  // GeoCost (9-sep-2026): fuentes SOLO LECTURA para la partida del form.
  // Setters crudos a propósito: no son mutaciones locales, no deben frenar
  // el auto-refresh vía lastLocalMutAtRef.
  const [presupuestos, setPresupuestos] = useState([]);
  const [ccConfig, setCcConfig] = useState(null);
  const [mqPurchasesCC, setMqPurchasesCC] = useState([]);
  const [movilizacionesCC, setMovilizacionesCC] = useState([]);
  const tasaCC = num(ccConfig?.tasa) || TASA_DEFAULT;
  // Disponible de una partida a la tasa vigente. `excluirId` = la compra que
  // se está editando (si no, se contaría dos veces). Sin MO ni máquinas de
  // GeoTeam acá: el form solo necesita compras/máquinas/movilizaciones.
  const calcDisponible = (projectCode, partidaId, excluirId) => {
    const pres = (presupuestos || []).find(x => x.projectCode === projectCode && x.estado !== "cerrado");
    if (!pres || !partidaId) return null;
    try {
      const movs = movimientosDeProyecto({
        pres,
        cpPurchases: excluirId ? purchases.filter(x => x.id !== excluirId) : purchases,
        mqPurchases: mqPurchasesCC, movilizaciones: movilizacionesCC,
        atts: [], hes: [], emps: [], heSalBase: {}, machines: [], tasa: tasaCC,
        // customProjects: sin ellos `mismoProyecto` resuelve por alias legacy
        // (PLANTEL es alias de PLANTEL-OFICINA) y el disponible mezclaba
        // proyectos — GeoCost sí los pasa y daba OTRO número para la misma
        // partida (revisión adversarial, #2/#26).
        customProjects,
      });
      return disponibleDePartida({ pres, partidaId, movs });
    } catch (e) { console.warn("[GeoCost] no se pudo calcular el disponible:", e?.message || e); return null; }
  };
  const isMobile = useIsMobile();
  // Default section depende del rol:
  // - Ana (asistente_compras) → "ana" (Por coordinar)
  // - Jorge (recepcion) → "providers" (su tarea principal en Compras: mantener
  //   datos bancarios de proveedores al dia)
  // - admin/gerencia/costos → "dashboard" (vista ejecutiva)
  // - Resto → "list" (solicitudes)
  const canSeeDashboardDefault = isAdmin || isGerencia || isCostos || isVisorCompras;
  const defaultSec = isAsistenteCompras
    ? "ana"
    : isRecepcion
      ? "providers"
      : canSeeDashboardDefault
        ? "dashboard"
        : "list";
  const [sec, setSec] = useState(defaultSec);
  // Espejo en un ref: el effect del auto-refresh corre con deps [] y su
  // closure capturaría el `sec` inicial para siempre.
  const secRef = useRef(sec);
  useEffect(() => { secRef.current = sec; }, [sec]);
  // Filtro de mes de "Por cerrar contablemente" (por fecha de PAGO).
  // Default: mes actual — el histórico viejo no se le viene encima a nadie,
  // pero queda accesible eligiendo el mes o "Todos".
  const [contaMes, setContaMes] = useState(() => new Date().toISOString().slice(0, 7));
  // Filtro por responsable de cierre en "Por cerrar contable" (supervisores)
  const [contaResp, setContaResp] = useState("");
  // Filtros del archivo de cerradas contablemente (mes de cierre / proyecto / texto)
  const [provQ, setProvQ] = useState("");   // buscador de proveedores
  // ── Bandeja "Por coordinar" (21-sep-2026) ──
  const [coordMes, setCoordMes] = useState("");          // filtro por mes de pago
  const [coordVista, setCoordVista] = useState("proyecto");  // proyecto | espera
  const [coordQ, setCoordQ] = useState("");
  const [coordProy, setCoordProy] = useState("");        // filtro por proyecto
  // ── "¡ Pago nuevo!" (21-sep-2026, pedido de Gerson) ──────────────────────
  // Cuando la Lic. Carolina paga algo, un "!" naranja al lado del proyecto le
  // avisa a Ana que hay algo que todavía no vio ahí. Se guarda EN LOCALSTORAGE
  // (por usuario, `gt-coord-visto-<userKey>`), no en Supabase: es "lo que YO ya
  // miré", cada quien tiene la suya, y no hace falta sincronizarla entre
  // dispositivos — si Ana lo ve en la compu, en el teléfono lo puede volver a
  // ver, no pasa nada.
  const vistoKey = `gt-coord-visto-${userKey || "anon"}`;
  const [coordVisto, _setCoordVistoRaw] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(vistoKey) || "null"); return v && typeof v === "object" ? v : null; }
    catch { return null; }
  });
  const setCoordVisto = (next) => {
    _setCoordVistoRaw(next);
    try { localStorage.setItem(vistoKey, JSON.stringify(next)); } catch {}
  };
  // Momento REAL en que se registró el pago — no `paidAt` (esa es una fecha
  // pura, sin hora, así que dos pagos del mismo día no se podrían distinguir).
  // Se lee del audit `paid` que deja `registrarPago`, con su `at` ISO completo.
  const horaPagada = (p) => {
    const ult = [...(p.audit || [])].reverse().find(a => a.action === "paid");
    return ult?.at || (p.paidAt ? `${String(p.paidAt).slice(0, 10)}T00:00:00.000Z` : p.createdAt);
  };
  // Baseline la PRIMERA vez que se activa esta función: todo lo pendiente
  // actual queda "visto" de una — si no, el día que esto sale a producción se
  // prende medio tablero de golpe con compras viejas que Ana ya conocía.
  useEffect(() => {
    if (coordVisto !== null || !loaded || !isAsistenteCompras) return;   // solo Ana la usa
    const ahora = new Date().toISOString();
    const porProyecto = {};
    purchases.forEach(p => { porProyecto[p.projectCode || "SIN PROYECTO"] = ahora; });
    setCoordVisto(porProyecto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, coordVisto]);
  // Marcar un proyecto como visto AHORA (al abrirlo, o al expandir todo).
  const marcarVisto = (proyecto) => setCoordVisto({ ...(coordVisto || {}), [proyecto]: new Date().toISOString() });
  // Proyectos DESPLEGADOS (21-sep-2026, "que se puedan compactar para que no
  // sea ese listón"). Vacío = todo compacto: la pestaña arranca como un índice
  // de una fila por proyecto. Se recuerda en localStorage —preferencia de
  // pantalla, no dato de negocio: nunca toca Supabase.
  const [coordAbiertos, setCoordAbiertos] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem("gt-coord-abiertos") || "[]"); return Array.isArray(v) ? v : []; }
    catch { return []; }
  });
  const abrirCoord = (lista) => {
    setCoordAbiertos(lista);
    try { localStorage.setItem("gt-coord-abiertos", JSON.stringify(lista)); } catch {}
  };
  const [rez, setRez] = useState(null);       // modal de cierre de rezagadas
  const [rezSaving, setRezSaving] = useState(false);
  const [cerrMes, setCerrMes] = useState("");
  const [cerrProy, setCerrProy] = useState("");
  const [cerrQ, setCerrQ] = useState("");
  // Mes del reporte ejecutivo de materiales (pestaña Costos).
  const [costosMesEjec, setCostosMesEjec] = useState(() => new Date().toISOString().slice(0, 7));
  // Filtros de Solicitudes (24-ago-2026, rediseño pedido por Gerson):
  //   ver: "pendientes" (default — la cola de pago de Carolina) | "pagadas" | "todas"
  //   mes: "" = todos. Aplica sobre la fecha que corresponde a lo que se ve
  //        (solicitud si son pendientes, pago si son pagadas).
  // Reemplazó el rango Desde/Hasta: nadie lo usaba y confundía.
  const [filter, setFilter] = useState({ ver: "pendientes", project: "", provider: "", mes: "" });
  // Estado de expansion/colapso de sub-secciones en el Kanban de Ana.
  // Keys: `${projectKey}-enlog`, `${projectKey}-cierre`, `${projectKey}-cerradas`.
  // Default: enlog y cierre abiertas (undefined → tratado como true), cerradas oculto.
  const [anaExpand, setAnaExpand] = useState({});
  // Estado del Command Center (Resumen). showCompleted: incluir cerradas.
  // projectCode: filtrar a un solo proyecto.
  // Orden de la tabla de Solicitudes: pago_desc (default) | pago_asc | estado
  // Default por rol: para Tesorería, "Solicitudes" ES su pantalla de trabajo y
  // su cola de pago (validadas, sin fecha de pago) tiene que ir arriba — con
  // el orden por fecha de pago quedaba al fondo de 321 filas.
  // Orden de la tabla. Default para TODOS: "estado" = pendientes de pago
  // arriba (pedido de Gerson: que Carolina entre y vea su cola primero, sin
  // confundirse). Los otros modos se eligen con botones.
  // Coherente con el default de arriba (ver: "pendientes"): la que MÁS lleva
  // esperando el pago va primero, para que a nadie se le quede colgada.
  const [listOrden, setListOrden] = useState("solicitud_asc");
  // ── Filtros de Supply Chain (v3, 18-sep-2026) ──
  // Quedaron 4: cuándo se pagó (semana lunes-domingo por defecto), en qué
  // etapa está, si se ven las cerradas y el buscador. Los de rango libre,
  // proyecto, responsable y orden por atraso se retiraron con la v2 —
  // Gerson: "qué desorden, no dan ganas de ver eso".
  const [scModo, setScModo] = useState("semana");       // semana | anterior | mes | todo
  const [scEtapa, setScEtapa] = useState("");
  const [scQ, setScQ] = useState("");
  const [scVerCerradas, setScVerCerradas] = useState(false);
  // Mes de las metricas mensuales del Dashboard ("" = mes actual).
  const [dashMonth, setDashMonth] = useState("");
  // Los gráficos del Dashboard "cargan" al entrar (1-sep: "que haya el
  // efecto que cargan hasta donde están parados, smooth y lento"): arranca
  // en false y un tick después pasa a true — las barras y la dona
  // transicionan de 0 a su valor real.
  const reduceMotion = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [dashAnim, setDashAnim] = useState(reduceMotion);
  useEffect(() => {
    if (reduceMotion) { setDashAnim(true); return; }   // sin animación: nacen cargados
    if (sec !== "dashboard" || !loaded) { setDashAnim(false); return; }
    // `loaded` en las deps: al entrar desde el panel, el módulo muestra
    // "Cargando…" primero — si el flip a true pasaba antes de que existieran
    // las tarjetas, nacían ya al 100% y "no cargaban" (pedido 3-sep).
    setDashAnim(false);
    const t = setTimeout(() => setDashAnim(true), 160);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec, loaded]);

  useEffect(() => {
    (async () => {
      const [p, cps, prov, desp, pri, cxpIni] = await Promise.all([
        store.get("cp-purchases"),
        store.get("cp-projects"),
        store.get("cp-providers"),
        store.get("lg-despachos"),
        store.get("cp-prioridades"),
        store.get("cp-cxp"),
      ]);
      if (Array.isArray(pri)) setPrioridades(pri.filter(x => x && x.id));
      if (Array.isArray(cxpIni)) setCxp(cxpIni.filter(x => x && x.id));
      let purchasesArr = [];
      if (p) {
        // Migracion 1: asegurar treasuryStatus y deliveryStatus
        const migrated = p.map(x => ({
          ...x,
          treasuryStatus: deriveTreasury(x),
          deliveryStatus: deriveDelivery(x),
          delivery: x.delivery || {},
        }));
        // Mostrar la UI INMEDIATAMENTE con datos livianos. Los archivos se cargan
        // ON-DEMAND cuando el usuario los necesita (abrir detalle, generar PDF).
        //
        // IMPORTANTE: NO hacemos bulk restoreFiles aqui. Antes lo haciamos en
        // background, pero con 70+ compras eso disparaba 50+ queries paralelas a
        // Supabase (cp-file-*), saturando las conexiones y disparando timeouts
        // (error 57014). Eso causaba que los SAVE de Carolina (pagos/comprobantes)
        // compitieran con esas queries pendientes y fallaran.
        //
        // generateFichaPDF y otros call sites ya hacen restoreFiles para la compra
        // especifica que necesitan — ese es el patron correcto.
        setPurchases(migrated);
        purchasesArr = migrated;
      }
      if (cps) setCustomProjects(cps);
      if (Array.isArray(desp)) setDespachos(desp);

      // Cargar proveedores existentes + auto-importar nombres de proveedores de las
      // compras ya creadas (para que Ana pueda completar sus datos sin tener que
      // re-tipearlos). Si un provider name ya esta en la lista, no se duplica.
      const existingProviders = Array.isArray(prov) ? prov : [];
      const knownNames = new Set(existingProviders.map(p => (p.name || "").trim().toLowerCase()));
      const importedFromPurchases = [];
      const seenInThisImport = new Set();
      for (const pp of purchasesArr) {
        const name = (pp.provider || "").trim();
        if (!name) continue;
        const lk = name.toLowerCase();
        if (knownNames.has(lk) || seenInThisImport.has(lk)) continue;
        seenInThisImport.add(lk);
        // Captura cualquier dato bancario que ya tenga la compra (de campos viejos o nuevos)
        const accountNumber = pp.bacAccount;
        const accountBank = pp.providerBank || (accountNumber ? "BAC" : "");
        const accountType = pp.providerAccountType || "";
        const accountHolder = pp.providerAccountHolder || name;
        const hasBank = !!(accountBank || accountNumber || accountType || accountHolder !== name);
        importedFromPurchases.push({
          id: uid(),
          name,
          rtn: pp.providerRTN || "",
          phones: [],
          bankAccounts: hasBank ? [{ bank: accountBank, type: accountType, number: accountNumber || "", holder: accountHolder }] : [],
          contactName: "",
          contactEmail: "",
          notes: "Importado automaticamente de solicitudes existentes — completar datos.",
          autoImported: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      const finalProviders = [...existingProviders, ...importedFromPurchases];
      setProviders(finalProviders);
      if (importedFromPurchases.length > 0) {
        // Solo guardar si hubo imports nuevos (no escribir si no hay cambios)
        store.set("cp-providers", finalProviders);
        console.info(`[Compras] Auto-importados ${importedFromPurchases.length} proveedores nuevos desde compras existentes.`);
      }

      setLoaded(true);

      // GeoCost (9-sep-2026): presupuestos por proyecto, tasa y las otras fuentes que
      // consumen partidas — SOLO LECTURA (getCloud: store.get podría re-sincronizar
      // cache viejo hacia la nube desde acá). Si falla, el form sigue igual que antes.
      try { const [pr, cf, mq, mv] = await Promise.all([store.getCloud("cc-presupuestos"), store.getCloud("cc-config"), store.getCloud("mq-purchases"), store.getCloud("cc-movilizaciones")]); if (Array.isArray(pr)) setPresupuestos(pr); if (cf && typeof cf === "object") setCcConfig(cf); if (Array.isArray(mq)) setMqPurchasesCC(mq); if (Array.isArray(mv)) setMovilizacionesCC(mv); } catch (e) { console.warn("[GeoCost] no se pudieron leer presupuestos:", e?.message || e); }
    })();
  }, []);

  // Auto-refresh al volver a la pestaña — si Carolina subio un comprobante mientras
  // admin/Christian/Ana estaban en otra tab, al volver ven el cambio sin recargar.
  useEffect(() => {
    const refreshFromCloud = async () => {
      // Cambios locales recientes → no arriesgar pisarlos con una foto vieja.
      if (Date.now() - lastLocalMutAtRef.current < 8000) { console.log("[refresh] omitido: guardado local reciente"); return; }
      try {
        const [p, desp, pri, cxpN] = await Promise.all([
          store.get("cp-purchases"),
          store.get("lg-despachos"),
          store.getCloud("cp-prioridades"),
          store.getCloud("cp-cxp"),
        ]);
        // Lista de prioridades: si Finanzas reordenó en otra máquina, al volver
        // a la pestaña se ve el orden nuevo. getCloud (no get) — es una lista
        // chiquita y compartida, el cache viejo acá solo confundiría.
        if (Array.isArray(pri) && Date.now() - lastLocalMutAtRef.current >= 8000) setPrioridades(pri.filter(x => x && x.id));
        if (Array.isArray(cxpN) && Date.now() - lastLocalMutAtRef.current >= 8000) setCxp(cxpN.filter(x => x && x.id));
        if (Array.isArray(p)) {
          const migrated = p.map(x => ({
            ...x,
            treasuryStatus: deriveTreasury(x),
            deliveryStatus: deriveDelivery(x),
            delivery: x.delivery || {},
          }));
          if (Date.now() - lastLocalMutAtRef.current < 8000) { console.log("[refresh] descartado post-fetch: hubo un guardado mientras se leía la nube"); return; }
          _setPurchasesRaw(migrated);
          // NO bulk-hidratar archivos en focus tampoco — load on-demand evita
          // saturar Supabase. Archivos se cargan al abrir detalle/generar PDF.
        }
        if (Array.isArray(desp)) _setDespachosRaw(desp);
      } catch (e) {
        console.warn("[Compras] Auto-refresh fallo:", e?.message || e);
      }
      // GeoCost (9-sep-2026): presupuestos por proyecto, tasa y las otras fuentes que
      // consumen partidas — SOLO LECTURA (getCloud: store.get podría re-sincronizar
      // cache viejo hacia la nube desde acá). Si falla, el form sigue igual que antes.
      try { const [pr, cf, mq, mv] = await Promise.all([store.getCloud("cc-presupuestos"), store.getCloud("cc-config"), store.getCloud("mq-purchases"), store.getCloud("cc-movilizaciones")]); if (Array.isArray(pr)) setPresupuestos(pr); if (cf && typeof cf === "object") setCcConfig(cf); if (Array.isArray(mq)) setMqPurchasesCC(mq); if (Array.isArray(mv)) setMovilizacionesCC(mv); } catch (e) { console.warn("[GeoCost] no se pudieron leer presupuestos:", e?.message || e); }
    };
    const onFocus = () => refreshFromCloud();
    const onVisChange = () => { if (document.visibilityState === "visible") refreshFromCloud(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisChange);
    // LATIDO en las pestañas de cola (21-sep-2026, pedido de Gerson: "lo que
    // haga la Lic. viaja acá inmediatamente"). El refresh por `focus` solo
    // dispara al volver a la ventana; si Ana deja "Por coordinar" abierta toda
    // la mañana no veía los pagos nuevos. Una lectura por minuto, SOLO con la
    // pestaña visible y solo en las vistas que son cola de trabajo — y el
    // propio refreshFromCloud se salta si hubo una mutación local hace <8 s.
    const latido = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!["ana", "prioridades", "cxp", "calendario", "list"].includes(secRef.current)) return;
      refreshFromCloud();
    }, 60000);
    return () => {
      clearInterval(latido);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, []);

  // Guarda los purchases extrayendo los archivos pesados a rows separadas
  // para no exceder el limite de tamaño de Supabase. Devuelve true si todo
  // se guardo en la nube, false si fallo (el cache local siempre se hace).
  //
  // IMPORTANTE: guardamos los archivos SERIALMENTE (uno por uno, no en
  // paralelo). En paralelo, Supabase rate-limita y devuelve errores
  // intermitentes que disparaban este mismo alerta. Serial es un poco mas
  // lento pero 100% confiable. Cada store.set ya tiene su propio retry
  // con backoff (3 intentos) para absorber glitches puntuales.
  // Guarda purchases con verificacion post-save robusta:
  // 1. Pre-fetch del cloud para mergear con cambios concurrentes (otro usuario / otra Mac)
  // 2. Save archivos serial
  // 3. Save cp-purchases con array MERGED
  // 4. Verificacion: re-fetch desde cloud y comparar count
  // 5. Si no coincide → alerta roja explicita con detalles
  const sP = async (d) => {
    const tStart = Date.now();
    const groupLabel = `[sP] save ${new Date().toISOString()}`;
    console.group(groupLabel);
    try {
      setPurchases(d);
      console.log("📦 Local state actualizado:", d.length, "purchases");

      // 1) PRE-FETCH cloud DIRECTO (fix ago 2026 — en GeoMachinery se borraban
      // solicitudes de Fernando por este mismo agujero): store.get ante un
      // timeout de Supabase cae al CACHE LOCAL de este navegador; con cache
      // viejo el merge no ve solicitudes nuevas de otros y las escribe FUERA
      // de la nube sin que la verificacion lo detecte. getCloud SIN cache —
      // si la nube no responde, NO se guarda (mejor reintentar que borrar).
      let cloudPrevia;
      try {
        cloudPrevia = await store.getCloud("cp-purchases");
      } catch (e) {
        console.error("⛔ Nube no responde en pre-fetch — abortando save para no pisar datos ajenos:", e?.message || e);
        alert("⚠️ No hay conexión con la nube en este momento.\n\nNO se guardó nada para no arriesgar solicitudes de otros usuarios. Esperá unos segundos y volvé a intentar (tus cambios siguen en pantalla).");
        return false;
      }
      const cloudPreviaArr = Array.isArray(cloudPrevia) ? cloudPrevia : [];
      console.log("☁️ Cloud actual:", cloudPreviaArr.length, "purchases");

      // 2) DETECTAR BORRADOS INTENCIONALES: lo que estaba en nuestro state previo
      // pero ya no esta en `d` fue BORRADO por el usuario. Esos IDs NO deben volver
      // del cloud aunque cloudPreviaArr aun los tenga (race vs nuestro propio save anterior).
      const previousIds = new Set(purchases.map(p => p.id));
      const ourIds = new Set(d.map(p => p.id));
      const deletedIds = new Set();
      previousIds.forEach(id => { if (!ourIds.has(id)) deletedIds.add(id); });
      if (deletedIds.size > 0) {
        console.log(`🗑 Borrados intencionales: ${deletedIds.size}`, [...deletedIds]);
      }
      // GUARDIA anti-borrado masivo: los flujos legitimos borran DE A UNA
      // (removePurchase con confirm) — mas de una de golpe huele a state viejo.
      if (deletedIds.size > 1) {
        const nombres = cloudPreviaArr.filter(p => deletedIds.has(p.id)).map(p => `• ${p.description || p.id}`).join("\n");
        if (!confirm(`⚠️ Este guardado ELIMINARÍA ${deletedIds.size} solicitudes de la nube:\n\n${nombres}\n\n¿Es intencional? (Si no borraste nada, tocá Cancelar y recargá la página.)`)) {
          console.warn("⛔ Guardado cancelado por el usuario (guardia anti-borrado masivo).");
          return false;
        }
      }

      // GeoCost (9-sep-2026): la Central reclasifica partidas escribiendo por id en la
      // nube. Nuestra fila local GANA en todo lo demás, pero si la nube trae entradas
      // de audit `partida_reclasificada` que la fila local no tiene, esa
      // reclasificación es POSTERIOR a nuestra foto: adoptamos partidaId/
      // sobregiroJustificacion y sumamos esas entradas al audit (si no, el próximo
      // pago de Carolina la borraba en silencio — revisión adversarial).
      const cloudById = new Map(cloudPreviaArr.map(p => [p.id, p]));
      let rescatadas = 0;
      const dR = d.map(p => {
        const c = cloudById.get(p.id);
        if (!c) return p;
        const atsLocal = new Set((p.audit || []).filter(a => a?.action === "partida_reclasificada").map(a => a.at));
        const nuevas = (c.audit || []).filter(a => a?.action === "partida_reclasificada" && !atsLocal.has(a.at));
        if (!nuevas.length) return p;
        rescatadas++;
        return { ...p, partidaId: c.partidaId, sobregiroJustificacion: c.sobregiroJustificacion ?? p.sobregiroJustificacion, audit: [...(p.audit || []), ...nuevas] };
      });
      if (rescatadas > 0) console.log(`[sP] partidas rescatadas de GeoCost: ${rescatadas}`);

      // 3) MERGE: tomar todo lo de cloud + agregar lo nuestro que no este en cloud
      // (basado en id), EXCLUYENDO los que acabamos de borrar. `dR` = `d` con
      // las partidas rescatadas arriba.
      const cloudExtras = cloudPreviaArr.filter(p => !ourIds.has(p.id) && !deletedIds.has(p.id));
      const merged = [...dR, ...cloudExtras];
      if (cloudExtras.length > 0 || rescatadas > 0) {
        if (cloudExtras.length > 0) console.warn(`⚠️ Encontradas ${cloudExtras.length} solicitudes en cloud que no estaban en local — mergeadas.`);
        setPurchases(merged); // actualizar UI con merge (+ partidas rescatadas)
      }
      // Re-log post-filtrado para confirmar que los borrados no vuelven
      const cloudBorradosResucitados = cloudPreviaArr.filter(p => deletedIds.has(p.id));
      if (cloudBorradosResucitados.length > 0) {
        console.log(`✅ Filtrados ${cloudBorradosResucitados.length} items borrados que el cloud todavia tenia (no resucitan).`);
      }

      // 3) Extraer archivos
      const { light, filesToSave } = extractFiles(merged);
      console.log("🗂 Archivos a subir:", filesToSave.length, "| light array:", light.length, "purchases");

      // 4) Save archivos serial. Si CUALQUIER archivo falla, NO guardamos
      // cp-purchases — sino quedariamos con refs huerfanas (fileId en el array
      // pero el cp-file-<id> no existe en cloud). Asi el usuario reintenta y
      // cuando funcione el upload, el resto del save procede.
      const failedFiles = [];
      for (const f of filesToSave) {
        console.log(`📤 Subiendo cp-file-${f.fileId} (${f.content?.name}, ${(f.content?.size / 1024 / 1024).toFixed(2)} MB)...`);
        const ok = await store.set(fileKey(f.fileId), f.content);
        if (!ok) {
          failedFiles.push(f);
          console.error(`❌ Fallo upload de cp-file-${f.fileId}`);
        } else {
          console.log(`✓ cp-file-${f.fileId} subido OK`);
        }
      }

      // 5) Save cp-purchases SOLO si todos los archivos subieron OK.
      // Si algun archivo fallo, abortamos para no dejar refs huerfanas.
      let purchasesOk = false;
      if (failedFiles.length > 0) {
        console.error(`⛔ ${failedFiles.length} archivo(s) fallaron — NO guardo cp-purchases para evitar refs huerfanas. El usuario debe reintentar.`);
      } else {
        purchasesOk = await store.set("cp-purchases", light);
        console.log("☁️ Save cp-purchases →", purchasesOk ? "OK" : "FAIL");
      }

      // 6) VERIFICACION: re-fetch DIRECTO desde cloud y comparar (getCloud —
      // store.get podia devolver el propio cache local y dar un falso OK)
      let verifiedOk = true;
      let verifiedCount = null;
      if (purchasesOk) {
        try {
          const verify = await store.getCloud("cp-purchases");
          verifiedCount = Array.isArray(verify) ? verify.length : null;
          // VERIFICACION SEMANTICA (20-ago-2026). Antes se comparaba el COUNT
          // exacto: si otro usuario creaba una solicitud durante los ~2s que
          // dura el guardado, los numeros no cuadraban y salia un error FALSO
          // ("VERIFICACION POST-SAVE FALLO") que ademas dejaba el modal
          // abierto — la compra parecia "trabada" aunque si se habia guardado.
          // Con 5 personas trabajando a la vez eso pasaba seguido.
          // Ahora lo que importa es: ¿esta TODO lo nuestro en la nube?
          if (!Array.isArray(verify)) {
            verifiedOk = false;
            console.error("❌ VERIFICACION: la nube no devolvio una lista.");
          } else {
            const verifyIds = new Set(verify.map(p => p && p.id));
            const missing = light.filter(p => !verifyIds.has(p.id));
            if (missing.length > 0) {
              verifiedOk = false;
              console.error("❌ VERIFICACION FALLO — faltan en la nube:", missing.map(p => p.id));
            } else if (verifiedCount > light.length) {
              // La nube tiene MAS: alguien creo algo mientras guardabamos. No
              // es un error — se incorpora a la pantalla para no trabajar con
              // una lista incompleta.
              const nuestros = new Set(light.map(p => p.id));
              const ajenas = verify.filter(p => p && !nuestros.has(p.id));
              console.warn(`ℹ️ ${ajenas.length} solicitud(es) creadas por otro usuario durante el guardado — incorporadas a la vista.`);
              setPurchases([...dR, ...ajenas]);
            }
          }
        } catch (e) {
          console.warn("No se pudo verificar post-save:", e);
        }
      }

      const tEnd = Date.now();
      console.log(`⏱ Save completado en ${tEnd - tStart}ms. OK: ${purchasesOk && verifiedOk}`);

      // 7) Errores → alerta
      if (!purchasesOk || failedFiles.length > 0 || !verifiedOk) {
        const lastErr = store.getLastError?.();
        const detalleError = lastErr ? `\n\nError tecnico: ${lastErr.message}` : "";
        const archivosProblema = failedFiles.length > 0
          ? `\n\nArchivos que NO subieron (${failedFiles.length}):\n${failedFiles.map(f => `• ${f.content?.name || f.fileId} (${(f.content?.size / 1024 / 1024).toFixed(2)} MB)`).join("\n")}`
          : "";
        const verifProblem = !verifiedOk
          ? `\n\n⚠️ VERIFICACION POST-SAVE FALLO:\nEnviadas: ${light.length} | Cloud devolvio: ${verifiedCount}\nEsto significa que Supabase acepto el save pero no lo persistio correctamente. Es un problema del backend.`
          : "";
        alert(
          "⚠️ Atencion: el guardado tuvo problemas.\n\n" +
          "Estado: " + (purchasesOk ? "Supabase dijo OK" : "Supabase fallo") +
          (verifiedOk ? "" : " · Verificacion fallo") +
          archivosProblema +
          verifProblem +
          detalleError +
          "\n\nLos datos quedan en este navegador. Si refrescas y desaparece, hay un problema con la sincronizacion."
        );
        return false;
      }
      return true;
    } finally {
      console.groupEnd();
    }
  };
  // Guarda la lista de proyectos custom. AWAIT + retorna ok — igual que las
  // compras (sP/saveOrAlert). Antes era fire-and-forget: el proyecto se veia en
  // pantalla pero si la sync a la nube fallaba, se perdia en silencio (bug:
  // "no se guardan los proyectos nuevos"). Ahora el caller sabe si fallo y avisa.
  const sCP = async (d) => {
    setCustomProjects(d);
    return await store.set("cp-projects", d);
  };

  // ── CRUD de Proveedores ──
  const saveProviders = async (next) => {
    setProviders(next);
    return await store.set("cp-providers", next);
  };
  // Sube la constancia de pagos a cuenta a su propia row y devuelve la ref
  // (el enlace al proveedor lo hace el form al guardar).
  const subirConstanciaProveedor = async (fileObj) => {
    if (!fileObj) return null;
    if (fileObj.size > 2 * 1024 * 1024) { alert(`❌ El archivo pesa ${(fileObj.size / 1024 / 1024).toFixed(2)} MB (límite 2 MB). Comprimilo antes de subir.`); return null; }
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(fileObj); });
      const fileId = uid();
      const ok = await store.set(fileKey(fileId), { name: fileObj.name, type: fileObj.type, size: fileObj.size, dataUrl });
      if (!ok) { alert("⚠️ No se pudo subir el archivo a la nube. Reintentá."); return null; }
      return { fileId, name: fileObj.name, type: fileObj.type, size: fileObj.size, subidaAt: new Date().toISOString() };
    } catch (e) { alert("Error subiendo la constancia: " + (e?.message || e)); return null; }
  };

  const upsertProvider = async (p) => {
    const exists = providers.find(x => x.id === p.id);
    const updated = { ...p, updatedAt: new Date().toISOString() };
    const next = exists ? providers.map(x => x.id === p.id ? updated : x) : [...providers, { ...updated, id: p.id || uid(), createdAt: new Date().toISOString() }];
    return await saveProviders(next);
  };
  const deleteProvider = async (id) => {
    return await saveProviders(providers.filter(x => x.id !== id));
  };
  // Buscar proveedor por nombre (case-insensitive). Devuelve el objeto provider o null.
  const findProviderByName = (name) => {
    if (!name) return null;
    const lk = name.trim().toLowerCase();
    return providers.find(p => (p.name || "").trim().toLowerCase() === lk) || null;
  };

  // ── Enviar compra a Logistica como orden de recogida ──
  // Crea un despacho en lg-despachos con la info necesaria para que Logistica
  // coordine el retiro. Ana usa esto cuando ya hablo con el proveedor y
  // confirmo la fecha de retiro.
  //
  // ROBUSTEZ (mismo patron que sP() para purchases):
  // 1. PRE-FETCH cloud antes de save → evita pisar despachos que Oscar/Jorge
  //    agregaron concurrentemente (race condition entre 3 Macs simultaneas).
  // 2. MERGE por id → si nuestro local tiene una version del mismo id la nuestra
  //    gana; resto del cloud se preserva.
  // 3. VERIFICACION post-save → re-fetch cloud y confirmar que nuestro despacho
  //    quedo persistido. Si no, alerta explicita.
  const enviarAOrdenRecogida = async (purchase, opts = {}) => {
    const tStart = Date.now();
    console.group(`[enviarAOrdenRecogida] ${new Date().toISOString()}`);
    try {
      const rec = {
        id: uid(),
        source: "compra",
        sourcePurchaseId: purchase.id,
        tipo: "material_compra",
        descripcion: purchase.description || "",
        origen: purchase.provider || "Proveedor",
        destino: `Proyecto ${purchase.projectCode || ""}`.trim(),
        projectCode: purchase.projectCode || "",
        vehicleId: "",
        motorista: "",
        fechaNecesaria: opts.fechaConfirmada || "",
        fechaProgramada: opts.fechaConfirmada || "",
        fechaEjecutada: "",
        estado: "pendiente",
        pickupInfo: {
          coordinadoPor: userName || userRole,
          coordinadoAt: new Date().toISOString(),
          fechaConfirmada: opts.fechaConfirmada || "",
          contactoProveedor: opts.contactoProveedor || "",
          notas: opts.notas || "",
        },
        notas: opts.notas ? `[Coord. con proveedor]\n${opts.notas}` : "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      console.log("📦 Nuevo despacho a crear:", rec.id, "para compra", purchase.id);

      // 1) PRE-FETCH cloud
      const cloudPrevio = await store.get("lg-despachos");
      const cloudArr = Array.isArray(cloudPrevio) ? cloudPrevio : [];
      console.log("☁️ Cloud actual:", cloudArr.length, "despachos | Local:", despachos.length);

      // 2) Verificar idempotencia: si por alguna razon ya hay un despacho con
      // mismo sourcePurchaseId en cloud (race vs otro Ana en otra tab), abortar
      // y devolver el existente — evita duplicados.
      const existenteCloud = cloudArr.find(d => d.sourcePurchaseId === purchase.id);
      if (existenteCloud) {
        console.warn("⚠️ Ya existe despacho para esta compra en cloud:", existenteCloud.id, "— no duplico.");
        // Sincronizar local con cloud
        setDespachos(cloudArr);
        return { ok: true, despachoId: existenteCloud.id, alreadyExisted: true };
      }

      // 3) MERGE: tomar todo de cloud + agregar nuestro nuevo (cloud es source of truth
      // para no perder lo que Oscar/Jorge agregaron mientras Ana editaba)
      const localIds = new Set(despachos.map(d => d.id));
      const cloudIds = new Set(cloudArr.map(d => d.id));
      // Local-only (despachos que Ana edito/agrego pero aun no estan en cloud)
      const localOnly = despachos.filter(d => !cloudIds.has(d.id));
      if (localOnly.length > 0) {
        console.log(`📤 ${localOnly.length} despachos locales no estan en cloud — incluyendo en merge.`);
      }
      const cloudExtras = cloudArr.filter(d => !localIds.has(d.id));
      if (cloudExtras.length > 0) {
        console.log(`📥 ${cloudExtras.length} despachos en cloud no estaban en local — preservando.`);
      }
      // Merged = cloud (base autoritativa) + local-only + el nuevo rec
      const merged = [...cloudArr, ...localOnly, rec];
      console.log("🔀 Merged:", merged.length, "despachos");

      // 4) Save
      setDespachos(merged);
      const okSave = await store.set("lg-despachos", merged);
      console.log("☁️ Save lg-despachos →", okSave ? "OK" : "FAIL");

      // 5) VERIFICACION post-save: re-fetch y confirmar que nuestro despacho esta
      let verifiedOk = okSave;
      if (okSave) {
        try {
          const verify = await store.get("lg-despachos");
          const verifyArr = Array.isArray(verify) ? verify : [];
          const found = verifyArr.find(d => d.id === rec.id);
          if (!found) {
            verifiedOk = false;
            console.error("❌ VERIFICACION FALLO: cloud no devolvio el despacho recien creado");
          } else {
            console.log("✅ Verificado en cloud:", verifyArr.length, "despachos totales");
          }
        } catch (e) {
          console.warn("⚠️ No se pudo verificar post-save:", e?.message || e);
        }
      }

      const tEnd = Date.now();
      console.log(`⏱ enviarAOrdenRecogida completo en ${tEnd - tStart}ms. OK: ${verifiedOk}`);
      return { ok: verifiedOk, despachoId: rec.id };
    } finally {
      console.groupEnd();
    }
  };
  const cp = purchases.filter(p => p.company === co);

  // Lista unificada de proyectos (base + custom con metadata adicional).
  // Reglas:
  // - Para cada proyecto BASE: si hay una entrada custom con mismo short, sus campos
  //   sobreescriben los del base (name, code, costsRequestFile, etc.). Esto permite
  //   editar proyectos base sin tocar el codigo hardcoded.
  // - Si la entrada custom tiene `hidden: true`, el proyecto base NO se muestra
  //   (usado al renombrar un base — el alias viejo queda oculto).
  // - Si la entrada custom tiene `deleted: true`, tampoco se muestra (soft-delete).
  // - Proyectos custom puros (sin base) aparecen si no estan deleted/hidden.
  const getAllProjects = () => {
    const baseShorts = new Set(PROJECTS.map(p => p.short));
    const result = [];
    PROJECTS.forEach(p => {
      const extra = customProjects.find(cp => cp.short === p.short);
      if (extra?.hidden || extra?.deleted) return; // base oculto/borrado por override
      // Merge: base + extra (extra gana). Mantenemos isCustom: false porque sigue siendo base.
      const merged = { ...p, ...(extra || {}), isCustom: false };
      result.push(merged);
    });
    customProjects.forEach(cp => {
      if (baseShorts.has(cp.short)) return; // ya manejado arriba
      if (cp.hidden || cp.deleted) return;
      result.push({ ...cp, isCustom: true });
    });
    // ORDEN ALFABÉTICO (18-sep-2026, pedido de Gerson: "que los proyectos
    // aparezcan en orden alfabético cuando vas a poner un proyecto en una
    // solicitud de compra"). Se ordena en la FUENTE para que salga igual en
    // el form, en el filtro de Solicitudes y en la pestaña Proyectos.
    // `localeCompare` con sensitivity base: los acentos y las mayúsculas no
    // mandan a CIMENTACIÓN al final de la lista.
    result.sort((a, b) => String(a.short || "").localeCompare(String(b.short || ""), "es", { sensitivity: "base", numeric: true }));
    return result;
  };
  const allProjects = getAllProjects();
  const getProject = (short) => allProjects.find(p => p.short === short);

  // Actualizar metadata custom de un proyecto (base o nuevo)
  const upsertProjectMeta = async (short, patch) => {
    const base = PROJECTS.find(p => p.short === short);
    const existing = customProjects.find(cp => cp.short === short);
    if (existing) {
      return await sCP(customProjects.map(cp => cp.short === short ? { ...cp, ...patch } : cp));
    } else {
      const seed = base ? { short: base.short, name: base.name, code: base.code } : { short };
      return await sCP([...customProjects, { ...seed, ...patch, createdAt: new Date().toISOString() }]);
    }
  };

  // Eliminar un proyecto (custom puro o base, vía soft-delete).
  // - Si el proyecto tiene solicitudes asociadas, NO se permite borrar (hay que migrarlas
  //   o renombrar primero). Se le indica al usuario que use el rename con cascade.
  // - Para customProjects puros: se quita del array.
  // - Para proyectos BASE: se agrega una entrada custom con { deleted: true } para
  //   ocultarlo (soft-delete; revertible editando customProjects manualmente).
  const deleteProject = async (short) => {
    const asociadas = purchases.filter(p => p.projectCode === short);
    if (asociadas.length > 0) {
      alert(
        `❌ No se puede eliminar el proyecto "${short}" porque tiene ${asociadas.length} solicitud(es) asociada(s).\n\n` +
        `Para eliminarlo:\n` +
        `1) Renombra el alias (renombra con cascade — las solicitudes se transfieren al nuevo proyecto),\n  o\n` +
        `2) Elimina manualmente las solicitudes asociadas primero.`
      );
      return false;
    }
    const baseProj = PROJECTS.find(p => p.short === short);
    if (!confirm(`¿Eliminar el proyecto "${short}"?${baseProj ? "\n\n(Es un proyecto base del sistema. Se va a ocultar — podes restaurarlo si lo necesitas.)" : ""}\n\nEsta accion solo se puede deshacer manualmente.`)) return false;

    let nextCP;
    const existingCustom = customProjects.find(cp => cp.short === short);
    if (baseProj) {
      // Soft-delete del base: agregar override con deleted: true
      if (existingCustom) {
        nextCP = customProjects.map(cp => cp.short === short ? { ...cp, deleted: true, deletedAt: new Date().toISOString() } : cp);
      } else {
        nextCP = [...customProjects, { short, deleted: true, deletedAt: new Date().toISOString() }];
      }
    } else {
      // Custom puro: lo eliminamos directamente del array
      nextCP = customProjects.filter(cp => cp.short !== short);
    }
    setCustomProjects(nextCP);
    const ok = await store.set("cp-projects", nextCP);
    if (ok) {
      alert(`✓ Proyecto "${short}" eliminado.`);
    } else {
      alert(`⚠️ El cambio se guardo en este dispositivo pero hubo un problema sincronizando con la nube.`);
    }
    return ok;
  };

  // Renombrar el alias de un proyecto en cascada:
  // - Actualiza customProjects (cambia el short)
  // - Actualiza TODAS las solicitudes de compra que usaban el alias viejo → al nuevo
  // - Si el alias viejo era de un proyecto base de PROJECTS, crea una entrada
  //   custom con el nuevo short para "ocultar" el base con el nombre/code editado.
  // Devuelve true si tuvo exito, false si fue cancelado o hubo error.
  const renameProjectAlias = async (oldShort, newShort, patch) => {
    if (!oldShort || !newShort || oldShort === newShort) return false;
    // Validar conflicto: si newShort ya existe en otro proyecto (custom o base)
    if (allProjects.some(p => p.short === newShort)) {
      alert(`❌ Ya existe un proyecto con el alias "${newShort}". Elegi otro.`);
      return false;
    }
    // Contar solicitudes afectadas
    const afectadas = purchases.filter(p => p.projectCode === oldShort);
    const baseProj = PROJECTS.find(p => p.short === oldShort);
    const advertenciaBase = baseProj ? `\n\nNota: "${oldShort}" es un proyecto base del sistema. El alias viejo seguira existiendo en el codigo, pero quedara oculto bajo el nuevo nombre.` : "";
    const mensaje = `¿Renombrar alias "${oldShort}" → "${newShort}"?\n\n` +
      `Esto va a actualizar ${afectadas.length} solicitud(es) existente(s) ` +
      `que apuntaban a "${oldShort}". Despues van a aparecer correctamente bajo "${newShort}".` +
      advertenciaBase + `\n\n¿Continuar?`;
    if (!confirm(mensaje)) return false;

    // 1) Actualizar customProjects: el item con oldShort pasa a newShort
    let nextCP;
    const existingCustom = customProjects.find(cp => cp.short === oldShort);
    if (existingCustom) {
      // El proyecto vive en customProjects → simplemente actualizo el short
      nextCP = customProjects.map(cp => cp.short === oldShort ? { ...cp, ...patch, short: newShort, renamedFrom: oldShort, renamedAt: new Date().toISOString() } : cp);
    } else {
      // Era proyecto BASE sin override custom previo. Necesito:
      //   a) Ocultar el base viejo agregando una entrada con { short: oldShort, hidden: true }
      //   b) Crear la nueva entrada custom con el nuevo short y los datos editados
      const seed = baseProj ? { name: baseProj.name, code: baseProj.code } : {};
      nextCP = [
        ...customProjects,
        { short: oldShort, hidden: true, renamedTo: newShort, hiddenAt: new Date().toISOString() },
        { ...seed, ...patch, short: newShort, renamedFrom: oldShort, createdAt: new Date().toISOString() },
      ];
    }

    // 2) Actualizar todas las solicitudes que usaban el alias viejo
    const nextPurchases = purchases.map(p => p.projectCode === oldShort ? { ...p, projectCode: newShort } : p);

    // 3) Persistir AMBOS atomicamente. Primero customProjects (rapido) y despues
    // purchases (que puede tener archivos pesados).
    setCustomProjects(nextCP);
    store.set("cp-projects", nextCP);
    const ok = await sP(nextPurchases);

    if (ok) {
      alert(`✓ Renombrado: "${oldShort}" → "${newShort}".\n${afectadas.length} solicitud(es) actualizada(s).`);
    } else {
      alert(`⚠️ El renombre se guardo en este dispositivo pero hubo un problema sincronizando con la nube. Revisa el mensaje anterior y reintenta si es necesario.`);
    }
    return ok;
  };

  const addAudit = (p, action, note) => ({
    ...p,
    audit: [...(p.audit || []), { action, by: userName || userRole, role: userRole, at: new Date().toISOString(), note: note || "" }],
  });

  // Devuelve la promise de sP (true=OK, false=fallo) para que los callers que
  // hacen uploads de archivos puedan AWAIT y dar feedback al usuario en caso
  // de error. Antes esto retornaba void y los errores quedaban en silencio.
  const updatePurchase = (updated) => sP(purchases.map(p => p.id === updated.id ? updated : p));

  // ── GUARDAR LA LISTA DE PRIORIDADES (18-sep-2026) ───────────────────────
  // Array chiquito y propio, pero igual lo pueden tocar dos personas de
  // Finanzas a la vez. Reglas (mismas que el resto del módulo):
  //   · pre-fetch con getCloud — si la nube no responde, NO se guarda.
  //   · RESCATE: lo que alguien más agregó y yo nunca tuve se conserva (se
  //     pega al final); lo que yo saqué a propósito no revive, porque estaba
  //     en mi lista previa.
  //   · verify releyendo la nube: todos MIS ids tienen que estar.
  // ── Guardado de las LISTAS PROPIAS de GeoShopping (cp-prioridades, cp-cxp) ──
  // Arrays chiquitos de {id, ...} cuyo dueño es este módulo. Mismas reglas de
  // siempre: pre-fetch con getCloud (si la nube no responde NO se guarda y se
  // revierte la pantalla), RESCATE de lo que otro agregó y yo nunca tuve (lo
  // que yo saqué a propósito no revive, porque estaba en mi lista previa) y
  // verify releyendo la nube.
  const sListaPropia = async ({ key, next, previa, setLista, setSaving, etiqueta }) => {
    setLista(next);
    setSaving(true);
    lastLocalMutAtRef.current = Date.now();
    try {
      let cloud;
      try { cloud = await store.getCloud(key); }
      catch (e) {
        console.error(`[${key}] nube no responde:`, e?.message || e);
        setLista(previa);
        alert(`⚠️ No hay conexión con la nube.\n\nNo se guardó el cambio en ${etiqueta}. Esperá unos segundos y volvé a intentar.`);
        return false;
      }
      const cloudArr = Array.isArray(cloud) ? cloud : [];
      const idsMios = new Set(next.map(x => x.id));
      const idsPrevios = new Set(previa.map(x => x.id));
      const ajenas = cloudArr.filter(c => c && c.id && !idsMios.has(c.id) && !idsPrevios.has(c.id));
      const merged = [...next, ...ajenas];
      const ok = await store.set(key, merged);
      if (!ok) {
        setLista(previa);
        alert(`⚠️ No se pudo guardar ${etiqueta}. Volvé a intentar.`);
        return false;
      }
      let verify;
      try { verify = await store.getCloud(key); } catch { verify = null; }
      if (Array.isArray(verify)) {
        const enNube = new Set(verify.map(x => x?.id));
        const faltan = next.filter(x => !enNube.has(x.id));
        if (faltan.length) {
          alert(`⚠️ ${etiqueta} se guardó incompleta (${faltan.length} solicitud(es) no quedaron en la nube). Recargá la página y revisá antes de seguir.`);
          return false;
        }
      }
      setLista(merged);
      lastLocalMutAtRef.current = Date.now();
      return true;
    } finally { setSaving(false); }
  };

  const sPri = (next) => sListaPropia({
    key: "cp-prioridades", next, previa: prioridadesRef.current || [],
    setLista: setPrioridades, setSaving: setPriSaving, etiqueta: "la lista de prioridades",
  });
  const sCxp = (next) => sListaPropia({
    key: "cp-cxp", next, previa: cxpRef.current || [],
    setLista: setCxp, setSaving: setCxpSaving, etiqueta: "la programación de pagos",
  });

  // ── SALIDAS ALTERNATIVAS DEL KANBAN DE ANA (ago 2026) ──
  // Hasta ahora una compra pagada SOLO salia de "Por coordinar" mandandola a
  // Logistica. Dos casos reales de la empresa no encajaban ahi:
  //   1) El PROVEEDOR la lleva directo al proyecto (no hay que ir a traerla).
  //   2) Rentas y servicios (ej. "Pago de seguridad mayo") que no llevan
  //      ficha de recibido ni despacho — solo hay que cerrarlas.
  // Ambas escriben con updatePurchase (merge + verify de sP) y dejan huella
  // en el audit log.
  const marcarEntregaDirecta = async (purchase, { fecha, hora, contacto, notas }) => {
    const arrivalAt = new Date(`${fecha}T${hora || "00:00"}`).toISOString();
    const rec = {
      ...purchase,
      deliveryStatus: "entrega_proveedor",
      delivery: {
        ...(purchase.delivery || {}),
        entregaDirecta: true,
        arrivalAt,
        arrivalContacto: contacto || "",
        arrivalNotas: notas || "",
        expectedDate: fecha,               // compat con la vista de Recepcion
        coordinadoPor: userName,
        updatedAt: new Date().toISOString(),
      },
    };
    const saved = addAudit(rec, "entrega_directa_proveedor", `Proveedor entrega en proyecto el ${fecha} ${hora || ""}`.trim());
    const ok = await updatePurchase(saved);
    if (!ok) alert("⚠️ Se marcó en este dispositivo pero NO se sincronizó a la nube. Reintentá.");
    return ok;
  };

  // Deshacer la entrega directa: el proveedor no cumplio y hay que mandar el
  // camion. Vuelve a "Por coordinar" conservando el historial en el audit.
  const revertirEntregaDirecta = async (purchase) => {
    if (!confirm(`¿El proveedor NO la va a entregar?\n\n${purchase.provider} — ${purchase.description}\n\nVuelve a "Por coordinar" para que la mandés a Logística.`)) return false;
    const rec = {
      ...purchase,
      deliveryStatus: "pendiente_entrega",
      delivery: { ...(purchase.delivery || {}), entregaDirecta: false, updatedAt: new Date().toISOString() },
    };
    const saved = addAudit(rec, "entrega_directa_revertida", "El proveedor no la entrega — vuelve a coordinacion");
    const ok = await updatePurchase(saved);
    if (!ok) alert("⚠️ Se revirtió en este dispositivo pero NO se sincronizó a la nube. Reintentá.");
    return ok;
  };

  // Reabrir una compra cerrada sin ficha (se cerro por error). Solo admin.
  const reabrirCerrada = async (purchase) => {
    if (!confirm(`¿REABRIR ${purchase.provider} — ${purchase.description}?\n\nVuelve al circuito como pendiente de entrega.`)) return false;
    const rec = {
      ...purchase,
      deliveryStatus: "pendiente_entrega",
      delivery: { ...(purchase.delivery || {}), cerradaSinFicha: false, reabiertaPor: userName, reabiertaAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    };
    const saved = addAudit(rec, "reabierta", "Compra reabierta (estaba cerrada sin ficha)");
    const ok = await updatePurchase(saved);
    if (!ok) alert("⚠️ Se reabrió en este dispositivo pero NO se sincronizó a la nube. Reintentá.");
    return ok;
  };

  const cerrarSinFicha = async (purchase) => {
    // Doble paso a proposito: cerrar saca la compra de TODOS los tableros.
    if (!confirm(`¿CERRAR sin ficha de recibido?\n\n${purchase.provider} — ${purchase.description}\n${fmtL(Number(purchase.amount) || 0)}\n\nSale de los pendientes y no se le pedirá ficha. Usalo para rentas, servicios y pagos que no llevan acta de entrega.`)) return false;
    const motivo = prompt(
      `¿Por qué no lleva ficha? (queda en el historial)`,
      "Pago de servicio / renta — no requiere ficha"
    );
    if (motivo === null) return false; // canceló
    const rec = {
      ...purchase,
      deliveryStatus: "cerrado",
      delivery: {
        ...(purchase.delivery || {}),
        cerradaSinFicha: true,
        closingNotes: motivo.trim() || "Cerrada sin ficha de recibido",
        closedBy: userName,
        closedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    const saved = addAudit(rec, "closed_no_ficha", motivo.trim() || "Cerrada sin ficha de recibido");
    const ok = await updatePurchase(saved);
    if (!ok) alert("⚠️ Se cerró en este dispositivo pero NO se sincronizó a la nube. Reintentá.");
    return ok;
  };

  // Subir ficha firmada desde el Kanban (sin abrir el detail). Pedido del
  // coordinador: Jorge necesita poder subir la ficha directo desde la lista
  // de compras "En logistica" sin tener que abrir cada solicitud. El upload
  // es atomico: archivo a row separada + referencia en la compra + estado
  // "ficha_adjunta". Mismo flujo que LogisticsModule.uploadFichaFirmada,
  // pero standalone (no requiere despacho — funciona aunque la compra no
  // tenga orden de recogida formal).
  const uploadFichaFromCard = async (purchase, fileObj) => {
    if (!fileObj) return false;
    if (fileObj.size > 2 * 1024 * 1024) {
      alert(`❌ El archivo pesa ${(fileObj.size / 1024 / 1024).toFixed(2)} MB.\n\nLimite maximo: 2 MB por archivo.\n\nReduci antes de subir:\n• PDFs: https://smallpdf.com/compress-pdf\n• Fotos: exportar como JPG calidad media`);
      return false;
    }
    try {
      // 1) Leer como dataUrl
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(fileObj);
      });

      // 2) Subir archivo a row separada
      const fileId = uid();
      const content = { name: fileObj.name, type: fileObj.type, size: fileObj.size, dataUrl };
      const okFile = await store.set(fileKey(fileId), content);
      if (!okFile) {
        alert("⚠️ No se pudo subir el archivo a la nube. Verifica tu conexion e intenta de nuevo.");
        return false;
      }

      // 3) Pre-fetch cp-purchases DIRECTO de la nube para no pisar cambios
      // concurrentes de Ana/Carolina. Antes usaba store.get con fallback al
      // state del render: ante un timeout eso reescribia TODO el array desde
      // una foto vieja y borraba solicitudes ajenas (fix ago 2026). Sin nube
      // se aborta — el archivo ya subio y se puede reintentar el enlace.
      let cloudPurchases;
      try {
        cloudPurchases = await store.getCloud("cp-purchases");
      } catch (e) {
        alert("⚠️ No hay conexión con la nube.\n\nEl archivo se subió pero NO se enlazó a la solicitud (no se guardó nada más, para no arriesgar solicitudes de otros). Reintentá en un momento.");
        return false;
      }
      if (!Array.isArray(cloudPurchases)) {
        alert("⚠️ No se pudo leer la lista de solicitudes desde la nube. Reintentá en un momento.");
        return false;
      }
      const arr = cloudPurchases;
      const idx = arr.findIndex(p => p.id === purchase.id);
      if (idx === -1) {
        alert("⚠️ No se encontro la compra original. Recargar la pagina e intenta de nuevo.");
        return false;
      }

      // 4) Actualizar la compra con la referencia
      const orig = arr[idx];
      const updated = {
        ...orig,
        deliveryStatus: "ficha_adjunta",
        delivery: {
          ...(orig.delivery || {}),
          fichaFile: { fileId, name: fileObj.name, type: fileObj.type, size: fileObj.size },
          fichaScanned: true,
          fichaUploadedAt: new Date().toISOString(),
        },
        audit: [
          ...(orig.audit || []),
          {
            action: "ficha_uploaded_from_kanban",
            by: userName || userRole,
            role: userRole,
            at: new Date().toISOString(),
            note: `Ficha firmada subida desde Compras (Kanban): ${fileObj.name}`,
          },
        ],
      };
      const nextPurchases = [...arr];
      nextPurchases[idx] = updated;

      // 5) Save
      const okSave = await store.set("cp-purchases", nextPurchases);
      if (!okSave) {
        alert("⚠️ El archivo se subio pero no se pudo enlazar a la compra. Reintenta el upload.");
        return false;
      }
      setPurchases(nextPurchases);
      return true;
    } catch (err) {
      console.error("uploadFichaFromCard error:", err);
      alert("Error subiendo la ficha: " + (err?.message || err));
      return false;
    }
  };
  const removePurchase = (id) => sP(purchases.filter(p => p.id !== id));

  // ── BORRADO TOTAL DE UNA SOLICITUD (20-ago-2026) ─────────────────────────
  // SOLO Gerson (pedido explícito: "solo a mi porfa"). Es para pruebas y
  // solicitudes creadas por error que ya avanzaron en el flujo — las demás
  // opciones de borrado no llegan a los pasos de logística / cierre contable.
  // Limpia TODO el rastro: la solicitud, los despachos que generó en
  // GeoLogistics y los archivos adjuntos (que si no quedan huérfanos en la
  // base). Patrón robusto: getCloud + verify; sin nube, no borra nada.
  // Una compra está CERRADA contablemente si conta trae la factura, el paquete
  // digitalizado, o si se cerró a mano por ser REZAGADA del flujo viejo
  // (conta.legacy — 20-ago-2026: cientos de compras anteriores a este flujo ya
  // habían cerrado con conta en la vida real pero quedaron varadas acá).
  const yaCerradaConta = (z) => !!(z?.conta?.fileId || z?.conta?.facturaFile?.fileId || z?.conta?.legacy);
  const puedeBorrarSolicitud = userName === "Lic. Gerson Trochez";
  // ── CIERRE DE REZAGADAS (20-ago-2026, solo Gerson) ───────────────────────
  // Las compras anteriores a este flujo ya cerraron con Contabilidad en la
  // vida real, pero en el sistema quedaron varadas en cualquier fase. Esto
  // las manda a "Cerradas contablemente" registrando QUIÉN las cerró, sin
  // pedir archivo (no existe digitalizado de las viejas).
  const aplicarCierreRezagadas = async (lista, responsable, nota) => {
    if (!lista.length) return alert("No hay solicitudes que cerrar con ese criterio.");
    const ids = new Set(lista.map(z => z.id));
    let cloud;
    try { cloud = await store.getCloud("cp-purchases"); }
    catch { alert("⚠️ Sin conexión con la nube — no se cerró nada. Reintentá."); return false; }
    if (!Array.isArray(cloud)) { alert("⚠️ No se pudo leer la lista desde la nube."); return false; }
    const at = new Date().toISOString();
    const next = cloud.map(z => {
      if (!z || !ids.has(z.id) || yaCerradaConta(z)) return z;
      return {
        ...z,
        conta: { legacy: true, tipo: "rezagada", cerradoPor: responsable, cerradoAt: at, nota: nota || "" },
        audit: [...(z.audit || []), {
          ts: at, action: "cierre_contable_rezagada", by: userName || userRole, role: userRole,
          note: `Cerrada contablemente (rezagada del flujo anterior) — responsable: ${responsable}${nota ? ` · ${nota}` : ""}`,
        }],
      };
    });
    const ok = await store.set("cp-purchases", next);
    let verified = false;
    try {
      const back = await store.getCloud("cp-purchases");
      verified = Array.isArray(back) && lista.every(z => { const f = back.find(y => y && y.id === z.id); return f && yaCerradaConta(f); });
    } catch { verified = false; }
    if (!ok || !verified) { alert("⚠️ No se pudo VERIFICAR el cierre en la nube — reintentá."); return false; }
    setPurchases(next);

    // Cerrar también los despachos abiertos de esas compras: si no, quedan
    // trabados en el kanban de Logística pidiendo una ficha que nunca va a
    // llegar (son del flujo viejo).
    try {
      const cd = await store.getCloud("lg-despachos");
      if (Array.isArray(cd)) {
        let tocados = 0;
        const nd = cd.map(d => {
          if (!d || !ids.has(d.sourcePurchaseId) || d.estado === "cerrado" || d.estado === "cancelado") return d;
          tocados++;
          return { ...d, estado: "cerrado", fechaEjecutada: d.fechaEjecutada || at.slice(0, 10), updatedAt: at };
        });
        if (tocados) await store.set("lg-despachos", nd);
      }
    } catch { /* best effort: la compra ya quedó cerrada */ }
    return true;
  };

  const borrarSolicitudCompleta = async (p) => {
    if (!puedeBorrarSolicitud) return;
    const docs = [
      p.quoteFile && "cotización",
      p.receiptFile && "comprobante de pago",
      p.delivery?.fichaFile && "ficha de recibido",
      (p.conta?.facturaFile || p.conta?.fileId) && "cierre contable",
    ].filter(Boolean);
    const desps = despachos.filter(d => d && d.sourcePurchaseId === p.id);
    if (!confirm(`🗑 ¿BORRAR DEFINITIVAMENTE esta solicitud?\n\n${p.codigo || "sin código"} — ${p.provider || ""}\n${(p.description || "").slice(0, 90)}\n${fmtL(p.amount)}\n\nSe elimina la solicitud${desps.length ? `, ${desps.length} despacho(s) en GeoLogistics` : ""}${docs.length ? ` y sus archivos (${docs.join(", ")})` : ""}.\n\nNO se puede deshacer. Es para pruebas o solicitudes creadas por error.`)) return;
    if (docs.length && !confirm(`Última confirmación: esta solicitud YA tiene ${docs.join(", ")}.\n\n¿Seguro que la borrás?`)) return;

    // 1) Solicitud (getCloud + verify)
    let cloud;
    try { cloud = await store.getCloud("cp-purchases"); }
    catch { return alert("⚠️ Sin conexión con la nube — no se borró nada. Reintentá."); }
    if (!Array.isArray(cloud)) return alert("⚠️ No se pudo leer la lista desde la nube — no se borró nada.");
    const next = cloud.filter(z => z && z.id !== p.id);
    if (next.length === cloud.length) {
      alert("Esa solicitud ya no existe en la nube (alguien la borró antes). Se refresca la vista.");
      setPurchases(next); return;
    }
    const ok = await store.set("cp-purchases", next);
    let verified = false;
    try { const back = await store.getCloud("cp-purchases"); verified = Array.isArray(back) && !back.some(z => z && z.id === p.id); } catch { verified = false; }
    if (!ok || !verified) return alert("⚠️ No se pudo VERIFICAR el borrado en la nube — reintentá.");
    setPurchases(next);

    // 2) Despachos vinculados (best effort: la compra ya se fue)
    if (desps.length) {
      try {
        const cd = await store.getCloud("lg-despachos");
        if (Array.isArray(cd)) {
          const nd = cd.filter(d => !(d && d.sourcePurchaseId === p.id));
          if (nd.length !== cd.length) await store.set("lg-despachos", nd);
        }
      } catch { alert("La solicitud se borró, pero no se pudieron quitar sus despachos de GeoLogistics. Borralos a mano desde ese módulo."); }
    }

    // 3) Archivos adjuntos (quiet: si alguno falla es basura huérfana, no vale asustar)
    const fileIds = [
      p.quoteFile?.fileId, p.receiptFile?.fileId,
      p.delivery?.fichaFile?.fileId,
      p.conta?.facturaFile?.fileId, p.conta?.fileId,
    ].filter(Boolean);
    for (const fid of fileIds) {
      try { await store.remove(fileKey(fid), { quiet: true }); } catch { /* huérfano */ }
    }
    alert(`🗑 Solicitud ${p.codigo || ""} eliminada por completo.`);
  };

  // ── MIGRACIÓN: asignar código a las solicitudes viejas (19-ago-2026) ──
  // Solo admin. Numera por orden de CREACIÓN (createdAt) dentro de cada año,
  // respetando los códigos que ya existan. getCloud + verify, como todo lo
  // que reescribe el array completo.
  const asignarCodigosFaltantes = async () => {
    const sinCodigo = purchases.filter(p => p && !p.codigo);
    if (!sinCodigo.length) return alert("Todas las solicitudes ya tienen código. ✔");
    if (!confirm(`¿Asignar código a ${sinCodigo.length} solicitud(es) sin código?\n\nSe numeran por fecha de creación con el formato MAT-AÑO-0000. Las que ya tienen código NO se tocan.`)) return;
    let cloud;
    try { cloud = await store.getCloud("cp-purchases"); }
    catch { return alert("⚠️ Sin conexión con la nube — no se asignó nada. Reintentá."); }
    if (!Array.isArray(cloud)) return alert("⚠️ No se pudo leer la lista desde la nube.");
    const contadores = {};
    cloud.forEach(p => {
      const m = /^MAT-(\d{4})-(\d+)$/.exec(String(p?.codigo || ""));
      if (m) { const y = m[1], n = parseInt(m[2], 10); contadores[y] = Math.max(contadores[y] || 0, n); }
    });
    const orden = cloud.map((p, i) => ({ p, i })).filter(x => x.p && !x.p.codigo)
      .sort((a, b) => String(a.p.createdAt || "").localeCompare(String(b.p.createdAt || "")) || a.i - b.i);
    const next = [...cloud];
    orden.forEach(({ p, i }) => {
      const y = String(p.createdAt || new Date().toISOString()).slice(0, 4);
      contadores[y] = (contadores[y] || 0) + 1;
      next[i] = { ...p, codigo: `MAT-${y}-${String(contadores[y]).padStart(4, "0")}` };
    });
    const ok = await store.set("cp-purchases", next);
    let verified = false;
    try { const back = await store.getCloud("cp-purchases"); verified = Array.isArray(back) && back.filter(p => p && !p.codigo).length === 0; } catch { verified = false; }
    if (!ok || !verified) return alert("⚠️ No se pudo VERIFICAR la asignación en la nube — reintentá.");
    setPurchases(next);
    alert(`✅ Listo: ${orden.length} solicitud(es) numeradas.`);
  };

  // ── CIERRE CONTABLE (ago 2026, flujo de Ana) ──
  // El "paquete" físico (ficha firmada + factura + comprobante) se entrega a
  // Contabilidad; cuando conta lo devuelve procesado, Ana sube el paquete
  // completo DIGITALIZADO acá. Ese upload es LA regla del cierre: sin paquete
  // subido la compra sigue "por cerrar contablemente". Mismo patrón atómico
  // que uploadFichaFromCard (archivo a row propia + getCloud + enlace).
  // El campo `conta` es ortogonal a deliveryStatus — no toca ningún flujo
  // existente (Resumen/Dashboard/Recepción siguen leyendo deliveryStatus).
  const uploadPaqueteConta = async (purchase, fileObj, tipo = "paquete") => {
    if (!fileObj) return false;
    if (fileObj.size > 2 * 1024 * 1024) {
      alert(`❌ El archivo pesa ${(fileObj.size / 1024 / 1024).toFixed(2)} MB.\n\nLimite maximo: 2 MB por archivo.\n\nReduci antes de subir:\n• PDFs: https://smallpdf.com/compress-pdf\n• Fotos: exportar como JPG calidad media`);
      return false;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(fileObj);
      });
      const fileId = uid();
      const okFile = await store.set(fileKey(fileId), { name: fileObj.name, type: fileObj.type, size: fileObj.size, dataUrl });
      if (!okFile) { alert("⚠️ No se pudo subir el archivo a la nube. Reintentá."); return false; }
      let cloudPurchases;
      try { cloudPurchases = await store.getCloud("cp-purchases"); }
      catch { alert("⚠️ Sin conexión con la nube. El archivo subió pero NO se enlazó — reintentá en un momento."); return false; }
      if (!Array.isArray(cloudPurchases)) { alert("⚠️ No se pudo leer la lista de solicitudes. Reintentá."); return false; }
      const idx = cloudPurchases.findIndex(p => p.id === purchase.id);
      if (idx === -1) { alert("⚠️ No se encontró la compra. Recargá la página."); return false; }
      const orig = cloudPurchases[idx];
      const updated = {
        ...orig,
        conta: {
          // "factura": solo la factura escaneada (lo normal — conta ya tiene
          // el resto del paquete impreso). "paquete": el paquete completo
          // digitalizado. Cualquiera de las dos CIERRA la compra.
          ...(tipo === "factura"
            ? { facturaFile: { fileId, name: fileObj.name, type: fileObj.type, size: fileObj.size } }
            : { fileId, name: fileObj.name, type: fileObj.type, size: fileObj.size }),
          tipo,
          cerradoPor: userName, cerradoAt: new Date().toISOString(),
        },
        audit: [...(orig.audit || []), {
          action: "cierre_contable", by: userName || userRole, role: userRole,
          at: new Date().toISOString(),
          note: `Cerrada contablemente — ${tipo === "factura" ? "factura escaneada" : "paquete digitalizado"}: ${fileObj.name}`,
        }],
      };
      const next = [...cloudPurchases];
      next[idx] = updated;
      const okSave = await store.set("cp-purchases", next);
      if (!okSave) { alert("⚠️ El archivo subió pero no se enlazó. Reintentá el upload."); return false; }
      setPurchases(next);
      return true;
    } catch (err) {
      console.error("uploadPaqueteConta error:", err);
      alert("Error subiendo el paquete: " + (err?.message || err));
      return false;
    }
  };

  // Reabrir un cierre contable hecho por error (solo admin y Ana).
  const reabrirCierreConta = async (purchase) => {
    if (!confirm(`¿REABRIR el cierre contable de ${purchase.provider} — ${purchase.description}?\n\nVuelve a "Por cerrar contablemente". El paquete subido queda en el historial.`)) return false;
    let cloudPurchases;
    try { cloudPurchases = await store.getCloud("cp-purchases"); }
    catch { alert("⚠️ Sin conexión con la nube — no se reabrió."); return false; }
    const idx = (cloudPurchases || []).findIndex(p => p.id === purchase.id);
    if (idx === -1) { alert("⚠️ No se encontró la compra."); return false; }
    const orig = cloudPurchases[idx];
    const updated = {
      ...orig,
      conta: null,
      contaAnterior: orig.conta || null,
      audit: [...(orig.audit || []), { action: "cierre_contable_reabierto", by: userName || userRole, role: userRole, at: new Date().toISOString(), note: "Cierre contable reabierto" }],
    };
    const next = [...cloudPurchases]; next[idx] = updated;
    const ok = await store.set("cp-purchases", next);
    if (ok) setPurchases(next);
    else alert("⚠️ No se sincronizó — reintentá.");
    return ok;
  };

  // Paquete imprimible para conta: portada con los datos de la compra +
  // los documentos adjuntos (imágenes embebidas a página; los PDF se listan
  // con aviso porque el navegador no los imprime embebidos de forma fiable).
  // ── PAQUETE DE CIERRE CONTABLE (19-ago-2026) ─────────────────────────────
  // UN solo PDF descargable con TODO adentro: portada con logo + checklist de
  // Contabilidad, y a continuación los documentos anexos (PDFs mergeados con
  // pdf-lib, imágenes embebidas a página). Antes era una página HTML que solo
  // listaba los PDFs "imprimilos aparte" — conta necesita el paquete completo
  // de una para engrapar la factura física y archivarlo.
  //
  // Checklist que exige conta: ficha de recibido (si aplica), comprobante de
  // pago, cotización, constancia de pagos a cuenta del proveedor y factura.
  const imprimirPaqueteConta = async (p) => {
    const pu = p;
    try {
      const cargar = async (ref) => {
        if (!ref?.fileId) return null;
        try { const f = await store.get(fileKey(ref.fileId)); return f?.dataUrl ? { ...ref, dataUrl: f.dataUrl, type: ref.type || f.type, name: ref.name || f.name } : null; }
        catch { return null; }
      };
      const prov = findProviderByName(pu.provider);
      const [comp, ficha, quote, constancia, factura] = await Promise.all([
        cargar(pu.receiptFile), cargar(pu.delivery?.fichaFile), cargar(pu.quoteFile),
        cargar(prov?.constanciaFile), cargar(pu.conta?.facturaFile),
      ]);

      const { jsPDF } = await safeDynamicImport(() => import("jspdf"), "jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW = 210, PH = 297, M = 16;
      const fL = (n) => "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2 });
      const ORANGE = [232, 118, 45], CARBON = [44, 42, 40], GRAY = [110, 105, 100], GREEN = [5, 150, 105], RED = [185, 28, 28];
      const tc = (c) => doc.setTextColor(c[0], c[1], c[2]);
      const fs = (n, st) => doc.setFont("helvetica", st || "normal").setFontSize(n);

      // Logo (con fallback al monograma si no carga)
      let logo = null;
      try {
        const resp = await fetch(`${import.meta.env.BASE_URL}brand/logo-color.png`);
        if (resp.ok) {
          const blob = await resp.blob();
          const du = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
          const dims = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = rej; im.src = du; });
          const hMM = 15;
          logo = { du, h: hMM, w: (dims.w / dims.h) * hMM };
        }
      } catch { /* sin logo */ }

      // ── PORTADA ──
      let y = M;
      if (logo) { try { doc.addImage(logo.du, "PNG", M, y, logo.w, logo.h); } catch { /* noop */ } }
      else { fs(20, "bold"); tc(ORANGE); doc.text("GT", M, y + 11); }
      const xTxt = M + (logo ? logo.w + 6 : 16);
      fs(7.5, "bold"); tc(ORANGE); doc.text("GRUPO GEOTECNICA · GEOSHOPPING", xTxt, y + 4);
      fs(16, "bold"); tc(CARBON); doc.text("PAQUETE DE CIERRE CONTABLE", xTxt, y + 11.5);
      fs(9, "normal"); tc(GRAY);
      doc.text(String(pu.codigo || "sin código") + "  ·  " + (COMPANIES[pu.company]?.name || pu.company || ""), xTxt, y + 16.5);
      fs(7.5, "normal"); tc(GRAY);
      doc.text("Generado " + new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" }), PW - M, y + 5, { align: "right" });
      y += logo ? logo.h + 5 : 22;
      doc.setFillColor(ORANGE[0], ORANGE[1], ORANGE[2]); doc.rect(M, y, PW - 2 * M, 1.6, "F");
      y += 9;

      // Datos de la compra
      const filas = [
        ["Código de solicitud", String(pu.codigo || "— sin asignar —")],
        ["Empresa", COMPANIES[pu.company]?.name || pu.company || "—"],
        ["Proyecto", pu.projectCode || "—"],
      ];
      filas.push(
        ["Proveedor", pu.provider || "—"],
        ["RTN del proveedor", prov?.rtn || pu.providerRTN || "—"],
        ["Descripción", pu.description || "—"],
        ["Monto", fL(pu.amount)],
        ["N° de cotización", pu.quoteNumber || "—"],
        ["Forma / referencia de pago", [pu.paymentMethod, pu.paymentReference].filter(Boolean).join(" · ") || "—"],
        ["Fecha de pago", pu.paidAt ? new Date(pu.paidAt).toLocaleDateString("es-HN", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }) : "—"],
        ["Responsable de cierre contable", pu.cierreResponsable || "— sin asignar —"],
      );
      filas.forEach(([k, v]) => {
        doc.setFillColor(255, 251, 245); doc.rect(M, y, 62, 8, "F");
        doc.setDrawColor(219, 212, 200); doc.setLineWidth(0.2);
        doc.rect(M, y, 62, 8); doc.rect(M + 62, y, PW - 2 * M - 62, 8);
        fs(8, "bold"); tc(CARBON); doc.text(String(k), M + 2.5, y + 5.3);
        fs(8.5, "normal"); tc([60, 58, 56]);
        doc.text(doc.splitTextToSize(String(v), PW - 2 * M - 68)[0] || "", M + 64.5, y + 5.3);
        y += 8;
      });
      y += 7;

      // Detalle de materiales (si lo registraron)
      // Solo si aporta algo DISTINTO de la descripción: desde el 20-ago-2026 el
      // detalle según cotización y la descripción son el mismo campo, así que
      // en las solicitudes nuevas esto no se repite.
      if (pu.detalleMateriales && String(pu.detalleMateriales).trim() !== String(pu.description || "").trim()) {
        fs(8, "bold"); tc(ORANGE); doc.text("DETALLE SEGÚN COTIZACIÓN", M, y); y += 4.5;
        fs(8, "normal"); tc([60, 58, 56]);
        const lineas = doc.splitTextToSize(String(pu.detalleMateriales), PW - 2 * M - 4).slice(0, 12);
        lineas.forEach(l => { doc.text(l, M + 2, y); y += 4; });
        y += 4;
      }

      // Checklist de Contabilidad
      fs(9, "bold"); tc(CARBON); doc.text("DOCUMENTOS DEL PAQUETE", M, y); y += 2;
      doc.setDrawColor(219, 212, 200); doc.line(M, y, PW - M, y); y += 6;
      const sinFichaOk = pu.deliveryStatus === "cerrado" && !ficha;
      const items = [
        ["Ficha de recibido firmada", !!ficha, sinFichaOk ? "No aplica — " + (pu.delivery?.closingNotes || "servicio / renta") : (ficha ? ficha.name : "PENDIENTE"), sinFichaOk],
        ["Comprobante de pago", !!comp, comp ? comp.name : "PENDIENTE", false],
        ["Cotización", !!quote, quote ? quote.name : "PENDIENTE", false],
        ["Constancia de pagos a cuenta", !!constancia, constancia ? constancia.name : "PENDIENTE — subila en la ficha del proveedor", false],
        ["Factura del proveedor", !!factura, factura ? factura.name : "SE ENGRAPA FÍSICAMENTE a este paquete", false],
      ];
      items.forEach(([label, ok, nota, na]) => {
        fs(11, "bold"); tc(ok ? GREEN : (na ? GRAY : RED));
        doc.text(ok ? "\u2713" : (na ? "\u2014" : "\u2717"), M + 1, y);
        fs(9, "bold"); tc(CARBON); doc.text(String(label), M + 8, y);
        fs(7.5, "normal"); tc(GRAY); doc.text(String(nota).slice(0, 70), M + 78, y);
        y += 6.5;
      });
      y += 3;
      doc.setFillColor(248, 242, 230); doc.rect(M, y, PW - 2 * M, 13, "F");
      fs(7.5, "normal"); tc([90, 85, 80]);
      doc.text("Los documentos digitalizados van en las páginas siguientes. Engrape la FACTURA ORIGINAL a este paquete", M + 3, y + 5);
      doc.text("y súbalo escaneado en \"Por cerrar contable\" para dejar la compra cerrada en el sistema.", M + 3, y + 9.5);

      // Pie de portada
      fs(7, "normal"); tc(GRAY);
      doc.text("GeoShopping — Sistema de Operaciones · Grupo Geotecnica", M, PH - 10);
      doc.text("Preparado por " + (userName || "Operaciones"), PW - M, PH - 10, { align: "right" });

      // ── ANEXOS ─────────────────────────────────────────────────────────
      // Se ensamblan TODOS con pdf-lib para respetar el ORDEN exacto y el
      // aspect ratio de las imágenes (antes las imágenes iban primero con
      // jsPDF estiradas a fuerza — salían "pandas" — y los PDFs después,
      // así que el orden y la proporción se perdían).
      //
      // Orden pedido por Gerson (19-ago-2026):
      //   portada → FACTURA escaneada → ficha de recibido → comprobante y
      //   cotización (solo si la ficha no los trae) → constancia.
      //
      // OJO con el duplicado: la ficha que sube Logística suele ser el PDF
      // completo de la Ficha de Entrega, que YA lleva la cotización y el
      // comprobante adjuntos. Si ese PDF trae 3+ páginas se asume que los
      // incluye y no se vuelven a adjuntar — así el paquete no repite el
      // mismo documento dos veces.
      const { PDFDocument, StandardFonts, rgb } = await safeDynamicImport(() => import("pdf-lib"), "pdf-lib");
      const out = await PDFDocument.load(doc.output("arraybuffer"));
      const helv = await out.embedFont(StandardFonts.Helvetica);
      const helvB = await out.embedFont(StandardFonts.HelveticaBold);
      const bytesDe = (dataUrl) => {
        const b64 = String(dataUrl).split(",")[1] || "";
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr;
      };

      // ¿La ficha ya trae comprobante y cotización adentro?
      let fichaTraeAnexos = false;
      if (ficha && String(ficha.type || "") === "application/pdf") {
        try {
          const fDoc = await PDFDocument.load(bytesDe(ficha.dataUrl), { ignoreEncryption: true });
          fichaTraeAnexos = fDoc.getPageCount() >= 3;
        } catch { /* si no se puede leer, mejor adjuntar todo */ }
      }

      const anexos = [
        ["FACTURA DEL PROVEEDOR", factura],
        ["FICHA DE RECIBIDO FIRMADA", ficha],
        ...(fichaTraeAnexos ? [] : [["COMPROBANTE DE PAGO", comp], ["COTIZACIÓN", quote]]),
        ["CONSTANCIA DE PAGOS A CUENTA", constancia],
      ].filter(([, f]) => !!f);

      const fileName = `PAQUETE-${String(pu.codigo || pu.id).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
      const fallidos = [];
      for (const [titulo, f] of anexos) {
        const tipo = String(f.type || "");
        try {
          if (tipo === "application/pdf") {
            const inDoc = await PDFDocument.load(bytesDe(f.dataUrl), { ignoreEncryption: true });
            const pages = await out.copyPages(inDoc, inDoc.getPageIndices());
            pages.forEach(pg => out.addPage(pg));
          } else if (tipo.startsWith("image/")) {
            // pdf-lib solo embebe PNG y JPEG. Las fotos que sube la gente
            // vienen en cualquier formato (webp, heic convertido, gif…), así
            // que se normalizan a PNG con un canvas: lo que el navegador
            // pueda mostrar, entra al paquete.
            const aPng = async (dataUrl) => {
              const im = await new Promise((res, rej) => { const x = new Image(); x.onload = () => res(x); x.onerror = () => rej(new Error("imagen ilegible")); x.src = dataUrl; });
              const cv = document.createElement("canvas");
              cv.width = im.naturalWidth || im.width; cv.height = im.naturalHeight || im.height;
              if (!cv.width || !cv.height) throw new Error("imagen sin dimensiones");
              cv.getContext("2d").drawImage(im, 0, 0);
              return bytesDe(cv.toDataURL("image/png"));
            };
            let img = null;
            const directo = tipo.includes("png") || tipo.includes("jpeg") || tipo.includes("jpg");
            if (directo) {
              const bytes = bytesDe(f.dataUrl);
              try { img = tipo.includes("png") ? await out.embedPng(bytes) : await out.embedJpg(bytes); }
              catch { img = await out.embedPng(await aPng(f.dataUrl)); }
            } else {
              img = await out.embedPng(await aPng(f.dataUrl));
            }
            // Hoja en la orientación que le calce a la imagen (una foto
            // horizontal ya no se aplasta dentro de una hoja vertical).
            const horizontal = img.width > img.height;
            const [PWp, PHp] = horizontal ? [841.89, 595.28] : [595.28, 841.89]; // A4 en puntos
            const page = out.addPage([PWp, PHp]);
            const mm = 34, topBar = 62;
            page.drawText(titulo, { x: mm, y: PHp - 30, size: 11, font: helvB, color: rgb(0.909, 0.463, 0.176) });
            page.drawText(`${pu.codigo || ""} · ${pu.provider || ""}`.slice(0, 90), { x: mm, y: PHp - 44, size: 8, font: helv, color: rgb(0.43, 0.41, 0.39) });
            page.drawLine({ start: { x: mm, y: PHp - 52 }, end: { x: PWp - mm, y: PHp - 52 }, thickness: 1, color: rgb(0.909, 0.463, 0.176) });
            // Escalado PROPORCIONAL dentro del área útil
            const maxW = PWp - 2 * mm, maxH = PHp - topBar - mm;
            const esc2 = Math.min(maxW / img.width, maxH / img.height);
            const w = img.width * esc2, h = img.height * esc2;
            page.drawImage(img, { x: (PWp - w) / 2, y: mm + (maxH - h) / 2, width: w, height: h });
          }
        } catch (e) { console.warn("No se pudo incrustar " + titulo, e); fallidos.push(titulo); }
      }
      const merged = await out.save();
      const blob = new Blob([merged], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (fallidos.length) alert("El paquete se descargó, pero no se pudieron incrustar: " + fallidos.join(", ") + ".\nImprimilos aparte desde la solicitud.");
    } catch (e) {
      if (!e?.isStaleChunk) alert("No se pudo armar el paquete: " + (e?.message || e));
    }
  };
  // Helper: guarda y retorna true/false segun exito. Para los botones que
  // quieren cerrar el modal solo si el guardado fue exitoso.
  const saveOrAlert = async (newPurchases) => {
    const ok = await sP(newPurchases);
    return ok;
  };

  const cc = COMPANIES[co];

  // ── Filtros aplicados ──
  // Una compra está PAGADA si tesorería ya la pagó (pagado o finalizado).
  const esPagada = esPagadaP;   // definido a nivel de módulo (lo usa también Prioridades)
  // Fecha con la que se filtra por mes: la de PAGO si ya se pagó, si no la de
  // carga — así "agosto" significa lo natural en cada caso.
  const fechaFiltro = (p) => String((esPagada(p) ? (p.paidAt || p.paymentDate) : null) || p.createdAt || "").slice(0, 7);
  const filtered = cp.filter(p => {
    if (filter.ver === "pendientes" && esPagada(p)) return false;
    if (filter.ver === "pagadas" && !esPagada(p)) return false;
    if (filter.project && p.projectCode !== filter.project) return false;
    if (filter.provider && !(p.provider || "").toLowerCase().includes(filter.provider.toLowerCase())) return false;
    if (filter.mes && fechaFiltro(p) !== filter.mes) return false;
    return true;
  });

  // ── Stats ──
  const stats = {
    total: cp.length,
    borrador: cp.filter(p => p.status === "borrador").length,
    validado: cp.filter(p => p.status === "validado").length,
    pagado: cp.filter(p => p.status === "pagado").length,
    finalizado: cp.filter(p => p.status === "finalizado").length,
    montoPendiente: cp.filter(p => p.status === "validado").reduce((s, p) => s + (Number(p.amount) || 0), 0),
    // Mismo criterio del Dashboard: slice(0,7) sobre el string UTC de paidAt
    // (getMonth() en hora local corría al mes anterior los pagos del día 1 —
    // el mismo número salía distinto en la tira de Solicitudes y el Dashboard).
    montoPagadoMes: (() => {
      const h = new Date();
      const mesStr = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
      return cp.filter(p => (p.status === "pagado" || p.status === "finalizado") && p.paidAt && String(p.paidAt).slice(0, 7) === mesStr).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    })(),
    sinRecibido: cp.filter(p => (p.status === "pagado" || p.status === "finalizado") && p.deliveryStatus !== "cerrado").length,
  };

  // Pantalla de carga con el MISMO fondo del sistema (antes era beige y
  // "parpadeaba" entre el panel y el módulo, rompiendo la entrada smooth).
  if (!loaded) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9F9F8", fontFamily: "inherit", color: "#6E6862", fontSize: 13, letterSpacing: ".04em" }}>Cargando GeoShopping…</div>;

  // PurchaseFormImpl y PaymentFormImpl viven a nivel de modulo (final del archivo).
  // NO definir aqui — la identidad del componente cambiaria en cada render del padre
  // y React desmontaria los inputs, perdiendo el focus al tipear.

  // ── VISTA DETALLE ──
  const DetailView = ({ purchase }) => {
    const [p, setP] = useState(purchase);
    const s = STATUSES[p.status] || STATUSES.borrador;

    // Estado de Recepcion de Materiales
    const [dlvEdit, setDlvEdit] = useState(false);
    const [df, setDf] = useState({
      expectedDate: p.delivery?.expectedDate || "",
      actualDate: p.delivery?.actualDate || "",
      receivedBy: p.delivery?.receivedBy || "",
      receivedByRole: p.delivery?.receivedByRole || "",
      observations: p.delivery?.observations || "",
      fichaGenerated: p.delivery?.fichaGenerated || false,
      fichaSigned: p.delivery?.fichaSigned || false,
      fichaScanned: p.delivery?.fichaScanned || false,
      fichaFile: p.delivery?.fichaFile || null,
      closingNotes: p.delivery?.closingNotes || "",
    });
    const ud = (k, v) => setDf(d => ({ ...d, [k]: v }));

    const saveDelivery = (newDf, newStatus) => {
      // MERGE, no reemplazo: `df` solo tiene los 10 campos del form de
      // recepcion. Sin el spread de p.delivery, guardar aqui borraba los
      // datos de la entrega directa del proveedor (arrivalAt, contacto,
      // notas) y los del cierre sin ficha. Ademas, un guardado sin "fecha
      // real" NO debe degradar una compra que el proveedor va a entregar.
      const noDegradar = p.deliveryStatus === "entrega_proveedor" && newStatus === "pendiente_entrega";
      const rec = {
        ...p,
        deliveryStatus: noDegradar ? "entrega_proveedor" : (newStatus || p.deliveryStatus || "pendiente_entrega"),
        delivery: { ...(p.delivery || {}), ...newDf, updatedAt: new Date().toISOString() },
      };
      const labels = {
        recibido: "Materiales marcados como recibidos",
        ficha_adjunta: "Ficha de recibido adjuntada",
        cerrado: "Compra cerrada por Operaciones",
        pendiente_entrega: "Seguimiento de entrega actualizado",
      };
      const saved = addAudit(rec, "delivery_updated", labels[newStatus] || "Datos de recepcion actualizados");
      setP(saved); updatePurchase(saved);
      setDlvEdit(false);
    };

    const setFichaFile = (fd) => {
      const newDf = { ...df, fichaFile: fd, fichaScanned: true, fichaUploadedAt: new Date().toISOString() };
      setDf(newDf);
      saveDelivery(newDf, "ficha_adjunta");
    };
    const removeFichaFile = () => {
      if (!confirm("¿Eliminar la ficha adjunta?")) return;
      const newDf = { ...df, fichaFile: null, fichaScanned: false };
      setDf(newDf);
      const prev = p.deliveryStatus === "ficha_adjunta" ? "recibido" : (p.deliveryStatus || "recibido");
      saveDelivery(newDf, prev);
    };

    // Helper: actualiza state local + persiste + alerta si fallo.
    // El caller hace AWAIT — asi FileSlot mantiene "Subiendo..." hasta que
    // el cloud realmente confirma. Antes esto era fire-and-forget y los
    // fallos quedaban en silencio.
    const persistConFeedback = async (saved, ctxLabel = "archivo") => {
      const prev = p;
      setP(saved);
      try {
        const ok = await updatePurchase(saved);
        if (!ok) {
          alert(`⚠️ El ${ctxLabel} se ve en pantalla pero NO se sincronizo a la nube.\n\nSi cerrás esta ventana sin reintentarlo, se va a perder. Reintenta el upload o avisame.`);
          // Revertir modal state para que no de la falsa impresion de que se guardo
          setP(prev);
          return false;
        }
        return true;
      } catch (err) {
        alert(`❌ Error subiendo ${ctxLabel}: ${err?.message || err}`);
        setP(prev);
        return false;
      }
    };

    const setQuoteFile = async (fd) => {
      const rec = { ...p, quoteFile: fd };
      const saved = addAudit(rec, "quote_uploaded", `Cotizacion cargada: ${fd.name}`);
      await persistConFeedback(saved, "cotizacion");
    };
    const removeQuoteFile = async () => {
      const rec = { ...p, quoteFile: null };
      const saved = addAudit(rec, "quote_removed", "Cotizacion eliminada");
      await persistConFeedback(saved, "cotizacion");
    };

    const setReceiptFile = async (fd) => {
      const rec = { ...p, receiptFile: fd, status: "finalizado", treasuryStatus: "pagada", finalizedAt: new Date().toISOString() };
      const saved = addAudit(rec, "receipt_uploaded", `Comprobante cargado — solicitud FINALIZADA`);
      const ok = await persistConFeedback(saved, "comprobante de transferencia");
      if (ok) {
        // Confirmacion explicita para Carolina — sabe que quedo guardado
        console.info("✅ Comprobante guardado y verificado en cloud:", fd.name);
      }
    };
    const removeReceiptFile = async () => {
      if (!confirm("¿Eliminar comprobante? La solicitud volvera a estado 'Pagado sin comprobante'.")) return;
      const rec = { ...p, receiptFile: null, status: "pagado", treasuryStatus: "pagada", finalizedAt: null };
      const saved = addAudit(rec, "receipt_removed", "Comprobante eliminado");
      await persistConFeedback(saved, "comprobante");
    };

    const revertToValidado = () => {
      if (!confirm("¿Revertir pago? Borrara datos del pago y volvera al proceso de Tesoreria.")) return;
      const rec = { ...p, status: "validado", treasuryStatus: "recibida", paidAt: null, paymentMethod: "", paymentDate: "", receiptFile: null };
      const saved = addAudit(rec, "payment_reverted", "Pago revertido por Tesoreria");
      setP(saved); updatePurchase(saved);
    };

    const markAsReceived = () => {
      const rec = { ...p, treasuryStatus: "recibida" };
      const saved = addAudit(rec, "received", "Recibida por Lic. Carolina");
      setP(saved); updatePurchase(saved);
    };

    const canEditOps = canCreate && (p.status === "borrador" || p.status === "validado");
    // PAGOS EN EMERGENCIA: admin (Gerson) y costos (Christian) pueden registrar
    // pago + subir comprobante cuando Carolina no esta disponible. Carolina
    // sigue siendo la primaria — esto es solo para no quedarse trabados.
    const isEmergencyPayer = isAdmin || isCostos;
    const canRegisterPay = (canPay || isEmergencyPayer) && p.status === "validado";
    const canUploadReceiptEmergency = isEmergencyPayer && (p.status === "pagado" || p.status === "finalizado");
    const canUploadReceipt = (canPay || canUploadReceiptEmergency) && (p.status === "pagado" || p.status === "finalizado");
    const canRevertPay = canPay && (p.status === "pagado" || p.status === "finalizado");
    const canMarkReceived = canPay && p.status === "validado" && p.treasuryStatus === "pendiente";
    // Flag para mostrar aviso visual cuando admin/costos esta actuando en lugar de Carolina
    const isActingAsEmergency = isEmergencyPayer && !isTesoreria && (p.status === "validado" || p.status === "pagado" || p.status === "finalizado");

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header de estado */}
      <div style={{ background: s.bg, border: `2px solid ${s.color}`, borderRadius: 12, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Estado actual</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.label}</div>
          <div style={{ fontSize: 12, color: s.color, opacity: 0.85 }}>{s.desc}</div>
          {p.treasuryStatus && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Tesoreria:</span>
            <TreasuryBadge status={p.treasuryStatus} />
            {canPay && p.treasuryStatus === "pendiente" && <Btn small variant="info" onClick={markAsReceived}>✓ Marcar como Recibida</Btn>}
          </div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#059669" }}>{fmtL(p.amount)}</div>
          <div style={{ fontSize: 11, color: "#64748b" }}>Monto total</div>
        </div>
      </div>

      {/* Info general */}
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Datos de la solicitud</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, fontSize: 13 }}>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Empresa</div><div style={{ fontWeight: 600 }}>{COMPANIES[p.company]?.name}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Proyecto</div><div style={{ fontWeight: 600 }}>{projLabel(p.projectCode)}</div></div>
          {/* GeoCost (9-sep-2026): partida del presupuesto, solo si el proyecto
              tiene presupuesto. Sin partida = "por clasificar" en GeoCost. */}
          {(() => {
            const presCC = (presupuestos || []).find(x => x.projectCode === p.projectCode);
            if (!presCC) return null;
            const partida = (presCC.partidas || []).find(x => x.id === p.partidaId);
            return <div>
              <div style={{ fontSize: 11, color: "#64748b" }}>Partida</div>
              {partida
                ? <div style={{ fontWeight: 700 }}>{partida.nombre}</div>
                : <div style={{ fontWeight: 600, color: C_AMARILLO.color }}>Sin partida — por clasificar</div>}
              {p.sobregiroJustificacion && <div style={{ fontSize: 11.5, fontStyle: "italic", color: "#6E6862", marginTop: 2 }}>Sobregiro: {p.sobregiroJustificacion}</div>}
            </div>;
          })()}
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Fecha de carga</div><div style={{ fontWeight: 600 }}>{fmt(p.createdAt)}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Proveedor</div><div style={{ fontWeight: 600 }}>{p.provider}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>N° Cotizacion</div><div style={{ fontWeight: 600 }}>{p.quoteNumber || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Responsable Ops</div><div style={{ fontWeight: 600 }}>{p.opsResponsible || "—"}</div></div>
          <div><div style={{ fontSize: 11, color: "#64748b" }}>Validado</div><div style={{ fontWeight: 600 }}>{fmtDT(p.validatedAt)}</div></div>
          <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Descripcion</div>
            <div style={{ fontWeight: 500, lineHeight: 1.5 }}>{p.description}</div>
          </div>
          {p.cierreResponsable && <div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Responsable de cierre contable</div>
            <div style={{ fontWeight: 700, color: "#0F766E" }}>🧾 {p.cierreResponsable}</div>
          </div>}
          {p.detalleMateriales && String(p.detalleMateriales).trim() !== String(p.description || "").trim() && <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Detalle de materiales (según cotización)</div>
            <div style={{ whiteSpace: "pre-wrap", color: "#334155", background: "#F8FAFC", border: "1px solid #E2E8F0", padding: 10, borderRadius: 8, fontSize: 12.5 }}>{p.detalleMateriales}</div>
          </div>}
          {p.opsNotes && <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, color: "#64748b" }}>Notas de Operaciones</div>
            <div style={{ fontStyle: "italic", color: "#334155", background: "#F1F5F9", padding: 10, borderRadius: 8 }}>{p.opsNotes}</div>
          </div>}
        </div>

        {/* Datos bancarios del proveedor — destacados para Carolina */}
        {(p.providerBank || p.providerAccountType || p.providerAccountHolder || p.providerRTN || p.bacAccount) && (
          <div style={{ marginTop: 16, padding: 12, background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>💳 Datos bancarios del proveedor</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13 }}>
              <div><div style={{ fontSize: 10, color: "#92400E" }}>Banco</div><div style={{ fontWeight: 600 }}>{p.providerBank || "—"}</div></div>
              <div><div style={{ fontSize: 10, color: "#92400E" }}>Tipo de cuenta</div><div style={{ fontWeight: 600 }}>{p.providerAccountType || "—"}</div></div>
              <div><div style={{ fontSize: 10, color: "#92400E" }}>Titular</div><div style={{ fontWeight: 600 }}>{p.providerAccountHolder || "—"}</div></div>
              <div><div style={{ fontSize: 10, color: "#92400E" }}>RTN</div><div style={{ fontWeight: 600 }}>{p.providerRTN || "—"}</div></div>
              <div style={{ gridColumn: "span 2" }}><div style={{ fontSize: 10, color: "#92400E" }}>Numero de cuenta</div><div style={{ fontWeight: 700, fontFamily: "ui-monospace, Menlo, monospace" }}>{p.bacAccount || "—"}</div></div>
            </div>
          </div>
        )}
      </div>

      {/* Pago (si aplica) */}
      {(p.status === "pagado" || p.status === "finalizado") && <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#065F46", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>💰 Datos del pago (Tesoreria)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 13 }}>
          <div><div style={{ fontSize: 11, color: "#047857" }}>Metodo</div><div style={{ fontWeight: 600 }}>{p.paymentMethod}</div></div>
          <div><div style={{ fontSize: 11, color: "#047857" }}>Fecha de pago</div><div style={{ fontWeight: 600 }}>{fmt(p.paymentDate)}</div></div>
          {p.treasuryNotes && <div style={{ gridColumn: "1/-1" }}>
            <div style={{ fontSize: 11, color: "#047857" }}>Notas de Tesoreria</div>
            <div style={{ fontStyle: "italic", color: "#064E3B", background: "#fff", padding: 10, borderRadius: 8, border: "1px solid #A7F3D0" }}>{p.treasuryNotes}</div>
          </div>}
        </div>
      </div>}

      {/* Archivos */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <FileSlot
          label="📐 Solicitud original (Costos)"
          verArchivo={setVisor}
          file={getProject(p.projectCode)?.costsRequestFile}
          canUpload={false}
          accent="#7C3AED"
          onUpload={() => {}}
          onRemove={() => {}}
        />
        <FileSlot
          label="📄 Cotizacion del proveedor"
          verArchivo={setVisor}
          file={p.quoteFile}
          canUpload={canEditOps}
          accent="#2563EB"
          onUpload={setQuoteFile}
          onRemove={removeQuoteFile}
        />
        <div>
          <FileSlot
            label="🧾 Comprobante de transferencia"
            verArchivo={setVisor}
            file={p.receiptFile}
            canUpload={canUploadReceipt}
            accent="#059669"
            onUpload={setReceiptFile}
            onRemove={removeReceiptFile}
          />
          {canUploadReceiptEmergency && !isTesoreria && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#92400E", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6, padding: "4px 8px", lineHeight: 1.4 }}>
              ⚠️ Subida de emergencia habilitada para {isAdmin ? "Admin" : "Costos"}. Lo normal es que la suba la Lic. Carolina.
            </div>
          )}
        </div>
      </div>

      {/* ═══ Recepcion de Materiales ═══ */}
      {(p.status === "pagado" || p.status === "finalizado") && (() => {
        const ds = DELIVERY_STATUSES[p.deliveryStatus] || DELIVERY_STATUSES.pendiente_entrega;
        const isClosed = p.deliveryStatus === "cerrado";
        const canEditDlv = canEditDelivery && !isClosed;

        return <div style={{ border: `2px solid ${ds.color}`, borderRadius: 12, overflow: "hidden" }}>
          {/* Header de recepcion */}
          <div style={{ background: ds.bg, padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 22 }}>{ds.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: ds.color, textTransform: "uppercase", letterSpacing: 0.4 }}>Recepcion de Materiales</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: ds.color }}>{ds.label}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {/* Alerta si pendiente */}
              {p.deliveryStatus === "pendiente_entrega" && <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#92400E", fontWeight: 600 }}>
                ⚠️ Compra pagada — pendiente registrar recepcion de materiales
              </div>}
              <Btn small variant="info" onClick={async () => { await generateFichaPDF(p, getProject(p.projectCode), COMPANIES[p.company]?.name); }}>📥 Descargar Ficha PDF</Btn>
              {canEditDlv && !dlvEdit && <Btn small variant="info" onClick={() => setDlvEdit(true)}>✏️ Editar recepcion</Btn>}
            </div>
          </div>

          <div style={{ background: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
            {dlvEdit && canEditDlv ? (
              /* Formulario de edicion */
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                  <Input label="Fecha esperada de entrega" type="date" value={df.expectedDate} onChange={e => ud("expectedDate", e.target.value)} />
                  <Input label="Fecha real de entrega" type="date" value={df.actualDate} onChange={e => ud("actualDate", e.target.value)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <Input label="Nombre de quien recibio" value={df.receivedBy} onChange={e => ud("receivedBy", e.target.value)} placeholder="Nombre completo" />
                  <Input label="Cargo de quien recibio" value={df.receivedByRole} onChange={e => ud("receivedByRole", e.target.value)} placeholder="Cargo en el proyecto" />
                </div>
                <Textarea label="Observaciones de recepcion" value={df.observations} onChange={e => ud("observations", e.target.value)} placeholder="Estado de los materiales, faltantes, incidencias, etc." />
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {[["fichaGenerated","Ficha de recibido generada"],["fichaSigned","Ficha firmada"],["fichaScanned","Ficha escaneada"]].map(([k, label]) => (
                    <label key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={!!df[k]} onChange={e => ud(k, e.target.checked)} style={{ width: 16, height: 16 }} />
                      {label}
                    </label>
                  ))}
                </div>
                <Textarea label="Notas de cierre (Operaciones)" value={df.closingNotes} onChange={e => ud("closingNotes", e.target.value)} placeholder="Notas finales, conformidad, observaciones para el expediente..." />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <Btn variant="ghost" onClick={() => setDlvEdit(false)}>Cancelar</Btn>
                  <Btn variant="warn" onClick={() => saveDelivery(df, df.actualDate ? "recibido" : "pendiente_entrega")}>
                    💾 Guardar
                  </Btn>
                  {df.actualDate && df.receivedBy && <Btn variant="success" onClick={() => saveDelivery(df, "recibido")}>
                    ✅ Marcar materiales recibidos
                  </Btn>}
                  {/* Boton "Cerrar compra" removido a pedido del coordinador:
                      el cierre contable lo maneja Ana directamente con contabilidad
                      por fuera del sistema. Una vez que Jorge sube la ficha, la
                      compra queda como "Lista para contabilidad" (informativo). */}
                </div>
              </div>
            ) : (
              /* Vista de datos de recepcion */
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, fontSize: 13 }}>
                  <div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Fecha esperada</div><div style={{ fontWeight: 600 }}>{fmt(p.delivery?.expectedDate) || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Fecha real de entrega</div><div style={{ fontWeight: 600 }}>{fmt(p.delivery?.actualDate) || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Recibido por</div><div style={{ fontWeight: 600 }}>{p.delivery?.receivedBy || "—"}</div></div>
                  <div><div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>Cargo</div><div style={{ fontWeight: 600 }}>{p.delivery?.receivedByRole || "—"}</div></div>
                </div>
                {p.delivery?.observations && <div style={{ background: "#F8FAFC", borderRadius: 8, padding: 10, fontSize: 13, color: "#334155" }}>
                  <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Observaciones</div>
                  {p.delivery.observations}
                </div>}
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }}>
                  {[["fichaGenerated","Ficha generada"],["fichaSigned","Ficha firmada"],["fichaScanned","Ficha escaneada"]].map(([k, label]) => (
                    <div key={k} style={{ display: "flex", alignItems: "center", gap: 4, color: p.delivery?.[k] ? "#059669" : "#94A3B8", fontWeight: 600 }}>
                      {p.delivery?.[k] ? "✅" : "⬜"} {label}
                    </div>
                  ))}
                </div>
                {p.delivery?.closingNotes && <div style={{ background: "#F0FDF4", borderRadius: 8, padding: 10, fontSize: 13, color: "#065F46", border: "1px solid #BBF7D0" }}>
                  <div style={{ fontSize: 10, color: "#047857", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Notas de cierre</div>
                  {p.delivery.closingNotes}
                </div>}
                {isClosed && <div style={{ background: "#DCFCE7", border: "2px solid #059669", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#065F46", fontSize: 14 }}>
                  🔒 Compra cerrada — ciclo completo completado
                </div>}
              </div>
            )}

            {/* Ficha adjunta (PDF/imagen) */}
            <FileSlot
              label="📋 Ficha de recibido (PDF firmado)"
              verArchivo={setVisor}
              file={df.fichaFile}
              canUpload={canEditDelivery && !isClosed}
              accent="#7C3AED"
              onUpload={setFichaFile}
              onRemove={removeFichaFile}
            />
          </div>
        </div>;
      })()}

      {/* Historial / Auditoria */}
      {p.audit && p.audit.length > 0 && <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>📜 Historial</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {p.audit.slice().reverse().map((a, i) => <div key={i} style={{ fontSize: 12, padding: "6px 10px", background: "#F8FAFC", borderRadius: 6, borderLeft: "3px solid #BE185D" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontWeight: 700, color: "#BE185D", textTransform: "uppercase", fontSize: 10 }}>{a.action.replace(/_/g, " ")}</span>
              <span style={{ color: "#64748b", fontSize: 10 }}>{fmtDT(a.at)}</span>
            </div>
            <div style={{ color: "#334155" }}>{a.note}</div>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>Por: <b>{a.by}</b> ({a.role})</div>
          </div>)}
        </div>
      </div>}

      {/* Aviso de emergencia — visible cuando admin/costos esta actuando como Carolina */}
      {isActingAsEmergency && (
        <div style={{ background: "#FEF3C7", border: "2px solid #F59E0B", borderRadius: 10, padding: 12, fontSize: 13, color: "#92400E", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 800, marginBottom: 2 }}>Modo emergencia — {isAdmin ? "Administrador" : "Costos"}</div>
            <div style={{ fontSize: 12, lineHeight: 1.4 }}>
              Tenes habilitado registrar pago y subir comprobante porque Lic. Carolina no esta disponible.
              Quedara registrado en el historial que vos lo hiciste, no ella.
            </div>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 10, borderTop: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {canEditOps && <Btn variant="ghost" onClick={() => setModal({ t: "edit", d: p })}>✏️ Editar (Ops)</Btn>}
          {/* Corregir proyecto/partida de una compra YA PAGADA — solo Gerson y
              Christian (18-sep-2026). No toca el pago ni el comprobante. */}
          {canCorregirPagada && esPagadaP(p) && <Btn variant="ghost" onClick={() => setModal({ t: "corregir", d: p })} title="Corregir el proyecto o la partida presupuestaria">✏️ Corregir proyecto / partida</Btn>}
          {canRegisterPay && <Btn variant="success" onClick={() => setModal({ t: "pay", d: p })}>💰 Registrar pago{isActingAsEmergency && p.status === "validado" ? " (emergencia)" : ""}</Btn>}
          {canRevertPay && <Btn variant="warn" onClick={revertToValidado}>↺ Revertir pago</Btn>}
          {canCreate && <Btn variant="danger" onClick={() => { if (confirm(`¿Eliminar la solicitud de ${p.provider}?`)) { removePurchase(p.id); setModal(null); } }}>🗑 Eliminar</Btn>}
        </div>
        <Btn variant="ghost" onClick={() => setModal(null)}>Cerrar</Btn>
      </div>
    </div>;
  };

  // ── FORMULARIO: Crear / Editar proyecto ──
  // ProjectForm vive a nivel de modulo (ProjectFormImpl). Lo invocamos directamente
  // desde el switch de modales pasando deps del closure como props. NO definir
  // wrappers aqui adentro — la identidad del componente cambia en cada render del
  // padre y React desmonta los inputs perdiendo foco/typing.

  // ── SECCIONES ──
  // ── PROYECTOS (rediseño 18-sep-2026, pedido de Gerson: "qué horrible se ven,
  // quiero que se vean como en GeoCost") ──────────────────────────────────────
  // Mismas piezas que `renderProyectosGrid` de GeoCostModule: tarjetas
  // `.gt-vidrio` clickeables, nombre en display, código en mono, barra de
  // avance y dos columnas de cifras abajo. Sin emojis, sin StatCards de
  // colores sueltos — solo la paleta blanco/gris/naranja/carbón + el verde
  // del semáforo para lo ya pagado. La LÓGICA (stats, subir archivo de
  // Costos, editar/borrar proyecto, ir a sus solicitudes) quedó igual.
  const renderProjects = () => {
    const projectStats = allProjects.map(proj => {
      const ps = cp.filter(x => x.projectCode === proj.short);
      const paid = ps.filter(x => x.status === "pagado" || x.status === "finalizado");
      const pending = ps.filter(x => x.status === "validado");
      const draft = ps.filter(x => x.status === "borrador");
      return {
        project: proj,
        count: ps.length,
        total: ps.reduce((s, x) => s + (Number(x.amount) || 0), 0),
        pendingAmt: pending.reduce((s, x) => s + (Number(x.amount) || 0), 0),
        paidAmt: paid.reduce((s, x) => s + (Number(x.amount) || 0), 0),
        pendingCount: pending.length,
        paidCount: paid.length,
        draftCount: draft.length,
        finalizedCount: ps.filter(x => x.status === "finalizado").length,
        vencidas: ps.filter(estaVencida).length,
      };
    });
    // Los que tienen movimiento primero; dentro de cada grupo, alfabético
    // (allProjects ya viene ordenado).
    const ordenados = [...projectStats.filter(p => p.count > 0), ...projectStats.filter(p => p.count === 0)];

    const empresa = {
      total: projectStats.reduce((s, p) => s + p.total, 0),
      pending: projectStats.reduce((s, p) => s + p.pendingAmt, 0),
      paid: projectStats.reduce((s, p) => s + p.paidAmt, 0),
      count: projectStats.reduce((s, p) => s + p.count, 0),
      activos: projectStats.filter(p => p.count > 0).length,
    };

    const uploadCostsFile = async (short, fd) => { upsertProjectMeta(short, { costsRequestFile: fd }); };
    const removeCostsFile = (short) => {
      if (!confirm("¿Eliminar el archivo de solicitud de Costos de este proyecto?")) return;
      upsertProjectMeta(short, { costsRequestFile: null });
    };

    const chipMini = (txt, c) => <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800, color: c.color, background: c.bg, whiteSpace: "nowrap", letterSpacing: ".02em" }}>{txt}</span>;

    const tarjeta = ({ project, count, total, pendingAmt, paidAmt, pendingCount, paidCount, draftCount, finalizedCount, vencidas }, i) => {
      const abrir = () => { setFilter({ ver: "todas", project: project.short, provider: "", mes: "" }); setListOrden("estado"); setSec("list"); };
      const pct = total > 0 ? paidAmt / total : 0;
      return <div key={project.short}
        className="gt-vidrio gt-vidrio-hover gt-sube"
        role={count > 0 ? "button" : undefined} tabIndex={count > 0 ? 0 : undefined}
        aria-label={count > 0 ? `Ver las ${count} solicitudes de ${project.short}` : undefined}
        onClick={count > 0 ? abrir : undefined}
        onKeyDown={count > 0 ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } } : undefined}
        style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, cursor: count > 0 ? "pointer" : "default", opacity: count > 0 ? 1 : .72, animationDelay: `${Math.min(i, 12) * 45}ms` }}>

        {/* Encabezado */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ font: "800 17px/1.15 var(--display)", letterSpacing: "-.015em", color: "var(--text)", wordBreak: "break-word" }}>{project.short}</div>
            <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4, lineHeight: 1.35 }}>{project.name}</div>
            <div style={{ font: "500 10.5px/1 var(--mono, ui-monospace)", color: "var(--text-3)", marginTop: 5, letterSpacing: ".02em" }}>
              {project.code || "código contable pendiente"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
            {/* "Nuevo" (isCustom) se retiró: lo trae casi todo proyecto, no
                informaba nada y era puro ruido. Quedan los dos accionables. */}
            {vencidas > 0 && chipMini(`${vencidas} vencida${vencidas === 1 ? "" : "s"}`, C_ROJO)}
            {!project.code && chipMini("Sin código", C_GRIS)}
          </div>
        </div>

        {/* Avance de pago: carbón lo pagado, naranja lo que falta */}
        {count > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ height: 7, borderRadius: 999, background: "rgba(44,42,40,.07)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${Math.round(pct * 100)}%`, background: CHARCOAL, transition: "width .6s var(--curva)" }} />
            <div style={{ flex: 1, background: pendingAmt > 0 ? ORANGE : "transparent" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", font: "500 10px/1 var(--mono, ui-monospace)", color: "var(--text-3)", letterSpacing: ".04em", textTransform: "uppercase" }}>
            <span>{Math.round(pct * 100)} % pagado</span>
            <span>{count} solicitud{count === 1 ? "" : "es"}</span>
          </div>
        </div>}

        {/* Cifras */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9 }}>Por pagar</div>
            <div style={{ font: "800 17px/1.1 var(--display)", letterSpacing: "-.015em", marginTop: 5, color: pendingAmt > 0 ? "var(--naranja-tinta)" : "var(--text-3)" }}>{fmtL(pendingAmt)}</div>
            {pendingCount > 0 && <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>{pendingCount} solicitud{pendingCount === 1 ? "" : "es"}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9 }}>Pagado</div>
            <div style={{ font: "800 17px/1.1 var(--display)", letterSpacing: "-.015em", marginTop: 5, color: paidAmt > 0 ? C_VERDE.color : "var(--text-3)" }}>{fmtL(paidAmt)}</div>
            {paidCount > 0 && <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 2 }}>{paidCount} solicitud{paidCount === 1 ? "" : "es"}</div>}
          </div>
        </div>

        {/* Solicitud original de Costos + acciones (no propagan el click) */}
        <div onClick={e => e.stopPropagation()} style={{ borderTop: "1px solid var(--hairline)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9 }}>Solicitud original (Costos)</div>
          {project.costsRequestFile ? <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 110 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-2)", wordBreak: "break-all", lineHeight: 1.3 }}>{project.costsRequestFile.name}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{fmtMB(project.costsRequestFile.size)}</div>
            </div>
            <Btn small variant="ghost" onClick={() => {
              const f = project.costsRequestFile;
              if (f.type?.startsWith("image/") || f.type === "application/pdf") setVisor(f);   // visor in-app, sin popup
              else { const a = document.createElement("a"); a.href = f.dataUrl; a.download = f.name; a.click(); }
            }}>Ver</Btn>
            {canCreate && <Btn small variant="ghost" onClick={() => removeCostsFile(project.short)} title="Quitar el archivo">✕</Btn>}
          </div> : <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>Sin archivo adjunto</div>}
          {canCreate && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input type="file" accept=".pdf,image/*,.xls,.xlsx,.doc,.docx" style={{ display: "none" }} id={`costs-${project.short}`} onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              if (file.size > 2 * 1024 * 1024) { alert(`❌ ${fmtMB(file.size)}. Maximo 2 MB. Reduci el PDF en https://smallpdf.com/compress-pdf`); e.target.value = ""; return; }
              if (file.size > 1 * 1024 * 1024 && !confirm(`⚠️ ${fmtMB(file.size)}. ¿Continuar?`)) { e.target.value = ""; return; }
              const fd = await readFileAsDataUrl(file);
              uploadCostsFile(project.short, fd);
              e.target.value = "";
            }} />
            <Btn small variant="ghost" onClick={() => document.getElementById(`costs-${project.short}`).click()}>
              {project.costsRequestFile ? "Reemplazar" : "+ Subir archivo"}
            </Btn>
            <div style={{ flex: 1 }} />
            <Btn small variant="ghost" onClick={() => setModal({ t: "edit-project", d: project })} title="Editar proyecto">Editar</Btn>
            <Btn small variant="ghost" disabled={count > 0} onClick={() => deleteProject(project.short)}
              title={count > 0 ? `No se puede borrar: tiene ${count} solicitud(es)` : "Eliminar proyecto"}>🗑</Btn>
          </div>}
        </div>
      </div>;
    };

    return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 16 }}>
      {/* Tira resumen — misma que Solicitudes y Prioridades */}
      <div className="gt-vidrio" style={{ padding: "11px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 0, flexWrap: "wrap" }}>
        {[
          { v: empresa.activos, l: "proyectos con movimiento" },
          { v: empresa.count, l: "solicitudes" },
          { v: fmtL(empresa.pending), l: "por pagar", c: "var(--naranja-tinta)" },
          { v: fmtL(empresa.paid), l: "ya pagado" },
        ].map((x, i, arr) => (
          <div key={x.l} style={{ display: "flex", alignItems: "center", flex: isMobile ? "1 1 40%" : 1, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "800 clamp(15px,1.3vw,19px)/1.15 var(--display)", letterSpacing: "-.01em", color: x.c || "var(--text)", whiteSpace: "nowrap" }}>{x.v}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2, fontSize: 9 }}>{x.l}</div>
            </div>
            {!isMobile && i < arr.length - 1 && <div style={{ width: 1, alignSelf: "stretch", background: "var(--hairline)", margin: "0 18px 0 auto" }} />}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
        {ordenados.map(tarjeta)}
        {canCreate && <div role="button" tabIndex={0}
          onClick={() => setModal({ t: "new-project" })}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setModal({ t: "new-project" }); } }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = ORANGE; e.currentTarget.style.color = "var(--naranja-tinta)"; e.currentTarget.style.background = "rgba(232,118,45,.05)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(44,42,40,.18)"; e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "rgba(255,255,255,.35)"; }}
          style={{ minHeight: 190, border: "1.5px dashed rgba(44,42,40,.18)", borderRadius: 18, color: "var(--text-3)", background: "rgba(255,255,255,.35)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, transition: "border-color .25s, color .25s, background .25s" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          <div style={{ font: "700 14px/1 var(--sans)" }}>Nuevo proyecto</div>
        </div>}
      </div>
    </div>;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PROVEEDORES — CRUD compartido entre admin/costos/Ana
  // ─────────────────────────────────────────────────────────────────────────
  const renderProviders = () => {
    // Buscador (19-ago-2026): con 114 proveedores la grilla era imposible de
    // recorrer a ojo. Busca por nombre, RTN, contacto, teléfono o banco.
    const q = provQ.trim().toLowerCase();
    const sorted = providers.slice()
      .filter(p => {
        if (!q) return true;
        const campos = [p.name, p.rtn, p.contactName, p.contactEmail, ...(p.phones || []),
          ...(p.bankAccounts || []).flatMap(b => [b.bank, b.number, b.holder])];
        return campos.some(v => String(v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 10, padding: 14, fontSize: 13, color: "#1E40AF" }}>
        🏢 <b>{providers.length} proveedores registrados.</b> Cada compra que se crea con un proveedor nuevo se agrega aqui automaticamente para que <b>{isAsistenteCompras ? "vos completes" : "Ana complete"}</b> los datos (telefonos, cuentas bancarias, contacto). En la nueva solicitud aparecen como dropdown.
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
          <input
            value={provQ}
            onChange={e => setProvQ(e.target.value)}
            placeholder="🔍 Buscar proveedor por nombre, RTN, contacto o banco…"
            style={{ flex: 1, minWidth: 200, padding: "9px 14px", border: "1px solid #CBD5E1", borderRadius: 10, fontSize: 13, fontFamily: "inherit" }}
          />
          {provQ && <Btn small variant="ghost" onClick={() => setProvQ("")}>× Limpiar</Btn>}
        </div>
        <span style={{ fontSize: 13, color: "#64748b" }}>
          {provQ
            ? `${sorted.length} de ${providers.length} proveedores`
            : `${providers.filter(p => p.autoImported && !p.phones?.length && !p.bankAccounts?.length).length} sin datos completos`}
        </span>
        {canManageProviders && <Btn variant="primary" onClick={() => setModal({ t: "provider-new" })}>+ Agregar proveedor</Btn>}
      </div>
      {sorted.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 40, textAlign: "center", color: "#94A3B8" }}>
            {provQ ? `Ningún proveedor coincide con "${provQ}".` : "Aun no hay proveedores. Click en + Agregar proveedor."}
          </div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 14 }}>
            {sorted.map(p => {
              const incompleto = !p.phones?.length || !p.bankAccounts?.length;
              return <div
                key={p.id}
                onClick={() => canManageProviders && setModal({ t: "provider-edit", d: p })}
                style={{
                  background: "#fff",
                  border: `1px solid ${incompleto ? "#F59E0B" : "#E2E8F0"}`,
                  borderLeft: `4px solid ${incompleto ? "#F59E0B" : cc.color}`,
                  borderRadius: 12,
                  padding: 16,
                  cursor: canManageProviders ? "pointer" : "default",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => canManageProviders && (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: CHARCOAL, lineHeight: 1.3, flex: 1 }}>{p.name}</div>
                  {incompleto && <Badge color="#F59E0B">⚠️ Sin datos</Badge>}
                  {p.autoImported && !incompleto && <Badge color="#64748b">Auto</Badge>}
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569" }}>
                  {p.rtn && <div style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, color: "#64748b" }}>RTN: {p.rtn}</div>}
                  {p.contactName && <div>👤 {p.contactName}</div>}
                  {p.phones?.length > 0 && <div>📞 {p.phones.join(" · ")}</div>}
                  {p.contactEmail && <div>✉️ {p.contactEmail}</div>}
                  {p.bankAccounts?.length > 0 && <div style={{ marginTop: 4, paddingTop: 6, borderTop: "1px dashed #E2E8F0", display: "flex", flexDirection: "column", gap: 3 }}>
                    {p.bankAccounts.map((b, idx) => (
                      <div key={idx} style={{ fontSize: 11, lineHeight: 1.4 }}>
                        🏦 <b>{b.bank || "—"}</b> {b.type && `· ${b.type}`} {b.holder && `· ${b.holder}`}
                        {b.number && <div style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "#475569", marginLeft: 18 }}>{b.number}</div>}
                      </div>
                    ))}
                  </div>}
                  {(!p.phones?.length && !p.bankAccounts?.length) && <div style={{ fontStyle: "italic", color: "#94A3B8" }}>Sin telefono ni cuenta bancaria — click para completar</div>}
                </div>
              </div>;
            })}
          </div>}
    </div>;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // DASHBOARD GERENCIAL — vista ejecutiva de alto nivel
  // ─────────────────────────────────────────────────────────────────────────
  // Solo admin/gerencia/costos. Enfoque en "que falta pagar, que falta llegar,
  // que falta ficha". KPIs + donut de estados + top 5 proyectos + alertas.
  // ── DASHBOARD (v4, 1-sep-2026) ──
  // TRES tarjetas compactas en vidrio: barras Por proyecto · dona de gasto
  // del mes (en medio) · gasto por mes (tendencia global, últimos 6 meses,
  // click en una barra = ver ese mes). Todo en la paleta naranja/carbón/gris
  // y con carga animada (dashAnim: las barras y la dona crecen de 0 a su
  // valor, smooth y lento, al entrar al Dashboard).
  const renderDashboard = () => {
    const hoy = new Date();
    const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
    const esGlobal = dashMonth === "global";
    const mesSel = esGlobal ? mesActual : (dashMonth || mesActual);
    const mesSelLabel = esGlobal ? "histórico global" : (() => {
      const [y, m] = mesSel.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
    })();
    const mesCorto = esGlobal ? "GLOBAL" : mesSelLabel.split(" ")[0].toUpperCase();

    const isPaid = (p) => p.status === "pagado" || p.status === "finalizado";
    // Global = TODO lo pagado (hay compras pagadas viejas SIN paidAt);
    // por mes exige paidAt igual que siempre.
    const enVista = (p) => isPaid(p) && (esGlobal || (!!p.paidAt && String(p.paidAt).slice(0, 7) === mesSel));

    const montoPorPagar = cp.filter(p => p.status === "validado").reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const pagadoVista = cp.filter(enVista).reduce((s, p) => s + (Number(p.amount) || 0), 0);

    // ── Dona: gasto por proyecto (paleta naranja/carbón/gris) ──
    const DONUT_COLORS = ["#E8762D", "#2C2A28", "#F2A265", "#8C857D", "#C75F1F", "#C9C3BA", "#6E6862"];
    const gastoProy = {};
    cp.forEach(p => {
      if (!enVista(p)) return;
      const key = p.projectCode || "Sin proyecto";
      gastoProy[key] = (gastoProy[key] || 0) + (Number(p.amount) || 0);
    });
    const gastoSorted = Object.entries(gastoProy).sort((a, b) => b[1] - a[1]);
    const otrosGasto = gastoSorted.slice(6).reduce((s, [, v]) => s + v, 0);
    const donutCats = [
      ...gastoSorted.slice(0, 6).map(([k, v], i) => ({ key: k, label: k, count: v, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
      ...(otrosGasto > 0 ? [{ key: "_otros", label: "Otros", count: otrosGasto, color: "#D8D3CC" }] : []),
    ];
    const donutTotal = donutCats.reduce((s, c) => s + c.count, 0);
    const shortL = (v) => v >= 1e6 ? `L ${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `L ${Math.round(v / 1e3)}k` : `L ${Math.round(v)}`;
    const donutR = 58, donutInner = 40;
    const donutCircum = 2 * Math.PI * donutR;
    let accAngle = 0;
    const donutArcs = donutCats.map(c => {
      const frac = donutTotal > 0 ? c.count / donutTotal : 0;
      const dash = frac * donutCircum;
      const seg = { ...c, dash, gap: donutCircum - dash, rotation: accAngle };
      accAngle += frac * 360;
      return seg;
    });

    // ── Por proyecto: pendiente de pago (Lic. Carolina) + pagado en la vista ──
    const proyRows = (() => {
      const acc = {};
      cp.forEach(p => {
        const key = p.projectCode || "_sin_proyecto";
        if (!acc[key]) acc[key] = { porPagar: 0, nPorPagar: 0, pagadoMes: 0, nPagadoMes: 0 };
        if (p.status === "validado") { acc[key].porPagar += Number(p.amount) || 0; acc[key].nPorPagar++; }
        if (enVista(p)) { acc[key].pagadoMes += Number(p.amount) || 0; acc[key].nPagadoMes++; }
      });
      return Object.entries(acc)
        .map(([key, v]) => ({ key, name: allProjects.find(pr => pr.short === key)?.name || key, ...v }))
        .filter(r => r.porPagar > 0 || r.pagadoMes > 0)
        .sort((a, b) => (b.porPagar + b.pagadoMes) - (a.porPagar + a.pagadoMes));
    })();
    const totPorPagarProy = proyRows.reduce((s, r) => s + r.porPagar, 0);
    const totPagadoMesProy = proyRows.reduce((s, r) => s + r.pagadoMes, 0);
    const maxBarra = Math.max(1, ...proyRows.map(r => Math.max(r.pagadoMes, r.porPagar)));

    // ── Gasto por mes (GLOBAL, últimos 6 meses) — la tendencia general ──
    const meses6 = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses6.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const gastoPorMes = meses6.map(m => ({
      mes: m,
      label: new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).toLocaleDateString("es-HN", { month: "short" }).replace(".", ""),
      total: cp.filter(p => isPaid(p) && String(p.paidAt || "").slice(0, 7) === m).reduce((s, p) => s + (Number(p.amount) || 0), 0),
    }));
    const maxMes = Math.max(1, ...gastoPorMes.map(g => g.total));
    // El delta compara los dos últimos meses COMPLETOS (el mes en curso a
    // medias contra agosto completo daba "-99%" el día 1 y asustaba de gratis).
    const mesUltimo = gastoPorMes[gastoPorMes.length - 2], mesPenult = gastoPorMes[gastoPorMes.length - 3];
    const deltaMes = (mesUltimo?.total > 0 && mesPenult?.total > 0)
      ? Math.round(((mesUltimo.total - mesPenult.total) / mesPenult.total) * 100) : null;

    // ── UI ──
    const CARBON = "#2C2A28";
    const tituloCard = (txt) => (
      <div className="gt-label" style={{ color: "var(--text-3)", marginBottom: 14 }}>{txt}</div>
    );
    const pill = (txt, activo, onClick, title) => (
      <button key={txt} onClick={onClick} title={title} style={{ padding: "7px 14px", borderRadius: 999, border: activo ? "1px solid transparent" : "1px solid var(--hairline)", background: activo ? ORANGE_DARK : "var(--surface)", color: activo ? "#fff" : "var(--text-2)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{txt}</button>
    );
    const puntoLeyenda = (color, txt) => (
      <span key={txt} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--text-2)" }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: color }} />{txt}
      </span>
    );
    // Barra horizontal que CARGA: nace en 0 y crece a su valor (dashAnim)
    // OJO: función, NO componente (<Barra/> se remontaba en cada render del
    // padre y la transición de width nunca corría — "el de la izquierda no
    // carga como los otros").
    const barra = (valor, color, delay = 0) => (
      <div style={{ flex: 1, height: 7, borderRadius: 5, background: "rgba(44,42,40,.06)", overflow: "hidden" }}>
        <div style={{ width: dashAnim ? `${Math.max(valor > 0 ? 2 : 0, (valor / maxBarra) * 100)}%` : "0%", height: "100%", borderRadius: 5, background: color, transition: `width 1100ms var(--curva) ${delay}ms` }} />
      </div>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Reporte PDF a la izquierda · selector de vista a la derecha */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            {!esGlobal && (
              <button onClick={() => exportComprasEjecutivoPDF(mesSel)} title={`Reporte ejecutivo de materiales de ${mesSelLabel} (portada + detalle por proyecto)`}
                style={{ padding: "7px 16px", borderRadius: 999, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--naranja-tinta)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Reporte ejecutivo PDF — {mesSelLabel}
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="gt-label" style={{ color: "var(--text-3)" }}>Ver</span>
            {pill("Por mes", !esGlobal, () => { if (esGlobal) setDashMonth(""); }, "Las tarjetas muestran el mes elegido")}
            {!esGlobal && (
              <input type="month" value={mesSel} onChange={e => setDashMonth(e.target.value)}
                title="Mes para el pagado, la dona y Por proyecto"
                style={{ padding: "7px 12px", border: "1px solid var(--hairline)", borderRadius: 999, fontSize: 12.5, background: "var(--surface)", fontFamily: "inherit", fontWeight: 700, color: "var(--text)" }} />
            )}
            {pill("Global (todo)", esGlobal, () => setDashMonth("global"), "Histórico completo, sin filtro de mes")}
          </div>
        </div>

        {/* Las 3 tarjetas: barras · dona · tendencia por mes */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "repeat(3, minmax(0,1fr))", gap: 16, alignItems: "stretch" }}>

          {/* 1 — POR PROYECTO (barras) */}
          <div className="gt-vidrio" style={{ padding: 20, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {tituloCard(esGlobal ? "Por proyecto — histórico" : `Por proyecto — ${mesSelLabel}`)}
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap", marginBottom: 12 }}>
              <div>
                <div style={{ font: "800 clamp(19px,1.6vw,24px)/1.1 var(--display)", letterSpacing: "-.02em", color: CARBON }}>{fmtL(pagadoVista)}</div>
                <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 3 }}>{esGlobal ? "Pagado total" : "Pagado en el mes"}</div>
              </div>
              <div>
                <div style={{ font: "800 clamp(19px,1.6vw,24px)/1.1 var(--display)", letterSpacing: "-.02em", color: "var(--naranja-tinta)" }}>{fmtL(montoPorPagar)}</div>
                <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 3 }}>Por pagar (Lic. Carolina)</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
              {puntoLeyenda(CARBON, "Pagado")}
              {puntoLeyenda(ORANGE, "Por pagar")}
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {proyRows.length === 0 && (
                <div style={{ fontSize: 12.5, color: "var(--text-faint)", fontStyle: "italic", padding: "14px 0" }}>
                  Nada por pagar y ningún pago registrado en {mesSelLabel}.
                </div>
              )}
              {proyRows.slice(0, 7).map((r, i) => (
                <div key={r.key} title={`${r.name} — ${r.nPorPagar} por pagar · ${r.nPagadoMes} pagadas`} style={{ minWidth: 0 }}>
                  <div style={{ font: "600 10px/1.3 var(--mono)", color: "var(--text-2)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.key}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {barra(r.pagadoMes, CARBON, i * 90)}
                      <span style={{ fontSize: 10, fontWeight: 700, color: r.pagadoMes > 0 ? CARBON : "var(--text-faint)", width: 84, textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>{r.pagadoMes > 0 ? fmtL(r.pagadoMes) : "—"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {barra(r.porPagar, ORANGE, i * 90 + 45)}
                      <span style={{ fontSize: 10, fontWeight: 700, color: r.porPagar > 0 ? "var(--naranja-tinta)" : "var(--text-faint)", width: 84, textAlign: "right", whiteSpace: "nowrap", flexShrink: 0 }}>{r.porPagar > 0 ? fmtL(r.porPagar) : "—"}</span>
                    </div>
                  </div>
                </div>
              ))}
              {proyRows.length > 7 && (
                <div style={{ fontSize: 10, color: "var(--text-faint)" }}>+ {proyRows.length - 7} proyecto{proyRows.length - 7 !== 1 ? "s" : ""} más (el total incluye todo)</div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--hairline)", marginTop: 12, paddingTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-2)" }}>TOTAL</span>
              <span style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: CARBON }}>{fmtL(totPagadoMesProy)}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--naranja-tinta)" }}>{fmtL(totPorPagarProy)}</span>
              </span>
            </div>
          </div>

          {/* 2 — GASTO POR PROYECTO (dona, en medio) */}
          <div className="gt-vidrio" style={{ padding: 20, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {tituloCard(esGlobal ? "Gasto global por proyecto" : `Gasto del mes por proyecto — ${mesSelLabel}`)}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <svg viewBox="0 0 160 160" style={{ width: "min(62%, 210px)", height: "auto", flexShrink: 0 }}>
                <g transform="translate(80,80)">
                  <circle r={donutR} fill="none" stroke="rgba(44,42,40,.06)" strokeWidth={donutR - donutInner} />
                  {donutTotal > 0 && donutArcs.map(seg => (
                    <circle
                      key={seg.key}
                      r={donutR}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={donutR - donutInner}
                      strokeDasharray={dashAnim ? `${seg.dash} ${seg.gap}` : `0 ${donutCircum}`}
                      transform={`rotate(${-90 + seg.rotation})`}
                      style={{ transition: "stroke-dasharray 1300ms var(--curva)" }}
                    />
                  ))}
                  <text textAnchor="middle" y="-3" style={{ fontSize: 14, fontWeight: 800, fill: "var(--text)" }}>{shortL(donutTotal)}</text>
                  <text textAnchor="middle" y="13" style={{ fontSize: 7.5, fill: "var(--text-3)", letterSpacing: 0.5 }}>PAGADO {mesCorto}</text>
                </g>
              </svg>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", minWidth: 0 }}>
                {donutCats.length === 0 && (
                  <div style={{ fontSize: 12.5, color: "var(--text-faint)", fontStyle: "italic", textAlign: "center" }}>Sin pagos registrados en {mesSelLabel}.</div>
                )}
                {donutCats.map(c => {
                  const pct = donutTotal > 0 ? Math.round((c.count / donutTotal) * 100) : 0;
                  return (
                    <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, color: "var(--text)", font: "600 10.5px/1.3 var(--mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</div>
                      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 11, whiteSpace: "nowrap" }}>{fmtL(c.count)}</div>
                      <div style={{ color: "var(--text-3)", fontWeight: 800, fontSize: 11, width: 34, textAlign: "right" }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3 — GASTO POR MES (tendencia global; click en una barra = ver ese mes) */}
          <div className="gt-vidrio" style={{ padding: 20, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {tituloCard("Gasto por mes — últimos 6 meses")}
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{ font: "800 clamp(19px,1.6vw,24px)/1.1 var(--display)", letterSpacing: "-.02em", color: CARBON }}>{fmtL(gastoPorMes.reduce((s, g) => s + g.total, 0))}</div>
              {deltaMes != null && (
                <span title={`${mesUltimo.label}: ${fmtL(mesUltimo.total)} · ${mesPenult.label}: ${fmtL(mesPenult.total)}`}
                  style={{ fontSize: 11, fontWeight: 800, color: deltaMes > 0 ? "var(--naranja-tinta)" : "var(--text-3)" }}>
                  {mesUltimo.label} vs {mesPenult.label}: {deltaMes > 0 ? "+" : ""}{deltaMes}%
                </span>
              )}
            </div>
            <div className="gt-label" style={{ color: "var(--text-3)", marginBottom: 16 }}>Total del semestre (global)</div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: isMobile ? 8 : 12, minHeight: 170, paddingBottom: 4 }}>
              {gastoPorMes.map((g, i) => {
                const activo = !esGlobal && g.mes === mesSel;
                const hPct = Math.max(g.total > 0 ? 4 : 1.5, (g.total / maxMes) * 100);
                return (
                  <div key={g.mes} onClick={() => setDashMonth(g.mes)} title={`${g.label}: ${fmtL(g.total)} — click para ver este mes`}
                    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", height: "100%" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: activo ? "var(--naranja-tinta)" : "var(--text-3)", whiteSpace: "nowrap", minHeight: 11 }}>{g.total > 0 ? shortL(g.total) : ""}</div>
                    {/* Wrapper de altura idéntica en las 6 columnas: la barra
                        mide % de ESTO (si midiera la columna, los labels se
                        comían el espacio y los meses altos salían iguales). */}
                    <div style={{ flex: 1, width: "100%", maxWidth: 40, display: "flex", alignItems: "flex-end", minWidth: 0 }}>
                      <div style={{ width: "100%", height: dashAnim ? `${hPct}%` : "1.5%", borderRadius: "7px 7px 3px 3px", background: activo ? ORANGE : (g.total > 0 ? "#C9C3BA" : "rgba(44,42,40,.08)"), transition: `height 1100ms var(--curva) ${i * 110}ms, background var(--mov-rapido)` }} />
                    </div>
                    <div style={{ font: "700 9.5px/1 var(--mono)", color: activo ? "var(--naranja-tinta)" : "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{g.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // COMMAND CENTER — Resumen end-to-end por proyecto
  // ─────────────────────────────────────────────────────────────────────────
  // Vista para admin/gerencia/costos. Cada compra muestra TODO su lifecycle
  // (validacion → pago → coordinacion Ana → logistica → ficha Jorge → cerrado)
  // con la PROXIMA ACCION PENDIENTE destacada. Asi el coordinador ve de un
  // vistazo donde esta cada cosa sin saltar entre modulos.
  const computeLifecycle = (p) => {
    const desp = despachos.find(d => d.sourcePurchaseId === p.id);
    const isPaid = p.status === "pagado" || p.status === "finalizado";
    const hasReceipt = !!p.receiptFile;
    const hasDesp = !!desp;
    const hasVehicle = !!desp?.vehicleId;
    const enRuta = desp?.estado === "en_ruta";
    const entregado = desp?.estado === "entregado" || p.deliveryStatus === "ficha_adjunta" || p.deliveryStatus === "cerrado";
    const fichaUploaded = !!p.delivery?.fichaFile;
    // Salidas alternativas del kanban de Ana (ago 2026). Se usa el FLAG
    // persistido para no confundir cierres viejos (que si pasaron por
    // logistica) con los cierres nuevos de servicios/rentas.
    // El flag persistido sobrevive a la subida de la ficha: asi la barra de
    // fases sigue contando "la trajo el proveedor" y no deja "Coordinada Ana"
    // y "Logistica" apagados para siempre.
    const entregaDirecta = p.deliveryStatus === "entrega_proveedor" || !!p.delivery?.entregaDirecta;
    const esperandoProveedor = p.deliveryStatus === "entrega_proveedor";
    const cerradaSinFicha = p.deliveryStatus === "cerrado" && !fichaUploaded && !!p.delivery?.cerradaSinFicha;
    // Desde el POV del coordinador (admin/gerencia/costos), una compra esta
    // "lista" cuando Jorge subio la ficha — de ahi en adelante Ana cierra con
    // contabilidad y NO necesitamos visibilidad. Si conta tiene problema, avisa.
    const lista = fichaUploaded || p.deliveryStatus === "cerrado";

    // Estado y "siguiente accion" en lenguaje claro
    let nextAction = "";
    let nextOwner = "";
    if (p.status === "borrador") { nextAction = "Aprobar para enviar a Tesoreria"; nextOwner = "Operaciones"; }
    else if (p.status === "validado") { nextAction = "Registrar pago"; nextOwner = "Lic. Carolina"; }
    else if (isPaid && !hasReceipt) { nextAction = "Subir comprobante"; nextOwner = "Lic. Carolina"; }
    else if (cerradaSinFicha) { nextAction = `🔒 Cerrada sin ficha${p.delivery?.closingNotes ? ` — ${p.delivery.closingNotes}` : ""}`; nextOwner = ""; }
    else if (esperandoProveedor && !fichaUploaded) {
      const llega = p.delivery?.arrivalAt ? new Date(p.delivery.arrivalAt) : null;
      nextAction = `🏪 La entrega el proveedor${llega ? ` — llega ${llega.toLocaleDateString("es-HN", { day: "2-digit", month: "short" })} ${llega.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}` : ""}`;
      nextOwner = "Proveedor";
    }
    else if (isPaid && hasReceipt && !hasDesp) { nextAction = "Coordinar con proveedor + enviar a logistica"; nextOwner = "Ana Vasquez"; }
    else if (hasDesp && !hasVehicle && desp?.estado === "pendiente") { nextAction = "Asignar vehiculo + motorista"; nextOwner = "Oscar Paz"; }
    else if (hasVehicle && !enRuta && !entregado) { nextAction = "Salir en ruta"; nextOwner = "Oscar Paz"; }
    else if (enRuta) { nextAction = "Entregar en proyecto"; nextOwner = "Motorista"; }
    else if (entregado && !fichaUploaded) { nextAction = "Entregado — pendiente subir ficha de recibido firmada"; nextOwner = "Jorge Castellanos"; }
    else if (fichaUploaded) { nextAction = "✓ Lista — pasar a contabilidad"; nextOwner = ""; }

    return {
      desp, isPaid, hasReceipt, hasDesp, hasVehicle, enRuta, entregado, fichaUploaded, lista,
      entregaDirecta, esperandoProveedor, cerradaSinFicha,
      nextAction, nextOwner,
    };
  };

  // ── Pestaña COSTOS — vista ejecutiva de costos por proyecto ──
  // ─────────────────────────────────────────────────────────────────────────
  // REPORTE EJECUTIVO MENSUAL DE MATERIALES (19-ago-2026, pedido de Gerson)
  // Espejo del "Costo de Mano de Obra" de GeoTeam: portada con KPIs + dona
  // por proyecto + mezcla por empresa, y detalle por proyecto con CADA compra
  // (incluido su detalle de materiales según cotización). AMBAS empresas.
  // Mes por fecha de PAGO (paidAt) — mismo criterio que el Dashboard.
  // ─────────────────────────────────────────────────────────────────────────
  const exportComprasEjecutivoPDF = (mesEjec) => {
    if (!mesEjec) return alert("Elegí el mes del reporte.");
    const [yy, mmn] = mesEjec.split("-").map(Number);
    const mesNombreRaw = new Date(yy, mmn - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" });
    const mesTitulo = mesNombreRaw.charAt(0).toUpperCase() + mesNombreRaw.slice(1);
    const fL = (n) => "L " + Number(n || 0).toLocaleString("es-HN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const TAG = { geotecnica: "GEO", subterra: "SUB" };
    const delMes = purchases.filter(x => (x.status === "pagado" || x.status === "finalizado") && String(x.paidAt || "").slice(0, 7) === mesEjec);
    if (!delMes.length) return alert(`No hay compras pagadas en ${mesTitulo}.`);
    const proy = {};
    const porEmp = { geotecnica: { total: 0, n: 0 }, subterra: { total: 0, n: 0 } };
    delMes.forEach(x => {
      const k = x.projectCode || "SIN PROYECTO";
      if (!proy[k]) proy[k] = { short: k, name: getProject(x.projectCode)?.name || "", total: 0, n: 0, porCo: { geotecnica: 0, subterra: 0 }, items: [] };
      const amt = Number(x.amount) || 0;
      proy[k].total += amt; proy[k].n++;
      const co2 = x.company === "subterra" ? "subterra" : "geotecnica";
      proy[k].porCo[co2] += amt;
      if (porEmp[co2]) { porEmp[co2].total += amt; porEmp[co2].n++; }
      proy[k].items.push(x);
    });
    const rowsG = Object.values(proy).map(r => ({ ...r, items: r.items.sort((a, b) => String(a.paidAt || "").localeCompare(String(b.paidAt || ""))) })).sort((a, b) => b.total - a.total);
    const totalG = rowsG.reduce((sm, r) => sm + r.total, 0);
    const w = window.open("", "_blank");
    if (!w) return alert("Permití pop-ups para generar el PDF.");
    const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;
    const genFecha = new Date().toLocaleDateString("es-HN", { day: "numeric", month: "long", year: "numeric" });
    const PALETA = ["#E8762D", "#2C5F5D", "#3E6A99", "#B45309", "#6D28D9", "#0E7490", "#BE3455", "#15803D"];
    const top = rowsG.slice(0, 8), otros = rowsG.slice(8);
    const segs = [
      ...top.map((r, i) => ({ label: r.short, val: r.total, color: PALETA[i % PALETA.length] })),
      ...(otros.length ? [{ label: `Otros (${otros.length})`, val: otros.reduce((sm, r) => sm + r.total, 0), color: "#94A3B8" }] : []),
    ];
    const RAD = 62, CIRC = 2 * Math.PI * RAD;
    let acum = 0;
    const donaSegs = segs.map(sg => {
      const frac = totalG > 0 ? sg.val / totalG : 0;
      const el = `<circle r="${RAD}" cx="90" cy="90" fill="transparent" stroke="${sg.color}" stroke-width="34" stroke-dasharray="${(frac * CIRC).toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${(-acum * CIRC).toFixed(2)}" transform="rotate(-90 90 90)"/>`;
      acum += frac; return el;
    }).join("");
    const donaLeyenda = segs.map(sg => `<div style="display:flex;align-items:center;gap:7px;font-size:10.5px;margin-bottom:5px">
      <span style="width:10px;height:10px;border-radius:3px;background:${sg.color};flex-shrink:0"></span>
      <span style="font-weight:700;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sg.label)}</span>
      <span style="color:#64748b;min-width:42px;text-align:right">${totalG > 0 ? ((sg.val / totalG) * 100).toFixed(1) : "0"}%</span>
      <span style="font-weight:700;min-width:96px;text-align:right">${fL(sg.val)}</span>
    </div>`).join("");
    const maxEmp = Math.max(porEmp.geotecnica.total, porEmp.subterra.total, 1);
    const empresasConGasto = ["geotecnica", "subterra"].filter(c2 => porEmp[c2].total > 0);
    const barrasEmp = empresasConGasto.map(c2 => {
      const d = porEmp[c2];
      const pct = totalG > 0 ? (d.total / totalG) * 100 : 0;
      return `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
          <span style="font-weight:800;color:${COMPANIES[c2].color}">${esc(COMPANIES[c2].name)}</span>
          <span style="color:#64748b">${d.n} compra${d.n !== 1 ? "s" : ""} · ${pct.toFixed(1)}% del grupo</span>
        </div>
        <div style="background:#F1F5F9;border-radius:6px;height:26px;position:relative;overflow:hidden">
          <div style="width:${Math.max(2, (d.total / maxEmp) * 100).toFixed(1)}%;height:100%;background:${COMPANIES[c2].color};border-radius:6px"></div>
          <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11.5px;font-weight:800;color:#1E293B">${fL(d.total)}</span>
        </div>
      </div>`;
    }).join("");
    const topMix = rowsG.slice(0, 10);
    const maxProy = Math.max(...topMix.map(r => r.total), 1);
    const barrasProy = topMix.map(r => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:10px">
      <span style="width:118px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0">${esc(r.short)}</span>
      <div style="flex:1;display:flex;height:16px;background:#F8FAFC;border-radius:4px;overflow:hidden">
        ${r.porCo.geotecnica > 0 ? `<div style="width:${((r.porCo.geotecnica / maxProy) * 100).toFixed(1)}%;background:${COMPANIES.geotecnica.color}"></div>` : ""}
        ${r.porCo.subterra > 0 ? `<div style="width:${((r.porCo.subterra / maxProy) * 100).toFixed(1)}%;background:${COMPANIES.subterra.color}"></div>` : ""}
      </div>
      <span style="width:92px;text-align:right;font-weight:700;flex-shrink:0">${fL(r.total)}</span>
    </div>`).join("");
    const kpi = (label, val, color, sub) => `<div style="flex:1;min-width:130px;border:1px solid #E2E8F0;border-radius:10px;padding:11px 14px">
      <div style="font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.6px;font-weight:700">${label}</div>
      <div style="font-size:17px;font-weight:800;color:${color};margin-top:3px;letter-spacing:-0.3px">${val}</div>
      ${sub ? `<div style="font-size:9px;color:#94A3B8;margin-top:1px">${sub}</div>` : ""}
    </div>`;
    const chipCo = (c2) => `<span style="display:inline-block;background:${COMPANIES[c2]?.color || "#64748b"};color:#fff;border-radius:4px;padding:1px 6px;font-size:8px;font-weight:800;letter-spacing:0.5px;vertical-align:1px">${TAG[c2] || "?"}</span>`;
    const projBlocks = rowsG.map(r => `
    <div style="margin-bottom:16px;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;page-break-inside:avoid">
      <div style="background:#2C2A28;color:#fff;padding:8px 14px;font-weight:700;font-size:12.5px;display:flex;justify-content:space-between;align-items:center">
        <span>${esc(r.short)}${r.name ? ` <span style="font-weight:400;font-size:10px;opacity:.7">${esc(r.name)}</span>` : ""}</span>
        <span style="font-size:10px;font-weight:600;opacity:.85">${r.n} compra${r.n !== 1 ? "s" : ""} &nbsp;<span style="font-size:13px;font-weight:800;opacity:1">${fL(r.total)}</span></span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:10.5px">
        <thead><tr style="background:#F1F5F9">
          <th style="text-align:left;padding:6px 12px;font-size:8.5px;color:#64748b;letter-spacing:0.4px">PROVEEDOR</th>
          <th style="text-align:left;padding:6px 8px;font-size:8.5px;color:#64748b;letter-spacing:0.4px">DESCRIPCIÓN / MATERIALES</th>
          <th style="text-align:right;padding:6px 8px;font-size:8.5px;color:#64748b">PAGADA</th>
          <th style="text-align:right;padding:6px 12px;font-size:8.5px;color:#64748b">MONTO</th>
        </tr></thead>
        <tbody>
          ${r.items.map(x => `<tr style="border-top:1px solid #F1F5F9;vertical-align:top">
            <td style="padding:5px 12px;font-weight:600;white-space:nowrap">${chipCo(x.company === "subterra" ? "subterra" : "geotecnica")} ${esc(x.provider || "—")}</td>
            <td style="padding:5px 8px;color:#334155">${esc(x.description || "—")}${x.detalleMateriales && String(x.detalleMateriales).trim() !== String(x.description || "").trim() ? `<div style="color:#64748b;font-size:9px;white-space:pre-wrap;margin-top:2px;border-left:2px solid #E2E8F0;padding-left:6px">${esc(x.detalleMateriales)}</div>` : ""}</td>
            <td style="padding:5px 8px;text-align:right;white-space:nowrap;color:#64748b">${x.paidAt ? new Date(x.paidAt).toLocaleDateString("es-HN", { day: "2-digit", month: "short", timeZone: "UTC" }) : "—"}</td>
            <td style="padding:5px 12px;text-align:right;font-weight:700;white-space:nowrap">${fL(x.amount)}</td>
          </tr>`).join("")}
          <tr style="background:#F8FAFC;font-weight:700;border-top:1px solid #E2E8F0">
            <td colspan="3" style="padding:6px 12px">Subtotal ${esc(r.short)} · ${r.n} compra${r.n !== 1 ? "s" : ""}${r.porCo.geotecnica > 0 ? ` · GEO ${fL(r.porCo.geotecnica)}` : ""}${r.porCo.subterra > 0 ? ` · SUB ${fL(r.porCo.subterra)}` : ""}</td>
            <td style="padding:6px 12px;text-align:right;color:#059669">${fL(r.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>`).join("");
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Costo de Materiales — ${mesTitulo} · Grupo Geotecnica</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:26px;color:#1E293B;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.np{display:none}}thead{display:table-header-group}tr{page-break-inside:avoid}</style>
    </head><body>
    <div style="page-break-after:always">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:14px">
        <div style="display:flex;align-items:center;gap:14px">
          <img src="${logoUrl}" style="height:52px" onerror="this.style.display='none'" />
          <div>
            <div style="font-size:9px;color:#E8762D;font-weight:800;letter-spacing:1.8px;text-transform:uppercase">Grupo Geotecnica · Compras</div>
            <div style="font-size:23px;font-weight:800;letter-spacing:-0.4px;color:#2C2A28">Costo de Materiales</div>
            <div style="font-size:13px;color:#64748b">Reporte ejecutivo mensual — <b style="color:#2C2A28">${mesTitulo}</b></div>
          </div>
        </div>
        <div style="text-align:right;font-size:10px;color:#64748b">
          <div style="font-weight:800;color:${COMPANIES.geotecnica.color}">Geotecnica Soluciones</div>
          <div style="font-weight:800;color:${COMPANIES.subterra.color}">Subterra Honduras</div>
          <div style="margin-top:3px">Generado ${genFecha}</div>
        </div>
      </div>
      <div style="height:4px;background:linear-gradient(90deg,#E8762D,${COMPANIES.geotecnica.color},${COMPANIES.subterra.color});border-radius:2px;margin:13px 0 16px"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        ${kpi("Gasto total del grupo", fL(totalG), "#059669", `${delMes.length} compras · ${rowsG.length} proyectos`)}
        ${empresasConGasto.map(c2 => kpi(COMPANIES[c2].name, fL(porEmp[c2].total), COMPANIES[c2].color, `${porEmp[c2].n} compras`)).join("")}
        ${kpi("Ticket promedio", fL(delMes.length ? totalG / delMes.length : 0), "#3E6A99", "por compra pagada")}
      </div>
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="flex:1.15;border:1px solid #E2E8F0;border-radius:10px;padding:12px;page-break-inside:avoid">
          <div style="font-size:10px;font-weight:800;color:#2C2A28;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:8px">Distribución del gasto por proyecto</div>
          <div style="display:flex;gap:14px;align-items:center">
            <svg width="140" height="140" viewBox="0 0 180 180" style="flex-shrink:0">
              ${donaSegs}
              <text x="90" y="86" text-anchor="middle" style="font-size:11px;font-weight:800;fill:#2C2A28">${rowsG.length}</text>
              <text x="90" y="100" text-anchor="middle" style="font-size:8px;fill:#64748b">proyectos</text>
            </svg>
            <div style="flex:1">${donaLeyenda}</div>
          </div>
        </div>
        <div style="flex:1;border:1px solid #E2E8F0;border-radius:10px;padding:12px;page-break-inside:avoid">
          <div style="font-size:10px;font-weight:800;color:#2C2A28;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:9px">Gasto por empresa</div>
          ${barrasEmp}
          <div style="font-size:10px;font-weight:800;color:#2C2A28;text-transform:uppercase;letter-spacing:0.8px;margin:11px 0 7px">Mezcla por proyecto</div>
          <div style="display:flex;gap:12px;font-size:9px;color:#64748b;margin-bottom:6px">
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COMPANIES.geotecnica.color};vertical-align:-1px"></span> Geotecnica</span>
            <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${COMPANIES.subterra.color};vertical-align:-1px"></span> Subterra</span>
          </div>
          ${barrasProy}
        </div>
      </div>
    </div>
    <div style="border-left:4px solid #E8762D;padding-left:12px;margin-bottom:14px">
      <div style="font-size:9px;color:#E8762D;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Detalle por proyecto · ${mesTitulo}</div>
      <div style="font-size:11px;color:#64748b">Cada compra con su empresa: ${chipCo("geotecnica")} Geotecnica Soluciones · ${chipCo("subterra")} Subterra Honduras. El detalle de materiales sale tal cual la cotización cuando fue registrado.</div>
    </div>
    ${projBlocks}
    <div style="background:#2C2A28;color:#fff;border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;page-break-inside:avoid">
      <span style="font-size:12px;font-weight:700">GASTO TOTAL EN MATERIALES DEL GRUPO — ${mesTitulo}</span>
      <span style="font-size:17px;font-weight:800;color:#6EE7B7">${fL(totalG)}</span>
    </div>
    <div style="font-size:9px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:8px;margin-top:12px;line-height:1.5;page-break-inside:avoid">
      <b>Metodología:</b> se incluyen las solicitudes de compra con pago realizado (estado pagado o finalizado) cuya fecha de pago cae en ${mesTitulo}, de ambas empresas. Los montos son los de la solicitud aprobada. No incluye compras de repuestos de maquinaria (ver el reporte de GeoMachinery).
      Preparado por ${esc(userName || "Operaciones")} · GeoShopping — Sistema de Operaciones.
    </div>
    <br><button class="np" onclick="window.print()" style="padding:10px 24px;font-size:14px;cursor:pointer;background:#E8762D;color:#fff;border:none;border-radius:8px;font-weight:700">Imprimir / Guardar como PDF</button>
    </body></html>`);
    w.document.close();
  };

  const renderCostos = () => {
    const cardStyle = {
      background: "#fff",
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      padding: 16,
      boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
    };
    const costByProj = {};
    cp.forEach(p => {
      const key = p.projectCode || "_sin_proyecto";
      if (!costByProj[key]) costByProj[key] = { solicitudes: 0, pagado: 0, porPagar: 0 };
      costByProj[key].solicitudes++;
      const amt = Number(p.amount) || 0;
      if (p.status === "pagado" || p.status === "finalizado") costByProj[key].pagado += amt;
      else costByProj[key].porPagar += amt;
    });
    const costRows = Object.entries(costByProj)
      .map(([key, v]) => {
        const proj = allProjects.find(pr => pr.short === key);
        const total = v.pagado + v.porPagar;
        return { key, name: proj?.name || key, ...v, total, pctPagado: total > 0 ? Math.round((v.pagado / total) * 100) : 0 };
      })
      .sort((a, b) => b.total - a.total);
    const totalMat = costRows.reduce((s, r) => s + r.total, 0);
    const totalPagado = costRows.reduce((s, r) => s + r.pagado, 0);
    const totalPorPagar = costRows.reduce((s, r) => s + r.porPagar, 0);
    const pctPagadoGlobal = totalMat > 0 ? Math.round((totalPagado / totalMat) * 100) : 0;
    const pctPorPagarGlobal = totalMat > 0 ? 100 - pctPagadoGlobal : 0;
    const barColor = (pct) => pct >= 90 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* HEADER */}
        <div style={{
          background: "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)",
          border: `1px solid ${BORDER}`, borderRadius: 12, padding: "14px 18px",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          <div>
            <div style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: CHARCOAL, letterSpacing: -0.3 }}>
              💵 Costos por Proyecto
            </div>
            <div style={{ fontSize: 12, color: STONE, marginTop: 4 }}>Desglose de pagos y saldos pendientes por proyecto</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: STONE, textTransform: "uppercase", letterSpacing: 0.5 }}>Mes del reporte</label>
              <input type="month" value={costosMesEjec} onChange={e => e.target.value && setCostosMesEjec(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "inherit" }} />
            </div>
            <Btn onClick={() => exportComprasEjecutivoPDF(costosMesEjec)}>🏢 Reporte ejecutivo PDF</Btn>
          </div>
        </div>

        {/* KPI CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))", gap: 12 }}>
          <div style={{ ...cardStyle, background: "#F0FDF4", border: "1px solid #BBF7D0", textAlign: "center", padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>💵 Costo total materiales</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#1E293B" }}>{fmtL(totalMat)}</div>
          </div>
          <div style={{ ...cardStyle, background: "#F0FDF4", border: "1px solid #BBF7D0", textAlign: "center", padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>✅ Ya pagado</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#059669" }}>{fmtL(totalPagado)}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{pctPagadoGlobal}% del total</div>
          </div>
          <div style={{ ...cardStyle, background: "#FFFBEB", border: "1px solid #FDE68A", textAlign: "center", padding: 18 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>⏳ Por pagar</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#D97706" }}>{fmtL(totalPorPagar)}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{pctPorPagarGlobal}% del total</div>
          </div>
        </div>

        {/* TABLA DESGLOSE */}
        <div style={cardStyle}>
          <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginBottom: 14, letterSpacing: -0.2 }}>
            Desglose por proyecto
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                  {["Proyecto", "Solic.", "Pagado", "Por pagar", "Total", "% Pagado"].map(h => (
                    <th key={h} style={{ textAlign: h === "Proyecto" ? "left" : "right", padding: "10px 8px", fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {costRows.map(r => (
                  <tr key={r.key} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 700, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11 }}>{r.key}</div>
                      {r.name !== r.key && <div style={{ fontSize: 10, color: STONE, marginTop: 2 }}>{r.name}</div>}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "#64748B" }}>{r.solicitudes}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{fmtL(r.pagado)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "#D97706" }}>{fmtL(r.porPagar)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, color: CHARCOAL }}>{fmtL(r.total)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", width: 130 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <div style={{ width: 60, height: 8, borderRadius: 4, background: "#F1F5F9", overflow: "hidden" }}>
                          <div style={{ width: `${r.pctPagado}%`, height: "100%", background: barColor(r.pctPagado), transition: "width .3s" }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: barColor(r.pctPagado), minWidth: 34, textAlign: "right" }}>{r.pctPagado}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid #CBD5E1" }}>
                  <td style={{ padding: "10px 8px", fontWeight: 800, color: CHARCOAL, fontSize: 12 }}>TOTAL</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, color: CHARCOAL }}>{costRows.reduce((s, r) => s + r.solicitudes, 0)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, color: "#059669" }}>{fmtL(totalPagado)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, color: "#D97706" }}>{fmtL(totalPorPagar)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, color: CHARCOAL }}>{fmtL(totalMat)}</td>
                  <td style={{ padding: "10px 8px", textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      <div style={{ width: 60, height: 8, borderRadius: 4, background: "#F1F5F9", overflow: "hidden" }}>
                        <div style={{ width: `${pctPagadoGlobal}%`, height: "100%", background: barColor(pctPagadoGlobal), transition: "width .3s" }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: barColor(pctPagadoGlobal), minWidth: 34, textAlign: "right" }}>{pctPagadoGlobal}%</span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderLifecycleBar = (p, lc) => {
    // Compras que NO pasan por logistica (las trae el proveedor, o son
    // servicios/rentas cerrados sin ficha): la barra se acorta en vez de
    // dejar hitos apagados para siempre.
    const cerradaOk = p.deliveryStatus === "cerrado";
    const phases = [
      { key: "solicitud",  emoji: "📝", label: "Solicitud",      done: true },
      { key: "validado",   emoji: "✅", label: "Validada",       done: ["validado","pagado","finalizado"].includes(p.status) },
      { key: "pagado",     emoji: "💰", label: "Pagada",         done: lc.isPaid },
      { key: "compr",      emoji: "🧾", label: "Comprobante",    done: lc.hasReceipt },
      ...(lc.entregaDirecta || lc.cerradaSinFicha ? [
        { key: "coord",    emoji: "📞", label: "Coordinada Ana", done: true },
        ...(lc.entregaDirecta ? [{ key: "provee", emoji: "🏪", label: "Trae proveedor", done: true }] : []),
        { key: "entreg",   emoji: "📦", label: "Entregada",      done: lc.entregado || cerradaOk },
        ...(lc.cerradaSinFicha
          ? [{ key: "cierre", emoji: "🔒", label: "Cerrada sin ficha", done: true }]
          : [{ key: "ficha", emoji: "📋", label: "Ficha firmada", done: lc.fichaUploaded }]),
      ] : [
        { key: "coord",    emoji: "📞", label: "Coordinada Ana", done: lc.hasDesp },
        { key: "logistica",emoji: "🚛", label: "Logistica",      done: lc.hasVehicle },
        { key: "entreg",   emoji: "📦", label: "Entregada",      done: lc.entregado },
        { key: "ficha",    emoji: "📋", label: "Ficha firmada",  done: lc.fichaUploaded },
      ]),
    ];
    // El "current" es la primera fase NO done
    const currentIdx = phases.findIndex(ph => !ph.done);
    return (
      <div style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "nowrap" }}>
        {phases.map((ph, i) => {
          const isCurrent = i === currentIdx;
          const bg = ph.done ? "#059669" : isCurrent ? "#F59E0B" : "#E2E8F0";
          const color = ph.done || isCurrent ? "#fff" : "#94A3B8";
          return (
            <div key={ph.key} title={`${ph.label}${ph.done ? " ✓" : isCurrent ? " (siguiente)" : " (pendiente)"}`} style={{
              background: bg, color, fontSize: 11, fontWeight: 700,
              width: 24, height: 24, borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: isCurrent ? "2px solid #D97706" : "none",
              transition: "all .15s",
            }}>{ph.emoji}</div>
          );
        })}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SUPPLY CHAIN (24-ago-2026) — reemplaza el viejo "Resumen".
  // Para qué sirve: ver en 5 segundos DÓNDE está parada cada compra, DESDE
  // CUÁNDO, y DE QUIÉN es la pelota. El eje del tiempo es la FECHA DE PAGO
  // (paidAt): es el momento desde el que Gerson tiene que estar encima.
  //
  // Una compra vive en UNA sola etapa. El orden de las reglas define la
  // prioridad (la primera que calza gana):
  //   esperando_pago → por_coordinar → en_logistica → con_proveedor
  //   → falta_ficha → por_cerrar → cerrada
  // ═══════════════════════════════════════════════════════════════════════
  // Semáforo del sistema (3-sep): gris = esperando pago · naranja = acción de
  // Compras · azul = en camino · amarillo = falta un documento · verde = cerrada.
  // `bar` es el color sólido de las barritas segmentadas de las ventanitas.
  const ETAPAS = [
    { k: "esperando_pago", label: "Esperando pago",      ...C_GRIS,     bar: "#B9B3AA", quien: "Lic. Carolina" },
    { k: "por_coordinar",  label: "Por coordinar",       color: "#C75F1F", bg: "rgba(232,118,45,.14)", bar: "#E8762D", quien: "Ana / Compras" },
    { k: "en_logistica",   label: "En logística",        ...C_AZUL,     bar: "#4A86D8", quien: "Logística" },
    { k: "con_proveedor",  label: "Con el proveedor",    ...C_AZUL,     bar: "#8FB4E8", quien: "Ana / Compras" },
    { k: "falta_ficha",    label: "Falta ficha firmada", ...C_AMARILLO, bar: "#E4B94A", quien: "Logística" },
    { k: "por_cerrar",     label: "Por cerrar con conta", ...C_AMARILLO, bar: "#8A5A00", quien: "Responsable de cierre" },
    { k: "cerrada",        label: "Cerrada",             ...C_VERDE_2,  bar: "#3E9E6B", quien: "—" },
  ];
  const ETAPA = Object.fromEntries(ETAPAS.map(e => [e.k, e]));

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPLY CHAIN — v3 (18-sep-2026, pedido de Gerson)
  // ═══════════════════════════════════════════════════════════════════════════
  // La v2 (ventanitas por proyecto + ranking + tabla + 6 filtros) le resultó
  // un desorden: "no dan ganas de ver eso". Lo que él realmente quiere es
  // simple: **el día que la Lic. Carolina paga algo, que le aparezca ahí, bien
  // ordenadito, con su proyecto y en qué etapa del proceso va.**
  //
  // Entonces: lista de compras PAGADAS agrupada POR DÍA DE PAGO (lo más
  // reciente arriba), en tarjetas de vidrio como Prioridades. Filtro de tiempo
  // por SEMANA DE LUNES A DOMINGO (lo que pidió), chips por etapa, buscador.
  // Click en una tarjeta = abre esa solicitud.
  //
  // Se CONSERVA `etapaDe` tal cual (la clasificación auditada contra la data
  // real en ago-2026): esperando_pago → cerrada → por_cerrar → falta_ficha →
  // en_logistica → con_proveedor → por_coordinar. Lo que se retiró es solo la
  // presentación: ventanitas por proyecto, ranking "a quién apurar", tabla y
  // los filtros de rango libre / responsable / orden por atraso.
  const renderSupplyChain = () => {
    // Días entre dos FECHAS (sin horas): paidAt se guarda como medianoche UTC y
    // `new Date()` es hora local, así que comparar timestamps daba un día de
    // más de las 18:00 en adelante — y eso cruzaba los umbrales del semáforo.
    const hoyYMD = new Date().toLocaleDateString("en-CA");   // YYYY-MM-DD local
    const diasDesde = (iso) => {
      const ymd = String(iso || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
      const ms = Date.parse(hoyYMD + "T00:00:00Z") - Date.parse(ymd + "T00:00:00Z");
      return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86400000)) : null;
    };
    // Índice por compra: con 440 compras × 185 despachos, buscar con .find() en
    // cada fila era O(n·m) por render. Se ignoran los CANCELADOS (esa compra
    // volvió a manos de Compras) y, si hay varios, gana el más reciente.
    const despPorCompra = {};
    despachos.forEach(d => {
      if (!d || !d.sourcePurchaseId || d.estado === "cancelado") return;
      const prev = despPorCompra[d.sourcePurchaseId];
      const ts = String(d.updatedAt || d.createdAt || "");
      if (!prev || ts > String(prev.updatedAt || prev.createdAt || "")) despPorCompra[d.sourcePurchaseId] = d;
    });
    const despachoDe = (id) => despPorCompra[id] || null;
    // Quién coordina esta compra: el proyecto MAQUINAS lo lleva Fernando desde
    // GeoMachinery (el kanban de Ana lo excluye), el resto es Compras/Ana.
    const coordinaCompra = (x) => /MAQUINA/i.test(String(x.projectCode || "")) ? "Fernando / Máquinas" : "Ana / Compras";

    // Etapa + "desde cuándo" + responsable concreto de esa etapa. (Sin cambios
    // desde la auditoría de ago-2026 contra las compras reales.)
    const etapaDe = (x) => {
      const d = despachoDe(x.id);
      if (x.status === "borrador") return null;                       // aún no aprobada: no es supply chain
      if (x.status === "validado") return { k: "esperando_pago", desde: x.validatedAt || x.createdAt, quien: "Lic. Carolina" };
      if (yaCerradaConta(x)) return { k: "cerrada", desde: x.conta?.cerradoAt, quien: x.conta?.cerradoPor || "—" };
      const respCierre = x.cierreResponsable || "sin asignar";
      if (x.deliveryStatus === "ficha_adjunta" || x.deliveryStatus === "cerrado") return { k: "por_cerrar", desde: x.delivery?.fichaUploadedAt || x.delivery?.closedAt || x.paidAt, quien: respCierre };
      if (d && (d.estado === "entregado" || d.estado === "cerrado")) return { k: "falta_ficha", desde: d.fechaEjecutada || d.updatedAt, quien: "Logística", detalle: d.motorista || "" };
      if (d) return { k: "en_logistica", desde: d.createdAt || x.paidAt, quien: "Logística", detalle: d.motorista || "" };
      // Materiales ya recibidos en proyecto (o ficha quitada): el pendiente es
      // la ficha, no coordinar de nuevo — si no, el atraso se le cargaba a
      // Compras cuando el material ya está en obra.
      if (x.deliveryStatus === "recibido") return { k: "falta_ficha", desde: x.delivery?.actualDate || x.paidAt, quien: "Logística", detalle: "recibido en proyecto" };
      if (x.deliveryStatus === "entrega_proveedor") return { k: "con_proveedor", desde: x.delivery?.arrivalAt || x.paidAt, quien: coordinaCompra(x), detalle: x.provider };
      return { k: "por_coordinar", desde: x.paidAt || x.paymentDate || x.createdAt, quien: coordinaCompra(x) };
    };

    // ── Semana de LUNES a DOMINGO (pedido explícito) ──
    // Se arma con partes LOCALES: `new Date(ymd)` es medianoche UTC y en
    // Honduras (UTC-6) devolvía el día anterior, corriendo la semana entera.
    const hoyD = new Date(); hoyD.setHours(0, 0, 0, 0);
    const lunesDe = (d) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
    const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const lunEsta = lunesDe(hoyD);
    const domEsta = new Date(lunEsta); domEsta.setDate(domEsta.getDate() + 6);
    const lunPasada = new Date(lunEsta); lunPasada.setDate(lunPasada.getDate() - 7);
    const domPasada = new Date(lunEsta); domPasada.setDate(domPasada.getDate() - 1);
    const RANGOS = {
      semana:   { label: "Esta semana",   desde: ymd(lunEsta),   hasta: ymd(domEsta) },
      anterior: { label: "Semana pasada", desde: ymd(lunPasada), hasta: ymd(domPasada) },
      mes:      { label: "Este mes",      desde: `${hoyD.getFullYear()}-${String(hoyD.getMonth() + 1).padStart(2, "0")}-01`, hasta: `${hoyD.getFullYear()}-${String(hoyD.getMonth() + 1).padStart(2, "0")}-31` },
      todo:     { label: "Todo",          desde: null, hasta: null },
    };
    const rango = RANGOS[scModo] || RANGOS.semana;

    // La fecha que manda acá es la del PAGO (es "el día que Carolina pagó").
    // Las pagadas viejas sin paidAt caen a paymentDate; si no tienen ninguna,
    // van al grupo "Sin fecha de pago" para que no queden invisibles.
    const fpago = (x) => String(x.paidAt || x.paymentDate || "").slice(0, 10);

    const todas = cp.map(x => {
      if (!esPagada(x)) return null;                 // Supply Chain = lo que YA se pagó
      const e = etapaDe(x);
      if (!e) return null;
      return { x, ...e, dias: diasDesde(e.desde), cfg: ETAPA[e.k], pago: fpago(x) };
    }).filter(Boolean);

    const enRango = (r) => !rango.desde || (r.pago && r.pago >= rango.desde && r.pago <= rango.hasta);
    const txt = scQ.trim().toLowerCase();
    const base = todas
      .filter(enRango)
      .filter(r => scVerCerradas || r.k !== "cerrada" || scEtapa === "cerrada")
      .filter(r => !txt || [r.x.codigo, r.x.provider, r.x.description, r.x.projectCode].some(v => String(v || "").toLowerCase().includes(txt)));
    const filas = scEtapa ? base.filter(r => r.k === scEtapa) : base;

    // Agrupado por día de pago, lo más reciente arriba.
    const porDia = {};
    filas.forEach(r => { const k = r.pago || "—"; (porDia[k] = porDia[k] || []).push(r); });
    const dias = Object.keys(porDia).sort((a, b) => (a === "—" ? 1 : b === "—" ? -1 : b.localeCompare(a)));

    const total = base.reduce((s, r) => s + (Number(r.x.amount) || 0), 0);
    const conteoEtapa = {};
    base.forEach(r => { conteoEtapa[r.k] = (conteoEtapa[r.k] || 0) + 1; });

    const fechaLarga = (d) => {
      if (d === "—") return "Sin fecha de pago";
      const [y, m, dd] = d.split("-").map(Number);
      const t = new Date(y, m - 1, dd).toLocaleDateString("es-HN", { weekday: "long", day: "numeric", month: "long" });
      return t.charAt(0).toUpperCase() + t.slice(1);
    };

    const pill = (txt2, activo, onClick, title) => (
      <button key={txt2} onClick={onClick} title={title} aria-pressed={activo} style={{
        padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
        border: activo ? "1px solid transparent" : "1px solid var(--hairline)",
        background: activo ? ORANGE_DARK : "var(--surface)", color: activo ? "#fff" : "var(--text-2)",
        fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
      }}>{txt2}</button>
    );

    const tarjeta = (r) => {
      const c = r.cfg || C_GRIS;
      // Semáforo del tiempo parado EN ESA ETAPA (≤3 al día · 4-7 ojo · +7 apurar)
      const punto = r.k === "cerrada" || r.dias == null ? "#C9C3BA" : r.dias <= 3 ? "#8C857D" : r.dias <= 7 ? "#E4B94A" : ORANGE;
      return <div key={r.x.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0}
        aria-label={`Abrir ${r.x.codigo || r.x.provider}`}
        onClick={() => setModal({ t: "detail", d: r.x })}
        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setModal({ t: "detail", d: r.x }); } }}
        style={{
          padding: isMobile ? "12px 14px" : "13px 18px", cursor: "pointer",
          display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) auto auto",
          alignItems: "center", gap: isMobile ? 9 : 18,
        }}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: "var(--text-3)", letterSpacing: ".02em" }}>{r.x.codigo || "—"}</span>
            <Badge color={cc.color}>{r.x.projectCode}</Badge>
          </div>
          <div style={{ font: "700 13.5px/1.25 var(--sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.x.provider}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.x.description}</div>
        </div>
        {/* Etapa del proceso + de quién depende */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: isMobile ? "flex-start" : "flex-end", gap: 5, minWidth: 0 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 11px", borderRadius: 999, fontSize: 11, fontWeight: 800, color: c.color, background: c.bg, whiteSpace: "nowrap" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: punto, flexShrink: 0 }} />
            {c.label}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--text-3)", whiteSpace: "nowrap" }}>
            {r.quien}{r.dias != null && r.k !== "cerrada" ? ` · ${r.dias}d` : ""}
          </span>
        </div>
        <div style={{ textAlign: isMobile ? "left" : "right", whiteSpace: "nowrap" }}>
          <div style={{ font: "800 16px/1.15 var(--display)", letterSpacing: "-.01em", color: "var(--text)" }}>{fmtL(r.x.amount)}</div>
        </div>
      </div>;
    };

    return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 }}>
      {/* Resumen (21-sep-2026: retirado a pedido de Gerson — "no necesito ese
          cuadrito"). `total`/`dias` quedan calculados por si se retoma. */}

      {/* Filtros: cuándo se pagó · en qué etapa está · buscador */}
      <div className="gt-vidrio" style={{ padding: isMobile ? "10px 14px" : "10px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, minWidth: isMobile ? 58 : 0 }}>Pagadas</span>
          {Object.entries(RANGOS).map(([k, v]) => pill(v.label, scModo === k, () => setScModo(k), v.desde ? `${v.desde} → ${v.hasta}` : "Todas las pagadas"))}
          {rango.desde && <span style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "var(--mono, ui-monospace)" }}>{rango.desde} → {rango.hasta}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, minWidth: isMobile ? 58 : 0 }}>Etapa</span>
          {pill(`Todas (${base.length})`, !scEtapa, () => setScEtapa(""))}
          {ETAPAS.filter(e => e.k !== "esperando_pago" && (conteoEtapa[e.k] || scEtapa === e.k)).map(e =>
            pill(`${e.label} (${conteoEtapa[e.k] || 0})`, scEtapa === e.k, () => setScEtapa(scEtapa === e.k ? "" : e.k)))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={scVerCerradas} onChange={e => { setScVerCerradas(e.target.checked); if (!e.target.checked && scEtapa === "cerrada") setScEtapa(""); }} style={{ accentColor: ORANGE_DARK, cursor: "pointer" }} />
            ver cerradas
          </label>
          <input value={scQ} onChange={e => setScQ(e.target.value)} placeholder="Buscar código, proveedor, material…"
            style={{ flex: "0 1 260px", minWidth: 150, marginLeft: "auto", padding: "6px 11px", border: "1px solid var(--hairline)", borderRadius: 10, fontSize: 12.5, fontFamily: "inherit", outline: "none", background: "var(--surface)" }} />
        </div>
      </div>

      {/* Agrupado por día de pago */}
      {filas.length === 0
        ? <div className="gt-vidrio" style={{ padding: "38px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13.5 }}>
            {scModo === "semana" ? "Todavía no hay pagos esta semana." : "No hay compras pagadas con estos filtros."}
          </div>
        : dias.map(d => {
            const grupo = porDia[d];
            const suma = grupo.reduce((s, r) => s + (Number(r.x.amount) || 0), 0);
            return <div key={d} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 9 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                <span className="gt-label" style={{ color: "var(--text-2)", fontSize: 10.5 }}>{fechaLarga(d)}</span>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{grupo.length} compra{grupo.length === 1 ? "" : "s"}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--naranja-tinta)" }}>{fmtL(suma)}</span>
              </div>
              {grupo.slice().sort((a, b) => (Number(b.x.amount) || 0) - (Number(a.x.amount) || 0)).map(tarjeta)}
            </div>;
          })}
    </div>;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // POR COORDINAR — bandeja de decisión (21-sep-2026, rediseño pedido por Gerson)
  // ═══════════════════════════════════════════════════════════════════════════
  // Antes era un "kanban" por proyecto con scroll horizontal. No era un kanban:
  // de las 4 sub-secciones quedó SOLO `por_coordinar` (las otras tres viven en
  // sus propias pestañas), así que eran 60 tarjetas TODAS en el mismo estado,
  // repartidas en 14 columnas que no caben en pantalla, y cada una repetía los
  // mismos 4 botones grandes a todo color (~240 botones). Gerson: "qué relajo
  // visual, no dan ganas de ver eso".
  //
  // Lo que Ana hace acá es TRIAGE: por cada compra que pagó la Lic. Carolina
  // elige UNA de tres salidas. Eso pide una bandeja, no un tablero:
  //   · Una sola columna (cero scroll horizontal), AGRUPADA POR PROYECTO
  //     (pedido explícito: "visualizar todo en orden por proyecto cada pago
  //     que hace la Lic. Carolina").
  //   · Dentro de cada proyecto, primero la que MÁS lleva esperando; y los
  //     proyectos se ordenan por su compra más vieja — lo urgente sube solo.
  //   · Toggle a vista plana "Lo que más espera" para cuando importa la cola.
  //   · Las 3 salidas como botones chicos; la ficha PDF y el teléfono quedan
  //     discretos (se usan poco y competían con la decisión).
  // El banner amarillo de "Flujo" se retiró: los botones ya lo dicen.
  const renderAnaKanban = () => {
    const despachoDe = (purchaseId) => despachos.find(d => d.sourcePurchaseId === purchaseId);

    // Clasificación (SIN CAMBIOS — la lógica auditada en ago-2026).
    // Solo interesa `por_coordinar`; el resto alimenta los accesos directos.
    const clasificar = (p) => {
      if (p.status !== "pagado" && p.status !== "finalizado") return null;
      // El proyecto MAQUINAS lo coordina Fernando desde GeoMachinery — a Ana
      // no le corresponde (20-ago-2026). Los demás roles sí lo siguen viendo.
      if (isAsistenteCompras && String(p.projectCode || "").toUpperCase().includes("MAQUINA")) return null;
      if (yaCerradaConta(p)) return null;                       // vive en "Cerradas"
      if (p.deliveryStatus === "ficha_adjunta" || p.deliveryStatus === "cerrado") return "listas";
      if (p.deliveryStatus === "entrega_proveedor") return "entrega_directa";
      const d = despachoDe(p.id);
      if (d && (d.estado === "pendiente" || d.estado === "programado" || d.estado === "en_ruta" || d.estado === "entregado")) return "en_logistica";
      return "por_coordinar";
    };

    // Días desde el pago (solo FECHAS: paidAt es medianoche UTC y comparar
    // timestamps con hora local daba un día de más de las 18:00 en adelante).
    const hoyL = new Date().toLocaleDateString("en-CA");
    const diasDesdePago = (p) => {
      const y = String(p.paidAt || p.paymentDate || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(y)) return null;
      return Math.max(0, Math.floor((Date.parse(hoyL + "T00:00:00Z") - Date.parse(y + "T00:00:00Z")) / 86400000));
    };

    const totales = { por_coordinar: 0, entrega_directa: 0, en_logistica: 0, listas: 0 };
    const todas = [];
    cp.forEach(p => {
      const b = clasificar(p);
      if (!b) return;
      totales[b]++;
      if (b === "por_coordinar") todas.push(p);
    });

    const mesesDisponibles = [...new Set(todas.map(p => String(p.paidAt || p.paymentDate || "").slice(0, 7)).filter(Boolean))].sort().reverse();
    // Proyectos del selector: con su conteo, alfabéticos. Se calculan ANTES
    // del filtro de proyecto (si no, al elegir uno desaparecerían los demás).
    const proyectosDisponibles = (() => {
      const m = {};
      todas
        .filter(p => !coordMes || String(p.paidAt || p.paymentDate || "").slice(0, 7) === coordMes)
        .forEach(p => { const k = p.projectCode || "SIN PROYECTO"; m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }));
    })();
    const txt = coordQ.trim().toLowerCase();
    const filas = todas
      .filter(p => !coordMes || String(p.paidAt || p.paymentDate || "").slice(0, 7) === coordMes)
      .filter(p => !coordProy || (p.projectCode || "SIN PROYECTO") === coordProy)
      .filter(p => !txt || [p.codigo, p.provider, p.description, p.projectCode].some(v => String(v || "").toLowerCase().includes(txt)));

    const monto = filas.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const masVieja = filas.reduce((mx, p) => Math.max(mx, diasDesdePago(p) ?? 0), 0);

    // La que más espera primero (sin fecha de pago al final: no se puede medir).
    const porEspera = (a, b) => {
      const da = diasDesdePago(a), db = diasDesdePago(b);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return db - da;
    };

    // Agrupado por proyecto; los proyectos se ordenan por su compra MÁS VIEJA.
    const grupos = (() => {
      const m = {};
      filas.forEach(p => { const k = p.projectCode || "SIN PROYECTO"; (m[k] = m[k] || []).push(p); });
      return Object.entries(m)
        .map(([proyecto, items]) => {
          // Solo a Ana (21-sep-2026, pedido de Gerson: "solo a Ana, porque es
          // ella quien usa ese apartado") — si no, a cualquiera que abriera
          // esta pestaña (Gerson, Christian) le salía su propio "!", cuando el
          // aviso es para quien de verdad tiene que coordinar la salida.
          const desde = isAsistenteCompras ? coordVisto?.[proyecto] : null;
          const nuevos = desde ? items.filter(p => horaPagada(p) > desde).length : 0;
          return {
            proyecto,
            items: items.slice().sort(porEspera),
            monto: items.reduce((s, p) => s + (Number(p.amount) || 0), 0),
            espera: items.reduce((mx, p) => Math.max(mx, diasDesdePago(p) ?? 0), 0),
            nuevos,
          };
        })
        // Con pago nuevo primero: es lo que Ana tiene que revisar YA.
        .sort((a, b) => (b.nuevos > 0) - (a.nuevos > 0) || b.espera - a.espera || b.items.length - a.items.length || a.proyecto.localeCompare(b.proyecto));
    })();
    // Con un proyecto filtrado se abre solo: filtrar a uno y verlo cerrado no
    // tendría sentido. Si no, manda lo que el usuario dejó abierto.
    const estaAbierto = (proy) => !!coordProy || coordAbiertos.includes(proy);
    const todosAbiertos = grupos.length > 0 && grupos.every(g => coordAbiertos.includes(g.proyecto));
    const toggleGrupo = (proy) => {
      const abriendo = !coordAbiertos.includes(proy);
      abrirCoord(abriendo ? [...coordAbiertos, proy] : coordAbiertos.filter(x => x !== proy));
      if (abriendo) marcarVisto(proy);   // al abrirlo, Ana ya lo vio
    };

    const pill = (t, activo, onClick, title) => (
      <button key={t} onClick={onClick} title={title} aria-pressed={activo} style={{
        padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
        border: activo ? "1px solid transparent" : "1px solid var(--hairline)",
        background: activo ? ORANGE_DARK : "var(--surface)", color: activo ? "#fff" : "var(--text-2)",
        fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap",
      }}>{t}</button>
    );

    // Botón de SALIDA: chico, sin emoji, con el color que le toca en la paleta.
    const salida = (txt2, onClick, tono, title) => (
      <button onClick={onClick} title={title} style={{
        padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
        border: tono.borde ? `1px solid ${tono.borde}` : "1px solid transparent",
        background: tono.bg, color: tono.color, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
      }}>{txt2}</button>
    );
    const T_LOG  = { bg: ORANGE, color: "#fff" };                                        // la salida principal
    const T_PROV = { bg: C_AZUL.bg, color: C_AZUL.color, borde: "rgba(29,95,175,.22)" };
    const T_SIN  = { bg: "var(--surface)", color: "var(--text-3)", borde: "var(--hairline)" };

    const tarjeta = (p) => {
      const prov = findProviderByName(p.provider);
      const dias = diasDesdePago(p);
      const tel = prov?.phones?.[0];
      const desdeProy = isAsistenteCompras ? coordVisto?.[p.projectCode || "SIN PROYECTO"] : null;
      const esNueva = !!desdeProy && horaPagada(p) > desdeProy;
      return <div key={p.id} className="gt-vidrio" style={{
        padding: isMobile ? "13px 14px" : "14px 18px",
        display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) auto",
        gap: isMobile ? 12 : 18, alignItems: "center",
        background: esNueva ? C_ULTRA.bg : undefined, borderColor: esNueva ? C_ULTRA.borde : undefined,
      }}>
        {/* Qué es */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {esNueva && <span style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, fontSize: 10, fontWeight: 800, color: C_ULTRA.color, background: "#fff" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 13, height: 13, borderRadius: "50%", background: ORANGE, color: "#fff", fontSize: 9, fontWeight: 900 }}>!</span>
            Pago nuevo
          </span>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: "var(--text-3)", letterSpacing: ".02em" }}>{p.codigo || "—"}</span>
            {dias != null && <span style={{ fontSize: 10.5, color: dias > 7 ? "var(--naranja-tinta)" : "var(--text-3)", fontWeight: dias > 7 ? 800 : 500 }}>
              pagada hace {dias} d
            </span>}
            <span style={{ marginLeft: "auto", font: "800 15px/1 var(--display)", letterSpacing: "-.01em", color: "var(--text)" }}>{fmtL(p.amount)}</span>
          </div>
          <div style={{ font: "700 13.5px/1.25 var(--sans)", color: "var(--text)", wordBreak: "break-word" }}>{p.provider}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.description}</div>
          {/* Contacto + ficha: discretos, se usan poco */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
            {tel
              ? <a href={`tel:${tel}`} style={{ fontSize: 11, color: C_AZUL.color, textDecoration: "none", fontWeight: 700 }}>{prov.contactName ? `${prov.contactName} · ` : ""}{tel}</a>
              : <button onClick={() => setSec("providers")} style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--text-faint)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Sin contacto — agregar</button>}
            <button onClick={async () => { try { await generateFichaPDF(p, getProject(p.projectCode), COMPANIES[p.company]?.name); } catch (err) { if (!err?.isStaleChunk) alert("No se pudo generar la ficha: " + (err?.message || err)); } }}
              style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--text-3)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Ficha de entrega</button>
            <button onClick={() => setModal({ t: "detail", d: p })}
              style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--text-3)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Ver solicitud</button>
            {puedeBorrarSolicitud && <>
              <button onClick={() => setRez({ modo: "una", purchase: p, quien: "", otro: "", nota: "" })} title="Cerrar contablemente (rezagada del flujo anterior)"
                style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--text-faint)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Cerrar rezagada</button>
              <button onClick={() => borrarSolicitudCompleta(p)} title="Borrar esta solicitud por completo"
                style={{ background: "none", border: "none", padding: 0, fontSize: 11, color: "var(--text-faint)", cursor: "pointer", fontFamily: "inherit" }}>🗑</button>
            </>}
          </div>
        </div>
        {/* La decisión: una de tres */}
        {canSendToLogistics && <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: isMobile ? "flex-start" : "flex-end", flexShrink: 0 }}>
          {salida("Logística", () => setModal({ t: "send-pickup", d: p }), T_LOG, "Nosotros la vamos a traer — se crea la orden de recogida")}
          {salida("Proveedor", () => setModal({ t: "entrega-directa", d: p }), T_PROV, "El proveedor la lleva al proyecto")}
          {salida("Sin ficha", () => cerrarSinFicha(p), T_SIN, "Rentas, servicios y pagos que no llevan ficha de recibido")}
        </div>}
      </div>;
    };

    return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 }}>
      {/* Resumen + accesos a las fases siguientes */}
      <div className="gt-vidrio" style={{ padding: "11px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 0, flexWrap: "wrap" }}>
        {[
          { v: filas.length, l: "por coordinar", c: "var(--naranja-tinta)" },
          { v: fmtL(monto), l: "en decisión" },
          { v: grupos.length, l: "proyectos" },
          { v: masVieja ? `${masVieja} d` : "—", l: "la que más espera", c: masVieja > 7 ? C_ROJO.color : undefined },
          { v: totales.entrega_directa, l: "con el proveedor →", go: "entregas" },
          { v: totales.en_logistica + totales.listas, l: "por cerrar contable →", go: "conta" },
        ].map((x, i, arr) => (
          // En móvil van 2 por fila (45 %): con 3 el monto largo se pegaba al
          // número vecino, y el nowrap lo hacía desbordar.
          <div key={x.l} onClick={x.go ? () => setSec(x.go) : undefined}
            style={{ display: "flex", alignItems: "center", flex: isMobile ? "1 1 45%" : 1, minWidth: 0, cursor: x.go ? "pointer" : "default" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "800 clamp(15px,1.3vw,19px)/1.15 var(--display)", letterSpacing: "-.01em", color: x.c || "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.v}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2, fontSize: 9 }}>{x.l}</div>
            </div>
            {!isMobile && i < arr.length - 1 && <div style={{ width: 1, alignSelf: "stretch", background: "var(--hairline)", margin: "0 18px 0 auto" }} />}
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="gt-vidrio" style={{ padding: isMobile ? "10px 14px" : "10px 16px", display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, minWidth: isMobile ? 48 : 0 }}>Ver</span>
          {pill("Por proyecto", coordVista === "proyecto", () => setCoordVista("proyecto"), "Agrupadas por proyecto, el más atrasado arriba")}
          {pill("Lo que más espera", coordVista === "espera", () => setCoordVista("espera"), "Todas en una cola, la más vieja primero")}
          {/* Compactar / expandir todo (solo aplica agrupado por proyecto) */}
          {coordVista === "proyecto" && grupos.length > 1 && (
            todosAbiertos
              ? pill("Compactar todo", false, () => abrirCoord([]), "Dejar solo la fila de cada proyecto")
              : pill("Expandir todo", false, () => {
                  abrirCoord(grupos.map(g => g.proyecto));
                  const ahora = new Date().toISOString();
                  setCoordVisto({ ...(coordVisto || {}), ...Object.fromEntries(grupos.map(g => [g.proyecto, ahora])) });
                }, "Abrir todos los proyectos")
          )}
          <input value={coordQ} onChange={e => setCoordQ(e.target.value)} placeholder="Buscar código, proveedor, material…"
            style={{ flex: "0 1 250px", minWidth: 150, marginLeft: "auto", padding: "6px 11px", border: "1px solid var(--hairline)", borderRadius: 10, fontSize: 12.5, fontFamily: "inherit", outline: "none", background: "var(--surface)" }} />
        </div>
        {/* Filtro por PROYECTO */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, minWidth: isMobile ? 48 : 0 }}>Proyecto</span>
          <select value={coordProy} onChange={e => { setCoordProy(e.target.value); if (e.target.value) marcarVisto(e.target.value); }}
            style={{ padding: "6px 11px", border: "1px solid var(--hairline)", borderRadius: 10, fontSize: 12.5, fontFamily: "inherit", background: coordProy ? "rgba(232,118,45,.08)" : "var(--surface)", fontWeight: coordProy ? 700 : 400, color: "var(--text-2)", maxWidth: "100%" }}>
            <option value="">Todos los proyectos</option>
            {proyectosDisponibles.map(([nombre, n]) => <option key={nombre} value={nombre}>{nombre} ({n})</option>)}
          </select>
          {(coordProy || coordMes || coordQ) && <Btn small variant="ghost" onClick={() => { setCoordProy(""); setCoordMes(""); setCoordQ(""); }}>Limpiar</Btn>}
        </div>
        {mesesDisponibles.length > 1 && <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, minWidth: isMobile ? 48 : 0 }}>Pagadas</span>
          {pill("Todas", !coordMes, () => setCoordMes(""))}
          {mesesDisponibles.map(m => {
            const [yy, mm] = m.split("-").map(Number);
            const lbl = new Date(yy, mm - 1, 1).toLocaleDateString("es-HN", { month: "short", year: "2-digit" });
            return pill(lbl.charAt(0).toUpperCase() + lbl.slice(1), coordMes === m, () => setCoordMes(m === coordMes ? "" : m));
          })}
        </div>}
      </div>

      {/* La bandeja */}
      {filas.length === 0
        ? <div className="gt-vidrio" style={{ padding: "44px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
            {todas.length === 0 ? "Nada por coordinar. Cuando la Lic. Carolina pague una solicitud, cae acá." : "Nada con estos filtros."}
          </div>
        : coordVista === "espera"
          ? <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 9 }}>{filas.slice().sort(porEspera).map(tarjeta)}</div>
          : grupos.map(g => {
            const abierto = estaAbierto(g.proyecto);
            return <div key={g.proyecto} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 9 }}>
              {/* Fila del proyecto: compacta se lee como índice; click abre */}
              <div className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0} aria-expanded={abierto}
                aria-label={`${abierto ? "Compactar" : "Abrir"} ${g.proyecto}${g.nuevos ? ` — ${g.nuevos} pago(s) nuevo(s) sin ver` : ""}`}
                onClick={() => toggleGrupo(g.proyecto)}
                onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggleGrupo(g.proyecto); } }}
                style={{ padding: isMobile ? "11px 14px" : "11px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: g.nuevos ? C_ULTRA.bg : abierto ? "rgba(232,118,45,.05)" : undefined, border: g.nuevos ? `1px solid ${C_ULTRA.borde}` : undefined }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                  style={{ color: "var(--text-3)", flexShrink: 0, transform: abierto ? "rotate(90deg)" : "none", transition: "transform .18s var(--curva)" }}><path d="M9 18l6-6-6-6" /></svg>
                {/* Pago nuevo que Ana no ha visto (21-sep-2026, pedido de Gerson):
                    "!" naranja al lado del proyecto. Se apaga solo al abrirlo. */}
                {g.nuevos > 0 && <span title={`${g.nuevos} pago${g.nuevos === 1 ? "" : "s"} nuevo${g.nuevos === 1 ? "" : "s"} de Tesorería`}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: ORANGE, color: "#fff", fontSize: 11, fontWeight: 900, flexShrink: 0 }}>!</span>}
                <span style={{ font: "800 13px/1.2 var(--sans)", color: "var(--text)", letterSpacing: ".01em", minWidth: 0, wordBreak: "break-word" }}>{g.proyecto}</span>
                <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>{g.items.length} por coordinar</span>
                {g.nuevos > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: C_ULTRA.color, whiteSpace: "nowrap" }}>{g.nuevos} nuevo{g.nuevos === 1 ? "" : "s"}</span>}
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {g.espera > 7 && <span style={{ fontSize: 10.5, fontWeight: 800, color: C_ROJO.color, whiteSpace: "nowrap" }}>la más vieja, {g.espera} d</span>}
                  <span style={{ font: "800 14px/1 var(--display)", color: "var(--naranja-tinta)", whiteSpace: "nowrap" }}>{fmtL(g.monto)}</span>
                </span>
              </div>
              {abierto && g.items.map(tarjeta)}
            </div>;
          })}
    </div>;
  };

  const renderEntregasProveedor = () => {
    const activas = cp.filter(p => (p.status === "pagado" || p.status === "finalizado") && p.deliveryStatus === "entrega_proveedor" && !yaCerradaConta(p));
    const grupos = {};
    activas.forEach(p => { const k = p.projectCode || "__sin__"; (grupos[k] = grupos[k] || []).push(p); });
    const keys = Object.keys(grupos).sort((a, b) => (a === "__sin__" ? 1 : b === "__sin__" ? -1 : a.localeCompare(b)));
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#CCFBF1", border: "1px solid #5EEAD4", borderRadius: 12, padding: 14, fontSize: 13, color: "#134E4A" }}>
        🏪 <b>Entregas de proveedor:</b> el proveedor lleva el producto directo al proyecto. Tu responsabilidad: descargá la <b>ficha en blanco</b>, mandásela al ingeniero que recibe, y cuando te la devuelva <b>firmada</b> la subís acá — la compra pasa sola a <b>Por cerrar contablemente</b>. Si el proveedor no cumple, "🚛 No la entrega" la devuelve a Por coordinar.
      </div>
      {keys.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 60, textAlign: "center", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: CHARCOAL, marginBottom: 4 }}>Sin entregas de proveedor pendientes</div>
            <div style={{ fontSize: 13 }}>Cuando marqués "La entrega el proveedor" en Por coordinar, la compra aparece acá hasta que subás la ficha firmada.</div>
          </div>
        : keys.map(key => <div key={key} style={{ background: "#F8F2E6", borderRadius: 12, padding: 14, border: "1px solid #E8E1D3" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: 0.5, borderBottom: "3px solid #0F766E", paddingBottom: 8, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>{key === "__sin__" ? "SIN PROYECTO" : key}</span><Badge color="#0F766E">{grupos[key].length}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
              {grupos[key]
                .sort((a, b) => (a.delivery?.arrivalAt || "").localeCompare(b.delivery?.arrivalAt || ""))
                .map(p => {
                  const llega = p.delivery?.arrivalAt ? new Date(p.delivery.arrivalAt) : null;
                  const atrasada = llega && llega < new Date();
                  return <div key={p.id} style={{ background: "#fff", border: `1px solid ${atrasada ? "#FCD34D" : "#5EEAD4"}`, borderLeft: `3px solid ${atrasada ? "#B45309" : "#0F766E"}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Badge color={atrasada ? "#B45309" : "#0F766E"}>{atrasada ? "⚠ Debió llegar" : "🏪 Llega directo"}</Badge>
                      {puedeBorrarSolicitud && <span style={{ display: "flex", gap: 6, marginLeft: "auto", marginRight: 6 }}>
                        <span role="button" title="Cerrar contablemente (rezagada del flujo anterior)" onClick={() => setRez({ modo: "una", purchase: p, quien: "", otro: "", nota: "" })} style={{ cursor: "pointer", fontSize: 12, opacity: 0.6 }}>✅</span>
                        <span role="button" title="Borrar esta solicitud por completo (solo vos)" onClick={() => borrarSolicitudCompleta(p)} style={{ cursor: "pointer", fontSize: 12, opacity: 0.45 }}>🗑</span>
                      </span>}
                      {llega && <span style={{ fontSize: 10, color: "#64748b", fontWeight: 700 }}>📅 {llega.toLocaleDateString("es-HN", { day: "2-digit", month: "short" })} · {llega.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}</span>}
                    </div>
                    {p.codigo && <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", fontFamily: "ui-monospace, Menlo, monospace", marginTop: 5 }}>{p.codigo}</div>}
                    <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginTop: 2 }}>{p.provider}</div>
                    <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>{p.description}</div>
                    {p.amount && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginTop: 4 }}>L {Number(p.amount).toLocaleString("es-HN", { minimumFractionDigits: 2 })}</div>}
                    {p.cierreResponsable && <div style={{ fontSize: 10.5, color: "#0F766E", marginTop: 3 }}>🧾 Cierra con conta: <b>{p.cierreResponsable}</b></div>}
                    {(p.delivery?.arrivalContacto || p.delivery?.arrivalNotas) && <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 4, paddingTop: 4, borderTop: "1px dashed #E2E8F0" }}>{[p.delivery?.arrivalContacto ? `👤 ${p.delivery.arrivalContacto}` : "", p.delivery?.arrivalNotas || ""].filter(Boolean).join(" · ")}</div>}
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      <button onClick={async () => { try { await generateFichaPDF(p, getProject(p.projectCode), COMPANIES[p.company]?.name); } catch (e) { if (!e?.isStaleChunk) alert("No se pudo: " + e.message); } }} style={{ background: "transparent", color: CHARCOAL, border: "1px solid #CBD5E1", padding: "6px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>📄 Descargar ficha en blanco (mandala al ingeniero)</button>
                      {canSendToLogistics && <>
                        <input type="file" accept=".pdf,image/*" id={`entrega-ficha-${p.id}`} style={{ display: "none" }}
                          onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ""; const ok = await uploadFichaFromCard(p, f); if (ok) alert("✓ Ficha firmada subida.\nLa compra pasó a Por cerrar contablemente."); }} />
                        <label htmlFor={`entrega-ficha-${p.id}`} style={{ background: "#0F766E", color: "#fff", padding: "7px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", display: "block" }}>📎 Subir ficha FIRMADA por el ingeniero</label>
                        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
                          <button onClick={() => setModal({ t: "entrega-directa", d: p })} style={{ background: "none", border: "none", color: "#0891B2", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>✏️ Cambiar fecha/hora</button>
                          <button onClick={() => revertirEntregaDirecta(p)} style={{ background: "none", border: "none", color: "#B45309", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>🚛 No la entrega</button>
                        </div>
                      </>}
                    </div>
                  </div>;
                })}
            </div>
          </div>)}
    </div>;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // POR CERRAR CONTABLEMENTE (ago 2026) — todo lo que ya salió de coordinación
  // y todavía no tiene el paquete de cierre subido. La regla del cierre: se
  // considera cerrada SOLO cuando Ana sube el paquete digitalizado que le
  // devuelve Contabilidad. Los badges dicen exactamente qué falta y de quién.
  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // CERRADAS CONTABLEMENTE (19-ago-2026) — archivo ordenado de todo lo que ya
  // cerró, con filtros por MES de cierre y por PROYECTO. Se separó de "Por
  // cerrar" para que ese tablero quede solo con lo pendiente.
  // ─────────────────────────────────────────────────────────────────────────
  const renderCerradas = () => {
    const esCerrada = (p) => yaCerradaConta(p);
    const todas = cp.filter(esCerrada);
    const mesDeCierre = (p) => String(p.conta?.cerradoAt || "").slice(0, 7);
    const meses = [...new Set(todas.map(mesDeCierre).filter(Boolean))].sort().reverse();
    const proyectos = [...new Set(todas.map(p => p.projectCode || "SIN PROYECTO"))].sort();
    const lista = todas
      .filter(p => !cerrMes || mesDeCierre(p) === cerrMes)
      .filter(p => !cerrProy || (p.projectCode || "SIN PROYECTO") === cerrProy)
      .filter(p => {
        if (!cerrQ.trim()) return true;
        const t = cerrQ.trim().toLowerCase();
        return [p.codigo, p.provider, p.description, p.projectCode].some(v => String(v || "").toLowerCase().includes(t));
      })
      .sort((a, b) => String(b.conta?.cerradoAt || "").localeCompare(String(a.conta?.cerradoAt || "")));
    const total = lista.reduce((sm, p) => sm + (Number(p.amount) || 0), 0);
    const verArchivo = async (ref) => {
      if (!ref?.fileId) return alert("Sin archivo adjunto.");
      try {
        const full = await store.get(fileKey(ref.fileId));
        if (!full?.dataUrl) return alert("No se pudo cargar el archivo.");
        setVisor({ ...full, name: full.name || ref.name }); // visor en la app (10-sep-2026)
      } catch (e) { alert("Error: " + e.message); }
    };
    const mesLabel = (m) => { const [y2, m2] = m.split("-").map(Number); const t = new Date(y2, m2 - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#DCFCE7", border: "1px solid #6EE7B7", borderRadius: 12, padding: 14, fontSize: 13, color: "#065F46" }}>
        ✅ <b>Archivo de compras cerradas contablemente.</b> Acá queda todo lo que ya se entregó a Contabilidad con su factura. Filtrá por mes de cierre o por proyecto para consultarlas.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Mes de cierre</label>
          <select value={cerrMes} onChange={e => setCerrMes(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "inherit" }}>
            <option value="">Todos los meses</option>
            {meses.map(m => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Proyecto</label>
          <select value={cerrProy} onChange={e => setCerrProy(e.target.value)} style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "inherit", minWidth: 180 }}>
            <option value="">Todos los proyectos</option>
            {proyectos.map(pr2 => <option key={pr2} value={pr2}>{pr2}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>Buscar</label>
          <input value={cerrQ} onChange={e => setCerrQ(e.target.value)} placeholder="Código, proveedor o descripción…" style={{ padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
        </div>
        {(cerrMes || cerrProy || cerrQ) && <Btn small variant="ghost" onClick={() => { setCerrMes(""); setCerrProy(""); setCerrQ(""); }}>Limpiar</Btn>}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 18px", minWidth: 160 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>{lista.length}</div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Compras cerradas</div>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 18px", minWidth: 180 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: CHARCOAL }}>{fmtL(total)}</div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Monto cerrado</div>
        </div>
      </div>
      {lista.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 50, textAlign: "center", color: "#94A3B8" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗂️</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: CHARCOAL }}>{todas.length === 0 ? "Todavía no hay compras cerradas contablemente" : "Ninguna coincide con el filtro"}</div>
          </div>
        : <div style={{ overflowX: "auto", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr style={{ background: "#F1F5F9" }}>
                {["Código", "Cerrada", "Proyecto", "Proveedor", "Descripción", "Monto", "Cerró", "Documentos"].map(h => (
                  <th key={h} style={{ textAlign: h === "Monto" ? "right" : "left", padding: "9px 12px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>))}
              </tr></thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id} style={{ borderTop: "1px solid #F1F5F9" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 800, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, color: CHARCOAL, whiteSpace: "nowrap" }}>{p.codigo || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{p.conta?.cerradoAt ? new Date(p.conta.cerradoAt).toLocaleDateString("es-HN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{p.projectCode || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{p.provider}</td>
                    <td style={{ padding: "8px 12px", color: "#475569", maxWidth: 300 }}>{String(p.description || "").slice(0, 90)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#059669", whiteSpace: "nowrap" }}>{fmtL(p.amount)}</td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>{p.conta?.cerradoPor || "—"}</td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {p.conta?.facturaFile?.fileId && <Btn small variant="ghost" onClick={() => verArchivo(p.conta.facturaFile)}>🧾 Factura</Btn>}
                        {p.conta?.fileId && <Btn small variant="ghost" onClick={() => verArchivo({ fileId: p.conta.fileId, type: p.conta.type })}>📦 Paquete</Btn>}
                        <Btn small variant="ghost" onClick={() => imprimirPaqueteConta(p)}>📥 PDF</Btn>
                        {(isAdmin || isAsistenteCompras) && <Btn small variant="danger" onClick={() => reabrirCierreConta(p)}>↩</Btn>}
                        {puedeBorrarSolicitud && <Btn small variant="danger" onClick={() => borrarSolicitudCompleta(p)}>🗑</Btn>}
                      </div>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>}
    </div>;
  };

  const renderConta = () => {
    const despachoDe = (purchaseId) => despachos.find(d => d.sourcePurchaseId === purchaseId);
    // Entra a esta vista: pagada/finalizada que ya tiene un CAMINO decidido
    // (despacho de logística, entrega del proveedor, ficha adjunta o cerrada
    // sin ficha). Las que siguen sin decidir viven en Por coordinar.
    const clasificar = (p) => {
      if (p.status !== "pagado" && p.status !== "finalizado") return null;
      if (yaCerradaConta(p)) return "cerrada";
      if (p.deliveryStatus === "ficha_adjunta") return "lista";
      if (p.deliveryStatus === "cerrado") return "lista"; // sin ficha (servicio/renta)
      if (p.deliveryStatus === "entrega_proveedor") return "falta_proveedor";
      const d = despachoDe(p.id);
      if (d) return (d.estado === "entregado" || d.estado === "cerrado") ? "falta_logistica" : "en_camino";
      return null; // sin camino decidido → sigue en Por coordinar
    };
    // ── FILTRO POR RESPONSABLE (20-ago-2026, pedido de Gerson) ──
    // Cada quien ve SUS compras por cerrar (cierreResponsable === su nombre)
    // más las SIN ASIGNAR (para que nada quede invisible hasta asignarlas).
    // Los supervisores ven todas, con un selector para filtrar.
    const esSupervisorConta = isAdmin || isGerencia || isVisorCompras;
    const paraMi = (z) => esSupervisorConta
      ? (!contaResp || (contaResp === "__sin__" ? !z.cierreResponsable : z.cierreResponsable === contaResp))
      : (!z.cierreResponsable || z.cierreResponsable === userName);
    const RESP_OPCIONES = [...new Set(USERS.map(u2 => u2.label))].sort();
    // Meses disponibles (con algo por cerrar o cerrado), para el selector.
    const mesDe = (x) => String(x.paidAt || x.createdAt || "").slice(0, 7);
    const mesesDisponibles = [...new Set(cp.filter(x => clasificar(x)).map(mesDe).filter(Boolean))].sort().reverse();
    const enMes = (x) => !contaMes || mesDe(x) === contaMes;
    const grupos = {}; const totales = { lista: 0, falta_logistica: 0, falta_proveedor: 0, en_camino: 0, cerrada: 0 };
    cp.filter(enMes).filter(paraMi).forEach(p => { const b = clasificar(p); if (!b) return; const k = p.projectCode || "__sin__"; (grupos[k] = grupos[k] || { lista: [], falta_logistica: [], falta_proveedor: [], en_camino: [], cerrada: [] })[b].push(p); totales[b]++; });
    const abiertas = totales.lista + totales.falta_logistica + totales.falta_proveedor + totales.en_camino;
    const keys = Object.keys(grupos).filter(k => grupos[k].lista.length + grupos[k].falta_logistica.length + grupos[k].falta_proveedor.length + grupos[k].en_camino.length > 0)
      .sort((a, b) => (a === "__sin__" ? 1 : b === "__sin__" ? -1 : a.localeCompare(b)));
    const cerradas = cp.filter(enMes).filter(paraMi).filter(p => clasificar(p) === "cerrada").sort((a, b) => String(b.conta?.cerradoAt || "").localeCompare(String(a.conta?.cerradoAt || "")));
    const verCerradas = anaExpand["conta-cerradas"] === true;
    const puedeCerrarConta = isAdmin || isAsistenteCompras || isCostos;

    const cardConta = (p, tipo) => {
      const d = despachoDe(p.id);
      const cfg = {
        lista:           { badge: p.deliveryStatus === "cerrado" && !p.delivery?.fichaFile ? "🔒 Sin ficha (servicio/renta) — lista" : "✓ Ficha lista — armar paquete", c: "#059669", border: "#6EE7B7" },
        falta_logistica: { badge: "⚠ SIN FICHA de recibido — LOGÍSTICA debe subirla", c: "#DC2626", border: "#FCA5A5" },
        falta_proveedor: { badge: "🏪 Falta ficha firmada (la entrega el proveedor)", c: "#B45309", border: "#FCD34D" },
        en_camino:       { badge: `🚚 Con Logística (${d?.estado || "pendiente"})`, c: "#0891B2", border: "#BAE6FD" },
      }[tipo];
      return <div key={p.id} style={{ background: "#fff", border: `1px solid ${cfg.border}`, borderLeft: `3px solid ${cfg.c}`, borderRadius: 8, padding: 12, position: "relative" }}>
        {puedeBorrarSolicitud && <span style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, lineHeight: 1 }}>
          <span role="button" title="Cerrar contablemente esta rezagada del flujo anterior (solo vos)" onClick={() => setRez({ modo: "una", purchase: p, quien: "", otro: "", nota: "" })} style={{ cursor: "pointer", fontSize: 12, opacity: 0.6 }}>✅</span>
          <span role="button" title="Borrar esta solicitud por completo (solo vos)" onClick={() => borrarSolicitudCompleta(p)} style={{ cursor: "pointer", fontSize: 12, opacity: 0.45 }}>🗑</span>
        </span>}
        <span style={{ display: "inline-block", background: cfg.c + "18", color: cfg.c, padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>{cfg.badge}</span>
        {p.codigo && <div style={{ fontSize: 10.5, fontWeight: 800, color: "#64748b", fontFamily: "ui-monospace, Menlo, monospace", marginTop: 5 }}>{p.codigo}</div>}
        <div style={{ fontSize: 13, fontWeight: 800, color: CHARCOAL, marginTop: 2 }}>{p.provider}</div>
        <div style={{ fontSize: 11.5, color: "#475569", marginTop: 2, lineHeight: 1.4 }}>{p.description}</div>
        {p.amount && <div style={{ fontSize: 11, color: "#059669", fontWeight: 700, marginTop: 4 }}>L {Number(p.amount).toLocaleString("es-HN", { minimumFractionDigits: 2 })}</div>}
        <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
          <span style={{ fontSize: 10.5, color: "#64748b", whiteSpace: "nowrap" }}>🧾 Cierra:</span>
          <select value={p.cierreResponsable || ""}
            onChange={async (e) => {
              const v = e.target.value;
              const saved = addAudit({ ...p, cierreResponsable: v }, "cierre_responsable", v ? `Responsable de cierre contable: ${v}` : "Responsable de cierre contable quitado");
              const ok = await updatePurchase(saved);
              if (!ok) alert("⚠️ No se pudo guardar el responsable — reintentá.");
            }}
            style={{ flex: 1, minWidth: 0, padding: "3px 6px", border: `1px solid ${p.cierreResponsable ? "#5EEAD4" : "#FCD34D"}`, borderRadius: 6, fontSize: 10.5, fontWeight: 700, color: p.cierreResponsable ? "#0F766E" : "#B45309", background: "#fff", fontFamily: "inherit", cursor: "pointer" }}>
            <option value="">— sin asignar —</option>
            {[...new Set([...USERS.map(u2 => u2.label), ...(p.cierreResponsable ? [p.cierreResponsable] : [])])].sort().map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {tipo === "falta_logistica" && d?.motorista && <div style={{ fontSize: 10.5, color: "#B91C1C", marginTop: 3 }}>Entregada por {d.motorista}{d.fechaEjecutada ? ` el ${d.fechaEjecutada}` : ""} — la ficha firmada la tiene Logística.</div>}
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {tipo === "falta_proveedor" && <button onClick={() => setSec("entregas")} style={{ background: "transparent", color: "#0F766E", border: "1px solid #5EEAD4", padding: "6px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>→ Gestionarla en Entregas de proveedor</button>}
          {tipo === "lista" && <>
            <button onClick={() => imprimirPaqueteConta(p)} style={{ background: CHARCOAL, color: "#F0EBE3", border: "none", padding: "7px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }} title="Descarga UN PDF con portada, checklist y todos los documentos adjuntos">📥 Descargar paquete de cierre (PDF)</button>
            {puedeCerrarConta && <>
              <input type="file" accept=".pdf,image/*" id={`conta-fact-${p.id}`} style={{ display: "none" }}
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ""; const ok = await uploadPaqueteConta(p, f, "factura"); if (ok) alert("✅ Factura subida — la compra quedó CERRADA CONTABLEMENTE.\n\nPasó al apartado \"Cerradas contablemente\"."); }} />
              <label htmlFor={`conta-fact-${p.id}`} style={{ background: "#059669", color: "#fff", padding: "8px 8px", borderRadius: 4, fontSize: 10.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", textAlign: "center", display: "block" }} title="Escaneá SOLO la factura que trajo el proveedor — con eso la compra se cierra">🧾 Subir FACTURA escaneada (CIERRA la compra)</label>
              <input type="file" accept=".pdf,image/*" id={`conta-paq-${p.id}`} style={{ display: "none" }}
                onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ""; const ok = await uploadPaqueteConta(p, f, "paquete"); if (ok) alert("✅ Paquete completo subido — la compra quedó CERRADA CONTABLEMENTE."); }} />
              <label htmlFor={`conta-paq-${p.id}`} style={{ background: "transparent", color: "#059669", border: "1px solid #6EE7B7", padding: "5px 8px", borderRadius: 4, fontSize: 9.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textAlign: "center", display: "block" }} title="Alternativa: subir el paquete entero ya escaneado con todo adentro">…o el paquete completo escaneado</label>
            </>}
          </>}
        </div>
      </div>;
    };

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>📅 Mes de pago:</span>
        <select value={contaMes} onChange={e => setContaMes(e.target.value)} style={{ padding: "7px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: "#fff", fontFamily: "inherit" }}>
          <option value="">Todos los meses</option>
          {mesesDisponibles.map(m => <option key={m} value={m}>{(() => { const [y, mm] = m.split("-").map(Number); return new Date(y, mm - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" }); })()}</option>)}
        </select>
        {contaMes && !mesesDisponibles.includes(contaMes) && <span style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>sin compras pagadas este mes — elegí otro</span>}
        {esSupervisorConta
          ? <select value={contaResp} onChange={e => setContaResp(e.target.value)} style={{ padding: "7px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, background: contaResp ? "#F0FDF4" : "#fff", fontFamily: "inherit", fontWeight: contaResp ? 700 : 400 }}>
              <option value="">👤 Responsable: todos</option>
              <option value="__sin__">⚠ Sin asignar</option>
              {RESP_OPCIONES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          : <span style={{ fontSize: 11.5, color: "#0F766E", fontWeight: 700 }}>👤 Ves tus compras por cerrar y las sin asignar</span>}
        {puedeBorrarSolicitud && <Btn small variant="success" style={{ marginLeft: "auto" }} onClick={() => setRez({ modo: "lote", hasta: "", quien: "", otro: "", nota: "cerradas con conta antes del nuevo flujo" })}
          title="Cerrar de un golpe todas las compras viejas que ya cerraron con conta pero quedaron varadas en el sistema">✅ Cerrar rezagadas en lote</Btn>}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[["🧾", abiertas, "Por cerrar", "#B45309"], ["✓", totales.lista, "Con documentos listos", "#059669"], ["⚠", totales.falta_logistica, "Sin ficha de Logística", "#DC2626"], ["🏪", totales.falta_proveedor, "Falta ficha del proveedor", "#B45309"], ["✅", totales.cerrada, "Cerradas contablemente", "#64748b"]].map(([ic, n, lbl, c]) => (
          <div key={lbl} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 16px", minWidth: 140 }}>
            <div style={{ fontSize: 18 }}>{ic}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c, marginTop: 2 }}>{n}</div>
            <div style={{ fontSize: 9.5, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{lbl}</div>
          </div>))}
      </div>
      <div style={{ background: "#FFFBEB", border: "1px solid #F59E0B", borderRadius: 12, padding: 14, fontSize: 13, color: "#78350F" }}>
        🧾 <b>La regla del cierre:</b> con la ficha de recibido adjunta, imprimí el <b>paquete de cierre</b>, agregale la factura física y entregáselo a Contabilidad. Cuando conta te devuelva el paquete procesado, <b>subilo digitalizado acá</b> — solo eso cierra la compra. Las que dicen <b style={{ color: "#DC2626" }}>SIN FICHA de Logística</b> son responsabilidad de Logística: el motorista volvió con la ficha firmada y no la han subido.
      </div>
      {keys.length === 0
        ? <div style={{ background: "#F8FAFC", border: "1px dashed #CBD5E1", borderRadius: 12, padding: 60, textAlign: "center", color: "#94A3B8" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: CHARCOAL, marginBottom: 4 }}>Nada por cerrar contablemente</div>
            <div style={{ fontSize: 13 }}>Cuando envíes una compra a Logística o al proveedor, aparece acá hasta que subás el paquete de cierre.</div>
          </div>
        : keys.map(key => { const g = grupos[key]; const nAct = g.lista.length + g.falta_logistica.length + g.falta_proveedor.length + g.en_camino.length; return (
          <div key={key} style={{ background: "#F8F2E6", borderRadius: 12, padding: 14, border: "1px solid #E8E1D3" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: CHARCOAL, fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: 0.5, borderBottom: "3px solid #B45309", paddingBottom: 8, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
              <span>{key === "__sin__" ? "SIN PROYECTO" : key}</span><Badge color="#B45309">{nAct}</Badge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 10 }}>
              {g.lista.map(p => cardConta(p, "lista"))}
              {g.falta_logistica.map(p => cardConta(p, "falta_logistica"))}
              {g.falta_proveedor.map(p => cardConta(p, "falta_proveedor"))}
              {g.en_camino.map(p => cardConta(p, "en_camino"))}
            </div>
          </div>); })}
    </div>;
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PRIORIDADES (18-sep-2026, pedido de Gerson)
  // Reemplaza el Excel gigante que Finanzas le armaba a mano a Tesorería:
  // acá agregan las solicitudes YA CARGADAS y las ordenan por urgencia. La
  // Lic. Carolina paga de arriba hacia abajo mientras tenga fondos y, con un
  // click en cualquier tarjeta, cae directo en esa solicitud.
  // El orden del array ES la prioridad. Ver `sPri` para el guardado.
  // ═════════════════════════════════════════════════════════════════════════

  // Lleva a la solicitud en la pestaña Solicitudes y le abre el detalle.
  // Limpia los filtros para que la fila quede visible detrás del modal (si no,
  // al cerrar podía caer en una vista donde esa solicitud está filtrada).
  const irASolicitud = (p) => {
    setFilter({ ver: "todas", project: "", provider: "", mes: "" });
    setListOrden("estado");
    setSec("list");
    setModal({ t: "detail", d: p });
  };

  // Reordena SOLO las entradas visibles (las de la otra empresa conservan su
  // posición global exacta): se recorre el array completo y cada hueco que
  // ocupaba una entrada visible se vuelve a llenar con la cola reordenada.
  const reordenarVisibles = (nuevosVisibles) => {
    const ids = new Set(nuevosVisibles.map(x => x.id));
    const cola = [...nuevosVisibles];
    return prioridades.map(e => ids.has(e.id) ? cola.shift() : e);
  };

  const renderPrioridades = () => {
    const porIdGlobal = new Map(purchases.map(p => [p.id, p]));
    // Entradas de ESTA empresa cuya solicitud todavía existe.
    const visibles = prioridades.map(e => ({ e, p: porIdGlobal.get(e.id) })).filter(x => x.p && x.p.company === co);
    const pendientes = visibles.filter(x => !esPagada(x.p));
    const pagadas = visibles.filter(x => esPagada(x.p));
    // Basura: entradas de solicitudes borradas (de cualquier empresa).
    const huerfanas = prioridades.filter(e => !porIdGlobal.has(e.id));

    const total = pendientes.reduce((s, x) => s + (Number(x.p.amount) || 0), 0);
    const nUrg = pendientes.filter(x => x.e.urgente).length;
    const nVenc = pendientes.filter(x => estaVencida(x.p)).length;

    const mover = (id, delta) => {
      const orden = pendientes.map(x => x.e);
      const i = orden.findIndex(e => e.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= orden.length) return;
      const copia = [...orden];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      sPri(reordenarVisibles([...copia, ...pagadas.map(x => x.e)]));
    };
    const soltarEn = (destino) => {
      if (priDrag == null || priDrag === destino) { setPriDrag(null); return; }
      const orden = pendientes.map(x => x.e);
      const copia = [...orden];
      const [movida] = copia.splice(priDrag, 1);
      copia.splice(destino, 0, movida);
      setPriDrag(null);
      sPri(reordenarVisibles([...copia, ...pagadas.map(x => x.e)]));
    };
    const toggleUrgente = (id) => sPri(prioridades.map(e => e.id === id ? { ...e, urgente: !e.urgente } : e));
    const quitar = (id) => sPri(prioridades.filter(e => e.id !== id));
    const limpiar = () => {
      const fuera = new Set([...pagadas.map(x => x.e.id), ...huerfanas.map(e => e.id)]);
      if (!fuera.size) return;
      if (!confirm(`¿Quitar ${fuera.size} solicitud(es) ya pagadas de la lista?`)) return;
      sPri(prioridades.filter(e => !fuera.has(e.id)));
    };

    // FECHA DE PAGO REQUERIDA (21-sep-2026, pedido de Gerson): hasta cuándo
    // aguanta. Se compara como STRING YYYY-MM-DD contra hoy LOCAL — `new Date`
    // sobre una fecha pura es medianoche UTC y en Honduras corría un día.
    const hoyLocal = new Date().toLocaleDateString("en-CA");
    const setFechaReq = (id, v) => sPri(prioridades.map(en => en.id === id ? { ...en, fechaRequerida: v || "" } : en));
    const estadoFecha = (fr) => {
      if (!fr) return null;
      if (fr < hoyLocal) {
        const d = Math.round((Date.parse(hoyLocal + "T00:00:00Z") - Date.parse(fr + "T00:00:00Z")) / 86400000);
        return { txt: d === 1 ? "Se pasó 1 día" : `Se pasó ${d} días`, c: C_ROJO };
      }
      if (fr === hoyLocal) return { txt: "Pagar hoy", c: C_ULTRA };
      const d = Math.round((Date.parse(fr + "T00:00:00Z") - Date.parse(hoyLocal + "T00:00:00Z")) / 86400000);
      return { txt: d === 1 ? "Mañana" : `En ${d} días`, c: d <= 3 ? C_AMARILLO : C_GRIS };
    };

    const chip = (txt, c) => <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: c.color, background: c.bg, whiteSpace: "nowrap", letterSpacing: ".01em" }}>{txt}</span>;

    const iconBtn = (txt, onClick, title, activo) => <button
      type="button" title={title} aria-label={title}
      onClick={(ev) => { ev.stopPropagation(); onClick(); }}
      disabled={priSaving}
      style={{
        width: 30, height: 30, borderRadius: 9, cursor: priSaving ? "wait" : "pointer",
        border: `1px solid ${activo ? "transparent" : "var(--hairline)"}`,
        background: activo ? ORANGE_DARK : "var(--surface)",
        color: activo ? "#fff" : "var(--text-3)",
        fontSize: 13, fontWeight: 800, fontFamily: "inherit", lineHeight: 1,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{txt}</button>;

    const tarjeta = (x, i) => {
      const { e, p } = x;
      const venc = estaVencida(p);
      const dias = diasEsperandoPago(p);
      // El rojo de "vencida" manda sobre el naranja de "urgente": es un hecho,
      // no una decisión. Los dos chips igual se muestran.
      const tono = venc ? C_ROJO : e.urgente ? C_ULTRA : null;
      return <div
        key={e.id}
        className="gt-vidrio gt-vidrio-hover"
        role="button" tabIndex={0}
        aria-label={`Abrir solicitud ${p.codigo || p.provider}`}
        draggable={canEditPri && !isMobile}
        onDragStart={() => setPriDrag(i)}
        onDragOver={(ev) => { if (priDrag != null) ev.preventDefault(); }}
        onDrop={(ev) => { ev.preventDefault(); soltarEn(i); }}
        onDragEnd={() => setPriDrag(null)}
        onClick={() => irASolicitud(p)}
        onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); irASolicitud(p); } }}
        style={{
          padding: isMobile ? "12px 14px" : "13px 18px",
          display: "grid",
          gridTemplateColumns: isMobile ? "34px minmax(0,1fr)" : "38px minmax(0,1fr) auto auto",
          alignItems: "center",
          gap: isMobile ? 10 : 16,
          cursor: "pointer",
          background: tono ? tono.bg : undefined,
          borderColor: tono ? tono.borde : undefined,
          opacity: priDrag === i ? 0.45 : 1,
          transition: "opacity .15s",
        }}>
        {/* Puesto en la cola */}
        <div style={{ font: "800 17px/1 var(--mono, ui-monospace)", color: tono ? tono.color : "var(--text-3)", fontVariantNumeric: "tabular-nums", textAlign: "center" }}>
          {String(i + 1).padStart(2, "0")}
        </div>
        {/* Qué es */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: "var(--text-3)", letterSpacing: ".02em" }}>{p.codigo || "—"}</span>
            <Badge color={cc.color}>{p.projectCode}</Badge>
            {e.urgente && chip("Urgente", C_ULTRA)}
            {venc && chip("Vencida", C_ROJO)}
            {(() => { const ef = estadoFecha(e.fechaRequerida); return ef ? chip(`${fmtCorta(e.fechaRequerida)} · ${ef.txt}`, ef.c) : null; })()}
          </div>
          <div style={{ font: "700 13.5px/1.25 var(--sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.provider}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
          {/* Quién la puso en la cola (21-sep-2026, pedido de Gerson: "si
              Arturo la puso en prioridad que salga que fue él"). */}
          {e.addedBy && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>la priorizó {e.addedBy}</div>}
          {isMobile && <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 3 }}>
            <span style={{ font: "800 15px/1 var(--display)", color: "var(--text)" }}>{fmtL(p.amount)}</span>
            <span style={{ fontSize: 11, color: venc ? C_ROJO.color : "var(--text-3)", fontWeight: venc ? 800 : 500 }}>{dias != null ? `${dias} días` : ""}</span>
          </div>}
        </div>
        {/* Cuánto y desde cuándo */}
        {!isMobile && <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ font: "800 16px/1.15 var(--display)", letterSpacing: "-.01em", color: "var(--text)" }}>{fmtL(p.amount)}</div>
          <div style={{ fontSize: 10.5, marginTop: 3, color: venc ? C_ROJO.color : "var(--text-3)", fontWeight: venc ? 800 : 500 }}>
            {dias != null ? `esperando ${dias} días` : "—"}
          </div>
        </div>}
        {/* Acciones */}
        {canEditPri && <div onClick={ev => ev.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5, gridColumn: isMobile ? "1 / -1" : undefined, justifyContent: isMobile ? "flex-end" : undefined, flexWrap: "wrap" }}>
          {/* Hasta cuándo aguanta esta solicitud */}
          <input type="date" value={e.fechaRequerida || ""} onChange={ev => setFechaReq(e.id, ev.target.value)}
            title="Fecha de pago requerida" aria-label={`Fecha de pago requerida de ${p.codigo || p.provider}`} disabled={priSaving}
            style={{ padding: "5px 8px", border: "1px solid var(--hairline)", borderRadius: 9, fontSize: 11, fontFamily: "inherit", background: "var(--surface)", color: "var(--text-2)", colorScheme: "light" }} />
          {iconBtn("↑", () => mover(e.id, -1), "Subir")}
          {iconBtn("↓", () => mover(e.id, 1), "Bajar")}
          {iconBtn("!", () => toggleUrgente(e.id), e.urgente ? "Quitar urgente" : "Marcar urgente", e.urgente)}
          {iconBtn("✕", () => quitar(e.id), "Quitar de la lista")}
        </div>}
      </div>;
    };

    return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 }}>
      {/* Resumen */}
      <div className="gt-vidrio" style={{ padding: "11px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 0, flexWrap: "wrap" }}>
        {[
          { v: pendientes.length, l: "en la cola" },
          { v: fmtL(total), l: "por pagar", c: "var(--naranja-tinta)" },
          { v: nUrg, l: "urgentes", c: nUrg ? C_ULTRA.color : undefined },
          { v: nVenc, l: "vencidas", c: nVenc ? C_ROJO.color : undefined },
        ].map((x, i, arr) => (
          <div key={x.l} style={{ display: "flex", alignItems: "center", flex: isMobile ? "1 1 40%" : 1, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "800 clamp(15px,1.3vw,19px)/1.15 var(--display)", letterSpacing: "-.01em", color: x.c || "var(--text)", whiteSpace: "nowrap" }}>{x.v}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2, fontSize: 9 }}>{x.l}</div>
            </div>
            {!isMobile && i < arr.length - 1 && <div style={{ width: 1, alignSelf: "stretch", background: "var(--hairline)", margin: "0 18px 0 auto" }} />}
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "var(--text-3)" }}>
          {isTesoreria ? "Pagá de arriba hacia abajo. Click en una tarjeta para abrirla." : "Arrastrá o usá ↑ ↓ para ordenar. Click en una tarjeta para abrirla."}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {priSaving && <span style={{ fontSize: 11.5, color: "var(--naranja-tinta)", fontWeight: 700 }}>Guardando…</span>}
          {canEditPri && (pagadas.length > 0 || huerfanas.length > 0) && <Btn small variant="ghost" onClick={limpiar}>Quitar pagadas ({pagadas.length + huerfanas.length})</Btn>}
          {canEditPri && <Btn variant="primary" onClick={() => setPriModal({ t: "add" })}>+ Agregar solicitudes</Btn>}
        </div>
      </div>

      {/* La cola */}
      {pendientes.length === 0
        ? <div className="gt-vidrio" style={{ padding: "38px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13.5 }}>
            La cola está vacía.{canEditPri ? " Agregá las solicitudes que Tesorería debe pagar primero." : ""}
          </div>
        : <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 9 }}>{pendientes.map(tarjeta)}</div>}

      {/* Ya pagadas — se quedan a la vista para saber por dónde va la semana */}
      {pagadas.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 9 }}>
        <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 4 }}>Ya pagadas ({pagadas.length})</div>
        {pagadas.map(({ e, p }) => <div key={e.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0}
          onClick={() => irASolicitud(p)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); irASolicitud(p); } }}
          style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: C_VERDE.bg, borderColor: "rgba(23,114,67,.18)", flexWrap: "wrap" }}>
          <span style={{ color: C_VERDE.color, fontWeight: 800, fontSize: 14 }}>✓</span>
          <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: C_VERDE.color }}>{p.codigo || "—"}</span>
          <span style={{ font: "700 13px/1 var(--sans)", color: "var(--text-2)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.provider}</span>
          <span style={{ font: "700 13px/1 var(--sans)", color: C_VERDE.color }}>{fmtL(p.amount)}</span>
        </div>)}
      </div>}
    </div>;
  };

  // Modal para agregar solicitudes a la cola: solo lo NO pagado que todavía no
  // está en la lista, con buscador y check múltiple.
  const renderPriModal = () => {
    if (!priModal || priModal.t !== "add") return null;
    return <PrioridadAddModal
      candidatas={cp.filter(p => !esPagada(p) && !prioridades.some(e => e.id === p.id))}
      ccColor={cc.color}
      onClose={() => setPriModal(null)}
      onAdd={async (ids) => {
        const ahora = new Date().toISOString();
        const ok = await sPri([...prioridades, ...ids.map(id => ({ id, urgente: false, addedBy: userName || "", createdAt: ahora }))]);
        if (ok) setPriModal(null);
      }}
    />;
  };

  // ═════════════════════════════════════════════════════════════════════════
  // CUENTAS POR PAGAR (21-sep-2026, pedido de Gerson)
  // ═════════════════════════════════════════════════════════════════════════
  // Christian le CALENDARIZA los pagos a Tesorería. Dos casos:
  //   · Las compras grandes que el proveedor nos dio a CRÉDITO (marcadas en la
  //     solicitud como "un solo pago" o "plan de pagos").
  //   · Las que simplemente PUEDEN ESPERAR y no entran en Prioridades.
  // Diferencia con Prioridades: allá el orden del array es la cola de urgencia;
  // acá manda la FECHA — es un calendario, no una cola.
  //
  // ABONOS (21-sep-2026): una entrada de `cp-cxp` es UN PAGO PROGRAMADO, no una
  // solicitud. Una solicitud a "plan de pagos" tiene VARIAS entradas (ej. una
  // de L 800,000 abonada en 3 partes). Por eso `id` es el id del abono y
  // `purchaseId` apunta a la solicitud — `sListaPropia` mergea por `id`, así
  // que cada abono viaja solo. Las de pago único llevan una sola entrada con
  // el monto completo.
  const cxpDe = (purchaseId) => cxp.filter(e => e.purchaseId === purchaseId);
  const cxpProgramado = (purchaseId) => cxpDe(purchaseId).reduce((s, e) => s + (Number(e.monto) || 0), 0);

  const renderCxp = () => {
    const porIdGlobal = new Map(purchases.map(p => [p.id, p]));
    const visibles = cxp.map(e => ({ e, p: porIdGlobal.get(e.purchaseId) })).filter(x => x.p && x.p.company === co);
    const pendientes = visibles.filter(x => !esPagada(x.p));
    const pagadas = visibles.filter(x => esPagada(x.p));
    const huerfanas = cxp.filter(e => !porIdGlobal.has(e.purchaseId));

    // Créditos aprobados a los que todavía les falta programar plata: el hueco
    // que esta pestaña existe para tapar.
    const sinProgramar = cp.filter(p => p.condicionPago === "credito" && !esPagada(p) && p.status !== "borrador"
      && cxpProgramado(p.id) < (Number(p.amount) || 0) - 0.005);

    const hoyL = new Date().toLocaleDateString("en-CA");
    const finSemana = (() => { const d = new Date(); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow + 6); return d.toLocaleDateString("en-CA"); })();
    const finMes = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString("en-CA"); })();

    const clase = (f) => !f ? "sinfecha" : f < hoyL ? "vencidas" : f <= finSemana ? "semana" : f <= finMes ? "mes" : "despues";
    const FILTROS = [
      { k: "todas", label: "Todos" },
      { k: "vencidas", label: "Se pasaron" },
      { k: "semana", label: "Esta semana" },
      { k: "mes", label: "Este mes" },
      { k: "despues", label: "Más adelante" },
    ];
    const cuenta = (k) => k === "todas" ? pendientes.length : pendientes.filter(x => clase(x.e.fecha) === k).length;
    const filas = cxpFiltro === "todas" ? pendientes : pendientes.filter(x => clase(x.e.fecha) === cxpFiltro);

    const totalDe = (arr) => arr.reduce((s, x) => s + (Number(x.e.monto) || 0), 0);
    const nVencidas = pendientes.filter(x => clase(x.e.fecha) === "vencidas").length;

    const setFecha = (id, v) => sCxp(cxp.map(en => en.id === id ? { ...en, fecha: v || "" } : en));
    const setMonto = (id, v) => sCxp(cxp.map(en => en.id === id ? { ...en, monto: Number(v) || 0 } : en));
    const quitar = (id) => sCxp(cxp.filter(en => en.id !== id));
    const limpiar = () => {
      const fuera = new Set([...pagadas.map(x => x.e.id), ...huerfanas.map(e => e.id)]);
      if (!fuera.size) return;
      if (!confirm(`¿Quitar ${fuera.size} pago(s) de solicitudes ya pagadas de la programación?`)) return;
      sCxp(cxp.filter(en => !fuera.has(en.id)));
    };
    const aPrioridades = (p) => {
      if (prioridades.some(en => en.id === p.id)) { setSec("prioridades"); return; }
      sPri([...prioridades, { id: p.id, urgente: false, addedBy: userName || "", createdAt: new Date().toISOString() }]);
      setSec("prioridades");
    };

    // Agrupado por fecha de pago; sin fecha al final.
    const grupos = (() => {
      const m = {};
      filas.forEach(x => { const k = x.e.fecha || "—"; (m[k] = m[k] || []).push(x); });
      return Object.keys(m).sort((a, b) => a === "—" ? 1 : b === "—" ? -1 : a.localeCompare(b))
        .map(f => ({ fecha: f, items: m[f].slice().sort((a, b) => (Number(b.e.monto) || 0) - (Number(a.e.monto) || 0)) }));
    })();

    const pill = (t, activo, onClick, n) => (
      <button key={t} onClick={onClick} aria-pressed={activo} style={{
        padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit",
        border: activo ? "1px solid transparent" : "1px solid var(--hairline)",
        background: activo ? ORANGE_DARK : "var(--surface)", color: activo ? "#fff" : "var(--text-2)",
        fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6,
      }}>{t}{n != null && <span style={{ fontSize: 10.5, opacity: activo ? .85 : .6, fontVariantNumeric: "tabular-nums" }}>{n}</span>}</button>
    );

    const tarjeta = ({ e, p }) => {
      const cl = clase(e.fecha);
      const tono = cl === "vencidas" ? C_ROJO : cl === "semana" ? C_ULTRA : null;
      const enPri = prioridades.some(x => x.id === p.id);
      const abonos = cxpDe(p.id);
      const plan = p.condicionPago === "credito" && p.tipoCredito === "plan";
      const nAbono = plan ? abonos.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).findIndex(a => a.id === e.id) + 1 : 0;
      const programado = cxpProgramado(p.id);
      const parcial = (Number(e.monto) || 0) < (Number(p.amount) || 0) - 0.005;
      return <div key={e.id} className="gt-vidrio gt-vidrio-hover" style={{
        padding: isMobile ? "12px 14px" : "13px 18px",
        display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(0,1fr) auto auto",
        alignItems: "center", gap: isMobile ? 10 : 16,
        background: tono ? tono.bg : undefined, borderColor: tono ? tono.borde : undefined,
      }}>
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4, cursor: "pointer" }}
          onClick={() => irASolicitud(p)} role="button" tabIndex={0}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); irASolicitud(p); } }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
            <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: "var(--text-3)", letterSpacing: ".02em" }}>{p.codigo || "—"}</span>
            <Badge color={cc.color}>{p.projectCode}</Badge>
            {plan
              ? <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: C_AZUL.color, background: C_AZUL.bg }}>Abono {nAbono} de {abonos.length}</span>
              : p.condicionPago === "credito" && <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: C_AZUL.color, background: C_AZUL.bg }}>Crédito</span>}
            {enPri && <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: C_ULTRA.color, background: C_ULTRA.bg }}>También en Prioridades</span>}
          </div>
          <div style={{ font: "700 13.5px/1.25 var(--sans)", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.provider}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>
            {parcial && <>de {fmtL(p.amount)} · programado {fmtL(programado)} · falta {fmtL((Number(p.amount) || 0) - programado)} · </>}
            {e.addedBy ? `programó ${e.addedBy}` : ""}
          </div>
        </div>
        <div style={{ textAlign: isMobile ? "left" : "right", whiteSpace: "nowrap" }}>
          {canEditPri
            ? <input type="number" step="0.01" min="0" value={e.monto ?? ""} onChange={ev => setMonto(e.id, ev.target.value)} disabled={cxpSaving}
                aria-label={`Monto a pagar de ${p.codigo || p.provider}`} title="Monto de este pago"
                style={{ width: 128, boxSizing: "border-box", padding: "6px 9px", textAlign: "right", border: "1px solid var(--hairline)", borderRadius: 9, font: "800 14px/1.2 var(--display)", fontFamily: "inherit", outline: "none", background: "var(--surface)", color: "var(--text)" }} />
            : <div style={{ font: "800 16px/1.15 var(--display)", letterSpacing: "-.01em", color: "var(--text)" }}>{fmtL(e.monto)}</div>}
        </div>
        {canEditPri && <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", justifyContent: isMobile ? "flex-end" : undefined }}>
          <input type="date" value={e.fecha || ""} onChange={ev => setFecha(e.id, ev.target.value)} disabled={cxpSaving}
            title="Fecha en que hay que pagarla" aria-label={`Fecha de pago de ${p.codigo || p.provider}`}
            style={{ padding: "5px 8px", border: "1px solid var(--hairline)", borderRadius: 9, fontSize: 11, fontFamily: "inherit", background: "var(--surface)", color: "var(--text-2)", colorScheme: "light" }} />
          <button onClick={() => aPrioridades(p)} disabled={cxpSaving} title={enPri ? "Ver en Prioridades" : "Pasarla a la cola de Prioridades"}
            style={{ height: 30, padding: "0 11px", borderRadius: 9, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-3)", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {enPri ? "Ver" : "A prioridades"}
          </button>
          <button onClick={() => quitar(e.id)} disabled={cxpSaving} title="Quitar este pago de la programación" aria-label="Quitar este pago"
            style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-3)", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
        </div>}
      </div>;
    };

    return <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 }}>
      {/* Resumen: lo que de verdad necesita saber Tesorería */}
      <div className="gt-vidrio" style={{ padding: "11px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 0, flexWrap: "wrap" }}>
        {[
          { v: pendientes.length, l: "pagos programados" },
          { v: fmtL(totalDe(pendientes)), l: "total por pagar" },
          { v: fmtL(totalDe(pendientes.filter(x => ["vencidas", "semana"].includes(clase(x.e.fecha))))), l: "vence esta semana", c: "var(--naranja-tinta)" },
          { v: nVencidas, l: "se pasaron de fecha", c: nVencidas ? C_ROJO.color : undefined },
        ].map((x, i, arr) => (
          <div key={x.l} style={{ display: "flex", alignItems: "center", flex: isMobile ? "1 1 45%" : 1, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "800 clamp(15px,1.3vw,19px)/1.15 var(--display)", letterSpacing: "-.01em", color: x.c || "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.v}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2, fontSize: 9 }}>{x.l}</div>
            </div>
            {!isMobile && i < arr.length - 1 && <div style={{ width: 1, alignSelf: "stretch", background: "var(--hairline)", margin: "0 18px 0 auto" }} />}
          </div>
        ))}
      </div>

      {/* Créditos a los que les falta programar plata */}
      {canEditPri && sinProgramar.length > 0 && <div className="gt-vidrio" style={{ padding: "13px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: C_AZUL.bg, borderColor: "rgba(29,95,175,.22)" }}>
        <span style={{ fontSize: 13, color: C_AZUL.color, fontWeight: 600, flex: 1, minWidth: 200 }}>
          Hay <b>{sinProgramar.length}</b> solicitud{sinProgramar.length === 1 ? "" : "es"} a crédito con pagos sin programar — falta {fmtL(sinProgramar.reduce((s, p) => s + Math.max(0, (Number(p.amount) || 0) - cxpProgramado(p.id)), 0))}
        </span>
        <Btn small variant="info" onClick={() => setCxpModal({ t: "add", soloCredito: true })}>Programarlos</Btn>
      </div>}

      {/* Acciones + filtros */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          {FILTROS.map(f => pill(f.label, cxpFiltro === f.k, () => setCxpFiltro(f.k), cuenta(f.k)))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {cxpSaving && <span style={{ fontSize: 11.5, color: "var(--naranja-tinta)", fontWeight: 700 }}>Guardando…</span>}
          {canEditPri && (pagadas.length > 0 || huerfanas.length > 0) && <Btn small variant="ghost" onClick={limpiar}>Quitar pagadas ({pagadas.length + huerfanas.length})</Btn>}
          {canEditPri && <Btn variant="primary" onClick={() => setCxpModal({ t: "add" })}>+ Programar pago</Btn>}
        </div>
      </div>

      {/* El calendario */}
      {filas.length === 0
        ? <div className="gt-vidrio" style={{ padding: "38px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13.5 }}>
            {pendientes.length === 0
              ? (canEditPri ? "Todavía no hay pagos programados. Agregá las solicitudes a crédito y las que pueden esperar." : "Todavía no hay pagos programados.")
              : "Nada en este rango."}
          </div>
        : grupos.map(g => {
          const cl = clase(g.fecha === "—" ? "" : g.fecha);
          const suma = g.items.reduce((s, x) => s + (Number(x.e.monto) || 0), 0);
          return <div key={g.fecha} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              <span className="gt-label" style={{ color: cl === "vencidas" ? C_ROJO.color : "var(--text-2)", fontSize: 10.5 }}>
                {g.fecha === "—" ? "Sin fecha" : fmtLarga(g.fecha)}
              </span>
              {cl === "vencidas" && <span style={{ fontSize: 10.5, fontWeight: 800, color: C_ROJO.color }}>se pasó</span>}
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>{g.items.length} pago{g.items.length === 1 ? "" : "s"}</span>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--naranja-tinta)" }}>{fmtL(suma)}</span>
            </div>
            {g.items.map(tarjeta)}
          </div>;
        })}

      {/* Ya pagadas */}
      {pagadas.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 9 }}>
        <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 4 }}>Ya pagadas ({pagadas.length})</div>
        {pagadas.map(({ e, p }) => <div key={e.id} className="gt-vidrio gt-vidrio-hover" role="button" tabIndex={0}
          onClick={() => irASolicitud(p)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); irASolicitud(p); } }}
          style={{ padding: "10px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: C_VERDE.bg, borderColor: "rgba(23,114,67,.18)", flexWrap: "wrap" }}>
          <span style={{ color: C_VERDE.color, fontWeight: 800, fontSize: 14 }}>✓</span>
          <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: C_VERDE.color }}>{p.codigo || "—"}</span>
          <span style={{ font: "700 13px/1 var(--sans)", color: "var(--text-2)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.provider}</span>
          <span style={{ font: "700 13px/1 var(--sans)", color: C_VERDE.color }}>{fmtL(e.monto)}</span>
        </div>)}
      </div>}
    </div>;
  };

  // Modal para programar pagos. Una solicitud sigue apareciendo mientras le
  // FALTE plata por programar (así se agrega el 2º y 3er abono de un plan).
  const renderCxpModal = () => {
    if (!cxpModal || cxpModal.t !== "add") return null;
    let candidatas = cp
      .filter(p => !esPagada(p) && p.status !== "borrador")
      .map(p => {
        const yaProgramado = cxpProgramado(p.id);
        return { ...p, yaProgramado, resta: Math.max(0, (Number(p.amount) || 0) - yaProgramado) };
      })
      .filter(p => p.resta > 0.005);
    if (cxpModal.soloCredito) candidatas = candidatas.filter(p => p.condicionPago === "credito");
    return <CxpAddModal
      candidatas={candidatas}
      ccColor={cc.color}
      onClose={() => setCxpModal(null)}
      onAdd={async (items, fecha) => {
        const ahora = new Date().toISOString();
        const ok = await sCxp([...cxp, ...items.map((it, i) => ({
          id: `${Date.now().toString(36)}${i}${Math.random().toString(36).slice(2, 6)}`,
          purchaseId: it.purchaseId, fecha, monto: it.monto,
          addedBy: userName || "", createdAt: ahora,
        }))]);
        if (ok) setCxpModal(null);
      }}
    />;
  };

  // ═════════════════════════════════════════════════════════════════════════
  // CALENDARIO DE PAGO (21-sep-2026, pedido de Gerson)
  // ═════════════════════════════════════════════════════════════════════════
  // "Un cuarto a la izquierda de la página el calendario del mes; si apretás
  //  una fecha, a la derecha te salen las solicitudes de pago tanto de
  //  Prioridades como de Cuentas por pagar que han programado Arturo y
  //  Christian."
  // Une las DOS fuentes en una sola vista de día:
  //   · `cp-cxp`    → pagos programados (con su monto; los abonos de un plan
  //                   cuentan por separado).
  //   · `cp-prioridades` → las que tienen `fechaRequerida` (hasta cuándo
  //                   aguantan). Se muestran aparte porque son un COMPROMISO,
  //                   no un pago programado: no suman al total del día.
  const renderCalendario = () => {
    const porIdGlobal = new Map(purchases.map(p => [p.id, p]));
    const dePagina = (p) => p && p.company === co && !esPagada(p);

    // Eventos por día: { [YYYY-MM-DD]: { pagos: [...], requeridas: [...] } }
    const porDia = {};
    const push = (f, tipo, obj) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f || ""))) return;
      (porDia[f] = porDia[f] || { pagos: [], requeridas: [] })[tipo].push(obj);
    };
    cxp.forEach(e => { const p = porIdGlobal.get(e.purchaseId); if (dePagina(p)) push(e.fecha, "pagos", { e, p }); });
    prioridades.forEach(e => { const p = porIdGlobal.get(e.id); if (dePagina(p)) push(e.fechaRequerida, "requeridas", { e, p }); });

    const hoyL = new Date().toLocaleDateString("en-CA");
    const [y, m] = calMes.split("-").map(Number);
    const primero = new Date(y, m - 1, 1);
    const diasEnMes = new Date(y, m, 0).getDate();
    const offset = (primero.getDay() + 6) % 7;   // lunes = 0
    const ymdDe = (d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const mesLabel = primero.toLocaleDateString("es-HN", { month: "long", year: "numeric" });
    const irMes = (delta) => {
      const d = new Date(y, m - 1 + delta, 1);
      setCalMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    };
    const totalDia = (f) => (porDia[f]?.pagos || []).reduce((s, x) => s + (Number(x.e.monto) || 0), 0);
    const totalMes = Object.keys(porDia).filter(f => f.startsWith(calMes)).reduce((s, f) => s + totalDia(f), 0);
    const nMes = Object.keys(porDia).filter(f => f.startsWith(calMes)).reduce((s, f) => s + porDia[f].pagos.length, 0);

    const sel = calDia && porDia[calDia] ? porDia[calDia] : { pagos: [], requeridas: [] };

    const filaDetalle = ({ e, p }, tipo) => <div key={(tipo === "pagos" ? "c" : "p") + e.id} className="gt-vidrio gt-vidrio-hover"
      role="button" tabIndex={0} onClick={() => irASolicitud(p)}
      onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); irASolicitud(p); } }}
      style={{ padding: "12px 16px", cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center",
        background: tipo === "requeridas" ? C_ULTRA.bg : undefined, borderColor: tipo === "requeridas" ? C_ULTRA.borde : undefined }}>
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ font: "800 11px/1 var(--mono, ui-monospace)", color: "var(--text-3)" }}>{p.codigo || "—"}</span>
          <Badge color={cc.color}>{p.projectCode}</Badge>
          {tipo === "requeridas"
            ? <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: C_ULTRA.color, background: "#fff" }}>Prioridades · fecha tope</span>
            : (p.condicionPago === "credito" && p.tipoCredito === "plan")
              ? <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: C_AZUL.color, background: C_AZUL.bg }}>Abono de {fmtL(p.amount)}</span>
              : null}
        </div>
        <div style={{ font: "700 13.5px/1.25 var(--sans)", color: "var(--text)", wordBreak: "break-word" }}>{p.provider}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</div>
        {e.addedBy && <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>
          {tipo === "pagos" ? "programó" : "la priorizó"} {e.addedBy}
        </div>}
      </div>
      <div style={{ font: "800 16px/1.15 var(--display)", letterSpacing: "-.01em", color: "var(--text)", whiteSpace: "nowrap" }}>
        {fmtL(tipo === "pagos" ? e.monto : p.amount)}
      </div>
    </div>;

    return <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0,1fr)" : "minmax(280px, 1fr) minmax(0, 3fr)", gap: 16, alignItems: "start" }}>
      {/* ── El mes ── */}
      <div className="gt-vidrio" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <button onClick={() => irMes(-1)} aria-label="Mes anterior" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-3)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>‹</button>
          <div style={{ textAlign: "center", minWidth: 0 }}>
            <div style={{ font: "800 15px/1.2 var(--display)", color: "var(--text)", textTransform: "capitalize" }}>{mesLabel}</div>
            <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 2 }}>{nMes} pago{nMes === 1 ? "" : "s"} · {fmtL(totalMes)}</div>
          </div>
          <button onClick={() => irMes(1)} aria-label="Mes siguiente" style={{ width: 30, height: 30, borderRadius: 9, border: "1px solid var(--hairline)", background: "var(--surface)", color: "var(--text-3)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>›</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 4 }}>
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", font: "800 9.5px/1 var(--mono, ui-monospace)", color: "var(--text-faint)", padding: "2px 0 6px" }}>{d}</div>
          ))}
          {Array.from({ length: offset }, (_, i) => <div key={`v${i}`} />)}
          {Array.from({ length: diasEnMes }, (_, i) => {
            const d = i + 1;
            const f = ymdDe(d);
            const ev = porDia[f];
            const nPagos = ev?.pagos.length || 0;
            const nReq = ev?.requeridas.length || 0;
            const activo = calDia === f;
            const esHoy = f === hoyL;
            const atrasado = nPagos > 0 && f < hoyL;
            return <button key={d} onClick={() => setCalDia(activo ? "" : f)} aria-pressed={activo}
              title={nPagos || nReq ? `${nPagos} pago(s)${nReq ? ` · ${nReq} con fecha tope` : ""} — ${fmtL(totalDia(f))}` : ""}
              style={{
                aspectRatio: "1", minHeight: 34, borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                border: esHoy && !activo ? `1px solid ${ORANGE}` : "1px solid transparent",
                background: activo ? CHARCOAL : atrasado ? C_ROJO.bg : nPagos ? C_ULTRA.bg : nReq ? "rgba(44,42,40,.04)" : "transparent",
                color: activo ? "#fff" : atrasado ? C_ROJO.color : "var(--text-2)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 0,
              }}>
              <span style={{ font: `${nPagos || nReq ? 800 : 500} 12px/1 var(--sans)` }}>{d}</span>
              {(nPagos > 0 || nReq > 0) && <span style={{ display: "flex", gap: 2 }}>
                {nPagos > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: activo ? "#fff" : atrasado ? C_ROJO.color : ORANGE }} />}
                {nReq > 0 && <span style={{ width: 4, height: 4, borderRadius: "50%", background: activo ? "rgba(255,255,255,.6)" : "var(--text-faint)" }} />}
              </span>}
            </button>;
          })}
        </div>

        {/* Leyenda mínima */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: "1px solid var(--hairline)", paddingTop: 11 }}>
          {[{ c: ORANGE, t: "Pago programado" }, { c: C_ROJO.color, t: "Se pasó de fecha" }, { c: "var(--text-faint)", t: "Fecha tope de Prioridades" }].map(l => (
            <div key={l.t} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, color: "var(--text-3)" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: l.c, flexShrink: 0 }} />{l.t}
            </div>
          ))}
        </div>
      </div>

      {/* ── El día ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 12 }}>
        {!calDia
          ? <div className="gt-vidrio" style={{ padding: "52px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
              Tocá un día del calendario para ver qué se paga ese día.
            </div>
          : <>
            <div className="gt-vidrio" style={{ padding: "13px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ font: "800 16px/1.2 var(--display)", color: "var(--text)" }}>{fmtLarga(calDia)}</div>
                <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 3 }}>
                  {sel.pagos.length} pago{sel.pagos.length === 1 ? "" : "s"}{sel.requeridas.length ? ` · ${sel.requeridas.length} con fecha tope` : ""}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ font: "800 19px/1.15 var(--display)", letterSpacing: "-.01em", color: "var(--naranja-tinta)" }}>{fmtL(totalDia(calDia))}</div>
                <div className="gt-label" style={{ color: "var(--text-3)", fontSize: 9, marginTop: 2 }}>a pagar ese día</div>
              </div>
            </div>

            {sel.pagos.length === 0 && sel.requeridas.length === 0 && <div className="gt-vidrio" style={{ padding: "38px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13.5 }}>
              Nada programado para ese día.
            </div>}

            {sel.pagos.length > 0 && <>
              <div className="gt-label" style={{ color: "var(--text-2)", fontSize: 10.5, marginTop: 2 }}>Cuentas por pagar</div>
              {sel.pagos.slice().sort((a, b) => (Number(b.e.monto) || 0) - (Number(a.e.monto) || 0)).map(x => filaDetalle(x, "pagos"))}
            </>}

            {sel.requeridas.length > 0 && <>
              <div className="gt-label" style={{ color: "var(--text-2)", fontSize: 10.5, marginTop: 6 }}>Prioridades — vencen ese día</div>
              {sel.requeridas.slice().sort((a, b) => (Number(b.p.amount) || 0) - (Number(a.p.amount) || 0)).map(x => filaDetalle(x, "requeridas"))}
            </>}
          </>}
      </div>
    </div>;
  };

  const renderList = () => {
    // ORDEN (24-ago-2026, pedido de Gerson): por defecto por FECHA DE PAGO
    // (lo más reciente arriba) — es el dato con el que él persigue la cadena.
    // Con el selector se puede volver al orden por estado o invertir.
    const fpagoOrd = (x) => String(x.paidAt || x.paymentDate || "");
    const dataSorted = filtered.slice().sort((a, b) => {
      // Por fecha de SOLICITUD — pero SIEMPRE respetando la numeración del
      // código (1-sep, pedido de Gerson: varias del mismo día salían
      // desordenadas — la 0368 en medio de la 0365 y la 0366). El código es
      // correlativo global del año, así que ES el orden real de creación;
      // solo las viejas sin código caen al createdAt.
      if (listOrden === "solicitud_asc" || listOrden === "solicitud_desc") {
        const codNum = (x) => {
          const m = String(x.codigo || "").match(/-(\d{4})-(\d+)$/);
          return m ? Number(m[1]) * 100000 + Number(m[2]) : null;
        };
        const ca = codNum(a), cb = codNum(b);
        const cmp = (ca != null && cb != null)
          ? ca - cb
          : new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        return listOrden === "solicitud_asc" ? cmp : -cmp;
      }
      if (listOrden === "estado") {
        const ord = { validado: 1, pagado: 2, borrador: 3, finalizado: 4 };
        const da = ord[a.status] || 9, db = ord[b.status] || 9;
        if (da !== db) return da - db;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      const fa = fpagoOrd(a), fb = fpagoOrd(b);
      if (!fa && !fb) return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (!fa) return 1;          // sin pagar al final
      if (!fb) return -1;
      return listOrden === "pago_asc" ? fa.localeCompare(fb) : fb.localeCompare(fa);
    });

    const providers = [...new Set(cp.map(p => p.provider).filter(Boolean))].sort();

    return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* RESUMEN (rediseño 31-ago): un solo cuadrito — "tanta tarjeta es
          repetitivo, cansa la vista". Sin emojis. */}
      <div className="gt-vidrio" style={{ padding: "11px 20px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 0, flexWrap: "wrap" }}>
        {[
          { v: stats.total, l: "solicitudes" },
          { v: stats.validado, l: "pendientes de pago", c: "var(--naranja-tinta)" },
          { v: fmtL(stats.montoPendiente), l: "por pagar", c: "var(--naranja-tinta)" },
          { v: fmtL(stats.montoPagadoMes), l: "pagado este mes" },
          { v: stats.finalizado, l: "finalizadas" },
          // Vencidas: solo aparece si hay (18-sep-2026)
          ...(cp.some(estaVencida) ? [{ v: cp.filter(estaVencida).length, l: "vencidas", c: C_ROJO.color }] : []),
        ].map((x, i, arr) => (
          <div key={x.l} style={{ display: "flex", alignItems: "center", flex: isMobile ? "1 1 40%" : 1, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ font: "800 clamp(15px,1.3vw,19px)/1.15 var(--display)", letterSpacing: "-.01em", color: x.c || "var(--text)", whiteSpace: "nowrap" }}>{x.v}</div>
              <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2, fontSize: 9 }}>{x.l}</div>
            </div>
            {!isMobile && i < arr.length - 1 && <div style={{ width: 1, alignSelf: "stretch", background: "var(--hairline)", margin: "0 18px 0 auto" }} />}
          </div>
        ))}
      </div>

      {/* Carolina destacado si es tesoreria */}
      {isTesoreria && stats.validado > 0 && <div className="gt-vidrio" style={{ borderLeft: "3px solid #E8762D", padding: "13px 18px", color: "var(--text)", fontSize: 14, fontWeight: 500 }}>
        Hola Lic. Carolina — tenés <b style={{ color: "var(--naranja-tinta)" }}>{stats.validado} solicitud{stats.validado === 1 ? "" : "es"}</b> pendiente{stats.validado === 1 ? "" : "s"} de pago por <b>{fmtL(stats.montoPendiente)}</b>.
      </div>}

      {/* Filtros + acciones */}
      {/* BARRA DE FILTROS (24-ago-2026) — botones en vez de menús: se elige QUÉ
          ver, de QUÉ mes y en qué ORDEN. Los órdenes cambian según lo que se
          está viendo: mirando pendientes importa la fecha de solicitud (quién
          lleva más esperando), mirando pagadas importa la fecha de pago. */}
      {(() => {
        const btn = (txt, activo, onClick, title) => (
          <button onClick={onClick} title={title} style={{ padding: "5px 11px", borderRadius: 999, border: activo ? "1px solid transparent" : "1px solid var(--hairline)", background: activo ? ORANGE_DARK : "var(--surface)", color: activo ? "#fff" : "var(--text-2)", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{txt}</button>
        );
        const nPend = cp.filter(x => !esPagada(x)).length;
        const nPag = cp.filter(x => esPagada(x)).length;
        // Meses con algo, según lo que se está viendo.
        const mesesOpts = [...new Set(cp
          .filter(x => filter.ver === "todas" || (filter.ver === "pagadas" ? esPagada(x) : !esPagada(x)))
          .map(fechaFiltro).filter(Boolean))].sort().reverse();
        const mesLbl = (m) => { const [y, mm] = m.split("-").map(Number); const t = new Date(y, mm - 1, 1).toLocaleDateString("es-HN", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
        // Al cambiar de vista, un orden que ya no aplica se reajusta solo.
        const setVer = (v) => {
          setFilter(f2 => ({ ...f2, ver: v, mes: "" }));
          if (v === "pendientes" && !["solicitud_asc", "solicitud_desc"].includes(listOrden)) setListOrden("solicitud_asc");
          if (v === "pagadas" && !["pago_desc", "pago_asc"].includes(listOrden)) setListOrden("pago_desc");
          if (v === "todas") setListOrden("estado");
        };
        const sep = !isMobile && <div aria-hidden style={{ width: 1, height: 22, background: "var(--hairline)", margin: "0 6px" }} />;
        // Dos filas compactas: [VER · ORDEN] arriba, [MES · proyecto · proveedor]
        // abajo (3-sep: "la info llega a la mitad del cuadrito, hagámoslo más
        // chiqui").
        return <div className="gt-vidrio" style={{ padding: isMobile ? "10px 14px" : "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, flexWrap: "wrap" }}>
          {/* Qué ver */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, minWidth: isMobile ? 62 : 0 }}>Ver</span>
            {btn(`Pendientes de pago (${nPend})`, filter.ver === "pendientes", () => setVer("pendientes"), "Lo que Tesorería tiene por pagar")}
            {btn(`Pagadas (${nPag})`, filter.ver === "pagadas", () => setVer("pagadas"), "Las que ya pagó Tesorería")}
            {btn("Ambas", filter.ver === "todas", () => setVer("todas"), "Todas, con las pendientes arriba")}
          </div>
          {/* Orden (el separador va DENTRO para que envuelva junto con el grupo) */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {sep}
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, minWidth: isMobile ? 62 : 0 }}>Orden</span>
            {filter.ver !== "pagadas" && <>
              {btn("Solicitud: la que más espera", listOrden === "solicitud_asc", () => setListOrden("solicitud_asc"), "Por fecha de solicitud, la más antigua primero")}
              {btn("Solicitud: la más nueva", listOrden === "solicitud_desc", () => setListOrden("solicitud_desc"))}
            </>}
            {filter.ver !== "pendientes" && <>
              {btn("Pago: más reciente", listOrden === "pago_desc", () => setListOrden("pago_desc"), "Por fecha de pago, lo último pagado primero")}
              {btn("Pago: más antiguo", listOrden === "pago_asc", () => setListOrden("pago_asc"))}
            </>}
            {filter.ver === "todas" && btn("Pendientes primero", listOrden === "estado", () => setListOrden("estado"))}
          </div>
          </div>
          {/* Mes + proyecto + proveedor */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, minWidth: isMobile ? 62 : 0 }}>Mes</span>
            <select value={filter.mes} onChange={e => setFilter(f2 => ({ ...f2, mes: e.target.value }))}
              title={filter.ver === "pagadas" ? "Mes en que se pagó" : "Mes de la solicitud"}
              style={{ padding: "6px 10px", border: "1px solid var(--hairline)", borderRadius: 10, fontSize: 12.5, fontFamily: "inherit", background: filter.mes ? "#FFF7ED" : "var(--surface)", fontWeight: filter.mes ? 700 : 400 }}>
              <option value="">Todos los meses</option>
              {mesesOpts.map(m => <option key={m} value={m}>{mesLbl(m)}</option>)}
            </select>
            <span style={{ fontSize: 10.5, color: "#94A3B8" }}>{filter.ver === "pagadas" ? "(mes de pago)" : filter.ver === "pendientes" ? "(mes de la solicitud)" : "(pago si ya pagó, si no la carga)"}</span>
            <select value={filter.project} onChange={e => setFilter(f2 => ({ ...f2, project: e.target.value }))}
              style={{ padding: "6px 10px", border: "1px solid var(--hairline)", borderRadius: 10, fontSize: 12.5, fontFamily: "inherit", background: filter.project ? "#FFF7ED" : "var(--surface)" }}>
              <option value="">Todos los proyectos</option>
              {allProjects.map(p2 => <option key={p2.short} value={p2.short}>{p2.short}</option>)}
            </select>
            <input value={filter.provider} onChange={e => setFilter(f2 => ({ ...f2, provider: e.target.value }))} placeholder="Buscar proveedor…" list="providers-list"
              style={{ flex: "0 1 220px", minWidth: 150, padding: "6px 10px", border: "1px solid var(--hairline)", borderRadius: 10, fontSize: 12.5, fontFamily: "inherit", background: "var(--surface)" }} />
            <datalist id="providers-list">{providers.map(pv => <option key={pv} value={pv} />)}</datalist>
            {(filter.mes || filter.project || filter.provider || filter.ver !== "pendientes") &&
              <Btn small variant="ghost" onClick={() => { setFilter({ ver: "pendientes", project: "", provider: "", mes: "" }); setListOrden("solicitud_asc"); }}>Limpiar</Btn>}
          </div>
        </div>;
      })()}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ color: "#64748b", fontSize: 13 }}>{filtered.length} de {cp.length} solicitudes</span>
        </span>
        {isAdmin && cp.some(p => p && !p.codigo) && <Btn variant="ghost" onClick={asignarCodigosFaltantes} title="Numera las solicitudes viejas que todavía no tienen código">Asignar códigos faltantes ({purchases.filter(p => p && !p.codigo).length})</Btn>}
        {canCreate && <Btn variant="primary" onClick={() => setModal({ t: "new" })}>+ Nueva solicitud</Btn>}
        {!canCreate && canPay && <div style={{ fontSize: 12, color: "#64748b" }}>Click en una fila para revisar y gestionar el pago →</div>}
      </div>

      {/* Tabla */}
      <div className="gt-vidrio" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "rgba(44,42,40,.06)", borderBottom: "1px solid rgba(44,42,40,.10)" }}>
            <th style={TH}>Código</th>
            <th style={TH}>Estado</th>
            <th style={TH}>Proyecto</th>
            <th style={TH}>Proveedor</th>
            <th style={TH}>Descripcion</th>
            <th style={TH}>Monto</th>
            <th style={TH}>Fecha carga</th>
            <th style={TH}>Fecha pago</th>
            <th style={TH}>Responsable</th>
            <th style={{ ...TH, textAlign: "center" }}>Cotiz.</th>
            <th style={{ ...TH, textAlign: "center" }}>Comp.</th>
            <th style={{ ...TH, textAlign: "right" }}></th>
          </tr></thead>
          <tbody>
            {dataSorted.length === 0 && <tr><td colSpan={12} style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>
              {cp.length === 0 ? "Aun no hay solicitudes registradas para esta empresa." : "No hay resultados con los filtros aplicados."}
            </td></tr>}
            {dataSorted.map(p => { const venc = estaVencida(p); const diasV = diasEsperandoPago(p); return <tr key={p.id} style={{ borderBottom: "1px solid #F1F5F9", cursor: "pointer", background: venc ? C_ROJO.bg : undefined }} onClick={() => setModal({ t: "detail", d: p })}>
              <td style={{ ...TD, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 800, fontSize: 11.5, color: CHARCOAL, whiteSpace: "nowrap" }}>{p.codigo || <span style={{ color: "#CBD5E1", fontWeight: 400 }}>—</span>}</td>
              <td style={TD}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                  <StatusBadge status={p.status} />
                  {/* VENCIDA: +2 semanas sin pago (18-sep-2026) */}
                  {venc && <span title={`Lleva ${diasV} días sin pago`} style={{ padding: "2px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 800, color: C_ROJO.color, background: C_ROJO.bg, border: `1px solid ${C_ROJO.borde}`, whiteSpace: "nowrap" }}>Vencida · {diasV} d</span>}
                  <TreasuryBadge status={p.treasuryStatus} />
                  <DeliveryBadge status={
                    // Entregado por Logística pero sin ficha → lo que falta es la ficha.
                    p.deliveryStatus === "pendiente_entrega" && despachos.some(d => d.sourcePurchaseId === p.id && d.estado !== "cancelado" && (d.estado === "entregado" || d.estado === "cerrado"))
                      ? "pendiente_ficha" : p.deliveryStatus
                  } />
                </div>
              </td>
              <td style={TD}><Badge color={cc.color}>{p.projectCode}</Badge></td>
              <td style={{ ...TD, fontWeight: 600 }}>{p.provider}</td>
              <td style={{ ...TD, maxWidth: 280, whiteSpace: "normal" }}>{p.description}</td>
              <td style={{ ...TD, fontWeight: 700, color: "var(--text)" }}>{fmtL(p.amount)}</td>
              <td style={TD}>{fmt(p.createdAt)}</td>
              <td style={TD}>{p.paymentDate ? fmt(p.paymentDate) : "—"}</td>
              <td style={TD}>{p.opsResponsible || "—"}</td>
              <td style={{ ...TD, textAlign: "center" }}>{p.quoteFile ? <span title={p.quoteFile.name} style={{ color: "#2563EB", fontSize: 14, fontWeight: 800 }}>✓</span> : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
              <td style={{ ...TD, textAlign: "center" }}>{p.receiptFile ? <span title={p.receiptFile.name} style={{ color: "#059669", fontSize: 14, fontWeight: 800 }}>✓</span> : <span style={{ color: "#CBD5E1" }}>—</span>}</td>
              <td style={{ ...TD, textAlign: "right" }} onClick={e => e.stopPropagation()}>
                <Btn small variant="ghost" onClick={() => setModal({ t: "detail", d: p })}>Ver</Btn>
              </td>
            </tr>; })}
          </tbody>
        </table>
      </div>
    </div>;
  };

  // ── Modales ──
  const renderModal = () => {
    if (!modal) return null;
    const m = modal;
    switch (m.t) {
      case "new": return <Modal title="Nueva solicitud de compra" onClose={() => setModal(null)} wide><PurchaseFormImpl co={co} userName={userName} setModal={setModal} getProject={getProject} allProjects={allProjects} purchases={purchases} providers={providers} addAudit={addAudit} saveOrAlert={saveOrAlert} upsertProvider={upsertProvider} presupuestos={presupuestos} tasa={tasaCC} calcDisponible={calcDisponible} /></Modal>;
      case "edit": return <Modal title={`Editar solicitud — ${m.d.provider}`} onClose={() => setModal(null)} wide><PurchaseFormImpl purchase={m.d} co={co} userName={userName} setModal={setModal} getProject={getProject} allProjects={allProjects} purchases={purchases} providers={providers} addAudit={addAudit} saveOrAlert={saveOrAlert} upsertProvider={upsertProvider} presupuestos={presupuestos} tasa={tasaCC} calcDisponible={calcDisponible} /></Modal>;
      case "detail": return <Modal title={`Solicitud: ${m.d.provider} — ${m.d.projectCode}`} onClose={() => setModal(null)} wide><DetailView purchase={m.d} /></Modal>;
      case "corregir": return <Modal title={`Corregir proyecto / partida — ${m.d.codigo || m.d.provider}`} onClose={() => setModal(null)} wide><CorreccionFormImpl purchase={m.d} setModal={setModal} allProjects={allProjects} presupuestos={presupuestos} tasa={tasaCC} calcDisponible={calcDisponible} updatePurchase={updatePurchase} addAudit={addAudit} userName={userName} /></Modal>;
      case "pay": return <Modal title={`Registrar pago — ${m.d.provider}`} onClose={() => setModal(null)} wide><PaymentFormImpl purchase={m.d} setModal={setModal} addAudit={addAudit} updatePurchase={updatePurchase} /></Modal>;
      case "new-project": return <Modal title="Nuevo proyecto" onClose={() => setModal(null)}><ProjectFormImpl allProjects={allProjects} upsertProjectMeta={upsertProjectMeta} renameProjectAlias={renameProjectAlias} setModal={setModal} onSaved={(short) => { if (m.returnTo) setModal(m.returnTo); }} /></Modal>;
      case "edit-project": return <Modal title={`Editar proyecto — ${m.d.short}`} onClose={() => setModal(null)}><ProjectFormImpl allProjects={allProjects} upsertProjectMeta={upsertProjectMeta} renameProjectAlias={renameProjectAlias} setModal={setModal} project={m.d} /></Modal>;
      case "provider-new":  return <Modal title="Nuevo proveedor" onClose={() => setModal(null)} wide><ProviderFormImpl setModal={setModal} upsertProvider={upsertProvider} subirConstanciaProveedor={subirConstanciaProveedor} /></Modal>;
      case "provider-edit": return <Modal title={`Editar proveedor — ${m.d.name}`} onClose={() => setModal(null)} wide><ProviderFormImpl provider={m.d} setModal={setModal} upsertProvider={upsertProvider} deleteProvider={deleteProvider} subirConstanciaProveedor={subirConstanciaProveedor} /></Modal>;
      case "send-pickup":   return <Modal title={`🚛 Enviar a Logistica — ${m.d.provider}`} onClose={() => setModal(null)}><SendPickupFormImpl purchase={m.d} provider={findProviderByName(m.d.provider)} setModal={setModal} enviarAOrdenRecogida={enviarAOrdenRecogida} /></Modal>;
      case "entrega-directa": return <Modal title={`🏪 La entrega el proveedor — ${m.d.provider}`} onClose={() => setModal(null)}><EntregaDirectaFormImpl purchase={m.d} provider={findProviderByName(m.d.provider)} setModal={setModal} marcarEntregaDirecta={marcarEntregaDirecta} /></Modal>;
      default: return null;
    }
  };


  // ── MODAL: cerrar rezagadas del flujo anterior (solo Gerson) ──
  const modalRezagadas = () => {
    if (!rez) return null;
    const enLote = rez.modo === "lote";
    const candidatas = enLote
      ? cp.filter(z => (z.status === "pagado" || z.status === "finalizado") && !yaCerradaConta(z)
          && (!rez.hasta || String(z.paidAt || z.paymentDate || "").slice(0, 10) <= rez.hasta))
      : [rez.purchase];
    const responsable = (rez.quien === "__otro__" ? rez.otro : rez.quien).trim();
    const gente = [...new Set(USERS.map(u => u.label).filter(Boolean))].sort();
    return <div style={{ position: "fixed", inset: 0, background: "rgba(44,42,40,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 16 }} onClick={() => !rezSaving && setRez(null)}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 22, width: 520, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 70px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 17, fontWeight: 900, color: CHARCOAL }}>✅ Cerrar contablemente {enLote ? "en lote" : "esta solicitud"}</div>
        <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 4, lineHeight: 1.5 }}>
          Para las compras <b>rezagadas del flujo anterior</b>: las que ya cerraron con Contabilidad en la vida real pero quedaron varadas en el sistema. No pide archivo — solo queda registrado quién las cerró.
        </div>

        {enLote
          ? <div style={{ marginTop: 14, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: 12 }}>
              <label style={{ fontSize: 10.5, fontWeight: 800, color: "#92400E", textTransform: "uppercase", letterSpacing: 0.5 }}>Cerrar todo lo pagado HASTA esta fecha</label>
              <input type="date" value={rez.hasta || ""} onChange={e => setRez(r => ({ ...r, hasta: e.target.value }))}
                style={{ display: "block", marginTop: 6, padding: "8px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, fontFamily: "inherit", width: "100%" }} />
              <div style={{ fontSize: 12, color: "#78350F", marginTop: 8, fontWeight: 700 }}>
                {rez.hasta ? `Se van a cerrar ${candidatas.length} solicitud(es) pagadas hasta el ${rez.hasta}.` : `Sin fecha: se cerrarían TODAS las ${candidatas.length} abiertas. Poné la fecha de corte del flujo viejo.`}
              </div>
            </div>
          : <div style={{ marginTop: 14, background: "#F8F2E6", borderRadius: 10, padding: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 800, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11.5, color: "#64748b" }}>{rez.purchase.codigo || "sin código"}</div>
              <div style={{ fontWeight: 800, color: CHARCOAL, marginTop: 2 }}>{rez.purchase.provider}</div>
              <div style={{ color: "#475569", fontSize: 12 }}>{String(rez.purchase.description || "").slice(0, 100)}</div>
              <div style={{ color: "#059669", fontWeight: 800, marginTop: 3 }}>{fmtL(rez.purchase.amount)}</div>
            </div>}

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>¿Quién la cerró con Contabilidad? *</label>
          <select value={rez.quien} onChange={e => setRez(r => ({ ...r, quien: e.target.value }))}
            style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, fontFamily: "inherit", background: "#fff" }}>
            <option value="">— Elegí —</option>
            {gente.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="__otro__">✏️ Otro (escribir)…</option>
          </select>
          {rez.quien === "__otro__" && <input value={rez.otro} onChange={e => setRez(r => ({ ...r, otro: e.target.value }))}
            placeholder="Nombre de quien cerró" autoFocus
            style={{ display: "block", width: "100%", marginTop: 8, padding: "9px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />}
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 10.5, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 }}>Nota (opcional)</label>
          <input value={rez.nota} onChange={e => setRez(r => ({ ...r, nota: e.target.value }))}
            placeholder="ej. cerradas con conta antes del nuevo flujo"
            style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 12px", border: "1px solid #CBD5E1", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <Btn variant="ghost" disabled={rezSaving} onClick={() => setRez(null)}>Cancelar</Btn>
          <Btn variant="success" disabled={rezSaving || !responsable || candidatas.length === 0} onClick={async () => {
            if (!responsable) return alert("Elegí o escribí quién la cerró.");
            if (enLote && !confirm(`¿Cerrar ${candidatas.length} solicitud(es) como rezagadas?\n\nResponsable: ${responsable}\n\nPasan directo a "Cerradas contablemente" y sus despachos abiertos en Logística también se cierran.`)) return;
            setRezSaving(true);
            try {
              const ok = await aplicarCierreRezagadas(candidatas, responsable, rez.nota);
              if (ok) { setRez(null); alert(`✅ ${candidatas.length} solicitud(es) cerradas contablemente a nombre de ${responsable}.`); }
            } finally { setRezSaving(false); }
          }}>{rezSaving ? "Cerrando…" : `Cerrar ${enLote ? candidatas.length + " solicitud(es)" : "esta compra"}`}</Btn>
        </div>
      </div>
    </div>;
  };

  // ── LAYOUT ──
  // Sin emojis (rediseño 31-ago): pestañas de texto limpio, estilo IST.
  const allNav = [
    { id: "dashboard", label: "Dashboard" },
    // "Prioridades" va ANTES de Solicitudes (18-sep, pedido de Gerson: "un
    // apartado al lado de solicitudes, o antes mejor dicho"): es la cola de
    // pago que Finanzas le ordena a Tesorería.
    { id: "prioridades", label: "Prioridades" },
    // "Cuentas por pagar" va DESPUÉS de Prioridades (21-sep): es la
    // calendarización de lo que puede esperar y de lo que vino a crédito.
    { id: "cxp", label: "Cuentas por pagar" },
    { id: "calendario", label: "Calendario de Pago" },
    { id: "list", label: "Solicitudes" },   // 2ª pestaña (3-sep, pedido de Gerson)
    // "costos" se retiró (31-ago, pedido de Gerson: "es lo mismo que el
    // Dashboard y nos quita espacio") — el Reporte ejecutivo PDF se genera
    // desde el Dashboard. renderCostos queda sin pestaña.
    { id: "resumen", label: "Supply Chain" },
    { id: "projects", label: "Proyectos" },
    { id: "ana", label: "Por coordinar" },
    { id: "entregas", label: "Entregas de proveedor" },
    { id: "conta", label: "Por cerrar contable" },
    { id: "cerradas", label: "Cerradas" },
    { id: "providers", label: "Proveedores" },
  ];
  // Dashboard y Resumen (command center) solo para admin/gerencia/costos —
  // quien necesita seguimiento end-to-end. Ana ve su Kanban.
  const canSeeResumen = isAdmin || isGerencia || isCostos || isVisorCompras;
  const canSeeDashboard = canSeeResumen;
  // Prioridades es la cola de pago: la arma Finanzas y la ejecuta Tesorería.
  // Jorge (recepción) y Ana no tienen nada que hacer ahí.
  const canSeePri = canEditPri || isGerencia || isVisorCompras;
  const visibleNav = isAsistenteCompras
    ? allNav.filter(n => n.id === "ana" || n.id === "entregas" || n.id === "conta" || n.id === "providers")
    : allNav.filter(n => {
        if (n.id === "resumen") return canSeeResumen;
        if (n.id === "dashboard") return canSeeDashboard;
        if (["prioridades", "cxp", "calendario"].includes(n.id)) return canSeePri;
        return true;
      });
  const roleLabel = isAdmin ? "Operaciones"
    : isTesoreria ? "Tesoreria"
    : isGerencia ? "Gerencia (solo lectura)"
    : isVisorCompras ? "Visor de Compras (solo lectura)"
    : userRole === "compras_ops" ? "Compras / Operaciones"
    : isCostos ? "Costos / Operaciones"
    : isAsistenteCompras ? "Asistente de Compras"
    : isRecepcion ? "Recepcion"
    : userRole;
  const logoUrl = `${import.meta.env.BASE_URL}brand/logo-color.png`;

  return <div className="gt-entra-modulo" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", height: "100vh", fontFamily: "inherit", background: "#F9F9F8", color: CHARCOAL }}>
    {/* Sistema visual compartido (tokens + clases gt-*). ⚠ SIN `precedence`. */}
    <style>{GT_CSS}</style>
    {/* Manchas de brillo (fixed, z0): sin ellas el backdrop-filter del vidrio
        no tiene nada que difuminar. Header/nav/contenido van con zIndex 1+. */}
    <div className="gt-brillo gt-brillo-a" aria-hidden />
    <div className="gt-brillo gt-brillo-b" aria-hidden />

    {/* HEADER (rediseño 31-ago, estilo IST): compacto — volver, logo y nombre
        del módulo a la izquierda; usuario y salida a la derecha. El hero con
        la ilustración del carrito se retiró ("estilo apple, sin saturar"). */}
    <div style={{ position: "relative", zIndex: 2, flexShrink: 0, borderBottom: "1px solid rgba(44,42,40,.08)", padding: isMobile ? "10px 12px" : "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12, minWidth: 0 }}>
        {onBack && <button className="gt-circulo" onClick={onBack} title="Volver al panel" aria-label="Volver al panel" style={{ width: 40, height: 40, fontSize: 17 }}>←</button>}
        <img src={logoUrl} alt="Geotecnica Soluciones" style={{ height: isMobile ? 28 : 34, width: "auto", display: "block" }} />
        {/* El dibujito del carrito identifica el módulo (1-sep: "en vez de
            que diga GeoShopping"). El nombre queda en el title/aria. */}
        <div title="GeoShopping — Compras & Tesorería" aria-label="GeoShopping" style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(232,118,45,.12)", color: "var(--naranja-tinta)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        {!isMobile && <div style={{ textAlign: "right" }}>
          <div style={{ font: "600 13px/1.3 var(--sans)", color: "var(--text)" }}>{userName || "Usuario"}</div>
          <div className="gt-label" style={{ color: "var(--text-3)", marginTop: 2 }}>{roleLabel}</div>
        </div>}
        {onLogout && <button onClick={onLogout} title="Cerrar sesión" style={{ minHeight: 36, padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(192,57,43,.25)", background: "rgba(192,57,43,.06)", color: "#B03024", font: "700 12px/1 var(--sans)", cursor: "pointer" }}>Cerrar sesión</button>}
      </div>
    </div>

    {/* TOPNAV — texto limpio sin emojis, subrayado naranja en la activa */}
    <div style={{
      position: "relative",
      zIndex: 2,
      display: "flex",
      borderBottom: "1px solid rgba(44,42,40,.08)",
      overflowX: "auto",
      whiteSpace: "nowrap",
      flexShrink: 0,
      paddingLeft: isMobile ? 8 : 20,
      scrollbarWidth: "thin",
    }}>
      {visibleNav.map(n => {
        const active = sec === n.id;
        return <button
          key={n.id}
          onClick={() => setSec(n.id)}
          style={{
            padding: isMobile ? "12px 14px" : "14px 18px",
            background: "transparent",
            border: "none",
            boxShadow: active ? `inset 0 -2px 0 ${ORANGE}` : "none",
            color: active ? "var(--naranja-tinta)" : "var(--text-3)",
            cursor: "pointer",
            fontSize: 13.5,
            fontWeight: active ? 800 : 600,
            fontFamily: "inherit",
            transition: "color .15s",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={e => { if (!active) e.currentTarget.style.color = "var(--text-3)"; }}
        >{n.label}</button>;
      })}
    </div>

    {/* CONTENIDO — sin strip de título: la pestaña activa ya dice dónde estás
        (pedido 31-ago: "quitemos ese texto, es repetitivo") */}
    <div style={{ position: "relative", zIndex: 1, flex: 1, overflow: "auto" }}>
      <div style={{ padding: isMobile ? "8px 14px 20px 14px" : "12px 32px 28px 32px" }}>{
        sec === "dashboard" ? renderDashboard()
          : sec === "prioridades" ? renderPrioridades()
          : sec === "cxp" ? renderCxp()
          : sec === "calendario" ? renderCalendario()
          : sec === "resumen" ? renderSupplyChain()
          : sec === "projects" ? renderProjects()
          : sec === "providers" ? renderProviders()
          : sec === "ana" ? renderAnaKanban()
          : sec === "entregas" ? renderEntregasProveedor()
          : sec === "conta" ? renderConta()
          : sec === "cerradas" ? renderCerradas()
          : renderList()
      }</div>
    </div>
    {/* Usuarios read-only (gerencia, visor de compras) SOLO pueden abrir el
        modal de detalle — es de solo lectura (sin botones de mutacion). El
        resto de modales (nuevo/editar/pagar/etc.) sigue bloqueado para ellos. */}
    {(!canViewOnly || modal?.t === "detail") && renderModal()}
    {renderPriModal()}
    {renderCxpModal()}
    {modalRezagadas()}
    {visor && <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />}
  </div>;
}

const TH = { padding: "10px 14px", textAlign: "left", color: "var(--text-3, #475569)", fontWeight: 700, borderBottom: "1px solid var(--hairline, #E2E8F0)", whiteSpace: "nowrap", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3 };
const TD = { padding: "10px 14px", color: "var(--text-2, #334155)", whiteSpace: "nowrap", fontSize: 13 };
